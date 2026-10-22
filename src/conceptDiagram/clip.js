// 편집기 안에서 복사해 둔 요소 붙여넣기와, 캡처·사진을 클립보드에서 붙여넣기(이미지)가 같은 단축키(Ctrl+V)를 나누어 쓴다.
//  - 편집기에서 Ctrl+C: 요소는 편집기 안(모듈 변수)에 담고, 시스템 클립보드는 글자 표식으로 덮어써서 예전에 복사해 둔 이미지가 다음 Ctrl+V 에서 되살아나지 않게 한다(markInternalCopy).
//  - Ctrl+V: 편집기는 바로 붙이지 않고 schedulePaste 로 잠깐 기다린다. 곧바로 오는 paste 이벤트에 이미지가 있으면 그 이미지가 이기고(cancelPendingPaste), 없으면 편집기에서 복사해 둔 요소를 붙인다.
let timer = null;

export function schedulePaste(fn) {
  cancelPendingPaste();
  timer = setTimeout(() => { timer = null; fn(); }, 0);
}
export function cancelPendingPaste() {
  if (timer) { clearTimeout(timer); timer = null; }
}

let lastElem = null; // 편집기에서 마지막으로 요소를 복사한 때 { kind: 'sketch'|'svg', at } — 페이지 칸에서 Ctrl+V 할 때 칸 복사와 어느 쪽이 더 새로운지 가린다
export const lastElemCopy = () => lastElem;

export function markInternalCopy(kind = '') {
  if (kind) lastElem = { kind, at: Date.now() };
  try {
    if (typeof document === 'undefined') return false;
    const prev = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = '상지 편집기 요소(복사됨)'; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (prev && prev !== document.body && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    return !!ok;
  } catch { return false; }
}

// 붙여넣기 이벤트에서 이미지 파일만 골라낸다(웹 페이지에서 복사한 그림은 파일로도 들어 있다)
export function imagesFromClipboard(e) {
  const out = [];
  const items = [...(e.clipboardData?.items || [])];
  for (const it of items) { if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) out.push(f); } }
  if (!out.length) for (const f of [...(e.clipboardData?.files || [])]) if (/^image\//.test(f.type)) out.push(f);
  return out;
}
