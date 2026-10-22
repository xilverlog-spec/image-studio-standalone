import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyEdits, hasEdits, editReplaceImage, editCropImage, editUpdateAdd, editRemoveAdd, editAddShape, editUpdateShape, editRemoveShape, newShape, rawShift, rawSetText, editSet, editMove, editMoveTo, editDelete, editRestore, editAsPath, editTranslate, editScale, editLineSpacing, LH_MIN, LH_MAX, addScalePatch, SCALE_MIN, SCALE_MAX, DASH_PRESETS, DASH_GAP_MIN, DASH_GAP_MAX, dashKind, dashNumsEven, dashSameParts, dashGapFactor, dashScaled, dashPatch, parsePath, pathD, pathNodes, pathMoveNode, pathMoveCtrl, pathToggleCurve, pathAddNode, pathDelNode, parsePoints, pointsStr, lineToCurveD } from './conceptDiagram/svgedit';
import { normText, pickByText, responsiveSvg } from './conceptDiagram/inlineText';
import { textAtPoint, InlineInput, textUnitSize, PtReadout } from './InlineText';
import { schedulePaste, markInternalCopy } from './conceptDiagram/clip';
import { readImageFile, bakeCrop, imageSize } from './conceptDiagram/imgio';
import ImageCropDialog from './ImageCropDialog';
import ZoomView from './ZoomView';
import { editRotate, editRotateAdd, editAddBadge, editRenumber, editAddCallout, editAddDim, editAddIcon, editAddTable, editAddNorth, editAddScale, addShiftPatch } from './conceptDiagram/svgedit';
import { NORTH_STYLE_LABEL, SCALE_UNITS } from './conceptDiagram/symbols';
import { tableSetCell } from './conceptDiagram/table';
import TableEditor from './TableEditor';
import { CONTEXT_FX } from './conceptDiagram/imgfx';
import IconPicker from './IconPicker';
import { ICON_LABEL } from './conceptDiagram/icons';
import { snapDeg, normDeg, rotRectKeep } from './conceptDiagram/rotate';

// 평면 다이어그램·배치 개념도·매스 과정도·버블도·층별 조닝도 같은 '구조형 결과'의 편집기.
// 그림 속 도형을 하나씩 눌러 고른 뒤 색·위치(끌기)·곡선(마디 끌기)·선 종류·굵기·투명도를 고친다. 글자는 더블클릭으로 그 자리에서 고친다.
// 고친 내용(edits)은 부모가 갖고, 그림을 다시 그릴 때(글자를 고쳤을 때)도 같은 요소에 다시 입혀진다.

const input = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const smallBtn = (on, danger) => ({
  padding: '5px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--line-strong)'}`,
  background: danger ? 'var(--err-soft)' : on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const sec = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)' };
const lab = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
const title = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
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

let SV_CLIP = null; let SV_PASTE_N = 0; // 복사해 둔 요소(다른 칸의 그림에도 붙일 수 있게 모듈에 둔다)와 연속 붙여넣기 횟수

export default function SvgEditor({ svg, edits, onEdits, fields, onTextEdit, onMiss, maxWidth, disabled, shortcutsEnabled, ptInfo, onAddImageClick }) {
  const view = useMemo(() => applyEdits(svg, edits, { ids: true }), [svg, edits]);
  const html = useMemo(() => ({ __html: responsiveSvg(view.svg) }), [view.svg]); // 같은 객체여야 React 가 그림을 매번 다시 만들지 않는다(다시 만들면 표시·마우스 올림이 사라진다)
  const E = useMemo(() => (edits && edits.sig === view.sig ? edits : { sig: view.sig, ops: {}, ...(edits?.adds ? { adds: edits.adds } : {}), ...(edits?.shapes ? { shapes: edits.shapes } : {}) }), [edits, view.sig]); // 구조가 달라져도 내가 넣은 이미지는 남긴다
  const stale = !!edits && edits.sig !== view.sig && hasEdits(edits);
  const els = view.els; const adds = E.adds || []; const shapes = E.shapes || []; const baseLeaf = view.baseLeaf || 0;
  const shapeOf = (id) => { const m = /^e(\d+)$/.exec(id || ''); if (!m) return null; const j = Number(m[1]) - baseLeaf; return j >= 0 && j < shapes.length ? shapes[j] : null; }; // 내가 그린 도형이면 그 정보
  const byId = useMemo(() => ({ ...Object.fromEntries(els.map((e) => [e.id, e])), ...Object.fromEntries((E.adds || []).map((a) => [a.id, { id: a.id, kind: 'e', tag: 'image', attrs: {}, parent: null, add: true }])) }), [els, E.adds]);
  const [sel, setSel] = useState('');
  const [multi, setMulti] = useState([]);       // 여러 개를 골랐을 때의 번호들(둘 이상일 때만 의미가 있다)
  const [marq, setMarq] = useState(null);        // 빈 곳을 끌어 상자로 고르는 중({ x0, y0, x1, y1 } 화면 좌표)
  const [guides, setGuides] = useState([]);      // 끄는 동안 붙은 안내선({ dim:'x'|'y', v: 화면 좌표 })
  const [note, setNote] = useState('');          // 복사·붙여넣기 같은 짧은 알림
  const [node, setNode] = useState(-1);          // 고른 경로 마디(segs 번호)
  const [rotInfo, setRotInfo] = useState(null);  // 회전 손잡이를 끄는 동안 보여 줄 각도 { deg, multi }
  const [scaleInfo, setScaleInfo] = useState(null); // 전체 크기 조절 손잡이를 끄는 동안 보여 줄 배율 { kx, ky }
  const [ov, setOv] = useState(null);            // 화면 위 손잡이·선택 상자(화소 좌표)
  const [ed, setEd] = useState(null);            // 글자 고치는 중
  const [cropFor, setCropFor] = useState(null); const [imgBusy, setImgBusy] = useState(false); const [imgNote, setImgNote] = useState(''); const imgFileRef = useRef(null); // 넣은 이미지 자르기 창·바꾸기
  const [ctxOk, setCtxOk] = useState(true);         // 화살촉이 선 색을 따라가는 context-stroke 를 브라우저가 지원하는가
  const justAdded = useRef('');                  // 방금 추가한 글자(내용 칸에 바로 커서를 둔다)
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const hostRef = useRef(null); const bodyRef = useRef(null); const drag = useRef(null); const keyRef = useRef(null);
  const Eref = useRef(E); Eref.current = E;
  const selIds = multi.length > 1 ? multi : sel ? [sel] : [];
  const flash = (t) => { setNote(t); setTimeout(() => setNote((n) => (n === t ? '' : n)), 2600); };
  const sigRef = useRef(view.sig); sigRef.current = view.sig;
  const dashBaseRef = useRef({}); // 사용자 지정 파선의 처음 모습(도형 번호 → 숫자들). 간격 슬라이더의 100% 기준
  const dashBaseOf = (id, attr) => { // 파선의 간격을 배율로 바꿀 때 기준이 되는 숫자들(실선이면 null)
    const kind = dashKind(attr); if (kind === 'solid') return null;
    if (kind !== 'custom') return dashNumsEven(DASH_PRESETS[kind].dash);
    const n = dashNumsEven(attr); if (!n.length) return null;
    const b = dashBaseRef.current[id]; if (dashSameParts(b, n)) return b; dashBaseRef.current[id] = n; return n;
  };

  useEffect(() => { // 한 번만 확인: 지원하지 않으면 화살촉에 색을 직접 지정한다
    let off = false;
    (async () => {
      try {
        const t = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><defs><marker id="m" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10"><rect width="10" height="10" fill="context-stroke"/></marker></defs><path d="M0 5L10 5" stroke="#f00" stroke-width="10" marker-end="url(#m)"/></svg>';
        const im = new Image(); const url = URL.createObjectURL(new Blob([t], { type: 'image/svg+xml' }));
        await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = url; });
        const c = document.createElement('canvas'); c.width = 20; c.height = 10; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(14, 5, 1, 1).data; if (!off) setCtxOk(d[0] > 200 && d[1] < 80);
      } catch { /* 확인 못 하면 기본값(지원)을 쓴다 */ }
    })();
    return () => { off = true; };
  }, []);
  const elOf = (id) => bodyRef.current?.querySelector(`[data-eid="${id}"]:not([data-hit])`);
  const svgEl = () => bodyRef.current?.querySelector('svg');
  const toClient = (el, x, y) => { const m = el.getScreenCTM(); if (!m) return [0, 0]; const p = new DOMPoint(x, y).matrixTransform(m); return [p.x, p.y]; };
  // 끌기 시작 때 '화면 → 그 요소 좌표' 변환을 한 번만 구해 두고 끌기 내내 그것을 쓴다. 수정할 때마다 그림이 다시 그려져 처음 잡은 요소가 화면에서 떨어져 나가므로,
  // 떨어진 요소에서 매번 다시 구하면 값이 어긋나 요소가 엉뚱한 곳으로 튀었다.
  const invOf = (m) => { try { return m ? m.inverse() : null; } catch { return null; } };
  const through = (inv, cx, cy) => { const p = new DOMPoint(cx, cy).matrixTransform(inv); return [p.x, p.y]; };
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
    const hr = host.getBoundingClientRect(); const rel = ([x, y]) => [x - hr.left, y - hr.top];
    if (multi.length > 1) { // 여러 개: 각각의 상자 + 전체를 감싸는 상자(손잡이는 없다)
      const boxes = multi.map((id) => elOf(id)).filter(Boolean).map((n) => { const r = n.getBoundingClientRect(); return [r.left - hr.left, r.top - hr.top, r.width, r.height]; });
      if (!boxes.length) { setOv(null); return; }
      const x0 = Math.min(...boxes.map((b) => b[0])); const y0 = Math.min(...boxes.map((b) => b[1])); const x1 = Math.max(...boxes.map((b) => b[0] + b[2])); const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
      setOv({ box: [x0, y0, x1 - x0, y1 - y0], multi: boxes, pts: [], ctrls: [], lines: [], scaleH: true, w: hr.width, h: hr.height, rotC: [(x0 + x1) / 2, (y0 + y1) / 2], rot: [(x0 + x1) / 2, y0 - 30] }); return;
    }
    const el = sel ? elOf(sel) : null; if (!el) { setOv(null); return; }
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
    } else if (tag === 'image') {
      const x = num(el.getAttribute('x')); const y = num(el.getAttribute('y')); const w = num(el.getAttribute('width')); const h = num(el.getAttribute('height'));
      [['r:nw', x, y], ['r:ne', x + w, y], ['r:se', x + w, y + h], ['r:sw', x, y + h]].forEach(([k, px, py]) => o.pts.push({ h: k, p: rel(toClient(el, px, py)), sq: true }));
    } else if (tag === 'rect') {
      const x = num(el.getAttribute('x')); const y = num(el.getAttribute('y')); const w = num(el.getAttribute('width')); const h = num(el.getAttribute('height'));
      [['r:nw', x, y], ['r:ne', x + w, y], ['r:se', x + w, y + h], ['r:sw', x, y + h]].forEach(([k, px, py]) => o.pts.push({ h: k, p: rel(toClient(el, px, py)), sq: true }));
    } else if (tag === 'circle') {
      o.pts.push({ h: 'o:r', p: rel(toClient(el, num(el.getAttribute('cx')) + num(el.getAttribute('r')), num(el.getAttribute('cy')))) });
    } else if (tag === 'ellipse') {
      o.pts.push({ h: 'o:rx', p: rel(toClient(el, num(el.getAttribute('cx')) + num(el.getAttribute('rx')), num(el.getAttribute('cy')))) }, { h: 'o:ry', p: rel(toClient(el, num(el.getAttribute('cx')), num(el.getAttribute('cy')) + num(el.getAttribute('ry')))) });
    }
    const coAdd = (E.adds || []).find((a) => a.id === sel && (a.kind === 'callout' || a.kind === 'dim'));
    if (coAdd) o.pts.push({ h: 'tip:0', p: rel(toClient(el, coAdd.tx, coAdd.ty)) }); // 리더선 라벨: 끝점(가리키는 곳) 손잡이 · 치수선: 둘째 끝점
    if (coAdd && coAdd.kind === 'dim') o.pts.push({ h: 'dp:0', p: rel(toClient(el, coAdd.x, coAdd.y)) }); // 치수선: 첫 끝점
    if (!isBg(sel) && !(E.adds || []).some((a) => a.id === sel && (a.kind === 'badge' || a.kind === 'callout' || a.kind === 'dim' || a.kind === 'icon' || a.kind === 'table' || a.kind === 'scale'))) { try { const bb = el.getBBox(); const na = (E.adds || []).find((a) => a.id === sel && a.kind === 'north'); /* 방위표는 원의 가운데 둘레로 돈다 */ const cc = na ? rel(toClient(el, na.x + na.w / 2, na.y + na.h / 2)) : rel(toClient(el, bb.x + bb.width / 2, bb.y + bb.height / 2)); o.rotC = cc; o.rot = [cc[0], o.box[1] - 30]; } catch { /* 숨긴 요소 등은 회전 손잡이 없이 */ } } // 돌리는 중심 = 도형 가운데(돌아가 있어도 보이는 가운데)
    setOv(o);
  }, [view.svg, sel, multi, node, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = hostRef.current; if (!h || typeof ResizeObserver === 'undefined') return undefined; const ro = new ResizeObserver(() => setTick((n) => n + 1)); ro.observe(h); return () => ro.disconnect(); }, []);
  useEffect(() => { if (sel && !byId[sel]) { setSel(''); setNode(-1); } }, [byId, sel]);
  useEffect(() => { setMulti((m) => { const n = m.filter((id) => byId[id]); return n.length === m.length ? m : (n.length > 1 ? n : []); }); }, [byId]);
  // 고칠 수 있는 글자에 표시를 단다
  useEffect(() => {
    const b = bodyRef.current; if (!b) return;
    const ts = [...b.querySelectorAll('text')];
    ts.forEach((t) => { const k = normText(t.textContent); const idx = ts.filter((x) => normText(x.textContent) === k).indexOf(t); if (pickByText(fields, t.textContent, idx)) t.setAttribute('data-editable', '1'); });
  }, [view.svg, fields]);

  // ── 누르기·끌기 ──
  // 여러 개를 고른 상태에서 그 선택 상자 안쪽을 누르면 전체 이동의 시작(빈 곳을 눌러도 선택이 풀리지 않고 통째로 끌린다)
  const insideBox = (e) => {
    if (!(multi.length > 1) || !ov?.box || !hostRef.current) return false;
    const hr = hostRef.current.getBoundingClientRect(); const x = e.clientX - hr.left; const y = e.clientY - hr.top; const [bx, by, bw, bh] = ov.box;
    return x >= bx - 3 && x <= bx + bw + 3 && y >= by - 3 && y <= by + bh + 3;
  };
  const startMoveMulti = (e, fromBlank, bgId = '') => {
    const items = multi.map((mid) => { const el2 = elOf(mid); const inv2 = invOf(el2 && el2.parentNode && el2.parentNode.getScreenCTM ? el2.parentNode.getScreenCTM() : null); const ad = (Eref.current.adds || []).find((a) => a.id === mid); return inv2 && !isBg(mid) ? { id: mid, inv: inv2, start: through(inv2, e.clientX, e.clientY), t0: editTranslate(Eref.current, mid), add0: ad ? { ...ad } : null } : null; }).filter(Boolean);
    if (!items.length) return;
    drag.current = { kind: 'moveMulti', items, cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, snap: buildSnap(items.map((i) => i.id)), fromBlank, bgId };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const onDown = (e) => {
    if (e.button !== 0 || disabled || ed) return;
    const h = e.target.closest?.('[data-h]');
    if (h) { startHandle(e, h.getAttribute('data-h')); return; }
    const t = e.target.closest?.('[data-eid]');
    if (!t) { if (insideBox(e) && !(e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); startMoveMulti(e, true, ''); return; } startMarquee(e, ''); return; }
    e.preventDefault();
    let id = t.getAttribute('data-eid');
    if (e.altKey && byId[id]?.parent) id = byId[id].parent; // Alt+클릭: 속한 묶음을 고른다
    if (isBg(id)) { if (insideBox(e) && !(e.shiftKey || e.ctrlKey || e.metaKey)) { startMoveMulti(e, true, id); return; } startMarquee(e, id); return; }  // 배경을 누르면: 그냥 놓으면 배경 선택, 끌면 상자로 여러 개 고르기(여러 개를 고른 상자 안쪽이면 전체 이동)
    if (e.shiftKey || e.ctrlKey || e.metaKey) { // Shift·Ctrl+클릭: 선택에 더하거나 뺀다
      const cur = multi.length > 1 ? multi : sel ? [sel] : []; const nx = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      setMulti(nx.length > 1 ? nx : []); setSel(nx[nx.length - 1] || ''); setNode(-1); return;
    }
    if (multi.length > 1 && (multi.includes(id) || insideBox(e))) { startMoveMulti(e, false); return; } // 고른 것 중 하나(또는 선택 상자 안쪽)를 잡으면 모두 함께 옮긴다
    setMulti([]); setSel(id); setNode(-1);
    if (isBg(id)) return;
    const el = elOf(id); if (!el) return;
    const inv = invOf(el.parentNode && el.parentNode.getScreenCTM ? el.parentNode.getScreenCTM() : null); if (!inv) return;
    const start = through(inv, e.clientX, e.clientY);
    const ad = (Eref.current.adds || []).find((a) => a.id === id); // 내 이미지는 자리(x, y)를 직접 바꾼다
    drag.current = { kind: ad ? 'moveadd' : 'move', id, start, inv, t0: editTranslate(Eref.current, id), cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, add0: ad ? { ...ad } : null, snap: buildSnap([id]) };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const boxOf = (id) => { const n = elOf(id); if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const buildSnap = (ids) => { // 끌고 있는 것의 상자와, 거기에 붙을 수 있는 가로·세로 위치들(다른 요소의 변·가운데, 그림 가운데)
    const ex = new Set(); ids.forEach((id) => { ex.add(id); if (byId[id] && byId[id].kind === 'g') kids(id).forEach((k) => ex.add(k.id)); });
    const bx = ids.map(boxOf).filter(Boolean); const root = svgEl(); if (!bx.length || !root) return null;
    const box = { l: Math.min(...bx.map((b) => b.l)), t: Math.min(...bx.map((b) => b.t)), r: Math.max(...bx.map((b) => b.r)), b: Math.max(...bx.map((b) => b.b)) };
    const sr = root.getBoundingClientRect(); const xs = [sr.left, (sr.left + sr.right) / 2, sr.right]; const ys = [sr.top, (sr.top + sr.bottom) / 2, sr.bottom];
    bodyRef.current.querySelectorAll('[data-eid]:not([data-hit])').forEach((n) => {
      const id = n.getAttribute('data-eid'); const info = byId[id]; if (!info || info.kind === 'g' || ex.has(id) || isBg(id) || n.getAttribute('display') === 'none') return;
      const r = n.getBoundingClientRect(); if (r.width < 1 && r.height < 1) return; if (r.width > sr.width * 0.85 && r.height > sr.height * 0.85) return;
      xs.push(r.left, (r.left + r.right) / 2, r.right); ys.push(r.top, (r.top + r.bottom) / 2, r.bottom);
    });
    return { box, xs, ys };
  };
  // 끌기: 화면 이동량(Shift 는 수평·수직 고정, Alt 가 아니면 다른 요소의 변·가운데·그림 가운데에 6px 안쪽으로 가까워지면 붙고 안내선을 그린다)
  const clientDelta = (d, e) => {
    let cdx = e.clientX - d.cx; let cdy = e.clientY - d.cy;
    const lockY = e.shiftKey && Math.abs(cdx) > Math.abs(cdy); const lockX = e.shiftKey && !lockY; if (lockY) cdy = 0; if (lockX) cdx = 0;
    const gl = [];
    if (d.snap && !e.altKey) {
      const T = 5; const m = d.snap.box; let bx = null; let by = null;
      if (!lockX) [m.l + cdx, (m.l + m.r) / 2 + cdx, m.r + cdx].forEach((x) => d.snap.xs.forEach((t) => { const df = t - x; if (Math.abs(df) <= T && (!bx || Math.abs(df) < Math.abs(bx.df))) bx = { df, t }; }));
      if (!lockY) [m.t + cdy, (m.t + m.b) / 2 + cdy, m.b + cdy].forEach((y) => d.snap.ys.forEach((t) => { const df = t - y; if (Math.abs(df) <= T && (!by || Math.abs(df) < Math.abs(by.df))) by = { df, t }; }));
      if (bx) { cdx += bx.df; gl.push({ dim: 'x', v: bx.t }); }
      if (by) { cdy += by.df; gl.push({ dim: 'y', v: by.t }); }
    }
    setGuides((g) => (g.length === gl.length && g.every((q, i) => q.dim === gl[i].dim && Math.abs(q.v - gl[i].v) < 0.5) ? g : gl));
    return [cdx, cdy];
  };
  const startMarquee = (e, bgId) => {
    drag.current = { kind: 'marquee', x0: e.clientX, y0: e.clientY, bgId, add: e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const startRotate = (e) => { // 회전 손잡이: 고른 것(들)의 가운데(여러 개면 묶음의 가운데)를 중심으로 마우스가 돈 만큼 돌린다
    const ids = (multi.length > 1 ? multi : sel ? [sel] : []).filter((i) => !isBg(i)); if (!ids.length || !ov?.rotC || !hostRef.current) return;
    const hr = hostRef.current.getBoundingClientRect(); const piv = [hr.left + ov.rotC[0], hr.top + ov.rotC[1]];
    const items = ids.map((id) => {
      const n = elOf(id); if (!n) return null; const ad = (Eref.current.adds || []).find((a) => a.id === id);
      const inv = invOf(n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null); if (!inv) return null;
      let geom = null; if (!ad) { let bb = null; try { bb = n.getBBox(); } catch { return null; } geom = { bbox: [bb.x, bb.y, bb.width, bb.height], t0: byId[id]?.attrs?.transform || '' }; }
      return { id, add: !!ad, a0: ad ? (ad.rot || 0) : (Eref.current.ops[id]?.r || 0), geom, inv };
    }).filter(Boolean);
    if (!items.length) return;
    drag.current = { kind: 'rotate', items, piv, multi: items.length > 1, ang0: Math.atan2(e.clientY - piv[1], e.clientX - piv[0]), cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  // 전체 크기 조절: 고른 것(들)을 기준점 둘레로 같은 비율로 키우거나 줄인다. 선 굵기·글자·화살촉은 transform 으로, 넣은 것(이미지·표·리더선 등)은 크기 값으로 함께 바뀐다.
  // piv = 기준점(화면 좌표). 요소마다 부모 좌표의 기준점을 한 번만 구해 둔다(끄는 동안 그림이 다시 그려져도 어긋나지 않게)
  const scaleItems = (ids, piv) => ids.map((id) => {
    const n = elOf(id); if (!n) return null; const ad = (Eref.current.adds || []).find((a) => a.id === id);
    const inv = invOf(n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null); if (!inv) return null;
    const geom = ad ? null : geomOf(id); if (!ad && !geom) return null;
    return { id, add0: ad ? { ...ad } : null, geom, about: through(inv, piv[0], piv[1]), text: !ad && byId[id]?.tag === 'text' };
  }).filter(Boolean);
  const applyScale = (base, items, kx, ky) => {
    let next = base; const km = Math.min(kx, ky); const sig = sigRef.current;
    items.forEach((it) => { const k = it.text ? [km, km] : [kx, ky]; next = it.add0 ? editUpdateAdd(next, it.id, addScalePatch(it.add0, k, it.about)) : editScale(next, it.id, k, it.about, it.geom, sig); }); // 글자는 가로·세로를 따로 늘이지 않고 작은 쪽 배율로
    return next;
  };
  const startScale = (e, corner) => {
    const ids = selIds.filter((i) => !isBg(i)); if (ids.length < 2 || !ov?.box || !hostRef.current) return;
    const hr = hostRef.current.getBoundingClientRect(); const [bx, by, bw, bh] = ov.box; const x0 = hr.left + bx; const y0 = hr.top + by;
    const east = corner.includes('e'); const south = corner.includes('s');
    const piv = [east ? x0 : x0 + bw, south ? y0 : y0 + bh]; const grab = [east ? x0 + bw + 3 : x0 - 3, south ? y0 + bh + 3 : y0 - 3]; // 반대쪽 모서리는 고정, 잡은 모서리(손잡이 자리 = 점선 상자 모서리)를 끈다 — 처음엔 배율 100% 에서 출발
    if (Math.abs(grab[0] - piv[0]) < 4 || Math.abs(grab[1] - piv[1]) < 4) return;
    const items = scaleItems(ids, piv); if (!items.length) return;
    drag.current = { kind: 'scaleMulti', items, piv, grab, cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const scaleSelBy = (k) => { // 단추: 고른 것 전체를 가운데 둘레로 k 배
    const ids = selIds.filter((i) => !isBg(i)); const bs = ids.map(boxOf).filter(Boolean); if (!ids.length || !bs.length) return;
    const piv = [(Math.min(...bs.map((b) => b.l)) + Math.max(...bs.map((b) => b.r))) / 2, (Math.min(...bs.map((b) => b.t)) + Math.max(...bs.map((b) => b.b))) / 2];
    const items = scaleItems(ids, piv); if (!items.length) return;
    commit(applyScale(Eref.current, items, k, k), `scalebtn:${Date.now()}`);
  };
  const startHandle = (e, h) => {
    e.preventDefault(); e.stopPropagation();
    if (h === 'rot') { startRotate(e); return; }
    if (h.startsWith('ms:')) { startScale(e, h.slice(3)); return; }
    const el = elOf(sel); if (!el) return;
    const [kind, arg] = h.split(':'); const tag = el.tagName.toLowerCase();
    const d = { kind, arg, id: sel, el, tag, cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, key: `${sel}:${kind}` };
    if (tag === 'image') { const a0 = (Eref.current.adds || []).find((a) => a.id === sel); if (!a0) return; d.kind = 'imgsize'; d.add0 = a0; }
    if (kind === 'n') setNode(Number(arg));
    if (tag === 'path') d.segs = parsePath(el.getAttribute('d'));
    if (tag === 'polygon' || tag === 'polyline') d.pts = parsePoints(el.getAttribute('points'));
    if (tag === 'rect') d.rect = ['x', 'y', 'width', 'height'].map((k) => num(el.getAttribute(k)));
    d.inv = invOf(el.getScreenCTM()); if (!d.inv) return;
    d.start = through(d.inv, e.clientX, e.clientY);
    if (tag === 'circle' || tag === 'ellipse') d.c = [num(el.getAttribute('cx')), num(el.getAttribute('cy'))];
    drag.current = d;
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (d.kind === 'marquee') { if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return; d.moved = true; setMarq({ x0: d.x0, y0: d.y0, x1: e.clientX, y1: e.clientY }); return; }
    if (!d.moved) { if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return; d.moved = true; setDragging(true); }
    const sig = sigRef.current;
    if (d.kind === 'rotate') { // Shift = 15° 단위, Alt = 붙지 않음, 한 개일 때 그냥 끌면 45° 배수 근처(3° 안)에서 살짝 붙는다. 여러 개는 변화량만 맞춘다
      const da = ((Math.atan2(e.clientY - d.piv[1], e.clientX - d.piv[0]) - d.ang0) * 180) / Math.PI; const one = !d.multi;
      const snapped = snapDeg(one ? d.items[0].a0 + da : da, { step: e.shiftKey ? 15 : 0, soft: one && !e.altKey && !e.shiftKey });
      const delta = one ? snapped - d.items[0].a0 : snapped; let next = d.base;
      d.items.forEach((it) => { const about = d.multi ? through(it.inv, d.piv[0], d.piv[1]) : null; const ang = it.a0 + delta; next = it.add ? editRotateAdd(next, it.id, ang, about) : editRotate(next, it.id, ang, it.geom, sig, about); });
      setRotInfo({ deg: snapped, multi: d.multi }); commit(next, 'rot'); return;
    }
    if (d.kind === 'scaleMulti') { // Shift 가 아니면 가로·세로 같은 비율(대각선 방향으로 끈 양), Shift 는 가로·세로 따로
      const vx = d.grab[0] - d.piv[0]; const vy = d.grab[1] - d.piv[1]; const mx = e.clientX - d.piv[0]; const my = e.clientY - d.piv[1];
      const cl = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
      let kx; let ky;
      if (e.shiftKey) { kx = cl(mx / vx); ky = cl(my / vy); } else { kx = ky = cl((mx * vx + my * vy) / (vx * vx + vy * vy)); }
      setScaleInfo({ kx, ky }); commit(applyScale(d.base, d.items, kx, ky), 'scale'); return;
    }
    if (d.kind === 'moveMulti') {
      const [cdx, cdy] = clientDelta(d, e); let next = d.base;
      d.items.forEach((it) => {
        const p = through(it.inv, d.cx + cdx, d.cy + cdy); const dx = p[0] - it.start[0]; const dy = p[1] - it.start[1];
        next = it.add0 ? editUpdateAdd(next, it.id, addShiftPatch(it.add0, dx, dy)) : editMoveTo(next, it.id, it.t0[0] + dx, it.t0[1] + dy, sig);
      });
      commit(next, 'dragmulti'); return;
    }
    if (d.kind === 'moveadd') {
      const [cdx, cdy] = clientDelta(d, e); const p = through(d.inv, d.cx + cdx, d.cy + cdy); const dx = p[0] - d.start[0]; const dy = p[1] - d.start[1];
      commit(editUpdateAdd(d.base, d.id, addShiftPatch(d.add0, dx, dy)), `drag:${d.id}`); return;
    }
    if (d.kind === 'imgsize') {
      const p = through(d.inv, e.clientX, e.clientY); const a0 = d.add0; const R = [a0.x, a0.y, a0.x + a0.w, a0.y + a0.h];
      const fx = d.arg.includes('w') ? R[2] : R[0]; const fy = d.arg.includes('n') ? R[3] : R[1]; // 반대쪽 모서리는 고정
      let w = Math.max(8, Math.abs(p[0] - fx)); let h = Math.max(8, Math.abs(p[1] - fy));
      if (!e.shiftKey && a0.ar > 0) h = w / a0.ar;
      const x = d.arg.includes('w') ? fx - w : fx; const y = d.arg.includes('n') ? fy - h : fy;
      const kr = a0.rot ? rotRectKeep(R, [x, y, x + w, y + h], a0.rot) : [x, y, x + w, y + h]; // 돌아간 이미지는 반대쪽 모서리가 화면에서 제자리에 남게 보정
      commit(editUpdateAdd(d.base, d.id, { x: r2(kr[0]), y: r2(kr[1]), w: r2(w), h: r2(h) }), d.key); return;
    }
    if (d.kind === 'move') {
      const [cdx, cdy] = clientDelta(d, e); const p = through(d.inv, d.cx + cdx, d.cy + cdy);
      const dx = p[0] - d.start[0]; const dy = p[1] - d.start[1];
      commit(editMoveTo(d.base, d.id, d.t0[0] + dx, d.t0[1] + dy, sig), `drag:${d.id}`); return;
    }
    const p = through(d.inv, e.clientX, e.clientY); const dv = [p[0] - d.start[0], p[1] - d.start[1]];
    if (d.kind === 'tip' || d.kind === 'dp') { // 리더선 라벨의 끝점 · 치수선의 두 끝점(Shift: 다른 끝점과 가로 또는 세로로 맞춤)
      const a0 = (d.base.adds || []).find((a) => a.id === d.id); let q = p;
      if (a0 && a0.kind === 'dim' && e.shiftKey) { const o = d.kind === 'tip' ? [a0.x, a0.y] : [a0.tx, a0.ty]; q = Math.abs(p[0] - o[0]) >= Math.abs(p[1] - o[1]) ? [p[0], o[1]] : [o[0], p[1]]; }
      commit(editUpdateAdd(d.base, d.id, d.kind === 'tip' ? { tx: r2(q[0]), ty: r2(q[1]) } : { x: r2(q[0]), y: r2(q[1]) }), d.key); return;
    }
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
      const [cx, cy] = d.c;
      if (d.arg === 'r') set = { r: String(r2(Math.max(0.5, Math.hypot(p[0] - cx, p[1] - cy)))) };
      else if (d.arg === 'rx') set = { rx: String(r2(Math.max(0.5, Math.abs(p[0] - cx)))) };
      else set = { ry: String(r2(Math.max(0.5, Math.abs(p[1] - cy)))) };
    }
    if (set) commit(editSet(d.base, d.id, set, sig), d.key);
  };
  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove); const d = drag.current; drag.current = null; setDragging(false); setGuides([]); setRotInfo(null); setScaleInfo(null); setTick((n) => n + 1);
    if (d && d.kind === 'moveMulti' && d.fromBlank && !d.moved) { setMulti([]); setSel(''); setNode(-1); return; } // 선택 상자 안의 빈 곳을 그냥 눌렀다 뗌: 선택 해제
    if (d && d.kind === 'marquee') {
      setMarq(null);
      if (!d.moved) { if (!d.add) { if (multi.length > 1) { setMulti([]); setSel(''); setNode(-1); } else { selectAll(); } } return; } // 끌지 않고 놓음: 배경(또는 빈 곳)을 누르면 그림 전체가 선택돼 테두리와 모서리 손잡이가 나온다(이미 전체면 선택 해제)
      const x0 = Math.min(d.x0, e.clientX); const x1 = Math.max(d.x0, e.clientX); const y0 = Math.min(d.y0, e.clientY); const y1 = Math.max(d.y0, e.clientY); const ids = [];
      bodyRef.current?.querySelectorAll('[data-eid]:not([data-hit])').forEach((n) => { // 상자 안에 통째로 들어온 도형·글자·이미지(묶음·배경·숨긴 것은 제외)
        const id = n.getAttribute('data-eid'); const info = byId[id]; if (!info || info.kind === 'g' || isBg(id) || n.getAttribute('display') === 'none') return;
        const r = n.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return;
        if (r.left >= x0 - 2 && r.right <= x1 + 2 && r.top >= y0 - 2 && r.bottom <= y1 + 2) ids.push(id);
      });
      const all = d.add ? [...new Set([...(multi.length > 1 ? multi : sel ? [sel] : []), ...ids])] : ids;
      setMulti(all.length > 1 ? all : []); setSel(all[all.length - 1] || ''); setNode(-1);
    }
  };
  useEffect(() => () => window.removeEventListener('pointermove', onMove), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 글자 더블클릭 고치기 ──
  const onDbl = (e) => {
    if (disabled || ed) return;
    const cellEl = e.target.closest?.('[data-cell]'); // 개요표의 셀(빈 칸 포함)·제목
    if (cellEl) {
      const gC = cellEl.closest('[data-eid]'); const tb = gC ? (Eref.current.adds || []).find((a) => a.id === gC.getAttribute('data-eid') && a.kind === 'table') : null;
      if (tb) { const [r, c] = cellEl.getAttribute('data-cell').split(',').map(Number); e.preventDefault(); e.stopPropagation(); setEd({ field: { value: r < 0 ? tb.table.title : (tb.table.rows[r]?.[c] ?? '') }, target: cellEl, addId: tb.id, addCell: [r, c] }); return; }
    }
    const b = bodyRef.current; const t = textAtPoint(b, e.clientX, e.clientY); if (!t) return;
    const gE = t.closest?.('[data-eid]'); const bd = gE ? (Eref.current.adds || []).find((a) => a.id === gE.getAttribute('data-eid') && a.kind === 'badge') : null;
    if (bd) { e.preventDefault(); e.stopPropagation(); setEd({ field: { value: bd.text }, target: t, addId: bd.id }); return; } // 번호 마커의 숫자
    const dm = gE ? (Eref.current.adds || []).find((a) => a.id === gE.getAttribute('data-eid') && a.kind === 'dim') : null;
    if (dm) { e.preventDefault(); e.stopPropagation(); setEd({ field: { value: dm.text }, target: t, addId: dm.id, addKey: 'text' }); return; } // 치수선의 치수 글자
    const co = gE ? (Eref.current.adds || []).find((a) => a.id === gE.getAttribute('data-eid') && a.kind === 'callout') : null;
    if (co) { e.preventDefault(); e.stopPropagation(); const isDesc = normText(t.textContent) !== normText(co.title); setEd({ field: { value: isDesc ? co.desc : co.title, multiline: isDesc }, target: t, addId: co.id, addKey: isDesc ? 'desc' : 'title' }); return; } // 리더선 라벨의 제목·설명
    const mine = shapeOf(t.getAttribute('data-eid')); // 내가 그린 글자: 그 자리에서 고친다(그림의 글자 목록과 상관없음)
    if (mine && mine.kind === 'text') { e.preventDefault(); e.stopPropagation(); setEd({ field: { value: mine.text }, target: t, shapeId: mine.id }); return; }
    if (mine && mine.kind === 'raw') { e.preventDefault(); e.stopPropagation(); setEd({ field: { value: t.textContent }, target: t, shapeId: mine.id }); return; } // 복사해 온 글자도 그 자리에서
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
  const dashBase = el && sel ? dashBaseOf(sel, el.getAttribute('stroke-dasharray')) : null; // 파선 간격의 기준(선 종류의 기본 간격, 사용자 지정은 처음 모습)
  const dashGap = dashBase ? dashGapFactor(dashNumsEven(el.getAttribute('stroke-dasharray')), dashBase) : 1; // 파선 간격 배율(기준 = 1)
  const op = el ? num(el.getAttribute('opacity'), 1) : 1;
  const fs = el && tag === 'text' ? num(cs?.fontSize, 14) : 0;
  const taOf = el && tag === 'text' ? (cs?.textAnchor || 'start') : '';                      // 글자 정렬: start | middle | end
  const lsOf = el && tag === 'text' ? num(el.getAttribute('letter-spacing'), 0) : 0;          // 자간(그림 단위)
  const lineN = el && tag === 'text' ? [...el.querySelectorAll('tspan')].filter((t) => t.hasAttribute('dy') || t.hasAttribute('y')).length : 0; // 줄 수(2 줄 이상일 때만 행간을 보인다)
  const lhOf = sel ? (E.ops[sel]?.lh || 1) : 1;
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
  const myAdd = sel ? adds.find((a) => a.id === sel) : null;
  const curAngle = sel ? (myAdd ? (myAdd.rot || 0) : (E.ops[sel]?.r || 0)) : 0;
  const rotPanel = (single) => (
    <div style={{ ...lab, gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }} data-testid="sv-rotate">
      <span style={title}>회전{single ? '' : ' (묶음의 가운데 중심으로 함께)'}</span>
      {single && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
          <label style={lab}>각도(°) — 시계 방향이 +
            <input type="number" step="1" style={input} value={r2(curAngle)} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) rotateSel(normDeg(v) - curAngle); }} data-testid="sv-rot-input" />
          </label>
          <button style={smallBtn(false)} disabled={!curAngle} onClick={() => rotateSel(-curAngle)} title="돌리기 전 모양으로 되돌립니다" data-testid="sv-rot-zero">0°</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {[['−90°', -90], ['−15°', -15], ['+15°', 15], ['+90°', 90]].map(([t, d]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => rotateSel(d)} data-testid={`sv-rot-${d}`}>{t}</button>)}
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>그림 위 <b>동그라미 손잡이</b>를 끌어도 돌아갑니다(Shift: 15° 단위 · Alt: 붙지 않음). 돌린 뒤 크기·모양을 고쳐도 가운데 둘레로 다시 돕니다.</span>
    </div>
  );
  const replaceImg = async (file) => {
    if (!file || !myAdd) return; const id = sel; setImgBusy(true); setImgNote('');
    try { const im = await readImageFile(file); commit(editReplaceImage(Eref.current, id, { href: im.url, w: im.w, h: im.h })); setImgNote(`이미지를 바꿨습니다 (${im.w}×${im.h}px · 약 ${im.kb.toLocaleString()}KB). 자리 안에 비율을 지켜 맞췄습니다.`); }
    catch (e) { setImgNote(`이미지를 바꾸지 못했습니다: ${e.message}`); } finally { setImgBusy(false); }
  };
  const applyCrop = async (crop) => { // crop: null 이면 자르기 해제(원본 전체)
    const id = cropFor?.id; const a = id ? (Eref.current.adds || []).find((q) => q.id === id) : null; if (!a) { setCropFor(null); return; }
    const orig = a.orig || a.href; setImgBusy(true); setImgNote('');
    try {
      const out = crop ? await bakeCrop(orig, crop) : { url: orig, ...(await imageSize(orig)) };
      commit(editCropImage(Eref.current, id, { crop, orig, href: out.url, w: out.w, h: out.h })); setCropFor(null);
      setImgNote(crop ? `잘라 냈습니다 (${out.w}×${out.h}px). 다시 열면 원본에서 범위를 고칠 수 있습니다.` : '자르기를 풀었습니다(원본 전체).');
    } catch (e) { setImgNote(`자르지 못했습니다: ${e.message}`); } finally { setImgBusy(false); }
  };
  const myShape = sel ? shapeOf(sel) : null;
  const addShape = (kind) => { // 그림 한가운데에 새 도형·글자·화살표를 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const sh = newShape(kind, box); if (kind === 'arrow' && !ctxOk) sh.ctx = false;
    const r = editAddShape(Eref.current, sigRef.current, sh); commit(r.edits);
    setSel(`e${baseLeaf + r.index}`); setNode(-1); if (kind === 'text') justAdded.current = r.id;
  };
  const addMarker = () => { // 번호 마커(검은 원, 다음 번호 자동)를 그림 한가운데 근처에 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = editAddBadge(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  const addSymbol = (kind) => { // 방위표·축척 막대를 그림 안에 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = (kind === 'north' ? editAddNorth : editAddScale)(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  const addTable = () => { // 개요표(예시 내용이 든 건축개요 표)를 그림 왼쪽 가운데 근처에 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = editAddTable(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  const addIcon = () => { // 아이콘 칩을 그림 한가운데 근처에 넣고 바로 고른다(아이콘은 속성에서 바꾼다)
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = editAddIcon(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  const addDim = () => { // 치수선(두 지점 사이 거리를 적는 선)을 그림 아래쪽 가운데에 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = editAddDim(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  const addCallout = () => { // 리더선 라벨(제목+설명+끝점 있는 안내선)을 그림 한가운데 근처에 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const r = editAddCallout(Eref.current, sigRef.current, { box }); commit(r.edits); setSel(r.id); setMulti([]); setNode(-1);
  };
  // ── 복사·붙여넣기·복제, 여러 개 한꺼번에 고치기 ──
  const leafIdsOf = (ids) => { const out = []; ids.forEach((id) => { const n = byId[id]; if (!n) return; if (n.kind === 'g') kids(id).forEach((k) => out.push(k.id)); else out.push(id); }); return [...new Set(out)]; };
  const rawOf = (id) => { // 지금 보이는 모양 그대로(수정·묶음 변환·물려받은 색 포함) 새 요소 조각으로 만든다. 마커·무늬 정의는 새 이름으로 함께 복사
    const el0 = elOf(id); const root = svgEl(); if (!el0 || !root || el0.getAttribute('display') === 'none') return null;
    const c = el0.cloneNode(true); c.removeAttribute('data-eid'); c.removeAttribute('data-editable');
    let m = new DOMMatrix();
    for (let n = el0; n && n.nodeName && n.nodeName.toLowerCase() !== 'svg'; n = n.parentNode) { const t = n.transform && n.transform.baseVal && n.transform.baseVal.numberOfItems ? n.transform.baseVal.consolidate().matrix : null; if (t) m = new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]).multiply(m); }
    if (m.isIdentity) c.removeAttribute('transform'); else c.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 10000) / 10000).join(' ')})`);
    const st = getComputedStyle(el0); const tg = el0.tagName.toLowerCase();
    const bake = (a, v) => { if (!c.hasAttribute(a) && v !== '' && v != null) c.setAttribute(a, v); };
    bake('fill', st.fill === 'none' ? 'none' : hexOf(st.fill)); if (tg !== 'text') { bake('stroke', st.stroke === 'none' ? 'none' : hexOf(st.stroke)); if (st.stroke !== 'none') { bake('stroke-width', String(num(st.strokeWidth, 1))); if (st.strokeDasharray && st.strokeDasharray !== 'none') bake('stroke-dasharray', st.strokeDasharray.replace(/px/g, '').replace(/,/g, ' ')); bake('stroke-linecap', st.strokeLinecap); } }
    if (st.opacity !== '1') bake('opacity', st.opacity);
    if (tg === 'text') { bake('font-family', st.fontFamily); bake('font-size', String(num(st.fontSize, 14))); bake('font-weight', st.fontWeight); bake('text-anchor', st.textAnchor); }
    const defs = []; let k = 0;
    [...c.attributes].forEach((a) => { const mm = /url\(["']?#([^"')]+)["']?\)/.exec(a.value); if (!mm) return; const def = root.querySelector(`[id="${mm[1]}"]`); if (!def) return; const nid = `cp${Date.now().toString(36)}${k++}_${mm[1]}`; const dc = def.cloneNode(true); dc.setAttribute('id', nid); defs.push(dc.outerHTML); c.setAttribute(a.name, a.value.replace(mm[1], nid)); });
    return { kind: 'raw', defs: defs.length ? `<defs>${defs.join('')}</defs>` : '', el: c.outerHTML };
  };
  const copySel = () => {
    const items = [];
    selIds.forEach((id) => { const ad = adds.find((a) => a.id === id); if (ad) { items.push({ type: 'add', a: { ...ad } }); return; } leafIdsOf([id]).forEach((lid) => { if (isBg(lid)) return; const sh = rawOf(lid); if (sh) items.push({ type: 'raw', sh }); }); });
    if (!items.length) { flash('복사할 요소를 먼저 고르세요'); return false; }
    SV_CLIP = { items }; SV_PASTE_N = 0; flash(`${items.length}개를 복사했습니다 (Ctrl+V 로 붙여넣기)`); return true;
  };
  const pasteClip = (n0) => {
    if (!SV_CLIP || !SV_CLIP.items.length) { flash('복사해 둔 요소가 없습니다'); return; }
    SV_PASTE_N += 1; const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const step = Math.max(8, (vb ? vb[2] : 1000) / 60) * (n0 || SV_PASTE_N);
    let next = Eref.current; const ids = [];
    SV_CLIP.items.forEach((it) => {
      if (it.type === 'add') { const cur = next.adds || []; let n = 1; while (cur.some((a) => a.id === `a${n}`)) n += 1; const a = { ...it.a, id: `a${n}`, ...addShiftPatch(it.a, step, step) }; next = { ...next, adds: [...cur, a] }; ids.push(a.id); }
      else { const r = editAddShape(next, sigRef.current, rawShift(it.sh, step, step)); next = r.edits; ids.push(`e${baseLeaf + r.index}`); }
    });
    next = editRenumber(next); commit(next); setMulti(ids.length > 1 ? ids : []); setSel(ids[ids.length - 1] || ''); setNode(-1); flash(`${ids.length}개를 붙여넣었습니다`);
  };
  const duplicateSel = () => { if (copySel()) pasteClip(1); };
  const selectAll = () => { const ids = []; bodyRef.current?.querySelectorAll('[data-eid]:not([data-hit])').forEach((n) => { const id = n.getAttribute('data-eid'); const info = byId[id]; if (info && info.kind !== 'g' && !isBg(id) && n.getAttribute('display') !== 'none') ids.push(id); }); setMulti(ids.length > 1 ? ids : []); setSel(ids[ids.length - 1] || ''); setNode(-1); };
  const nudgeAll = (dx, dy, key) => {
    let next = Eref.current; selIds.forEach((id) => { if (isBg(id)) return; const ad = (next.adds || []).find((a) => a.id === id); next = ad ? editUpdateAdd(next, id, addShiftPatch(ad, dx, dy)) : editMove(next, id, dx, dy, sigRef.current); });
    commit(next, key ? `multi:${key}` : '');
  };
  const moveClient = (next, id, dxc, dyc) => { // 화면에서 (dxc, dyc) 만큼 움직이게 그 요소의 좌표를 옮긴다(부모 변환·배율을 거꾸로 계산)
    if (!dxc && !dyc) return next; const n = elOf(id); if (!n) return next;
    const inv = invOf(n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null); if (!inv) return next;
    const a = through(inv, 0, 0); const b = through(inv, dxc, dyc); const dx = b[0] - a[0]; const dy = b[1] - a[1]; const ad = (next.adds || []).find((q) => q.id === id);
    return ad ? editUpdateAdd(next, id, addShiftPatch(ad, dx, dy)) : editMove(next, id, dx, dy, sigRef.current);
  };
  // 글자 정렬: text-anchor 를 바꾸면 기준점(x) 둘레로 글자가 옮겨 가므로, 글자 묶음이 화면에서 제자리에 남게 같은 양만큼 되옮긴다(돌아가거나 커진 글자도 화면 좌표로 계산)
  const TA_K = { start: 0, middle: 0.5, end: 1 };
  const anchorShift = (next, id, k) => {
    const n = elOf(id); if (!n) return next; const cur = getComputedStyle(n).textAnchor || 'start'; if (cur === k) return next;
    let out = editSet(next, id, { 'text-anchor': k }, sigRef.current);
    try { const bb = n.getBBox(); const mm = n.getScreenCTM(); if (mm) { const vx = (TA_K[k] - TA_K[cur]) * bb.width; out = moveClient(out, id, mm.a * vx, mm.b * vx); } } catch { /* 글자 상자를 못 구하면 정렬만 바꾼다 */ }
    return out;
  };
  const setTextAnchor = (k) => commit(anchorShift(Eref.current, sel, k));
  const textIds = (ids) => ids.filter((i) => byId[i]?.tag === 'text' && !isBg(i));
  const multiAnchor = (k) => { let next = Eref.current; textIds(multi).forEach((id) => { next = anchorShift(next, id, k); }); commit(next); };
  const multiSpacing = (v) => { let next = Eref.current; textIds(multi).forEach((id) => { next = editSet(next, id, { 'letter-spacing': Number(v) === 0 ? null : String(v) }, sigRef.current); }); commit(next, 'multi:ls'); };
  const geomOf = (id) => { const n = elOf(id); if (!n) return null; let bb = null; try { bb = n.getBBox(); } catch { return null; } return { bbox: [bb.x, bb.y, bb.width, bb.height], t0: byId[id]?.attrs?.transform || '' }; };
  const rotateSel = (delta) => { // 고른 것(들)을 delta° 돌린다(시계 방향 +). 여러 개면 묶음의 가운데를 중심으로 함께
    const ids = selIds.filter((i) => !isBg(i)); if (!ids.length || !delta) return;
    const bs = ids.map(boxOf).filter(Boolean);
    const about = ids.length > 1 && bs.length ? [(Math.min(...bs.map((b) => b.l)) + Math.max(...bs.map((b) => b.r))) / 2, (Math.min(...bs.map((b) => b.t)) + Math.max(...bs.map((b) => b.b))) / 2] : null;
    let next = Eref.current;
    ids.forEach((id) => {
      const n = elOf(id); if (!n) return; const inv = invOf(n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null); const ab = about && inv ? through(inv, about[0], about[1]) : null;
      const ad = (next.adds || []).find((q) => q.id === id);
      if (ad) next = editRotateAdd(next, id, (ad.rot || 0) + delta, ab);
      else { const g = geomOf(id); if (g) next = editRotate(next, id, (next.ops[id]?.r || 0) + delta, g, sigRef.current, ab); }
    });
    commit(next, ids.length === 1 ? `${ids[0]}:rot` : 'multi:rot');
  };
  const alignSel = (mode) => { // 여러 개면 서로 맞추고, 하나면 그림 틀에 맞춘다
    const items = selIds.filter((id) => !isBg(id)).map((id) => ({ id, b: boxOf(id) })).filter((x) => x.b); if (!items.length) return;
    const root = svgEl(); const sr = root.getBoundingClientRect();
    const ref = items.length > 1 ? { l: Math.min(...items.map((x) => x.b.l)), t: Math.min(...items.map((x) => x.b.t)), r: Math.max(...items.map((x) => x.b.r)), b: Math.max(...items.map((x) => x.b.b)) } : { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom };
    let next = Eref.current;
    items.forEach(({ id, b }) => {
      let dx = 0; let dy = 0;
      if (mode === 'left') dx = ref.l - b.l; else if (mode === 'right') dx = ref.r - b.r; else if (mode === 'hcenter') dx = (ref.l + ref.r) / 2 - (b.l + b.r) / 2;
      else if (mode === 'top') dy = ref.t - b.t; else if (mode === 'bottom') dy = ref.b - b.b; else if (mode === 'vcenter') dy = (ref.t + ref.b) / 2 - (b.t + b.b) / 2;
      next = moveClient(next, id, dx, dy);
    });
    commit(next);
  };
  const distributeSel = (dir) => { // 가운데 둘은 처음·끝 사이에 같은 간격으로(셋 이상)
    const items = selIds.filter((id) => !isBg(id)).map((id) => ({ id, b: boxOf(id) })).filter((x) => x.b); if (items.length < 3) { flash('간격을 맞추려면 3개 이상 고르세요'); return; }
    const h = dir === 'h'; items.sort((p, q) => (h ? (p.b.l + p.b.r) - (q.b.l + q.b.r) : (p.b.t + p.b.b) - (q.b.t + q.b.b)));
    const lo = h ? items[0].b.l : items[0].b.t; const hi = h ? items[items.length - 1].b.r : items[items.length - 1].b.b; const sum = items.reduce((a, x) => a + (h ? x.b.w : x.b.h), 0);
    const gap = (hi - lo - sum) / (items.length - 1); let cur = lo; let next = Eref.current;
    items.forEach(({ id, b }) => { const want = cur; const have = h ? b.l : b.t; next = moveClient(next, id, h ? want - have : 0, h ? 0 : want - have); cur += (h ? b.w : b.h) + gap; });
    commit(next);
  };
  const multiSet = (propFilter, patchObj, key) => { // 고른 도형 모두에 속성을 입힌다(그 속성이 쓰이는 도형에만: 채움은 채움이 있는 것, 선은 선이 있는 것)
    let next = Eref.current;
    leafIdsOf(multi).forEach((id) => {
      if (adds.some((a) => a.id === id)) return; const n = elOf(id); if (!n) return; const tg = n.tagName.toLowerCase(); const st = getComputedStyle(n);
      if (propFilter === 'fill' && (tg === 'line' || tg === 'polyline' || st.fill === 'none')) return;
      if (propFilter === 'stroke' && (tg === 'text' || st.stroke === 'none')) return;
      const po = typeof patchObj === 'function' ? patchObj(n) : patchObj; if (!po || !Object.keys(po).length) return; // 함수면 도형마다 다른 값(예: 자기 선 종류에 맞춘 파선 간격)
      next = editSet(next, id, po, sigRef.current);
    });
    commit(next, key ? `multi:${key}` : '');
  };
  const multiNone = (prop) => { let next = Eref.current; leafIdsOf(multi).forEach((id) => { if (!adds.some((a) => a.id === id) && prop === 'stroke' && elOf(id)?.tagName.toLowerCase() === 'text') return; if (!adds.some((a) => a.id === id)) next = editSet(next, id, { [prop]: 'none' }, sigRef.current); }); commit(next); };
  const multiDelete = () => {
    let next = Eref.current; const sids = [];
    multi.forEach((id) => { if (isBg(id)) return; if (adds.some((a) => a.id === id)) { next = editRemoveAdd(next, id, sigRef.current); return; } const sh = shapeOf(id); if (sh) sids.push(sh.id); else next = editDelete(next, id, sigRef.current); });
    sids.map((sid) => shapes.findIndex((q) => q.id === sid)).sort((a, b) => b - a).forEach((i) => { next = editRemoveShape(next, shapes[i].id, baseLeaf); }); // 뒤에서부터 지워야 번호가 어긋나지 않는다
    commit(next); setMulti([]); setSel(''); setNode(-1);
  };
  const remove = () => {
    if (multi.length > 1) { multiDelete(); return; }
    if (!sel || isBg(sel)) return;
    const mineS = shapeOf(sel);
    if (myAdd) commit(editRemoveAdd(Eref.current, sel, sigRef.current));
    else if (mineS) commit(editRemoveShape(Eref.current, mineS.id, baseLeaf)); // 내가 그린 도형은 아예 지운다
    else commit(editDelete(Eref.current, sel, sigRef.current));
    setSel(''); setNode(-1);
  };

  // ── 단축키(창 전체): Delete 삭제 · 방향키 미세 이동 · Esc 해제 ──
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  keyRef.current = (e) => {
    if (shortcutsEnabled && !shortcutsEnabled()) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    if (typing || ed || cropFor) return; // 이미지 자르기 창이 열려 있는 동안은 편집 단축키(Delete 등)를 받지 않는다
    const mod = e.ctrlKey || e.metaKey; const k = (e.key || '').toLowerCase();
    if (mod) { // Ctrl+C 복사 · Ctrl+V 붙여넣기 · Ctrl+D 복제 · Ctrl+A 모두 선택 (Ctrl+Z/Y 는 부모가 처리)
      if (k === 'c' && selIds.length && !window.getSelection?.()?.toString()) { e.preventDefault(); if (copySel()) markInternalCopy(); }
      else if (k === 'v' && SV_CLIP) { schedulePaste(() => pasteClip()); } // 클립보드에 이미지가 있으면 그쪽이 이긴다(ConceptDiagram 의 paste 처리)
      else if (k === 'd' && selIds.length) { e.preventDefault(); duplicateSel(); }
      else if (k === 'a') { e.preventDefault(); selectAll(); }
      return;
    }
    if (selIds.length && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); remove(); }
    else if (selIds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const st = e.shiftKey ? 5 : 1; nudgeAll(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0, 'nudge'); }
    else if (e.key === 'Escape') { setSel(''); setMulti([]); setNode(-1); }
  };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} data-testid="svg-editor">
      <div style={{ flex: '1 1 480px', minWidth: 360 }}>
        <ZoomView testid="sv-zoom" baseWidth={maxWidth || undefined}>
        <div ref={hostRef} onPointerDown={onDown} onDoubleClick={onDbl} style={{ position: 'relative', width: '100%', border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }} data-testid="inline-svg">
          <style>{'.sv-ed [data-eid]{cursor:move}.sv-ed text[data-editable]{cursor:text}.sv-ed [data-eid]:not([data-hit]):hover{filter:drop-shadow(0 0 2px #F28C28)}.sv-ed [data-hit]{cursor:move}'}</style>
          <div ref={bodyRef} className="sv-ed" dangerouslySetInnerHTML={html} data-testid="sv-canvas" style={{ touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'default', borderRadius: 8, overflow: 'hidden' }} />
          {marq && hostRef.current && (() => { const hr = hostRef.current.getBoundingClientRect(); return (
            <svg width={hr.width} height={hr.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 4 }} data-testid="sv-marquee">
              <rect x={Math.min(marq.x0, marq.x1) - hr.left} y={Math.min(marq.y0, marq.y1) - hr.top} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill="rgba(242,140,40,0.12)" stroke="#F28C28" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>); })()}
          {guides.length > 0 && hostRef.current && (() => { const hr = hostRef.current.getBoundingClientRect(); return (
            <svg width={hr.width} height={hr.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 4 }} data-testid="sv-guides">
              {guides.map((g, i) => (g.dim === 'x'
                ? <line key={i} x1={g.v - hr.left} y1={0} x2={g.v - hr.left} y2={hr.height} stroke="#E0368A" strokeWidth="1.2" strokeDasharray="6 4" />
                : <line key={i} x1={0} y1={g.v - hr.top} x2={hr.width} y2={g.v - hr.top} stroke="#E0368A" strokeWidth="1.2" strokeDasharray="6 4" />))}
            </svg>); })()}
          {ov && (
            <svg width={ov.w} height={ov.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 3 }} data-testid="sv-overlay">
              {(ov.multi || []).map((b, i) => <rect key={i} x={b[0] - 2} y={b[1] - 2} width={b[2] + 4} height={b[3] + 4} fill="rgba(242,140,40,0.08)" stroke="#F28C28" strokeWidth="1.2" rx="2" />)}
              <rect x={ov.box[0] - 3} y={ov.box[1] - 3} width={ov.box[2] + 6} height={ov.box[3] + 6} fill="none" stroke="#F28C28" strokeWidth="1.6" strokeDasharray="6 4" rx="3" />
              {ov.ctrls.map((c) => (<g key={c.h}><line x1={c.from[0]} y1={c.from[1]} x2={c.p[0]} y2={c.p[1]} stroke="#F28C28" strokeWidth="1" strokeDasharray="3 3" />{c.from2 && <line x1={c.from2[0]} y1={c.from2[1]} x2={c.p[0]} y2={c.p[1]} stroke="#F28C28" strokeWidth="1" strokeDasharray="3 3" />}
                <circle data-h={c.h} cx={c.p[0]} cy={c.p[1]} r="5" fill="#fff" stroke="#F28C28" strokeWidth="2" style={{ pointerEvents: 'auto', cursor: 'crosshair' }} /></g>))}
              {ov.pts.map((p) => (p.sq
                ? <rect key={p.h} data-h={p.h} x={p.p[0] - 5} y={p.p[1] - 5} width="10" height="10" rx="2" fill="#fff" stroke="#F28C28" strokeWidth="2" style={{ pointerEvents: 'auto', cursor: 'nwse-resize' }} />
                : <circle key={p.h} data-h={p.h} cx={p.p[0]} cy={p.p[1]} r="6" fill={p.sel ? '#F28C28' : '#fff'} stroke="#F28C28" strokeWidth="2.2" style={{ pointerEvents: 'auto', cursor: 'move' }} />))}
              {ov.scaleH && [['nw', ov.box[0] - 3, ov.box[1] - 3, 'nwse-resize'], ['ne', ov.box[0] + ov.box[2] + 3, ov.box[1] - 3, 'nesw-resize'], ['se', ov.box[0] + ov.box[2] + 3, ov.box[1] + ov.box[3] + 3, 'nwse-resize'], ['sw', ov.box[0] - 3, ov.box[1] + ov.box[3] + 3, 'nesw-resize']].map(([k, px, py, cur]) => (
                <rect key={k} data-h={`ms:${k}`} data-testid={`sv-scale-${k}`} x={px - 6} y={py - 6} width="12" height="12" rx="2.5" fill="#F28C28" stroke="#fff" strokeWidth="2" style={{ pointerEvents: 'auto', cursor: cur }}><title>끌어서 선택한 것 전체의 크기를 조절합니다(글자·선 굵기도 함께, Shift: 가로·세로 따로)</title></rect>))}
              {ov.rot && (<g>
                <line x1={ov.rot[0]} y1={ov.rot[1] + 8} x2={ov.rot[0]} y2={ov.box[1] - 3} stroke="#F28C28" strokeWidth="1.6" />
                <circle data-h="rot" data-testid="sv-rot-handle" cx={ov.rot[0]} cy={ov.rot[1]} r="8.5" fill="#fff" stroke="#F28C28" strokeWidth="2.4" style={{ pointerEvents: 'auto', cursor: 'grab' }} />
                <path d={`M${ov.rot[0] - 3.4} ${ov.rot[1] + 0.4} a3.4 3.4 0 1 1 1.2 2.6`} fill="none" stroke="#F28C28" strokeWidth="1.8" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              </g>)}
              {scaleInfo && ov.rotC && (<g data-testid="sv-scale-label"><rect x={ov.rotC[0] - 38} y={ov.rotC[1] - 13} width="76" height="24" rx="6" fill="rgba(30,30,30,0.85)" /><text x={ov.rotC[0]} y={ov.rotC[1] + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{Math.abs(scaleInfo.kx - scaleInfo.ky) < 0.005 ? `${Math.round(scaleInfo.kx * 100)}%` : `${Math.round(scaleInfo.kx * 100)}×${Math.round(scaleInfo.ky * 100)}%`}</text></g>)}
              {rotInfo && ov.rotC && (<g data-testid="sv-rot-label"><rect x={ov.rotC[0] - 30} y={ov.rotC[1] - 13} width="60" height="24" rx="6" fill="rgba(30,30,30,0.85)" /><text x={ov.rotC[0]} y={ov.rotC[1] + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{rotInfo.multi && rotInfo.deg > 0 ? '+' : ''}{Math.round(rotInfo.deg * 10) / 10}°</text></g>)}
            </svg>
          )}
          {ed && hostRef.current && (
            <InlineInput host={hostRef.current} target={ed.target} value={ed.field.value} multiline={!!ed.field.multiline || /\n/.test(ed.field.value)}
              onCommit={(v) => { const fl = ed.field; const sid = ed.shapeId; const aid = ed.addId; setEd(null); if (v === fl.value) return; if (aid && ed.addCell) { const tb = (Eref.current.adds || []).find((a) => a.id === aid); if (tb) commit(editUpdateAdd(Eref.current, aid, { table: tableSetCell(tb.table, ed.addCell[0], ed.addCell[1], v) })); return; } if (aid && ed.addKey) { commit(editUpdateAdd(Eref.current, aid, { [ed.addKey]: ed.addKey === 'desc' ? String(v).split('\n').slice(0, 3).join('\n') : String(v) })); return; } if (aid) { commit(editRenumber(editUpdateAdd(Eref.current, aid, { text: String(v).slice(0, 3), auto: false }))); return; } if (sid) { const sh = shapes.find((q) => q.id === sid); commit(editUpdateShape(Eref.current, sid, sh && sh.kind === 'raw' ? { el: rawSetText(sh, v).el } : { text: v })); } else onTextEdit?.(fl, v); }} onCancel={() => setEd(null)} />
          )}
        </div>
        </ZoomView>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', textAlign: 'center', margin: '8px 0 0' }} data-testid="inline-hint">도형을 <b>클릭</b>하면 오른쪽에서 색·선 종류를 고치고, <b>끌어서 옮기고</b>, 주황 점(마디)을 끌어 <b>곡선·모양</b>을 고칩니다. 글자는 <b>더블클릭</b>해서 고칩니다. <b>Shift+클릭</b>이나 <b>빈 곳을 끌어 만든 상자</b>로 여러 개를 고릅니다(Ctrl+A: 모두) — <b>그림의 빈 곳을 한 번 누르면 그림 전체가 선택되어 테두리와 모서리 손잡이가 나오고</b>, 모서리를 끌면 크기가, 상자 안쪽을 끌면 위치가 바뀝니다. 끌면 다른 요소·그림 가운데에 <b>자석처럼 붙고 분홍 안내선</b>이 뜹니다(Alt: 끄기). Alt+클릭: 묶음 선택 · Shift 끌기: 수평·수직 · 방향키: 미세 이동 · Ctrl+C / V / D: 복사·붙여넣기·복제 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
      </div>

      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto', maxHeight: 'min(74vh, 780px)', overflowY: 'auto', paddingRight: 4 }} data-testid="sv-side">
        <div style={sec} data-testid="sv-add-panel">
          <span style={title}>요소 추가</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={() => addShape('text')} data-testid="sv-add-text">＋ 글자</button>
            <button style={smallBtn(false)} onClick={() => addShape('rect')} data-testid="sv-add-rect">＋ 사각형</button>
            <button style={smallBtn(false)} onClick={() => addShape('ellipse')} data-testid="sv-add-ellipse">＋ 원</button>
            <button style={smallBtn(false)} onClick={() => addShape('arrow')} data-testid="sv-add-arrow">＋ 화살표</button>
            <button style={smallBtn(false)} onClick={addMarker} data-testid="sv-add-marker" title="검은 원 안의 흰 숫자(번호는 자동으로 1, 2, 3…)">＋ 번호</button>
            <button style={smallBtn(false)} onClick={addDim} data-testid="sv-add-dim" title="두 지점 사이의 거리를 적는 선(예: 12,000 · 30m). 양 끝을 끌어 맞추고 글자는 더블클릭해서 고칩니다">＋ 치수선</button>
            <button style={smallBtn(false)} onClick={addCallout} data-testid="sv-add-callout" title="굵은 제목 + 설명 + 끝점이 있는 안내선">＋ 리더선</button>
            <button style={smallBtn(false)} onClick={addIcon} data-testid="sv-add-icon" title="색 칩 안의 아이콘(건물·설비·에너지·안전·주거·동선 등 100여 개 중에서 고름)">＋ 아이콘</button>
            <button style={smallBtn(false)} onClick={addTable} data-testid="sv-add-table" title="건축개요·면적표 같은 라벨–값 표(2~4열)">＋ 표</button>
            <button style={smallBtn(false)} onClick={() => addSymbol('north')} data-testid="sv-add-north" title="방위표(N 화살표) — 돌려서 북쪽을 맞춥니다">＋ 방위표</button>
            <button style={smallBtn(false)} onClick={() => addSymbol('scale')} data-testid="sv-add-scale" title="축척 막대(0 … 50m)">＋ 축척 막대</button>
            {onAddImageClick && <button style={smallBtn(false)} onClick={onAddImageClick} data-testid="sv-add-image">＋ 이미지</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={() => { if (copySel()) markInternalCopy(); }} data-testid="sv-copy" title="Ctrl+C">복사</button>
            <button style={smallBtn(false)} onClick={() => pasteClip()} data-testid="sv-paste" title="Ctrl+V">붙여넣기</button>
            <button style={smallBtn(false)} onClick={duplicateSel} data-testid="sv-dup" title="Ctrl+D">복제</button>
            <button style={smallBtn(false)} onClick={selectAll} data-testid="sv-select-all-btn" title="Ctrl+A — 모두 고른 뒤 주황 상자의 모서리를 끌면 그림 전체의 크기를 조절합니다(글자·선 굵기도 함께, Shift: 가로·세로 따로)">전체 선택</button>
          </div>
          {note && <span style={{ fontSize: 11, color: 'var(--warn)' }} data-testid="sv-note">{note}</span>}
        </div>
        <div style={sec}>
          <span style={title}>그림 속 도형 고치기</span>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>손으로 고친 요소 <b data-testid="sv-count">{editedCount}</b>개{adds.length ? ` · 내 이미지 ${adds.length}장` : ''}{shapes.length ? ` · 내가 그린 도형 ${shapes.length}개` : ''}{stale && <span style={{ color: 'var(--warn)' }}> · 그림 구조가 바뀌어 예전 수정은 적용되지 않았습니다</span>}</p>
          {(editedCount > 0 || adds.length > 0 || shapes.length > 0) && <button style={smallBtn(false, true)} onClick={() => { commit({ sig: view.sig, ops: {} }); setSel(''); }} data-testid="sv-reset">모든 수정·내가 넣은 것 지우고 처음으로</button>}
        </div>

        {selIds.length > 0 && (
          <div style={sec} data-testid="sv-align">
            <span style={title}>정렬{selIds.length > 1 ? '' : ' (그림 틀 기준)'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {[['left', '⇤ 왼쪽'], ['hcenter', '⇔ 가운데'], ['right', '⇥ 오른쪽'], ['top', '⤒ 위'], ['vcenter', '↕ 중간'], ['bottom', '⤓ 아래']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => alignSel(k)} data-testid={`sv-align-${k}`}>{t}</button>)}
            </div>
            {selIds.length > 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <button style={smallBtn(false)} onClick={() => distributeSel('h')} data-testid="sv-dist-h" title="가운데 요소들을 처음~끝 사이에 같은 간격으로">↔ 가로 간격 같게</button>
                <button style={smallBtn(false)} onClick={() => distributeSel('v')} data-testid="sv-dist-v" title="가운데 요소들을 처음~끝 사이에 같은 간격으로">↕ 세로 간격 같게</button>
              </div>
            )}
          </div>
        )}

        {multi.length > 1 && (
          <div style={sec} data-testid="sv-multi">
            <span style={title}>{multi.length}개 선택</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(false)} onClick={copySel}>복사</button>
              <button style={smallBtn(false)} onClick={duplicateSel} data-testid="sv-multi-dup">복제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-multi-delete">삭제</button>
              <button style={smallBtn(false)} onClick={() => { setMulti([]); setSel(''); }}>선택 해제</button>
            </div>
            <div style={lab}>채움 색(모두)<Colors value="" onChange={(c) => multiSet('fill', { fill: c }, 'fill')} none={false} onNone={() => multiNone('fill')} /></div>
            <div style={lab}>선 색(모두)<Colors value="" onChange={(c) => multiSet('stroke', { stroke: c }, 'stroke')} none={false} onNone={() => multiNone('stroke')} /></div>
            <label style={lab}>선 굵기(모두)
              <input type="range" min="0.5" max="14" step="0.5" defaultValue="2" onChange={(e) => multiSet('stroke', { 'stroke-width': e.target.value }, 'sw')} data-testid="sv-multi-width" />
            </label>
            <label style={lab}>선 종류(모두)
              <select style={input} defaultValue="" onChange={(e) => { if (e.target.value) multiSet('stroke', dashPatch(e.target.value), 'dash'); }} data-testid="sv-multi-dash">
                <option value="">바꾸지 않음</option>{Object.entries(DASH_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={lab}>파선 간격(모두)
              <input type="range" min={DASH_GAP_MIN} max={DASH_GAP_MAX} step="0.05" defaultValue="1" onChange={(e) => { const g = Number(e.target.value); multiSet('stroke', (n) => { const b = dashBaseOf(n.getAttribute('data-eid'), n.getAttribute('stroke-dasharray')); return b ? { 'stroke-dasharray': dashScaled(b, g) } : null; }, 'dashgap'); }} data-testid="sv-multi-dash-gap" />
            </label>
            <label style={lab}>투명도(모두)
              <input type="range" min="0.05" max="1" step="0.05" defaultValue="1" onChange={(e) => multiSet('', { opacity: Number(e.target.value) >= 1 ? null : e.target.value }, 'op')} data-testid="sv-multi-opacity" />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {[['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]].map(([t, dx, dy]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => nudgeAll(dx * 5, dy * 5)} data-testid={`sv-multi-nudge-${t}`}>{t} 5</button>)}
            </div>
            {(() => { const bid = els.find((x) => x.kind === 'e' && isBg(x.id))?.id; const bn = bid ? elOf(bid) : null; if (!bn || typeof getComputedStyle !== 'function') return null; return (<div style={lab} data-testid="sv-bg-color">바탕 색<Colors value={hexOf(getComputedStyle(bn).fill)} onChange={(c) => patch(bid, { fill: c }, 'bgfill')} none={false} /></div>); })()}
            {textIds(multi).length > 0 && (
              <div style={{ ...lab, gap: 6 }} data-testid="sv-multi-textfmt">
                <span>글자 정렬·자간(고른 글자 {textIds(multi).length}개)</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, t]) => <button key={k} style={{ ...smallBtn(false), flex: 1, padding: '4px 2px' }} onClick={() => multiAnchor(k)} data-testid={`sv-multi-ta-${k}`}>{t}</button>)}
                </div>
                <label style={lab}>자간(모두)
                  <input type="range" min="-2" max="20" step="0.5" defaultValue="0" onChange={(e) => multiSpacing(e.target.value)} data-testid="sv-multi-ls" />
                </label>
              </div>
            )}
            {rotPanel(false)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }} data-testid="sv-scale-panel">
              <span style={{ ...lab, flexBasis: '100%' }} title="주황 상자의 네 모서리를 끌어도 됩니다. 글자·선 굵기도 같은 비율로 바뀝니다. 모서리를 Shift 와 함께 끌면 가로·세로를 따로 바꿉니다.">크기 조절(모두, 글자·선 포함)</span>
              {[[0.8, '80%'], [0.9, '−10%'], [1.1, '+10%'], [1.25, '125%']].map(([k, t]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 8px' }} onClick={() => scaleSelBy(k)} data-testid={`sv-scale-${Math.round(k * 100)}`}>{t}</button>)}
            </div>
          </div>
        )}

        {!sel && multi.length < 2 && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림 속 <b>선·도형·원·글자</b>를 클릭하면 여기에 속성이 나옵니다. 여러 요소가 한 덩어리(칩·아이콘 등)로 묶여 있으면 <b>Alt+클릭</b> 또는 <b>↑ 묶음</b> 버튼으로 통째로 고릅니다.</p>
            <button style={smallBtn(false)} onClick={selectAll} data-testid="sv-select-all" title="Ctrl+A — 모두 고른 뒤 주황 상자의 모서리를 끌면 그림 전체의 크기를 글자·선 굵기까지 함께 조절합니다(Shift: 가로·세로 따로)">전체 선택 → 모서리를 끌어 크기 조절</button>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'badge' && (
          <div style={sec} data-testid="sv-badge-props">
            <span style={title}>선택: 번호 마커 ({sel})</span>
            <div style={lab}>모양
              <div style={{ display: 'flex', gap: 6 }}>{[['circle', '● 원'], ['square', '■ 사각']].map(([v, tt]) => <button key={v} style={{ ...smallBtn(myAdd.shape === v), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { shape: v }))} data-testid={`sv-badge-${v}`}>{tt}</button>)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
              <label style={lab}>번호 ({myAdd.auto === false ? '직접 정함' : '자동'})
                <input style={input} maxLength={3} value={myAdd.text} onChange={(e) => commit(editRenumber(editUpdateAdd(Eref.current, sel, { text: e.target.value, auto: false })), `${sel}:num`)} data-testid="sv-badge-num" />
              </label>
              <button style={smallBtn(false)} disabled={myAdd.auto !== false} onClick={() => commit(editRenumber(editUpdateAdd(Eref.current, sel, { auto: true })))} title="직접 정한 번호를 버리고 자동 번호로 되돌립니다" data-testid="sv-badge-auto">↺ 자동</button>
            </div>
            <label style={lab}>크기 {r2(myAdd.w)}
              <input type="range" min="10" max="150" step="1" value={Math.min(150, Math.max(10, myAdd.w))} onChange={(e) => { const w = Number(e.target.value); const cx = myAdd.x + myAdd.w / 2; const cy = myAdd.y + myAdd.h / 2; commit(editUpdateAdd(Eref.current, sel, { w, h: w, x: r2(cx - w / 2), y: r2(cy - w / 2) }), `${sel}:size`); }} data-testid="sv-badge-size" />
            </label>
            <div style={lab}>색(바탕)<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>숫자를 더블클릭해도 고칩니다. 마커를 지우면 뒤 번호가 자동으로 당겨집니다(직접 정한 번호는 그대로).</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-badge-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'dim' && (
          <div style={sec} data-testid="sv-dim-props">
            <span style={title}>선택: 치수선 ({sel})</span>
            <label style={lab}>치수 글자(예: 12,000 · 30m)<input style={input} value={myAdd.text} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { text: e.target.value }), `${sel}:text`)} data-testid="sv-dim-text" /></label>
            <label style={lab}>글자 크기 {r2(myAdd.size)}
              <input type="range" min="6" max="120" step="1" value={Math.min(120, Math.max(6, myAdd.size))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { size: Number(e.target.value) }), `${sel}:size`)} data-testid="sv-dim-size" />
            </label>
            <div style={lab}>색<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>양 끝의 <b>주황 점</b>을 끌어 길이와 방향을 맞춥니다(Shift: 가로·세로로 고정). 치수 글자는 <b>더블클릭</b>해서 고칩니다. 그림을 끌면 통째로 움직입니다.</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-dim-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'callout' && (
          <div style={sec} data-testid="sv-callout-props">
            <span style={title}>선택: 리더선 라벨 ({sel})</span>
            <label style={lab}>제목<input style={input} value={myAdd.title} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { title: e.target.value }), `${sel}:title`)} data-testid="sv-co-title" /></label>
            <label style={lab}>설명 (줄바꿈으로 최대 3줄)
              <textarea style={{ ...input, resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }} rows={3} value={myAdd.desc} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { desc: e.target.value }), `${sel}:desc`)} data-testid="sv-co-desc" />
            </label>
            <div style={lab}>선 종류
              <div style={{ display: 'flex', gap: 6 }}>{[['straight', '직선'], ['elbow', '꺾은선']].map(([v, tt]) => <button key={v} style={{ ...smallBtn(myAdd.line === v), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { line: v }))} data-testid={`sv-co-line-${v}`}>{tt}</button>)}</div>
            </div>
            <div style={lab}>끝 모양
              <div style={{ display: 'flex', gap: 6 }}>{[['dot', '● 점'], ['arrow', '▶ 화살표'], ['none', '없음']].map(([v, tt]) => <button key={v} style={{ ...smallBtn(myAdd.end === v), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { end: v }))} data-testid={`sv-co-end-${v}`}>{tt}</button>)}</div>
            </div>
            <label style={lab}>글자 크기 {r2(myAdd.size)}
              <input type="range" min="6" max="120" step="1" value={Math.min(120, Math.max(6, myAdd.size))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { size: Number(e.target.value) }), `${sel}:size`)} data-testid="sv-co-size" />
            </label>
            <div style={{ ...lab, gap: 6 }} data-testid="sv-co-textfmt">
              <span>글자 정렬(글 상자 안)</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, tt]) => <button key={k} style={{ ...smallBtn((myAdd.align || 'start') === k), flex: 1, padding: '4px 2px' }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { align: k === 'start' ? undefined : k }))} data-testid={`sv-co-ta-${k}`}>{tt}</button>)}
              </div>
              <label style={lab}>자간 {r2(myAdd.ls || 0)}
                <input type="range" min="-2" max="12" step="0.5" value={Math.min(12, Math.max(-2, myAdd.ls || 0))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { ls: Number(e.target.value) || undefined }), `${sel}:ls`)} data-testid="sv-co-ls" />
              </label>
              <label style={lab}>설명 행간 {Math.round((myAdd.lh || 1) * 100)}%
                <input type="range" min="0.6" max="2.5" step="0.05" value={myAdd.lh || 1} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { lh: Math.abs(Number(e.target.value) - 1) < 0.01 ? undefined : Number(e.target.value) }), `${sel}:lh`)} data-testid="sv-co-lh" />
              </label>
            </div>
            <div style={lab}>색<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>글을 끌면 끝점까지 통째로 움직입니다. <b>끝점의 동그라미 손잡이</b>를 끌어 가리킬 곳을 정하세요. 제목·설명 글자를 더블클릭해도 고칩니다(Enter 확정 · Shift+Enter 줄바꿈).</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-co-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'icon' && (
          <div style={sec} data-testid="sv-icon-props">
            <span style={title}>선택: 아이콘 칩 ({sel})</span>
            <div style={lab}>아이콘 — {ICON_LABEL[myAdd.icon] || myAdd.icon}
              <IconPicker value={myAdd.icon} onPick={(n) => commit(editUpdateAdd(Eref.current, sel, { icon: n }))} testid="sv-icon-picker" />
            </div>
            <div style={lab}>모양
              <div style={{ display: 'flex', gap: 6 }}>{[['rounded', '둥근 사각'], ['circle', '원'], ['bare', '아이콘만']].map(([v, tt]) => <button key={v} style={{ ...smallBtn((myAdd.shape || 'rounded') === v), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { shape: v }))} data-testid={`sv-icon-shape-${v}`}>{tt}</button>)}</div>
            </div>
            <label style={lab}>크기 {r2(myAdd.w)}
              <input type="range" min="12" max="240" step="1" value={Math.min(240, Math.max(12, myAdd.w))} onChange={(e) => { const w = Number(e.target.value); const cx = myAdd.x + myAdd.w / 2; const cy = myAdd.y + myAdd.h / 2; commit(editUpdateAdd(Eref.current, sel, { w, h: w, x: r2(cx - w / 2), y: r2(cy - w / 2) }), `${sel}:size`); }} data-testid="sv-icon-size" />
            </label>
            <div style={lab}>색{myAdd.shape === 'bare' ? '(아이콘)' : '(칩 바탕)'}<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-icon-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'table' && (
          <div style={sec} data-testid="sv-table-props">
            <span style={title}>선택: 개요표 ({sel})</span>
            <TableEditor table={myAdd.table} onChange={(tb, key) => commit(editUpdateAdd(Eref.current, sel, { table: tb }), `${sel}:${key || 'table'}`)} testid="sv-tb" />
            <label style={lab}>글자 크기 {r2(myAdd.size)}
              <input type="range" min="6" max="80" step="1" value={Math.min(80, Math.max(6, myAdd.size))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { size: Number(e.target.value) }), `${sel}:size`)} data-testid="sv-tb-size" />
            </label>
            <div style={lab}>색(제목 띠·선)<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>열 너비는 글자 길이에 맞춰 저절로 정해집니다. 표를 끌어 옮기고, 칸·제목은 더블클릭으로도 고칩니다(Enter 확정).</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-table-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'north' && (
          <div style={sec} data-testid="sv-north-props">
            <span style={title}>선택: 방위표 ({sel})</span>
            <div style={lab}>모양
              <div style={{ display: 'flex', gap: 6 }}>{Object.entries(NORTH_STYLE_LABEL).map(([v, tt]) => <button key={v} style={{ ...smallBtn((myAdd.style || 'circle') === v), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { style: v }))} data-testid={`sv-north-${v}`}>{tt}</button>)}</div>
            </div>
            <label style={lab}>크기(지름) {r2(myAdd.w)}
              <input type="range" min="20" max="400" step="1" value={Math.min(400, Math.max(20, myAdd.w))} onChange={(e) => { const w = Number(e.target.value); const cx = myAdd.x + myAdd.w / 2; const cy = myAdd.y + myAdd.h / 2; commit(editUpdateAdd(Eref.current, sel, { w, h: w, x: r2(cx - w / 2), y: r2(cy - w / 2) }), `${sel}:size`); }} data-testid="sv-north-size" />
            </label>
            <div style={lab}>색<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            {rotPanel(true)}
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-north-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind === 'scale' && (
          <div style={sec} data-testid="sv-scale-props">
            <span style={title}>선택: 축척 막대 ({sel})</span>
            <label style={lab}>막대 길이 {r2(myAdd.w)}
              <input type="range" min="40" max="1600" step="2" value={Math.min(1600, Math.max(40, myAdd.w))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { w: Number(e.target.value) }), `${sel}:len`)} data-testid="sv-scale-len" />
            </label>
            <div style={lab}>칸 수
              <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4, 5].map((n) => <button key={n} style={{ ...smallBtn(myAdd.segs === n), flex: 1 }} onClick={() => commit(editUpdateAdd(Eref.current, sel, { segs: n }))} data-testid={`sv-scale-segs-${n}`}>{n}</button>)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
              <label style={lab}>막대 전체가 나타내는 길이<input type="number" style={input} min="0.1" step="1" value={myAdd.total} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) commit(editUpdateAdd(Eref.current, sel, { total: v }), `${sel}:total`); }} data-testid="sv-scale-total" /></label>
              <label style={lab}>단위<select style={input} value={myAdd.unit} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { unit: e.target.value }))} data-testid="sv-scale-unit">{SCALE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
            </div>
            <label style={lab}>글자 크기 {r2(myAdd.size || 14)}
              <input type="range" min="6" max="80" step="1" value={Math.min(80, Math.max(6, myAdd.size || 14))} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { size: Number(e.target.value) }), `${sel}:font`)} data-testid="sv-scale-font" />
            </label>
            <div style={lab}>색<Colors value={myAdd.fill} onChange={(c) => commit(editUpdateAdd(Eref.current, sel, { fill: c }), `${sel}:fill`)} none={false} /></div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>그림 위 막대 길이와 그 길이가 나타내는 실제 길이를 맞춰 쓰세요.</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-scale-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && myAdd.kind !== 'badge' && myAdd.kind !== 'callout' && myAdd.kind !== 'dim' && myAdd.kind !== 'icon' && myAdd.kind !== 'table' && myAdd.kind !== 'north' && myAdd.kind !== 'scale' && (
          <div style={sec} data-testid="sv-img-props">
            <span style={title}>선택: 내 이미지 ({sel})</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>끌어서 옮기고, 모서리 네모 점을 끌어 크기를 바꿉니다(원본 비율 유지, Shift: 자유롭게).</p>
            <label style={lab}>투명도 {Math.round(myAdd.opacity * 100)}%
              <input type="range" min="0.05" max="1" step="0.05" value={myAdd.opacity} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { opacity: Number(e.target.value) }), `${sel}:op`)} data-testid="sv-img-opacity" />
            </label>
            <label style={lab}>탈색 {myAdd.gray || 0}% <span style={{ fontWeight: 400 }}>(100% = 흑백)</span>
              <input type="range" min="0" max="100" step="5" value={myAdd.gray || 0} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { gray: Number(e.target.value) }), `${sel}:gray`)} data-testid="sv-img-gray" />
            </label>
            <label style={lab}>가장자리 흐리게 {myAdd.edge || 0}%
              <input type="range" min="0" max="100" step="5" value={myAdd.edge || 0} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { edge: Number(e.target.value) }), `${sel}:edge`)} data-testid="sv-img-edge" />
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(false)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { gray: CONTEXT_FX.gray, opacity: CONTEXT_FX.opacity, edge: CONTEXT_FX.edge, behind: true }))} data-testid="sv-img-context" title="흑백 + 투명도 35% + 맨 뒤로 — 그 위에 매스·동선을 얹는 흐린 바탕(대지·평면 맥락)">맥락 바탕으로 흐리게</button>
              {((myAdd.gray || 0) > 0 || (myAdd.edge || 0) > 0 || myAdd.opacity < 1) && <button style={smallBtn(false)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { gray: 0, edge: 0, opacity: 1 }))} data-testid="sv-img-fx-reset" title="탈색·가장자리·투명도를 처음 상태로">효과 지우기</button>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(!!myAdd.behind)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { behind: true }))} data-testid="sv-img-back" title="배경 바로 위, 도형·글자 아래">맨 뒤로</button>
              <button style={smallBtn(!myAdd.behind)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { behind: false }))} data-testid="sv-img-front" title="모든 도형 위">맨 앞으로</button>
              {myAdd.ar > 0 && <button style={smallBtn(false)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { h: r2(myAdd.w / myAdd.ar) }))} data-testid="sv-img-ratio">원본 비율로</button>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(false)} disabled={imgBusy} onClick={() => imgFileRef.current?.click()} data-testid="sv-img-replace" title="다른 이미지로 바꿉니다(자리·투명도·앞뒤는 그대로)">이미지 바꾸기</button>
              <button style={smallBtn(!!myAdd.crop)} disabled={imgBusy} onClick={() => setCropFor({ id: sel })} data-testid="sv-img-crop" title="이미지의 필요한 부분만 남깁니다">자르기{myAdd.crop ? ' (자른 상태)' : ''}</button>
              <input ref={imgFileRef} type="file" accept="image/*" hidden data-testid="sv-img-replace-input" onChange={(e) => { replaceImg(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {imgNote && <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }} data-testid="sv-img-note">{imgNote}</p>}
            {cropFor && cropFor.id === sel && <ImageCropDialog src={myAdd.orig || myAdd.href} crop={myAdd.crop || null} busy={imgBusy} onApply={applyCrop} onCancel={() => setCropFor(null)} />}
            {rotPanel(true)}
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn(false)} onClick={() => { setSel(''); }}>선택 해제</button>
              <button style={smallBtn(false, true)} onClick={remove} data-testid="sv-img-delete">삭제</button>
            </div>
          </div>
        )}

        {sel && multi.length < 2 && info && !myAdd && el && ( // 방금 새로 만든 요소는 그림이 다시 그려진 다음 한 번 더 그릴 때부터 화면에서 찾을 수 있다
          <div style={sec} data-testid="sv-props">
            <span style={title}>선택: {TAG_NAME[tag] || tag} ({sel}){isBg(sel) ? ' · 배경' : ''}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {info.parent && <button style={smallBtn(false)} onClick={() => { setSel(info.parent); setNode(-1); }} data-testid="sv-up">↑ 묶음 선택</button>}
              <button style={smallBtn(false)} onClick={() => { setSel(''); setNode(-1); }}>선택 해제</button>
            </div>

            {myShape && myShape.kind === 'text' && (
              <label style={lab}>글자 내용(줄바꿈 가능)
                <textarea rows={2} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} value={myShape.text} data-testid="sv-shape-text"
                  ref={(n) => { if (n && justAdded.current === myShape.id) { justAdded.current = ''; n.focus(); n.select(); } }}
                  onChange={(e) => commit(editUpdateShape(Eref.current, myShape.id, { text: e.target.value }), `${myShape.id}:text`)} />
              </label>
            )}
            {myShape && myShape.kind === 'arrow' && (
              <label style={lab}>화살촉
                <select style={input} value={myShape.head || 'end'} onChange={(e) => commit(editUpdateShape(Eref.current, myShape.id, { head: e.target.value }))} data-testid="sv-shape-head">
                  <option value="end">끝에 화살촉</option><option value="start">시작에 화살촉</option><option value="both">양쪽</option><option value="none">없음(선)</option>
                </select>
              </label>
            )}
            {tag === 'text' && <PtReadout size={textUnitSize(el)} ptInfo={ptInfo} text={el.textContent} testid="sv-pt" onFix={(pt) => { const k = fs ? textUnitSize(el) / fs : 1; patch(sel, { 'font-size': r2(pt / ptInfo.ppu / (k || 1)) }, 'fs'); }} />}
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
                <select style={input} value={dash} onChange={(e) => patch(sel, dashPatch(e.target.value, dash === 'custom' || e.target.value === 'solid' ? 1 : dashGap))} data-testid="sv-dash">
                  {Object.entries(DASH_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  {dash === 'custom' && <option value="custom">사용자 지정(원본)</option>}
                </select>
              </label>
              {dashBase && (
                <label style={lab}>파선 간격 {Math.round(dashGap * 100)}%
                  <input type="range" min={DASH_GAP_MIN} max={DASH_GAP_MAX} step="0.05" value={Math.min(DASH_GAP_MAX, Math.max(DASH_GAP_MIN, dashGap))} onChange={(e) => patch(sel, { 'stroke-dasharray': dashScaled(dashBase, Number(e.target.value)) }, 'dashgap')} data-testid="sv-dash-gap" />
                </label>
              )}
            </>)}
            {tag === 'text' && (
              <label style={lab}>글자 크기 {r2(fs)}
                <input type="range" min="6" max="60" step="1" value={Math.min(60, Math.max(6, fs))} onChange={(e) => patch(sel, { 'font-size': e.target.value }, 'fs')} data-testid="sv-fs" />
              </label>
            )}
            {tag === 'text' && (
              <div style={{ ...lab, gap: 6 }} data-testid="sv-textfmt">
                <span>글자 정렬 <span style={{ fontWeight: 400 }}>(글자 묶음은 제자리에 둡니다)</span></span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['start', '왼쪽'], ['middle', '가운데'], ['end', '오른쪽']].map(([k, t]) => <button key={k} style={{ ...smallBtn(taOf === k), flex: 1, padding: '4px 2px' }} onClick={() => setTextAnchor(k)} data-testid={`sv-ta-${k}`}>{t}</button>)}
                </div>
                <label style={lab}>자간 {r2(lsOf)}
                  <input type="range" min="-2" max="20" step="0.5" value={Math.min(20, Math.max(-2, lsOf))} onChange={(e) => patch(sel, { 'letter-spacing': Number(e.target.value) === 0 ? null : e.target.value }, 'ls')} data-testid="sv-ls" />
                </label>
                {lineN >= 2 && (
                  <label style={lab}>행간 {Math.round(lhOf * 100)}% <span style={{ fontWeight: 400 }}>(줄 사이 간격, {lineN}줄)</span>
                    <input type="range" min={LH_MIN} max={LH_MAX} step="0.05" value={lhOf} onChange={(e) => commit(editLineSpacing(Eref.current, sel, Number(e.target.value), sigRef.current), `${sel}:lh`)} data-testid="sv-lh" />
                  </label>
                )}
              </div>
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

            {!isBg(sel) && !(myAdd && myAdd.kind === 'dim') && rotPanel(true)}
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
