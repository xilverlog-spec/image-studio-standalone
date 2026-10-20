// 다이어그램 종류 카탈로그(만들 수 있는 것 / 없는 것)와 범위 판정 (2026-10-20, 참고 자료 137쪽 분석 + 인터뷰 6회차 결정).
// 화면(ScopeGuide)과 '범위 밖 안내'가 같은 목록을 쓰고, 순수 함수라 점검 스크립트가 그대로 시험한다.
//
// group: 'text' 설명만으로 만든다(DIAGRAM_TYPES) / 'image' 이미지를 올려서 만든다(SUBJECT_KINDS) / 'out' 지원하지 않는다
// status: 'ok' 지원 / 'plan' 개발 예정 / 'no' 지원 안 함

export const CATALOG = [
  { id: 'site', group: 'text', status: 'ok', label: '배치 개념도 (흐름·정원·순환)', thumb: { type: 'site' },
    summary: '배치도 모양 위에 흐름선·해칭 구역·아이콘 칩을 얹은 개념도',
    can: ['패널 1~6개로 나눠 비교', '흐름선·해칭 구역·아이콘 칩', '결과를 눌러 색·위치·글자 수정'],
    cannot: ['실제 도면 같은 정확한 치수·축척', '지도·항공사진 자동 불러오기(바탕 이미지를 직접 넣으면 그 위에 얹음)'],
    needs: '만들려는 개념 설명 (선택: 배치도 이미지)' },
  { id: 'massing', group: 'text', status: 'ok', label: '매스 과정도 (아이소 단계)', thumb: { type: 'massing' },
    summary: '매스를 단계별로 더하고 덜어내는 아이소메트릭 도식',
    can: ['3~6단계 (더하기·덜어내기·띄우기)', '단계 이름 글자 수정', '여러 전략을 나란히 놓으려면 페이지 칸 + 칸 라벨(STEP 01)'],
    cannot: ['정밀한 3D 모델링·치수', '주변 대지·건물 자동 생성(흐린 바탕은 내 이미지로 — 개발 예정)'],
    needs: '매스가 바뀌는 과정 설명 (예: 직육면체 → 덜어내기 → 더하기)' },
  { id: 'program', group: 'text', status: 'ok', label: '프로그램 버블도 (공간 구성·관계)', thumb: { type: 'program' },
    summary: '공간을 원으로, 면적·중요도를 크기로, 성격이 같은 것을 색 묶음으로 그린 관계도',
    can: ['공간을 원으로(크기=면적·중요도)', '색 묶음과 공간 간 관계선', '글자 수정'],
    cannot: ['면적 합계 자동 계산·검증', '엄밀한 인접 행렬 분석'],
    needs: '공간 목록과 관계 (면적·묶음은 선택)' },
  { id: 'stack', group: 'text', status: 'ok', label: '층별 조닝도 (단면 스택)', thumb: { type: 'stack' },
    summary: '건물을 단면처럼 층 띠로 쌓고 층마다 프로그램을 나눈 도식',
    can: ['층마다 프로그램 칸(최대 12층)', '보이드·코어, 채광·바람·조망·소음 화살표', '공공성 변화 화살표'],
    cannot: ['실제 단면 도면(치수·구조·마감) — 실제 단면 위 주석은 "도면 위 표시"', '12층을 넘는 건물'],
    needs: '층별 프로그램 설명 (예: 1층 로비·카페, 2~3층 연구실)' },

  { id: 'edit', group: 'image', status: 'ok', label: '도면 위 표시 (AI 이미지 편집)', thumb: { picto: 'edit' },
    summary: '도면·사진은 그대로 두고 색·동선·구역만 얹기 (무료, 약 3~6분)',
    can: ['평면·배치도·단면·사진 위에 색·동선·구역 표시', '화살표는 선으로, 구역 색은 층으로 받아 편집', '마음에 안 드는 영역만 다시 그리기'],
    cannot: ['도면의 선·글자·치수 수정', '아주 큰 도면에서 정확한 방별 색칠(품질 저하)', '몇 초짜리 빠른 결과'],
    needs: '도면 이미지 + 얹을 내용 (예: 보행 동선은 파란 화살표)' },
  { id: 'plan', group: 'image', status: 'ok', label: '평면 다이어그램 (읽어서 단순화)', thumb: { picto: 'plan' },
    summary: '평면도를 읽어 방을 단순한 패널로 다시 그림 (몇 초)',
    can: ['방·구역을 패널로 단순화', '글자·색 수정'], cannot: ['원본 벽·치수의 정확한 보존', '방이 아주 많은 복잡한 평면'],
    needs: '벽이 그려진 평면도 이미지' },
  { id: 'form', group: 'image', status: 'ok', label: '건물 형태 읽기 (매스)', thumb: { picto: 'form' },
    summary: '외관·조감·SketchUp 캡처를 직육면체 덩어리의 합으로 단순화',
    can: ['형태를 덩어리로 읽어 매스 과정도로', '마지막 단계는 읽은 형태 그대로'], cannot: ['곡면·복잡한 형태의 정밀 재현'],
    needs: '건물 외관·조감 이미지' },
  { id: 'sketch', group: 'image', status: 'ok', label: '손스케치 정리', thumb: { picto: 'sketch' },
    summary: '펜 스케치의 상자·빗금·선을 정돈된 편집 가능 다이어그램으로',
    can: ['도형·화살표를 있는 그대로 읽어 정돈', '이름·화살표 방향을 설명대로 붙임', '요소를 하나씩 고침'], cannot: ['입체·채색 그림(자유 해석으로 넘어감)', '아주 흐린 사진'],
    needs: '펜으로 그린 개념 스케치 사진' },
  { id: 'freeform', group: 'image', status: 'ok', label: '자유 해석 (입체·수채·사진)', thumb: { picto: 'freeform' },
    summary: '그림의 개념을 이해해 고정·강조 요소와 화살표로 단순하게 다시 그림',
    can: ['입체·수채·사진의 개념 단순화', '결과를 클릭해 편집'], cannot: ['원본 그림의 세부 보존', '정확한 위치'],
    needs: '그림 + 개념 설명' },
  { id: 'axon', group: 'image', status: 'ok', label: '분석 축측도 (평면 → 입체)', thumb: { picto: 'axon' },
    summary: '평면도의 벽을 입체로 세우고 바람·일조 표시와 문구를 얹음',
    can: ['벽 높이·시점 조절', '바람 띠·일조 경로·오른쪽 문구'], cannot: ['벽선이 흐린 도면', '곡선 위주의 평면'],
    needs: '깨끗한 평면도 + 남쪽 방향' },

  { id: 'table', group: 'out', status: 'no', label: '표·일정표·공정표·조직도',
    summary: '병합·계산이 있는 표·간트 공정표·조직도(단순 개요표는 편집기 "＋ 표"로 추가)',
    alt: '엑셀·PPT에서 만든 것을 "내 이미지 넣기"로 보드에 넣으세요. 라벨–값 개요표(건축개요·면적표 등, 2~4열)는 결과 편집기의 "＋ 표"로 직접 넣어 고칠 수 있습니다(병합 셀·계산·간트는 불가). 조직·관계를 그림으로 보이려면 프로그램 버블도가 가장 가깝습니다.',
    nearest: [{ type: 'program', why: '조직·공간 관계를 원과 선으로 그립니다' }] },
  { id: 'render', group: 'out', status: 'no', label: '조감도·투시도·사진 생성',
    summary: '렌더링·조감도·투시도·실사 이미지를 새로 만들기',
    alt: '이 탭은 다이어그램을 만드는 곳입니다. 조감도 같은 이미지는 앱의 이미지 생성 기능으로 만든 뒤 "내 이미지 넣기"로 보드 칸에 넣으세요. 이미 있는 사진 위에 동선·구역을 얹는 것은 "도면 위 표시"로 됩니다.',
    nearest: [{ type: 'edit', why: '이미 있는 사진·렌더 위에 색·동선을 얹습니다(이미지가 있을 때)' }] },
  { id: 'drawing', group: 'out', status: 'no', label: '평면도·입면도·단면도 도면 작성',
    summary: 'CAD·BIM처럼 치수가 있는 실시 도면 만들기',
    alt: '도면은 CAD·BIM에서 만든 이미지를 "내 이미지 넣기"로 넣고, 그 위의 동선·구역은 "도면 위 표시"로 얹으세요. 층 구성 개념만 보이려면 층별 조닝도가 가장 가깝습니다.',
    nearest: [{ type: 'stack', why: '층별 프로그램·보이드·채광을 단면 도식으로 그립니다' }] },
  { id: 'illust', group: 'out', status: 'no', label: '컨셉 일러스트·로고·포스터',
    summary: '그림 에셋이 필요한 일러스트·로고·포스터·캐릭터',
    alt: '이 앱은 프로그램이 직접 그리는 도식만 만듭니다(글자가 깨지지 않고 계속 편집되는 것이 장점). 일러스트는 다른 도구에서 만들어 "내 이미지 넣기"로 넣으세요.',
    nearest: [] },
  { id: 'cards', group: 'out', status: 'plan', label: '기술·상품 카드 보드 (구조·설비·친환경 계획)',
    summary: '핵심 가치 띠 + 큰 그림 + 카드 격자로 된 계획 요약 보드',
    alt: '개발 예정입니다(로드맵 R7). 지금은 배치 개념도·층별 조닝도로 일부만 표현할 수 있고, 카드 글은 편집기의 글자·도형으로 직접 만들 수 있습니다.',
    nearest: [{ type: 'stack', why: '층별 프로그램을 한 장으로 요약합니다' }] },
];

export const catalogById = (id) => CATALOG.find((c) => c.id === id) || null;
export const STATUS_LABEL = { ok: '지원', plan: '개발 예정', no: '지원 안 함' };

// 설명 글에서 '지원하지 않는 종류'를 달라고 하는 말을 찾는다. 다이어그램 종류를 직접 고르지 않았을 때(자동)만 쓴다.
// 일부러 구체적인 낱말(개요표·공정표·'~도를 그려')만 잡아 오탐을 줄인다 — 걸려도 '그대로 진행'을 누르면 되는 안내일 뿐이다.
const RULES = [
  ['table', /(개요표|면적표|일정표|공정표|간트|조직도|법규\s*검토표|주차\s*계획표|표를?\s*(만들|그려|작성)|표\s*로\s*(정리|만들))/],
  ['render', /((조감도|투시도|렌더링?|렌더\s*이미지|실사|사진)\s*(을|를|이미지를)?\s*(만들|그려|생성|뽑)|(조감도|투시도|조감|투시)\s*이미지\s*(를|을)?\s*(생성|만들))/],
  ['drawing', /((평면도|입면도|단면도|상세도|시공도)\s*(를|을)?\s*(그려|작성|만들어|도면)|CAD\s*도면|도면\s*(을|를)?\s*작성)/i],
  ['illust', /(로고|포스터|명함|캐릭터|일러스트\s*(를|을)?\s*(그려|만들))/],
  ['cards', /(카드\s*(보드|뉴스)|(구조|설비|친환경|에너지|토목)\s*계획.{0,12}(카드|보드|한\s*장으로))/],
];

// 반환: { inScope: true } 또는 { inScope: false, category(카탈로그 항목), nearest: [{ type, label, why }] }
export function checkScope(text) {
  const t = String(text || '');
  if (!t.trim()) return { inScope: true };
  for (const [id, re] of RULES) {
    if (re.test(t)) {
      const category = catalogById(id);
      return { inScope: false, category, nearest: (category.nearest || []).map((n) => ({ ...n, label: catalogById(n.type)?.label || n.type })) };
    }
  }
  return { inScope: true };
}

// 소재 이미지를 AI 가 '그 외'로 판단했을 때 권하는 방식(가까운 순)
export const IMAGE_OTHER_NEAREST = [
  { kind: 'freeform', why: '입체·수채·사진 등 어떤 그림이든 개념을 이해해 단순하게 다시 그립니다(가장 무난)' },
  { kind: 'edit', why: '이미지는 그대로 두고 색·동선·구역만 얹습니다(약 3~6분)' },
  { kind: 'sketch', why: '펜으로 그린 개념 스케치라면 도형·화살표를 그대로 읽어 정돈합니다' },
];

// 이미지 종류 카드용 작은 그림(120×80). 실제 결과 모양을 흉내 낸 단순 도형이다.
export const PICTOS = {
  edit: '<rect x="8" y="8" width="104" height="64" fill="#fff" stroke="#9aa1a9" stroke-width="2"/><path d="M8 40H112M50 8V72M82 40V72" stroke="#9aa1a9" stroke-width="1.5" fill="none"/><rect x="52" y="42" width="28" height="28" fill="#4CAF50" fill-opacity="0.35"/><path d="M14 56C34 56 40 30 70 26L96 22" stroke="#E8833A" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M90 14L100 21L90 28Z" fill="#E8833A"/>',
  plan: '<rect x="8" y="8" width="104" height="64" fill="#fff" stroke="#555" stroke-width="2"/><rect x="12" y="12" width="40" height="30" fill="#F9D2A0"/><rect x="54" y="12" width="54" height="22" fill="#C9DDEC"/><rect x="54" y="36" width="54" height="32" fill="#F4E6A6"/><rect x="12" y="44" width="40" height="24" fill="#D8DCE2"/>',
  form: '<path d="M18 52L52 66L86 52L52 38Z" fill="#e5e7eb" stroke="#555"/><path d="M18 52V36L52 50V66Z" fill="#cbd0d6" stroke="#555"/><path d="M52 66V50L86 36V52Z" fill="#b9c0c8" stroke="#555"/><path d="M44 36L64 44L84 36L64 28Z" fill="#F2C94C" stroke="#555"/><path d="M44 36V24L64 32V44Z" fill="#e7b92f" stroke="#555"/>',
  sketch: '<rect x="14" y="14" width="56" height="46" fill="none" stroke="#333" stroke-width="2.5" stroke-dasharray="7 3" rx="2"/><path d="M14 40L70 40M42 14V60" stroke="#333" stroke-width="1.6" fill="none"/><path d="M62 70C80 70 84 50 104 44" stroke="#1E88C8" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M98 36L108 44L97 50Z" fill="#1E88C8"/>',
  freeform: '<circle cx="34" cy="40" r="20" fill="#D9D5CE"/><rect x="60" y="22" width="36" height="34" rx="3" fill="#F2C94C"/><path d="M30 66C54 76 90 74 100 62" stroke="#E8833A" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M96 54L106 62L94 68Z" fill="#E8833A"/>',
  axon: '<path d="M14 54L50 70L86 54L50 38Z" fill="#fff" stroke="#555"/><path d="M14 54V42L50 58V70Z" fill="#d6d9de" stroke="#555"/><path d="M50 70V58L86 42V54Z" fill="#bfc4cb" stroke="#555"/><circle cx="96" cy="16" r="7" fill="#F0B000"/><path d="M92 24L62 44" stroke="#F0B000" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/><path d="M14 30C30 20 44 28 60 22" stroke="#1E88C8" stroke-width="3.5" stroke-linecap="round" fill="none"/>',
};
export const pictoSvg = (id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect width="120" height="80" fill="#fff"/>${PICTOS[id] || ''}</svg>`;
