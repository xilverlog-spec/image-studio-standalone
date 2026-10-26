import { ANCHORS, SITE_SHAPES, renderSiteConcept } from './siteConcept';
import { renderMassing } from './massing';
import { renderLayout2d, normalizeLayoutPanels } from './layout2d';
import { ICON_LABEL, ICON_GROUPS, ICON_NAMES, resolveIcon } from './icons';
import { renderProgram, normalizeProgram } from './program';
import { renderStack, normalizeStack } from './stack';
import { renderSketch, normalizeSketch, getSketchTextFields } from './sketch';
import { CARD_PRESETS, normalizeCards, renderCards, getCardsTextFields } from './cardboard';
import { normalizeTableDoc, renderTableDoc, getTableDocFields, TABLE_DOC_SCHEMA, TABLE_DOC_RULES } from './tabledoc';
import { SAMPLE_TABLE } from './table';

export const DIAGRAM_TYPES = {
  site: { label: '배치 개념도 (흐름·정원·순환)', hint: '배치도 위에 흐름선, 해칭 구역, 아이콘 칩을 얹는 개념도' },
  massing: { label: '매스 과정도 (아이소 단계)', hint: 'EXTRUSION / SUBTRACTION / ADDITION 식으로 매스를 단계별로 보여주는 도식' },
  program: { label: '프로그램 버블도 (공간 구성·관계)', hint: '공간(프로그램)을 원으로, 면적·중요도를 크기로, 성격이 같은 것을 같은 색 묶음으로 그리고 연결 관계를 선으로 잇는 도식' },
  table: { label: '개요표 (라벨–값 표)', hint: '건축개요·면적표 같은 표 하나로 칸을 채운다(2~4열 라벨형·줄무늬형, 3~5열 설계개요형: 구분 칸 합침·머리글·소계 줄). 엑셀·한글에서 복사한 표를 붙여넣어도 된다(계산은 없음)' },
  cards: { label: '카드 보드 (기술·상품 계획 요약)', hint: '핵심 가치 띠 + 큰 그림 자리(좌우 설명·표·아이콘 목록) + 카드 격자(최대 12개)로 된 사내 도집 형식의 계획 요약 보드. 그림은 내 이미지를 넣는다' },
  stack: { label: '층별 조닝도 (단면 스택)', hint: '건물을 단면처럼 층 띠로 쌓고 층마다 프로그램 칸, 보이드·코어·채광/바람/조망, 공공성 변화 화살표를 얹는 도식' },
};

// 참고삽도 137쪽 분류(docs 6부)에서 버블도는 0쪽, 평면 띠형 조닝도는 1~2쪽뿐이라 2026-10-26 에 '만들 수 있는 종류'에서 뺐다.
// 그리는 코드(program.js·stack.js)와 정규화는 그대로라 예전에 만든 결과·저장한 스펙은 계속 열리고 고쳐진다. 되살리려면 이 목록에서 지우면 된다.
export const HIDDEN_TYPES = ['program', 'stack'];
export const OFFERED_TYPES = Object.keys(DIAGRAM_TYPES).filter((t) => !HIDDEN_TYPES.includes(t));

export const EXAMPLE_SPECS = {
  cards: CARD_PRESETS.plan.spec,
  table: { title: '건축개요', accent: '#2F6B4F', size: 18, table: { title: '건축개요', style: 'doc', cols: 4, header: ['구분', '항목', '설계내용', '비고'], unit: '단위: ㎡', rows: [['건물개요', '대지위치', '서울시 ○○구 ○○동', ''], ['', '용도', '공동주택', ''], ['', '대지면적', '12,345.00㎡', ''], ['', '건축면적', '3,210.50㎡', '건폐율 26.0%'], ['', '규모', '지하 2층 / 지상 15층', ''], ['면적', '지상층', '36,400.00㎡', ''], ['', '지하층', '12,500.00㎡', ''], ['', '소계', '48,900.00㎡', '용적률 295%'], ['주차개요', '계획 대수', '215대', '법정 203대']] } },
  site: {
    title: '',
    panels: [
      {
        heading: '누구나 함께 즐기는 {플로우 허브}', accent: '#F28C28', siteShape: 'wedge',
        overlays: [
          { kind: 'flow', from: 'center', to: ['n', 'e', 'se', 'sw', 'w'], color: '#F28C28' },
          { kind: 'marker', anchor: 'w', label: '웰컴플라자', icon: 'people', color: '#F28C28', side: 'left' },
        ],
      },
      {
        heading: '입주민을 이어주는 {커뮤니티가든}', accent: '#3E8E41', siteShape: 'blob',
        overlays: [
          { kind: 'zone', anchor: 'e', size: 'l', pattern: 'hatch', color: '#4CAF50' },
          { kind: 'marker', anchor: 'nw', label: '그린가든', icon: 'leaf', color: '#3E8E41', side: 'left' },
          { kind: 'marker', anchor: 'w', label: '선셋가든', icon: 'sun', color: '#3E8E41', side: 'left' },
          { kind: 'marker', anchor: 'sw', label: '데일리가든', icon: 'bench', color: '#3E8E41', side: 'left' },
          { kind: 'marker', anchor: 'ne', label: '리버가든', icon: 'water', color: '#3E8E41', side: 'right' },
          { kind: 'marker', anchor: 'se', label: '포레스트가든', icon: 'tree', color: '#3E8E41', side: 'right' },
        ],
      },
      {
        heading: '외부공간과 프로그램을 잇는 {순환구조}', accent: '#1E90C8', siteShape: 'wedge',
        overlays: [
          { kind: 'cycle', anchor: 'ne', color: '#1E90C8' },
          { kind: 'cycle', anchor: 's', color: '#1E90C8' },
          { kind: 'arrow', from: 'ne', to: 's', color: '#1d1d1d' },
          { kind: 'label', anchor: 'nw', text: '주동 프로그램과 외부공간의 순환' },
          { kind: 'label', anchor: 'sw', text: '플로우 허브와 외부공간의 순환' },
        ],
      },
    ],
  },
  massing: {
    title: '',
    accent: '#F28C28',
    context: [{ x: -3.4, y: -2.2, w: 1.8, d: 2, h: 1.4 }, { x: 6.4, y: 0.4, w: 1.8, d: 2.6, h: 2.6 }, { x: -2.8, y: 4.8, w: 2.4, d: 1.4, h: 1 }],
    steps: [
      { label: '직육면체로 대지를 채운다', ground: { x: 0, y: 0, w: 5, d: 4 }, boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 4, h: 2 }] },
      {
        label: '중앙을 덜어 열린 마당을 만든다', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 1.7, z: 2.4, w: 5, d: 0.6, h: 1.6, mode: 'subtract', move: 'up', len: 1.4 }],
        arrows: [{ from: [-1.6, 2, 0.5], to: [1.4, 2, 0.5], color: '#2F7FBF' }],
        leaders: [{ box: 0, label: '북측 동', side: 'left' }, { box: 1, label: '남측 동', side: 'right' }],
      },
      {
        label: '위에 라운지를 얹는다', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2 }, { x: 1.8, y: 1.55, z: 3.2, w: 1.4, d: 0.9, h: 1.8, mode: 'add', move: 'down', len: 1.2 }],
        leaders: [{ box: 2, label: '라운지', icon: 'sofa' }, { box: 0, label: '전시', icon: 'landmark', side: 'left' }, { box: 1, label: '교육', icon: 'graduation-cap', side: 'right' }],
      },
      {
        label: '최종 형태: 기능별로 색을 나눈다', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2, color: '#F6C58E' }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2, color: '#A9CBEA' }, { x: 1.8, y: 1.55, z: 2, w: 1.4, d: 0.9, h: 1.8, color: '#F28C28' }],
        arrows: [{ from: [-1.6, 2, 0.5], to: [1.4, 2, 0.5], color: '#2F7FBF' }, { from: [2.5, 2, 4.8], to: [2.5, 2, 3.9], color: '#3E8E41' }],
        leaders: [{ box: 0, label: '공공·전시', icon: 'landmark', side: 'left', color: '#C2410C' }, { box: 1, label: '교육·커뮤니티', icon: 'users', side: 'right', color: '#1E5FA8' }, { box: 2, label: '라운지', icon: 'sofa', side: 'right', color: '#B45309' }],
      },
    ],
  },
  program: {
    title: '복합문화시설 프로그램 구성',
    groups: [{ id: 'pub', name: '공공·전시', color: '#F28C28' }, { id: 'edu', name: '교육·커뮤니티', color: '#1E90C8' }, { id: 'sup', name: '지원', color: '#4B5563' }],
    nodes: [
      { id: 'lobby', label: '로비', group: 'pub', size: 4, area: '600㎡' }, { id: 'exhib', label: '전시실', group: 'pub', size: 5, area: '1,200㎡' }, { id: 'cafe', label: '카페', group: 'pub', size: 3, area: '240㎡' },
      { id: 'class', label: '교육실', group: 'edu', size: 3, area: '300㎡' }, { id: 'lib', label: '자료실', group: 'edu', size: 3, area: '320㎡' }, { id: 'comm', label: '커뮤니티홀', group: 'edu', size: 4, area: '800㎡' },
      { id: 'office', label: '사무실', group: 'sup', size: 2 }, { id: 'store', label: '수장고', group: 'sup', size: 2 },
    ],
    links: [
      { from: 'lobby', to: 'exhib', kind: 'direct' }, { from: 'lobby', to: 'cafe', kind: 'direct' }, { from: 'lobby', to: 'comm', kind: 'direct' },
      { from: 'comm', to: 'class', kind: 'direct' }, { from: 'class', to: 'lib', kind: 'weak' }, { from: 'exhib', to: 'store', kind: 'weak', label: '반입' }, { from: 'office', to: 'store', kind: 'weak' },
    ],
  },
  stack: {
    title: '층별 조닝',
    floors: [
      { name: '1F', h: 5.0, programs: [{ name: '로비·카페', tone: 'public', width: 0.6, area: '620㎡', no: '1' }, { name: '전시', tone: 'public', width: 0.4, area: '480㎡' }] },
      { name: '2F', h: 4.2, programs: [{ name: '커뮤니티', tone: 'semi', width: 0.5, area: '540㎡', no: '2' }, { name: '교육실', tone: 'quiet', width: 0.5, area: '520㎡' }] },
      { name: '3F', h: 4.2, programs: [{ name: '자료실', tone: 'quiet', width: 0.6, area: '610㎡' }, { name: '사무', tone: 'service', width: 0.4, area: '410㎡' }] },
      { name: '4F', h: 4.2, programs: [{ name: '옥상정원·라운지', tone: 'private', width: 1, area: '980㎡', no: '3' }] },
    ],
    voids: [{ from: 0, to: 3, x: 0.42, w: 0.16, label: '중앙 보이드' }],
    cores: [{ x: 0.92, label: '코어' }],
    forces: [{ kind: 'light', label: '자연채광' }, { kind: 'view', label: '조망' }],
    gradient: { label: '공공성', from: '높음', to: '낮음' },
  },
};

// ── AI에게 줄 프롬프트: 구조만 요청하고 좌표/픽셀은 요구하지 않는다 ──
export const SITE_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "panels": [   // 1~3개 권장. 한 패널 = 한 가지 개념
    {
      "heading": "패널 제목. 강조할 핵심어는 {중괄호}로 감싼다. 예: 누구나 함께 즐기는 {플로우 허브}",
      "accent": "#RRGGBB (이 패널의 대표색)",
      "siteShape": "blob" | "wedge" | "rect",
      "overlays": [
        {"kind":"flow",   "from":"center", "to":["n","e","sw"], "color":"#RRGGBB"},          // 사람/동선의 흐름(중심에서 퍼짐, 번지는 띠)
        {"kind":"flow",   "style":"line", "from":"w", "to":["e"], "color":"#RRGGBB", "dashed":false, "no":1, "label":"보행 동선"}, // (선택) 선명한 선 동선: 도면 위 표시용. no=번호 배지(1~99), label=범례 이름(8자)
        {"kind":"zone",   "anchor":"e", "size":"s|m|l", "pattern":"hatch|dots|fill", "color":"#RRGGBB", "label":"(선택)범례 이름 8자"}, // 성격이 같은 구역
        {"kind":"marker", "anchor":"nw", "label":"그린가든", "icon":"leaf", "color":"#RRGGBB", "side":"left|right"}, // 위치 표시 + 아이콘 칩
        {"kind":"cycle",  "anchor":"ne", "color":"#RRGGBB"},                                  // 순환/회전 구조
        {"kind":"arrow",  "from":"w", "to":"e", "color":"#RRGGBB", "dashed":false},           // 방향/연결
        {"kind":"label",  "anchor":"s", "text":"짧은 설명"}                                    // 짧은 주석
      ]
    }
  ]
}`;

const MASSING_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "accent": "#F28C28",
  "steps": [   // 3~6단계. 단계 하나 = 도식 한 칸
    {
      "label": "중앙을 덜어 열린 마당을 만든다",   // 이 단계가 하는 일을 한 줄로(칸 위 제목 띠에 'STEP n'과 함께 나온다)
      "ground": {"x":0,"y":0,"w":5,"d":4},   // 대지 바닥 판(모듈 단위)
      "boxes": [
        // x,y = 바닥 위치, z = 바닥에서 띄운 높이, w = x방향 길이, d = y방향 길이, h = 높이 (모두 모듈 단위, 0~10 정도)
        {"x":0,"y":0,"z":0,"w":5,"d":4,"h":2},                                          // 일반 매스(color 를 쓰면 그 색으로 입체 표현)
        {"x":0,"y":1.7,"z":2.4,"w":5,"d":0.6,"h":1.6,"mode":"subtract","move":"up","len":1.4}, // 덜어내는 부분(강조색 + 위로 뜨는 화살표)
        {"x":1.8,"y":1.5,"z":3.2,"w":1.4,"d":0.9,"h":1.8,"mode":"add","move":"down","len":1.2}  // 더하는 부분(강조색 + 아래로 내리는 화살표)
      ],
      "leaders": [ {"box":2,"label":"라운지","icon":"(선택)아이콘 이름","side":"left|right(선택)","color":"(선택)#RRGGBB"} ],   // (선택) 프로그램 이름을 매스에 점선으로 잇는다. box = 이 단계 boxes 의 0부터 번호
      "arrows": [ {"from":[-1.6,2,0.5],"to":[1.4,2,0.5],"color":"(선택)#RRGGBB"} ]                                    // (선택) 진입·동선·바람 화살표(모듈 좌표 [x,y,z])
    }
  ],
  "context": [ {"x":-3,"y":-2,"w":1.8,"d":2,"h":1.4} ]   // (선택) 흐린 주변 매스. 요청에 주변 이야기가 있을 때만
}`;

const PROGRAM_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "groups": [ {"id":"pub","name":"묶음 이름(성격이 같은 공간들)","color":"#RRGGBB"} ],   // 2~5개 권장
  "nodes": [ {"id":"lobby","label":"공간 이름","group":"pub","size":1~5,"icon":"(선택)아이콘 이름","area":"(선택)면적 글자 예 600㎡"} ],   // size = 면적/중요도(5가 가장 큼), 8~25개
  "links": [ {"from":"lobby","to":"exhib","kind":"direct|weak","label":"짧은 설명(없으면 빈 문자열)"} ]   // direct = 직접 연결, weak = 약한 관련
}`;

const STACK_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "floors": [   // 아래층부터 순서대로 3~8개
    {"name":"1F", "h":4.2, "programs":[ {"name":"로비·카페", "tone":"public|semi|quiet|private|service", "width":0.05~1, "area":"(선택)620㎡", "no":"(선택)1"} ]}   // width = 그 층에서 차지하는 폭 비율(합이 1 근처), 한 층에 최대 6칸. h = 층고(m, 선택)
  ],
  "voids":  [ {"from":0, "to":3, "x":0.42, "w":0.16, "label":"중앙 보이드"} ],   // from/to = 층 인덱스(0부터), x/w = 건물 폭 대비 비율. 없으면 빈 배열
  "cores":  [ {"x":0.92, "label":"코어"} ],
  "forces": [ {"kind":"light|wind|view|noise", "label":"자연채광"} ],            // 환경 요소, 최대 4개
  "gradient": {"label":"공공성", "from":"높음", "to":"낮음"}                      // 아래→위로 변하는 정도(없으면 null)
}`;

export const SITE_RULES = `- 도면·평면·배치도 위에 동선·구역을 표시하는 요청(번호·범례·차량/보행 구분이 나오는 것)이면 flow 에 "style":"line" 을 쓴다(선명한 선 + 화살촉). 같은 패널에 흐름의 종류가 둘 이상이면 label(8자 이내)을 붙여 범례를 만들고, 순서가 있으면 no(1~99)로 번호 배지를 붙인다. 점선은 계획·예정·보조 동선에만 쓴다(dashed:true).
- 색의 뜻(사내 도면 관례): 차량·진입 = 빨강 #D0342F, 보행 = 파랑 #2F7FBF, 녹지·산책 = 초록 #3E8E41, 주요·강조 흐름 = 주황 #F28C28. 요청에 뜻이 없으면 한 가지 색만 쓴다. 한 패널에 선 동선은 4개 이하.
- 부드럽게 퍼지는 개념 포스터(플로우 허브·커뮤니티 가든 같은 문장형 요청)는 style 을 생략한다(기존 번지는 띠).
위치는 반드시 이 9개 앵커 중 하나로만 지정한다: ${ANCHORS.join(', ')} (center=대지 중앙, n=북쪽/위, e=동쪽/오른쪽 …).
icon은 반드시 아래 목록의 이름(왼쪽 영문) 중 하나로만 쓴다(뜻이 가장 가까운 것을 고른다). 분류별: ${ICON_GROUPS.map((g) => `[${g.label}] ${g.names.map((n) => `${n}(${ICON_LABEL[n]})`).join(', ')}`).join(' / ')}.
- 한 패널에는 개념 하나만 담는다(흐름이면 flow, 구역이면 zone+marker, 순환이면 cycle).
- marker는 한 패널에 최대 6개. label 텍스트는 15자 이내. 모든 글자는 한국어 그대로 쓴다.
- 색은 패널마다 조화로운 계열(같은 패널 안에서는 accent와 같은 계열)을 쓴다.`;

const MASSING_RULES = `- 이전 단계의 매스를 유지하면서 한 단계씩 변화시킨다(덜어내기는 mode:"subtract", 더하기는 mode:"add"). 마지막 단계는 변화 표시 없이 최종 형태만 둔다.
- 덜어내기 단계에서는 원래 매스(솔리드 박스)는 그대로 두고, 덜어낼 부분을 mode:"subtract" 박스로 매스 안쪽의 그 위치에 적는다. 프로그램이 매스에서 그만큼 도려내고 그 박스를 위로 빼서 보여 준다(그래서 단계마다 눈에 띄는 변화가 있어야 한다: 덜어낸 부분은 매스 부피의 10~40%).
- 솔리드 박스끼리는 겹치게 배치하지 않는다. 모든 단계의 ground 크기는 동일하게 유지한다.
- 숫자는 모듈 단위(보통 0~6)로 작게 쓴다. label 은 그 단계가 하는 일을 한 줄(20자 안팎)로 쓴다(예: 중앙을 덜어 열린 마당을 만든다). 영문 대문자 이름(EXTRUSION 등)도 된다.
- leaders(지시선)는 요청·자료에 프로그램·공간 이름이 있을 때만 쓴다(없는 이름을 지어내지 않는다). 한 단계에 4개까지, 이름은 14자 이내. icon 은 뜻이 분명할 때만(모르면 생략): ${ICON_NAMES.join(', ')}.
- arrows 는 진입·동선·바람 같은 흐름이 요청에 있을 때만 쓴다. 색: 주황(#F28C28)=주요 흐름, 파랑(#2F7FBF)=사람·접근, 초록(#3E8E41)=자연·환경. 색이 필요 없으면 생략한다.
- 기능·영역별로 매스를 구분하려면 일반 매스에 color(옅은 색)를 준다. 구분이 필요 없으면 생략한다(흰색).`;

const PROGRAM_RULES = `- 좌표를 정하지 않는다. 묶음(groups)은 성격이 같은 공간끼리 2~5개로 나누고 모든 노드가 반드시 하나의 묶음에 속하게 한다.
- 노드 label 은 12자 이내의 공간 이름. 실제 면적이 주어지면 면적에 비례해 size 를 정하고, 없으면 중요도로 정한다.
- links 는 실제로 이어져야 하는 관계만 쓰고 모든 노드가 최소 하나의 연결을 갖게 한다. 직접 접하는 관계는 direct, 느슨한 관련은 weak.
- area 는 자료에 면적이 실제로 적혀 있을 때만 그대로 옮긴다(없으면 생략, 지어내지 않는다). icon 은 뜻이 분명할 때만 쓰고 모르면 생략한다(생략하면 이름으로 짐작해 붙인다). 쓸 수 있는 icon: ${ICON_NAMES.join(', ')}.`;

const STACK_RULES = `- floors 는 아래층부터 순서대로 적는다(지하층이 있으면 B1 을 맨 앞). 한 층의 programs 는 폭(width)의 합이 1 근처가 되게 한다.
- tone 은 공공성에 따라 고른다: public(누구나 쓰는 공공), semi(준공공), quiet(조용한 학습·업무), private(사적), service(지원·설비).
- 보이드·코어·환경 요소는 요청에 있을 때만 넣고, 없으면 빈 배열로 둔다. 프로그램 이름은 12자 이내 한국어.
- h(층고)·area(면적)는 자료에 숫자가 적혀 있을 때만 그대로 옮긴다(없으면 생략). no 는 설명에서 번호로 강조·구분하는 칸(예: 보안 등급)에만 1~9 숫자로 붙인다.`;

const IMAGE_RULE = `참고 이미지가 첨부되어 있다. 이미지를 먼저 분석해서 칸(패널/단계) 수, 각 칸이 보여주는 개념, 사용된 요소(흐름선·구역·아이콘 칩·매스 변화)와 전체 구성을 파악하고, 같은 구성과 흐름으로 만들되 내용은 아래 요청 문장을 우선 반영한다. 이미지 안의 글자는 그대로 베끼지 말고 요청에 맞게 새로 쓴다.`;

// 소재 이미지를 '바탕'이 아니라 '내용을 읽어 올 자료'로 쓰는 종류(imgs.ref): 이미지에 보이는 글자·항목만 옮기고 지어내지 않는다
export const REF_TYPES = ['table', 'cards']; // 내용 읽기가 되는 종류(버블도·조닝도는 제공 목록에서 뺐다)
const REF_RULES = {
  table: '이미지는 표(건축개요·면적표·일람표 등)를 찍거나 캡처한 것이다. 보이는 라벨–값을 위에서 아래 순서대로 rows 에 옮긴다. cols 는 보이는 열 수에 맞추되 최대 4(열이 더 많으면 핵심 4열만), 숫자 열이 많은 표(면적표 등)는 style 을 "stripe" 로 한다. 구분(건물개요·주차개요 등) 칸이 여러 줄에 걸쳐 합쳐져 있거나 비고 열·소계 줄이 있는 설계개요 표는 style "doc"(cols 3~5, 구분은 첫 줄에만 쓰고 아래는 "")으로 옮기고, 회색 머리글 줄이 보이면 header 에 열 이름을 쓴다. 표 제목이 보이면 table.title 에 쓰고, 글자가 흐려 읽지 못한 칸은 비워 둔다.',
  stack: '이미지는 단면도·입면도·층별 면적표·층 구성표 중 하나다. 층 수와 층별 용도(프로그램)를 읽어 floors 를 아래층부터 채운다(지하층은 B1 처럼 쓰고, 8층을 넘으면 비슷한 층을 묶는다). 층 안의 구획이 보이면 programs 로, 비어 있는 높은 공간(보이드)과 코어가 보이면 voids·cores 로 넣는다. 글자로 적힌 용도만 쓰고 적히지 않은 프로그램을 지어내지 않는다.',
  program: '이미지는 평면도·공간 목록·면적표·기능 관계 스케치 중 하나다. 보이는 공간(방·실)의 이름을 nodes 로 옮기고, 면적이 적혀 있으면 면적에 비례해 size 를 정한다(없으면 중요도로). 성격이 같은 공간을 묶어 groups 로 나누고, 평면에서 서로 붙어 있거나 문·복도로 이어진 공간, 또는 선으로 이어진 공간은 links 로 연결한다. 공간이 25개를 넘으면 큰 공간·중요한 공간 위주로 하고, 이미지에 없는 공간은 지어내지 않는다.',
  cards: '이미지는 계획 자료(문서·표·도면 설명)다. 이미지에 적힌 항목과 수치를 읽어 핵심 가치 띠와 카드로 나누어 요약한다. 카드 제목과 불릿은 이미지에 적힌 말을 줄여서 쓰고, 이미지에 없는 성능 수치나 주장을 지어내지 않는다.',
};
const refRule = (type) => `첨부 이미지는 만들 내용을 읽어 오는 자료이며 그림의 바탕으로 깔리지 않는다. ${REF_RULES[type] || '이미지에 보이는 글자·항목을 읽어 해당 스키마의 값으로 옮긴다.'} 이미지에 실제로 보이는 것만 쓰고, 아래 요청 문장이 있으면 그 지시(강조·제외·정리 방식)를 따른다.`;

const ASIS_RULE = `첨부 이미지(조감도·배치도·항공사진 등)는 그림의 바탕으로 그대로 쓰인다. 프로그램이 모든 패널에 이 이미지를 깔고 그 위에 흐름선·구역·아이콘 칩을 얹는다.
이미지를 보고 건물·도로·광장·녹지가 실제로 어느 쪽에 있는지 파악한 뒤, 9개 앵커(n=이미지 위쪽, s=아래쪽, e=오른쪽, w=왼쪽, center=가운데 …)를 그 위치에 맞춰 고른다. 이미지에 실제로 없는 곳에 표시를 두지 않는다. 한 패널에는 개념 하나만 얹고, 패널마다 다른 개념을 보여준다. siteShape 는 "rect" 로 한다.`;

const CARDS_SCHEMA = `{
  "title": "",                       // 비워 둔다(제목은 페이지 머리가 쓴다)
  "accent": "#2F6BB5",               // 강조색(아이콘 칩)
  "bands": [                         // 위에서 아래로 쌓는 띠. 틀에 정해진 순서를 지킨다(최대 4개)
    { "kind": "keypoints", "style": "bracket|tabs|tiles", "label": "설계주안점",   // tiles(인증 타일형)은 title=타일 제목, text=값(예: 4등급), 최대 6개
      "items": [ {"no":"01", "title":"시공성", "text":"한두 줄 설명(60자 이내)", "icon":"hard-hat"} ] },          // 3~6개
    { "kind": "hero", "imageNote": "구조 아이소 그림",
      "callouts": [ {"side":"left|right", "title":"라벨 제목(20자 이내)", "text":"설명(60자 이내)"} ],          // 큰 그림 좌우에 붙는 설명 4~6개(왼쪽·오른쪽에 반씩). 설비형은 빈 배열
      "tables":   [ {"title":"주요 시스템", "cols":2, "style":"label", "rows":[["라벨","값"]]} ],               // 오른쪽 개요표 0~2개(행 3~6개). 설비형은 빈 배열
      "legends":  [ {"side":"left|right", "title":"기계 / 소방 설비", "numbered":false, "items":[ {"icon":"fan", "text":"자동제어", "desc":"번호 목록일 때만 쓰는 한 줄 설명(44자)"} ]} ] },  // 아이콘 목록 0~2개(항목 최대 10개, 글 22자 이내). numbered 면 번호가 붙는다. 계획 요약형은 빈 배열
    { "kind": "columns3",            // 3열 가치형: 열마다 [작은 문구 + 큰 키워드] + 큰 그림 + 소도식·제목·설명 줄(3줄)
      "cols": [ {"lead":"작은 문구(36자 이내)", "key":"키워드(10자 이내)", "rows":[ {"title":"제목(26자)", "text":"설명(76자)", "slot":{"kind":"icon|image", "icon":"sparkles"}} ]} ] },   // 열 3개
    { "kind": "process", "items": [ {"icon":"map", "title":"단계 제목(16자)", "text":"설명(44자)"} ] },                                             // 프로세스 띠 3~5개
    { "kind": "chips", "groups": [ {"chip":"구 조", "items":[ {"icon":"layers", "title":"항목(16자)", "text":"한 줄(30자)"} ]} ] },              // 분야 칩 띠: 분야 2~4개, 분야마다 항목 1~4개
    { "kind": "cards", "tone": "gray", "label": "띠 제목(없으면 빈 문자열)",
      "cards": [ {"title":"카드 제목(30자 이내)", "icon":"", "sub":"", "slots":[ {"kind":"icon|image", "icon":"zap", "caption":"작은 이름(16자 이내)"} ], "bullets":["불릿 한 줄(46자 이내)"]} ] }  // 카드는 모든 띠를 합쳐 최대 12개
  ]
}`;

const CARDS_RULES_BASE = `- 좌표·크기를 정하지 않는다. 글은 간결한 명사형 한국어로 쓰고 숫자·인증·법규 같은 사실은 요청에 없으면 지어내지 않는다(일반적인 설계 방향만 쓴다).
- 한도: 핵심 가치 6개, 히어로 라벨 6개, 개요표 2개, 아이콘 목록 항목 10개, 3열 가치형 열 3개·열당 3줄, 프로세스 5단계, 분야 칩 4개, 카드 12개(전체 합), 카드당 슬롯 3개·불릿 2개. 글자 수 한도를 넘기지 않는다.
- icon 은 반드시 아래 목록의 이름 중 하나만 쓴다(뜻이 가장 가까운 것). 슬롯 kind 는 도식·사진이 들어갈 자리면 "image", 아이콘 타일이면 "icon".
- 한 카드는 한 가지 주제만 담는다. 같은 띠의 카드 제목은 길이를 비슷하게 맞춘다.`;
const CARDS_PRESET_RULES = {
  plan: '계획 요약형 — keypoints(5개) → hero(callouts 4~6개를 왼쪽·오른쪽에 반씩, tables 1~2개, legends 는 빈 배열) → cards 한 띠(6개, 각 카드 slots 1~3개).',
  system: '설비·시스템형 — keypoints(6개) → hero(callouts·tables 는 빈 배열, legends 는 왼쪽 1개·오른쪽 1개, 각 항목 8~10개) → cards 두 띠(각 6개, 각 카드 slots 는 kind "image" 하나, 두 띠 모두 label 을 쓴다).',
  values3: '3열 가치형 — 띠는 columns3 하나만 쓴다. cols 3개(각 열: lead 작은 문구 + key 큰 키워드(예: 차별성·분양성·경제성) + rows 3개). 각 row 의 slot 은 그림이 필요하면 kind "image", 아니면 "icon".',
  eco: '친환경·에너지형 — keypoints(style "tiles", 인증·성능 지표 5개: title 은 지표 이름, text 는 값) → hero(legends 하나: side "left", numbered true, 항목 8~10개에 desc 한 줄 설명, callouts·tables 는 빈 배열) → process(3~5단계) → cards 한 띠(4개, 각 slots 는 kind "image" 하나, 카드 icon 을 쓴다).',
  field: '분야별 계획형 — hero(callouts·tables·legends 모두 빈 배열, imageNote 만) → chips(분야 4개: 예 구조·기계·전기·통신·소방, 분야마다 항목 2~3개) → cards 한 띠(3개: 분야별 계획, 각 slots 는 kind "image" 하나, bullets 1~2개).',
};
const cardsRules = (preset) => `${CARDS_RULES_BASE}
- 틀: ${CARDS_PRESET_RULES[preset] || CARDS_PRESET_RULES.plan}
- 아이콘 목록: ${ICON_GROUPS.map((g) => `[${g.label}] ${g.names.map((n) => `${n}(${ICON_LABEL[n]})`).join(', ')}`).join(' / ')}.`;

const SCHEMAS = { site: SITE_SCHEMA, massing: MASSING_SCHEMA, program: PROGRAM_SCHEMA, stack: STACK_SCHEMA, cards: CARDS_SCHEMA, table: TABLE_DOC_SCHEMA };
const RULES = { site: SITE_RULES, massing: MASSING_RULES, program: PROGRAM_RULES, stack: STACK_RULES, cards: cardsRules('plan'), table: TABLE_DOC_RULES };

// type: 'auto' | 'site' | 'massing' | 'cards' | 'table' (program·stack 은 제공하지 않지만 직접 지정하면 예전처럼 동작). auto 면 AI가 내용을 보고 종류까지 고르고, 응답 최상위에 "type" 을 넣게 한다.
export function buildConceptPrompt(type, userText, imgs = {}, extra = {}) {
  const head = `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래 요청을 보고 다이어그램의 구조를 JSON으로만 출력한다(설명/마크다운/코드펜스 금지).
좌표를 픽셀로 계산하지 말고 아래 스키마의 값만 채운다. 실제 그리기는 프로그램이 한다.`;
  const hasAny = !!(imgs.asis || imgs.ref || imgs.style);
  const lead = imgs.asis || imgs.ref; // 첫 번째 이미지를 쓰는 경우(바탕 또는 읽어 올 자료)
  const emptyAsk = imgs.ref ? '(텍스트 없음 — 첨부 이미지의 내용을 읽어 만든다)' : '(텍스트 없음 — 참고 이미지와 같은 구성으로 만든다)';
  const image = !hasAny ? '' : `\n\n${[
    imgs.asis ? `[첫 번째 이미지 — 바탕으로 쓸 이미지]\n${ASIS_RULE}` : '',
    imgs.ref && !imgs.asis ? `[첫 번째 이미지 — 내용을 읽어 올 자료]\n${refRule(type)}` : '',
    imgs.style ? `[${lead ? '두 번째' : '첨부'} 이미지 — 스타일 참고]\n${IMAGE_RULE}${lead ? ' 단, 내용·위치는 첫 번째 이미지와 요청을 따르고 이 이미지는 칸 구성·요소·표현 방식만 참고한다.' : ''}` : '',
  ].filter(Boolean).join('\n\n')}`;
  if (type === 'auto') {
    return `${head}

먼저 요청의 성격에 맞는 종류를 고른다.
- "site": 대지/배치도 위에 동선·구역·테마·순환 같은 개념을 표시하는 배치 개념도
- "massing": 건물 매스를 단계별로 더하고 덜어내며 형태가 만들어지는 과정을 보여주는 아이소메트릭 매스 과정도
- "cards": 한 분야(구조·설비·에너지 등)의 계획을 핵심 가치 띠 + 큰 그림 자리 + 카드 격자로 요약하는 계획 요약 보드(카드 보드)
- "table": 건축개요·면적표처럼 라벨–값으로 된 2~4열 표 하나(개요표)
선택한 종류의 스키마 값을 채우고, JSON 최상위에 "type":"site", "massing", "cards", "table" 중 하나를 반드시 포함한다.

[site 스키마]
${SITE_SCHEMA}

[site 규칙]
${SITE_RULES}

[massing 스키마]
${MASSING_SCHEMA}

[massing 규칙]
${MASSING_RULES}

[cards 스키마]
${CARDS_SCHEMA}

[cards 규칙]
${cardsRules(extra.preset)}

[table 스키마]
${TABLE_DOC_SCHEMA}

[table 규칙]
${TABLE_DOC_RULES}${image}

요청: ${userText || emptyAsk}`;
  }
  return `${head}

스키마:
${SCHEMAS[type] || SITE_SCHEMA}

규칙:
${type === 'cards' ? cardsRules(extra.preset) : (RULES[type] || SITE_RULES)}${image}

요청: ${userText || emptyAsk}`;
}
export function parseJsonLoose(text) {
  const t = String(text || '').replace(/```json|```/gi, '').trim();
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(t.slice(a, b + 1));
}

// AI가 틀린 값을 줘도 렌더가 깨지지 않게 정규화
export function normalizeSpec(type, spec) {
  if (!spec || typeof spec !== 'object') throw new Error('스펙이 비어 있습니다.');
  if (type === 'massing') {
    if (!Array.isArray(spec.steps) || !spec.steps.length) throw new Error('steps 가 비어 있습니다.');
    return spec;
  }
  if (type === 'sketch') return normalizeSketch(spec);
  if (type === 'program') return normalizeProgram(spec);
  if (type === 'stack') return normalizeStack(spec);
  if (type === 'table') return normalizeTableDoc(spec);
  if (type === 'cards') { const n = normalizeCards(spec); if (!n.bands.length) throw new Error('bands 가 비어 있습니다.'); return n; }
  if (!Array.isArray(spec.panels) || !spec.panels.length) throw new Error('panels 가 비어 있습니다.');
  const baseIds = new Set(((spec.siteBase && spec.siteBase.shapes) || []).map((s) => String(s.id)));
  const fixAnchor = (a) => {
    if (Array.isArray(a) && a.length === 2 && a.every((n) => Number.isFinite(Number(n)))) return a.map(Number);
    if (typeof a === 'string' && (ANCHORS.includes(a) || baseIds.has(a))) return a;
    return 'center';
  };
  return {
    ...spec,
    panels: spec.panels.slice(0, 6).map((p) => ({
      ...p,
      siteShape: SITE_SHAPES.includes(p.siteShape) ? p.siteShape : 'blob',
      overlays: (Array.isArray(p.overlays) ? p.overlays : []).slice(0, 14).map((o) => ({
        ...o,
        anchor: o.anchor !== undefined ? fixAnchor(o.anchor) : undefined,
        from: o.from !== undefined ? fixAnchor(o.from) : undefined,
        to: Array.isArray(o.to) ? o.to.map(fixAnchor) : (o.to !== undefined ? fixAnchor(o.to) : undefined),
        icon: o.kind === 'marker' ? resolveIcon(o.icon) : o.icon,
      })),
    })),
  };
}

export function renderSpec(type, spec, opts) {
  if (type === 'layout') return renderLayout2d(normalizeLayoutPanels(spec));
  const n = normalizeSpec(type, spec);
  if (type === 'sketch') return renderSketch(n);
  if (type === 'program') return renderProgram(n);
  if (type === 'stack') return renderStack(n);
  if (type === 'cards') return renderCards(n);
  if (type === 'table') return renderTableDoc(n);
  return type === 'massing' ? renderMassing(n) : renderSiteConcept(n, opts);
}

// ── 글자 수정 폼: 스펙 안의 문자열 중 사람이 고칠 만한 것만 뽑는다 ──
export function getTextFields(type, spec) {
  const out = [];
  if (!spec) return out;
  if (type === 'sketch') return getSketchTextFields(spec);
  if (type === 'cards') return getCardsTextFields(spec);
  if (type === 'table') return getTableDocFields(spec);
  if (spec.title !== undefined) out.push({ path: ['title'], label: '전체 제목', value: spec.title || '' });
  if (type === 'massing') {
    (spec.steps || []).forEach((s, i) => { out.push({ path: ['steps', i, 'label'], label: `단계 ${i + 1} 이름`, value: s.label || '' }); (s.leaders || []).forEach((l, j) => { if (l && l.label) out.push({ path: ['steps', i, 'leaders', j, 'label'], label: `단계 ${i + 1} 지시선 ${j + 1}`, value: String(l.label) }); }); });
  } else if (type === 'program') {
    (spec.groups || []).forEach((g, i) => { if (g.name !== undefined) out.push({ path: ['groups', i, 'name'], label: `묶음 ${i + 1} 이름`, value: g.name || '' }); });
    (spec.nodes || []).forEach((n, i) => { out.push({ path: ['nodes', i, 'label'], label: `공간 ${i + 1}`, value: n.label || '' }); if (n.area) out.push({ path: ['nodes', i, 'area'], label: `공간 ${i + 1} 면적`, value: String(n.area) }); });
  } else if (type === 'stack') {
    (spec.floors || []).forEach((f, i) => {
      out.push({ path: ['floors', i, 'name'], label: `층 ${i + 1} 이름`, value: f.name || '' });
      (f.programs || []).forEach((p, j) => { out.push({ path: ['floors', i, 'programs', j, 'name'], label: `${f.name || i + 1} 칸 ${j + 1}`, value: p.name || '' }); if (p.area) out.push({ path: ['floors', i, 'programs', j, 'area'], label: `${f.name || i + 1} 칸 ${j + 1} 면적`, value: String(p.area) }); });
    });
    (spec.voids || []).forEach((v, i) => out.push({ path: ['voids', i, 'label'], label: `보이드 ${i + 1}`, value: v.label || '' }));
    (spec.cores || []).forEach((c, i) => out.push({ path: ['cores', i, 'label'], label: `코어 ${i + 1}`, value: c.label || '' }));
    (spec.forces || []).forEach((f, i) => out.push({ path: ['forces', i, 'label'], label: `환경 요소 ${i + 1}`, value: f.label || '' }));
  } else if (type === 'layout') {
    (spec.panels || []).forEach((p, i) => {
      out.push({ path: ['panels', i, 'heading'], label: `패널 ${i + 1} 제목 ({강조})`, value: p.heading || '' });
      (p.zones || []).forEach((z, j) => { if (z.label !== undefined) out.push({ path: ['panels', i, 'zones', j, 'label'], label: `패널 ${i + 1} 구역 이름`, value: z.label || '' }); });
      (p.notes || []).forEach((n, j) => out.push({ path: ['panels', i, 'notes', j, 'text'], label: `패널 ${i + 1} 주석`, value: n.text || '' }));
    });
  } else {
    (spec.panels || []).forEach((p, i) => {
      out.push({ path: ['panels', i, 'heading'], label: `패널 ${i + 1} 제목 ({강조})`, value: p.heading || '' });
      (p.overlays || []).forEach((o, j) => {
        if (o.kind === 'marker') out.push({ path: ['panels', i, 'overlays', j, 'label'], label: `패널 ${i + 1} 칩`, value: o.label || '' });
        if (o.kind === 'label') out.push({ path: ['panels', i, 'overlays', j, 'text'], label: `패널 ${i + 1} 주석`, value: o.text || '' });
        if ((o.kind === 'flow' || o.kind === 'zone') && o.label) out.push({ path: ['panels', i, 'overlays', j, 'label'], label: `패널 ${i + 1} 범례 ${j + 1}`, value: String(o.label) });
      });
    });
  }
  return out;
}

export function setByPath(obj, path, value) {
  const copy = JSON.parse(JSON.stringify(obj));
  let cur = copy;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return copy;
}
