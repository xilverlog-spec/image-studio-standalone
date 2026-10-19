// 그림 위의 글자를 클릭해 바로 고치기(2026-10-19) — 화면(DOM)과 무관한 계산만 모은다.
// 그림에 보이는 글자를 글자 목록(getTextFields 등)의 항목과 이어 준다: 글자 내용이 같으면 같은 항목, 같은 글자가 여럿이면 화면에서 몇 번째인지로 고른다.
export const normText = (s) => String(s ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); // 강조 표시 {} 는 그림에 보이지 않으므로 뺀다

// list: [{ value, ... }] 에서 text 와 같은 항목을 고른다. 같은 글자가 여럿이면 nth 번째(없으면 마지막). 못 찾으면 null
export function pickByText(list, text, nth = 0) {
  const key = normText(text); if (!key) return null;
  const c = (list || []).filter((x) => normText(x.value) === key);
  return c.length ? c[Math.min(c.length - 1, Math.max(0, nth))] : null;
}

// 화면 크기에 맞게 늘어나도록 SVG 의 고정 가로·세로를 100% 로 바꾼다(mm 단위여도 된다)
export const responsiveSvg = (svg) => String(svg).replace(/^<svg([^>]*?) width="[\d.]+(?:mm)?" height="[\d.]+(?:mm)?"/, '<svg$1 width="100%"');

// 손스케치 한 장 안에서 글자를 고칠 수 있는 모든 자리를 한 목록으로 만든다.
// 각 항목: { value(지금 글자), multiline, patch(v) → 새 스펙을 만들 변경 조각 또는 { memo|block|wind: id, set: {…} } }
// 실제 적용은 호출한 쪽(SketchEditor)이 한다.
export function sketchTextTargets(norm) {
  const t = [];
  if (norm.title) t.push({ value: norm.title, apply: { global: { title: '' } }, field: 'title' });
  if (norm.subtitle) t.push({ value: norm.subtitle, apply: { global: { subtitle: '' } }, field: 'subtitle' });
  (norm.blocks || []).forEach((b) => {
    if (b.name) t.push({ value: b.name, apply: { id: b.id, key: 'name' } });
    if (b.desc) t.push({ value: b.desc, apply: { id: b.id, key: 'desc' } });
  });
  (norm.winds || []).forEach((w) => {
    if (w.inLabel) t.push({ value: w.inLabel, apply: { id: w.id, key: 'inLabel' } });
    if (w.outLabel) t.push({ value: w.outLabel, apply: { id: w.id, key: 'outLabel' } });
  });
  (norm.memos || []).forEach((m) => { if (m.text) t.push({ value: m.text, apply: { id: m.id, key: 'text' } }); });
  if (norm.textBlock) {
    if (norm.textBlock.title) t.push({ value: norm.textBlock.title, multiline: true, apply: { tb: 'title' } });
    (norm.textBlock.subs || []).forEach((s, i) => { if (s) t.push({ value: s, apply: { tb: 'sub', i } }); });
  }
  (norm.notes || []).forEach((n, i) => { if (n) t.push({ value: n, apply: { note: i } }); });
  if (norm.showLegend && norm.legend) ['wind', 'core', 'opening'].forEach((k) => { if (norm.legend[k]) t.push({ value: norm.legend[k], apply: { legend: k } }); });
  return t;
}

// sketchTextTargets 항목의 apply 와 새 글자 v 로 바뀐 스펙 조각을 만든다. 반환: { global } 이면 전체 값 덮어쓰기 조각, { update: { id, patch } } 이면 요소 갱신
export function sketchApplyText(norm, apply, v) {
  if (apply.global) return { global: Object.fromEntries(Object.keys(apply.global).map((k) => [k, v])) };
  if (apply.id) return { update: { id: apply.id, patch: { [apply.key]: v } } };
  if (apply.tb === 'title') return { global: { textBlock: { ...norm.textBlock, title: v } } };
  if (apply.tb === 'sub') { const subs = [...(norm.textBlock.subs || [])]; subs[apply.i] = v; return { global: { textBlock: { ...norm.textBlock, subs } } }; }
  if (apply.note !== undefined) return { global: { notes: (norm.notes || []).map((x, j) => (j === apply.note ? v : x)) } };
  if (apply.legend) return { global: { legend: { ...norm.legend, [apply.legend]: v } } };
  return null;
}
