import React from 'react';
import { PAGE_PRESETS, PAGE_LAYOUTS, FONT_OPTIONS, LABEL_PREFIXES, presetById, recommendType, recommendFont } from './conceptDiagram/page';

// 페이지 설정(다이어그램 탭 왼쪽 ② 페이지). 계산은 conceptDiagram/page.js 가 하고 여기는 입력만 받는다.
// 2026-10-20 단순화(R9 후속): 기본으로 보이는 것은 켜기 · 용지 크기 · 칸 배치(그림으로 고름)뿐이고, 칸은 오른쪽 미리보기에서 직접 눌러 고른다.
// 선택한 칸의 크기·라벨·옮기기와 칸 간격·여백·글자·머리꼬리는 접어 두었다. 긴 안내문은 마우스를 올리면 나오는 설명(title)으로만 둔다.
const inp = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box', width: '100%' };
const lab = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
const small = (on) => ({ padding: '4px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: on ? '1px solid var(--primary)' : '1px solid var(--line-strong)', background: on ? 'var(--primary-soft)' : 'var(--surface)', color: on ? 'var(--warn)' : 'var(--text-secondary)' });
const sum = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' };
const mmText = (r) => `${Math.round(r[2])}×${Math.round(r[3])}mm`;

// 칸 배치 미리 그림: 비율 상자(0~1)를 작은 그림으로
function LayoutThumb({ layout, on, onClick }) {
  const W = 52; const H = 38; const g = 1.2;
  return (
    <button type="button" onClick={onClick} title={layout.label} aria-label={layout.label} data-testid={`page-layout-${layout.id}`}
      style={{ padding: 3, borderRadius: 6, cursor: 'pointer', border: on ? '2px solid var(--primary)' : '1px solid var(--border-color)', background: on ? 'var(--primary-soft)' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 52 }}>
        {layout.cells.map((c, i) => <rect key={i} x={c[0] * W + g} y={c[1] * H + g} width={Math.max(2, (c[2] - c[0]) * W - 2 * g)} height={Math.max(2, (c[3] - c[1]) * H - 2 * g)} rx="1.5" fill={on ? '#F5B26B' : '#C9D2DE'} stroke={on ? '#E8833A' : '#8A96A8'} strokeWidth="0.8" />)}
      </svg>
    </button>
  );
}

export default function PageBox({ on, setOn, pg, setPg, info, selCell, onClear, onExample, selRaw, onCellMm, onSplit, onRemove, onResetLayout, setLayout, onMoveContent, selMeta, autoLabel, onCellMeta }) {
  const set = (patch) => setPg((p) => ({ ...p, ...patch }));
  const setLay = setLayout || set; // 칸 배치를 바꿀 때는 되돌리기 기록을 남기는 쪽으로
  const rec = recommendType({ w: Number(pg.w) || 420, h: Number(pg.h) || 297, medium: pg.medium });
  const pickPreset = (id) => { const p = presetById(id); set(id === 'custom' ? { preset: id } : { preset: id, w: p.w, h: p.h, medium: p.medium }); };
  const num = (k, v) => set({ [k]: v === '' ? '' : Number(v) });
  const grid = /^g(\d)x(\d)$/.exec(pg.layoutId);
  const setSize = (k, v) => set({ sizes: { ...pg.sizes, [k]: v === '' ? null : Number(v) } });
  const cells = info?.cells || [];
  const cur = cells.find((c) => c.id === selCell);
  const curNo = cells.findIndex((c) => c.id === selCell) + 1;
  const rows = [['title', '제목', '페이지 제목'], ['sub', '소제목', '부제 · 칸 제목'], ['label', '본문', '다이어그램 속 글자(목표)'], ['small', '작은 글자', '범례·각주']];
  const setGrid = (gx, gy) => setLay({ layoutId: `g${Math.min(6, Math.max(1, Number(gx) || 1))}x${Math.min(6, Math.max(1, Number(gy) || 1))}`, custom: null, basePreset: null });
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }} data-testid="page-box">
      <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }} title="켜면 오른쪽에 페이지 미리보기가 생기고, 그림을 칸에 나눠 넣어 정해진 용지 크기로 저장합니다.">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} data-testid="page-on" />페이지에 맞춰 만들기 (여러 그림을 한 장에)
      </label>
      {!on && (
        <p style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary, #64748b)' }} data-testid="page-off-note">
          켜면 용지 크기와 칸 배치를 고를 수 있습니다. <button style={{ ...small(true), marginLeft: 4 }} onClick={() => setOn(true)} data-testid="page-on-btn">지금 켜기</button>
        </p>
      )}
      {on && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }} data-testid="page-settings">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
            <label style={lab}>용지·화면 크기
              <select style={inp} value={pg.preset} onChange={(e) => pickPreset(e.target.value)} data-testid="page-preset">{PAGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
            </label>
            <button style={small(false)} onClick={() => set({ preset: 'custom', w: pg.h, h: pg.w })} title="가로와 세로를 맞바꿉니다" data-testid="page-swap">↔ 가로·세로</button>
          </div>
          {pg.preset === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={lab}>가로(mm)<input type="number" min="30" step="1" style={inp} value={pg.w} onChange={(e) => { num('w', e.target.value); set({ preset: 'custom' }); }} data-testid="page-w" /></label>
              <label style={lab}>세로(mm)<input type="number" min="30" step="1" style={inp} value={pg.h} onChange={(e) => { num('h', e.target.value); set({ preset: 'custom' }); }} data-testid="page-h" /></label>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...lab, flexDirection: 'row', justifyContent: 'space-between' }} title="오른쪽 미리보기에서 칸을 직접 눌러 고르고, 칸 가장자리의 점을 끌어 크기를 바꿀 수 있습니다. 칸을 고른 뒤 ① 만들기에서 다이어그램을 만들면 그 칸 크기에 맞춰 들어갑니다.">
              <span>칸 배치 <span style={{ color: '#94a3b8' }}>(칸은 오른쪽 미리보기에서 눌러 고릅니다)</span></span>
              {grid ? <span>직접 격자 {grid[1]}×{grid[2]}</span> : pg.layoutId === 'custom' ? <span>직접 조정한 배치</span> : null}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }} data-testid="page-layout">
              {PAGE_LAYOUTS.map((l) => <LayoutThumb key={l.id} layout={l} on={!grid && pg.layoutId === l.id} onClick={() => setLay({ layoutId: l.id, custom: null, basePreset: l.id })} />)}
            </div>
            {pg.layoutId === 'custom' && <div><button style={small(false)} onClick={onResetLayout} data-testid="layout-reset" title="끌어서 바꾼 것을 버리고 처음 고른 칸 나누기로 되돌립니다">↺ 직접 조정한 배치 되돌리기</button></div>}
          </div>

          {info?.warnings?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="page-warnings">
              {info.warnings.map((w, i) => <span key={i} style={{ fontSize: 11.5, lineHeight: 1.5, color: w.level === 'warn' ? '#B91C1C' : '#475569' }}>{w.level === 'warn' ? '' : 'ℹ️'} {w.text}</span>)}
            </div>
          )}

          {cells.length > 0 && (
            <details data-testid="page-cell-details">
              <summary style={sum} title="미리보기에서 고른 칸의 크기·라벨·옮기기·나누기">선택한 칸 설정{curNo ? ` — 칸 ${curNo}${cur ? ` · ${mmText(cur.rect)}` : ''}` : ''}</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }} data-testid="page-cells">
                {selRaw && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }} data-testid="cell-mm" title="정확한 위치·크기(mm)를 직접 넣을 수 있습니다">
                    {[['x', 'X(mm)', selRaw[0]], ['y', 'Y(mm)', selRaw[1]], ['w', '가로', selRaw[2]], ['h', '세로', selRaw[3]]].map(([k, name, v]) => (
                      <label key={k} style={lab}>{name}<input type="number" step="1" style={inp} value={Math.round(v * 10) / 10} onChange={(e) => onCellMm({ [k]: e.target.value })} data-testid={`cell-${k}`} /></label>
                    ))}
                  </div>
                )}
                {cells.length > 1 && onCellMeta && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'end' }} data-testid="cell-meta">
                    <label style={lab} title={`칸 위에 '─── STEP 01 ───' 모양으로 붙는 라벨입니다${pg.labelPrefix ? '' : '(세부 설정의 머리·꼬리에서 접두어를 고르면 자동 번호)'}`}>이 칸의 라벨
                      <input style={inp} maxLength={30} value={selMeta?.label ?? autoLabel ?? ''} placeholder={autoLabel || '라벨 없음'} onChange={(e) => onCellMeta({ label: e.target.value })} data-testid="cell-label" />
                    </label>
                    <button style={small(false)} onClick={() => onCellMeta({ label: null })} disabled={selMeta?.label === undefined || selMeta?.label === null} title="직접 고친 라벨을 버리고 자동 번호로 되돌립니다" data-testid="cell-label-auto">↺ 자동</button>
                    <label style={{ ...lab, gridColumn: '1 / 3' }} title="칸 제목 아래 최대 2줄, 칸이 작으면 생략됩니다">이 칸의 설명
                      <input style={inp} maxLength={90} value={selMeta?.desc ?? ''} placeholder="예) 소음과 진동 등 환경적인 조건을 고려하여 1층에 배치한다" onChange={(e) => onCellMeta({ desc: e.target.value })} data-testid="cell-desc" />
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={small(false)} onClick={() => onSplit('v')} data-testid="cell-split-v" title="고른 칸을 왼쪽·오른쪽 두 칸으로 나눕니다">좌우로 나누기</button>
                  <button style={small(false)} onClick={() => onSplit('h')} data-testid="cell-split-h" title="고른 칸을 위·아래 두 칸으로 나눕니다">위아래로 나누기</button>
                  <button style={small(false)} onClick={onRemove} disabled={cells.length < 2} data-testid="cell-remove" title="고른 칸과 그 칸의 그림을 지웁니다">칸 삭제</button>
                  <button style={small(false)} onClick={onClear} disabled={!cells.find((c) => c.id === selCell && !c.empty)} data-testid="cell-clear" title="고른 칸의 그림만 비웁니다">칸 비우기</button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {onMoveContent && cells.length > 1 && cur && !cur.empty && (
                    <select style={{ ...inp, width: 'auto', fontWeight: 700 }} value="" onChange={(e) => { if (e.target.value) onMoveContent(selCell, e.target.value); }} data-testid="cell-move-to" title="고른 칸의 그림을 다른 칸으로 옮깁니다. 도착 칸에 그림이 있으면 서로 맞바꿉니다">
                      <option value="">↔ 이 그림을 다른 칸으로…</option>
                      {cells.map((c, i) => (c.id === selCell ? null : <option key={c.id} value={c.id}>칸 {i + 1} ({mmText(c.rect)}) — {c.empty ? '비어 있음 · 옮기기' : '그림 있음 · 서로 맞바꾸기'}</option>))}
                    </select>
                  )}
                  {onExample && <button style={small(false)} onClick={onExample} data-testid="cell-example" title="AI 없이 예시 그림을 선택한 칸에 넣어 크기·글자 위계를 미리 봅니다">예시 그림 넣어 보기</button>}
                </div>
              </div>
            </details>
          )}

          <details data-testid="page-more">
            <summary style={sum} title="칸 간격·직접 격자·여백·테두리·글자 크기·글꼴·머리 꼬리">세부 설정</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={lab}>칸 간격(mm)<input type="number" min="0" step="1" style={inp} value={pg.gap} onChange={(e) => num('gap', e.target.value)} data-testid="page-gap" /></label>
                <label style={lab}>용도<select style={inp} value={pg.medium} onChange={(e) => set({ medium: e.target.value })} data-testid="page-medium"><option value="print">인쇄(보드·보고서)</option><option value="screen">화면(PPT)</option></select></label>
                <div style={{ gridColumn: '1 / 3', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }} title="가로·세로 칸 수를 1~6으로 직접 정해 균등 격자로 나눕니다">
                  직접 격자 가로 <input type="number" min="1" max="6" style={{ ...inp, width: 52 }} value={grid ? grid[1] : ''} placeholder="-" onChange={(e) => setGrid(e.target.value, grid ? grid[2] : 2)} data-testid="grid-x" />칸 ×
                  세로 <input type="number" min="1" max="6" style={{ ...inp, width: 52 }} value={grid ? grid[2] : ''} placeholder="-" onChange={(e) => setGrid(grid ? grid[1] : 2, e.target.value)} data-testid="grid-y" />칸
                </div>
              </div>

              <details data-testid="page-margin-details">
                <summary style={sum} title="여백은 제목·그림이 들어갈 영역과 용지 가장자리 사이의 간격입니다. 인쇄할 때는 프린터가 못 찍는 가장자리(보통 4~5mm)와 제본 여백을 생각해 정하세요.">바깥 여백 · 테두리선</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }} data-testid="page-margin">
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
                  <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)' }} title="여백 안쪽에 둘레를 두릅니다">
                    <input type="checkbox" checked={pg.frame} onChange={(e) => set({ frame: e.target.checked })} data-testid="frame-on" />페이지 가장자리에 테두리선 그리기
                  </label>
                  {pg.frame && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: 6 }}>
                      <label style={lab}>선 굵기(pt)<input type="number" min="0.1" step="0.25" style={inp} value={pg.frameW} onChange={(e) => num('frameW', e.target.value)} data-testid="frame-w" /></label>
                      <label style={lab}>가장자리에서(mm)<input type="number" min="0" step="1" style={inp} value={pg.frameInset} placeholder="자동" onChange={(e) => num('frameInset', e.target.value)} data-testid="frame-inset" /></label>
                      <label style={lab}>색<input type="color" style={{ ...inp, padding: 1, height: 28 }} value={pg.frameColor} onChange={(e) => set({ frameColor: e.target.value })} /></label>
                    </div>
                  )}
                </div>
              </details>

              <details data-testid="page-type-details">
                <summary style={sum} title="제목 > 소제목 > 본문 > 작은 글자 순으로 정합니다. 다이어그램 속 글자는 그림이 정한 크기라, 칸에 맞춘 뒤의 실제 pt 를 계산해 보여 주고 너무 작으면 경고합니다.">글자 크기 · 글꼴 · 맞춤 · 저장 해상도</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="page-type">
                    {rows.map(([k, name, desc]) => (
                      <div key={k} style={{ display: 'grid', gridTemplateColumns: '58px 64px 1fr', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={desc}>{name}</span>
                        <input type="number" min="4" step="0.5" style={inp} value={pg.sizes[k] ?? ''} placeholder={String(rec[k])} onChange={(e) => setSize(k, e.target.value)} data-testid={`pt-${k}`} />
                        <span style={{ color: 'var(--text-tertiary, #64748b)' }}>추천 {rec[k]}pt{k === 'label' && cur?.engine ? ` · 지금 결과 ${cur.engine.label}pt` : ''}{k === 'small' && cur?.engine ? ` · 지금 ${cur.engine.small}pt` : ''}</span>
                      </div>
                    ))}
                    <div><button style={small(false)} onClick={() => set({ sizes: { title: null, sub: null, label: null, small: null } })}>추천값으로 되돌리기</button></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ ...lab, gridColumn: '1 / 3' }} title={`${recommendFont(pg.medium)} 저장한 SVG 는 그 PC 에 이 글꼴이 설치돼 있어야 그대로 보입니다(없으면 비슷한 글꼴로 바뀜).`}>글씨체
                      <select style={inp} value={pg.font} onChange={(e) => set({ font: e.target.value })} data-testid="page-font">{FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                    </label>
                    <label style={{ ...lab, gridColumn: '1 / 3' }} title="권장 방식은 그림은 칸에 맞춘 배율 그대로 두고, 그림 속 모든 글자에 같은 비율을 곱해 가장 많이 쓰인 글자(본문)가 목표 pt 가 되게 합니다. 그래서 큰 칸에서도 글자가 소제목보다 커지지 않습니다.">그림·글자 맞춤
                      <select style={inp} value={pg.fit || 'both'} onChange={(e) => set({ fit: e.target.value })} data-testid="page-fit">
                        <option value="both">칸을 꽉 채우고, 그림 속 글자는 본문 목표 pt 에 맞추기 (권장)</option>
                        <option value="fill">칸을 꽉 채우기 (글자 크기는 그림 배율을 따름)</option>
                        <option value="text">본문 글자를 목표 pt 에 맞추기 (그림을 줄임, 칸이 남음)</option>
                      </select>
                    </label>
                    <label style={lab}>PNG 해상도<select style={inp} value={pg.dpi} onChange={(e) => num('dpi', e.target.value)}><option value={96}>96dpi (화면)</option><option value={150}>150dpi</option><option value={300}>300dpi (인쇄)</option></select></label>
                  </div>
                </div>
              </details>

              <details data-testid="page-head-details">
                <summary style={sum} title="구분 라벨·제목은 미리보기 위에서 눌러 바로 고칠 수도 있고, 칸 라벨·설명은 더블클릭으로 고칩니다. 꼬리말은 오른쪽 아래에 나오며 아래 여백이 너무 좁으면 알려 드립니다.">머리 · 꼬리 (제목 · 구분 라벨 · 쪽번호 · 칸 라벨)</summary>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                  <label style={{ ...lab, gridColumn: '1 / 3' }} title="강조할 말은 {중괄호}로: 공원 속 {체육센터}">페이지 제목 (비우면 그림의 제목)<input style={inp} value={pg.title} onChange={(e) => set({ title: e.target.value })} data-testid="page-title" /></label>
                  <label style={{ ...lab, gridColumn: '1 / 3' }}>페이지 소제목 (선택)<input style={inp} value={pg.subtitle} onChange={(e) => set({ subtitle: e.target.value })} data-testid="page-subtitle" /></label>
                  <label style={{ ...lab, gridColumn: '1 / 3' }} title="제목 위 작은 글자 '| 구조계획 |'">구분 라벨 (선택)<input style={inp} maxLength={30} value={pg.kicker || ''} onChange={(e) => set({ kicker: e.target.value })} data-testid="page-kicker" /></label>
                  <label style={{ ...lab, gridColumn: '1 / 3' }} title="예: 종단면도 / SCALE : 1/400 — ' / ' 로 나누면 첫 줄은 굵게, 나머지는 작은 회색 줄">오른쪽 위 도면 라벨 (선택)<input style={inp} maxLength={60} value={pg.corner || ''} onChange={(e) => set({ corner: e.target.value })} data-testid="page-corner" /></label>
                  <label style={lab}>프로젝트명 (꼬리말)<input style={inp} maxLength={40} value={pg.project || ''} onChange={(e) => set({ project: e.target.value })} data-testid="page-project" /></label>
                  <label style={lab}>쪽번호 (숫자)<input style={inp} maxLength={4} value={pg.pageNo || ''} onChange={(e) => set({ pageNo: e.target.value })} data-testid="page-no" placeholder="예) 2 → 02" /></label>
                  <label style={lab} title="큰 그림 칸(작은 칸들의 2배 이상)은 번호를 건너뛰고 작은 칸이 01부터 번호를 받습니다">칸 라벨 접두어
                    <select style={inp} value={pg.labelPrefix || ''} onChange={(e) => set({ labelPrefix: e.target.value })} data-testid="page-label-prefix">{LABEL_PREFIXES.map(([v, t]) => <option key={v} value={v}>{t}{v ? ` 01, ${v} 02…` : ''}</option>)}</select>
                  </label>
                  <label style={lab}>강조색<input type="color" style={{ ...inp, padding: 1, height: 28 }} value={pg.accent || '#F28C28'} onChange={(e) => set({ accent: e.target.value })} data-testid="page-accent" /></label>
                </div>
              </details>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
