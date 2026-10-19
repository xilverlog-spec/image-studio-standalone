import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyEdits, hasEdits, editUpdateAdd, editRemoveAdd, editAddShape, editUpdateShape, editRemoveShape, newShape, rawShift, rawSetText, editSet, editMove, editMoveTo, editDelete, editRestore, editAsPath, editTranslate, DASH_PRESETS, dashKind, dashPatch, parsePath, pathD, pathNodes, pathMoveNode, pathMoveCtrl, pathToggleCurve, pathAddNode, pathDelNode, parsePoints, pointsStr, lineToCurveD } from './conceptDiagram/svgedit';
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
  const [ov, setOv] = useState(null);            // 화면 위 손잡이·선택 상자(화소 좌표)
  const [ed, setEd] = useState(null);            // 글자 고치는 중
  const [ctxOk, setCtxOk] = useState(true);         // 화살촉이 선 색을 따라가는 context-stroke 를 브라우저가 지원하는가
  const justAdded = useRef('');                  // 방금 추가한 글자(내용 칸에 바로 커서를 둔다)
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const hostRef = useRef(null); const bodyRef = useRef(null); const drag = useRef(null); const keyRef = useRef(null);
  const Eref = useRef(E); Eref.current = E;
  const selIds = multi.length > 1 ? multi : sel ? [sel] : [];
  const flash = (t) => { setNote(t); setTimeout(() => setNote((n) => (n === t ? '' : n)), 2600); };
  const sigRef = useRef(view.sig); sigRef.current = view.sig;

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
      setOv({ box: [x0, y0, x1 - x0, y1 - y0], multi: boxes, pts: [], ctrls: [], lines: [], w: hr.width, h: hr.height }); return;
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
  const onDown = (e) => {
    if (e.button !== 0 || disabled || ed) return;
    const h = e.target.closest?.('[data-h]');
    if (h) { startHandle(e, h.getAttribute('data-h')); return; }
    const t = e.target.closest?.('[data-eid]');
    if (!t) { startMarquee(e, ''); return; }
    e.preventDefault();
    let id = t.getAttribute('data-eid');
    if (e.altKey && byId[id]?.parent) id = byId[id].parent; // Alt+클릭: 속한 묶음을 고른다
    if (isBg(id)) { startMarquee(e, id); return; }  // 배경을 누르면: 그냥 놓으면 배경 선택, 끌면 상자로 여러 개 고르기
    if (e.shiftKey || e.ctrlKey || e.metaKey) { // Shift·Ctrl+클릭: 선택에 더하거나 뺀다
      const cur = multi.length > 1 ? multi : sel ? [sel] : []; const nx = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      setMulti(nx.length > 1 ? nx : []); setSel(nx[nx.length - 1] || ''); setNode(-1); return;
    }
    if (multi.length > 1 && multi.includes(id)) { // 고른 것 중 하나를 잡으면 모두 함께 옮긴다
      const items = multi.map((mid) => { const el2 = elOf(mid); const inv2 = invOf(el2 && el2.parentNode && el2.parentNode.getScreenCTM ? el2.parentNode.getScreenCTM() : null); const ad = (Eref.current.adds || []).find((a) => a.id === mid); return inv2 && !isBg(mid) ? { id: mid, inv: inv2, start: through(inv2, e.clientX, e.clientY), t0: editTranslate(Eref.current, mid), add0: ad ? { x: ad.x, y: ad.y } : null } : null; }).filter(Boolean);
      drag.current = { kind: 'moveMulti', items, cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, snap: buildSnap(items.map((i) => i.id)) };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true }); return;
    }
    setMulti([]); setSel(id); setNode(-1);
    if (isBg(id)) return;
    const el = elOf(id); if (!el) return;
    const inv = invOf(el.parentNode && el.parentNode.getScreenCTM ? el.parentNode.getScreenCTM() : null); if (!inv) return;
    const start = through(inv, e.clientX, e.clientY);
    const ad = (Eref.current.adds || []).find((a) => a.id === id); // 내 이미지는 자리(x, y)를 직접 바꾼다
    drag.current = { kind: ad ? 'moveadd' : 'move', id, start, inv, t0: editTranslate(Eref.current, id), cx: e.clientX, cy: e.clientY, moved: false, base: Eref.current, add0: ad ? { x: ad.x, y: ad.y } : null, snap: buildSnap([id]) };
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
  const startHandle = (e, h) => {
    e.preventDefault(); e.stopPropagation();
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
    if (d.kind === 'moveMulti') {
      const [cdx, cdy] = clientDelta(d, e); let next = d.base;
      d.items.forEach((it) => {
        const p = through(it.inv, d.cx + cdx, d.cy + cdy); const dx = p[0] - it.start[0]; const dy = p[1] - it.start[1];
        next = it.add0 ? editUpdateAdd(next, it.id, { x: r2(it.add0.x + dx), y: r2(it.add0.y + dy) }) : editMoveTo(next, it.id, it.t0[0] + dx, it.t0[1] + dy, sig);
      });
      commit(next, 'dragmulti'); return;
    }
    if (d.kind === 'moveadd') {
      const [cdx, cdy] = clientDelta(d, e); const p = through(d.inv, d.cx + cdx, d.cy + cdy); const dx = p[0] - d.start[0]; const dy = p[1] - d.start[1];
      commit(editUpdateAdd(d.base, d.id, { x: r2(d.add0.x + dx), y: r2(d.add0.y + dy) }), `drag:${d.id}`); return;
    }
    if (d.kind === 'imgsize') {
      const p = through(d.inv, e.clientX, e.clientY); const a0 = d.add0; const R = [a0.x, a0.y, a0.x + a0.w, a0.y + a0.h];
      const fx = d.arg.includes('w') ? R[2] : R[0]; const fy = d.arg.includes('n') ? R[3] : R[1]; // 반대쪽 모서리는 고정
      let w = Math.max(8, Math.abs(p[0] - fx)); let h = Math.max(8, Math.abs(p[1] - fy));
      if (!e.shiftKey && a0.ar > 0) h = w / a0.ar;
      const x = d.arg.includes('w') ? fx - w : fx; const y = d.arg.includes('n') ? fy - h : fy;
      commit(editUpdateAdd(d.base, d.id, { x: r2(x), y: r2(y), w: r2(w), h: r2(h) }), d.key); return;
    }
    if (d.kind === 'move') {
      const [cdx, cdy] = clientDelta(d, e); const p = through(d.inv, d.cx + cdx, d.cy + cdy);
      const dx = p[0] - d.start[0]; const dy = p[1] - d.start[1];
      commit(editMoveTo(d.base, d.id, d.t0[0] + dx, d.t0[1] + dy, sig), `drag:${d.id}`); return;
    }
    const p = through(d.inv, e.clientX, e.clientY); const dv = [p[0] - d.start[0], p[1] - d.start[1]];
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
    window.removeEventListener('pointermove', onMove); const d = drag.current; drag.current = null; setDragging(false); setGuides([]); setTick((n) => n + 1);
    if (d && d.kind === 'marquee') {
      setMarq(null);
      if (!d.moved) { if (!d.add) { setMulti([]); setSel(d.bgId); setNode(-1); } return; } // 끌지 않고 놓음: 배경(또는 빈 곳) 클릭
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
    const b = bodyRef.current; const t = textAtPoint(b, e.clientX, e.clientY); if (!t) return;
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
  const myAdd = sel ? adds.find((a) => a.id === sel) : null;
  const myShape = sel ? shapeOf(sel) : null;
  const addShape = (kind) => { // 그림 한가운데에 새 도형·글자·화살표를 넣고 바로 고른다
    const vb = (svg.match(/viewBox="([\d.\-\s]+)"/) || [])[1]?.trim().split(/\s+/).map(Number); const box = vb && vb.length === 4 ? vb : [0, 0, 1000, 700];
    const sh = newShape(kind, box); if (kind === 'arrow' && !ctxOk) sh.ctx = false;
    const r = editAddShape(Eref.current, sigRef.current, sh); commit(r.edits);
    setSel(`e${baseLeaf + r.index}`); setNode(-1); if (kind === 'text') justAdded.current = r.id;
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
      if (it.type === 'add') { const cur = next.adds || []; let n = 1; while (cur.some((a) => a.id === `a${n}`)) n += 1; const a = { ...it.a, id: `a${n}`, x: r2(it.a.x + step), y: r2(it.a.y + step) }; next = { ...next, adds: [...cur, a] }; ids.push(a.id); }
      else { const r = editAddShape(next, sigRef.current, rawShift(it.sh, step, step)); next = r.edits; ids.push(`e${baseLeaf + r.index}`); }
    });
    commit(next); setMulti(ids.length > 1 ? ids : []); setSel(ids[ids.length - 1] || ''); setNode(-1); flash(`${ids.length}개를 붙여넣었습니다`);
  };
  const duplicateSel = () => { if (copySel()) pasteClip(1); };
  const selectAll = () => { const ids = []; bodyRef.current?.querySelectorAll('[data-eid]:not([data-hit])').forEach((n) => { const id = n.getAttribute('data-eid'); const info = byId[id]; if (info && info.kind !== 'g' && !isBg(id) && n.getAttribute('display') !== 'none') ids.push(id); }); setMulti(ids.length > 1 ? ids : []); setSel(ids[ids.length - 1] || ''); setNode(-1); };
  const nudgeAll = (dx, dy, key) => {
    let next = Eref.current; selIds.forEach((id) => { if (isBg(id)) return; const ad = (next.adds || []).find((a) => a.id === id); next = ad ? editUpdateAdd(next, id, { x: r2(ad.x + dx), y: r2(ad.y + dy) }) : editMove(next, id, dx, dy, sigRef.current); });
    commit(next, key ? `multi:${key}` : '');
  };
  const moveClient = (next, id, dxc, dyc) => { // 화면에서 (dxc, dyc) 만큼 움직이게 그 요소의 좌표를 옮긴다(부모 변환·배율을 거꾸로 계산)
    if (!dxc && !dyc) return next; const n = elOf(id); if (!n) return next;
    const inv = invOf(n.parentNode && n.parentNode.getScreenCTM ? n.parentNode.getScreenCTM() : null); if (!inv) return next;
    const a = through(inv, 0, 0); const b = through(inv, dxc, dyc); const dx = b[0] - a[0]; const dy = b[1] - a[1]; const ad = (next.adds || []).find((q) => q.id === id);
    return ad ? editUpdateAdd(next, id, { x: r2(ad.x + dx), y: r2(ad.y + dy) }) : editMove(next, id, dx, dy, sigRef.current);
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
      next = editSet(next, id, patchObj, sigRef.current);
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
    if (typing || ed) return;
    const mod = e.ctrlKey || e.metaKey; const k = (e.key || '').toLowerCase();
    if (mod) { // Ctrl+C 복사 · Ctrl+V 붙여넣기 · Ctrl+D 복제 · Ctrl+A 모두 선택 (Ctrl+Z/Y 는 부모가 처리)
      if (k === 'c' && selIds.length && !window.getSelection?.()?.toString()) { e.preventDefault(); copySel(); }
      else if (k === 'v' && SV_CLIP) { e.preventDefault(); pasteClip(); }
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
        <div ref={hostRef} onPointerDown={onDown} onDoubleClick={onDbl} style={{ position: 'relative', width: '100%', maxWidth: maxWidth || undefined, margin: '0 auto', border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }} data-testid="inline-svg">
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
            </svg>
          )}
          {ed && hostRef.current && (
            <InlineInput host={hostRef.current} target={ed.target} value={ed.field.value} multiline={/\n/.test(ed.field.value)}
              onCommit={(v) => { const fl = ed.field; const sid = ed.shapeId; setEd(null); if (v === fl.value) return; if (sid) { const sh = shapes.find((q) => q.id === sid); commit(editUpdateShape(Eref.current, sid, sh && sh.kind === 'raw' ? { el: rawSetText(sh, v).el } : { text: v })); } else onTextEdit?.(fl, v); }} onCancel={() => setEd(null)} />
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', textAlign: 'center', margin: '8px 0 0' }} data-testid="inline-hint">✏️ 도형을 <b>클릭</b>하면 오른쪽에서 색·선 종류를 고치고, <b>끌어서 옮기고</b>, 주황 점(마디)을 끌어 <b>곡선·모양</b>을 고칩니다. 글자는 <b>더블클릭</b>해서 고칩니다. <b>Shift+클릭</b>이나 <b>빈 곳을 끌어 만든 상자</b>로 여러 개를 고릅니다(Ctrl+A: 모두). 끌면 다른 요소·그림 가운데에 <b>자석처럼 붙고 분홍 안내선</b>이 뜹니다(Alt: 끄기). Alt+클릭: 묶음 선택 · Shift 끌기: 수평·수직 · 방향키: 미세 이동 · Ctrl+C / V / D: 복사·붙여넣기·복제 · Delete: 삭제 · Ctrl+Z: 되돌리기</p>
      </div>

      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto', maxHeight: 'min(74vh, 780px)', overflowY: 'auto', paddingRight: 4 }} data-testid="sv-side">
        <div style={sec} data-testid="sv-add-panel">
          <span style={title}>요소 추가</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={() => addShape('text')} data-testid="sv-add-text">＋ 글자</button>
            <button style={smallBtn(false)} onClick={() => addShape('rect')} data-testid="sv-add-rect">＋ 사각형</button>
            <button style={smallBtn(false)} onClick={() => addShape('ellipse')} data-testid="sv-add-ellipse">＋ 원</button>
            <button style={smallBtn(false)} onClick={() => addShape('arrow')} data-testid="sv-add-arrow">＋ 화살표</button>
            {onAddImageClick && <button style={smallBtn(false)} onClick={onAddImageClick} data-testid="sv-add-image">＋ 이미지</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={smallBtn(false)} onClick={copySel} data-testid="sv-copy" title="Ctrl+C">복사</button>
            <button style={smallBtn(false)} onClick={() => pasteClip()} data-testid="sv-paste" title="Ctrl+V">붙여넣기</button>
            <button style={smallBtn(false)} onClick={duplicateSel} data-testid="sv-dup" title="Ctrl+D">복제</button>
          </div>
          {note && <span style={{ fontSize: 11, color: '#9A3412' }} data-testid="sv-note">{note}</span>}
        </div>
        <div style={sec}>
          <span style={title}>그림 속 도형 고치기</span>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>손으로 고친 요소 <b data-testid="sv-count">{editedCount}</b>개{adds.length ? ` · 내 이미지 ${adds.length}장` : ''}{shapes.length ? ` · 내가 그린 도형 ${shapes.length}개` : ''}{stale && <span style={{ color: '#B45309' }}> · 그림 구조가 바뀌어 예전 수정은 적용되지 않았습니다</span>}</p>
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
            <label style={lab}>투명도(모두)
              <input type="range" min="0.05" max="1" step="0.05" defaultValue="1" onChange={(e) => multiSet('', { opacity: Number(e.target.value) >= 1 ? null : e.target.value }, 'op')} data-testid="sv-multi-opacity" />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {[['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]].map(([t, dx, dy]) => <button key={t} style={{ ...smallBtn(false), padding: '4px 2px' }} onClick={() => nudgeAll(dx * 5, dy * 5)} data-testid={`sv-multi-nudge-${t}`}>{t} 5</button>)}
            </div>
          </div>
        )}

        {!sel && multi.length < 2 && (
          <div style={sec}>
            <span style={title}>전체</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>그림 속 <b>선·도형·원·글자</b>를 클릭하면 여기에 속성이 나옵니다. 여러 요소가 한 덩어리(칩·아이콘 등)로 묶여 있으면 <b>Alt+클릭</b> 또는 <b>↑ 묶음</b> 버튼으로 통째로 고릅니다.</p>
          </div>
        )}

        {sel && multi.length < 2 && myAdd && (
          <div style={sec} data-testid="sv-img-props">
            <span style={title}>선택: 내 이미지 ({sel})</span>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 }}>끌어서 옮기고, 모서리 네모 점을 끌어 크기를 바꿉니다(원본 비율 유지, Shift: 자유롭게).</p>
            <label style={lab}>투명도 {Math.round(myAdd.opacity * 100)}%
              <input type="range" min="0.05" max="1" step="0.05" value={myAdd.opacity} onChange={(e) => commit(editUpdateAdd(Eref.current, sel, { opacity: Number(e.target.value) }), `${sel}:op`)} data-testid="sv-img-opacity" />
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={smallBtn(!!myAdd.behind)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { behind: true }))} data-testid="sv-img-back" title="배경 바로 위, 도형·글자 아래">맨 뒤로</button>
              <button style={smallBtn(!myAdd.behind)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { behind: false }))} data-testid="sv-img-front" title="모든 도형 위">맨 앞으로</button>
              {myAdd.ar > 0 && <button style={smallBtn(false)} onClick={() => commit(editUpdateAdd(Eref.current, sel, { h: r2(myAdd.w / myAdd.ar) }))} data-testid="sv-img-ratio">원본 비율로</button>}
            </div>
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
