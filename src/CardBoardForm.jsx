import React, { useRef } from 'react';
import { ICON_GROUPS, ICON_LABEL } from './conceptDiagram/icons';
import { setByPath } from './conceptDiagram/spec';
import { normalizeCards, cardsAddCard, cardsDelCard, cardsMoveCard, cardsSetSlots, cardsAddKeypoint, cardsDelKeypoint, cardsAddBand, cardsDelBand, cardsMoveBand, cardsSetBullets, cardsToggleSub, cardsToggleCaption, cardsCount, TONES, TONE_LABEL, MAX } from './conceptDiagram/cardboard';

// 카드 보드 구성 수정(왼쪽 ③): 띠·카드·항목을 더하고 빼고 옮기고, 아이콘·이미지·모양을 고른다.
// 글자는 여기서 입력하지 않는다 — 그림 위 글자를 더블클릭해서 바로 고친다(새로 생긴 글자는 기본 문구가 들어가 있다).
// 모든 변경은 새 스펙을 onChange(스펙, 되돌리기 묶음 키)로 올린다. 이미지는 onImage(경로, 파일), 히어로 라벨·표 다시 놓기는 onResetHero().
const st = {
  inp: { padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border-color)', fontSize: 11.5, width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'rgba(255,255,255,0.95)', color: 'var(--text-primary)' },
  lab: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', minWidth: 0 },
  box: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)' },
  small: { fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 },
  name: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
};
const btn = (on, danger) => ({ padding: '3px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--line-strong)'}`, background: danger ? 'var(--err-soft)' : on ? 'rgba(51,51,153,0.12)' : 'var(--surface)', color: danger ? 'var(--err)' : on ? 'var(--accent-cyan)' : 'var(--text-secondary)' });

function IconSelect({ value, onChange, allowNone, testid }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={st.inp} data-testid={testid}>
      {allowNone && <option value="">(아이콘 없음)</option>}
      {ICON_GROUPS.map((g) => <optgroup key={g.id} label={g.label}>{g.names.map((n) => <option key={n} value={n}>{ICON_LABEL[n]} · {n}</option>)}</optgroup>)}
    </select>
  );
}

// 이미지 한 곳(히어로·열 그림·슬롯): 넣기/바꾸기·지우기·맞춤
function ImagePick({ src, fit, onFile, onClear, onFit, testid }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} data-testid={`${testid}-file`} />
      <button type="button" style={btn(false)} onClick={() => ref.current?.click()} data-testid={`${testid}-pick`}>{src ? '이미지 바꾸기' : '이미지 넣기'}</button>
      {src && <button type="button" style={btn(false, true)} onClick={onClear} data-testid={`${testid}-clear`}>지우기</button>}
      {src && <select value={fit || 'cover'} onChange={(e) => onFit(e.target.value)} style={{ ...st.inp, width: 'auto' }} data-testid={`${testid}-fit`}><option value="cover">꽉 채우기(잘라서)</option><option value="contain">전체 보이기</option></select>}
    </div>
  );
}

// 이름표 한 줄: 항목의 글자(읽기 전용) + 오른쪽 단추들
const Row = ({ label, children, testid }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 5, alignItems: 'center' }} data-testid={testid}>
    <span style={st.name} title={label}>{label || '(빈 글자)'}</span>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
  </div>
);

export default function CardBoardForm({ spec: raw, onChange, onImage, onResetHero, disabled }) {
  const spec = normalizeCards(raw, { keepEmpty: true });
  const set = (path, v, key) => onChange(setByPath(spec, path, v), key ?? path.join('.'));
  const act = (next) => onChange(next, '');
  const total = cardsCount(spec);
  const hasKind = (k) => spec.bands.some((b) => b.kind === k);
  const BAND_NAME = { keypoints: '핵심 가치 띠', hero: '히어로(큰 그림)', cards: '카드 줄', columns3: '3열 가치 카드', process: '프로세스 띠', chips: '분야 칩 띠' };
  const NEW_ITEM = { icon: 'star', title: '새 항목', text: '내용을 입력하세요' };
  const slotKinds = [['icon', '아이콘'], ['image', '내 이미지'], ['empty', '빈 칸']];
  const slotEditor = (sl, path, testid, extra) => (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 5, alignItems: 'center' }}>
      <select style={st.inp} value={sl.kind} onChange={(e) => set([...path, 'kind'], e.target.value, '')} data-testid={`${testid}-kind`}>{slotKinds.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      {sl.kind === 'icon' ? <IconSelect value={sl.icon} onChange={(v) => set([...path, 'icon'], v, '')} />
        : sl.kind === 'image' ? <ImagePick src={sl.src} fit={sl.fit} testid={`${testid}-img`} onFile={(f) => onImage(path, f)} onClear={() => set([...path, 'src'], '', '')} onFit={(v) => set([...path, 'fit'], v, '')} /> : <span />}
      {extra}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }} data-testid="cb-form">
      <div style={{ ...st.small, background: 'var(--primary-soft)', border: '1px solid var(--line-strong)', borderRadius: 6, padding: '6px 8px' }} data-testid="cb-hint"><b>글자는 오른쪽 그림에서 더블클릭</b>해서 바로 고칩니다. 여기서는 카드·항목을 더하고 빼고 옮기거나 아이콘·이미지를 고릅니다.</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...st.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}>강조색
          <input type="color" value={spec.accent} onChange={(e) => set(['accent'], e.target.value, 'accent')} style={{ width: 38, height: 26, padding: 0, border: '1px solid var(--border-color)', borderRadius: 5, background: '#fff' }} data-testid="cb-accent" />
        </label>
        <label style={{ ...st.small, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={spec.showPlaceholder} onChange={(e) => set(['showPlaceholder'], e.target.checked)} data-testid="cb-placeholder" /> 빈 이미지 자리 안내(점선 칸) 보이기</label>
      </div>

      {spec.bands.map((b, bi) => (
        <details key={bi} open={bi === 0 || undefined} style={st.box} data-testid={`cb-band-${bi}`}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            {bi + 1}. {BAND_NAME[b.kind]}{b.kind === 'cards' ? ` (${b.cards.length}장${b.label ? ` · ${b.label}` : ''})` : b.kind === 'keypoints' ? ` (${b.items.length}개)` : b.kind === 'columns3' ? ` (${b.cols.length}열)` : b.kind === 'process' ? ` (${b.items.length}단계)` : b.kind === 'chips' ? ` (${b.groups.length}분야)` : ''}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <button type="button" style={btn(false)} disabled={bi === 0} onClick={() => act(cardsMoveBand(spec, bi, -1))} data-testid={`cb-band-up-${bi}`}>▲ 위로</button>
              <button type="button" style={btn(false)} disabled={bi === spec.bands.length - 1} onClick={() => act(cardsMoveBand(spec, bi, 1))} data-testid={`cb-band-down-${bi}`}>▼ 아래로</button>
              <button type="button" style={btn(false, true)} disabled={spec.bands.length <= 1} onClick={() => act(cardsDelBand(spec, bi))} data-testid={`cb-band-del-${bi}`}>이 띠 지우기</button>
            </div>

            {b.kind === 'keypoints' && (<>
              <label style={st.lab}>스타일<select style={st.inp} value={b.style} onChange={(e) => set(['bands', bi, 'style'], e.target.value, '')}><option value="bracket">괄호형</option><option value="tabs">번호 탭형</option><option value="tiles">인증 타일형</option></select></label>
              {b.items.map((it, ii) => (
                <div key={ii} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px auto', gap: 5, alignItems: 'center' }} data-testid={`cb-kp-${bi}-${ii}`}>
                  <span style={st.name} title={it.title}>{it.no} {it.title}</span>
                  <IconSelect value={it.icon} onChange={(v) => set(['bands', bi, 'items', ii, 'icon'], v, '')} />
                  <button type="button" style={btn(false, true)} disabled={b.items.length <= 1} onClick={() => act(cardsDelKeypoint(spec, bi, ii))} title="이 항목 지우기" data-testid={`cb-kp-del-${bi}-${ii}`}>×</button>
                </div>
              ))}
              <button type="button" style={btn(false)} disabled={b.items.length >= MAX.keypoints} onClick={() => act(cardsAddKeypoint(spec, bi))} data-testid={`cb-kp-add-${bi}`}>＋ 항목 추가 ({b.items.length}/{MAX.keypoints})</button>
            </>)}

            {b.kind === 'hero' && (<>
              <div style={st.lab}>히어로 이미지(아이소·단면·입면 등)
                <ImagePick src={b.src} fit={b.fit} testid={`cb-hero-${bi}`} onFile={(f) => onImage(['bands', bi], f)} onClear={() => set(['bands', bi, 'src'], '', '')} onFit={(v) => set(['bands', bi, 'fit'], v, '')} />
              </div>
              {(b.callouts.length > 0 || b.tables.length > 0) && (
                <div style={st.small}>좌우 설명 {b.callouts.length}개 · 개요표 {b.tables.length}개는 <b>그림 위에서 끌어 고칩니다</b>(리더선 끝점의 동그라미 손잡이, 글자는 더블클릭). 지웠거나 엉켰다면 처음 자리로 다시 놓을 수 있습니다.
                  <div style={{ marginTop: 4 }}><button type="button" style={btn(false)} onClick={onResetHero} data-testid="cb-hero-reset">히어로 라벨·표 처음대로 다시 놓기</button></div></div>
              )}
              {b.legends.map((lg, li) => (
                <div key={li} style={{ ...st.box, padding: 6 }} data-testid={`cb-legend-${bi}-${li}`}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 5, alignItems: 'center' }}>
                    <span style={st.name} title={lg.title}>{lg.side === 'right' ? '오른쪽' : '왼쪽'} 목록 · {lg.title}</span>
                    <select style={{ ...st.inp, width: 'auto' }} value={lg.side} onChange={(e) => set(['bands', bi, 'legends', li, 'side'], e.target.value, '')}><option value="left">왼쪽</option><option value="right">오른쪽</option></select>
                  </div>
                  <label style={{ ...st.small, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={lg.numbered} onChange={(e) => set(['bands', bi, 'legends', li, 'numbered'], e.target.checked, '')} data-testid={`cb-legend-num-${bi}-${li}`} /> 번호를 붙이고 설명 줄을 쓰는 넓은 목록</label>
                  {lg.items.map((it, ii) => (
                    <div key={ii} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 5, alignItems: 'center' }}>
                      <span style={st.name} title={it.text}>{it.text}</span>
                      <IconSelect value={it.icon} onChange={(v) => set(['bands', bi, 'legends', li, 'items', ii, 'icon'], v, '')} />
                      <button type="button" style={btn(false, true)} onClick={() => set(['bands', bi, 'legends', li, 'items'], lg.items.filter((_, k) => k !== ii), '')} title="이 항목 지우기">×</button>
                    </div>
                  ))}
                  <button type="button" style={btn(false)} disabled={lg.items.length >= MAX.legendItems} onClick={() => set(['bands', bi, 'legends', li, 'items'], [...lg.items, { icon: 'star', text: '새 항목', desc: lg.numbered ? '설명' : '' }], '')} data-testid={`cb-legend-add-${bi}-${li}`}>＋ 목록 항목 ({lg.items.length}/{MAX.legendItems})</button>
                </div>
              ))}
            </>)}

            {b.kind === 'columns3' && (<>
              {b.cols.map((c, ci) => (
                <div key={ci} style={{ ...st.box, padding: 6 }} data-testid={`cb-col-${bi}-${ci}`}>
                  <Row label={`열 ${ci + 1} · ${c.key}`}>
                    <button type="button" style={btn(false, true)} disabled={b.cols.length <= 1} onClick={() => set(['bands', bi, 'cols'], b.cols.filter((_, k) => k !== ci), '')} title="이 열 지우기" data-testid={`cb-col-del-${bi}-${ci}`}>×</button>
                  </Row>
                  <div style={st.lab}>열의 큰 그림<ImagePick src={c.src} fit={c.fit} testid={`cb-colimg-${bi}-${ci}`} onFile={(f) => onImage(['bands', bi, 'cols', ci], f)} onClear={() => set(['bands', bi, 'cols', ci, 'src'], '', '')} onFit={(v) => set(['bands', bi, 'cols', ci, 'fit'], v, '')} /></div>
                  {c.rows.map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 5, borderRadius: 6, background: 'rgba(0,0,0,0.03)' }} data-testid={`cb-row-${bi}-${ci}-${ri}`}>
                      <Row label={r.title}><button type="button" style={btn(false, true)} disabled={c.rows.length <= 1} onClick={() => set(['bands', bi, 'cols', ci, 'rows'], c.rows.filter((_, k) => k !== ri), '')} title="이 줄 지우기">×</button></Row>
                      {slotEditor(r.slot, ['bands', bi, 'cols', ci, 'rows', ri, 'slot'], `cb-rowslot-${bi}-${ci}-${ri}`)}
                    </div>
                  ))}
                  <button type="button" style={btn(false)} disabled={c.rows.length >= MAX.rows} onClick={() => set(['bands', bi, 'cols', ci, 'rows'], [...c.rows, { title: '새 제목', text: '내용을 입력하세요', slot: { kind: 'icon', icon: 'star', caption: '' } }], '')} data-testid={`cb-row-add-${bi}-${ci}`}>＋ 줄 추가 ({c.rows.length}/{MAX.rows})</button>
                </div>
              ))}
              <button type="button" style={btn(false)} disabled={b.cols.length >= MAX.columns} onClick={() => set(['bands', bi, 'cols'], [...b.cols, { lead: '작은 문구', key: '키워드', src: '', fit: 'cover', rows: [{ title: '제목', text: '내용을 입력하세요', slot: { kind: 'icon', icon: 'star', caption: '' } }] }], '')} data-testid={`cb-col-add-${bi}`}>＋ 열 추가 ({b.cols.length}/{MAX.columns})</button>
            </>)}

            {b.kind === 'process' && (<>
              {b.items.map((it, ii) => (
                <div key={ii} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px auto', gap: 5, alignItems: 'center' }} data-testid={`cb-step-${bi}-${ii}`}>
                  <span style={st.name} title={it.title}>{ii + 1}. {it.title}</span>
                  <IconSelect value={it.icon} onChange={(v) => set(['bands', bi, 'items', ii, 'icon'], v, '')} />
                  <button type="button" style={btn(false, true)} disabled={b.items.length <= 1} onClick={() => set(['bands', bi, 'items'], b.items.filter((_, k) => k !== ii), '')} title="이 단계 지우기">×</button>
                </div>
              ))}
              <button type="button" style={btn(false)} disabled={b.items.length >= MAX.process} onClick={() => set(['bands', bi, 'items'], [...b.items, { ...NEW_ITEM, title: '새 단계' }], '')} data-testid={`cb-step-add-${bi}`}>＋ 단계 추가 ({b.items.length}/{MAX.process})</button>
            </>)}

            {b.kind === 'chips' && (<>
              {b.groups.map((g, gi) => (
                <div key={gi} style={{ ...st.box, padding: 6 }} data-testid={`cb-grp-${bi}-${gi}`}>
                  <Row label={`분야 ${gi + 1} · ${g.chip}`}><button type="button" style={btn(false, true)} disabled={b.groups.length <= 1} onClick={() => set(['bands', bi, 'groups'], b.groups.filter((_, k) => k !== gi), '')} title="이 분야 지우기">×</button></Row>
                  {g.items.map((it, ii) => (
                    <div key={ii} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 5, alignItems: 'center' }}>
                      <span style={st.name} title={it.title}>{it.title}</span>
                      <IconSelect value={it.icon} onChange={(v) => set(['bands', bi, 'groups', gi, 'items', ii, 'icon'], v, '')} />
                      <button type="button" style={btn(false, true)} onClick={() => set(['bands', bi, 'groups', gi, 'items'], g.items.filter((_, k) => k !== ii), '')} title="이 항목 지우기">×</button>
                    </div>
                  ))}
                  <button type="button" style={btn(false)} disabled={g.items.length >= MAX.chipItems} onClick={() => set(['bands', bi, 'groups', gi, 'items'], [...g.items, { ...NEW_ITEM }], '')} data-testid={`cb-grpitem-add-${bi}-${gi}`}>＋ 항목 ({g.items.length}/{MAX.chipItems})</button>
                </div>
              ))}
              <button type="button" style={btn(false)} disabled={b.groups.length >= MAX.chipGroups} onClick={() => set(['bands', bi, 'groups'], [...b.groups, { chip: '분야', items: [{ ...NEW_ITEM }] }], '')} data-testid={`cb-grp-add-${bi}`}>＋ 분야 추가 ({b.groups.length}/{MAX.chipGroups})</button>
            </>)}

            {b.kind === 'cards' && (<>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
                <label style={st.lab}>머리색<select style={st.inp} value={b.tone} onChange={(e) => set(['bands', bi, 'tone'], e.target.value, '')}>{Object.keys(TONES).map((k) => <option key={k} value={k}>{TONE_LABEL[k]}</option>)}</select></label>
                <label style={st.lab}>열 수<select style={st.inp} value={b.cols} onChange={(e) => set(['bands', bi, 'cols'], Number(e.target.value), '')}><option value={0}>자동</option>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}열</option>)}</select></label>
              </div>
              {b.cards.map((c, ci) => (
                <div key={ci} style={{ ...st.box, padding: 6 }} data-testid={`cb-card-${bi}-${ci}`}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 4, alignItems: 'center' }}>
                    <span style={st.name} title={c.title}>{ci + 1}. {c.title}</span>
                    <button type="button" style={btn(false)} disabled={ci === 0} onClick={() => act(cardsMoveCard(spec, bi, ci, -1))} title="앞으로" data-testid={`cb-card-up-${bi}-${ci}`}>◀</button>
                    <button type="button" style={btn(false)} disabled={ci === b.cards.length - 1} onClick={() => act(cardsMoveCard(spec, bi, ci, 1))} title="뒤로" data-testid={`cb-card-down-${bi}-${ci}`}>▶</button>
                    <button type="button" style={btn(false, true)} disabled={b.cards.length <= 1} onClick={() => act(cardsDelCard(spec, bi, ci))} title="이 카드 지우기" data-testid={`cb-card-del-${bi}-${ci}`}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 5, alignItems: 'center' }}>
                    <IconSelect value={c.icon} allowNone onChange={(v) => set(['bands', bi, 'cards', ci, 'icon'], v, '')} />
                    <button type="button" style={btn(!!c.sub)} onClick={() => act(cardsToggleSub(spec, bi, ci))} title="카드 제목 아래 부제 줄을 넣거나 뺍니다" data-testid={`cb-sub-${bi}-${ci}`}>부제 {c.sub ? '있음' : '없음'}</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10.5, color: 'var(--text-tertiary, #64748b)' }}>그림 칸
                    {[0, 1, 2, 3].map((n) => <button key={n} type="button" style={btn(c.slots.length === n)} onClick={() => act(cardsSetSlots(spec, bi, ci, n))} data-testid={`cb-slots-${bi}-${ci}-${n}`}>{n}</button>)}
                    <span style={{ marginLeft: 6 }}>불릿</span>
                    {[0, 1, 2].map((n) => <button key={n} type="button" style={btn(c.bullets.filter(Boolean).length === n)} onClick={() => act(cardsSetBullets(spec, bi, ci, n))} data-testid={`cb-bullets-${bi}-${ci}-${n}`}>{n}</button>)}
                  </div>
                  {c.slots.map((sl, si) => (
                    <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 5, borderRadius: 6, background: 'rgba(0,0,0,0.03)' }} data-testid={`cb-slot-${bi}-${ci}-${si}`}>
                      {slotEditor(sl, ['bands', bi, 'cards', ci, 'slots', si], `cb-slotk-${bi}-${ci}-${si}`,
                        <button type="button" style={{ ...btn(!!sl.caption), gridColumn: '1 / 3' }} onClick={() => act(cardsToggleCaption(spec, bi, ci, si))} title="그림 칸 아래 작은 이름을 넣거나 뺍니다" data-testid={`cb-cap-${bi}-${ci}-${si}`}>작은 이름 {sl.caption ? '있음' : '없음'}</button>)}
                    </div>
                  ))}
                </div>
              ))}
              <button type="button" style={btn(false)} disabled={total >= MAX.cards} onClick={() => act(cardsAddCard(spec, bi))} data-testid={`cb-card-add-${bi}`}>＋ 카드 추가 (보드 전체 {total}/{MAX.cards})</button>
            </>)}
          </div>
        </details>
      ))}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={st.small}>띠 추가</span>
        {[['keypoints', '핵심 가치'], ['hero', '히어로'], ['columns3', '3열 가치'], ['process', '프로세스'], ['chips', '분야 칩']].map(([k, t]) => (
          <button key={k} type="button" style={btn(false)} disabled={hasKind(k) || spec.bands.length >= MAX.bands} onClick={() => act(cardsAddBand(spec, k))} data-testid={`cb-addband-${k}`}>{t}</button>
        ))}
        <button type="button" style={btn(false)} disabled={total >= MAX.cards || spec.bands.length >= MAX.bands} onClick={() => act(cardsAddBand(spec, 'cards'))} data-testid="cb-addband-cards">카드 줄</button>
      </div>
      <span style={st.small}>카드·줄을 더하거나 지우면 <b>손으로 옮긴 도형 위치만 처음으로</b> 돌아갑니다(내 이미지·리더선·표·내가 그린 도형은 그대로).</span>
    </div>
  );
}
