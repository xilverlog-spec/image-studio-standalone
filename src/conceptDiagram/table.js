// 개요표(건축개요·면적표 등 라벨–값 표): 2~4열 두 스타일(label·stripe) + 설계개요형(doc, 3~5열). 계산은 없다.
// 손스케치(memo.table)와 구조형(adds kind 'table')이 함께 쓴다. 좌표는 그리는 좌표(px), (x, y) = 표의 왼쪽 위.
//  table = { title, cols(label·stripe 2~4 / doc 3~5), style('label'|'stripe'|'doc'), rows:[[셀,…],…], header?:[열 이름,…](doc), unit?:'단위: ㎡'(doc) }   — 열 너비는 글자 길이에 맞춰 자동
//  설계개요형(doc): 열 = [구분, 항목, 내용…, (비고)]. 구분 칸이 비면 위 구분을 잇는다(한 칸으로 합쳐 그림). 이름이 소계·합계·총계·전체·계인 줄은 굵게 + 연한 회색 면. 숫자 칸은 오른쪽 정렬.

export const TABLE_STYLES = ['label', 'stripe', 'doc'];
export const TABLE_STYLE_LABEL = { label: '회색 라벨 열 + 가는 선', stripe: '색 띠 + 줄무늬', doc: '설계개요형 (구분 합침·머리글·소계 줄)' };
export const TABLE_MAX_UNIT = 20;
const TOTAL_ROW = /^(소계|합계|총계|전체|계)$/;
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
  const style = TABLE_STYLES.includes(o.style) ? o.style : 'label'; const doc = style === 'doc';
  const minC = doc ? 3 : 2; const maxC = doc ? 5 : 4;
  const cols = Math.min(maxC, Math.max(minC, Math.round(Number(o.cols)) || minC));
  const clean = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_CELL);
  const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, TABLE_MAX_ROWS).map((r) => { const a = Array.isArray(r) ? r : []; return Array.from({ length: cols }, (_, i) => clean(a[i])); });
  const out = { title: String(o.title ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_TITLE), cols, style, rows };
  if (doc) { // 머리글·단위는 설계개요형에서만(없으면 필드 자체를 두지 않는다)
    const hd = Array.isArray(o.header) ? Array.from({ length: cols }, (_, i) => clean(o.header[i]).trim()) : null;
    if (hd && hd.some((v) => v !== '')) out.header = hd;
    const unit = String(o.unit ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, TABLE_MAX_UNIT); if (unit) out.unit = unit;
  }
  return out;
}
// 설계개요형의 구분 칸 합침: 첫째 열이 비어 있으면 위 구분을 잇는다. 반환 [{r0, r1}] (구분이 처음 나오기 전의 빈 칸은 합치지 않는다)
export function tableGroups(t) {
  const out = []; (t.rows || []).forEach((r, i) => { if (String(r[0] ?? '') !== '') out.push({ r0: i, r1: i }); else if (out.length) out[out.length - 1].r1 = i; });
  return out;
}
export const isTotalRow = (t, r) => t.style === 'doc' && !!r && [r[0], r[1]].some((v) => TOTAL_ROW.test(String(v ?? '').replace(/\s+/g, '')));

// 편집 도우미(모두 새 표를 돌려준다)
export const tableSetCell = (t, r, c, v) => { const n = normalizeTable(t); if (r < 0) return { ...n, title: String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_TITLE) }; if (!n.rows[r] || c < 0 || c >= n.cols) return n; return { ...n, rows: n.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, TABLE_MAX_CELL) : x)) : row)) }; };
export const tableAddRow = (t, at, fill = false) => { const n = normalizeTable(t); if (n.rows.length >= TABLE_MAX_ROWS) return n; const row = Array.from({ length: n.cols }, (_, ci) => (fill ? (n.style === 'doc' ? (ci === 0 ? '' : ci === 1 ? '항목' : '내용') : (ci === 0 ? '항목' : '내용')) : '')); const i = at === undefined ? n.rows.length : Math.min(n.rows.length, Math.max(0, at)); return { ...n, rows: [...n.rows.slice(0, i), row, ...n.rows.slice(i)] }; }; // fill: 그림 위에서 바로 고칠 수 있게 기본 글자를 채운다
export const tableDelRow = (t, i) => { const n = normalizeTable(t); return n.rows.length <= 1 || i < 0 || i >= n.rows.length ? n : { ...n, rows: n.rows.filter((_, k) => k !== i) }; };
export const tableMoveRow = (t, i, d) => { const n = normalizeTable(t); const j = i + d; if (i < 0 || j < 0 || i >= n.rows.length || j >= n.rows.length) return n; const rows = [...n.rows]; [rows[i], rows[j]] = [rows[j], rows[i]]; return { ...n, rows }; };
export const tableSetCols = (t, cols, fill = false) => { // 줄이면 오른쪽 열이 잘리고 늘리면 빈 열이 생긴다(fill 이면 새 칸에 기본 글자)
  const before = normalizeTable(t); const n = normalizeTable({ ...t, cols });
  return fill ? { ...n, rows: n.rows.map((r) => r.map((v, ci) => (ci >= before.cols && v === '' ? '내용' : v))) } : n;
};
// 빈 칸을 찾아 채운다(그림 위에서 눌러 고치려면 글자가 있어야 한다)
export const tableHasEmpty = (t) => normalizeTable(t).rows.some((r) => r.some((v) => v === ''));
export const tableFillEmpty = (t, ch = '–') => { const n = normalizeTable(t); return { ...n, rows: n.rows.map((r) => r.map((v) => (v === '' ? ch : v))) }; };

// 색을 흰색과 섞어 연하게(줄무늬 바탕)
const tint = (hex, k) => { const m = /^#([0-9a-fA-F]{6})$/.exec(hex || ''); if (!m) return '#F2F2F2'; const n = parseInt(m[1], 16); const mix = (v) => Math.round(v + (255 - v) * k); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`; };
const NUM = /^[-+]?[\d,.]+\s*(㎡|m²|㎥|m|mm|cm|%|대|세대|층|명|원|억|만원|개)?$/;

// 배치: 열 너비(글자 길이에 맞춤)·행 높이·셀 위치·전체 크기
export function tableLayout(c) {
  const t = normalizeTable(c.table ?? c); const s = Math.max(6, Number(c.size) || 14); const x = Number(c.x) || 0; const y = Number(c.y) || 0;
  const doc = t.style === 'doc';
  const padX = s * 0.7; const rowH = s * 2.0; const titleH = t.title ? s * (t.style === 'stripe' ? 2.2 : 2.0) : 0;
  const unitH = doc && t.unit ? s * 1.5 : 0; const hdrH = doc && t.header ? rowH : 0; // 설계개요형: 제목 아래 단위 줄, 그 아래 머리글 띠
  const colW = Array.from({ length: t.cols }, (_, ci) => Math.max(s * 3.2, ...t.rows.map((r) => textW(r[ci], s) * (isLabelCol(t, ci) || (doc && ci === 0) ? 1.1 : 1)), ...(doc && t.header ? [textW(t.header[ci], s) * 1.1] : [])) + padX * 2);
  const w = colW.reduce((a, b) => a + b, 0); const tw = t.title ? textW(t.title, s * 1.05) * 1.08 + padX * 2 : 0; if (tw > w) colW[t.cols - 1] += tw - w; // 제목이 더 길면 마지막 열을 넓힌다
  const W = colW.reduce((a, b) => a + b, 0); const colX = colW.reduce((a, cw, i) => { a.push(i ? a[i - 1] + colW[i - 1] : x); return a; }, []);
  const top = y + titleH + unitH + hdrH;
  const rows = t.rows.map((r, ri) => ({ y: top + ri * rowH, h: rowH, cells: r.map((v, ci) => ({ r: ri, c: ci, x: colX[ci], w: colW[ci], text: v })) }));
  return { t, s, x, y, w: W, h: titleH + unitH + hdrH + t.rows.length * rowH, titleH, unitH, hdrH, rowH, padX, colW, colX, rows, groups: doc ? tableGroups(t) : [] };
}

// 설계개요형 그림: 머리글 띠(#D9D9D9)·구분 칸 합침(#F2F2F2)·소계 줄 강조·숫자 오른쪽 정렬. 선은 가는 선 + 위·아래 굵은 선(사내 참고사례 값의 비율)
function docSvg(L, c, { id, interactive, font }) {
  const { t, s } = L; const col = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : TABLE_COLOR; const o = [];
  const lw = Math.max(0.8, s * 0.06); const heavy = Math.max(1.6, s * 0.14); const INK = '#222222'; const RULE = '#333333';
  const x0 = L.x; const x1 = L.x + L.w; const yTop = L.y + L.titleH + L.unitH; const yEnd = L.y + L.h;
  if (interactive) o.push(`<rect x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.h)}" fill="transparent"/>`);
  if (t.title) {
    o.push(`<text x="${f1(x0 + L.padX)}" y="${f1(L.y + L.titleH / 2 + s * 0.38)}" font-family="${font}" font-size="${f1(s * 1.05)}" font-weight="800" fill="${INK}">${esc(t.title)}</text>`);
    o.push(`<line x1="${f1(x0)}" y1="${f1(L.y + L.titleH)}" x2="${f1(x1)}" y2="${f1(L.y + L.titleH)}" stroke="${col}" stroke-width="${f1(heavy)}"/>`);
  }
  if (t.unit) o.push(`<text x="${f1(x1 - L.padX * 0.4)}" y="${f1(L.y + L.titleH + L.unitH * 0.68)}" text-anchor="end" font-family="${font}" font-size="${f1(s * 0.8)}" fill="#555555">${esc(t.unit)}</text>`);
  if (t.header) { // 회색 머리글 띠 + 열 이름(가운데, 굵게)
    o.push(`<rect x="${f1(x0)}" y="${f1(yTop)}" width="${f1(L.w)}" height="${f1(L.hdrH)}" fill="#D9D9D9"/>`);
    t.header.forEach((h, ci) => { if (h) o.push(`<text x="${f1(L.colX[ci] + L.colW[ci] / 2)}" y="${f1(yTop + L.hdrH / 2 + s * 0.35)}" text-anchor="middle" font-family="${font}" font-size="${f1(s)}" font-weight="700" fill="${INK}">${esc(h)}</text>`); });
  }
  L.groups.forEach((g) => o.push(`<rect x="${f1(x0)}" y="${f1(L.rows[g.r0].y)}" width="${f1(L.colW[0])}" height="${f1((g.r1 - g.r0 + 1) * L.rowH)}" fill="#F2F2F2"/>`)); // 합친 구분 칸의 바탕(한 덩어리)
  const starts = new Set(L.groups.map((g) => g.r0));
  L.rows.forEach((row, ri) => {
    const total = isTotalRow(t, t.rows[ri]);
    if (total) o.push(`<rect x="${f1(L.colX[1])}" y="${f1(row.y)}" width="${f1(x1 - L.colX[1])}" height="${f1(row.h)}" fill="#F2F2F2"/>`);
    if (ri < L.rows.length - 1) { const full = starts.has(ri + 1) || !starts.size; o.push(`<line x1="${f1(full ? x0 : L.colX[1])}" y1="${f1(row.y + row.h)}" x2="${f1(x1)}" y2="${f1(row.y + row.h)}" stroke="#B5B5B5" stroke-width="${f1(lw)}"/>`); }
    row.cells.forEach((cell) => {
      if (cell.c === 0 || !cell.text) return; // 구분 글자는 합친 칸에 한 번만(아래)
      const right = cell.c >= 2 && NUM.test(cell.text.trim());
      o.push(`<text x="${f1(right ? cell.x + cell.w - L.padX : cell.x + L.padX)}" y="${f1(row.y + row.h / 2 + s * 0.35)}"${right ? ' text-anchor="end"' : ''} font-family="${font}" font-size="${f1(s)}" font-weight="${total || cell.c === 1 ? 700 : 500}" fill="${INK}">${esc(cell.text)}</text>`);
    });
  });
  L.groups.forEach((g) => { // 합친 구분 칸: 글자는 그 칸 가운데
    const gy = L.rows[g.r0].y; const gh = (g.r1 - g.r0 + 1) * L.rowH; const txt = t.rows[g.r0][0];
    o.push(`<text x="${f1(L.colX[0] + L.colW[0] / 2)}" y="${f1(gy + gh / 2 + s * 0.35)}" text-anchor="middle" font-family="${font}" font-size="${f1(s)}" font-weight="700" fill="${INK}">${esc(txt)}</text>`);
  });
  o.push(`<line x1="${f1(x0)}" y1="${f1(yTop)}" x2="${f1(x1)}" y2="${f1(yTop)}" stroke="${RULE}" stroke-width="${f1(heavy)}"/>`);
  o.push(`<line x1="${f1(x0)}" y1="${f1(yEnd)}" x2="${f1(x1)}" y2="${f1(yEnd)}" stroke="${RULE}" stroke-width="${f1(heavy)}"/>`);
  if (interactive) { // 셀 하나하나를 눌러 고칠 수 있게. 제목은 -1,0
    if (t.title) o.push(`<rect data-cell="-1,0" x="${f1(L.x)}" y="${f1(L.y)}" width="${f1(L.w)}" height="${f1(L.titleH)}" fill="transparent"/>`);
    L.rows.forEach((row) => row.cells.forEach((cell) => o.push(`<rect data-cell="${cell.r},${cell.c}" x="${f1(cell.x)}" y="${f1(row.y)}" width="${f1(cell.w)}" height="${f1(row.h)}" fill="transparent"/>`)));
  }
  return `<g${interactive && id ? ` data-eid="${esc(id)}" style="cursor:move"` : ''}>${o.join('')}</g>`;
}

// 그림(SVG 조각). id·interactive 가 있으면 눌러서 고를 수 있게(data-eid) 하고 셀마다 data-cell="행,열"(제목은 -1,0)인 투명 사각형을 둔다
export function tableSvg(c, { id = '', interactive = false, font = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif" } = {}) {
  const L = tableLayout(c); if (L.t.style === 'doc') return docSvg(L, c, { id, interactive, font });
  const col = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : TABLE_COLOR; const { t, s } = L; const stripe = t.style === 'stripe';
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

// ── 엑셀·한글·웹 표 붙여넣기 변환(v2) ──
const decodeEnt = (s) => String(s).replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
const cellText = (s) => decodeEnt(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
// HTML 표(엑셀·한글·웹에서 복사하면 text/html 에 <table> 이 들어 있다) → 칸 격자. colspan 은 빈 칸으로 채운다
export function gridFromHtml(html) {
  const grid = []; const m = String(html).match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  m.forEach((tr) => {
    const row = []; (tr.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi) || []).forEach((td) => { const span = Math.min(8, Math.max(1, Number((/colspan\s*=\s*["']?(\d+)/i.exec(td) || [])[1]) || 1)); row.push(cellText(td)); for (let k = 1; k < span; k++) row.push(''); });
    if (row.length) grid.push(row);
  });
  return grid;
}
// 글자 표 → 칸 격자: 탭(엑셀·한글) > 마크다운 `| a | b |` > 쉼표(CSV) > 공백 두 칸 이상 순서로 알아본다
export function gridFromText(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== ''); if (!lines.length) return [];
  const md = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l)); if (md.length >= 1 && md.length === lines.length) return lines.filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (lines.some((l) => l.includes('\t'))) return lines.map((l) => l.split('\t').map((c) => c.replace(/^"(.*)"$/, '$1').replace(/\s+/g, ' ').trim()));
  if (lines.every((l) => l.includes(',')) && lines.length >= 2) return lines.map((l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim()).filter((c, i, a) => i < a.length - (a.length && a[a.length - 1] === '' ? 1 : 0)));
  return lines.map((l) => l.trim().split(/\s{2,}/).map((c) => c.trim()));
}
// 붙여넣은 내용(text, html) → { table, truncated(4열을 넘어 잘림), droppedRows(30행을 넘어 잘림), title(첫 줄이 한 칸짜리면 제목으로) } 또는 null(표로 읽을 수 없음)
export function parseTableText(text, html = '') {
  let grid = html && /<table[\s>]/i.test(html) ? gridFromHtml(html) : [];
  if (!grid.length) grid = gridFromText(text);
  grid = grid.map((r) => r.map((c) => String(c ?? '').slice(0, TABLE_MAX_CELL))).filter((r) => r.some((c) => c !== ''));
  if (!grid.length) return null;
  let title = '';
  if (grid.length >= 2 && grid[0].filter((c) => c !== '').length === 1 && grid.slice(1).some((r) => r.filter((c) => c !== '').length >= 2)) { title = grid[0].find((c) => c !== '') || ''; grid = grid.slice(1); } // 첫 줄이 한 칸짜리면 표 제목
  const widest = Math.max(...grid.map((r) => r.length)); const cols = Math.min(4, Math.max(2, widest));
  if (widest < 2 && grid.length < 2) return null; // 한 칸짜리 글자는 표가 아니다
  const dropped = Math.max(0, grid.length - TABLE_MAX_ROWS);
  return { table: normalizeTable({ title, cols, rows: grid }), truncated: widest > 4, droppedRows: dropped, title };
}
