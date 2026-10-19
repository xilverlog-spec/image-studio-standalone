import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DASHES, DASH_LABEL, HEAD_LABEL, SHAPES, SHAPE_LABEL, renderSketch, normalizeSketch, sketchFind, sketchKind, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd, sketchView, sketchMoveBy, sketchResizeRect, sketchSetEnd, sketchSetAmp, sketchSetVia, sketchLockAspect, sketchSetPt, sketchAddPt, sketchDelPt, sketchSetZone, sketchSnapToWall, SIDES, SIDE_LABEL, sketchSnapshot, sketchPaste, sketchSnapGuides, sketchSnapPointG, sketchBox, sketchAxes, sketchAlign, sketchMirrorPlace, sketchMirrorCopy, sketchSameSize, SKETCH_SIZE } from './conceptDiagram/sketch';

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
const ZONE_SWATCHES = ['#F6B8B3', '#F9D3A0', '#F8E8A0', '#BFE0B8', '#B5D5F2', '#D9C2E8', '#DDDDDD']; // 구역을 칠하는 연한 색(곱하기로 칠해져 선·글자는 그대로 비친다)
const r1 = (v) => Math.round(v * 10) / 10;
const GUIDE_COLOR = { edge: '#E0368A', center: '#E0368A', axis: '#2E9E5B', mirror: '#0FA3B1' };
const GUIDE_LABEL = { center: '가운데', axis: '중심축', mirror: '대칭' };
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

function Colors({ value, onChange, allowClear, swatches = SWATCHES }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      {swatches.map((c) => <button key={c} title={c} onClick={() => onChange(c)} style={{ width: 20, height: 20, borderRadius: 10, background: c, border: value === c ? '2px solid #111' : '1px solid #bbb', cursor: 'pointer', padding: 0 }} />)}
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#888888'} onChange={(e) => onChange(e.target.value)} style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border-color)', borderRadius: 4, background: 'none' }} />
      {allowClear && <button style={{ ...smallBtn(false), padding: '2px 7px', fontSize: 11 }} onClick={() => onChange('')}>기본색</button>}
    </div>
  );
}

import { textAtPoint, InlineInput, textUnitSize, PtReadout } from './InlineText';
import { sketchReplaceImage, sketchCropImage } from './conceptDiagram/sketch';
import { schedulePaste, markInternalCopy } from './conceptDiagram/clip';
import { readImageFile, bakeCrop, imageSize } from './conceptDiagram/imgio';
import ImageCropDialog from './ImageCropDialog';
import { normText, pickByText, sketchTextTargets, sketchApplyText } from './conceptDiagram/inlineText';

export default function SketchEditor({ spec, onChange, disabled, shortcutsEnabled, ptInfo, regionPick, regionRect, onRegionPick }) {
  const [selected, setSelected] = useState('');
  const [regionDraft, setRegionDraft] = useState(null); // '이 영역만 다시 그리기'에서 끌고 있는 상자(다이어그램 좌표 [x0, y0, x1, y1])
  const regionDrag = useRef(null);
  const [textInfo, setTextInfo] = useState(null); // 마지막으로 누른 글자의 크기(그림 단위) — 몇 pt 인지 알려 주는 데 쓴다
  const [cropFor, setCropFor] = useState(null); const [imgBusy, setImgBusy] = useState(false); const [imgNote, setImgNote] = useState(''); const imgFileRef = useRef(null); // 넣은 이미지 자르기 창·바꾸기
  const past = useRef([]); const future = useRef([]);
  const lastKey = useRef(''); const lastAt = useRef(0);
  const [, tick] = useState(0);
  const norm = useMemo(() => normalizeSketch(spec), [spec]);
  const specRef = useRef(norm); specRef.current = norm;
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState([]);       // 끄는 동안 붙은 안내선(가로·세로)
  const [showAxis, setShowAxis] = useState(false); // 그림 가운데 중심축을 항상 보여 줄지
  const [refId, setRefId] = useState('axis');      // 정렬·대칭의 기준(요소 id 또는 'axis' = 그림 가운데)
  const [axisPick, setAxisPick] = useState('frame'); // 대칭축: 그림 가운데 / 가장 큰 도형 가운데
  const keyRef = useRef(null);
  const hostRef = useRef(null); const [ed, setEd] = useState(null); // ed: 그림 위에서 글자를 고치는 중 { target(<text>), value, multiline, apply }

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

  const html = useMemo(() => ({ __html: svg }), [svg]); // 같은 객체여야 React 가 그림을 매번 다시 만들지 않는다
  const sel = selected ? sketchFind(norm, selected) : null;
  const view = useMemo(() => sketchView(norm), [norm]);
  // 중심축 항상 보기: 그림 틀 가운데의 세로·가로선
  const axisGuides = showAxis ? (() => { const f = norm.frame; const ax = sketchAxes(norm, ''); return [{ dim: 'x', v: ax.x[0].v, kind: 'axis', lo: f[1] - 2, hi: f[3] + 2 }, { dim: 'y', v: ax.y[0].v, kind: 'axis', lo: f[0] - 2, hi: f[2] + 2 }]; })() : [];
  // 정렬·대칭 기준: 고른 요소 말고 다른 요소 중에서 고른다. 없어진 요소면 그림 가운데로 돌린다
  const others = selected ? [...norm.blocks, ...norm.lines, ...norm.winds, ...norm.memos].filter((e) => e.id !== selected) : [];
  const ref = refId !== 'axis' && others.some((e) => e.id === refId) ? refId : 'axis';
  const refIsBlock = selected && ref !== 'axis' && sketchKind(norm, ref) === 'block' && sketchKind(norm, selected) === 'block';
  const axesNow = selected ? sketchAxes(norm, selected) : null;
  const axisIdx = axisPick === 'big' && axesNow && axesNow.x.length > 1 ? 1 : 0;
  const elLabel = (e) => `${{ block: e.kind === 'core' ? '코어' : e.kind === 'opening' ? '개구부' : '판', line: '선', wind: '화살표', memo: '글자' }[sketchKind(norm, e.id)] || ''} ${e.id}${e.name ? ` · ${e.name}` : e.text ? ` · ${e.text}` : ''}`;
  const axisVal = (dir) => { const a = dir === 'h' ? axesNow.x : axesNow.y; return a[Math.min(axisIdx, a.length - 1)].v; };
  const doAlign = (mode) => commit(sketchAlign(norm, selected, ref, mode));
  const doMirrorPlace = (dir) => { if (ref !== 'axis') commit(sketchMirrorPlace(norm, selected, ref, axisVal(dir), dir)); };
  const doMirrorCopy = (dir) => { const r = sketchMirrorCopy(norm, selected, axisVal(dir), dir); if (r.id) { commit(r.spec); setSelected(r.id); } };
  const kind = sel ? sketchKind(norm, selected) : '';
  const set = (patch, key) => commit(sketchUpdate(norm, selected, patch), key ? `${selected}:${key}` : '');
  const remove = () => { commit(sketchDelete(norm, selected)); setSelected(''); };
  const normRef = useRef(norm); normRef.current = norm; // 파일을 읽는 동안 그림이 바뀌었을 수 있어, 끝난 뒤에는 그때의 최신 그림에 적용한다
  const replaceImg = async (file) => {
    if (!file || !sel || sel.el.kind !== 'image') return; const id = selected; setImgBusy(true); setImgNote('');
    try { const im = await readImageFile(file); commit(sketchReplaceImage(normRef.current, id, { href: im.url, w: im.w, h: im.h })); setImgNote(`이미지를 바꿨습니다 (${im.w}×${im.h}px · 약 ${im.kb.toLocaleString()}KB). 위치·크기 칸 안에 비율을 지켜 맞췄습니다.`); }
    catch (e) { setImgNote(`이미지를 바꾸지 못했습니다: ${e.message}`); } finally { setImgBusy(false); }
  };
  const applyCrop = async (crop) => { // crop: null 이면 자르기 해제(원본 전체)
    const id = cropFor?.id; const el = id ? sketchFind(normRef.current, id)?.el : null; if (!el) { setCropFor(null); return; }
    const orig = el.orig || el.href; setImgBusy(true); setImgNote('');
    try {
      const out = crop ? await bakeCrop(orig, crop) : { url: orig, ...(await imageSize(orig)) };
      commit(sketchCropImage(normRef.current, id, { crop, orig, href: out.url, w: out.w, h: out.h })); setCropFor(null);
      setImgNote(crop ? `잘라 냈습니다 (${out.w}×${out.h}px). 다시 열면 원본에서 범위를 고칠 수 있습니다.` : '자르기를 풀었습니다(원본 전체).');
    } catch (e) { setImgNote(`자르지 못했습니다: ${e.message}`); } finally { setImgBusy(false); }
  };
  const add = (k) => { const r = sketchAdd(norm, k); commit(r.spec); setSelected(r.id); };
  const setGlobal = (patch, key) => commit({ ...norm, ...patch }, key);

  // 그림 좌표(1200x760) ← 화면 좌표 → 다이어그램 좌표
  const toDiag = (clientX, clientY) => {
    const el = canvasRef.current?.querySelector('svg'); if (!el) return null;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; // 그림 영역이 접혀 있으면 계산하지 않는다
    return sketchView(specRef.current).toDiag([((clientX - r.left) * SKETCH_SIZE[0]) / r.width, ((clientY - r.top) * SKETCH_SIZE[1]) / r.height]);
  };
  const onRegionMove = (e) => {
    const d = regionDrag.current; if (!d) return; const p = toDiag(e.clientX, e.clientY); if (!p) return;
    d.p1 = p; setRegionDraft([Math.min(d.p0[0], p[0]), Math.min(d.p0[1], p[1]), Math.max(d.p0[0], p[0]), Math.max(d.p0[1], p[1])]);
  };
  const onRegionUp = () => {
    window.removeEventListener('pointermove', onRegionMove); const d = regionDrag.current; regionDrag.current = null; setRegionDraft(null);
    if (!d || !d.p1) return; const r = [Math.min(d.p0[0], d.p1[0]), Math.min(d.p0[1], d.p1[1]), Math.max(d.p0[0], d.p1[0]), Math.max(d.p0[1], d.p1[1])];
    if (r[2] - r[0] >= 2 && r[3] - r[1] >= 2) onRegionPick?.(r);
  };
  const onDown = (e) => {
    if (e.button !== 0 || disabled) return;
    if (regionPick) { // 영역 고르기 모드: 눌러서 끌면 상자가 그려지고, 놓으면 그 영역이 정해진다(요소 선택·이동은 잠시 꺼 둔다)
      const p0 = toDiag(e.clientX, e.clientY); if (!p0) return; e.preventDefault();
      regionDrag.current = { p0, p1: null }; setRegionDraft([p0[0], p0[1], p0[0], p0[1]]);
      window.addEventListener('pointermove', onRegionMove); window.addEventListener('pointerup', onRegionUp, { once: true }); return;
    }
    const h = e.target.closest?.('[data-handle]'); const el = e.target.closest?.('[data-eid]');
    const tx = e.target.closest?.('text'); setTextInfo(tx ? { text: tx.textContent, size: textUnitSize(tx) } : null);
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
    const pt = toDiag(e.clientX, e.clientY); if (!pt) return; const snap = !e.altKey; const o = d.orig; let next = o; let gd = [];
    if (!d.handle) {
      let dx = pt[0] - d.start[0]; let dy = pt[1] - d.start[1];
      let lockX = false; let lockY = false;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; lockY = true; } else { dx = 0; lockX = true; } } // Shift: 수평·수직으로만
      const b0 = snap ? sketchBox(o, d.id) : null;
      if (b0) { const r = sketchSnapGuides(o, d.id, [b0[0] + dx, b0[1] + dy, b0[2] + dx, b0[3] + dy]); if (!lockX) dx += r.dx; if (!lockY) dy += r.dy; gd = r.guides.filter((g) => (g.dim === 'x' ? !lockX : !lockY)); }
      next = sketchMoveBy(o, d.id, dx, dy);
    } else if (d.handle === 'start' || d.handle === 'end') {
      const pts = sketchFind(o, d.id)?.el?.pts; const ex = pts ? (d.handle === 'start' ? pts[pts.length - 1] : pts[0]) : null; // 반대쪽 끝과 수평·수직으로 맞추기
      const r = snap ? sketchSnapPointG(o, d.id, pt, 1.4, ex ? [[ex[0], ex[1], ex[0], ex[1]]] : []) : { pt, guides: [] };
      next = sketchSetEnd(o, d.id, d.handle, r.pt); gd = r.guides;
    } else if (d.handle.startsWith('pt:')) next = sketchSetPt(o, d.id, Number(d.handle.slice(3)), pt);
    else if (d.handle === 'amp') next = sketchSetAmp(o, d.id, pt);
    else if (d.handle === 'via') next = sketchSetVia(o, d.id, pt);
    else {
      const r = snap ? sketchSnapPointG(o, d.id, pt) : { pt, guides: [] }; const hx = /[we]/.test(d.handle); const hy = /[ns]/.test(d.handle); // 움직이는 쪽 방향의 안내선만 쓴다
      next = sketchResizeRect(o, d.id, d.handle, hx ? r.pt[0] : pt[0], hy ? r.pt[1] : pt[1]); gd = r.guides.filter((g) => (g.dim === 'x' ? hx : hy));
      if (!e.shiftKey) next = sketchLockAspect(next, d.id, d.handle); // 내 이미지는 모서리를 끌 때 원본 비율을 지킨다(Shift: 자유롭게)
    }
    setGuides(gd);
    onChange(next); tick((n) => n + 1);
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); drag.current = null; setDragging(false); setGuides([]); tick((n) => n + 1); };
  useEffect(() => () => { window.removeEventListener('pointermove', onMove); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 단축키는 포커스와 무관하게 창 전체에서 받는다(그림을 클릭해도 포커스가 옮겨지지 않기 때문). 입력칸에 글자를 칠 때는 무시한다
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  // 복사(Ctrl+C)·잘라내기(Ctrl+X)·붙여넣기(Ctrl+V)·복제(Ctrl+D). 붙인 요소는 3칸씩 비껴 놓이고 곧바로 선택된다
  const copySel = () => { const sn = selected ? sketchSnapshot(norm, selected) : null; if (sn) { CLIP = sn; PASTE_N = 0; tick((n) => n + 1); } return !!sn; };
  const pasteClip = (offset) => { if (!CLIP) return; PASTE_N += 1; const k = offset ?? 3 * PASTE_N; const r = sketchPaste(norm, CLIP, k, k); if (r.id) { commit(r.spec); setSelected(r.id); } };
  const onKey = (e) => {
    if (shortcutsEnabled && !shortcutsEnabled()) return; // 페이지 미리보기를 만지는 중이면 페이지 단축키가 받는다
    if (cropFor) return; // 이미지 자르기 창이 열려 있는 동안은 편집 단축키(Delete 등)를 받지 않는다
    const tag = e.target?.tagName || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;
    const mod = e.ctrlKey || e.metaKey; const k = (e.key || '').toLowerCase();
    if (mod && !typing && k === 'c' && selected && !window.getSelection?.()?.toString()) { if (copySel()) { e.preventDefault(); markInternalCopy(); } }
    else if (mod && !typing && k === 'x' && selected) { if (copySel()) { e.preventDefault(); markInternalCopy(); remove(); } }
    else if (mod && !typing && k === 'v' && CLIP) { schedulePaste(() => pasteClip()); } // 클립보드에 이미지가 있으면 그쪽이 이긴다(ConceptDiagram 의 paste 처리)
    else if (mod && !typing && k === 'd' && selected) { e.preventDefault(); if (copySel()) pasteClip(3); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (!typing && selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (!typing && selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { // 방향키로 조금씩 옮긴다(Shift 는 더 크게)
      e.preventDefault(); const st = e.shiftKey ? 2 : 0.5;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0; const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      commit(sketchMoveBy(norm, selected, dx, dy), `nudge:${selected}`);
    } else if (!typing && selected && kind === 'memo' && (e.key === 'Enter' || e.key === 'F2')) { // 고른 글자(메모)를 그 자리에서 고친다
      e.preventDefault(); const el = canvasRef.current?.querySelector(`[data-eid="${selected}"]`); if (el) openTextEdit(el);
    } else if (e.key === 'Escape') setSelected('');
  };
  keyRef.current = onKey; // 창 단위 키 입력 리스너가 항상 최신 상태의 처리 함수를 부르게 한다

  // 그림 위 글자 고치기: 누른 <text> 가 어느 글자 자리인지 찾아(메모는 id 로, 나머지는 글자 내용으로) 입력칸을 연다
  const openTextEdit = (t) => {
    const eidEl = t.closest?.('[data-eid]'); const targets = sketchTextTargets(norm); let hit = null;
    if (eidEl) { const m = norm.memos.find((x) => x.id === eidEl.getAttribute('data-eid')); if (m) hit = { value: m.text, apply: { id: m.id, key: 'text' } }; }
    if (!hit) { const all = [...(canvasRef.current?.querySelectorAll('text') || [])]; const idx = all.filter((x) => normText(x.textContent) === normText(t.textContent)).indexOf(t); hit = pickByText(targets, t.textContent, idx); }
    if (hit) setEd({ target: t, value: hit.value, multiline: !!hit.multiline, apply: hit.apply });
    return !!hit;
  };
  const onDbl = (e) => { if (disabled || ed) return; const t = textAtPoint(canvasRef.current, e.clientX, e.clientY); if (t && openTextEdit(t)) { e.preventDefault(); e.stopPropagation(); } };
  const commitText = (v) => {
    const a = ed.apply; setEd(null);
    const r = sketchApplyText(norm, a, v); if (!r) return;
    if (r.global) commit({ ...norm, ...r.global }, `inline:${JSON.stringify(a)}`); else commit(sketchUpdate(norm, r.update.id, r.update.patch), `${r.update.id}:${a.key}`);
  };

  const ends = sel?.el?.pts ? [sel.el.pts[0], sel.el.pts[sel.el.pts.length - 1]] : null;
  const setEnd = (which, axis, v) => {
    const a = [...ends[0]]; const z = [...ends[1]];
    (which === 0 ? a : z)[axis] = v;
    commit(sketchSetEnds(norm, selected, a, z), `${selected}:end`);
  };
  const setRect = (i, v) => { const r = [...sel.el.rect]; r[i] = v; set({ rect: r }, 'rect'); };

  const title = { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' };
  const kindName = { block: { core: '코어(빗금 도형)', opening: '개구부(점선 캡슐)', image: '내 이미지' }[sel?.el?.kind] || '판(큰 도형)', line: '선', wind: '바람·흐름 화살표', memo: '글자 메모' }[kind];

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} data-testid="sketch-editor">
      <div ref={hostRef} style={{ flex: '1 1 480px', minWidth: 360, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'visible', background: '#fff', position: 'relative' }}>
        <svg viewBox={`0 0 ${SKETCH_SIZE[0]} ${SKETCH_SIZE[1]}`} data-testid="guide-overlay" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
          {(regionDraft || regionRect) && (() => { const r = regionDraft || regionRect; const a = view.toScreen([r[0], r[1]]); const z = view.toScreen([r[2], r[3]]); return (
            <g data-testid="region-box"><rect x={a[0]} y={a[1]} width={Math.max(0, z[0] - a[0])} height={Math.max(0, z[1] - a[1])} fill="rgba(242,140,40,0.16)" stroke="#E8832A" strokeWidth="3" strokeDasharray="10 6" /></g>); })()}
          {[...axisGuides, ...guides].map((g, i) => {
            const a = g.dim === 'x' ? view.toScreen([g.v, g.lo]) : view.toScreen([g.lo, g.v]); const z = g.dim === 'x' ? view.toScreen([g.v, g.hi]) : view.toScreen([g.hi, g.v]);
            const col = GUIDE_COLOR[g.kind] || GUIDE_COLOR.edge; const label = GUIDE_LABEL[g.kind];
            return (<g key={`${g.dim}${g.kind}${i}`} data-guide={g.kind}>
              <line x1={a[0]} y1={a[1]} x2={z[0]} y2={z[1]} stroke={col} strokeWidth="1.6" strokeDasharray={g.kind === 'axis' ? '10 5' : '6 4'} />
              {label && <text x={g.dim === 'x' ? a[0] + 5 : a[0]} y={g.dim === 'x' ? a[1] + 13 : a[1] - 5} fontSize="13" fontWeight="700" fill={col} style={{ fontFamily: 'sans-serif' }}>{label}</text>}
            </g>);
          })}
        </svg>
        <div ref={canvasRef} onPointerDown={onDown} onDoubleClick={onDbl} dangerouslySetInnerHTML={html} data-testid="sketch-canvas" style={{ touchAction: 'none', userSelect: 'none', cursor: regionPick ? 'crosshair' : dragging ? 'grabbing' : 'default', borderRadius: 8, overflow: 'hidden' }} />
        {ed && hostRef.current && <InlineInput host={hostRef.current} target={ed.target} value={ed.value} multiline={ed.multiline} onCommit={commitText} onCancel={() => setEd(null)} />}
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', padding: '4px 8px', borderTop: '1px solid var(--border-color)' }} data-testid="inline-hint">✏️ 글자를 <b>더블클릭</b>하면 그 자리에서 바로 고칠 수 있습니다(고른 글자는 Enter/F2). Enter 확정 · Esc 취소.</div>
      </div>

      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto', maxHeight: 'min(74vh, 780px)', overflowY: 'auto', paddingRight: 4 }} data-testid="sk-side">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={smallBtn(false)} disabled={!past.current.length} onClick={undo} title="Ctrl+Z" data-testid="undo">↶ 되돌리기</button>
          <button style={smallBtn(false)} disabled={!future.current.length} onClick={redo} title="Ctrl+Y">↷ 다시</button>
          <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 4 }} title="그림 틀 가운데의 세로·가로 중심선을 항상 보여 줍니다"><input type="checkbox" checked={showAxis} onChange={(e) => setShowAxis(e.target.checked)} data-testid="show-axis" />중심축 보기</label>
        </div>
        {textInfo && <PtReadout size={textInfo.size} ptInfo={ptInfo} text={textInfo.text} testid="sk-pt" onFix={kind === 'memo' && sel && sel.el.text === textInfo.text ? (pt) => set({ size: Math.min(48, Math.max(8, Math.round(pt / ptInfo.ppu))) }, 'size') : undefined} />}
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

        {norm.zones.length > 0 && (
          <div style={sec} data-testid="zone-panel">
            <span style={title}>구역 색 (칠한 층)</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>AI가 칠한 구역 색을 층으로 나눴습니다. 색·농도를 바꾸면 그 구역만 다시 칠해지고 선·글자는 그대로입니다.</p>
            {norm.zones.map((z) => (
              <div key={z.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)', opacity: z.hidden ? 0.55 : 1 }} data-testid={`zone-${z.id}`}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: z.color, border: '1px solid #999', flexShrink: 0 }} />
                  <input style={input} value={z.label} onChange={(e) => commit(sketchSetZone(norm, z.id, { label: e.target.value }), `zone:${z.id}:label`)} data-testid={`zone-label-${z.id}`} />
                  <button style={{ ...smallBtn(z.hidden), padding: '4px 7px', flexShrink: 0 }} title={z.hidden ? '이 구역 색 보이기' : '이 구역 색 숨기기'} onClick={() => commit(sketchSetZone(norm, z.id, { hidden: !z.hidden }))} data-testid={`zone-hide-${z.id}`}>{z.hidden ? '숨김' : '표시'}</button>
                </div>
                <Colors value={z.color} swatches={ZONE_SWATCHES} onChange={(c) => commit(sketchSetZone(norm, z.id, { color: c }), `zone:${z.id}:color`)} />
                <label style={lab}>농도 {Math.round(z.opacity * 100)}%
                  <input type="range" min="0" max="1" step="0.05" value={z.opacity} onChange={(e) => commit(sketchSetZone(norm, z.id, { opacity: Number(e.target.value) }), `zone:${z.id}:op`)} data-testid={`zone-opacity-${z.id}`} />
                </label>
              </div>
            ))}
          </div>
        )}

        {!sel && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림의 화살표·선·도형·글자를 <b>클릭</b>하면 여기서 속성을 바꿀 수 있고, <b>끌어서 옮길</b> 수 있습니다. 선택하면 나타나는 <b>네모 점은 크기</b>, <b>동그라미는 화살표 끝점</b>, <b>큰 마름모는 S자 변곡점(자유롭게 이동)</b>, <b>작은 빈 마름모는 휘는 정도</b> 조절입니다.<br />Shift: 수평·수직 고정 · Alt: 자석 끄기 · 방향키: 미세 이동<br /><b>안내선</b>: 끌면 다른 요소의 변·가운데선, 그림 가운데, 좌우·상하 <b>대칭 위치</b>에 가까워질 때 안내선(분홍=정렬, 초록=중심축, 청록=대칭)이 뜨며 자동으로 붙습니다. 화살표 끝을 끌면 반대쪽 끝과 수평·수직으로 맞춰집니다.<br />Ctrl+C / Ctrl+V: 복사·붙여넣기 · Ctrl+D: 복제 · Ctrl+X: 잘라내기 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['concept', '개념도(주황)'], ['line', '도면용(흑백)']].map(([id, label]) => <button key={id} style={{ ...smallBtn(norm.style === id), flex: 1 }} onClick={() => setGlobal({ style: id })} data-testid={`style-${id}`}>{label}</button>)}
            </div>
            <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={norm.showLegend} onChange={(e) => setGlobal({ showLegend: e.target.checked })} />하단 범례 표시(개념도)</label>
            <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={norm.showNotes} onChange={(e) => setGlobal({ showNotes: e.target.checked })} />하단 핵심 메시지 표시(개념도)</label>
            {norm.textBlock && (
              <div style={{ ...sec, gap: 6, background: 'rgba(240,176,0,0.08)' }} data-testid="textblock-panel">
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' }}>오른쪽 문구 블록</span>
                <label style={lab}>제목(줄바꿈 가능)<textarea rows={2} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} value={norm.textBlock.title} onChange={(e) => setGlobal({ textBlock: { ...norm.textBlock, title: e.target.value } }, 'tbtitle')} data-testid="textblock-title" /></label>
                {[0, 1, 2].map((i) => <label key={i} style={lab}>부제 {i + 1}<input style={input} value={norm.textBlock.subs[i] || ''} onChange={(e) => { const n = [...norm.textBlock.subs]; while (n.length < 3) n.push(''); n[i] = e.target.value; setGlobal({ textBlock: { ...norm.textBlock, subs: n.filter((t, k) => t || k < 2) } }, `tbsub${i}`); }} /></label>)}
                <div style={lab}>강조색<Colors value={norm.textBlock.accent} onChange={(c) => setGlobal({ textBlock: { ...norm.textBlock, accent: c } })} /></div>
              </div>
            )}
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
              {sel.el.shape === 'read' && (<>
                <label style={lab}>곡선 세기(읽은 흔들림 정도) {sel.el.bend}
                  <input type="range" min="0" max="1.6" step="0.05" value={sel.el.bend} onChange={(e) => set({ bend: Number(e.target.value) }, 'bend')} />
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} data-testid="read-points">
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>꺾임·굽음 점 {sel.el.pts.length}개(주황 점을 끌어 옮김)</span>
                  <button style={{ ...smallBtn(false), padding: '3px 8px' }} onClick={() => commit(sketchAddPt(norm, selected))} disabled={sel.el.pts.length >= 30} data-testid="pt-add">＋ 점 추가</button>
                  <button style={{ ...smallBtn(false), padding: '3px 8px' }} onClick={() => commit(sketchDelPt(norm, selected))} disabled={sel.el.pts.length <= 2} data-testid="pt-del">－ 점 빼기</button>
                </div>
                {sel.el.pts.length > 2 && (
                  <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={sel.el.smooth} onChange={(e) => set({ smooth: e.target.checked })} data-testid="prop-smooth" />부드러운 곡선(끄면 각진 꺾은선)</label>
                )}
              </>)}
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

            {kind === 'block' && sel.el.kind === 'image' && (<>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }} data-testid="img-panel">내가 넣은 이미지입니다. <b>끌어서 옮기고</b>, 모서리 네모 점을 끌어 크기를 바꿉니다(원본 비율 유지, Shift: 자유롭게).</p>
              <label style={lab}>투명도 {Math.round(sel.el.opacity * 100)}%
                <input type="range" min="0.05" max="1" step="0.05" value={sel.el.opacity} onChange={(e) => set({ opacity: Number(e.target.value) }, 'op')} data-testid="img-opacity" />
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(sel.el.layer !== 'front')} onClick={() => set({ layer: 'back' })} data-testid="img-back" title="바탕 위, 도형·화살표·글자 아래">맨 뒤로</button>
                <button style={smallBtn(sel.el.layer === 'front')} onClick={() => set({ layer: 'front' })} data-testid="img-front" title="모든 도형·화살표 위">맨 앞으로</button>
                {sel.el.ar > 0 && <button style={smallBtn(false)} onClick={() => { const r = sel.el.rect; set({ rect: [r[0], r[1], r[2], r[1] + (r[2] - r[0]) / sel.el.ar] }); }} data-testid="img-ratio">원본 비율로</button>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(false)} disabled={imgBusy} onClick={() => imgFileRef.current?.click()} data-testid="img-replace" title="다른 이미지로 바꿉니다(자리·투명도·앞뒤는 그대로)">🔄 이미지 바꾸기</button>
                <button style={smallBtn(!!sel.el.crop)} disabled={imgBusy} onClick={() => setCropFor({ id: selected })} data-testid="img-crop" title="이미지의 필요한 부분만 남깁니다">✂ 자르기{sel.el.crop ? ' (자른 상태)' : ''}</button>
                <input ref={imgFileRef} type="file" accept="image/*" hidden data-testid="img-replace-input" onChange={(e) => { replaceImg(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              {imgNote && <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }} data-testid="img-note">{imgNote}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="왼쪽 X" value={sel.el.rect[0]} onChange={(v) => setRect(0, v)} />
                <Num label="위쪽 Y" value={sel.el.rect[1]} onChange={(v) => setRect(1, v)} />
                <Num label="오른쪽 X" value={sel.el.rect[2]} onChange={(v) => setRect(2, v)} />
                <Num label="아래쪽 Y" value={sel.el.rect[3]} onChange={(v) => setRect(3, v)} />
              </div>
            </>)}
            {kind === 'block' && sel.el.kind !== 'image' && (<>
              <label style={lab}>종류
                <select style={input} value={sel.el.kind} onChange={(e) => set({ kind: e.target.value })}><option value="slab">판(큰 도형)</option><option value="core">코어(빗금)</option><option value="opening">개구부(점선 캡슐)</option></select>
              </label>
              <label style={lab}>이름<input style={input} value={sel.el.name} onChange={(e) => set({ name: e.target.value }, 'name')} /></label>
              <label style={lab}>설명<input style={input} value={sel.el.desc} onChange={(e) => set({ desc: e.target.value }, 'desc')} /></label>
              {sel.el.kind === 'opening' && (<>
                <label style={lab}>벽에서 안쪽 간격(개념도) {sel.el.inset ?? 6}
                  <input type="range" min="0" max="20" step="1" value={sel.el.inset ?? 6} onChange={(e) => set({ inset: Number(e.target.value) }, 'inset')} data-testid="opening-inset" />
                </label>
                <button style={smallBtn(false)} onClick={() => commit(sketchSnapToWall(norm, selected))} data-testid="snap-wall" title="이 표시를 가장 가까운 도형 외곽선(벽)에 붙입니다">가까운 벽에 붙이기</button>
              </>)}
              {sel.el.kind !== 'opening' && (<>
                <div style={lab}>열린 변(주황 점선이 외곽선을 따라 그려짐)
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SIDES.map((sd) => (
                      <label key={sd} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={(sel.el.openSides || []).includes(sd)} data-testid={`side-${sd}`}
                          onChange={(e) => set({ openSides: e.target.checked ? [...(sel.el.openSides || []), sd] : (sel.el.openSides || []).filter((x) => x !== sd) })} />{SIDE_LABEL[sd]}
                      </label>
                    ))}
                  </div>
                </div>
                {(sel.el.openSides || []).length > 0 && (
                  <label style={lab}>벽에서 안쪽 간격(0 = 외곽선과 겹침) {sel.el.inset ?? 6}
                    <input type="range" min="0" max="20" step="1" value={sel.el.inset ?? 6} onChange={(e) => set({ inset: Number(e.target.value) }, 'inset')} data-testid="side-inset" />
                  </label>
                )}
              </>)}
              {sel.el.kind !== 'opening' && (
                <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={sel.el.showName ?? sel.el.kind === 'core'} onChange={(e) => set({ showName: e.target.checked })} data-testid="show-name" />도형 안에 이름 표시(개념도)
                </label>
              )}
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
              <label style={lab}>크기 {sel.el.size}{ptInfo ? ` · 약 ${Math.round(sel.el.size * ptInfo.ppu * 10) / 10}pt` : ''}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="X" value={sel.el.x} onChange={(v) => set({ x: v }, 'x')} />
                <Num label="Y" value={sel.el.y} onChange={(v) => set({ y: v }, 'y')} />
              </div>
            </>)}

            <div style={{ ...lab, gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="align-panel">
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' }}>정렬·대칭</span>
              <label style={lab}>기준
                <select style={input} value={ref} onChange={(e) => setRefId(e.target.value)} data-testid="align-ref">
                  <option value="axis">그림 가운데(틀)</option>
                  {others.map((e) => <option key={e.id} value={e.id}>{elLabel(e)}</option>)}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {[['left', '⇤ 왼쪽'], ['hcenter', '⇔ 가운데'], ['right', '⇥ 오른쪽'], ['top', '⤒ 위'], ['vcenter', '↕ 중간'], ['bottom', '⤓ 아래']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => doAlign(k)} data-testid={`align-${k}`}>{t}</button>)}
              </div>
              {axesNow && axesNow.x.length > 1 && (
                <label style={lab}>대칭축
                  <select style={input} value={axisIdx === 1 ? 'big' : 'frame'} onChange={(e) => setAxisPick(e.target.value)} data-testid="align-axis">
                    <option value="frame">그림 가운데</option><option value="big">가장 큰 도형 가운데</option>
                  </select>
                </label>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <button style={smallBtn(false)} disabled={ref === 'axis'} onClick={() => doMirrorPlace('h')} title="기준 요소와 좌우 대칭이 되는 위치로 옮깁니다(크기는 그대로)" data-testid="mirror-place-h">↔ 좌우 대칭 위치로</button>
                <button style={smallBtn(false)} disabled={ref === 'axis'} onClick={() => doMirrorPlace('v')} title="기준 요소와 상하 대칭이 되는 위치로 옮깁니다(크기는 그대로)" data-testid="mirror-place-v">↕ 상하 대칭 위치로</button>
                <button style={smallBtn(false)} onClick={() => doMirrorCopy('h')} title="선택한 요소를 대칭축 기준으로 좌우 뒤집어 복제합니다" data-testid="mirror-copy-h">⧉ 좌우 대칭 복제</button>
                <button style={smallBtn(false)} onClick={() => doMirrorCopy('v')} title="선택한 요소를 대칭축 기준으로 상하 뒤집어 복제합니다" data-testid="mirror-copy-v">⧉ 상하 대칭 복제</button>
              </div>
              {refIsBlock && <button style={smallBtn(false)} onClick={() => commit(sketchSameSize(norm, selected, ref))} data-testid="same-size">▭ 기준과 같은 크기로</button>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => setSelected('')}>선택 해제</button>
              <button style={smallBtn(false)} onClick={() => { if (copySel()) pasteClip(3); }} title="Ctrl+D" data-testid="duplicate">복제</button>
              <button style={smallBtn(false)} onClick={() => { if (copySel()) markInternalCopy(); }} title="Ctrl+C" data-testid="copy">복사</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="delete">삭제</button>
            </div>
          </div>
        )}
        {cropFor && sel && sel.el.kind === 'image' && <ImageCropDialog src={sel.el.orig || sel.el.href} crop={sel.el.crop || null} busy={imgBusy} onApply={applyCrop} onCancel={() => setCropFor(null)} />}
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>좌표는 그림 안 위치(0~100)입니다. 위쪽 ‘SVG 저장’을 누르면 지금 모습 그대로 저장됩니다.</p>
      </div>
    </div>
  );
}
