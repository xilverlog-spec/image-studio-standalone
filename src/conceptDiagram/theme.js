// 스타일 안(색·글씨체·글자 위계): 다 그린 그림의 색 계열을 안의 색으로 바꿔 끼운다(2026-10-26, 명세 docs/superpowers/specs/2026-10-26-스타일안-design.md)
// 순수 함수(DOM 없음). 항상 '새로 그린 SVG' 에서 시작한다(이미 안이 입혀진 SVG 에 다시 입히지 않는다) — 호출 순서: renderSpec → applyTheme → applyEdits.
import { ENGINE_FONT, fontCssOf } from './fonts';

// a1 = 주황 계열 역할, a2 = 청·청록 계열 역할, a3 = 초록 계열 역할. ink = 아주 어두운 글자·선. fontId/ink 가 null 이면 건드리지 않는다.
export const THEMES = [
  { id: 'current', label: '지금 모습', source: '', a1: null, a2: null, a3: null, ink: null, fontId: null, titleK: 1 },
  { id: 'blue', label: '참고 A형 — 파랑 중심', source: '참고삽도 A형', a1: '#DFA837', a2: '#2F4E9A', a3: '#7BA23A', ink: '#231815', fontId: 'pretendard', titleK: 1.1 },
  { id: 'mono', label: '먹색 정돈형 — 포인트 하나', source: '', a1: '#E8832A', a2: '#5F6670', a3: '#8A9097', ink: '#1F2328', fontId: 'noto', titleK: 1 },
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const toHsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  let h = 0; let s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
};
const toHex = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m0 = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r + m0, g + m0, b + m0].map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
// 앱의 기준색(지금 렌더러들이 쓰는 대표색): 이 색과의 명도·채도 차이를 안의 색에 그대로 옮긴다
const REF = { a1: toHsl('#F28C28'), a2: toHsl('#1E90C8'), a3: toHsl('#3E8E41') };
const familyOf = (h) => (h >= 15 && h < 70 ? 'a1' : h >= 70 && h < 165 ? 'a3' : h >= 165 && h < 255 ? 'a2' : null);

function mapColor(hex, th) {
  const [h, s, l] = toHsl(hex);
  if (s < 0.15 || (l < 0.3 && s < 0.35) || (l > 0.93 && s < 0.5)) { // 무채색(어두운 청회색 글자색·거의 흰 옅은 색 포함): 아주 어두운 것만 안의 먹색 쪽으로
    if (l < 0.2 && th.ink) { const [ih, is, il] = toHsl(th.ink); return toHex(ih, is, clamp(il + (l - 0.13), 0.02, 0.3)); }
    return hex;
  }
  const f = familyOf(h); if (!f || !th[f]) return hex;
  const [th_, ts, tl] = toHsl(th[f]); const [, rs, rl] = REF[f];
  // 명도: 기준색 명도(rl)가 안의 색 명도(tl)로 가고, 0→0·1→1 은 그대로인 구간 선형 대응(옅은 면이 흰색으로 쏠리거나 어두운 색이 까맣게 뭉치지 않게)
  const nl = l >= rl ? tl + (l - rl) * ((1 - tl) / (1 - rl)) : tl * (l / rl);
  return toHex(th_, clamp(ts * Math.min(1.5, s / rs)), clamp(nl, 0.04, 0.985));
}

// 태그 단위로 훑어 fill·stroke·stop-color·flood-color 와 style 안의 #RRGGBB 만 바꾼다. 편집 손잡이(data-handle)·편집 표시(data-ui)·히트 영역 태그는 건드리지 않는다.
export function applyTheme(svg, themeId) {
  const th = themeById(themeId); const src = String(svg ?? '');
  if (th.id === 'current') return src;
  const swap = (v) => v.replace(/#[0-9a-fA-F]{6}\b/g, (c) => mapColor(c, th));
  let out = src.replace(/<[^>]+>/g, (tag) => {
    if (/data-handle=|data-ui=|class="hit"/.test(tag)) return tag;
    return tag
      .replace(/\b(fill|stroke|stop-color|flood-color)="(#[0-9a-fA-F]{6})"/g, (m0, k, v) => `${k}="${HEX.test(v) ? swap(v) : v}"`)
      .replace(/\bstyle="([^"]*)"/g, (m0, v) => `style="${swap(v)}"`);
  });
  if (th.fontId) out = out.split(ENGINE_FONT).join(fontCssOf(th.fontId));
  return out;
}
