// 다이어그램 자동 저장·복원 (2026-10-29) — 화면(DOM)과 무관한 계산만 모은다.
//
// 배경: 다이어그램 탭의 결과는 화면 상태(React state)에만 있어서 새로고침하면 사라지고, 남는 것은 SVG·PNG 로 내려받은 파일뿐이었다.
// 그래서 만든 결과(칸별 결과·고른 칸·손으로 고친 내용)를 이 브라우저(localStorage)에 자동으로 남기고, 다시 열면 되살린다.
// 다른 PC·다른 주소(localhost ↔ 사내 IP)에서는 보이지 않는다(서버에 저장하는 방식이 아니다).
export const WORK_KEY = 'cd_work_v1';
export const WORK_MAX_CHARS = 3_500_000;   // 브라우저 저장 공간(보통 5MB — 문자 수로는 약 500만) 안쪽. 다른 저장값(읽기 결과·페이지 설정)과 나눠 쓴다

// 그릴 수 있는 결과의 최소 모양: { type: 'site' 같은 종류, spec: 그림 내용 }
const isResult = (r) => !!r && typeof r === 'object' && typeof r.type === 'string' && r.type !== '' && !!r.spec && typeof r.spec === 'object';
// 손스케치를 읽은 직후 상자를 조정하는 중인 미리보기(isReadPreview)는 완성된 결과가 아니라 저장하지 않는다
const savable = (r) => (isResult(r) && !r.isReadPreview ? r : null);

// 크기가 넘칠 때 버리는 것(큰 사진부터): 1단계 aiEdit 의 원본 사진(src)·되돌리기 값(undoSpec), 2단계 바탕 사진(baseImage)까지. 그림 내용(spec)과 손으로 고친 내용(edits)은 끝까지 지킨다.
const lighten = (r, level) => {
  if (!r || level === 0) return r;
  const out = { ...r };
  if (out.aiEdit && typeof out.aiEdit === 'object') { const { src, undoSpec, ...rest } = out.aiEdit; out.aiEdit = rest; }
  if (level >= 2) delete out.baseImage;
  return out;
};

// 저장할 문자열을 만든다. state = { result, cells, selCell }. 저장할 게 없으면 null(빈 화면이 이미 저장된 작업을 덮어쓰지 않게),
// 한도를 못 맞추면 null. 반환 { json, dropped }: dropped = 버린 단계(0 없음 · 1 aiEdit 사진 · 2 바탕 사진까지)
export function packWork(state, maxChars = WORK_MAX_CHARS) {
  const s = state && typeof state === 'object' ? state : {};
  const result = savable(s.result);
  const cells = {};
  if (s.cells && typeof s.cells === 'object' && !Array.isArray(s.cells)) {
    for (const [id, r] of Object.entries(s.cells)) { const k = savable(r); if (k) cells[id] = k; }
  }
  if (!result && !Object.keys(cells).length) return null;
  const selCell = typeof s.selCell === 'string' ? s.selCell : 'c1';
  for (let level = 0; level <= 2; level++) {
    let json;
    try {
      json = JSON.stringify({ v: 1, t: Date.now(), selCell, result: lighten(result, level), cells: Object.fromEntries(Object.entries(cells).map(([id, r]) => [id, lighten(r, level)])) });
    } catch { return null; }
    if (json.length <= maxChars) return { json, dropped: level };
  }
  return null;
}

// 저장된 문자열을 꺼낸다. 망가졌거나 다른 판이면 null. 그릴 수 없는 항목은 버리고, 고른 칸이 없으면 남은 첫 칸으로 바꾼다. 반환 { result, cells, selCell }
export function unpackWork(text) {
  if (typeof text !== 'string' || !text) return null;
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== 'object' || d.v !== 1) return null;
  const result = savable(d.result);
  const cells = {};
  if (d.cells && typeof d.cells === 'object' && !Array.isArray(d.cells)) {
    for (const [id, r] of Object.entries(d.cells)) { const k = savable(r); if (k) cells[id] = k; }
  }
  if (!result && !Object.keys(cells).length) return null;
  const selCell = typeof d.selCell === 'string' && cells[d.selCell] ? d.selCell : (Object.keys(cells)[0] || 'c1');
  return { result, cells, selCell };
}
