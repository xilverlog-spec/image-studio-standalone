import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

// 상단 앱 헤더(도구형): 왼쪽 로고 · 모듈 탭 · 오른쪽 프로젝트 · 버전/갱신일 · 이지/프로 토글.
// 버전 = package.json 의 version, 갱신일 = 이 화면을 빌드한 날짜(실제 값). 프로젝트 = 지금 들어와 있는 프로젝트(누르면 전환).
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';

export const APP_MODULES = [
  { id: 'image', label: 'AI 이미지' },
  { id: 'aerial', label: '조감도' },
  { id: 'diagram', label: '다이어그램' },
];

export default function AppHeader({ appModule, onModule, currentProject, onSwitchProject, isEasyMode, onToggleEasy, onRefreshGallery }) {
  const ref = useRef(null);
  // 모듈 화면(조감도·다이어그램)이 헤더 바로 아래에 겹쳐 뜨므로, 헤더가 줄바꿈으로 높아져도 맞도록 실제 높이를 변수로 알린다
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--header-h-live', `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="app-header" ref={ref}>
      <h1 className="sr-only">상지건축 DX설계본부 AX LAB · AI 이미지 스튜디오</h1>
      <div className="brand">
        <span className="logo-crop"><img src="/axlab-logo-light-transparent.png" alt="AX LAB — SEA DX DIV." /></span>
      </div>

      <div className="tabs" role="tablist" aria-label="모듈">
        {APP_MODULES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={appModule === m.id} className={`tab${appModule === m.id ? ' active' : ''}`} onClick={() => onModule(m.id)} data-testid={`module-${m.id}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="header-actions">
        {(VERSION || BUILD_DATE) && <span className="header-meta" title="이 화면의 버전과 갱신일(빌드한 날짜)" data-testid="app-version">{VERSION && `v${VERSION}`}{VERSION && BUILD_DATE ? ' · ' : ''}{BUILD_DATE}</span>}
        <button type="button" className="project-chip" onClick={onSwitchProject} title="다른 프로젝트로 전환합니다(비밀번호를 다시 입력해야 합니다)" data-testid="project-switch">{currentProject}</button>
        {/* 이지 모드 / 프로 모드 토글 */}
        <div className="switch-container" onClick={onToggleEasy} title="초보자를 위한 간편 설정 모드와 전문가용 정밀 설정 모드를 전환합니다" role="switch" aria-checked={!isEasyMode} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleEasy(); } }}>
          <span className={`switch-label ${isEasyMode ? 'active' : ''}`}>이지 모드</span>
          <div className={`switch-track ${isEasyMode ? '' : 'active'}`}><div className="switch-thumb" /></div>
          <span className={`switch-label ${!isEasyMode ? 'active' : ''}`}>프로 모드</span>
        </div>
        <button type="button" onClick={onRefreshGallery} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', fontSize: 13, fontWeight: 500 }}>
          <RefreshCw size={14} /> 갤러리 새로고침
        </button>
      </div>
    </header>
  );
}
