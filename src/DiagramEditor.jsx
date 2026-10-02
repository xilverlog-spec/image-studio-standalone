import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 다이어그램 편집기 (2026-09-21)
// 바탕 도면/배치도 이미지를 올리고, 그 위에 라벨·말풍선·화살표·영역·아이콘을 얹어
// PNG / SVG 로 내보낸다. AI 생성이 아니라 "주석 도구" — 글자와 선이 전부 코드로 그려져서
// 한글이 항상 정확하고, SVG 로 내보내면 나중에 일러스트레이터 등에서 다시 고칠 수 있다.
// 좌표는 전부 바탕 이미지의 원본 픽셀 기준(SVG viewBox = 이미지 크기)이라 확대/축소와 무관하다.
// ─────────────────────────────────────────────────────────────────────────────

// 폰트 선택지 — 이 PC에 설치된 폰트로 그려진다(없으면 맑은 고딕으로 대체). 인쇄 크기 샘플에도 같은 목록을 쓴다.
const FONT_CHOICES = [
  { id: 'malgun', label: '맑은 고딕', css: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif' },
  { id: 'nanum', label: '나눔고딕', css: '"NanumGothic","Nanum Gothic","Malgun Gothic",sans-serif' },
  { id: 'dotum', label: '돋움', css: '"Dotum","DotumChe","Malgun Gothic",sans-serif' },
  { id: 'gulim', label: '굴림', css: '"Gulim","GulimChe","Malgun Gothic",sans-serif' },
  { id: 'batang', label: '바탕(명조)', css: '"Batang","BatangChe","AppleMyungjo",serif' },
  { id: 'arial', label: 'Arial', css: 'Arial,"Malgun Gothic",sans-serif' },
  { id: 'times', label: 'Times New Roman', css: '"Times New Roman","Batang",serif' },
];
const fontCss = (id) => (FONT_CHOICES.find(f => f.id === id) || FONT_CHOICES[0]).css;
const FONT = FONT_CHOICES[0].css;
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

const PALETTE = ['#E8734A', '#F59E0B', '#2E9E5B', '#3A8FB7', '#333399', '#DC2626', '#111827', '#FFFFFF', '#D1D5DB'];
const EMOJIS = ['⚡', '🥽', '👥', '💓', '🏭', '🌳', '🏢', '🏠', '🚌', '🚉', '🅿️', '🌊', '☀️', '🛒', '🏫', '⚕️', '🔬', '🤖', '♻️', '📍'];

// group: 왼쪽 패널에서 묶어 보여주는 단위. 'iso' 그룹은 접힌 "아이소/조경" 섹션에 들어간다.
const TOOLS = [
  { id: 'select', label: '선택', key: 'V', emoji: '↖️', group: 'basic' },
  { id: 'text', label: '텍스트', key: 'T', emoji: '🔤', group: 'basic' },
  { id: 'label', label: '박스 라벨', key: 'B', emoji: '🏷️', group: 'basic' },
  { id: 'callout', label: '말풍선 라벨', key: 'C', emoji: '💬', group: 'basic' },
  { id: 'marker', label: '번호 마커', key: 'M', emoji: '①', group: 'basic' },
  { id: 'icon', label: '아이콘', key: 'I', emoji: '📍', group: 'basic' },
  { id: 'arrow', label: '화살표/선', key: 'A', emoji: '➡️', group: 'shape' },
  { id: 'dim', label: '치수선', key: 'D', emoji: '📏', group: 'shape' },
  { id: 'rect', label: '사각 영역', key: 'R', emoji: '⬜', group: 'shape' },
  { id: 'ellipse', label: '원형 영역', key: 'E', emoji: '⭕', group: 'shape' },
  { id: 'polygon', label: '다각형 영역', key: 'P', emoji: '🔷', group: 'shape' },
  { id: 'chevron', label: '단계 박스', key: 'H', emoji: '⏩', group: 'plan' },
  { id: 'legend', label: '범례', key: 'L', emoji: '🗒️', group: 'plan' },
  { id: 'north', label: '북쪽 표시', key: 'N', emoji: '🧭', group: 'plan' },
  { id: 'scalebar', label: '스케일바', key: 'S', emoji: '📐', group: 'plan' },
  { id: 'iso', label: '아이소 블록/바닥', key: 'O', emoji: '🧊', group: 'iso' },
];
const TOOL_GROUPS = [
  { id: 'basic', label: '기본' },
  { id: 'shape', label: '선 · 영역' },
  { id: 'plan', label: '도면 · 프로세스' },
];

const TYPE_LABEL = {
  text: '텍스트', label: '라벨', arrow: '화살표/선', rect: '사각 영역', ellipse: '원형 영역',
  polygon: '다각형 영역', icon: '아이콘', iso: '아이소 블록', asset: '에셋',
  marker: '번호 마커', chevron: '단계 박스', north: '북쪽 표시', scalebar: '스케일바', legend: '범례', dim: '치수선',
};

// 도면 축척/용지 환산값. 컴포넌트가 렌더마다 갱신하고, bboxOf 같은 모듈 함수가 읽는다.
// denom 은 "1:N" 의 N (도면 축척). 스케일바와 치수선의 실제 길이 환산에 쓴다.
const SCALE_CTX = { pxPerMm: 1, denom: 1000 };
const metersToPx = (m) => ((m * 1000) / SCALE_CTX.denom) * SCALE_CTX.pxPerMm;
const pxToMeters = (px) => ((px / SCALE_CTX.pxPerMm) * SCALE_CTX.denom) / 1000;
const fmtMeters = (m) => `${m >= 100 ? Math.round(m) : Math.round(m * 10) / 10}m`;
// 1, 2, 5 × 10^n 중 가장 가까운 "보기 좋은" 숫자 (스케일바 길이용)
const niceNum = (v) => {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
};

// 두 헥스 색 사이를 t(0~1)만큼 보간 — 단계 개수가 유동적인 템플릿의 그라데이션 색상용
const lerpHex = (a, b, t) => {
  const p = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => clamp255(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
};
const TEMPLATE_COLORS = ['#3A8FB7', '#2E9E5B', '#E8734A', '#8B5CF6', '#F59E0B', '#DC2626', '#0EA5E9', '#65A30D'];

// ── 아이소메트릭 수학 (30° 등각) ──
// 로컬 좌표 (u, v, z): u는 오른쪽 아래, v는 왼쪽 아래 방향, z는 위로 솟는 높이.
const IX = Math.cos(Math.PI / 6);
const IY = 0.5;
const isoP = (ox, oy, u, v, z = 0) => [ox + (u - v) * IX, oy + (u + v) * IY - z];

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));
const shade = (hex, f) => { // f<0: 어둡게, f>0: 밝게
  const h = String(hex || '#888888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `#${[r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
};

// 아이소 직육면체. (u,v,z)는 바닥 중심의 오프셋, w×d는 바닥 크기, h는 높이. hole>0이면 윗면이 링(프레임)이 된다.
const IsoBox = ({ ox = 0, oy = 0, u = 0, v = 0, z = 0, w, d, h, color, hole = 0, stroke, strokeWidth = 0 }) => {
  const hw = w / 2, hd = d / 2;
  const A = [-hw, -hd], B = [hw, -hd], C = [hw, hd], D = [-hw, hd];
  const pt = (q, zz) => isoP(ox, oy, u + q[0], v + q[1], z + zz).join(',');
  const st = strokeWidth > 0 ? { stroke, strokeWidth, strokeLinejoin: 'round' } : {};
  const ring = (arr, zz, k) => `M${arr.map(q => pt([q[0] * k, q[1] * k], zz)).join(' L')} Z`;
  return (
    <g>
      {h > 0 && <polygon points={`${pt(D, h)} ${pt(C, h)} ${pt(C, 0)} ${pt(D, 0)}`} fill={shade(color, -0.14)} {...st} />}
      {h > 0 && <polygon points={`${pt(C, h)} ${pt(B, h)} ${pt(B, 0)} ${pt(C, 0)}`} fill={shade(color, -0.28)} {...st} />}
      {hole > 0
        ? <path d={`${ring([A, B, C, D], h, 1)} ${ring([A, B, C, D], h, hole)}`} fill={color} fillRule="evenodd" {...st} />
        : <polygon points={`${pt(A, h)} ${pt(B, h)} ${pt(C, h)} ${pt(D, h)}`} fill={color} {...st} />}
    </g>
  );
};

// ── 에셋 라이브러리 ──
// 원점(0,0)은 바닥 중심이고 위쪽이 -y. c1은 주 색상, c2는 보조 색상. 전부 플랫 벡터 도형이라 색을 바꿔도 깨지지 않는다.
const ASSETS = {
  tree: {
    label: '나무', emoji: '🌳', c1: '#3E9B54', c2: '#8B5E3C', w: 64, h: 100,
    draw: (c1, c2) => (
      <g>
        <rect x={-4} y={-36} width={8} height={36} rx={2} fill={c2} />
        <ellipse cx={0} cy={-64} rx={29} ry={33} fill={c1} />
        <ellipse cx={11} cy={-58} rx={16} ry={25} fill={shade(c1, -0.2)} opacity={0.55} />
        <ellipse cx={-10} cy={-74} rx={13} ry={15} fill={shade(c1, 0.3)} opacity={0.85} />
      </g>
    ),
  },
  pine: {
    label: '침엽수', emoji: '🌲', c1: '#2F7D4A', c2: '#7A5230', w: 60, h: 104,
    draw: (c1, c2) => (
      <g>
        <rect x={-4} y={-18} width={8} height={18} fill={c2} />
        <polygon points="0,-104 -20,-62 20,-62" fill={shade(c1, 0.12)} />
        <polygon points="0,-84 -26,-40 26,-40" fill={c1} />
        <polygon points="0,-62 -30,-14 30,-14" fill={shade(c1, -0.15)} />
      </g>
    ),
  },
  bush: {
    label: '덤불', emoji: '🌿', c1: '#5DB36B', c2: '#000', w: 44, h: 26,
    draw: (c1) => (
      <g>
        <ellipse cx={0} cy={-12} rx={22} ry={13} fill={c1} />
        <ellipse cx={-6} cy={-16} rx={10} ry={6} fill={shade(c1, 0.35)} opacity={0.8} />
      </g>
    ),
  },
  person: {
    label: '사람', emoji: '🧍', c1: '#3A8FB7', c2: '#374151', w: 22, h: 68,
    draw: (c1, c2) => (
      <g>
        <rect x={-6.5} y={-30} width={5.5} height={30} rx={1.5} fill={c2} />
        <rect x={1} y={-30} width={5.5} height={30} rx={1.5} fill={shade(c2, -0.18)} />
        <rect x={-9} y={-53} width={18} height={27} rx={6} fill={c1} />
        <circle cx={0} cy={-61} r={8} fill="#F2C9A5" />
        <path d="M-8,-62 A8,8 0 0 1 8,-62 Z" fill="#3B2F2F" />
      </g>
    ),
  },
  bench: {
    label: '벤치', emoji: '🪑', c1: '#B98B5A', c2: '#4B5563', w: 48, h: 26,
    draw: (c1, c2) => (
      <g>
        <IsoBox u={-10} v={0} w={4} d={8} h={7} color={c2} />
        <IsoBox u={10} v={0} w={4} d={8} h={7} color={c2} />
        <IsoBox z={7} w={34} d={10} h={3} color={c1} />
        <IsoBox v={-4} z={10} w={34} d={2} h={8} color={shade(c1, -0.08)} />
      </g>
    ),
  },
  lamp: {
    label: '가로등', emoji: '💡', c1: '#FDE68A', c2: '#4B5563', w: 24, h: 84,
    draw: (c1, c2) => (
      <g>
        <rect x={-2} y={-78} width={4} height={78} fill={c2} />
        <circle cx={0} cy={-82} r={9} fill={c1} opacity={0.45} />
        <circle cx={0} cy={-82} r={5} fill={c1} />
      </g>
    ),
  },
  car: {
    label: '승용차', emoji: '🚗', c1: '#F59E0B', c2: '#1F2937', w: 60, h: 34,
    draw: (c1) => (
      <g>
        <IsoBox w={38} d={17} h={8} color={c1} />
        <IsoBox u={-2} z={8} w={20} d={14} h={7} color={shade(c1, 0.4)} />
      </g>
    ),
  },
  truck: {
    label: '트럭', emoji: '🚚', c1: '#E5E7EB', c2: '#3A8FB7', w: 84, h: 50,
    draw: (c1, c2) => (
      <g>
        <IsoBox u={10} w={80} d={26} h={3} color="#374151" />
        <IsoBox u={-6} z={3} w={46} d={24} h={26} color={c1} />
        <IsoBox u={26} z={3} w={18} d={24} h={17} color={c2} />
      </g>
    ),
  },
  robot: {
    label: '로봇', emoji: '🤖', c1: '#F3F4F6', c2: '#3A8FB7', w: 26, h: 62,
    draw: (c1, c2) => (
      <g>
        <IsoBox w={14} d={12} h={26} color={c1} />
        <IsoBox z={26} w={11} d={10} h={9} color={c2} />
        <rect x={-0.8} y={-52} width={1.6} height={10} fill="#4B5563" />
        <circle cx={0} cy={-53} r={2.2} fill="#EF4444" />
      </g>
    ),
  },
  kiosk: {
    label: '키오스크', emoji: '🏪', c1: '#F3F4F6', c2: '#E8734A', w: 70, h: 62,
    draw: (c1, c2) => (
      <g>
        <IsoBox w={44} d={32} h={24} color={c1} />
        <IsoBox z={24} w={52} d={40} h={4} color={c2} />
      </g>
    ),
  },
  hedge: {
    label: '울타리 화단', emoji: '🟩', c1: '#4C9F5F', c2: '#000', w: 80, h: 30,
    draw: (c1) => (
      <g>
        <IsoBox w={64} d={11} h={11} color={c1} />
        <IsoBox z={11} w={60} d={8} h={3} color={shade(c1, 0.25)} />
      </g>
    ),
  },
  building: {
    label: '건물 매스', emoji: '🏢', c1: '#E5E7EB', c2: '#000', w: 90, h: 130,
    draw: (c1) => (
      <g>
        <IsoBox w={54} d={54} h={100} color={c1} />
      </g>
    ),
  },
};

const uid = () => Math.random().toString(36).slice(2, 9);

// 세로 기준 용지 크기(mm)
const PAPERS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] };
const paperSizeMm = ({ size, landscape }) => {
  const [a, b] = PAPERS[size] || PAPERS.A3;
  return landscape ? { w: b, h: a } : { w: a, h: b };
};

// ── 글자 크기 측정 (라벨 박스 크기 계산용) ──
let _mctx = null;
const lineWidth = (line, size, bold, font) => {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = `${bold ? 700 : 500} ${size}px ${fontCss(font)}`;
  return _mctx.measureText(line).width;
};
const textBox = (text, size, bold, font) => {
  const lines = String(text || ' ').split('\n');
  const w = Math.max(...lines.map(l => lineWidth(l || ' ', size, bold, font)));
  return { w, h: lines.length * size * 1.3 };
};
const labelBox = (el) => {
  const t = textBox(el.text, el.size, true, el.font);
  return { w: t.w + el.size * 1.2, h: t.h + el.size * 0.6 };
};

const dashProps = (style, width) => {
  if (style === 'dash') return { strokeDasharray: `${width * 2.6} ${width * 1.8}`, strokeLinecap: 'butt' };
  if (style === 'dot') return { strokeDasharray: `0.1 ${width * 2.2}`, strokeLinecap: 'round' };
  return { strokeLinecap: 'round' };
};

const snapAngle = (from, p) => {
  const d = Math.hypot(p.x - from.x, p.y - from.y);
  const step = Math.PI / 12;
  const a = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / step) * step;
  return { x: from.x + d * Math.cos(a), y: from.y + d * Math.sin(a) };
};

// ── 요소 기본값 ──
const makeEl = (type, x, y, opts = {}) => {
  const id = uid();
  switch (type) {
    case 'text':
      return { id, type, x, y, text: '텍스트', size: 30, color: '#1F2937', bold: true, halo: true, font: 'malgun' };
    case 'label':
      return { id, type, x, y, text: '라벨', size: 24, color: '#111827', fill: '#D1D5DB', stroke: '#111827', strokeWidth: 2, leader: null, shape: 'box', font: 'malgun' };
    case 'callout': // 말풍선형 라벨 (둥근 테두리 + 꼬리)
      return { id, type: 'label', x, y, text: 'LABEL', size: 24, color: '#2A9FD6', fill: '#FFFFFF', stroke: '#2A9FD6', strokeWidth: 3, leader: null, shape: 'bubble', font: 'malgun' };
    case 'iso': // 아이소메트릭 바닥/블록
      return { id, type, x, y, w: 260, d: 260, h: 6, color: '#7CC4F0', opacity: 0.6, hole: 0, stroke: '#FFFFFF', strokeWidth: 0, blur: 0 };
    case 'asset': {
      const kind = ASSETS[opts.kind] ? opts.kind : 'tree';
      return { id, type, kind, x, y, scale: 0.8, flip: false, color: ASSETS[kind].c1, color2: ASSETS[kind].c2, shadow: true };
    }
    case 'arrow':
      return { id, type, x1: x, y1: y, x2: x, y2: y, color: '#E8734A', width: 5, dashStyle: 'dot', head: true, ctrl: null };
    case 'rect':
      return { id, type, x, y, w: 0, h: 0, r: 0, fill: '#F97316', fillOpacity: 0.35, stroke: '#F97316', strokeWidth: 3, dashStyle: 'solid', blur: 0, text: '', size: 26, textColor: '#111827', font: 'malgun' };
    case 'ellipse':
      return { id, type, cx: x, cy: y, rx: 0, ry: 0, fill: '#F97316', fillOpacity: 0.35, stroke: '#F97316', strokeWidth: 3, dashStyle: 'solid', blur: 0, text: '', size: 26, textColor: '#111827', font: 'malgun' };
    case 'marker': // 번호 마커 (①②③…)
      return { id, type, x, y, r: 24, text: String(opts.n || 1), fill: '#333399', color: '#FFFFFF', stroke: '#FFFFFF', strokeWidth: 3, size: 26, font: 'malgun' };
    case 'chevron': // 프로세스 단계 박스(화살표 모양)
      return { id, type, x, y, w: 300, h: 96, text: '단계', fill: '#333399', color: '#FFFFFF', size: 26, flat: false, font: 'malgun' };
    case 'north':
      return { id, type, x, y, size: 96, color: '#111827', font: 'malgun' };
    case 'scalebar': // (x,y) 는 왼쪽 끝. 길이는 도면 축척으로 환산한다.
      return { id, type, x, y, meters: 50, segs: 4, color: '#111827', size: 20, font: 'malgun' };
    case 'legend': // (x,y) 는 왼쪽 위
      return {
        id, type, x, y, title: '범례', size: 22, color: '#111827', fill: '#FFFFFF', opacity: 0.92, stroke: '#9CA3AF', font: 'malgun',
        rows: [{ color: '#E8734A', kind: 'fill', text: '항목 1' }, { color: '#3A8FB7', kind: 'fill', text: '항목 2' }, { color: '#2E9E5B', kind: 'dash', text: '동선' }],
      };
    case 'dim': // 치수선: 길이를 도면 축척으로 자동 환산해서 표시
      return { id, type, x1: x, y1: y, x2: x, y2: y, color: '#111827', width: 2, size: 22, auto: true, text: '', font: 'malgun' };
    case 'polygon':
      return { id, type, points: [], fill: '#3A8FB7', fillOpacity: 0.3, stroke: '#3A8FB7', strokeWidth: 4, dashStyle: 'solid', blur: 0 };
    case 'icon':
      return { id, type, x, y, r: 46, emoji: '⚡', fill: '#FFFFFF', stroke: '#333399', strokeWidth: 3, pin: true, text: '클러스터', size: 22, color: '#111827', font: 'malgun' };
    default:
      return null;
  }
};

// 범례 박스 크기(글자 폭을 재서 계산)
const legendBox = (el) => {
  const pad = el.size * 0.6, rowH = el.size * 1.55, sw = el.size * 1.7;
  const hasTitle = !!el.title;
  const rowW = el.rows.map(r => textBox(r.text || ' ', el.size, false, el.font).w + sw + el.size * 0.7);
  const titleW = hasTitle ? textBox(el.title, el.size * 1.1, true, el.font).w : 0;
  return { pad, rowH, sw, hasTitle, w: Math.max(titleW, ...rowW, el.size * 3) + pad * 2, h: pad * 2 + (hasTitle ? rowH : 0) + el.rows.length * rowH };
};

const bboxOf = (el) => {
  switch (el.type) {
    case 'marker': return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
    case 'chevron': return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
    case 'north': return { x: el.x - el.size * 0.3, y: el.y - el.size * 0.95, w: el.size * 0.6, h: el.size * 1.45 };
    case 'scalebar': {
      const total = metersToPx(el.meters);
      return { x: el.x - el.size * 0.6, y: el.y - el.size * 1.6, w: total + el.size * 1.2, h: el.size * 3 };
    }
    case 'legend': { const b = legendBox(el); return { x: el.x, y: el.y, w: b.w, h: b.h }; }
    case 'dim': {
      const m = el.size * 1.4;
      const x = Math.min(el.x1, el.x2) - m, y = Math.min(el.y1, el.y2) - m;
      return { x, y, w: Math.abs(el.x2 - el.x1) + m * 2, h: Math.abs(el.y2 - el.y1) + m * 2 };
    }
    case 'text': { const { w, h } = textBox(el.text, el.size, el.bold, el.font); return { x: el.x - w / 2, y: el.y - h / 2, w, h }; }
    case 'label': {
      const { w, h } = labelBox(el);
      const extra = el.shape === 'bubble' ? 16 : 0; // 말풍선 꼬리
      return { x: el.x - w / 2, y: el.y - h / 2, w, h: h + extra };
    }
    case 'arrow': {
      const xs = [el.x1, el.x2, ...(el.ctrl ? [el.ctrl.x] : [])], ys = [el.y1, el.y2, ...(el.ctrl ? [el.ctrl.y] : [])];
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'iso': {
      const hw = el.w / 2, hd = el.d / 2;
      const pts = [[-hw, -hd, 0], [hw, -hd, 0], [hw, hd, 0], [-hw, hd, 0], [-hw, -hd, el.h], [hw, -hd, el.h], [hw, hd, el.h], [-hw, hd, el.h]]
        .map(([u, v, z]) => isoP(el.x, el.y, u, v, z));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'asset': {
      const a = ASSETS[el.kind] || ASSETS.tree;
      const w = a.w * el.scale, h = a.h * el.scale;
      return { x: el.x - w / 2, y: el.y - h, w, h };
    }
    case 'rect': return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'ellipse': return { x: el.cx - el.rx, y: el.cy - el.ry, w: el.rx * 2, h: el.ry * 2 };
    case 'polygon': {
      const xs = el.points.map(p => p[0]), ys = el.points.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'icon': {
      const tw = el.text ? textBox(el.text, el.size, true, el.font).w : 0;
      const w = Math.max(el.r * 2, tw);
      const bottom = el.y + el.r * (el.pin ? 1.35 : 1) + (el.text ? el.size * 1.8 : 0);
      return { x: el.x - w / 2, y: el.y - el.r, w, h: bottom - (el.y - el.r) };
    }
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
};

// withLeader: 여러 개를 함께 옮길 때는 라벨 지시선의 점도 같이 움직인다(한 개만 옮길 땐 점은 그 자리에 둔다)
const translateEl = (el, dx, dy, withLeader = false) => {
  switch (el.type) {
    case 'label': return { ...el, x: el.x + dx, y: el.y + dy, leader: withLeader && el.leader ? { x: el.leader.x + dx, y: el.leader.y + dy } : el.leader };
    case 'dim':
    case 'arrow': return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy, ctrl: el.ctrl ? { x: el.ctrl.x + dx, y: el.ctrl.y + dy } : null };
    case 'ellipse': return { ...el, cx: el.cx + dx, cy: el.cy + dy };
    case 'polygon': return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy]) };
    default: return { ...el, x: el.x + dx, y: el.y + dy };
  }
};

const getHandles = (el) => {
  switch (el.type) {
    case 'dim':
    case 'arrow': return [
      { key: 'p1', x: el.x1, y: el.y1 }, { key: 'p2', x: el.x2, y: el.y2 },
      ...(el.ctrl ? [{ key: 'ctrl', x: el.ctrl.x, y: el.ctrl.y }] : []),
    ];
    case 'chevron': {
      const b = bboxOf(el);
      return [
        { key: 'nw', x: b.x, y: b.y }, { key: 'ne', x: b.x + b.w, y: b.y },
        { key: 'se', x: b.x + b.w, y: b.y + b.h }, { key: 'sw', x: b.x, y: b.y + b.h },
      ];
    }
    case 'polygon': return el.points.map(([x, y], i) => ({ key: `v${i}`, x, y }));
    case 'label': return el.leader ? [{ key: 'leader', x: el.leader.x, y: el.leader.y }] : [];
    case 'rect':
    case 'ellipse': {
      const b = bboxOf(el);
      return [
        { key: 'nw', x: b.x, y: b.y }, { key: 'ne', x: b.x + b.w, y: b.y },
        { key: 'se', x: b.x + b.w, y: b.y + b.h }, { key: 'sw', x: b.x, y: b.y + b.h },
      ];
    }
    default: return [];
  }
};

const applyHandle = (o, key, p, shift) => {
  if (o.type === 'arrow' && key === 'ctrl') return { ...o, ctrl: { x: p.x, y: p.y } };
  if (o.type === 'arrow' || o.type === 'dim') {
    const from = key === 'p1' ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 };
    const q = shift ? snapAngle(from, p) : p;
    return key === 'p1' ? { ...o, x1: q.x, y1: q.y } : { ...o, x2: q.x, y2: q.y };
  }
  if (o.type === 'label' && key === 'leader') return { ...o, leader: { x: p.x, y: p.y } };
  if (o.type === 'polygon') {
    const pts = o.points.slice();
    pts[+key.slice(1)] = [p.x, p.y];
    return { ...o, points: pts };
  }
  if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'chevron') {
    const b = bboxOf(o);
    const fx = key.includes('w') ? b.x + b.w : b.x;
    const fy = key.includes('n') ? b.y + b.h : b.y;
    const x = Math.min(fx, p.x), y = Math.min(fy, p.y);
    const w = Math.abs(p.x - fx), h = Math.abs(p.y - fy);
    if (o.type === 'rect') return { ...o, x, y, w, h };
    if (o.type === 'chevron') return { ...o, x: x + w / 2, y: y + h / 2, w: Math.max(20, w), h: Math.max(20, h) };
    return { ...o, cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
  }
  return o;
};

// 드래그로 새 도형 만들 때의 기하 계산
const shapeFromDrag = (type, s, p, shift) => {
  if (type === 'arrow' || type === 'dim') {
    const q = shift ? snapAngle(s, p) : p;
    return { x1: s.x, y1: s.y, x2: q.x, y2: q.y };
  }
  let dx = p.x - s.x, dy = p.y - s.y;
  if (shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  const x = Math.min(s.x, s.x + dx), y = Math.min(s.y, s.y + dy), w = Math.abs(dx), h = Math.abs(dy);
  if (type === 'rect') return { x, y, w, h };
  return { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
};

// ── 그리기 조각 ──
const TextBlock = ({ x, y, text, size, color, bold, halo, font, anchor = 'middle' }) => {
  const lines = String(text ?? '').split('\n');
  const lh = size * 1.3;
  const y0 = y - ((lines.length - 1) * lh) / 2;
  return (
    <text
      fontFamily={fontCss(font)} fontSize={size} fontWeight={bold ? 700 : 500} fill={color}
      textAnchor={anchor} dominantBaseline="central"
      {...(halo ? { stroke: '#fff', strokeWidth: size * 0.28, strokeLinejoin: 'round', paintOrder: 'stroke' } : {})}
      style={{ userSelect: 'none' }}
    >
      {lines.map((l, i) => <tspan key={i} x={x} y={y0 + i * lh}>{l || ' '}</tspan>)}
    </text>
  );
};

// ── 속성 패널용 작은 컴포넌트 ──
const inputBase = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'rgba(255,255,255,0.8)', color: 'var(--text-primary)', fontSize: '12.5px',
};
const Row = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
    <span style={{ flexShrink: 0 }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div>
  </div>
);
const ColorField = ({ value, onChange }) => (
  <>
    {PALETTE.map(c => (
      <button
        key={c} type="button" onClick={() => onChange(c)} title={c}
        style={{ width: 16, height: 16, borderRadius: 4, border: value?.toLowerCase() === c.toLowerCase() ? '2px solid #333399' : '1px solid rgba(15,23,42,0.25)', background: c, cursor: 'pointer', padding: 0 }}
      />
    ))}
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 26, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
  </>
);
const Slider = ({ value, min, max, step = 1, onChange, suffix = '' }) => (
  <>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 110 }} />
    <span style={{ width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100) / 100}{suffix}</span>
  </>
);
const Check = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
);
const FontSelect = ({ value, onChange }) => (
  <Row label="폰트">
    <select value={value || 'malgun'} onChange={(e) => onChange(e.target.value)} style={inputBase}>
      {FONT_CHOICES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
    </select>
  </Row>
);

// 글자 크기: 화면 픽셀 슬라이더 + "인쇄했을 때 몇 pt 인지"를 바로 보고 직접 입력할 수 있는 칸
const PtInput = ({ px, pxToPt, ptToPx, onChange }) => {
  const fmt = (v) => String(Math.round(pxToPt(v) * 10) / 10);
  const [txt, setTxt] = useState(fmt(px));
  const [focus, setFocus] = useState(false);
  const k = pxToPt(1);
  useEffect(() => { if (!focus) setTxt(fmt(px)); }, [px, k, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const commitValue = () => {
    const v = parseFloat(txt);
    if (v > 0) onChange(Math.max(1, Math.round(ptToPx(v))));
    setFocus(false);
  };
  return (
    <input
      value={txt} inputMode="decimal" title="인쇄했을 때의 글자 크기(pt). 직접 입력하고 Enter"
      onFocus={() => setFocus(true)} onChange={(e) => setTxt(e.target.value)}
      onBlur={commitValue} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ ...inputBase, width: 52, textAlign: 'right' }}
    />
  );
};
const SizeField = ({ px, min, max, pxToPt, ptToPx, onChange }) => (
  <Row label="크기">
    <input type="range" min={min} max={max} step={1} value={px} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 92 }} />
    <PtInput px={px} pxToPt={pxToPt} ptToPx={ptToPx} onChange={onChange} /><span>pt</span>
  </Row>
);

const smallBtn = (primary) => ({
  padding: '7px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: primary ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
  background: primary ? 'rgba(51,51,153,0.10)' : 'rgba(255,255,255,0.75)',
  color: primary ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const stamp = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

const TEMPLATE_TYPE_LABEL = { process: '⏩ 프로세스 흐름', bubble: '⭕ 버블 다이어그램', site: '🗺️ 배치도 분석 표기', explode: '🧊 아이소 레이어 분해' };

// 참고 이미지 → 도형 타입 분류 + 글자 추출 프롬프트.
// 2026-10-01: 로컬 Qwen2.5-VL 3B(위치 인식 부정확) 대신 Gemini API(무료 등급, 텍스트/비전 전용 —
// 이미지 "생성"은 무료 쿼터가 0이라 절대 안 씀)로 교체했다. 다만 위치 좌표(bbox)는 여전히 요구하지
// 않는다 — 어떤 비전 모델이든 "글자가 여기 있다"는 읽기보다 "이 도형이 정확히 어디 있다"는 좌표
// 추정이 훨씬 불안정하다는 게 일반적인 특성이라, 모델을 바꿨다고 이 설계 결정이 달라지진 않는다.
// 실제 배치는 이 편집기의 파라메트릭 템플릿(addTemplate)이 계산하므로 결과가 항상 깔끔하다.
// 주의: Gemini 무료 등급은 보낸 이미지가 구글 제품 개선에 쓰일 수 있다 — 민감한 참고 이미지는 피할 것.
const REF_ANALYZE_PROMPT = `You are analyzing a reference diagram image for an architecture office. Answer with JSON only, no markdown fences, no explanation:
{"type": one of "process" | "bubble" | "site" | "explode",
 "title": overall title text written outside any shape, or "",
 "center": ONLY for type "bubble" - the label text of the single central circle (the one every other circle connects to), or "" if unclear,
 "items": array of the main label text inside each shape/step, in reading order, exactly as written, EXCLUDING the "center" label if type is "bubble" (keep Korean as Korean, do not translate or invent text)}
type meaning: "process" = sequential steps/flowchart connected by arrows or chevrons; "bubble" = a central circle connected to satellite circles; "site" = a site/plan analysis diagram (boundary, north arrow, circulation lines, legend); "explode" = stacked or exploded isometric layers.
Pick the single closest "type" even if imperfect.`;

export default function DiagramEditor({ active = true, addToast, apiFetch }) {
  const doFetch = apiFetch || fetch;
  const [bg, setBg] = useState(null); // { src|null, w, h }
  const [els, setEls] = useState([]);
  const [selIds, setSelIds] = useState([]); // 다중 선택. Shift+클릭, 빈 곳 드래그(범위 선택), Ctrl+A
  const selId = selIds.length === 1 ? selIds[0] : null; // 속성 패널/핸들은 한 개만 선택됐을 때 동작
  const setSelId = (id) => setSelIds(id ? [id] : []);
  const [marquee, setMarquee] = useState(null);
  const [tool, setTool] = useState('select');
  const [draft, setDraft] = useState(null); // 그리는 중인 다각형 점들
  const [cursor, setCursor] = useState(null);
  const [manualZoom, setManualZoom] = useState(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [assetKind, setAssetKind] = useState('tree');
  const [paper, setPaper] = useState({ size: 'A3', landscape: true }); // 인쇄 용지 (기본 A3 가로)
  const [workDpi, setWorkDpi] = useState(100); // 빈 캔버스를 만들 때의 작업 해상도
  const [exportDpi, setExportDpi] = useState(300); // PNG 저장 해상도(0 = 캔버스 원본 크기)
  const [drawScale, setDrawScale] = useState(1000); // 도면 축척 1:N — 스케일바/치수선 길이 환산
  const [exportTransparent, setExportTransparent] = useState(false); // 바탕(이미지/색)을 빼고 요소만 투명 배경으로 저장
  const [sizeInput, setSizeInput] = useState({ w: '', h: '' });

  // ── 참고 이미지로 템플릿 채우기 ──
  const [refImage, setRefImage] = useState(null); // { src: dataURL, b64: 접두사 뺀 base64 }
  const [refType, setRefType] = useState('process');
  const [refDetectedType, setRefDetectedType] = useState(null); // AI가 고른 타입(뱃지 표시용)
  const [refTitle, setRefTitle] = useState('');
  const [refCenter, setRefCenter] = useState('');
  const [refItemsText, setRefItemsText] = useState('');
  const [refBusy, setRefBusy] = useState(false);
  const refFileRef = useRef(null);

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);
  const projRef = useRef(null);
  const dragRef = useRef(null);
  const elsRef = useRef(els);
  elsRef.current = els;
  const past = useRef([]);
  const future = useRef([]);
  const lastKey = useRef({ key: null, t: 0 });

  const notify = useCallback((type, title, msg) => { if (addToast) addToast(type, title, msg); }, [addToast]);

  // ── 화면 크기에 맞춘 기본 배율 ──
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    const ro = new ResizeObserver(() => {
      if (node.clientWidth > 50 && node.clientHeight > 50) setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [bg]);

  const fitZoom = bg ? Math.min(1, (box.w - 48) / bg.w, (box.h - 48) / bg.h) : 1;
  const zoom = manualZoom ?? Math.max(0.05, fitZoom);

  // ── 인쇄 용지 기준 환산: 캔버스가 용지 안에 (비율 유지하며) 꽉 차게 인쇄된다고 보고 1mm 당 픽셀을 계산한다 ──
  const paperMm = paperSizeMm(paper);
  const pxPerMm = bg ? Math.max(bg.w / paperMm.w, bg.h / paperMm.h) : 1;
  const pxToPt = (px) => (px / pxPerMm) * (72 / 25.4);
  const ptToPx = (pt) => (pt * pxPerMm * 25.4) / 72;
  SCALE_CTX.pxPerMm = pxPerMm;
  SCALE_CTX.denom = drawScale;

  // ── 실행 취소 / 다시 실행 ──
  const commit = () => {
    past.current.push(elsRef.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(elsRef.current);
    setEls(past.current.pop());
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(elsRef.current);
    setEls(future.current.pop());
  };
  const resetHistory = () => { past.current = []; future.current = []; };

  const sel = els.find(e => e.id === selId) || null;

  // 속성 패널 변경. 같은 key 로 1초 안에 연속되면 실행취소 한 칸으로 합친다(글자 입력 등).
  const patchSel = (patch, key) => {
    if (!selId) return;
    const now = Date.now();
    if (!(key && lastKey.current.key === key && now - lastKey.current.t < 1000)) commit();
    lastKey.current = { key, t: now };
    setEls(prev => prev.map(e => (e.id === selId ? { ...e, ...patch } : e)));
  };

  const removeSel = () => {
    if (!selIds.length) return;
    commit();
    setEls(prev => prev.filter(e => !selIds.includes(e.id)));
    setSelIds([]);
  };
  const duplicateSel = () => {
    const list = elsRef.current.filter(e => selIds.includes(e.id));
    if (!list.length) return;
    commit();
    const copies = list.map(e => ({ ...translateEl(e, 28, 28, true), id: uid() }));
    setEls(prev => [...prev, ...copies]);
    setSelIds(copies.map(c => c.id));
  };
  // 겹침 순서. front/back은 선택 전체, up/down은 한 개일 때 한 칸씩(아이소 부품을 쌓을 때 필요)
  const moveZ = (dir) => {
    if (!selIds.length) return;
    commit();
    setEls(prev => {
      const picked = prev.filter(e => selIds.includes(e.id));
      const rest = prev.filter(e => !selIds.includes(e.id));
      if (dir === 'front') return [...rest, ...picked];
      if (dir === 'back') return [...picked, ...rest];
      if (picked.length !== 1) return prev;
      const i = prev.findIndex(e => e.id === picked[0].id);
      const arr = prev.slice();
      const [item] = arr.splice(i, 1);
      arr.splice(dir === 'up' ? Math.min(arr.length, i + 1) : Math.max(0, i - 1), 0, item);
      return arr;
    });
  };
  // 정렬 / 간격 균등 (2개 이상 선택)
  const alignSel = (mode) => {
    const list = elsRef.current.filter(e => selIds.includes(e.id));
    if (list.length < 2) return;
    const bs = new Map(list.map(e => [e.id, bboxOf(e)]));
    const all = [...bs.values()];
    const minX = Math.min(...all.map(b => b.x)), maxX = Math.max(...all.map(b => b.x + b.w));
    const minY = Math.min(...all.map(b => b.y)), maxY = Math.max(...all.map(b => b.y + b.h));
    const shift = new Map();
    if (mode === 'hdist' || mode === 'vdist') {
      if (list.length < 3) return;
      const h = mode === 'hdist';
      const sorted = [...list].sort((a, b) => (h ? bs.get(a.id).x + bs.get(a.id).w / 2 - (bs.get(b.id).x + bs.get(b.id).w / 2) : bs.get(a.id).y + bs.get(a.id).h / 2 - (bs.get(b.id).y + bs.get(b.id).h / 2)));
      const total = sorted.reduce((s, e) => s + (h ? bs.get(e.id).w : bs.get(e.id).h), 0);
      const gap = ((h ? maxX - minX : maxY - minY) - total) / (sorted.length - 1);
      let pos = h ? minX : minY;
      sorted.forEach(e => {
        const b = bs.get(e.id);
        shift.set(e.id, h ? [pos - b.x, 0] : [0, pos - b.y]);
        pos += (h ? b.w : b.h) + gap;
      });
    } else {
      list.forEach(e => {
        const b = bs.get(e.id);
        let dx = 0, dy = 0;
        if (mode === 'left') dx = minX - b.x;
        if (mode === 'right') dx = maxX - (b.x + b.w);
        if (mode === 'hcenter') dx = (minX + maxX) / 2 - (b.x + b.w / 2);
        if (mode === 'top') dy = minY - b.y;
        if (mode === 'bottom') dy = maxY - (b.y + b.h);
        if (mode === 'vcenter') dy = (minY + maxY) / 2 - (b.y + b.h / 2);
        shift.set(e.id, [dx, dy]);
      });
    }
    commit();
    setEls(prev => prev.map(e => (shift.has(e.id) ? translateEl(e, ...shift.get(e.id), true) : e)));
  };

  // 바깥에서 안쪽으로 겹쳐지는 반투명 파란 프레임 3겹 + 중앙 광장 (스마트시티 개념도 스타일의 출발점)
  const addRipple = () => {
    if (!bg) return;
    commit();
    const S = bg.w * 0.42;
    const cx = bg.w / 2, cy = bg.h * 0.56;
    const layer = (k, color, opacity, hole, h) => ({ ...makeEl('iso', cx, cy), w: S * k, d: S * k, h, color, opacity, hole, blur: 0 });
    const parts = [
      layer(1.0, '#CDE8F8', 0.55, 0.76, 4),
      layer(0.74, '#9CD1F2', 0.7, 0.72, 6),
      layer(0.5, '#4FA9E8', 0.85, 0.62, 8),
      layer(0.32, '#FFFFFF', 1, 0, 12),
    ];
    setEls(prev => [...prev, ...parts]);
    setSelId(parts[parts.length - 1].id);
  };

  // 시작 템플릿: 캔버스 크기에 비례해서 요소 묶음을 넣고, 넣은 요소들을 전부 선택 상태로 둔다(바로 함께 옮길 수 있게).
  // 기본 데모 내용 — 버튼을 바로 눌렀을 때(내용을 안 채웠을 때) 쓰인다.
  const TEMPLATE_DEFAULTS = {
    process: { title: '설계 프로세스', items: [{ name: '1. 대지 분석', desc: '현황 · 법규 · 주변 분석' }, { name: '2. 컨셉 도출', desc: '핵심 아이디어 설정' }, { name: '3. 매스 스터디', desc: '배치와 볼륨 검토' }, { name: '4. 입면 디자인', desc: '재료 · 디테일 확정' }] },
    bubble: { title: '프로그램 관계도', center: '로비', items: [{ name: '사무실' }, { name: '회의실' }, { name: '휴게실' }, { name: '화장실' }, { name: '창고' }] },
    site: { title: '대지 분석도', items: [{ name: '주 동선' }, { name: '보행 동선' }, { name: '주요 영역' }] },
    explode: { title: '레이어 구성 (분해 아이소메트릭)', items: [{ name: '지붕층' }, { name: '업무층' }, { name: '공용층' }, { name: '기반층' }] },
  };

  // name: 'process'|'bubble'|'site'|'explode'. content 를 안 주면 기본 데모 내용을 채운다.
  // 참고 이미지 분석(analyzeReference) 결과나 사용자가 직접 입력한 내용으로도 이 함수를 그대로 재사용한다.
  const addTemplate = (name, content) => {
    if (!bg) return;
    const c = content || TEMPLATE_DEFAULTS[name];
    const k = bg.w / 1654; // A3 가로 100dpi 캔버스 기준 1
    const cx = bg.w / 2, cy = bg.h / 2;
    const mk = (type, x, y, patch = {}) => ({ ...makeEl(type, x, y), ...patch });
    const list = [];
    const title = (c.title || TEMPLATE_DEFAULTS[name].title || '').trim();

    if (name === 'process') {
      const items = (c.items?.length ? c.items : TEMPLATE_DEFAULTS.process.items).slice(0, 6);
      const n = Math.max(2, items.length);
      const maxTotal = bg.w * 0.84;
      const w = Math.min(360 * k, maxTotal / n * 0.92), h = w * 0.311, notch = h * 0.32, step = w - notch + 14 * k;
      const x0 = cx - ((n - 1) * step) / 2;
      if (title) list.push(mk('text', cx, cy - 190 * k, { text: title, size: 46 * k, halo: false }));
      items.forEach((it, i) => {
        const color = lerpHex('#252573', '#6366F1', n > 1 ? i / (n - 1) : 0);
        list.push(mk('chevron', x0 + i * step, cy, { w, h, text: it.name || `단계 ${i + 1}`, fill: color, size: Math.min(28, w * 0.09) * k, flat: i === 0 }));
        if (it.desc) list.push(mk('text', x0 + i * step, cy + h * 0.98, { text: it.desc, size: 24 * k, color: '#4B5563', bold: false, halo: false }));
      });
    }

    if (name === 'bubble') {
      const items = (c.items?.length ? c.items : TEMPLATE_DEFAULTS.bubble.items).slice(0, 8);
      const n = Math.max(1, items.length);
      const distX = Math.min(bg.w * 0.42, 260 * k + n * 34 * k), distY = distX * 0.725;
      const lines = [], circles = [];
      items.forEach((it, i) => {
        const name = it.name || `항목 ${i + 1}`;
        const rr = Math.max(64 * k, Math.min(112 * k, 42 * k + textBox(name, 30 * k, true, 'malgun').w * 0.55));
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + distX * Math.cos(a), y = cy + distY * Math.sin(a);
        lines.push(mk('arrow', cx, cy, { x1: cx, y1: cy, x2: x, y2: y, head: false, width: 6 * k, color: '#9CA3AF', dashStyle: i % 2 ? 'dash' : 'solid' }));
        circles.push(mk('ellipse', x, y, { rx: rr, ry: rr, fill: TEMPLATE_COLORS[i % TEMPLATE_COLORS.length], fillOpacity: 0.88, stroke: '#FFFFFF', strokeWidth: 5 * k, text: name, size: 30 * k, textColor: '#FFFFFF' }));
      });
      if (title) list.push(mk('text', cx, cy - distY - 140 * k, { text: title, size: 46 * k, halo: false }));
      list.push(...lines, mk('ellipse', cx, cy, { rx: 132 * k, ry: 132 * k, fill: '#F59E0B', fillOpacity: 0.92, stroke: '#FFFFFF', strokeWidth: 6 * k, text: c.center || TEMPLATE_DEFAULTS.bubble.center, size: 38 * k, textColor: '#FFFFFF' }), ...circles);
    }

    if (name === 'site') {
      const items = (c.items?.length ? c.items : TEMPLATE_DEFAULTS.site.items).slice(0, 6);
      const kinds = ['dash', 'dot', 'fill', 'fill', 'fill', 'fill'];
      const meters = niceNum(pxToMeters(bg.w * 0.2));
      list.push(
        mk('text', 260 * k, 90 * k, { text: title, size: 44 * k }),
        mk('ellipse', cx * 0.95, cy * 0.92, { rx: 220 * k, ry: 130 * k, fill: '#F59E0B', fillOpacity: 0.28, stroke: '#F59E0B', strokeWidth: 4 * k, dashStyle: 'dash' }),
        mk('arrow', 0, 0, { x1: bg.w * 0.2, y1: bg.h * 0.78, x2: bg.w * 0.55, y2: bg.h * 0.5, ctrl: { x: bg.w * 0.3, y: bg.h * 0.5 }, color: '#E8734A', width: 7 * k, dashStyle: 'dash', head: true }),
        mk('marker', bg.w * 0.28, bg.h * 0.3, { text: '1', r: 26 * k, size: 28 * k }),
        mk('marker', bg.w * 0.62, bg.h * 0.36, { text: '2', r: 26 * k, size: 28 * k }),
        mk('marker', bg.w * 0.5, bg.h * 0.66, { text: '3', r: 26 * k, size: 28 * k }),
        mk('north', bg.w - 110 * k, 150 * k, { size: 100 * k }),
        mk('scalebar', 90 * k, bg.h - 100 * k, { meters, size: 22 * k }),
        mk('legend', bg.w - 430 * k, bg.h - (150 + items.length * 54) * k, {
          size: 24 * k, title: '범례',
          rows: items.map((it, i) => ({ color: TEMPLATE_COLORS[i % TEMPLATE_COLORS.length], kind: kinds[i % kinds.length], text: it.name || `항목 ${i + 1}` })),
        }),
      );
    }

    if (name === 'explode') {
      const items = (c.items?.length ? c.items : TEMPLATE_DEFAULTS.explode.items).slice(0, 6);
      const n = Math.max(2, items.length);
      const S = bg.w * 0.24, gap = Math.min(175 * k, (bg.h * 0.72) / n), baseX = cx - 140 * k, y0 = cy - ((n - 1) / 2) * gap + 55 * k;
      const half = S * 0.866;
      if (title) list.push(mk('text', cx, 70 * k, { text: title, size: 42 * k, halo: false }));
      [-half, half].forEach(dx => list.push(mk('arrow', baseX + dx, y0, { x1: baseX + dx, y1: y0, x2: baseX + dx, y2: y0 + (n - 1) * gap, head: false, width: 2.5 * k, color: '#9CA3AF', dashStyle: 'dash' })));
      for (let i = n - 1; i >= 0; i--) { // 아래층부터 그려야 위층이 앞에 온다
        list.push(mk('iso', baseX, y0 + i * gap, { w: S, d: S, h: 14 * k, color: lerpHex('#333399', '#E5E7EB', n > 1 ? i / (n - 1) : 0), opacity: 0.96, hole: 0 }));
      }
      items.forEach((it, i) => {
        const y = y0 + i * gap;
        list.push(mk('arrow', 0, 0, { x1: baseX + half, y1: y, x2: baseX + half + 110 * k, y2: y, head: false, width: 2.5 * k, color: '#6B7280', dashStyle: 'solid' }));
        list.push(mk('callout', baseX + half + 210 * k, y, { text: it.name || `레이어 ${i + 1}`, size: 28 * k, color: '#333399', stroke: '#333399' }));
      });
    }

    if (!list.length) return;
    commit();
    setEls(prev => [...prev, ...list]);
    setSelIds(list.map(e => e.id));
  };

  // 참고 이미지 업로드 (분석용 — 캔버스 바탕과는 별개)
  const loadRefFromFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { notify('error', '이미지 파일이 아닙니다', 'PNG, JPG 같은 이미지 파일을 올려주세요.'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const src = fr.result;
      setRefImage({ src, b64: String(src).split(',').pop() });
      setRefDetectedType(null);
    };
    fr.readAsDataURL(file);
  };

  // "이름 | 설명" (프로세스만 설명 사용) 또는 "이름" 한 줄씩 → items 배열
  const parseRefItems = (text, withDesc) => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    if (withDesc && l.includes('|')) { const [n, d] = l.split('|'); return { name: n.trim(), desc: (d || '').trim() }; }
    return { name: l.replace(/^\d+[.)]\s*/, '') }; // "1. 이름" 앞의 번호는 chevron이 자체 표시하므로 지운다
  });

  // 참고 이미지를 Gemini API(무료 등급, 텍스트/비전 전용)에 보내 종류와 글자 목록을 뽑아 입력칸에
  // 채워준다. 위치는 요구하지 않는다(§ REF_ANALYZE_PROMPT 주석) — 실제 배치는 addTemplate 이 계산한다.
  const analyzeReference = async () => {
    if (!refImage) return;
    setRefBusy(true);
    try {
      const res = await doFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 2026-10-01 실측(§ 세션 기록): gemini-3.8-flash는 이 프로젝트 무료 쿼터가 하루 20회뿐이라
          // 금방 소진된다. gemini-3.1-flash-lite는 복잡한 이미지(라벨 9개 + 잡음 메모 섞인 버블
          // 다이어그램)에서도 3/3 전부 정확했고 더 빠르다(약 3초) — 쿼터도 모델별로 따로 책정돼
          // 아직 여유가 있다. max_tokens도 900→2000으로 올렸다 — 900이면 모델이 내부 추론에
          // 토큰을 다 쓰고 빈 응답을 돌려주는 경우가 실제로 있었다.
          model: 'gemini-3.1-flash-lite',
          max_tokens: 2000,
          temperature: 0.1,
          messages: [{ role: 'user', content: REF_ANALYZE_PROMPT, images: [refImage.b64] }],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('모델이 JSON을 반환하지 않았습니다.');
      const parsed = JSON.parse(m[0]);
      const type = TEMPLATE_DEFAULTS[parsed.type] ? parsed.type : 'process';
      setRefType(type);
      setRefDetectedType(type);
      setRefTitle(String(parsed.title || ''));
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      setRefItemsText(items.map(String).join('\n'));
      setRefCenter(type === 'bubble' ? String(parsed.center || '') : ''); // 2026-10-01: center 를 따로 안 물어봤더니 중심 라벨이 통째로 사라지는 버그가 있었다(§ 세션 기록) — 이제 프롬프트가 명시적으로 분리해서 돌려준다
      notify('success', '분석 완료', `"${TEMPLATE_TYPE_LABEL[type]}" 로 인식했습니다. 아래 내용을 확인하고 채우기를 누르세요.`);
    } catch (err) {
      console.error('참고 이미지 분석 실패:', err);
      notify('error', '분석 실패', `${err.message} — backend/.env 의 GEMINI_API_KEY 와 네트워크 연결을 확인해 주세요.`);
    } finally {
      setRefBusy(false);
    }
  };

  const fillFromRef = () => {
    if (!bg) { notify('error', '캔버스가 없습니다', '먼저 바탕 이미지를 열거나 빈 캔버스로 시작해 주세요.'); return; }
    addTemplate(refType, {
      title: refTitle,
      center: refCenter || undefined,
      items: parseRefItems(refItemsText, refType === 'process'),
    });
  };

  // 캔버스 크기를 직접 지정 (요소는 그대로 두고 캔버스 영역만 바꾼다)
  const resizeCanvas = (w, h) => {
    const W = Math.round(Number(w)), H = Math.round(Number(h));
    if (!(W >= 100 && H >= 100 && W <= 12000 && H <= 12000)) { notify('error', '캔버스 크기 확인', '가로/세로는 100~12000px 사이로 입력해 주세요.'); return; }
    setBg(b => ({ ...b, w: W, h: H }));
    setManualZoom(null);
  };
  useEffect(() => { if (bg) setSizeInput({ w: String(bg.w), h: String(bg.h) }); }, [bg?.w, bg?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 바탕 이미지 ──
  const loadBgFromFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { notify('error', '이미지 파일이 아닙니다', 'PNG, JPG 같은 이미지 파일을 올려주세요.'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const src = fr.result;
      const im = new window.Image();
      im.onload = () => { setBg({ src, w: im.naturalWidth, h: im.naturalHeight }); setManualZoom(null); };
      im.src = src;
    };
    fr.readAsDataURL(file);
  };
  // 선택한 용지 크기의 빈 캔버스 (작업 해상도 dpi 기준 픽셀 수)
  const startBlank = () => {
    const pm = paperSizeMm(paper);
    setBg({ src: null, w: Math.round((pm.w / 25.4) * workDpi), h: Math.round((pm.h / 25.4) * workDpi), color: '#ffffff' });
    setManualZoom(null);
  };

  // 클립보드 이미지 붙여넣기(캡처 → Ctrl+V)
  useEffect(() => {
    if (!active) return undefined;
    const onPaste = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); loadBgFromFile(item.getAsFile()); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 좌표 변환 ──
  const toSvg = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  const finishPolygon = (points) => {
    if (points.length < 3) { setDraft(null); return; }
    commit();
    const el = { ...makeEl('polygon', 0, 0), points };
    setEls(prev => [...prev, el]);
    setSelId(el.id);
    setDraft(null);
    setTool('select');
  };

  // ── 캔버스 포인터 ──
  const onSvgDown = (e) => {
    if (e.button !== 0 || !bg) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toSvg(e);

    if (tool === 'select') {
      // 빈 곳을 누르면 선택 해제(Shift 면 유지)하고, 끌면 범위 선택
      dragRef.current = { mode: 'marquee', start: p, base: e.shiftKey ? selIds : [], moved: false };
      if (!e.shiftKey) setSelIds([]);
      return;
    }

    if (['text', 'label', 'callout', 'icon', 'iso', 'asset', 'marker', 'chevron', 'north', 'scalebar', 'legend'].includes(tool)) {
      commit();
      const n = elsRef.current.filter(x => x.type === 'marker').length + 1;
      const el = makeEl(tool, p.x, p.y, { kind: assetKind, n });
      setEls(prev => [...prev, el]);
      setSelId(el.id);
      if (tool !== 'asset' && tool !== 'marker') setTool('select'); // 에셋/마커는 계속 찍어서 여러 개를 배치할 수 있게 도구를 유지한다
      return;
    }
    if (tool === 'polygon') {
      const pts = draft || [];
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p.x - last[0], p.y - last[1]) < 4 / zoom) return;
      if (pts.length >= 3 && Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) < 14 / zoom) { finishPolygon(pts); return; }
      setDraft([...pts, [p.x, p.y]]);
      return;
    }
    // arrow / rect / ellipse: 드래그로 생성
    commit();
    const el = makeEl(tool, p.x, p.y);
    setEls(prev => [...prev, el]);
    setSelId(el.id);
    dragRef.current = { mode: 'create', id: el.id, type: tool, start: p, moved: false };
  };

  const onElDown = (e, el) => {
    if (tool !== 'select' || e.button !== 0) return; // 다른 도구일 땐 캔버스 클릭으로 취급
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    let ids;
    if (e.shiftKey) { // Shift+클릭: 선택에 추가/제거
      ids = selIds.includes(el.id) ? selIds.filter(i => i !== el.id) : [...selIds, el.id];
      setSelIds(ids);
      if (!ids.includes(el.id)) return;
    } else if (selIds.includes(el.id)) {
      ids = selIds; // 이미 선택된 것을 끌면 선택 전체가 함께 움직인다
    } else {
      ids = [el.id];
      setSelIds(ids);
    }
    const origs = {};
    elsRef.current.forEach(x => { if (ids.includes(x.id)) origs[x.id] = x; });
    dragRef.current = { mode: 'move', origs, multi: ids.length > 1, start: toSvg(e), moved: false };
  };

  const onHandleDown = (e, h) => {
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode: 'handle', id: sel.id, key: h.key, orig: sel, moved: false };
  };

  const onSvgMove = (e) => {
    const p = toSvg(e);
    if (draft) setCursor(p);
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      const from = d.start || getHandles(d.orig).find(h => h.key === d.key) || p;
      if (Math.hypot(p.x - from.x, p.y - from.y) < 2 / zoom) return;
      d.moved = true;
      if (d.mode !== 'create' && d.mode !== 'marquee') commit();
    }
    if (d.mode === 'marquee') {
      const r = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setMarquee(r);
      const hit = elsRef.current.filter(el => {
        const b = bboxOf(el);
        return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
      }).map(el => el.id);
      setSelIds([...new Set([...d.base, ...hit])]);
      return;
    }
    if (d.mode === 'move') {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      setEls(prev => prev.map(el => (d.origs[el.id] ? translateEl(d.origs[el.id], dx, dy, d.multi) : el)));
    } else if (d.mode === 'handle') {
      setEls(prev => prev.map(el => (el.id === d.id ? applyHandle(d.orig, d.key, p, e.shiftKey) : el)));
    } else if (d.mode === 'create') {
      const geo = shapeFromDrag(d.type, d.start, p, e.shiftKey);
      setEls(prev => prev.map(el => (el.id === d.id ? { ...el, ...geo } : el)));
    }
  };

  const onSvgUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.mode === 'marquee') setMarquee(null);
    if (d?.mode === 'create') {
      // 클릭만 했으면 기본 크기로 만들어 준다
      if (!d.moved) {
        const s = d.start;
        const geo = d.type === 'arrow' ? { x2: s.x + 220, y2: s.y }
          : d.type === 'dim' ? { x2: s.x + 300, y2: s.y }
          : d.type === 'rect' ? { x: s.x - 90, y: s.y - 55, w: 180, h: 110 }
            : { cx: s.x, cy: s.y, rx: 90, ry: 60 };
        setEls(prev => prev.map(el => (el.id === d.id ? { ...el, ...geo } : el)));
      }
      setTool('select');
    }
  };

  // ── 키보드 ──
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelIds(elsRef.current.map(x => x.id)); return; }
      if (mod) return;
      if (e.key === 'Escape') { setDraft(null); setTool('select'); setSelIds([]); return; }
      if (e.key === 'Enter' && draft) { finishPolygon(draft); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length) { e.preventDefault(); removeSel(); return; }
      if (e.key.startsWith('Arrow') && selIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const now = Date.now();
        if (!(lastKey.current.key === 'nudge' && now - lastKey.current.t < 800)) commit();
        lastKey.current = { key: 'nudge', t: now };
        setEls(prev => prev.map(el => (selIds.includes(el.id) ? translateEl(el, dx, dy, selIds.length > 1) : el)));
        return;
      }
      const t = TOOLS.find(x => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) { setDraft(null); setTool(t.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 내보내기 ──
  // transparent 가 true 면 바탕(이미지/색)을 빼고 요소만 담는다 → 투명 배경 PNG, 다른 프로그램에서 도면 위에 겹쳐 쓰기 좋다
  const buildSvgString = (transparent = false) => {
    const clone = svgRef.current.cloneNode(true);
    clone.querySelectorAll('[data-ui]').forEach(n => n.remove());
    if (transparent) clone.querySelectorAll('[data-bg]').forEach(n => n.remove());
    clone.querySelectorAll('[data-bg]').forEach(n => n.removeAttribute('opacity'));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', bg.w);
    clone.setAttribute('height', bg.h);
    clone.removeAttribute('style');
    return new XMLSerializer().serializeToString(clone);
  };
  const exportSvg = () => {
    if (!bg) return;
    download(new Blob([buildSvgString(exportTransparent)], { type: 'image/svg+xml;charset=utf-8' }), `diagram_${stamp()}${exportTransparent ? '_transparent' : ''}.svg`);
  };
  // dpi가 있으면 현재 용지 기준 그 해상도로, 0이면 캔버스 원본 픽셀 크기로 PNG 를 만든다.
  // 선/글자/부품은 벡터라 크게 뽑아도 선명하고, 바탕 이미지만 확대된다.
  const renderPngBlob = async (dpi, transparent = false) => {
    const url = URL.createObjectURL(new Blob([buildSvgString(transparent)], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new window.Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      let scale = dpi ? dpi / (pxPerMm * 25.4) : 1;
      scale = Math.min(scale, 12000 / Math.max(bg.w, bg.h));
      const W = Math.round(bg.w * scale), H = Math.round(bg.h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); } // 투명 저장이면 흰 바탕을 깔지 않는다(알파 유지)
      ctx.drawImage(img, 0, 0, W, H);
      return { blob: await new Promise(res => canvas.toBlob(res, 'image/png')), W, H };
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const exportPng = async () => {
    if (!bg) return;
    try {
      const { blob, W, H } = await renderPngBlob(exportDpi, exportTransparent);
      download(blob, `diagram_${stamp()}_${W}x${H}${exportTransparent ? '_transparent' : ''}.png`);
    } catch (err) {
      console.error(err);
      notify('error', 'PNG 내보내기 실패', 'SVG로 내보낸 뒤 변환해 주세요.');
    }
  };

  // 이 PC에 폰트가 실제로 설치돼 있는지(없으면 브라우저가 대체 폰트로 그려서 인쇄 결과가 달라진다)
  const fontInstalled = (css) => {
    const family = css.split(',')[0].replace(/"/g, '').trim();
    const c = document.createElement('canvas').getContext('2d');
    const t = 'mmmmmmmmmmlli가나다';
    const w = (f) => { c.font = `72px ${f}`; return c.measureText(t).width; };
    return w(`"${family}", monospace`) !== w('monospace') || w(`"${family}", serif`) !== w('serif');
  };

  const openPrintWindow = (html) => {
    const win = window.open('', '_blank');
    if (!win) { notify('error', '팝업이 차단됐습니다', '브라우저 주소창의 팝업 허용 후 다시 눌러주세요.'); return; }
    win.document.open(); win.document.write(html); win.document.close();
  };

  // 현재 작업을 실제 크기(1mm = 1mm)로 인쇄한다. 인쇄 창에서 배율 100%, 여백 없음으로 두면 된다.
  const printDiagram = async () => {
    if (!bg) return;
    try {
      const { blob } = await renderPngBlob(300, false);
      const url = URL.createObjectURL(blob);
      const pm = paperMm;
      const wMm = bg.w / pxPerMm, hMm = bg.h / pxPerMm;
      openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>인쇄 — ${paper.size} ${paper.landscape ? '가로' : '세로'}</title>
<style>@page{size:${pm.w}mm ${pm.h}mm;margin:0}html,body{margin:0;background:#fff;font-family:"Malgun Gothic",sans-serif}
img{display:block;width:${wMm}mm;height:${hMm}mm}
.bar{padding:10px 14px;background:#eef1f8;border-bottom:1px solid #ccd;font-size:14px}.bar button{padding:8px 16px;font-size:14px;font-weight:700;margin-right:12px;cursor:pointer}
@media print{.bar{display:none}}@media screen{img{border:1px solid #bbb;margin:12px}}</style></head><body>
<div class="bar"><button onclick="window.print()">인쇄</button>${paper.size} ${paper.landscape ? '가로' : '세로'} (${pm.w}×${pm.h}mm) · 이미지 크기 ${Math.round(wMm)}×${Math.round(hMm)}mm ·
인쇄 창에서 <b>배율 100%(실제 크기)</b>, <b>여백 없음</b>으로 설정하세요.</div><img src="${url}"></body></html>`);
    } catch (err) {
      console.error(err);
      notify('error', '인쇄 준비 실패', 'PNG 로 저장한 뒤 인쇄해 주세요.');
    }
  };

  // 폰트 × 글자 크기(pt) 견본 페이지. 인쇄하면 실제 종이 위 크기로 나온다(화면에서는 참고용).
  const openFontSample = () => {
    const pm = paperMm;
    const sizes = [6, 7, 8, 9, 10, 12, 14, 18, 24];
    const sample = '상지건축 DX 다이어그램 가나다 ABC abc 0123';
    const blocks = FONT_CHOICES.map(f => {
      const ok = fontInstalled(f.css);
      const rows = sizes.map(s => `<div class="row"><span class="lab">${s}pt</span>
<span class="t" style='font-family:${f.css};font-size:${s}pt'>${sample}</span>
<span class="t" style='font-family:${f.css};font-size:${s}pt;font-weight:700'>${sample}</span></div>`).join('');
      return `<div class="blk"><div class="ttl">${f.label}${ok ? '' : ' <em>— 이 PC에 설치되어 있지 않아 대체 폰트로 표시됩니다</em>'}</div>${rows}</div>`;
    }).join('');
    openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>글자 크기 샘플 — ${paper.size}</title>
<style>@page{size:${pm.w}mm ${pm.h}mm;margin:12mm}html,body{margin:0;background:#fff;color:#111;font-family:"Malgun Gothic",sans-serif}
.bar{padding:10px 14px;background:#eef1f8;border-bottom:1px solid #ccd;font-size:14px}.bar button{padding:8px 16px;font-size:14px;font-weight:700;margin-right:12px;cursor:pointer}
.head{margin:0 0 4mm;font-size:12pt}.ruler{display:flex;align-items:flex-end;margin:2mm 0 6mm}
.ruler div{width:10mm;height:5mm;border-left:0.3mm solid #000;box-sizing:border-box;font-size:6pt;padding-left:0.5mm}
.ruler div:last-child{border-right:0.3mm solid #000;width:0}
.blk{break-inside:avoid;margin-bottom:6mm}.ttl{font-size:11pt;font-weight:700;border-bottom:0.3mm solid #999;margin-bottom:1.5mm}.ttl em{font-weight:400;color:#c00;font-size:9pt}
.row{display:flex;align-items:baseline;gap:6mm;line-height:1.35}.lab{width:12mm;font-size:8pt;color:#666;flex-shrink:0}.t{white-space:nowrap}
@media print{.bar{display:none}}@media screen{body{padding:12px}}</style></head><body>
<div class="bar"><button onclick="window.print()">인쇄</button>${paper.size} ${paper.landscape ? '가로' : '세로'} 기준 · 인쇄 창에서 <b>배율 100%(실제 크기)</b>로 설정하세요.</div>
<p class="head"><b>글자 크기 샘플 (${paper.size} ${paper.landscape ? '가로' : '세로'})</b> — 왼쪽은 보통, 오른쪽은 굵게. 아래 눈금자는 인쇄 후 자로 재서 100mm 인지 확인하면 배율이 맞는 겁니다.</p>
<div class="ruler">${Array.from({ length: 10 }, (_, i) => `<div>${i * 10 === 0 ? '0' : ''}${i > 0 ? `${i}cm` : ''}</div>`).join('')}<div></div></div>
${blocks}</body></html>`);
  };

  const saveProject = () => {
    if (!bg) return;
    download(new Blob([JSON.stringify({ v: 3, bg, els, paper, drawScale })], { type: 'application/json' }), `diagram_project_${stamp()}.json`);
  };
  const loadProject = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        if (!data?.bg || !Array.isArray(data.els)) throw new Error('형식 오류');
        setBg(data.bg); setEls(data.els); setSelId(null); setManualZoom(null); resetHistory();
        if (data.paper?.size && PAPERS[data.paper.size]) setPaper(data.paper);
        if (data.drawScale > 0) setDrawScale(data.drawScale);
      } catch {
        notify('error', '프로젝트를 열 수 없습니다', '이 편집기에서 저장한 .json 파일인지 확인해 주세요.');
      }
    };
    fr.readAsText(file);
  };

  // ─────────────────────────── 렌더 ───────────────────────────
  const hitW = (w) => Math.max(w, 16 / zoom);

  const renderEl = (el) => {
    const common = {
      onPointerDown: (e) => onElDown(e, el),
      style: { cursor: tool === 'select' ? 'move' : undefined },
    };
    switch (el.type) {
      case 'text':
        return <g key={el.id} {...common}><TextBlock {...el} /></g>;
      case 'label': {
        const { w, h } = labelBox(el);
        if (el.shape === 'bubble') {
          const sw = el.strokeWidth;
          const left = el.x - w / 2, bottom = el.y + h / 2;
          const t1 = left + Math.min(20, w * 0.18), t2 = t1 + Math.min(22, w * 0.2);
          return (
            <g key={el.id} {...common}>
              <polygon points={`${t1},${bottom - 2} ${t2},${bottom - 2} ${t1 - 4},${bottom + 15}`} fill={el.fill} stroke={el.stroke} strokeWidth={sw} strokeLinejoin="round" />
              <rect x={left} y={el.y - h / 2} width={w} height={h} rx={Math.min(12, h / 2)} fill={el.fill} stroke={el.stroke} strokeWidth={sw} />
              {sw > 0 && <rect x={t1 + sw} y={bottom - sw * 0.75} width={Math.max(0, t2 - t1 - sw * 2)} height={sw * 1.5} fill={el.fill} />}
              <TextBlock x={el.x} y={el.y} text={el.text} size={el.size} color={el.color} bold font={el.font} />
            </g>
          );
        }
        return (
          <g key={el.id} {...common}>
            {el.leader && (
              <>
                <line x1={el.x} y1={el.y} x2={el.leader.x} y2={el.leader.y} stroke={el.stroke} strokeWidth={Math.max(1.5, el.strokeWidth * 0.8)} />
                <circle cx={el.leader.x} cy={el.leader.y} r={Math.max(4, el.size * 0.2)} fill={el.stroke} />
              </>
            )}
            <rect x={el.x - w / 2} y={el.y - h / 2} width={w} height={h} rx={3} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
            <TextBlock x={el.x} y={el.y} text={el.text} size={el.size} color={el.color} bold font={el.font} />
          </g>
        );
      }
      case 'arrow': {
        const c = el.ctrl;
        // 곡선이면 끝 방향은 제어점→끝점의 접선 방향
        const ang = c ? Math.atan2(el.y2 - c.y, el.x2 - c.x) : Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const hl = el.head ? el.width * 3.2 + 8 : 0;
        const hw = hl * 0.55;
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const bx = el.x2 - cos * hl, by = el.y2 - sin * hl;
        const lineEnd = el.head ? { x: el.x2 - cos * hl * 0.8, y: el.y2 - sin * hl * 0.8 } : { x: el.x2, y: el.y2 };
        const d = c ? `M${el.x1},${el.y1} Q${c.x},${c.y} ${lineEnd.x},${lineEnd.y}` : null;
        return (
          <g key={el.id} {...common}>
            {c
              ? <path d={d} fill="none" stroke="transparent" strokeWidth={hitW(el.width)} />
              : <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={hitW(el.width)} />}
            {c
              ? <path d={d} fill="none" stroke={el.color} strokeWidth={el.width} {...dashProps(el.dashStyle, el.width)} />
              : <line x1={el.x1} y1={el.y1} x2={lineEnd.x} y2={lineEnd.y} stroke={el.color} strokeWidth={el.width} {...dashProps(el.dashStyle, el.width)} />}
            {el.head && (
              <polygon points={`${el.x2},${el.y2} ${bx - sin * hw},${by + cos * hw} ${bx + sin * hw},${by - cos * hw}`} fill={el.color} />
            )}
          </g>
        );
      }
      case 'rect':
      case 'ellipse':
      case 'polygon': {
        const shared = {
          fill: el.fill, fillOpacity: el.fillOpacity, stroke: el.strokeWidth > 0 ? el.stroke : 'none', strokeWidth: el.strokeWidth,
          strokeLinejoin: 'round', ...dashProps(el.dashStyle, el.strokeWidth),
          filter: el.blur > 0 ? `url(#blur-${el.id})` : undefined,
        };
        return (
          <g key={el.id} {...common}>
            {el.type === 'rect' && <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={Math.min(el.r || 0, el.w / 2, el.h / 2)} {...shared} />}
            {el.type === 'ellipse' && <ellipse cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} {...shared} />}
            {el.type === 'polygon' && <polygon points={el.points.map(p => p.join(',')).join(' ')} {...shared} />}
            {el.text && el.type === 'rect' && <TextBlock x={el.x + el.w / 2} y={el.y + el.h / 2} text={el.text} size={el.size} color={el.textColor} bold font={el.font} />}
            {el.text && el.type === 'ellipse' && <TextBlock x={el.cx} y={el.cy} text={el.text} size={el.size} color={el.textColor} bold font={el.font} />}
          </g>
        );
      }
      case 'marker':
        return (
          <g key={el.id} {...common}>
            <circle cx={el.x} cy={el.y} r={el.r} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
            <TextBlock x={el.x} y={el.y} text={el.text} size={el.size} color={el.color} bold font={el.font} />
          </g>
        );
      case 'chevron': {
        const n = el.h * 0.32, hw = el.w / 2, hh = el.h / 2;
        const pts = el.flat
          ? [[-hw, -hh], [hw - n, -hh], [hw, 0], [hw - n, hh], [-hw, hh]]
          : [[-hw, -hh], [hw - n, -hh], [hw, 0], [hw - n, hh], [-hw, hh], [-hw + n, 0]];
        return (
          <g key={el.id} {...common}>
            <polygon points={pts.map(([a, b]) => `${el.x + a},${el.y + b}`).join(' ')} fill={el.fill} strokeLinejoin="round" />
            <TextBlock x={el.x + (el.flat ? 0 : n * 0.15) - n * 0.15} y={el.y} text={el.text} size={el.size} color={el.color} bold font={el.font} />
          </g>
        );
      }
      case 'north': {
        const s = el.size;
        return (
          <g key={el.id} {...common}>
            <polygon points={`${el.x},${el.y - s / 2} ${el.x - s * 0.22},${el.y + s / 2} ${el.x},${el.y + s * 0.26}`} fill={el.color} strokeLinejoin="round" />
            <polygon points={`${el.x},${el.y - s / 2} ${el.x + s * 0.22},${el.y + s / 2} ${el.x},${el.y + s * 0.26}`} fill="#FFFFFF" stroke={el.color} strokeWidth={Math.max(1.5, s * 0.03)} strokeLinejoin="round" />
            <TextBlock x={el.x} y={el.y - s / 2 - s * 0.3} text="N" size={s * 0.42} color={el.color} bold halo font={el.font} />
          </g>
        );
      }
      case 'scalebar': {
        const total = metersToPx(el.meters), seg = total / el.segs, h = el.size * 0.45;
        const sw = Math.max(1, el.size * 0.07);
        return (
          <g key={el.id} {...common}>
            <rect x={el.x - el.size * 0.6} y={el.y - el.size * 1.6} width={total + el.size * 1.2} height={el.size * 3} fill="transparent" />
            {Array.from({ length: el.segs }, (_, i) => (
              <rect key={i} x={el.x + i * seg} y={el.y - h / 2} width={seg} height={h} fill={i % 2 ? '#FFFFFF' : el.color} stroke={el.color} strokeWidth={sw} />
            ))}
            {Array.from({ length: el.segs + 1 }, (_, i) => (
              <TextBlock key={i} x={el.x + i * seg} y={el.y - h / 2 - el.size * 0.65} size={el.size * 0.8} color={el.color} bold halo font={el.font}
                text={`${Math.round(((el.meters / el.segs) * i) * 10) / 10}${i === el.segs ? 'm' : ''}`} />
            ))}
            <TextBlock x={el.x + total / 2} y={el.y + h / 2 + el.size * 0.8} text={`SCALE 1:${SCALE_CTX.denom}`} size={el.size * 0.72} color={el.color} halo font={el.font} />
          </g>
        );
      }
      case 'legend': {
        const b = legendBox(el);
        return (
          <g key={el.id} {...common}>
            <rect x={el.x} y={el.y} width={b.w} height={b.h} rx={6} fill={el.fill} fillOpacity={el.opacity} stroke={el.stroke} strokeWidth={Math.max(1, el.size * 0.07)} />
            {b.hasTitle && <TextBlock anchor="start" x={el.x + b.pad} y={el.y + b.pad + b.rowH / 2} text={el.title} size={el.size * 1.1} color={el.color} bold font={el.font} />}
            {el.rows.map((r, i) => {
              const cy = el.y + b.pad + (b.hasTitle ? b.rowH : 0) + i * b.rowH + b.rowH / 2;
              const sx = el.x + b.pad;
              const lw = Math.max(2, el.size * 0.2);
              return (
                <g key={i}>
                  {r.kind === 'fill' || !r.kind
                    ? <rect x={sx} y={cy - el.size * 0.45} width={b.sw} height={el.size * 0.9} rx={2} fill={r.color} fillOpacity={0.85} stroke={shade(r.color, -0.25)} strokeWidth={1} />
                    : <line x1={sx} y1={cy} x2={sx + b.sw} y2={cy} stroke={r.color} strokeWidth={lw} {...dashProps(r.kind, lw)} />}
                  <TextBlock anchor="start" x={sx + b.sw + el.size * 0.7} y={cy} text={r.text} size={el.size} color={el.color} font={el.font} />
                </g>
              );
            })}
          </g>
        );
      }
      case 'dim': {
        const dx = el.x2 - el.x1, dy = el.y2 - el.y1, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, t = el.size * 0.6;
        const label = el.auto ? fmtMeters(pxToMeters(len)) : el.text;
        return (
          <g key={el.id} {...common}>
            <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={hitW(el.width)} />
            <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.width} />
            <line x1={el.x1 - nx * t} y1={el.y1 - ny * t} x2={el.x1 + nx * t} y2={el.y1 + ny * t} stroke={el.color} strokeWidth={el.width} />
            <line x1={el.x2 - nx * t} y1={el.y2 - ny * t} x2={el.x2 + nx * t} y2={el.y2 + ny * t} stroke={el.color} strokeWidth={el.width} />
            {label && <TextBlock x={(el.x1 + el.x2) / 2 - nx * el.size * 0.95} y={(el.y1 + el.y2) / 2 - ny * el.size * 0.95} text={label} size={el.size} color={el.color} bold halo font={el.font} />}
          </g>
        );
      }
      case 'icon': {
        const tailY = el.y + el.r * 1.35;
        return (
          <g key={el.id} {...common}>
            {el.pin && <polygon points={`${el.x - el.r * 0.3},${el.y + el.r * 0.85} ${el.x + el.r * 0.3},${el.y + el.r * 0.85} ${el.x},${tailY}`} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round" />}
            <circle cx={el.x} cy={el.y} r={el.r} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
            <text x={el.x} y={el.y} fontSize={el.r * 1.0} textAnchor="middle" dominantBaseline="central" fontFamily={EMOJI_FONT} style={{ userSelect: 'none' }}>{el.emoji}</text>
            {el.text && <TextBlock x={el.x} y={el.y + el.r * (el.pin ? 1.35 : 1) + el.size * 0.95} text={el.text} size={el.size} color={el.color} bold halo font={el.font} />}
          </g>
        );
      }
      case 'iso':
        return (
          <g key={el.id} {...common} opacity={el.opacity} filter={el.blur > 0 ? `url(#blur-${el.id})` : undefined}>
            <IsoBox ox={el.x} oy={el.y} w={el.w} d={el.d} h={el.h} color={el.color} hole={el.hole} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          </g>
        );
      case 'asset': {
        const a = ASSETS[el.kind] || ASSETS.tree;
        return (
          <g key={el.id} {...common} transform={`translate(${el.x} ${el.y}) scale(${el.flip ? -el.scale : el.scale} ${el.scale})`}>
            {el.shadow && <ellipse cx={0} cy={0} rx={a.w * 0.42} ry={a.w * 0.13} fill="rgba(15,23,42,0.16)" />}
            {a.draw(el.color, el.color2)}
          </g>
        );
      }
      default: return null;
    }
  };

  const handleSize = 9 / zoom;
  const selEls = els.filter(e => selIds.includes(e.id));

  // ── 빈 화면 ──
  if (!bg) {
    return (
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); loadBgFromFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="glass-card" style={{ padding: '36px 40px', borderRadius: 16, maxWidth: 560, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 34 }}>🗺️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>다이어그램 편집기</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            배치도, 지적도, 조감 캡처 같은 <b>바탕 도면 이미지</b>를 올리고, 그 위에 라벨·화살표·영역·아이콘을 얹어
            PNG나 SVG로 내보냅니다. 글자와 선은 전부 직접 그려서 한글이 항상 정확합니다.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="run-btn glow-cyan" style={{ padding: '11px 20px', fontSize: 14, borderRadius: 10 }} onClick={() => fileRef.current?.click()}>
              🖼️ 바탕 이미지 열기
            </button>
            <button style={{ ...smallBtn(false), padding: '11px 18px', fontSize: 14 }} onClick={startBlank}>A3 빈 캔버스로 시작</button>
            <button style={{ ...smallBtn(false), padding: '11px 18px', fontSize: 14 }} onClick={() => projRef.current?.click()}>프로젝트 불러오기</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #64748b)' }}>
            이미지를 여기로 끌어다 놓거나, 화면을 캡처한 뒤 Ctrl+V 로 붙여넣어도 됩니다.
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { loadBgFromFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={projRef} type="file" accept="application/json,.json" hidden onChange={(e) => { loadProject(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      {/* ── 좌측 패널 ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)', backdropFilter: 'blur(6px)' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>도구</div>
          {TOOL_GROUPS.map(g => (
            <div key={g.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: '2px 0 4px' }}>{g.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {TOOLS.filter(t => t.group === g.id).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setDraft(null); setTool(t.id); }}
                    style={{
                      ...smallBtn(tool === t.id), display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-start', padding: '6px 8px', fontSize: 12,
                      ...(tool === t.id ? { background: 'linear-gradient(135deg,#333399,#4f46e5)', color: '#fff', border: '1px solid transparent' } : {}),
                    }}
                  >
                    <span>{t.emoji}</span><span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{t.label}</span>
                    <span style={{ opacity: 0.6, fontSize: 10.5 }}>{t.key}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tool !== 'select' && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent-cyan)', lineHeight: 1.5 }}>
              {tool === 'polygon'
                ? '점을 차례로 클릭하고, 첫 점을 다시 누르거나 더블클릭/Enter로 닫습니다.'
                : tool === 'arrow' || tool === 'rect' || tool === 'ellipse' || tool === 'dim'
                  ? '캔버스를 드래그해서 그립니다. (Shift: 각도/정사각 고정)'
                  : tool === 'asset' || tool === 'marker'
                    ? '클릭할 때마다 계속 배치됩니다. 끝나면 Esc 또는 V.'
                    : '놓을 위치를 클릭하세요.'}
            </div>
          )}
        </div>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>시작 템플릿 (요소 묶음 넣기)</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[
              ['process', '⏩ 프로세스 흐름'],
              ['bubble', '⭕ 버블 다이어그램'],
              ['site', '🗺️ 배치도 분석 표기'],
              ['explode', '🧊 아이소 레이어 분해'],
            ].map(([id, label]) => (
              <button key={id} style={{ ...smallBtn(false), fontSize: 12, padding: '8px 6px' }} onClick={() => addTemplate(id)}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', marginTop: 6, lineHeight: 1.5 }}>
            현재 캔버스에 요소들이 추가되고 전부 선택된 상태가 됩니다. 그대로 끌어서 옮기거나, 하나씩 눌러서 글자와 색을 고치세요.
          </div>
        </details>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>참고 이미지로 채우기</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>
              참고 이미지를 넣으면 Gemini(무료 등급)가 어떤 종류인지 고르고 글자를 읽어 아래 칸을 채웁니다(위치는 이 편집기가 계산합니다 — 비전 모델의 위치 인식은 믿지 않습니다).
              내용만 직접 입력해서 채워도 됩니다.
            </p>
            <p style={{ fontSize: 11, color: '#C2410C', margin: 0, lineHeight: 1.5 }}>
              ⚠️ 이미지가 외부(Google)로 전송됩니다. 고객사 정보가 담긴 민감한 참고 이미지는 올리지 마세요.
            </p>
            {refImage ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <img src={refImage.src} alt="참고 이미지" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  <button style={smallBtn(true)} onClick={analyzeReference} disabled={refBusy}>{refBusy ? '분석 중…' : '🔎 AI로 종류/글자 분석'}</button>
                  <button style={{ ...smallBtn(false), fontSize: 11.5 }} onClick={() => { setRefImage(null); setRefDetectedType(null); }}>이미지 제거</button>
                </div>
              </div>
            ) : (
              <button style={smallBtn(false)} onClick={() => refFileRef.current?.click()}>🖼️ 참고 이미지 올리기</button>
            )}
            <input ref={refFileRef} type="file" accept="image/*" hidden onChange={(e) => { loadRefFromFile(e.target.files?.[0]); e.target.value = ''; }} />

            <Row label="종류">
              <select value={refType} onChange={(e) => setRefType(e.target.value)} style={inputBase}>
                {Object.entries(TEMPLATE_TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              {refDetectedType === refType && <span style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>AI 인식</span>}
            </Row>
            <input value={refTitle} onChange={(e) => setRefTitle(e.target.value)} placeholder="제목 (선택)" style={inputBase} />
            {refType === 'bubble' && (
              <input value={refCenter} onChange={(e) => setRefCenter(e.target.value)} placeholder="중심 원 글자 (비우면 '로비')" style={inputBase} />
            )}
            <textarea
              value={refItemsText}
              onChange={(e) => setRefItemsText(e.target.value)}
              rows={4}
              placeholder={refType === 'process' ? '한 줄에 하나씩. "이름 | 설명"도 가능\n대지 분석\n컨셉 도출 | 핵심 아이디어 설정\n매스 스터디' : '한 줄에 하나씩\n사무실\n회의실\n휴게실'}
              style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button style={{ ...smallBtn(false), fontWeight: 700 }} onClick={fillFromRef}>✅ 이 내용으로 채우기</button>
          </div>
        </details>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>아이소 · 조경 부품 (블록, 나무, 사람…)</summary>
          <button
            onClick={() => { setDraft(null); setTool('iso'); }}
            style={{ ...smallBtn(tool === 'iso'), width: '100%', marginBottom: 6, fontSize: 12, ...(tool === 'iso' ? { background: 'linear-gradient(135deg,#333399,#4f46e5)', color: '#fff', border: '1px solid transparent' } : {}) }}
          >🧊 아이소 블록/바닥 (O)</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
            {Object.entries(ASSETS).map(([k, a]) => (
              <button
                key={k}
                onClick={() => { setAssetKind(k); setDraft(null); setTool('asset'); }}
                style={{
                  ...smallBtn(tool === 'asset' && assetKind === k), padding: '6px 4px', fontSize: 11.5,
                  ...(tool === 'asset' && assetKind === k ? { background: 'linear-gradient(135deg,#333399,#4f46e5)', color: '#fff', border: '1px solid transparent' } : {}),
                }}
              >
                <div style={{ fontSize: 17, lineHeight: 1.2 }}>{a.emoji}</div>{a.label}
              </button>
            ))}
          </div>
          <button style={{ ...smallBtn(false), width: '100%', marginTop: 6, fontSize: 11.5 }} onClick={addRipple}>
            🧊 예시: 겹겹이 퍼지는 프레임 배경 넣기
          </button>
        </details>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {sel ? `속성 — ${sel.type === 'label' && sel.shape === 'bubble' ? '말풍선 라벨' : TYPE_LABEL[sel.type] || ''}` : selIds.length > 1 ? `${selIds.length}개 선택됨` : '속성'}
          </div>

          {selIds.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.7 }}>
              요소를 클릭하면 글자·색·굵기를 고칠 수 있습니다.<br />
              <b>여러 개</b>: Shift+클릭, 빈 곳 드래그(범위 선택), Ctrl+A<br />
              Delete 삭제 · Ctrl+D 복제 · Ctrl+Z 되돌리기 · 방향키 미세 이동(Shift: 10배)
            </div>
          )}

          {selIds.length > 1 && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(false)} onClick={() => moveZ('front')}>맨 앞</button>
                <button style={smallBtn(false)} onClick={() => moveZ('back')}>맨 뒤</button>
                <button style={smallBtn(false)} onClick={duplicateSel}>복제</button>
                <button style={{ ...smallBtn(false), color: '#dc2626' }} onClick={removeSel}>삭제</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>정렬</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                {[['left', '⬅ 왼쪽'], ['hcenter', '↔ 가로 중앙'], ['right', '➡ 오른쪽'], ['top', '⬆ 위'], ['vcenter', '↕ 세로 중앙'], ['bottom', '⬇ 아래'], ['hdist', '⇔ 가로 균등'], ['vdist', '⇕ 세로 균등']].map(([m, l]) => (
                  <button key={m} style={{ ...smallBtn(false), fontSize: 11.5, padding: '6px 4px' }} onClick={() => alignSel(m)}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)' }}>균등 배치는 3개 이상 선택했을 때 동작합니다. 속성 편집은 한 개만 선택했을 때 가능합니다.</div>
            </>
          )}

          {sel && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={smallBtn(false)} onClick={() => moveZ('up')} title="한 칸 앞으로">▲ 앞</button>
                <button style={smallBtn(false)} onClick={() => moveZ('down')} title="한 칸 뒤로">▼ 뒤</button>
                <button style={smallBtn(false)} onClick={() => moveZ('front')}>맨 앞</button>
                <button style={smallBtn(false)} onClick={() => moveZ('back')}>맨 뒤</button>
                <button style={smallBtn(false)} onClick={duplicateSel}>복제</button>
                <button style={{ ...smallBtn(false), color: '#dc2626' }} onClick={removeSel}>삭제</button>
              </div>

              {(sel.type === 'text' || sel.type === 'label' || sel.type === 'icon') && (
                <textarea
                  value={sel.text}
                  onChange={(e) => patchSel({ text: e.target.value }, 'text')}
                  rows={sel.type === 'icon' ? 1 : 2}
                  placeholder={sel.type === 'icon' ? '아이콘 아래 글자' : '내용 (줄바꿈 가능)'}
                  style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}

              {sel.type === 'text' && (
                <>
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={300} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="글자색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="스타일"><Check checked={sel.bold} onChange={(v) => patchSel({ bold: v })} label="굵게" /><Check checked={sel.halo} onChange={(v) => patchSel({ halo: v })} label="흰 윤곽" /></Row>
                </>
              )}

              {sel.type === 'label' && (
                <>
                  <Row label="모양">
                    <select value={sel.shape || 'box'} onChange={(e) => patchSel({ shape: e.target.value, leader: null })} style={inputBase}>
                      <option value="box">사각 박스</option><option value="bubble">말풍선</option>
                    </select>
                  </Row>
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={200} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="글자색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="배경색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="테두리색"><ColorField value={sel.stroke} onChange={(v) => patchSel({ stroke: v })} /></Row>
                  <Row label="테두리 굵기"><Slider value={sel.strokeWidth} min={0} max={10} step={0.5} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} /></Row>
                  {sel.shape !== 'bubble' && (
                    <Check
                      checked={!!sel.leader}
                      onChange={(v) => patchSel({ leader: v ? { x: sel.x + 110, y: sel.y + 90 } : null })}
                      label="지시선(점) 붙이기 — 점 위치는 끌어서 조정"
                    />
                  )}
                </>
              )}

              {sel.type === 'marker' && (
                <>
                  <Row label="번호/글자"><input value={sel.text} onChange={(e) => patchSel({ text: e.target.value }, 'text')} style={{ ...inputBase, width: 60, textAlign: 'center' }} /></Row>
                  <Row label="반지름"><Slider value={sel.r} min={8} max={120} onChange={(v) => patchSel({ r: v }, 'r')} /></Row>
                  <SizeField px={sel.size} min={6} max={160} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="배경색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="글자색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="테두리색"><ColorField value={sel.stroke} onChange={(v) => patchSel({ stroke: v })} /></Row>
                  <Row label="테두리 굵기"><Slider value={sel.strokeWidth} min={0} max={12} step={0.5} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} /></Row>
                </>
              )}

              {sel.type === 'chevron' && (
                <>
                  <textarea value={sel.text} onChange={(e) => patchSel({ text: e.target.value }, 'text')} rows={2} placeholder="단계 이름" style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }} />
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={160} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="가로"><Slider value={sel.w} min={60} max={1200} onChange={(v) => patchSel({ w: v }, 'w')} /></Row>
                  <Row label="세로"><Slider value={sel.h} min={30} max={400} onChange={(v) => patchSel({ h: v }, 'h')} /></Row>
                  <Row label="배경색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="글자색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Check checked={sel.flat} onChange={(v) => patchSel({ flat: v })} label="왼쪽을 평평하게 (첫 단계용)" />
                </>
              )}

              {sel.type === 'north' && (
                <>
                  <Row label="크기"><Slider value={sel.size} min={30} max={400} onChange={(v) => patchSel({ size: v }, 'size')} /></Row>
                  <Row label="색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                </>
              )}

              {sel.type === 'scalebar' && (
                <>
                  <Row label="길이(m)">
                    <input type="number" min="1" value={sel.meters} onChange={(e) => patchSel({ meters: Math.max(1, Number(e.target.value) || 1) }, 'm')} style={{ ...inputBase, width: 80 }} />
                  </Row>
                  <Row label="칸 수"><Slider value={sel.segs} min={1} max={10} onChange={(v) => patchSel({ segs: v }, 'segs')} /></Row>
                  <Row label="글자 크기"><Slider value={sel.size} min={10} max={80} onChange={(v) => patchSel({ size: v }, 'size')} /></Row>
                  <Row label="색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.5 }}>
                    길이는 "용지 / 인쇄"의 도면 축척(1:{drawScale})과 용지 기준으로 환산됩니다. 바탕 도면의 실제 축척과 같아야 정확합니다.
                  </div>
                </>
              )}

              {sel.type === 'legend' && (
                <>
                  <Row label="제목"><input value={sel.title} onChange={(e) => patchSel({ title: e.target.value }, 'title')} style={{ ...inputBase, width: 150 }} /></Row>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {sel.rows.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="color" value={r.color} onChange={(e) => patchSel({ rows: sel.rows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} style={{ width: 26, height: 24, padding: 0, border: 'none', background: 'none' }} />
                        <select value={r.kind || 'fill'} onChange={(e) => patchSel({ rows: sel.rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })} style={{ ...inputBase, padding: '4px 2px', width: 58 }}>
                          <option value="fill">면</option><option value="line">실선</option><option value="dash">파선</option><option value="dot">점선</option>
                        </select>
                        <input value={r.text} onChange={(e) => patchSel({ rows: sel.rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }, `row${i}`)} style={{ ...inputBase, flex: 1, minWidth: 0 }} />
                        <button style={{ ...smallBtn(false), padding: '3px 7px', color: '#dc2626' }} onClick={() => patchSel({ rows: sel.rows.filter((_, j) => j !== i) })}>×</button>
                      </div>
                    ))}
                    <button style={smallBtn(false)} onClick={() => patchSel({ rows: [...sel.rows, { color: '#6B7280', kind: 'fill', text: '새 항목' }] })}>+ 항목 추가</button>
                  </div>
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={120} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="글자색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="배경색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="배경 투명도"><Slider value={sel.opacity} min={0} max={1} step={0.05} onChange={(v) => patchSel({ opacity: v }, 'op')} /></Row>
                </>
              )}

              {sel.type === 'dim' && (
                <>
                  <Check checked={sel.auto} onChange={(v) => patchSel({ auto: v })} label={`길이 자동 표시 (도면 축척 1:${drawScale} 기준)`} />
                  {!sel.auto && <Row label="표시 글자"><input value={sel.text} onChange={(e) => patchSel({ text: e.target.value }, 'text')} style={{ ...inputBase, width: 110 }} /></Row>}
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={120} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Row label="선 굵기"><Slider value={sel.width} min={1} max={12} step={0.5} onChange={(v) => patchSel({ width: v }, 'w')} /></Row>
                  <Row label="색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                </>
              )}

              {sel.type === 'iso' && (
                <>
                  <Row label="색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="투명도"><Slider value={sel.opacity} min={0.05} max={1} step={0.05} onChange={(v) => patchSel({ opacity: v }, 'op')} /></Row>
                  <Row label="가로 크기"><Slider value={sel.w} min={10} max={2400} onChange={(v) => patchSel({ w: v }, 'w')} /></Row>
                  <Row label="세로 크기"><Slider value={sel.d} min={10} max={2400} onChange={(v) => patchSel({ d: v }, 'd')} /></Row>
                  <Row label="높이"><Slider value={sel.h} min={0} max={600} onChange={(v) => patchSel({ h: v }, 'h')} /></Row>
                  <Row label="가운데 구멍(프레임)"><Slider value={sel.hole} min={0} max={0.95} step={0.01} onChange={(v) => patchSel({ hole: v }, 'hole')} /></Row>
                  <Row label="테두리색"><ColorField value={sel.stroke} onChange={(v) => patchSel({ stroke: v })} /></Row>
                  <Row label="테두리 굵기"><Slider value={sel.strokeWidth} min={0} max={8} step={0.5} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} /></Row>
                  <Row label="번짐(블러)"><Slider value={sel.blur} min={0} max={60} onChange={(v) => patchSel({ blur: v }, 'blur')} /></Row>
                </>
              )}

              {sel.type === 'asset' && (
                <>
                  <Row label="종류">
                    <select
                      value={sel.kind}
                      onChange={(e) => patchSel({ kind: e.target.value, color: ASSETS[e.target.value].c1, color2: ASSETS[e.target.value].c2 })}
                      style={inputBase}
                    >
                      {Object.entries(ASSETS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
                    </select>
                  </Row>
                  <Row label="주 색상"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="보조 색상"><ColorField value={sel.color2} onChange={(v) => patchSel({ color2: v })} /></Row>
                  <Row label="크기"><Slider value={sel.scale} min={0.15} max={4} step={0.05} onChange={(v) => patchSel({ scale: v }, 'scale')} /></Row>
                  <Row label="옵션"><Check checked={sel.flip} onChange={(v) => patchSel({ flip: v })} label="좌우 반전" /><Check checked={sel.shadow} onChange={(v) => patchSel({ shadow: v })} label="바닥 그림자" /></Row>
                </>
              )}

              {sel.type === 'arrow' && (
                <>
                  <Row label="색"><ColorField value={sel.color} onChange={(v) => patchSel({ color: v })} /></Row>
                  <Row label="굵기"><Slider value={sel.width} min={1} max={30} onChange={(v) => patchSel({ width: v }, 'w')} /></Row>
                  <Row label="선 모양">
                    <select value={sel.dashStyle} onChange={(e) => patchSel({ dashStyle: e.target.value })} style={inputBase}>
                      <option value="solid">실선</option><option value="dash">파선</option><option value="dot">점선</option>
                    </select>
                  </Row>
                  <Check checked={sel.head} onChange={(v) => patchSel({ head: v })} label="화살촉 표시" />
                  <Check
                    checked={!!sel.ctrl}
                    onChange={(v) => patchSel({ ctrl: v ? { x: (sel.x1 + sel.x2) / 2 - (sel.y2 - sel.y1) * 0.3, y: (sel.y1 + sel.y2) / 2 + (sel.x2 - sel.x1) * 0.3 } : null })}
                    label="곡선 — 가운데 점을 끌어서 휘게"
                  />
                </>
              )}

              {(sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'polygon') && (
                <>
                  {(sel.type === 'rect' || sel.type === 'ellipse') && (
                    <>
                      <textarea
                        value={sel.text || ''}
                        onChange={(e) => patchSel({ text: e.target.value }, 'text')}
                        rows={2} placeholder="도형 안에 넣을 글자 (선택)"
                        style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      {sel.text && (
                        <>
                          <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                          <SizeField px={sel.size || 26} min={6} max={200} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                          <Row label="글자색"><ColorField value={sel.textColor || '#111827'} onChange={(v) => patchSel({ textColor: v })} /></Row>
                        </>
                      )}
                    </>
                  )}
                  {sel.type === 'rect' && <Row label="모서리 둥글기"><Slider value={sel.r || 0} min={0} max={200} onChange={(v) => patchSel({ r: v }, 'r')} /></Row>}
                  <Row label="채움색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="채움 투명도"><Slider value={sel.fillOpacity} min={0} max={1} step={0.05} onChange={(v) => patchSel({ fillOpacity: v }, 'fo')} /></Row>
                  <Row label="선색"><ColorField value={sel.stroke} onChange={(v) => patchSel({ stroke: v })} /></Row>
                  <Row label="선 굵기"><Slider value={sel.strokeWidth} min={0} max={24} step={0.5} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} /></Row>
                  <Row label="선 모양">
                    <select value={sel.dashStyle} onChange={(e) => patchSel({ dashStyle: e.target.value })} style={inputBase}>
                      <option value="solid">실선</option><option value="dash">파선</option><option value="dot">점선</option>
                    </select>
                  </Row>
                  <Row label="번짐(블러)"><Slider value={sel.blur} min={0} max={60} onChange={(v) => patchSel({ blur: v }, 'blur')} /></Row>
                </>
              )}

              {sel.type === 'icon' && (
                <>
                  <Row label="아이콘">
                    <input value={sel.emoji} onChange={(e) => patchSel({ emoji: e.target.value }, 'emoji')} style={{ ...inputBase, width: 54, textAlign: 'center' }} />
                  </Row>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {EMOJIS.map(em => (
                      <button key={em} onClick={() => patchSel({ emoji: em })} style={{ ...smallBtn(sel.emoji === em), padding: '3px 6px', fontSize: 16 }}>{em}</button>
                    ))}
                  </div>
                  <Row label="크기"><Slider value={sel.r} min={16} max={140} onChange={(v) => patchSel({ r: v }, 'r')} /></Row>
                  <Row label="배경색"><ColorField value={sel.fill} onChange={(v) => patchSel({ fill: v })} /></Row>
                  <Row label="테두리색"><ColorField value={sel.stroke} onChange={(v) => patchSel({ stroke: v })} /></Row>
                  <FontSelect value={sel.font} onChange={(v) => patchSel({ font: v })} />
                  <SizeField px={sel.size} min={6} max={120} pxToPt={pxToPt} ptToPx={ptToPx} onChange={(v) => patchSel({ size: v }, 'size')} />
                  <Check checked={sel.pin} onChange={(v) => patchSel({ pin: v })} label="핀(꼬리) 모양" />
                </>
              )}
            </>
          )}
        </div>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>
            용지 / 인쇄 ({paper.size} {paper.landscape ? '가로' : '세로'})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="용지">
              <select value={paper.size} onChange={(e) => setPaper(p => ({ ...p, size: e.target.value }))} style={inputBase}>
                {Object.keys(PAPERS).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={paper.landscape ? 'l' : 'p'} onChange={(e) => setPaper(p => ({ ...p, landscape: e.target.value === 'l' }))} style={inputBase}>
                <option value="l">가로</option><option value="p">세로</option>
              </select>
            </Row>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '6px 8px' }}>
              이 캔버스는 {paper.size} {paper.landscape ? '가로' : '세로'}에 꽉 차게 인쇄된다고 보고 계산합니다.<br />
              <b>1mm = {Math.round(pxPerMm * 100) / 100}px</b> · 인쇄 크기 약 {Math.round(bg.w / pxPerMm)}×{Math.round(bg.h / pxPerMm)}mm<br />
              10pt 글자 = {Math.round(ptToPx(10) * 10) / 10}px · 선 0.5mm = {Math.round(pxPerMm * 0.5 * 10) / 10}px
            </div>
            <Row label="도면 축척 1 :">
              <input type="number" min="1" value={drawScale} onChange={(e) => setDrawScale(Math.max(1, Number(e.target.value) || 1))} style={{ ...inputBase, width: 84 }} title="스케일바/치수선의 실제 길이 환산에 씁니다" />
            </Row>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', marginTop: -4 }}>스케일바·치수선 길이를 이 축척으로 환산합니다.</div>
            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>캔버스 크기</div>
              <Row label="가로 × 세로 (px)">
                <input value={sizeInput.w} onChange={(e) => setSizeInput(s => ({ ...s, w: e.target.value }))} style={{ ...inputBase, width: 64, textAlign: 'right' }} inputMode="numeric" />
                <span>×</span>
                <input value={sizeInput.h} onChange={(e) => setSizeInput(s => ({ ...s, h: e.target.value }))} style={{ ...inputBase, width: 64, textAlign: 'right' }} inputMode="numeric" />
                <button style={smallBtn(true)} onClick={() => resizeCanvas(sizeInput.w, sizeInput.h)}>적용</button>
              </Row>
              <Row label="용지 크기로">
                <select value={workDpi} onChange={(e) => setWorkDpi(Number(e.target.value))} style={inputBase} title="작업 해상도. 높을수록 큰 캔버스가 됩니다">
                  <option value={72}>72dpi</option><option value={100}>100dpi</option><option value={150}>150dpi</option><option value={200}>200dpi</option>
                </select>
                <button style={smallBtn(false)} onClick={() => resizeCanvas((paperMm.w / 25.4) * workDpi, (paperMm.h / 25.4) * workDpi)}>
                  {paper.size} {paper.landscape ? '가로' : '세로'} 적용
                </button>
              </Row>
              {bg.src && (
                <Row label="바탕 이미지">
                  <select value={bg.fit || 'meet'} onChange={(e) => setBg(b => ({ ...b, fit: e.target.value }))} style={inputBase}>
                    <option value="meet">전체가 보이게(여백)</option><option value="slice">캔버스를 꽉 채움(잘림)</option><option value="none">캔버스에 맞춰 늘림</option>
                  </select>
                </Row>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)' }}>캔버스만 바뀌고 올려둔 요소는 그대로 유지됩니다.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...smallBtn(true), flex: 1 }} onClick={printDiagram}>🖨️ 실제 크기로 인쇄</button>
              <button style={{ ...smallBtn(false), flex: 1 }} onClick={openFontSample}>🔠 글자 크기 샘플</button>
            </div>
            {!bg.src && (
              <Row label="캔버스 배경색"><ColorField value={bg.color || '#ffffff'} onChange={(v) => setBg(b => ({ ...b, color: v }))} /></Row>
            )}
          </div>
        </details>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
          <Row label="PNG 해상도">
            <select value={exportDpi} onChange={(e) => setExportDpi(Number(e.target.value))} style={inputBase}>
              <option value={0}>화면 크기 그대로</option><option value={150}>150dpi</option><option value={300}>300dpi (인쇄용)</option>
            </select>
          </Row>
          <Check checked={exportTransparent} onChange={setExportTransparent} label="투명 배경으로 저장 (바탕 이미지/색 제외, 요소만)" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="run-btn glow-cyan" style={{ flex: 1, padding: '10px', fontSize: 13.5, borderRadius: 9 }} onClick={exportPng}>PNG 저장</button>
            <button style={{ ...smallBtn(true), flex: 1, fontSize: 13.5 }} onClick={exportSvg}>SVG 저장</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...smallBtn(false), flex: 1 }} onClick={saveProject}>프로젝트 저장</button>
            <button style={{ ...smallBtn(false), flex: 1 }} onClick={() => projRef.current?.click()}>불러오기</button>
          </div>
          <button style={smallBtn(false)} onClick={() => fileRef.current?.click()}>바탕 이미지 바꾸기</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { loadBgFromFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={projRef} type="file" accept="application/json,.json" hidden onChange={(e) => { loadProject(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── 캔버스 ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
          <button style={smallBtn(false)} onClick={undo} disabled={!past.current.length}>↩ 되돌리기</button>
          <button style={smallBtn(false)} onClick={redo} disabled={!future.current.length}>↪ 다시</button>
          <span style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
          <button style={smallBtn(false)} onClick={() => setManualZoom(Math.max(0.05, zoom / 1.25))}>－</button>
          <span style={{ fontSize: 12.5, width: 46, textAlign: 'center', color: 'var(--text-secondary)' }}>{Math.round(zoom * 100)}%</span>
          <button style={smallBtn(false)} onClick={() => setManualZoom(Math.min(4, zoom * 1.25))}>＋</button>
          <button style={smallBtn(false)} onClick={() => setManualZoom(null)}>화면 맞춤</button>
          <button style={smallBtn(false)} onClick={() => setManualZoom(1)}>100%</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary, #64748b)' }}>{bg.w} × {bg.h}px · 요소 {els.length}개</span>
        </div>
        <div
          ref={wrapRef}
          style={{ flex: 1, overflow: 'auto', background: '#cfd6e4', padding: 24 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadBgFromFile(e.dataTransfer.files?.[0]); }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${bg.w} ${bg.h}`}
            width={bg.w * zoom}
            height={bg.h * zoom}
            style={{
              display: 'block', margin: '0 auto', boxShadow: '0 4px 24px rgba(15,23,42,0.25)', touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair',
              // 투명 저장이 켜져 있으면 체크무늬로 "저장 결과에서 비어 있는 부분"을 보여준다
              ...(exportTransparent
                ? { backgroundColor: '#fff', backgroundImage: 'linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,10px 10px' }
                : { background: '#fff' }),
            }}
            onPointerDown={onSvgDown}
            onPointerMove={onSvgMove}
            onPointerUp={onSvgUp}
            onPointerCancel={onSvgUp}
            onDoubleClick={() => { if (draft && draft.length >= 3) finishPolygon(draft); }}
          >
            <defs>
              {els.filter(e => e.blur > 0).map(e => (
                <filter key={e.id} id={`blur-${e.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation={e.blur} />
                </filter>
              ))}
            </defs>
            {/* data-bg: 투명 저장 시 이 노드만 빼고 내보낸다. 편집 화면에서는 흐리게 보여 "빠지는 부분"임을 알려준다 */}
            {bg.src
              ? <image data-bg="1" href={bg.src} x="0" y="0" width={bg.w} height={bg.h} opacity={exportTransparent ? 0.3 : 1}
                preserveAspectRatio={bg.fit === 'slice' ? 'xMidYMid slice' : bg.fit === 'none' ? 'none' : 'xMidYMid meet'} />
              : <rect data-bg="1" x="0" y="0" width={bg.w} height={bg.h} fill={bg.color || '#fff'} opacity={exportTransparent ? 0.3 : 1} />}
            <g>{els.map(renderEl)}</g>

            {/* 아래는 편집용 표시 — 내보내기에서는 제외된다 */}
            <g data-ui="1">
              {tool === 'select' && selEls.map(se => {
                const b = bboxOf(se);
                return (
                  <rect
                    key={se.id} x={b.x - 4 / zoom} y={b.y - 4 / zoom} width={b.w + 8 / zoom} height={b.h + 8 / zoom}
                    fill="none" stroke="#2563eb" strokeWidth={1.5 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} pointerEvents="none"
                  />
                );
              })}
              {marquee && (
                <rect
                  x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                  fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} pointerEvents="none"
                />
              )}
              {sel && tool === 'select' && getHandles(sel).map(h => (
                <rect
                  key={h.key} x={h.x - handleSize / 2} y={h.y - handleSize / 2} width={handleSize} height={handleSize}
                  fill="#fff" stroke="#2563eb" strokeWidth={1.5 / zoom} style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => onHandleDown(e, h)}
                />
              ))}
              {draft && (
                <>
                  <polyline
                    points={[...draft, ...(cursor ? [[cursor.x, cursor.y]] : [])].map(p => p.join(',')).join(' ')}
                    fill="none" stroke="#2563eb" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} pointerEvents="none"
                  />
                  {draft.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? 7 : 4) / zoom} fill={i === 0 ? '#fff' : '#2563eb'} stroke="#2563eb" strokeWidth={1.5 / zoom} pointerEvents="none" />
                  ))}
                </>
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
