import React, { useEffect, useRef, useState } from 'react';
import { normCrop } from './conceptDiagram/imgutil';

// 내 이미지 자르기 창: 원본 이미지 위에 자를 범위(주황 상자)를 끌어서 고른다. 상자 안은 옮기고, 가장자리·모서리 점은 크기를 바꾼다.
// src: 원본 이미지(data URL), crop: 지금 보이는 범위 [왼쪽, 위, 오른쪽, 아래](0~1, 없으면 전체), onApply(crop|null): null 은 자르기 해제
const MIN = 0.05;
const HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']];
const btn = (primary) => ({ padding: '7px 14px', borderRadius: 7, border: primary ? '1px solid var(--primary)' : '1px solid var(--line-strong)', background: primary ? 'var(--primary)' : 'var(--surface)', color: primary ? '#fff' : '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' });

export default function ImageCropDialog({ src, crop, onApply, onCancel, busy }) {
  const [c, setC] = useState(crop || [0, 0, 1, 1]);
  const [nat, setNat] = useState(null);
  const stage = useRef(null); const drag = useRef(null);
  useEffect(() => { const im = new Image(); im.onload = () => setNat({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }); im.src = src; }, [src]);
  const ar = nat ? nat.w / nat.h : 1.5;
  const maxW = Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.8 : 900, 900); const maxH = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.6 : 560, 620);
  const W = Math.round(Math.min(maxW, maxH * ar)); const H = Math.round(W / ar);

  const begin = (e, mode) => {
    if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    drag.current = { mode, x0: e.clientX, y0: e.clientY, c0: [...c] };
    const move = (ev) => {
      const d = drag.current; if (!d) return; const rect = stage.current.getBoundingClientRect();
      const dx = (ev.clientX - d.x0) / rect.width; const dy = (ev.clientY - d.y0) / rect.height; let [l, t, r, b] = d.c0;
      if (d.mode === 'move') { const w = r - l; const h = b - t; l = Math.min(1 - w, Math.max(0, l + dx)); t = Math.min(1 - h, Math.max(0, t + dy)); r = l + w; b = t + h; }
      else {
        if (d.mode.includes('w')) l = Math.min(r - MIN, Math.max(0, l + dx)); if (d.mode.includes('e')) r = Math.max(l + MIN, Math.min(1, r + dx));
        if (d.mode.includes('n')) t = Math.min(b - MIN, Math.max(0, t + dy)); if (d.mode.includes('s')) b = Math.max(t + MIN, Math.min(1, b + dy));
      }
      setC([l, t, r, b]);
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const apply = () => { if (!busy) onApply(normCrop(c)); };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } else if (e.key === 'Enter') { e.preventDefault(); apply(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const px = nat ? `${Math.round((c[2] - c[0]) * nat.w)}×${Math.round((c[3] - c[1]) * nat.h)}px` : '';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="crop-dialog" onPointerDown={(e) => e.stopPropagation()}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-btn)', padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.4)', maxWidth: '96vw', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 15, color: '#0f172a' }}>이미지 자르기</b>
          <span style={{ fontSize: 12, color: '#64748b' }}>주황 상자 안만 남깁니다. 상자 안을 끌면 옮기고, 가장자리·모서리 점을 끌면 크기가 바뀝니다. (Enter 적용 · Esc 취소)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div ref={stage} style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: 'var(--line-strong)', userSelect: 'none', touchAction: 'none' }} data-testid="crop-stage">
            <img src={src} alt="자를 이미지" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
            <div onPointerDown={(e) => begin(e, 'move')} data-testid="crop-box" style={{ position: 'absolute', left: pct(c[0]), top: pct(c[1]), width: pct(c[2] - c[0]), height: pct(c[3] - c[1]), border: '2px solid #F28C28', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', cursor: 'move', boxSizing: 'border-box' }}>
              {HANDLES.map(([m, fx, fy, cur]) => (
                <div key={m} onPointerDown={(e) => begin(e, m)} data-testid={`crop-h-${m}`}
                  style={{ position: 'absolute', left: `${fx * 100}%`, top: `${fy * 100}%`, width: 14, height: 14, transform: 'translate(-50%, -50%)', background: '#fff', border: '2px solid #F28C28', borderRadius: 3, cursor: cur, touchAction: 'none' }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#334155', marginRight: 'auto' }} data-testid="crop-info">남기는 크기 <b>{px}</b>{nat ? ` · 원본의 ${Math.round((c[2] - c[0]) * (c[3] - c[1]) * 100)}%` : ''}</span>
          <button style={btn(false)} onClick={() => setC([0, 0, 1, 1])} data-testid="crop-reset" title="자르기를 풀고 원본 전체로">전체로</button>
          <button style={btn(false)} onClick={onCancel} data-testid="crop-cancel">취소</button>
          <button style={btn(true)} onClick={apply} disabled={busy} data-testid="crop-apply">{busy ? '자르는 중…' : '적용'}</button>
        </div>
      </div>
    </div>
  );
}
