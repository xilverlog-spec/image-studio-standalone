import React, { useMemo, useRef, useState } from 'react';
import { DASHES, DASH_LABEL, HEAD_LABEL, renderSketch, normalizeSketch, sketchFind, sketchKind, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd } from './conceptDiagram/sketch';

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

  const onPick = (e) => { const el = e.target.closest?.('[data-eid]'); setSelected(el ? el.getAttribute('data-eid') : ''); };
  const onKey = (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (!typing && selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') setSelected('');
  };

  const ends = sel?.el?.pts ? [sel.el.pts[0], sel.el.pts[sel.el.pts.length - 1]] : null;
  const setEnd = (which, axis, v) => {
    const a = [...ends[0]]; const z = [...ends[1]];
    (which === 0 ? a : z)[axis] = v;
    commit(sketchSetEnds(norm, selected, a, z), `${selected}:end`);
  };
  const setRect = (i, v) => { const r = [...sel.el.rect]; r[i] = v; set({ rect: r }, 'rect'); };

  const title = { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' };
  const kindName = { block: sel?.el?.kind === 'core' ? '코어(빗금 도형)' : '판(큰 도형)', line: '선', wind: '바람·흐름 화살표', memo: '글자 메모' }[kind];

  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', outline: 'none' }} data-testid="sketch-editor">
      <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div onClick={onPick} dangerouslySetInnerHTML={{ __html: svg }} data-testid="sketch-canvas" />
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
            <button style={smallBtn(false)} onClick={() => add('memo')}>＋ 글자</button>
          </div>
        </div>

        {!sel && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>그림의 화살표·선·도형·글자를 클릭하면 여기서 속성을 바꿀 수 있습니다. (Delete 로 삭제, Ctrl+Z 되돌리기)</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['pres', '발표용'], ['line', '도면용']].map(([id, label]) => <button key={id} style={{ ...smallBtn(norm.style === id), flex: 1 }} onClick={() => setGlobal({ style: id })}>{label}</button>)}
            </div>
            <label style={lab}>제목<input style={input} value={norm.title} onChange={(e) => setGlobal({ title: e.target.value }, 'title')} /></label>
            <label style={lab}>부제<input style={input} value={norm.subtitle} onChange={(e) => setGlobal({ subtitle: e.target.value }, 'subtitle')} /></label>
            <label style={lab}>범례: 화살표<input style={input} value={norm.legend.wind} onChange={(e) => setGlobal({ legend: { ...norm.legend, wind: e.target.value } }, 'lgw')} /></label>
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
              <label style={lab}>선 종류
                <select style={input} value={sel.el.dash} onChange={(e) => set({ dash: e.target.value })} data-testid="prop-dash">{Object.keys(DASHES).map((k) => <option key={k} value={k}>{DASH_LABEL[k]}</option>)}</select>
              </label>
              <label style={lab}>굵기 {sel.el.width}
                <input type="range" min="1" max="12" step="0.5" value={sel.el.width} onChange={(e) => set({ width: Number(e.target.value) }, 'w')} />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={sel.el.smooth} onChange={(e) => set({ smooth: e.target.checked })} />부드러운 곡선</label>
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
                <select style={input} value={sel.el.kind} onChange={(e) => set({ kind: e.target.value })}><option value="slab">판(큰 도형)</option><option value="core">코어(빗금)</option></select>
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
              <button style={smallBtn(false, true)} onClick={remove} data-testid="delete">삭제</button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>좌표는 그림 안 위치(0~100)입니다. 위쪽 ‘SVG 저장’을 누르면 지금 모습 그대로 저장됩니다.</p>
      </div>
    </div>
  );
}
