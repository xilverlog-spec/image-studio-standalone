import React, { useState } from 'react';
import ConceptDiagram from './ConceptDiagram';
import LineTrace from './LineTrace';

// 다이어그램 탭
//  - 만들기: 입력은 "텍스트만" 또는 "참고 이미지 + 텍스트" 두 가지뿐이다(2026-10-06 요청으로 단순화).
//  - 이미지 선 추출: 이미 있는 도식 이미지를 일정한 굵기의 깔끔한 선(SVG)으로 바꾸는 별도 도구.
// draw.io 자유 편집(DrawioEditor.jsx)과 색 영역 벡터 변환은 화면에서 뺐다. 파일은 남겨 두었으니 필요하면 다시 연결한다.
export default function DiagramModule({ addToast, apiFetch }) {
  const [mode, setMode] = useState('make');

  const tab = (id, label) => (
    <button key={id} onClick={() => setMode(id)}
      style={{
        padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
        background: mode === id ? 'linear-gradient(135deg, #333399, #4f46e5)' : 'transparent',
        color: mode === id ? '#fff' : 'var(--text-secondary)',
      }}>{label}</button>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.5)' }}>
        {tab('make', '다이어그램 만들기')}
        {tab('trace', '이미지 → 깔끔한 선')}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: mode === 'make' ? 'flex' : 'none' }}>
        <ConceptDiagram addToast={addToast} apiFetch={apiFetch} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: mode === 'trace' ? 'flex' : 'none' }}>
        <LineTrace addToast={addToast} apiFetch={apiFetch} />
      </div>
    </div>
  );
}
