// 글씨체 목록(페이지 글꼴 선택과 그림 속 글자 글씨체 선택이 같이 쓴다). id 는 저장되는 값, css 는 font-family 값.
// 첫째(malgun)는 모든 렌더러의 기본 글꼴 값(ENGINE_FONT) 그대로라, 페이지가 글꼴을 바꾸면 같이 바뀐다. 나머지는 글자 하나에 따로 지정한 글씨체라 페이지 글꼴을 바꿔도 그대로 남는다.
export const ENGINE_FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"; // 모든 렌더러가 쓰는 글꼴 값(바꿔 끼울 때 이 문자열을 찾는다)
export const TEXT_FONTS = [
  { id: 'malgun', label: '맑은 고딕 (Windows 기본)', css: ENGINE_FONT },
  { id: 'noto', label: 'Noto Sans KR (본고딕)', css: "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif" },
  { id: 'pretendard', label: 'Pretendard (사내 보드 기본 · 화면과 PNG 는 앱에 내장, 저장한 SVG 는 그 PC 에 설치돼 있어야 보임)', css: "'Pretendard','Malgun Gothic','Noto Sans KR',sans-serif" },
  { id: 'nanum', label: '나눔고딕', css: "'NanumGothic','Nanum Gothic','Malgun Gothic',sans-serif" },
  { id: 'dotum', label: '돋움', css: "'Dotum','Malgun Gothic',sans-serif" },
  { id: 'batang', label: '바탕 (명조 계열)', css: "'Batang','Noto Serif KR','Malgun Gothic',serif" },
];
export const fontCssOf = (id) => (TEXT_FONTS.find((f) => f.id === id) || TEXT_FONTS[0]).css;
export const isTextFont = (id) => TEXT_FONTS.some((f) => f.id === id && f.id !== 'malgun'); // 저장할 값(기본 글꼴은 저장하지 않는다)
export const fontIdOfCss = (css) => (TEXT_FONTS.find((f) => css && (f.css === css || (String(css).replace(/["']/g, '').split(',')[0].trim() === f.css.replace(/["']/g, '').split(',')[0].trim()))) || TEXT_FONTS[0]).id;
export const TEXT_WEIGHTS = [[400, '보통'], [600, '중간'], [700, '굵게'], [800, '아주 굵게']];
