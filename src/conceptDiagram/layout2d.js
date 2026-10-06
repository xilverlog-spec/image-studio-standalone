// 평면/배치 기반 개념도 렌더러.
// AI가 이미지에서 읽은 "도형 목록(방·건물·도로·녹지·대지경계)"을 그대로 바탕으로 그리고,
// 그 위에 흐름(화살표)·구역(해칭)·주석을 패널별로 얹는다. 좌표는 0~100 정규화 값, 글자는 <text>.
//
// spec = {
//   title, shapes: [{id, name, kind, pts:[[x,y],...]}],
//   panels: [{heading, accent, flows:[{from,to,color,dashed}], zones:[{ids,color,pattern,label}], notes:[{target,text}]}]
// }

export const SHAPE_KINDS = ['room', 'building', 'road', 'green', 'water', 'boundary', 'other'];
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const nz = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export const LAYOUT_PANEL_W = 480;
export const LAYOUT_PANEL_H = 440;
const BASE_X = 40; const BASE_Y = 62; const BASE_W = 400; const BASE_H = 320;

const KIND_STYLE = {
  room: { fill: '#F6F4EF', stroke: '#2b2b2b', sw: 1.4, name: true },
  building: { fill: '#EFEDE8', stroke: '#2b2b2b', sw: 1.5, name: true },
  road: { fill: '#E4E6E8', stroke: '#B7BCC1', sw: 1, name: false },
  green: { fill: '#E3EEDB', stroke: '#A8BF98', sw: 1, name: true },
  water: { fill: '#DCEAF3', stroke: '#9DBBD0', sw: 1, name: true },
  boundary: { fill: 'none', stroke: '#333333', sw: 1.4, dash: '7 4', name: false },
  other: { fill: '#F6F6F6', stroke: '#8a8f96', sw: 1.1, name: true },
};

export function normalizeShapes(raw) {
  // AI가 0~100 이 아니라 0~1000(또는 픽셀) 좌표를 줄 때가 많다: 최대값이 100 을 넘으면 같은 비율로 줄여서 모양을 보존한다
  const maxv = Math.max(0, ...(Array.isArray(raw) ? raw : []).flatMap((s) => (Array.isArray(s?.pts) ? s.pts : []).flatMap((p) => [nz(p?.[0]), nz(p?.[1])])));
  const sc = maxv > 105 ? 100 / maxv : 1;
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 80).map((s, i) => {
    const pts = (Array.isArray(s.pts) ? s.pts : [])
      .map((p) => [Math.min(100, Math.max(0, nz(p?.[0]) * sc)), Math.min(100, Math.max(0, nz(p?.[1]) * sc))])
      .filter((p, j, a) => j === 0 || p[0] !== a[j - 1][0] || p[1] !== a[j - 1][1]);
    let id = String(s.id ?? `s${i + 1}`);
    while (seen.has(id)) id += '_';
    seen.add(id);
    return { id, name: String(s.name ?? ''), kind: SHAPE_KINDS.includes(s.kind) ? s.kind : 'other', pts };
  }).filter((s) => s.pts.length >= 3);
}

const centroid = (pts) => {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length];
    const c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-6) {
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const bboxOf = (pts) => {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

function heading(text, accent) {
  const parts = String(text || '').split(/(\{[^}]*\})/g).filter(Boolean);
  const spans = parts.map((p) => (p.startsWith('{') && p.endsWith('}')
    ? `<tspan fill="${accent}" font-weight="800">${esc(p.slice(1, -1))}</tspan>`
    : `<tspan>${esc(p)}</tspan>`)).join('');
  return `<text x="${BASE_X}" y="36" font-family="${FONT}" font-size="17" font-weight="600" fill="#1f242b">${spans}</text>`;
}

// ── 단순 블록 스타일: 평면을 색 블록 + 이니셜로 줄이고, 진입 화살표와 점선 동선을 얹는 표현 ──
// panel.style === 'blocks' 일 때 사용.
//  panel.rooms   : { <shapeId>: { abbr: 'L', fill: '#FCE9CF', text: '#555' } }  (없으면 기본 회색)
//  panel.entries : [{ room: <shapeId>, side: 'top|bottom|left|right', color }]    (방 바깥쪽에서 안쪽으로 향하는 굵은 화살표)
//  panel.paths   : [{ via: [<shapeId>, ...], color, dashed }]                       (방 중심을 이어 직각으로 꺾이는 점선 동선)
const BLOCK_GRAY = '#EFEFEF';
const BLOCK_TEXT = '#3a3a3a';
const BLOCK_OUTLINE = '#C4C7CC';
const SECONDARY = /욕실|화장실|현관|팬트리|다용도|실외기|발코니|드레스|복도|홀|창고|보일러|계단|엘리베이터/;

function renderBlocksPanel(shapes, panel, ox, oy, uid) {
  const accent = isHex(panel.accent) ? panel.accent : '#F28C28';
  const all = shapes.flatMap((s) => s.pts);
  if (!all.length) return '';
  // 화살표가 들어갈 바깥 여백을 남기고 맞춘다
  const padA = 34;
  const [minX, minY, maxX, maxY] = bboxOf(all);
  const aw = BASE_W - padA * 2; const ah = BASE_H - padA * 2;
  const k = Math.min(aw / (maxX - minX || 1), ah / (maxY - minY || 1));
  const offX = BASE_X + padA + (aw - (maxX - minX) * k) / 2 - minX * k;
  const offY = BASE_Y + padA + (ah - (maxY - minY) * k) / 2 - minY * k;
  const T = (p) => [p[0] * k + offX, p[1] * k + offY];
  const byId = Object.fromEntries(shapes.map((s) => [s.id, s]));
  const polyStr = (pts) => pts.map((p) => T(p).map((v) => v.toFixed(1)).join(',')).join(' ');
  const rooms = panel.rooms && typeof panel.rooms === 'object' ? panel.rooms : {};
  const out = [];

  // 바깥 윤곽: AI가 준 외곽선은 부정확하므로 쓰지 않는다. 모든 방 영역을 회색 테두리로 깔아 합쳐진 윤곽을 만든 뒤 흰색으로 덮어 얇은 선만 남긴다
  const body = shapes.filter((s) => s.kind !== 'boundary' && s.kind !== 'road');
  body.forEach((s) => out.push(`<polygon points="${polyStr(s.pts)}" fill="${BLOCK_OUTLINE}" stroke="${BLOCK_OUTLINE}" stroke-width="5" stroke-linejoin="round"/>`));
  body.forEach((s) => out.push(`<polygon points="${polyStr(s.pts)}" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>`));
  // 주요 실만 색 블록으로: rooms 에 적힌 것 중 부속 공간(욕실·현관 등)은 뺀다. 블록은 외곽·이웃과 떨어지게 안쪽으로 줄여서 그린다
  const wanted = Object.keys(rooms).length ? body.filter((s) => rooms[s.id]) : body;
  const picked = panel.showAll ? wanted : wanted.filter((s) => !SECONDARY.test(s.name || ''));
  const inset = (s) => {
    const px = s.pts.map(T); const c = px.reduce((a, p) => [a[0] + p[0] / px.length, a[1] + p[1] / px.length], [0, 0]);
    const xs = px.map((p) => p[0]); const ys = px.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys);
    const gap = 10; const kx = Math.max(0.5, 1 - gap / (w || 1)); const ky = Math.max(0.5, 1 - gap / (h || 1));
    return px.map((p) => [c[0] + (p[0] - c[0]) * kx, c[1] + (p[1] - c[1]) * ky]);
  };
  picked.forEach((s) => {
    const r = rooms[s.id] || {};
    const fill = isHex(r.fill) ? r.fill : BLOCK_GRAY;
    out.push(`<polygon points="${inset(s).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" stroke="none"/>`);
  });
  const centerOf = (id) => { const s = byId[id]; if (!s) return null; const c = centroid(s.pts); return T(c); };
  const rbox = (id) => { const s = byId[id]; if (!s) return null; const [a, b, c, d] = bboxOf(s.pts); const p0 = T([a, b]); const p1 = T([c, d]); return [p0[0], p0[1], p1[0], p1[1]]; };
  picked.forEach((s) => {
    const r = rooms[s.id] || {};
    const abbr = String(r.abbr ?? '').slice(0, 4);
    if (!abbr) return;
    const [cx, cy] = centerOf(s.id); const b = rbox(s.id);
    const fs = Math.max(11, Math.min(22, Math.min(b[2] - b[0], b[3] - b[1]) * 0.42));
    out.push(`<text x="${cx.toFixed(1)}" y="${(cy + fs * 0.35).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs.toFixed(1)}" font-weight="600" fill="${isHex(r.text) ? r.text : BLOCK_TEXT}">${esc(abbr)}</text>`);
  });

  // 동선(점선): 방 중심을 직각으로 이어 간다
  (Array.isArray(panel.paths) ? panel.paths : []).slice(0, 6).forEach((p) => {
    const via = (Array.isArray(p.via) ? p.via : []).map(centerOf).filter(Boolean);
    if (via.length < 2) return;
    const col = isHex(p.color) ? p.color : accent;
    const pts = [via[0]];
    for (let i = 1; i < via.length; i++) {
      const a = pts[pts.length - 1]; const b = via[i];
      if (Math.abs(a[0] - b[0]) > 3 && Math.abs(a[1] - b[1]) > 3) pts.push([b[0], a[1]]);
      pts.push(b);
    }
    out.push(`<polyline points="${pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"${p.dashed === false ? '' : ' stroke-dasharray="7 6"'}/>`);
  });

  // 진입 화살표: 방 바깥쪽에서 안쪽으로
  (Array.isArray(panel.entries) ? panel.entries : []).slice(0, 6).forEach((e, ei) => {
    const b = rbox(e.room);
    if (!b) return;
    const col = isHex(e.color) ? e.color : accent;
    const side = ['top', 'bottom', 'left', 'right'].includes(e.side) ? e.side : 'top';
    const cx = (b[0] + b[2]) / 2; const cy = (b[1] + b[3]) / 2; const L = 26;
    let x0; let y0; let x1; let y1;
    if (side === 'top') { x0 = cx; y0 = b[1] - L - 4; x1 = cx; y1 = b[1] + 6; }
    else if (side === 'bottom') { x0 = cx; y0 = b[3] + L + 4; x1 = cx; y1 = b[3] - 6; }
    else if (side === 'left') { x0 = b[0] - L - 4; y0 = cy; x1 = b[0] + 6; y1 = cy; }
    else { x0 = b[2] + L + 4; y0 = cy; x1 = b[2] - 6; y1 = cy; }
    const mid = `${uid}en${ei}`;
    out.push(`<defs><marker id="${mid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${col}"/></marker></defs>`);
    out.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${col}" stroke-width="5" stroke-linecap="butt" marker-end="url(#${mid})"/>`);
  });

  // 범례(공용/사적 같은 구역 구분): 아래쪽에 색 칩 + 이름
  const legend = (Array.isArray(panel.legend) ? panel.legend : []).filter((l) => l && l.label).slice(0, 5);
  if (legend.length) {
    let lx = BASE_X + 6; const ly = BASE_Y + BASE_H + 16;
    legend.forEach((l) => {
      const col = isHex(l.color) ? l.color : BLOCK_GRAY;
      const label = String(l.label).slice(0, 24);
      const tw = [...label].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 13.5 : 7.4), 0);
      out.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="16" rx="3" fill="${col}" stroke="#c9ced4" stroke-width="0.8"/><text x="${lx + 23}" y="${ly + 2}" font-family="${FONT}" font-size="13" font-weight="600" fill="#3a3f45">${esc(label)}</text>`);
      lx += 46 + tw;
    });
  }

  const head = panel.heading ? heading(panel.heading, accent) : '';
  return `<g transform="translate(${ox} ${oy})">${head}${out.join('')}</g>`;
}

function renderPanel(shapes, panel, ox, oy, uid, withBase = true) {
  const accent = isHex(panel.accent) ? panel.accent : '#F28C28';
  const all = shapes.flatMap((s) => s.pts);
  if (!all.length) return '';
  const [minX, minY, maxX, maxY] = bboxOf(all);
  const k = Math.min(BASE_W / (maxX - minX || 1), BASE_H / (maxY - minY || 1));
  const offX = BASE_X + (BASE_W - (maxX - minX) * k) / 2 - minX * k;
  const offY = BASE_Y + (BASE_H - (maxY - minY) * k) / 2 - minY * k;
  const T = (p) => [p[0] * k + offX, p[1] * k + offY];
  const byId = Object.fromEntries(shapes.map((s) => [s.id, s]));
  const C = (id) => { const s = byId[id]; return s ? T(centroid(s.pts)) : null; };
  const polyStr = (pts) => pts.map((p) => T(p).map((v) => v.toFixed(1)).join(',')).join(' ');
  const out = [];

  // 바탕: 넓은 것부터(도로·대지 → 건물/방) 그려서 겹침이 자연스럽게
  const area = (s) => { const [a, b, c, d] = bboxOf(s.pts); return (c - a) * (d - b); };
  const order = { boundary: 0, road: 1, green: 2, water: 2, other: 3, room: 4, building: 5 };
  if (withBase) {
    [...shapes].sort((p, q) => (order[p.kind] - order[q.kind]) || (area(q) - area(p))).forEach((s) => {
      const st = KIND_STYLE[s.kind];
      out.push(`<polygon points="${polyStr(s.pts)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.sw}" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`);
    });
  }

  // 구역(해칭/채움)
  (Array.isArray(panel.zones) ? panel.zones : []).slice(0, 8).forEach((z, zi) => {
    const col = isHex(z.color) ? z.color : accent;
    const ids = (Array.isArray(z.ids) ? z.ids : []).filter((id) => byId[id]);
    if (!ids.length) return;
    const pid = `${uid}z${zi}`;
    if (z.pattern === 'hatch') {
      out.push(`<defs><pattern id="${pid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${col}" stroke-width="1.6"/></pattern></defs>`);
    }
    ids.forEach((id) => {
      const fill = z.pattern === 'hatch' ? `url(#${pid})` : col;
      out.push(`<polygon points="${polyStr(byId[id].pts)}" fill="${fill}" fill-opacity="${z.pattern === 'hatch' ? 0.9 : 0.38}" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`);
    });
    if (z.label) {
      const pts = ids.flatMap((id) => byId[id].pts); const [x0, y0, x1] = bboxOf(pts);
      const [lx, ly] = T([(x0 + x1) / 2, y0]);
      const w = String(z.label).length * 11 + 16;
      out.push(`<g><rect x="${(lx - w / 2).toFixed(1)}" y="${(ly + 4).toFixed(1)}" width="${w}" height="20" rx="10" fill="${col}"/><text x="${lx.toFixed(1)}" y="${(ly + 18).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="700" fill="#fff">${esc(z.label)}</text></g>`);
    }
  });

  // 흐름 화살표(색마다 화살촉을 따로 만든다 — 일러스트레이터 등에서도 색이 유지되도록)
  (Array.isArray(panel.flows) ? panel.flows : []).slice(0, 14).forEach((f, fi) => {
    const a = C(f.from); const b = C(f.to);
    if (!a || !b || f.from === f.to) return;
    const col = isHex(f.color) ? f.color : accent;
    const mid = `${uid}ar${fi}`;
    const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(26, len * 0.14);
    const qx = mx - (dy / len) * bow; const qy = my + (dx / len) * bow;
    out.push(`<defs><marker id="${mid}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${col}"/></marker></defs>`);
    out.push(`<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round" opacity="0.92"${f.dashed ? ' stroke-dasharray="7 6"' : ''} marker-end="url(#${mid})"/>`);
    out.push(`<circle cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="4" fill="${col}"/>`);
  });

  // 이름
  if (withBase) {
    shapes.forEach((s) => {
      if (!s.name || !KIND_STYLE[s.kind].name) return;
      const [cx, cy] = C(s.id);
      out.push(`<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#3a3f45" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-opacity="0.75">${esc(s.name)}</text>`);
    });
  }

  // 주석
  (Array.isArray(panel.notes) ? panel.notes : []).slice(0, 8).forEach((n, ni) => {
    const c = C(n.target);
    if (!c || !n.text) return;
    const text = String(n.text).slice(0, 22);
    const w = text.length * 11.5 + 16;
    const up = ni % 2 === 0;
    const lx = Math.min(BASE_X + BASE_W - w / 2, Math.max(BASE_X + w / 2, c[0]));
    const ly = up ? Math.max(BASE_Y - 4, c[1] - 46) : Math.min(BASE_Y + BASE_H + 14, c[1] + 40);
    out.push(`<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(up ? ly + 10 : ly - 10).toFixed(1)}" stroke="#555" stroke-width="1"/>`);
    out.push(`<g><rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="4" fill="#fff" stroke="#555" stroke-width="1"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="#1f242b">${esc(text)}</text></g>`);
  });

  const head = panel.heading ? heading(panel.heading, accent) : '';
  return `<g transform="translate(${ox} ${oy})">${head}${out.join('')}</g>`;
}

export function renderLayout2d(spec) {
  const shapes = normalizeShapes(spec.shapes);
  if (!shapes.length) throw new Error('읽어 낸 도형이 없습니다.');
  const panels = (Array.isArray(spec.panels) && spec.panels.length ? spec.panels : [{}]).slice(0, 6);
  const cols = Math.min(2, panels.length); const rows = Math.ceil(panels.length / cols);
  const titleH = spec.title ? 56 : 0;
  const W = cols * LAYOUT_PANEL_W; const H = titleH + rows * LAYOUT_PANEL_H;
  const body = panels.map((p, i) => (p.style === 'blocks' ? renderBlocksPanel : renderPanel)(shapes, p, (i % cols) * LAYOUT_PANEL_W, titleH + Math.floor(i / cols) * LAYOUT_PANEL_H, `l${i}`)).join('');
  const title = spec.title ? `<text x="24" y="38" font-family="${FONT}" font-size="22" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${body}</svg>`;
  return { svg, width: W, height: H };
}

export function normalizeLayoutPanels(spec) {
  const ids = new Set(normalizeShapes(spec.shapes).map((s) => s.id));
  const keep = (id) => ids.has(id);
  return {
    ...spec,
    panels: (Array.isArray(spec.panels) ? spec.panels : []).slice(0, 6).map((p) => ({
      ...p,
      flows: (Array.isArray(p.flows) ? p.flows : []).filter((f) => keep(f.from) && keep(f.to)),
      zones: (Array.isArray(p.zones) ? p.zones : []).map((z) => ({ ...z, ids: (Array.isArray(z.ids) ? z.ids : []).filter(keep) })).filter((z) => z.ids.length),
      notes: (Array.isArray(p.notes) ? p.notes : []).filter((n) => keep(n.target)),
      legend: Array.isArray(p.legend) ? p.legend : undefined,
      rooms: p.rooms && typeof p.rooms === 'object' ? Object.fromEntries(Object.entries(p.rooms).filter(([id]) => keep(id))) : undefined,
      entries: (Array.isArray(p.entries) ? p.entries : []).filter((e) => keep(e.room)),
      paths: (Array.isArray(p.paths) ? p.paths : []).map((q) => ({ ...q, via: (Array.isArray(q.via) ? q.via : []).filter(keep) })).filter((q) => q.via.length >= 2),
    })),
  };
}
