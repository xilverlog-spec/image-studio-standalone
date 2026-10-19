// 요소 회전 계산(순수 함수). 각도는 도(°)이고 화면에서 시계 방향이 +(SVG rotate() 와 같다). 손스케치·구조형 편집기가 함께 쓴다.

export const normDeg = (a) => { // -180 ~ 180 으로, 소수 둘째 자리까지. 0 은 항상 +0
  let v = Number(a); if (!Number.isFinite(v)) return 0;
  v = ((v % 360) + 360) % 360; if (v > 180) v -= 360;
  v = Math.round(v * 100) / 100; return v === 0 ? 0 : v;
};
const rad = (d) => (d * Math.PI) / 180;
export const rotPt = (p, deg, c = [0, 0]) => { // 점 p 를 c 둘레로 deg 만큼 돌린다
  const t = rad(deg); const co = Math.cos(t); const si = Math.sin(t); const x = p[0] - c[0]; const y = p[1] - c[1];
  return [c[0] + x * co - y * si, c[1] + x * si + y * co];
};
export const rectCenter = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];

// 각도 맞추기: step(예 15) 이 있으면 그 배수로, soft 이면 45° 배수에서 tol° 안일 때만 붙는다(0·90·180 근처에서 살짝 멈추는 느낌)
export function snapDeg(a, { step = 0, soft = false, tol = 3 } = {}) {
  const v = normDeg(a);
  if (step > 0) return normDeg(Math.round(v / step) * step);
  if (soft) { const n = Math.round(v / 45) * 45; if (Math.abs(v - n) <= tol) return normDeg(n); }
  return v;
}

// 회전한 사각형의 네 꼭짓점과 그것을 감싸는 가로세로 상자([x0,y0,x1,y1])
export function rectCorners(rect, deg = 0) {
  const c = rectCenter(rect); const pts = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
  return deg ? pts.map((p) => rotPt(p, deg, c)) : pts;
}
export function rectBBox(rect, deg = 0) {
  if (!deg) return [...rect];
  const q = rectCorners(rect, deg); const xs = q.map((p) => p[0]); const ys = q.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// 회전한 사각형의 크기를 바꾼 뒤 화면에서 튀지 않게 맞춘다. 회전 중심은 항상 사각형 가운데로 저장하므로, 크기를 바꾸면 중심이 옮겨 가 도형이 미끄러진다.
// 옛 중심 둘레로 돌려 놓았을 때의 보이는 가운데로 새 사각형을 옮겨, 바꾸지 않은 쪽 모서리가 화면에서 제자리에 남게 한다.
export function rotRectKeep(oldRect, newRect, deg) {
  if (!deg) return newRect;
  const co = rectCenter(oldRect); const cn = rectCenter(newRect); const v = rotPt(cn, deg, co);
  const s = [v[0] - cn[0], v[1] - cn[1]];
  return [newRect[0] + s[0], newRect[1] + s[1], newRect[2] + s[0], newRect[3] + s[1]];
}

// 크기 조절 점(n, ne, e, se, s, sw, w, nw)의 마우스 커서 모양: 도형이 돌아간 만큼 커서 방향도 돌린다
const DIR = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
const CUR = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
export function rotCursor(handle, deg = 0) {
  if (!(handle in DIR)) return 'move';
  const a = (((DIR[handle] + deg) % 180) + 180) % 180;
  return CUR[Math.round(a / 45) % 4];
}

// SVG transform 문자열을 행렬 [a, b, c, d, e, f] 로(translate·rotate·scale·matrix·skewX·skewY, 왼쪽부터 곱한다). 못 읽으면 단위 행렬
const I6 = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export function parseTransform(str) {
  let m = I6; const re = /(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]*)\)/g; let g;
  while ((g = re.exec(String(str || '')))) {
    const a = g[2].trim().split(/[\s,]+/).filter(Boolean).map(Number); if (a.some((v) => !Number.isFinite(v))) return I6;
    let n = null;
    if (g[1] === 'translate') n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (g[1] === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (g[1] === 'rotate') { const t = rad(a[0] || 0); const c = Math.cos(t); const s = Math.sin(t); n = [c, s, -s, c, 0, 0]; if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]); }
    else if (g[1] === 'matrix' && a.length === 6) n = a;
    else if (g[1] === 'skewX') n = [1, 0, Math.tan(rad(a[0] || 0)), 1, 0, 0];
    else if (g[1] === 'skewY') n = [1, Math.tan(rad(a[0] || 0)), 0, 1, 0, 0];
    if (n) m = mul(m, n);
  }
  return m;
}
export const applyMat = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
