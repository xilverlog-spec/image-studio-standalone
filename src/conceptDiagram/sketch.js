// 손스케치 → 정리된 개념 다이어그램 + 속성 편집.
// 1) AI 가 손그림을 '해석하지 않고 그려진 그대로' 읽는다(상자·빗금 채움·자유 곡선) — buildSketchReadPrompt / normalizeSketchRead
// 2) 요청 문장을 얹어 이름·설명·바람 방향만 정한다(도형 위치는 못 바꾼다) — buildSketchAnnotatePrompt / makeSketchSpec
// 3) 구조(spec)를 코드가 SVG 로 그린다(발표용·도면용 두 스타일) — renderSketch
// 4) 화면에서 요소를 고르면 속성(화살표 방향·선 종류·굵기·색·글자·위치)을 바꾸고 다시 그린다 — sketchUpdate 등
//
// spec = { title, subtitle, style:'pres'|'line', frame:[x0,y0,x1,y1],
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

export const DASHES = { solid: '', dashed: '9 6', dotted: '1.5 6' };
export const DASH_LABEL = { solid: '실선', dashed: '파선', dotted: '점선' };
export const HEAD_LABEL = { end: '끝에 화살촉', start: '시작에 화살촉', both: '양쪽', none: '없음' };
const HEADS = Object.keys(HEAD_LABEL);

// ── 1) 읽기 ──────────────────────────────────────────────────
export function buildSketchReadPrompt() {
  return `당신은 건축가의 손 스케치를 읽는 보조자다. 첨부 이미지는 종이에 펜으로 그린 개념 스케치다. 스케치를 **해석하거나 이름을 짓지 말고, 그려진 도형을 있는 그대로** JSON으로만 출력한다(설명/코드펜스 금지).
이미지에는 위치를 재기 위한 붉은 눈금선이 10 단위(0~100)로 그려져 있다. 모든 좌표는 이 눈금(이미지 전체 = 0~100, 왼쪽 위 [0,0])으로 읽는다.

스키마:
{
 "summary": "무엇이 그려져 있는지 한국어 두세 문장(예: 가로로 긴 직사각형 띠 하나와 세로로 긴 띠 하나, 빗금 친 상자 2개, 띠를 가로지르는 물결선 4개)",
 "blocks": [ {"id":"b1", "pts":[[x,y],...꼭짓점 4개 이상, 시계방향], "hatched": true|false, "note": "그림에서 보이는 특징 한 줄"} ],
 "lines": [ {"id":"l1", "pts":[[x,y], ... 곡선을 따라 6~12개 점, 시작에서 끝 순서], "style":"wavy|straight", "note":"예: 띠를 위에서 아래로 가로지르는 물결선"} ]
}
규칙:
- blocks: 닫힌 사각형/다각형. 서로 겹쳐 그려진 것은 따로 적는다. 빗금(해칭)으로 칠한 것은 hatched true. 긴 띠는 하나의 직사각형으로 적는다(칸막이 선은 lines 로).
- lines: 닫힌 도형이 아닌 선(칸막이, 물결선, 가로지르는 선). 휘어진 선은 휘어진 모양이 보이도록 점을 충분히 찍는다.
- 글자가 없으면 이름을 짓지 않는다. 그려진 것만 적는다.`;
}

const SNAP_TOL = 3.2;

// AI 응답 → 정리된 읽기 결과. dims = [이미지 가로 px, 세로 px] 이면 가로세로 비율을 되살린다(AI 좌표는 가로·세로를 따로 0~100 으로 준다).
export function normalizeSketchRead(parsed, dims) {
  if (!parsed || typeof parsed !== 'object') throw new Error('스케치를 읽은 결과가 비어 있습니다.');
  const long = dims ? Math.max(dims[0], dims[1]) : 1;
  const sx = dims ? dims[0] / long : 1; const sy = dims ? dims[1] / long : 1;
  const fix = (p) => [num(p?.[0], 0, 0, 100) * sx, num(p?.[1], 0, 0, 100) * sy];
  const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : []).slice(0, 12).map((b, i) => {
    const pts = (Array.isArray(b.pts) ? b.pts : []).map(fix);
    if (pts.length < 3) return null;
    return { id: `b${i + 1}`, hatched: !!b.hatched, rect: bbox(pts), note: String(b.note ?? '') };
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
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).slice(0, 24).map((l, i) => {
    const pts = (Array.isArray(l.pts) ? l.pts : []).map(fix);
    if (pts.length < 2) return null;
    return { id: `l${i + 1}`, style: l.style === 'wavy' ? 'wavy' : 'straight', pts, note: String(l.note ?? '') };
  }).filter(Boolean);
  return { kind: 'sketch', summary: String(parsed.summary ?? ''), blocks, lines };
}

// ── 2) 이름·설명·바람 방향(AI) ───────────────────────────────
export function buildSketchAnnotatePrompt(read, userText) {
  const r0 = (v) => Math.round(v);
  const slabs = read.blocks.filter((b) => !b.hatched).map((b) => ({ id: b.id, rect: b.rect.map(r0), note: b.note }));
  const cores = read.blocks.filter((b) => b.hatched).map((b) => ({ id: b.id, rect: b.rect.map(r0), note: b.note }));
  const winds = read.lines.filter((l) => l.style === 'wavy').map((l) => ({ id: l.id, from: l.pts[0].map(r0), to: l.pts[l.pts.length - 1].map(r0) }));
  return `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래는 건축가의 손 스케치에서 읽어 정리한 도형이다(좌표 0~100, 왼쪽 위가 [0,0], y 는 아래로 커진다). 도형의 모양·위치는 고정이다. 요청의 개념에 맞는 이름·설명·바람(흐름) 방향만 정해 JSON 으로만 출력한다(설명/코드펜스 금지).
도형: ${JSON.stringify({ slabs, cores, winds })}
요청: ${userText || '(요청 없음 — 스케치에 그려진 것만 간단히 이름 붙인다)'}
스키마:
{ "title":"제목(20자 이내)", "subtitle":"부제(30자 이내)",
  "items":[{"target":"슬래브/코어 id","name":"이름(12자 이내)","desc":"한 줄 설명(30자 이내)"}],
  "winds":[{"id":"물결선 id","head":"end|start|both|none","in":"시작 쪽에 쓸 말(8자 이내, 없으면 빈 문자열)","out":"끝 쪽에 쓸 말(8자 이내, 없으면 빈 문자열)"}],
  "legend":{"wind":"물결선 범례 문구(20자 이내)","core":"빗금 도형 범례 문구(20자 이내)"},
  "notes":["핵심 메시지 문장 1~2개(각 40자 이내)"] }
규칙: 모든 슬래브와 코어에 items 를 하나씩 순서대로 쓴다. 물결선은 요청의 개념(예: 맞통풍은 한쪽 면의 개구부로 들어온 바람이 반대쪽 면으로 빠져나감)에 맞게 같은 방향으로 판을 통과하도록 head 를 정한다. from→to 가 진행 방향이면 head "end". 읽은 목록에 없는 id 는 쓰지 않는다. 손스케치에 없는 내용을 지어내지 않는다. 모든 글자는 한국어.`;
}

// 읽기 결과 + AI 이름 → 편집 가능한 spec
export function makeSketchSpec(read, ann, style = 'pres') {
  const a = ann && typeof ann === 'object' ? ann : {};
  const area = (b) => (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]);
  const slabs = read.blocks.filter((b) => !b.hatched).sort((p, q) => area(q) - area(p));
  const cores = read.blocks.filter((b) => b.hatched);
  const items = Object.fromEntries((Array.isArray(a.items) ? a.items : []).map((i) => [String(i.target), i]));
  const blocks = [...slabs, ...cores].map((b, i) => ({
    id: `b${i + 1}`, kind: b.hatched ? 'core' : 'slab', rect: b.rect.map((v) => Math.round(v * 10) / 10),
    name: String(items[b.id]?.name ?? ''), desc: String(items[b.id]?.desc ?? ''),
  }));
  // 칸막이: 가로/세로로 반듯하게, 슬래브 안쪽으로 맞춘다(슬래브 밖 선은 버린다)
  const inside = (r, x, y, m = 1.5) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
  const lines = [];
  read.lines.filter((l) => l.style !== 'wavy').forEach((l) => {
    const [x0, y0, x1, y1] = bbox(l.pts); const vertical = (x1 - x0) < (y1 - y0) * 0.35; const horizontal = (y1 - y0) < (x1 - x0) * 0.35;
    if (!vertical && !horizontal) return;
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    const host = blocks.find((b) => b.kind === 'slab' && inside(b.rect, mx, my));
    if (!host) return;
    const r = host.rect;
    lines.push({ id: `p${lines.length + 1}`, pts: vertical ? [[mx, r[1]], [mx, r[3]]] : [[r[0], my], [r[2], my]], dash: 'solid', width: 1.6 });
  });
  const windNote = Object.fromEntries((Array.isArray(a.winds) ? a.winds : []).map((w) => [String(w.id), w]));
  const winds = read.lines.filter((l) => l.style === 'wavy').map((l, i) => {
    const n = l.pts.length; const p0 = l.pts[0]; const pz = l.pts[n - 1];
    // 손떨림이 큰 물결은 흔들림을 65% 로 줄여 부드럽게 한다
    const pts = l.pts.map((p, k) => { const t = k / (n - 1); const cx = p0[0] + (pz[0] - p0[0]) * t; const cy = p0[1] + (pz[1] - p0[1]) * t; return [cx + (p[0] - cx) * 0.65, cy + (p[1] - cy) * 0.65]; });
    const w = windNote[l.id] || {};
    return { id: `w${i + 1}`, pts, smooth: true, head: HEADS.includes(w.head) ? w.head : 'end', dash: 'solid', width: 4.5, color: '#1E88C8', inLabel: String(w.in ?? ''), outLabel: String(w.out ?? '') };
  });
  const all = [...blocks.map((b) => [[b.rect[0], b.rect[1]], [b.rect[2], b.rect[3]]]).flat(), ...winds.flatMap((w) => w.pts)];
  const [x0, y0, x1, y1] = bbox(all); const padX = (x1 - x0) * 0.04; const padY = (y1 - y0) * 0.04;
  return {
    title: String(a.title ?? ''), subtitle: String(a.subtitle ?? ''), style, frame: [x0 - padX, y0 - padY, x1 + padX, y1 + padY],
    blocks, lines, winds, memos: [], legend: { wind: String(a.legend?.wind ?? '기류(흐름)'), core: String(a.legend?.core ?? '코어(계단·승강기)') },
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
    return { id: uid(b.id, `b${i + 1}`), kind: b.kind === 'core' ? 'core' : 'slab', rect: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])], name: String(b.name ?? ''), desc: String(b.desc ?? ''), fill: isHex(b.fill) ? b.fill : '' };
  });
  const lines = (Array.isArray(s.lines) ? s.lines : []).slice(0, 40).map((l, i) => ({
    id: uid(l.id, `p${i + 1}`), pts: (Array.isArray(l.pts) && l.pts.length >= 2 ? l.pts : [[0, 0], [10, 0]]).slice(0, 30).map(pt),
    dash: DASHES[l.dash] !== undefined ? l.dash : 'solid', width: num(l.width, 1.6, 0.5, 12), color: isHex(l.color) ? l.color : '',
  }));
  const winds = (Array.isArray(s.winds) ? s.winds : []).slice(0, 30).map((w, i) => ({
    id: uid(w.id, `w${i + 1}`), pts: (Array.isArray(w.pts) && w.pts.length >= 2 ? w.pts : [[0, 0], [10, 0]]).slice(0, 30).map(pt), smooth: w.smooth !== false,
    head: HEADS.includes(w.head) ? w.head : 'end', dash: DASHES[w.dash] !== undefined ? w.dash : 'solid', width: num(w.width, 4.5, 0.5, 14),
    color: isHex(w.color) ? w.color : '#1E88C8', inLabel: String(w.inLabel ?? ''), outLabel: String(w.outLabel ?? ''),
  }));
  const memos = (Array.isArray(s.memos) ? s.memos : []).slice(0, 30).map((m, i) => ({ id: uid(m.id, `m${i + 1}`), x: num(m.x, 50), y: num(m.y, 50), text: String(m.text ?? ''), size: num(m.size, 14, 8, 48), color: isHex(m.color) ? m.color : '#222222' }));
  const f = Array.isArray(s.frame) && s.frame.length === 4 ? s.frame.map((v) => num(v, 0)) : null;
  const all = [...blocks.flatMap((b) => [[b.rect[0], b.rect[1]], [b.rect[2], b.rect[3]]]), ...winds.flatMap((w) => w.pts), ...lines.flatMap((l) => l.pts)];
  const frame = f && f[2] > f[0] && f[3] > f[1] ? f : (all.length ? bbox(all) : [0, 0, 100, 100]);
  if (frame[2] - frame[0] < 1) frame[2] = frame[0] + 1;
  if (frame[3] - frame[1] < 1) frame[3] = frame[1] + 1;
  return {
    title: String(s.title ?? ''), subtitle: String(s.subtitle ?? ''), style: s.style === 'line' ? 'line' : 'pres', frame, blocks, lines, winds, memos,
    legend: { wind: String(s.legend?.wind ?? '기류(흐름)'), core: String(s.legend?.core ?? '코어(계단·승강기)') }, notes: (Array.isArray(s.notes) ? s.notes : []).slice(0, 4).map(String),
  };
}

// ── 4) 렌더 ──────────────────────────────────────────────────
const W = 1200; const H = 760; const AREA = [70, 150, 780, 640];
const PALETTE = {
  pres: { bg: '#FAF7F2', slab: '#F6D9B8', slabLine: '#B8742F', core: '#27304F', text: '#222222', sub: '#666666', part: '#B8742F', card: true },
  line: { bg: '#FFFFFF', slab: '#FFFFFF', slabLine: '#222222', core: '#222222', text: '#111111', sub: '#555555', part: '#222222', card: false },
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

// opts.interactive: 클릭으로 요소를 고를 수 있게 data-eid 와 넉넉한 클릭 영역을 넣는다(저장할 때는 false). opts.selected: 고른 요소 id
export function renderSketch(raw, opts = {}) {
  const spec = normalizeSketch(raw);
  const { interactive = false, selected = '' } = opts;
  const C = PALETTE[spec.style];
  const pres = spec.style === 'pres';
  const [fx0, fy0, fx1, fy1] = spec.frame;
  const K = Math.min((AREA[2] - AREA[0]) / (fx1 - fx0), (AREA[3] - AREA[1]) / (fy1 - fy0));
  const ox = AREA[0] + (AREA[2] - AREA[0] - (fx1 - fx0) * K) / 2; const oy = AREA[1] + (AREA[3] - AREA[1] - (fy1 - fy0) * K) / 2;
  const P = ([x, y]) => [ox + (x - fx0) * K, oy + (y - fy0) * K];
  const eid = (id) => (interactive ? ` data-eid="${esc(id)}" style="cursor:pointer"` : '');
  const o = []; const sel = [];
  const defs = [`<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.core}" stroke-width="2"/></pattern>`];
  spec.winds.forEach((w) => defs.push(`<marker id="aw_${esc(w.id)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${pres ? 4 : 5}" markerHeight="${pres ? 4 : 5}" orient="auto-start-reverse"><path d="${pres ? 'M0 0L10 5L0 10Z' : 'M1 1L9 5L1 9'}" fill="${pres ? w.color : 'none'}" stroke="${w.color}" stroke-width="${pres ? 0 : 1.6}" stroke-linejoin="round"/></marker>`));
  o.push(`<defs>${defs.join('')}</defs>`);
  if (pres) o.push('<rect x="30" y="100" width="780" height="580" rx="14" fill="#fff" stroke="#E7DFD2"/>');
  if (spec.title) o.push(`<text x="40" y="52" font-family="${FONT}" font-size="26" font-weight="800" fill="${C.text}">${esc(spec.title)}</text>`);
  if (spec.subtitle) o.push(`<text x="40" y="82" font-family="${FONT}" font-size="14.5" fill="${C.sub}">${esc(spec.subtitle)}</text>`);
  if (pres && spec.title) o.push('<rect x="0" y="36" width="12" height="22" fill="#1E88C8"/>');

  const R = (b) => { const a = P([b.rect[0], b.rect[1]]); const z = P([b.rect[2], b.rect[3]]); return [a[0], a[1], z[0] - a[0], z[1] - a[1]]; };
  const slabs = spec.blocks.filter((b) => b.kind === 'slab').sort((p, q) => (q.rect[2] - q.rect[0]) * (q.rect[3] - q.rect[1]) - (p.rect[2] - p.rect[0]) * (p.rect[3] - p.rect[1]));
  const cores = spec.blocks.filter((b) => b.kind === 'core');
  const dash = (d) => (DASHES[d] ? ` stroke-dasharray="${DASHES[d]}"` : '');
  const cap = (d) => (d === 'dotted' ? 'round' : 'round');
  slabs.forEach((b) => {
    const [x, y, w, h] = R(b);
    if (pres) o.push(`<rect x="${(x + 7).toFixed(1)}" y="${(y + 7).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#000" fill-opacity="0.09"/>`);
    o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${b.fill || C.slab}" stroke="${C.slabLine}" stroke-width="${pres ? 2.6 : 3}" stroke-linejoin="round"${eid(b.id)}/>`);
  });
  spec.lines.forEach((l) => {
    const Q = l.pts.map(P); const d = `M${Q.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}`; const col = l.color || C.part;
    if (selected === l.id) o.push(`<path d="${d}" fill="none" stroke="#F28C28" stroke-width="${l.width + 9}" stroke-opacity="0.4" stroke-linecap="round"/>`);
    o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${l.width}" stroke-linecap="${cap(l.dash)}" stroke-opacity="${pres && !l.color ? 0.75 : 1}"${dash(l.dash)}/>`);
    if (interactive) o.push(`<path class="hit" data-eid="${esc(l.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer"/>`);
  });
  cores.forEach((b) => {
    const [x, y, w, h] = R(b);
    o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${b.fill || 'url(#hatch)'}" stroke="${C.core}" stroke-width="2.2" stroke-linejoin="round"${eid(b.id)}/>`);
  });
  spec.blocks.forEach((b) => {
    if (selected !== b.id) return;
    const [x, y, w, h] = R(b);
    sel.push(`<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="${(w + 10).toFixed(1)}" height="${(h + 10).toFixed(1)}" fill="none" stroke="#F28C28" stroke-width="2.5" stroke-dasharray="7 4" rx="3"/>`);
  });
  // 바람(흐름): 발표용은 굵은 반투명 띠 + 선, 도면용은 선만. 유입/유출 문구는 시작/끝 바깥에 둔다
  spec.winds.forEach((w) => {
    const Q = w.pts.map(P); const d = w.smooth ? smoothPath(Q) : `M${Q.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}`;
    if (selected === w.id) o.push(`<path d="${d}" fill="none" stroke="#F28C28" stroke-width="${w.width + 16}" stroke-opacity="0.38" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (pres) o.push(`<path d="${d}" fill="none" stroke="${w.color}" stroke-opacity="0.22" stroke-width="${(w.width * 4.6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    const mk = (w.head === 'end' || w.head === 'both' ? ` marker-end="url(#aw_${esc(w.id)})"` : '') + (w.head === 'start' || w.head === 'both' ? ` marker-start="url(#aw_${esc(w.id)})"` : '');
    o.push(`<path d="${d}" fill="none" stroke="${w.color}" stroke-width="${w.width}" stroke-linecap="round" stroke-linejoin="round"${dash(w.dash)}${mk}/>`);
    if (interactive) o.push(`<path class="hit" data-eid="${esc(w.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(18, w.width * 4)}" style="cursor:pointer"/>`);
    const s0 = Q[0]; const e0 = Q[Q.length - 1];
    const pill = (pt, text, below) => {
      if (!text) return;
      const wd = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 12 : 7), 0) + 16; const y = pt[1] + (below ? 24 : -20);
      o.push(`<rect x="${(pt[0] - wd / 2).toFixed(1)}" y="${(y - 15).toFixed(1)}" width="${wd}" height="20" rx="10" fill="${pres ? w.color : '#fff'}" stroke="${w.color}" stroke-width="1.4"/><text x="${pt[0].toFixed(1)}" y="${(y - 1).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="700" fill="${pres ? '#fff' : w.color}">${esc(text)}</text>`);
    };
    pill(s0, w.inLabel, !(s0[1] < e0[1])); pill(e0, w.outLabel, s0[1] < e0[1]);
  });
  // 메모(자유 글자)
  spec.memos.forEach((m) => {
    const [x, y] = P([m.x, m.y]);
    o.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${m.size}" font-weight="700" fill="${m.color}" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"${eid(m.id)}>${esc(m.text)}</text>`);
    if (selected === m.id) { const wd = [...m.text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? m.size : m.size * 0.58), 0) + 12; sel.push(`<rect x="${(x - wd / 2).toFixed(1)}" y="${(y - m.size - 2).toFixed(1)}" width="${wd.toFixed(1)}" height="${(m.size + 12).toFixed(1)}" fill="none" stroke="#F28C28" stroke-width="2" stroke-dasharray="6 4" rx="3"/>`); }
  });
  o.push(...sel);
  // 번호 표식(도형 위) + 우측 설명 칼럼 → 이름표가 도형을 가리지 않는다
  let ry = 170; let n = 0;
  [...slabs, ...cores].forEach((b) => {
    if (!b.name) return;
    n += 1; const dark = b.kind === 'core'; const [x, y, w, h] = R(b);
    const [mx, my] = dark ? [x + w / 2, y + h / 2] : [x + 20, y + 20];
    const mark = (cx, cy) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="${dark ? '#fff' : C.text}" stroke="${dark ? C.core : '#fff'}" stroke-width="2"/><text x="${cx.toFixed(1)}" y="${(cy + 4.5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="800" fill="${dark ? C.core : '#fff'}">${n}</text>`;
    o.push(mark(mx, my)); o.push(mark(860, ry));
    o.push(`<text x="884" y="${ry + 1}" font-family="${FONT}" font-size="15" font-weight="800" fill="${C.text}">${esc(b.name)}</text>`);
    if (b.desc) o.push(`<text x="884" y="${ry + 21}" font-family="${FONT}" font-size="12.5" fill="${C.sub}">${esc(b.desc)}</text>`);
    ry += 58;
  });
  ry += 8; o.push(`<line x1="850" y1="${ry - 14}" x2="1160" y2="${ry - 14}" stroke="${pres ? '#E2D9CB' : '#cccccc'}"/>`);
  if (spec.winds.length) {
    const tally = {}; spec.winds.forEach((w) => { const k = `${w.color}|${w.dash}`; tally[k] = (tally[k] || 0) + 1; });
    const [bestColor, bestDash] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0].split('|');
    const w0 = { color: bestColor, dash: bestDash };
    o.push(`<path d="M852 ${ry + 8} q 9 -11 18 0 t 18 0" fill="none" stroke="${w0.color}" stroke-width="3.2"${dash(w0.dash)}/><text x="896" y="${ry + 12}" font-family="${FONT}" font-size="13" fill="${C.text}">${esc(spec.legend.wind)}</text>`);
    ry += 26;
  }
  if (cores.length) o.push(`<rect x="852" y="${ry + 2}" width="36" height="14" fill="url(#hatch)" stroke="${C.core}"/><text x="896" y="${ry + 14}" font-family="${FONT}" font-size="13" fill="${C.text}">${esc(spec.legend.core)}</text>`);
  spec.notes.forEach((t, i) => o.push(`<text x="40" y="${H - 46 + i * 22}" font-family="${FONT}" font-size="14" fill="${C.text}"${i === 0 ? ' font-weight="700"' : ''}>${pres ? '▪ ' : '- '}${esc(t)}</text>`));
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
  let next;
  if (len0 < 0.01) next = pts.map((p, i) => (i === 0 ? a : i === pts.length - 1 ? z : [a[0] + (z[0] - a[0]) * (i / (pts.length - 1)), a[1] + (z[1] - a[1]) * (i / (pts.length - 1))]));
  else {
    const s = len1 / len0; const ang = Math.atan2(dy1, dx1) - Math.atan2(dy0, dx0); const c = Math.cos(ang); const sn = Math.sin(ang);
    next = pts.map((p) => { const rx = p[0] - a0[0]; const ry = p[1] - a0[1]; return [a[0] + s * (rx * c - ry * sn), a[1] + s * (rx * sn + ry * c)]; });
    next[0] = a; next[next.length - 1] = z;
  }
  return sketchUpdate(spec, id, { pts: next });
}
export function sketchAdd(spec, kind) {
  const [x0, y0, x1, y1] = spec.frame; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const w = x1 - x0; const h = y1 - y0;
  const nextId = (pre, list) => { let n = 1; while ((spec[list] || []).some((e) => e.id === `${pre}${n}`)) n += 1; return `${pre}${n}`; };
  if (kind === 'wind') { const id = nextId('w', 'winds'); const pts = Array.from({ length: 5 }, (_, i) => [cx - w * 0.2 + (w * 0.4 * i) / 4, cy - h * 0.12 + Math.sin((i / 4) * Math.PI * 2) * h * 0.03]); return { spec: { ...spec, winds: [...spec.winds, { id, pts, smooth: true, head: 'end', dash: 'solid', width: 4.5, color: '#1E88C8', inLabel: '', outLabel: '' }] }, id }; }
  if (kind === 'line') { const id = nextId('p', 'lines'); return { spec: { ...spec, lines: [...spec.lines, { id, pts: [[cx - w * 0.15, cy + h * 0.15], [cx + w * 0.15, cy + h * 0.15]], dash: 'solid', width: 2, color: '' }] }, id }; }
  if (kind === 'memo') { const id = nextId('m', 'memos'); return { spec: { ...spec, memos: [...spec.memos, { id, x: cx, y: cy + h * 0.3, text: '메모', size: 14, color: '#222222' }] }, id }; }
  const id = nextId('b', 'blocks'); return { spec: { ...spec, blocks: [...spec.blocks, { id, kind: kind === 'core' ? 'core' : 'slab', rect: [cx - w * 0.08, cy - h * 0.08, cx + w * 0.08, cy + h * 0.08], name: '', desc: '', fill: '' }] }, id };
}

export function getSketchTextFields(spec) {
  const out = [];
  if (!spec) return out;
  out.push({ path: ['title'], label: '제목', value: spec.title || '' });
  out.push({ path: ['subtitle'], label: '부제', value: spec.subtitle || '' });
  (spec.blocks || []).forEach((b, i) => { out.push({ path: ['blocks', i, 'name'], label: `${b.kind === 'core' ? '코어' : '판'} ${i + 1} 이름`, value: b.name || '' }); out.push({ path: ['blocks', i, 'desc'], label: `${b.kind === 'core' ? '코어' : '판'} ${i + 1} 설명`, value: b.desc || '' }); });
  (spec.notes || []).forEach((n, i) => out.push({ path: ['notes', i], label: `핵심 메시지 ${i + 1}`, value: n }));
  return out;
}
