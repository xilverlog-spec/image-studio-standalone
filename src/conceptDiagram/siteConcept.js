import { iconGlyph } from './icons';
import { normalizeShapes } from './layout2d';

// 배치 개념도 렌더러 — AI(또는 사용자)가 정한 구조(JSON)를 받아 SVG 문자열을 그린다.
// 좌표를 AI에게 맡기지 않는다: 위치는 9방위 앵커(center/n/ne/e/se/s/sw/w/nw)로만 지정하고,
// 실제 좌표 계산은 여기서 한다. 글자는 전부 <text>라서 깨지지 않고 일러스트레이터에서도 편집된다.

export const ANCHORS = ['center', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const SITE_SHAPES = ['blob', 'wedge', 'rect'];
export const OVERLAY_KINDS = ['flow', 'zone', 'marker', 'cycle', 'arrow', 'label'];

const ANCHOR_XY = {
  center: [0.5, 0.5], n: [0.5, 0.2], ne: [0.78, 0.28], e: [0.86, 0.5], se: [0.78, 0.74],
  s: [0.5, 0.82], sw: [0.22, 0.74], w: [0.14, 0.5], nw: [0.22, 0.28],
};
const SHAPES = {
  blob: [[0.2, 0.04], [0.8, 0.04], [0.98, 0.3], [0.98, 0.7], [0.8, 0.96], [0.2, 0.96], [0.02, 0.7], [0.02, 0.3]],
  wedge: [[0.08, 0.14], [0.92, 0.04], [0.97, 0.78], [0.48, 0.98], [0.03, 0.72]],
  rect: [[0.04, 0.08], [0.96, 0.08], [0.96, 0.92], [0.04, 0.92]],
};
const BUILDINGS = [
  [0.12, 0.2, 0.2, 0.15], [0.68, 0.17, 0.2, 0.15], [0.09, 0.64, 0.2, 0.17],
  [0.7, 0.63, 0.2, 0.17], [0.4, 0.1, 0.17, 0.1], [0.4, 0.78, 0.17, 0.1],
];

export const PANEL_W = 430;
export const PANEL_H = 380;
const SITE = { x: 82, y: 86, w: 266, h: 250 };
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pt = (anchor) => {
  const a = ANCHOR_XY[anchor] || ANCHOR_XY.center;
  return [SITE.x + a[0] * SITE.w, SITE.y + a[1] * SITE.h];
};
const hexOk = (c, d) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : d);

// "누구나 함께 즐기는 {플로우 허브}" → 중괄호 부분만 강조색
const headingSvg = (heading, accent, cx, y) => {
  const parts = String(heading || '').split(/(\{[^}]*\})/).filter(Boolean);
  const spans = parts.map((p) => (p.startsWith('{') && p.endsWith('}')
    ? `<tspan fill="${accent}" font-weight="800" font-size="21">${esc(p.slice(1, -1))}</tspan>`
    : `<tspan>${esc(p)}</tspan>`)).join('');
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="700" fill="#2b2f36">${spans}</text>`;
};

const bez = (p0, c1, c2, p1, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
};

const polyCentroid = (pts) => {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; const c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
  return Math.abs(a) < 1e-6 ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [cx / (3 * a), cy / (3 * a)];
};
const hullOf = (pts) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; p.forEach((q) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  const up = []; [...p].reverse().forEach((q) => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
  return lo.slice(0, -1).concat(up.slice(0, -1));
};

export function renderSitePanel(panel, ox, oy, uid, baseImage, base) {
  const accent = hexOk(panel.accent, '#F28C28');
  const defs = [];
  const parts = [];
  const shape = SHAPES[panel.siteShape] || SHAPES.blob;
  const poly = shape.map(([x, y]) => `${(SITE.x + x * SITE.w).toFixed(1)},${(SITE.y + y * SITE.h).toFixed(1)}`).join(' ');

  // 읽은 배치(건물·대지경계)가 있으면 그 모양을 대지 칸에 맞춰 그리고, 위치는 건물 id / [x,y] / 앵커로 지정한다
  let fit = null; const byId = {};
  if (Array.isArray(base) && base.length) {
    const core = base.filter((s) => s.kind === 'boundary' || s.kind === 'building' || s.kind === 'room' || s.kind === 'other');  // 도로·녹지는 크기 맞춤에서 뺀다
    const all = (core.length ? core : base).flatMap((s) => s.pts); const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const pad = 10; const k = Math.min((SITE.w - pad * 2) / (maxX - minX || 1), (SITE.h - pad * 2) / (maxY - minY || 1));
    const offX = SITE.x + (SITE.w - (maxX - minX) * k) / 2 - minX * k; const offY = SITE.y + (SITE.h - (maxY - minY) * k) / 2 - minY * k;
    fit = { T: (p) => [p[0] * k + offX, p[1] * k + offY], box: [minX * k + offX, minY * k + offY, maxX * k + offX, maxY * k + offY] };
    base.forEach((s) => { byId[s.id] = s; });
  }
  const P = (v) => {
    if (fit && Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(Number(n)))) return fit.T([Number(v[0]), Number(v[1])]);
    if (fit && typeof v === 'string' && byId[v]) return fit.T(polyCentroid(byId[v].pts));
    if (fit) { const a = ANCHOR_XY[v] || ANCHOR_XY.center; const [x0, y0, x1, y1] = fit.box; return [x0 + a[0] * (x1 - x0), y0 + a[1] * (y1 - y0)]; }
    return pt(v);
  };

  // 바닥: 조경띠 + 대지
  if (fit) {
    const fp = (pts) => pts.map((p) => fit.T(p).map((v) => v.toFixed(1)).join(',')).join(' ');
    const bld = base.filter((s) => s.kind === 'building' || s.kind === 'room' || s.kind === 'other');
    const bnd = base.filter((s) => s.kind === 'boundary').sort((a, b) => b.pts.length - a.pts.length)[0];
    const outline = bnd ? bnd.pts : hullOf(bld.flatMap((s) => s.pts));
    parts.push(`<polygon points="${fp(outline)}" fill="#E4EFD9" stroke="#CFE3BE" stroke-width="18" stroke-linejoin="round"/>`);
    parts.push(`<polygon points="${fp(outline)}" fill="#F6F7F4" stroke="#9AA0A6" stroke-width="1" stroke-dasharray="5 3" stroke-linejoin="round"/>`);
    base.filter((s) => s.kind === 'green' || s.kind === 'water').forEach((s) => parts.push(`<polygon points="${fp(s.pts)}" fill="${s.kind === 'water' ? '#DCEAF3' : '#E4EFD9'}"/>`));
    bld.forEach((s) => parts.push(`<polygon points="${fp(s.pts.map(([x, y]) => [x + 0.6, y + 0.8]))}" fill="#BFC5CC"/>`));
    bld.forEach((s) => parts.push(`<polygon points="${fp(s.pts)}" fill="#DADDE2" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`));
    bld.forEach((s) => { if (s.name) { const [cx, cy] = fit.T(polyCentroid(s.pts)); parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8.5" fill="#7b828a">${esc(s.name)}</text>`); } });
  } else {
    parts.push(`<polygon points="${poly}" fill="#E4EFD9" stroke="#CFE3BE" stroke-width="16" stroke-linejoin="round"/>`);
    parts.push(`<polygon points="${poly}" fill="#F6F7F4" stroke="#D9DDD2" stroke-width="1.2"/>`);
  }
  if (baseImage && !fit) {
    defs.push(`<clipPath id="${uid}clip"><polygon points="${poly}"/></clipPath>`);
    parts.push(`<image href="${baseImage}" x="${SITE.x}" y="${SITE.y}" width="${SITE.w}" height="${SITE.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}clip)"/>`);
  } else if (!fit) {
    BUILDINGS.forEach(([bx, by, bw, bh]) => {
      const x = SITE.x + bx * SITE.w; const y = SITE.y + by * SITE.h; const w = bw * SITE.w; const h = bh * SITE.h;
      parts.push(`<rect x="${(x + 3).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#BFC5CC"/>`);
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#E1E4E8" stroke="#CDD2D8" stroke-width="0.8"/>`);
    });
  }

  const overlays = Array.isArray(panel.overlays) ? panel.overlays : [];
  const markers = [];
  let gi = 0;

  overlays.forEach((o) => {
    const color = hexOk(o.color, accent);
    if (o.kind === 'flow') {
      const from = P(o.from || 'center');
      const targets = (Array.isArray(o.to) ? o.to : [o.to]).filter(Boolean);
      const gid = `${uid}g${gi++}`;
      defs.push(`<radialGradient id="${gid}"><stop offset="0%" stop-color="${color}" stop-opacity="0.62"/><stop offset="55%" stop-color="${color}" stop-opacity="0.22"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
      parts.push(`<circle cx="${from[0].toFixed(1)}" cy="${from[1].toFixed(1)}" r="78" fill="url(#${gid})"/>`);
      targets.forEach((tname, i) => {
        const p1 = P(tname);
        const dx = p1[0] - from[0]; const dy = p1[1] - from[1]; const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; const ny = dx / len; const off = len * 0.2 * (i % 2 ? -1 : 1);
        const c1 = [from[0] + dx * 0.33 + nx * off, from[1] + dy * 0.33 + ny * off];
        const c2 = [from[0] + dx * 0.66 - nx * off, from[1] + dy * 0.66 - ny * off];
        const d = `M${from[0].toFixed(1)} ${from[1].toFixed(1)} C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
        // 번지는 굵은 띠: 바깥(넓고 옅음) → 안(좁고 진함), 가운데에 가는 진한 선
        parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.14" stroke-width="30" stroke-linecap="round"/>`);
        parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.30" stroke-width="17" stroke-linecap="round"/>`);
        parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="7" stroke-linecap="round"/>`);
        parts.push(`<path d="${d}" fill="none" stroke="#FFE2B8" stroke-opacity="0.55" stroke-width="2.2" stroke-linecap="round"/>`);
        // 길을 걷는 사람들(머리 + 몸)
        [0.2, 0.42, 0.62, 0.84].forEach((t, k) => {
          const [px, py] = bez(from, c1, c2, p1, t + (i % 3) * 0.02);
          const sx = (k % 2 ? 6 : -6); const sy = (k % 2 ? -3 : 3);
          parts.push(`<g transform="translate(${(px + sx).toFixed(1)} ${(py + sy).toFixed(1)})"><circle cx="0" cy="-8.5" r="2.4" fill="#4a3426"/><path d="M-3.4 -5.6 Q0 -7 3.4 -5.6 L2.6 2.6 L0.9 2.6 L0 -1 L-0.9 2.6 L-2.6 2.6 Z" fill="#4a3426"/></g>`);
        });
      });
    } else if (o.kind === 'zone') {
      const [x, y] = P(o.anchor || 'center');
      const sz = { s: [34, 24], m: [52, 36], l: [76, 52] }[o.size] || [52, 36];
      const pid = `${uid}p${gi++}`;
      if (o.pattern === 'dots') {
        defs.push(`<pattern id="${pid}" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.7" fill="${color}"/></pattern>`);
      } else {
        defs.push(`<pattern id="${pid}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="2"/></pattern>`);
      }
      const fill = o.pattern === 'fill' ? color : `url(#${pid})`;
      parts.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${sz[0]}" ry="${sz[1]}" transform="rotate(-18 ${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}" fill-opacity="${o.pattern === 'fill' ? 0.3 : 0.85}" stroke="${color}" stroke-width="1.4" stroke-dasharray="${o.pattern === 'fill' ? '0' : '4 3'}"/>`);
    } else if (o.kind === 'cycle') {
      const [x, y] = P(o.anchor || 'center');
      const aid = `${uid}a${gi++}`;
      defs.push(`<marker id="${aid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker>`);
      // 소용돌이: 반지름이 커지며 도는 나선 3겹(굵기·투명도를 달리해 번지는 느낌) + 가운데 점과 작은 거품
      const spiral = (r0, r1, turns, rot, w, op, arrow) => {
        const n = 60; const pts = [];
        for (let k = 0; k <= n; k++) { const t = k / n; const r = r0 + (r1 - r0) * t; const a = rot + t * turns * 2 * Math.PI; pts.push([x + r * Math.cos(a), y + r * Math.sin(a) * 0.82]); }
        return `<path d="M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${arrow ? ` marker-end="url(#${aid})"` : ''}/>`;
      };
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="46" fill="${color}" fill-opacity="0.10"/>`);
      parts.push(spiral(6, 40, 2.1, 0.2, 12, 0.18, false));
      parts.push(spiral(6, 40, 2.1, 0.2, 6.5, 0.45, false));
      parts.push(spiral(6, 38, 2.1, 0.2, 2.6, 0.95, true));
      parts.push(spiral(9, 30, 1.6, 2.6, 3.4, 0.7, false));
      [[-30, -14, 3], [26, -22, 2.2], [32, 14, 2.6], [-12, 30, 2]].forEach(([dx2, dy2, rr]) => parts.push(`<circle cx="${(x + dx2).toFixed(1)}" cy="${(y + dy2).toFixed(1)}" r="${rr}" fill="${color}" fill-opacity="0.45"/>`));
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#fff" stroke="${color}" stroke-width="2.6"/>`);
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`);
    } else if (o.kind === 'arrow') {
      const a = P(o.from || 'w'); const b = P(o.to || 'e');
      const aid = `${uid}r${gi++}`;
      defs.push(`<marker id="${aid}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker>`);
      const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.18; const my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.18;
      parts.push(`<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${color}" stroke-width="3" ${o.dashed ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#${aid})"/>`);
    } else if (o.kind === 'label') {
      const [x, y] = P(o.anchor || 'center');
      parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#33383f" stroke="#fff" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${esc(o.text)}</text>`);
    } else if (o.kind === 'marker') {
      markers.push({ ...o, color, xy: P(o.anchor || 'center') });
    }
  });

  // 마커 → 좌/우 열(자동 정렬): 큰 아이콘 타일 + 밑줄 친 라벨 + 대상 지점까지 직각 지시선
  const sides = { left: [], right: [] };
  markers.forEach((m) => {
    const side = m.side === 'left' || m.side === 'right' ? m.side : (m.xy[0] < SITE.x + SITE.w / 2 ? 'left' : 'right');
    sides[side].push(m);
  });
  const itemH = 66;
  Object.entries(sides).forEach(([side, list]) => {
    list.sort((a, b) => a.xy[1] - b.xy[1]);
    const top = SITE.y - 6; const bottom = SITE.y + SITE.h - itemH + 14;
    list.forEach((m, i) => {
      const labelW = Math.max(78, Math.round(String(m.label || '').length * 15.5 + 8));
      const cy = list.length === 1 ? Math.min(Math.max(m.xy[1] - itemH / 2, top), bottom) : top + (i * (bottom - top)) / (list.length - 1);
      const cx = side === 'left' ? 10 : PANEL_W - labelW - 10;
      const lineY = cy + itemH - 6;
      const edgeX = side === 'left' ? cx + labelW : cx;
      parts.push(`<path d="M${edgeX} ${lineY.toFixed(1)} H${m.xy[0].toFixed(1)} V${m.xy[1].toFixed(1)}" fill="none" stroke="#1f2328" stroke-width="1.3"/>`);
      parts.push(`<circle cx="${m.xy[0].toFixed(1)}" cy="${m.xy[1].toFixed(1)}" r="10" fill="#fff" fill-opacity="0.6" stroke="${m.color}" stroke-width="2.4" stroke-dasharray="2.6 2.6"/>`);
      parts.push(`<circle cx="${m.xy[0].toFixed(1)}" cy="${m.xy[1].toFixed(1)}" r="3.8" fill="${m.color}"/>`);
      const tx = side === 'left' ? cx : cx + labelW - 38;
      parts.push(`<rect x="${tx}" y="${cy.toFixed(1)}" width="38" height="38" rx="7" fill="${m.color}"/>`);
      parts.push(`<g transform="translate(${tx + 4} ${(cy + 4).toFixed(1)}) scale(1.3)">${iconGlyph(m.icon, '#fff')}</g>`);
      parts.push(`<text x="${side === 'left' ? cx : cx + labelW}" y="${(lineY - 7).toFixed(1)}" text-anchor="${side === 'left' ? 'start' : 'end'}" font-family="${FONT}" font-size="15" font-weight="700" fill="#1f2328">${esc(m.label)}</text>`);
      parts.push(`<line x1="${cx}" y1="${lineY.toFixed(1)}" x2="${cx + labelW}" y2="${lineY.toFixed(1)}" stroke="#1f2328" stroke-width="2.6"/>`);
    });
  });

  const head = headingSvg(panel.heading, accent, PANEL_W / 2, 40);
  const underline = `<rect x="${PANEL_W / 2 - 34}" y="52" width="68" height="3" rx="1.5" fill="${accent}"/>`;
  return `<g transform="translate(${ox} ${oy})"><defs>${defs.join('')}</defs>${head}${underline}${parts.join('')}</g>`;
}

export function renderSiteConcept(spec, opts = {}) {
  const baseShapes = spec.siteBase && Array.isArray(spec.siteBase.shapes) ? normalizeShapes(spec.siteBase.shapes) : null;
  const panels = (Array.isArray(spec.panels) ? spec.panels : []).slice(0, 6);
  const cols = Math.min(3, Math.max(1, panels.length));
  const rows = Math.ceil(panels.length / cols) || 1;
  const titleH = spec.title ? 64 : 0;
  const W = cols * PANEL_W; const H = titleH + rows * PANEL_H;
  const body = panels.map((p, i) => renderSitePanel(p, (i % cols) * PANEL_W, titleH + Math.floor(i / cols) * PANEL_H, `s${i}`, opts.baseImage, baseShapes)).join('');
  const dividers = Array.from({ length: cols - 1 }, (_, i) => `<line x1="${(i + 1) * PANEL_W}" y1="${titleH + 20}" x2="${(i + 1) * PANEL_W}" y2="${H - 20}" stroke="#D5D9DE" stroke-width="1.2"/>`).join('');
  const title = spec.title ? `<text x="24" y="40" font-family="${FONT}" font-size="24" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${body}${dividers}</svg>`;
  return { svg, width: W, height: H };
}
