import React from 'react';
import { normalizeTable, tableSetCell, tableAddRow, tableDelRow, tableMoveRow, tableSetCols, TABLE_STYLE_LABEL, TABLE_MAX_ROWS } from './conceptDiagram/table';

// 개요표 속성: 제목 · 열 수(2~4) · 스타일 · 행 목록(칸마다 입력, 위·아래·삭제) · 행 추가. onChange(새 표, 되돌리기 묶음용 키)
export default function TableEditor({ table, onChange, testid = 'table-editor' }) {
  const t = normalizeTable(table);
  const btn = (on, danger) => ({ padding: '3px 7px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${danger ? '#fca5a5' : on ? 'var(--accent-cyan)' : 'var(--border-color)'}`, background: danger ? '#fef2f2' : on ? 'rgba(51,51,153,0.12)' : 'rgba(255,255,255,0.85)', color: danger ? '#B91C1C' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)' });
  const inp = { padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border-color)', fontSize: 11.5, width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'rgba(255,255,255,0.95)', color: 'var(--text-primary)' };
  const lab = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid={testid}>
      <label style={lab}>표 제목 (비워도 됩니다)
        <input style={inp} value={t.title} maxLength={40} onChange={(e) => onChange(tableSetCell(t, -1, 0, e.target.value), 'title')} data-testid={`${testid}-title`} />
      </label>
      <div style={lab}>열 수
        <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4].map((n) => <button key={n} type="button" style={{ ...btn(t.cols === n), flex: 1 }} onClick={() => onChange(tableSetCols(t, n))} data-testid={`${testid}-cols-${n}`}>{n}열</button>)}</div>
      </div>
      <div style={lab}>스타일
        <div style={{ display: 'flex', gap: 6 }}>{Object.entries(TABLE_STYLE_LABEL).map(([v, name]) => <button key={v} type="button" style={{ ...btn(t.style === v), flex: 1, lineHeight: 1.25 }} onClick={() => onChange({ ...t, style: v })} data-testid={`${testid}-style-${v}`}>{name}</button>)}</div>
      </div>
      <div style={lab}>행 ({t.rows.length}) — 칸을 고치거나 그림에서 칸을 더블클릭하세요
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
          {t.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }} data-testid={`${testid}-row-${i}`}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.cols}, minmax(0, 1fr))`, gap: 3, flex: 1, minWidth: 0 }}>
                {row.map((v, j) => <input key={j} style={inp} value={v} maxLength={40} onChange={(e) => onChange(tableSetCell(t, i, j, e.target.value), `cell:${i},${j}`)} data-testid={`${testid}-cell-${i}-${j}`} />)}
              </div>
              <button type="button" style={{ ...btn(false), padding: '2px 5px' }} disabled={i === 0} onClick={() => onChange(tableMoveRow(t, i, -1))} title="위로" data-testid={`${testid}-up-${i}`}>▲</button>
              <button type="button" style={{ ...btn(false), padding: '2px 5px' }} disabled={i === t.rows.length - 1} onClick={() => onChange(tableMoveRow(t, i, 1))} title="아래로" data-testid={`${testid}-down-${i}`}>▼</button>
              <button type="button" style={{ ...btn(false, true), padding: '2px 5px' }} disabled={t.rows.length <= 1} onClick={() => onChange(tableDelRow(t, i))} title="이 행 지우기" data-testid={`${testid}-del-${i}`}>×</button>
            </div>
          ))}
        </div>
        <button type="button" style={btn(false)} disabled={t.rows.length >= TABLE_MAX_ROWS} onClick={() => onChange(tableAddRow(t))} data-testid={`${testid}-add-row`}>＋ 행 추가</button>
      </div>
    </div>
  );
}
