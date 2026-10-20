import React, { useMemo, useState } from 'react';
import { ICON_GROUPS, ICON_LABEL, iconGlyph } from './conceptDiagram/icons';

// 아이콘 고르기: 분류 탭 + 검색(한국어 뜻·영문 이름). value = 지금 아이콘 이름, onPick(이름)
export default function IconPicker({ value, onPick, testid = 'icon-picker' }) {
  const [g, setG] = useState(() => (ICON_GROUPS.find((x) => x.names.includes(value)) || ICON_GROUPS[0]).id);
  const [q, setQ] = useState('');
  const key = q.trim().toLowerCase();
  const names = useMemo(() => {
    if (key) return ICON_GROUPS.flatMap((x) => x.names).filter((n) => n.includes(key) || (ICON_LABEL[n] || '').toLowerCase().includes(key));
    return (ICON_GROUPS.find((x) => x.id === g) || ICON_GROUPS[0]).names;
  }, [g, key]);
  const tab = (on) => ({ padding: '3px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent-cyan)' : 'var(--border-color)'}`, background: on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: on ? 'var(--accent-cyan)' : 'var(--text-secondary)' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid={testid}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="아이콘 찾기 (예: 주차, 태양, bus)" style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, width: '100%', boxSizing: 'border-box' }} data-testid={`${testid}-search`} />
      {!key && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ICON_GROUPS.map((x) => <button key={x.id} type="button" style={tab(x.id === g)} onClick={() => setG(x.id)} data-testid={`${testid}-tab-${x.id}`}>{x.label}</button>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, maxHeight: 168, overflowY: 'auto', padding: 2 }}>
        {names.map((n) => (
          <button key={n} type="button" title={`${ICON_LABEL[n]} (${n})`} onClick={() => onPick(n)} data-testid={`icon-${n}`}
            style={{ aspectRatio: '1', padding: 2, borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${n === value ? 'var(--accent-cyan)' : 'var(--border-color)'}`, background: n === value ? 'rgba(51,51,153,0.12)' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 20 20" width="22" height="22" dangerouslySetInnerHTML={{ __html: iconGlyph(n, '#334155') }} />
          </button>
        ))}
        {!names.length && <span style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>찾는 아이콘이 없습니다.</span>}
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)' }}>{value ? `${ICON_LABEL[value] || value} (${value})` : ''}</span>
    </div>
  );
}
