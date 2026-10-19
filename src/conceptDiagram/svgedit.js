// 어떤 방식으로 만든 다이어그램이든(평면 다이어그램·배치 개념도·매스 과정도·버블도·층별 조닝도…) 그림 속 도형을 하나씩 골라
// 색·위치·곡선·선 종류를 고칠 수 있게 하는 순수 함수 모음. DOM 없이 문자열로만 동작해서 점검이 쉽다.
//
// 고친 내용(edits)은 '요소 번호 → 바꾼 값'으로 따로 저장하고, 그림을 다시 그릴 때(예: 글자를 고쳤을 때) 같은 번호의 요소에 다시 입힌다.
//   edits = { sig, ops: { e12: { t:[dx,dy], set:{ fill:'#fff', d:'M…', 'stroke-dasharray':'9 6' }, del:true, tag:'path' } } }
//   sig = 그림 구조(요소 종류의 순서)의 지문. 구조가 달라지면(다른 그림이 되면) 옛 수정은 적용하지 않는다.

import { cropRect, fitInside, normCrop } from './imgutil';

const LEAF = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text']);
const SKIP = new Set(['defs', 'marker', 'pattern', 'clipPath', 'mask', 'symbol', 'style', 'linearGradient', 'radialGradient', 'filter', 'title', 'desc', 'foreignObject']);
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR_RE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ATTR_ESC = (v) => String(v).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const r2 = (v) => Math.round(Number(v) * 100) / 100;

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
export function appendShapes(svg, shapes) {
  if (!shapes || !shapes.length) return svg;
  const end = svg.lastIndexOf('</svg>'); if (end < 0) return svg;
  return svg.slice(0, end) + shapes.map(shapeSvg).join('') + svg.slice(end);
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
const addTag = (a, interactive) => `<image href="${ATTR_ESC(a.href)}" x="${r2(a.x)}" y="${r2(a.y)}" width="${r2(a.w)}" height="${r2(a.h)}" preserveAspectRatio="none"${a.opacity < 1 ? ` opacity="${a.opacity}"` : ''}${interactive ? ` data-eid="${a.id}"` : ''}/>`;
function insertAdds(svg, _els, adds, interactive) {
  if (!adds || !adds.length) return svg;
  const valid = adds.filter((a) => a && a.href && a.kind === 'image');
  if (!valid.length) return svg;
  const back = valid.filter((a) => a.behind).map((a) => addTag(a, interactive)).join('');
  const front = valid.filter((a) => !a.behind).map((a) => addTag(a, interactive)).join('');
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

// 고친 내용을 그림에 입힌다. opts.ids 가 참이면 편집 화면용: 요소마다 data-eid 를 달고, 얇은 선에는 눌리기 쉽게 보이지 않는 굵은 선을 덧댄다.
// 반환: { svg, ok(구조가 같아 적용했는가), sig, els }
export function applyEdits(svg0, edits, opts = {}) {
  const baseScan = scanSvg(svg0); const sig = baseScan.sig; const baseLeaf = baseScan.els.filter((e) => e.kind === 'e').length;
  const shapes = edits && edits.shapes && edits.shapes.length ? edits.shapes : null;
  const svg = shapes ? appendShapes(svg0, shapes) : svg0;                // 내가 그린 도형은 맨 끝에 붙여 다른 요소 번호가 바뀌지 않게 한다
  const els = shapes ? scanSvg(svg).els : baseScan.els;
  const ok = !edits || edits.sig === undefined || edits.sig === sig;
  const ops = ok && edits ? edits.ops || {} : {};
  const interactive = !!opts.ids;
  const adds = edits && edits.adds && edits.adds.length ? edits.adds : null;
  if (!interactive && !Object.keys(ops).length) return { svg: insertAdds(svg, els, adds, false), ok, sig, els, baseLeaf };
  let out = ''; let pos = 0;
  for (const el of els) {
    const op = ops[el.id];
    if (!op && !interactive) continue;
    const attrs = { ...el.attrs }; let tag = el.tag;
    if (op) {
      if (op.tag && el.self && op.tag !== el.tag) tag = op.tag;
      Object.entries(op.set || {}).forEach(([k, v]) => { if (v === null || v === undefined) delete attrs[k]; else attrs[k] = v; });
      if (op.t && (op.t[0] || op.t[1])) attrs.transform = `translate(${r2(op.t[0])} ${r2(op.t[1])})${el.attrs.transform ? ` ${el.attrs.transform}` : ''}`;
      if (op.del) attrs.display = 'none';
    }
    let extra = '';
    if (interactive) {
      attrs['data-eid'] = el.id;
      if (el.self && ['line', 'path', 'polyline'].includes(tag) && !(op && op.del)) { // 눌리기 쉽게: 같은 모양의 투명한 굵은 선
        const hit = { ...attrs, fill: 'none', stroke: 'transparent', 'stroke-width': '12', 'stroke-dasharray': null, 'stroke-linecap': 'round', 'pointer-events': 'stroke', 'data-hit': '1', 'marker-start': null, 'marker-end': null, 'marker-mid': null, opacity: null };
        extra = buildTag(tag, hit, true);
      }
    }
    out += svg.slice(pos, el.s) + buildTag(tag, attrs, el.self) + extra; pos = el.e;
  }
  out += svg.slice(pos);
  return { svg: insertAdds(out, els, adds, interactive), ok, sig, els, baseLeaf };
}

// ── 고친 내용 만들기(불변) ──
const cloneEdits = (edits, sig) => ({ sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, ...(edits?.adds?.length ? { adds: edits.adds } : {}), ...(edits?.shapes?.length ? { shapes: edits.shapes } : {}) });
function withOp(edits, id, fn, sig) {
  const next = cloneEdits(edits, sig); const cur = next.ops[id] ? { ...next.ops[id], set: { ...(next.ops[id].set || {}) } } : { set: {} };
  const res = fn(cur) || cur; const empty = !res.del && !res.tag && !(res.t && (res.t[0] || res.t[1])) && !Object.keys(res.set || {}).length;
  if (empty) delete next.ops[id]; else next.ops[id] = res;
  return next;
}
export const editSet = (edits, id, patch, sig) => withOp(edits, id, (o) => { Object.entries(patch).forEach(([k, v]) => { o.set[k] = v; }); return o; }, sig);
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
  const ar = Math.round(((w || 1) / (h || 1)) * 1000) / 1000; const [x0, y0, x1, y1] = fitInside([a.x, a.y, a.x + a.w, a.y + a.h], ar);
  const { orig, crop, ...rest } = a; // eslint-disable-line no-unused-vars
  return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...rest, href, ar, x: x0, y: y0, w: r2(x1 - x0), h: r2(y1 - y0) } : q)) };
}
export function editCropImage(edits, id, { crop, orig, href, w, h }) {
  const a = (edits?.adds || []).find((q) => q.id === id); if (!a || typeof href !== 'string' || href.length < 9) return edits;
  const base = a.orig && a.crop ? a.orig : a.href; const oldCrop = a.orig && a.crop ? a.crop : null; const nc = normCrop(crop);
  const ar = Math.round(((w || 1) / (h || 1)) * 1000) / 1000; const [x0, y0, x1, y1] = cropRect([a.x, a.y, a.x + a.w, a.y + a.h], oldCrop, nc);
  const { orig: o0, crop: c0, ...rest } = a; // eslint-disable-line no-unused-vars
  return { ...edits, adds: edits.adds.map((q) => (q.id === id ? { ...rest, href, ar, x: x0, y: y0, w: r2(x1 - x0), h: r2(y1 - y0), ...(nc ? { orig: orig || base, crop: nc } : {}) } : q)) };
}
export const editUpdateAdd = (edits, id, patch) => ({ ...edits, adds: (edits?.adds || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) });
export const editRemoveAdd = (edits, id, sig) => { const n = { ...(edits || {}), sig: edits?.sig ?? sig, ops: { ...(edits?.ops || {}) }, adds: (edits?.adds || []).filter((a) => a.id !== id) }; if (!n.adds.length) delete n.adds; return n; };

// ── 선 종류 ──
export const DASH_PRESETS = { solid: { label: '실선', dash: null, cap: null }, dashed: { label: '파선', dash: '9 6', cap: null }, dotted: { label: '점선', dash: '1.5 6', cap: 'round' }, dashdot: { label: '일점쇄선', dash: '14 5 2 5', cap: null }, dots: { label: '굵은 점(둥근 점선)', dash: '0.1 8.5', cap: 'round' } };
export function dashKind(v) {
  const s = String(v ?? '').trim(); if (!s || s === 'none') return 'solid';
  const hit = Object.entries(DASH_PRESETS).find(([, p]) => p.dash && p.dash.replace(/\s+/g, ' ') === s.replace(/[\s,]+/g, ' '));
  return hit ? hit[0] : 'custom';
}
export const dashPatch = (kind) => { const p = DASH_PRESETS[kind]; return p ? { 'stroke-dasharray': p.dash, 'stroke-linecap': p.cap } : {}; };

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
