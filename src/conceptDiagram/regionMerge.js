// AI 이미지 편집 결과에서 '이 영역만 다시 그리기'를 한 뒤, 새로 그린 조각(화살표·구역 색 마스크)을 지금 화면의 그림에 합친다.
// 영역 밖은 건드리지 않아서, 사용자가 이미 손으로 고친 다른 부분이 그대로 남는다.
import { arrowsToWinds } from './sketch';

// ── 색 → 색 띠(서버의 diagram_edit/diagram_vector 와 같은 기준) ──
export function hueOf(hex) {
  const n = parseInt(String(hex).slice(1), 16); const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h;
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const BANDS = [['red', 0, 17], ['orange', 17, 45], ['yellow', 45, 70], ['green', 70, 155], ['blue', 190, 260], ['purple', 260, 317], ['red', 344, 361]]; // PIL HSV(0~255)의 색 띠를 도(°)로
export function bandOf(hex) {
  const h = hueOf(hex); const hit = BANDS.find(([, lo, hi]) => h >= lo && h < hi);
  return hit ? hit[0] : '';
}

// ── 화살표 ──
// region: [x0, y0, x1, y1] 그림 화소. arrows: 서버가 돌려준 새 화살표(그림 화소 좌표). 영역 안(점들의 평균이 영역 안)의 옛 화살표는 지우고 새 화살표(역시 영역 안에 놓인 것만)를 넣는다.
export function mergeRegionWinds(spec, region, arrows, w) {
  const k = 100 / w; const R = region.map((v) => v * k);
  const mid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const inside = (pts) => { const c = mid(pts); return c[0] >= R[0] && c[0] <= R[2] && c[1] >= R[1] && c[1] <= R[3]; };
  const keep = spec.winds.filter((wd) => !inside(wd.pts));
  const fresh = (arrows || []).filter((a) => Array.isArray(a.pts) && a.pts.length >= 2 && inside(a.pts.map((p) => [p[0] * k, p[1] * k])));
  const palette = [...new Set(keep.map((wd) => wd.color))];
  const colored = fresh.map((a) => { // 새 화살표 색은 지금 그림의 같은 색 계열 화살표 색에 맞춘다(범례와 같은 색으로 유지, 사용자가 바꾼 색도 따라감)
    const h = hueOf(a.color); const near = palette.map((c) => [hueDist(hueOf(c), h), c]).sort((p, q) => p[0] - q[0])[0];
    return near && near[0] < 30 ? { ...a, color: near[1] } : a;
  });
  const added = arrowsToWinds(spec, colored, w, keep);
  return { spec: { ...spec, winds: [...keep, ...added].slice(0, 30) }, removed: spec.winds.length - keep.length, added: added.length };
}

// ── 구역 색 마스크 ──
const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('마스크 이미지를 읽지 못했습니다.')); im.src = url; });

// 영역 안쪽으로 feather 화소에 걸쳐 0 → 1 로 번지는 비율 지도(영역 밖은 0). 경계에서 옛 칠과 새 칠이 갑자기 끊겨 보이지 않게
export function featherMap(mw, mh, rect, feather = 6) {
  const A = new Float32Array(mw * mh);
  const [x0, y0, x1, y1] = rect;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(mh, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(mw, Math.ceil(x1)); x++) {
      const d = Math.min(x + 0.5 - x0, x1 - (x + 0.5), y + 0.5 - y0, y1 - (y + 0.5));
      if (d <= 0) continue;
      const t = Math.min(1, d / Math.max(1, feather)); A[y * mw + x] = t * t * (3 - 2 * t);
    }
  }
  return A;
}
// out = old·(1 − A) + patch·A (픽셀마다)
export const blendMasks = (old, patch, A) => { const out = new Float32Array(old.length); for (let i = 0; i < old.length; i++) out[i] = old[i] * (1 - A[i]) + patch[i] * A[i]; return out; };

function grayOf(img, mw, mh, box) { // 마스크 그림을 mw×mh 에 그려 밝기를 읽는다. box 가 있으면 그 상자 자리(mw×mh 좌표)에만 그린다(나머지는 0)
  const c = document.createElement('canvas'); c.width = mw; c.height = mh; const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, mw, mh);
  if (box) g.drawImage(img, box[0], box[1], box[2] - box[0], box[3] - box[1]); else g.drawImage(img, 0, 0, mw, mh);
  const d = g.getImageData(0, 0, mw, mh).data; const out = new Float32Array(mw * mh);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}
function pngOf(gray, mw, mh) {
  const c = document.createElement('canvas'); c.width = mw; c.height = mh; const g = c.getContext('2d'); const im = g.createImageData(mw, mh);
  for (let i = 0; i < gray.length; i++) { const v = Math.round(Math.min(1, Math.max(0, gray[i])) * 255); im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c.toDataURL('image/png');
}

// patches: [{ color, label, band, blend, box:[x0,y0,x1,y1](잘라 낸 상자, 그림 화소), url }]. 반환: { zones(새 목록), changed }
export async function mergeRegionZones(spec, region, patches, w, h, feather = 6) {
  const zones = spec.zones || [];
  let mw; let mh;
  if (zones.length) { const im0 = await loadImg(zones[0].mask); mw = im0.naturalWidth; mh = im0.naturalHeight; } else { const sc = Math.min(1, 1000 / Math.max(w, h)); mw = Math.round(w * sc); mh = Math.round(h * sc); }
  const sx = mw / w; const sy = mh / h;
  const A = featherMap(mw, mh, [region[0] * sx, region[1] * sy, region[2] * sx, region[3] * sy], feather);
  const bandOfZone = (z) => z.band || bandOf(z.color);
  const used = new Set(); const out = [];
  for (const z of zones) {
    const old = grayOf(await loadImg(z.mask), mw, mh, null);
    const p = patches.find((q, i) => !used.has(i) && (q.band || bandOf(q.color)) === bandOfZone(z)); // 같은 색 띠의 새 칠(없으면 이 영역의 그 색은 지운다)
    let patchGray = new Float32Array(mw * mh);
    if (p) { used.add(patches.indexOf(p)); patchGray = grayOf(await loadImg(p.url), mw, mh, [p.box[0] * sx, p.box[1] * sy, p.box[2] * sx, p.box[3] * sy]); }
    out.push({ ...z, mask: pngOf(blendMasks(old, patchGray, A), mw, mh), ...(z.band ? {} : { band: bandOfZone(z) }) });
  }
  let n = out.length;
  for (let i = 0; i < patches.length; i++) { // 지금 그림에 없던 색의 새 구역
    if (used.has(i) || out.length >= 8) continue; const p = patches[i];
    const pg = grayOf(await loadImg(p.url), mw, mh, [p.box[0] * sx, p.box[1] * sy, p.box[2] * sx, p.box[3] * sy]);
    n += 1; let id = `z${n}`; while (out.some((q) => q.id === id)) { n += 1; id = `z${n}`; }
    out.push({ id, color: p.color, label: String(p.label || '구역').slice(0, 22), mask: pngOf(blendMasks(new Float32Array(mw * mh), pg, A), mw, mh), opacity: 1, hidden: false, blend: p.blend === 'color' ? 'color' : 'multiply', band: p.band || bandOf(p.color) });
  }
  return { zones: out, changed: out.length };
}
