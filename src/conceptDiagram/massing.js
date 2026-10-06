// 아이소메트릭 매스 과정도 렌더러(EXTRUSION / SUBTRACTION / ADDITION / FINAL FORM 식 단계도).
// AI는 "격자 단위의 박스 목록"만 정하고, 투영/음영/깊이 정렬/화살표는 여기서 계산한다.
// 좌표: x는 오른쪽-아래, y는 왼쪽-아래, z는 위쪽(단위: 모듈). 박스 {x,y,z,w,d,h,mode,move,len}.

export const BOX_MODES = ['solid', 'add', 'subtract', 'ghost'];

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v, d, lo = -50, hi = 50) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const S = 30; const ZS = 24; const C30 = 0.8660254;
const proj = (x, y, z) => [(x - y) * C30 * S, (x + y) * 0.5 * S - z * ZS];

const normBox = (b) => ({
  x: num(b.x, 0), y: num(b.y, 0), z: num(b.z, 0, 0, 30),
  w: Math.max(0.2, num(b.w, 1, 0, 30)), d: Math.max(0.2, num(b.d, 1, 0, 30)), h: Math.max(0.1, num(b.h, 1, 0, 30)),
  mode: BOX_MODES.includes(b.mode) ? b.mode : 'solid',
  move: b.move === 'up' || b.move === 'down' ? b.move : null,
  len: num(b.len, 1.2, 0.3, 10),
  color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : null,
});

const poly = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function boxSvg(b, accent) {
  const { x, y, z, w, d, h } = b;
  const x1 = x + w; const y1 = y + d; const z1 = z + h;
  const top = [proj(x, y, z1), proj(x1, y, z1), proj(x1, y1, z1), proj(x, y1, z1)];
  const left = [proj(x, y1, z), proj(x1, y1, z), proj(x1, y1, z1), proj(x, y1, z1)];
  const right = [proj(x1, y, z), proj(x1, y1, z), proj(x1, y1, z1), proj(x1, y, z1)];
  const marked = b.mode === 'add' || b.mode === 'subtract';
  const base = b.color || accent;
  if (b.mode === 'ghost') {
    const st = 'fill="none" stroke="#7a7f87" stroke-width="1" stroke-dasharray="4 3"';
    return `<polygon points="${poly(top)}" ${st}/><polygon points="${poly(left)}" ${st}/><polygon points="${poly(right)}" ${st}/>`;
  }
  if (marked) {
    const st = `stroke="#5e2f1d" stroke-width="1.1" stroke-linejoin="round"`;
    return `<polygon points="${poly(left)}" fill="${base}" fill-opacity="0.62" ${st}/><polygon points="${poly(right)}" fill="${base}" fill-opacity="0.78" ${st}/><polygon points="${poly(top)}" fill="${base}" fill-opacity="0.45" ${st}/>`;
  }
  const st = 'stroke="#2b2b2b" stroke-width="1.15" stroke-linejoin="round"';
  const [tc, lc, rc] = b.color ? [b.color, b.color, b.color] : ['#FFFFFF', '#DEDEDE', '#EFEFEF'];
  return `<polygon points="${poly(left)}" fill="${lc}" ${st}/><polygon points="${poly(right)}" fill="${rc}" ${st}/><polygon points="${poly(top)}" fill="${tc}" ${st}/>`;
}

function arrowsSvg(b, uid) {
  if (!b.move) return '';
  const { x, y, z, w, d } = b;
  const x1 = x + w; const y1 = y + d;
  const dir = b.move === 'up' ? 1 : -1;
  const z0 = b.move === 'up' ? z : z;
  const starts = [[x1, y1], [x, y1], [x1, y]].map(([px, py]) => [px, py]);
  const marker = `<marker id="${uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d1d1d"/></marker>`;
  const lines = starts.map(([px, py]) => {
    const a = proj(px, py, z0); const bpt = proj(px, py, z0 + dir * b.len);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${bpt[0].toFixed(1)}" y2="${bpt[1].toFixed(1)}" stroke="#1d1d1d" stroke-width="1.3" stroke-dasharray="3.2 2.6" marker-end="url(#${uid})"/>`;
  }).join('');
  return `<defs>${marker}</defs>${lines}`;
}

export const MASSING_COLS = 2;
export const MASSING_PANEL_W = 460;
export const MASSING_PANEL_H = 360;

export function renderMassing(spec) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(spec.accent || '') ? spec.accent : '#C97B5A';
  const steps = (Array.isArray(spec.steps) ? spec.steps : []).slice(0, 8).map((s) => ({
    label: String(s.label || ''),
    ground: s.ground && typeof s.ground === 'object' ? { x: num(s.ground.x, 0), y: num(s.ground.y, 0), w: num(s.ground.w, 6, 1, 40), d: num(s.ground.d, 5, 1, 40) } : null,
    boxes: (Array.isArray(s.boxes) ? s.boxes : []).slice(0, 24).map(normBox),
  }));
  const cols = Math.min(MASSING_COLS, Math.max(1, steps.length));
  const rows = Math.ceil(steps.length / cols) || 1;
  const titleH = spec.title ? 60 : 0;
  const W = cols * MASSING_PANEL_W; const H = titleH + rows * MASSING_PANEL_H;

  // 모든 단계가 같은 배율/위치를 쓰도록 전체 경계를 먼저 구한다(단계 간 크기 비교가 되게).
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const grow = (p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); };
  steps.forEach((s) => {
    s.boxes.forEach((b) => {
      [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]].forEach(([px, py]) => {
        grow(proj(px, py, b.z)); grow(proj(px, py, b.z + b.h));
        if (b.move) grow(proj(px, py, b.z + (b.move === 'up' ? b.len : -b.len)));
      });
    });
    const g = s.ground;
    if (g) [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.d], [g.x + g.w, g.y + g.d]].forEach(([px, py]) => grow(proj(px, py, 0)));
  });
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const availW = MASSING_PANEL_W - 70; const availH = MASSING_PANEL_H - 120;
  const k = Math.min(availW / (maxX - minX || 1), availH / (maxY - minY || 1), 1.6);
  const offX = (MASSING_PANEL_W - (maxX - minX) * k) / 2 - minX * k;
  const offY = 30 + (availH - (maxY - minY) * k) / 2 - minY * k;

  const panels = steps.map((s, i) => {
    const ox = (i % cols) * MASSING_PANEL_W; const oy = titleH + Math.floor(i / cols) * MASSING_PANEL_H;
    const parts = [];
    if (s.ground) {
      const g = s.ground; const pad = 0.6;
      const pts = [proj(g.x - pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y + g.d + pad, 0), proj(g.x - pad, g.y + g.d + pad, 0)];
      parts.push(`<polygon points="${poly(pts)}" fill="#D99A78" fill-opacity="0.75" stroke="#7b4a35" stroke-width="1" stroke-dasharray="1.6 2.6"/>`);
    }
    const sorted = s.boxes.map((b, idx) => ({ b, idx })).sort((p, q) => {
      // 뒤(작은 x+y) → 앞(큰 x+y) 순으로 그리되, 위로 뜬 박스는 아래 박스 위에 겹쳐 그려지도록 z 도 더한다.
      const kp = p.b.x + p.b.w + p.b.y + p.b.d + p.b.z + p.b.h; const kq = q.b.x + q.b.w + q.b.y + q.b.d + q.b.z + q.b.h;
      return kp - kq || p.b.z - q.b.z;
    });
    sorted.forEach(({ b, idx }) => {
      parts.push(boxSvg(b, accent));
      parts.push(arrowsSvg(b, `m${i}_${idx}`));
    });
    const label = `<text x="${MASSING_PANEL_W / 2}" y="${MASSING_PANEL_H - 28}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="1.4" fill="#1f1f1f">${esc(s.label)}</text>`;
    return `<g transform="translate(${ox} ${oy})"><g transform="translate(${offX.toFixed(1)} ${offY.toFixed(1)}) scale(${k.toFixed(3)})">${parts.join('')}</g>${label}</g>`;
  }).join('');
  const title = spec.title ? `<text x="24" y="40" font-family="${FONT}" font-size="24" font-weight="800" fill="#1f242b">${esc(spec.title)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${title}${panels}</svg>`;
  return { svg, width: W, height: H };
}

// ── 선 도식 스타일(채움 없음, 단선): '이미지 → 깔끔한 선'에서 복잡한 칸을 구조로 단순화해 다시 그릴 때 쓴다 ──
// boxes: [{x,y,z,w,d,h}], ground: {x,y,w,d}. 반환: (w x h) 안에 맞춘 <g> 조각과 그 안에서 쓴 선 굵기.
export function renderMassingLineGroup(boxes, ground, w, h, strokeUnit = 1.6) {
  const bs = (Array.isArray(boxes) ? boxes : []).slice(0, 24).map(normBox);
  const g = ground && typeof ground === 'object' ? { x: num(ground.x, 0), y: num(ground.y, 0), w: num(ground.w, 6, 1, 40), d: num(ground.d, 5, 1, 40) } : null;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const grow = (p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); };
  bs.forEach((b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]].forEach(([px, py]) => { grow(proj(px, py, b.z)); grow(proj(px, py, b.z + b.h)); }));
  if (g) [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.d], [g.x + g.w, g.y + g.d]].forEach(([px, py]) => grow(proj(px, py, 0)));
  if (!Number.isFinite(minX)) return '';
  const k = Math.min((w * 0.92) / (maxX - minX || 1), (h * 0.92) / (maxY - minY || 1));
  const offX = (w - (maxX - minX) * k) / 2 - minX * k; const offY = (h - (maxY - minY) * k) / 2 - minY * k;
  const sw = (strokeUnit / k).toFixed(3); const swThin = ((strokeUnit * 0.55) / k).toFixed(3);
  const parts = [];
  if (g) {
    const pad = 0.5;
    const pts = [proj(g.x - pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y - pad, 0), proj(g.x + g.w + pad, g.y + g.d + pad, 0), proj(g.x - pad, g.y + g.d + pad, 0)];
    parts.push(`<polygon points="${poly(pts)}" fill="#fff" stroke="#1d1d1d" stroke-width="${swThin}" stroke-linejoin="round"/>`);
  }
  bs.map((b, idx) => ({ b, idx })).sort((p, q) => {
    const kp = p.b.x + p.b.w + p.b.y + p.b.d + p.b.z + p.b.h; const kq = q.b.x + q.b.w + q.b.y + q.b.d + q.b.z + q.b.h;
    return kp - kq || p.b.z - q.b.z;
  }).forEach(({ b }) => {
    const x1 = b.x + b.w; const y1 = b.y + b.d; const z1 = b.z + b.h;
    const top = [proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, y1, z1), proj(b.x, y1, z1)];
    const left = [proj(b.x, y1, b.z), proj(x1, y1, b.z), proj(x1, y1, z1), proj(b.x, y1, z1)];
    const right = [proj(x1, b.y, b.z), proj(x1, y1, b.z), proj(x1, y1, z1), proj(x1, b.y, z1)];
    const st = `fill="#fff" stroke="#1d1d1d" stroke-width="${swThin}" stroke-linejoin="round"`;
    parts.push(`<polygon points="${poly(left)}" ${st}/><polygon points="${poly(right)}" ${st}/><polygon points="${poly(top)}" ${st}/>`);
    // 바깥 윤곽(위 마름모의 뒤쪽 두 변 + 양쪽 세로 모서리 + 아래 앞쪽 두 변)은 굵게
    const bold = `fill="none" stroke="#1d1d1d" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
    const hex = [proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, b.y, b.z + 0), proj(x1, y1, b.z), proj(b.x, y1, b.z), proj(b.x, y1, z1)];
    parts.push(`<polygon points="${poly([proj(b.x, y1, z1), proj(b.x, b.y, z1), proj(x1, b.y, z1), proj(x1, y1, z1), proj(x1, y1, b.z), proj(b.x, y1, b.z)])}" ${bold}/>`);
    void hex;
  });
  return `<g transform="translate(${offX.toFixed(2)} ${offY.toFixed(2)}) scale(${k.toFixed(4)})">${parts.join('')}</g>`;
}
