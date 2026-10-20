// 내 이미지 효과: 탈색(회색조로) · 가장자리 흐리게(페이드). 원본 이미지는 그대로 두고 SVG 필터·마스크로 겹쳐 그리므로 언제든 되돌릴 수 있다.
// 손스케치(blocks[].kind 'image')와 구조형(adds kind 'image')이 함께 쓴다. 좌표는 이미지의 그리는 좌표(돌려도 같은 좌표계에서 계산된다).

export const clampPct = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
// "맥락 바탕으로 흐리게" 한 번에 설정: 완전 탈색 + 투명도 35% (맨 뒤로는 호출하는 쪽이 정한다)
export const CONTEXT_FX = { gray: 100, opacity: 0.35, edge: 0 };
export const hasFx = (o) => clampPct(o?.gray) > 0 || clampPct(o?.edge) > 0;

const f = (n) => (Math.round(n * 100) / 100).toString();

// { defs: <filter>·<mask> 문자열, attrs: <image> 에 붙일 ' filter="…" mask="…"' }. 둘 다 0 이면 빈 문자열
export function imageFx(id, { x, y, w, h, gray, edge }) {
  const g = clampPct(gray); const e = clampPct(edge); if (!g && !e) return { defs: '', attrs: '' };
  const k = String(id ?? 'i').replace(/[^\w-]/g, '');
  let defs = ''; let attrs = '';
  if (g) { defs += `<filter id="fxg_${k}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${f(1 - g / 100)}"/></filter>`; attrs += ` filter="url(#fxg_${k})"`; }
  if (e) { // 가장자리에서 안쪽으로 서서히 진해지는 마스크: 안쪽으로 들인 흰 사각형을 흐리게(가우시안) 해서 쓴다
    const band = Math.max(1, Math.min(w, h) * 0.25 * (e / 100)); const d = band * 0.9; const sg = band * 0.4;
    defs += `<filter id="fxb_${k}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(sg)}"/></filter><mask id="fxm_${k}" maskUnits="userSpaceOnUse" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"><rect x="${f(x + d)}" y="${f(y + d)}" width="${f(Math.max(1, w - 2 * d))}" height="${f(Math.max(1, h - 2 * d))}" fill="#fff" filter="url(#fxb_${k})"/></mask>`;
    attrs += ` mask="url(#fxm_${k})"`;
  }
  return { defs, attrs };
}
