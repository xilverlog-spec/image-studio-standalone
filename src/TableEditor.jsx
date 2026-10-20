import React, { useState } from 'react';
import { parseTableText, normalizeTable, tableSetCell, tableAddRow, tableDelRow, tableMoveRow, tableSetCols, tableHasEmpty, tableFillEmpty, TABLE_STYLE_LABEL, TABLE_MAX_ROWS } from './conceptDiagram/table';

// 개요표 속성: 제목 · 열 수(2~4) · 스타일 · 행 목록(칸마다 입력, 위·아래·삭제) · 행 추가. onChange(새 표, 되돌리기 묶음용 키)
// compact(개요표 칸의 왼쪽 ③ 탭): 글자 입력칸을 두지 않는다 — 칸·제목은 그림 위에서 더블클릭해 고치고, 여기서는 행·열·스타일·붙여넣기만 다룬다(새 행·열에는 기본 글자가 들어간다).
export default function TableEditor({ table, onChange, testid = 'table-editor', compact = false }) {
  const t = normalizeTable(table);
  const [note, setNote] = useState(''); const [raw, setRaw] = useState('');
  const apply = (text, html) => { // 엑셀·한글·웹에서 복사한 표(탭으로 나뉜 글자 또는 HTML 표)를 지금 표로 바꾼다(스타일은 그대로)
    const r = parseTableText(text, html);
    if (!r) { setNote('표로 읽지 못했습니다. 엑셀·한글에서 표 영역을 복사(Ctrl+C)해 여기에 붙여넣어 주세요.'); return; }
    onChange({ ...r.table, style: t.style, title: r.title || t.title }, '');
    setRaw(''); setNote(`${r.table.rows.length}행 × ${r.table.cols}열로 바꿨습니다${r.truncated ? ' — 4열을 넘는 오른쪽 열은 잘렸습니다' : ''}${r.droppedRows ? ` — ${r.droppedRows}행은 30행을 넘어 잘렸습니다` : ''}.`);
  };
  const btn = (on, danger) => ({ padding: '3px 7px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--border-color)'}`, background: danger ? 'var(--err-soft)' : on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)' });
  const inp = { padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border-color)', fontSize: 11.5, width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'rgba(255,255,255,0.95)', color: 'var(--text-primary)' };
  const lab = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-tertiary, #64748b)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid={testid}>
      <details data-testid={`${testid}-paste-box`}>
        <summary style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>엑셀·한글 표 붙여넣기</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
          <textarea style={{ ...inp, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="여기에 엑셀·한글의 표를 붙여넣으세요(Ctrl+V). 지금 표의 내용이 바뀝니다."
            onPaste={(e) => { const tx = e.clipboardData?.getData('text/plain') || ''; const ht = e.clipboardData?.getData('text/html') || ''; if (tx || ht) { e.preventDefault(); apply(tx, ht); } }} data-testid={`${testid}-paste`} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" style={btn(false)} disabled={!raw.trim()} onClick={() => apply(raw, '')} data-testid={`${testid}-paste-apply`}>글자를 표로 바꾸기</button>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.4 }} data-testid={`${testid}-paste-note`}>{note || '탭·쉼표·| 로 나뉜 글자와 HTML 표를 읽습니다(최대 4열 30행). 첫 줄이 한 칸짜리면 표 제목이 됩니다.'}</span>
          </div>
        </div>
      </details>
      {!compact && (
        <label style={lab}>표 제목 (비워도 됩니다)
          <input style={inp} value={t.title} maxLength={40} onChange={(e) => onChange(tableSetCell(t, -1, 0, e.target.value), 'title')} data-testid={`${testid}-title`} />
        </label>
      )}
      <div style={lab}>열 수
        <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4].map((n) => <button key={n} type="button" style={{ ...btn(t.cols === n), flex: 1 }} onClick={() => onChange(tableSetCols(t, n, compact))} data-testid={`${testid}-cols-${n}`}>{n}열</button>)}</div>
      </div>
      <div style={lab}>스타일
        <div style={{ display: 'flex', gap: 6 }}>{Object.entries(TABLE_STYLE_LABEL).map(([v, name]) => <button key={v} type="button" style={{ ...btn(t.style === v), flex: 1, lineHeight: 1.25 }} onClick={() => onChange({ ...t, style: v })} data-testid={`${testid}-style-${v}`}>{name}</button>)}</div>
      </div>
      <div style={lab}>행 ({t.rows.length}){compact ? ' — 글자는 그림에서 더블클릭해서 고칩니다' : ' — 칸을 고치거나 그림에서 칸을 더블클릭하세요'}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
          {t.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }} data-testid={`${testid}-row-${i}`}>
              {compact
                ? <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.join(' | ')}>{i + 1}. {row.filter(Boolean).join(' · ') || '(빈 행)'}</span>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.cols}, minmax(0, 1fr))`, gap: 3, flex: 1, minWidth: 0 }}>
                    {row.map((v, j) => <input key={j} style={inp} value={v} maxLength={40} onChange={(e) => onChange(tableSetCell(t, i, j, e.target.value), `cell:${i},${j}`)} data-testid={`${testid}-cell-${i}-${j}`} />)}
                  </div>
                )}
              <button type="button" style={{ ...btn(false), padding: '2px 5px' }} disabled={i === 0} onClick={() => onChange(tableMoveRow(t, i, -1))} title="위로" data-testid={`${testid}-up-${i}`}>▲</button>
              <button type="button" style={{ ...btn(false), padding: '2px 5px' }} disabled={i === t.rows.length - 1} onClick={() => onChange(tableMoveRow(t, i, 1))} title="아래로" data-testid={`${testid}-down-${i}`}>▼</button>
              <button type="button" style={{ ...btn(false, true), padding: '2px 5px' }} disabled={t.rows.length <= 1} onClick={() => onChange(tableDelRow(t, i))} title="이 행 지우기" data-testid={`${testid}-del-${i}`}>×</button>
            </div>
          ))}
        </div>
        <button type="button" style={btn(false)} disabled={t.rows.length >= TABLE_MAX_ROWS} onClick={() => onChange(tableAddRow(t, undefined, compact))} data-testid={`${testid}-add-row`}>＋ 행 추가</button>
        {compact && tableHasEmpty(t) && <button type="button" style={btn(false)} onClick={() => onChange(tableFillEmpty(t))} data-testid={`${testid}-fill-empty`} title="비어 있는 칸은 그림 위에서 누를 수 없으니 '–' 로 채웁니다">빈 칸을 – 로 채우기</button>}
      </div>
    </div>
  );
}
