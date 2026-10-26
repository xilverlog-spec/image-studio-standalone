// 글꼴 확인(브라우저 전용). DOM 이 없으면(node 시험) 판정하지 않고 true.
//
// ① fontInstalled: 문서(캔버스)에서 같은 글자열의 폭을 후보 글꼴과 기준 글꼴(monospace·serif·sans-serif)로 재서 하나라도 다르면 쓸 수 있는 글꼴로 본다.
//    앱이 @font-face 로 내장한 글꼴(Pretendard)도 불러온 뒤에는 true 가 된다. (document.fonts.check 는 시스템 글꼴 설치 여부를 가르지 못해 쓰지 않는다)
// ② fontRendersInSvgImage: <img src="data:image/svg+xml…"> 로 그려진 SVG 는 문서의 웹 글꼴을 못 쓰고 **시스템에 설치된 글꼴만** 쓴다.
//    쪽 미리보기·비교 창 썸네일·PNG 저장이 모두 그런 그림이라, 같은 방식으로 작은 SVG 를 그려 글꼴이 실제로 먹는지 픽셀로 비교한다(그릴 수 없으면 true).
const SAMPLE = 'abcdefghijklmnopqrstuvwxyz한글테스트0123456789';
const BASES = ['monospace', 'serif', 'sans-serif'];

export function fontInstalled(family) {
  if (typeof document === 'undefined') return true;
  try {
    const ctx = document.createElement('canvas').getContext('2d'); if (!ctx) return true;
    const fam = String(family ?? '').replace(/["']/g, '');
    const w = (font) => { ctx.font = font; return ctx.measureText(SAMPLE).width; };
    return BASES.some((b) => Math.abs(w(`72px "${fam}", ${b}`) - w(`72px ${b}`)) > 0.5);
  } catch { return true; }
}

const drawProbe = (fontCss) => new Promise((resolve) => {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="56"><rect width="360" height="56" fill="#fff"/><text x="4" y="38" font-size="28" font-family="${fontCss}" fill="#000">가나다라 abcWXYZ 123</text></svg>`;
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = 360; c.height = 56; const x = c.getContext('2d'); x.drawImage(img, 0, 0); resolve(x.getImageData(0, 0, 360, 56).data); } catch { resolve(null); } };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch { resolve(null); }
});
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i]) n += 1; return n; };

export async function fontRendersInSvgImage(family) {
  if (typeof document === 'undefined') return true;
  const fam = String(family ?? '').replace(/["']/g, '');
  // 기준 글꼴(monospace·serif·sans-serif)마다 '후보 글꼴, 기준' 과 '기준만' 을 같은 방식으로 그려 비교한다(후보가 없으면 두 그림이 같다)
  const pairs = await Promise.all(BASES.map(async (b) => [await drawProbe(`'${fam}', ${b}`), await drawProbe(b)]));
  if (pairs.some(([x, y]) => !x || !y)) return true; // 그려 볼 수 없으면 판정하지 않는다
  return pairs.some(([x, y]) => diffCount(x, y) > 40);
}

// 비교 창의 "이 PC에 없어 대체 글꼴" 표시용: 그림(SVG 이미지)에서 실제로 먹는지로 판정한다
export async function fontReady(family) { return fontRendersInSvgImage(family); }
