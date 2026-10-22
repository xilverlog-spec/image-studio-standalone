import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DASHES, DASH_LABEL, DGAP_MIN, DGAP_MAX, HEAD_LABEL, SHAPES, SHAPE_LABEL, renderSketch, normalizeSketch, sketchFind, sketchKind, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd, sketchView, sketchMoveBy, sketchResizeRect, sketchSetEnd, sketchSetAmp, sketchSetVia, sketchLockAspect, sketchSetPt, sketchAddPt, sketchDelPt, sketchSetZone, sketchSnapToWall, SIDES, SIDE_LABEL, sketchSnapshot, sketchPaste, sketchSnapGuides, sketchSnapPointG, sketchBox, sketchAxes, sketchAlign, sketchMirrorPlace, sketchMirrorCopy, sketchSameSize, SKETCH_SIZE } from './conceptDiagram/sketch';

// 손스케치 다이어그램 편집기(1단계): 요소를 클릭하면 오른쪽에 속성이 뜨고, 바꾸는 즉시 다시 그린다.
// 편집 대상은 구조(spec)이므로 어떻게 고쳐도 항상 정돈된 SVG 가 나온다. 저장은 부모(ConceptDiagram)의 SVG/PNG 저장 버튼이 한다.

const input = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const smallBtn = (on, danger) => ({
  padding: '5px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--line-strong)'}`,
  background: danger ? 'var(--err-soft)' : on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const sec = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)' };
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
import { isPlainMemo, sketchBoxFor, sketchAlignMany, sketchDistribute, sketchMoveMany, sketchDeleteMany, sketchUpdateMany, sketchDetachName } from './conceptDiagram/sketch';
import { TEXT_FONTS, TEXT_WEIGHTS } from './conceptDiagram/fonts';
import { sketchReplaceImage, sketchCropImage } from './conceptDiagram/sketch';
import { schedulePaste, markInternalCopy } from './conceptDiagram/clip';
import { readImageFile, bakeCrop, imageSize } from './conceptDiagram/imgio';
import ImageCropDialog from './ImageCropDialog';
import ZoomView from './ZoomView';
import IconPicker from './IconPicker';
import TableEditor from './TableEditor';
import { CONTEXT_FX } from './conceptDiagram/imgfx';
import { NORTH_STYLE_LABEL, SCALE_UNITS } from './conceptDiagram/symbols';
import { ICON_LABEL } from './conceptDiagram/icons';
import { sketchRotation, sketchPivot, sketchSetAngle, sketchRotateBy, sketchResizeBlock, sketchCanRotate, sketchRenumber, sketchSetTip, sketchSetDimStart, sketchGScale, sketchUnzoomPt, sketchComposeScale, sketchTranslateAll } from './conceptDiagram/sketch';
import { snapDeg } from './conceptDiagram/rotate';
import { normText, pickByText, sketchTextTargets, sketchApplyText } from './conceptDiagram/inlineText';

export default function SketchEditor({ spec, onChange, disabled, shortcutsEnabled, ptInfo, regionPick, regionRect, onRegionPick, onCopy, pasteSignal, sideHost, sideOpen, onOpenSide, onPick }) {
  const [selected, setSelected] = useState('');
  const [multi, setMulti] = useState([]); const multiOn = multi.length >= 2; // 여러 개 고르기(Shift·Ctrl+클릭, Ctrl+끌기): 둘 이상 고르면 selected 는 비우고 아래 '여러 개 고름' 패널이 쓴다
  const [mboxes, setMboxes] = useState([]); const [marq, setMarq] = useState(null); // 고른 요소들의 바깥 상자 / 끌고 있는 고르기 상자(그림 좌표 1200x760)
  useEffect(() => { if ((selected || multiOn) && onPick) onPick(); }, [selected, multiOn]); // eslint-disable-line react-hooks/exhaustive-deps — 요소를 누르면 왼쪽 ③ 도형 편집 탭을 연다
  const [regionDraft, setRegionDraft] = useState(null); // '이 영역만 다시 그리기'에서 끌고 있는 상자(다이어그램 좌표 [x0, y0, x1, y1])
  const [edWide, setEdWide] = useState(true); const edRoOff = useRef(null); // 편집기가 넓을 때(900px 이상)만 속성 패널을 오른쪽에 두고, 좁으면 그림 아래에 가로로 펼친다
  const rowMode = edWide && !sideHost; // 속성 패널이 편집기 안쪽에 있고 편집기가 넓을 때만 그림 | 패널 가로 한 줄
  const edRootRef = useCallback((el) => { // 콜백 ref: 편집기 뿌리 상자가 (처음 그려질 때든 나중에든) 생기면 폭을 지켜본다
    if (edRoOff.current) { edRoOff.current(); edRoOff.current = null; }
    if (el) setEdWide(el.getBoundingClientRect().width >= 900); // 처음 그려질 때 바로 정한다(깜빡임 없이)
    if (el && typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver((es) => setEdWide(es[0].contentRect.width >= 900)); ro.observe(el); edRoOff.current = () => ro.disconnect(); }
  }, []);
  const regionDrag = useRef(null);
  const [rotInfo, setRotInfo] = useState(null);   // 회전 손잡이를 끄는 동안 보여 줄 각도 { deg, c(다이어그램 좌표 중심) }
  const [whole, setWhole] = useState(false);     // 전체 크기 조절 모드(그림 속 내용 전체를 감싸는 상자와 모서리 손잡이)
  const [wbox, setWbox] = useState(null);         // 내용 전체의 바깥 상자(그림 좌표 1200x760 의 [x0,y0,x1,y1])
  const [wInfo, setWInfo] = useState(null);       // 모서리를 끄는 동안 보여 줄 배율 { k }
  const [textInfo, setTextInfo] = useState(null); // 마지막으로 누른 글자의 크기(그림 단위) — 몇 pt 인지 알려 주는 데 쓴다
  const [cropFor, setCropFor] = useState(null); const [imgBusy, setImgBusy] = useState(false); const [imgNote, setImgNote] = useState(''); const imgFileRef = useRef(null); // 넣은 이미지 자르기 창·바꾸기
  const past = useRef([]); const future = useRef([]);
  const lastKey = useRef(''); const lastAt = useRef(0);
  const [, tick] = useState(0);
  const norm = useMemo(() => normalizeSketch(spec), [spec]);
  const specRef = useRef(norm); specRef.current = norm;
  useEffect(() => { // 지우기·되돌리기로 없어진 요소가 고른 목록에 남지 않게
    if (!multi.length) return; const keep = multi.filter((id) => sketchFind(norm, id));
    if (keep.length !== multi.length) { setMulti(keep.length >= 2 ? keep : []); if (keep.length === 1) setSelected(keep[0]); }
  }, [norm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 도면용(흑백) 스타일은 없앴다 — 예전에 도면용으로 바꿔 둔 그림은 개념도로 되돌린다(AI 이미지 편집 결과의 이미지 배치는 그대로)
  useEffect(() => { if (norm.style === 'line' && norm.layout !== 'image') onChange({ ...norm, style: 'concept' }); }, [norm.style, norm.layout]); // eslint-disable-line react-hooks/exhaustive-deps
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
    try { return renderSketch(norm, { interactive: true, selected }).svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, '<svg$1 width="100%" style="display:block"'); } catch { return ''; }
  }, [norm, selected]);

  const html = useMemo(() => ({ __html: svg }), [svg]); // 같은 객체여야 React 가 그림을 매번 다시 만들지 않는다
  const sel = selected ? sketchFind(norm, selected) : null;
  const view = useMemo(() => sketchView(norm), [norm]);
  // 중심축 항상 보기: 그림 틀 가운데의 세로·가로선
  const axisGuides = showAxis ? (() => { const f = norm.frame; const ax = sketchAxes(norm, ''); const g = [{ dim: 'x', v: ax.x[0].v, kind: 'axis', lo: f[1] - 2, hi: f[3] + 2 }, { dim: 'y', v: ax.y[0].v, kind: 'axis', lo: f[0] - 2, hi: f[2] + 2 }];
    if (axisPick === 'big') { if (ax.x.length > 1) g.push({ dim: 'x', v: ax.x[1].v, kind: 'axis', lo: f[1] - 2, hi: f[3] + 2 }); if (ax.y.length > 1) g.push({ dim: 'y', v: ax.y[1].v, kind: 'axis', lo: f[0] - 2, hi: f[2] + 2 }); }
    return g; })() : [];
  // 정렬·대칭 기준: 고른 요소 말고 다른 요소 중에서 고른다. 없어진 요소면 그림 가운데로 돌린다
  const others = selected ? [...norm.blocks, ...norm.lines, ...norm.winds, ...norm.memos].filter((e) => e.id !== selected) : [];
  const ref = refId !== 'axis' && others.some((e) => e.id === refId) ? refId : 'axis';
  const refIsBlock = selected && ref !== 'axis' && sketchKind(norm, ref) === 'block' && sketchKind(norm, selected) === 'block';
  const axesNow = selected ? sketchAxes(norm, selected) : null;
  const axisIdxX = axisPick === 'big' && axesNow && axesNow.x.length > 1 ? 1 : 0; // 좌우 대칭의 축(세로선) 고르기
  const axisIdxY = axisPick === 'big' && axesNow && axesNow.y.length > 1 ? 1 : 0; // 상하 대칭의 축(가로선) 고르기
  const axisChoice = !!axesNow && (axesNow.x.length > 1 || axesNow.y.length > 1); // 큰 도형 가운데가 가로·세로 어느 쪽이든 다르면 선택칸을 보인다
  const elLabel = (e) => `${{ block: e.kind === 'core' ? '코어' : e.kind === 'opening' ? '개구부' : '판', line: '선', wind: '화살표', memo: '글자' }[sketchKind(norm, e.id)] || ''} ${e.id}${e.name ? ` · ${e.name}` : e.text ? ` · ${e.text}` : ''}`;
  const axisVal = (dir) => (dir === 'h' ? axesNow.x[axisIdxX].v : axesNow.y[axisIdxY].v);
  const doAlign = (mode) => commit(sketchAlign(norm, selected, ref, mode));
  const doMirrorPlace = (dir) => { if (ref !== 'axis') commit(sketchMirrorPlace(norm, selected, ref, axisVal(dir), dir)); };
  const doMirrorCopy = (dir) => { const r = sketchMirrorCopy(norm, selected, axisVal(dir), dir); if (r.id) { commit(r.spec); setSelected(r.id); } };
  const multiKinds = multi.map((id) => sketchKind(norm, id)); const mcount = (k) => multiKinds.filter((x) => x === k).length;
  const multiTexts = multi.filter((id) => { const f = sketchFind(norm, id); return !!f && f.list === 'memos' && isPlainMemo(f.el); }); // 일반 글자
  const mset = (patch, kinds, key) => commit(sketchUpdateMany(norm, multi, patch, kinds), key ? `multi:${key}` : '');
  const multiAlignText = (k) => { // 고른 글자 모두의 정렬(왼쪽·가운데·오른쪽): 글자는 제자리에 둔다(기준점만 옮기고 위치를 보정)
    let next = norm;
    multiTexts.forEach((id) => { const f = sketchFind(next, id); if (!f) return; const e0 = f.el; const cur = e0.align || 'middle'; if (cur === k) return;
      const t = canvasRef.current?.querySelector(`text[data-eid="${id}"]`); let dx = 0; let dy = 0;
      try { if (t) { const w = t.getBBox().width / sketchView(norm).K; const v = (({ start: 0, middle: 0.5, end: 1 })[k] - ({ start: 0, middle: 0.5, end: 1 })[cur]) * w; const a = ((e0.rot || 0) * Math.PI) / 180; dx = v * Math.cos(a); dy = v * Math.sin(a); } } catch { /* 글자 상자를 못 구하면 정렬만 */ }
      next = sketchUpdate(next, id, { align: k === 'middle' ? undefined : k, x: Math.round((e0.x + dx) * 100) / 100, y: Math.round((e0.y + dy) * 100) / 100 }); });
    commit(next);
  };
  const selectAllText = () => { const ids = norm.memos.filter(isPlainMemo).map((m) => m.id); setWhole(false); setMulti(ids.length >= 2 ? ids : []); setSelected(ids.length === 1 ? ids[0] : ''); };
  const kind = sel ? sketchKind(norm, selected) : '';
  const set = (patch, key) => commit(sketchUpdate(norm, selected, patch), key ? `${selected}:${key}` : '');
  const TA_K = { start: 0, middle: 0.5, end: 1 };
  const setMemoAlign = (k) => { // 일반 글자 메모: 왼쪽/가운데/오른쪽. 글자 묶음은 제자리(회전했으면 글자 방향으로 보정)
    const e = sel?.el; if (!e) return; const cur = e.align || 'middle'; if (cur === k) return;
    const t = canvasRef.current?.querySelector(`text[data-eid="${selected}"]`); let dx = 0; let dy = 0;
    try { if (t) { const w = t.getBBox().width / view.K; const v = (TA_K[k] - TA_K[cur]) * w; const a = ((e.rot || 0) * Math.PI) / 180; dx = v * Math.cos(a); dy = v * Math.sin(a); } } catch { /* 글자 상자를 못 구하면 정렬만 */ }
    set({ align: k === 'middle' ? undefined : k, x: Math.round((e.x + dx) * 100) / 100, y: Math.round((e.y + dy) * 100) / 100 });
  };
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
    return sketchView(specRef.current).toDiag(sketchUnzoomPt(specRef.current, [((clientX - r.left) * SKETCH_SIZE[0]) / r.width, ((clientY - r.top) * SKETCH_SIZE[1]) / r.height]));
  };
  const toCanvas = (clientX, clientY) => { // 화면 → 그림 좌표(1200x760, 전체 크기 변환을 거친 보이는 자리)
    const el = canvasRef.current?.querySelector('svg'); if (!el) return null; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null;
    return [((clientX - r.left) * SKETCH_SIZE[0]) / r.width, ((clientY - r.top) * SKETCH_SIZE[1]) / r.height];
  };
  // 전체 크기 조절 모드: 바탕·정의를 뺀 그림 전체(제목·범례 글자까지)의 보이는 상자를 합쳐 바깥 상자를 구한다(그림이 바뀔 때마다 다시)
  useLayoutEffect(() => { // 여러 개 고름: 요소마다 보이는 상자를 구해 점선으로 감싼다
    if (!multiOn) { setMboxes([]); return; }
    const root = canvasRef.current; const el = root?.querySelector('svg'); if (!el) { setMboxes([]); return; }
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) { setMboxes([]); return; }
    const kx = SKETCH_SIZE[0] / r.width; const ky = SKETCH_SIZE[1] / r.height;
    setMboxes(multi.map((id) => { let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      root.querySelectorAll(`[data-eid="${id}"]`).forEach((n) => { const q = n.getBoundingClientRect(); if (!q.width && !q.height) return; x0 = Math.min(x0, (q.left - r.left) * kx); y0 = Math.min(y0, (q.top - r.top) * ky); x1 = Math.max(x1, (q.right - r.left) * kx); y1 = Math.max(y1, (q.bottom - r.top) * ky); });
      return x1 > x0 ? [x0, y0, x1, y1] : null; }).filter(Boolean));
  }, [multi, svg]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!whole) { setWbox(null); return; }
    const root = canvasRef.current; const el = root?.querySelector('svg'); if (!el) { setWbox(null); return; }
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) { setWbox(null); return; }
    const kx = SKETCH_SIZE[0] / r.width; const ky = SKETCH_SIZE[1] / r.height; let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    [...el.children].filter((n) => n.tagName.toLowerCase() !== 'defs' && !n.hasAttribute('data-bg')).forEach((n) => { const q = n.getBoundingClientRect(); if (q.width === 0 && q.height === 0) return; x0 = Math.min(x0, (q.left - r.left) * kx); y0 = Math.min(y0, (q.top - r.top) * ky); x1 = Math.max(x1, (q.right - r.left) * kx); y1 = Math.max(y1, (q.bottom - r.top) * ky); });
    setWbox(x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null);
  }, [whole, svg]); // eslint-disable-line react-hooks/exhaustive-deps
  const startWhole = (e, corner) => { // 모서리 손잡이: 반대쪽 모서리는 고정, 대각선 방향으로 끈 만큼 같은 비율로 키우고 줄인다(선 굵기·글자 포함)
    e.preventDefault(); e.stopPropagation(); if (!wbox) return;
    const [x0, y0, x1, y1] = wbox; const east = corner.includes('e'); const south = corner.includes('s');
    const piv = [east ? x0 : x1, south ? y0 : y1]; const grab = [east ? x1 + 6 : x0 - 6, south ? y1 + 6 : y0 - 6]; // 손잡이는 상자 모서리에서 6 바깥 — 잡은 자리가 100% 가 되게
    if (Math.hypot(grab[0] - piv[0], grab[1] - piv[1]) < 8) return;
    drag.current = { kind: 'whole', piv, grab, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const scaleWholeBy = (k) => { if (!wbox) return; commit(sketchComposeScale(norm, k, [(wbox[0] + wbox[2]) / 2, (wbox[1] + wbox[3]) / 2])); };
  const resetWhole = () => { if (!norm.gscale) return; const { gscale, ...rest } = norm; commit(rest); }; // eslint-disable-line no-unused-vars

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
    if (whole && wbox) { // 전체 크기 조절 모드에서 그림을 끌면 내용 전체가 함께 움직인다. 끌지 않고 누르기만 하면 모드를 끝내고 그 요소를 고른다
      const pc = toCanvas(e.clientX, e.clientY); if (!pc) return; e.preventDefault();
      const hitEl = e.target.closest?.('[data-eid]');
      drag.current = { kind: 'wholemove', start: pc, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false, hitId: hitEl ? hitEl.getAttribute('data-eid') : '', fromBlank: !hitEl, wasWhole: true };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true }); return;
    }
    const h = e.target.closest?.('[data-handle]'); const el = e.target.closest?.('[data-eid]');
    const tx = e.target.closest?.('text'); setTextInfo(tx ? { text: tx.textContent, size: textUnitSize(tx) } : null);
    if (!el && (e.ctrlKey || e.metaKey) && !h) { // 빈 곳에서 Ctrl(⌘)+끌기: 사각형으로 여러 개 고르기
      const pc = toCanvas(e.clientX, e.clientY); if (!pc) return; e.preventDefault();
      drag.current = { kind: 'marquee', start: pc, cx: e.clientX, cy: e.clientY, moved: false };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true }); return;
    }
    if (!el) { // 빈 곳(바탕 그림 위 포함)을 끌면 그림 전체가 함께 움직인다. 그냥 눌렀다 떼면 선택 해제
      setMulti([]); setSelected(''); const pc = toCanvas(e.clientX, e.clientY); if (!pc) return; e.preventDefault();
      drag.current = { kind: 'wholemove', start: pc, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false, hitId: '', fromBlank: true, wasWhole: false };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true }); return;
    }
    e.preventDefault();
    const id = el.getAttribute('data-eid');
    if (!h && (e.shiftKey || e.ctrlKey || e.metaKey)) { // 여러 개 고르기: Shift·Ctrl(⌘)+클릭으로 더하거나 뺀다
      const base = multiOn ? multi : selected ? [selected] : []; const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      setMulti(next.length >= 2 ? next : []); setSelected(next.length === 1 ? next[0] : ''); return;
    }
    if (!h && multiOn && multi.includes(id)) { // 이미 고른 여러 개 중 하나를 끌면 모두 함께 움직인다(끌지 않고 누르기만 하면 그것 하나만 고른다)
      const sm = toDiag(e.clientX, e.clientY); if (!sm) return;
      drag.current = { kind: 'multi', ids: multi, start: sm, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false, hitId: id };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true }); return;
    }
    setMulti([]); setSelected(id);
    const start = toDiag(e.clientX, e.clientY); if (!start) return;
    drag.current = { id, handle: h ? h.getAttribute('data-handle') : '', start, cx: e.clientX, cy: e.clientY, orig: specRef.current, moved: false };
    if (drag.current.handle === 'rot') { const c = sketchPivot(specRef.current, id); drag.current.rot = { c, a0: Math.atan2(start[1] - c[1], start[0] - c[0]), ang0: sketchRotation(specRef.current, id) }; } // 중심 둘레로 마우스가 돈 각도만큼 처음 각도에서 더한다
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (d.kind === 'marquee') { // 고르기 상자는 그림을 바꾸지 않으므로 되돌리기 기록을 만들지 않는다
      if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) return; d.moved = true;
      const m = toCanvas(e.clientX, e.clientY); if (!m) return; setMarq([Math.min(d.start[0], m[0]), Math.min(d.start[1], m[1]), Math.max(d.start[0], m[0]), Math.max(d.start[1], m[1])]); return;
    }
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return; // 살짝 눌렀다 떼면 선택만
      d.moved = true; past.current = [...past.current.slice(-49), d.orig]; future.current = []; lastKey.current = ''; setDragging(true);
    }
    if (d.kind === 'wholemove') { // 전체 이동(Shift: 수평·수직 고정)
      const m = toCanvas(e.clientX, e.clientY); if (!m) return; let dx = m[0] - d.start[0]; let dy = m[1] - d.start[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!whole) setWhole(true); onChange(sketchTranslateAll(d.orig, dx, dy)); tick((n) => n + 1); return;
    }
    if (d.kind === 'multi') { // 여러 개 함께 옮기기(Shift: 수평·수직으로만)
      const pt = toDiag(e.clientX, e.clientY); if (!pt) return; let dx = pt[0] - d.start[0]; let dy = pt[1] - d.start[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      onChange(sketchMoveMany(d.orig, d.ids, dx, dy)); tick((n) => n + 1); return;
    }
    if (d.kind === 'whole') {
      const m = toCanvas(e.clientX, e.clientY); if (!m) return; const vx = d.grab[0] - d.piv[0]; const vy = d.grab[1] - d.piv[1];
      const k = ((m[0] - d.piv[0]) * vx + (m[1] - d.piv[1]) * vy) / (vx * vx + vy * vy); const next = sketchComposeScale(d.orig, k, d.piv);
      setWInfo({ k: sketchGScale(next).k / sketchGScale(d.orig).k }); onChange(next); tick((n) => n + 1); return;
    }
    const pt = toDiag(e.clientX, e.clientY); if (!pt) return; const snap = !e.altKey; const o = d.orig; let next = o; let gd = [];
    if (!d.handle) {
      let dx = pt[0] - d.start[0]; let dy = pt[1] - d.start[1];
      let lockX = false; let lockY = false;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; lockY = true; } else { dx = 0; lockX = true; } } // Shift: 수평·수직으로만
      const b0 = snap ? sketchBox(o, d.id) : null;
      if (b0) { const r = sketchSnapGuides(o, d.id, [b0[0] + dx, b0[1] + dy, b0[2] + dx, b0[3] + dy]); if (!lockX) dx += r.dx; if (!lockY) dy += r.dy; gd = r.guides.filter((g) => (g.dim === 'x' ? !lockX : !lockY)); }
      next = sketchMoveBy(o, d.id, dx, dy);
    } else if (d.handle === 'rot') { // 회전: Shift = 15° 단위, Alt = 붙지 않음, 그냥 끌면 45° 배수 근처(3° 안)에서 살짝 붙는다
      const rr = d.rot; const da = ((Math.atan2(pt[1] - rr.c[1], pt[0] - rr.c[0]) - rr.a0) * 180) / Math.PI;
      const ang = snapDeg(rr.ang0 + da, { step: e.shiftKey ? 15 : 0, soft: !e.altKey && !e.shiftKey });
      next = sketchSetAngle(o, d.id, ang); setRotInfo({ deg: ang, c: rr.c });
    } else if (d.handle === 'start' || d.handle === 'end') {
      const pts = sketchFind(o, d.id)?.el?.pts; const ex = pts ? (d.handle === 'start' ? pts[pts.length - 1] : pts[0]) : null; // 반대쪽 끝과 수평·수직으로 맞추기
      const r = snap ? sketchSnapPointG(o, d.id, pt, 1.4, ex ? [[ex[0], ex[1], ex[0], ex[1]]] : []) : { pt, guides: [] };
      next = sketchSetEnd(o, d.id, d.handle, r.pt); gd = r.guides;
    } else if (d.handle.startsWith('pt:')) next = sketchSetPt(o, d.id, Number(d.handle.slice(3)), pt);
    else if (d.handle === 'amp') next = sketchSetAmp(o, d.id, pt);
    else if (d.handle === 'via') next = sketchSetVia(o, d.id, pt);
    else if (d.handle === 'tip') next = sketchSetTip(o, d.id, pt); // 리더선 라벨의 끝점(가리키는 곳) · 치수선의 둘째 끝점
    else if (d.handle === 'dim1') next = sketchSetDimStart(o, d.id, pt); // 치수선의 첫 끝점
    else if (sketchFind(o, d.id)?.el?.rot) { // 돌아간 도형: 마우스를 도형 기준 좌표로 되돌려 크기를 바꾸고 반대쪽은 제자리(자석은 쓰지 않는다)
      next = sketchResizeBlock(o, d.id, d.handle, pt, { lock: !e.shiftKey });
    } else {
      const r = snap ? sketchSnapPointG(o, d.id, pt) : { pt, guides: [] }; const hx = /[we]/.test(d.handle); const hy = /[ns]/.test(d.handle); // 움직이는 쪽 방향의 안내선만 쓴다
      next = sketchResizeRect(o, d.id, d.handle, hx ? r.pt[0] : pt[0], hy ? r.pt[1] : pt[1]); gd = r.guides.filter((g) => (g.dim === 'x' ? hx : hy));
      if (!e.shiftKey) next = sketchLockAspect(next, d.id, d.handle); // 내 이미지는 모서리를 끌 때 원본 비율을 지킨다(Shift: 자유롭게)
    }
    setGuides(gd);
    onChange(next); tick((n) => n + 1);
  };
  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove); const dm = drag.current;
    if (dm && dm.kind === 'marquee') { // 상자 안(조금이라도 걸친) 요소를 모두 고른다
      const r0 = marqRef.current; drag.current = null; setMarq(null); setDragging(false);
      if (dm.moved && r0) {
        const root = canvasRef.current; const sv = root?.querySelector('svg'); const rr = sv?.getBoundingClientRect();
        if (rr && rr.width > 0) { const kx = SKETCH_SIZE[0] / rr.width; const ky = SKETCH_SIZE[1] / rr.height; const ids = [];
          root.querySelectorAll('[data-eid]').forEach((n) => { const id = n.getAttribute('data-eid'); if (!id || ids.includes(id) || n.hasAttribute('data-bg')) return; const q = n.getBoundingClientRect(); if (!q.width && !q.height) return;
            const b = [(q.left - rr.left) * kx, (q.top - rr.top) * ky, (q.right - rr.left) * kx, (q.bottom - rr.top) * ky]; if (b[0] <= r0[2] && b[2] >= r0[0] && b[1] <= r0[3] && b[3] >= r0[1] && sketchFind(specRef.current, id)) ids.push(id); });
          setMulti(ids.length >= 2 ? ids : []); setSelected(ids.length === 1 ? ids[0] : ''); }
      }
      tick((n) => n + 1); return;
    }
    if (dm && dm.kind === 'multi' && !dm.moved) { setMulti([]); setSelected(dm.hitId || ''); drag.current = null; setDragging(false); tick((n) => n + 1); return; }
    const d0 = drag.current; if (d0 && d0.kind === 'wholemove' && !d0.moved) { if (d0.fromBlank) { setWhole(!d0.wasWhole); setSelected(''); } else { setWhole(false); setSelected(d0.hitId || ''); } } drag.current = null; setDragging(false); setGuides([]); setRotInfo(null); setWInfo(null); tick((n) => n + 1);
  };
  const marqRef = useRef(null); marqRef.current = marq;
  useEffect(() => () => { window.removeEventListener('pointermove', onMove); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 단축키는 포커스와 무관하게 창 전체에서 받는다(그림을 클릭해도 포커스가 옮겨지지 않기 때문). 입력칸에 글자를 칠 때는 무시한다
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  // 복사(Ctrl+C)·잘라내기(Ctrl+X)·붙여넣기(Ctrl+V)·복제(Ctrl+D). 붙인 요소는 3칸씩 비껴 놓이고 곧바로 선택된다
  const selBoxDiag = (id) => { // 고른 요소의 바깥 상자(그림 좌표). 페이지 칸에 붙여넣을 때 그 부분을 보여 주는 데 쓴다
    const sv = canvasRef.current?.querySelector('svg'); const el = canvasRef.current?.querySelector(`[data-eid="${id}"]`); if (!sv || !el || !sv.getScreenCTM || !sv.getScreenCTM()) return null;
    const r = el.getBoundingClientRect(); const inv = sv.getScreenCTM().inverse(); const pt = (x, y) => { const q = sv.createSVGPoint(); q.x = x; q.y = y; return q.matrixTransform(inv); };
    const a = pt(r.left, r.top); const b = pt(r.right, r.bottom); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
  };
  const copySel = () => { const sn = selected ? sketchSnapshot(norm, selected) : null; if (sn) { CLIP = sn; PASTE_N = 0; tick((n) => n + 1); if (onCopy) onCopy(selBoxDiag(selected)); } return !!sn; };
  const pasteSigRef = useRef(pasteSignal); // 페이지 칸에서 Ctrl+V 하면 ConceptDiagram 이 이 숫자를 올린다 → 복사해 둔 요소를 이 그림에 붙인다
  useEffect(() => { if (pasteSignal !== pasteSigRef.current) { pasteSigRef.current = pasteSignal; pasteClipRef.current?.(); } }, [pasteSignal]);
  const pasteClipRef = useRef(null);
  const pasteClip = (offset) => { if (!CLIP) return; PASTE_N += 1; const k = offset ?? 3 * PASTE_N; const r = sketchPaste(norm, CLIP, k, k); if (r.id) { commit(r.spec); setSelected(r.id); } };
  pasteClipRef.current = pasteClip;
  const onKey = (e) => {
    if (shortcutsEnabled && !shortcutsEnabled()) return; // 페이지 미리보기를 만지는 중이면 페이지 단축키가 받는다
    if (cropFor) return; // 이미지 자르기 창이 열려 있는 동안은 편집 단축키(Delete 등)를 받지 않는다
    const tag = e.target?.tagName || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;
    const mod = e.ctrlKey || e.metaKey; const k = (e.key || '').toLowerCase();
    if (!typing && multiOn && !mod) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(sketchDeleteMany(norm, multi)); setMulti([]); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const st = e.shiftKey ? 2 : 0.5; commit(sketchMoveMany(norm, multi, e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0), 'nudge:multi'); return; }
      if (e.key === 'Escape') { setMulti([]); return; }
    }
    if (mod && !typing && k === 'c' && selected && !window.getSelection?.()?.toString()) { if (copySel()) { e.preventDefault(); markInternalCopy('sketch'); } }
    else if (mod && !typing && k === 'x' && selected) { if (copySel()) { e.preventDefault(); markInternalCopy('sketch'); remove(); } }
    else if (mod && !typing && k === 'v' && CLIP) { schedulePaste(() => pasteClip()); } // 클립보드에 이미지가 있으면 그쪽이 이긴다(ConceptDiagram 의 paste 처리)
    else if (mod && !typing && k === 'd' && selected) { e.preventDefault(); if (copySel()) pasteClip(3); }
    else if (mod && !typing && k === 'a') { e.preventDefault(); setSelected(''); setWhole(true); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (!typing && selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (!typing && selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { // 방향키로 조금씩 옮긴다(Shift 는 더 크게)
      e.preventDefault(); const st = e.shiftKey ? 2 : 0.5;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0; const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      commit(sketchMoveBy(norm, selected, dx, dy), `nudge:${selected}`);
    } else if (!typing && selected && kind === 'memo' && (e.key === 'Enter' || e.key === 'F2')) { // 고른 글자(메모)를 그 자리에서 고친다
      e.preventDefault(); const el = canvasRef.current?.querySelector(`[data-eid="${selected}"]`); if (el) openTextEdit(el);
    } else if (e.key === 'Escape') { setSelected(''); setMulti([]); setWhole(false); }
  };
  keyRef.current = onKey; // 창 단위 키 입력 리스너가 항상 최신 상태의 처리 함수를 부르게 한다

  // 그림 위 글자 고치기: 누른 <text> 가 어느 글자 자리인지 찾아(메모는 id 로, 나머지는 글자 내용으로) 입력칸을 연다
  const openTextEdit = (t0) => {
    let t = t0;
    const eidEl = t.closest?.('[data-eid]'); const targets = sketchTextTargets(norm); let hit = null;
    if (eidEl) {
      const m = norm.memos.find((x) => x.id === eidEl.getAttribute('data-eid'));
      if (m && m.callout) { // 리더선 라벨: 제목 글자를 눌렀으면 제목, 설명 글자를 눌렀으면 설명(여러 줄). 틀·Enter 로 열면 제목
        const isText = (t.tagName || '').toLowerCase() === 'text'; const desc = isText && normText(t.textContent) !== normText(m.text);
        hit = desc ? { value: m.desc, multiline: true, apply: { id: m.id, key: 'desc' } } : { value: m.text, apply: { id: m.id, key: 'text' } };
        if (!isText) t = eidEl.querySelector('text') || t;
      } else if (m) hit = { value: m.text, apply: { id: m.id, key: 'text' } };
    }
    if (!hit) { const all = [...(canvasRef.current?.querySelectorAll('text') || [])]; const idx = all.filter((x) => normText(x.textContent) === normText(t.textContent)).indexOf(t); hit = pickByText(targets, t.textContent, idx); }
    if (hit) setEd({ target: t, value: hit.value, multiline: !!hit.multiline, apply: hit.apply });
    return !!hit;
  };
  const onDbl = (e) => {
    if (disabled || ed) return;
    const cell = e.target.closest?.('[data-cell]'); // 개요표의 셀(빈 칸 포함)·제목
    if (cell) {
      const eidEl = cell.closest('[data-eid]'); const mm = norm.memos.find((x) => x.id === eidEl?.getAttribute('data-eid'));
      if (mm && mm.table) { const [r, c] = cell.getAttribute('data-cell').split(',').map(Number); setEd({ target: cell, value: r < 0 ? mm.table.title : (mm.table.rows[r]?.[c] ?? ''), multiline: false, apply: { tableId: mm.id, r, c, key: `t${r},${c}` } }); e.preventDefault(); e.stopPropagation(); return; }
    }
    const t = textAtPoint(canvasRef.current, e.clientX, e.clientY);
    if (t && openTextEdit(t)) { e.preventDefault(); e.stopPropagation(); }
  };
  const commitText = (v) => {
    const a = ed.apply; setEd(null);
    const r = sketchApplyText(norm, a, v); if (!r) return;
    if (r.global) commit({ ...norm, ...r.global }, `inline:${JSON.stringify(a)}`); else { const nx = sketchUpdate(norm, r.update.id, r.update.patch); commit(r.update.patch.auto === false ? sketchRenumber(nx) : nx, `${r.update.id}:${a.key}`); }
  };

  const ends = sel?.el?.pts ? [sel.el.pts[0], sel.el.pts[sel.el.pts.length - 1]] : null;
  const setEnd = (which, axis, v) => {
    const a = [...ends[0]]; const z = [...ends[1]];
    (which === 0 ? a : z)[axis] = v;
    commit(sketchSetEnds(norm, selected, a, z), `${selected}:end`);
  };
  const setRect = (i, v) => { const r = [...sel.el.rect]; r[i] = v; set({ rect: r }, 'rect'); };

  const title = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
  const kindName = { block: { core: '코어(빗금 도형)', opening: '개구부(점선 캡슐)', image: '내 이미지' }[sel?.el?.kind] || '판(큰 도형)', line: '선', wind: '바람·흐름 화살표', memo: sel?.el?.badge ? '번호 마커' : sel?.el?.dim ? '치수선' : sel?.el?.callout ? '리더선 라벨' : sel?.el?.chip ? '아이콘 칩' : sel?.el?.table ? '개요표' : sel?.el?.symbol === 'north' ? '방위표' : sel?.el?.symbol === 'scale' ? '축척 막대' : '글자 메모' }[kind];

  const sidePanel = (
      <div className={rowMode || sideHost ? undefined : 'ed-cols'} style={sideHost ? { display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' } : rowMode ? { width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto', maxHeight: 'min(74vh, 780px)', overflowY: 'auto', paddingRight: 4 } : { display: 'block', columns: '280px', columnGap: 12, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }} data-testid="sk-side">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={smallBtn(false)} disabled={!past.current.length} onClick={undo} title="Ctrl+Z" data-testid="undo">↶ 되돌리기</button>
          <button style={smallBtn(false)} disabled={!future.current.length} onClick={redo} title="Ctrl+Y">↷ 다시</button>
          <button style={smallBtn(whole)} onClick={() => { setSelected(''); setWhole((v) => !v); }} data-testid="sk-whole" title="Ctrl+A — 그림 속 내용 전체를 감싸는 상자의 모서리를 끌어 전체 크기를 조절합니다(글자·선 굵기도 함께)">전체 크기</button>
          <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 4 }} title="그림 틀 가운데의 세로·가로 중심선을 항상 보여 줍니다"><input type="checkbox" checked={showAxis} onChange={(e) => setShowAxis(e.target.checked)} data-testid="show-axis" />중심축 보기</label>
        </div>
        {whole && (
          <div style={sec} data-testid="sk-whole-panel">
            <span style={title}>전체 크기 조절 · 지금 {Math.round(sketchGScale(norm).k * 100)}%</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.55 }}>주황 상자의 <b>네 모서리를 끌면</b> 그림 속 도형·선·화살표·글자·표가 <b>같은 비율로</b>(글자·선 굵기도) 커지거나 줄어듭니다. 반대쪽 모서리는 제자리에 있습니다. 제목·범례 칸은 그대로입니다.</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[[0.8, '80%'], [0.9, '−10%'], [1.1, '+10%'], [1.25, '125%']].map(([kk, t]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 8px' }} onClick={() => scaleWholeBy(kk)} data-testid={`sk-whole-${Math.round(kk * 100)}`}>{t}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} disabled={!norm.gscale} onClick={resetWhole} data-testid="sk-whole-reset">원래 크기로</button>
              <button style={smallBtn(false)} onClick={() => setWhole(false)} data-testid="sk-whole-done">끝내기</button>
            </div>
          </div>
        )}
        {textInfo && <PtReadout size={textInfo.size} ptInfo={ptInfo} text={textInfo.text} testid="sk-pt" onFix={kind === 'memo' && sel && sel.el.text === textInfo.text ? (pt) => set({ size: Math.min(48, Math.max(8, Math.round(pt / ptInfo.ppu))) }, 'size') : undefined} />}
        <div style={sec}>
          <span style={title}>요소 추가</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={() => add('wind')} data-testid="add-wind">＋ 화살표</button>
            <button style={smallBtn(false)} onClick={() => add('line')}>＋ 선</button>
            <button style={smallBtn(false)} onClick={() => add('slab')}>＋ 도형</button>
            <button style={smallBtn(false)} onClick={() => add('opening')}>＋ 개구부</button>
            <button style={smallBtn(false)} onClick={() => add('memo')}>＋ 글자</button>
            <button style={smallBtn(false)} onClick={() => add('marker')} data-testid="add-marker" title="검은 원 안의 흰 숫자(번호는 자동으로 1, 2, 3…)">＋ 번호</button>
            <button style={smallBtn(false)} onClick={() => add('dim')} data-testid="add-dim" title="두 지점 사이의 거리를 적는 선(예: 12,000 · 30m). 양 끝을 끌어 맞추고 글자는 더블클릭해서 고칩니다">＋ 치수선</button>
            <button style={smallBtn(false)} onClick={() => add('callout')} data-testid="add-callout" title="굵은 제목 + 설명 + 끝점이 있는 안내선">＋ 리더선</button>
            <button style={smallBtn(false)} onClick={() => add('icon')} data-testid="add-icon" title="색 칩 안의 아이콘(건물·설비·에너지·안전·주거·동선 등 100여 개 중에서 고름)">＋ 아이콘</button>
            <button style={smallBtn(false)} onClick={() => add('table')} data-testid="add-table" title="건축개요·면적표 같은 라벨–값 표(2~4열)">＋ 표</button>
            <button style={smallBtn(false)} onClick={() => add('north')} data-testid="add-north" title="방위표(N 화살표) — 돌려서 북쪽을 맞춥니다">＋ 방위표</button>
            <button style={smallBtn(false)} onClick={() => add('scale')} data-testid="add-scale" title="축척 막대(0 … 50m)">＋ 축척 막대</button>
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

        {multiOn && (
          <div style={sec} data-testid="sk-multi">
            <span style={title}>여러 개 고름 · {multi.length}개</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>{[['글자', multiTexts.length], ['화살표', mcount('wind')], ['선', mcount('line')], ['판', mcount('block')], ['기타', multi.length - multiTexts.length - mcount('wind') - mcount('line') - mcount('block')]].filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`).join(' · ')} — 끌면 함께 움직이고, 방향키로 옮기고, Delete 로 지웁니다.</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(false)} onClick={() => setMulti([])} data-testid="sk-multi-clear">선택 해제</button>
              <button style={smallBtn(false, true)} onClick={() => { commit(sketchDeleteMany(norm, multi)); setMulti([]); }} data-testid="sk-multi-delete">모두 지우기</button>
            </div>
            <div style={{ ...lab, gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sk-multi-align">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>정렬 (고른 것끼리)</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {[['left', '⇤ 왼쪽'], ['hcenter', '⇔ 가운데'], ['right', '⇥ 오른쪽'], ['top', '⤒ 위'], ['vcenter', '↕ 중간'], ['bottom', '⤓ 아래']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => commit(sketchAlignMany(norm, multi, k))} data-testid={`sk-multi-align-${k}`}>{t}</button>)}
              </div>
              {multi.length > 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <button style={smallBtn(false)} onClick={() => commit(sketchDistribute(norm, multi, 'h'))} data-testid="sk-multi-dist-h" title="가운데 요소들을 처음~끝 사이에 같은 간격으로">↔ 가로 간격 같게</button>
                  <button style={smallBtn(false)} onClick={() => commit(sketchDistribute(norm, multi, 'v'))} data-testid="sk-multi-dist-v" title="가운데 요소들을 처음~끝 사이에 같은 간격으로">↕ 세로 간격 같게</button>
                </div>
              )}
            </div>
            {multiTexts.length > 0 && (
              <div style={{ ...lab, gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sk-multi-text">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>글자 {multiTexts.length}개 한꺼번에</span>
                <label style={lab}>크기(모두)
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="range" min="9" max="40" step="1" defaultValue={sketchFind(norm, multiTexts[0]).el.size} key={`ms${multi.join()}`} onChange={(e) => mset({ size: Number(e.target.value) }, ['text'], 'size')} data-testid="sk-multi-size" style={{ flex: 1 }} />
                    <button style={{ ...smallBtn(false), padding: '3px 7px' }} onClick={() => mset((q) => ({ size: Math.max(8, Math.round(q.size * 0.9)) }), ['text'])} data-testid="sk-multi-size-down">−10%</button>
                    <button style={{ ...smallBtn(false), padding: '3px 7px' }} onClick={() => mset((q) => ({ size: Math.min(48, Math.round(q.size * 1.1)) }), ['text'])} data-testid="sk-multi-size-up">+10%</button>
                  </div>
                </label>
                <div style={lab}>글자 정렬(모두)
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), flex: 1, padding: '4px 2px' }} onClick={() => multiAlignText(k)} data-testid={`sk-multi-ta-${k}`}>{t}</button>)}
                  </div>
                </div>
                <label style={lab}>글씨체(모두)
                  <select style={input} defaultValue="" key={`mf${multi.join()}`} onChange={(e) => { if (e.target.value) mset({ font: e.target.value === 'malgun' ? undefined : e.target.value }, ['text']); }} data-testid="sk-multi-font">
                    <option value="">바꾸지 않음</option>{TEXT_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label.split(' (')[0]}</option>)}
                  </select>
                </label>
                <label style={lab}>굵기(모두)
                  <select style={input} defaultValue="" key={`mw${multi.join()}`} onChange={(e) => { if (e.target.value) mset({ fw: e.target.value === 'auto' ? undefined : Number(e.target.value) }, ['text']); }} data-testid="sk-multi-weight">
                    <option value="">바꾸지 않음</option><option value="auto">기본</option>{TEXT_WEIGHTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
                <label style={lab}>자간(모두)
                  <input type="range" min="-2" max="20" step="0.5" defaultValue="0" key={`ml${multi.join()}`} onChange={(e) => mset({ ls: Number(e.target.value) || undefined }, ['text'], 'ls')} data-testid="sk-multi-ls" />
                </label>
                <div style={lab}>색(모두)<Colors value="" onChange={(c) => mset({ color: c }, ['text'])} /></div>
              </div>
            )}
            {(mcount('wind') + mcount('line')) > 0 && (
              <div style={{ ...lab, gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sk-multi-lines">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>선·화살표 {mcount('wind') + mcount('line')}개 한꺼번에</span>
                <label style={lab}>선 종류(모두)
                  <select style={input} defaultValue="" key={`md${multi.join()}`} onChange={(e) => { if (e.target.value) mset({ dash: e.target.value }, ['line', 'wind']); }} data-testid="sk-multi-dash">
                    <option value="">바꾸지 않음</option>{Object.keys(DASHES).map((k) => <option key={k} value={k}>{DASH_LABEL[k]}</option>)}
                  </select>
                </label>
                <label style={lab}>굵기(모두)
                  <input type="range" min="1" max="14" step="0.5" defaultValue="4" key={`mwd${multi.join()}`} onChange={(e) => mset({ width: Number(e.target.value) }, ['line', 'wind'], 'width')} data-testid="sk-multi-width" />
                </label>
                <div style={lab}>색(모두)<Colors value="" onChange={(c) => mset({ color: c }, ['line', 'wind'])} /></div>
              </div>
            )}
            {mcount('block') > 0 && (
              <div style={{ ...lab, gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sk-multi-blocks">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>도형(판) {mcount('block')}개 한꺼번에</span>
                <div style={lab}>채움색(모두)<Colors value="" onChange={(c) => mset({ fill: c }, ['block'])} allowClear /></div>
              </div>
            )}
          </div>
        )}

        {!sel && !multiOn && (
          <div style={sec}>
            <span style={title}>전체</span>
            <button style={smallBtn(false)} onClick={selectAllText} disabled={norm.memos.filter(isPlainMemo).length < 2} data-testid="sk-select-text" title="그림 속 일반 글자를 모두 골라 크기·글씨체·정렬을 한꺼번에 바꿉니다">글자 모두 선택</button>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림의 화살표·선·도형·글자를 <b>클릭</b>하면 여기서 속성을 바꿀 수 있고, <b>Shift·Ctrl+클릭</b>으로 여러 개를 고르거나 빈 곳에서 <b>Ctrl+끌기</b>로 상자로 고를 수 있고, <b>끌어서 옮길</b> 수 있습니다. 선택하면 나타나는 <b>네모 점은 크기</b>, <b>동그라미는 화살표 끝점</b>, <b>큰 마름모는 S자 변곡점(자유롭게 이동)</b>, <b>작은 빈 마름모는 휘는 정도</b> 조절입니다.<br />Shift: 수평·수직 고정 · Alt: 자석 끄기 · 방향키: 미세 이동<br /><b>안내선</b>: 끌면 다른 요소의 변·가운데선, 그림 가운데, 좌우·상하 <b>대칭 위치</b>에 가까워질 때 안내선(분홍=정렬, 초록=중심축, 청록=대칭)이 뜨며 자동으로 붙습니다. 화살표 끝을 끌면 반대쪽 끝과 수평·수직으로 맞춰집니다.<br />Ctrl+C / Ctrl+V: 복사·붙여넣기 · Ctrl+D: 복제 · Ctrl+X: 잘라내기 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
            <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={norm.showLegend} onChange={(e) => setGlobal({ showLegend: e.target.checked })} />하단 범례 표시</label>
            <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={norm.showNotes} onChange={(e) => setGlobal({ showNotes: e.target.checked })} />하단 핵심 메시지 표시</label>
            {norm.textBlock && (
              <div style={{ ...sec, gap: 6, background: 'rgba(240,176,0,0.08)' }} data-testid="textblock-panel">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>오른쪽 문구 블록</span>
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
              {(sel.el.form || 'line') === 'line' && sel.el.dash !== 'solid' && (
                <label style={lab}>파선 간격 {Math.round((sel.el.dgap || 1) * 100)}%
                  <input type="range" min={DGAP_MIN} max={DGAP_MAX} step="0.05" value={sel.el.dgap || 1} onChange={(e) => set({ dgap: Number(e.target.value) }, 'dgap')} data-testid="prop-dgap" />
                </label>
              )}
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
              {sel.el.dash !== 'solid' && (
                <label style={lab}>파선 간격 {Math.round((sel.el.dgap || 1) * 100)}%
                  <input type="range" min={DGAP_MIN} max={DGAP_MAX} step="0.05" value={sel.el.dgap || 1} onChange={(e) => set({ dgap: Number(e.target.value) }, 'dgap')} data-testid="prop-dgap" />
                </label>
              )}
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
              <label style={lab}>탈색 {sel.el.gray || 0}% <span style={{ fontWeight: 400 }}>(100% = 흑백)</span>
                <input type="range" min="0" max="100" step="5" value={sel.el.gray || 0} onChange={(e) => set({ gray: Number(e.target.value) }, 'gray')} data-testid="img-gray" />
              </label>
              <label style={lab}>가장자리 흐리게 {sel.el.edge || 0}%
                <input type="range" min="0" max="100" step="5" value={sel.el.edge || 0} onChange={(e) => set({ edge: Number(e.target.value) }, 'edge')} data-testid="img-edge" />
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(false)} onClick={() => set({ gray: CONTEXT_FX.gray, opacity: CONTEXT_FX.opacity, edge: CONTEXT_FX.edge, layer: 'back' })} data-testid="img-context" title="흑백 + 투명도 35% + 맨 뒤로 — 그 위에 매스·동선을 얹는 흐린 바탕(대지·평면 맥락)">맥락 바탕으로 흐리게</button>
                {((sel.el.gray || 0) > 0 || (sel.el.edge || 0) > 0 || sel.el.opacity < 1) && <button style={smallBtn(false)} onClick={() => set({ gray: 0, edge: 0, opacity: 1 })} data-testid="img-fx-reset" title="탈색·가장자리·투명도를 처음 상태로">효과 지우기</button>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(sel.el.layer !== 'front')} onClick={() => set({ layer: 'back' })} data-testid="img-back" title="바탕 위, 도형·화살표·글자 아래">맨 뒤로</button>
                <button style={smallBtn(sel.el.layer === 'front')} onClick={() => set({ layer: 'front' })} data-testid="img-front" title="모든 도형·화살표 위">맨 앞으로</button>
                {sel.el.ar > 0 && <button style={smallBtn(false)} onClick={() => { const r = sel.el.rect; set({ rect: [r[0], r[1], r[2], r[1] + (r[2] - r[0]) / sel.el.ar] }); }} data-testid="img-ratio">원본 비율로</button>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(false)} disabled={imgBusy} onClick={() => imgFileRef.current?.click()} data-testid="img-replace" title="다른 이미지로 바꿉니다(자리·투명도·앞뒤는 그대로)">이미지 바꾸기</button>
                <button style={smallBtn(!!sel.el.crop)} disabled={imgBusy} onClick={() => setCropFor({ id: selected })} data-testid="img-crop" title="이미지의 필요한 부분만 남깁니다">자르기{sel.el.crop ? ' (자른 상태)' : ''}</button>
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
              {sel.el.kind !== 'opening' && sel.el.kind !== 'image' && sel.el.name && (sel.el.showName ?? sel.el.kind === 'core') && (
                <button style={smallBtn(false)} onClick={() => { const r = sketchDetachName(norm, selected); if (r.id) { commit(r.spec); setSelected(r.id); } }} data-testid="detach-name" title="도형 안에 자동으로 그려지는 이름 글자를 따로 떼어, 다른 글자처럼 어디든 옮기고 크기·색·글씨체를 바꿀 수 있게 합니다">이름을 글자로 떼어 내기</button>
              )}
              <div style={lab}>채움색<Colors value={sel.el.fill} onChange={(c) => set({ fill: c })} allowClear /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="왼쪽 X" value={sel.el.rect[0]} onChange={(v) => setRect(0, v)} />
                <Num label="위쪽 Y" value={sel.el.rect[1]} onChange={(v) => setRect(1, v)} />
                <Num label="오른쪽 X" value={sel.el.rect[2]} onChange={(v) => setRect(2, v)} />
                <Num label="아래쪽 Y" value={sel.el.rect[3]} onChange={(v) => setRect(3, v)} />
              </div>
            </>)}

            {kind === 'memo' && sel.el.badge && (<>
              <div style={lab}>모양
                <div style={{ display: 'flex', gap: 6 }}>{[['circle', '● 원'], ['square', '■ 사각']].map(([v, t]) => <button key={v} style={{ ...smallBtn(sel.el.badge === v), flex: 1 }} onClick={() => set({ badge: v })} data-testid={`badge-${v}`}>{t}</button>)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
                <label style={lab}>번호 ({sel.el.auto === false ? '직접 정함' : '자동'})
                  <input style={input} maxLength={3} value={sel.el.text} onChange={(e) => commit(sketchRenumber(sketchUpdate(norm, selected, { text: e.target.value, auto: false })), `${selected}:num`)} data-testid="badge-num" />
                </label>
                <button style={smallBtn(false)} disabled={sel.el.auto !== false} onClick={() => commit(sketchRenumber(sketchUpdate(norm, selected, { auto: true })))} title="직접 정한 번호를 버리고 자동 번호로 되돌립니다" data-testid="badge-auto">↺ 자동</button>
              </div>
              <label style={lab}>크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="badge-size" />
              </label>
              <div style={lab}>색(바탕)<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>숫자를 더블클릭해도 고칩니다. 마커를 지우면 뒤 번호가 자동으로 당겨집니다(직접 정한 번호는 그대로).</span>
            </>)}
            {kind === 'memo' && sel.el.dim && (<>
              <label style={lab}>치수 글자(예: 12,000 · 30m)<input style={input} value={sel.el.text} onChange={(e) => set({ text: e.target.value }, 'text')} data-testid="dim-text" /></label>
              <label style={lab}>글자 크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="dim-size" />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>양 끝의 <b>주황 점</b>을 끌어 길이와 방향을 맞춥니다. 치수 글자는 더블클릭해서 고칩니다.</span>
            </>)}
            {kind === 'memo' && sel.el.callout && (<>
              <label style={lab}>제목<input style={input} value={sel.el.text} onChange={(e) => set({ text: e.target.value }, 'text')} data-testid="co-title" /></label>
              <label style={lab}>설명 (줄바꿈으로 최대 3줄)
                <textarea style={{ ...input, resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }} rows={3} value={sel.el.desc} onChange={(e) => set({ desc: e.target.value }, 'desc')} data-testid="co-desc" />
              </label>
              <div style={lab}>선 종류
                <div style={{ display: 'flex', gap: 6 }}>{[['straight', '직선'], ['elbow', '꺾은선']].map(([v, t]) => <button key={v} style={{ ...smallBtn(sel.el.line === v), flex: 1 }} onClick={() => set({ line: v })} data-testid={`co-line-${v}`}>{t}</button>)}</div>
              </div>
              <div style={lab}>끝 모양
                <div style={{ display: 'flex', gap: 6 }}>{[['dot', '● 점'], ['arrow', '▶ 화살표'], ['none', '없음']].map(([v, t]) => <button key={v} style={{ ...smallBtn(sel.el.end === v), flex: 1 }} onClick={() => set({ end: v })} data-testid={`co-end-${v}`}>{t}</button>)}</div>
              </div>
              <label style={lab}>글자 크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="co-size" />
              </label>
              <div style={{ ...lab, gap: 6 }} data-testid="sk-co-textfmt">
                <span>글자 정렬(글 상자 안)</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, t]) => <button key={k} style={{ ...smallBtn((sel.el.align || 'start') === k), flex: 1, padding: '4px 2px' }} onClick={() => set({ align: k === 'start' ? undefined : k })} data-testid={`sk-co-ta-${k}`}>{t}</button>)}
                </div>
                <label style={lab}>자간 {sel.el.ls || 0}
                  <input type="range" min="-2" max="12" step="0.5" value={sel.el.ls || 0} onChange={(e) => set({ ls: Number(e.target.value) || undefined }, 'ls')} data-testid="sk-co-ls" />
                </label>
                <label style={lab}>설명 행간 {Math.round((sel.el.lh || 1) * 100)}%
                  <input type="range" min="0.6" max="2.5" step="0.05" value={sel.el.lh || 1} onChange={(e) => set({ lh: Math.abs(Number(e.target.value) - 1) < 0.01 ? undefined : Number(e.target.value) }, 'lh')} data-testid="sk-co-lh" />
                </label>
              </div>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>글을 끌면 끝점까지 통째로 움직입니다. <b>끝점의 동그라미 손잡이</b>를 끌어 가리킬 곳을 정하세요. 제목·설명 글자를 더블클릭해도 고칩니다(Enter 확정 · Shift+Enter 줄바꿈).</span>
            </>)}
            {kind === 'memo' && sel.el.chip && (<>
              <div style={lab}>아이콘 — {ICON_LABEL[sel.el.chip] || sel.el.chip}
                <IconPicker value={sel.el.chip} onPick={(n) => set({ chip: n })} testid="chip-picker" />
              </div>
              <div style={lab}>모양
                <div style={{ display: 'flex', gap: 6 }}>{[['rounded', '둥근 사각'], ['circle', '원'], ['bare', '아이콘만']].map(([v, t]) => <button key={v} style={{ ...smallBtn((sel.el.chipShape || 'rounded') === v), flex: 1 }} onClick={() => set({ chipShape: v })} data-testid={`chip-shape-${v}`}>{t}</button>)}</div>
              </div>
              <label style={lab}>크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="chip-size" />
              </label>
              <div style={lab}>색{sel.el.chipShape === 'bare' ? '(아이콘)' : '(칩 바탕)'}<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
            </>)}
            {kind === 'memo' && sel.el.table && (<>
              <TableEditor table={sel.el.table} onChange={(tb, key) => set({ table: tb }, key || 'table')} testid="tb" />
              <label style={lab}>글자 크기 {sel.el.size}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="tb-size" />
              </label>
              <div style={lab}>색(제목 띠·선)<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>열 너비는 글자 길이에 맞춰 저절로 정해집니다. 표를 끌어 옮기고, 칸·제목은 더블클릭으로도 고칩니다(Enter 확정).</span>
            </>)}
            {kind === 'memo' && sel.el.symbol === 'north' && (<>
              <div style={lab}>모양
                <div style={{ display: 'flex', gap: 6 }}>{Object.entries(NORTH_STYLE_LABEL).map(([v, t]) => <button key={v} style={{ ...smallBtn((sel.el.nstyle || 'circle') === v), flex: 1 }} onClick={() => set({ nstyle: v })} data-testid={`north-${v}`}>{t}</button>)}</div>
              </div>
              <label style={lab}>크기(지름) {sel.el.ssize}
                <input type="range" min="30" max="240" step="2" value={sel.el.ssize} onChange={(e) => set({ ssize: Number(e.target.value) }, 'ssize')} data-testid="north-size" />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>아래 <b>회전</b>의 각도나 위쪽 동그라미 손잡이로 북쪽 방향에 맞춥니다.</span>
            </>)}
            {kind === 'memo' && sel.el.symbol === 'scale' && (<>
              <label style={lab}>막대 길이 {sel.el.ssize}
                <input type="range" min="60" max="900" step="5" value={sel.el.ssize} onChange={(e) => set({ ssize: Number(e.target.value) }, 'ssize')} data-testid="scale-len" />
              </label>
              <div style={lab}>칸 수
                <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4, 5].map((n) => <button key={n} style={{ ...smallBtn(sel.el.segs === n), flex: 1 }} onClick={() => set({ segs: n })} data-testid={`scale-segs-${n}`}>{n}</button>)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
                <Num label="막대 전체가 나타내는 길이" value={sel.el.total} step={1} onChange={(v) => set({ total: Math.max(0.1, v) }, 'total')} testid="scale-total" />
                <label style={lab}>단위<select style={input} value={sel.el.unit} onChange={(e) => set({ unit: e.target.value })} data-testid="scale-unit">{SCALE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
              </div>
              <label style={lab}>글자 크기 {sel.el.size}
                <input type="range" min="8" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} data-testid="scale-font" />
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>막대 길이(화면 위 길이)와 그 길이가 나타내는 실제 길이를 맞춰 쓰세요(예: 막대 220 = 50m).</span>
            </>)}
            {kind === 'memo' && !sel.el.badge && !sel.el.callout && !sel.el.dim && !sel.el.chip && !sel.el.table && !sel.el.symbol && (<>
              <label style={lab}>글자<input style={input} value={sel.el.text} onChange={(e) => set({ text: e.target.value }, 'text')} /></label>
              <label style={lab}>크기 {sel.el.size}{ptInfo ? ` · 약 ${Math.round(sel.el.size * ptInfo.ppu * 10) / 10}pt` : ''}
                <input type="range" min="9" max="40" step="1" value={sel.el.size} onChange={(e) => set({ size: Number(e.target.value) }, 'size')} />
              </label>
              <div style={{ ...lab, gap: 6 }} data-testid="sk-textfmt">
                <span>글자 정렬 <span style={{ fontWeight: 400 }}>(글자는 제자리에 둡니다)</span></span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, t]) => <button key={k} style={{ ...smallBtn((sel.el.align || 'middle') === k), flex: 1, padding: '4px 2px' }} onClick={() => setMemoAlign(k)} data-testid={`sk-ta-${k}`}>{t}</button>)}
                </div>
                <label style={lab}>자간 {sel.el.ls || 0}
                  <input type="range" min="-2" max="20" step="0.5" value={sel.el.ls || 0} onChange={(e) => set({ ls: Number(e.target.value) || undefined }, 'ls')} data-testid="sk-ls" />
                </label>
              </div>
              <label style={lab}>글씨체
                <select style={input} value={sel.el.font || 'malgun'} onChange={(e) => set({ font: e.target.value === 'malgun' ? undefined : e.target.value })} data-testid="sk-font">
                  {TEXT_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </label>
              <label style={lab}>굵기
                <select style={input} value={sel.el.fw || ''} onChange={(e) => set({ fw: e.target.value ? Number(e.target.value) : undefined })} data-testid="sk-weight">
                  <option value="">기본</option>{TEXT_WEIGHTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <div style={lab}>색<Colors value={sel.el.color} onChange={(c) => set({ color: c })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Num label="X" value={sel.el.x} onChange={(v) => set({ x: v }, 'x')} />
                <Num label="Y" value={sel.el.y} onChange={(v) => set({ y: v }, 'y')} />
              </div>
            </>)}

            {sketchCanRotate(norm, selected) && (
              <div style={{ ...lab, gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="rotate-panel">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>회전</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
                  <Num label={kind === 'wind' || kind === 'line' ? '각도(°) — 시작→끝 방향, 시계 방향이 +' : '각도(°) — 시계 방향이 +'} value={sketchRotation(norm, selected)} step={1} testid="rot-input" onChange={(v) => commit(sketchSetAngle(norm, selected, v), `${selected}:rot`)} />
                  <button style={smallBtn(false)} onClick={() => commit(sketchSetAngle(norm, selected, 0))} disabled={!sketchRotation(norm, selected)} title={kind === 'wind' || kind === 'line' ? '수평(→)으로 되돌립니다' : '돌리기 전 모양으로 되돌립니다'} data-testid="rot-zero">0°</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[['−90°', -90], ['−15°', -15], ['+15°', 15], ['+90°', 90]].map(([t, d]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => commit(sketchRotateBy(norm, selected, d))} data-testid={`rot-${d}`}>{t}</button>)}
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>그림 위 <b>동그라미 손잡이</b>를 끌어도 돌아갑니다(Shift: 15° 단위 · Alt: 붙지 않음). 선·화살표는 끝점이 함께 돌아갑니다.{kind === 'block' && sketchRotation(norm, selected) ? ' 아래 위치·크기 숫자는 돌리기 전 기준입니다.' : ''}</span>
              </div>
            )}
            <div style={{ ...lab, gap: 5, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="align-panel">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>정렬·대칭</span>
              <label style={lab}>기준
                <select style={input} value={ref} onChange={(e) => setRefId(e.target.value)} data-testid="align-ref">
                  <option value="axis">그림 가운데(틀)</option>
                  {others.map((e) => <option key={e.id} value={e.id}>{elLabel(e)}</option>)}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {[['left', '⇤ 왼쪽'], ['hcenter', '⇔ 가운데'], ['right', '⇥ 오른쪽'], ['top', '⤒ 위'], ['vcenter', '↕ 중간'], ['bottom', '⤓ 아래']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => doAlign(k)} data-testid={`align-${k}`}>{t}</button>)}
              </div>
              {axisChoice && (
                <label style={lab}>대칭축
                  <select style={input} value={axisPick === 'big' ? 'big' : 'frame'} onChange={(e) => setAxisPick(e.target.value)} data-testid="align-axis">
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
              <button style={smallBtn(false)} onClick={() => { if (copySel()) markInternalCopy('sketch'); }} title="Ctrl+C" data-testid="copy">복사</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="delete">삭제</button>
            </div>
          </div>
        )}
        {cropFor && sel && sel.el.kind === 'image' && <ImageCropDialog src={sel.el.orig || sel.el.href} crop={sel.el.crop || null} busy={imgBusy} onApply={applyCrop} onCancel={() => setCropFor(null)} />}
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>좌표는 그림 안 위치(0~100)입니다. 위쪽 ‘SVG 저장’을 누르면 지금 모습 그대로 저장됩니다.</p>
      </div>
  );
  return (
    <div ref={edRootRef} style={{ display: 'flex', flexDirection: rowMode ? 'row' : 'column', gap: 14, alignItems: rowMode ? 'flex-start' : 'stretch' }} data-testid="sketch-editor" data-wide={rowMode ? '1' : '0'}>
      <style>{'.ed-cols>*{break-inside:avoid;margin:0 0 10px}'}</style>
      <div style={rowMode ? { flex: '1 1 360px', minWidth: 360 } : { minWidth: 0 }}>
      <ZoomView testid="sk-zoom">
      <div ref={hostRef} style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'visible', background: '#fff', position: 'relative' }}>
        <div style={{ position: 'relative' }}>{/* 안내선 층과 그림이 정확히 같은 크기가 되도록(아래 힌트 줄이 층을 늘이지 않게) 한 틀로 묶는다 */}
        <svg viewBox={`0 0 ${SKETCH_SIZE[0]} ${SKETCH_SIZE[1]}`} data-testid="guide-overlay" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
          <g transform={norm.gscale ? `translate(${norm.gscale.t[0]} ${norm.gscale.t[1]}) scale(${norm.gscale.k})` : undefined}>
          {(regionDraft || regionRect) && (() => { const r = regionDraft || regionRect; const a = view.toScreen([r[0], r[1]]); const z = view.toScreen([r[2], r[3]]); return (
            <g data-testid="region-box"><rect x={a[0]} y={a[1]} width={Math.max(0, z[0] - a[0])} height={Math.max(0, z[1] - a[1])} fill="rgba(242,140,40,0.16)" stroke="#E8832A" strokeWidth="3" strokeDasharray="10 6" /></g>); })()}
          {multiOn && mboxes.map((b, i) => <rect key={`mb${i}`} x={b[0] - 4} y={b[1] - 4} width={b[2] - b[0] + 8} height={b[3] - b[1] + 8} fill="rgba(242,140,40,0.08)" stroke="#F28C28" strokeWidth="2.5" strokeDasharray="8 5" rx="3" data-testid="multi-box" />)}
          {marq && <rect x={marq[0]} y={marq[1]} width={marq[2] - marq[0]} height={marq[3] - marq[1]} fill="rgba(51,51,153,0.10)" stroke="#333399" strokeWidth="2" strokeDasharray="8 5" data-testid="multi-marquee" />}
          {[...axisGuides, ...guides].map((g, i) => {
            const a = g.dim === 'x' ? view.toScreen([g.v, g.lo]) : view.toScreen([g.lo, g.v]); const z = g.dim === 'x' ? view.toScreen([g.v, g.hi]) : view.toScreen([g.hi, g.v]);
            const col = GUIDE_COLOR[g.kind] || GUIDE_COLOR.edge; const label = GUIDE_LABEL[g.kind];
            return (<g key={`${g.dim}${g.kind}${i}`} data-guide={g.kind}>
              <line x1={a[0]} y1={a[1]} x2={z[0]} y2={z[1]} stroke={col} strokeWidth="1.6" strokeDasharray={g.kind === 'axis' ? '10 5' : '6 4'} />
              {label && <text x={g.dim === 'x' ? a[0] + 5 : a[0]} y={g.dim === 'x' ? a[1] + 13 : a[1] - 5} fontSize="13" fontWeight="700" fill={col} style={{ fontFamily: 'sans-serif' }}>{label}</text>}
            </g>);
          })}
          {rotInfo && (() => { const q = view.toScreen(rotInfo.c); return (<g data-testid="rot-label"><rect x={q[0] - 28} y={q[1] - 13} width="56" height="24" rx="6" fill="rgba(30,30,30,0.85)" /><text x={q[0]} y={q[1] + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" style={{ fontFamily: 'sans-serif' }}>{Math.round(rotInfo.deg * 10) / 10}°</text></g>); })()}
          </g>
          {whole && wbox && (<g data-testid="whole-overlay">
            <rect x={wbox[0] - 6} y={wbox[1] - 6} width={wbox[2] - wbox[0] + 12} height={wbox[3] - wbox[1] + 12} fill="none" stroke="#F28C28" strokeWidth="3" strokeDasharray="12 8" rx="4" />
            {[['nw', wbox[0] - 6, wbox[1] - 6, 'nwse-resize'], ['ne', wbox[2] + 6, wbox[1] - 6, 'nesw-resize'], ['se', wbox[2] + 6, wbox[3] + 6, 'nwse-resize'], ['sw', wbox[0] - 6, wbox[3] + 6, 'nesw-resize']].map(([c, hx, hy, cur]) => (
              <rect key={c} data-testid={`whole-${c}`} x={hx - 11} y={hy - 11} width="22" height="22" rx="4" fill="#F28C28" stroke="#fff" strokeWidth="3" style={{ pointerEvents: 'auto', cursor: cur }} onPointerDown={(ev) => startWhole(ev, c)}><title>끌어서 그림 전체의 크기를 조절합니다(글자·선 굵기도 함께)</title></rect>))}
            {wInfo && (() => { const cx = (wbox[0] + wbox[2]) / 2; const cy = (wbox[1] + wbox[3]) / 2; return (<g data-testid="whole-label"><rect x={cx - 40} y={cy - 14} width="80" height="28" rx="7" fill="rgba(30,30,30,0.85)" /><text x={cx} y={cy + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff" style={{ fontFamily: 'sans-serif' }}>{Math.round(wInfo.k * 100)}%</text></g>); })()}
          </g>)}
        </svg>
        <div ref={canvasRef} onPointerDown={onDown} onDoubleClick={onDbl} dangerouslySetInnerHTML={html} data-testid="sketch-canvas" style={{ touchAction: 'none', userSelect: 'none', cursor: regionPick ? 'crosshair' : dragging ? 'grabbing' : 'default', borderRadius: 8, overflow: 'hidden' }} />
        </div>
        {ed && hostRef.current && <InlineInput host={hostRef.current} target={ed.target} value={ed.value} multiline={ed.multiline} onCommit={commitText} onCancel={() => setEd(null)} />}
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', padding: '4px 8px', borderTop: '1px solid var(--border-color)' }} data-testid="inline-hint"><b>그림의 빈 곳을 한 번 누르면 그림 전체가 선택되어 테두리와 모서리 손잡이가 나오고</b>(모서리를 끌면 크기, 빈 곳을 끌면 위치가 바뀝니다). 글자를 <b>더블클릭</b>하면 그 자리에서 바로 고칠 수 있습니다(고른 글자는 Enter/F2). Enter 확정 · Esc 취소.</div>
      </div>
      </ZoomView>
      </div>

      {sideHost && !sideOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface)', fontSize: 12, color: 'var(--text-secondary)' }} data-testid="side-hint">
          <span>요소 추가 · 속성 · 정렬은 왼쪽 <b>③ 도형 편집</b> 탭에 있습니다(요소를 누르면 자동으로 열립니다).</span>
          <button type="button" style={{ ...smallBtn(false), padding: '3px 10px' }} onClick={() => onOpenSide && onOpenSide()}>도형 편집 열기</button>
        </div>
      )}
      {sideHost ? createPortal(sidePanel, sideHost) : sidePanel}
    </div>
  );
}
