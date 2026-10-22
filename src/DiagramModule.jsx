import React from 'react';
import ConceptDiagram from './ConceptDiagram';

// 다이어그램 탭
//  - 만들기: 입력은 "텍스트만" 또는 "참고 이미지 + 텍스트" 두 가지뿐이다(2026-10-06 요청으로 단순화).
// 이미지 선 추출('이미지 → 깔끔한 선' 탭, LineTrace.jsx)은 2026-10-21 요청으로 화면에서 뺐다. draw.io 자유 편집(DrawioEditor.jsx)·색 영역 벡터 변환과 같이 파일은 남겨 두었으니 필요하면 다시 연결한다.
export default function DiagramModule({ active = true, addToast, apiFetch }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ConceptDiagram active={active} addToast={addToast} apiFetch={apiFetch} />
      </div>
    </div>
  );
}
