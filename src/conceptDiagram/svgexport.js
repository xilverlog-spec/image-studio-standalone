// 저장하는 SVG 를 일러스트레이터에서도 열리게 다듬는 순수 함수.
// 1) 일러스트레이터(특히 이전 버전)는 이미지·<use>·그라디언트의 연결을 SVG 2 의 href 가 아니라 옛 규격의 xlink:href 로만 읽는다.
//    href 로 쓴 이미지는 그림 데이터가 파일 안에 들어 있어도 "연결된 파일을 찾을 수 없다"가 뜬다. 그래서 저장할 때만 xlink:href 로 바꾸고 xmlns:xlink 를 선언한다.
// 2) 화살촉이 선 색을 따라가게 쓴 context-stroke 도 일러스트레이터가 모른다. 선마다 그 선 색으로 칠한 화살촉 복사본을 만들어 바꾼다.
// (화면에서 보는 그림은 그대로 — 브라우저는 둘 다 읽는다.)

const XLINK_NS = 'http://www.w3.org/1999/xlink';

function resolveContextStroke(src) {
  if (!/context-stroke/.test(src)) return src;
  const markers = {};
  src.replace(/<marker\b[^>]*?\bid=(["'])(.*?)\1[\s\S]*?<\/marker>/g, (m, q, id) => { if (/context-stroke/.test(m)) markers[id] = m; return m; });
  const made = {}; const extra = [];
  let out = src.replace(/<(?:path|line|polyline|polygon|rect|circle|ellipse)\b[^>]*>/g, (tag) => {
    const sm = /\sstroke=(["'])(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\1/.exec(tag); const color = sm ? sm[2] : '#222222';
    return tag.replace(/(\smarker-(?:start|end|mid)=(["']))url\(#([^)]+)\)\2/g, (m0, pre, q, id) => {
      if (!markers[id]) return m0;
      const nid = `${id}__${color.replace(/[^0-9a-zA-Z]/g, '')}`;
      if (!made[nid]) { made[nid] = true; extra.push(markers[id].replace(/\bid=(["'])(.*?)\1/, `id="${nid}"`).replace(/context-stroke/g, color)); }
      return `${pre}url(#${nid})${q}`;
    });
  });
  if (extra.length) out = /<\/defs>/.test(out) ? out.replace('</defs>', `${extra.join('')}</defs>`) : out.replace(/<svg\b[^>]*>/, (m) => `${m}<defs>${extra.join('')}</defs>`);
  return out.replace(/context-stroke/g, '#222222'); // 색을 못 찾은 것은 어두운 회색
}

export function toIllustratorSvg(svg) {
  let s = String(svg ?? '');
  if (!s) return s;
  s = resolveContextStroke(s);
  // href → xlink:href (이미 xlink:href 인 것은 앞이 ':' 라서 건드리지 않는다. 속성 앞은 공백이다)
  s = s.replace(/(\s)href=(["'])/g, '$1xlink:href=$2');
  // 맨 앞 <svg> 에 xmlns:xlink 선언(이미 있으면 그대로)
  s = s.replace(/<svg\b([^>]*)>/, (m, attrs) => (/\sxmlns:xlink=/.test(attrs) ? m : `<svg${attrs} xmlns:xlink="${XLINK_NS}">`));
  return s;
}

// 파일 안에 풀어 담기지 않은(바깥 파일·주소를 가리키는) 이미지 연결이 남아 있는지 — data: 로 들어 있지 않은 <image> 의 주소 목록
export function externalImageRefs(svg) {
  const out = []; const re = /<image\b[^>]*?\s(?:xlink:)?href=(["'])(.*?)\1/g; let m;
  while ((m = re.exec(String(svg ?? '')))) { if (!/^data:/i.test(m[2])) out.push(m[2]); }
  return out;
}
