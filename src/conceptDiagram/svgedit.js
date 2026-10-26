// 어떤 방식으로 만든 다이어그램이든(평면 다이어그램·배치 개념도·매스 과정도·버블도·층별 조닝도…) 그림 속 도형을 하나씩 골라
// 색·위치·곡선·선 종류를 고칠 수 있게 하는 순수 함수 모음. DOM 없이 문자열로만 동작해서 점검이 쉽다.
//
// 고친 내용(edits)은 '요소 번호 → 바꾼 값'으로 따로 저장하고, 그림을 다시 그릴 때(예: 글자를 고쳤을 때) 같은 번호의 요소에 다시 입힌다.
//   edits = { sig, ops: { e12: { t:[dx,dy], r:30, rc:[cx,cy], set:{ fill:'#fff', d:'M…', 'stroke-dasharray':'9 6' }, del:true, tag:'path' } } }
//   r = 회전 각도(°, 시계 방향 +), rc = 돌리는 중심(요소의 원래 변환을 적용한 뒤의 좌표). 그릴 때 transform = translate(t) rotate(r rc) 원래변환
//   s = 크기 배율 [가로, 세로](전체 크기 조절로 생김, 선 굵기·글자도 함께 커짐), sc = 키우는 중심(rc 처럼 원래 변환을 적용한 뒤의 좌표).
//   그릴 때 transform = translate(t) [sc 둘레로 scale(s)] rotate(r rc) 원래변환 — 이동(t)은 항상 가장 바깥이라 크기를 바꾼 뒤에도 끌어 옮기는 양이 그대로다
//   lh = 행간 배율(여러 줄 글자 <text> 안 tspan 줄 간격 dy·y 를 이 배수로, 1 이면 그대로). 정렬(text-anchor)·자간(letter-spacing)은 set 속성으로 둔다
//   sig = 그림 구조(요소 종류의 순서)의 지문. 구조가 달라지면(다른 그림이 되면) 옛 수정은 적용하지 않는다.

import { cropRect, fitInside, normCrop } from './imgutil';
import { normDeg, rotPt, parseTransform, applyMat, rotRectKeep } from './rotate';
import { badgeInk, assignNumbers, badgeFontK, BADGE_COLOR } from './marker';
import { calloutSvg, calloutLayout, CALLOUT_COLOR } from './callout';
import { dimSvg, DIM_COLOR, DIM_DEFAULT_TEXT } from './dim';
import { ICON_NAMES, CHIP_SHAPES, iconChipSvg } from './icons';
import { normalizeTable, tableSvg, tableLayout, SAMPLE_TABLE, TABLE_COLOR } from './table';
import { imageFx } from './imgfx';
import { applyTheme } from './theme';
import { northSvg, scaleBarSvg, normalizeScale, scaleBarHeight, NORTH_STYLES, SYMBOL_COLOR } from './symbols';

const LEAF = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text']);
const SKIP = new Set(['defs', 'marker', 'pattern', 'clipPath', 'mask', 'symbol', 'style', 'linearGradient', 'radialGradient', 'filter', 'title', 'desc', 'foreignObject']);
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR_RE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ATTR_ESC = (v) => String(v).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const r4 = (v) => Math.round(Number(v) * 10000) / 10000;

function parseAttrs(s) {
  const out = {}; ATTR_RE.lastIndex = 0; let m;
  while ((m = ATTR_RE.exec(s))) out[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : '';
  return out;
}
const buildTag = (tag, attrs, self) => `<${tag}${Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => ` ${k}="${ATTR_ESC(v)}"`).join('')}${self ? '/' : ''}>`;
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// 그림 속 고를 수 있는 요소(도형·글자 e#)와 묶음(g#)을 문서 순서대로 찾는다. defs·marker·pattern 같은 정의 부분은 건너뛴다.
export function scanSvg(svg) {
  const els = []; const skipStack = []; const gstack = []; let nE = 0; let nG = 0; let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(svg))) {
    const closing = m[1] === '/'; const tag = m[2]; const self = m[4] === '/';
    if (closing) { if (skipStack.length) skipStack.pop(); else if (tag === 'g') gstack.pop(); continue; }
    if (skipStack.length) { if (!self) skipStack.push(tag); continue; }
    if (SKIP.has(tag)) { if (!self) skipStack.push(tag); continue; }
    if (tag === 'g') {
      const id = `g${nG++}`; els.push({ id, kind: 'g', tag, s: m.index, e: m.index + m[0].length, attrs: parseAttrs(m[3]), self, parent: gstack[gstack.length - 1] || null });
      if (!self) gstack.push(id);
    } else if (LEAF.has(tag)) {
      els.push({ id: `e${nE++}`, kind: 'e', tag, s: m.index, e: m.index + m[0].length, attrs: parseAttrs(m[3]), self, parent: gstack[gstack.length - 1] || null });
    }
  }
  return { els, sig: hash(els.map((e) => `${e.kind}${e.tag}`).join('|')), count: els.length };
}

export const emptyEdits = (svg) => ({ sig: scanSvg(svg).sig, ops: {} });
// 그림 구조가 바뀐 뒤(폼 수정 등): 구조 지문을 새 그림에 맞추고, 맞지 않게 된 손 수정(ops)만 비운다(내 이미지·리더선·표(adds)와 내가 그린 도형(shapes)은 그대로)
export function rebaseEdits(edits, svg) {
  if (!edits) return edits;
  const sig = scanSvg(svg).sig; if (edits.sig === sig) return edits;
  return { ...edits, sig, ops: {} };
}
export const hasEdits = (edits) => !!edits && (Object.keys(edits.ops || {}).length > 0 || (edits.adds || []).length > 0 || (edits.shapes || []).length > 0);

// ── 내가 새로 그린 도형·글자·화살표(edits.shapes) ──
// 그림 맨 끝에 붙여서 다른 요소와 똑같이 고를 수 있게 한다(색·위치·곡선·선 종류를 같은 편집기로 고침). 그림 구조 지문(sig)은 이것을 빼고 계산한다.
//   shapes = [{ id:'s1', kind:'text'|'rect'|'ellipse'|'arrow', ... }] — 번호는 그림의 요소 번호가 아니라 '몇 번째로 추가했는가'다.
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"; // page.js 의 ENGINE_FONT 와 같아야 글꼴 바꿈이 먹는다(회귀 시험으로 확인)
export const SHAPE_FONT = FONT;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
export function shapeSvg(sh) {
  if (sh.kind === 'raw') return `${sh.defs || ''}${sh.el || ''}`; // 복사한 요소: 정의 + 요소 한 개(요소 하나짜리라야 새 도형 번호가 어긋나지 않는다)
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (sh.kind === 'text') {
    const lines = String(sh.text ?? '').split('\n'); const size = num(sh.size, 20);
    const inner = lines.length > 1 ? lines.map((t, i) => `<tspan x="${r2(sh.x)}" dy="${i === 0 ? 0 : r2(size * 1.25)}">${esc(t)}</tspan>`).join('') : esc(lines[0]);
    return `<text x="${r2(sh.x)}" y="${r2(sh.y)}" font-family="${FONT}" font-size="${r2(size)}" font-weight="${sh.bold === false ? 400 : 700}" text-anchor="${sh.anchor || 'middle'}" fill="${sh.fill || '#222222'}">${inner}</text>`;
  }
  if (sh.kind === 'rect') return `<rect x="${r2(sh.x)}" y="${r2(sh.y)}" width="${r2(sh.w)}" height="${r2(sh.h)}" rx="${r2(sh.rx ?? 6)}" fill="${sh.fill || '#FFFFFF'}" stroke="${sh.stroke || '#222222'}" stroke-width="${r2(sh.sw ?? 2)}"/>`;
  if (sh.kind === 'ellipse') return `<ellipse cx="${r2(sh.cx)}" cy="${r2(sh.cy)}" rx="${r2(sh.rx)}" ry="${r2(sh.ry)}" fill="${sh.fill || '#FFFFFF'}" stroke="${sh.stroke || '#222222'}" stroke-width="${r2(sh.sw ?? 2)}"/>`;
  if (sh.kind === 'arrow') {
    const mid = `svm_${sh.id}`; const col = sh.color || '#E8832A'; const head = sh.head || 'end';
    const fillMark = sh.ctx === false ? col : 'context-stroke'; // context-stroke: 화살촉이 선 색을 따라간다(지원하지 않는 브라우저면 색을 직접 지정)
    const mk = `<defs><marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${fillMark}"/></marker></defs>`;
    return `${mk}<path d="M${r2(sh.x1)} ${r2(sh.y1)}L${r2(sh.x2)} ${r2(sh.y2)}" fill="none" stroke="${col}" stroke-width="${r2(sh.sw ?? 4)}" stroke-linecap="round" stroke-linejoin="round"${head === 'end' || head === 'both' ? ` marker-end="url(#${mid})"` : ''}${head === 'start' || head === 'both' ? ` marker-start="url(#${mid})"` : ''}/>`;
  }
  return '';
}
// 복사한 요소(raw)를 (dx, dy) 옮긴다: 요소의 transform 앞에 translate 를 붙인다
export function rawShift(sh, dx, dy) {
  if (!dx && !dy) return sh;
  const t = `translate(${r2(dx)} ${r2(dy)})`; const open = String(sh.el || '').split('>')[0];
  const el = /\stransform="/.test(open) ? sh.el.replace(/(\s)transform="/, `$1transform="${t} `) : sh.el.replace(/^(<[A-Za-z]+)/, `$1 transform="${t}"`);
  return { ...sh, el };
}
// 복사한 글자(raw)의 내용을 바꾼다(여러 줄은 줄마다 tspan)
export function rawSetText(sh, text) {
  const el = String(sh.el || '').replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/, (all, open, _inner, close) => {
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = String(text ?? '').split('\n'); const x = /\sx="([^"]*)"/.exec(open)?.[1] ?? '0'; const fs = num(/font-size="([^"]*)"/.exec(open)?.[1], 16);
    const inner = lines.length > 1 ? lines.map((t, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : r2(fs * 1.25)}">${esc(t)}</tspan>`).join('') : esc(lines[0]);
    return open + inner + close;
  });
  return { ...sh, el };
}
export function appendShapes(svg, shapes, themer) {
  if (!shapes || !shapes.length) return svg;
  const end = svg.lastIndexOf('</svg>'); if (end < 0) return svg;
  return svg.slice(0, end) + shapes.map(shapeSvg).map((x) => (themer ? themer(x) : x)).join('') + svg.slice(end);
}
// 화면 한가운데(box=[x,y,w,h])에 놓을 새 도형의 기본값
export function newShape(kind, box, scale = 1) {
  const [bx, by, bw, bh] = box; const cx = bx + bw / 2; const cy = by + bh / 2; const u = Math.max(bw, bh) / 100; // 그림 크기에 비례
  if (kind === 'text') return { kind, text: '글자', x: r2(cx), y: r2(cy), size: r2(Math.max(14, Math.min(40, u * 2.2)) * scale), fill: '#222222', anchor: 'middle', bold: true };
  if (kind === 'rect') return { kind, x: r2(cx - bw * 0.08), y: r2(cy - bh * 0.05), w: r2(bw * 0.16), h: r2(bh * 0.1), rx: 6, fill: '#FFFFFF', stroke: '#222222', sw: r2(Math.max(1.5, u * 0.2)) };
  if (kind === 'ellipse') return { kind, cx: r2(cx), cy: r2(cy), rx: r2(bw * 0.055), ry: r2(bw * 0.055), fill: '#FFFFFF', stroke: '#222222', sw: r2(Math.max(1.5, u * 0.2)) };
  return { kind: 'arrow', x1: r2(cx - bw * 0.15), y1: r2(cy), x2: r2(cx + bw * 0.15), y2: r2(cy), color: '#E8832A', sw: r2(Math.max(3, u * 0.35)), head: 'end' };
}
export function editAddShape(edits, sig, shape) {
  const next = { sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, ...(edits?.adds?.length ? { adds: edits.adds } : {}), shapes: [...(edits?.shapes || [])] };
  let n = 1; while (next.shapes.some((q) => q.id === `s${n}`)) n += 1;
  next.shapes.push({ ...shape, id: `s${n}` });
  return { edits: next, index: next.shapes.length - 1, id: `s${n}` };
}
export const editUpdateShape = (edits, id, patch) => ({ ...edits, shapes: (edits?.shapes || []).map((q) => (q.id === id ? { ...q, ...patch } : q)) });
// 도형 하나를 지운다. 그 뒤에 추가한 도형의 요소 번호가 하나씩 당겨지므로 수정(ops)도 같이 옮긴다. baseLeaf = 그림 본래의 도형·글자 요소 수
export function editRemoveShape(edits, id, baseLeaf) {
  const shapes = edits?.shapes || []; const i = shapes.findIndex((q) => q.id === id); if (i < 0) return edits;
  const ops = {};
  Object.entries(edits.ops || {}).forEach(([k, v]) => {
    const m = /^e(\d+)$/.exec(k);
    if (!m || Number(m[1]) < baseLeaf) { ops[k] = v; return; }
    const j = Number(m[1]) - baseLeaf;
    if (j === i) return;                                  // 지운 도형의 수정은 버린다
    ops[j > i ? `e${baseLeaf + j - 1}` : k] = v;
  });
  const next = { ...edits, ops, shapes: shapes.filter((q) => q.id !== id) };
  if (!next.shapes.length) delete next.shapes;
  return next;
}

// 내가 넣은 이미지(edits.adds): [{ id:'a1', kind:'image', href, x, y, w, h, opacity, behind }] — 그림 구조와 무관해서 구조 지문(sig)에 영향이 없다.
// 번호 마커도 같은 목록: { id, kind:'badge', shape:'circle'|'square', x, y, w, h(=지름), text:'1', fill, auto } — 가운데 숫자가 든 원·사각 하나(<g>)로 그려진다.
const TXT_ESC = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const badgeTag = (a, interactive) => {
  const r = a.w / 2; const cx = a.x + r; const cy = a.y + r; const t = String(a.text ?? ''); const fs = a.w * 0.56 * badgeFontK(t);
  const shp = a.shape === 'square' ? `<rect x="${r2(a.x)}" y="${r2(a.y)}" width="${r2(a.w)}" height="${r2(a.w)}" rx="${r2(a.w * 0.1)}" fill="${a.fill || BADGE_COLOR}"/>` : `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${a.fill || BADGE_COLOR}"/>`;
  return `<g${interactive ? ` data-eid="${a.id}"` : ''}>${shp}<text x="${r2(cx)}" y="${r2(cy + fs * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${r2(fs)}" font-weight="700" fill="${badgeInk(a.fill || BADGE_COLOR)}"${interactive ? ' pointer-events="none"' : ''}>${TXT_ESC(t)}</text></g>`;
};
// 리더선 라벨: { id, kind:'callout', x, y(글 상자 왼쪽 위), tx, ty(가리키는 끝점), title, desc, size, fill(색), line:'straight'|'elbow', end:'dot'|'arrow'|'none' }
const calloutOf = (a) => ({ x: a.x, y: a.y, tx: a.tx, ty: a.ty, title: a.title, desc: a.desc, size: a.size, line: a.line, end: a.end, color: a.fill, align: a.align, ls: a.ls, lh: a.lh });
// 치수선: { id, kind:'dim', x, y(첫 끝점), tx, ty(둘째 끝점), text('12,000'·'30m'), size, fill(색) }
const dimTag = (a, interactive) => dimSvg({ x: a.x, y: a.y, tx: a.tx, ty: a.ty, text: a.text, size: a.size, color: a.fill }, { id: a.id, interactive, font: FONT });
const calloutTag = (a, interactive) => calloutSvg(calloutOf(a), { id: a.id, interactive, font: FONT });
// 아이콘 칩: { id, kind:'icon', icon, shape:'rounded'|'circle'|'bare', x, y, w, h(=한 변), fill(칩 색, bare 면 아이콘 색) }
const iconTag = (a, interactive) => {
  const side = a.w; const hit = interactive ? `<rect x="${r2(a.x)}" y="${r2(a.y)}" width="${r2(side)}" height="${r2(side)}" fill="transparent"/>` : '';
  return `<g${interactive ? ` data-eid="${a.id}"` : ''}>${hit}${iconChipSvg({ cx: a.x + side / 2, cy: a.y + side / 2, side, icon: ICON_NAMES.includes(a.icon) ? a.icon : 'star', color: a.fill || '#222222', shape: CHIP_SHAPES.includes(a.shape) ? a.shape : 'rounded' })}</g>`;
};
// 내 이미지: 탈색(gray 0~100)·가장자리 흐리게(edge 0~100)는 SVG 필터·마스크로 겹쳐 그린다(원본은 그대로)
const imgTag = (a, interactive) => { const fx = imageFx(a.id, { x: a.x, y: a.y, w: a.w, h: a.h, gray: a.gray, edge: a.edge }); return `${fx.defs}<image href="${ATTR_ESC(a.href)}" x="${r2(a.x)}" y="${r2(a.y)}" width="${r2(a.w)}" height="${r2(a.h)}" preserveAspectRatio="none"${fx.attrs}${a.opacity < 1 ? ` opacity="${a.opacity}"` : ''}${a.rot ? ` transform="rotate(${r2(a.rot)} ${r2(a.x + a.w / 2)} ${r2(a.y + a.h / 2)})"` : ''}${interactive ? ` data-eid="${a.id}"` : ''}/>`; };
// 개요표: { id, kind:'table', x, y(왼쪽 위), size(글자 크기), fill(제목 띠·선 색), table:{ title, cols, style, rows } }
const tableOf = (a) => ({ x: a.x, y: a.y, size: a.size, color: a.fill, table: a.table });
const tableTag = (a, interactive) => tableSvg(tableOf(a), { id: a.id, interactive, font: FONT });
// 도면 기호: 방위표 { id, kind:'north', style, x, y, w(원 지름), h(=w), rot, fill } · 축척 막대 { id, kind:'scale', x, y(왼쪽 위), w(막대 길이), segs, total, unit, size(글자), fill }
const northTag = (a, interactive) => northSvg({ cx: a.x + a.w / 2, cy: a.y + a.w / 2, size: a.w, color: a.fill, rot: a.rot || 0, style: NORTH_STYLES.includes(a.style) ? a.style : 'circle', id: a.id, interactive });
const scaleTag = (a, interactive) => scaleBarSvg({ x: a.x, y: a.y, w: a.w, segs: a.segs, total: a.total, unit: a.unit, size: a.size || 14, color: a.fill, id: a.id, interactive });
const addTag = (a, interactive) => a.kind === 'dim' ? dimTag(a, interactive) : a.kind === 'north' ? northTag(a, interactive) : a.kind === 'scale' ? scaleTag(a, interactive) : a.kind === 'badge' ? badgeTag(a, interactive) : a.kind === 'callout' ? calloutTag(a, interactive) : a.kind === 'icon' ? iconTag(a, interactive) : a.kind === 'table' ? tableTag(a, interactive) : imgTag(a, interactive);
function insertAdds(svg, _els, adds, interactive, themer) {
  if (!adds || !adds.length) return svg;
  const valid = adds.filter((a) => a && ((a.href && a.kind === 'image') || a.kind === 'badge' || a.kind === 'callout' || a.kind === 'dim' || a.kind === 'icon' || a.kind === 'table' || a.kind === 'north' || a.kind === 'scale'));
  if (!valid.length) return svg;
  const tag = (a) => { const x = addTag(a, interactive); return themer ? themer(x) : x; };
  const back = valid.filter((a) => a.behind).map(tag).join('');
  const front = valid.filter((a) => !a.behind).map(tag).join('');
  let out = svg;
  const end = out.lastIndexOf('</svg>');
  if (front && end >= 0) out = out.slice(0, end) + front + out.slice(end);
  if (back) { // 맨 뒤: 그림 전체를 덮는 배경 사각형 바로 뒤(없으면 <svg> 바로 뒤)
    const first = scanSvg(out).els.find((e) => e.kind === 'e'); // 수정이 입혀진 지금 문자열에서 위치를 다시 찾는다(원래 문자열의 위치는 맞지 않는다)
    const at = first && first.tag === 'rect' && first.self ? first.e : (() => { const m = out.match(/<svg\b[^>]*>/); return m ? m.index + m[0].length : 0; })();
    out = out.slice(0, at) + back + out.slice(at);
  }
  return out;
}

// 여러 줄 글자의 행간: <tspan dy="줄 간격"> 은 간격을, <tspan y="줄 위치"> 는 첫 줄에서 떨어진 거리를 f 배로 한다(첫 줄은 제자리). 값 뒤의 단위(em 등)는 그대로 둔다
export function scaleLineSpacing(inner, f) {
  let base = null;
  return String(inner).replace(/<tspan\b[^>]*>/g, (tag) => {
    let t = tag.replace(/(\sdy=")(-?[\d.]+)([a-z%]*)(")/, (m0, a, v, u, q) => `${a}${r4(parseFloat(v) * f)}${u}${q}`);
    t = t.replace(/(\sy=")(-?[\d.]+)(")/, (m0, a, v, q) => { const y = parseFloat(v); if (base === null) { base = y; return m0; } return `${a}${r2(base + (y - base) * f)}${q}`; });
    return t;
  });
}
// 손으로 고친 이동·크기·회전을 하나의 transform 글자로(원래 transform 앞에 붙는다). 비면 ''
export function opTransformStr(op) {
  if (!op) return '';
  const tStr = op.t && (op.t[0] || op.t[1]) ? `translate(${r2(op.t[0])} ${r2(op.t[1])})` : '';
  const sStr = op.s && op.sc && (op.s[0] !== 1 || op.s[1] !== 1) ? `translate(${r2(op.sc[0])} ${r2(op.sc[1])}) scale(${r4(op.s[0])} ${r4(op.s[1])}) translate(${r2(-op.sc[0])} ${r2(-op.sc[1])})` : '';
  const rStr = op.r && op.rc ? `rotate(${r2(op.r)} ${r2(op.rc[0])} ${r2(op.rc[1])})` : '';
  return [tStr, sStr, rStr].filter(Boolean).join(' ');
}

// 고친 내용을 그림에 입힌다. opts.ids 가 참이면 편집 화면용: 요소마다 data-eid 를 달고, 얇은 선에는 눌리기 쉽게 보이지 않는 굵은 선을 덧댄다.
// opts.theme(스타일 안 id): 내가 새로 넣거나 복사해 붙인 도형(shapes)·부속(adds)에도 같은 안의 색·글꼴을 입힌다. 그림 본체는 호출한 쪽이 이미 입혀서 넘긴다(렌더 → 안 → 수정 순서).
// opts.orig: 편집 화면용 — 안이 입혀진 곳마다 원래 값을 data-o-* 로 남긴다(theme.js 의 restoreOriginals 로 되돌림).
// 반환: { svg, ok(구조가 같아 적용했는가), sig, els }
export function applyEdits(svg0, edits, opts = {}) {
  const baseScan = scanSvg(svg0); const sig = baseScan.sig; const baseLeaf = baseScan.els.filter((e) => e.kind === 'e').length;
  const shapes = edits && edits.shapes && edits.shapes.length ? edits.shapes : null;
  const themer = opts.theme ? (x) => applyTheme(x, opts.theme, { orig: !!opts.orig }) : null;
  const svg = shapes ? appendShapes(svg0, shapes, themer) : svg0;        // 내가 그린 도형은 맨 끝에 붙여 다른 요소 번호가 바뀌지 않게 한다
  const els = shapes ? scanSvg(svg).els : baseScan.els;
  const ok = !edits || edits.sig === undefined || edits.sig === sig;
  const ops = ok && edits ? edits.ops || {} : {};
  const interactive = !!opts.ids;
  const adds = edits && edits.adds && edits.adds.length ? edits.adds : null;
  if (!interactive && !Object.keys(ops).length) return { svg: insertAdds(svg, els, adds, false, themer), ok, sig, els, baseLeaf };
  let out = ''; let pos = 0;
  for (const el of els) {
    const op = ops[el.id];
    if (!op && !interactive) continue;
    const attrs = { ...el.attrs }; let tag = el.tag;
    if (op) {
      if (op.tag && el.self && op.tag !== el.tag) tag = op.tag;
      Object.entries(op.set || {}).forEach(([k, v]) => { if (v === null || v === undefined) delete attrs[k]; else attrs[k] = v; });
      const opStr = opTransformStr(op);
      if (opStr) attrs.transform = [opStr, el.attrs.transform].filter(Boolean).join(' ');
      if (op.del) attrs.display = 'none';
    }
    let extra = '';
    if (interactive) {
      attrs['data-eid'] = el.id;
      if (el.self && ['line', 'path', 'polyline'].includes(tag) && !(op && op.del)) { // 눌리기 쉽게: 같은 모양의 투명한 굵은 선
        const hit = { ...attrs, fill: 'none', stroke: 'transparent', 'stroke-width': '12', 'stroke-dasharray': null, 'stroke-linecap': 'round', 'pointer-events': 'stroke', 'data-hit': '1', 'marker-start': null, 'marker-end': null, 'marker-mid': null, opacity: null };
        Object.keys(hit).forEach((k) => { if (k.startsWith('data-o-')) delete hit[k]; }); // 원래 색 표시는 눌림용 투명 선에 옮기지 않는다(복원 때 투명이 풀리지 않게)
        extra = buildTag(tag, hit, true);
      }
    }
    out += svg.slice(pos, el.s) + buildTag(tag, attrs, el.self) + extra; pos = el.e;
    if (op && op.lh && Math.abs(op.lh - 1) > 0.005 && el.tag === 'text' && !el.self) { // 행간: 이 글자 안쪽 줄(tspan)의 간격만 배수로
      const ci = svg.indexOf('</text>', el.e);
      if (ci > el.e) { out += scaleLineSpacing(svg.slice(el.e, ci), op.lh); pos = ci; }
    }
  }
  out += svg.slice(pos);
  return { svg: insertAdds(out, els, adds, interactive, themer), ok, sig, els, baseLeaf };
}

// ── 고친 내용 만들기(불변) ──
const cloneEdits = (edits, sig) => ({ sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, ...(edits?.adds?.length ? { adds: edits.adds } : {}), ...(edits?.shapes?.length ? { shapes: edits.shapes } : {}) });
function withOp(edits, id, fn, sig) {
  const next = cloneEdits(edits, sig); const cur = next.ops[id] ? { ...next.ops[id], set: { ...(next.ops[id].set || {}) } } : { set: {} };
  const res = fn(cur) || cur; const empty = !res.del && !res.tag && !res.r && !res.s && !res.lh && !(res.t && (res.t[0] || res.t[1])) && !Object.keys(res.set || {}).length;
  if (empty) delete next.ops[id]; else next.ops[id] = res;
  return next;
}
export const editSet = (edits, id, patch, sig) => withOp(edits, id, (o) => { Object.entries(patch).forEach(([k, v]) => { o.set[k] = v; }); return o; }, sig);
export const LH_MIN = 0.5; export const LH_MAX = 3;
export const editLineSpacing = (edits, id, k, sig) => withOp(edits, id, (o) => { const v = Math.min(LH_MAX, Math.max(LH_MIN, Number.isFinite(k) ? k : 1)); if (Math.abs(v - 1) < 0.01) delete o.lh; else o.lh = r2(v); return o; }, sig);
export const editMove = (edits, id, dx, dy, sig) => withOp(edits, id, (o) => { o.t = [r2((o.t?.[0] || 0) + dx), r2((o.t?.[1] || 0) + dy)]; return o; }, sig);
export const editMoveTo = (edits, id, tx, ty, sig) => withOp(edits, id, (o) => { o.t = [r2(tx), r2(ty)]; return o; }, sig);
export const editDelete = (edits, id, sig) => withOp(edits, id, (o) => { o.del = true; return o; }, sig);
export const editRestore = (edits, id, sig) => withOp(edits, id, () => ({ set: {} }), sig);
export const editAsPath = (edits, id, d, drop, sig) => withOp(edits, id, (o) => { o.tag = 'path'; o.set.d = d; (drop || []).forEach((k) => { o.set[k] = null; }); return o; }, sig);
export const editTranslate = (edits, id) => edits?.ops?.[id]?.t || [0, 0];
// 내 이미지 추가·고치기·빼기(불변). img: { href, w, h(원본 크기), box:[x,y,w,h](놓을 자리) }
export function editAddImage(edits, sig, { href, w, h, box, shift = 0 }) { // shift: 여러 장을 한꺼번에 넣을 때 겹치지 않게 비껴 놓는 양
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const bw = box[2]; const bh = box[3]; const ar = (w || 1) / (h || 1);
  let rw = bw * 0.4; let rh = rw / ar; if (rh > bh * 0.6) { rh = bh * 0.6; rw = rh * ar; }
  next.adds.push({ id: `a${n}`, kind: 'image', href, x: r2(box[0] + (bw - rw) / 2 + shift), y: r2(box[1] + (bh - rh) / 2 + shift), w: r2(rw), h: r2(rh), ar: r2(ar * 1000) / 1000, opacity: 1, behind: false });
  return { edits: next, id: `a${n}` };
}
// 넣은 이미지 바꾸기(새 이미지를 옛 상자 안에 비율을 지키며 가장 크게, 자르기는 풀림) / 자르기(보이는 부분이 제자리에 남게 상자가 줄어듦, crop null 이면 해제)
export function editReplaceImage(edits, id, { href, w, h }) {
  const a = (edits?.adds || []).find((q) => q.id === id); if (!a || typeof href !== 'string' || href.length < 9) return edits;
  const ar = Math.round(((w || 1) / (h || 1)) * 1000) / 1000; const [x0, y0, x1, y1] = rotRectKeep([a.x, a.y, a.x + a.w, a.y + a.h], fitInside([a.x, a.y, a.x + a.w, a.y + a.h], ar), a.rot || 0);
  const { orig, crop, ...rest } = a; // eslint-disable-line no-unused-vars
  return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...rest, href, ar, x: x0, y: y0, w: r2(x1 - x0), h: r2(y1 - y0) } : q)) };
}
export function editCropImage(edits, id, { crop, orig, href, w, h }) {
  const a = (edits?.adds || []).find((q) => q.id === id); if (!a || typeof href !== 'string' || href.length < 9) return edits;
  const base = a.orig && a.crop ? a.orig : a.href; const oldCrop = a.orig && a.crop ? a.crop : null; const nc = normCrop(crop);
  const ar = Math.round(((w || 1) / (h || 1)) * 1000) / 1000; const [x0, y0, x1, y1] = rotRectKeep([a.x, a.y, a.x + a.w, a.y + a.h], cropRect([a.x, a.y, a.x + a.w, a.y + a.h], oldCrop, nc), a.rot || 0);
  const { orig: o0, crop: c0, ...rest } = a; // eslint-disable-line no-unused-vars
  return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...rest, href, ar, x: x0, y: y0, w: r2(x1 - x0), h: r2(y1 - y0), ...(nc ? { orig: orig || base, crop: nc } : {}) } : q)) };
}
// ── 회전(°, 시계 방향 +) ──
// 요소: angle = 새 총 각도, geom = { bbox:[x,y,w,h] (브라우저 getBBox, 요소 자기 좌표), t0: 원래 transform 속성 글자 }, about = 여러 개를 함께 돌릴 때 부모 좌표의 중심(없으면 요소 자신의 가운데).
// 돌리기 전 도형의 가운데(원래 변환을 적용한 뒤 좌표)를 중심 c 로 저장하고, 지금 보이는 가운데가 그대로(또는 about 둘레로 돌아간 자리) 남도록 이동(t)을 다시 계산한다 → 크기·모양을 고친 뒤 다시 돌려도 가운데 둘레로 돈다.
export function editRotate(edits, id, angle, geom, sig, about) {
  const op0 = edits?.ops?.[id] || {}; const a0 = op0.r || 0; const a1 = normDeg(angle);
  const bb = geom.bbox; const c = applyMat(parseTransform(geom.t0 || ''), [bb[0] + bb[2] / 2, bb[1] + bb[3] / 2]);
  const cv = applyMat(parseTransform(opTransformStr(op0)), c); // 지금 보이는 가운데(부모 좌표)
  const cn = about ? rotPt(cv, a1 - a0, about) : cv;
  return withOp(edits, id, (o) => {
    if (a1) { o.r = a1; o.rc = [r2(c[0]), r2(c[1])]; } else { delete o.r; delete o.rc; }
    delete o.t; const v = applyMat(parseTransform(opTransformStr(o)), c); // 이동 없이 그렸을 때 가운데가 어디인가 → 모자란 만큼을 이동으로
    const nt = [r2(cn[0] - v[0]), r2(cn[1] - v[1])]; if (nt[0] || nt[1]) o.t = nt;
    return o;
  }, sig);
}
// ── 크기 조절 ──
// 요소: k = [가로 배율, 세로 배율](지금 크기에 곱함), about = 기준점(부모 좌표 — 이 점은 제자리), geom 은 editRotate 와 같다.
// 요소를 자기 가운데(sc) 둘레로 키우고, 보이는 가운데가 about 에서 k 배 떨어진 자리로 가도록 이동(t)을 다시 계산한다. 선 굵기·글자·화살촉이 transform 으로 함께 커진다.
export const SCALE_MIN = 0.05; export const SCALE_MAX = 20;
const clampK = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number.isFinite(v) ? v : 1));
export function editScale(edits, id, k, about, geom, sig) {
  const op0 = edits?.ops?.[id] || {}; const kx = clampK(k[0]); const ky = clampK(k[1]);
  const bb = geom.bbox; const c = applyMat(parseTransform(geom.t0 || ''), [bb[0] + bb[2] / 2, bb[1] + bb[3] / 2]);
  const cv = applyMat(parseTransform(opTransformStr(op0)), c); // 지금 보이는 가운데
  const cn = [about[0] + (cv[0] - about[0]) * kx, about[1] + (cv[1] - about[1]) * ky];
  const s0 = op0.s || [1, 1];
  return withOp(edits, id, (o) => {
    const sx = clampK(s0[0] * kx); const sy = clampK(s0[1] * ky);
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) { delete o.s; delete o.sc; } else { o.s = [r4(sx), r4(sy)]; o.sc = o.sc || [r2(c[0]), r2(c[1])]; }
    delete o.t; const v = applyMat(parseTransform(opTransformStr(o)), c);
    const nt = [r2(cn[0] - v[0]), r2(cn[1] - v[1])]; if (nt[0] || nt[1]) o.t = nt;
    return o;
  }, sig);
}
// 넣은 것(adds)의 크기 조절 조각: 자리는 about 둘레로 가로·세로 따로, 크기·글자는 같은 비율로(둘이 다르면 작은 쪽). 리더선 끝점도 함께. a 는 조절하기 전 값
export function addScalePatch(a, k, about) {
  const kx = clampK(k[0]); const ky = clampK(k[1]); const km = Math.min(kx, ky);
  const px = (x) => r2(about[0] + (x - about[0]) * kx); const py = (y) => r2(about[1] + (y - about[1]) * ky);
  if (a.kind === 'callout') return { x: px(a.x), y: py(a.y), tx: px(a.tx), ty: py(a.ty), size: r2((a.size || 12) * km) };
  if (a.kind === 'dim') return { x: px(a.x), y: py(a.y), tx: px(a.tx), ty: py(a.ty), size: r2((a.size || 14) * km) }; // 치수선: 두 끝점은 기준점 둘레로, 글자 크기는 같은 비율로
  if (a.kind === 'table') return { x: px(a.x), y: py(a.y), size: r2((a.size || 12) * km) };
  if (a.kind === 'scale') { const hh = scaleBarHeight(a.size || 14); const nh = scaleBarHeight((a.size || 14) * km); const cx = px(a.x + a.w / 2); const cy = py(a.y + hh / 2); const w = r2(a.w * kx); return { x: r2(cx - w / 2), y: r2(cy - nh / 2), w, size: r2((a.size || 14) * km) }; }
  if (a.kind === 'image') { const cx = px(a.x + a.w / 2); const cy = py(a.y + a.h / 2); const w = r2(a.w * kx); const h = r2(a.h * ky); return { x: r2(cx - w / 2), y: r2(cy - h / 2), w, h }; }
  const cx = px(a.x + a.w / 2); const cy = py(a.y + a.h / 2); const w = r2(a.w * km); const h = r2((a.h || a.w) * km); // 번호 마커·아이콘·방위표는 모양(원·정사각)을 지킨다
  return { x: r2(cx - w / 2), y: r2(cy - h / 2), w, h };
}
// 내 이미지: x,y,w,h 의 가운데를 중심으로 rot 만큼 그린다. 여러 개를 함께 돌릴 때는 about(그림 좌표) 둘레로 가운데가 옮겨 간다
export function editRotateAdd(edits, id, angle, about) {
  const a = (edits?.adds || []).find((q) => q.id === id); if (!a) return edits;
  if (a.kind === 'scale') { // 축척 막대는 기울지 않는다. 함께 돌릴 때는 막대 가운데를 묶음 중심 둘레로 옮긴다
    if (!about) return edits;
    const hh = scaleBarHeight(a.size || 14); const c = rotPt([a.x + a.w / 2, a.y + hh / 2], normDeg(angle) - (a.rot || 0), about);
    return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...q, x: r2(c[0] - a.w / 2), y: r2(c[1] - hh / 2) } : q)) };
  }
  if (a.kind === 'table') { // 개요표는 기울지 않는다. 함께 돌릴 때는 표 가운데를 묶음 중심 둘레로 옮긴다
    if (!about) return edits;
    const L = tableLayout(tableOf(a)); const c = rotPt([L.x + L.w / 2, L.y + L.h / 2], normDeg(angle) - (a.rot || 0), about);
    return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...q, x: r2(c[0] - L.w / 2), y: r2(c[1] - L.h / 2) } : q)) };
  }
  if (a.kind === 'dim') { // 치수선 하나는 돌리지 않는다(끝점을 끌어 방향을 정한다). 함께 돌릴 때는 두 끝점을 묶음 중심 둘레로 돌린다
    if (!about) return edits; const da = normDeg(angle); const p = rotPt([a.x, a.y], da, about); const q = rotPt([a.tx, a.ty], da, about);
    return { ...edits, adds: edits.adds.map((v) => (v.id === id ? { ...v, x: r2(p[0]), y: r2(p[1]), tx: r2(q[0]), ty: r2(q[1]) } : v)) };
  }
  if (a.kind === 'callout') { // 리더선 라벨은 글이 기울지 않는다. 함께 돌릴 때는 글 상자 가운데와 끝점을 묶음 중심 둘레로 옮긴다
    if (!about) return edits;
    const L = calloutLayout(calloutOf(a)); const da = normDeg(angle) - (a.rot || 0); const c = rotPt([L.x + L.w / 2, L.y + L.h / 2], da, about); const t = rotPt([a.tx, a.ty], da, about);
    return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...q, x: r2(c[0] - L.w / 2), y: r2(c[1] - L.h / 2), tx: r2(t[0]), ty: r2(t[1]) } : q)) };
  }
  const a0 = a.rot || 0; const a1 = normDeg(angle); const c = [a.x + a.w / 2, a.y + a.h / 2]; const cn = about ? rotPt(c, a1 - a0, about) : c;
  const { rot, ...rest } = a; // eslint-disable-line no-unused-vars
  if (a.kind === 'badge' || a.kind === 'icon') return about ? { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...q, x: r2(cn[0] - a.w / 2), y: r2(cn[1] - a.h / 2) } : q)) } : edits; // 번호 마커는 글자가 기울지 않는다(함께 돌릴 때 자리만 옮김)
  return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...rest, x: r2(cn[0] - a.w / 2), y: r2(cn[1] - a.h / 2), ...(a1 ? { rot: a1 } : {}) } : q)) };
}
// 개요표 추가: box=[x,y,w,h](놓을 그림 영역) 왼쪽 가운데 근처에 예시(건축개요) 표. 글자 크기는 그림 크기에 맞춘다
export function editAddTable(edits, sig, { box }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const k = next.adds.filter((a) => a.kind === 'table').length; const size = r2(Math.max(8, Math.min(box[2], box[3]) * 0.026)); const off = (k % 6) * size * 1.6;
  next.adds.push({ id: `a${n}`, kind: 'table', x: r2(box[0] + box[2] * 0.08 + off), y: r2(box[1] + box[3] * 0.3 + off), size, fill: TABLE_COLOR, table: normalizeTable(SAMPLE_TABLE) });
  return { edits: next, id: `a${n}` };
}
// 방위표·축척 막대 추가: box=[x,y,w,h](놓을 그림 영역) 오른쪽 아래 근처에. 크기는 그림 크기에 맞춘다
export function editAddNorth(edits, sig, { box, style = 'circle' }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const d = r2(Math.max(36, Math.min(box[2], box[3]) * 0.09));
  next.adds.push({ id: `a${n}`, kind: 'north', style: NORTH_STYLES.includes(style) ? style : 'circle', x: r2(box[0] + box[2] * 0.88 - d / 2), y: r2(box[1] + box[3] * 0.12 + d * 0.4), w: d, h: d, rot: 0, fill: SYMBOL_COLOR });
  return { edits: next, id: `a${n}` };
}
export function editAddScale(edits, sig, { box }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const size = r2(Math.max(10, Math.min(box[2], box[3]) * 0.022)); const w = r2(Math.max(120, box[2] * 0.22)); const sc = normalizeScale({});
  next.adds.push({ id: `a${n}`, kind: 'scale', x: r2(box[0] + box[2] * 0.06), y: r2(box[1] + box[3] * 0.9 - scaleBarHeight(size)), w, segs: sc.segs, total: sc.total, unit: sc.unit, size, fill: SYMBOL_COLOR });
  return { edits: next, id: `a${n}` };
}
// 아이콘 칩 추가: box=[x,y,w,h](놓을 그림 영역) 한가운데 근처에. 놓을 때마다 조금씩 비껴 놓는다
export function editAddIcon(edits, sig, { box, icon = 'map-pin', shape = 'rounded' }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const k = next.adds.filter((a) => a.kind === 'icon').length; const d = Math.max(28, Math.min(box[2], box[3]) * 0.07); const off = (k % 6) * d * 0.5;
  next.adds.push({ id: `a${n}`, kind: 'icon', icon: ICON_NAMES.includes(icon) ? icon : 'map-pin', shape: CHIP_SHAPES.includes(shape) ? shape : 'rounded', x: r2(box[0] + box[2] / 2 - d / 2 + off), y: r2(box[1] + box[3] / 2 - d / 2 + off), w: r2(d), h: r2(d), fill: '#222222' });
  return { edits: next, id: `a${n}` };
}
// 리더선 라벨 추가: box=[x,y,w,h](놓을 그림 영역) 한가운데 근처에 글 상자와 끝점. 글자 크기는 그림 크기에 맞춘다
// 치수선 추가: box=[x,y,w,h](놓을 그림 영역) 가운데 아래쪽에 가로 치수선 하나. 놓을 때마다 조금씩 비껴 놓는다
export function editAddDim(edits, sig, { box }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const k = next.adds.filter((a) => a.kind === 'dim').length; const size = r2(Math.max(10, Math.min(box[2], box[3]) * 0.028)); const off = (k % 6) * size * 1.8;
  const cx = box[0] + box[2] / 2; const cy = box[1] + box[3] * 0.72 + off;
  next.adds.push({ id: `a${n}`, kind: 'dim', x: r2(cx - box[2] * 0.14), y: r2(cy), tx: r2(cx + box[2] * 0.14), ty: r2(cy), text: DIM_DEFAULT_TEXT, size, fill: DIM_COLOR });
  return { edits: next, id: `a${n}` };
}
export function editAddCallout(edits, sig, { box }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const k = next.adds.filter((a) => a.kind === 'callout').length; const size = r2(Math.max(10, Math.min(box[2], box[3]) * 0.03)); const off = (k % 6) * size * 1.6;
  next.adds.push({ id: `a${n}`, kind: 'callout', x: r2(box[0] + box[2] / 2 + size * 1.5 + off), y: r2(box[1] + box[3] / 2 - size * 3 + off), tx: r2(box[0] + box[2] / 2 - size * 2 + off), ty: r2(box[1] + box[3] / 2 + size * 1.5 + off), title: '제목', desc: '설명을 입력하세요', size, fill: CALLOUT_COLOR, line: 'straight', end: 'dot' });
  return { edits: next, id: `a${n}` };
}
// 끌거나 옮길 때 add 의 자리 변경 조각: 리더선 라벨은 끝점도 함께(PPT 말풍선처럼 통째로). a 는 옮기기 전 값
export const addShiftPatch = (a, dx, dy) => ({ x: r2(a.x + dx), y: r2(a.y + dy), ...(a.kind === 'callout' || a.kind === 'dim' ? { tx: r2(a.tx + dx), ty: r2(a.ty + dy) } : {}) });
// 번호 마커 추가: box=[x,y,w,h](놓을 그림 영역) 한가운데 근처에 검은 원(또는 shape:'square')으로. 번호는 다음 번호가 자동으로 붙는다
export function editAddBadge(edits, sig, { box, shape = 'circle' }) {
  const next = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: [...(edits?.adds || [])] };
  let n = 1; while (next.adds.some((a) => a.id === `a${n}`)) n += 1;
  const k = next.adds.filter((a) => a.kind === 'badge').length; const d = Math.max(16, Math.min(box[2], box[3]) * 0.045); const off = (k % 6) * d * 0.9;
  next.adds.push({ id: `a${n}`, kind: 'badge', shape: shape === 'square' ? 'square' : 'circle', x: r2(box[0] + box[2] / 2 - d / 2 + off), y: r2(box[1] + box[3] / 2 - d / 2 + off), w: r2(d), h: r2(d), text: '1', fill: BADGE_COLOR, auto: true });
  return { edits: editRenumber(next), id: `a${n}` };
}
// 자동 번호 마커에 그림 순서대로 1, 2, 3… 을 다시 매긴다(직접 고친 번호는 그대로, 그 번호는 건너뜀)
export function editRenumber(edits) {
  const adds = edits?.adds || []; const idx = adds.map((a, i) => (a.kind === 'badge' ? i : -1)).filter((i) => i >= 0); if (!idx.length) return edits;
  const nums = assignNumbers(idx.map((i) => ({ auto: adds[i].auto !== false, text: adds[i].text })));
  return { ...edits, adds: adds.map((a, i) => { const j = idx.indexOf(i); return j >= 0 ? { ...a, text: nums[j] } : a; }) };
}
export const editUpdateAdd = (edits, id, patch) => ({ ...edits, adds: (edits?.adds || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) });
export const editRemoveAdd = (edits, id, sig) => { const gone = (edits?.adds || []).find((a) => a.id === id); const n = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: (edits?.adds || []).filter((a) => a.id !== id) }; if (!n.adds.length) delete n.adds; return gone && gone.kind === 'badge' ? editRenumber(n) : n; }; // 번호 마커를 지우면 뒤 번호를 다시 맞춘다

// ── 선 종류 ──
export const DASH_PRESETS = { solid: { label: '실선', dash: null, cap: null }, dashed: { label: '파선', dash: '9 6', cap: null }, dotted: { label: '점선', dash: '1.5 6', cap: 'round' }, dashdot: { label: '일점쇄선', dash: '14 5 2 5', cap: null }, dots: { label: '굵은 점(둥근 점선)', dash: '0.1 8.5', cap: 'round' } };
// 파선 간격: 선 종류의 '쉬는 칸'(홀수 번째 숫자)만 배율로 늘리고 줄인다(선 조각 길이는 그대로). 1 = 선 종류의 기본 간격
export const DASH_GAP_MIN = 0.3; export const DASH_GAP_MAX = 4;
const dashNums = (v) => String(v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((q) => Number.isFinite(q));
export const clampGap = (g) => Math.min(DASH_GAP_MAX, Math.max(DASH_GAP_MIN, Number(g) > 0 ? Number(g) : 1));
// 지금 선 모양이 어느 종류(간격을 늘리고 줄인 것 포함)이고 간격 배율이 얼마인지
export function dashGapOf(v) {
  const n = dashNums(v); if (!n.length) return { kind: 'solid', gap: 1 };
  for (const [kind, p] of Object.entries(DASH_PRESETS)) {
    if (!p.dash) continue; const b = dashNums(p.dash); if (b.length !== n.length) continue;
    let ok = true; let sum = 0; let cnt = 0;
    for (let i = 0; i < b.length && ok; i++) { if (i % 2 === 0) { if (Math.abs(n[i] - b[i]) > 0.02) ok = false; } else if (b[i] > 0 && n[i] >= 0) { sum += n[i] / b[i]; cnt++; } else ok = false; }
    if (ok && cnt) return { kind, gap: Math.round((sum / cnt) * 100) / 100 };
  }
  return { kind: 'custom', gap: 1 };
}
export function dashKind(v) {
  const s = String(v ?? '').trim(); if (!s || s === 'none') return 'solid';
  return dashGapOf(s).kind;
}
export const dashWithGap = (kind, gap) => { const p = DASH_PRESETS[kind]; if (!p || !p.dash) return {}; const g = clampGap(gap); return { 'stroke-dasharray': dashNums(p.dash).map((x, i) => (i % 2 ? Math.round(x * g * 100) / 100 : x)).join(' '), 'stroke-linecap': p.cap }; };
// 선 종류에 없는 파선('8 6' 같은 값)도 처음 모습(base)을 기준으로 간격을 배율로 바꾼다. 홀수 개 값은 SVG 규칙대로 되풀이해 짝수로 맞춘다
export const dashNumsEven = (v) => { const n = dashNums(v); return n.length && n.length % 2 ? n.concat(n) : n; };
export const dashSameParts = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => i % 2 || Math.abs(x - b[i]) < 0.02); // 선 조각 길이가 같은지(간격만 다른지)
export const dashGapFactor = (n, base) => { let sum = 0; let c = 0; for (let i = 1; i < base.length; i += 2) { if (base[i] > 0) { sum += n[i] / base[i]; c++; } } return c ? Math.round((sum / c) * 100) / 100 : 1; };
export const dashScaled = (base, gap) => base.map((x, i) => (i % 2 ? Math.round(x * clampGap(gap) * 100) / 100 : x)).join(' ');
export const dashPatch = (kind, gap = 1) => { const p = DASH_PRESETS[kind]; if (!p) return {}; return p.dash && gap !== 1 ? dashWithGap(kind, gap) : { 'stroke-dasharray': p.dash, 'stroke-linecap': p.cap }; };

// ── 경로(path d) 해석: 모든 명령을 절대 좌표의 M L C Q A Z 로 바꾼다 ──
// 마디: { c:'M|L|C|Q|A|Z', p:[x,y](끝점), c1, c2(제어점), a:[rx,ry,회전,큰호,방향](호) }
export function parsePath(d) {
  const toks = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const segs = []; let i = 0; let cmd = ''; let cx = 0; let cy = 0; let sx = 0; let sy = 0; let prevC = null; let prevQ = null;
  const num = () => parseFloat(toks[i++]);
  const has = () => i < toks.length && !/^[A-Za-z]$/.test(toks[i]);
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++]; else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase(); const ox = rel ? cx : 0; const oy = rel ? cy : 0;
    if (C === 'Z') { segs.push({ c: 'Z', p: [sx, sy] }); cx = sx; cy = sy; prevC = prevQ = null; continue; }
    if (!has()) break;
    if (C === 'M') { const x = num() + ox; const y = num() + oy; segs.push({ c: 'M', p: [x, y] }); cx = sx = x; cy = sy = y; prevC = prevQ = null; }
    else if (C === 'L') { const x = num() + ox; const y = num() + oy; segs.push({ c: 'L', p: [x, y] }); cx = x; cy = y; prevC = prevQ = null; }
    else if (C === 'H') { const x = num() + ox; segs.push({ c: 'L', p: [x, cy] }); cx = x; prevC = prevQ = null; }
    else if (C === 'V') { const y = num() + oy; segs.push({ c: 'L', p: [cx, y] }); cy = y; prevC = prevQ = null; }
    else if (C === 'C') { const c1 = [num() + ox, num() + oy]; const c2 = [num() + ox, num() + oy]; const p = [num() + ox, num() + oy]; segs.push({ c: 'C', c1, c2, p }); cx = p[0]; cy = p[1]; prevC = c2; prevQ = null; }
    else if (C === 'S') { const c1 = prevC ? [2 * cx - prevC[0], 2 * cy - prevC[1]] : [cx, cy]; const c2 = [num() + ox, num() + oy]; const p = [num() + ox, num() + oy]; segs.push({ c: 'C', c1, c2, p }); cx = p[0]; cy = p[1]; prevC = c2; prevQ = null; }
    else if (C === 'Q') { const c1 = [num() + ox, num() + oy]; const p = [num() + ox, num() + oy]; segs.push({ c: 'Q', c1, p }); cx = p[0]; cy = p[1]; prevQ = c1; prevC = null; }
    else if (C === 'T') { const c1 = prevQ ? [2 * cx - prevQ[0], 2 * cy - prevQ[1]] : [cx, cy]; const p = [num() + ox, num() + oy]; segs.push({ c: 'Q', c1, p }); cx = p[0]; cy = p[1]; prevQ = c1; prevC = null; }
    else if (C === 'A') { const a = [num(), num(), num(), num(), num()]; const p = [num() + ox, num() + oy]; segs.push({ c: 'A', a, p }); cx = p[0]; cy = p[1]; prevC = prevQ = null; }
    else break;
  }
  return segs;
}
const f = (v) => String(r2(v));
export function pathD(segs) {
  return segs.map((s) => {
    if (s.c === 'Z') return 'Z';
    if (s.c === 'C') return `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`;
    if (s.c === 'Q') return `Q${f(s.c1[0])} ${f(s.c1[1])} ${f(s.p[0])} ${f(s.p[1])}`;
    if (s.c === 'A') return `A${s.a.map(f).join(' ')} ${f(s.p[0])} ${f(s.p[1])}`;
    return `${s.c}${f(s.p[0])} ${f(s.p[1])}`;
  }).join('');
}
// 고를 수 있는 마디(Z 는 제외). 반환: [{ i(segs 번호), p }]
export const pathNodes = (segs) => segs.map((s, i) => ({ i, p: s.p, c: s.c })).filter((n) => n.c !== 'Z');
const addv = (p, d) => [p[0] + d[0], p[1] + d[1]];
const clonePath = (segs) => segs.map((s) => ({ ...s, p: [...s.p], ...(s.c1 ? { c1: [...s.c1] } : {}), ...(s.c2 ? { c2: [...s.c2] } : {}), ...(s.a ? { a: [...s.a] } : {}) }));
// 마디를 옮긴다(그 마디로 들어오고 나가는 곡선 제어점도 함께 따라간다)
export function pathMoveNode(segs, i, d) {
  const o = clonePath(segs); const s = o[i]; if (!s || s.c === 'Z') return o;
  s.p = addv(s.p, d); if (s.c === 'C') s.c2 = addv(s.c2, d);
  const nx = o[i + 1]; if (nx && nx.c === 'C') nx.c1 = addv(nx.c1, d);
  if (s.c === 'M') { for (let k = i + 1; k < o.length && o[k].c !== 'M'; k++) if (o[k].c === 'Z') o[k].p = [...s.p]; }
  return o;
}
export function pathMoveCtrl(segs, i, which, d) {
  const o = clonePath(segs); const s = o[i]; if (!s || !s[which]) return o; s[which] = addv(s[which], d); return o;
}
// 구간 i(끝점이 마디 i) 를 직선 ↔ 곡선으로 바꾼다. 직선이면 휘는 곡선(Q)으로, 곡선이면 직선으로
export function pathToggleCurve(segs, i) {
  const o = clonePath(segs); const s = o[i]; const prev = o[i - 1]; if (!s || !prev || s.c === 'M' || s.c === 'Z') return o;
  const a = prev.p; const z = s.p;
  if (s.c === 'L') { const L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1; const nx = -(z[1] - a[1]) / L; const ny = (z[0] - a[0]) / L; o[i] = { c: 'Q', c1: [(a[0] + z[0]) / 2 + nx * L * 0.25, (a[1] + z[1]) / 2 + ny * L * 0.25], p: [...z] }; }
  else o[i] = { c: 'L', p: [...z] };
  return o;
}
// 가장 긴 구간의 한가운데에 마디를 더한다(곡선은 그 모양 그대로 둘로 나눈다)
export function pathAddNode(segs) {
  const o = clonePath(segs); let k = -1; let best = -1;
  for (let i = 1; i < o.length; i++) {
    const s = o[i]; const a = o[i - 1].p; if (s.c === 'M' || s.c === 'Z' || s.c === 'A') continue;
    const L = Math.hypot(s.p[0] - a[0], s.p[1] - a[1]); if (L > best) { best = L; k = i; }
  }
  if (k < 0) return o;
  const s = o[k]; const a = o[k - 1].p; const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
  if (s.c === 'L') o.splice(k, 1, { c: 'L', p: mid(a, s.p) }, { c: 'L', p: [...s.p] });
  else if (s.c === 'Q') { const q0 = mid(a, s.c1); const q1 = mid(s.c1, s.p); const m = mid(q0, q1); o.splice(k, 1, { c: 'Q', c1: q0, p: m }, { c: 'Q', c1: q1, p: [...s.p] }); }
  else { const p01 = mid(a, s.c1); const p12 = mid(s.c1, s.c2); const p23 = mid(s.c2, s.p); const p012 = mid(p01, p12); const p123 = mid(p12, p23); const m = mid(p012, p123); o.splice(k, 1, { c: 'C', c1: p01, c2: p012, p: m }, { c: 'C', c1: p123, c2: p23, p: [...s.p] }); }
  return o;
}
// 마디 i 를 뺀다(둘 이하로는 줄지 않는다)
export function pathDelNode(segs, i) {
  const o = clonePath(segs); if (pathNodes(o).length <= 2 || !o[i] || o[i].c === 'Z') return o;
  if (o[i].c === 'M') { const nx = o[i + 1]; if (!nx || nx.c === 'Z' || nx.c === 'M') return o; o.splice(i, 2, { c: 'M', p: [...nx.p] }); return o; }
  o.splice(i, 1); return o;
}

// ── 꼭짓점 목록(points="x,y x,y …") ──
export const parsePoints = (s) => (String(s || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number).reduce((a, v, i, all) => { if (i % 2 === 0 && i + 1 < all.length) a.push([v, all[i + 1]]); return a; }, []);
export const pointsStr = (pts) => pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');

// 직선(line)을 휘는 곡선 경로로 바꾸는 d 값
export function lineToCurveD(x1, y1, x2, y2, bend = 0.25) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1; const nx = -(y2 - y1) / L; const ny = (x2 - x1) / L;
  return `M${f(x1)} ${f(y1)}Q${f((x1 + x2) / 2 + nx * L * bend)} ${f((y1 + y2) / 2 + ny * L * bend)} ${f(x2)} ${f(y2)}`;
}
