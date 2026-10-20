// 출력 크기(용지)·칸 나누기·글자 위계 (2026-10-19)
// 어떤 렌더러가 만든 SVG 든 정해진 가로·세로(mm)의 페이지 안에, 칸으로 나눠 넣고, 제목·소제목(칸 제목)을 pt 로 그리고, 글씨체를 바꾼다.
// 렌더러 안의 글자(블록 이름·범례·칩)는 렌더러가 정한 크기라서 바꾸지 않고, 칸에 맞춘 뒤의 '실제 pt' 를 계산해 추천값과 견주어 알려 준다.
export const ENGINE_FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"; // 모든 렌더러가 쓰는 글꼴 값(바꿔 끼울 때 이 문자열을 찾는다)
export const PT_MM = 25.4 / 72;                                                                 // 1pt = 0.3528mm
export const MM_PX = 96 / 25.4;                                                                 // 96dpi 화면 픽셀

export const PAGE_PRESETS = [
  { id: 'a3l', label: 'A3 가로 (420×297mm)', w: 420, h: 297, medium: 'print' },
  { id: 'a3p', label: 'A3 세로 (297×420mm)', w: 297, h: 420, medium: 'print' },
  { id: 'a4l', label: 'A4 가로 (297×210mm)', w: 297, h: 210, medium: 'print' },
  { id: 'a4p', label: 'A4 세로 (210×297mm)', w: 210, h: 297, medium: 'print' },
  { id: 'a2l', label: 'A2 가로 (594×420mm)', w: 594, h: 420, medium: 'print' },
  { id: 'a2p', label: 'A2 세로 (420×594mm)', w: 420, h: 594, medium: 'print' },
  { id: 'a1l', label: 'A1 가로 (841×594mm)', w: 841, h: 594, medium: 'print' },
  { id: 'a1p', label: 'A1 세로 (594×841mm)', w: 594, h: 841, medium: 'print' },
  { id: 'ppt', label: 'PPT 16:9 (13.33×7.5in)', w: 338.67, h: 190.5, medium: 'screen' },
  { id: 'ppt43', label: 'PPT 4:3 (10×7.5in)', w: 254, h: 190.5, medium: 'screen' },
  { id: 'custom', label: '직접 입력 (mm)', w: 420, h: 297, medium: 'print' },
];

// 페이지 칸 나누기: 칸 하나 = [왼쪽, 위, 오른쪽, 아래] 를 페이지 안쪽 영역(여백을 뺀 곳)의 0~1 비율로 적는다. 칸 번호는 위→아래, 왼쪽→오른쪽 순서.
const GRID = (cols, rows) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c / cols, r / rows, (c + 1) / cols, (r + 1) / rows]); return out; };
const BAND = (n, bigH) => [[0, 0, 1, bigH], ...Array.from({ length: n }, (_, i) => [i / n, bigH, (i + 1) / n, 1])]; // 위 큰 칸 1 + 아래 가로 띠 n칸
export const PAGE_LAYOUTS = [
  { id: '1x1', label: '1칸 (한 장 전체)', cells: GRID(1, 1) },
  { id: '2x1', label: '좌우 2칸', cells: GRID(2, 1) },
  { id: '1x2', label: '위아래 2칸', cells: GRID(1, 2) },
  { id: '3x1', label: '가로 3칸', cells: GRID(3, 1) },
  { id: '1x3', label: '세로 3칸', cells: GRID(1, 3) },
  { id: '2x2', label: '2×2 (4칸)', cells: GRID(2, 2) },
  { id: '3x2', label: '3×2 (6칸)', cells: GRID(3, 2) },
  { id: '2x3', label: '2×3 (6칸)', cells: GRID(2, 3) },
  { id: 'L2', label: '왼쪽 큰 칸 + 오른쪽 2칸', cells: [[0, 0, 0.62, 1], [0.62, 0, 1, 0.5], [0.62, 0.5, 1, 1]] },
  { id: 'R2', label: '왼쪽 2칸 + 오른쪽 큰 칸', cells: [[0, 0, 0.38, 0.5], [0, 0.5, 0.38, 1], [0.38, 0, 1, 1]] },
  { id: 'T2', label: '위 큰 칸 + 아래 2칸', cells: [[0, 0, 1, 0.62], [0, 0.62, 0.5, 1], [0.5, 0.62, 1, 1]] },
  { id: 'B2', label: '위 2칸 + 아래 큰 칸', cells: [[0, 0, 0.5, 0.38], [0.5, 0, 1, 0.38], [0, 0.38, 1, 1]] },
  { id: 'L3', label: '왼쪽 큰 칸 + 오른쪽 3칸', cells: [[0, 0, 0.55, 1], [0.55, 0, 1, 1 / 3], [0.55, 1 / 3, 1, 2 / 3], [0.55, 2 / 3, 1, 1]] },
  // 사내 보드(참고 자료)에 많은 틀: 큰 그림 하나 + 아래 가로 띠 소도식 3·4·5칸 / 왼쪽에 세로로 쌓은 이슈 4칸 + 오른쪽 큰 분석 그림
  { id: 'T3', label: '위 큰 칸 + 아래 띠 3칸', cells: BAND(3, 0.62) },
  { id: 'T4', label: '위 큰 칸 + 아래 띠 4칸', cells: BAND(4, 0.66) },
  { id: 'T5', label: '위 큰 칸 + 아래 띠 5칸', cells: BAND(5, 0.7) },
  { id: '3x3', label: '3×3 (9칸)', cells: GRID(3, 3) },
  { id: 'W4', label: '위 4칸 + 아래 와이드 칸', cells: [...[0, 1, 2, 3].map((i) => [i / 4, 0, (i + 1) / 4, 0.34]), [0, 0.34, 1, 1]] },
  { id: 'L4', label: '왼쪽 세로 4칸 + 오른쪽 큰 칸', cells: [...[0, 1, 2, 3].map((i) => [0, i / 4, 0.2, (i + 1) / 4]), [0.2, 0, 1, 1]] },
];
// 'g4x3' 같은 이름은 가로 4 × 세로 3 균등 격자(직접 지정, 최대 6×6)
export function layoutById(id) {
  const g = /^g([1-6])x([1-6])$/.exec(String(id));
  if (g) return { id, label: `${g[1]}×${g[2]} 격자`, cells: GRID(Number(g[1]), Number(g[2])) };
  return PAGE_LAYOUTS.find((l) => l.id === id) || PAGE_LAYOUTS[0];
}

// ── 직접 조정한 배치('custom'): 칸마다 번호(id)와 비율 상자 r=[왼쪽, 위, 오른쪽, 아래](0~1)를 갖는다. 프리셋을 끌어 바꾸면 그 모양을 복사해 custom 이 된다.
export const MAX_CELLS = 12;
export function presetToCustom(layoutId) { return layoutById(layoutId).cells.map((r, i) => ({ id: `c${i + 1}`, r: [...r] })); }
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0));
// 저장된 custom 을 믿을 수 있는 값으로 정리(범위 0~1, 크기 최소, id 중복 제거, 최대 12칸). 쓸 수 없으면 null
export function normalizeCustom(custom) {
  if (!Array.isArray(custom)) return null;
  const seen = new Set(); const out = [];
  custom.slice(0, MAX_CELLS).forEach((c, i) => {
    if (!c || !Array.isArray(c.r) || c.r.length !== 4) return;
    let id = /^c\d+$/.test(String(c.id)) ? String(c.id) : `c${i + 1}`; while (seen.has(id)) id += '_';
    seen.add(id);
    const x0 = clamp01(Math.min(c.r[0], c.r[2])); const x1 = clamp01(Math.max(c.r[0], c.r[2])); const y0 = clamp01(Math.min(c.r[1], c.r[3])); const y1 = clamp01(Math.max(c.r[1], c.r[3]));
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    out.push({ id, r: [x0, y0, x1, y1] });
  });
  return out.length ? out : null;
}
// 칸 목록: custom 이면 사용자가 조정한 배치, 아니면 프리셋. [{ id, r }]
export function getCells(layoutId, custom) {
  if (layoutId === 'custom') { const n = normalizeCustom(custom); if (n) return n; }
  return presetToCustom(layoutId === 'custom' ? '1x1' : layoutId);
}
export const cellIds = (layoutId, custom) => getCells(layoutId, custom).map((c) => c.id);

// 페이지 안쪽 영역(box: x,y,w,h mm) 을 칸으로 나눈다. 칸 사이 간격(gap mm)은 안쪽 변에만 반으로 나눠 준다. raw 는 간격을 빼기 전 칸 상자(mm, 숫자 입력·끌기용).
export function resolveCells(layoutId, box, gap = 0, custom = null) {
  return getCells(layoutId, custom).map(({ id, r: c }) => {
    const x0 = box.x + c[0] * box.w + (c[0] > 0 ? gap / 2 : 0); const y0 = box.y + c[1] * box.h + (c[1] > 0 ? gap / 2 : 0);
    const x1 = box.x + c[2] * box.w - (c[2] < 1 ? gap / 2 : 0); const y1 = box.y + c[3] * box.h - (c[3] < 1 ? gap / 2 : 0);
    return { id, x: x0, y: y0, w: x1 - x0, h: y1 - y0, raw: [box.x + c[0] * box.w, box.y + c[1] * box.h, (c[2] - c[0]) * box.w, (c[3] - c[1]) * box.h] };
  });
}

// ── 칸 끌기 계산(순수 함수, 화면 없이 시험 가능). 좌표는 모두 페이지 안쪽 영역에 대한 0~1 비율 ──
const EDGE_IDX = { w: 0, n: 1, e: 2, s: 3 };
const snapTo = (v, cands, tol) => { let best = v; let bd = tol; for (const c of cands) { const d = Math.abs(c - v); if (d <= bd) { bd = d; best = c; } } return best; };
// 한 방향 좌표(가로면 0/2, 세로면 1/3 번째 값)의 붙을 후보: 페이지 가장자리·가운데·다른 칸의 가장자리
const snapCandidates = (cells, skipIds, ax) => { const out = [0, 0.5, 1]; cells.forEach((c) => { if (!skipIds.has(c.id)) { out.push(c.r[ax], c.r[ax + 2]); } }); return out; };

// 가장자리 하나(edge: 'w' 왼쪽 'e' 오른쪽 'n' 위 's' 아래)를 coord 로 옮긴다.
// group(기본): 같은 선 위에 있는 다른 칸의 가장자리(맞닿은 이웃)도 함께 옮긴다 → 칸 사이 경계선을 끄는 것과 같다. group=false: 이 칸 하나만.
// min: 칸의 최소 크기(비율, {x,y}), tol: 붙는 거리(비율). 반환: 새 칸 목록(바꿀 수 없으면 그대로)
export function dragEdge(cells, id, edge, coord, { group = true, min = { x: 0.05, y: 0.05 }, tol = 0.012, snap = true } = {}) {
  const t = cells.find((c) => c.id === id); if (!t || !(edge in EDGE_IDX)) return cells;
  const idx = EDGE_IDX[edge]; const ax = idx % 2 === 0 ? 0 : 1; // ax 0: 가로(x) 좌표, 1: 세로(y) 좌표
  const lowI = ax; const highI = ax + 2; const minLen = ax === 0 ? min.x : min.y;
  const cur = t.r[idx]; const eps = 1e-4;
  const mover = (c) => (group ? [Math.abs(c.r[lowI] - cur) < eps ? lowI : -1, Math.abs(c.r[highI] - cur) < eps ? highI : -1].filter((i) => i >= 0) : (c.id === id ? [idx] : []));
  const affected = cells.map((c) => ({ c, which: mover(c) })).filter((a) => a.which.length);
  let v = clamp01(coord);
  if (snap) { const skip = new Set(affected.map((a) => a.c.id)); v = snapTo(v, snapCandidates(cells, skip, ax), tol); }
  let lo = 0; let hi = 1;
  affected.forEach(({ c, which }) => which.forEach((i) => { if (i === lowI) hi = Math.min(hi, c.r[highI] - minLen); else lo = Math.max(lo, c.r[lowI] + minLen); }));
  if (lo > hi) return cells;
  v = Math.min(hi, Math.max(lo, v));
  const ids = new Map(affected.map((a) => [a.c.id, a.which]));
  return cells.map((c) => { const w = ids.get(c.id); if (!w) return c; const r = [...c.r]; w.forEach((i) => { r[i] = v; }); return { ...c, r }; });
}

// 칸 몸통을 옮긴다(이웃은 그대로). 페이지 안쪽 영역 밖으로는 못 나가고, 가장자리가 다른 칸·가운데·바깥 가장자리에 붙는다.
export function dragMove(cells, id, dx, dy, { tol = 0.012, snap = true } = {}) {
  const t = cells.find((c) => c.id === id); if (!t) return cells;
  const [x0, y0, x1, y1] = t.r; const w = x1 - x0; const h = y1 - y0;
  let nx = Math.min(1 - w, Math.max(0, x0 + dx)); let ny = Math.min(1 - h, Math.max(0, y0 + dy));
  if (snap) {
    const skip = new Set([id]);
    const cx = snapCandidates(cells, skip, 0); const cy = snapCandidates(cells, skip, 1);
    const a = snapTo(nx, cx, tol); const b = snapTo(nx + w, cx, tol);
    if (a !== nx) nx = a; else if (b !== nx + w) nx = b - w;
    const c = snapTo(ny, cy, tol); const d = snapTo(ny + h, cy, tol);
    if (c !== ny) ny = c; else if (d !== ny + h) ny = d - h;
    nx = Math.min(1 - w, Math.max(0, nx)); ny = Math.min(1 - h, Math.max(0, ny));
  }
  return cells.map((c) => (c.id === id ? { ...c, r: [nx, ny, nx + w, ny + h] } : c));
}

// 위치·크기를 mm 로 직접 정한다(페이지 좌표, box 는 페이지 안쪽 영역 mm). patch: { x, y, w, h } 중 바꿀 것만.
export function setCellMm(cells, id, patch, box, min = { x: 0.05, y: 0.05 }) {
  const t = cells.find((c) => c.id === id); if (!t) return cells;
  const cur = { x: box.x + t.r[0] * box.w, y: box.y + t.r[1] * box.h, w: (t.r[2] - t.r[0]) * box.w, h: (t.r[3] - t.r[1]) * box.h };
  const n = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) };
  const w = Math.min(1, Math.max(min.x, n.w / box.w)); const h = Math.min(1, Math.max(min.y, n.h / box.h));
  const x0 = Math.min(1 - w, Math.max(0, (n.x - box.x) / box.w)); const y0 = Math.min(1 - h, Math.max(0, (n.y - box.y) / box.h));
  return cells.map((c) => (c.id === id ? { ...c, r: [x0, y0, x0 + w, y0 + h] } : c));
}

// 칸 안의 그림을 다른 칸으로 옮긴다. items: { 칸 id → 그림 }, ids: 지금 있는 칸 번호들. 도착 칸이 비어 있으면 이동, 그림이 있으면 서로 맞바꿈.
// 반환: { items(새 객체), swapped } — 옮길 수 없으면(같은 칸·없는 칸·옮길 그림 없음) null. 받은 items 는 바꾸지 않는다.
export function moveCellContent(items, ids, from, to) {
  if (!from || !to || from === to || !ids.includes(from) || !ids.includes(to) || !items[from]) return null;
  const n = { ...items }; const a = items[from]; const b = items[to] || null;
  n[to] = a; if (b) n[from] = b; else delete n[from];
  return { items: n, swapped: !!b };
}

// 칸 라벨(예: 'STEP 01') 자동 채움. cells: [{ id, r }] (getCells 결과), prefix: 'STEP'·'ISSUE'·'배치전략'… (비우면 라벨 없음). 반환: { 칸 id → 라벨 글자 | null }
// 칸이 3개 이상일 때 다른 칸들의 중간 넓이의 2.2배 이상인 '큰 그림 칸'은 번호를 매기지 않고, 나머지(소도식 칸)를 01부터 칸 번호 순서로 센다.
export const LABEL_PREFIXES = [['', '없음'], ['STEP', 'STEP'], ['ISSUE', 'ISSUE'], ['배치전략', '배치전략']];
export function autoCellLabels(cells, prefix) {
  const out = {}; cells.forEach((c) => { out[c.id] = null; });
  const p = String(prefix || '').trim(); if (!p) return out;
  const area = (c) => (c.r[2] - c.r[0]) * (c.r[3] - c.r[1]);
  const big = new Set();
  if (cells.length >= 3) cells.forEach((c) => { const o = cells.filter((q) => q !== c).map(area).sort((a, b) => a - b); if (area(c) >= 2.2 * o[Math.floor(o.length / 2)]) big.add(c.id); });
  let n = 0; cells.forEach((c) => { if (big.has(c.id)) return; n += 1; out[c.id] = `${p} ${String(n).padStart(2, '0')}`; });
  return out;
}

export function nextCellId(cells) { return `c${cells.reduce((m, c) => Math.max(m, Number(String(c.id).replace(/\D/g, '')) || 0), 0) + 1}`; }
// 칸을 반으로 나눈다. dir 'v': 좌우로(왼쪽은 그대로 id, 오른쪽이 새 칸), 'h': 위아래로(위쪽 그대로, 아래쪽이 새 칸). 반환: { cells, newId } (12칸을 넘으면 그대로)
export function splitCell(cells, id, dir) {
  const t = cells.find((c) => c.id === id);
  if (!t || cells.length >= MAX_CELLS) return { cells, newId: null };
  const [x0, y0, x1, y1] = t.r; const newId = nextCellId(cells);
  const a = dir === 'h' ? [x0, y0, x1, (y0 + y1) / 2] : [x0, y0, (x0 + x1) / 2, y1];
  const b = dir === 'h' ? [x0, (y0 + y1) / 2, x1, y1] : [(x0 + x1) / 2, y0, x1, y1];
  return { cells: cells.flatMap((c) => (c.id === id ? [{ ...c, r: a }, { id: newId, r: b }] : [c])), newId };
}
export function removeCell(cells, id) { return cells.length > 1 ? cells.filter((c) => c.id !== id) : cells; }
// 서로 겹치는 칸 쌍(끌어서 옮기면 생길 수 있다) — 겹침 경고용
export function overlappingCells(cells) {
  const out = [];
  cells.forEach((a, i) => cells.forEach((b, j) => { if (j > i && a.r[0] < b.r[2] - 1e-4 && b.r[0] < a.r[2] - 1e-4 && a.r[1] < b.r[3] - 1e-4 && b.r[1] < a.r[3] - 1e-4) out.push([a.id, b.id]); }));
  return out;
}

// 패널(칸)이 여러 개인 렌더러(평면 다이어그램·배치 개념도·매스 과정도)가 칸의 가로세로 비율에 맞게 한 줄에 몇 패널을 놓을지: 그림 비율이 칸 비율에 가장 가까운 열 수
export function bestCols(n, cellAspect, panelW, panelH, maxCols = 3) {
  let best = 1; let bestD = Infinity;
  for (let c = 1; c <= Math.min(maxCols, Math.max(1, n)); c++) {
    const rows = Math.ceil(n / c); const d = Math.abs(Math.log(((c * panelW) / (rows * panelH)) / cellAspect));
    if (d < bestD - 1e-9) { bestD = d; best = c; }
  }
  return best;
}

export const FONT_OPTIONS = [
  { id: 'malgun', label: '맑은 고딕 (Windows 기본)', css: ENGINE_FONT },
  { id: 'noto', label: 'Noto Sans KR (본고딕)', css: "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif" },
  { id: 'pretendard', label: 'Pretendard (사내 보드 기본 · 그 PC에 설치돼 있어야 보임)', css: "'Pretendard','Malgun Gothic','Noto Sans KR',sans-serif" },
  { id: 'nanum', label: '나눔고딕', css: "'NanumGothic','Nanum Gothic','Malgun Gothic',sans-serif" },
  { id: 'dotum', label: '돋움', css: "'Dotum','Malgun Gothic',sans-serif" },
  { id: 'batang', label: '바탕 (명조 계열)', css: "'Batang','Noto Serif KR','Malgun Gothic',serif" },
];
export const fontById = (id) => FONT_OPTIONS.find((f) => f.id === id) || FONT_OPTIONS[0];
export const presetById = (id) => PAGE_PRESETS.find((p) => p.id === id) || PAGE_PRESETS[0];

export function recommendFont(medium) {
  return medium === 'screen'
    ? '화면(PPT)용: 고딕 계열 한 가지로 통일하세요. 제목은 굵게(Bold), 소제목은 중간(Medium), 본문은 보통(Regular). 멀리서 보는 화면이라 가는 글꼴(Light)은 피하세요.'
    : '인쇄용: 고딕 계열 한 가지로 통일하세요(맑은 고딕, Noto Sans KR, Pretendard 중 하나). 제목은 굵게(Bold), 소제목은 중간(Medium), 본문은 보통(Regular). 명조는 작은 글자에서 뭉개지니 제목에만 쓰세요.';
}

const ROUND = (v) => (v < 12 ? Math.round(v * 2) / 2 : v < 40 ? Math.round(v) : Math.round(v / 2) * 2);

// 용지 크기·용도에 맞는 글자 위계(pt). 인쇄: A3 짧은 변(297mm) 기준 32/18/11/8pt 를 짧은 변에 비례해 키우고 줄인다.
// 화면: PPT 16:9(13.33in) 기준 36/22/14/11pt 를 용지 면적의 제곱근에 비례해 조정한다. 바닥값(최소 읽기 크기)을 둔다.
export function recommendType({ w, h, medium }) {
  const print = medium !== 'screen';
  const k = print ? Math.min(w, h) / 297 : Math.sqrt(w * h) / Math.sqrt(338.67 * 190.5);
  const base = print ? { title: 32, sub: 18, label: 11, small: 8 } : { title: 36, sub: 22, label: 14, small: 11 };
  const out = {};
  Object.entries(base).forEach(([key, v]) => { out[key] = ROUND(v * k); });
  out.labelMin = print ? 7 : 11;                         // 이보다 작으면 읽기 어렵다
  out.label = Math.max(out.label, print ? 7 : 12);
  out.small = Math.max(out.small, print ? 6 : 10);
  // 바닥값 때문에 위계가 뒤집히지 않게(아주 작은 용지): 본문이 바닥값으로 올라가면 소제목·제목도 비율을 지켜 올린다(소제목 ≥ 본문×1.3, 제목 ≥ 소제목×1.4)
  out.sub = Math.max(out.sub, ROUND(out.label * 1.3));
  out.title = Math.max(out.title, ROUND(out.sub * 1.4));
  return out;
}

// 글자 하나의 pt 가 글자 위계(제목 > 소제목 > 본문 > 작은 글자)에서 어디쯤인지 판정한다(편집기에서 글자를 눌렀을 때의 안내).
// tiers: { title, sub, label, small, labelMin, upper: { pt, name } | null } — upper 는 그림 속 글자가 넘지 말아야 할 윗 위계(칸 제목·소제목·제목 중 가장 낮은 것).
// 반환: { level: 'ok'|'info'|'warn', text, tier: { name, pt }, fix } — fix 는 맞추면 좋은 pt(없으면 null). 판정할 수 없으면 null
export function judgeTextPt(pt, tiers) {
  if (!tiers || !(pt > 0)) return null;
  const T = [['제목', tiers.title], ['소제목', tiers.sub], ['본문', tiers.label], ['작은 글자', tiers.small]].filter(([, v]) => v > 0);
  if (!T.length) return null;
  const tier = T.map(([name, v]) => ({ name, pt: v, d: Math.abs(Math.log(pt / v)) })).sort((a, b) => a.d - b.d)[0];
  const t = { name: tier.name, pt: tier.pt };
  if (tiers.labelMin > 0 && pt < tiers.labelMin * 0.98) return { level: 'warn', tier: t, fix: Math.max(tiers.labelMin, tiers.small || 0), text: `읽기 어렵습니다: 이 용도의 최소 크기(${tiers.labelMin}pt)보다 작습니다.` };
  if (tiers.upper && pt >= tiers.upper.pt * 0.999) return { level: 'warn', tier: t, fix: tiers.label || null, text: `${tiers.upper.name}(${tiers.upper.pt}pt)보다 크거나 같아 위계가 맞지 않습니다.` };
  const ratio = pt / tier.pt;
  if (ratio >= 0.88 && ratio <= 1.14) return { level: 'ok', tier: t, fix: null, text: `${tier.name} 위계(${tier.pt}pt)에 맞습니다.` };
  return { level: 'info', tier: t, fix: tier.pt, text: `${tier.name}(${tier.pt}pt)보다 ${ratio > 1 ? '크고' : '작고'} 위계 단계 사이에 있습니다. 한 단계로 맞추면 정돈돼 보입니다.` };
}

// SVG 안의 글자 크기를 층으로 나눈다: 소제목급(드물게 쓰인 큰 글자) / 본문(가장 많이 쓰인 크기) / 가장 작은 글자
export function typeTiers(svg) {
  const m = new Map();
  for (const mm of String(svg).matchAll(/<text\b[^>]*?\bfont-size="([\d.]+)"/g)) { const v = Number(mm[1]); if (v > 0) m.set(v, (m.get(v) || 0) + 1); }
  if (!m.size) return null;
  const sizes = [...m.entries()].sort((a, b) => b[0] - a[0]);
  const total = sizes.reduce((a, [, c]) => a + c, 0);
  const label = [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const heading = (sizes.find(([v, c]) => v >= label * 1.25 && c <= Math.max(6, total * 0.15)) || [label])[0];
  return { heading, label, small: sizes[sizes.length - 1][0], count: total };
}

// 브라우저에서만: 그림의 실제 내용 영역(배경 사각형을 뺀 요소들의 바깥 상자)을 잰다 → 렌더러가 비워 둔 여백을 잘라 칸을 알뜰하게 쓴다. node 시험 등 DOM 이 없으면 null.
export function domMeasure(innerSvg, vb) {
  if (typeof document === 'undefined') return null;
  try {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}"><g id="pgm">${String(innerSvg).replace(/^\s*<rect\b[^>]*\/>/, '')}</g></svg>`;
    document.body.appendChild(host);
    const b = host.querySelector('#pgm').getBBox();
    document.body.removeChild(host);
    return b.width > 4 && b.height > 4 ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
  } catch { return null; }
}

// 그림 속 글자 크기만 k 배로 바꾼다(그림·도형은 그대로). 글자의 가운데를 지키도록 기준선(y)도 함께 옮긴다(렌더러는 기준선을 가운데+0.35×글자크기에 둔다).
// 회전·dy·baseline·textLength 가 있는 글자는 건드리지 않고, 글자 둘레 흰 테두리(stroke-width)는 같은 비율로 바꾼다.
export function scaleTexts(svg, k) {
  if (!(k > 0) || Math.abs(k - 1) < 0.005) return String(svg);
  return String(svg).replace(/<text\b([^>]*)>/g, (all, attrs) => {
    if (/\btransform=|\bdy=|dominant-baseline|\btextLength=/.test(attrs)) return all;
    const fs = /\bfont-size="([\d.]+)"/.exec(attrs); const y = /\by="(-?[\d.]+)"/.exec(attrs);
    if (!fs || !y) return all;
    const f = Number(fs[1]); const yy = Number(y[1]);
    let a = attrs.replace(fs[0], `font-size="${(f * k).toFixed(3)}"`).replace(y[0], `y="${(yy - 0.35 * f * (1 - k)).toFixed(3)}"`);
    a = a.replace(/\bstroke-width="([\d.]+)"/, (m0, v) => `stroke-width="${(Number(v) * k).toFixed(3)}"`);
    return `<text${a}>`;
  });
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = (v) => Math.round(v * 10) / 10;
// 글자 폭 어림(한글·전각은 1em, 그 밖은 0.58em)
export const textWidth = (s, fs) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? fs : fs * 0.58), 0);
// 설명문 줄바꿈: 폭 maxW 안에서 띄어쓰기에서 끊고(긴 낱말은 글자 단위), maxLines 줄을 넘으면 마지막 줄 끝을 '…' 로 줄인다
export function wrapLines(text, fs, maxW, maxLines = 2) {
  const lines = []; let cur = '';
  for (const ch of String(text ?? '').replace(/\s+/g, ' ').trim()) {
    if (cur && textWidth(cur + ch, fs) > maxW) {
      const sp = cur.lastIndexOf(' ');
      if (sp > 0 && ch !== ' ') { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; } else { lines.push(cur.trimEnd()); cur = ch === ' ' ? '' : ch; }
    } else cur += ch;
  }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > maxLines) {
    const k = lines.slice(0, maxLines); let last = k[maxLines - 1];
    while (last && textWidth(`${last}…`, fs) > maxW) last = last.slice(0, -1);
    k[maxLines - 1] = `${last.trimEnd()}…`; return k;
  }
  return lines;
}
// 제목 안의 {강조어} 를 나눈다: [{ t, em }]
export const emphParts = (txt) => String(txt ?? '').split(/(\{[^{}]*\})/).filter((q) => q !== '').map((q) => (/^\{[^{}]*\}$/.test(q) ? { t: q.slice(1, -1), em: true } : { t: q, em: false }));
// 칸 안쪽 맨 앞의 바탕 사각형(그림 전체를 덮는 것)을 뺀다 → 페이지의 흰 종이 위에 그림만 올라간다
export function stripBg(inner, vw, vh) {
  const m = /^\s*<rect\b([^>]*)\/>/.exec(inner); if (!m) return inner;
  const w = /\bwidth="([\d.]+%?)"/.exec(m[1]); const h = /\bheight="([\d.]+%?)"/.exec(m[1]);
  const full = (v, tot) => !!v && (v.endsWith('%') ? parseFloat(v) >= 95 : parseFloat(v) >= tot * 0.95);
  return full(w && w[1], vw) && full(h && h[1], vh) ? inner.slice(m[0].length) : inner;
}

// items: [{ id:'c1', render:{svg}|null, caption:'', cropTop:0 }] (render 는 제목을 비운 채 그린 것). page: { w, h, medium } (mm).
// opts: title/subtitle(페이지 제목), fontId, sizes({title,sub,label,small} 사용자가 정한 pt, 비우면 추천값), fill(true: 칸을 꽉 채움 / false: 본문 글자를 목표 pt 에 맞춤), layoutId, gap(mm),
//       measure(함수: 내용 영역 재기), preview(true: 칸 테두리·빈 칸 표시, 저장본에는 쓰지 않음), selected(고른 칸 id)
// 그림 조각 안의 id 와 그 참조(url(#id), href="#id")에 접두어를 붙인다. 속성 앞에 공백이 있는 id 만 건드려 data-eid 같은 것은 그대로 둔다
export function scopeIds(svg, prefix) {
  return svg.replace(/(\s)id="([^"]+)"/g, `$1id="${prefix}$2"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`).replace(/((?:xlink:)?href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
}

// 페이지 머리글(구분 라벨·제목·소제목) 서식: 정렬(left|center|right)과 자간(em, -0.05~0.4)
export const HEAD_ALIGNS = ['left', 'center', 'right'];
export const HEAD_LS_MIN = -0.05; export const HEAD_LS_MAX = 0.4;
export function composePage(page, items, opts = {}) {
  const { title = '', subtitle = '', fontId = 'malgun', sizes = {}, layoutId = '1x1', measure = null, preview = false, selected = '', custom = null, margin = null, frame = null, kicker = '', corner = '', project = '', pageNo = '', accent = '#F28C28', labelPrefix = '', cellMeta = null, headAlign = 'left', headLs = 0 } = opts;
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#F28C28';
  const W = Number(page.w); const H = Number(page.h);
  if (!(W > 20 && H > 20)) throw new Error('용지 크기가 너무 작습니다(가로·세로 20mm 이상).');
  const rec = recommendType({ w: W, h: H, medium: page.medium });
  const pt = { title: sizes.title || rec.title, sub: sizes.sub || rec.sub, label: sizes.label || rec.label, small: sizes.small || rec.small };
  const font = fontById(fontId).css;
  // 바깥 여백(mm): 정하지 않으면 자동(인쇄 8mm·화면 6mm 이상, 짧은 변의 4%). 변마다 따로 정할 수 있고, 한 변은 용지의 30%를 넘지 못한다.
  const autoM = Math.max(page.medium === 'screen' ? 6 : 8, Math.min(W, H) * 0.04);
  const numOr = (v, d) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
  const mIn = margin && typeof margin === 'object' ? margin : (margin === null || margin === undefined ? {} : { t: margin, r: margin, b: margin, l: margin });
  const mg = { t: Math.min(H * 0.3, Math.max(0, numOr(mIn.t, autoM))), b: Math.min(H * 0.3, Math.max(0, numOr(mIn.b, autoM))), l: Math.min(W * 0.3, Math.max(0, numOr(mIn.l, autoM))), r: Math.min(W * 0.3, Math.max(0, numOr(mIn.r, autoM))) };
  const gap = Number.isFinite(Number(opts.gap)) ? Math.max(0, Number(opts.gap)) : Math.max(4, Math.min(W, H) * 0.02);
  const warnings = []; const head = []; const body = []; const over = [];
  const used = {};
  // 위계 점검: 제목 > 소제목 > 본문 > 작은 글자. 직접 넣은 pt 가 거꾸로면(예: 제목 6pt·소제목 40pt) 그대로 따르되 분명히 알린다
  [['title', '제목', 'sub', '소제목'], ['sub', '소제목', 'label', '본문'], ['label', '본문', 'small', '작은 글자']].forEach(([a, an, b, bn]) => {
    if (pt[a] <= pt[b]) warnings.push({ level: 'warn', text: `글자 위계가 거꾸로입니다: ${an}(${pt[a]}pt)이 ${bn}(${pt[b]}pt)보다 작거나 같습니다. 제목 > 소제목 > 본문 > 작은 글자 순으로 정하세요(“추천값으로 되돌리기”).` });
  });
  const lineW = textWidth;
  // 글자 한 줄: 위치(x, 윗선 y), 목표 pt, 가용 폭 → 필요하면 줄여서 그린다. emph 이면 {강조어} 를 강조색 굵게. 반환: { pt(실제), bottom(다음 y), svg }
  const hAlign = HEAD_ALIGNS.includes(headAlign) ? headAlign : 'left'; const hLs = Number.isFinite(Number(headLs)) ? Math.min(HEAD_LS_MAX, Math.max(HEAD_LS_MIN, Number(headLs))) : 0;
  const textLine = (x, y, txt, ptv, weight, color, maxW, key, emph = false, fmt = null) => {
    const al = fmt ? fmt.align : 'left'; const ls = fmt ? fmt.ls : 0; // 머리글 줄만 정렬·자간을 받는다
    const parts = emph ? emphParts(txt) : null; const hasEm = !!parts && parts.some((q) => q.em);
    const plain = hasEm ? parts.map((q) => q.t).join('') : String(txt);
    let fs = ptv * PT_MM; const nCh = [...plain].length; const wOf = (f) => lineW(plain, f) + nCh * ls * f; const w = wOf(fs);
    if (w > maxW) { const k = Math.max(0.6, maxW / w); fs *= k; warnings.push({ level: 'info', text: `${key}이 길어 ${r1(fs / PT_MM)}pt 로 줄였습니다.` }); }
    const base = y + fs * 0.95;
    const inner = hasEm ? parts.map((q) => (q.em ? `<tspan fill="${accentColor}" font-weight="800">${esc(q.t)}</tspan>` : esc(q.t))).join('') : esc(txt);
    const ax = al === 'center' ? x + maxW / 2 : al === 'right' ? x + maxW : x;
    return { pt: fs / PT_MM, bottom: base + fs * 0.35, w: Math.min(maxW, wOf(fs)), svg: `<text x="${ax.toFixed(2)}" y="${base.toFixed(2)}"${al === 'center' ? ' text-anchor="middle"' : al === 'right' ? ' text-anchor="end"' : ''}${ls ? ` letter-spacing="${(ls * fs).toFixed(3)}"` : ''} font-family="${font}" font-size="${fs.toFixed(3)}" font-weight="${weight}" fill="${color}">${inner}</text>` };
  };
  let y = mg.t; const textW = W - mg.l - mg.r;
  // 오른쪽 위 도면 라벨: ' / ' 로 나눈 첫 줄은 굵게, 나머지 줄은 작은 회색(예: '종단면도 / SCALE : 1/400'). 제목·구분 라벨이 이 폭만큼 비켜 간다
  const cornerLines = String(corner || '').split(/\s+\/\s+/).map((q) => q.trim()).filter(Boolean).slice(0, 3);
  let headW = textW;
  if (cornerLines.length) {
    const cp = [pt.label, pt.small, pt.small]; let cy = mg.t; let cw = 0;
    cornerLines.forEach((txt, i) => { const fs = cp[i] * PT_MM; const w = Math.min(textW * 0.4, lineW(txt, fs)); cw = Math.max(cw, w); const base = cy + fs * 0.95; head.push(`<text x="${(W - mg.r).toFixed(2)}" y="${base.toFixed(2)}" text-anchor="end" font-family="${font}" font-size="${fs.toFixed(3)}" font-weight="${i === 0 ? 800 : 500}" fill="${i === 0 ? '#1f242b' : '#6b7178'}">${esc(txt)}</text>`); cy = base + fs * 0.45; });
    headW = Math.max(textW * 0.3, textW - cw - Math.min(W, H) * 0.03);
  }
  const headFmt = { align: hAlign, ls: hLs };
  const slotX = (t) => { const bw = Math.min(textW, t.w + 2); return hAlign === 'center' ? mg.l + (headW - bw) / 2 : hAlign === 'right' ? mg.l + headW - bw : mg.l; }; // 눌러 고치는 자리의 왼쪽 끝(정렬을 따라감)
  const slots = {}; // 제목·소제목이 놓인(또는 놓일) 자리 — 미리보기 위에서 눌러 바로 고칠 수 있게 위치를 알려 준다. rect: [x, y, w, h] mm, has: 지금 글자가 있는지
  if (kicker) { const y0 = y; const t = textLine(mg.l, y, `| ${kicker} |`, pt.label, 500, '#5b6168', headW, '구분 라벨', false, headFmt); head.push(t.svg); y = t.bottom + Math.min(W, H) * 0.004; slots.kicker = { rect: [slotX(t), y0, Math.min(textW, t.w + 2), t.bottom - y0], has: true, text: kicker }; }
  if (title) { const y0 = y; const t = textLine(mg.l, y, title, pt.title, 800, '#1f242b', headW, '제목', true, headFmt); head.push(t.svg); used.title = t.pt; y = t.bottom; slots.title = { rect: [slotX(t), y0, Math.min(textW, t.w + 2), t.bottom - y0], has: true, text: title }; }
  else slots.title = { rect: [mg.l, 0, textW, Math.max(4, mg.t)], has: false, text: '' };
  if (subtitle) { const y0 = y; const t = textLine(mg.l, y, subtitle, pt.sub, 500, '#555a60', headW, '소제목', true, headFmt); head.push(t.svg); used.sub = t.pt; y = t.bottom; slots.subtitle = { rect: [slotX(t), y0, Math.min(textW, t.w + 2), t.bottom - y0], has: true, text: subtitle }; }
  else if (title) slots.subtitle = { rect: [mg.l, y, textW, Math.max(4, Math.min(W, H) * 0.02 + 1)], has: false, text: '' };
  const box = { x: mg.l, y: y + (title || subtitle ? Math.min(W, H) * 0.02 : 0), w: W - mg.l - mg.r, h: 0 };
  box.h = H - box.y - mg.b;
  if (box.h < H * 0.3) warnings.push({ level: 'warn', text: '제목·소제목·여백이 차지하는 높이가 커서 그림이 들어갈 자리가 좁습니다. 글자 크기나 여백을 줄이거나 용지를 키우세요.' });
  if (box.w < W * 0.5) warnings.push({ level: 'warn', text: '왼쪽·오른쪽 여백이 커서 그림이 들어갈 폭이 좁습니다. 여백을 줄이세요.' });
  if (H - mg.t - mg.b < H * 0.5) warnings.push({ level: 'warn', text: '위·아래 여백이 커서 그림이 들어갈 높이가 좁습니다. 여백을 줄이세요.' });
  // 테두리선: 용지 가장자리에서 inset(mm, 정하지 않으면 가장 작은 여백의 절반) 안쪽에 둘레를 두른다
  const frameSvg = frame && Number(frame.w) > 0 ? (() => { const ins = numOr(frame.inset, Math.min(mg.t, mg.b, mg.l, mg.r) / 2); return `<rect x="${ins.toFixed(2)}" y="${ins.toFixed(2)}" width="${(W - 2 * ins).toFixed(2)}" height="${(H - 2 * ins).toFixed(2)}" fill="none" stroke="${/^#[0-9a-fA-F]{6}$/.test(frame.color || '') ? frame.color : '#222222'}" stroke-width="${Number(frame.w).toFixed(3)}"/>`; })() : '';
  const cells = resolveCells(layoutId, box, gap, custom);
  const multi = cells.length > 1;
  const autoLabels = autoCellLabels(getCells(layoutId, custom), labelPrefix);
  const bg = { v: '#FFFFFF' }; const reports = [];
  cells.forEach((cell, idx) => {
    const item = (items || []).find((i) => i.id === cell.id);
    if (preview) over.push(`<rect x="${cell.x.toFixed(2)}" y="${cell.y.toFixed(2)}" width="${cell.w.toFixed(2)}" height="${cell.h.toFixed(2)}" fill="none" stroke="${cell.id === selected ? '#F28C28' : '#C9CED4'}" stroke-width="${cell.id === selected ? 0.9 : 0.4}"${cell.id === selected ? '' : ' stroke-dasharray="2 1.5"'}/>`);
    if (!item || !item.render) {
      if (preview) over.push(`<text x="${(cell.x + cell.w / 2).toFixed(2)}" y="${(cell.y + cell.h / 2).toFixed(2)}" text-anchor="middle" font-family="${font}" font-size="${(Math.min(cell.w, cell.h) * 0.07).toFixed(2)}" fill="#9AA1A9">칸 ${idx + 1} — 비어 있음</text>`);
      reports.push({ id: cell.id, rect: [cell.x, cell.y, cell.w, cell.h], raw: cell.raw, empty: true });
      return;
    }
    let cy = cell.y; let capPt = null; let capRect = null; let labRect = null; let descRect = null; let labelText = '';
    const meta = (multi && cellMeta && cellMeta[cell.id]) || {};
    if (multi) { // 칸 라벨(선 사이 라벨) → 칸 제목(굵은 한 줄) → 설명(최대 2줄)
      labelText = meta.label !== undefined && meta.label !== null ? String(meta.label).trim() : (autoLabels[cell.id] || '');
      if (labelText) {
        let fs = pt.label * PT_MM * 0.95; const gp = fs * 0.9; const tw0 = textWidth(labelText, fs);
        if (tw0 + 2 * gp > cell.w) fs *= Math.max(0.6, (cell.w - 2 * gp) / tw0);
        const tw = textWidth(labelText, fs); const mid = cell.x + cell.w / 2; const ly = cy + fs * 0.78; const rowH = fs * 1.9;
        const ln = (xa, xb) => `<line x1="${xa.toFixed(2)}" y1="${ly.toFixed(2)}" x2="${xb.toFixed(2)}" y2="${ly.toFixed(2)}" stroke="#8a9099" stroke-width="0.25"/>`;
        const tick = (xx) => `<line x1="${xx.toFixed(2)}" y1="${ly.toFixed(2)}" x2="${xx.toFixed(2)}" y2="${(ly + fs * 0.7).toFixed(2)}" stroke="#8a9099" stroke-width="0.25"/>`;
        if (tw + 2 * gp < cell.w) body.push(`${ln(cell.x, mid - tw / 2 - gp)}${ln(mid + tw / 2 + gp, cell.x + cell.w)}${tick(cell.x)}${tick(cell.x + cell.w)}`);
        body.push(`<text x="${mid.toFixed(2)}" y="${(ly + fs * 0.35).toFixed(2)}" text-anchor="middle" font-family="${font}" font-size="${fs.toFixed(3)}" font-weight="500" fill="#5b6168">${esc(labelText)}</text>`);
        labRect = [cell.x, cy, cell.w, rowH]; cy += rowH;
      }
    }
    if (multi && item.caption) { const t = textLine(cell.x, cy, item.caption, pt.sub, 600, '#1f242b', cell.w, `칸 ${idx + 1} 제목`); body.push(t.svg); capRect = [cell.x, cy, Math.min(cell.w, t.w + 2), t.bottom - cy]; cy = t.bottom + Math.min(cell.w, cell.h) * 0.01; capPt = t.pt; }
    if (multi && String(meta.desc || '').trim()) {
      if (cell.h < 35 || cell.w < 45) warnings.push({ level: 'info', text: `칸 ${idx + 1}이 작아 설명을 그리지 않았습니다(칸을 키우거나 설명을 지우세요).` });
      else {
        const fsd = pt.small * PT_MM; const lh = fsd * 1.4; const lines = wrapLines(meta.desc, fsd, cell.w, 2);
        lines.forEach((ln2, i) => body.push(`<text x="${cell.x.toFixed(2)}" y="${(cy + fsd * 0.95 + i * lh).toFixed(2)}" font-family="${font}" font-size="${fsd.toFixed(3)}" fill="#555a60">${esc(ln2)}</text>`));
        descRect = [cell.x, cy, cell.w, lines.length * lh]; cy += lines.length * lh + Math.min(cell.w, cell.h) * 0.01;
      }
    }
    const cw = cell.w; const ch = cell.y + cell.h - cy;
    const src = String(item.render.svg);
    const root = src.match(/<svg\b[^>]*\bviewBox="([\d.\-\s]+)"[^>]*>/);
    if (!root) throw new Error('그림의 크기를 읽을 수 없습니다.');
    const [vx0, vy0, vw0, vh0] = root[1].trim().split(/\s+/).map(Number);
    let inner = src.slice(root.index + root[0].length, src.lastIndexOf('</svg>')).split(ENGINE_FONT).join(font);
    inner = stripBg(inner, vw0, vh0);                                                                    // 페이지 모드: 그림 바탕(크림 등)을 빼고 흰 종이 위에 그림만 올린다(칸마다 다른 바탕색이 얼룩지지 않는다)
    if (multi) inner = scopeIds(inner, `c${idx}_`);                                                       // 여러 칸에 같은 id(화살촉·마스크·무늬)가 겹쳐 서로를 덮어쓰지 않게 칸마다 접두어를 붙인다
    // 보이는 영역: 실제 내용 상자(재면 그것, 약간 여유) → 아니면 제목 자리로 비워 둔 위쪽 띠만 자른다
    let vx = vx0; let vy = vy0; let vw = vw0; let vh = vh0;
    const mb = measure ? measure(inner, [vx0, vy0, vw0, vh0]) : null;
    if (mb) { const pad = Math.max(vw0, vh0) * 0.012; vx = Math.max(vx0, mb.x - pad); vy = Math.max(vy0, mb.y - pad); vw = Math.min(vx0 + vw0, mb.x + mb.w + pad) - vx; vh = Math.min(vy0 + vh0, mb.y + mb.h + pad) - vy; }
    else { const crop = Math.max(0, Math.min(Number(item.cropTop) || 0, vh0 * 0.5)); vy = vy0 + crop; vh = vh0 - crop; }
    const tiers = typeTiers(inner);
    let s = Math.min(cw / vw, ch / vh); // 그림 좌표 1 단위가 몇 mm 가 되는지
    // 맞춤 방식: 'fill' 칸을 꽉 채움(글자 크기는 그림 배율을 따름) / 'text' 본문 글자를 목표 pt 에 맞춤(그림이 칸보다 작아질 수 있음) / 'both' 칸을 꽉 채우고 그림 속 글자만 본문 목표 pt 에 맞춤(권장)
    const mode = opts.fit || (opts.fill === false ? 'text' : 'fill');
    if (mode === 'text' && tiers) { const target = (pt.label * PT_MM) / tiers.label; if (target < s) s = target; }
    let textK = 1;
    if (mode === 'both' && tiers) { // 글자만 따로: 그림 배율 s 에서 본문이 목표 pt 가 되게 하는 비율. 키울 때는 글자가 칸 밖으로 넘칠 수 있어 1.3배까지, 줄일 때는 0.3배까지
      textK = Math.min(1.3, Math.max(0.3, (pt.label * PT_MM) / (s * tiers.label)));
      if (Math.abs(textK - 1) >= 0.005) inner = scaleTexts(inner, textK);
    }
    const ow = vw * s; const oh = vh * s; const ox = cell.x + (cw - ow) / 2; const oy = cy + (ch - oh) / 2;
    const eng = tiers ? { heading: tiers.heading * textK * s / PT_MM, label: tiers.label * textK * s / PT_MM, small: tiers.small * textK * s / PT_MM } : null;
    const tag = multi ? `칸 ${idx + 1}: ` : '';
    if (eng) {
      if (eng.label < rec.labelMin) warnings.push({ level: 'warn', text: `${tag}다이어그램 속 글자가 ${r1(eng.label)}pt 로 너무 작습니다(이 용도에서 최소 ${rec.labelMin}pt 권장). 칸을 키우거나 내용(블록·글자)을 줄이세요.` });
      else if (eng.label < pt.label * 0.8) warnings.push({ level: 'info', text: `${tag}다이어그램 속 글자(${r1(eng.label)}pt)가 목표(${pt.label}pt)보다 작습니다.` });
      else if (eng.label > pt.label * 1.8) warnings.push({ level: 'info', text: `${tag}다이어그램 속 글자(${r1(eng.label)}pt)가 목표(${pt.label}pt)보다 큽니다. 내용이 칸에 비해 작게 그려져 있습니다.` });
      const upper = capPt || used.sub || used.title || null;
      if (upper && eng.label >= upper) warnings.push({ level: 'warn', text: `${tag}다이어그램 속 글자(${r1(eng.label)}pt)가 ${capPt ? '칸 제목' : used.sub ? '소제목' : '제목'}(${r1(upper)}pt)보다 크거나 같아 위계가 맞지 않습니다.` });
    }
    const cid = `pgclip${idx}`;
    body.push(`<clipPath id="${cid}"><rect x="${ox.toFixed(3)}" y="${oy.toFixed(3)}" width="${ow.toFixed(3)}" height="${oh.toFixed(3)}"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(${(ox - vx * s).toFixed(4)} ${(oy - vy * s).toFixed(4)}) scale(${s.toFixed(6)})">${inner}</g></g>`);
    reports.push({ id: cell.id, rect: [cell.x, cell.y, cell.w, cell.h], raw: cell.raw, scale: s, textScale: textK, caption: capPt ? r1(capPt) : null, capRect, captionText: capPt ? item.caption : null, labRect, descRect, labelText, engine: eng ? { heading: r1(eng.heading), label: r1(eng.label), small: r1(eng.small) } : null });
  });
  const first = reports.find((r) => !r.empty);
  // 꼬리말: 오른쪽 아래에 '프로젝트명  02'(쪽번호는 숫자면 두 자리). 아래 여백 안쪽 가운데에 놓는다
  const projTxt = String(project ?? '').trim(); const noRaw = String(pageNo ?? '').trim(); const noTxt = /^\d+$/.test(noRaw) ? noRaw.padStart(2, '0') : noRaw;
  let footSvg = '';
  if (projTxt || noTxt) {
    const fsf = Math.max(1.5, pt.small * PT_MM * 0.85);
    if (mg.b < fsf * 1.8) warnings.push({ level: 'info', text: `꼬리말이 들어갈 아래 여백이 좁습니다(${r1(fsf * 1.8)}mm 이상 권장).` });
    footSvg = `<text x="${(W - mg.r).toFixed(2)}" y="${(H - mg.b / 2 + fsf * 0.35).toFixed(2)}" text-anchor="end" font-family="${font}" font-size="${fsf.toFixed(3)}" fill="#8a9099">${esc(projTxt)}${projTxt && noTxt ? '  ' : ''}${noTxt ? `<tspan font-weight="700" fill="#555a60">${esc(noTxt)}</tspan>` : ''}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg.v}"/>${frameSvg}${head.join('')}${body.join('')}${footSvg}${over.join('')}</svg>`;
  return {
    svg, width: Math.round(W * MM_PX), height: Math.round(H * MM_PX), page: { w: W, h: H, medium: page.medium }, box,
    cells: reports, slots,
    report: { rec, pt, used: { title: used.title ? r1(used.title) : null, sub: used.sub ? r1(used.sub) : null }, engine: first ? first.engine : null, scale: first ? first.scale : null, margin: mg, marginAuto: autoM, warnings },
  };
}

// 한 칸짜리 페이지(제목은 페이지 제목)
export function fitPage(render, page, opts = {}) {
  return composePage(page, [{ id: 'c1', render, cropTop: opts.cropTop || 0 }], { ...opts, layoutId: '1x1' });
}
