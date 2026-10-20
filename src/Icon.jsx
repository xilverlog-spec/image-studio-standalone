import React from 'react';

// 사내 디자인(외형-공통-컴포넌트.md · 외형-건축언어.md)의 선 아이콘 스프라이트. 앱 맨 위에서 <IconSprite /> 를 한 번 넣고
// <Icon name="alert" /> 처럼 쓴다. 이모지를 아이콘으로 쓰지 않는다. 아이콘만 있는 버튼에는 aria-label 을 붙인다.
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></symbol>
        <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
        <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></symbol>
        <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></symbol>
        <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></symbol>
        <symbol id="i-printer" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></symbol>
        <symbol id="i-filter" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></symbol>
        <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></symbol>
        <symbol id="i-mark-outline" viewBox="-2 -2 172 184">
          <g fill="none" stroke="currentColor" strokeWidth="3">
            <rect x="0" y="0" width="35" height="61" /><rect x="44" y="0" width="48" height="61" /><rect x="102" y="0" width="66" height="61" />
            <rect x="0" y="70" width="35" height="43" /><rect x="44" y="70" width="48" height="43" /><rect x="102" y="70" width="66" height="43" />
            <rect x="0" y="122" width="35" height="23" /><rect x="44" y="122" width="48" height="23" /><rect x="102" y="122" width="66" height="23" />
            <rect x="0" y="154" width="35" height="26" /><rect x="44" y="154" width="48" height="26" /><rect x="102" y="154" width="66" height="26" />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}

export default function Icon({ name, large = false, className = '', ...rest }) {
  return (
    <svg className={`icon${large ? ' icon-lg' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false" {...rest}>
      <use href={`#i-${name}`} />
    </svg>
  );
}

// 빈 상태: 로고 격자의 선만 남긴 마크 + 지금 상황 한 줄(+ 다음 행동은 children 으로). 이모지 대신 쓴다.
export function EmptyState({ title, children, style }) {
  return (
    <div className="empty-state" style={style}>
      <svg className="mark-empty" aria-hidden="true" viewBox="-2 -2 172 184" focusable="false"><use href="#i-mark-outline" /></svg>
      {title && <h4>{title}</h4>}
      {children}
    </div>
  );
}
