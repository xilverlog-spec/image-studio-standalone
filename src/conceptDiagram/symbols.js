// 도면 기호: 방위표(N 화살표)와 축척 막대. 손스케치(memo.symbol)와 구조형(adds kind 'north'|'scale')이 함께 쓴다.
// 좌표는 그리는 좌표(px). 방위표는 (cx, cy) 가 원의 가운데, 축척 막대는 (x, y) 가 막대의 왼쪽 위.

export const NORTH_STYLES = ['circle', 'arrow'];
export const NORTH_STYLE_LABEL = { circle: '원 + 화살표', arrow: '화살표만' };
export const SCALE_UNITS = ['m', 'km', 'cm', 'mm'];
export const SYMBOL_COLOR = '#222222';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s || '');
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// 어떤 입력이든 올바른 막대 설정으로
export function normalizeScale(o) {
  const s = o && typeof o === 'object' ? o : {};
  return { segs: Math.round(num(s.segs, 2, 5, 4)), total: num(s.total, 0.1, 100000, 50), unit: SCALE_UNITS.includes(s.unit) ? s.unit : 'm' };
}
export const scaleLabel = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : String(Math.round(r * 10) / 10); };

// 방위표: size = 원 지름. rot(°)만큼 가운데 둘레로 돈다(N 글자도 함께). 왼쪽 반은 채우고 오른쪽 반은 윤곽선만
export function northSvg({ cx, cy, size, color = SYMBOL_COLOR, rot = 0, style = 'circle', id = '', interactive = false }) {
  const col = isHex(color) ? color : SYMBOL_COLOR; const r = size / 2; const a = r * (style === 'arrow' ? 1 : 0.82); const sw = Math.max(1.2, size * 0.04);
  const ring = style === 'circle' ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="${col}" stroke-width="${f1(sw)}"/>` : '';
  const left = `M${f1(cx)},${f1(cy - a)} L${f1(cx - a * 0.38)},${f1(cy + a * 0.62)} L${f1(cx)},${f1(cy + a * 0.3)} Z`;
  const right = `M${f1(cx)},${f1(cy - a)} L${f1(cx + a * 0.38)},${f1(cy + a * 0.62)} L${f1(cx)},${f1(cy + a * 0.3)} Z`;
  const ny = cy - r - size * (style === 'arrow' ? 0.06 : 0.1);
  const hit = interactive ? `<rect x="${f1(cx - r)}" y="${f1(cy - r - size * 0.45)}" width="${f1(size)}" height="${f1(size * 1.45)}" fill="transparent"/>` : '';
  const tf = rot ? ` transform="rotate(${f1(rot)} ${f1(cx)} ${f1(cy)})"` : '';
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}${tf}>${hit}${ring}<path d="${left}" fill="${col}"/><path d="${right}" fill="#FFFFFF" stroke="${col}" stroke-width="${f1(sw * 0.8)}" stroke-linejoin="round"/><text x="${f1(cx)}" y="${f1(ny)}" text-anchor="middle" font-family="${FONT}" font-size="${f1(size * 0.34)}" font-weight="800" fill="${col}">N</text></g>`;
}

// 축척 막대: w = 막대 전체 길이(px), 같은 칸 segs 개를 검정/흰색으로 번갈아 칠하고 칸 경계마다 눈금 글자(0 … total+단위)
export function scaleBarSvg({ x, y, w, segs, total, unit, size = 14, color = SYMBOL_COLOR, id = '', interactive = false }) {
  const col = isHex(color) ? color : SYMBOL_COLOR; const sc = normalizeScale({ segs, total, unit }); const h = Math.max(4, size * 0.45); const sw = w / sc.segs;
  const bars = Array.from({ length: sc.segs }, (_, i) => `<rect x="${f1(x + i * sw)}" y="${f1(y)}" width="${f1(sw)}" height="${f1(h)}" fill="${i % 2 ? '#FFFFFF' : col}" stroke="${col}" stroke-width="${f1(Math.max(1, size * 0.07))}"/>`).join('');
  const labels = Array.from({ length: sc.segs + 1 }, (_, i) => `<text x="${f1(x + i * sw)}" y="${f1(y + h + size * 1.05)}" text-anchor="middle" font-family="${FONT}" font-size="${f1(size)}" font-weight="600" fill="${col}">${esc(scaleLabel((sc.total * i) / sc.segs))}${i === sc.segs ? esc(sc.unit) : ''}</text>`).join('');
  const hit = interactive ? `<rect x="${f1(x - size)}" y="${f1(y - size * 0.3)}" width="${f1(w + size * 2)}" height="${f1(h + size * 1.8)}" fill="transparent"/>` : '';
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}>${hit}${bars}${labels}</g>`;
}
// 막대가 차지하는 높이(px): 선택 틀 계산용
export const scaleBarHeight = (size) => Math.max(4, size * 0.45) + size * 1.4;
