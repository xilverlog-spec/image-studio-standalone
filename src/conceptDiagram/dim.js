// 치수선: 두 지점 사이의 거리·크기를 적는 선. 양 끝에 직각 눈금(+ 사선 눈금)이 있고 선 가운데에 글자(예: 12,000 · 30m)를 쓴다.
// 손스케치(memo.dim)와 구조형(adds kind 'dim')이 함께 쓴다. 좌표는 모두 "그리는 좌표"(px): (x, y) = 첫 끝점, (tx, ty) = 둘째 끝점.
// 글자는 선을 따라 기울되 항상 위에서 읽히고(뒤집히지 않고), 선 바깥(위쪽)에 놓인다.

export const DIM_COLOR = '#222222';
export const DIM_DEFAULT_TEXT = '10m';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// 배치 계산: 끝점·방향·눈금·글자 자리
export function dimLayout(d) {
  const s = Math.max(6, Number(d.size) || 14); const x = Number(d.x) || 0; const y = Number(d.y) || 0; const tx = Number(d.tx) || 0; const ty = Number(d.ty) || 0;
  const len = Math.hypot(tx - x, ty - y); const ux = len > 1e-6 ? (tx - x) / len : 1; const uy = len > 1e-6 ? (ty - y) / len : 0;
  let deg = (Math.atan2(uy, ux) * 180) / Math.PI; // 글자 방향: 항상 오른쪽 위로 읽히게(-90 < 각도 <= 90)
  if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;
  const r = (deg * Math.PI) / 180; const nx = Math.sin(r); const ny = -Math.cos(r); // 글자 위쪽 방향
  const mx = (x + tx) / 2; const my = (y + ty) / 2; const off = s * 0.75;
  const bar = s * 0.55; const slash = s * 0.42; // 직각 눈금의 반길이, 사선 눈금의 반길이
  const px = -uy; const py = ux; // 선에 직각인 방향
  return { s, len, ux, uy, deg, bar, slash, p1: [x, y], p2: [tx, ty], mid: [mx, my], text: [mx + nx * off, my + ny * off], px, py, w: Math.max(len, 1), h: s * 2 };
}

// 눌러 고를 수 있는 바깥 상자 [x0, y0, x1, y1] (끝점과 글자 둘레)
export function dimBox(d) {
  const L = dimLayout(d); const t = String(d.text ?? ''); const tw = [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? L.s : L.s * 0.58), 0);
  const xs = [L.p1[0], L.p2[0], L.text[0] - tw / 2, L.text[0] + tw / 2]; const ys = [L.p1[1], L.p2[1], L.text[1] - L.s * 0.6, L.text[1] + L.s * 0.6];
  const m = L.bar;
  return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
}

// 그림(SVG 조각). id·interactive 가 있으면 눌러서 고를 수 있게(data-eid) 투명한 굵은 선을 더한다. halo 가 있으면 글자 둘레에 바탕색 테두리(읽기 쉽게)
export function dimSvg(d, { id = '', interactive = false, font = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif", halo = '' } = {}) {
  const L = dimLayout(d); const col = /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : DIM_COLOR; const sw = Math.max(1, L.s * 0.09);
  const [a, b] = [L.p1, L.p2]; const t = String(d.text ?? '');
  const tick = (p) => `<line x1="${f1(p[0] - L.px * L.bar)}" y1="${f1(p[1] - L.py * L.bar)}" x2="${f1(p[0] + L.px * L.bar)}" y2="${f1(p[1] + L.py * L.bar)}"/>`
    + `<line x1="${f1(p[0] - (L.ux + L.px) * L.slash)}" y1="${f1(p[1] - (L.uy + L.py) * L.slash)}" x2="${f1(p[0] + (L.ux + L.px) * L.slash)}" y2="${f1(p[1] + (L.uy + L.py) * L.slash)}" stroke-width="${f1(sw * 1.5)}"/>`;
  const h = halo ? ` paint-order="stroke" stroke="${halo}" stroke-width="3.5" stroke-linejoin="round"` : '';
  const txt = t ? `<text x="${f1(L.text[0])}" y="${f1(L.text[1] + L.s * 0.35)}" text-anchor="middle" transform="rotate(${f1(L.deg)} ${f1(L.text[0])} ${f1(L.text[1])})" font-family="${font}" font-size="${f1(L.s)}" font-weight="600" fill="${col}"${h}>${esc(t)}</text>` : '';
  const hit = interactive ? `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="transparent" stroke-width="${f1(Math.max(14, L.s))}" stroke-linecap="round"/>` : '';
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}>${hit}<g stroke="${col}" stroke-width="${f1(sw)}" stroke-linecap="round" fill="none"><line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>${tick(a)}${tick(b)}</g>${txt}</g>`;
}
