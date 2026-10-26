// 층별 조닝/단면 다이어그램: 건물을 단면처럼 층 띠로 쌓고, 층마다 프로그램 칸을 나누며,
// 보이드(수직 빈 공간)·코어·채광/바람/조망 같은 환경 요소와 공공성 변화 화살표를 얹는다.
//
// spec = { title, accent,
//   floors: [{ name:'1F', h?:4.2(층고 m), programs:[{name, tone:'public|semi|quiet|private|service', width:0~1, area?:'320㎡', no?:'1'}] }]   // 아래층부터
//   voids:  [{ from:0, to:3, x:0.45, w:0.18, label:'중앙 보이드' }]                                      // 층 인덱스, 건물 폭 대비 비율
//   cores:  [{ x:0.9, label:'코어' }]
//   forces: [{ kind:'light|wind|view|noise', label }]
//   gradient: { label:'공공성', from:'높음', to:'낮음' }  // 아래→위로 변하는 정도 화살표
//   entourage?: false 면 인물·수목 실루엣을 넣지 않는다
// }
// 2026-10-26 개선(참고삽도의 단면·조닝 도식 문법): 슬래브 두께선, 지반 해치, 층고 치수선(h), 번호 배지(no)·면적 줄(area), 인물·수목,
// 라벨 칩, 깨져 보이던 세로 글자 대신 가로 라벨, 타이틀 밑줄.

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const tw = (s, fs) => [...String(s)].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? fs : fs * 0.58), 0);

export const TONES = {
  public: '#F9D2A0', semi: '#F4E6A6', quiet: '#C9DDEC', private: '#D8DCE2', service: '#E9EAEE',
};
const TONE_LABEL = { public: '공공', semi: '준공공', quiet: '조용/학습', private: '사적', service: '지원' };

const W = 960; const BX = 220; const BW = 520; const FH = 82; const TOPY = 120;

export function normalizeStack(spec) {
  const floors = (Array.isArray(spec.floors) ? spec.floors : []).slice(0, 12).map((f, i) => {
    const progs = (Array.isArray(f.programs) && f.programs.length ? f.programs : [{ name: String(f.name ?? ''), tone: 'semi', width: 1 }]).slice(0, 6).map((p) => ({
      name: String(p.name ?? ''), tone: TONES[p.tone] ? p.tone : 'semi', width: clamp(p.width, 0.05, 1, 1),
      area: p.area === undefined || p.area === null ? '' : String(p.area).slice(0, 10), no: p.no === undefined || p.no === null ? '' : String(p.no).slice(0, 2),
    }));
    const hv = Number(f.h); const h = Number.isFinite(hv) && hv > 0 ? clamp(hv, 1.5, 30, 0) : 0; // 0·빈 값·숫자 아님 = 층고 없음(정규화를 두 번 해도 그대로)
    return { name: String(f.name ?? `${i + 1}F`), h, programs: progs };
  });
  if (!floors.length) throw new Error('floors 가 비어 있습니다.');
  const n = floors.length;
  const voids = (Array.isArray(spec.voids) ? spec.voids : []).slice(0, 3).map((v) => ({
    from: Math.round(clamp(v.from, 0, n - 1, 0)), to: Math.round(clamp(v.to, 0, n - 1, n - 1)), x: clamp(v.x, 0, 0.9, 0.4), w: clamp(v.w, 0.06, 0.4, 0.16), label: String(v.label ?? ''),
  })).map((v) => (v.from > v.to ? { ...v, from: v.to, to: v.from } : v));
  const cores = (Array.isArray(spec.cores) ? spec.cores : []).slice(0, 3).map((c) => ({ x: clamp(c.x, 0, 0.95, 0.9), label: String(c.label ?? '코어') }));
  const forces = (Array.isArray(spec.forces) ? spec.forces : []).slice(0, 4).map((f) => ({ kind: ['light', 'wind', 'view', 'noise'].includes(f.kind) ? f.kind : 'light', label: String(f.label ?? '') }));
  const gradient = spec.gradient && typeof spec.gradient === 'object' ? { label: String(spec.gradient.label ?? ''), from: String(spec.gradient.from ?? ''), to: String(spec.gradient.to ?? '') } : null;
  return { ...spec, floors, voids, cores, forces, gradient };
}

const arrow = (x1, y1, x2, y2, col, w = 2.2, dash = '') => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#stkar)"/>`;
// 라벨 칩: 흰 바탕 + 같은 색 테두리(글자 폭에 맞춘다)
const chip = (x, y, text, col, anchor = 'start') => {
  const w = tw(text, 12.5) + 14; const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return `<rect x="${x0.toFixed(1)}" y="${(y - 14).toFixed(1)}" width="${w.toFixed(1)}" height="21" rx="10.5" fill="#fff" stroke="${col}" stroke-width="1.3"/><text x="${(x0 + w / 2).toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12.5" font-weight="700" fill="${col}">${esc(text)}</text>`;
};
const tree = (x, gy, s = 1) => `<rect x="${(x - 1.6 * s).toFixed(1)}" y="${(gy - 12 * s).toFixed(1)}" width="${(3.2 * s).toFixed(1)}" height="${(12 * s).toFixed(1)}" fill="#A7AEB8"/><circle cx="${x.toFixed(1)}" cy="${(gy - 22 * s).toFixed(1)}" r="${(11 * s).toFixed(1)}" fill="#C3C9D1"/>`;
const person = (x, gy, s = 1) => `<circle cx="${x.toFixed(1)}" cy="${(gy - 31 * s).toFixed(1)}" r="${(3.6 * s).toFixed(1)}" fill="#8F97A3"/><path d="M${(x - 5.2 * s).toFixed(1)} ${gy} L${(x - 4 * s).toFixed(1)} ${(gy - 24 * s).toFixed(1)} Q${x.toFixed(1)} ${(gy - 28 * s).toFixed(1)} ${(x + 4 * s).toFixed(1)} ${(gy - 24 * s).toFixed(1)} L${(x + 5.2 * s).toFixed(1)} ${gy}Z" fill="#8F97A3"/>`;

export function renderStack(raw) {
  const spec = normalizeStack(raw);
  const n = spec.floors.length;
  const H = TOPY + n * FH + 100;
  const yOf = (i) => TOPY + (n - 1 - i) * FH; // 아래층(0)이 맨 아래
  const GY = TOPY + n * FH; // 땅선
  const out = [];
  out.push(`<defs><marker id="stkar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#444"/></marker><pattern id="stkht" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#9AA0A8" stroke-width="1.1"/></pattern></defs>`);

  // 지반: 회색 띠 + 해치 + 굵은 땅선
  out.push(`<rect x="${BX - 90}" y="${GY}" width="${BW + 180}" height="14" fill="#ECEEF1"/><rect x="${BX - 90}" y="${GY}" width="${BW + 180}" height="14" fill="url(#stkht)" opacity="0.7"/>`);
  out.push(`<line x1="${BX - 90}" y1="${GY}" x2="${BX + BW + 90}" y2="${GY}" stroke="#222" stroke-width="2.8"/>`);

  // 층 띠와 프로그램 칸
  spec.floors.forEach((f, i) => {
    const y = yOf(i); const total = f.programs.reduce((s, p) => s + p.width, 0) || 1; let x = BX;
    // 보이드·코어가 이 층을 지나가는 가로 구간(글자가 가려지지 않게 피한다)
    const blocked = [
      ...spec.voids.filter((v) => v.from <= i && i <= v.to).map((v) => [BX + v.x * BW, BX + (v.x + v.w) * BW]),
      ...spec.cores.map((c) => [BX + c.x * BW - 14, BX + c.x * BW + 14]),
    ];
    f.programs.forEach((p) => {
      const w = (p.width / total) * BW;
      out.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${FH}" fill="${TONES[p.tone]}" stroke="#fff" stroke-width="2.4"/>`);
      let a0 = x; let a1 = x + w;
      if (p.name || p.area) {
        // 칸에서 막힌 구간을 뺀 빈 구간 중 가장 넓은 곳에 글자를 둔다
        let free = [[x, x + w]];
        blocked.forEach(([b0, b1]) => { free = free.flatMap(([c0, c1]) => (b1 <= c0 || b0 >= c1 ? [[c0, c1]] : [[c0, Math.min(c1, b0)], [Math.max(c0, b1), c1]].filter(([d0, d1]) => d1 - d0 > 1))); });
        [a0, a1] = free.reduce((best, cur) => (cur[1] - cur[0] > best[1] - best[0] ? cur : best), free[0] || [x, x + w]);
        const room = a1 - a0 - 10; let text = p.name.slice(0, 12); let fs = w < 90 ? 11 : 13;
        while (text.length * fs * 0.95 > room && fs > 10) fs -= 0.5;
        if (text.length * fs * 0.95 > room) text = room < fs * 1.9 ? '' : `${text.slice(0, Math.max(1, Math.floor(room / (fs * 0.95)) - 1))}…`;
        const hasArea = !!p.area && room > 36;
        const cy = y + FH / 2 + (hasArea ? -3 : 4);
        if (text) out.push(`<text x="${((a0 + a1) / 2).toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#2b2f36">${esc(text)}</text>`);
        if (hasArea) out.push(`<text x="${((a0 + a1) / 2).toFixed(1)}" y="${(cy + 15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="500" fill="#5b616b">${esc(p.area)}</text>`);
      }
      if (p.no) out.push(`<rect x="${(x + 7).toFixed(1)}" y="${y + 7}" width="19" height="19" rx="3" fill="#1f242b"/><text x="${(x + 16.5).toFixed(1)}" y="${y + 21}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="800" fill="#fff">${esc(p.no)}</text>`);
      x += w;
    });
    out.push(`<text x="${BX - 18}" y="${(y + FH / 2 + 5).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="14" font-weight="800" fill="#333">${esc(f.name)}</text>`);
  });
  // 슬래브: 층 경계마다 두꺼운 선(건물 바깥으로 살짝 내민다) + 지붕 슬래브
  for (let i = 0; i <= n; i++) {
    const y = TOPY + i * FH; const top = i === 0;
    out.push(`<line x1="${BX - 8}" y1="${y}" x2="${BX + BW + 8}" y2="${y}" stroke="#222" stroke-width="${top ? 5 : 3.4}" stroke-linecap="square"/>`);
  }
  out.push(`<rect x="${BX}" y="${TOPY}" width="${BW}" height="${n * FH}" fill="none" stroke="#222" stroke-width="2.4"/>`);

  // 보이드: 흰 기둥 + 점선 테두리 + 위에서 내려오는 빛
  const hasLight = spec.forces.some((f) => f.kind === 'light');
  spec.voids.forEach((v) => {
    const x = BX + v.x * BW; const w = v.w * BW; const yTop = yOf(v.to); const yBot = yOf(v.from) + FH;
    out.push(`<rect x="${x.toFixed(1)}" y="${yTop + 2}" width="${w.toFixed(1)}" height="${yBot - yTop - 4}" fill="#FFFFFF" stroke="#555" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    if (hasLight && v.to === n - 1) {
      for (let k = 0; k < 4; k++) {
        const xx = x + w * (0.14 + 0.24 * k);
        out.push(`<line x1="${(xx - 14).toFixed(1)}" y1="${TOPY - 52}" x2="${xx.toFixed(1)}" y2="${(yTop + (yBot - yTop) * 0.7).toFixed(1)}" stroke="#F2B705" stroke-width="2.4" stroke-linecap="round" opacity="0.85" marker-end="url(#stkar)"/>`);
      }
    }
    if (v.label) out.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(yBot - 12).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="800" fill="#444">${esc(v.label)}</text>`);
  });
  // 코어
  spec.cores.forEach((c) => {
    const x = BX + c.x * BW - 14;
    out.push(`<rect x="${x.toFixed(1)}" y="${TOPY}" width="28" height="${n * FH}" fill="#3a3f47" fill-opacity="0.9"/>`);
    out.push(`<text x="${(x + 14).toFixed(1)}" y="${TOPY - 10}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#333">${esc(c.label)}</text>`);
  });

  // 층고 치수선(오른쪽): 층마다 h(m)가 있을 때만
  if (spec.floors.some((f) => f.h > 0)) {
    const dx = BX + BW + 128;
    out.push(`<line x1="${dx}" y1="${TOPY}" x2="${dx}" y2="${GY}" stroke="#1E5FA8" stroke-width="1.2"/>`);
    for (let i = 0; i <= n; i++) { const yy = TOPY + i * FH; out.push(`<line x1="${dx - 6}" y1="${yy}" x2="${dx + 6}" y2="${yy}" stroke="#1E5FA8" stroke-width="1.4"/>`); }
    spec.floors.forEach((f, i) => { if (f.h > 0) out.push(`<text x="${dx + 10}" y="${(yOf(i) + FH / 2 + 4).toFixed(1)}" font-family="${FONT}" font-size="12" font-weight="700" fill="#1E5FA8">${f.h.toFixed(1)}m</text>`); });
  }

  // 환경 요소: 채광(위) / 바람(왼쪽) / 조망(오른쪽) / 소음(아래)
  spec.forces.forEach((f) => {
    if (f.kind === 'light') {
      const sx = BX + BW + 12; const sy = TOPY - 52;
      for (let a = 0; a < 360; a += 45) out.push(`<line x1="${sx}" y1="${sy - 20}" x2="${sx}" y2="${sy - 26}" transform="rotate(${a} ${sx} ${sy})" stroke="#E0A800" stroke-width="2.2" stroke-linecap="round"/>`);
      out.push(`<circle cx="${sx}" cy="${sy}" r="14" fill="#F7C948" stroke="#E0A800" stroke-width="2"/>`);
      if (f.label) out.push(chip(sx + 34, sy + 5, f.label, '#8a6500'));
    } else if (f.kind === 'wind') {
      for (let k = 0; k < 3; k++) out.push(arrow(BX - 150, TOPY + 30 + k * 26, BX - 62, TOPY + 30 + k * 26, '#5B9BD5', 2.2));
      if (f.label) out.push(chip(BX - 150, TOPY + 124, f.label, '#2f6fa8'));
    } else if (f.kind === 'view') {
      for (let k = 0; k < 3; k++) out.push(arrow(BX + BW + 16, TOPY + 40 + k * 26, BX + BW + 100, TOPY + 28 + k * 22, '#3E8E41', 2.2, '5 4'));
      if (f.label) out.push(chip(BX + BW + 16, TOPY + 124, f.label, '#2e6b32'));
    } else {
      for (let k = 0; k < 3; k++) out.push(arrow(BX - 150, GY - 74 + k * 22, BX - 62, GY - 74 + k * 22, '#B45309', 2.2, '2 5'));
      if (f.label) out.push(chip(BX - 150, GY - 88, f.label, '#8a4306'));
    }
  });

  // 변화 화살표(공공성 등): 건물 왼쪽 바깥, 아래→위. 라벨은 가로로 맨 위에 둔다(세로 글자는 작을 때 뭉개진다)
  if (spec.gradient && (spec.gradient.label || spec.gradient.from || spec.gradient.to)) {
    const gx = BX - 84; const y0 = GY - 6; const y1 = TOPY + 6;
    out.push(`<line x1="${gx}" y1="${y0}" x2="${gx}" y2="${y1}" stroke="#444" stroke-width="3" marker-end="url(#stkar)"/>`);
    if (spec.gradient.to) out.push(`<text x="${gx}" y="${y1 - 8}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#444">${esc(spec.gradient.to)}</text>`);
    if (spec.gradient.from) out.push(`<text x="${gx}" y="${y0 + 34}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#444">${esc(spec.gradient.from)}</text>`);
    if (spec.gradient.label) out.push(chip(gx, y1 - 28, spec.gradient.label, '#444', 'middle'));
  }

  // 인물·수목(단면 느낌): 오른쪽은 항상, 왼쪽은 소음 화살표가 없을 때만
  if (spec.entourage !== false) {
    out.push(tree(BX + BW + 34, GY, 1), person(BX + BW + 62, GY, 1), person(BX + BW + 74, GY, 0.92), tree(BX + BW + 104, GY, 0.9));
    if (!spec.forces.some((f) => f.kind === 'noise')) out.push(tree(BX - 134, GY, 0.95), person(BX - 104, GY, 1));
  }

  // 범례(쓰인 성격만)
  const used = [...new Set(spec.floors.flatMap((f) => f.programs.map((p) => p.tone)))];
  let lx = BX; const ly = GY + 52;
  used.forEach((t) => {
    out.push(`<rect x="${lx}" y="${ly - 12}" width="16" height="16" rx="4" fill="${TONES[t]}" stroke="#b9bec6"/><text x="${lx + 23}" y="${ly + 1}" font-family="${FONT}" font-size="12.5" font-weight="600" fill="#333">${TONE_LABEL[t]}</text>`);
    lx += 40 + TONE_LABEL[t].length * 13;
  });

  const accent = /^#[0-9a-fA-F]{6}$/.test(spec.accent || '') ? spec.accent : '#F28C28';
  const title = spec.title ? `<text x="28" y="44" font-family="${FONT}" font-size="22" font-weight="800" fill="#1f242b">${esc(spec.title)}</text><rect x="28" y="54" width="44" height="4" rx="2" fill="${accent}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${out.join('')}</svg>`;
  return { svg, width: W, height: H };
}
