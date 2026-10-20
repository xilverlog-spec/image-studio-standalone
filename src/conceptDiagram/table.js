// 개요표(건축개요·면적표 등 라벨–값 표): 2~4열, 두 스타일. 병합 셀·계산은 없다.
// 손스케치(memo.table)와 구조형(adds kind 'table')이 함께 쓴다. 좌표는 그리는 좌표(px), (x, y) = 표의 왼쪽 위.
//  table = { title, cols(2~4), style('label'|'stripe'), rows:[[셀,…],…] }   — 열 너비는 글자 길이에 맞춰 자동

export const TABLE_STYLES = ['label', 'stripe'];
export const TABLE_STYLE_LABEL = { label: '회색 라벨 열 + 가는 선', stripe: '색 띠 + 줄무늬' };
export const TABLE_COLOR = '#2F6B4F';
export const TABLE_MAX_ROWS = 30;
export const TABLE_MAX_CELL = 40;
export const TABLE_MAX_TITLE = 40;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
// 라벨 열: 라벨형 표는 첫째 열(4열이면 셋째 열도)이 회색 바탕의 굵은 글자
export const isLabelCol = (t, ci) => t.style === 'label' && (ci === 0 || (t.cols === 4 && ci === 2));
export const textW = (t, size) => [...String(t ?? '')].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? size : /\s/.test(ch) ? size * 0.32 : size * 0.58), 0);

export const SAMPLE_TABLE = { title: '건축개요', cols: 2, style: 'label', rows: [['대지위치', '서울시 ○○구 ○○동'], ['용도', '공동주택'], ['규모', '지하 2층 / 지상 15층'], ['연면적', '12,345㎡']] };

// 어떤 입력이든 올바른 표로: 열 수 2~4, 모든 행의 칸 수가 열 수와 같게, 글자 길이·행 수 한도
export function normalizeTable(t) {
  const o = t && typeof t === 'object' ? t : {};
  const cols = Math.min(4, Math.max(2, Math.round(Number(o.cols)) || 2));
  const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, TABLE_MAX_ROWS).map((r) => { const a = Array.isArray(r) ? r : []; return Array.from({ length: cols }, (_, i) => String(a[i] ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_CELL)); });
  return { title: String(o.title ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_TITLE), cols, style: TABLE_STYLES.includes(o.style) ? o.style : 'label', rows };
}

// 편집 도우미(모두 새 표를 돌려준다)
export const tableSetCell = (t, r, c, v) => { const n = normalizeTable(t); if (r < 0) return { ...n, title: String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_TITLE) }; if (!n.rows[r] || c < 0 || c >= n.cols) return n; return { ...n, rows: n.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_CELL) : x)) : row)) }; };
export const tableAddRow = (t, at) => { const n = normalizeTable(t); if (n.rows.length >= TABLE_MAX_ROWS) return n; const row = Array.from({ length: n.cols }, () => ''); const i = at === undefined ? n.rows.length : Math.min(n.rows.length, Math.max(0, at)); return { ...n, rows: [...n.rows.slice(0, i), row, ...n.rows.slice(i)] }; };
export const tableDelRow = (t, i) => { const n = normalizeTable(t); return n.rows.length <= 1 || i < 0 || i >= n.rows.length ? n : { ...n, rows: n.rows.filter((_, k) => k !== i) }; };
export const tableMoveRow = (t, i, d) => { const n = normalizeTable(t); const j = i + d; if (i < 0 || j < 0 || i >= n.rows.length || j >= n.rows.length) return n; const rows = [...n.rows]; [rows[i], rows[j]] = [rows[j], rows[i]]; return { ...n, rows }; };
export const tableSetCols = (t, cols) => normalizeTable({ ...t, cols }); // 줄이면 오른쪽 열이 잘리고 늘리면 빈 열이 생긴다

// 색을 흰색과 섞어 연하게(줄무늬 바탕)
const tint = (hex, k) => { const m = /^#([0-9a-fA-F]{6})$/.exec(hex || ''); if (!m) return '#F2F2F2'; const n = parseInt(m[1], 16); const mix = (v) => Math.round(v + (255 - v) * k); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`; };
const NUM = /^[-+]?[\d,.]+\s*(㎡|m²|㎥|m|mm|cm|%|대|세대|층|명|원|억|만원|개)?$/;

// 배치: 열 너비(글자 길이에 맞춤)·행 높이·셀 위치·전체 크기
export function tableLayout(c) {
  const t = normalizeTable(c.table ?? c); const s = Math.max(6, Number(c.size) || 14); const x = Number(c.x) || 0; const y = Number(c.y) || 0;
  const padX = s * 0.7; const rowH = s * 2.0; const titleH = t.title ? s * (t.style === 'stripe' ? 2.2 : 2.0) : 0;
  const colW = Array.from({ length: t.cols }, (_, ci) => Math.max(s * 3.2, ...t.rows.map((r) => textW(r[ci], s) * (isLabelCol(t, ci) ? 1.06 : 1))) + padX * 2);
  const w = colW.reduce((a, b) => a + b, 0); const tw = t.title ? textW(t.title, s * 1.05) * 1.08 + padX * 2 : 0; if (tw > w) colW[t.cols - 1] += tw - w; // 제목이 더 길면 마지막 열을 넓힌다
  const W = colW.reduce((a, b) => a + b, 0); const colX = colW.reduce((a, cw, i) => { a.push(i ? a[i - 1] + colW[i - 1] : x); return a; }, []);
  const rows = t.rows.map((r, ri) => ({ y: y + titleH + ri * rowH, h: rowH, cells: r.map((v, ci) => ({ r: ri, c: ci, x: colX[ci], w: colW[ci], text: v })) }));
  return { t, s, x, y, w: W, h: titleH + t.rows.length * rowH, titleH, rowH, padX, colW, colX, rows };
}

// 그림(SVG 조각). id·interactive 가 있으면 눌러서 고를 수 있게(data-eid) 하고 셀마다 data-cell="행,열"(제목은 -1,0)인 투명 사각형을 둔다
export function tableSvg(c, { id = '', interactive = false, font = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif" } = {}) {
  const L = tableLayout(c); const col = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : TABLE_COLOR; const { t, s } = L; const stripe = t.style === 'stripe';
  const o = [];
  if (interactive) o.push(`<rect x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.h)}" fill="transparent"/>`);
  if (t.title) {
    if (stripe) o.push(`<rect x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.titleH)}" fill="${col}"/>`);
    o.push(`<text x="${f1(L.x + L.padX)}" y="${f1(L.y + L.titleH / 2 + s * 0.38)}" font-family="${font}" font-size="${f1(s * 1.05)}" font-weight="800" fill="${stripe ? '#FFFFFF' : '#222222'}">${esc(t.title)}</text>`);
    if (!stripe) o.push(`<line x1="${f1(L.x)}" y1="${f1(L.y + L.titleH)}" x2="${f1(L.x + L.w)}" y2="${f1(L.y + L.titleH)}" stroke="${col}" stroke-width="${f1(Math.max(1.6, s * 0.14))}"/>`);
  }
  const lw = Math.max(0.8, s * 0.06);
  L.rows.forEach((row, ri) => {
    if (stripe && ri % 2 === 0) o.push(`<rect x="${f1(L.x)}" y="${f1(row.y)}" width="${f1(L.w)}" height="${f1(row.h)}" fill="${tint(col, 0.88)}"/>`);
    if (!stripe) L.colW.forEach((cw, ci) => { if (isLabelCol(t, ci)) o.push(`<rect x="${f1(L.colX[ci])}" y="${f1(row.y)}" width="${f1(cw)}" height="${f1(row.h)}" fill="#EDEDED"/>`); });
    if (!stripe && ri < L.rows.length - 1) o.push(`<line x1="${f1(L.x)}" y1="${f1(row.y + row.h)}" x2="${f1(L.x + L.w)}" y2="${f1(row.y + row.h)}" stroke="#B5B5B5" stroke-width="${f1(lw)}"/>`);
    row.cells.forEach((cell) => {
      const label = isLabelCol(t, cell.c); const right = stripe && cell.c > 0 && NUM.test(cell.text.trim());
      if (cell.text) o.push(`<text x="${f1(right ? cell.x + cell.w - L.padX : cell.x + L.padX)}" y="${f1(row.y + row.h / 2 + s * 0.35)}"${right ? ' text-anchor="end"' : ''} font-family="${font}" font-size="${f1(s)}" font-weight="${label ? 700 : 500}" fill="#222222">${esc(cell.text)}</text>`);
    });
  });
  if (L.rows.length) { // 바깥 위·아래 선(라벨형) 또는 바깥 테두리(줄무늬형)
    if (stripe) o.push(`<rect x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.h)}" fill="none" stroke="${col}" stroke-width="${f1(lw * 1.3)}"/>`);
    else { const yb = L.y + L.h; o.push(`<line x1="${f1(L.x)}" y1="${f1(yb)}" x2="${f1(L.x + L.w)}" y2="${f1(yb)}" stroke="${col}" stroke-width="${f1(Math.max(1.6, s * 0.14))}"/>`); if (!t.title) o.push(`<line x1="${f1(L.x)}" y1="${f1(L.y)}" x2="${f1(L.x + L.w)}" y2="${f1(L.y)}" stroke="${col}" stroke-width="${f1(Math.max(1.6, s * 0.14))}"/>`); }
  }
  if (interactive) { // 셀 하나하나를 눌러 고칠 수 있게(빈 칸 포함) 투명한 사각형. 제목은 -1,0
    if (t.title) o.push(`<rect data-cell="-1,0" x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.titleH)}" fill="transparent"/>`);
    L.rows.forEach((row) => row.cells.forEach((cell) => o.push(`<rect data-cell="${cell.r},${cell.c}" x="${f1(cell.x)}" y="${f1(row.y)}" width="${f1(cell.w)}" height="${f1(row.h)}" fill="transparent"/>`)));
  }
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}>${o.join('')}</g>`;
}
