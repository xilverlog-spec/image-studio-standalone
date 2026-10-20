import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { anchorScroll, clampZoom, stepZoom, wheelZoom } from './conceptDiagram/viewlayout';

// 편집 그림을 확대하고 옮겨 보는 틀(손스케치 편집기·구조형 편집기가 함께 쓴다).
//  - 확대: 아래 버튼 또는 Ctrl+휠(터치패드는 두 손가락 벌리기). 마우스가 가리키는 곳이 그 자리에 남도록 확대한다.
//  - 이동: 확대한 뒤 Space 를 누른 채 끌기, 마우스 가운데 버튼 끌기, 또는 이동 버튼을 켜고 끌기. 휠로도 스크롤된다.
// 그림은 CSS 크기만 키우므로 편집기의 좌표 계산(getBoundingClientRect 기반)은 그대로 맞는다.
const typingEl = (t) => /INPUT|TEXTAREA|SELECT/.test(t?.tagName || '') || !!t?.isContentEditable;
const barBtn = (on) => ({ padding: '2px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: 1.5, border: `1px solid ${on ? 'var(--accent-cyan)' : 'var(--line-strong)'}`, background: on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: on ? 'var(--accent-cyan)' : 'var(--text-secondary)' });

export default function ZoomView({ children, testid = 'zv', baseWidth }) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1); zoomRef.current = zoom;
  const [hand, setHand] = useState(false);       // 이동 버튼
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const scrollRef = useRef(null); const pend = useRef(null); const overRef = useRef(false); const spaceRef = useRef(false);
  const zoomed = zoom > 1;

  // 배율을 바꾼다. (cx, cy) = 확대의 중심이 될 화면 좌표(없으면 보는 창 가운데)
  const applyZoom = (z1, cx, cy) => {
    const el = scrollRef.current; const z0 = zoomRef.current; z1 = clampZoom(z1);
    if (!el || z1 === z0) return;
    const r = el.getBoundingClientRect();
    pend.current = { px: (cx ?? r.left + r.width / 2) - r.left, py: (cy ?? r.top + r.height / 2) - r.top, z0, left: el.scrollLeft, top: el.scrollTop };
    zoomRef.current = z1; setZoom(z1);
  };
  useLayoutEffect(() => { // 배율이 바뀐 화면이 그려진 직후, 가리키던 곳이 제자리에 남도록 스크롤을 맞춘다
    const p = pend.current; const el = scrollRef.current; if (!p || !el) return; pend.current = null;
    const s = anchorScroll({ left: p.left, top: p.top, px: p.px, py: p.py, z0: p.z0, z1: zoom });
    el.scrollLeft = s.left; el.scrollTop = s.top;
  }, [zoom]);
  useEffect(() => { // 100% 로 돌아오면 이동 도구도 끈다
    if (!zoomed) { setHand(false); setSpaceDown(false); spaceRef.current = false; }
  }, [zoomed]);

  useEffect(() => { // Ctrl+휠 확대(기본 동작인 브라우저 전체 확대를 막아야 하므로 passive 가 아닌 직접 리스너)
    const el = scrollRef.current; if (!el) return undefined;
    const onWheel = (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); applyZoom(wheelZoom(zoomRef.current, e.deltaY, e.deltaMode), e.clientX, e.clientY); };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // Space 를 누르고 있는 동안 끌면 이동(확대했고, 마우스가 이 그림 위에 있을 때만)
    const down = (e) => {
      if (e.code !== 'Space' || typingEl(e.target) || !overRef.current || zoomRef.current <= 1) return;
      e.preventDefault(); if (!spaceRef.current) { spaceRef.current = true; setSpaceDown(true); }
    };
    const up = (e) => { if (e.code === 'Space' && spaceRef.current) { spaceRef.current = false; setSpaceDown(false); } };
    const off = () => { spaceRef.current = false; setSpaceDown(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', off); };
  }, []);

  const onPanDown = (e) => { // 편집기가 이 눌림을 받기 전에(capture) 가로채서 그림을 끌어 옮긴다
    const pan = e.button === 1 || (e.button === 0 && zoomRef.current > 1 && (spaceRef.current || hand));
    if (!pan) return;
    const el = scrollRef.current; if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const y0 = e.clientY; const l0 = el.scrollLeft; const t0 = el.scrollTop;
    setPanning(true);
    const mv = (ev) => { el.scrollLeft = l0 - (ev.clientX - x0); el.scrollTop = t0 - (ev.clientY - y0); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setPanning(false); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const panMode = zoomed && (spaceDown || hand);
  return (
    <div data-testid={`${testid}-root`} data-zoom={zoom}>
      <style>{'[data-pan="1"],[data-pan="1"] *{cursor:grab !important}[data-pan="2"],[data-pan="2"] *{cursor:grabbing !important}'}</style>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4, fontSize: 11, color: 'var(--text-tertiary, #64748b)' }} data-testid={`${testid}-bar`}>
        <button style={barBtn(false)} disabled={zoom <= 1} onClick={() => applyZoom(stepZoom(zoomRef.current, -1))} title="축소" data-testid={`${testid}-out`}>−</button>
        <span style={{ minWidth: 42, textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }} data-testid={`${testid}-pct`}>{Math.round(zoom * 100)}%</span>
        <button style={barBtn(false)} disabled={zoom >= 4} onClick={() => applyZoom(stepZoom(zoomRef.current, 1))} title="확대" data-testid={`${testid}-in`}>＋</button>
        <button style={barBtn(false)} disabled={zoom === 1} onClick={() => applyZoom(1)} title="100%(화면에 맞춤)로 되돌립니다" data-testid={`${testid}-fit`}>맞춤</button>
        <button style={barBtn(hand)} disabled={!zoomed} onClick={() => setHand((v) => !v)} title="켜 두면 끄는 대로 그림이 옮겨집니다(확대했을 때). 끄면 다시 요소를 끌어 고칩니다" data-testid={`${testid}-hand`}>이동</button>
        <span>Ctrl+휠: 확대·축소{zoomed ? ' · Space+끌기 / 가운데 버튼 끌기: 이동' : ''}</span>
      </div>
      <div ref={scrollRef} data-testid={`${testid}-scroll`} data-pan={panMode ? (panning ? '2' : '1') : undefined}
        onPointerEnter={() => { overRef.current = true; }} onPointerLeave={() => { overRef.current = false; }}
        onPointerDownCapture={onPanDown} onMouseDownCapture={(e) => { if (e.button === 1) e.preventDefault(); }}
        style={zoomed ? { overflow: 'auto', maxHeight: 'min(82vh, 1200px)' } : undefined}>
        <div style={{ width: `${zoom * 100}%`, maxWidth: baseWidth ? baseWidth * zoom : undefined, margin: '0 auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
