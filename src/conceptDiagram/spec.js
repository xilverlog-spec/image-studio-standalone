import { ANCHORS, SITE_SHAPES, renderSiteConcept } from './siteConcept';
import { renderMassing } from './massing';
import { renderLayout2d, normalizeLayoutPanels } from './layout2d';
import { ICON_NAMES, ICON_LABEL } from './icons';
import { renderProgram, normalizeProgram } from './program';
import { renderStack, normalizeStack } from './stack';

export const DIAGRAM_TYPES = {
  site: { label: '배치 개념도 (흐름·정원·순환)', hint: '배치도 위에 흐름선, 해칭 구역, 아이콘 칩을 얹는 개념도' },
  massing: { label: '매스 과정도 (아이소 단계)', hint: 'EXTRUSION / SUBTRACTION / ADDITION 식으로 매스를 단계별로 보여주는 도식' },
  program: { label: '프로그램 버블도 (공간 구성·관계)', hint: '공간(프로그램)을 원으로, 면적·중요도를 크기로, 성격이 같은 것을 같은 색 묶음으로 그리고 연결 관계를 선으로 잇는 도식' },
  stack: { label: '층별 조닝도 (단면 스택)', hint: '건물을 단면처럼 층 띠로 쌓고 층마다 프로그램 칸, 보이드·코어·채광/바람/조망, 공공성 변화 화살표를 얹는 도식' },
};

export const EXAMPLE_SPECS = {
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
    accent: '#C97B5A',
    steps: [
      { label: 'EXTRUSION', ground: { x: 0, y: 0, w: 5, d: 4 }, boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 4, h: 2 }] },
      {
        label: 'SUBTRACTION', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 1.7, z: 2.4, w: 5, d: 0.6, h: 1.6, mode: 'subtract', move: 'up', len: 1.4 }],
      },
      {
        label: 'ADDITION', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2 }, { x: 1.8, y: 1.55, z: 3.2, w: 1.4, d: 0.9, h: 1.8, mode: 'add', move: 'down', len: 1.2 }],
      },
      {
        label: 'FINAL FORM', ground: { x: 0, y: 0, w: 5, d: 4 },
        boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 1.7, h: 2 }, { x: 0, y: 2.3, z: 0, w: 5, d: 1.7, h: 2 }, { x: 1.8, y: 1.55, z: 2, w: 1.4, d: 0.9, h: 1.8 }],
      },
    ],
  },
  program: {
    title: '복합문화시설 프로그램 구성',
    groups: [{ id: 'pub', name: '공공·전시', color: '#F28C28' }, { id: 'edu', name: '교육·커뮤니티', color: '#1E90C8' }, { id: 'sup', name: '지원', color: '#4B5563' }],
    nodes: [
      { id: 'lobby', label: '로비', group: 'pub', size: 4 }, { id: 'exhib', label: '전시실', group: 'pub', size: 5 }, { id: 'cafe', label: '카페', group: 'pub', size: 3 },
      { id: 'class', label: '교육실', group: 'edu', size: 3 }, { id: 'lib', label: '자료실', group: 'edu', size: 3 }, { id: 'comm', label: '커뮤니티홀', group: 'edu', size: 4 },
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
      { name: '1F', programs: [{ name: '로비·카페', tone: 'public', width: 0.6 }, { name: '전시', tone: 'public', width: 0.4 }] },
      { name: '2F', programs: [{ name: '커뮤니티', tone: 'semi', width: 0.5 }, { name: '교육실', tone: 'quiet', width: 0.5 }] },
      { name: '3F', programs: [{ name: '자료실', tone: 'quiet', width: 0.6 }, { name: '사무', tone: 'service', width: 0.4 }] },
      { name: '4F', programs: [{ name: '옥상정원·라운지', tone: 'private', width: 1 }] },
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
        {"kind":"flow",   "from":"center", "to":["n","e","sw"], "color":"#RRGGBB"},          // 사람/동선의 흐름(중심에서 퍼짐)
        {"kind":"zone",   "anchor":"e", "size":"s|m|l", "pattern":"hatch|dots|fill", "color":"#RRGGBB"}, // 성격이 같은 구역
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
  "accent": "#C97B5A",
  "steps": [   // 3~6단계. 단계 하나 = 도식 한 칸
    {
      "label": "EXTRUSION",   // 단계 이름(영문 대문자 또는 한글)
      "ground": {"x":0,"y":0,"w":5,"d":4},   // 대지 바닥 판(모듈 단위)
      "boxes": [
        // x,y = 바닥 위치, z = 바닥에서 띄운 높이, w = x방향 길이, d = y방향 길이, h = 높이 (모두 모듈 단위, 0~10 정도)
        {"x":0,"y":0,"z":0,"w":5,"d":4,"h":2},                                          // 일반 매스
        {"x":0,"y":1.7,"z":2.4,"w":5,"d":0.6,"h":1.6,"mode":"subtract","move":"up","len":1.4}, // 덜어내는 부분(강조색 + 위로 뜨는 화살표)
        {"x":1.8,"y":1.5,"z":3.2,"w":1.4,"d":0.9,"h":1.8,"mode":"add","move":"down","len":1.2}  // 더하는 부분(강조색 + 아래로 내리는 화살표)
      ]
    }
  ]
}`;

const PROGRAM_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "groups": [ {"id":"pub","name":"묶음 이름(성격이 같은 공간들)","color":"#RRGGBB"} ],   // 2~5개 권장
  "nodes": [ {"id":"lobby","label":"공간 이름","group":"pub","size":1~5} ],               // size = 면적/중요도(5가 가장 큼), 8~25개
  "links": [ {"from":"lobby","to":"exhib","kind":"direct|weak","label":"짧은 설명(없으면 빈 문자열)"} ]   // direct = 직접 연결, weak = 약한 관련
}`;

const STACK_SCHEMA = `{
  "title": "전체 제목(없으면 빈 문자열)",
  "floors": [   // 아래층부터 순서대로 3~8개
    {"name":"1F", "programs":[ {"name":"로비·카페", "tone":"public|semi|quiet|private|service", "width":0.05~1} ]}   // width = 그 층에서 차지하는 폭 비율(합이 1 근처), 한 층에 최대 6칸
  ],
  "voids":  [ {"from":0, "to":3, "x":0.42, "w":0.16, "label":"중앙 보이드"} ],   // from/to = 층 인덱스(0부터), x/w = 건물 폭 대비 비율. 없으면 빈 배열
  "cores":  [ {"x":0.92, "label":"코어"} ],
  "forces": [ {"kind":"light|wind|view|noise", "label":"자연채광"} ],            // 환경 요소, 최대 4개
  "gradient": {"label":"공공성", "from":"높음", "to":"낮음"}                      // 아래→위로 변하는 정도(없으면 null)
}`;

export const SITE_RULES = `위치는 반드시 이 9개 앵커 중 하나로만 지정한다: ${ANCHORS.join(', ')} (center=대지 중앙, n=북쪽/위, e=동쪽/오른쪽 …).
icon은 반드시 다음 중 하나: ${ICON_NAMES.map((n) => `${n}(${ICON_LABEL[n]})`).join(', ')}.
- 한 패널에는 개념 하나만 담는다(흐름이면 flow, 구역이면 zone+marker, 순환이면 cycle).
- marker는 한 패널에 최대 6개. label 텍스트는 15자 이내. 모든 글자는 한국어 그대로 쓴다.
- 색은 패널마다 조화로운 계열(같은 패널 안에서는 accent와 같은 계열)을 쓴다.`;

const MASSING_RULES = `- 이전 단계의 매스를 유지하면서 한 단계씩 변화시킨다(덜어내기는 mode:"subtract", 더하기는 mode:"add"). 마지막 단계는 변화 표시 없이 최종 형태만 둔다.
- 덜어내기 단계에서는 원래 매스(솔리드 박스)는 그대로 두고, 덜어낼 부분을 mode:"subtract" 박스로 매스 안쪽의 그 위치에 적는다. 프로그램이 매스에서 그만큼 도려내고 그 박스를 위로 빼서 보여 준다(그래서 단계마다 눈에 띄는 변화가 있어야 한다: 덜어낸 부분은 매스 부피의 10~40%).
- 솔리드 박스끼리는 겹치게 배치하지 않는다. 모든 단계의 ground 크기는 동일하게 유지한다.
- 숫자는 모듈 단위(보통 0~6)로 작게 쓴다. label은 영문 대문자(예: EXTRUSION, SUBTRACTION, ADDITION, FINAL FORM)를 권장한다.`;

const PROGRAM_RULES = `- 좌표를 정하지 않는다. 묶음(groups)은 성격이 같은 공간끼리 2~5개로 나누고 모든 노드가 반드시 하나의 묶음에 속하게 한다.
- 노드 label 은 12자 이내의 공간 이름. 실제 면적이 주어지면 면적에 비례해 size 를 정하고, 없으면 중요도로 정한다.
- links 는 실제로 이어져야 하는 관계만 쓰고 모든 노드가 최소 하나의 연결을 갖게 한다. 직접 접하는 관계는 direct, 느슨한 관련은 weak.`;

const STACK_RULES = `- floors 는 아래층부터 순서대로 적는다(지하층이 있으면 B1 을 맨 앞). 한 층의 programs 는 폭(width)의 합이 1 근처가 되게 한다.
- tone 은 공공성에 따라 고른다: public(누구나 쓰는 공공), semi(준공공), quiet(조용한 학습·업무), private(사적), service(지원·설비).
- 보이드·코어·환경 요소는 요청에 있을 때만 넣고, 없으면 빈 배열로 둔다. 프로그램 이름은 12자 이내 한국어.`;

const IMAGE_RULE = `참고 이미지가 첨부되어 있다. 이미지를 먼저 분석해서 칸(패널/단계) 수, 각 칸이 보여주는 개념, 사용된 요소(흐름선·구역·아이콘 칩·매스 변화)와 전체 구성을 파악하고, 같은 구성과 흐름으로 만들되 내용은 아래 요청 문장을 우선 반영한다. 이미지 안의 글자는 그대로 베끼지 말고 요청에 맞게 새로 쓴다.`;

const ASIS_RULE = `첨부 이미지(조감도·배치도·항공사진 등)는 그림의 바탕으로 그대로 쓰인다. 프로그램이 모든 패널에 이 이미지를 깔고 그 위에 흐름선·구역·아이콘 칩을 얹는다.
이미지를 보고 건물·도로·광장·녹지가 실제로 어느 쪽에 있는지 파악한 뒤, 9개 앵커(n=이미지 위쪽, s=아래쪽, e=오른쪽, w=왼쪽, center=가운데 …)를 그 위치에 맞춰 고른다. 이미지에 실제로 없는 곳에 표시를 두지 않는다. 한 패널에는 개념 하나만 얹고, 패널마다 다른 개념을 보여준다. siteShape 는 "rect" 로 한다.`;

const SCHEMAS = { site: SITE_SCHEMA, massing: MASSING_SCHEMA, program: PROGRAM_SCHEMA, stack: STACK_SCHEMA };
const RULES = { site: SITE_RULES, massing: MASSING_RULES, program: PROGRAM_RULES, stack: STACK_RULES };

// type: 'auto' | 'site' | 'massing' | 'program' | 'stack'. auto 면 AI가 내용을 보고 종류까지 고르고, 응답 최상위에 "type" 을 넣게 한다.
export function buildConceptPrompt(type, userText, imgs = {}) {
  const head = `당신은 건축 설계사무소의 개념 다이어그램 설계자다. 아래 요청을 보고 다이어그램의 구조를 JSON으로만 출력한다(설명/마크다운/코드펜스 금지).
좌표를 픽셀로 계산하지 말고 아래 스키마의 값만 채운다. 실제 그리기는 프로그램이 한다.`;
  const hasAny = !!(imgs.asis || imgs.style);
  const image = !hasAny ? '' : `\n\n${[
    imgs.asis ? `[첫 번째 이미지 — 바탕으로 쓸 이미지]\n${ASIS_RULE}` : '',
    imgs.style ? `[${imgs.asis ? '두 번째' : '첨부'} 이미지 — 스타일 참고]\n${IMAGE_RULE}${imgs.asis ? ' 단, 내용·위치는 첫 번째 이미지와 요청을 따르고 이 이미지는 칸 구성·요소·표현 방식만 참고한다.' : ''}` : '',
  ].filter(Boolean).join('\n\n')}`;
  if (type === 'auto') {
    return `${head}

먼저 요청의 성격에 맞는 종류를 고른다.
- "site": 대지/배치도 위에 동선·구역·테마·순환 같은 개념을 표시하는 배치 개념도
- "massing": 건물 매스를 단계별로 더하고 덜어내며 형태가 만들어지는 과정을 보여주는 아이소메트릭 매스 과정도
- "program": 공간(프로그램)의 구성과 서로의 관계를 원(크기=면적/중요도)과 연결선으로 보여주는 프로그램 버블도
- "stack": 건물을 단면처럼 층별로 쌓아 층마다 어떤 프로그램이 들어가는지, 보이드·코어·채광 등을 보여주는 층별 조닝도
선택한 종류의 스키마 값을 채우고, JSON 최상위에 "type":"site", "massing", "program", "stack" 중 하나를 반드시 포함한다.

[site 스키마]
${SITE_SCHEMA}

[site 규칙]
${SITE_RULES}

[massing 스키마]
${MASSING_SCHEMA}

[massing 규칙]
${MASSING_RULES}

[program 스키마]
${PROGRAM_SCHEMA}

[program 규칙]
${PROGRAM_RULES}

[stack 스키마]
${STACK_SCHEMA}

[stack 규칙]
${STACK_RULES}${image}

요청: ${userText || '(텍스트 없음 — 참고 이미지와 같은 구성으로 만든다)'}`;
  }
  return `${head}

스키마:
${SCHEMAS[type] || SITE_SCHEMA}

규칙:
${RULES[type] || SITE_RULES}${image}

요청: ${userText || '(텍스트 없음 — 참고 이미지와 같은 구성으로 만든다)'}`;
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
  if (type === 'program') return normalizeProgram(spec);
  if (type === 'stack') return normalizeStack(spec);
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
        icon: o.kind === 'marker' ? (ICON_NAMES.includes(o.icon) ? o.icon : 'star') : o.icon,
      })),
    })),
  };
}

export function renderSpec(type, spec, opts) {
  if (type === 'layout') return renderLayout2d(normalizeLayoutPanels(spec));
  const n = normalizeSpec(type, spec);
  if (type === 'program') return renderProgram(n);
  if (type === 'stack') return renderStack(n);
  return type === 'massing' ? renderMassing(n) : renderSiteConcept(n, opts);
}

// ── 글자 수정 폼: 스펙 안의 문자열 중 사람이 고칠 만한 것만 뽑는다 ──
export function getTextFields(type, spec) {
  const out = [];
  if (!spec) return out;
  if (spec.title !== undefined) out.push({ path: ['title'], label: '전체 제목', value: spec.title || '' });
  if (type === 'massing') {
    (spec.steps || []).forEach((s, i) => out.push({ path: ['steps', i, 'label'], label: `단계 ${i + 1} 이름`, value: s.label || '' }));
  } else if (type === 'program') {
    (spec.groups || []).forEach((g, i) => { if (g.name !== undefined) out.push({ path: ['groups', i, 'name'], label: `묶음 ${i + 1} 이름`, value: g.name || '' }); });
    (spec.nodes || []).forEach((n, i) => out.push({ path: ['nodes', i, 'label'], label: `공간 ${i + 1}`, value: n.label || '' }));
  } else if (type === 'stack') {
    (spec.floors || []).forEach((f, i) => {
      out.push({ path: ['floors', i, 'name'], label: `층 ${i + 1} 이름`, value: f.name || '' });
      (f.programs || []).forEach((p, j) => out.push({ path: ['floors', i, 'programs', j, 'name'], label: `${f.name || i + 1} 칸 ${j + 1}`, value: p.name || '' }));
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
