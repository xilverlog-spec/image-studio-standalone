// 번호 마커(검은 원·색 사각 안의 흰 숫자) 공용 계산. 손스케치(memo.badge)와 구조형(adds kind 'badge')이 함께 쓴다.

export const BADGE_SHAPES = ['circle', 'square'];
export const BADGE_COLOR = '#222222';

// 바탕색 위에 읽히는 숫자 색: 밝은 바탕이면 어두운 글자, 아니면 흰 글자
export function badgeInk(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || ''); if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16); const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#222222' : '#FFFFFF';
}

// 번호 자동 매김: list = [{ auto, text }] (그림 순서). 자동 항목에는 1, 2, 3… 을 차례로 주되, 직접 고친(고정) 항목이 쓰는 번호는 건너뛴다. 새 text 배열을 돌려준다
export function assignNumbers(list) {
  const taken = new Set(list.filter((x) => !x.auto).map((x) => String(x.text ?? '').trim()));
  let n = 0;
  return list.map((x) => { if (!x.auto) return x.text; do { n += 1; } while (taken.has(String(n))); return String(n); });
}

// 번호 글자 길이에 따른 글자 크기 배율(마커 지름 대비): 한 자리는 크게, 세 자리는 작게
export const badgeFontK = (text) => { const l = [...String(text ?? '')].length; return l >= 3 ? 0.62 : l === 2 ? 0.8 : 1; };
