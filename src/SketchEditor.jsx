import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DASHES, DASH_LABEL, HEAD_LABEL, SHAPES, SHAPE_LABEL, renderSketch, normalizeSketch, sketchFind, sketchKind, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd, sketchView, sketchMoveBy, sketchResizeRect, sketchSetEnd, sketchSetAmp, sketchSetVia, sketchSnapshot, sketchPaste, sketchSnapPoint, sketchSnapMove, SKETCH_SIZE } from './conceptDiagram/sketch';

// 손스케치 다이어그램 편집기(1단계): 요소를 클릭하면 오른쪽에 속성이 뜨고, 바꾸는 즉시 다시 그린다.
// 편집 대상은 구조(spec)이므로 어떻게 고쳐도 항상 정돈된 SVG 가 나온다. 저장은 부모(ConceptDiagram)의 SVG/PNG 저장 버튼이 한다.

const input = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.9)', color: 'var(--text-primary)', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const smallBtn = (on, danger) => ({
  padding: '5px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${danger ? '#fca5a5' : on ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
  background: danger ? '#fef2f2' : on ? 'rgba(51,51,153,0.12)' : 'rgba(255,255,255,0.85)', color: danger ? '#B91C1C' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const sec = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.7)' };
const lab = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
const SWATCHES = ['#1E88C8', '#E8833A', '#3E8E41', '#D6453D', '#7C5CBF', '#222222'];
const r1 = (v) => Math.round(v * 10) / 10;
// 복사해 둔 요소(같은 페이지 안에서 다른 그림으로도 붙일 수 있게 모듈에 둔다)와 연속 붙여넣기 횟수
let CLIP = null; let PASTE_N = 0;
// 선 표현: 선(실선·파선·점선·일점쇄선)과 모양 자체가 다른 표현을 한 목록으로 고른다
const LINE_OPTIONS = [
  ['line:solid', '실선'], ['line:dashed', '파선'], ['line:dotted', '점선'], ['line:dashdot', '일점쇄선'],
  ['double:solid', '이중선'], ['ribbon:solid', '리본(붓 띠)'], ['soft:solid', '번짐(끝이 흐려지는 띠)'], ['chevron:solid', '화살표 반복'], ['zigzag:solid', '물결 장식선'],
];
const formValue = (el) => `${el.form || 'line'}:${(el.form || 'line') === 'line' ? el.dash : 'solid'}`;

function Num({ label, value, onChange, step = 0.5, testid }) {
  return (
    <label style={lab}>{label}
      <input type="number" step={step} value={r1(value)} data-testid={testid} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} style={input} />
    </label>
  );
}

function Colors({ value, onChange, allowClear }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      {SWATCHES.map((c) => <button key={c} title={c} onClick={() => onChange(c)} style={{ width: 20, height: 20, borderRadius: 10, background: c, border: value === c ? '2px solid #111' : '1px solid #bbb', cursor: 'pointer', padding: 0 }} />)}
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#888888'} onChange={(e) => onChange(e.target.value)} style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border-color)', borderRadius: 4, background: 'none' }} />
      {allowClear && <button style={{ ...smallBtn(false), padding: '2px 7px', fontSize: 11 }} onClick={() => onChange('')}>기본색</button>}
    </div>
  );
}

export default function SketchEditor({ spec, onChange, disabled }) {
  const [selected, setSelected] = useState('');
  const past = useRef([]); const future = useRef([]);
  const lastKey = useRef(''); const lastAt = useRef(0);
  const [, tick] = useState(0);
  const norm = useMemo(() => normalizeSketch(spec), [spec]);
  const specRef = useRef(norm); specRef.current = norm;
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const keyRef = useRef(null);

  // 글자·숫자를 칠 때 한 글자마다 되돌리기 칸이 생기지 않도록, 같은 항목을 1초 안에 계속 고치면 한 번으로 묶는다
  const commit = (next, key = '') => {
    const now = Date.now();
    if (!(key && key === lastKey.current && now - lastAt.current < 1000)) { past.current = [...past.current.slice(-49), spec]; }
    lastKey.current = key; lastAt.current = now; future.current = [];
    onChange(next); tick((n) => n + 1);
  };
  const undo = () => { if (!past.current.length) return; const prev = past.current[past.current.length - 1]; past.current = past.current.slice(0, -1); future.current = [...future.current, spec]; lastKey.current = ''; onChange(prev); tick((n) => n + 1); };
  const redo = () => { if (!future.current.length) return; const nxt = future.current[future.current.length - 1]; future.current = future.current.slice(0, -1); past.current = [...past.current, spec]; lastKey.current = ''; onChange(nxt); tick((n) => n + 1); };

  const svg = useMemo(() => {
    try { return renderSketch(norm, { interactive: true, selected }).svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, '<svg$1 width="100%"'); } catch { return ''; }
  }, [norm, selected]);

  const sel = selected ? sketchFind(norm, selected) : null;
  const kind = sel ? sketchKind(norm, selected) : '';
  const set = (patch, key) => commit(sketchUpdate(norm, selected, patch), key ? `${selected}:${key}` : '');
  const remove = () => { commit(sketchDelete(norm, selected)); setSelected(''); };
  const add = (k) => { const r = sketchAdd(norm, k); commit(r.spec); setSelected(r.id); };
  const setGlobal = (patch, key) => commit({ ...norm, ...patch }, key);

  // 그림 좌표(1200x760) ← 화면 좌표 → 다이어그램 좌표
  const toDiag = (clientX, clientY) => {
    const el = canvasRef.current?.querySelector('svg'); if (!el) return null;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; // 그림 영역이 접혀 있으면 계산하지 않는다
    return sketchView(specRef.current).toDiag([((clientX - r.left) * SKETCH_SIZE[0]) / r.width, ((clientY - r.top) * SKETCH_SIZE[1]) / r.height]);
  };
  const onDown = (e) => {
    if (e.button !== 0 || disabled) return;
    const h = e.target.closest?.('[data-handle]'); const el = e.target.closest?.('[data-eid]');
    if (!el) { setSelected(''); return; }
    e.preventDefault();
    const id = el.getAttribute('data-eid'); setSelected(id);
    const start = toDiag(e.clientX, e.clientY); if (!start) return;
    drag.current = { id, handle: h ? h.getAttribute('data-handle') : '', start, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return; // 살짝 눌렀다 떼면 선택만
      d.moved = true; past.current = [...past.current.slice(-49), d.orig]; future.current = []; lastKey.current = ''; setDragging(true);
    }
    const pt = toDiag(e.clientX, e.clientY); if (!pt) return; const snap = !e.altKey; const o = d.orig; const kind0 = sketchKind(o, d.id); let next = o;
    if (!d.handle) {
      let dx = pt[0] - d.start[0]; let dy = pt[1] - d.start[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } // Shift: 수평·수직으로만
      if (snap && kind0 === 'block') [dx, dy] = sketchSnapMove(o, d.id, dx, dy);
      next = sketchMoveBy(o, d.id, dx, dy);
    } else if (d.handle === 'start' || d.handle === 'end') next = sketchSetEnd(o, d.id, d.handle, snap ? sketchSnapPoint(o, d.id, pt) : pt);
    else if (d.handle === 'amp') next = sketchSetAmp(o, d.id, pt);
    else if (d.handle === 'via') next = sketchSetVia(o, d.id, pt);
    else next = sketchResizeRect(o, d.id, d.handle, ...(snap ? sketchSnapPoint(o, d.id, pt) : pt));
    onChange(next); tick((n) => n + 1);
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); drag.current = null; setDragging(false); tick((n) => n + 1); };
  useEffect(() => () => { window.removeEventListener('pointermove', onMove); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 단축키는 포커스와 무관하게 창 전체에서 받는다(그림을 클릭해도 포커스가 옮겨지지 않기 때문). 입력칸에 글자를 칠 때는 무시한다
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  // 복사(Ctrl+C)·잘라내기(Ctrl+X)·붙여넣기(Ctrl+V)·복제(Ctrl+D). 붙인 요소는 3칸씩 비껴 놓이고 곧바로 선택된다
  const copySel = () => { const sn = selected ? sketchSnapshot(norm, selected) : null; if (sn) { CLIP = sn; PASTE_N = 0; tick((n) => n + 1); } return !!sn; };
  const pasteClip = (offset) => { if (!CLIP) return; PASTE_N += 1; const k = offset ?? 3 * PASTE_N; const r = sketchPaste(norm, CLIP, k, k); if (r.id) { commit(r.spec); setSelected(r.id); } };
  const onKey = (e) => {
    const tag = e.target?.tagName || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;
    const mod = e.ctrlKey || e.metaKey; const k = (e.key || '').toLowerCase();
    if (mod && !typing && k === 'c' && selected && !window.getSelection?.()?.toString()) { if (copySel()) e.preventDefault(); }
    else if (mod && !typing && k === 'x' && selected) { if (copySel()) { e.preventDefault(); remove(); } }
    else if (mod && !typing && k === 'v' && CLIP) { e.preventDefault(); pasteClip(); }
    else if (mod && !typing && k === 'd' && selected) { e.preventDefault(); if (copySel()) pasteClip(3); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (!typing && selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (!typing && selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { // 방향키로 조금씩 옮긴다(Shift 는 더 크게)
      e.preventDefault(); const st = e.shiftKey ? 2 : 0.5;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0; const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      commit(sketchMoveBy(norm, selected, dx, dy), `nudge:${selected}`);
    } else if (e.key === 'Escape') setSelected('');
  };
  keyRef.current = onKey; // 창 단위 키 입력 리스너가 항상 최신 상태의 처리 함수를 부르게 한다

  const ends = sel?.el?.pts ? [sel.el.pts[0], sel.el.pts[sel.el.pts.length - 1]] : null;
  const setEnd = (which, axis, v) => {
    const a = [...ends[0]]; const z = [...ends[1]];
    (which === 0 ? a : z)[axis] = v;
    commit(sketchSetEnds(norm, selected, a, z), `${selected}:end`);
  };
  const setRect = (i, v) => { const r = [...sel.el.rect]; r[i] = v; set({ rect: r }, 'rect'); };

  const title = { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' };
  const kindName = { block: { core: '코어(빗금 도형)', opening: '개구부(점선 캡슐)' }[sel?.el?.kind] || '판(큰 도형)', line: '선', wind: '바람·흐름 화살표', memo: '글자 메모' }[kind];

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} data-testid="sketch-editor">
      <div style={{ flex: '1 1 480px', minWidth: 360, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div ref={canvasRef} onPointerDown={onDown} dangerouslySetInnerHTML={{ __html: svg }} data-testid="sketch-canvas" style={{ touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'default' }} />
      </div>

      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={smallBtn(false)} disabled={!past.current.length} onClick={undo} title="Ctrl+Z" data-testid="undo">↶ 되돌리기</button>
          <button style={smallBtn(false)} disabled={!future.current.length} onClick={redo} title="Ctrl+Y">↷ 다시</button>
        </div>
        <div style={sec}>
          <span style={title}>요소 추가</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={() => add('wind')} data-testid="add-wind">＋ 화살표</button>
            <button style={smallBtn(false)} onClick={() => add('line')}>＋ 선</button>
            <button style={smallBtn(false)} onClick={() => add('slab')}>＋ 도형</button>
            <button style={smallBtn(false)} onClick={() => add('opening')}>＋ 개구부</button>
            <button style={smallBtn(false)} onClick={() => add('memo')}>＋ 글자</button>
            {CLIP && <button style={smallBtn(false)} onClick={() => pasteClip()} title="Ctrl+V">붙여넣기</button>}
          </div>
        </div>

        {!sel && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림의 화살표·선·도형·글자를 <b>클릭</b>하면 여기서 속성을 바꿀 수 있고, <b>끌어서 옮길</b> 수 있습니다. 선택하면 나타나는 <b>네모 점은 크기</b>, <b>동그라미는 화살표 끝점</b>, <b>큰 마름모는 S자 변곡점(자유롭게 이동)</b>, <b>작은 빈 마름모는 휘는 정도</b> 조절입니다.<br />Shift: 수평·수직 고정 · Alt: 자석 끄기 · 방향키: 미세 이동<br />Ctrl+C / Ctrl+V: 복사·붙여넣기 · Ctrl+D: 복제 · Ctrl+X: 잘라내기 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
            <label style={lab}>제목<input style={input} value={norm.title} onChange={(e) => setGlobal({ title: e.target.value }, 'title')} /></label>
            <label style={lab}>부제<input style={input} value={norm.subtitle} onChange={(e) => setGlobal({ subtitle: e.target.value }, 'subtitle')} /></label>
            <label style={lab}>범례: 화살표<input style={input} value={norm.legend.wind} onChange={(e) => setGlobal({ legend: { ...norm.legend, wind: e.target.value } }, 'lgw')} /></label>
            <label style={lab}>범례: 개구부<input style={input} value={norm.legend.opening} onChange={(e) => setGlobal({ legend: { ...norm.legend, opening: e.target.value } }, 'lgo')} /></label>
            <label style={lab}>범례: 코어<input style={input} value={norm.legend.core} onChange={(e) => setGlobal({ legend: { ...norm.legend, core: e.target.value } }, 'lgc')} /></label>
            {[0, 1].map((i) => (
              <label key={i} style={lab}>핵심 메시지 {i + 1}
                <input style={input} value={norm.notes[i] || ''} onChange={(e) => { const n = [...norm.notes]; while (n.length < 2) n.push(''); n[i] = e.target.value; setGlobal({ notes: n.filter((t, k) => t || k < i) }, `note${i}`); }} />
              </label>
            ))}
          </div>
        )}

        {sel && (
          <div style={sec} data-testid="props">
            <span style={title}>선택: {kindName} ({selected})</span>

            {kind === 'wind' && (<>
              <label style={lab}>화살촉
                <select style={input} value={sel.el.head} onChange={(e) => set({ head: e.target.value })} data-testid="prop-head">{Object.entries(HEAD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label style={lab}>선 표현
                <select style={input} value={formValue(sel.el)} onChange={(e) => { const [form, dash] = e.target.value.split(':'); set({ form, dash }); }} data-testid="prop-form">{LINE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label style={lab}>굵기 {sel.el.width}
                <input type="range" min="1" max="14" step="0.5" value={sel.el.width} onChange={(e) => set({ width: Number(e.target.value) }, 'w')} />
              </label>
              <label style={lab}>곡선 모양
                <select style={input} value={sel.el.shape} onChange={(e) => set({ shape: e.target.value })} data-testid="prop-shape">{SHAPES.map((k) => <option key={k} value={k}>{SHAPE_LABEL[k]}</option>)}</select>
              </label>
              {sel.el.shape === 'read' && (
                <label style={lab}>곡선 세기(읽은 흔들림 정도) {sel.el.bend}
                  <input type="range" min="0" max="1.6" step="0.05" value={sel.el.bend} onChange={(e) => set({ bend: Number(e.target.value) }, 'bend')} />
                </label>
              )}
              {(sel.el.shape === 's' || sel.el.shape === 'arc') && (
                <label style={lab}>휘는 정도(음수는 반대쪽) {sel.el.amp}
                  <input type="range" min="-1.2" max="1.2" step="0.05" value={sel.el.amp} onChange={(e) => set({ amp: Number(e.target.value) }, 'amp')} />
                </label>
              )}
              {sel.el.shape === 's' && (
                <button style={smallBtn(false)} disabled={!sel.el.via} onClick={() => commit(sketchSetVia(norm, selected, null))} title="큰 마름모(변곡점)를 끌어 옮긴 것을 기본 위치로 되돌립니다">변곡점 가운데로 되돌리기</button>
              )}
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
                            <label style={lab}>시작 쪽 문구<input style={input} value={sel.el.inLabel} onChange={(e) => set({ inLabel: e.target.value }, 'in')} /></label>
              <label style={lab}>끝 쪽 문구<input style={input} value={sel.el.outLabel} onChange={(e) => set({ outLabel: e.target.value }, 'out')} /></label>
            </>)}

            {kind === 'line' && (<>
              <label style={lab}>선 종류
                <select style={input} value={sel.el.dash} onChange={(e) => set({ dash: e.target.value })}>{Object.keys(DASHES).map((k) => <option key={k} value={k}>{DASH_LABEL[k]}</option>)}</select>
              </label>
              <label style={lab}>굵기 {sel.el.width}
                <input type="range" min="0.5" max="8" step="0.5" value={sel.el.width} onChange={(e) => set({ width: Number(e.target.value) }, 'w')} />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} allowClear /></div>
            </>)}

            {(kind === 'wind' || kind === 'line') && ends && (<>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="시작 X" value={ends[0][0]} onChange={(v) => setEnd(0, 0, v)} />
                <Num label="시작 Y" value={ends[0][1]} onChange={(v) => setEnd(0, 1, v)} />
                <Num label="끝 X" value={ends[1][0]} onChange={(v) => setEnd(1, 0, v)} />
                <Num label="끝 Y" value={ends[1][1]} onChange={(v) => setEnd(1, 1, v)} />
              </div>
              <button style={smallBtn(false)} onClick={() => commit(sketchFlip(norm, selected))} data-testid="flip">⇄ 방향 뒤집기</button>
            </>)}

            {kind === 'block' && (<>
              <label style={lab}>종류
                <select style={input} value={sel.el.kind} onChange={(e) => set({ kind: e.target.value })}><option value="slab">판(큰 도형)</option><option value="core">코어(빗금)</option><option value="opening">개구부(점선 캡슐)</option></select>
              </label>
              <label style={lab}>이름<input style={input} value={sel.el.name} onChange={(e) => set({ name: e.target.value }, 'name')} /></label>
              <label style={lab}>설명<input style={input} value={sel.el.desc} onChange={(e) => set({ desc: e.target.value }, 'desc')} /></label>
              <div style={lab}>채움색<Colors value={sel.el.fill} onChange={(c) => set({ fill: c })} allowClear /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="왼쪽 X" value={sel.el.rect[0]} onChange={(v) => setRect(0, v)} />
                <Num label="위쪽 Y" value={sel.el.rect[1]} onChange={(v) => setRect(1, v)} />
                <Num label="오른쪽 X" value={sel.el.rect[2]} onChange={(v) => setRect(2, v)} />
                <Num label="아래쪽 Y" value={sel.el.rect[3]} onChange={(v) => setRect(3, v)} />
              </div>
            </>)}

            {kind === 'memo' && (<>
              <label style={lab}>글자<input style={input} value={sel.el.text} onChange={(e) => set({ text: e.target.value }, 'text')} /></label>
              <label style={lab}>크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="X" value={sel.el.x} onChange={(v) => set({ x: v }, 'x')} />
                <Num label="Y" value={sel.el.y} onChange={(v) => set({ y: v }, 'y')} />
              </div>
            </>)}

            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => setSelected('')}>선택 해제</button>
              <button style={smallBtn(false)} onClick={() => { if (copySel()) pasteClip(3); }} title="Ctrl+D" data-testid="duplicate">복제</button>
              <button style={smallBtn(false)} onClick={copySel} title="Ctrl+C" data-testid="copy">복사</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="delete">삭제</button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>좌표는 그림 안 위치(0~100)입니다. 위쪽 ‘SVG 저장’을 누르면 지금 모습 그대로 저장됩니다.</p>
      </div>
    </div>
  );
}
