// 내 이미지 읽기·자르기(브라우저 전용: canvas 를 쓴다). 계산만 하는 부분은 imgutil.js.
import { imgQualityOf, normCrop } from './imgutil';

const QKEY = 'cd_img_quality';
export const getImgQuality = () => { try { const v = localStorage.getItem(QKEY); return v === 'light' || v === 'high' ? v : 'normal'; } catch { return 'normal'; } };
export const setImgQuality = (v) => { try { localStorage.setItem(QKEY, v); } catch { /* 저장 없이 진행 */ } };

const loadImage = (src) => new Promise((resolve, reject) => {
  const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('이미지로 읽을 수 없는 파일입니다.')); im.src = src;
});
const readDataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader(); fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.')); fr.onload = () => resolve(fr.result); fr.readAsDataURL(file);
});

// 그림(HTMLImageElement 등)의 sx,sy,sw,sh 부분을 level 에 맞는 크기·형식으로 줄여 data URL 로 만든다. alpha: 투명 배경이 있을 수 있는 형식인가
function encode(im, sx, sy, sw, sh, alpha, level) {
  const q = imgQualityOf(level);
  for (const [maxLong, keepAlpha, jq] of q.tries) {
    const k = Math.min(1, maxLong / Math.max(sw, sh)); const w = Math.max(1, Math.round(sw * k)); const h = Math.max(1, Math.round(sh * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d');
    const png = alpha && keepAlpha;
    if (!png) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
    cx.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
    const url = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', jq);
    if (url.length < q.limit || maxLong === q.tries[q.tries.length - 1][0]) return { url, w, h };
  }
  return null;
}

export async function imageSize(src) { const im = await loadImage(src); return { w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }; }

// 파일 → { url, w, h, kb }. 큰 사진은 level('light'|'normal'|'high')에 맞게 줄인다.
export async function readImageFile(file, level = getImgQuality()) {
  const src = await readDataUrl(file); const im = await loadImage(src);
  const alpha = /png|webp|gif|svg/.test(file.type); // 투명 배경이 있을 수 있는 형식은 PNG 로 둔다
  const out = encode(im, 0, 0, im.naturalWidth || im.width, im.naturalHeight || im.height, alpha, level);
  return { ...out, kb: Math.round(out.url.length * 0.75 / 1024), srcW: im.naturalWidth || im.width, srcH: im.naturalHeight || im.height };
}

// 원본(orig, data URL) 에서 crop([l,t,r,b] 0~1)만 잘라 새 data URL 로. 원본이 PNG 면 PNG 로(투명 유지)
export async function bakeCrop(orig, crop, level = getImgQuality()) {
  const c = normCrop(crop) || [0, 0, 1, 1]; const im = await loadImage(orig);
  const W = im.naturalWidth || im.width; const H = im.naturalHeight || im.height;
  const sx = Math.round(c[0] * W); const sy = Math.round(c[1] * H); const sw = Math.max(1, Math.round((c[2] - c[0]) * W)); const sh = Math.max(1, Math.round((c[3] - c[1]) * H));
  const out = encode(im, sx, sy, sw, sh, /^data:image\/(png|webp|gif|svg)/.test(orig), level);
  return { ...out, kb: Math.round(out.url.length * 0.75 / 1024) };
}
