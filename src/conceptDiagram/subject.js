// "대상 이미지" 모드: 올린 이미지(평면·건물 형태·배치도)를 AI가 먼저 구조로 읽고,
// 그 구조를 고정한 채 글의 지시대로 다이어그램을 만든다. 형태는 AI가 새로 만들지 않는다.
import { normalizeShapes, SHAPE_KINDS } from './layout2d';
import { SITE_SCHEMA, SITE_RULES } from './spec';

export const SUBJECT_KINDS = {
  form: '건물 형태(외관·조감·매스)',
  plan: '평면도',
  site: '배치도·대지',
  other: '그 외(지원 안 함)',
};

const READ_SCHEMA = `{
  "kind": "form" | "plan" | "site" | "other",
  "summary": "이미지가 무엇이고 어떻게 읽었는지 한국어 한두 문장(예: 평면도로 판단. 방 7개, 중앙 복도형)",
  // kind 가 "form" 일 때만 — 건물을 직육면체 덩어리들의 합으로 단순화
  "form": {
    "ground": {"x":0,"y":0,"w":6,"d":5},
    "boxes": [ {"x":0,"y":0,"z":0,"w":6,"d":2,"h":3} ]
  },
  // kind 가 "plan" 또는 "site" 일 때만 — 보이는 영역을 다각형으로
  "shapes": [
    {"id":"r1", "name":"거실", "kind":"room|building|road|green|water|boundary|other", "pts":[[0,0],[40,0],[40,30],[0,30]]}
  ]
}`;

const READ_RULES = `- 이미지의 종류를 먼저 판단한다: 건물의 입체 형태(외관/조감/스케치)=form, 실 구성이 보이는 평면도=plan, 대지·도로·건물 배치=site, 단면·입면·그 외=other.
- form: 건물을 3~12개의 직육면체로 근사한다. x는 오른쪽-아래, y는 왼쪽-아래, z는 위쪽, 단위는 모듈(전체 길이가 대략 10 이하). 곡면은 가까운 직육면체로 단순화하고 summary에 단순화했다고 적는다. 바닥(ground)은 전체 발자국을 덮는 크기.
- plan/site: 0~100 범위의 정규화 좌표(이미지 왼쪽 위가 [0,0], 오른쪽 아래가 [100,100])로 각 영역을 다각형(꼭짓점 4~8개)으로 적는다. 방/건물은 kind 를 room/building, 도로는 road, 녹지는 green, 수공간은 water, 대지 경계선은 boundary 로 한다. 영역이 3~30개가 되게 큰 것 위주로 적고 id 는 r1, r2…처럼 짧고 겹치지 않게 한다.
- plan 은 건물 안쪽 바닥 전체를 빈틈없이 방(복도·홀·거실 포함)으로 채운다: 복도나 홀도 name "복도" 로 별도 영역으로 적고, 이웃한 방은 같은 변을 공유해서 사이에 틈이 없게 한다(좌표를 서로 일치시킨다).
- 평면도는 가구·치수선·문 스윙·마감 패턴은 무시하고 '방(실)' 단위의 직사각/ㄱ자 영역으로 단순화한다. 건물 전체 바깥 윤곽도 kind "boundary" 다각형 하나로 함께 적는다(방과 겹쳐도 된다). 작은 실(욕실, 팬트리, 발코니, 드레스룸 포함)도 빠뜨리지 않는다.
- site(배치도): 대지 경계선은 kind "boundary" 다각형 하나, 각 동(건물)은 kind "building" 으로 하나씩(name 은 '101동'처럼 도면에 적힌 이름 그대로), 큰 도로·녹지·광장은 road/green 으로 적는다. 건물은 윤곽을 따라 꼭짓점 4~10개 다각형으로, 건물 사이 거리와 방향(기울어진 배치)을 그대로 살린다. 치수선·글씨·나무 기호는 영역으로 읽지 않는다.
- 이미지에 글자가 있으면 name 에 그대로 옮기고, 없으면 용도를 짐작해 짧게 쓴다.
- 이미지를 알아볼 수 없으면 kind 를 "other" 로 하고 summary 에 이유를 쓴다.`;

export function buildReadPrompt(forcedKind, opts = {}) {
  const gridNote = opts.grid ? '\n[눈금 안내] 이미지에는 위치를 재기 위한 붉은 눈금선이 10 단위(0~100)로 그려져 있고, 가장자리에 숫자가 적혀 있다. 모든 좌표는 이 눈금(이미지 전체 = 0~100)을 기준으로 읽는다. 눈금선과 숫자는 도면의 일부가 아니므로 방으로 읽지 않는다. 좌표는 눈금을 보고 가능한 한 5 단위 배수로 맞춘다.' : '';
  const hint = forcedKind && forcedKind !== 'auto' ? `\n이 이미지는 사용자가 "${SUBJECT_KINDS[forcedKind]}"로 지정했다. kind 를 "${forcedKind}" 로 하고 그에 맞게 읽는다.\n` : '';
  return `당신은 건축 도면과 이미지를 읽는 설계 보조자다. 첨부된 이미지를 읽어 구조를 JSON으로만 출력한다(설명/마크다운/코드펜스 금지).${hint}

스키마:
${READ_SCHEMA}

규칙:
${READ_RULES}${gridNote}`;
}

const num = (v, d = 0, lo = -50, hi = 50) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// AI 응답 → 검증된 읽기 결과. 못 읽었으면 Error.
export function normalizeRead(parsed, forcedKind) {
  if (!parsed || typeof parsed !== 'object') throw new Error('이미지를 읽은 결과가 비어 있습니다.');
  let kind = forcedKind && forcedKind !== 'auto' ? forcedKind : parsed.kind;
  if (!SUBJECT_KINDS[kind]) kind = parsed.form ? 'form' : (parsed.shapes ? 'plan' : 'other');
  const summary = String(parsed.summary || '');
  if (kind === 'form') {
    const boxes = (Array.isArray(parsed.form?.boxes) ? parsed.form.boxes : []).slice(0, 16).map((b) => ({
      x: num(b.x), y: num(b.y), z: num(b.z, 0, 0, 30), w: Math.max(0.3, num(b.w, 1, 0, 30)), d: Math.max(0.3, num(b.d, 1, 0, 30)), h: Math.max(0.2, num(b.h, 1, 0, 30)),
    }));
    if (!boxes.length) throw new Error('건물 형태를 읽지 못했습니다. 종류를 바꾸거나 다시 읽어 보세요.');
    const g = parsed.form?.ground;
    const minX = Math.min(...boxes.map((b) => b.x)); const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)); const maxY = Math.max(...boxes.map((b) => b.y + b.d));
    const ground = g && typeof g === 'object' ? { x: num(g.x, minX), y: num(g.y, minY), w: num(g.w, maxX - minX, 1, 40), d: num(g.d, maxY - minY, 1, 40) } : { x: minX, y: minY, w: maxX - minX, d: maxY - minY };
    return { kind, summary, form: { ground, boxes } };
  }
  if (kind === 'plan' || kind === 'site') {
    const shapes = snapShapes(normalizeShapes(parsed.shapes));
    if (shapes.length < 2) throw new Error('도면의 영역을 읽지 못했습니다. 종류를 바꾸거나 다시 읽어 보세요.');
    // 납작하게 뭉개졌거나 영역이 거의 없는 읽기 결과는 잘못 읽은 것이므로 그리지 않고 다시 읽게 한다
    const rooms = shapes.filter((s) => s.kind !== 'boundary' && s.kind !== 'road');
    const xs = rooms.flatMap((s) => s.pts.map((p) => p[0])); const ys = rooms.flatMap((s) => s.pts.map((p) => p[1]));
    const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
    const areaOf = (s) => { let a2 = 0; s.pts.forEach((p, i) => { const q = s.pts[(i + 1) % s.pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a2) / 2; };
    const solid = rooms.filter((s) => areaOf(s) >= 12).length;
    if (rooms.length < 2 || bw < 20 || bh < 20 || solid < 2) {
      throw new Error('도면의 영역을 제대로 읽지 못했습니다(영역이 한 줄로 뭉개짐). 이미지 종류를 직접 고른 뒤 다시 읽어 보세요.');
    }
    return { kind, summary, shapes };
  }
  throw new Error(summary || '이 이미지는 아직 지원하지 않는 종류입니다(평면·건물 형태·배치도만 가능).');
}

// 가장자리 정렬: 서로 가까운 x/y 좌표(눈대중 오차)를 하나로 모아 방들이 반듯하게 맞닿게 한다
export function snapShapes(shapes, tol = 2.2) {
  const cluster = (vals) => {
    const sorted = [...new Set(vals.map((v) => Math.round(v * 10) / 10))].sort((p, q) => p - q);
    const map = new Map(); let grp = [];
    const flush = () => { if (!grp.length) return; const m = Math.round((grp.reduce((a, b) => a + b, 0) / grp.length) * 2) / 2; grp.forEach((g) => map.set(g, m)); grp = []; };
    sorted.forEach((v) => { if (grp.length && v - grp[grp.length - 1] > tol) flush(); grp.push(v); });
    flush();
    return map;
  };
  const rd = (v) => Math.round(v * 10) / 10;
  const xm = cluster(shapes.flatMap((s) => s.pts.map((p) => p[0])));
  const ym = cluster(shapes.flatMap((s) => s.pts.map((p) => p[1])));
  return shapes.map((s) => {
    const pts = s.pts.map((p) => [xm.get(rd(p[0])) ?? p[0], ym.get(rd(p[1])) ?? p[1]]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    return { ...s, pts };
  }).filter((s) => s.pts.length >= 3);
}

// 배치도: 건물·대지 윤곽은 이미지 분석(cv)으로 딴 원본 모양을 쓰고, 동 이름은 AI가 읽은 결과에서 가까운 것을 가져온다
export function mergeSiteGeometry(aiRead, cv) {
  const [W, H] = cv.size; const long = Math.max(W, H);
  const frac = (p) => [(p[0] * long) / 100 / W, (p[1] * long) / 100 / H];
  const cen = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const aiB = (aiRead.shapes || []).filter((s) => s.kind === 'building').map((s) => ({ name: s.name, c: [cen(s.pts)[0] / 100, cen(s.pts)[1] / 100] }));
  const used = new Set();
  const buildings = cv.buildings.map((b, i) => {
    const c = frac(cen(b.pts)); let best = null;
    aiB.forEach((a, j) => { if (used.has(j)) return; const d = Math.hypot(a.c[0] - c[0], a.c[1] - c[1]); if (!best || d < best.d) best = { d, j, name: a.name }; });
    if (best && best.d < 0.18) used.add(best.j);
    return { id: `b${i + 1}`, name: best && best.d < 0.18 && best.name ? best.name : `${i + 1}동`, kind: 'building', pts: b.pts };
  });
  const shapes = [...(cv.boundary ? [{ id: 'boundary', name: '대지경계', kind: 'boundary', pts: cv.boundary }] : []), ...buildings];
  return { ...aiRead, kind: 'site', shapes, summary: `${aiRead.summary || ''} (건물 ${buildings.length}동의 윤곽은 이미지 분석으로 원본 모양 그대로 추출)`.trim() };
}

// AI는 좌표를 가로 0~100, 세로 0~100 으로 따로 정규화해서 주기 때문에, 가로세로 비율이 다른 이미지에서는 모양이 찌그러진다.
// 이미지 크기(w,h)를 알면 긴 변 = 100 인 같은 비율 좌표로 바로잡는다.
export function aspectFixShapes(shapes, w, h) {
  const long = Math.max(w, h);
  return shapes.map((s) => ({ ...s, pts: s.pts.map((p) => [(p[0] * w) / long, (p[1] * h) / long]) }));
}

// 평면도: AI 가 짚은 방 위치(씨앗)로 이미지 분석이 벽을 따라 나눈 방 경계로 교체한다. 분할되지 않은 방은 AI 가 읽은 모양을 그대로 둔다.
export function planSeeds(shapes) {
  return shapes.filter((s) => s.kind !== 'boundary' && s.kind !== 'road').map((s) => ({
    id: s.id, x: s.pts.reduce((a2, p) => a2 + p[0], 0) / s.pts.length / 100, y: s.pts.reduce((a2, p) => a2 + p[1], 0) / s.pts.length / 100,
  }));
}
export function mergePlanSegments(aiRead, seg) {
  // 방은 벽 안쪽의 가장 큰 직사각형(깔끔한 블록)으로, 바깥 윤곽은 방들을 합쳐 다듬은 모양으로 쓴다
  let n = 0;
  const rects = seg.rects || {};
  const shapes = aiRead.shapes.filter((s) => s.kind !== 'boundary').map((s) => {
    const pts = rects[s.id] || (seg.rooms && seg.rooms[s.id]);
    if (Array.isArray(pts) && pts.length >= 3) { n += 1; return { ...s, pts }; }
    return s;
  });
  if (Array.isArray(seg.outline) && seg.outline.length >= 3) shapes.unshift({ id: 'boundary', name: '외곽', kind: 'boundary', exact: true, pts: seg.outline });
  return { ...aiRead, shapes, summary: `${aiRead.summary || ''} (방 ${n}개의 위치·크기는 이미지 분석으로 벽을 따라 정함)`.trim() };
}

// 읽은 결과를 바탕만 그려서 보여 줄 스펙(확인용 미리보기)
export function readToPreview(read) {
  if (read.kind === 'form') {
    return { type: 'massing', spec: { title: '', accent: '#C97B5A', steps: [{ label: '읽은 형태', ground: read.form.ground, boxes: read.form.boxes }] } };
  }
  if (read.kind === 'site') {
    return { type: 'site', spec: { title: '', siteBase: { shapes: read.shapes }, panels: [{ heading: '', siteShape: 'rect', overlays: [] }] } };
  }
  return { type: 'layout', spec: { title: '', shapes: read.shapes, panels: [{}] } };
}

const FORM_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "accent": "#C97B5A",
  "steps": [
    {"label":"EXTRUSION", "ground":{"x":0,"y":0,"w":5,"d":4},
     "boxes":[ {"x":0,"y":0,"z":0,"w":5,"d":4,"h":2},
               {"x":0,"y":1.7,"z":2.4,"w":5,"d":0.6,"h":1.6,"mode":"subtract","move":"up","len":1.4},
               {"x":1.8,"y":1.5,"z":3.2,"w":1.4,"d":0.9,"h":1.8,"mode":"add","move":"down","len":1.2} ]}
  ]
}`;

const BLOCKS_RULES = `[블록 스타일 — 평면을 단순한 색 블록으로 줄이는 표현]\n스타일 참고 이미지가 '방을 색 블록과 이니셜 글자로 단순화하고, 굵은 화살표(진입)와 점선(동선)을 얹은' 모양이거나, 요청이 그런 단순화 평면도를 원하면 패널에 "style":"blocks" 를 넣고 아래 필드를 쓴다.\n  "rooms": { "<영역 id>": {"abbr":"L", "fill":"#FFEFD5"} },   // 방마다 이니셜(1~3자)과 블록 색. 같은 성격의 방은 같은 색(예: 공용=연한 주황, 사적=회색)\n  "entries": [ {"room":"<영역 id>", "side":"top|bottom|left|right", "color":"#F28C28"} ],   // 현관 등 출입 지점. 방 바깥에서 안쪽으로 향하는 굵은 화살표\n  "paths": [ {"via":["<id>","<id>","<id>"], "color":"#F28C28", "dashed":true} ]            // 동선. 지나는 방 id 를 순서대로(점선이 방 중심을 직각으로 이어 간다)\n- **rooms 에는 주요 실만 넣는다**(보통 3~8개: 거실, 주방/식당, 침실, 안방, 서재 등 생활의 중심이 되는 실). 욕실·화장실·현관·팬트리·다용도실·실외기실·발코니·드레스룸·복도 같은 부속 공간은 rooms 에 넣지 않는다 — 넣지 않은 방은 색 없이 비워 두고 건물 외곽선만 남는다(참고 이미지처럼). 요청이 모든 실을 표시하라고 하면 예외.\n- 이니셜은 참고 이미지의 규칙을 따른다(예: L=거실, K=주방, D/K=식당·주방, R=방/침실, S=서재). 참고 이미지에 없는 방은 영문 첫 글자나 한글 한 글자로 정한다.\n  "legend": [ {"label":"공용 공간", "color":"#FFEFD5"}, {"label":"사적 공간", "color":"#EFEFEF"} ]   // 색의 뜻을 아래에 표시(구역을 나눌 때는 반드시 넣는다)\n- 요청에 '공용/사적 구분' 같은 구역 나누기가 있으면: 모든 방을 구역으로 분류해서 rooms 의 fill 을 구역별로 서로 뚜렷이 다른 색으로 칠하고(빠지는 방이 없게), legend 로 색의 뜻을 적는다. 공용=거실·주방·식당·현관·복도·발코니, 사적=침실·안방·서재·드레스룸·욕실·화장실 처럼 일반적인 기준을 따르되 요청의 기준이 있으면 그것을 따른다.\n- 요청에 없는 진입 화살표(entries)와 동선(paths)은 넣지 않는다. 요청이 동선·진입을 말했을 때만 쓴다. 영역 id 는 반드시 목록에 있는 것만 쓴다.`;

const LAYOUT_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "panels": [   // 1~4개. 한 패널 = 한 가지 개념(같은 바탕 도면 위에 다른 내용을 얹는다)
    {
      "heading": "패널 제목. 강조할 핵심어는 {중괄호}. 예: 공용공간을 중심으로 {열린 동선}",
      "accent": "#RRGGBB",
      "flows": [ {"from":"r1", "to":"r3", "color":"#RRGGBB", "dashed":false} ],      // 사람/동선의 흐름. 영역 id 사이를 잇는다
      "zones": [ {"ids":["r2","r4"], "color":"#RRGGBB", "pattern":"hatch|fill", "label":"공용 영역"} ], // 같은 성격의 영역 강조
      "notes": [ {"target":"r5", "text":"짧은 설명(15자 이내)"} ]
    }
  ]
}`;

// 배치도(site): 읽은 건물/대지 위에 개념 요소(흐름·구역·정원·순환)를 얹는다. 위치는 건물 id 또는 [x,y]
export function buildSitePrompt(read, userText, hasStyle = false) {
  const cen = (pts) => [Math.round(pts.reduce((a, p) => a + p[0], 0) / pts.length), Math.round(pts.reduce((a, p) => a + p[1], 0) / pts.length)];
  const objs = read.shapes.filter((s) => s.kind !== 'road').map((s) => ({ id: s.id, name: s.name, kind: s.kind, center: cen(s.pts) }));
  const blds = read.shapes.filter((s) => s.kind === 'building').map((s) => cen(s.pts));
  const mid = blds.length ? [Math.round(blds.reduce((a, c) => a + c[0], 0) / blds.length), Math.round(blds.reduce((a, c) => a + c[1], 0) / blds.length)] : [50, 50];
  const styleNote = hasStyle ? '\n\n[스타일 참고 이미지 첨부됨] 첨부 이미지는 "이런 느낌으로" 만들라는 견본이다. 패널 수(보통 3개)와 구성, 쓰인 요소(굵은 흐름 띠, 해칭 구역, 아이콘 칩과 지시선, 순환 고리와 화살표)와 제목 스타일을 참고해서 같은 방식으로 표현하되, 위치는 아래 읽은 배치를 따른다. 이미지 안의 글자는 베끼지 않고 요청의 내용으로 쓴다.' : '';
  return `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래는 이미지에서 읽은 단지 배치(대지와 건물)다. 이 배치를 바탕으로 요청에 맞는 배치 개념도를 JSON으로만 출력한다(설명/마크다운/코드펜스 금지).

[읽은 배치 — 좌표는 0~100(왼쪽 위가 [0,0])]
${JSON.stringify(objs)}
건물들의 중심 평균(단지 한가운데 부근): [${mid[0]}, ${mid[1]}]

스키마:
${SITE_SCHEMA}

위치 지정 규칙(이 배치에서는 9방위 앵커 대신 아래 방식을 쓴다):
- anchor / from / to 에는 위 목록의 건물 id 문자열(예: "r3") 또는 좌표 배열 [x,y] (0~100, 위와 같은 좌표계)를 쓴다. 앵커 이름(center, n …)도 쓸 수 있지만 가급적 쓰지 않는다.
- 광장·허브·정원·순환 같은 외부공간은 건물 위가 아니라 건물 사이의 빈 곳 좌표로 지정한다(예: 단지 한가운데 부근 [${mid[0]}, ${mid[1]}]). 건물 중심 좌표와 겹치지 않게 한다.
- flow 는 "from"(퍼져 나가는 중심 좌표)에서 "to"(건물 id 또는 좌표 목록)로 뻗는다. cycle 은 anchor 좌표에 둔다. zone 은 anchor 좌표 + size.
- marker 의 label 은 요청에 나온 이름을 그대로 쓴다(한국어, 15자 이내). 패널당 marker 는 최대 6개.

${SITE_RULES}

규칙:
- 패널 1~3개. 요청에 나온 개념(예: 코어 스퀘어 / 커뮤니티 가든 / 순환구조)마다 패널 하나씩, 그 개념의 이름을 heading 에 {강조}로 넣는다. siteShape 는 "rect".
- 요청에 있는 개념은 하나도 빠뜨리지 않는다.${styleNote}

요청: ${userText || '(요청 없음 — 중심 광장, 정원, 순환 구조를 보여준다)'}`;
}

export function buildSubjectPrompt(read, userText, hasStyle = false) {
  if (read.kind === 'site') return buildSitePrompt(read, userText, hasStyle);
  const styleNote = hasStyle ? '\n\n[스타일 참고 이미지 첨부됨] 첨부 이미지는 "이런 느낌으로" 만들라는 견본이다. 칸(단계/패널) 구성, 단계 수, 사용된 요소(화살표·구역 해칭·주석 등)와 표현 방식을 참고하되, 형태와 내용은 위 대상 도면/형태를 그대로 따른다. 이미지 안의 글자는 베끼지 않는다.' : '';
  if (read.kind === 'form') {
    return `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래 "대상 건물 형태"를 소재로, 요청에 맞는 매스 과정도를 JSON으로만 출력한다(설명/마크다운/코드펜스 금지).

[대상 건물 형태 — 마지막 단계의 형태는 반드시 이것과 같아야 한다]
${JSON.stringify(read.form)}

스키마:
${FORM_SCHEMA}

규칙:
- 마지막 단계는 위 대상 형태 그대로(boxes 값을 그대로 복사, mode 표시 없음)로 둔다.
- 앞 단계들은 최종 형태에서 거꾸로 분해해서 만든다: 처음엔 단순한 덩어리(EXTRUSION), 이어서 덜어내기(mode:"subtract")·더하기(mode:"add")로 최종 형태에 이르게 한다. 새로운 덩어리를 최종 형태 밖에 임의로 만들지 않는다.
- 모든 단계의 ground 는 동일하게 둔다. 박스끼리 겹치지 않게 한다. label 은 영문 대문자 권장.
- 요청의 단계 수·표현 지시가 있으면 우선한다.

요청: ${userText || '(요청 없음 — 최종 형태가 만들어지는 과정을 4단계로 보여준다)'}${styleNote}`;
  }
  return `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래 "대상 도면"의 영역들을 소재로, 요청에 맞는 개념 다이어그램을 JSON으로만 출력한다(설명/마크다운/코드펜스 금지). 도면의 모양은 고정이고, 당신은 그 위에 얹을 흐름·구역·주석만 정한다.

[대상 도면(${read.kind === 'plan' ? '평면' : '배치'}) 영역 — id 와 이름만]
${JSON.stringify(read.shapes.map((s) => ({ id: s.id, name: s.name, kind: s.kind })))}

스키마:
${LAYOUT_SCHEMA}

규칙:
- flows/zones/notes 에는 위 목록에 있는 id 만 쓴다. 없는 id 를 만들지 않는다.
- flows 는 패널당 최대 8개, zones 는 최대 4개, notes 는 최대 5개. 모든 글자는 한국어. 색은 패널마다 조화로운 계열로 한다.
- road/boundary 는 흐름의 출발·도착이나 구역으로 쓰지 않아도 된다(필요하면 road 는 출입 흐름의 시작점으로 써도 된다).
- 요청의 내용(어떤 동선·구역·개념을 보여줄지)을 패널로 나누어 반영한다.

${BLOCKS_RULES}

요청: ${userText || '(요청 없음 — 주요 동선과 공용/사적 영역을 보여준다)'}${styleNote}`;
}

export { SHAPE_KINDS };
