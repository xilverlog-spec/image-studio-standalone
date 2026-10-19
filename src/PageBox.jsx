import React from 'react';
import { PAGE_PRESETS, PAGE_LAYOUTS, FONT_OPTIONS, presetById, recommendType, recommendFont } from './conceptDiagram/page';

// 출력 크기·칸 나누기·글자 위계 상자(다이어그램 탭 왼쪽). 계산은 conceptDiagram/page.js 가 하고 여기는 입력만 받는다.
const inp = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.9)', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box', width: '100%' };
const lab = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
const small = (on) => ({ padding: '4px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: on ? '1px solid #F28C28' : '1px solid var(--border-color)', background: on ? 'rgba(242,140,40,0.14)' : 'rgba(255,255,255,0.85)', color: on ? '#B45309' : 'var(--text-secondary)' });
const mmText = (r) => `${Math.round(r[2])}×${Math.round(r[3])}mm`;

export default function PageBox({ on, setOn, pg, setPg, info, selCell, onSelect, onClear, onExample, selRaw, onCellMm, onSplit, onRemove, onResetLayout, setLayout, onMoveContent }) {
  const set = (patch) => setPg((p) => ({ ...p, ...patch }));
  const setLay = setLayout || set; // 칸 배치를 바꿀 때는 되돌리기 기록을 남기는 쪽으로
  const rec = recommendType({ w: Number(pg.w) || 420, h: Number(pg.h) || 297, medium: pg.medium });
  const pickPreset = (id) => { const p = presetById(id); set(id === 'custom' ? { preset: id } : { preset: id, w: p.w, h: p.h, medium: p.medium }); };
  const num = (k, v) => set({ [k]: v === '' ? '' : Number(v) });
  const grid = /^g(\d)x(\d)$/.exec(pg.layoutId);
  const setSize = (k, v) => set({ sizes: { ...pg.sizes, [k]: v === '' ? null : Number(v) } });
  const cur = info?.cells?.find((c) => c.id === selCell);
  const rows = [['title', '제목', '페이지 제목'], ['sub', '소제목', '부제 · 칸 제목'], ['label', '본문', '다이어그램 속 글자(목표)'], ['small', '작은 글자', '범례·각주']];
  return (
    <details open style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.5)' }} data-testid="page-box">
      <summary style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-secondary)', cursor: 'pointer' }}>📐 출력 크기 · 칸 나누기 · 글자 위계 (선택)</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} data-testid="page-on" />정해진 크기의 페이지에 맞춰 만들기 (켜면 저장도 이 크기)
        </label>
        {!on && (
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 8px' }} data-testid="page-off-note">
            지금은 <b>꺼져 있어서</b> 아래 설정은 아직 적용되지 않습니다. 켜면 오른쪽에 <b>페이지 미리보기</b>가 생기고 저장도 이 크기가 됩니다. 켜기 전에 크기·글자·여백을 미리 정해 두면 기억됩니다.
            <button style={{ ...small(true), marginLeft: 8 }} onClick={() => setOn(true)} data-testid="page-on-btn">지금 켜기</button>
          </p>
        )}
        {(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: on ? 1 : 0.6 }} data-testid="page-settings">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={{ ...lab, gridColumn: '1 / 3' }}>용지·화면 크기
                <select style={inp} value={pg.preset} onChange={(e) => pickPreset(e.target.value)} data-testid="page-preset">{PAGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              </label>
              <label style={lab}>가로(mm)<input type="number" min="30" step="1" style={inp} value={pg.w} onChange={(e) => { num('w', e.target.value); set({ preset: 'custom' }); }} data-testid="page-w" /></label>
              <label style={lab}>세로(mm)<input type="number" min="30" step="1" style={inp} value={pg.h} onChange={(e) => { num('h', e.target.value); set({ preset: 'custom' }); }} data-testid="page-h" /></label>
              <button style={small(false)} onClick={() => set({ preset: 'custom', w: pg.h, h: pg.w })} title="가로와 세로를 맞바꿉니다">↔ 가로·세로 바꾸기</button>
              <label style={lab}>용도<select style={inp} value={pg.medium} onChange={(e) => set({ medium: e.target.value })} data-testid="page-medium"><option value="print">인쇄(보드·보고서)</option><option value="screen">화면(PPT)</option></select></label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 6 }}>
              <label style={lab}>페이지 칸 나누기
                <select style={inp} value={grid ? 'grid' : pg.layoutId} onChange={(e) => { const v = e.target.value === 'grid' ? 'g2x2' : e.target.value; if (v !== 'custom') setLay({ layoutId: v, custom: null, basePreset: v }); }} data-testid="page-layout">
                  {PAGE_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  <option value="grid">직접 격자 (가로×세로 칸 수)…</option>
                  {pg.layoutId === 'custom' && <option value="custom">✋ 직접 조정한 배치 (끌어서 바꿈)</option>}
                </select>
              </label>
              <label style={lab}>칸 간격(mm)<input type="number" min="0" step="1" style={inp} value={pg.gap} onChange={(e) => num('gap', e.target.value)} /></label>
              {grid && (
                <div style={{ gridColumn: '1 / 3', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
                  가로 <input type="number" min="1" max="6" style={{ ...inp, width: 52 }} value={grid[1]} onChange={(e) => setLay({ layoutId: `g${Math.min(6, Math.max(1, Number(e.target.value) || 1))}x${grid[2]}`, custom: null, basePreset: null })} />칸 ×
                  세로 <input type="number" min="1" max="6" style={{ ...inp, width: 52 }} value={grid[2]} onChange={(e) => setLay({ layoutId: `g${grid[1]}x${Math.min(6, Math.max(1, Number(e.target.value) || 1))}`, custom: null, basePreset: null })} />칸
                </div>
              )}
            </div>

            {info && info.cells.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="page-cells">
                <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>칸을 고른 뒤 아래 “다이어그램 만들기”를 누르면 <b>그 칸 크기에 맞춰</b> 들어갑니다. (페이지 미리보기에서 칸을 직접 눌러도 됩니다)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {info.cells.map((c, i) => (
                    <button key={c.id} style={small(c.id === selCell)} onClick={() => onSelect(c.id)} data-testid={`cell-btn-${c.id}`}
                      title={`${mmText(c.rect)}${c.empty ? ' · 비어 있음' : ' · 채워짐 (끌어서 다른 칸 버튼 위에 놓으면 그림이 옮겨집니다)'}`}
                      draggable={!c.empty && !!onMoveContent}
                      onDragStart={(e) => { e.dataTransfer.setData('text/x-cellid', c.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { if (onMoveContent && [...(e.dataTransfer?.types || [])].includes('text/x-cellid')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                      onDrop={(e) => { const from = e.dataTransfer.getData('text/x-cellid'); if (onMoveContent && from && from !== c.id) { e.preventDefault(); onMoveContent(from, c.id); } }}>
                      칸 {i + 1} · {mmText(c.rect)} {c.empty ? '○' : '●'}
                    </button>
                  ))}
                </div>
                {selRaw && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }} data-testid="cell-mm">
                    {[['x', 'X(mm)', selRaw[0]], ['y', 'Y(mm)', selRaw[1]], ['w', '가로', selRaw[2]], ['h', '세로', selRaw[3]]].map(([k, name, v]) => (
                      <label key={k} style={lab}>{name}<input type="number" step="1" style={inp} value={Math.round(v * 10) / 10} onChange={(e) => onCellMm({ [k]: e.target.value })} data-testid={`cell-${k}`} /></label>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>✋ 오른쪽 페이지 미리보기에서 <b>칸 가장자리의 점을 끌면 크기</b>가 바뀌고(맞닿은 칸도 함께, <b>Alt</b>를 누르고 끌면 이 칸만), <b>칸 안쪽을 끌면 옮겨집니다</b>. 다른 칸·가운데에 가까워지면 붙습니다. 위 숫자로 정확한 위치·크기(mm)도 넣을 수 있습니다.</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={small(false)} onClick={() => onSplit('v')} data-testid="cell-split-v" title="고른 칸을 왼쪽·오른쪽 두 칸으로 나눕니다">칸 좌우로 나누기</button>
                  <button style={small(false)} onClick={() => onSplit('h')} data-testid="cell-split-h" title="고른 칸을 위·아래 두 칸으로 나눕니다">칸 위아래로 나누기</button>
                  <button style={small(false)} onClick={onRemove} disabled={info.cells.length < 2} data-testid="cell-remove" title="고른 칸과 그 칸의 그림을 지웁니다">칸 삭제</button>
                  {pg.layoutId === 'custom' && <button style={small(false)} onClick={onResetLayout} data-testid="layout-reset" title="끌어서 바꾼 것을 버리고 처음 고른 칸 나누기로 되돌립니다">배치 되돌리기</button>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={small(false)} onClick={onClear} disabled={!info.cells.find((c) => c.id === selCell && !c.empty)} data-testid="cell-clear">선택한 칸 비우기</button>
                  {onMoveContent && info.cells.length > 1 && cur && !cur.empty && (
                    <select style={{ ...inp, width: 'auto', fontWeight: 700 }} value="" onChange={(e) => { if (e.target.value) onMoveContent(selCell, e.target.value); }} data-testid="cell-move-to" title="고른 칸의 그림을 다른 칸으로 옮깁니다. 도착 칸에 그림이 있으면 서로 맞바꿉니다">
                      <option value="">↔ 이 그림을 다른 칸으로…</option>
                      {info.cells.map((c, i) => (c.id === selCell ? null : <option key={c.id} value={c.id}>칸 {i + 1} ({mmText(c.rect)}) — {c.empty ? '비어 있음 · 옮기기' : '그림 있음 · 서로 맞바꾸기'}</option>))}
                    </select>
                  )}
                  {onExample && <button style={small(false)} onClick={onExample} data-testid="cell-example" title="AI 없이 예시 그림을 선택한 칸에 넣어 크기·글자 위계를 미리 봅니다">예시 그림 넣어 보기</button>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="page-margin">
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)' }}>바깥 여백 · 테두리선</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={lab}>바깥 여백(가장자리 간격)
                  <select style={inp} value={pg.marginMode} onChange={(e) => { const a = info?.margin; const r1 = (v) => Math.round(v * 10) / 10; set({ marginMode: e.target.value, margin: pg.margin && pg.margin.t !== '' ? pg.margin : { t: a ? r1(a.t) : 12, b: a ? r1(a.b) : 12, l: a ? r1(a.l) : 12, r: a ? r1(a.r) : 12 } }); }} data-testid="margin-mode">
                    <option value="auto">자동{info?.marginAuto ? ` (${Math.round(info.marginAuto * 10) / 10}mm)` : ''}</option><option value="custom">직접 입력(mm)</option>
                  </select>
                </label>
                {pg.marginMode === 'custom' && (
                  <label style={{ ...lab, justifyContent: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)' }}><input type="checkbox" checked={pg.marginLink} onChange={(e) => set({ marginLink: e.target.checked })} data-testid="margin-link" />네 변 같게</span>
                  </label>
                )}
              </div>
              {pg.marginMode === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[['t', '위'], ['b', '아래'], ['l', '왼쪽'], ['r', '오른쪽']].map(([k, name]) => (
                    <label key={k} style={lab}>{name}(mm)<input type="number" min="0" step="1" style={inp} value={pg.margin[k]} data-testid={`margin-${k}`}
                      onChange={(e) => { const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value)); set({ margin: pg.marginLink ? { t: v, b: v, l: v, r: v } : { ...pg.margin, [k]: v } }); }} /></label>
                  ))}
                </div>
              )}
              <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={pg.frame} onChange={(e) => set({ frame: e.target.checked })} data-testid="frame-on" />페이지 가장자리에 테두리선 그리기
              </label>
              {pg.frame && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: 6 }}>
                  <label style={lab}>선 굵기(pt)<input type="number" min="0.1" step="0.25" style={inp} value={pg.frameW} onChange={(e) => num('frameW', e.target.value)} data-testid="frame-w" /></label>
                  <label style={lab}>가장자리에서(mm, 비우면 자동)<input type="number" min="0" step="1" style={inp} value={pg.frameInset} placeholder="자동" onChange={(e) => num('frameInset', e.target.value)} data-testid="frame-inset" /></label>
                  <label style={lab}>색<input type="color" style={{ ...inp, padding: 1, height: 28 }} value={pg.frameColor} onChange={(e) => set({ frameColor: e.target.value })} /></label>
                </div>
              )}
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>여백은 제목·그림이 들어갈 영역과 용지 가장자리 사이의 간격입니다. 인쇄할 때는 프린터가 못 찍는 가장자리(보통 4~5mm)와 제본 여백을 생각해 정하세요. 테두리선은 여백 안쪽에 둘레를 두릅니다.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="page-type">
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)' }}>글자 크기(pt) — 위계는 제목 &gt; 소제목 &gt; 본문 &gt; 작은 글자</span>
              {rows.map(([k, name, desc]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '58px 64px 1fr', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={desc}>{name}</span>
                  <input type="number" min="4" step="0.5" style={inp} value={pg.sizes[k] ?? ''} placeholder={String(rec[k])} onChange={(e) => setSize(k, e.target.value)} data-testid={`pt-${k}`} />
                  <span style={{ color: 'var(--text-tertiary, #64748b)' }}>추천 {rec[k]}pt{k === 'label' && cur?.engine ? ` · 지금 결과 ${cur.engine.label}pt` : ''}{k === 'small' && cur?.engine ? ` · 지금 ${cur.engine.small}pt` : ''}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={small(false)} onClick={() => set({ sizes: { title: null, sub: null, label: null, small: null } })}>추천값으로 되돌리기</button>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>제목·소제목(칸 제목)은 이 pt 로 그립니다. 다이어그램 속 글자는 그림이 정한 크기라서, 칸에 맞춘 뒤의 <b>실제 pt</b> 를 계산해 위에 보여 드리고 너무 작으면 경고합니다.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={{ ...lab, gridColumn: '1 / 3' }}>글씨체
                <select style={inp} value={pg.font} onChange={(e) => set({ font: e.target.value })} data-testid="page-font">{FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
              </label>
              <span style={{ gridColumn: '1 / 3', fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>{recommendFont(pg.medium)} 저장한 SVG 는 <b>그 PC 에 이 글꼴이 설치돼 있어야</b> 그대로 보입니다(없으면 비슷한 글꼴로 바뀜).</span>
              <label style={{ ...lab, gridColumn: '1 / 3' }}>그림·글자 맞춤
                <select style={inp} value={pg.fit || 'both'} onChange={(e) => set({ fit: e.target.value })} data-testid="page-fit">
                  <option value="both">칸을 꽉 채우고, 그림 속 글자는 본문 목표 pt 에 맞추기 (권장)</option>
                  <option value="fill">칸을 꽉 채우기 (글자 크기는 그림 배율을 따름)</option>
                  <option value="text">본문 글자를 목표 pt 에 맞추기 (그림을 줄임, 칸이 남음)</option>
                </select>
              </label>
              <span style={{ gridColumn: '1 / 3', fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>권장 방식은 그림은 칸에 맞춘 배율 그대로 두고, <b>그림 속 모든 글자에 같은 비율</b>을 곱해 가장 많이 쓰인 글자(본문)가 위의 목표 pt 가 되게 합니다(그림 속 글자끼리의 크기 차이는 유지, 글자 가운데 위치 유지, 키울 때는 최대 1.3배·줄일 때는 0.3배까지). 그래서 큰 칸에서도 글자가 소제목보다 커지지 않습니다.</span>
              <label style={lab}>PNG 해상도<select style={inp} value={pg.dpi} onChange={(e) => num('dpi', e.target.value)}><option value={96}>96dpi (화면)</option><option value={150}>150dpi</option><option value={300}>300dpi (인쇄)</option></select></label>
              <label style={{ ...lab, gridColumn: '1 / 3' }}>페이지 제목 (비우면 그림의 제목)<input style={inp} value={pg.title} onChange={(e) => set({ title: e.target.value })} data-testid="page-title" /></label>
              <label style={{ ...lab, gridColumn: '1 / 3' }}>페이지 소제목 (선택)<input style={inp} value={pg.subtitle} onChange={(e) => set({ subtitle: e.target.value })} data-testid="page-subtitle" /></label>
            </div>

            {info?.warnings?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="page-warnings">
                {info.warnings.map((w, i) => <span key={i} style={{ fontSize: 11.5, lineHeight: 1.5, color: w.level === 'warn' ? '#B91C1C' : '#475569' }}>{w.level === 'warn' ? '⚠️' : 'ℹ️'} {w.text}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
