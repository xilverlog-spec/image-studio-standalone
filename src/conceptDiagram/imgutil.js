// 내 이미지(사진·로고·스케치) 다루기 — 화면 없이 시험할 수 있는 계산만 모아 둔다(2026-10-19).
// 사각형은 [x0, y0, x1, y1] (손스케치 블록의 rect 와 같은 모양). 두 축의 단위가 같다고 본다(손스케치의 rect 도 그렇다).

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// 큰 사진을 줄여 담는 정도. tries: [긴 변(px), 투명 배경 유지 여부, JPEG 품질] 순서대로 시도해 limit(글자 수) 안에 들어오는 첫 결과를 쓴다
export const IMG_QUALITY = {
  light: { label: '가볍게 (긴 변 1000px)', tries: [[1000, true, 0.85], [800, false, 0.85], [600, false, 0.8]], limit: 1200000 },
  normal: { label: '보통 (긴 변 1600px)', tries: [[1600, true, 0.9], [1200, true, 0.9], [1600, false, 0.9], [1100, false, 0.9], [800, false, 0.9]], limit: 2800000 },
  high: { label: '선명하게 (긴 변 2600px · 느려질 수 있음)', tries: [[2600, true, 0.92], [2000, true, 0.92], [2600, false, 0.92], [2000, false, 0.92], [1600, false, 0.9], [1100, false, 0.9]], limit: 5500000 },
};
export const imgQualityOf = (id) => IMG_QUALITY[id] || IMG_QUALITY.normal;

// 자르는 범위 [왼쪽, 위, 오른쪽, 아래] (원본 이미지에 대한 0~1 비율). 한 변이 너무 좁아지지 않게 다듬는다. 거의 전체면 null(자르지 않음)
export function normCrop(c, minSize = 0.05) {
  if (!Array.isArray(c) || c.length !== 4 || c.some((v) => !Number.isFinite(Number(v)))) return null;
  let [l, t, r, b] = c.map(Number).map((v) => Math.min(1, Math.max(0, v)));
  if (r < l) [l, r] = [r, l]; if (b < t) [t, b] = [b, t];
  if (r - l < minSize) { const m = (l + r) / 2; l = Math.max(0, Math.min(1 - minSize, m - minSize / 2)); r = l + minSize; }
  if (b - t < minSize) { const m = (t + b) / 2; t = Math.max(0, Math.min(1 - minSize, m - minSize / 2)); b = t + minSize; }
  if (l < 0.002 && t < 0.002 && r > 0.998 && b > 0.998) return null;
  return [r3(l), r3(t), r3(r), r3(b)];
}

// 자르기: 이미지의 보이는 부분이 그대로 제자리에 남도록, 새로 자른 범위만큼 상자를 줄이거나 늘린다(오피스 프로그램의 '자르기'와 같다).
// rect: 지금 보이는 상자, oldCrop: 지금 보이는 범위(없으면 전체 [0,0,1,1]), newCrop: 새 범위. 반환: 새 상자
export function cropRect(rect, oldCrop, newCrop) {
  const o = oldCrop || [0, 0, 1, 1]; const n = newCrop || [0, 0, 1, 1];
  const sx = (rect[2] - rect[0]) / Math.max(1e-6, o[2] - o[0]); const sy = (rect[3] - rect[1]) / Math.max(1e-6, o[3] - o[1]); // 원본 가로·세로 전체가 이 상자 단위로 얼마인지
  const x0 = rect[0] + (n[0] - o[0]) * sx; const y0 = rect[1] + (n[1] - o[1]) * sy;
  return [r2(x0), r2(y0), r2(x0 + (n[2] - n[0]) * sx), r2(y0 + (n[3] - n[1]) * sy)];
}

// 이미지 바꾸기: 새 이미지를 옛 상자 안에 비율을 지키며 가장 크게(가운데) 놓는다. ar = 새 이미지의 가로/세로
export function fitInside(rect, ar) {
  const bw = rect[2] - rect[0]; const bh = rect[3] - rect[1]; const cx = (rect[0] + rect[2]) / 2; const cy = (rect[1] + rect[3]) / 2;
  let w = bw; let h = bw / (ar || 1);
  if (h > bh) { h = bh; w = bh * (ar || 1); }
  return [r2(cx - w / 2), r2(cy - h / 2), r2(cx + w / 2), r2(cy + h / 2)];
}

// 여러 장을 한꺼번에 넣을 때 n 번째(0부터) 이미지를 얼마나 비껴 놓을지(그림 단위). 처음 것은 한가운데
export const stagger = (n, step = 3) => (n > 0 ? ((n - 1) % 8 + 1) * step : 0);
