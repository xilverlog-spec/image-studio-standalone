import React from 'react';
import ConceptDiagram from './ConceptDiagram';

// 다이어그램 탭 — 입력은 "텍스트만" 또는 "참고 이미지 + 텍스트" 두 가지뿐이다(2026-10-06 요청으로 단순화).
// draw.io 자유 편집(DrawioEditor.jsx)과 벡터 변환은 화면에서 뺐다. 파일은 남겨 두었으니 필요하면 여기서 다시 연결한다.
export default function DiagramModule({ addToast, apiFetch }) {
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <ConceptDiagram addToast={addToast} apiFetch={apiFetch} />
    </div>
  );
}
