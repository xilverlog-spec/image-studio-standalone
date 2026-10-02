// draw.io(mxGraph) XML 템플릿 생성기 — 기존 DiagramEditor.jsx의 addTemplate()이 하던
// "종류 + 내용 → 자동 배치" 역할을, draw.io가 이해하는 XML로 그대로 옮긴 것이다.
// 여기서 만든 XML을 iframe에 {action:'load', xml} 로 보내면 draw.io 쪽에서 완전히 편집
// 가능한 진짜 도형으로 열린다(우리가 그리는 게 아니라 draw.io가 그린다).

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let _id = 1;
const nextId = () => `n${_id++}`;
const resetIds = () => { _id = 1; };

const lerpHex = (a, b, t) => {
  const p = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.max(0, Math.min(255, Math.round(x + (y - x) * t))).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
};
const PALETTE = ['#3A8FB7', '#2E9E5B', '#E8734A', '#8B5CF6', '#F59E0B', '#DC2626', '#0EA5E9', '#65A30D'];

const vertex = (x, y, w, h, value, style) =>
  `<mxCell id="${nextId()}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

const edge = (sourceId, targetId, style) =>
  `<mxCell id="${nextId()}" style="${style}" edge="1" parent="1" source="${sourceId}" target="${targetId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const freeEdge = (x1, y1, x2, y2, style) =>
  `<mxCell id="${nextId()}" style="${style}" edge="1" parent="1">` +
  `<mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y1}" as="sourcePoint"/><mxPoint x="${x2}" y="${y2}" as="targetPoint"/></mxGeometry></mxCell>`;

const wrap = (cellsXml) =>
  `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">` +
  `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cellsXml}</root></mxGraphModel>`;

// ── 프로세스 흐름: draw.io 내장 "step"(화살표/쉐브론) 도형 사용 ──
export function buildProcessXml({ title, items }) {
  resetIds();
  const list = (items?.length ? items : [{ name: '1. 대지 분석', desc: '현황 · 법규 · 주변 분석' }, { name: '2. 컨셉 도출', desc: '핵심 아이디어 설정' }, { name: '3. 매스 스터디', desc: '배치와 볼륨 검토' }, { name: '4. 입면 디자인', desc: '재료 · 디테일 확정' }]).slice(0, 6);
  const n = Math.max(2, list.length);
  const w = Math.min(220, Math.floor(1000 / n)), h = 90, gap = 6;
  const x0 = 80, y0 = 220;
  const cells = [];
  if (title) cells.push(vertex(x0, 100, 1000, 50, title, 'text;html=1;fontSize=28;fontStyle=1;align=left;verticalAlign=middle;'));
  list.forEach((it, i) => {
    const color = lerpHex('#252573', '#6366F1', n > 1 ? i / (n - 1) : 0);
    const x = x0 + i * (w + gap);
    cells.push(vertex(x, y0, w, h, it.name || `단계 ${i + 1}`, `shape=step;whiteSpace=wrap;html=1;perimeter=stepPerimeter;fillColor=${color};strokeColor=none;fontColor=#FFFFFF;fontStyle=1;fontSize=15;`));
    if (it.desc) cells.push(vertex(x, y0 + h + 14, w, 44, it.desc, 'text;html=1;fontSize=12;align=center;verticalAlign=top;fontColor=#4B5563;whiteSpace=wrap;'));
  });
  return wrap(cells.join(''));
}

// ── 버블 다이어그램: 중심 원 + 위성 원 + 연결선 ──
export function buildBubbleXml({ title, center, items }) {
  resetIds();
  const list = (items?.length ? items : [{ name: '사무실' }, { name: '회의실' }, { name: '휴게실' }, { name: '화장실' }, { name: '창고' }]).slice(0, 8);
  const n = Math.max(1, list.length);
  const cx = 580, cy = 460, centerR = 70;
  const dist = Math.min(420, 220 + n * 24);
  const cells = [];
  if (title) cells.push(vertex(cx - 300, 60, 600, 46, title, 'text;html=1;fontSize=26;fontStyle=1;align=center;verticalAlign=middle;'));
  const centerId = nextId();
  cells.push(`<mxCell id="${centerId}" value="${esc(center || '로비')}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#F59E0B;strokeColor=#FFFFFF;strokeWidth=3;fontColor=#FFFFFF;fontStyle=1;fontSize=16;" vertex="1" parent="1"><mxGeometry x="${cx - centerR}" y="${cy - centerR}" width="${centerR * 2}" height="${centerR * 2}" as="geometry"/></mxCell>`);
  list.forEach((it, i) => {
    const name = it.name || `항목 ${i + 1}`;
    const r = Math.max(42, Math.min(70, 30 + name.length * 4));
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + dist * Math.cos(a), y = cy + dist * 0.72 * Math.sin(a);
    const satId = nextId();
    cells.push(`<mxCell id="${satId}" value="${esc(name)}" style="ellipse;whiteSpace=wrap;html=1;fillColor=${PALETTE[i % PALETTE.length]};strokeColor=#FFFFFF;strokeWidth=3;fontColor=#FFFFFF;fontStyle=1;fontSize=14;" vertex="1" parent="1"><mxGeometry x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" as="geometry"/></mxCell>`);
    cells.push(edge(centerId, satId, `edgeStyle=none;html=1;endArrow=none;strokeColor=#9CA3AF;strokeWidth=2;${i % 2 ? 'dashed=1;' : ''}`));
  });
  return wrap(cells.join(''));
}

// ── 배치도 분석 표기: 대지 영역 + 번호 마커 + 범례 ──
export function buildSiteXml({ title, items }) {
  resetIds();
  const list = (items?.length ? items : [{ name: '주 동선' }, { name: '보행 동선' }, { name: '주요 영역' }]).slice(0, 6);
  const cells = [];
  if (title) cells.push(vertex(60, 40, 500, 46, title, 'text;html=1;fontSize=26;fontStyle=1;align=left;verticalAlign=middle;'));
  // 대지 영역(점선 타원)
  cells.push(vertex(380, 220, 420, 260, '', 'ellipse;whiteSpace=wrap;html=1;fillColor=#F59E0B;fillOpacity=28;strokeColor=#F59E0B;strokeWidth=3;dashed=1;'));
  // 진입 화살표(곡선)
  cells.push(`<mxCell id="${nextId()}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;strokeColor=#E8734A;strokeWidth=4;dashed=1;curved=1;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="200" y="620" as="sourcePoint"/><mxPoint x="520" y="400" as="targetPoint"/></mxGeometry></mxCell>`);
  // 번호 마커 3개
  const markerPos = [[300, 300], [620, 320], [460, 560]];
  markerPos.forEach((p, i) => {
    cells.push(vertex(p[0], p[1], 44, 44, String(i + 1), 'ellipse;whiteSpace=wrap;html=1;fillColor=#333399;strokeColor=#FFFFFF;strokeWidth=3;fontColor=#FFFFFF;fontStyle=1;fontSize=18;'));
  });
  // 북쪽 표시
  cells.push(vertex(1000, 60, 50, 70, 'N', 'shape=flexArrow;html=1;startArrow=none;endArrow=none;direction=north;fillColor=#111827;strokeColor=#111827;fontColor=#FFFFFF;fontStyle=1;'));
  // 스케일바(간단히 눈금 3칸)
  const sbX = 80, sbY = 700;
  for (let i = 0; i < 3; i++) {
    cells.push(vertex(sbX + i * 60, sbY, 60, 14, '', `rounded=0;whiteSpace=wrap;html=1;fillColor=${i % 2 ? '#FFFFFF' : '#111827'};strokeColor=#111827;strokeWidth=1.5;`));
  }
  cells.push(vertex(sbX, sbY + 16, 200, 20, 'SCALE (축척 미지정)', 'text;html=1;fontSize=11;align=left;verticalAlign=middle;fontColor=#4B5563;'));
  // 범례
  const lx = 880, ly = 560;
  cells.push(vertex(lx, ly, 220, 30 + list.length * 32, '', 'rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#9CA3AF;'));
  cells.push(vertex(lx + 10, ly + 6, 180, 20, '범례', 'text;html=1;fontSize=14;fontStyle=1;align=left;verticalAlign=middle;'));
  list.forEach((it, i) => {
    const y = ly + 32 + i * 30;
    cells.push(vertex(lx + 14, y, 24, 12, '', `rounded=0;whiteSpace=wrap;html=1;fillColor=${PALETTE[i % PALETTE.length]};strokeColor=none;`));
    cells.push(vertex(lx + 46, y - 4, 160, 20, it.name || `항목 ${i + 1}`, 'text;html=1;fontSize=12;align=left;verticalAlign=middle;'));
  });
  return wrap(cells.join(''));
}

// ── 레이어 구성(분해): 단순화한 스택형 — 등각 투상 대신 겹친 사각형 + 인출선으로 표현 ──
// (draw.io 기본 도형엔 isometric 프로젝션이 없어서, 쉐이프 라이브러리 없이도 바로 되는 방식으로 단순화했다)
export function buildExplodeXml({ title, items }) {
  resetIds();
  const list = (items?.length ? items : [{ name: '지붕층' }, { name: '업무층' }, { name: '공용층' }, { name: '기반층' }]).slice(0, 6);
  const n = Math.max(2, list.length);
  const cells = [];
  if (title) cells.push(vertex(60, 40, 600, 46, title, 'text;html=1;fontSize=26;fontStyle=1;align=left;verticalAlign=middle;'));
  const w = 420, h = 70, gapY = 96, offX = 26, x0 = 160, y0 = 140;
  for (let i = n - 1; i >= 0; i--) { // 아래층부터 그려야 위층이 앞에 보인다
    const color = lerpHex('#333399', '#E5E7EB', n > 1 ? i / (n - 1) : 0);
    const x = x0 + i * offX, y = y0 + i * gapY;
    cells.push(vertex(x, y, w, h, '', `rounded=1;whiteSpace=wrap;html=1;fillColor=${color};strokeColor=#FFFFFF;strokeWidth=2;`));
  }
  list.forEach((it, i) => {
    const x = x0 + i * offX, y = y0 + i * gapY;
    const lx = x + w + 40, ly = y + h / 2 - 18;
    cells.push(freeEdge(x + w, y + h / 2, lx, y + h / 2, 'endArrow=none;html=1;strokeColor=#6B7280;strokeWidth=2;'));
    cells.push(vertex(lx, ly, 160, 36, it.name || `레이어 ${i + 1}`, 'rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#333399;strokeWidth=2;fontColor=#333399;fontStyle=1;fontSize=14;'));
  });
  return wrap(cells.join(''));
}

export function buildBlankXml() {
  return wrap('');
}

export const TEMPLATE_BUILDERS = {
  process: buildProcessXml,
  bubble: buildBubbleXml,
  site: buildSiteXml,
  explode: buildExplodeXml,
};
