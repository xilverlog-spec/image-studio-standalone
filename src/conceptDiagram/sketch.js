// 손스케치 → 정리된 개념 다이어그램 + 속성 편집.
// 1) AI 가 손그림을 '해석하지 않고 그려진 그대로' 읽는다(상자·빗금 채움·자유 곡선) — buildSketchReadPrompt / normalizeSketchRead
// 2) 요청 문장을 얹어 이름·설명·바람 방향만 정한다(도형 위치는 못 바꾼다) — buildSketchAnnotatePrompt / makeSketchSpec
// 3) 구조(spec)를 코드가 SVG 로 그린다(발표용·도면용 두 스타일) — renderSketch
// 4) 화면에서 요소를 고르면 속성(화살표 방향·선 종류·굵기·색·글자·위치)을 바꾸고 다시 그린다 — sketchUpdate 등
//
// spec = { title, subtitle, style:'line'(도면용 하나뿐), frame:[x0,y0,x1,y1],
//   blocks:[{id, kind:'slab'|'core', rect:[x0,y0,x1,y1], name, desc, fill}],
//   lines:[{id, pts:[[x,y],[x,y]], dash, width, color}],                                   // 칸막이 등 직선
//   winds:[{id, pts:[[x,y],...], smooth, head:'end|start|both|none', dash, width, color, inLabel, outLabel}],
//   memos:[{id, x, y, text, size, color}], legend:{wind, core}, notes:[...] }
// 좌표는 0~100(긴 변 기준) 정규화 값이다.

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const num = (v, d, lo = -50, hi = 150) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bbox = (pts) => { const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

export const DASHES = { solid: '', dashed: '9 6', dotted: '1.5 6', dashdot: '14 5 2 5', dots: '0.1 8.5' };
export const DASH_LABEL = { solid: '실선', dashed: '파선', dotted: '점선', dashdot: '일점쇄선', dots: '굵은 점(둥근 점선)' };
// 선 표현(form): line = 선(실선·파선·점선·일점쇄선), 나머지는 모양 자체가 다른 표현
export const FORMS = ['line', 'ribbon', 'soft', 'double', 'chevron', 'zigzag'];
export const FORM_LABEL = { line: '선', ribbon: '리본(붓 띠)', soft: '번짐(끝이 흐려지는 띠)', double: '이중선', chevron: '화살표 반복', zigzag: '물결 장식선' };
// 곡선 모양(shape): read = 읽은 모양을 다듬음, straight = 직선, s = S자, arc = 호
export const SHAPES = ['read', 's', 'arc', 'straight'];
export const SHAPE_LABEL = { read: '읽은 모양(다듬음)', s: 'S자 곡선', arc: '호(활 모양)', straight: '직선' };
export const HEAD_LABEL = { end: '끝에 화살촉', start: '시작에 화살촉', both: '양쪽', none: '없음' };
const HEADS = Object.keys(HEAD_LABEL);

// ── 1) 읽기 ──────────────────────────────────────────────────
export function buildSketchReadPrompt() {
  return `당신은 건축가의 손 스케치를 읽는 보조자다. 첨부 이미지는 종이에 펜으로 그린 개념 스케치다. 스케치를 **해석하거나 이름을 짓지 말고, 그려진 것을 있는 그대로** JSON으로만 출력한다(설명/코드펜스 금지).
모든 위치는 이미지 전체를 0~1000으로 정규화한 좌표다. 점은 [y, x], 상자는 [ymin, xmin, ymax, xmax] 순서다(이미지 왼쪽 위가 [0,0]).

스키마:
{
 "summary": "무엇이 그려져 있는지 한국어 두세 문장(도형·화살표·글자가 몇 개씩 있는지 포함)",
 "blocks": [ {"id":"b1", "box_2d":[ymin,xmin,ymax,xmax], "hatched": true|false, "color":"black|blue|red|green|other", "open_sides":["top","bottom","left","right" 중 해당하는 것], "note":"한 줄"} ],
 "arrows": [ {"id":"a1", "tail":[y,x], "tip":[y,x], "color":"...", "note":"한 줄(양쪽에 화살촉이면 '양쪽')"} ],
 "flows": [ {"id":"f1", "points":[[y,x],...선을 따라 5~10개], "color":"...", "note":"한 줄"} ],
 "arcs": [ {"id":"c1", "points":[[y,x],...3~6개], "color":"..."} ],
 "partitions": [ {"from":[y,x], "to":[y,x]} ],
 "texts": [ {"text":"손글씨 그대로", "point":[y,x], "color":"..."} ],
 "edges": [ {"from":[y,x], "to":[y,x], "color":"...", "note":"한 줄"} ]
}
규칙:
- blocks: 닫힌 도형 하나당 바깥 윤곽 전체를 감싸는 상자 하나. 도형 안쪽을 가르는 가는 선으로 생긴 칸은 따로 적지 않는다(그 선은 partitions). 안을 빗금으로 칠한 도형은 hatched true. 기울어진 도형도 가장 바깥을 감싸는 상자로 적는다. 서로 겹쳐 그려진 도형은 각각 적는다.
- arrows: 화살촉이 있는 선(직선·곡선) 하나당 하나, **하나도 빠뜨리지 않는다.** tail 은 화살대가 시작하는 끝, tip 은 화살촉이 있는 끝이다.
- flows: 화살촉 없이 도형을 가로지르는 물결·곡선 흐름선. arcs: 화살표 여러 개를 묶거나 글자 옆에 붙여 그린 괄호 같은 호(화살촉 없음).
- partitions: 도형 안쪽을 나누는 가는 직선. texts: 손으로 쓴 글자·단어·숫자를 보이는 그대로(같은 글자가 여러 곳이면 각각), point 는 글자의 중심.
- open_sides: 그 도형의 변 중에서 **빨간 빗금·눈금·톱니 표시가 변을 따라 붙어 있는 변**(열린 면·개구부 표시)을 위(top)·아래(bottom)·왼쪽(left)·오른쪽(right)으로 적는다. 변의 일부에만 붙어 있어도 그 변을 적는다. 표시가 없으면 빈 배열.
- edges: (open_sides 로 담기 어려운 짧은 표시만) 벽이나 도형의 변을 따라 붙여 그린 짧은 빗금·눈금·톱니 표시(열린 면·개구부 표시)가 이어진 구간의 양 끝(꺾이면 구간을 나눠 적는다). 도형 안을 채운 빗금은 edges 가 아니다.
- 펜 색을 color 로 구분한다(빨간 펜은 대개 건물이 아닌 방향·개방 같은 주석). 이름을 짓지 않는다. 그려진 것만 적는다.`;
}

const SNAP_TOL = 3.2;

// 펜 색 → 화면 색
export const PEN = { black: '#222222', blue: '#1E4FA0', red: '#E8832A', green: '#3E8E41', other: '#555555' }; // 빨간 펜 표시는 개념도의 주황 강조색으로 옮긴다
const penOf = (c) => (PEN[c] ? c : 'other');
const LINE_KINDS = ['partition', 'arrow', 'flow', 'arc', 'other'];
export const SIDES = ['top', 'bottom', 'left', 'right'];
export const SIDE_LABEL = { top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽' };
const ARROWS = ['end', 'start', 'both', 'none'];

// AI 응답 → 정리된 읽기 결과. dims = [이미지 가로 px, 세로 px] 이면 가로세로 비율을 되살린다(AI 좌표는 가로·세로를 따로 0~1000 으로 준다).
// 기본 위치 표현([y,x] / [ymin,xmin,ymax,xmax], 0~1000)을 쓰고, 옛 형식(눈금 0~100 의 pts)도 그대로 읽는다.
export function normalizeSketchRead(parsed, dims) {
  if (!parsed || typeof parsed !== 'object') throw new Error('스케치를 읽은 결과가 비어 있습니다.');
  const long = dims ? Math.max(dims[0], dims[1]) : 1;
  const sx = dims ? dims[0] / long : 1; const sy = dims ? dims[1] / long : 1;
  const fix = (p) => [num(p?.[0], 0, 0, 100) * sx, num(p?.[1], 0, 0, 100) * sy];          // 옛 형식: [x,y] 0~100
  const yx = (p) => [num(p?.[1], 0, 0, 1000) / 10 * sx, num(p?.[0], 0, 0, 1000) / 10 * sy]; // 기본 형식: [y,x] 0~1000 → [x,y] 0~100
  const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : []).slice(0, 12).map((b, i) => {
    let rect;
    if (Array.isArray(b.box_2d) && b.box_2d.length === 4) { const [y0, x0, y1, x1] = b.box_2d.map((v) => num(v, 0, 0, 1000)); rect = [Math.min(x0, x1) / 10 * sx, Math.min(y0, y1) / 10 * sy, Math.max(x0, x1) / 10 * sx, Math.max(y0, y1) / 10 * sy]; }
    else { const pts = (Array.isArray(b.pts) ? b.pts : []).map(fix); if (pts.length < 3) return null; rect = bbox(pts); }
    if (rect[2] - rect[0] < 0.5 || rect[3] - rect[1] < 0.5) return null;
    const openSides = [...new Set((Array.isArray(b.open_sides) ? b.open_sides : []).map((v) => String(v).toLowerCase()).filter((v) => SIDES.includes(v)))];
    return { id: `b${i + 1}`, hatched: !!b.hatched, rect, color: penOf(b.color), openSides, note: String(b.note ?? '') };
  }).filter(Boolean);
  if (!blocks.length) throw new Error('스케치에서 도형(상자)을 찾지 못했습니다.');
  // 가까운 모서리 좌표끼리 같은 값으로 맞춘다(손떨림 제거)
  [0, 1].forEach((idx) => {
    const vals = blocks.flatMap((b) => [b.rect[idx], b.rect[idx + 2]]).sort((a, b) => a - b);
    const groups = [];
    vals.forEach((v) => { const g = groups[groups.length - 1]; if (g && v - g[g.length - 1] <= SNAP_TOL) g.push(v); else groups.push([v]); });
    const mapTo = (v) => { const g = groups.find((gr) => gr.includes(v)); return g.reduce((a, c) => a + c, 0) / g.length; };
    blocks.forEach((b) => { b.rect[idx] = mapTo(b.rect[idx]); b.rect[idx + 2] = mapTo(b.rect[idx + 2]); });
  });
  const lines = []; const addLine = (l) => { if (lines.length < 48) lines.push({ id: `l${lines.length + 1}`, ...l }); };
  // 옛 형식의 lines(kind/style/pts)
  (Array.isArray(parsed.lines) ? parsed.lines : []).forEach((l) => {
    const pts = (Array.isArray(l.pts) ? l.pts : []).map(fix); if (pts.length < 2) return;
    const kind = LINE_KINDS.includes(l.kind) ? l.kind : (l.style === 'wavy' ? 'flow' : 'partition');
    let arrow = ARROWS.includes(l.arrow) ? l.arrow : (kind === 'arrow' ? 'end' : 'none');
    if (kind === 'arrow' && /양쪽/.test(String(l.note ?? ''))) arrow = 'both';
    else if (kind === 'arrow' && Array.isArray(l.tip) && l.tip.length === 2) { const tip = fix(l.tip); const d = (p) => Math.hypot(p[0] - tip[0], p[1] - tip[1]); if (d(pts[0]) < d(pts[pts.length - 1])) pts.reverse(); arrow = 'end'; }
    else if (kind === 'arrow' && arrow === 'none') arrow = 'end';
    addLine({ kind, style: kind === 'flow' || kind === 'arc' ? 'wavy' : 'straight', arrow, color: penOf(l.color), pts, note: String(l.note ?? '') });
  });
  // 기본 형식: 화살표(꼬리→화살촉), 흐름선, 호, 칸막이
  (Array.isArray(parsed.arrows) ? parsed.arrows : []).forEach((a) => {
    if (!Array.isArray(a?.tail) || !Array.isArray(a?.tip)) return;
    addLine({ kind: 'arrow', style: 'straight', arrow: /양쪽/.test(String(a.note ?? '')) ? 'both' : 'end', color: penOf(a.color), pts: [yx(a.tail), yx(a.tip)], note: String(a.note ?? '') });
  });
  (Array.isArray(parsed.flows) ? parsed.flows : []).forEach((f) => { const pts = (Array.isArray(f?.points) ? f.points : []).map(yx); if (pts.length >= 2) addLine({ kind: 'flow', style: 'wavy', arrow: 'none', color: penOf(f.color), pts, note: String(f.note ?? '') }); });
  (Array.isArray(parsed.arcs) ? parsed.arcs : []).forEach((f) => { const pts = (Array.isArray(f?.points) ? f.points : []).map(yx); if (pts.length >= 2) addLine({ kind: 'arc', style: 'wavy', arrow: 'none', color: penOf(f.color), pts, note: '' }); });
  (Array.isArray(parsed.partitions) ? parsed.partitions : []).forEach((f) => { if (Array.isArray(f?.from) && Array.isArray(f?.to)) addLine({ kind: 'partition', style: 'straight', arrow: 'none', color: 'black', pts: [yx(f.from), yx(f.to)], note: '' }); });
  const texts = (Array.isArray(parsed.texts) ? parsed.texts : []).slice(0, 24).map((t, i) => {
    const text = String(t?.text ?? '').trim().slice(0, 24); const pos = Array.isArray(t?.point) ? yx(t.point) : Array.isArray(t?.pos) ? fix(t.pos) : null;
    return text && pos ? { id: `t${i + 1}`, text, pos, color: penOf(t.color) } : null;
  }).filter(Boolean);
  const edges = (Array.isArray(parsed.edges) ? parsed.edges : []).slice(0, 24).map((e, i) => {
    const pts = Array.isArray(e?.from) && Array.isArray(e?.to) ? [yx(e.from), yx(e.to)] : (Array.isArray(e?.pts) ? e.pts.map(fix) : []);
    return pts.length >= 2 ? { id: `e${i + 1}`, pts, color: penOf(e.color), note: String(e.note ?? '') } : null;
  }).filter(Boolean);
  return { kind: 'sketch', summary: String(parsed.summary ?? ''), blocks, lines, texts, edges };
}

// 여러 번 읽은 결과 중 서로 가장 일치하는 것을 고른다(가끔 도형 하나를 크게 빗나가게 읽는 이탈값을 피한다)
export function pickConsensusSketch(reads) {
  const ok = reads.filter(Boolean);
  if (ok.length <= 2) return ok[0];
  const iou = (a, c) => { const x0 = Math.max(a[0], c[0]); const y0 = Math.max(a[1], c[1]); const x1 = Math.min(a[2], c[2]); const y1 = Math.min(a[3], c[3]); const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); const u = (a[2] - a[0]) * (a[3] - a[1]) + (c[2] - c[0]) * (c[3] - c[1]) - i; return u > 0 ? i / u : 0; };
  const sim = (A, B) => { // A 의 도형마다 B 에서 가장 겹치는 도형의 IoU 평균(도형 수가 다르면 불리하게)
    const m = A.blocks.reduce((acc, b) => acc + Math.max(0, ...B.blocks.map((c) => iou(b.rect, c.rect))), 0) / A.blocks.length;
    return m * Math.min(A.blocks.length, B.blocks.length) / Math.max(A.blocks.length, B.blocks.length);
  };
  let best = ok[0]; let bestScore = -1;
  ok.forEach((r, i) => { const sc = ok.reduce((acc, o, j) => (j === i ? acc : acc + (sim(r, o) + sim(o, r)) / 2), 0); if (sc > bestScore) { bestScore = sc; best = r; } });
  return best;
}

// 열린 벽 표시(구간 하나)를 가장 가까운 도형 외곽(벽)에 붙인다. seg = [x0,y0,x1,y1](얇은 직사각형), solids = 벽이 될 도형들의 rect 목록(판 우선, 코어는 뒤로).
// 구간이 벽과 겹치는 부분만 남기고, 벽에서 tol(다이어그램 단위)보다 멀면 붙이지 않는다.
export function findWall(seg, solids, tol = 6) {
  const horiz = (seg[2] - seg[0]) >= (seg[3] - seg[1]);
  const m = horiz ? (seg[1] + seg[3]) / 2 : (seg[0] + seg[2]) / 2; const a = horiz ? seg[0] : seg[1]; const b = horiz ? seg[2] : seg[3];
  let best = null;
  solids.forEach(({ rect, penalty = 0 }, i) => {
    const edges = horiz ? [['top', rect[1], rect[0], rect[2]], ['bottom', rect[3], rect[0], rect[2]]] : [['left', rect[0], rect[1], rect[3]], ['right', rect[2], rect[1], rect[3]]]; // [변, 좌표, 시작, 끝]
    edges.forEach(([side, c, lo, hi]) => {
      const ov = Math.min(b, hi) - Math.max(a, lo); if (ov < (b - a) * 0.2 || ov <= 0) return;
      const d = Math.abs(m - c) + penalty; if (Math.abs(m - c) <= tol && (!best || d < best.d)) best = { d, i, side, horiz, c, lo: Math.max(a, lo), hi: Math.min(b, hi), wallLen: hi - lo };
    });
  });
  return best;
}
export function snapSegToWall(seg, solids, tol = 6) {
  const best = findWall(seg, solids, tol); if (!best) return seg;
  const th = (best.horiz ? seg[3] - seg[1] : seg[2] - seg[0]) / 2 || 1.3;
  return best.horiz ? [best.lo, best.c - th, best.hi, best.c + th] : [best.c - th, best.lo, best.c + th, best.hi];
}

// 손떨림 제거: 모서리를 깎는 Chaikin 을 두 번 적용하고, 호 길이를 따라 일정 간격으로 다시 뽑는다
const chaikin = (pts, it = 2) => {
  let p = pts;
  for (let k = 0; k < it; k++) {
    const n = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i]; const b = p[i + 1]; n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    n.push(p[p.length - 1]); p = n;
  }
  return p;
};
const resample = (pts, n) => {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1; const out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (total * k) / (n - 1); while (j < pts.length - 2 && cum[j + 1] < t) j++;
    const seg = cum[j + 1] - cum[j] || 1; const u = Math.min(1, Math.max(0, (t - cum[j]) / seg));
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  return out;
};

// ── 2) 이름·설명·바람 방향(AI) ───────────────────────────────
export function buildSketchAnnotatePrompt(read, userText) {
  const r0 = (v) => Math.round(v);
  const slabs = read.blocks.filter((b) => !b.hatched).map((b) => ({ id: b.id, rect: b.rect.map(r0), note: b.note }));
  const cores = read.blocks.filter((b) => b.hatched).map((b) => ({ id: b.id, rect: b.rect.map(r0), note: b.note }));
  const winds = read.lines.filter((l) => ['flow', 'arrow', 'arc'].includes(l.kind)).map((l) => ({ id: l.id, kind: l.kind, color: l.color, arrow: l.arrow, from: l.pts[0].map(r0), to: l.pts[l.pts.length - 1].map(r0), note: l.note }));
  const texts = (read.texts || []).map((t) => ({ text: t.text, pos: t.pos.map(r0), color: t.color }));
  const edges = (read.edges || []).map((e) => ({ id: e.id, from: e.pts[0].map(r0), to: e.pts[e.pts.length - 1].map(r0), color: e.color }));
  return `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래는 건축가의 손 스케치에서 읽어 정리한 요소다(좌표 0~100, 왼쪽 위가 [0,0], y 는 아래로 커진다). 도형·화살표·글자의 모양과 위치는 이미 읽은 그대로 고정이며 바꿀 수 없다. 요청의 개념에 맞는 이름·설명·화살표 양끝에 붙일 짧은 말만 정해 JSON 으로만 출력한다(설명/코드펜스 금지).
요소: ${JSON.stringify({ slabs, cores, winds, texts, edges })}
요청: ${userText || '(요청 없음 — 스케치에 그려진 것만 간단히 이름 붙인다)'}
스키마:
{ "title":"제목(20자 이내)", "subtitle":"부제(30자 이내)",
  "items":[{"target":"슬래브/코어 id","name":"이름(12자 이내)","desc":"한 줄 설명(30자 이내)"}],
  "winds":[{"id":"winds 의 id","head":"end|start|both|none","in":"시작 쪽에 쓸 말(8자 이내, 없으면 빈 문자열)","out":"끝 쪽에 쓸 말(8자 이내, 없으면 빈 문자열)"}],
  "legend":{"wind":"화살표·흐름선 범례 문구(20자 이내)","core":"빗금 도형 범례 문구(20자 이내)","opening":"edges(벽에 붙은 표시) 범례 문구(20자 이내)"},
  "notes":["핵심 메시지 문장 1~2개(각 40자 이내)"] }
규칙: 모든 슬래브와 코어에 items 를 하나씩 순서대로 쓴다. 코어(빗금 도형)의 name 은 요청에 다른 말이 없으면 \"CORE\" 로 쓴다. winds 에서 kind 가 arrow 인 것은 스케치에 화살촉이 이미 그려져 있으므로 head 를 바꾸지 않고(arrow 값을 그대로), in/out 은 꼭 필요할 때만 짧게 쓴다. kind 가 flow 이면 요청의 개념(예: 맞통풍은 한쪽 면의 개구부로 들어온 바람이 반대쪽 면으로 빠져나감)에 맞게 head 를 정한다. 이미 읽은 글자(texts)를 다시 쓰거나 바꾸지 않는다. 읽은 목록에 없는 id 는 쓰지 않는다. 손스케치에 없는 내용을 지어내지 않는다. 모든 글자는 한국어(스케치에서 읽은 글자는 제외).`;
}

// 읽기 결과 + AI 이름 → 편집 가능한 spec
export function makeSketchSpec(read, ann, style = 'concept') {
  const a = ann && typeof ann === 'object' ? ann : {};
  const area = (b) => (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]);
  const slabs = read.blocks.filter((b) => !b.hatched).sort((p, q) => area(q) - area(p));
  const cores = read.blocks.filter((b) => b.hatched);
  const items = Object.fromEntries((Array.isArray(a.items) ? a.items : []).map((i) => [String(i.target), i]));
  const blocks = [...slabs, ...cores].map((b, i) => ({
    id: `b${i + 1}`, kind: b.hatched ? 'core' : 'slab', rect: b.rect.map((v) => Math.round(v * 10) / 10),
    name: String(items[b.id]?.name ?? ''), desc: String(items[b.id]?.desc ?? ''), openSides: [...(b.openSides || [])], inset: 6,
  }));
  // 벽을 따라 붙은 표시(열린 면) → 그 벽 위의 개구부(점선 캡슐). 펜 색을 그대로 쓴다
  const wallSolids = [...slabs, ...cores].map((b, i) => ({ rect: b.rect.map((v) => Math.round(v * 10) / 10), penalty: b.hatched ? 1.5 : 0 }));
  // 벽 표시 조각: 같은 벽에 붙은 조각이 그 벽 길이의 절반 이상을 덮으면 그 변 전체가 열린 것으로 보고 도형의 openSides 에 합친다. 나머지 짧은 조각은 벽에 붙인 개구부로 둔다
  const frags = (read.edges || []).map((e) => {
    const [x0, y0, x1, y1] = bbox(e.pts); const horiz = (x1 - x0) >= (y1 - y0); const th = 1.3;
    const raw = horiz ? [x0, (y0 + y1) / 2 - th, x1, (y0 + y1) / 2 + th] : [(x0 + x1) / 2 - th, y0, (x0 + x1) / 2 + th, y1];
    return { e, raw, wall: findWall(raw, wallSolids) };
  });
  const cover = {};
  frags.forEach(({ wall }) => { if (wall) { const k = `${wall.i}:${wall.side}`; cover[k] = (cover[k] || 0) + (wall.hi - wall.lo) / (wall.wallLen || 1); } });
  Object.entries(cover).forEach(([k, v]) => { if (v >= 0.5) { const [i, side] = k.split(':'); const blk = blocks[Number(i)]; if (blk && !blk.openSides.includes(side)) blk.openSides.push(side); } });
  frags.forEach(({ e, raw, wall }) => {
    if (wall && cover[`${wall.i}:${wall.side}`] >= 0.5) return; // 변 전체로 합쳐진 조각
    blocks.push({ id: `b${blocks.length + 1}`, kind: 'opening', rect: snapSegToWall(raw, wallSolids), name: '', desc: '', fill: '', stroke: PEN[e.color], inset: 6, openSides: [] });
  });
  // 칸막이: 가로/세로로 반듯하게, 슬래브 안쪽으로 맞춘다(슬래브 밖 선은 버린다)
  const inside = (r, x, y, m = 1.5) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
  const lines = [];
  read.lines.filter((l) => l.kind === 'partition').forEach((l) => {
    const [x0, y0, x1, y1] = bbox(l.pts); const vertical = (x1 - x0) < (y1 - y0) * 0.35; const horizontal = (y1 - y0) < (x1 - x0) * 0.35;
    if (!vertical && !horizontal) return;
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    const host = blocks.find((b) => b.kind === 'slab' && inside(b.rect, mx, my));
    if (!host) return;
    const r = host.rect;
    lines.push({ id: `p${lines.length + 1}`, pts: vertical ? [[mx, r[1]], [mx, r[3]]] : [[r[0], my], [r[2], my]], dash: 'solid', width: 1.6 });
  });
  // 화살표의 꼬리를 모델이 건물 안쪽(예: 건물 한가운데)에 잘못 찍는 일이 잦다. 꼬리가 건물 안이고 화살촉이 건물 밖이면, 건물 벽(경계)에서 시작하도록 자른다
  const solid = blocks.filter((b) => b.kind !== 'opening');
  const inAny = (x, y) => solid.some((b) => x > b.rect[0] && x < b.rect[2] && y > b.rect[1] && y < b.rect[3]);
  const trimTail = (pts) => {
    if (pts.length !== 2) return pts;
    const [a, z] = pts; if (!inAny(a[0], a[1]) || inAny(z[0], z[1])) return pts;
    let tExit = 0; for (let i = 1; i <= 200; i++) { const t = i / 200; if (inAny(a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t)) tExit = t; }
    const t = Math.min(0.9, tExit + 0.01); return [[a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t], z];
  };
  // 흐름선(화살촉 없는 물결)은 리본으로, 화살표는 스케치의 방향·펜 색 그대로 화살표로, 호는 얇은 곡선으로
  const windNote = Object.fromEntries((Array.isArray(a.winds) ? a.winds : []).map((w) => [String(w.id), w]));
  const winds = [];
  read.lines.filter((l) => ['flow', 'arrow', 'arc'].includes(l.kind)).forEach((l) => {
    const w = windNote[l.id] || {}; const color = l.color === 'other' || l.color === 'black' ? '#1E88C8' : PEN[l.color];
    // 스케치에 그려진 화살표·호에는 말풍선을 기본으로 붙이지 않는다(참고 개념도처럼 깔끔하게). 흐름선만 AI 가 정한 유입/유출 문구를 쓴다
    const labels = l.kind === 'flow' ? { inLabel: String(w.in ?? ''), outLabel: String(w.out ?? '') } : { inLabel: '', outLabel: '' };
    if (l.kind === 'flow') {
      winds.push({ id: `w${winds.length + 1}`, pts: resample(chaikin(l.pts, 2), 9), smooth: true, head: HEADS.includes(w.head) ? w.head : 'end', dash: 'solid', width: 4.5, color: '#1E88C8', form: 'ribbon', shape: 's', bend: 0.65, amp: 0.4, ...labels });
    } else if (l.kind === 'arrow') {
      winds.push({ id: `w${winds.length + 1}`, pts: trimTail(l.pts.length > 4 ? resample(chaikin(l.pts, 1), 5) : l.pts), smooth: true, head: l.arrow, dash: 'solid', width: 3.4, color, form: 'line', shape: 'read', bend: 1, amp: 0.4, ...labels });
    } else {
      winds.push({ id: `w${winds.length + 1}`, pts: resample(chaikin(l.pts, 2), 9), smooth: true, head: 'none', dash: 'dots', width: 5.2, color, form: 'line', shape: 'read', bend: 1, amp: 0.4, ...labels });
    }
  });
  // 손글씨는 읽은 그대로 글자 메모로(위치 편집 가능)
  const memos = (read.texts || []).map((t, i) => ({ id: `m${i + 1}`, x: t.pos[0], y: t.pos[1], text: t.text, size: 26, color: '#2B2523' }));
  const all = [...blocks.flatMap((b) => [[b.rect[0], b.rect[1]], [b.rect[2], b.rect[3]]]), ...winds.flatMap((w) => w.pts), ...memos.map((m) => [m.x, m.y])];
  const [x0, y0, x1, y1] = bbox(all); const padX = (x1 - x0) * 0.04; const padY = (y1 - y0) * 0.04;
  return {
    title: String(a.title ?? ''), subtitle: String(a.subtitle ?? ''), style, frame: [x0 - padX, y0 - padY, x1 + padX, y1 + padY],
    blocks, lines, winds, memos, legend: { wind: String(a.legend?.wind ?? '기류(흐름)'), core: String(a.legend?.core ?? '코어(계단·승강기)'), opening: String(a.legend?.opening ?? '개구부(창)') },
    notes: (Array.isArray(a.notes) ? a.notes : []).slice(0, 2).map(String),
  };
}

// ── 3) 정규화(편집 중 잘못된 값이 들어와도 그려지게) ─────────────
export function normalizeSketch(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const uid = (id, pre) => { let v = String(id || pre); while (seen.has(v)) v += '_'; seen.add(v); return v; };
  const pt = (p) => [num(p?.[0], 0), num(p?.[1], 0)];
  const blocks = (Array.isArray(s.blocks) ? s.blocks : []).slice(0, 30).map((b, i) => {
    const r = Array.isArray(b.rect) ? b.rect.map((v) => num(v, 0)) : [0, 0, 10, 10];
    return { id: uid(b.id, `b${i + 1}`), kind: ['core', 'opening'].includes(b.kind) ? b.kind : 'slab', rect: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])], name: String(b.name ?? ''), desc: String(b.desc ?? ''), fill: isHex(b.fill) ? b.fill : '', stroke: isHex(b.stroke) ? b.stroke : '', showName: typeof b.showName === 'boolean' ? b.showName : null, inset: num(b.inset, 6, 0, 20),
      openSides: [...new Set((Array.isArray(b.openSides) ? b.openSides : []).filter((v) => SIDES.includes(v)))] };
  });
  const lines = (Array.isArray(s.lines) ? s.lines : []).slice(0, 40).map((l, i) => ({
    id: uid(l.id, `p${i + 1}`), pts: (Array.isArray(l.pts) && l.pts.length >= 2 ? l.pts : [[0, 0], [10, 0]]).slice(0, 30).map(pt),
    dash: DASHES[l.dash] !== undefined ? l.dash : 'solid', width: num(l.width, 1.6, 0.5, 12), color: isHex(l.color) ? l.color : '',
  }));
  const winds = (Array.isArray(s.winds) ? s.winds : []).slice(0, 30).map((w, i) => ({
    id: uid(w.id, `w${i + 1}`), pts: (Array.isArray(w.pts) && w.pts.length >= 2 ? w.pts : [[0, 0], [10, 0]]).slice(0, 30).map(pt), smooth: w.smooth !== false,
    head: HEADS.includes(w.head) ? w.head : 'end', dash: DASHES[w.dash] !== undefined ? w.dash : 'solid', width: num(w.width, 4.5, 0.5, 14),
    form: FORMS.includes(w.form) ? w.form : 'line', shape: SHAPES.includes(w.shape) ? w.shape : 'read', bend: num(w.bend, 0.65, 0, 1.6), amp: num(w.amp, 0.45, -1.2, 1.2),
    via: Array.isArray(w.via) && w.via.length === 2 && w.via.every((v) => Number.isFinite(Number(v))) ? [Number(w.via[0]), Number(w.via[1])] : null,
    color: isHex(w.color) ? w.color : '#1E88C8', inLabel: String(w.inLabel ?? ''), outLabel: String(w.outLabel ?? ''),
  }));
  const memos = (Array.isArray(s.memos) ? s.memos : []).slice(0, 30).map((m, i) => ({ id: uid(m.id, `m${i + 1}`), x: num(m.x, 50), y: num(m.y, 50), text: String(m.text ?? ''), size: num(m.size, 14, 8, 48), color: isHex(m.color) ? m.color : '#222222' }));
  const f = Array.isArray(s.frame) && s.frame.length === 4 ? s.frame.map((v) => num(v, 0)) : null;
  const all = [...blocks.flatMap((b) => [[b.rect[0], b.rect[1]], [b.rect[2], b.rect[3]]]), ...winds.flatMap((w) => w.pts), ...lines.flatMap((l) => l.pts)];
  const frame = f && f[2] > f[0] && f[3] > f[1] ? f : (all.length ? bbox(all) : [0, 0, 100, 100]);
  if (frame[2] - frame[0] < 1) frame[2] = frame[0] + 1;
  if (frame[3] - frame[1] < 1) frame[3] = frame[1] + 1;
  // 스타일: concept = 참고 개념도(크림 배경·주황 강조, 기본), line = 도면용(흰 배경·검정 선). 발표용(그림자 카드)은 쓰지 않는다
  return {
    title: String(s.title ?? ''), subtitle: String(s.subtitle ?? ''), style: s.style === 'line' ? 'line' : 'concept', showLegend: !!s.showLegend, showNotes: !!s.showNotes, frame, blocks, lines, winds, memos,
    legend: { wind: String(s.legend?.wind ?? '기류(흐름)'), core: String(s.legend?.core ?? '코어(계단·승강기)'), opening: String(s.legend?.opening ?? '개구부(창)') }, notes: (Array.isArray(s.notes) ? s.notes : []).slice(0, 4).map(String),
  };
}

// ── 4) 렌더 ──────────────────────────────────────────────────
const W = 1200; const H = 760; const AREA = [70, 150, 780, 640]; const AREA_CONCEPT = [70, 190, 1130, 690];
export const SKETCH_SIZE = [W, H];
// 다이어그램 좌표(0~100) ↔ 그림 좌표(1200x760). 틀(frame)은 편집해도 바뀌지 않아 요소를 옮겨도 전체가 다시 확대·축소되지 않는다
export function sketchView(raw) {
  const spec = normalizeSketch(raw); const [fx0, fy0, fx1, fy1] = spec.frame; const AR = spec.style === 'concept' ? AREA_CONCEPT : AREA;
  const K = Math.min((AR[2] - AR[0]) / (fx1 - fx0), (AR[3] - AR[1]) / (fy1 - fy0));
  const ox = AR[0] + (AR[2] - AR[0] - (fx1 - fx0) * K) / 2; const oy = AR[1] + (AR[3] - AR[1] - (fy1 - fy0) * K) / 2;
  return { K, toScreen: ([x, y]) => [ox + (x - fx0) * K, oy + (y - fy0) * K], toDiag: ([px, py]) => [fx0 + (px - ox) / K, fy0 + (py - oy) / K] };
}
const PALETTE = {
  pres: { bg: '#FAF7F2', slab: '#F6D9B8', slabLine: '#B8742F', core: '#27304F', text: '#222222', sub: '#666666', part: '#B8742F', card: true },
  line: { bg: '#FFFFFF', slab: '#FFFFFF', slabLine: '#222222', core: '#222222', text: '#111111', sub: '#555555', part: '#222222', card: false },
  concept: { bg: '#FDF8EC', slab: '#FFFFFF', slabLine: '#2B2523', core: '#2B2523', coreFill: '#D9D5CE', text: '#2B2523', sub: '#3A3532', part: '#8A8580', accent: '#E8832A', card: false },
};

const smoothPath = (Q) => {
  if (Q.length < 3) return `M${Q.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}`;
  let d = `M${Q[0][0].toFixed(1)} ${Q[0][1].toFixed(1)}`;
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[i - 1] || Q[i]; const p1 = Q[i]; const p2 = Q[i + 1]; const p3 = Q[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};

const f1 = (v) => v.toFixed(1);
const bez3 = (a, c1, c2, z, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * z[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * z[1]]; });
const bez2 = (a, c, z, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * z[0], u * u * a[1] + 2 * u * t * c[1] + t * t * z[1]]; });
const catmullDense = (Q, steps = 10) => {
  if (Q.length < 3) return Q;
  const out = [Q[0]];
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[i - 1] || Q[i]; const p1 = Q[i]; const p2 = Q[i + 1]; const p3 = Q[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]; const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out.push(...bez3(p1, c1, c2, p2, steps + 1).slice(1));
  }
  return out;
};
// 바람 한 줄의 중심선: d = 편집 가능한 곡선 경로, dense = 촘촘한 점(리본·물결 등 모양 만들기용), 화면 좌표
function windGeom(w, P) {
  const A = P(w.pts[0]); const Z = P(w.pts[w.pts.length - 1]);
  const L = Math.hypot(Z[0] - A[0], Z[1] - A[1]) || 1; const nx = -(Z[1] - A[1]) / L; const ny = (Z[0] - A[0]) / L;
  if (w.shape === 'straight') return { d: `M${f1(A[0])} ${f1(A[1])} L${f1(Z[0])} ${f1(Z[1])}`, dense: bez2(A, [(A[0] + Z[0]) / 2, (A[1] + Z[1]) / 2], Z, 48) };
  if (w.shape === 's') {
    const c1 = [A[0] + (Z[0] - A[0]) * 0.3 + nx * w.amp * L * 0.35, A[1] + (Z[1] - A[1]) * 0.3 + ny * w.amp * L * 0.35];
    const c2 = [A[0] + (Z[0] - A[0]) * 0.7 - nx * w.amp * L * 0.35, A[1] + (Z[1] - A[1]) * 0.7 - ny * w.amp * L * 0.35];
    // 기본 S자의 한가운데(변곡점)와 그 점에서의 진행 방향. 변곡점을 옮겨도 시작·끝 방향과 이 방향은 유지해서 S 모양이 이어진다
    const V0 = [(A[0] + 3 * c1[0] + 3 * c2[0] + Z[0]) / 8, (A[1] + 3 * c1[1] + 3 * c2[1] + Z[1]) / 8];
    const V = w.via ? P(w.via) : V0;
    const TA = [3 * (c1[0] - A[0]), 3 * (c1[1] - A[1])]; const TZ = [3 * (Z[0] - c2[0]), 3 * (Z[1] - c2[1])];
    const TV = [0.75 * (Z[0] + c2[0] - c1[0] - A[0]), 0.75 * (Z[1] + c2[1] - c1[1] - A[1])];
    const k = 0.5 / 3;
    const a1 = [A[0] + TA[0] * k, A[1] + TA[1] * k]; const a2 = [V[0] - TV[0] * k, V[1] - TV[1] * k];
    const b1 = [V[0] + TV[0] * k, V[1] + TV[1] * k]; const b2 = [Z[0] - TZ[0] * k, Z[1] - TZ[1] * k];
    return {
      d: `M${f1(A[0])} ${f1(A[1])} C${f1(a1[0])} ${f1(a1[1])} ${f1(a2[0])} ${f1(a2[1])} ${f1(V[0])} ${f1(V[1])} C${f1(b1[0])} ${f1(b1[1])} ${f1(b2[0])} ${f1(b2[1])} ${f1(Z[0])} ${f1(Z[1])}`,
      dense: [...bez3(A, a1, a2, V, 30), ...bez3(V, b1, b2, Z, 30).slice(1)], via: V,
    };
  }
  if (w.shape === 'arc') {
    const c = [(A[0] + Z[0]) / 2 + nx * w.amp * L * 0.5, (A[1] + Z[1]) / 2 + ny * w.amp * L * 0.5];
    return { d: `M${f1(A[0])} ${f1(A[1])} Q${f1(c[0])} ${f1(c[1])} ${f1(Z[0])} ${f1(Z[1])}`, dense: bez2(A, c, Z, 48) };
  }
  const Q0 = w.pts.map(P); const n = Q0.length;
  const Q = Q0.map((q, i) => { const t = i / (n - 1); const cx = A[0] + (Z[0] - A[0]) * t; const cy = A[1] + (Z[1] - A[1]) * t; return [cx + (q[0] - cx) * w.bend, cy + (q[1] - cy) * w.bend]; });
  return { d: w.smooth ? smoothPath(Q) : `M${Q.map((p) => p.map(f1).join(' ')).join(' L')}`, dense: catmullDense(Q, 8) };
}
const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
// 점마다 진행 방향(앞뒤 점으로)과 호 길이
const frames = (D) => D.map((p, i) => { const t = unit(D[Math.max(0, i - 2)], D[Math.min(D.length - 1, i + 2)]); return { p, t, n: [-t[1], t[0]] }; });
const arcLen = (D) => { const c = [0]; for (let i = 1; i < D.length; i++) c.push(c[i - 1] + Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1])); return c; };
const polyD = (pts, close) => `M${pts.map((p) => p.map(f1).join(' ')).join(' L')}${close ? ' Z' : ''}`;
// 호 길이 s 에서의 중심선 위치·접선·법선(점 사이를 보간해 계단이 생기지 않게 한다)
const atArc = (F, cum, s) => {
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const u = Math.min(1, Math.max(0, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
  const a = F[i - 1]; const b = F[i];
  const t = unit([0, 0], [a.t[0] + (b.t[0] - a.t[0]) * u, a.t[1] + (b.t[1] - a.t[1]) * u]);
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u], t, n: [-t[1], t[0]] };
};
const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
// 화살촉(채운 삼각형 또는 열린 V)
const headShape = (p, dir, size, color, filled) => {
  const n = [-dir[1], dir[0]]; const tip = [p[0] + dir[0] * size * 0.9, p[1] + dir[1] * size * 0.9];
  const l = [p[0] - dir[0] * size * 0.25 + n[0] * size * 0.7, p[1] - dir[1] * size * 0.25 + n[1] * size * 0.7]; const r = [p[0] - dir[0] * size * 0.25 - n[0] * size * 0.7, p[1] - dir[1] * size * 0.25 - n[1] * size * 0.7];
  return filled ? `<path d="${polyD([l, tip, r], true)}" fill="${color}" stroke="none"/>` : `<path d="${polyD([l, tip, r], false)}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
};

// 중심선 점 사이를 선형으로 채워 간격이 step(px) 이하가 되게 한다(끝 마무리가 각져 보이지 않게)
const densify = (D, step) => {
  const out = [D[0]];
  for (let i = 1; i < D.length; i++) {
    const a = D[i - 1]; const b = D[i]; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
};
// 선 표현별 그리기. 반환: SVG 조각(문자열)과 defs 조각
function drawWindForm(w, geo, pres, dashAttr) {
  const D = densify(geo.dense, 2.5); const F = frames(D); const cum = arcLen(D); const total = cum[cum.length - 1] || 1;
  const headEnd = w.head === 'end' || w.head === 'both'; const headStart = w.head === 'start' || w.head === 'both';
  const color = w.color; const out = []; let defs = '';
  const W = w.width * 5.6;
  const heads = (size, filled = true) => {
    if (headEnd) out.push(headShape(F[F.length - 1].p, F[F.length - 1].t, size, color, filled));
    if (headStart) out.push(headShape(F[0].p, [-F[0].t[0], -F[0].t[1]], size, color, filled));
  };
  if (w.form === 'ribbon' || w.form === 'soft') {
    // 폭: 양 끝도 일정 폭(0.42)은 남기고 가운데가 가장 넓다(불꽃처럼 뾰족해지지 않게). 화살촉이 있는 쪽은 끝까지 같은 폭으로 이어 간다
    const soft = w.form === 'soft';
    const floor = soft ? 0.3 : 0.42;
    const prof = (t, k = 1) => { const mid = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.65); const base = floor + (1 - floor) * mid; return (headEnd && t > 0.5) || (headStart && t < 0.5) ? Math.max(base, 0.9) * k : base * k; };
    const capOf = (ds, r) => (r <= 0 || ds >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - ds) / r) ** 2)));
    const poly = (k) => { const L = []; const Rr = []; F.forEach((fr, i) => { const t = cum[i] / total;
      const rS = headStart ? 0 : (W / 2) * prof(0, k); const rE = headEnd ? 0 : (W / 2) * prof(1, k); // 화살촉이 없는 끝은 반원으로 마무리
      const hw = (W / 2) * prof(t, k) * capOf(cum[i], rS) * capOf(total - cum[i], rE); L.push([fr.p[0] + fr.n[0] * hw, fr.p[1] + fr.n[1] * hw]); Rr.push([fr.p[0] - fr.n[0] * hw, fr.p[1] - fr.n[1] * hw]); }); return polyD([...L, ...Rr.reverse()], true); };
    const a0 = D[0]; const z0 = D[D.length - 1];
    const endA = soft ? 0 : 0.5; // 끝 투명도: 리본은 반쯤 흐리게, 번짐은 완전히 투명하게
    defs += `<linearGradient id="sg_${esc(w.id)}" gradientUnits="userSpaceOnUse" x1="${f1(a0[0])}" y1="${f1(a0[1])}" x2="${f1(z0[0])}" y2="${f1(z0[1])}">`
      + `<stop offset="0" stop-color="${color}" stop-opacity="${headStart ? 0.9 : endA}"/><stop offset="0.35" stop-color="${color}" stop-opacity="0.9"/><stop offset="0.65" stop-color="${color}" stop-opacity="0.9"/>`
      + `<stop offset="1" stop-color="${color}" stop-opacity="${headEnd ? 0.9 : endA}"/></linearGradient>`;
    out.push(`<path d="${poly(1.55)}" fill="url(#sg_${esc(w.id)})" fill-opacity="0.28" stroke="none"/>`); // 가장자리 번짐
    out.push(`<path d="${poly(1)}" fill="url(#sg_${esc(w.id)})" stroke="none"/>`);
    heads(W * 0.8 + 8);
  } else if (w.form === 'double') {
    const off = w.width * 0.95 + 1; const mk = (sgn) => polyD(F.map((fr) => [fr.p[0] + fr.n[0] * off * sgn, fr.p[1] + fr.n[1] * off * sgn]));
    [1, -1].forEach((sg) => out.push(`<path d="${mk(sg)}" fill="none" stroke="${color}" stroke-width="${Math.max(1.4, w.width * 0.45)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`));
    heads(w.width * 2.4 + 8);
  } else if (w.form === 'chevron') {
    const step = Math.max(13, w.width * 5); const size = w.width * 1.5 + 4; const sw = Math.max(1.6, w.width * 0.55);
    // 처음과 끝(화살촉 앞)에 맞춰 간격을 고르게 나눈다
    const s0 = headStart ? size * 1.6 : step * 0.5; const s1 = total - (headEnd ? size * 1.5 : step * 0.5);
    const count = Math.max(1, Math.round((s1 - s0) / step)); const st = count > 0 ? (s1 - s0) / count : step;
    for (let k = 0; k <= count; k++) {
      const fr = atArc(F, cum, Math.min(total, s0 + k * st)); const back = [fr.p[0] - fr.t[0] * size, fr.p[1] - fr.t[1] * size];
      out.push(`<path d="M${f1(back[0] + fr.n[0] * size * 0.85)} ${f1(back[1] + fr.n[1] * size * 0.85)} L${f1(fr.p[0])} ${f1(fr.p[1])} L${f1(back[0] - fr.n[0] * size * 0.85)} ${f1(back[1] - fr.n[1] * size * 0.85)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    heads(w.width * 2.4 + 8);
  } else if (w.form === 'zigzag') {
    const amp = w.width * 0.9 + 1.5; const lam = w.width * 5 + 14; const pts = [];
    for (let s = 0; s <= total; s += 2) { const fr = atArc(F, cum, s); const k = Math.sin((2 * Math.PI * s) / lam) * amp; pts.push([fr.p[0] + fr.n[0] * k, fr.p[1] + fr.n[1] * k]); }
    out.push(`<path d="${polyD(pts)}" fill="none" stroke="${color}" stroke-width="${Math.max(1.6, w.width * 0.5)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    heads(w.width * 2.4 + 8);
  }
  return { svg: out.join(''), defs };
}

// opts.interactive: 클릭으로 요소를 고를 수 있게 data-eid 와 넉넉한 클릭 영역을 넣는다(저장할 때는 false). opts.selected: 고른 요소 id
export function renderSketch(raw, opts = {}) {
  const spec = normalizeSketch(raw);
  const { interactive = false, selected = '' } = opts;
  const C = PALETTE[spec.style];
  const pres = spec.style === 'pres';
  const concept = spec.style === 'concept';
  const filledHead = pres || concept;
  const P = sketchView(spec).toScreen;
  const eid = (id) => (interactive ? ` data-eid="${esc(id)}" style="cursor:move"` : '');
  const handles = []; // 선택한 요소의 크기·끝점 조절 점(편집 화면에만 그린다)
  const sq = (id, name, x, y, cur) => handles.push(`<rect data-handle="${name}" data-eid="${esc(id)}" x="${(x - 5.5).toFixed(1)}" y="${(y - 5.5).toFixed(1)}" width="11" height="11" rx="2" fill="#fff" stroke="#F28C28" stroke-width="2" style="cursor:${cur}"/>`);
  const dot = (id, name, x, y, shape) => handles.push(shape === 'small'
    ? `<path data-handle="${name}" data-eid="${esc(id)}" d="M${x.toFixed(1)} ${(y - 6).toFixed(1)} L${(x + 6).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 6).toFixed(1)} L${(x - 6).toFixed(1)} ${y.toFixed(1)} Z" fill="#fff" stroke="#F28C28" stroke-width="2" style="cursor:ns-resize"/>`
    : shape === 'diamond'
    ? `<path data-handle="${name}" data-eid="${esc(id)}" d="M${(x).toFixed(1)} ${(y - 8).toFixed(1)} L${(x + 8).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 8).toFixed(1)} L${(x - 8).toFixed(1)} ${y.toFixed(1)} Z" fill="#F28C28" stroke="#fff" stroke-width="2" style="cursor:grab"/>`
    : `<circle data-handle="${name}" data-eid="${esc(id)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#fff" stroke="#F28C28" stroke-width="2.5" style="cursor:crosshair"/>`);
  const o = []; const sel = [];
  const defs = [`<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.core}" stroke-width="2"/></pattern>`];
  spec.winds.forEach((w) => defs.push(`<marker id="aw_${esc(w.id)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${concept ? 4.8 : pres ? 4 : 5}" markerHeight="${concept ? 4.8 : pres ? 4 : 5}" orient="auto-start-reverse"><path d="${filledHead ? 'M0 0L10 5L0 10Z' : 'M1 1L9 5L1 9'}" fill="${filledHead ? w.color : 'none'}" stroke="${w.color}" stroke-width="${filledHead ? 0 : 1.6}" stroke-linejoin="round"/></marker>`));
  o.push(`<defs>${defs.join('')}</defs>`);
  if (pres) o.push('<rect x="30" y="100" width="780" height="580" rx="14" fill="#fff" stroke="#E7DFD2"/>');
  if (concept) {
    if (spec.title) o.push(`<text x="60" y="86" font-family="${FONT}" font-size="46" font-weight="800" fill="${C.text}">${esc(spec.title)}</text>`);
    if (spec.subtitle) o.push(`<text x="60" y="136" font-family="${FONT}" font-size="29" font-weight="500" fill="${C.sub}">${esc(spec.subtitle)}</text>`);
  } else {
  if (spec.title) o.push(`<text x="40" y="52" font-family="${FONT}" font-size="26" font-weight="800" fill="${C.text}">${esc(spec.title)}</text>`);
  if (spec.subtitle) o.push(`<text x="40" y="82" font-family="${FONT}" font-size="14.5" fill="${C.sub}">${esc(spec.subtitle)}</text>`);
  }
  if (pres && spec.title) o.push('<rect x="0" y="36" width="12" height="22" fill="#1E88C8"/>');

  const R = (b) => { const a = P([b.rect[0], b.rect[1]]); const z = P([b.rect[2], b.rect[3]]); return [a[0], a[1], z[0] - a[0], z[1] - a[1]]; };
  const slabs = spec.blocks.filter((b) => b.kind === 'slab').sort((p, q) => (q.rect[2] - q.rect[0]) * (q.rect[3] - q.rect[1]) - (p.rect[2] - p.rect[0]) * (p.rect[3] - p.rect[1]));
  const cores = spec.blocks.filter((b) => b.kind === 'core');
  const openings = spec.blocks.filter((b) => b.kind === 'opening');
  const dash = (d) => (DASHES[d] ? ` stroke-dasharray="${DASHES[d]}"` : '');
  const cap = (d) => (d === 'dotted' ? 'round' : 'round');
  slabs.forEach((b) => {
    const [x, y, w, h] = R(b);
    if (pres) o.push(`<rect x="${(x + 7).toFixed(1)}" y="${(y + 7).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#000" fill-opacity="0.09"/>`);
    o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${b.fill || C.slab}" stroke="${C.slabLine}" stroke-width="${pres ? 2.6 : concept ? 3.6 : 3}" stroke-linejoin="round"${eid(b.id)}/>`);
  });
  spec.lines.forEach((l) => {
    const Q = l.pts.map(P); const d = `M${Q.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}`; const col = l.color || C.part;
    if (selected === l.id) o.push(`<path d="${d}" fill="none" stroke="#F28C28" stroke-width="${l.width + 9}" stroke-opacity="0.4" stroke-linecap="round"/>`);
    o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${l.width}" stroke-linecap="${cap(l.dash)}" stroke-opacity="${pres && !l.color ? 0.75 : 1}"${dash(l.dash)}/>`);
    if (interactive) o.push(`<path class="hit" data-eid="${esc(l.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="16" style="cursor:move"/>`);
    if (interactive && selected === l.id) { dot(l.id, 'start', Q[0][0], Q[0][1]); dot(l.id, 'end', Q[Q.length - 1][0], Q[Q.length - 1][1]); }
  });
  cores.forEach((b) => {
    const [x, y, w, h] = R(b);
    o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${b.fill || (concept ? C.coreFill : 'url(#hatch)')}" stroke="${C.core}" stroke-width="${concept ? 2.6 : 2.2}" stroke-linejoin="round"${eid(b.id)}/>`);
  });
  // 도형 안에 이름 표시(개념도): 코어는 기본으로, 판은 켰을 때만. 도형이 작으면 글자를 줄인다
  if (concept) {
    [...slabs, ...cores].forEach((b) => {
      if (!b.name || !(b.showName ?? b.kind === 'core')) return;
      const [x, y, w, h] = R(b); const len = [...b.name].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1 : 0.6), 0) || 1;
      const fs = Math.max(10, Math.min(22, (w - 10) / len, h - 8));
      o.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + fs * 0.35).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs.toFixed(1)}" font-weight="${b.kind === 'core' ? 600 : 500}" fill="${b.kind === 'core' ? C.text : '#8A8580'}" pointer-events="none">${esc(b.name)}</text>`);
    });
  }
  openings.forEach((b) => {
    const [x, y, w, h] = R(b);
    if (concept) { // 열린 벽 안쪽(판 중심 쪽)으로 조금 들여서 이어 가는 둥근 점선
      const horiz = w >= h; const mx = b.rect[0] + (b.rect[2] - b.rect[0]) / 2; const my = b.rect[1] + (b.rect[3] - b.rect[1]) / 2;
      const host = slabs.find((s) => mx >= s.rect[0] - 2 && mx <= s.rect[2] + 2 && my >= s.rect[1] - 2 && my <= s.rect[3] + 2);
      let dx = 0; let dy = 0;
      const ins = b.inset ?? 6; if (host && ins > 0) { const cx = (host.rect[0] + host.rect[2]) / 2; const cy = (host.rect[1] + host.rect[3]) / 2; if (horiz) dy = (cy >= my ? 1 : -1) * ins; else dx = (cx >= mx ? 1 : -1) * ins; }
      const x0 = horiz ? x : x + w / 2; const y0 = horiz ? y + h / 2 : y; const x1 = horiz ? x + w : x + w / 2; const y1 = horiz ? y + h / 2 : y + h;
      o.push(`<line x1="${(x0 + dx).toFixed(1)}" y1="${(y0 + dy).toFixed(1)}" x2="${(x1 + dx).toFixed(1)}" y2="${(y1 + dy).toFixed(1)}" stroke="${b.stroke || C.accent}" stroke-width="3.8" stroke-linecap="round" stroke-dasharray="${DASHES.dots}"/>`);
      if (interactive) o.push(`<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="${(w + 8).toFixed(1)}" height="${(h + 8).toFixed(1)}" fill="transparent"${eid(b.id)}/>`);
      return;
    }
    o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(Math.min(w, h) / 2).toFixed(1)}" fill="${b.fill || '#ffffff'}" fill-opacity="0.7" stroke="${b.stroke || '#555555'}" stroke-width="1.7" stroke-dasharray="5 4"${eid(b.id)}/>`);
  });
  // 도형의 열린 변(openSides): 변을 따라 안쪽으로 inset 만큼 들여서 점선을 긋는다(0 이면 외곽선과 정확히 겹친다)
  [...slabs, ...cores].forEach((b) => {
    if (!b.openSides.length) return;
    const [x, y, w, h] = R(b); const ins = b.inset ?? 6; const col = b.stroke || (concept ? C.accent : '#555555');
    b.openSides.forEach((side) => {
      const seg = { top: [x, y + ins, x + w, y + ins], bottom: [x, y + h - ins, x + w, y + h - ins], left: [x + ins, y, x + ins, y + h], right: [x + w - ins, y, x + w - ins, y + h] }[side];
      o.push(`<line x1="${seg[0].toFixed(1)}" y1="${seg[1].toFixed(1)}" x2="${seg[2].toFixed(1)}" y2="${seg[3].toFixed(1)}" stroke="${col}" stroke-width="${concept ? 3.8 : 2}" stroke-linecap="round" stroke-dasharray="${concept ? DASHES.dots : '5 4'}" pointer-events="none"/>`);
    });
  });
  spec.blocks.forEach((b) => {
    if (selected !== b.id) return;
    const [x, y, w, h] = R(b);
    sel.push(`<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="${(w + 10).toFixed(1)}" height="${(h + 10).toFixed(1)}" fill="none" stroke="#F28C28" stroke-width="2.5" stroke-dasharray="7 4" rx="3"/>`);
    if (interactive) {
      const mx = x + w / 2; const my = y + h / 2;
      [['nw', x, y, 'nwse-resize'], ['n', mx, y, 'ns-resize'], ['ne', x + w, y, 'nesw-resize'], ['e', x + w, my, 'ew-resize'], ['se', x + w, y + h, 'nwse-resize'], ['s', mx, y + h, 'ns-resize'], ['sw', x, y + h, 'nesw-resize'], ['w', x, my, 'ew-resize']].forEach(([nm, hx, hy, cur]) => sq(b.id, nm, hx, hy, cur));
    }
  });
  // 바람(흐름): 선 표현(form)에 따라 선 / 리본 / 번짐 / 이중선 / 화살표 반복 / 물결 장식. 유입/유출 문구는 시작/끝 바깥에 둔다
  const extraDefs = [];
  spec.winds.forEach((w) => {
    const geo = windGeom(w, P); const d = geo.d; const D = geo.dense;
    const ribbonLike = w.form === 'ribbon' || w.form === 'soft'; const thick = ribbonLike ? w.width * 5.6 : w.width;
    if (selected === w.id) o.push(`<path d="${d}" fill="none" stroke="#F28C28" stroke-width="${(thick + 14).toFixed(1)}" stroke-opacity="0.38" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (w.form === 'line') {
      if (pres) o.push(`<path d="${d}" fill="none" stroke="${w.color}" stroke-opacity="0.22" stroke-width="${(w.width * 4.6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      const mk = (w.head === 'end' || w.head === 'both' ? ` marker-end="url(#aw_${esc(w.id)})"` : '') + (w.head === 'start' || w.head === 'both' ? ` marker-start="url(#aw_${esc(w.id)})"` : '');
      o.push(`<path d="${d}" fill="none" stroke="${w.color}" stroke-width="${w.width}" stroke-linecap="round" stroke-linejoin="round"${dash(w.dash)}${mk}/>`);
    } else {
      const r = drawWindForm(w, geo, pres, dash(w.dash)); o.push(r.svg); if (r.defs) extraDefs.push(r.defs);
    }
    if (interactive) o.push(`<path class="hit" data-eid="${esc(w.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(18, thick + 10)}" style="cursor:move"/>`);
    if (interactive && selected === w.id) {
      dot(w.id, 'start', D[0][0], D[0][1]); dot(w.id, 'end', D[D.length - 1][0], D[D.length - 1][1]);
      if (w.shape === 's' || w.shape === 'arc') { const mi = w.shape === 'arc' ? Math.round((D.length - 1) / 2) : Math.round((D.length - 1) / 4); dot(w.id, 'amp', D[mi][0], D[mi][1], w.shape === 's' ? 'small' : 'diamond'); }
      if (w.shape === 's' && geo.via) dot(w.id, 'via', geo.via[0], geo.via[1], 'diamond');
    }
    const s0 = D[0]; const e0 = D[D.length - 1];
    const pill = (pt, text, below) => {
      if (!text) return;
      const wd = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 12 : 7), 0) + 16; const y = pt[1] + (below ? 24 + thick / 2 : -20 - thick / 2);
      o.push(`<rect x="${(pt[0] - wd / 2).toFixed(1)}" y="${(y - 15).toFixed(1)}" width="${wd}" height="20" rx="10" fill="${pres ? w.color : '#fff'}" stroke="${w.color}" stroke-width="1.4"/><text x="${pt[0].toFixed(1)}" y="${(y - 1).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="700" fill="${pres ? '#fff' : w.color}">${esc(text)}</text>`);
    };
    pill(s0, w.inLabel, !(s0[1] < e0[1])); pill(e0, w.outLabel, s0[1] < e0[1]);
  });
  if (extraDefs.length) o[0] = o[0].replace('</defs>', `${extraDefs.join('')}</defs>`);
  // 메모(자유 글자)
  spec.memos.forEach((m) => {
    const [x, y] = P([m.x, m.y]);
    o.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${m.size}" font-weight="${concept ? 600 : 700}" fill="${m.color}" paint-order="stroke" stroke="${concept ? C.bg : '#fff'}" stroke-width="4" stroke-linejoin="round"${eid(m.id)}>${esc(m.text)}</text>`);
    if (selected === m.id) { const wd = [...m.text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? m.size : m.size * 0.58), 0) + 12; sel.push(`<rect x="${(x - wd / 2).toFixed(1)}" y="${(y - m.size - 2).toFixed(1)}" width="${wd.toFixed(1)}" height="${(m.size + 12).toFixed(1)}" fill="none" stroke="#F28C28" stroke-width="2" stroke-dasharray="6 4" rx="3"/>`); }
  });
  o.push(...sel);
  o.push(...handles);
  // 번호 표식(도형 위) + 우측 설명 칼럼 → 이름표가 도형을 가리지 않는다(도면용). 개념도는 도형 안에 이름을 쓰므로 칼럼이 없다
  let ry = 170; let n = 0;
  if (concept) {
    if (spec.showLegend) {
      let lx = 60; const ly = H - 62; const put = (icon, text) => { o.push(icon); o.push(`<text x="${lx + 46}" y="${ly + 5}" font-family="${FONT}" font-size="16" fill="${C.text}">${esc(text)}</text>`); lx += 70 + [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 16 : 9), 0); };
      if (spec.winds.length) put(`<line x1="${lx}" y1="${ly}" x2="${lx + 38}" y2="${ly}" stroke="${spec.winds[0].color}" stroke-width="3.4" stroke-linecap="round"/><path d="M${lx + 38} ${ly - 6} L${lx + 48} ${ly} L${lx + 38} ${ly + 6} Z" fill="${spec.winds[0].color}"/>`, spec.legend.wind);
      if (openings.length) put(`<line x1="${lx}" y1="${ly}" x2="${lx + 40}" y2="${ly}" stroke="${C.accent}" stroke-width="3.8" stroke-linecap="round" stroke-dasharray="${DASHES.dots}"/>`, spec.legend.opening);
      if (cores.length) put(`<rect x="${lx}" y="${ly - 9}" width="38" height="18" fill="${C.coreFill}" stroke="${C.core}" stroke-width="2"/>`, spec.legend.core);
    }
    if (spec.showNotes) spec.notes.forEach((t, i) => o.push(`<text x="60" y="${H - 22 - (spec.notes.length - 1 - i) * 24}" font-family="${FONT}" font-size="16" fill="${C.text}">${esc(t)}</text>`));
  }
  if (!concept) [...slabs, ...cores].forEach((b) => {
    if (!b.name) return;
    n += 1; const dark = b.kind === 'core'; const [x, y, w, h] = R(b);
    const [mx, my] = dark ? [x + w / 2, y + h / 2] : [x + 20, y + 20];
    const mark = (cx, cy) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="${dark ? '#fff' : C.text}" stroke="${dark ? C.core : '#fff'}" stroke-width="2"/><text x="${cx.toFixed(1)}" y="${(cy + 4.5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="800" fill="${dark ? C.core : '#fff'}">${n}</text>`;
    o.push(mark(mx, my)); o.push(mark(860, ry));
    o.push(`<text x="884" y="${ry + 1}" font-family="${FONT}" font-size="15" font-weight="800" fill="${C.text}">${esc(b.name)}</text>`);
    if (b.desc) o.push(`<text x="884" y="${ry + 21}" font-family="${FONT}" font-size="12.5" fill="${C.sub}">${esc(b.desc)}</text>`);
    ry += 58;
  });
  if (!concept) { ry += 8; o.push(`<line x1="850" y1="${ry - 14}" x2="1160" y2="${ry - 14}" stroke="${pres ? '#E2D9CB' : '#cccccc'}"/>`); }
  if (!concept && spec.winds.length) {
    const tally = {}; spec.winds.forEach((w) => { const k = `${w.color}|${w.dash}|${w.form}`; tally[k] = (tally[k] || 0) + 1; });
    const [bestColor, bestDash, bestForm] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0].split('|');
    const w0 = { color: bestColor, dash: bestDash, form: bestForm };
    const icon = w0.form === 'ribbon' || w0.form === 'soft' ? `<path d="M852 ${ry + 8} q 9 -9 18 0 t 18 0 q -9 5 -18 0 t -18 0 Z" fill="${w0.color}" fill-opacity="0.85"/>`
      : w0.form === 'double' ? `<path d="M852 ${ry + 5} q 9 -9 18 0 t 18 0 M852 ${ry + 11} q 9 -9 18 0 t 18 0" fill="none" stroke="${w0.color}" stroke-width="1.8"/>`
        : w0.form === 'chevron' ? `<path d="M856 ${ry + 3} l 5 5 l -5 5 M866 ${ry + 3} l 5 5 l -5 5 M876 ${ry + 3} l 5 5 l -5 5" fill="none" stroke="${w0.color}" stroke-width="2" stroke-linecap="round"/>`
          : w0.form === 'zigzag' ? `<path d="M852 ${ry + 8} l 4 -5 l 6 10 l 6 -10 l 6 10 l 6 -10 l 4 5" fill="none" stroke="${w0.color}" stroke-width="2" stroke-linejoin="round"/>`
            : `<path d="M852 ${ry + 8} q 9 -11 18 0 t 18 0" fill="none" stroke="${w0.color}" stroke-width="3.2"${dash(w0.dash)}/>`;
    o.push(`${icon}<text x="896" y="${ry + 12}" font-family="${FONT}" font-size="13" fill="${C.text}">${esc(spec.legend.wind)}</text>`);
    ry += 26;
  }
  if (!concept && openings.length) { o.push(`<rect x="852" y="${ry + 2}" width="36" height="14" rx="7" fill="#fff" stroke="#555" stroke-width="1.6" stroke-dasharray="5 4"/><text x="896" y="${ry + 14}" font-family="${FONT}" font-size="13" fill="${C.text}">${esc(spec.legend.opening)}</text>`); ry += 24; }
  if (!concept && cores.length) o.push(`<rect x="852" y="${ry + 2}" width="36" height="14" fill="url(#hatch)" stroke="${C.core}"/><text x="896" y="${ry + 14}" font-family="${FONT}" font-size="13" fill="${C.text}">${esc(spec.legend.core)}</text>`);
  if (!concept) spec.notes.forEach((t, i) => o.push(`<text x="40" y="${H - 46 + i * 22}" font-family="${FONT}" font-size="14" fill="${C.text}"${i === 0 ? ' font-weight="700"' : ''}>${pres ? '▪ ' : '- '}${esc(t)}</text>`));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"${interactive ? ' data-bg="1"' : ''}/>${o.join('')}</svg>`;
  return { svg, width: W, height: H };
}

// ── 5) 편집 도우미(모두 새 spec 을 돌려준다) ──────────────────
export const LISTS = ['blocks', 'lines', 'winds', 'memos'];
export function sketchFind(spec, id) {
  for (const list of LISTS) { const i = (spec[list] || []).findIndex((e) => e.id === id); if (i >= 0) return { list, index: i, el: spec[list][i] }; }
  return null;
}
export const sketchKind = (spec, id) => { const f = sketchFind(spec, id); return f ? { blocks: 'block', lines: 'line', winds: 'wind', memos: 'memo' }[f.list] : ''; };
export function sketchUpdate(spec, id, patch) {
  const f = sketchFind(spec, id); if (!f) return spec;
  return { ...spec, [f.list]: spec[f.list].map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}
export function sketchDelete(spec, id) {
  const f = sketchFind(spec, id); if (!f) return spec;
  return { ...spec, [f.list]: spec[f.list].filter((e) => e.id !== id) };
}
export function sketchFlip(spec, id) {
  const f = sketchFind(spec, id); if (!f || !f.el.pts) return spec;
  return sketchUpdate(spec, id, { pts: [...f.el.pts].reverse(), ...(f.list === 'winds' ? { inLabel: f.el.outLabel, outLabel: f.el.inLabel } : {}) });
}
// 선·바람의 시작점/끝점을 옮기면 중간 점도 같은 비율로 따라온다(휘어진 모양은 유지)
export function sketchSetEnds(spec, id, a, z) {
  const f = sketchFind(spec, id); if (!f || !f.el.pts) return spec;
  const pts = f.el.pts; const a0 = pts[0]; const z0 = pts[pts.length - 1];
  const dx0 = z0[0] - a0[0]; const dy0 = z0[1] - a0[1]; const len0 = Math.hypot(dx0, dy0);
  const dx1 = z[0] - a[0]; const dy1 = z[1] - a[1]; const len1 = Math.hypot(dx1, dy1) || 0.01;
  let next; let via = f.el.via || null;
  if (len0 < 0.01) { next = pts.map((p, i) => (i === 0 ? a : i === pts.length - 1 ? z : [a[0] + (z[0] - a[0]) * (i / (pts.length - 1)), a[1] + (z[1] - a[1]) * (i / (pts.length - 1))])); via = null; }
  else {
    const s = len1 / len0; const ang = Math.atan2(dy1, dx1) - Math.atan2(dy0, dx0); const c = Math.cos(ang); const sn = Math.sin(ang);
    const tf = (p) => { const rx = p[0] - a0[0]; const ry = p[1] - a0[1]; return [a[0] + s * (rx * c - ry * sn), a[1] + s * (rx * sn + ry * c)]; };
    next = pts.map(tf); if (via) via = tf(via);
    next[0] = a; next[next.length - 1] = z;
  }
  return sketchUpdate(spec, id, { pts: next, via });
}
export function sketchAdd(spec, kind) {
  const [x0, y0, x1, y1] = spec.frame; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const w = x1 - x0; const h = y1 - y0;
  const nextId = (pre, list) => { let n = 1; while ((spec[list] || []).some((e) => e.id === `${pre}${n}`)) n += 1; return `${pre}${n}`; };
  if (kind === 'wind') { const id = nextId('w', 'winds'); const pts = Array.from({ length: 5 }, (_, i) => [cx - w * 0.2 + (w * 0.4 * i) / 4, cy - h * 0.12 + Math.sin((i / 4) * Math.PI * 2) * h * 0.03]); return { spec: { ...spec, winds: [...spec.winds, { id, pts, smooth: true, head: 'end', dash: 'solid', width: 4.5, color: '#1E88C8', form: 'ribbon', shape: 's', bend: 0.65, amp: 0.45, inLabel: '', outLabel: '' }] }, id }; }
  if (kind === 'line') { const id = nextId('p', 'lines'); return { spec: { ...spec, lines: [...spec.lines, { id, pts: [[cx - w * 0.15, cy + h * 0.15], [cx + w * 0.15, cy + h * 0.15]], dash: 'solid', width: 2, color: '' }] }, id }; }
  if (kind === 'memo') { const id = nextId('m', 'memos'); return { spec: { ...spec, memos: [...spec.memos, { id, x: cx, y: cy + h * 0.3, text: '메모', size: 14, color: '#222222' }] }, id }; }
  const id = nextId('b', 'blocks');
  const rect = kind === 'opening' ? [cx - w * 0.09, cy - h * 0.016, cx + w * 0.09, cy + h * 0.016] : [cx - w * 0.08, cy - h * 0.08, cx + w * 0.08, cy + h * 0.08];
  return { spec: { ...spec, blocks: [...spec.blocks, { id, kind: ['core', 'opening'].includes(kind) ? kind : 'slab', rect, name: '', desc: '', fill: '' }] }, id };
}

// ── 끌어서 편집: 이동·크기 조절·끝점·휘는 정도·자석 맞춤 ──
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function sketchMoveBy(spec, id, dx, dy) {
  const f = sketchFind(spec, id); if (!f) return spec; const e = f.el;
  if (f.list === 'blocks') return sketchUpdate(spec, id, { rect: [e.rect[0] + dx, e.rect[1] + dy, e.rect[2] + dx, e.rect[3] + dy] });
  if (f.list === 'memos') return sketchUpdate(spec, id, { x: e.x + dx, y: e.y + dy });
  return sketchUpdate(spec, id, { pts: e.pts.map((p) => [p[0] + dx, p[1] + dy]), ...(e.via ? { via: [e.via[0] + dx, e.via[1] + dy] } : {}) });
}
export function sketchResizeRect(spec, id, handle, x, y) {
  const f = sketchFind(spec, id); if (!f || f.list !== 'blocks') return spec;
  const r = [...f.el.rect]; const MIN = 0.8;
  if (handle.includes('w')) r[0] = Math.min(x, r[2] - MIN); if (handle.includes('e')) r[2] = Math.max(x, r[0] + MIN);
  if (handle.includes('n')) r[1] = Math.min(y, r[3] - MIN); if (handle.includes('s')) r[3] = Math.max(y, r[1] + MIN);
  return sketchUpdate(spec, id, { rect: r });
}
export function sketchSetEnd(spec, id, which, pt) {
  const f = sketchFind(spec, id); if (!f || !f.el.pts) return spec;
  const a = f.el.pts[0]; const z = f.el.pts[f.el.pts.length - 1];
  return sketchSetEnds(spec, id, which === 'start' ? pt : a, which === 'end' ? pt : z);
}
// 휘는 정도 조절점을 끌면 그 점이 놓인 위치에 맞춰 amp 를 다시 계산한다(S자는 4분의 1 지점, 호는 가운데)
export function sketchSetAmp(spec, id, pt) {
  const f = sketchFind(spec, id); if (!f || f.list !== 'winds' || !['s', 'arc'].includes(f.el.shape)) return spec;
  const a = f.el.pts[0]; const z = f.el.pts[f.el.pts.length - 1]; const L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1;
  const nx = -(z[1] - a[1]) / L; const ny = (z[0] - a[0]) / L;
  const dist = (p) => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny; // 중심선(시작→끝)에서 수직으로 떨어진 거리(부호 있음)
  const D = windGeom(f.el, (p) => p).dense; const hp = D[f.el.shape === 'arc' ? Math.round((D.length - 1) / 2) : Math.round((D.length - 1) / 4)];
  const dOld = dist(hp); const dNew = dist(pt);
  const per = f.el.shape === 'arc' ? 0.25 : 0.0984; // 변곡점이 기본 위치일 때 amp 와 거리의 관계
  const amp = Math.abs(dOld) > 0.3 ? f.el.amp * (dNew / dOld) : dNew / (L * per);
  return sketchUpdate(spec, id, { amp: clampN(Math.round(amp * 100) / 100, -1.2, 1.2) });
}
// S자의 변곡점(꺾이는 가운데 지점)을 끌어 놓은 곳으로 옮긴다. 곡선은 그 점을 지난다. via=null 이면 기본(가운데)으로 되돌린다
export function sketchSetVia(spec, id, pt) {
  const f = sketchFind(spec, id); if (!f || f.list !== 'winds' || f.el.shape !== 's') return spec;
  return sketchUpdate(spec, id, { via: pt ? [Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10] : null });
}
// 복사·붙여넣기·복제: 요소를 통째로 복사해 두었다가(snapshot) 새 id 로 붙인다. 붙인 요소는 dx,dy 만큼 비껴 놓아 겹쳐 보이지 않게 한다
export function sketchSnapshot(spec, id) {
  const f = sketchFind(spec, id); if (!f) return null;
  return { list: f.list, el: JSON.parse(JSON.stringify(f.el)) };
}
export function sketchPaste(spec, snap, dx = 3, dy = 3) {
  if (!snap || !LISTS.includes(snap.list)) return { spec, id: '' };
  const pre = { blocks: 'b', lines: 'p', winds: 'w', memos: 'm' }[snap.list]; let n = 1;
  while ((spec[snap.list] || []).some((e) => e.id === `${pre}${n}`)) n += 1;
  const id = `${pre}${n}`; const el = { ...JSON.parse(JSON.stringify(snap.el)), id };
  return { spec: sketchMoveBy({ ...spec, [snap.list]: [...(spec[snap.list] || []), el] }, id, dx, dy), id };
}

// 선택한 개구부(열린 벽 표시)를 가까운 벽(외곽선)에 붙인다
export function sketchSnapToWall(spec, id, tol = 10) {
  const f = sketchFind(spec, id); if (!f || f.list !== 'blocks' || f.el.kind !== 'opening') return spec;
  const solids = spec.blocks.filter((b) => b.kind !== 'opening').map((b) => ({ rect: b.rect, penalty: b.kind === 'core' ? 1.5 : 0 }));
  return sketchUpdate(spec, id, { rect: snapSegToWall(f.el.rect, solids, tol) });
}

// 다른 도형의 모서리 좌표에 가까우면 달라붙는다(tol 은 다이어그램 좌표 단위)
function snapAxis(v, cands, tol) { let best = null; cands.forEach((c) => { const d = Math.abs(c - v); if (d <= tol && (best === null || d < best.d)) best = { d, c }; }); return best ? best.c : v; }
const edgesOf = (spec, skip) => { const xs = []; const ys = []; spec.blocks.forEach((b) => { if (b.id === skip) return; xs.push(b.rect[0], b.rect[2]); ys.push(b.rect[1], b.rect[3]); }); return { xs, ys }; };
export function sketchSnapPoint(spec, id, pt, tol = 1.4) { const e = edgesOf(spec, id); return [snapAxis(pt[0], e.xs, tol), snapAxis(pt[1], e.ys, tol)]; }
export function sketchSnapMove(spec, id, dx, dy, tol = 1.4) {
  const f = sketchFind(spec, id); if (!f || f.list !== 'blocks') return [dx, dy];
  const e = edgesOf(spec, id); const r = f.el.rect;
  const adj = (vals, cands) => { let best = null; vals.forEach((v) => cands.forEach((c) => { const d = c - v; if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d; })); return best; };
  const ax = adj([r[0] + dx, r[2] + dx], e.xs); const ay = adj([r[1] + dy, r[3] + dy], e.ys);
  return [ax === null ? dx : dx + ax, ay === null ? dy : dy + ay];
}

export function getSketchTextFields(spec) {
  const out = [];
  if (!spec) return out;
  out.push({ path: ['title'], label: '제목', value: spec.title || '' });
  out.push({ path: ['subtitle'], label: '부제', value: spec.subtitle || '' });
  (spec.blocks || []).forEach((b, i) => { out.push({ path: ['blocks', i, 'name'], label: `${{ core: '코어', opening: '개구부' }[b.kind] || '판'} ${i + 1} 이름`, value: b.name || '' }); out.push({ path: ['blocks', i, 'desc'], label: `${{ core: '코어', opening: '개구부' }[b.kind] || '판'} ${i + 1} 설명`, value: b.desc || '' }); });
  (spec.notes || []).forEach((n, i) => out.push({ path: ['notes', i], label: `핵심 메시지 ${i + 1}`, value: n }));
  return out;
}
