// 화면 배치·확대 계산(순수 함수). 화면(React)과 분리해 두어 점검 스크립트가 그대로 시험한다.

// ── 편집기 | 페이지 나란히 보기의 분할선 ──
export const SPLIT_DEFAULT = 0.6;       // 편집기가 차지하는 몫(0~1). 예전에는 1.3 : 1 (약 0.565)
export const SPLIT_MIN = 0.3;
export const SPLIT_MAX = 0.85;
export const SPLIT_DIV_W = 14;          // 분할선(끄는 손잡이) 폭 px
export const EDITOR_MIN_W = 664;        // 편집기 한 줄이 깨지지 않는 최소 폭: 그림 360 + 사이 14 + 속성 패널 290
export const PAGE_MIN_W = 240;          // 페이지 미리보기의 최소 폭

// 편집기 몫을 허용 범위 안으로 넣는다. avail = 분할선을 뺀 가로폭(px), minL/minR = 양쪽 최소 폭(px).
// 두 최소 폭이 다 들어가지 않을 만큼 좁으면 편집기 쪽을 먼저 지킨다.
export function clampSplit(r, avail, minL = 0, minR = 0) {
  let v = Number.isFinite(r) ? r : SPLIT_DEFAULT;
  v = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v));
  if (avail > 0) {
    const lo = minL / avail; const hi = 1 - minR / avail;
    v = lo > hi ? lo : Math.min(hi, Math.max(lo, v));
  }
  return v;
}

// 끌고 있는 마우스 위치(x)에서 편집기 몫을 구한다. left/width = 두 칸을 담은 영역의 왼쪽 끝·전체 폭
export function splitFromPointer(x, left, width, divW = SPLIT_DIV_W) {
  const avail = width - divW; if (!(avail > 0)) return SPLIT_DEFAULT;
  return (x - left - divW / 2) / avail;
}

// grid-template-columns 값. fr 합이 1 미만이면 남는 폭을 다 쓰지 못하므로 정수 천분율로 합을 1000 으로 맞춘다
export function splitColumns(r, divW = SPLIT_DIV_W) {
  const a = Math.round(r * 1000);
  return `minmax(0, ${a}fr) ${divW}px minmax(0, ${1000 - a}fr)`;
}

// ── 편집 그림 확대·이동 ──
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4];

export function clampZoom(z) {
  const v = Math.round((Number.isFinite(z) ? z : 1) * 100) / 100;
  if (v < 1.03) return ZOOM_MIN; // 1 에 가까우면 100%(맞춤)로 붙인다
  return Math.min(ZOOM_MAX, v);
}

// 버튼으로 한 단계 확대(+1)·축소(-1)
export function stepZoom(z, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.005) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.005) ?? ZOOM_MIN;
}

// Ctrl+휠(또는 터치패드 두 손가락 벌리기). 마우스 휠 한 칸(deltaY 100)이 약 1.22배
export function wheelZoom(z, deltaY, deltaMode = 0) {
  const d = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return clampZoom(z * Math.exp(-d * 0.002));
}

// 배율이 z0 → z1 로 바뀔 때, 보는 창 안의 한 점(px, py)에 있던 그림 위치가 그대로 그 자리에 남도록 스크롤 위치를 구한다.
// 내용의 가로·세로가 배율에 비례해 커진다고 본다(그림의 가로세로비가 고정이므로).
export function anchorScroll({ left, top, px, py, z0, z1 }) {
  const k = z1 / z0;
  return { left: Math.max(0, (left + px) * k - px), top: Math.max(0, (top + py) * k - py) };
}
