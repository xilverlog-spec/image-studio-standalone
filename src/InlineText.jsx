import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normText, pickByText, responsiveSvg } from './conceptDiagram/inlineText';
import { judgeTextPt } from './conceptDiagram/page';

// 그림 위의 글자를 눌러 그 자리에서 바로 고치기(입력칸이 글자 위에 겹쳐 열린다). Enter 확정 · Esc 취소 · 다른 곳을 누르면 확정.

// root 안의 <text> 중 화면 좌표(x, y)에 놓인 것(글자 상자 안). pointer-events 가 꺼진 글자도 찾는다. 겹치면 가장 작은 것
export function textAtPoint(root, x, y, pad = 3) {
  if (!root) return null;
  let best = null; let bestA = Infinity;
  root.querySelectorAll('text').forEach((t) => {
    const r = t.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) { const a = r.width * r.height; if (a < bestA) { bestA = a; best = t; } }
  });
  return best;
}

// 그림 속 글자 하나의 크기(그림 단위): 글자 자신의 font-size 에 바깥 묶음(g)들의 transform 확대·축소를 곱한다
export function textUnitSize(el) {
  if (!el || typeof getComputedStyle !== 'function') return 0;
  let fs = parseFloat(getComputedStyle(el).fontSize) || parseFloat(el.getAttribute('font-size')) || 0;
  let k = 1;
  for (let n = el; n && n.nodeName && n.nodeName.toLowerCase() !== 'svg'; n = n.parentNode) {
    const t = n.transform && n.transform.baseVal && n.transform.baseVal.numberOfItems ? n.transform.baseVal.consolidate() : null;
    if (t) k *= Math.hypot(t.matrix.a, t.matrix.b);
  }
  return fs * k;
}
// '이 글자는 몇 pt' 안내 상자. size: 그림 단위 크기, ptInfo: { ppu(그림 단위 1 → pt), basis(어느 크기 기준인지), tiers(페이지 모드일 때 글자 위계 — 있으면 위계 판정도 보여 준다) }
// onFix(pt): 위계에 맞는 크기로 바로 고치는 단추를 보여 줄 때(편집기가 그 글자의 크기를 바꿀 수 있을 때만 넘긴다)
const JUDGE_STYLE = { ok: ['#F0FDF4', '#86EFAC', '#15803D', ''], info: ['#F1F5F9', '#CBD5E1', '#475569', 'ℹ'], warn: ['#FEF2F2', '#FCA5A5', '#B91C1C', ''] };
export function PtReadout({ size, ptInfo, text, testid = 'pt-readout', onFix }) {
  if (!ptInfo || !size) return null;
  const pt = Math.round(size * ptInfo.ppu * 10) / 10;
  const j = judgeTextPt(pt, ptInfo.tiers);
  const [bg, bd, fg, ic] = j ? JUDGE_STYLE[j.level] : [];
  return (
    <div style={{ padding: '7px 9px', borderRadius: 8, background: 'var(--warn-soft)', border: '1px solid var(--line-strong)', fontSize: 12.5, lineHeight: 1.5, color: '#7C2D12' }} data-testid={testid}>
      {text ? <>“{String(text).slice(0, 18)}{String(text).length > 18 ? '…' : ''}” </> : null}<b style={{ fontSize: 15 }}>약 {pt}pt</b>
      <div style={{ fontSize: 10.5, color: 'var(--warn)' }}>{ptInfo.basis}</div>
      {j && (
        <div style={{ marginTop: 5, padding: '4px 7px', borderRadius: 6, background: bg, border: `1px solid ${bd}`, color: fg, fontSize: 11.5, lineHeight: 1.45 }} data-testid={`${testid}-judge`} data-level={j.level}>
          {ic} {j.text}
          {onFix && j.fix && Math.abs(j.fix - pt) >= 0.3 && <div><button style={{ marginTop: 3, padding: '2px 8px', borderRadius: 5, border: `1px solid ${bd}`, background: '#fff', color: fg, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }} onClick={() => onFix(j.fix)} data-testid={`${testid}-fix`}>{j.fix}pt로 맞추기</button></div>}
        </div>
      )}
    </div>
  );
}

// 글자를 그 자리에서 고치는 입력칸. host: position:relative 인 바깥 상자(입력칸이 이 안에 놓인다), target: 고칠 <text>
// <text> 는 '상자 없이' 글자 자체가 고쳐지는 것처럼 보이게 한다: 글자와 같은 글꼴·크기·굵기·색·정렬·기울기로 그 위에 겹쳐 열고, 고치는 동안 원래 글자는 숨긴다(점선 밑줄과 커서만 보인다).
// 표 칸처럼 <text> 가 아닌 것은 예전처럼 테두리 있는 칸으로 연다. 화면에 없는(숨었거나 이미 사라진) 글자는 엉뚱한 자리에 열지 않고 열지 않는다.
let _mctx = null;
const textWidthPx = (txt, font, ls) => { if (!_mctx) _mctx = document.createElement('canvas').getContext('2d'); _mctx.font = font; return _mctx.measureText(txt).width + (ls || 0) * Math.max(0, txt.length); };
function inlineGeo(host, target, multiline, value) {
  if (!host || !target || !target.isConnected) return null;
  const tr = target.getBoundingClientRect(); const hr = host.getBoundingClientRect();
  if (tr.width < 1 && tr.height < 1) return null; // 화면에 없는 글자
  const sz = host.offsetWidth ? hr.width / host.offsetWidth : 1; // 확대·축소(CSS transform) 안에 있으면 화면 픽셀을 그 배율로 나눠야 제자리에 놓인다
  const k = sz > 0.01 ? sz : 1;
  const base = { tr, hr, k, plain: true };
  if ((target.tagName || '').toLowerCase() !== 'text') return base;
  let ctm = null; let bb = null; try { ctm = target.getScreenCTM(); bb = target.getBBox(); } catch { /* 못 구하면 상자 모양으로 */ }
  if (!ctm || !bb || !(bb.width > 0)) return base;
  const scale = Math.hypot(ctm.a, ctm.b) || 1; const cs = getComputedStyle(target);
  const fs = (parseFloat(cs.fontSize) || 14) * scale / k;
  const tsp = [...target.querySelectorAll('tspan')].filter((t) => t.hasAttribute('dy') || t.hasAttribute('y'));
  if (multiline && !tsp.length && String(value ?? '').includes('\n')) return base; // 줄마다 따로 그려진 여러 줄 글자(리더선 설명 등)는 한 줄만 기준으로 위치를 잡을 수 없어 테두리 있는 칸으로 연다
  const lines = Math.max(1, tsp.length ? tsp.length + (target.firstChild && target.firstChild.nodeType === 3 && target.firstChild.textContent.trim() ? 1 : 0) : 1);
  let pitch = fs * 1.2; if (tsp.length >= 2) { const y0 = parseFloat(tsp[0].getAttribute('y') ?? NaN); const y1 = parseFloat(tsp[1].getAttribute('y') ?? NaN); const dy = parseFloat(tsp[1].getAttribute('dy') ?? NaN); const d = Number.isFinite(dy) ? dy : (Number.isFinite(y0) && Number.isFinite(y1) ? y1 - y0 : NaN); if (Number.isFinite(d) && d > 0) pitch = d * scale / k; }
  const fill = cs.fill && cs.fill !== 'none' && !/^url/.test(cs.fill) ? cs.fill : '#111';
  return {
    plain: false, k, tr, hr, fs, pitch, lines,
    family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle, ls: (parseFloat(cs.letterSpacing) || 0) * scale / k, color: fill,
    anchor: cs.textAnchor || 'start', ang: Math.atan2(ctm.b, ctm.a) * 180 / Math.PI,
    cx: (tr.left + tr.width / 2 - hr.left) / k, cy: (tr.top + tr.height / 2 - hr.top) / k, w0: bb.width * scale / k, h0: bb.height * scale / k,
  };
}

export function InlineInput({ host, target, value, multiline, onCommit, onCancel }) {
  const [v, setV] = useState(value ?? '');
  const ref = useRef(null); const done = useRef(false);
  const geo = useMemo(() => inlineGeo(host, target, multiline, value), []); // eslint-disable-line react-hooks/exhaustive-deps — 열 때 한 번 재서 그 자리에 고정
  useLayoutEffect(() => {
    if (!geo) { onCancel(); return undefined; }
    if (geo.plain) return undefined;
    const prev = target.style.visibility; target.style.visibility = 'hidden'; // 원래 글자는 고치는 동안 숨긴다(입력칸 글자와 겹쳐 두 겹으로 보이지 않게)
    return () => { if (target.isConnected) target.style.visibility = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (ok) => { if (done.current) return; done.current = true; if (ok) onCommit(v); else onCancel(); };
  if (!geo) return null;
  let style;
  if (geo.plain) { // 표 칸 등: 테두리 있는 칸
    const { tr, hr, k } = geo;
    style = {
      position: 'absolute', left: Math.max(0, (tr.left - hr.left) / k - 5), top: Math.max(0, (tr.top - hr.top) / k - 4), minWidth: Math.max(110, tr.width / k + 26), maxWidth: Math.max(160, hr.width / k - 12),
      height: multiline ? Math.max(tr.height / k + 10, 64) : tr.height / k + 8, fontSize: Math.max(12, Math.min(30, (tr.height / k) * 0.78)), lineHeight: 1.25, boxSizing: 'border-box', padding: '1px 6px',
      border: '2px solid #F28C28', borderRadius: 5, background: '#fff', color: '#111', outline: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', zIndex: 20, fontFamily: 'inherit', resize: 'none',
    };
  } else {
    const g = geo; const rows = (multiline ? Math.max(g.lines, String(v).split('\n').length) : 1);
    const font = `${g.style} ${g.weight} ${g.fs}px ${g.family}`;
    const wText = Math.max(...String(v).split('\n').map((l) => textWidthPx(l || ' ', font, g.ls)), 8);
    const W = Math.max(wText + 4, 12); const H = multiline ? Math.max(g.h0, g.pitch * rows) : g.h0; const rot = Math.abs(g.ang) > 0.5;
    const left = rot || g.anchor === 'middle' ? g.cx - W / 2 : g.anchor === 'end' ? g.cx + g.w0 / 2 - W : g.cx - g.w0 / 2; // 정렬 기준이 되는 쪽은 그대로 두고 글이 늘어난다
    style = {
      position: 'absolute', left, top: multiline ? g.cy - g.h0 / 2 : g.cy - H / 2, width: W, height: H, margin: 0, padding: 0, boxSizing: 'content-box', border: 'none', borderBottom: '1px dashed #F28C28', borderRadius: 0, background: 'transparent', outline: 'none', boxShadow: 'none',
      color: g.color, caretColor: '#F28C28', fontFamily: g.family, fontWeight: g.weight, fontStyle: g.style, fontSize: g.fs, letterSpacing: g.ls ? `${g.ls}px` : undefined, lineHeight: multiline ? `${g.pitch}px` : `${H}px`,
      textAlign: g.anchor === 'middle' ? 'center' : g.anchor === 'end' ? 'right' : 'left', whiteSpace: 'pre', overflow: 'visible', resize: 'none', zIndex: 20,
      ...(rot ? { transform: `rotate(${g.ang}deg)`, transformOrigin: 'center' } : {}),
    };
  }
  const props = {
    ref, value: v, style, 'data-testid': 'inline-input', spellCheck: false,
    onChange: (e) => setV(e.target.value),
    onBlur: () => finish(true),
    onKeyDown: (e) => {
      e.stopPropagation(); // 단축키(Ctrl+Z·Delete·방향키 등)가 입력 중에 그림 쪽으로 새지 않게
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); finish(true); }
    },
    onPointerDown: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation(),
  };
  return multiline ? <textarea {...props} wrap="off" /> : <input {...props} />;
}

// 클릭할 수 있는 SVG 보기: 고칠 수 있는 글자에 마우스를 올리면 색이 바뀌고, 누르면 입력칸이 열린다.
// fields: [{ path, label, value }](getTextFields), onEdit(field, 새 글자), onMiss(글자) — 글자 목록에 없는 자동 생성 글자를 눌렀을 때
export function InlineSvgView({ svg, fields, onEdit, onMiss, maxWidth }) {
  const hostRef = useRef(null); const bodyRef = useRef(null);
  const [ed, setEd] = useState(null);
  const html = useMemo(() => ({ __html: responsiveSvg(svg) }), [svg]);
  // 고칠 수 있는 글자에 표시를 단다(마우스를 올릴 때 색이 바뀌고 글자 커서가 된다)
  useEffect(() => {
    const b = bodyRef.current; if (!b) return;
    const ts = [...b.querySelectorAll('text')];
    ts.forEach((t) => {
      const k = normText(t.textContent); const idx = ts.filter((x) => normText(x.textContent) === k).indexOf(t);
      if (pickByText(fields, t.textContent, idx)) t.setAttribute('data-editable', '1');
    });
  }, [svg, fields]);
  const onClick = (e) => {
    if (ed) return;
    const b = bodyRef.current; const t = textAtPoint(b, e.clientX, e.clientY); if (!t) return;
    const ts = [...b.querySelectorAll('text')]; const idx = ts.filter((x) => normText(x.textContent) === normText(t.textContent)).indexOf(t);
    const f = pickByText(fields, t.textContent, idx);
    if (!f) { onMiss?.(t.textContent); return; }
    setEd({ field: f, target: t });
  };
  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', maxWidth: maxWidth || undefined, margin: '0 auto' }} data-testid="inline-svg">
      <style>{'.dg-inline text[data-editable]{cursor:text}.dg-inline text[data-editable]:hover{fill:#E8832A !important;text-decoration:underline}'}</style>
      <div ref={bodyRef} className="dg-inline" onClick={onClick} dangerouslySetInnerHTML={html} />
      {ed && hostRef.current && (
        <InlineInput host={hostRef.current} target={ed.target} value={ed.field.value} multiline={/\n/.test(ed.field.value)}
          onCommit={(v) => { const f = ed.field; setEd(null); if (v !== f.value) onEdit(f, v); }} onCancel={() => setEd(null)} />
      )}
    </div>
  );
}
