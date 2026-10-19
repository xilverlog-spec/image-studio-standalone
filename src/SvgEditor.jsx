import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyEdits, hasEdits, editSet, editMove, editMoveTo, editDelete, editRestore, editAsPath, editTranslate, DASH_PRESETS, dashKind, dashPatch, parsePath, pathD, pathNodes, pathMoveNode, pathMoveCtrl, pathToggleCurve, pathAddNode, pathDelNode, parsePoints, pointsStr, lineToCurveD } from './conceptDiagram/svgedit';
import { normText, pickByText, responsiveSvg } from './conceptDiagram/inlineText';
import { textAtPoint, InlineInput, textUnitSize, PtReadout } from './InlineText';

// 평면 다이어그램·배치 개념도·매스 과정도·버블도·층별 조닝도 같은 '구조형 결과'의 편집기.
// 그림 속 도형을 하나씩 눌러 고른 뒤 색·위치(끌기)·곡선(마디 끌기)·선 종류·굵기·투명도를 고친다. 글자는 더블클릭으로 그 자리에서 고친다.
// 고친 내용(edits)은 부모가 갖고, 그림을 다시 그릴 때(글자를 고쳤을 때)도 같은 요소에 다시 입혀진다.

const input = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.9)', color: 'var(--text-primary)', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const smallBtn = (on, danger) => ({
  padding: '5px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${danger ? '#fca5a5' : on ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
  background: danger ? '#fef2f2' : on ? 'rgba(51,51,153,0.12)' : 'rgba(255,255,255,0.85)', color: danger ? '#B91C1C' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const sec = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.7)' };
const lab = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
const title = { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' };
const SWATCHES = ['#1E88C8', '#E8833A', '#3E8E41', '#D6453D', '#7C5CBF', '#222222', '#FFFFFF'];
const TAG_NAME = { path: '곡선·경로', line: '선', polyline: '꺾은선', polygon: '다각형', rect: '사각형', circle: '원', ellipse: '타원', text: '글자', g: '묶음(여러 요소)' };

const hexOf = (c) => {
  const s = String(c || '').trim(); if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/); if (!m) return '';
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const r2 = (v) => Math.round(v * 100) / 100;

function Colors({ value, onChange, none, onNone }) {
  const v = hexOf(value);
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      {SWATCHES.map((c) => <button key={c} title={c} onClick={() => onChange(c)} style={{ width: 20, height: 20, borderRadius: 10, background: c, border: v === c ? '2px solid #111' : '1px solid #bbb', cursor: 'pointer', padding: 0 }} />)}
      <input type="color" value={v || '#888888'} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border-color)', borderRadius: 4, background: 'none' }} />
      {onNone && <button style={{ ...smallBtn(none), padding: '2px 7px', fontSize: 11 }} onClick={onNone}>{none ? '없음 ✓' : '없음'}</button>}
    </div>
  );
}

export default function SvgEditor({ svg, edits, onEdits, fields, onTextEdit, onMiss, maxWidth, disabled, shortcutsEnabled, ptInfo }) {
  const view = useMemo(() => applyEdits(svg, edits, { ids: true }), [svg, edits]);
  const html = useMemo(() => ({ __html: responsiveSvg(view.svg) }), [view.svg]); // 같은 객체여야 React 가 그림을 매번 다시 만들지 않는다(다시 만들면 표시·마우스 올림이 사라진다)
  const E = useMemo(() => (edits && edits.sig === view.sig ? edits : { sig: view.sig, ops: {} }), [edits, view.sig]);
  const stale = !!edits && edits.sig !== view.sig && hasEdits(edits);
  const els = view.els; const byId = useMemo(() => Object.fromEntries(els.map((e) => [e.id, e])), [els]);
  const [sel, setSel] = useState('');
  const [node, setNode] = useState(-1);          // 고른 경로 마디(segs 번호)
  const [ov, setOv] = useState(null);            // 화면 위 손잡이·선택 상자(화소 좌표)
  const [ed, setEd] = useState(null);            // 글자 고치는 중
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const hostRef = useRef(null); const bodyRef = useRef(null); const drag = useRef(null); const keyRef = useRef(null);
  const Eref = useRef(E); Eref.current = E;
  const sigRef = useRef(view.sig); sigRef.current = view.sig;

  const elOf = (id) => bodyRef.current?.querySelector(`[data-eid="${id}"]:not([data-hit])`);
  const svgEl = () => bodyRef.current?.querySelector('svg');
  const toClient = (el, x, y) => { const m = el.getScreenCTM(); if (!m) return [0, 0]; const p = new DOMPoint(x, y).matrixTransform(m); return [p.x, p.y]; };
  const toLocal = (el, cx, cy) => { const m = el.getScreenCTM(); if (!m) return null; const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return [p.x, p.y]; };
  const toParent = (el, cx, cy) => { const par = el.parentNode; const m = par && par.getScreenCTM ? par.getScreenCTM() : null; if (!m) return null; const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return [p.x, p.y]; };
  const commit = (next, key) => onEdits?.(next, key);
  const patch = (id, p, key) => commit(editSet(Eref.current, id, p, sigRef.current), key ? `${id}:${key}` : '');

  // 그림의 첫 사각형이 그림 전체를 덮으면 배경이다(끌어 옮기지 않는다)
  const isBg = (id) => {
    const e = byId[id]; if (!e || e.tag !== 'rect') return false;
    const first = els.find((x) => x.kind === 'e'); if (!first || first.id !== id) return false;
    const a = e.attrs; const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number);
    return !!vb && num(a.width) >= vb[2] * 0.95 && num(a.height) >= vb[3] * 0.95;
  };

  // ── 선택한 요소의 손잡이를 화면 좌표로 계산 ──
  useLayoutEffect(() => {
    const host = hostRef.current; if (!host) return;
    const el = sel ? elOf(sel) : null; if (!el) { setOv(null); return; }
    const hr = host.getBoundingClientRect(); const rel = ([x, y]) => [x - hr.left, y - hr.top];
    const br = el.getBoundingClientRect();
    const o = { box: [br.left - hr.left, br.top - hr.top, br.width, br.height], pts: [], ctrls: [], lines: [], w: hr.width, h: hr.height };
    const tag = el.tagName.toLowerCase();
    if (tag === 'path') {
      const segs = parsePath(el.getAttribute('d')); const nodes = pathNodes(segs);
      nodes.forEach((n) => o.pts.push({ h: `n:${n.i}`, p: rel(toClient(el, n.p[0], n.p[1])), sel: n.i === node }));
      segs.forEach((s, i) => {
        const prev = segs[i - 1];
        if (s.c === 'C') { o.ctrls.push({ h: `c1:${i}`, p: rel(toClient(el, s.c1[0], s.c1[1])), from: rel(toClient(el, prev.p[0], prev.p[1])) }); o.ctrls.push({ h: `c2:${i}`, p: rel(toClient(el, s.c2[0], s.c2[1])), from: rel(toClient(el, s.p[0], s.p[1])) }); }
        if (s.c === 'Q') o.ctrls.push({ h: `c1:${i}`, p: rel(toClient(el, s.c1[0], s.c1[1])), from: rel(toClient(el, prev.p[0], prev.p[1])), from2: rel(toClient(el, s.p[0], s.p[1])) });
      });
    } else if (tag === 'line') {
      o.pts.push({ h: 'l:1', p: rel(toClient(el, num(el.getAttribute('x1')), num(el.getAttribute('y1')))) }, { h: 'l:2', p: rel(toClient(el, num(el.getAttribute('x2')), num(el.getAttribute('y2')))) });
    } else if (tag === 'polygon' || tag === 'polyline') {
      parsePoints(el.getAttribute('points')).forEach((p, i) => o.pts.push({ h: `v:${i}`, p: rel(toClient(el, p[0], p[1])) }));
    } else if (tag === 'rect') {
      const x = num(el.getAttribute('x')); const y = num(el.getAttribute('y')); const w = num(el.getAttribute('width')); const h = num(el.getAttribute('height'));
      [['r:nw', x, y], ['r:ne', x + w, y], ['r:se', x + w, y + h], ['r:sw', x, y + h]].forEach(([k, px, py]) => o.pts.push({ h: k, p: rel(toClient(el, px, py)), sq: true }));
    } else if (tag === 'circle') {
      o.pts.push({ h: 'o:r', p: rel(toClient(el, num(el.getAttribute('cx')) + num(el.getAttribute('r')), num(el.getAttribute('cy')))) });
    } else if (tag === 'ellipse') {
      o.pts.push({ h: 'o:rx', p: rel(toClient(el, num(el.getAttribute('cx')) + num(el.getAttribute('rx')), num(el.getAttribute('cy')))) }, { h: 'o:ry', p: rel(toClient(el, num(el.getAttribute('cx')), num(el.getAttribute('cy')) + num(el.getAttribute('ry')))) });
    }
    setOv(o);
  }, [view.svg, sel, node, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = hostRef.current; if (!h || typeof ResizeObserver === 'undefined') return undefined; const ro = new ResizeObserver(() => setTick((n) => n + 1)); ro.observe(h); return () => ro.disconnect(); }, []);
  useEffect(() => { if (sel && !byId[sel]) { setSel(''); setNode(-1); } }, [byId, sel]);
  // 고칠 수 있는 글자에 표시를 단다
  useEffect(() => {
    const b = bodyRef.current; if (!b) return;
    const ts = [...b.querySelectorAll('text')];
    ts.forEach((t) => { const k = normText(t.textContent); const idx = ts.filter((x) => normText(x.textContent) === k).indexOf(t); if (pickByText(fields, t.textContent, idx)) t.setAttribute('data-editable', '1'); });
  }, [view.svg, fields]);

  // ── 누르기·끌기 ──
  const onDown = (e) => {
    if (e.button !== 0 || disabled || ed) return;
    const h = e.target.closest?.('[data-h]');
    if (h) { startHandle(e, h.getAttribute('data-h')); return; }
    const t = e.target.closest?.('[data-eid]');
    if (!t) { setSel(''); setNode(-1); return; }
    e.preventDefault();
    let id = t.getAttribute('data-eid');
    if (e.altKey && byId[id]?.parent) id = byId[id].parent; // Alt+클릭: 속한 묶음을 고른다
    setSel(id); setNode(-1);
    if (isBg(id)) return;
    const el = elOf(id); if (!el) return;
    const start = toParent(el, e.clientX, e.clientY); if (!start) return;
    drag.current = { kind: 'move', id, start, t0: editTranslate(Eref.current, id), cx: e.clientX, cy: e.clientY, moved: false, el, base: Eref.current };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const startHandle = (e, h) => {
    e.preventDefault(); e.stopPropagation();
    const el = elOf(sel); if (!el) return;
    const [kind, arg] = h.split(':'); const tag = el.tagName.toLowerCase();
    const d = { kind, arg, id: sel, el, tag, cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, key: `${sel}:${kind}` };
    if (kind === 'n') setNode(Number(arg));
    if (tag === 'path') d.segs = parsePath(el.getAttribute('d'));
    if (tag === 'polygon' || tag === 'polyline') d.pts = parsePoints(el.getAttribute('points'));
    if (tag === 'rect') d.rect = ['x', 'y', 'width', 'height'].map((k) => num(el.getAttribute(k)));
    d.start = toLocal(el, e.clientX, e.clientY);
    drag.current = d;
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (!d.moved) { if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return; d.moved = true; setDragging(true); }
    const sig = sigRef.current;
    if (d.kind === 'move') {
      const p = toParent(d.el, e.clientX, e.clientY); if (!p) return;
      let dx = p[0] - d.start[0]; let dy = p[1] - d.start[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      commit(editMoveTo(d.base, d.id, d.t0[0] + dx, d.t0[1] + dy, sig), `drag:${d.id}`); return;
    }
    const p = toLocal(d.el, e.clientX, e.clientY); if (!p) return; const dv = [p[0] - d.start[0], p[1] - d.start[1]];
    let set = null;
    if (d.tag === 'path') {
      const i = Number(d.arg);
      if (d.kind === 'n') set = { d: pathD(pathMoveNode(d.segs, i, dv)) };
      else if (d.kind === 'c1' || d.kind === 'c2') set = { d: pathD(pathMoveCtrl(d.segs, i, d.kind, dv)) };
    } else if (d.kind === 'l') {
      set = d.arg === '1' ? { x1: String(r2(p[0])), y1: String(r2(p[1])) } : { x2: String(r2(p[0])), y2: String(r2(p[1])) };
    } else if (d.kind === 'v') {
      const i = Number(d.arg); set = { points: pointsStr(d.pts.map((q, k) => (k === i ? [q[0] + dv[0], q[1] + dv[1]] : q))) };
    } else if (d.kind === 'r') {
      let [x, y, w, h] = d.rect; let x0 = x; let y0 = y; let x1 = x + w; let y1 = y + h;
      if (d.arg.includes('w')) x0 = p[0]; if (d.arg.includes('e')) x1 = p[0]; if (d.arg.includes('n')) y0 = p[1]; if (d.arg.includes('s')) y1 = p[1];
      set = { x: String(r2(Math.min(x0, x1))), y: String(r2(Math.min(y0, y1))), width: String(r2(Math.abs(x1 - x0))), height: String(r2(Math.abs(y1 - y0))) };
    } else if (d.kind === 'o') {
      const cx = num(d.el.getAttribute('cx')); const cy = num(d.el.getAttribute('cy'));
      if (d.arg === 'r') set = { r: String(r2(Math.max(0.5, Math.hypot(p[0] - cx, p[1] - cy)))) };
      else if (d.arg === 'rx') set = { rx: String(r2(Math.max(0.5, Math.abs(p[0] - cx)))) };
      else set = { ry: String(r2(Math.max(0.5, Math.abs(p[1] - cy)))) };
    }
    if (set) commit(editSet(d.base, d.id, set, sig), d.key);
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); drag.current = null; setDragging(false); setTick((n) => n + 1); };
  useEffect(() => () => window.removeEventListener('pointermove', onMove), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 글자 더블클릭 고치기 ──
  const onDbl = (e) => {
    if (disabled || ed) return;
    const b = bodyRef.current; const t = textAtPoint(b, e.clientX, e.clientY); if (!t) return;
    const ts = [...b.querySelectorAll('text')]; const idx = ts.filter((x) => normText(x.textContent) === normText(t.textContent)).indexOf(t);
    const fl = pickByText(fields, t.textContent, idx);
    e.preventDefault(); e.stopPropagation();
    if (!fl) { onMiss?.(t.textContent); return; }
    setEd({ field: fl, target: t });
  };

  // ── 속성 읽기·바꾸기 ──
  const el = sel ? elOf(sel) : null; const info = sel ? byId[sel] : null; const tag = info?.tag || '';
  const cs = el && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const fill = cs ? hexOf(cs.fill) : ''; const stroke = cs ? hexOf(cs.stroke) : '';
  const fillNone = !!cs && (cs.fill === 'none' || !fill); const strokeNone = !!cs && (cs.stroke === 'none' || !stroke);
  const sw = el ? num(el.getAttribute('stroke-width') ?? (cs && cs.strokeWidth), 1) : 1;
  const dash = el ? dashKind(el.getAttribute('stroke-dasharray')) : 'solid';
  const op = el ? num(el.getAttribute('opacity'), 1) : 1;
  const fs = el && tag === 'text' ? num(cs?.fontSize, 14) : 0;
  const tr = sel ? editTranslate(E, sel) : [0, 0]; const edited = !!(sel && E.ops[sel]);
  const editedCount = Object.keys(E.ops).length;
  const kids = (id) => els.filter((x) => x.kind === 'e' && (() => { let p = x.parent; while (p) { if (p === id) return true; p = byId[p]?.parent; } return false; })());
  const leaf = tag && tag !== 'g';
  const setColor = (prop, c) => {
    if (tag !== 'g') { patch(sel, { [prop]: c }, prop); return; }
    let next = Eref.current; // 묶음: 안에서 그 색이 쓰이는 도형(없음이 아닌 것)에만 칠한다
    kids(sel).forEach((k) => { const ke = elOf(k.id); const c0 = ke ? getComputedStyle(ke)[prop] : 'none'; if (ke && c0 && c0 !== 'none') next = editSet(next, k.id, { [prop]: c }, sigRef.current); });
    commit(next, `${sel}:g${prop}`);
  };
  const setNone = (prop) => { if (tag === 'g') { let next = Eref.current; kids(sel).forEach((k) => { next = editSet(next, k.id, { [prop]: 'none' }, sigRef.current); }); commit(next); } else patch(sel, { [prop]: 'none' }); };
  const nudge = (dx, dy, key) => { if (sel && !isBg(sel)) commit(editMove(Eref.current, sel, dx, dy, sigRef.current), key ? `${sel}:${key}` : ''); };
  const pathSegs = el && tag === 'path' ? parsePath(el.getAttribute('d')) : null;
  const setD = (segs) => patch(sel, { d: pathD(segs) });
  const lineToCurve = () => {
    const x1 = num(el.getAttribute('x1')); const y1 = num(el.getAttribute('y1')); const x2 = num(el.getAttribute('x2')); const y2 = num(el.getAttribute('y2'));
    commit(editAsPath(Eref.current, sel, lineToCurveD(x1, y1, x2, y2), ['x1', 'y1', 'x2', 'y2'], sigRef.current));
  };
  const remove = () => { if (sel && !isBg(sel)) { commit(editDelete(Eref.current, sel, sigRef.current)); setSel(''); setNode(-1); } };

  // ── 단축키(창 전체): Delete 삭제 · 방향키 미세 이동 · Esc 해제 ──
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  keyRef.current = (e) => {
    if (shortcutsEnabled && !shortcutsEnabled()) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    if (typing || ed || (e.ctrlKey || e.metaKey)) return;
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (sel && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const st = e.shiftKey ? 5 : 1; nudge(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0, 'nudge'); }
    else if (e.key === 'Escape') { setSel(''); setNode(-1); }
  };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} data-testid="svg-editor">
      <div style={{ flex: '1 1 480px', minWidth: 360 }}>
        <div ref={hostRef} onPointerDown={onDown} onDoubleClick={onDbl} style={{ position: 'relative', width: '100%', maxWidth: maxWidth || undefined, margin: '0 auto', border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }} data-testid="inline-svg">
          <style>{'.sv-ed [data-eid]{cursor:move}.sv-ed text[data-editable]{cursor:text}.sv-ed [data-eid]:not([data-hit]):hover{filter:drop-shadow(0 0 2px #F28C28)}.sv-ed [data-hit]{cursor:move}'}</style>
          <div ref={bodyRef} className="sv-ed" dangerouslySetInnerHTML={html} data-testid="sv-canvas" style={{ touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'default', borderRadius: 8, overflow: 'hidden' }} />
          {ov && (
            <svg width={ov.w} height={ov.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 3 }} data-testid="sv-overlay">
              <rect x={ov.box[0] - 3} y={ov.box[1] - 3} width={ov.box[2] + 6} height={ov.box[3] + 6} fill="none" stroke="#F28C28" strokeWidth="1.6" strokeDasharray="6 4" rx="3" />
              {ov.ctrls.map((c) => (<g key={c.h}><line x1={c.from[0]} y1={c.from[1]} x2={c.p[0]} y2={c.p[1]} stroke="#F28C28" strokeWidth="1" strokeDasharray="3 3" />{c.from2 && <line x1={c.from2[0]} y1={c.from2[1]} x2={c.p[0]} y2={c.p[1]} stroke="#F28C28" strokeWidth="1" strokeDasharray="3 3" />}
                <circle data-h={c.h} cx={c.p[0]} cy={c.p[1]} r="5" fill="#fff" stroke="#F28C28" strokeWidth="2" style={{ pointerEvents: 'auto', cursor: 'crosshair' }} /></g>))}
              {ov.pts.map((p) => (p.sq
                ? <rect key={p.h} data-h={p.h} x={p.p[0] - 5} y={p.p[1] - 5} width="10" height="10" rx="2" fill="#fff" stroke="#F28C28" strokeWidth="2" style={{ pointerEvents: 'auto', cursor: 'nwse-resize' }} />
                : <circle key={p.h} data-h={p.h} cx={p.p[0]} cy={p.p[1]} r="6" fill={p.sel ? '#F28C28' : '#fff'} stroke="#F28C28" strokeWidth="2.2" style={{ pointerEvents: 'auto', cursor: 'move' }} />))}
            </svg>
          )}
          {ed && hostRef.current && (
            <InlineInput host={hostRef.current} target={ed.target} value={ed.field.value} multiline={/\n/.test(ed.field.value)}
              onCommit={(v) => { const fl = ed.field; setEd(null); if (v !== fl.value) onTextEdit?.(fl, v); }} onCancel={() => setEd(null)} />
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', textAlign: 'center', margin: '8px 0 0' }} data-testid="inline-hint">✏️ 도형을 <b>클릭</b>하면 오른쪽에서 색·선 종류를 고치고, <b>끌어서 옮기고</b>, 주황 점(마디)을 끌어 <b>곡선·모양</b>을 고칩니다. 글자는 <b>더블클릭</b>해서 고칩니다. Alt+클릭: 묶음 선택 · Shift: 수평·수직 · 방향키: 미세 이동 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
      </div>

      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <div style={sec}>
          <span style={title}>그림 속 도형 고치기</span>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>손으로 고친 요소 <b data-testid="sv-count">{editedCount}</b>개{stale && <span style={{ color: '#B45309' }}> · 그림 구조가 바뀌어 예전 수정은 적용되지 않았습니다</span>}</p>
          {editedCount > 0 && <button style={smallBtn(false, true)} onClick={() => { commit({ sig: view.sig, ops: {} }); setSel(''); }} data-testid="sv-reset">모든 수정 처음으로</button>}
        </div>

        {!sel && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림 속 <b>선·도형·원·글자</b>를 클릭하면 여기에 속성이 나옵니다. 여러 요소가 한 덩어리(칩·아이콘 등)로 묶여 있으면 <b>Alt+클릭</b> 또는 <b>↑ 묶음</b> 버튼으로 통째로 고릅니다.</p>
          </div>
        )}

        {sel && info && (
          <div style={sec} data-testid="sv-props">
            <span style={title}>선택: {TAG_NAME[tag] || tag} ({sel}){isBg(sel) ? ' · 배경' : ''}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {info.parent && <button style={smallBtn(false)} onClick={() => { setSel(info.parent); setNode(-1); }} data-testid="sv-up">↑ 묶음 선택</button>}
              <button style={smallBtn(false)} onClick={() => { setSel(''); setNode(-1); }}>선택 해제</button>
            </div>

            {tag === 'text' && <PtReadout size={textUnitSize(el)} ptInfo={ptInfo} text={el.textContent} testid="sv-pt" />}
            {tag !== 'line' && tag !== 'polyline' && (
              <div style={lab}>{tag === 'text' ? '글자 색' : '채움 색'}<Colors value={fill} onChange={(c) => setColor('fill', c)} none={fillNone} onNone={tag === 'text' ? undefined : () => setNone('fill')} /></div>
            )}
            {tag !== 'text' && (
              <div style={lab}>선 색<Colors value={stroke} onChange={(c) => setColor('stroke', c)} none={strokeNone} onNone={() => setNone('stroke')} /></div>
            )}
            {leaf && tag !== 'text' && !strokeNone && (<>
              <label style={lab}>선 굵기 {r2(sw)}
                <input type="range" min="0.5" max="14" step="0.5" value={Math.min(14, Math.max(0.5, sw))} onChange={(e) => patch(sel, { 'stroke-width': e.target.value }, 'sw')} data-testid="sv-width" />
              </label>
              <label style={lab}>선 종류
                <select style={input} value={dash} onChange={(e) => patch(sel, dashPatch(e.target.value))} data-testid="sv-dash">
                  {Object.entries(DASH_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  {dash === 'custom' && <option value="custom">사용자 지정(원본)</option>}
                </select>
              </label>
            </>)}
            {tag === 'text' && (
              <label style={lab}>글자 크기 {r2(fs)}
                <input type="range" min="6" max="60" step="1" value={Math.min(60, Math.max(6, fs))} onChange={(e) => patch(sel, { 'font-size': e.target.value }, 'fs')} data-testid="sv-fs" />
              </label>
            )}
            <label style={lab}>투명도 {Math.round(op * 100)}%
              <input type="range" min="0.05" max="1" step="0.05" value={op} onChange={(e) => patch(sel, { opacity: Number(e.target.value) >= 1 ? null : e.target.value }, 'op')} data-testid="sv-opacity" />
            </label>

            {tag === 'path' && pathSegs && (
              <div style={{ ...lab, gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sv-path">
                <span style={title}>곡선·모양 (마디 {pathNodes(pathSegs).length}개)</span>
                <span style={{ fontSize: 11 }}>사각 점=마디, 동그라미=곡선 조절 점. 점을 끌어 모양을 고칩니다.</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={{ ...smallBtn(false), padding: '3px 8px' }} onClick={() => setD(pathAddNode(pathSegs))} data-testid="sv-addnode">＋ 점 추가</button>
                  <button style={{ ...smallBtn(false), padding: '3px 8px' }} disabled={node < 0} onClick={() => { setD(pathDelNode(pathSegs, node)); setNode(-1); }} data-testid="sv-delnode">－ 고른 점 빼기</button>
                  <button style={{ ...smallBtn(false), padding: '3px 8px' }} disabled={node < 1} onClick={() => setD(pathToggleCurve(pathSegs, node))} data-testid="sv-curve" title="고른 점으로 들어오는 구간을 직선 ↔ 곡선으로">직선↔곡선</button>
                </div>
              </div>
            )}
            {tag === 'line' && (
              <button style={smallBtn(false)} onClick={lineToCurve} data-testid="sv-line2curve" title="이 직선을 휘는 곡선으로 바꿉니다(바꾼 뒤 주황 점으로 모양을 고칩니다)">∿ 곡선으로 바꾸기</button>
            )}

            <div style={{ ...lab, gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }}>
              <span style={title}>위치 {tr[0] || tr[1] ? `(이동 ${r2(tr[0])}, ${r2(tr[1])})` : ''}</span>
              {!isBg(sel) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]].map(([t, dx, dy]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => nudge(dx * 5, dy * 5)} data-testid={`sv-nudge-${t}`}>{t} 5</button>)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} disabled={!edited} onClick={() => commit(editRestore(Eref.current, sel, sigRef.current))} data-testid="sv-restore">이 요소 처음 모양으로</button>
              <button style={smallBtn(false, true)} disabled={isBg(sel)} onClick={remove} data-testid="sv-delete">삭제</button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>고친 모양은 SVG·PNG 저장에 그대로 담깁니다. 글자를 고쳐도 도형 수정은 유지됩니다(그림 구조가 같을 때).</p>
      </div>
    </div>
  );
}
