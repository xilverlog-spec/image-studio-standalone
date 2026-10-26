// 프로그램 버블 다이어그램: 공간(프로그램)을 원으로, 면적/중요도를 원 크기로, 성격이 같은 것은 같은 색 묶음으로 그린다.
// AI는 groups / nodes / links 만 정하고, 배치는 여기서 결정적으로 계산한다(같은 입력이면 항상 같은 그림).
//
// spec = { title, accent, groups:[{id,name,color}],
//          nodes:[{id,label,group,size 1~5, icon?(아이콘 이름), area?('1,200㎡' 같은 짧은 글자)}],
//          links:[{from,to,kind:'direct|weak',label}], autoIcon?(false 면 이름으로 아이콘을 짐작해 붙이지 않는다) }
// 2026-10-26 개선(참고삽도의 소도식 문법): 버블 안 아이콘·면적 줄, 색 제목+밑줄, 연결선 끝점·흰 테두리, 하단 범례, 배경 대비에 맞춘 글자색.

import { iconGlyph, ICON_NAMES } from './icons';

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const PALETTE = ['#F28C28', '#3E8E41', '#1E90C8', '#C2410C', '#7C5CBF', '#B8860B', '#D6457B', '#4B5563'];

const W = 920; const H = 640; const PAD = 40; const TOP = 76; const LEG = 46; // LEG: 아래 범례 줄 높이

// 공간 이름에서 어울리는 아이콘을 짐작한다(AI 가 icon 을 안 줬을 때). 못 찾으면 아이콘 없이 글자만.
const ICON_RULES = [
  [/로비|출입|현관|입구|홀$/, 'door-open'], [/카페|커피|찻집/, 'coffee'], [/라운지|휴게|쉼터/, 'sofa'], [/전시|갤러리|미술|박물/, 'landmark'],
  [/교육|강의|교실|학습|세미나|연수/, 'graduation-cap'], [/자료|도서|서고|독서|열람/, 'book-open'], [/커뮤니티|주민|모임|공동체|사랑방/, 'users'],
  [/사무|업무|행정|오피스|관리/, 'building-2'], [/수장|창고|보관|저장|물류|하역|반입/, 'warehouse'], [/주차/, 'square-parking'],
  [/식당|주방|급식|푸드|레스토랑/, 'utensils'], [/운동|체육|피트니스|헬스|체력/, 'dumbbell'], [/수영|풀$|수공간|물놀이/, 'waves'],
  [/정원|녹지|공원|숲|옥상/, 'trees'], [/숙박|침실|수면|호텔|게스트/, 'bed-double'], [/화장실|욕실|샤워/, 'bath'], [/의료|보건|진료|병원|치료/, 'hospital'],
  [/연구|실험|랩|개발|창작|공방/, 'lightbulb'], [/회의|미팅|협업|협력/, 'handshake'], [/보안|경비|방재|관제/, 'shield-check'], [/설비|기계|전기|기전|MEP/i, 'zap'],
  [/상점|판매|매장|마켓|쇼핑|리테일/, 'store'], [/어린이|보육|돌봄|영유아|키즈|놀이/, 'baby'], [/공연|강당|극장|콘서트|무대/, 'megaphone'],
];
const guessIcon = (label) => { const hit = ICON_RULES.find(([re]) => re.test(label)); return hit ? hit[1] : ''; };

export function normalizeProgram(spec) {
  const groups = (Array.isArray(spec.groups) ? spec.groups : []).slice(0, 8).map((g, i) => ({
    id: String(g.id ?? `g${i + 1}`), name: String(g.name ?? ''), color: isHex(g.color) ? g.color : PALETTE[i % PALETTE.length],
  }));
  if (!groups.length) groups.push({ id: 'g1', name: '', color: PALETTE[0] });
  const gid = new Set(groups.map((g) => g.id));
  const seen = new Set();
  const nodes = (Array.isArray(spec.nodes) ? spec.nodes : []).slice(0, 40).map((n, i) => {
    let id = String(n.id ?? `n${i + 1}`); while (seen.has(id)) id += '_'; seen.add(id);
    const ic = n.icon ? String(n.icon).trim().toLowerCase().replace(/[\s_]+/g, '-') : '';
    return {
      id, label: String(n.label ?? ''), group: gid.has(String(n.group)) ? String(n.group) : groups[0].id, size: Math.min(5, Math.max(1, Number(n.size) || 2)),
      icon: ICON_NAMES.includes(ic) ? ic : '', area: n.area === undefined || n.area === null ? '' : String(n.area).slice(0, 12),
    };
  });
  if (!nodes.length) throw new Error('nodes 가 비어 있습니다.');
  const links = (Array.isArray(spec.links) ? spec.links : []).slice(0, 60).filter((l) => seen.has(String(l.from)) && seen.has(String(l.to)) && l.from !== l.to)
    .map((l) => ({ from: String(l.from), to: String(l.to), kind: l.kind === 'weak' ? 'weak' : 'direct', label: String(l.label ?? '') }));
  return { ...spec, groups, nodes, links };
}

function layout(spec) {
  const gi = Object.fromEntries(spec.groups.map((g, i) => [g.id, i]));
  const G = spec.groups.length;
  const HC = H - TOP - LEG; // 그림을 둘 수 있는 높이
  const cx0 = W / 2; const cy0 = TOP + HC / 2;
  // 묶음 중심: 원형(2개 이상) 배치
  const centers = spec.groups.map((_, i) => (G === 1 ? [cx0, cy0] : [cx0 + Math.cos((2 * Math.PI * i) / G - Math.PI / 2) * (W * 0.26), cy0 + Math.sin((2 * Math.PI * i) / G - Math.PI / 2) * (HC * 0.27)]));
  const byG = spec.groups.map(() => []);
  spec.nodes.forEach((n) => byG[gi[n.group]].push(n));
  const P = {}; const R = {};
  spec.nodes.forEach((n) => { R[n.id] = 18 + n.size * 8; });
  byG.forEach((arr, g) => {
    arr.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(arr.length, 1); const rr = arr.length > 1 ? 40 + arr.length * 6 : 0;
      P[n.id] = [centers[g][0] + Math.cos(a) * rr, centers[g][1] + Math.sin(a) * rr];
    });
  });
  const ids = spec.nodes.map((n) => n.id);
  for (let it = 0; it < 360; it++) {
    const cool = 1 - it / 360;
    const F = Object.fromEntries(ids.map((id) => [id, [0, 0]]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]; const b = ids[j];
        let dx = P[b][0] - P[a][0]; let dy = P[b][1] - P[a][1]; let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 0.5 + i; dy = 0.5 + j; d = Math.hypot(dx, dy); }
        const same = spec.nodes[i].group === spec.nodes[j].group;
        const need = R[a] + R[b] + (same ? 26 : 64); // 바깥 고리(r+5)가 겹치지 않게 조금 더 띄운다
        if (d < need) { const f = (need - d) * 0.5; F[a][0] -= (dx / d) * f; F[a][1] -= (dy / d) * f; F[b][0] += (dx / d) * f; F[b][1] += (dy / d) * f; }
      }
    }
    spec.nodes.forEach((n) => { // 묶음 중심으로 모으기
      const c = centers[gi[n.group]]; F[n.id][0] += (c[0] - P[n.id][0]) * 0.03; F[n.id][1] += (c[1] - P[n.id][1]) * 0.03;
    });
    spec.links.forEach((l) => { // 연결된 것끼리 살짝 당기기
      const a = l.from; const b = l.to; const dx = P[b][0] - P[a][0]; const dy = P[b][1] - P[a][1]; const d = Math.hypot(dx, dy) || 1;
      const rest = R[a] + R[b] + 24; const f = (d - rest) * 0.012 * (l.kind === 'weak' ? 0.4 : 1);
      F[a][0] += (dx / d) * f; F[a][1] += (dy / d) * f; F[b][0] -= (dx / d) * f; F[b][1] -= (dy / d) * f;
    });
    ids.forEach((id) => { P[id][0] += F[id][0] * cool * 0.9; P[id][1] += F[id][1] * cool * 0.9; });
  }
  return { P, R, gi };
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ink = (hex) => (lum(hex) > 0.74 ? '#222222' : '#ffffff'); // 바탕이 밝으면 어두운 글자
const tw = (s, fs) => [...String(s)].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? fs : fs * 0.58), 0); // 글자 폭 어림

export function renderProgram(raw) {
  const spec = normalizeProgram(raw);
  const { P, R } = layout(spec);
  const ids = spec.nodes.map((n) => n.id);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  ids.forEach((id) => { x0 = Math.min(x0, P[id][0] - R[id]); y0 = Math.min(y0, P[id][1] - R[id]); x1 = Math.max(x1, P[id][0] + R[id]); y1 = Math.max(y1, P[id][1] + R[id]); });
  const k = Math.min((W - PAD * 2 - 60) / (x1 - x0 || 1), (H - TOP - LEG - PAD * 2 - 30) / (y1 - y0 || 1), 1.5);
  const ox = (W - (x1 - x0) * k) / 2 - x0 * k; const oy = TOP + (H - TOP - LEG - (y1 - y0) * k) / 2 - y0 * k + 6;
  const T = (id) => [P[id][0] * k + ox, P[id][1] * k + oy];
  const gcol = Object.fromEntries(spec.groups.map((g) => [g.id, g.color]));
  const out = []; const labels = []; // 글자는 선·원 위에 얹어야 가려지지 않으므로 마지막에 그린다
  const auto = spec.autoIcon !== false;

  // 묶음 바탕(부드러운 타원) + 색 제목(밑줄)
  spec.groups.forEach((g) => {
    const mem = spec.nodes.filter((n) => n.group === g.id); if (!mem.length) return;
    let a0 = Infinity; let b0 = Infinity; let a1 = -Infinity; let b1 = -Infinity;
    mem.forEach((n) => { const [x, y] = T(n.id); const r = R[n.id] * k + 5; a0 = Math.min(a0, x - r); b0 = Math.min(b0, y - r); a1 = Math.max(a1, x + r); b1 = Math.max(b1, y + r); });
    const cx = (a0 + a1) / 2; const cy = (b0 + b1) / 2; const rx = (a1 - a0) / 2 + 24; const ry = (b1 - b0) / 2 + 24;
    out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${g.color}" fill-opacity="0.08" stroke="${g.color}" stroke-opacity="0.5" stroke-width="1.3" stroke-dasharray="6 5"/>`);
    if (g.name) {
      const ty = cy - ry - 12; const w = tw(g.name, 15);
      labels.push(`<text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="800" fill="${g.color}" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">${esc(g.name)}</text>`);
      labels.push(`<rect x="${(cx - w / 2).toFixed(1)}" y="${(ty + 5).toFixed(1)}" width="${w.toFixed(1)}" height="3" rx="1.5" fill="${g.color}"/>`);
    }
  });
  // 연결선(흰 테두리를 깔아 겹쳐도 또렷하게) + 직접 연결은 양 끝에 작은 점
  spec.links.forEach((l) => {
    const a = T(l.from); const b = T(l.to); const dx = b[0] - a[0]; const dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1;
    const ra = R[l.from] * k + 5; const rb = R[l.to] * k + 5;
    const sx = a[0] + (dx / d) * ra; const sy = a[1] + (dy / d) * ra; const ex = b[0] - (dx / d) * rb; const ey = b[1] - (dy / d) * rb;
    const weak = l.kind === 'weak'; const sw = weak ? 1.4 : 2.8;
    out.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#fff" stroke-width="${sw + 4}" stroke-linecap="round"/>`);
    out.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#4a4f57" stroke-width="${sw}" stroke-linecap="round"${weak ? ' stroke-dasharray="4 4"' : ''} opacity="${weak ? 0.7 : 0.85}"/>`);
    if (!weak) out.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.4" fill="#4a4f57"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.4" fill="#4a4f57"/>`);
    // 연결선 라벨: 원 사이 선이 글자보다 길 때만 단다(짧으면 원 위에 글자가 얹혀 지저분해진다)
    const segLen = Math.hypot(ex - sx, ey - sy); const lw = tw(l.label, 10.5);
    const mx = (sx + ex) / 2; const my = (sy + ey) / 2;
    const onBubble = spec.nodes.some((n) => { const [bx, by] = T(n.id); return Math.hypot(bx - mx, by - my) < R[n.id] * k + 13; });
    if (l.label && segLen > lw + 14 && !onBubble) labels.push(`<text x="${mx.toFixed(1)}" y="${(my - 5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="#444" paint-order="stroke" stroke="#fff" stroke-width="3.5" stroke-linejoin="round">${esc(l.label)}</text>`);
  });
  // 버블: 바깥 고리 + 몸통 + (아이콘) + 이름 + (면적)
  spec.nodes.forEach((n) => {
    const [x, y] = T(n.id); const r = R[n.id] * k; const col = gcol[n.group]; const fg = ink(col);
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 5).toFixed(1)}" fill="none" stroke="${col}" stroke-opacity="0.38" stroke-width="1.4"/>`);
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.93" stroke="#fff" stroke-width="3"/>`);
    const icon = n.icon || (auto ? guessIcon(n.label) : '');
    const fs = Math.max(10.5, Math.min(15, r * 0.34)); const fs2 = Math.max(9, fs * 0.78);
    const label = n.label;
    const lines = label.length > 5 && label.length <= 12 ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))] : [label.slice(0, 12)];
    const showIcon = !!icon && r >= 30; const isz = showIcon ? Math.min(r * 0.62, 30) : 0;
    const hasArea = !!n.area && r >= 26;
    const blockH = (showIcon ? isz + 3 : 0) + lines.length * fs * 1.15 + (hasArea ? fs2 * 1.25 : 0);
    let ty = y - blockH / 2;
    if (showIcon) { out.push(`<g transform="translate(${(x - isz / 2).toFixed(1)} ${ty.toFixed(1)}) scale(${(isz / 20).toFixed(3)})">${iconGlyph(icon, fg)}</g>`); ty += isz + 3; }
    lines.forEach((ln, i) => out.push(`<text x="${x.toFixed(1)}" y="${(ty + fs * 0.88 + i * fs * 1.15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs.toFixed(1)}" font-weight="700" fill="${fg}">${esc(ln)}</text>`));
    if (hasArea) out.push(`<text x="${x.toFixed(1)}" y="${(ty + lines.length * fs * 1.15 + fs2 * 0.95).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs2.toFixed(1)}" font-weight="500" fill="${fg}" fill-opacity="0.9">${esc(n.area)}</text>`);
  });
  out.push(...labels);

  // 범례(아래 한 줄): 묶음 색 + 원 크기 + 연결선 종류
  const ly = H - 24; let lx = 34;
  const items = [];
  spec.groups.filter((g) => g.name && spec.nodes.some((n) => n.group === g.id)).forEach((g) => {
    const w = 22 + tw(g.name, 12.5) + 18; items.push({ w, svg: (x) => `<circle cx="${x + 7}" cy="${ly - 4}" r="7" fill="${g.color}"/><text x="${x + 20}" y="${ly}" font-family="${FONT}" font-size="12.5" font-weight="700" fill="#333">${esc(g.name)}</text>` });
  });
  items.push({ w: 34 + tw('크기 = 면적·중요도', 12) + 24, svg: (x) => `<circle cx="${x + 5}" cy="${ly - 4}" r="4" fill="none" stroke="#777" stroke-width="1.3"/><circle cx="${x + 20}" cy="${ly - 4}" r="7" fill="none" stroke="#777" stroke-width="1.3"/><text x="${x + 34}" y="${ly}" font-family="${FONT}" font-size="12" fill="#555">크기 = 면적·중요도</text>` });
  if (spec.links.some((l) => l.kind === 'direct')) items.push({ w: 28 + tw('직접 연결', 12) + 24, svg: (x) => `<line x1="${x}" y1="${ly - 4}" x2="${x + 22}" y2="${ly - 4}" stroke="#4a4f57" stroke-width="2.8" stroke-linecap="round"/><text x="${x + 28}" y="${ly}" font-family="${FONT}" font-size="12" fill="#555">직접 연결</text>` });
  if (spec.links.some((l) => l.kind === 'weak')) items.push({ w: 28 + tw('약한 관련', 12) + 24, svg: (x) => `<line x1="${x}" y1="${ly - 4}" x2="${x + 22}" y2="${ly - 4}" stroke="#4a4f57" stroke-width="1.4" stroke-dasharray="4 4"/><text x="${x + 28}" y="${ly}" font-family="${FONT}" font-size="12" fill="#555">약한 관련</text>` });
  const total = items.reduce((s, it) => s + it.w, 0);
  const keep = total > W - 60 ? items.filter((_, i) => i < spec.groups.length) : items; // 너무 길면 묶음 색만
  out.push(`<line x1="28" y1="${ly - 20}" x2="${W - 28}" y2="${ly - 20}" stroke="#e3e5e8" stroke-width="1"/>`);
  keep.forEach((it) => { out.push(it.svg(lx)); lx += it.w; });

  const accent = isHex(spec.accent) ? spec.accent : spec.groups[0].color;
  const title = spec.title ? `<text x="28" y="42" font-family="${FONT}" font-size="22" font-weight="800" fill="#1f242b">${esc(spec.title)}</text><rect x="28" y="52" width="44" height="4" rx="2" fill="${accent}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${out.join('')}</svg>`;
  return { svg, width: W, height: H };
}
