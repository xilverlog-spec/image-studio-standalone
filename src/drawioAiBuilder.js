// AI(Gemini)가 다이어그램의 "구조"(노드/연결/레이아웃 종류)만 판단하게 하고,
// 실제 좌표 배치는 draw.io 내장 레이아웃 엔진이 하도록 분업한 빌더.
//
// 2026-10-02: 이전엔 내가 손으로 짠 4개의 고정 수학 공식(원형 배치, 쉐브론 간격 등)으로
// 뭐든 끼워 맞췄는데, 사용자가 "GPT/Claude에게 직접 시키면 더 낫다"고 정확히 지적했다 —
// LLM은 내용을 보고 구조를 판단하는 데 강하고, 좌표를 손으로 계산하는 데는 약하다.
// 그래서 LLM에게는 "무엇을, 어떻게 연결할지"만 맡기고, 실제 좌표 계산(겹침 방지, 정렬)은
// draw.io 의 검증된 그래프 레이아웃 알고리즘(load 액션의 layout 파라미터)에 맡긴다.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const LAYOUT_LABEL = {
  horizontalFlow: '→ 가로 흐름 (프로세스/단계)',
  verticalFlow: '↓ 세로 흐름 (프로세스/단계)',
  horizontalTree: '→ 가로 트리 (조직도/분류)',
  verticalTree: '↓ 세로 트리 (조직도/분류)',
  radialTree: '◎ 방사형 (중심+위성, 버블형)',
  organic: '✺ 자유 배치 (관계도, 복잡한 연결)',
};

export const SHAPE_STYLE = {
  rect: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  rhombus: 'rhombus;whiteSpace=wrap;html=1;',
  step: 'shape=step;whiteSpace=wrap;html=1;perimeter=stepPerimeter;',
  text: 'text;html=1;align=center;verticalAlign=middle;',
};

// AI에게 "내용 → 구조(JSON)"만 맡기는 프롬프트. 좌표는 전혀 요구하지 않는다 — 그건
// draw.io 레이아웃 엔진이 한다(§ 위 주석).
export const buildSpecPrompt = (userText, hasImage) => `You are an expert diagram designer for an architecture office. ${hasImage ? 'Look at the attached reference image and/or ' : ''}${userText ? `the user's description: "${userText}"` : 'the attached reference image'}.

Design a clean, well-structured diagram. Output JSON only, no markdown fences, no explanation:
{
  "title": "diagram title, or empty string",
  "layout": one of "horizontalFlow" | "verticalFlow" | "horizontalTree" | "verticalTree" | "radialTree" | "organic",
  "nodes": [{"id": "n1", "label": "exact text (Korean stays Korean)", "shape": "rect"|"rounded"|"ellipse"|"rhombus"|"step", "color": "#RRGGBB"}],
  "edges": [{"from": "n1", "to": "n2", "label": "", "dashed": false, "arrow": true}]
}

Guidance:
- Pick "layout" based on the diagram's real structure, not a fixed habit: sequential steps -> horizontalFlow/verticalFlow (use shape "step"); hierarchy/categories -> horizontalTree/verticalTree; one central thing connected to several others -> radialTree; a messy web of relationships -> organic.
- Use "shape":"rhombus" for decision points, "ellipse" for start/end or grouping nodes, "rect"/"rounded" for normal items.
- Choose colors that make sense together (a coherent palette, not random), reusing the same color for nodes in the same category.
- Keep it to at most 14 nodes unless the source clearly has more. Do not invent content that is not implied by the input.
- Every node must have a unique "id". Every edge's "from"/"to" must reference an existing node id.`;

// 2026-10-02: draw.io 의 load 액션에 layout(특히 radialTree)을 같이 주면, 이 허브+가지 구조에서
// 좌표가 전부 0 근처로 무너지는 버그를 실측으로 확인했다(layout 없이는 정상 렌더링됨 —
// § 세션 기록, 직접 재현). 그래서 draw.io 내장 레이아웃 엔진에 맡기지 않고, AI가 고른
// layout "종류"만 신호로 받아서 좌표는 여기서 직접 계산한다 — 자동 배치는 포기하지 않되,
// 검증된 방식(허브+위성 원형, BFS 트리, 순차 체인)으로 직접 한다.
const NODE_W = 140, NODE_H = 60;

// 가장 연결이 많은 노드를 "중심"으로 보고, 나머지를 원형으로 배치
const layoutRadial = (nodes, edges) => {
  const degree = new Map(nodes.map(n => [n.id, 0]));
  edges.forEach(e => { degree.set(e.from, (degree.get(e.from) || 0) + 1); degree.set(e.to, (degree.get(e.to) || 0) + 1); });
  const sorted = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
  const hub = sorted[0];
  const rest = nodes.filter(n => n.id !== hub?.id);
  const pos = new Map();
  const cx = 420, cy = 300;
  if (hub) pos.set(hub.id, { x: cx - NODE_W / 2, y: cy - NODE_H / 2 });
  const n = Math.max(1, rest.length);
  const dist = Math.min(380, 180 + n * 24);
  rest.forEach((node, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pos.set(node.id, { x: cx + dist * Math.cos(a) - NODE_W / 2, y: cy + dist * 0.72 * Math.sin(a) - NODE_H / 2 });
  });
  return pos;
};

// 들어오는 edge 가 없는 노드를 루트로 BFS 레벨을 매겨 트리 형태로 배치
const layoutTree = (nodes, edges, horizontal) => {
  const hasIncoming = new Set(edges.map(e => e.to));
  const roots = nodes.filter(n => !hasIncoming.has(n.id));
  const starts = roots.length ? roots : nodes.slice(0, 1);
  const level = new Map(); const visited = new Set();
  let queue = starts.map(n => ({ id: n.id, lv: 0 }));
  starts.forEach(n => { level.set(n.id, 0); visited.add(n.id); });
  while (queue.length) {
    const { id, lv } = queue.shift();
    edges.filter(e => e.from === id).forEach(e => {
      if (!visited.has(e.to)) { visited.add(e.to); level.set(e.to, lv + 1); queue.push({ id: e.to, lv: lv + 1 }); }
    });
  }
  nodes.forEach(n => { if (!level.has(n.id)) level.set(n.id, 0); }); // 연결 안 된 노드는 0레벨 취급
  const byLevel = new Map();
  nodes.forEach(n => { const lv = level.get(n.id); if (!byLevel.has(lv)) byLevel.set(lv, []); byLevel.get(lv).push(n.id); });
  const gapMain = 170, gapCross = 190;
  const pos = new Map();
  [...byLevel.entries()].forEach(([lv, ids]) => {
    ids.forEach((id, i) => {
      const cross = (i - (ids.length - 1) / 2) * gapCross;
      pos.set(id, horizontal ? { x: 60 + lv * gapMain, y: 300 + cross - NODE_H / 2 } : { x: 420 + cross - NODE_W / 2, y: 60 + lv * gapMain });
    });
  });
  return pos;
};

// 순서(앞선 edge 의 흐름)대로 한 줄로 배치 — 트리와 같은 BFS 지만 레벨마다 1개씩만 남긴다는 전제의 단순화
const layoutFlow = (nodes, edges, horizontal) => {
  const order = [];
  const seen = new Set();
  const hasIncoming = new Set(edges.map(e => e.to));
  let cur = nodes.find(n => !hasIncoming.has(n.id)) || nodes[0];
  while (cur && !seen.has(cur.id)) {
    order.push(cur.id); seen.add(cur.id);
    const next = edges.find(e => e.from === cur.id && !seen.has(e.to));
    cur = next ? nodes.find(n => n.id === next.to) : null;
  }
  nodes.forEach(n => { if (!seen.has(n.id)) order.push(n.id); }); // 못 찾은 노드는 뒤에 이어붙인다
  const gap = 180;
  const pos = new Map();
  order.forEach((id, i) => {
    pos.set(id, horizontal ? { x: 60 + i * gap, y: 300 - NODE_H / 2 } : { x: 420 - NODE_W / 2, y: 60 + i * gap });
  });
  return pos;
};

// 특별한 구조가 없을 때(organic 등) 쓰는 안전한 격자 배치
const layoutGrid = (nodes) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const pos = new Map();
  nodes.forEach((n, i) => pos.set(n.id, { x: 60 + (i % cols) * 220, y: 100 + Math.floor(i / cols) * 140 }));
  return pos;
};

const computeLayout = (layout, nodes, edges) => {
  switch (layout) {
    case 'radialTree': return layoutRadial(nodes, edges);
    case 'horizontalTree': return layoutTree(nodes, edges, true);
    case 'verticalTree': return layoutTree(nodes, edges, false);
    case 'horizontalFlow': return layoutFlow(nodes, edges, true);
    case 'verticalFlow': return layoutFlow(nodes, edges, false);
    default: return layoutGrid(nodes);
  }
};

export function buildSpecXml(spec) {
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 30) : [];
  const edges = (Array.isArray(spec?.edges) ? spec.edges : []).filter(e => nodes.some(n => n.id === e.from) && nodes.some(n => n.id === e.to)).slice(0, 60);
  const idSet = new Set(nodes.map(n => n.id));
  const positions = computeLayout(spec?.layout, nodes, edges);
  const cells = [];

  if (spec?.title) {
    cells.push(`<mxCell id="__title" value="${esc(spec.title)}" style="text;html=1;fontSize=26;fontStyle=1;align=left;verticalAlign=middle;" vertex="1" parent="1"><mxGeometry x="40" y="20" width="500" height="40" as="geometry"/></mxCell>`);
  }

  nodes.forEach((node) => {
    const { x, y } = positions.get(node.id) || { x: 60, y: 100 };
    const shapeStyle = SHAPE_STYLE[node.shape] || SHAPE_STYLE.rounded;
    const color = /^#[0-9a-fA-F]{6}$/.test(node.color || '') ? node.color : '#3A8FB7';
    const style = `${shapeStyle}fillColor=${color};strokeColor=#FFFFFF;strokeWidth=2;fontColor=#FFFFFF;fontStyle=1;fontSize=14;`;
    cells.push(`<mxCell id="${esc(node.id)}" value="${esc(node.label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/></mxCell>`);
  });

  let edgeN = 0;
  edges.forEach((e) => {
    if (!idSet.has(e.from) || !idSet.has(e.to)) return; // AI가 없는 id 를 참조하면 조용히 건너뛴다(깨진 XML 방지)
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#6B7280;strokeWidth=2;${e.dashed ? 'dashed=1;' : ''}${e.arrow === false ? 'endArrow=none;' : 'endArrow=block;'}`;
    cells.push(`<mxCell id="__e${edgeN++}" value="${esc(e.label || '')}" style="${style}" edge="1" parent="1" source="${esc(e.from)}" target="${esc(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  });

  return `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel>`;
}
