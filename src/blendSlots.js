// 이미지 블렌딩(AI 이미지 탭) 이지 모드의 슬롯 구성(2026-10-28) — 화면(DOM)과 무관한 계산만 모은다.

// 이지 모드의 "강조" 옵션 → 참조(IP-Adapter) 적용 구간(stop_at). 확산 초반에만 적용하면(값이 낮으면) 전체적인 색감/구도 위주로,
// 후반까지 적용하면(값이 높으면) 질감/디테일까지 반영된다.
export const BLEND_EMPHASIS_STOP_AT = { balanced: 0.5, color: 0.35, material: 0.75 };

// 기존 이미지(구조 슬롯)를 붙들어 두는 확산 구간. 같은 원본·참조·시드로 설정만 바꿔 본 시험(2026-10-28)에서 구간 0.5·강도 0.4는 참조 건물이 원본을 덮어썼고,
// 강도 1.0·구간 0.8 이상이면 원본의 큰 덩어리(테라스·높은 볼륨·지형)가 남으면서 재료와 색은 참조에서 들어왔다.
export const BLEND_STRUCTURE_STOP_AT = 0.8;

// 영향도(0~100%) → 참조 강도(0.4~1.5)
export const blendIpWeight = (influence) => 0.4 + (influence / 100) * 1.1;

const raw = (img) => img.split(',')[1] || img;   // 데이터 URL 머리("data:image/png;base64,")를 뗀다

// 이지 모드: 형태 유지를 켜면 기존 이미지를 구조 슬롯으로 먼저 넣고, 참조 이미지마다 참조 슬롯을 붙인다. 서버로 보내는 slots 배열을 만든다.
export function buildEasyBlendSlots({ base, refs, structureEnabled, structureType, influence, emphasis }) {
  const ipStopAt = BLEND_EMPHASIS_STOP_AT[emphasis] ?? 0.5;
  const ipWeight = blendIpWeight(influence);
  return [
    ...(structureEnabled ? [{ image: raw(base), type: structureType, stop_at: BLEND_STRUCTURE_STOP_AT, weight: 1.0 }] : []),
    ...refs.map((img) => ({ image: raw(img), type: 'ImagePrompt', stop_at: ipStopAt, weight: ipWeight })),
  ];
}
