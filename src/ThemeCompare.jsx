import React, { useEffect, useRef, useState } from 'react';
import { THEMES, themeById } from './conceptDiagram/theme';
import { TEXT_FONTS } from './conceptDiagram/fonts';
import { fontReady } from './conceptDiagram/fontcheck';

// 스타일 안 비교 창: 같은 그림을 안 3개로 나란히 보고 하나를 눌러 적용한다(AI 호출 없음, 썸네일은 부모가 만들어 준다).
// thumbs: { [안 id]: { svg, w, h } | null } — 없으면 '그릴 수 없음'. onPick(id): 적용. themeId: 지금 적용 중인 안.
const fontFamilyOf = (fontId) => { const f = TEXT_FONTS.find((x) => x.id === fontId); return f ? f.css.split(',')[0].replace(/["']/g, '').trim() : ''; };
const fontLabelOf = (fontId) => { const f = TEXT_FONTS.find((x) => x.id === fontId); return f ? f.label.split(' (')[0] : '지금 글씨체 그대로'; };

export default function ThemeCompare({ open, onClose, themeId, onPick, thumbs }) {
  const [installed, setInstalled] = useState({}); // 글꼴 이름 → 그림(SVG 이미지)에서 실제로 먹는지(시스템에 설치돼 있어야 true)
  const boxRef = useRef(null); const closeRef = useRef(null); const prevFocus = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    let dead = false;
    THEMES.forEach((t) => { const fam = fontFamilyOf(t.fontId); if (fam) fontReady(fam).then((ok) => { if (!dead) setInstalled((p) => ({ ...p, [fam]: ok })); }); });
    return () => { dead = true; };
  }, [open]);
  useEffect(() => { // 열릴 때 닫기 버튼에 초점을 두고, 닫으면 원래 초점으로 돌려놓는다. Tab 은 창 안에서만 돈다
    if (!open) return undefined;
    prevFocus.current = document.activeElement; const t = setTimeout(() => closeRef.current?.focus(), 0);
    const k = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab' && boxRef.current) {
        const f = [...boxRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
        if (!f.length) return; const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } else if (!boxRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', k, true);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k, true); try { prevFocus.current?.focus?.(); } catch { /* 초점 복원 없이 진행 */ } };
  }, [open, onClose]);
  if (!open) return null;
  const cur = themeById(themeId).id;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="theme-dialog" onPointerDown={(e) => e.stopPropagation()}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="theme-dialog-title" style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-card)', padding: 16, maxWidth: '96vw', maxHeight: '94vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div id="theme-dialog-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>스타일 안 비교</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>같은 그림을 안마다 색·글씨체·제목 크기(페이지 모드)만 바꿔 보여 줍니다. 눌러서 적용하고, “지금 모습”을 누르면 원래대로 돌아갑니다. 구조형 결과에서 직접 칠한 색과 손으로 고친 내용은 그대로 남고, 손스케치 결과는 직접 고른 색도 같은 계열이면 같이 바뀝니다.</div>
          </div>
          <button type="button" ref={closeRef} onClick={onClose} data-testid="theme-close" style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontSize: 12.5 }}>닫기</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {THEMES.map((t) => {
            const on = t.id === cur; const th = thumbs && thumbs[t.id]; const fam = fontFamilyOf(t.fontId); const missing = !!fam && installed[fam] === false;
            return (
              <button key={t.id} type="button" onClick={() => onPick(t.id)} data-testid={`theme-card-${t.id}`} aria-pressed={on}
                style={{ width: 360, maxWidth: '88vw', textAlign: 'left', padding: 8, borderRadius: 'var(--r-card)', border: `2px solid ${on ? 'var(--primary)' : 'var(--line)'}`, background: 'var(--surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 230, background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {th ? <img alt={t.label} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(th.svg)}`} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} /> : <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>이 안으로는 그릴 수 없습니다</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{t.label}</span>
                  {on && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-primary)', background: 'var(--primary)', borderRadius: 999, padding: '1px 8px' }}>적용 중</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
                  {t.a1 ? [t.a1, t.a2, t.a3, t.ink].map((c) => <span key={c} title={c} style={{ width: 16, height: 16, borderRadius: 3, background: c, border: '1px solid var(--line)' }} />) : <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>색은 지금 그대로</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-soft)' }}>{fontLabelOf(t.fontId)}{t.titleK !== 1 ? ` · 제목 ${t.titleK}배` : ''}</span>
                </div>
                {missing && <div style={{ fontSize: 11, color: 'var(--warn)' }}>이 PC에 {fam} 글꼴이 설치돼 있지 않아 쪽 미리보기·PNG·이 창에서는 대체 글꼴로 보입니다.</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
