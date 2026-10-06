// 프로그램 버블 다이어그램: 공간(프로그램)을 원으로, 면적/중요도를 원 크기로, 성격이 같은 것은 같은 색 묶음으로 그린다.
// AI는 groups / nodes / links 만 정하고, 배치는 여기서 결정적으로 계산한다(같은 입력이면 항상 같은 그림).
//
// spec = { title, accent, groups:[{id,name,color}], nodes:[{id,label,group,size 1~5}], links:[{from,to,kind:'direct|weak',label}] }

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const PALETTE = ['#F28C28', '#3E8E41', '#1E90C8', '#C2410C', '#7C5CBF', '#B8860B', '#D6457B', '#4B5563'];

const W = 920; const H = 640; const PAD = 40; const TOP = 70;

export function normalizeProgram(spec) {
  const groups = (Array.isArray(spec.groups) ? spec.groups : []).slice(0, 8).map((g, i) => ({
    id: String(g.id ?? `g${i + 1}`), name: String(g.name ?? ''), color: isHex(g.color) ? g.color : PALETTE[i % PALETTE.length],
  }));
  if (!groups.length) groups.push({ id: 'g1', name: '', color: PALETTE[0] });
  const gid = new Set(groups.map((g) => g.id));
  const seen = new Set();
  const nodes = (Array.isArray(spec.nodes) ? spec.nodes : []).slice(0, 40).map((n, i) => {
    let id = String(n.id ?? `n${i + 1}`); while (seen.has(id)) id += '_'; seen.add(id);
    return { id, label: String(n.label ?? ''), group: gid.has(String(n.group)) ? String(n.group) : groups[0].id, size: Math.min(5, Math.max(1, Number(n.size) || 2)) };
  });
  if (!nodes.length) throw new Error('nodes 가 비어 있습니다.');
  const links = (Array.isArray(spec.links) ? spec.links : []).slice(0, 60).filter((l) => seen.has(String(l.from)) && seen.has(String(l.to)) && l.from !== l.to)
    .map((l) => ({ from: String(l.from), to: String(l.to), kind: l.kind === 'weak' ? 'weak' : 'direct', label: String(l.label ?? '') }));
  return { ...spec, groups, nodes, links };
}

function layout(spec) {
  const gi = Object.fromEntries(spec.groups.map((g, i) => [g.id, i]));
  const G = spec.groups.length;
  const cx0 = W / 2; const cy0 = TOP + (H - TOP) / 2;
  // 묶음 중심: 원형(2개 이상) 배치
  const centers = spec.groups.map((_, i) => (G === 1 ? [cx0, cy0] : [cx0 + Math.cos((2 * Math.PI * i) / G - Math.PI / 2) * (W * 0.26), cy0 + Math.sin((2 * Math.PI * i) / G - Math.PI / 2) * ((H - TOP) * 0.27)]));
  const byG = spec.groups.map(() => []);
  spec.nodes.forEach((n) => byG[gi[n.group]].push(n));
  const P = {}; const R = {};
  spec.nodes.forEach((n) => { R[n.id] = 16 + n.size * 8; });
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
        const need = R[a] + R[b] + (same ? 8 : 30);
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

export function renderProgram(raw) {
  const spec = normalizeProgram(raw);
  const { P, R } = layout(spec);
  const ids = spec.nodes.map((n) => n.id);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  ids.forEach((id) => { x0 = Math.min(x0, P[id][0] - R[id]); y0 = Math.min(y0, P[id][1] - R[id]); x1 = Math.max(x1, P[id][0] + R[id]); y1 = Math.max(y1, P[id][1] + R[id]); });
  const k = Math.min((W - PAD * 2 - 60) / (x1 - x0 || 1), (H - TOP - PAD * 2 - 30) / (y1 - y0 || 1), 1.5);
  const ox = (W - (x1 - x0) * k) / 2 - x0 * k; const oy = TOP + (H - TOP - (y1 - y0) * k) / 2 - y0 * k + 6;
  const T = (id) => [P[id][0] * k + ox, P[id][1] * k + oy];
  const gcol = Object.fromEntries(spec.groups.map((g) => [g.id, g.color]));
  const out = [];

  // 묶음 바탕(부드러운 타원) + 이름
  spec.groups.forEach((g) => {
    const mem = spec.nodes.filter((n) => n.group === g.id); if (!mem.length) return;
    let a0 = Infinity; let b0 = Infinity; let a1 = -Infinity; let b1 = -Infinity;
    mem.forEach((n) => { const [x, y] = T(n.id); const r = R[n.id] * k; a0 = Math.min(a0, x - r); b0 = Math.min(b0, y - r); a1 = Math.max(a1, x + r); b1 = Math.max(b1, y + r); });
    const cx = (a0 + a1) / 2; const cy = (b0 + b1) / 2; const rx = (a1 - a0) / 2 + 26; const ry = (b1 - b0) / 2 + 26;
    out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${g.color}" fill-opacity="0.10" stroke="${g.color}" stroke-opacity="0.55" stroke-width="1.4" stroke-dasharray="6 5"/>`);
    if (g.name) out.push(`<text x="${cx.toFixed(1)}" y="${(cy - ry - 8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="800" fill="${g.color}">${esc(g.name)}</text>`);
  });
  // 연결선
  spec.links.forEach((l) => {
    const a = T(l.from); const b = T(l.to); const dx = b[0] - a[0]; const dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1;
    const ra = R[l.from] * k; const rb = R[l.to] * k;
    const sx = a[0] + (dx / d) * ra; const sy = a[1] + (dy / d) * ra; const ex = b[0] - (dx / d) * rb; const ey = b[1] - (dy / d) * rb;
    out.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#555" stroke-width="${l.kind === 'weak' ? 1.3 : 2.6}" stroke-linecap="round"${l.kind === 'weak' ? ' stroke-dasharray="4 4"' : ''} opacity="0.75"/>`);
    if (l.label) out.push(`<text x="${((sx + ex) / 2).toFixed(1)}" y="${((sy + ey) / 2 - 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="#444" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(l.label)}</text>`);
  });
  // 버블
  spec.nodes.forEach((n) => {
    const [x, y] = T(n.id); const r = R[n.id] * k; const col = gcol[n.group];
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.88" stroke="#fff" stroke-width="2.5"/>`);
    const label = n.label; const fs = Math.max(10.5, Math.min(15, r * 0.34));
    const lines = label.length > 5 && label.length <= 12 ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))] : [label.slice(0, 12)];
    lines.forEach((ln, i) => out.push(`<text x="${x.toFixed(1)}" y="${(y + fs * 0.35 + (i - (lines.length - 1) / 2) * fs * 1.15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs.toFixed(1)}" font-weight="700" fill="#fff">${esc(ln)}</text>`));
  });
  const title = spec.title ? `<text x="28" y="42" font-family="${FONT}" font-size="22" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${out.join('')}</svg>`;
  return { svg, width: W, height: H };
}
