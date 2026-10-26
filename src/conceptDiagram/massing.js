// 아이소메트릭 매스 과정도 렌더러(EXTRUSION / SUBTRACTION / ADDITION / FINAL FORM 식 단계도).
// AI는 "격자 단위의 박스 목록"만 정하고, 투영/음영/깊이 정렬/화살표는 여기서 계산한다.
// 좌표: x는 오른쪽-아래, y는 왼쪽-아래, z는 위쪽(단위: 모듈). 박스 {x,y,z,w,d,h,mode,move,len,color}.
// 2026-10-26 개선(참고삽도의 '개념 소도식' 문법): 단계마다 위에 "STEP n + 한 줄 제목" 띠, 매스 옆에 프로그램 이름 점선 지시선(+아이콘 칩),
//   색을 칠한 매스는 면마다 밝기를 달리한 입체, 진입·동선 화살표(주황·파랑·초록). 모두 선택 항목이라 예전 스펙도 그대로 그려진다.
//   step = { label, ground, boxes, leaders?:[{box:0,label,icon?,side?:'left|right',color?}], arrows?:[{from:[x,y,z],to:[x,y,z],color?,dash?}] }
//   spec.numbering === false 면 STEP 번호 박스를 빼고 제목 띠만 둔다. spec.context?: [{x,y,w,d,h}] 흐린 주변 매스(모든 단계에 같이).

import { iconGlyph, ICON_NAMES } from './icons';

export const BOX_MODES = ['solid', 'add', 'subtract', 'ghost'];

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v, d, lo = -50, hi = 50) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const S = 30; const ZS = 24; const C30 = 0.8660254;
const proj = (x, y, z) => [(x - y) * C30 * S, (x + y) * 0.5 * S - z * ZS];

const normBox = (b) => ({
  x: num(b.x, 0), y: num(b.y, 0), z: num(b.z, 0, 0, 30),
  w: Math.max(0.2, num(b.w, 1, 0, 30)), d: Math.max(0.2, num(b.d, 1, 0, 30)), h: Math.max(0.1, num(b.h, 1, 0, 30)),
  mode: BOX_MODES.includes(b.mode) ? b.mode : 'solid',
  move: b.move === 'up' || b.move === 'down' ? b.move : null,
  len: num(b.len, 1.2, 0.3, 10),
  color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : null,
});

const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mixTo = (h, t, a) => { const c = hexRgb(h); return rgbHex(c.map((v, i) => v + (t[i] - v) * a)); };
const lighter = (h, a) => mixTo(h, [255, 255, 255], a); const darker = (h, a) => mixTo(h, [0, 0, 0], a);
const tw = (str, fs) => [...String(str)].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? fs : fs * 0.58), 0);
const ARROW_COLORS = ['#F28C28', '#2F7FBF', '#3E8E41'];

const poly = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// ── 덜어내기(subtract): AI 가 '덜어낼 부분'을 매스 안쪽에 겹쳐 두는 일이 많다. 그대로 그리면 큰 박스 면에 가려 아무 변화가 없어 보이므로,
//    겹친 부분은 렌더러가 매스에서 직접 도려내고, 덜어낸 박스는 빈 자리 바로 위로 띄워서 그린다(위로 빠지는 화살표가 그 위에 붙는다).
const EPS = 1e-6;
const overlaps = (a, c) => a.x < c.x + c.w - EPS && c.x < a.x + a.w - EPS && a.y < c.y + c.d - EPS && c.y < a.y + a.d - EPS && a.z < c.z + c.h - EPS && c.z < a.z + a.h - EPS;

// 직육면체 a 에서 직육면체 c 를 뺀 나머지를 최대 6개의 직육면체로 쪼갠다
function subtractBox(a, c) {
  if (!overlaps(a, c)) return [a];
  const out = [];
  const ax1 = a.x + a.w; const ay1 = a.y + a.d; const az1 = a.z + a.h;
  const x0 = Math.max(a.x, c.x); const x1 = Math.min(ax1, c.x + c.w);
  const y0 = Math.max(a.y, c.y); const y1 = Math.min(ay1, c.y + c.d);
  const z0 = Math.max(a.z, c.z); const z1 = Math.min(az1, c.z + c.h);
  const piece = (x, y, z, w, d, h) => { if (w > 0.05 && d > 0.05 && h > 0.05) out.push({ ...a, x, y, z, w, d, h }); };
  piece(a.x, a.y, a.z, x0 - a.x, a.d, a.h);                 // x 왼쪽
  piece(x1, a.y, a.z, ax1 - x1, a.d, a.h);                  // x 오른쪽
  piece(x0, a.y, a.z, x1 - x0, y0 - a.y, a.h);              // 가운데 x 구간의 y 앞쪽
  piece(x0, y1, a.z, x1 - x0, ay1 - y1, a.h);               // 가운데 x 구간의 y 뒤쪽
  piece(x0, y0, a.z, x1 - x0, y1 - y0, z0 - a.z);           // 겹친 칸의 아래
  piece(x0, y0, z1, x1 - x0, y1 - y0, az1 - z1);            // 겹친 칸의 위
  return out;
}

export function applySubtractions(boxes) {
  const cutters = boxes.filter((b) => b.mode === 'subtract');
  if (!cutters.length) return boxes;
  let solids = boxes.filter((b) => b.mode !== 'subtract');
  const lifted = [];
  cutters.forEach((c) => {
    const hit = solids.some((s) => (s.mode === 'solid' || s.mode === 'add') && overlaps(s, c));
    if (!hit) { lifted.push(c); return; }   // 이미 떠 있는 박스는 그대로 둔다
    solids = solids.flatMap((s) => (s.mode === 'solid' ? subtractBox(s, c) : [s]));
    // 빈 자리 바로 위로 띄운다(떠 있는 박스가 아래 매스 면을 가리지 않게 약간 더 띄움)
    lifted.push({ ...c, z: c.z + c.h * 0.9 + 0.3, move: c.move || 'up' });
  });
  return [...solids, ...lifted];
}

function boxSvg(b, accent) {
  const { x, y, z, w, d, h } = b;
  const x1 = x + w; const y1 = y + d; const z1 = z + h;
  const top = [proj(x, y, z1), proj(x1, y, z1), proj(x1, y1, z1), proj(x, y1, z1)];
  const left = [proj(x, y1, z), proj(x1, y1, z), proj(x1, y1, z1), proj(x, y1, z1)];
  const right = [proj(x1, y, z), proj(x1, y1, z), proj(x1, y1, z1), proj(x1, y, z1)];
  const marked = b.mode === 'add' || b.mode === 'subtract';
  const base = b.color || accent;
  if (b.mode === 'ghost') {
    const st = 'fill="none" stroke="#7a7f87" stroke-width="1" stroke-dasharray="4 3"';
    return `<polygon points="${poly(top)}" ${st}/><polygon points="${poly(left)}" ${st}/><polygon points="${poly(right)}" ${st}/>`;
  }
  if (marked) { // 강조색 입체: 왼쪽 면은 어둡게, 윗면은 밝게(참고삽도의 색 매스)
    const st = `stroke="${darker(base, 0.55)}" stroke-width="1.1" stroke-linejoin="round"`;
    return `<polygon points="${poly(left)}" fill="${darker(base, 0.14)}" fill-opacity="0.9" ${st}/><polygon points="${poly(right)}" fill="${base}" fill-opacity="0.92" ${st}/><polygon points="${poly(top)}" fill="${lighter(base, 0.28)}" fill-opacity="0.85" ${st}/>`;
  }
  const st = 'stroke="#2b2b2b" stroke-width="1.15" stroke-linejoin="round"';
  const [tc, lc, rc] = b.color ? [lighter(b.color, 0.3), darker(b.color, 0.12), b.color] : ['#FFFFFF', '#DEDEDE', '#EFEFEF'];
  return `<polygon points="${poly(left)}" fill="${lc}" ${st}/><polygon points="${poly(right)}" fill="${rc}" ${st}/><polygon points="${poly(top)}" fill="${tc}" ${st}/>`;
}

function arrowsSvg(b, uid) {
  if (!b.move) return '';
  const { x, y, z, w, d } = b;
  const x1 = x + w; const y1 = y + d;
  const dir = b.move === 'up' ? 1 : -1;
  const z0 = b.move === 'up' ? z : z;
  const starts = [[x1, y1], [x, y1], [x1, y]].map(([px, py]) => [px, py]);
  const marker = `<marker id="${uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d1d1d"/></marker>`;
  const lines = starts.map(([px, py]) => {
    const a = proj(px, py, z0); const bpt = proj(px, py, z0 + dir * b.len);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${bpt[0].toFixed(1)}" y2="${bpt[1].toFixed(1)}" stroke="#1d1d1d" stroke-width="1.3" stroke-dasharray="3.2 2.6" marker-end="url(#${uid})"/>`;
  }).join('');
  return `<defs>${marker}</defs>${lines}`;
}

export const MASSING_COLS = 2;
export const MASSING_PANEL_W = 460;
export const MASSING_PANEL_H = 360;

const num3 = (v) => (Array.isArray(v) && v.length >= 3 ? [num(v[0], 0), num(v[1], 0), num(v[2], 0, 0, 30)] : null);

export function renderMassing(spec) {
  const accent = isHex(spec.accent) ? spec.accent : '#F28C28';
  const PW = MASSING_PANEL_W; const PH = MASSING_PANEL_H; const HEAD = 48;
  const numbering = spec.numbering !== false;
  const context = (Array.isArray(spec.context) ? spec.context : []).slice(0, 12).map((c) => ({ x: num(c.x, 0), y: num(c.y, 0), z: 0, w: Math.max(0.3, num(c.w, 1, 0, 30)), d: Math.max(0.3, num(c.d, 1, 0, 30)), h: Math.max(0.2, num(c.h, 1, 0, 30)) }));
  const steps = (Array.isArray(spec.steps) ? spec.steps : []).slice(0, 8).map((s) => {
    const raw = (Array.isArray(s.boxes) ? s.boxes : []).slice(0, 24).map(normBox);
    const leaders = (Array.isArray(s.leaders) ? s.leaders : []).slice(0, 6).map((l) => {
      const bi = Number.isInteger(Number(l.box)) && Number(l.box) >= 0 && Number(l.box) < raw.length ? Number(l.box) : -1;
      const at = num3(l.at);
      const ic = l.icon ? String(l.icon).trim().toLowerCase().replace(/[\s_]+/g, '-') : '';
      return { box: bi, at, label: String(l.label ?? '').slice(0, 14), icon: ICON_NAMES.includes(ic) ? ic : '', side: l.side === 'left' || l.side === 'right' ? l.side : '', color: isHex(l.color) ? l.color : '' };
    }).filter((l) => l.label && (l.box >= 0 || l.at));
    const arrows = (Array.isArray(s.arrows) ? s.arrows : []).slice(0, 6).map((a) => ({ from: num3(a.from), to: num3(a.to), color: isHex(a.color) ? a.color : accent, dash: !!a.dash })).filter((a) => a.from && a.to);
    return {
      label: String(s.label || ''),
      ground: s.ground && typeof s.ground === 'object' ? { x: num(s.ground.x, 0), y: num(s.ground.y, 0), w: num(s.ground.w, 6, 1, 40), d: num(s.ground.d, 5, 1, 40) } : null,
      raw, boxes: applySubtractions(raw), leaders, arrows,
    };
  });
  const cols = Math.min(Math.max(1, Math.floor(Number(spec.cols)) || MASSING_COLS), Math.max(1, steps.length)); // spec.cols: 출력 칸의 비율에 맞춰 정할 때(page.js)
  const rows = Math.ceil(steps.length / cols) || 1;
  const titleH = spec.title ? 60 : 0;
  const W = cols * PW; const H = titleH + rows * PH;

  // 모든 단계가 같은 배율/위치를 쓰도록 전체 경계를 먼저 구한다(단계 간 크기 비교가 되게).
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const grow = (p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); };
  const growBox = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]].forEach(([px, py]) => { grow(proj(px, py, b.z)); grow(proj(px, py, b.z + b.h)); });
  steps.forEach((s) => {
    s.boxes.forEach((b) => {
      growBox(b);
      if (b.move) [[b.x, b.y], [b.x + b.w, b.y + b.d]].forEach(([px, py]) => grow(proj(px, py, b.z + (b.move === 'up' ? b.len : -b.len))));
    });
    s.arrows.forEach((a) => { grow(proj(a.from[0], a.from[1], a.from[2])); grow(proj(a.to[0], a.to[1], a.to[2])); });
    const g = s.ground;
    if (g) [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.d], [g.x + g.w, g.y + g.d]].forEach(([px, py]) => grow(proj(px, py, 0)));
  });
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const cxm = (minX + maxX) / 2;

  // 지시선 라벨을 둘 좌우 칸: 어느 단계든 있으면 모든 단계에 같은 폭을 비워 둔다(크기 비교가 어긋나지 않게)
  const anchorOf = (s, l) => (l.box >= 0 ? (() => { const b = s.raw[l.box]; return proj(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h); })() : proj(l.at[0], l.at[1], l.at[2]));
  const labW = (l) => Math.min(112, tw(l.label, 11.5) + (l.icon ? 22 : 0) + 18);
  let leftW = 0; let rightW = 0;
  steps.forEach((s) => s.leaders.forEach((l) => { const side = l.side || (anchorOf(s, l)[0] < cxm ? 'left' : 'right'); l.sideUsed = side; if (side === 'left') leftW = Math.max(leftW, labW(l)); else rightW = Math.max(rightW, labW(l)); }));
  const x0 = 14 + (leftW ? leftW + 10 : 0); const availW = PW - 14 - x0 - (rightW ? rightW + 10 : 0) - (leftW || rightW ? 0 : 20);
  const availH = PH - HEAD - 26;
  const k = Math.min(availW / (maxX - minX || 1), availH / (maxY - minY || 1), 1.6);
  const offX = x0 + (availW - (maxX - minX) * k) / 2 - minX * k;
  const offY = HEAD + (availH - (maxY - minY) * k) / 2 - minY * k;
  const T = (p) => [offX + p[0] * k, offY + p[1] * k];

  const panels = steps.map((s, i) => {
    const ox = (i % cols) * PW; const oy = titleH + Math.floor(i / cols) * PH;
    const parts = [];
    if (s.ground) {
      const g = s.ground; const pad = 0.6;
      const pts = [proj(g.x - pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y + g.d + pad, 0), proj(g.x - pad, g.y + g.d + pad, 0)];
      parts.push(`<polygon points="${poly(pts)}" fill="${lighter(accent, 0.35)}" fill-opacity="0.75" stroke="${darker(accent, 0.45)}" stroke-width="1" stroke-dasharray="1.6 2.6"/>`);
    }
    // 흐린 주변 매스(대지 맥락): 윤곽 없이 옅은 회색 입체
    context.forEach((c) => {
      const x1 = c.x + c.w; const y1 = c.y + c.d; const z1 = c.h;
      parts.push(`<polygon points="${poly([proj(c.x, y1, 0), proj(x1, y1, 0), proj(x1, y1, z1), proj(c.x, y1, z1)])}" fill="#E4E6E9"/><polygon points="${poly([proj(x1, c.y, 0), proj(x1, y1, 0), proj(x1, y1, z1), proj(x1, c.y, z1)])}" fill="#EEF0F2"/><polygon points="${poly([proj(c.x, c.y, z1), proj(x1, c.y, z1), proj(x1, y1, z1), proj(c.x, y1, z1)])}" fill="#F6F7F8"/>`);
    });
    const sorted = s.boxes.map((b, idx) => ({ b, idx })).sort((p, q) => {
      // 뒤(작은 x+y) → 앞(큰 x+y) 순으로 그리되, 위로 뜬 박스는 아래 박스 위에 겹쳐 그려지도록 z 도 더한다.
      const kp = p.b.x + p.b.w + p.b.y + p.b.d + p.b.z + p.b.h; const kq = q.b.x + q.b.w + q.b.y + q.b.d + q.b.z + q.b.h;
      return kp - kq || p.b.z - q.b.z;
    });
    sorted.forEach(({ b, idx }) => {
      parts.push(boxSvg(b, accent));
      parts.push(arrowsSvg(b, `m${i}_${idx}`));
    });
    const over = []; // 배율 밖에서(선 굵기가 일정하게) 그리는 것: 화살표·지시선·제목 띠
    // 진입·동선 화살표(색 테마): 흰 테두리를 깔고 굵은 색 선 + 같은 색 화살촉
    const defs = [];
    s.arrows.forEach((a, j) => {
      const p0 = T(proj(a.from[0], a.from[1], a.from[2])); const p1 = T(proj(a.to[0], a.to[1], a.to[2])); const mid = `ma${i}_${j}`;
      defs.push(`<marker id="${mid}" viewBox="0 0 10 10" refX="6.5" refY="5" markerWidth="4.4" markerHeight="4.4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${a.color}"/></marker>`);
      over.push(`<line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="#fff" stroke-width="6.4" stroke-linecap="round" opacity="0.85"/><line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${a.color}" stroke-width="3" stroke-linecap="round"${a.dash ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${mid})"/>`);
    });
    // 프로그램 지시선: 좌우 열에 라벨 칩을 늘어놓고 점선으로 매스의 위치에 잇는다
    ['left', 'right'].forEach((side) => {
      const list = s.leaders.filter((l) => l.sideUsed === side).map((l) => ({ l, a: T(anchorOf(s, l)) })).sort((p, q) => p.a[1] - q.a[1]);
      const ys = list.map((it) => Math.max(HEAD + 6, Math.min(PH - 34, it.a[1] - 12)));
      for (let q = 1; q < ys.length; q++) ys[q] = Math.max(ys[q], ys[q - 1] + 30);
      for (let q = ys.length - 2; q >= 0; q--) ys[q] = Math.min(ys[q], ys[q + 1] - 30);
      list.forEach((it, q) => {
        const { l, a } = it; const w = labW(l); const y = Math.max(HEAD + 4, ys[q]); const x = side === 'left' ? 14 : PW - 14 - w; const lc = l.color || '#3a3f47';
        const sx = side === 'left' ? x + w : x; const sy = y + 12;
        over.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${a[0].toFixed(1)}" y2="${a[1].toFixed(1)}" stroke="${lc}" stroke-width="1.2" ${l.color ? '' : 'stroke-dasharray="2 3" '}stroke-linecap="round"/><circle cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="2.8" fill="${lc}" stroke="#fff" stroke-width="1"/>`);
        over.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="24" rx="6" fill="#fff" stroke="${lc}" stroke-width="1.2"/>`);
        const tx = x + (l.icon ? 28 : 9);
        if (l.icon) over.push(`<g transform="translate(${(x + 7).toFixed(1)} ${(y + 4).toFixed(1)}) scale(0.8)">${iconGlyph(l.icon, lc)}</g>`);
        over.push(`<text x="${tx.toFixed(1)}" y="${(y + 16).toFixed(1)}" font-family="${FONT}" font-size="11.5" font-weight="700" fill="#222">${esc(l.label)}</text>`);
      });
    });
    // 제목 띠: [STEP n] + 한 줄 제목
    const sw = numbering ? 58 : 0; const tAvail = PW - 24 - sw - 22;
    let title = s.label; while (title.length > 1 && tw(title, 13.5) > tAvail) title = title.slice(0, -1);
    if (title !== s.label) title = `${title.slice(0, -1)}…`;
    const head = `<rect x="12" y="10" width="${PW - 24}" height="28" fill="#EEF0F2"/>${numbering ? `<rect x="12" y="10" width="${sw}" height="28" fill="#3a3f47"/><text x="${12 + sw / 2}" y="29" text-anchor="middle" font-family="${FONT}" font-size="12.5" font-weight="800" fill="#fff" letter-spacing="0.6">STEP ${i + 1}</text>` : ''}<text x="${12 + sw + 10}" y="29" font-family="${FONT}" font-size="13.5" font-weight="700" fill="#1f1f1f">${esc(title)}</text>`;
    return `<g transform="translate(${ox} ${oy})"><defs>${defs.join('')}<clipPath id="mclip${i}"><rect x="0" y="${HEAD - 4}" width="${PW}" height="${PH - HEAD + 4}"/></clipPath></defs><g clip-path="url(#mclip${i})"><g transform="translate(${offX.toFixed(1)} ${offY.toFixed(1)}) scale(${k.toFixed(3)})">${parts.join('')}</g></g>${over.join('')}${head}</g>`;
  }).join('');
  const title = spec.title ? `<text x="24" y="40" font-family="${FONT}" font-size="24" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${panels}</svg>`;
  return { svg, width: W, height: H };
}

// ── 선 도식 스타일(채움 없음, 단선): '이미지 → 깔끔한 선'에서 복잡한 칸을 구조로 단순화해 다시 그릴 때 쓴다 ──
// boxes: [{x,y,z,w,d,h}], ground: {x,y,w,d}. 반환: (w x h) 안에 맞춘 <g> 조각과 그 안에서 쓴 선 굵기.
export function renderMassingLineGroup(boxes, ground, w, h, strokeUnit = 1.6) {
  const bs = (Array.isArray(boxes) ? boxes : []).slice(0, 24).map(normBox);
  const g = ground && typeof ground === 'object' ? { x: num(ground.x, 0), y: num(ground.y, 0), w: num(ground.w, 6, 1, 40), d: num(ground.d, 5, 1, 40) } : null;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const grow = (p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); };
  bs.forEach((b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]].forEach(([px, py]) => { grow(proj(px, py, b.z)); grow(proj(px, py, b.z + b.h)); }));
  if (g) [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.d], [g.x + g.w, g.y + g.d]].forEach(([px, py]) => grow(proj(px, py, 0)));
  if (!Number.isFinite(minX)) return '';
  const k = Math.min((w * 0.92) / (maxX - minX || 1), (h * 0.92) / (maxY - minY || 1));
  const offX = (w - (maxX - minX) * k) / 2 - minX * k; const offY = (h - (maxY - minY) * k) / 2 - minY * k;
  const sw = (strokeUnit / k).toFixed(3); const swThin = ((strokeUnit * 0.55) / k).toFixed(3);
  const parts = [];
  if (g) {
    const pad = 0.5;
    const pts = [proj(g.x - pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y + g.d + pad, 0), proj(g.x - pad, g.y + g.d + pad, 0)];
    parts.push(`<polygon points="${poly(pts)}" fill="#fff" stroke="#1d1d1d" stroke-width="${swThin}" stroke-linejoin="round"/>`);
  }
  bs.map((b, idx) => ({ b, idx })).sort((p, q) => {
    const kp = p.b.x + p.b.w + p.b.y + p.b.d + p.b.z + p.b.h; const kq = q.b.x + q.b.w + q.b.y + q.b.d + q.b.z + q.b.h;
    return kp - kq || p.b.z - q.b.z;
  }).forEach(({ b }) => {
    const x1 = b.x + b.w; const y1 = b.y + b.d; const z1 = b.z + b.h;
    const top = [proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, y1, z1), proj(b.x, y1, z1)];
    const left = [proj(b.x, y1, b.z), proj(x1, y1, b.z), proj(x1, y1, z1), proj(b.x, y1, z1)];
    const right = [proj(x1, b.y, b.z), proj(x1, y1, b.z), proj(x1, y1, z1), proj(x1, b.y, z1)];
    const st = `fill="#fff" stroke="#1d1d1d" stroke-width="${swThin}" stroke-linejoin="round"`;
    parts.push(`<polygon points="${poly(left)}" ${st}/><polygon points="${poly(right)}" ${st}/><polygon points="${poly(top)}" ${st}/>`);
    // 바깥 윤곽(위 마름모의 뒤쪽 두 변 + 양쪽 세로 모서리 + 아래 앞쪽 두 변)은 굵게
    const bold = `fill="none" stroke="#1d1d1d" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
    const hex = [proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, b.y, b.z + 0), proj(x1, y1, b.z), proj(b.x, y1, b.z), proj(b.x, y1, z1)];
    parts.push(`<polygon points="${poly([proj(b.x, y1, z1), proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, y1, z1), proj(x1, y1, b.z), proj(b.x, y1, b.z)])}" ${bold}/>`);
    void hex;
  });
  return `<g transform="translate(${offX.toFixed(2)} ${offY.toFixed(2)}) scale(${k.toFixed(4)})">${parts.join('')}</g>`;
}
