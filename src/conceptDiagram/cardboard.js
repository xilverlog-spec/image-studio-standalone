// 카드 보드(기술·상품 카드 보드): 핵심 가치 띠 + 히어로 + 카드 격자를 한 장으로. 사내 설계도집 형식(참고삽도 B23·B25 등)을 따른다.
// AI(또는 사용자)는 구조(제목·불릿·아이콘 이름)만 정하고, 글자 줄바꿈·배치·그리기는 이 파일이 한다. 글자는 모두 <text> 라서 깨지지 않고 고쳐 쓸 수 있다.
//
// spec = { title, accent, showPlaceholder,
//   bands: [  // 위에서 아래로 쌓는 띠, 최대 4개
//     { kind:'keypoints', style:'bracket|tabs', label, items:[{ no, title, text, icon }] },                     // 최대 6
//     { kind:'hero', imageNote, h, callouts:[{ side:'left|right', title, text }], tables:[{ title, cols, style, rows }],
//                    legends:[{ side:'left|right', title, items:[{ icon, text }] }] },                             // 히어로 그림은 사용자 이미지
//     { kind:'cards', tone:'gray|pink|green|blue', label, cols, cards:[{ title, icon, sub, slots:[{ kind:'icon|image|empty', icon, caption }], bullets:[…] }] } ] }  // 카드는 보드 전체에서 최대 12
// 히어로의 callouts·tables 는 "씨앗"이다: 처음 만들 때 편집기의 리더선 라벨·개요표 요소(adds)로 바뀌어 그림 위에서 끌어 고친다(cardsHeroAdds).

import { resolveIcon, iconChipSvg, iconGlyph } from './icons';
import { normalizeTable, tableLayout, textW } from './table';
import { emptyEdits } from './svgedit';

export const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"; // page.js 의 ENGINE_FONT 와 같아야 글꼴 바꿈이 먹는다
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s || '');

export const W = 1600; const M = 28; const GAP = 14;
export const TONES = { gray: '#E3E5E8', pink: '#F7D9D9', green: '#D8EAD3', blue: '#D6E5F4' };
export const TONE_LABEL = { gray: '회색', pink: '분홍', green: '연두', blue: '하늘' };
export const KEY_STYLES = ['bracket', 'tabs', 'tiles']; // tiles: 인증 타일형(제목 띠 + 큰 아이콘 + 값)
export const MAX = { bands: 4, keypoints: 6, callouts: 6, tables: 3, legends: 2, legendItems: 10, cards: 12, slots: 3, bullets: 2, columns: 3, rows: 3, process: 5, chipGroups: 4, chipItems: 4 };
export const CARD_COLS = [0, 3, 4, 5, 6]; // 0 = 카드 수에 맞춰 자동

// 내가 넣은 이미지(data URL)만 받는다. fit: 'cover'(꽉 채우고 넘치는 부분은 자름) / 'contain'(전체가 보이게)
const dataUrl = (s) => (typeof s === 'string' && /^data:image\//.test(s) && s.length < 6000000 ? s : '');
const fitOf = (f) => (f === 'contain' ? 'contain' : 'cover');
const cut = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);

// 슬롯(소도식 칸) 한 개: kind icon(아이콘 타일) / image(내 이미지 자리) / empty(빈 점선 칸)
const normSlot = (sl) => { const kind = ['icon', 'image', 'empty'].includes(sl?.kind) ? sl.kind : 'icon'; return { kind, icon: resolveIcon(sl?.icon, 'star'), caption: cut(sl?.caption, 16), ...(kind === 'image' && dataUrl(sl?.src) ? { src: dataUrl(sl.src), fit: fitOf(sl?.fit) } : {}) }; };

// 어떤 입력이든 올바른 카드 보드로: 한도(띠 4·키포인트 6·카드 12·슬롯 3·불릿 2)·아이콘 목록 안의 이름·색 정리
export function normalizeCards(spec, opts = {}) { // opts.keepEmpty: 폼에서 글을 지우는 중에도 빈 불릿 칸이 사라지지 않게(그릴 때는 쓰지 않는다)
  const s = spec && typeof spec === 'object' ? spec : {};
  let cardsLeft = MAX.cards;
  const bands = (Array.isArray(s.bands) ? s.bands : []).filter((b) => b && ['keypoints', 'hero', 'cards', 'columns3', 'process', 'chips'].includes(b.kind)).slice(0, MAX.bands).map((b) => {
    if (b.kind === 'keypoints') {
      return { kind: 'keypoints', style: KEY_STYLES.includes(b.style) ? b.style : 'bracket', label: cut(b.label, 24),
        items: (Array.isArray(b.items) ? b.items : []).slice(0, MAX.keypoints).map((it, i) => ({ no: cut(it?.no ?? String(i + 1).padStart(2, '0'), 3), title: cut(it?.title, 16), text: cut(it?.text, 64), icon: resolveIcon(it?.icon, 'star') })) };
    }
    if (b.kind === 'hero') {
      return { kind: 'hero', imageNote: cut(b.imageNote, 24), h: clamp(b.h, 320, 760, 0) || 0, src: dataUrl(b.src), fit: fitOf(b.fit),
        callouts: (Array.isArray(b.callouts) ? b.callouts : []).slice(0, MAX.callouts).map((c) => ({ side: c?.side === 'right' ? 'right' : 'left', title: cut(c?.title, 20), text: cut(c?.text, 60) })),
        tables: (Array.isArray(b.tables) ? b.tables : []).slice(0, MAX.tables).map((t) => normalizeTable(t)),
        legends: (Array.isArray(b.legends) ? b.legends : []).slice(0, MAX.legends).map((l) => ({ side: l?.side === 'right' ? 'right' : 'left', title: cut(l?.title, 16), numbered: !!l?.numbered, items: (Array.isArray(l?.items) ? l.items : []).slice(0, MAX.legendItems).map((it) => ({ icon: resolveIcon(it?.icon, 'star'), text: cut(it?.text, 22), desc: cut(it?.desc, 44) })) })) };
    }
    if (b.kind === 'columns3') {
      return { kind: 'columns3', cols: (Array.isArray(b.cols) ? b.cols : []).slice(0, MAX.columns).map((c) => ({ lead: cut(c?.lead, 36), key: cut(c?.key, 10), src: dataUrl(c?.src), fit: fitOf(c?.fit),
        rows: (Array.isArray(c?.rows) ? c.rows : []).slice(0, MAX.rows).map((r) => ({ title: cut(r?.title, 26), text: cut(r?.text, 76), slot: normSlot(r?.slot) })) })) };
    }
    if (b.kind === 'process') return { kind: 'process', items: (Array.isArray(b.items) ? b.items : []).slice(0, MAX.process).map((it) => ({ icon: resolveIcon(it?.icon, 'star'), title: cut(it?.title, 16), text: cut(it?.text, 44) })) };
    if (b.kind === 'chips') return { kind: 'chips', groups: (Array.isArray(b.groups) ? b.groups : []).slice(0, MAX.chipGroups).map((g) => ({ chip: cut(g?.chip, 8), items: (Array.isArray(g?.items) ? g.items : []).slice(0, MAX.chipItems).map((it) => ({ icon: resolveIcon(it?.icon, 'star'), title: cut(it?.title, 16), text: cut(it?.text, 30) })) })) };
    const cards = (Array.isArray(b.cards) ? b.cards : []).slice(0, cardsLeft).map((c) => ({ title: cut(c?.title, 30), icon: c?.icon ? resolveIcon(c.icon, '') : '', sub: cut(c?.sub, 26),
      slots: (Array.isArray(c?.slots) ? c.slots : []).slice(0, MAX.slots).map((sl) => normSlot(sl)),
      bullets: (Array.isArray(c?.bullets) ? c.bullets : []).map((x) => cut(x, 46)).filter((x) => opts.keepEmpty || x).slice(0, MAX.bullets) }));
    cardsLeft -= cards.length;
    return { kind: 'cards', tone: TONES[b.tone] ? b.tone : 'gray', label: cut(b.label, 30), cols: CARD_COLS.includes(Number(b.cols)) ? Number(b.cols) : 0, cards };
  }).filter((b) => (b.kind === 'keypoints' ? b.items.length : b.kind === 'cards' ? b.cards.length : b.kind === 'columns3' ? b.cols.length : b.kind === 'process' ? b.items.length : b.kind === 'chips' ? b.groups.length : true));
  return { title: cut(s.title, 70), accent: isHex(s.accent) ? s.accent : '#2F6BB5', showPlaceholder: s.showPlaceholder !== false, bands };
}

// 글자 줄바꿈: 폭(px)에 맞춰 공백에서 나누고, 낱말이 너무 길면 글자 단위로 자른다. maxLines 를 넘으면 마지막 줄을 …로 줄인다
export function wrapText(text, maxW, fs, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (textW(cand, fs) <= maxW) { cur = cand; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (textW(w, fs) <= maxW) { cur = w; continue; }
    let part = ''; for (const ch of [...w]) { if (part && textW(part + ch, fs) > maxW) { lines.push(part); part = ''; } part += ch; } cur = part;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); let last = keep[maxLines - 1]; while (last && textW(`${last}…`, fs) > maxW) last = last.slice(0, -1); keep[maxLines - 1] = `${last}…`; return keep; }
  return lines;
}

const T = (x, y, text, { fs = 14, w = 500, fill = '#222222', anchor = 'start', extra = '' } = {}) => `<text x="${f1(x)}" y="${f1(y)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''} font-family="${FONT}" font-size="${f1(fs)}" font-weight="${w}" fill="${fill}"${extra}>${esc(text)}</text>`;
// 이미지를 (x, y, w, h) 자리에: cover 는 잘라서 꽉 채우고(clipPath), contain 은 전체가 보이게. 얇은 테두리를 두른다
const imgIn = (id, x, y, w, h, href, fit, rx) => {
  const clip = fit === 'cover' ? `<clipPath id="${id}"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}"/></clipPath>` : '';
  return `${clip}<image href="${esc(href)}" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" preserveAspectRatio="${fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"${fit === 'cover' ? ` clip-path="url(#${id})"` : ''}/><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}" fill="none" stroke="#C5CAD0" stroke-width="1"/>`;
};
const autoCols = (n) => (n <= 3 ? 3 : n <= 6 ? n : n <= 8 ? 4 : n <= 10 ? 5 : 6);

// 카드 한 장의 높이(같은 띠의 카드는 모두 같은 높이)
function cardMetrics(card, cw) {
  const pad = 12; const k = card.slots.length; const avail = cw - pad * 2;
  let slotsH = 0; let slotW = 0; let slotH = 0;
  if (k === 1) { slotW = avail; slotH = Math.round(avail * 0.6); slotsH = slotH; }
  else if (k >= 2) { slotW = Math.floor((avail - (k - 1) * 10) / k); slotH = slotW; slotsH = slotH; }
  const hasCap = card.slots.some((s) => s.caption);
  const bl = card.bullets.map((b) => wrapText(b, cw - pad * 2 - 12, 13, 2)); const bulletLines = bl.reduce((a, l) => a + l.length, 0);
  return { pad, slotW, slotH, slotsH, hasCap, bl, bulletLines };
}

export function renderCards(raw) {
  const spec = normalizeCards(raw); if (!spec.bands.length) throw new Error('bands 가 비어 있습니다.'); const accent = spec.accent; const o = []; let y = 22;
  const layout = { bands: [], hero: null, slots: [] };
  if (spec.title) { o.push(T(M, y + 30, spec.title, { fs: 30, w: 800 })); y += 56; }
  const bw0 = W - M * 2;

  // 슬롯 하나(columns3 의 행): 아이콘 타일 / 내 이미지(또는 점선 자리) / 빈 점선 칸
  const drawSlot = (sl, x, yy, w, h, id, bi, ci) => {
    if (sl.kind === 'icon') { o.push(`<rect x="${f1(x)}" y="${f1(yy)}" width="${f1(w)}" height="${f1(h)}" rx="6" fill="#EEF0F2"/>`); o.push(iconChipSvg({ cx: x + w / 2, cy: yy + h / 2, side: Math.min(w, h) * 0.5, icon: sl.icon, color: '#5A6470', shape: 'bare' })); }
    else if (sl.kind === 'image' && sl.src) o.push(imgIn(id, x, yy, w, h, sl.src, sl.fit, 6));
    else o.push(`<rect x="${f1(x)}" y="${f1(yy)}" width="${f1(w)}" height="${f1(h)}" rx="6" fill="${sl.kind === 'image' ? '#F4F5F7' : 'none'}" stroke="#C5CAD0" stroke-width="1.4" stroke-dasharray="6 5"${sl.kind === 'image' ? ' data-placeholder="slot"' : ''}/>`);
    layout.slots.push({ id, band: bi, card: ci, slot: 0, kind: sl.kind, x, y: yy, w, h });
  };

  spec.bands.forEach((band, bi) => {
    const top = y;
    if (band.kind === 'keypoints' && band.style === 'tiles') { // 인증 타일: 제목 띠 + 큰 아이콘 + 값(왼쪽부터 최대 230px 폭)
      if (band.label) { o.push(T(M, y + 22, band.label, { fs: 21, w: 800 })); y += 40; }
      const n = band.items.length; const tw = Math.min(230, (bw0 - (n - 1) * GAP) / n); const th = 150;
      band.items.forEach((it, i) => {
        const x = M + i * (tw + GAP);
        o.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(tw)}" height="${th}" fill="#FFFFFF" stroke="#BFC4CA" stroke-width="1.2"/><rect x="${f1(x)}" y="${f1(y)}" width="${f1(tw)}" height="46" fill="#EEF0F2"/>`);
        wrapText(it.title, tw - 16, 14, 2).forEach((l, li, a) => o.push(T(x + tw / 2, y + (a.length === 1 ? 29 : 20) + li * 17, l, { fs: 14, w: 800, anchor: 'middle' })));
        o.push(iconChipSvg({ cx: x + tw / 2, cy: y + 88, side: 58, icon: it.icon, color: accent }));
        const vl = wrapText(it.text, tw - 16, 15, 2); vl.forEach((l, li) => o.push(T(x + tw / 2, y + th - 14 - (vl.length - 1 - li) * 17, l, { fs: 15, w: 800, fill: accent, anchor: 'middle' })));
      });
      y += th + 26; layout.bands.push({ kind: 'keypoints', y: top, h: y - top });
    } else if (band.kind === 'keypoints') {
      if (band.label) { o.push(T(M, y + 22, band.label, { fs: 21, w: 800 })); y += 40; }
      const n = band.items.length; const bw = (bw0 - (n - 1) * GAP) / n; const bh = 132;
      band.items.forEach((it, i) => {
        const x = M + i * (bw + GAP);
        if (band.style === 'tabs') {
          o.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${bh}" rx="6" fill="#F1F3F5"/><rect x="${f1(x)}" y="${f1(y)}" width="6" height="${bh}" rx="3" fill="${accent}"/>`);
          o.push(T(x + 20, y + 40, it.no, { fs: 28, w: 800, fill: accent }));
          o.push(T(x + 74, y + 36, it.title, { fs: 18, w: 800 }));
          o.push(iconChipSvg({ cx: x + bw - 34, cy: y + 34, side: 36, icon: it.icon, color: accent }));
          wrapText(it.text, bw - 44, 13.5, 3).forEach((l, li) => o.push(T(x + 20, y + 70 + li * 20, l, { fs: 13.5, fill: '#444444' })));
        } else {
          const bk = '#8A9097';
          o.push(`<polyline points="${f1(x + 12)},${f1(y)} ${f1(x)},${f1(y)} ${f1(x)},${f1(y + bh)} ${f1(x + 12)},${f1(y + bh)}" fill="none" stroke="${bk}" stroke-width="2.6"/><polyline points="${f1(x + bw - 12)},${f1(y)} ${f1(x + bw)},${f1(y)} ${f1(x + bw)},${f1(y + bh)} ${f1(x + bw - 12)},${f1(y + bh)}" fill="none" stroke="${bk}" stroke-width="2.6"/>`);
          o.push(T(x + 22, y + 38, it.title, { fs: 19, w: 800 }));
          o.push(`<line x1="${f1(x + 22)}" y1="${f1(y + 50)}" x2="${f1(x + bw - 78)}" y2="${f1(y + 50)}" stroke="#B9BEC4" stroke-width="1.2"/>`);
          o.push(iconChipSvg({ cx: x + bw - 46, cy: y + 38, side: 38, icon: it.icon, color: accent }));
          wrapText(it.text, bw - 48, 13.5, 3).forEach((l, li) => o.push(T(x + 22, y + 78 + li * 20, l, { fs: 13.5, fill: '#444444' })));
        }
      });
      y += bh + 26;
      layout.bands.push({ kind: 'keypoints', y: top, h: y - top });
    } else if (band.kind === 'hero') {
      const hasLegL = band.legends.some((l) => l.side === 'left'); const hasLegR = band.legends.some((l) => l.side === 'right');
      const hasCoL = !band.legends.length && band.callouts.some((c) => c.side === 'left'); const hasCoR = !band.legends.length && band.callouts.some((c) => c.side === 'right');
      const wide = (l) => (l.numbered || l.items.some((it) => it.desc) ? 560 : 340); const legWOf = (side) => Math.max(0, ...band.legends.filter((l) => l.side === side).map(wide));
      const tablesW = band.tables.length ? 340 : 0; const colW = 270; const hh = band.h || (band.legends.length ? 520 : 560);
      const x0 = M + (hasLegL ? legWOf('left') + 16 : hasCoL ? colW + 16 : 0);
      const x1 = W - M - (tablesW ? tablesW + 16 : 0) - (hasLegR ? legWOf('right') + 16 : hasCoR ? colW + 16 : 0);
      const iw = Math.max(200, x1 - x0);
      if (band.src) o.push(imgIn('cbh', x0, y, iw, hh, band.src, band.fit, 0));
      else if (spec.showPlaceholder) {
        o.push(`<rect x="${f1(x0)}" y="${f1(y)}" width="${f1(iw)}" height="${hh}" rx="4" fill="#F4F5F7" stroke="#C5CAD0" stroke-width="1.6" stroke-dasharray="8 6" data-placeholder="hero"/>`);
        o.push(T(x0 + iw / 2, y + hh / 2 - 6, band.imageNote || '히어로 이미지', { fs: 22, w: 700, fill: '#9AA1A9', anchor: 'middle' }));
        o.push(T(x0 + iw / 2, y + hh / 2 + 22, '🖼 내 이미지 넣기로 이 자리에 넣으세요(이미지를 넣으면 이 안내는 가려집니다)', { fs: 13, fill: '#A9AFB6', anchor: 'middle' }));
      }
      band.legends.forEach((lg) => {
        const legW = wide(lg); const lx = lg.side === 'left' ? M : W - M - legW; const rows = Math.ceil(lg.items.length / 2); const rh = legW > 340 ? 66 : 60; const ph = 40 + rows * rh + 10; const cwid = (legW - 12) / 2;
        o.push(`<rect x="${f1(lx)}" y="${f1(y)}" width="${legW}" height="${ph}" fill="#FFFFFF" fill-opacity="0.92" stroke="#D5D8DC"/><rect x="${f1(lx)}" y="${f1(y)}" width="${legW}" height="34" fill="${TONES.gray}"/>`);
        o.push(T(lx + legW / 2, y + 23, lg.title, { fs: 16, w: 800, anchor: 'middle' }));
        lg.items.forEach((it, i) => {
          const cx = lx + 6 + (i % 2) * cwid + 6; const cy = y + 46 + Math.floor(i / 2) * rh; const off = lg.numbered ? 26 : 0;
          if (lg.numbered) o.push(`<rect x="${f1(cx)}" y="${f1(cy + 10)}" width="20" height="20" rx="3" fill="#222222"/>${T(cx + 10, cy + 25, String(i + 1), { fs: 13, w: 800, fill: '#FFFFFF', anchor: 'middle' })}`);
          o.push(iconChipSvg({ cx: cx + off + 18, cy: cy + 22, side: 36, icon: it.icon, color: accent }));
          const tw0 = legW > 340 ? cwid - off - 52 - 10 : 110;
          if (it.desc) { o.push(T(cx + off + 44, cy + 16, wrapText(it.text, tw0, 14, 1)[0] || '', { fs: 14, w: 800 })); wrapText(it.desc, tw0, 11.5, 2).forEach((l, li) => o.push(T(cx + off + 44, cy + 32 + li * 14, l, { fs: 11.5, fill: '#555555' }))); }
          else { const ls = wrapText(it.text, tw0, 13, 2); ls.forEach((l, li) => o.push(T(cx + off + 44, cy + 27 - (ls.length - 1) * 8.5 + li * 17, l, { fs: 13, fill: '#333333' }))); }
        });
      });
      layout.hero = { x: x0, y, w: iw, h: hh, leftX: M, leftW: colW, rightX: W - M - (tablesW ? tablesW + 16 : 0) - colW, rightW: colW, tablesX: W - M - tablesW, tablesW, hasCoL, hasCoR };
      y += hh + 26;
      layout.bands.push({ kind: 'hero', y: top, h: y - top });
    } else if (band.kind === 'columns3') { // 3열 가치 카드: 열 머리(작은 문구 + 큰 키워드) + 큰 그림 + [소도식 · 제목 · 설명] × 3
      const n = band.cols.length; const cw = (bw0 - (n - 1) * GAP) / n; const hh = 74; const imgH = Math.round(cw * 0.6); const rowH = 104; const rowsN = Math.max(1, ...band.cols.map((c) => c.rows.length)); const bodyH = rowsN * rowH + 14;
      band.cols.forEach((c, ci) => {
        const x = M + ci * (cw + GAP);
        o.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cw)}" height="${hh}" fill="#FFFFFF" stroke="#D5D8DC" stroke-width="1"/><polyline points="${f1(x + cw - 10)},${f1(y)} ${f1(x + cw)},${f1(y)} ${f1(x + cw)},${f1(y + hh)}" fill="none" stroke="#222222" stroke-width="2.4"/>`);
        if (c.lead) o.push(T(x + cw / 2, y + 28, wrapText(c.lead, cw - 30, 14, 1)[0] || '', { fs: 14, fill: '#444444', anchor: 'middle' }));
        o.push(T(x + cw / 2, y + 58, c.key, { fs: 24, w: 800, anchor: 'middle', extra: ' letter-spacing="6"' }));
        const iy = y + hh;
        if (c.src) o.push(imgIn(`cbc${bi}_${ci}`, x, iy, cw, imgH, c.src, c.fit, 0));
        else if (spec.showPlaceholder) { o.push(`<rect x="${f1(x)}" y="${f1(iy)}" width="${f1(cw)}" height="${imgH}" fill="#F4F5F7" stroke="#C5CAD0" stroke-width="1.4" stroke-dasharray="8 6" data-placeholder="col"/>`); o.push(T(x + cw / 2, iy + imgH / 2 + 5, '🖼 이미지를 넣으세요', { fs: 15, fill: '#A9AFB6', anchor: 'middle' })); }
        const by = iy + imgH + GAP;
        o.push(`<rect x="${f1(x)}" y="${f1(by)}" width="${f1(cw)}" height="${bodyH}" fill="#FFFFFF" stroke="#BFC4CA" stroke-width="1.2"/>`);
        c.rows.forEach((r, ri) => {
          const ry = by + 7 + ri * rowH; drawSlot(r.slot, x + 14, ry + 8, 84, 84, `cbr${bi}_${ci}_${ri}`, bi, ci * 10 + ri);
          const tx = x + 14 + 84 + 16; const tw = cw - 14 - 84 - 16 - 14;
          const tl = wrapText(r.title, tw, 17, 2); tl.forEach((l, li) => o.push(T(tx, ry + 26 + li * 20, l, { fs: 17, w: 800 })));
          wrapText(r.text, tw, 13, 3).forEach((l, li) => o.push(T(tx, ry + 26 + tl.length * 20 + 2 + li * 17, l, { fs: 13, fill: '#555555' })));
        });
      });
      y += hh + imgH + GAP + bodyH + 26; layout.bands.push({ kind: 'columns3', y: top, h: y - top });
    } else if (band.kind === 'process') { // 프로세스 띠: 아이콘 + 제목 + 설명 2~3줄, 사이는 점선
      const n = band.items.length; const pw = bw0 / n; const ph = 84;
      band.items.forEach((it, i) => {
        const x = M + i * pw; if (i) o.push(`<line x1="${f1(x)}" y1="${f1(y + 8)}" x2="${f1(x)}" y2="${f1(y + ph - 8)}" stroke="#B9BEC4" stroke-width="1.4" stroke-dasharray="2 4"/>`);
        o.push(iconChipSvg({ cx: x + 36, cy: y + ph / 2, side: 42, icon: it.icon, color: accent }));
        o.push(T(x + 66, y + 30, wrapText(it.title, pw - 80, 15, 1)[0] || '', { fs: 15, w: 800 }));
        wrapText(it.text, pw - 80, 12.5, 3).forEach((l, li) => o.push(T(x + 66, y + 50 + li * 16, l, { fs: 12.5, fill: '#555555' })));
      });
      y += ph + 24; layout.bands.push({ kind: 'process', y: top, h: y - top });
    } else if (band.kind === 'chips') { // 분류 칩 띠: 분야 칩(구조·기계…) + 그 분야의 항목들(아이콘 + 제목 + 한 줄, 세로로 쌓음)
      const n = band.groups.length; const gw = (bw0 - (n - 1) * GAP) / n; const rowH = 46; const rowsN = Math.max(1, ...band.groups.map((g) => g.items.length)); const ph = rowsN * rowH + (rowsN - 1) * 6; const cwid = 84;
      band.groups.forEach((g, gi) => {
        const x = M + gi * (gw + GAP);
        o.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${cwid}" height="${ph}" rx="4" fill="${TONES.gray}" stroke="#BFC4CA"/>`);
        { const cl = wrapText(g.chip, cwid - 10, 15, 2); cl.forEach((l, li) => o.push(T(x + cwid / 2, y + ph / 2 + 5 - (cl.length - 1) * 9 + li * 18, l, { fs: 15, w: 800, anchor: 'middle' }))); }
        const iw = gw - cwid - 14;
        g.items.forEach((it, k) => {
          const ix = x + cwid + 14; const iy = y + k * (rowH + 6);
          o.push(iconChipSvg({ cx: ix + 19, cy: iy + rowH / 2, side: 36, icon: it.icon, color: accent }));
          o.push(T(ix + 46, iy + rowH / 2 - (it.text ? 2 : -5), wrapText(it.title, iw - 50, 14, 1)[0] || '', { fs: 14, w: 800 }));
          if (it.text) o.push(T(ix + 46, iy + rowH / 2 + 15, wrapText(it.text, iw - 50, 12, 1)[0] || '', { fs: 12, fill: '#555555' }));
        });
      });
      y += ph + 26; layout.bands.push({ kind: 'chips', y: top, h: y - top });
    } else {
      if (band.label) { o.push(T(M, y + 22, band.label, { fs: 20, w: 800 })); y += 38; }
      const n = band.cards.length; const cols = band.cols || autoCols(n); const cw = (bw0 - (cols - 1) * GAP) / cols; const hdr = 44;
      const ms = band.cards.map((c) => cardMetrics(c, cw)); const subH = band.cards.some((c) => c.sub) ? 24 : 0; const capH = ms.some((m) => m.hasCap) ? 24 : 0;
      const slotsH = Math.max(0, ...ms.map((m) => m.slotsH)); const bulletH = Math.max(0, ...ms.map((m) => m.bulletLines)) * 18 + (ms.some((m) => m.bulletLines) ? 16 : 0);
      const ch = hdr + subH + (slotsH ? slotsH + capH + 22 : 8) + bulletH + 6;
      const rows = Math.ceil(n / cols);
      band.cards.forEach((c, ci) => {
        const col = ci % cols; const row = Math.floor(ci / cols); const x = M + col * (cw + GAP); const cy = y + row * (ch + GAP); const m = ms[ci];
        o.push(`<rect x="${f1(x)}" y="${f1(cy)}" width="${f1(cw)}" height="${ch}" fill="#FFFFFF" stroke="#BFC4CA" stroke-width="1.2"/><rect x="${f1(x)}" y="${f1(cy)}" width="${f1(cw)}" height="${hdr}" fill="${TONES[band.tone]}"/>`);
        const tcx = x + cw / 2 + (c.icon ? 14 : 0);
        if (c.icon) o.push(iconChipSvg({ cx: x + 26, cy: cy + hdr / 2, side: 28, icon: c.icon, color: accent }));
        const tl = wrapText(c.title, cw - (c.icon ? 76 : 24), 17, 2); const ty = tl.length === 1 ? cy + hdr / 2 + 6 : cy + hdr / 2 - 4;
        tl.forEach((l, li) => o.push(T(tcx, ty + li * 19, l, { fs: 17, w: 800, anchor: 'middle' })));
        let yy = cy + hdr;
        if (subH) { if (c.sub) o.push(T(x + cw / 2, yy + 18, c.sub, { fs: 12.5, fill: '#666666', anchor: 'middle' })); yy += subH; }
        if (slotsH) {
          yy += 10; const k = c.slots.length; const totalW = k * m.slotW + (k - 1) * 10; let sx = x + (cw - totalW) / 2;
          c.slots.forEach((sl, si) => {
            const sy = yy + (slotsH - m.slotH) / 2;
            if (sl.kind === 'icon') { o.push(`<rect x="${f1(sx)}" y="${f1(sy)}" width="${m.slotW}" height="${m.slotH}" rx="6" fill="#EEF0F2"/>`); const side = Math.min(m.slotW, m.slotH) * (k === 1 ? 0.42 : 0.5); o.push(iconChipSvg({ cx: sx + m.slotW / 2, cy: sy + m.slotH / 2, side, icon: sl.icon, color: '#5A6470', shape: 'bare' })); }
            else if (sl.kind === 'image' && sl.src) o.push(imgIn(`cbs${bi}_${ci}_${si}`, sx, sy, m.slotW, m.slotH, sl.src, sl.fit, 6));
            else o.push(`<rect x="${f1(sx)}" y="${f1(sy)}" width="${m.slotW}" height="${m.slotH}" rx="6" fill="${sl.kind === 'image' ? '#F4F5F7' : 'none'}" stroke="#C5CAD0" stroke-width="1.4" stroke-dasharray="6 5"${sl.kind === 'image' ? ' data-placeholder="slot"' : ''}/>`);
            if (sl.caption) o.push(T(sx + m.slotW / 2, sy + m.slotH + 17, sl.caption, { fs: 12, fill: '#555555', anchor: 'middle' }));
            layout.slots.push({ id: `s${bi}_${ci}_${si}`, band: bi, card: ci, slot: si, kind: sl.kind, x: sx, y: sy, w: m.slotW, h: m.slotH });
            sx += m.slotW + 10;
          });
          yy += slotsH + capH + 12;
        } else yy += 8;
        if (m.bulletLines) {
          yy += 8; m.bl.forEach((lines) => lines.forEach((l, li) => { o.push(T(x + 12, yy + 14, `${li === 0 ? '· ' : '  '}${l}`, { fs: 13, fill: '#333333' })); yy += 18; }));
        }
      });
      y += rows * ch + (rows - 1) * GAP + 26;
      layout.bands.push({ kind: 'cards', y: top, h: y - top, cols, cardH: ch });
    }
    void bi;
  });
  const H = Math.max(200, Math.round(y));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${o.join('')}</svg>`;
  return { svg, width: W, height: H, layout };
}

// 히어로의 callouts·tables(씨앗)를 편집기 요소(adds: 리더선 라벨·개요표)로 바꾼다. 히어로 그림 자리(layout.hero)의 좌우에 쌓고, 끝점은 그림 안쪽에 둔다
export function cardsHeroAdds(raw, layout, startId = 1) {
  const spec = normalizeCards(raw); const band = spec.bands.find((b) => b.kind === 'hero'); const L = layout?.hero; if (!band || !L) return [];
  const adds = []; let n = startId; const id = () => `a${n++}`;
  ['left', 'right'].forEach((side) => {
    const list = band.callouts.filter((c) => c.side === side); if (!list.length) return;
    const colX = side === 'left' ? L.leftX : L.rightX; const slot = (L.h - 30) / list.length;
    list.forEach((c, i) => {
      const y = L.y + 14 + i * slot; const tipx = side === 'left' ? L.x + L.w * (0.18 + 0.1 * (i % 3)) : L.x + L.w * (0.82 - 0.1 * (i % 3)); const tipy = L.y + L.h * ((i + 0.5) / list.length);
      adds.push({ id: id(), kind: 'callout', src: 'hero', x: Math.round(colX), y: Math.round(y), tx: Math.round(tipx), ty: Math.round(tipy), title: c.title, desc: wrapText(c.text, 250, 12, 3).join('\n'), size: 17, fill: '#222222', line: 'elbow', end: 'dot' });
    });
  });
  if (band.tables.length && L.tablesW) {
    let ty = L.y;
    band.tables.forEach((t) => { const a = { id: id(), kind: 'table', src: 'hero', x: Math.round(L.tablesX), y: Math.round(ty), size: 13.5, fill: '#222222', table: t }; adds.push(a); ty += tableLayout({ x: 0, y: 0, size: a.size, table: t }).h + 18; });
  }
  return adds;
}

// ── 편집 도우미(모두 새 스펙을 돌려준다): 폼에서 카드·키포인트·불릿 등을 더하고 뺀다 ──
const upd = (spec, bi, fn) => { const n = normalizeCards(spec); if (!n.bands[bi]) return n; return { ...n, bands: n.bands.map((b, i) => (i === bi ? fn(b) : b)) }; };
const cardsTotal = (spec) => spec.bands.reduce((a, b) => a + (b.kind === 'cards' ? b.cards.length : 0), 0);
export const cardsCount = (spec) => cardsTotal(normalizeCards(spec));
export function cardsAddCard(spec, bi) { const n = normalizeCards(spec); if (cardsTotal(n) >= MAX.cards) return n; return upd(n, bi, (b) => (b.kind === 'cards' ? { ...b, cards: [...b.cards, { title: '새 카드', icon: '', sub: '', slots: [{ kind: 'icon', icon: 'star', caption: '' }], bullets: ['내용을 입력하세요'] }] } : b)); }
export function cardsDelCard(spec, bi, ci) { return upd(spec, bi, (b) => (b.kind === 'cards' && b.cards.length > 1 ? { ...b, cards: b.cards.filter((_, i) => i !== ci) } : b)); }
export function cardsMoveCard(spec, bi, ci, d) { return upd(spec, bi, (b) => { if (b.kind !== 'cards') return b; const j = ci + d; if (j < 0 || j >= b.cards.length) return b; const cards = [...b.cards]; [cards[ci], cards[j]] = [cards[j], cards[ci]]; return { ...b, cards }; }); }
export function cardsSetSlots(spec, bi, ci, count) { return upd(spec, bi, (b) => (b.kind === 'cards' ? { ...b, cards: b.cards.map((c, i) => { if (i !== ci) return c; const k = Math.max(0, Math.min(MAX.slots, count)); const slots = Array.from({ length: k }, (_, j) => c.slots[j] || { kind: 'icon', icon: 'star', caption: '' }); return { ...c, slots }; }) } : b)); }
const renumber = (items) => items.map((it, i) => ({ ...it, no: String(i + 1).padStart(2, '0') }));
export function cardsAddKeypoint(spec, bi) { return upd(spec, bi, (b) => (b.kind === 'keypoints' && b.items.length < MAX.keypoints ? { ...b, items: renumber([...b.items, { no: '', title: '새 항목', text: '내용을 입력하세요', icon: 'star' }]) } : b)); }
export function cardsDelKeypoint(spec, bi, ii) { return upd(spec, bi, (b) => (b.kind === 'keypoints' && b.items.length > 1 ? { ...b, items: renumber(b.items.filter((_, i) => i !== ii)) } : b)); }
// 글자 입력칸 대신 '있음/없음'과 개수만 고른다: 새로 생긴 글자는 기본 문구가 들어가 그림 위에서 더블클릭해 고친다
export function cardsSetBullets(spec, bi, ci, n) { return upd(spec, bi, (b) => (b.kind === 'cards' ? { ...b, cards: b.cards.map((c, i) => { if (i !== ci) return c; const k = Math.max(0, Math.min(MAX.bullets, n)); const bullets = Array.from({ length: k }, (_, j) => (c.bullets[j] ? c.bullets[j] : '내용을 입력하세요')); return { ...c, bullets }; }) } : b)); }
export function cardsToggleSub(spec, bi, ci) { return upd(spec, bi, (b) => (b.kind === 'cards' ? { ...b, cards: b.cards.map((c, i) => (i === ci ? { ...c, sub: c.sub ? '' : '부제' } : c)) } : b)); }
export function cardsToggleCaption(spec, bi, ci, si) { return upd(spec, bi, (b) => (b.kind === 'cards' ? { ...b, cards: b.cards.map((c, i) => (i === ci ? { ...c, slots: c.slots.map((sl, j) => (j === si ? { ...sl, caption: sl.caption ? '' : '이름' } : sl)) } : c)) } : b)); }
export function cardsAddBand(spec, kind) { const n = normalizeCards(spec); if (n.bands.length >= MAX.bands || n.bands.some((b) => b.kind === kind && kind !== 'cards' && kind !== 'chips')) return n; if (kind === 'cards' && cardsTotal(n) >= MAX.cards) return n; const blank = { columns3: { kind: 'columns3', cols: [{ lead: '작은 문구', key: '키워드', src: '', fit: 'cover', rows: [{ title: '제목', text: '내용을 입력하세요', slot: { kind: 'icon', icon: 'star', caption: '' } }] }] }, process: { kind: 'process', items: [{ icon: 'star', title: '단계', text: '내용을 입력하세요' }, { icon: 'star', title: '단계', text: '내용을 입력하세요' }, { icon: 'star', title: '단계', text: '내용을 입력하세요' }] }, chips: { kind: 'chips', groups: [{ chip: '분야', items: [{ icon: 'star', title: '항목', text: '내용을 입력하세요' }] }] }, keypoints: { kind: 'keypoints', style: 'bracket', label: '핵심 가치', items: [{ no: '01', title: '항목', text: '내용을 입력하세요', icon: 'star' }] }, hero: { kind: 'hero', imageNote: '히어로 이미지', h: 0, callouts: [], tables: [], legends: [] }, cards: { kind: 'cards', tone: 'gray', label: '', cols: 0, cards: [{ title: '새 카드', icon: '', sub: '', slots: [{ kind: 'icon', icon: 'star', caption: '' }], bullets: ['내용을 입력하세요'] }] } }[kind]; return blank ? { ...n, bands: [...n.bands, blank] } : n; }
export function cardsDelBand(spec, bi) { const n = normalizeCards(spec); return n.bands.length <= 1 ? n : { ...n, bands: n.bands.filter((_, i) => i !== bi) }; }
export function cardsMoveBand(spec, bi, d) { const n = normalizeCards(spec); const j = bi + d; if (j < 0 || j >= n.bands.length) return n; const bands = [...n.bands]; [bands[bi], bands[j]] = [bands[j], bands[bi]]; return { ...n, bands }; }

// 글자 수정 폼·그림 위 더블클릭 편집용 글자 목록(경로 = 스펙 안의 위치)
export function getCardsTextFields(spec) {
  const out = []; if (!spec) return out;
  out.push({ path: ['title'], label: '보드 제목(비워 두면 페이지 제목을 씁니다)', value: spec.title || '' });
  (spec.bands || []).forEach((b, bi) => {
    const P = ['bands', bi];
    if (b.kind === 'keypoints') {
      if (b.label !== undefined) out.push({ path: [...P, 'label'], label: `띠 ${bi + 1} 이름`, value: b.label || '' });
      (b.items || []).forEach((it, i) => { out.push({ path: [...P, 'items', i, 'title'], label: `핵심 ${i + 1} 제목`, value: it.title || '' }); out.push({ path: [...P, 'items', i, 'text'], label: `핵심 ${i + 1} 설명`, value: it.text || '' }); });
    } else if (b.kind === 'hero') {
      out.push({ path: [...P, 'imageNote'], label: '히어로 이미지 안내', value: b.imageNote || '' });
      (b.legends || []).forEach((l, li) => { out.push({ path: [...P, 'legends', li, 'title'], label: `${l.side === 'right' ? '오른쪽' : '왼쪽'} 목록 제목`, value: l.title || '' }); (l.items || []).forEach((it, i) => { out.push({ path: [...P, 'legends', li, 'items', i, 'text'], label: `${l.side === 'right' ? '오른쪽' : '왼쪽'} 목록 ${i + 1}`, value: it.text || '' }); if (it.desc) out.push({ path: [...P, 'legends', li, 'items', i, 'desc'], label: `${l.side === 'right' ? '오른쪽' : '왼쪽'} 목록 ${i + 1} 설명`, value: it.desc }); }); });
    } else if (b.kind === 'columns3') {
      (b.cols || []).forEach((c, ci) => { out.push({ path: [...P, 'cols', ci, 'lead'], label: `열 ${ci + 1} 작은 문구`, value: c.lead || '' }); out.push({ path: [...P, 'cols', ci, 'key'], label: `열 ${ci + 1} 키워드`, value: c.key || '' });
        (c.rows || []).forEach((r, ri) => { out.push({ path: [...P, 'cols', ci, 'rows', ri, 'title'], label: `열 ${ci + 1} 항목 ${ri + 1} 제목`, value: r.title || '' }); out.push({ path: [...P, 'cols', ci, 'rows', ri, 'text'], label: `열 ${ci + 1} 항목 ${ri + 1} 설명`, value: r.text || '' }); }); });
    } else if (b.kind === 'process') {
      (b.items || []).forEach((it, i) => { out.push({ path: [...P, 'items', i, 'title'], label: `단계 ${i + 1} 제목`, value: it.title || '' }); out.push({ path: [...P, 'items', i, 'text'], label: `단계 ${i + 1} 설명`, value: it.text || '' }); });
    } else if (b.kind === 'chips') {
      (b.groups || []).forEach((g, gi) => { out.push({ path: [...P, 'groups', gi, 'chip'], label: `분야 ${gi + 1} 이름`, value: g.chip || '' }); (g.items || []).forEach((it, i) => { out.push({ path: [...P, 'groups', gi, 'items', i, 'title'], label: `분야 ${gi + 1} 항목 ${i + 1} 제목`, value: it.title || '' }); if (it.text) out.push({ path: [...P, 'groups', gi, 'items', i, 'text'], label: `분야 ${gi + 1} 항목 ${i + 1} 설명`, value: it.text }); }); });
    } else {
      if (b.label !== undefined) out.push({ path: [...P, 'label'], label: `띠 ${bi + 1} 이름`, value: b.label || '' });
      (b.cards || []).forEach((c, ci) => {
        const Q = [...P, 'cards', ci]; const nm = `카드 ${ci + 1}`;
        out.push({ path: [...Q, 'title'], label: `${nm} 제목`, value: c.title || '' });
        if (c.sub) out.push({ path: [...Q, 'sub'], label: `${nm} 부제`, value: c.sub });
        (c.slots || []).forEach((sl, si) => { if (sl.caption) out.push({ path: [...Q, 'slots', si, 'caption'], label: `${nm} 그림 ${si + 1} 이름`, value: sl.caption }); });
        (c.bullets || []).forEach((bl, i) => out.push({ path: [...Q, 'bullets', i], label: `${nm} 불릿 ${i + 1}`, value: bl }));
      });
    }
  });
  return out;
}

// 시작 틀: 사내 도집 형식(P1 계획 요약형 / P3 설비·시스템형)의 구성을 보여 주는 일반적인 예시 내용 — 실제 프로젝트 글이 아니다(자료 보안: 참고삽도의 문장을 옮기지 않는다)
const slotI = (icon, caption = '') => ({ kind: 'icon', icon, caption });
const slotImg = (caption = '') => ({ kind: 'image', icon: 'star', caption });
const card = (title, slots, bullets) => ({ title, icon: '', sub: '', slots, bullets });
export const CARD_PRESETS = {
  plan: {
    label: '계획 요약형 (구조·토목 등 한 분야 계획)', hint: '핵심 가치 5개 + 히어로 그림(좌우 설명·개요표) + 카드 6개',
    spec: {
      title: '', accent: '#2F6BB5',
      bands: [
        { kind: 'keypoints', style: 'bracket', label: '설계주안점', items: [
          { no: '01', title: '시공성', text: '구조부재의 단순화와 모듈화로 공기를 줄이고 가설을 최소화', icon: 'hard-hat' },
          { no: '02', title: '안정성', text: '토압과 수평하중에 대한 안정성을 검토하여 안전한 구조 확보', icon: 'shield-check' },
          { no: '03', title: '사용성', text: '바닥 진동과 처짐을 검토하여 쾌적한 사용 환경 유지', icon: 'users' },
          { no: '04', title: '내구성', text: '충분한 피복두께와 균열 저감으로 장기 사용성 확보', icon: 'layers' },
          { no: '05', title: '경제성', text: '합리적인 부재 설계로 물량과 공사비 절감', icon: 'chart-pie' }] },
        { kind: 'hero', imageNote: '구조 아이소 그림', h: 540,
          callouts: [
            { side: 'left', title: '골조 시스템', text: '보·기둥 상세를 적용하여 연성능력을 확보' },
            { side: 'left', title: '코어 계획', text: '코어를 중앙에 배치하여 지진력에 대한 저항성 확보' },
            { side: 'left', title: '전단벽 시스템', text: '횡하중에 저항하는 콘크리트 전단벽으로 계획' },
            { side: 'right', title: '비구조요소 내진', text: '지진 시 피해를 줄이는 내진설계 적용' },
            { side: 'right', title: '지하외벽 계획', text: '토압과 수압에 대한 안전성을 확보하는 설계' },
            { side: 'right', title: '기초 계획', text: '지반 조건을 고려한 기초로 안정적인 지지력 확보' }],
          tables: [
            { title: '주요 시스템', cols: 2, style: 'label', rows: [['구조시스템', '철근콘크리트조'], ['횡력저항', '내진등급에 따른 전단벽 적용'], ['기초', '지반조사에 따른 기초계획']] },
            { title: '구조개요', cols: 2, style: 'label', rows: [['건물규모', '지하 1층 / 지상 6층'], ['구조형식', '철근콘크리트 구조'], ['기초형식', '파일기초']] }], legends: [] },
        { kind: 'cards', tone: 'gray', label: '', cols: 6, cards: [
          card('내진·내풍 성능 확보', [slotI('building-2', '중요도 계수'), slotI('arrow-right-left', '하중 반영'), slotI('shield-check', '인명 보호')], ['지진·풍하중 기준 만족', '비구조 요소 내진 설계']),
          card('사용성 증진 계획', [slotI('layers', '진동 해석'), slotI('ruler', '처짐 검토'), slotI('wind', '균열 제어')], ['바닥 진동에 대한 사용성 확보', '처짐 검토를 통한 사용성 확보']),
          card('횡력저항 시스템', [slotImg()], ['전단벽과 모멘트골조의 복합 시스템', '횡하중은 전단벽이 분담']),
          card('내구성 증진 계획', [slotImg()], ['중성화 깊이 검토로 내구성 확보', '균열 예상 부위 저감 대책']),
          card('지하외력 안정성', [slotImg()], ['토압·수압에 대한 안정성 확보', '부력 검토 및 대책 수립']),
          card('변위 검토', [slotImg('X 방향'), slotImg('Y 방향')], ['풍하중에 대한 안정성 확보', '지진하중에 대한 안정성 확보'])] }],
    },
  },
  system: {
    label: '설비·시스템형 (설비·에너지·시스템 계획)', hint: '핵심 가치 6개 + 히어로 그림(좌우 아이콘 목록) + 카드 2줄(6개씩)',
    spec: {
      title: '', accent: '#3E8E41',
      bands: [
        { kind: 'keypoints', style: 'bracket', label: '설계주안점', items: [
          { no: '01', title: '쾌적성', text: '용도별 조닝과 충분한 환기량으로 쾌적한 실내환경 조성', icon: 'sprout' },
          { no: '02', title: '경제성', text: '고효율 기기 적용과 유지관리 편의성 확보', icon: 'chart-pie' },
          { no: '03', title: '안전성', text: '종합적인 방재계획과 내진설계 반영', icon: 'shield-check' },
          { no: '04', title: '신뢰성', text: '안정적인 전력공급과 향후 증설을 고려한 용량 선정', icon: 'zap' },
          { no: '05', title: '편의성', text: '다양한 통신 서비스가 가능한 인프라 구축', icon: 'wifi' },
          { no: '06', title: '보안성', text: '주요 구역 출입통제와 감시 시스템 적용', icon: 'cctv' }] },
        { kind: 'hero', imageNote: '단면도', h: 520, callouts: [], tables: [], legends: [
          { side: 'left', title: '기계 / 소방 설비', items: [{ icon: 'sun', text: '태양광 발전' }, { icon: 'cloud-rain', text: '우수 재활용' }, { icon: 'droplet', text: '절수형 위생기구' }, { icon: 'air-vent', text: '외기 필터링' }, { icon: 'fan', text: '자동제어' }, { icon: 'siren', text: '통합방재' }, { icon: 'droplets', text: '스프링클러' }, { icon: 'life-buoy', text: '피난 유도등' }, { icon: 'fire-extinguisher', text: '옥내소화전' }, { icon: 'shield-check', text: '내진 설계' }] },
          { side: 'right', title: '전기 / 정보통신 설비', items: [{ icon: 'battery-charging', text: '비상발전기' }, { icon: 'lightbulb', text: 'LED 조명' }, { icon: 'sun', text: '태양광 발전' }, { icon: 'megaphone', text: 'A/V 시스템' }, { icon: 'plug', text: '충전 시설' }, { icon: 'cctv', text: 'CCTV' }, { icon: 'lock', text: '출입 통제' }, { icon: 'wifi', text: '네트워크' }, { icon: 'wifi', text: '무선랜(AP)' }, { icon: 'signpost', text: '안내 시스템' }] }] },
        { kind: 'cards', tone: 'gray', label: '기계설비 및 소방설비 계획', cols: 6, cards: [
          card('자동제어 설비 계획', [slotImg()], ['실별·시간대별 관리와 중앙제어 시스템']),
          card('공조 계획', [slotImg()], ['부분부하를 고려한 개별방식 선정', '열원 선택으로 난방효율 극대화']),
          card('우수 재활용 설비', [slotImg()], ['경제성을 고려한 위생설비 선정']),
          card('소화설비 계획', [slotImg()], ['초기 화재 진화와 확산 방지']),
          card('통합 방재 시스템', [slotImg()], ['방재설비와의 연동 시스템 구축']),
          card('스마트 모니터링', [slotImg()], ['실시간 감지로 신속한 대응'])] },
        { kind: 'cards', tone: 'gray', label: '전기설비 및 정보통신설비 계획', cols: 6, cards: [
          card('안정적인 전원공급', [slotImg()], ['정전 시 주요 시설 가동으로 안정적인 전원공급']),
          card('고효율 LED 조명', [slotImg()], ['에너지 절약과 유지보수 용이']),
          card('A/V 시스템', [slotImg()], ['회의·세미나를 지원하는 설비 계획']),
          card('인터넷 환경 제공', [slotImg()], ['초고속 통신을 위한 광케이블 사용']),
          card('통합 방범 시스템', [slotImg()], ['24시간 감시체계로 안전사고 예방']),
          card('건물 안내 시스템', [slotImg()], ['다양한 정보 전달과 홍보'])] }],
    },
  },
};
void iconGlyph;

const sIc = (icon, caption = '') => ({ kind: 'icon', icon, caption });
const sIm = (caption = '') => ({ kind: 'image', icon: 'star', caption });
const row = (title, text, slot) => ({ title, text, slot });
CARD_PRESETS.values3 = {
  label: '3열 가치형 (차별성·분양성·경제성 등 가치 3가지)', hint: '열마다 [작은 문구 + 큰 키워드] + 큰 그림 + [소도식·제목·설명] 3줄',
  spec: {
    title: '', accent: '#2F6BB5',
    bands: [{ kind: 'columns3', cols: [
      { lead: '새로운 기준을 제시하는', key: '차별성', rows: [row('편리하고 새로운 삶을 만드는 기술', '핵심 솔루션과 기능을 담은 통합 시스템을 적용', sIm()), row('미래형 생활을 위한 친화 설계', '동선과 서비스를 고려한 전용 공간 계획', sIc('sparkles')), row('지속 가능한 친환경 설계', '에너지 절감과 관리비 절감을 위한 시스템', sIc('sprout'))] },
      { lead: '생활 가치를 담아낸', key: '분양성', rows: [row('전 세대 남향 배치와 조망 극대화', '채광과 조망을 확보하는 배치 계획', sIc('sun')), row('다양한 계층을 고려한 가변 세대', '공간 가변성을 높인 단위세대 계획', sIc('layers')), row('층간소음 없는 주거단지', '바닥 구조 기준을 강화한 상향 적용', sIc('shield-check'))] },
      { lead: '효율을 최적화한', key: '경제성', rows: [row('경제성을 고려한 자재 선정', '자재 사용 계획과 공법 제안으로 공사물량 절감', sIc('chart-pie')), row('경험을 통한 기간 단축', '검토 체계와 협력망 활용으로 기간 단축', sIc('clock')), row('굴착 면적 최소화로 공사비 최적화', '컴팩트한 계획으로 불필요한 공간 삭제', sIc('hard-hat'))] }] }],
  },
};
CARD_PRESETS.eco = {
  label: '친환경·에너지형 (인증 타일 + 번호 목록 + 프로세스)', hint: '인증 타일 5개 + 히어로 그림(왼쪽 번호 아이콘 목록) + 프로세스 띠 5개 + 카드 4개',
  spec: {
    title: '', accent: '#2F8F5B',
    bands: [
      { kind: 'keypoints', style: 'tiles', label: '', items: [
        { no: '01', title: '제로에너지 건축물 인증', text: '4등급', icon: 'zap' }, { no: '02', title: '녹색건축 인증', text: '일반 등급', icon: 'sprout' }, { no: '03', title: '신재생에너지', text: '36% 이상', icon: 'sun' }, { no: '04', title: '에너지성능 지표', text: '74점 이상', icon: 'chart-column' }, { no: '05', title: '장애물 없는 생활환경', text: '일반 등급', icon: 'accessibility' }] },
      { kind: 'hero', imageNote: '단면도(번호 마커를 놓는 그림)', h: 520, callouts: [], tables: [], legends: [
        { side: 'left', title: '친환경 계획 요소', numbered: true, items: [
          { icon: 'droplets', text: '투수성 포장', desc: '우수부하 저감 및 우수저류 확보' }, { icon: 'cloud-rain', text: '우수재활용', desc: '재활용 조경용수 공급으로 절감' }, { icon: 'brick-wall', text: '친환경 마감재', desc: '실내공기질 향상' }, { icon: 'trees', text: '옥상녹화', desc: '단열 강화 및 생태환경 조성' },
          { icon: 'sun', text: '태양광 발전', desc: '신재생에너지를 통한 에너지 절감' }, { icon: 'recycle', text: '배열회수 설비', desc: '배기열 회수로 에너지 절감' }, { icon: 'building-2', text: '아트리움', desc: '자연채광 및 환기 유도' }, { icon: 'zap', text: '수소연료전지', desc: '탄소배출 없는 전력 생산' }, { icon: 'layers', text: '고성능 창호', desc: '단열성능 향상으로 냉난방 절감' }, { icon: 'thermometer', text: '부위별 단열강화', desc: '열손실 최소화' }] }] },
      { kind: 'process', items: [{ icon: 'map', title: '친환경 배치계획', text: '실별 특성을 고려한 배치로 주요실 자연채광 확보' }, { icon: 'wind', title: '실내 쾌적성 향상', text: '실내 자연채광 및 환기로 쾌적성 향상' }, { icon: 'home', title: '에너지성능 강화', text: '단열강화와 패시브 계획 적용' }, { icon: 'lightbulb', title: '고효율 설비', text: '고효율 기계·전기 설비 적용' }, { icon: 'battery-charging', title: '신재생에너지', text: '태양광 등을 통한 전력 생산' }] },
      { kind: 'cards', tone: 'gray', label: '', cols: 4, cards: [
        { title: '패시브, 친환경 건축을 실현하는 계획', icon: 'leaf', sub: '', slots: [sIm()], bullets: ['주변대지를 고려한 최적 배치', '외벽단열과 창면적비 최적화'] },
        { title: '액티브, 쾌적한 실내공간 계획', icon: 'fan', sub: '', slots: [sIm()], bullets: ['고효율 기계·전기 설비 적용', '에너지 관리시스템 활용'] },
        { title: '신재생, 지역 특성에 맞는 에너지', icon: 'sun', sub: '', slots: [sIm()], bullets: ['고효율 태양광 모듈 적용', '연료전지로 탄소 배출 저감'] },
        { title: '유니버설, 모두가 편리한 건축', icon: 'accessibility', sub: '', slots: [sIm()], bullets: ['이용자의 편의성을 고려한 계획', '피난구역과 안내설비 계획'] }] }],
  },
};
CARD_PRESETS.field = {
  label: '분야별 계획형 (단면 + 분야 칩 + 분야별 카드 3개)', hint: '히어로(단면·입면) + 분야 칩 4개(항목 아이콘 줄) + 카드 3개',
  spec: {
    title: '', accent: '#3E8E41',
    bands: [
      { kind: 'hero', imageNote: '단면도 / 입면도', h: 420, callouts: [], tables: [], legends: [] },
      { kind: 'chips', groups: [
        { chip: '구 조', items: [{ icon: 'layers', title: '내구성·사용성 증진', text: '장경간 성능 확보' }, { icon: 'brick-wall', title: '경제적 구조계획', text: '형상·용도에 맞는 계획' }, { icon: 'shield-check', title: '내진·내풍 성능', text: '내진·내풍 안정성 확보' }] },
        { chip: '기 계', items: [{ icon: 'fan', title: '고효율 펌프기기', text: '열원설비 최적화' }, { icon: 'air-vent', title: '고효율 전열교환기', text: '에너지 절감' }, { icon: 'droplet', title: '절수형 위생기구', text: '수자원 절감' }] },
        { chip: '전기·통신', items: [{ icon: 'cctv', title: 'CCTV 설비 계획', text: '사고예방 CCTV' }, { icon: 'wifi', title: '통합관제 시스템', text: '실시간 방범시스템 구축' }, { icon: 'lightbulb', title: '고효율 에너지기기', text: 'LED 적용' }] },
        { chip: '소 방', items: [{ icon: 'siren', title: '화재경보·비상송출', text: '신속한 피난 유도' }, { icon: 'fire-extinguisher', title: '방재계획', text: '종합방재시스템 계획' }, { icon: 'shield-check', title: '내진성능 확보', text: '소화배관·장비 내진설계' }] }] },
      { kind: 'cards', tone: 'gray', label: '', cols: 3, cards: [
        { title: '구조, 안전성과 내구성을 확보한 구조시스템', icon: 'layers', sub: '', slots: [sIm()], bullets: ['장경간 구조에 적합한 기둥과 보 계획'] },
        { title: '설비, 용도별 특성에 맞는 설비계획', icon: 'fan', sub: '', slots: [sIm()], bullets: ['환기조화기와 지열을 활용한 쾌적성 향상', '사용시간대를 고려한 고효율 열원설비'] },
        { title: '토목, 안정성과 경제성을 고려한 토목계획', icon: 'mountain', sub: '', slots: [sIm()], bullets: ['지형적 특성을 반영하여 경제적이고 시공이 용이한 공법 적용'] }] }],
  },
};

// 처음 만들 때의 편집 상태: 히어로 씨앗(리더선 라벨·개요표)을 편집기 요소로 놓는다
export function cardsInitialEdits(spec) {
  const r = renderCards(spec); const adds = cardsHeroAdds(spec, r.layout);
  return { ...emptyEdits(r.svg), ...(adds.length ? { adds } : {}) };
}
// 폼에서 구조(카드 수·글 줄 수 등)가 바뀌면 그림 구조 지문이 달라져, 손으로 고친 도형 위치(ops)는 맞지 않게 된다 → 지문을 새로 맞추고 ops 는 비운다(내 이미지·리더선·표(adds)와 내가 그린 도형(shapes)은 그대로)
export function cardsRebase(edits, spec) {
  if (!edits) return edits;
  const sig = emptyEdits(renderCards(spec).svg).sig; if (edits.sig === sig) return edits;
  return { ...edits, sig, ops: {} };
}
