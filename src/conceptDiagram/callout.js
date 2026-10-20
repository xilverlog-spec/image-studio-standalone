// 리더선 라벨: 굵은 제목 + 밑줄 + 설명(1~3줄) + 끝점이 있는 안내선. 손스케치(memo.callout)와 구조형(adds kind 'callout')이 함께 쓴다.
// 좌표는 모두 "그리는 좌표"(px)다. (x, y) = 글 상자의 왼쪽 위, (tx, ty) = 가리키는 끝점.

export const CALLOUT_LINES = ['straight', 'elbow'];   // 직선 / 꺾은선(가로 → 세로)
export const CALLOUT_ENDS = ['dot', 'arrow', 'none']; // 끝점 모양
export const CALLOUT_COLOR = '#222222';
export const CALLOUT_MAX_DESC = 3;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// 글자 폭 어림(한글·한자는 글자 크기만큼, 영문·숫자는 0.58배, 공백은 0.32배)
export const textW = (t, size) => [...String(t ?? '')].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? size : /\s/.test(ch) ? size * 0.32 : size * 0.58), 0);

// 설명 줄: 줄바꿈으로 나누고 빈 줄은 버리며 3줄까지
export const descLines = (desc) => String(desc ?? '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, CALLOUT_MAX_DESC);

// 배치 계산: 글 상자(w, h)·줄별 위치·밑줄·안내선 꼭짓점
export function calloutLayout(c) {
  const s = Math.max(8, Number(c.size) || 14); const ds = s * 0.78; const x = Number(c.x) || 0; const y = Number(c.y) || 0;
  const title = String(c.title ?? ''); const dl = descLines(c.desc);
  const w = Math.max(s * 4, textW(title, s) * 1.08 + s * 0.4, ...dl.map((l) => textW(l, ds) + ds * 0.3));
  const ry = y + s * 1.3; // 밑줄 높이
  const lines = [];
  if (title) lines.push({ t: title, x, y: y + s * 0.92, size: s, bold: true });
  dl.forEach((t, i) => lines.push({ t, x, y: ry + s * 0.3 + ds * 0.92 + i * ds * 1.36, size: ds, bold: false }));
  const bottom = dl.length ? ry + s * 0.3 + ds * 0.92 + (dl.length - 1) * ds * 1.36 + ds * 0.32 : ry + s * 0.25;
  const T = [Number(c.tx) || 0, Number(c.ty) || 0];
  const right = T[0] >= x + w / 2; // 끝점이 오른쪽에 가까우면 밑줄의 오른쪽 끝에서, 아니면 왼쪽 끝에서 나간다
  const S = right ? [x + w, ry] : [x, ry];
  let pts = [S, T];
  if (c.line === 'elbow') { const out = right ? T[0] > S[0] : T[0] < S[0]; if (out && Math.abs(T[1] - S[1]) > 0.5) pts = [S, [T[0], S[1]], T]; } // 밖으로 나가는 쪽일 때만 꺾는다(아니면 직선)
  return { x, y, w, h: bottom - y, s, ds, lines, rule: [x, ry, x + w, ry], pts, S, T };
}

// 글 상자와 끝점을 모두 감싸는 사각형 [x0, y0, x1, y1]
export function calloutBox(c) {
  const L = calloutLayout(c); const r = Math.max(4, L.s * 0.3);
  return [Math.min(L.x, L.T[0] - r), Math.min(L.y, L.T[1] - r), Math.max(L.x + L.w, L.T[0] + r), Math.max(L.y + L.h, L.T[1] + r)];
}

// 그림(SVG 조각). id·interactive 가 있으면 눌러서 고를 수 있게(data-eid) 투명한 눌림 영역을 더한다
export function calloutSvg(c, { id = '', interactive = false, font = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif", halo = '' } = {}) {
  const L = calloutLayout(c); const col = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : CALLOUT_COLOR; const sw = Math.max(1.2, L.s * 0.1);
  const h = halo ? ` paint-order="stroke" stroke="${halo}" stroke-width="3.5" stroke-linejoin="round"` : '';
  const txt = L.lines.map((l) => `<text x="${f1(l.x)}" y="${f1(l.y)}" font-family="${font}" font-size="${f1(l.size)}" font-weight="${l.bold ? 800 : 500}" fill="${col}"${l.bold ? '' : ' fill-opacity="0.8"'}${h}>${esc(l.t)}</text>`).join('');
  const rule = `<line x1="${f1(L.rule[0])}" y1="${f1(L.rule[1])}" x2="${f1(L.rule[2])}" y2="${f1(L.rule[3])}" stroke="${col}" stroke-width="${f1(sw * 0.85)}" stroke-linecap="round"/>`;
  const poly = `<polyline points="${L.pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${f1(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  let end = '';
  if (c.end === 'arrow') {
    const a = L.pts[L.pts.length - 2]; const t = L.T; const dx = t[0] - a[0]; const dy = t[1] - a[1]; const len = Math.hypot(dx, dy) || 1; const ux = dx / len; const uy = dy / len; const hl = Math.max(8, L.s * 0.75); const hw = hl * 0.38;
    end = `<polygon points="${f1(t[0])},${f1(t[1])} ${f1(t[0] - ux * hl - uy * hw)},${f1(t[1] - uy * hl + ux * hw)} ${f1(t[0] - ux * hl + uy * hw)},${f1(t[1] - uy * hl - ux * hw)}" fill="${col}"/>`;
  } else if (c.end !== 'none') end = `<circle cx="${f1(L.T[0])}" cy="${f1(L.T[1])}" r="${f1(Math.max(2.8, L.s * 0.27))}" fill="${col}"/>`;
  let hit = '';
  if (interactive) hit = `<rect x="${f1(L.x - 4)}" y="${f1(L.y - 4)}" width="${f1(L.w + 8)}" height="${f1(L.h + 8)}" fill="transparent"/><polyline points="${L.pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="none" stroke="transparent" stroke-width="12" stroke-linejoin="round"/>`;
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}>${hit}${rule}${poly}${end}${txt}</g>`;
}
