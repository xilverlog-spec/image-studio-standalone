// 조감도: 생성·수정 중에 새로고침해도 진행 중이던 작업의 결과를 되찾는다(2026-10-27) — 화면(DOM)과 무관한 계산만 모은다.
//
// 배경: 조감도 생성은 요청 하나를 화면이 끝까지 기다리는 방식이라, 새로고침하면 기다림이 사라진다. 하지만 서버는 끝까지 만들어 파일과 이력(history)에 저장한다.
// 그래서 ① 시작할 때 '진행 중 메모'(번호표·시작 시각·이름)를 브라우저에 남기고 ② 끝나면 지우고 ③ 다시 열렸을 때 남은 메모가 있으면
// 서버의 줄(번호표)과 이력을 보고 끝난 결과를 결과 목록에 넣어 준다.
export const PENDING_KEY = 'aerial_pending_v1';
export const GRACE_MS = 15000;                 // 서버 줄에서 사라진 뒤 이력이 올라오기를 기다리는 시간(지나도 없으면 끝내지 못한 것으로 본다)
export const GRACE_PAID_MS = 180000;           // 유료 엔진(번호표 없음·결과가 늦게 올라옴)은 더 오래 기다린다
export const MAX_AGE_MS = 6 * 3600 * 1000;     // 이보다 오래된 메모는 버린다
export const MAX_PENDING = 8;

export const pendingAdd = (list, rec) => [rec, ...(Array.isArray(list) ? list : []).filter((x) => x && x.ticket !== rec.ticket)].slice(0, MAX_PENDING);
export const pendingRemove = (list, ticket) => (Array.isArray(list) ? list : []).filter((x) => x && x.ticket !== ticket);
export const pendingFresh = (list, now) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.ticket === 'string' && x.ticket && Number.isFinite(x.t0) && now - x.t0 >= -60000 && now - x.t0 < MAX_AGE_MS);

// 서버 이력(list_generations, 최근 것이 앞)에서 이 작업이 만든 결과를 고른다: 조감도 파일(aerial_)이고, 작업을 시작한 뒤(시계 오차 2초)에 만들어졌고,
// 이미 결과 목록에 있는 파일(have)이나 다른 메모가 가져간 이력(claimed: id 집합)이 아닌 것 가운데 가장 이른 것. 없으면 null.
export function matchRecovered(rec, generations, have, claimed) {
  const haveSet = have || new Set(); const claimedSet = claimed || new Set();
  const t0s = rec.t0 / 1000 - 2;
  const c = (Array.isArray(generations) ? generations : []).filter((g) => g && /(^|\/)aerial_/.test(g.imageFilename || '') && Number(g.createdAt) >= t0s && !haveSet.has(g.imageFilename) && !claimedSet.has(g.id));
  c.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  return c[0] || null;
}

// 한 번 확인한 결과: queuePos(서버 줄에서 내 순서, 0=줄에 없음), match(matchRecovered 결과), goneSince(줄에서 사라진 것을 처음 본 시각 또는 null)
// 반환 { action: 'wait' | 'collect' | 'lost', goneSince }
export function decidePending(rec, queuePos, match, now, goneSince) {
  if (queuePos > 0) return { action: 'wait', goneSince: null };           // 서버에서 아직 만드는 중이거나 줄 서 있음
  if (match) return { action: 'collect', goneSince };
  if (goneSince == null) return { action: 'wait', goneSince: now };       // 막 줄에서 사라짐 — 이력이 올라올 때까지 잠깐 기다린다
  return now - goneSince >= (rec.paid ? GRACE_PAID_MS : GRACE_MS) ? { action: 'lost', goneSince } : { action: 'wait', goneSince };
}

// 화면의 결과 목록 항목(AerialStudio addResult 와 같은 필드). 형태 점수는 이력에 없어 null.
export const recoveredEntry = (rec, g, now) => ({
  id: `${now}-r${String(g.id)}`, filename: g.imageFilename, model: g.checkpoint || '', score: null, note: '새로고침 중에 끝난 결과를 되찾았습니다', cost: 0,
  seed: g.seed, sec: Math.max(0, Math.round(Number(g.createdAt) - rec.t0 / 1000)), prompt: g.prompt || '', mode: rec.mode, t: now, label: rec.label, recovered: true,
});
