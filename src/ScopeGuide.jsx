import React, { useMemo, useState } from 'react';
import { EXAMPLE_SPECS, renderSpec } from './conceptDiagram/spec';
import { CATALOG, STATUS_LABEL, catalogById, pictoSvg } from './conceptDiagram/scope';

// 다이어그램 종류 안내: 종류마다 예시 썸네일 + '만들 수 있는 것 / 없는 것 / 넣어야 하는 입력'. 지원하지 않는 종류와 대신 쓸 방법도 함께 보여 준다.
const dataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const BADGE = { ok: { bg: '#DCFCE7', fg: '#166534' }, plan: { bg: '#FEF3C7', fg: '#92400E' }, no: { bg: '#FEE2E2', fg: '#991B1B' } };
const GROUPS = [['text', '설명만으로 만들기'], ['image', '이미지를 올려서 만들기 (자동 판단 또는 직접 고르기)']]; // '지원하지 않는 것'은 목록에 싣지 않는다(2026-10-20 사용자 의견). 그런 설명을 쓰면 만들기 전에 알리는 안내(scope.js)는 그대로

// 카탈로그 항목의 썸네일 주소(생성 종류는 실제 예시를 그려 보여 준다. 그릴 수 없으면 빈 칸)
export function useThumbs() {
  return useMemo(() => {
    const out = {};
    CATALOG.forEach((c) => {
      try {
        if (c.thumb?.type) out[c.id] = dataUrl(renderSpec(c.thumb.type, EXAMPLE_SPECS[c.thumb.type]).svg);
        else if (c.thumb?.picto) out[c.id] = dataUrl(pictoSvg(c.thumb.picto));
      } catch { out[c.id] = ''; }
    });
    return out;
  }, []);
}

const List = ({ title, items, color }) => (items?.length ? (
  <div style={{ marginTop: 4 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color }}>{title}</div>
    <ul style={{ margin: '2px 0 0', paddingLeft: 15, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  </div>
) : null);

// 카드 하나(펼치면 자세히). onPick: 설명만으로 만드는 종류를 바로 고른다
function Card({ c, thumbs, open, onToggle, onPick, picked, onPickImage, pickedImage, withImage }) {
  const b = BADGE[c.status];
  return (
    <div style={{ border: `1px solid ${picked || pickedImage ? 'var(--primary)' : 'var(--border-color)'}`, borderRadius: 8, background: 'var(--surface)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, gridColumn: open ? '1 / 3' : undefined }} data-testid={`scope-card-${c.id}`}>
      {thumbs[c.id] ? <img src={thumbs[c.id]} alt={c.label} style={{ width: '100%', height: open ? 130 : 70, objectFit: 'contain', background: '#fff', borderRadius: 4, border: '1px solid #eef0f3' }} /> : <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#9aa1a9', background: '#f6f7f9', borderRadius: 4 }}>✕</div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>{c.label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: b.bg, color: b.fg, whiteSpace: 'nowrap' }}>{STATUS_LABEL[c.status]}</span>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.45 }}>{c.summary}</span>
      {open && (
        <div data-testid={`scope-detail-${c.id}`}>
          {c.group !== 'out' ? (<>
            <List title="만들 수 있는 것" items={c.can} color="#166534" />
            <List title="만들 수 없는 것" items={c.cannot} color="#991B1B" />
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}><b>넣어야 하는 입력</b>: {c.needs}</div>
          </>) : (
            <div style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-secondary)', marginTop: 4 }}><b>대신 이렇게</b>: {c.alt}{c.nearest?.length ? <><br /><b>가장 가까운 종류</b>: {c.nearest.map((n) => `${catalogById(n.type)?.label || n.type} — ${n.why}`).join(' / ')}</> : null}</div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={{ flex: 1, padding: '3px 6px', fontSize: 11, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-secondary)' }} onClick={onToggle} data-testid={`scope-toggle-${c.id}`}>{open ? '접기' : '자세히'}</button>
        {onPickImage && c.group === 'image' && <button style={{ flex: 1, padding: '3px 6px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--primary)', background: pickedImage ? 'var(--primary)' : 'var(--primary-soft)', color: pickedImage ? 'var(--on-primary)' : 'var(--primary)' }} onClick={() => onPickImage(c.id)} data-testid={`scope-pick-${c.id}`} title="올리는 이미지를 이 방식으로 읽습니다(자동 판단 대신 직접 고름)">{pickedImage ? '선택됨' : '이 방식으로'}</button>}
        {onPick && c.group === 'text' && <button style={{ flex: 1, padding: '3px 6px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--primary)', background: picked ? 'var(--primary)' : 'var(--primary-soft)', color: picked ? 'var(--on-primary)' : 'var(--primary)' }} onClick={() => onPick(c.id)} data-testid={`scope-pick-${c.id}`} title={withImage ? '올린 이미지를 읽어 이 종류로 만듭니다' : '설명만으로 이 종류의 다이어그램을 만듭니다'}>{picked ? '선택됨' : '이 종류로'}</button>}
      </div>
    </div>
  );
}

// 종류 선택 아래의 안내 목록(접어 둠)
export default function ScopeGuide({ pickedText, onPick, subjectKind, onPickImage, withImage }) {
  const thumbs = useThumbs(); const [open, setOpen] = useState('');
  return (
    <details style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 8px', background: 'var(--surface)' }} data-testid="scope-guide">
      <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>만들 수 있는 것 · 없는 것 (종류 안내)</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {GROUPS.map(([g, title]) => (
          <div key={g}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{title}
              {g === 'image' && onPickImage && subjectKind && subjectKind !== 'auto' && <button style={{ padding: '2px 8px', fontSize: 10.5, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink-soft)' }} onClick={() => onPickImage('auto')} data-testid="scope-pick-auto">자동 판단으로 되돌리기</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {CATALOG.filter((c) => c.group === g).map((c) => <Card key={c.id} c={c} thumbs={thumbs} open={open === c.id} onToggle={() => setOpen(open === c.id ? '' : c.id)} onPick={onPick} picked={pickedText === c.id} onPickImage={onPickImage} pickedImage={!!subjectKind && subjectKind === c.id} withImage={!!withImage} />)}
            </div>
          </div>
        ))}
        <span style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>이미지를 올리면 AI가 종류를 판단해 위 방식 중 하나로 보냅니다. 원하는 방식이 있으면 카드의 <b>이 방식으로</b>를 눌러 직접 고를 수 있습니다. 이미지를 올린 채 <b>이 종류로</b>를 누르면 배치 개념도는 이미지의 배치를, 매스 과정도는 건물 형태를 읽어 만들고, 개요표·층별 조닝도·프로그램 버블도·카드 보드는 이미지에 보이는 글자·항목을 읽어 채웁니다.</span>
      </div>
    </details>
  );
}

// 고른 종류의 간단 안내(종류 선택 바로 아래)
export function TypeNote({ id }) {
  const thumbs = useThumbs(); const c = catalogById(id); if (!c || c.group !== 'text') return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, padding: 6, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)' }} data-testid="type-note">
      {thumbs[c.id] && <img src={thumbs[c.id]} alt={c.label} style={{ width: 96, height: 64, objectFit: 'contain', background: '#fff', borderRadius: 4, border: '1px solid #eef0f3' }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{c.summary}</div>
        <div style={{ fontSize: 10.5, color: 'var(--ok)', marginTop: 2 }}>{c.can[0]}</div>
        <div style={{ fontSize: 10.5, color: 'var(--err)' }}>✕ {c.cannot[0]}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)' }}>입력: {c.needs}</div>
      </div>
    </div>
  );
}
