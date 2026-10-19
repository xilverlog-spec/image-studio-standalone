import React, { useEffect, useMemo, useRef, useState } from 'react';
import { normText, pickByText, responsiveSvg } from './conceptDiagram/inlineText';

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
// '이 글자는 몇 pt' 안내 상자. size: 그림 단위 크기, ptInfo: { ppu(그림 단위 1 → pt), basis(어느 크기 기준인지) }
export function PtReadout({ size, ptInfo, text, testid = 'pt-readout' }) {
  if (!ptInfo || !size) return null;
  const pt = Math.round(size * ptInfo.ppu * 10) / 10;
  return (
    <div style={{ padding: '7px 9px', borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', fontSize: 12.5, lineHeight: 1.5, color: '#7C2D12' }} data-testid={testid}>
      🔤 {text ? <>“{String(text).slice(0, 18)}{String(text).length > 18 ? '…' : ''}” </> : null}<b style={{ fontSize: 15 }}>약 {pt}pt</b>
      <div style={{ fontSize: 10.5, color: '#9A3412' }}>{ptInfo.basis}</div>
    </div>
  );
}

// 입력칸. host: position:relative 인 바깥 상자(입력칸이 이 안에 놓인다), target: 고칠 <text>
export function InlineInput({ host, target, value, multiline, onCommit, onCancel }) {
  const [v, setV] = useState(value ?? '');
  const ref = useRef(null); const done = useRef(false);
  const hr = host.getBoundingClientRect(); const tr = target.getBoundingClientRect();
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (ok) => { if (done.current) return; done.current = true; if (ok) onCommit(v); else onCancel(); };
  const style = {
    position: 'absolute', left: Math.max(0, tr.left - hr.left - 5), top: Math.max(0, tr.top - hr.top - 4), minWidth: Math.max(110, tr.width + 26), maxWidth: Math.max(160, hr.width - 12),
    height: multiline ? Math.max(tr.height + 10, 64) : tr.height + 8, fontSize: Math.max(12, Math.min(30, tr.height * 0.78)), lineHeight: 1.25, boxSizing: 'border-box', padding: '1px 6px',
    border: '2px solid #F28C28', borderRadius: 5, background: '#fff', color: '#111', outline: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', zIndex: 20, fontFamily: 'inherit', resize: 'none',
  };
  const props = {
    ref, value: v, style, 'data-testid': 'inline-input',
    onChange: (e) => setV(e.target.value),
    onBlur: () => finish(true),
    onKeyDown: (e) => {
      e.stopPropagation(); // 단축키(Ctrl+Z·Delete·방향키 등)가 입력 중에 그림 쪽으로 새지 않게
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); finish(true); }
    },
    onPointerDown: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation(),
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
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
