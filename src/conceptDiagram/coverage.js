// "요청 반영 점검": 사용자가 쓴 요청에서 핵심 항목(예: 코어 스퀘어, 순환구조)을 뽑아서 결과의 글에 들어 있는지 확인한다.
// AI 호출 없이 글자 비교만 하므로 즉시 끝나고 비용이 없다. 완벽한 문장 이해는 아니고, 빠진 것 같은 항목을 알려 주는 용도다.

// 항목이 아닌 말(지시어·조사·일반 단어). 어절 단위로 걸러낸다.
const STOP = new Set([
  '참고', '이미지', '사진', '그림', '디자인', '전략', '다이어그램', '도식', '개념도', '생성', '만들기', '만들어', '만들어줘', '해줘', '해주세요', '보여줘',
  '살려서', '살려', '반영', '반영해서', '포함', '포함해서', '넣어', '넣어서', '위한', '통한', '대한', '하는', '있는', '같은', '같이', '처럼', '느낌', '스타일',
  '이', '그', '저', '및', '또는', '그리고', '단계', '과정', '표현', '구성', '정리', '표시', '기반', '내용', '부분', '중심', '관련', '아래', '위', '다음',
]);
// 어절 끝의 조사·어미(길이가 긴 것부터)
const SUFFIXES = ['으로서', '으로써', '에서의', '처럼', '같이', '으로', '에서', '에게', '까지', '부터', '보다', '이나', '이며', '으며', '하고', '하게', '해줘', '해서', '해주세요', '을', '를', '은', '는', '이', '가', '의', '와', '과', '도', '로', '에', '만'];

const strip = (w) => {
  let s = w;
  for (let guard = 0; guard < 3; guard++) {
    const suf = SUFFIXES.find((x) => s.length > x.length + 1 && s.endsWith(x));
    if (!suf) break;
    s = s.slice(0, -suf.length);
  }
  return s;
};

const MAX_ITEM_LEN = 14;   // 띄어쓰기를 뺀 글자 수가 이보다 길면 키워드가 아니라 서술 문장으로 보고 점검하지 않는다

export const normalize = (s) => String(s || '').toLowerCase().replace(/[\s\-_·.,;:!?'"()[\]{}<>/\\|~`@#$%^&*+=]/g, '');

// 요청 문장 → 핵심 항목 목록(띄어쓰기로 나뉜 짧은 구는 한 항목으로 묶는다: "코어 스퀘어" → "코어스퀘어")
export function requestedItems(text) {
  const chunks = String(text || '').split(/[\n,;·、]|\s그리고\s|\s및\s|\s또는\s/);
  const items = [];
  chunks.forEach((chunk) => {
    const keep = [];
    chunk.split(/\s+/).filter(Boolean).forEach((word) => {
      const base = strip(word);
      if (base.length < 2 || STOP.has(base) || STOP.has(word)) { if (keep.length) { items.push(keep.join('')); keep.length = 0; } return; }
      keep.push(base);
    });
    if (keep.length) items.push(keep.join(''));
  });
  // 너무 짧은(1글자) 항목과 중복을 빼고, 문장 전체가 한 덩어리로 붙은 긴 항목(키워드가 아니라 서술)은 점검 대상에서 뺀다. 최대 8개
  return [...new Set(items.map(normalize).filter((x) => x.length >= 2 && x.length <= MAX_ITEM_LEN))].slice(0, 8);
}

const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
// 두 문자열의 글자 2개짜리 조각 일치율(Dice). 오타·띄어쓰기 차이를 어느 정도 받아 준다.
function dice(a, b) {
  const A = bigrams(a); const B = bigrams(b);
  if (!A.length || !B.length) return a === b ? 1 : 0;
  const counts = new Map(); A.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let common = 0; B.forEach((g) => { const c = counts.get(g); if (c) { common++; counts.set(g, c - 1); } });
  return (2 * common) / (A.length + B.length);
}

// 항목이 결과 글(여러 칸의 제목·칩·주석)에 들어 있는지: 그대로 들어 있거나, 같은 길이쯤의 구간과 글자 조각이 충분히 겹치면 반영된 것으로 본다.
export function itemCovered(item, haystackParts, threshold = 0.55) {
  const hay = normalize(haystackParts.join(' '));
  if (hay.includes(item)) return true;
  // 항목과 비슷한 길이의 여러 구간을 비교한다(오타·띄어쓰기·조사 차이로 길이가 조금씩 다르다)
  for (const win of [item.length, item.length + 1, item.length + 2]) {
    for (let i = 0; i + 2 <= hay.length; i++) {
      if (dice(item, hay.slice(i, i + win)) >= threshold) return true;
    }
  }
  return false;
}

export function checkCoverage(requestText, fieldValues) {
  const items = requestedItems(requestText);
  const parts = fieldValues.map((v) => String(v || ''));
  return items.map((it) => ({ item: it, ok: itemCovered(it, parts) }));
}
