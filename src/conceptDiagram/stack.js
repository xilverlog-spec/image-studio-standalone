// 층별 조닝/단면 다이어그램: 건물을 단면처럼 층 띠로 쌓고, 층마다 프로그램 칸을 나누며,
// 보이드(수직 빈 공간)·코어·채광/바람/조망 같은 환경 요소와 공공성 변화 화살표를 얹는다.
//
// spec = { title, accent,
//   floors: [{ name:'1F', programs:[{name, tone:'public|semi|quiet|private|service', width:0~1}] }]   // 아래층부터
//   voids:  [{ from:0, to:3, x:0.45, w:0.18, label:'중앙 보이드' }]                                      // 층 인덱스, 건물 폭 대비 비율
//   cores:  [{ x:0.9, label:'코어' }]
//   forces: [{ kind:'light|wind|view|noise', label }]
//   gradient: { label:'공공성', from:'높음', to:'낮음' }  // 아래→위로 변하는 정도 화살표
// }

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export const TONES = {
  public: '#F9D2A0', semi: '#F4E6A6', quiet: '#C9DDEC', private: '#D8DCE2', service: '#E9EAEE',
};
const TONE_LABEL = { public: '공공', semi: '준공공', quiet: '조용/학습', private: '사적', service: '지원' };

const W = 960; const BX = 220; const BW = 520; const FH = 82; const TOPY = 120;

export function normalizeStack(spec) {
  const floors = (Array.isArray(spec.floors) ? spec.floors : []).slice(0, 12).map((f, i) => {
    const progs = (Array.isArray(f.programs) && f.programs.length ? f.programs : [{ name: String(f.name ?? ''), tone: 'semi', width: 1 }]).slice(0, 6).map((p) => ({
      name: String(p.name ?? ''), tone: TONES[p.tone] ? p.tone : 'semi', width: clamp(p.width, 0.05, 1, 1),
    }));
    return { name: String(f.name ?? `${i + 1}F`), programs: progs };
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

export function renderStack(raw) {
  const spec = normalizeStack(raw);
  const n = spec.floors.length;
  const H = TOPY + n * FH + 90;
  const yOf = (i) => TOPY + (n - 1 - i) * FH; // 아래층(0)이 맨 아래
  const out = [];
  out.push(`<defs><marker id="stkar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#444"/></marker></defs>`);

  // 땅선
  out.push(`<line x1="${BX - 60}" y1="${TOPY + n * FH}" x2="${BX + BW + 60}" y2="${TOPY + n * FH}" stroke="#333" stroke-width="2.4"/>`);
  // 층 띠와 프로그램 칸
  spec.floors.forEach((f, i) => {
    const y = yOf(i); const total = f.programs.reduce((s, p) => s + p.width, 0) || 1; let x = BX;
    f.programs.forEach((p) => {
      const w = (p.width / total) * BW;
      out.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${FH}" fill="${TONES[p.tone]}" stroke="#fff" stroke-width="2"/>`);
      if (p.name) out.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(y + FH / 2 + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${w < 90 ? 11 : 13}" font-weight="600" fill="#2b2f36">${esc(p.name.slice(0, 12))}</text>`);
      x += w;
    });
    out.push(`<text x="${BX - 14}" y="${(y + FH / 2 + 5).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="14" font-weight="800" fill="#444">${esc(f.name)}</text>`);
  });
  out.push(`<rect x="${BX}" y="${TOPY}" width="${BW}" height="${n * FH}" fill="none" stroke="#222" stroke-width="2.6"/>`);

  // 보이드: 흰 기둥 + 점선 테두리 + 위에서 내려오는 빛
  const hasLight = spec.forces.some((f) => f.kind === 'light');
  spec.voids.forEach((v, vi) => {
    const x = BX + v.x * BW; const w = v.w * BW; const yTop = yOf(v.to); const yBot = yOf(v.from) + FH;
    out.push(`<rect x="${x.toFixed(1)}" y="${yTop}" width="${w.toFixed(1)}" height="${yBot - yTop}" fill="#FFFFFF" stroke="#555" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    if (hasLight && v.to === n - 1) {
      for (let k = 0; k < 4; k++) {
        const xx = x + w * (0.14 + 0.24 * k);
        out.push(`<line x1="${(xx - 14).toFixed(1)}" y1="${TOPY - 52}" x2="${xx.toFixed(1)}" y2="${(yTop + (yBot - yTop) * 0.7).toFixed(1)}" stroke="#F2B705" stroke-width="2.4" stroke-linecap="round" opacity="0.85" marker-end="url(#stkar)"/>`);
      }
    }
    if (v.label) out.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(yBot - 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="800" fill="#444">${esc(v.label)}</text>`);
    void vi;
  });
  // 코어
  spec.cores.forEach((c) => {
    const x = BX + c.x * BW - 14;
    out.push(`<rect x="${x.toFixed(1)}" y="${TOPY}" width="28" height="${n * FH}" fill="#3a3f47" fill-opacity="0.88"/>`);
    out.push(`<text x="${(x + 14).toFixed(1)}" y="${TOPY - 8}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#333">${esc(c.label)}</text>`);
  });

  // 환경 요소: 채광(위) / 바람(왼쪽) / 조망(오른쪽) / 소음(아래)
  spec.forces.forEach((f) => {
    if (f.kind === 'light') {
      out.push(`<circle cx="${BX + BW + 10}" cy="${TOPY - 52}" r="15" fill="#F7C948" stroke="#E0A800" stroke-width="2"/>`);
      if (f.label) out.push(`<text x="${BX + BW + 36}" y="${TOPY - 47}" font-family="${FONT}" font-size="13" font-weight="700" fill="#8a6500">${esc(f.label)}</text>`);
    } else if (f.kind === 'wind') {
      for (let k = 0; k < 3; k++) out.push(arrow(BX - 150, TOPY + 30 + k * 26, BX - 56, TOPY + 30 + k * 26, '#5B9BD5', 2.2));
      if (f.label) out.push(`<text x="${BX - 150}" y="${TOPY + 124}" font-family="${FONT}" font-size="13" font-weight="700" fill="#2f6fa8">${esc(f.label)}</text>`);
    } else if (f.kind === 'view') {
      for (let k = 0; k < 3; k++) out.push(arrow(BX + BW + 16, TOPY + 40 + k * 26, BX + BW + 100, TOPY + 28 + k * 22, '#3E8E41', 2.2, '5 4'));
      if (f.label) out.push(`<text x="${BX + BW + 16}" y="${TOPY + 124}" font-family="${FONT}" font-size="13" font-weight="700" fill="#2e6b32">${esc(f.label)}</text>`);
    } else {
      for (let k = 0; k < 3; k++) out.push(arrow(BX - 150, TOPY + n * FH - 90 + k * 22, BX - 56, TOPY + n * FH - 90 + k * 22, '#B45309', 2.2, '2 5'));
      if (f.label) out.push(`<text x="${BX - 150}" y="${TOPY + n * FH - 100}" font-family="${FONT}" font-size="13" font-weight="700" fill="#8a4306">${esc(f.label)}</text>`);
    }
  });

  // 변화 화살표(공공성 등): 건물 왼쪽 바깥, 아래→위
  if (spec.gradient && (spec.gradient.label || spec.gradient.from || spec.gradient.to)) {
    const gx = BX - 78; const y0 = TOPY + n * FH - 6; const y1 = TOPY + 6;
    out.push(`<line x1="${gx}" y1="${y0}" x2="${gx}" y2="${y1}" stroke="#444" stroke-width="3" marker-end="url(#stkar)"/>`);
    if (spec.gradient.to) out.push(`<text x="${gx}" y="${y1 - 8}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#444">${esc(spec.gradient.to)}</text>`);
    if (spec.gradient.from) out.push(`<text x="${gx}" y="${y0 + 18}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#444">${esc(spec.gradient.from)}</text>`);
    if (spec.gradient.label) out.push(`<text x="${gx - 12}" y="${(y0 + y1) / 2}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="800" fill="#444" transform="rotate(-90 ${gx - 12} ${(y0 + y1) / 2})">${esc(spec.gradient.label)}</text>`);
  }

  // 범례(쓰인 성격만)
  const used = [...new Set(spec.floors.flatMap((f) => f.programs.map((p) => p.tone)))];
  let lx = BX; const ly = TOPY + n * FH + 40;
  used.forEach((t) => {
    out.push(`<rect x="${lx}" y="${ly - 12}" width="16" height="16" rx="3" fill="${TONES[t]}" stroke="#bbb"/><text x="${lx + 23}" y="${ly + 1}" font-family="${FONT}" font-size="12.5" font-weight="600" fill="#333">${TONE_LABEL[t]}</text>`);
    lx += 40 + TONE_LABEL[t].length * 13;
  });

  const title = spec.title ? `<text x="28" y="44" font-family="${FONT}" font-size="22" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${out.join('')}</svg>`;
  return { svg, width: W, height: H };
}
