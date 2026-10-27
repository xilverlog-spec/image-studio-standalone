// 조감도 탭의 엔진 고르기(2026-10-27) — 화면(DOM)과 무관한 계산만 모은다.
//
// 조감도 탭은 유료 엔진(Google·OpenAI)만 쓰고, 사용자가 고르는 칸은 없다. 쓸 수 있는 유료 엔진이 없으면(키가 없거나 프로젝트가 외부 전송을 막으면)
// 무료 엔진으로 대신하지 않고 빈 값을 돌려준다 — 화면이 이유를 알려 주고 생성을 막는다.

// 쓸 수 있는 유료 엔진(구글을 앞에). externalAllowed 가 false 면 서버가 어차피 막으므로 없는 것으로 본다(undefined 는 아직 모름 = 허용).
export const paidEngines = (providers, externalAllowed) => {
  if (externalAllowed === false) return [];
  const ps = (Array.isArray(providers) ? providers : []).filter((p) => p && !p.free && p.available);
  return [...ps.filter((p) => p.id === 'gemini'), ...ps.filter((p) => p.id !== 'gemini')];
};

// 조감도 탭에서 쓸 엔진 id(없으면 '').
export const pickPaidProvider = (providers, externalAllowed) => paidEngines(providers, externalAllowed)[0]?.id || '';
