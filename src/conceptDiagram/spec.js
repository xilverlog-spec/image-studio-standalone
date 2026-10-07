import { ANCHORS, SITE_SHAPES, renderSiteConcept } from './siteConcept';
import { renderMassing } from './massing';
import { renderLayout2d, normalizeLayoutPanels } from './layout2d';
import { ICON_NAMES, ICON_LABEL } from './icons';

export const DIAGRAM_TYPES = {
  site: { label: '배치 개념도 (흐름·정원·순환)', hint: '배치도 위에 흐름선, 해칭 구역, 아이콘 칩을 얹는 개념도' },
  massing: { label: '매스 과정도 (아이소 단계)', hint: 'EXTRUSION / SUBTRACTION / ADDITION 식으로 매스를 단계별로 보여주는 도식' },
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

export const SITE_RULES = `위치는 반드시 이 9개 앵커 중 하나로만 지정한다: ${ANCHORS.join(', ')} (center=대지 중앙, n=북쪽/위, e=동쪽/오른쪽 …).
icon은 반드시 다음 중 하나: ${ICON_NAMES.map((n) => `${n}(${ICON_LABEL[n]})`).join(', ')}.
- 한 패널에는 개념 하나만 담는다(흐름이면 flow, 구역이면 zone+marker, 순환이면 cycle).
- marker는 한 패널에 최대 6개. label 텍스트는 15자 이내. 모든 글자는 한국어 그대로 쓴다.
- 색은 패널마다 조화로운 계열(같은 패널 안에서는 accent와 같은 계열)을 쓴다.`;

const MASSING_RULES = `- 이전 단계의 매스를 유지하면서 한 단계씩 변화시킨다(덜어내기는 mode:"subtract", 더하기는 mode:"add"). 마지막 단계는 변화 표시 없이 최종 형태만 둔다.
- 덜어내기 단계에서는 원래 매스(솔리드 박스)는 그대로 두고, 덜어낼 부분을 mode:"subtract" 박스로 매스 안쪽의 그 위치에 적는다. 프로그램이 매스에서 그만큼 도려내고 그 박스를 위로 빼서 보여 준다(그래서 단계마다 눈에 띄는 변화가 있어야 한다: 덜어낸 부분은 매스 부피의 10~40%).
- 솔리드 박스끼리는 겹치게 배치하지 않는다. 모든 단계의 ground 크기는 동일하게 유지한다.
- 숫자는 모듈 단위(보통 0~6)로 작게 쓴다. label은 영문 대문자(예: EXTRUSION, SUBTRACTION, ADDITION, FINAL FORM)를 권장한다.`;

const IMAGE_RULE = `참고 이미지가 첨부되어 있다. 이미지를 먼저 분석해서 칸(패널/단계) 수, 각 칸이 보여주는 개념, 사용된 요소(흐름선·구역·아이콘 칩·매스 변화)와 전체 구성을 파악하고, 같은 구성과 흐름으로 만들되 내용은 아래 요청 문장을 우선 반영한다. 이미지 안의 글자는 그대로 베끼지 말고 요청에 맞게 새로 쓴다.`;

const ASIS_RULE = `첨부 이미지(조감도·배치도·항공사진 등)는 그림의 바탕으로 그대로 쓰인다. 프로그램이 모든 패널에 이 이미지를 깔고 그 위에 흐름선·구역·아이콘 칩을 얹는다.
이미지를 보고 건물·도로·광장·녹지가 실제로 어느 쪽에 있는지 파악한 뒤, 9개 앵커(n=이미지 위쪽, s=아래쪽, e=오른쪽, w=왼쪽, center=가운데 …)를 그 위치에 맞춰 고른다. 이미지에 실제로 없는 곳에 표시를 두지 않는다. 한 패널에는 개념 하나만 얹고, 패널마다 다른 개념을 보여준다. siteShape 는 "rect" 로 한다.`;

// type: 'auto' | 'site' | 'massing'. auto 면 AI가 내용을 보고 종류까지 고르고, 응답 최상위에 "type" 을 넣게 한다.
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
선택한 종류의 스키마 값을 채우고, JSON 최상위에 "type":"site" 또는 "type":"massing" 을 반드시 포함한다.

[site 스키마]
${SITE_SCHEMA}

[site 규칙]
${SITE_RULES}

[massing 스키마]
${MASSING_SCHEMA}

[massing 규칙]
${MASSING_RULES}${image}

요청: ${userText || '(텍스트 없음 — 참고 이미지와 같은 구성으로 만든다)'}`;
  }
  return `${head}

스키마:
${type === 'site' ? SITE_SCHEMA : MASSING_SCHEMA}

규칙:
${type === 'site' ? SITE_RULES : MASSING_RULES}${image}

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
  return type === 'massing' ? renderMassing(n) : renderSiteConcept(n, opts);
}

// ── 글자 수정 폼: 스펙 안의 문자열 중 사람이 고칠 만한 것만 뽑는다 ──
export function getTextFields(type, spec) {
  const out = [];
  if (!spec) return out;
  if (spec.title !== undefined) out.push({ path: ['title'], label: '전체 제목', value: spec.title || '' });
  if (type === 'massing') {
    (spec.steps || []).forEach((s, i) => out.push({ path: ['steps', i, 'label'], label: `단계 ${i + 1} 이름`, value: s.label || '' }));
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
