// 다이어그램 렌더 회귀 점검(node). check_fast.py 가 호출한다. 단독 실행: node scripts/regression/check_diagrams.mjs
import { rolldown } from '../../node_modules/rolldown/dist/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../src/conceptDiagram/spec.js');
const sketch = path.resolve(here, '../../src/conceptDiagram/sketch.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-reg-'));
const fwd = (p) => JSON.stringify(p.split(path.sep).join('/'));
fs.writeFileSync(path.join(tmp, 'entry.js'), `export { renderSpec, EXAMPLE_SPECS, getTextFields, buildConceptPrompt, DIAGRAM_TYPES } from ${fwd(spec)};
export { pickConsensusSketch, sketchSnapshot, sketchPaste, sketchView, sketchSetVia, sketchSetAmp, sketchMoveBy, sketchSetEnd, FORMS, SHAPES, DASHES, renderSketch, normalizeSketchRead, makeSketchSpec, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd } from ${fwd(sketch)};`);
const b = await rolldown({ input: path.join(tmp, 'entry.js') });
await b.write({ file: path.join(tmp, 'bundle.mjs'), format: 'esm' });
const m = await import(pathToFileURL(path.join(tmp, 'bundle.mjs')).href);

const fails = []; let ok = 0;
const run = (label, fn) => {
  try {
    const r = fn();
    if (!r || !/^<svg[\s\S]*<\/svg>$/.test(r.svg) || /NaN|undefined|Infinity/.test(r.svg)) throw new Error('SVG 가 비었거나 NaN/undefined 가 섞임');
    ok++;
  } catch (e) { fails.push(`${label}: ${e.message}`); }
};

// 1) 예시: 모든 종류가 그려지고, 글자 수정 항목이 있고, 프롬프트가 종류를 안내해야 한다
for (const t of Object.keys(m.DIAGRAM_TYPES)) {
  run(`예시 ${t}`, () => m.renderSpec(t, m.EXAMPLE_SPECS[t]));
  if (!m.getTextFields(t, m.EXAMPLE_SPECS[t]).length) fails.push(`예시 ${t}: 글자 수정 항목이 없음`);
  if (!m.buildConceptPrompt(t, '시험', {}).includes('스키마')) fails.push(`프롬프트 ${t}: 스키마 안내 없음`);
}
const auto = m.buildConceptPrompt('auto', '시험', {});
for (const t of Object.keys(m.DIAGRAM_TYPES)) if (!auto.includes(`"${t}"`)) fails.push(`자동 프롬프트에 종류 ${t} 가 없음`);

// 2) 망가진 입력: AI 가 틀린 값을 줘도 렌더가 깨지지 않아야 한다(의도된 오류 메시지는 허용)
const intended = /비어 있습니다|읽어 낸 도형이 없습니다/;
const tryBad = (label, type, spec) => {
  try { const r = m.renderSpec(type, spec); if (/NaN|undefined|Infinity/.test(r.svg)) throw new Error('NaN/undefined 가 섞임'); ok++; }
  catch (e) { if (intended.test(e.message)) ok++; else fails.push(`${label}: ${e.message}`); }
};
tryBad('stack 빈', 'stack', {});
tryBad('stack 층만', 'stack', { floors: [{}] });
tryBad('stack 폭 0', 'stack', { floors: [{ programs: [{ name: 'A', width: 0 }, { name: 'B', width: -3 }] }], voids: [{ from: 9, to: -2 }], cores: [{}], forces: [{ kind: 'x' }], gradient: {} });
tryBad('stack 긴 이름', 'stack', { floors: [{ name: '1F', programs: [{ name: '아주아주아주긴프로그램이름입니다', tone: 'public', width: 0.1 }] }], voids: [{ from: 0, to: 0, x: 0, w: 0.4 }] });
tryBad('program 빈', 'program', {});
tryBad('program 노드만', 'program', { nodes: [{ label: 'A' }] });
tryBad('program 잘못된 링크', 'program', { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], links: [{ from: 'a', to: 'zzz' }, { from: 'a', to: 'a' }, { from: 'a', to: 'b', label: '아주 긴 연결 설명 문장' }] });
tryBad('program 40개 초과', 'program', { groups: [{ id: 'g' }], nodes: Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, label: `공간${i}`, group: 'g', size: 9 })), links: [] });
tryBad('site 빈 패널', 'site', { panels: [{}] });
tryBad('massing 한 단계', 'massing', { steps: [{ label: 'A', ground: { x: 0, y: 0, w: 5, d: 4 }, boxes: [{ x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }] }] });
// 평면: 방 이름 겹침 회피가 예외 없이 도는지(작은 방 40개 + 구역·주석 다수)
const shapes = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `방${i}번 긴이름`, kind: 'room', pts: [[(i % 8) * 12, Math.floor(i / 8) * 12], [(i % 8) * 12 + 11, Math.floor(i / 8) * 12], [(i % 8) * 12 + 11, Math.floor(i / 8) * 12 + 11], [(i % 8) * 12, Math.floor(i / 8) * 12 + 11]] }));
tryBad('layout 붐비는 평면', 'layout', { shapes, panels: [{ zones: [{ ids: ['r0', 'r1'], label: '구역 이름표 A' }, { ids: ['r1', 'r2'], label: '구역 이름표 B' }], notes: shapes.slice(0, 8).map((s) => ({ target: s.id, text: '주석 상자 시험' })) }] });
tryBad('layout 도형 없음', 'layout', { shapes: [], panels: [{}] });

// 3) 손스케치: 읽기 정리 → 구조 → 그리기 → 편집(추가·수정·뒤집기·삭제)이 모두 유효한 SVG 를 내야 한다
const rawRead = {
  summary: 's',
  blocks: [
    { pts: [[10, 40], [70, 40], [70, 60], [10, 60]], hatched: false }, { pts: [[60, 10], [75, 10], [75, 90], [60, 90]], hatched: false },
    { pts: [[25, 38], [40, 38], [40, 50], [25, 50]], hatched: true },
  ],
  lines: [{ pts: [[20, 35], [22, 45], [18, 55], [21, 65]], style: 'wavy' }, { pts: [[30, 40], [30, 60]], style: 'straight' }, { pts: [[0, 0], [1, 1]], style: 'wavy' }],
};
run('손스케치 읽기→구조→그리기', () => m.renderSketch(m.makeSketchSpec(m.normalizeSketchRead(rawRead, [1256, 1131]), { title: 'T', items: [{ target: 'b1', name: 'A' }], winds: [{ id: 'l1', head: 'end', in: '입', out: '출' }] })));
run('손스케치 주석 없이(읽은 직후 미리보기)', () => m.renderSketch(m.makeSketchSpec(m.normalizeSketchRead(rawRead, null), null)));
let sp = m.makeSketchSpec(m.normalizeSketchRead(rawRead, [1256, 1131]), { items: [{ target: 'b1', name: 'A' }] });
const id0 = sp.winds[0].id;
run('편집: 화살촉·선종류·색', () => { sp = m.sketchUpdate(sp, id0, { head: 'both', dash: 'dotted', width: 9, color: '#D6453D' }); return m.renderSketch(sp, { selected: id0, interactive: true }); });
run('편집: 끝점 이동·뒤집기', () => { sp = m.sketchSetEnds(sp, id0, [5, 5], [5, 5]); sp = m.sketchFlip(sp, id0); return m.renderSketch(sp); });
run('편집: 추가(화살표·선·도형·글자) 후 삭제', () => {
  for (const k of ['wind', 'line', 'slab', 'core', 'memo']) sp = m.sketchAdd(sp, k).spec;
  sp = m.sketchDelete(sp, sp.memos[sp.memos.length - 1].id); sp = m.sketchDelete(sp, 'nope');
  return m.renderSketch(sp);
});
run('편집: 잘못된 값(NaN·없는 종류)', () => m.renderSketch({ ...sp, winds: [{ id: 'x', pts: [[NaN, 1], [2, 'a']], head: 'zzz', dash: 'qq', width: 'x', color: 'red' }], blocks: [{ rect: [9, 9, 1, 1], kind: 'q' }], frame: [5, 5, 5, 5], style: 'q' }));
run('선 표현 × 곡선 모양 × 화살촉 × 스타일 전 조합', () => {
  let last;
  for (const form of m.FORMS) for (const shape of m.SHAPES) for (const head of ['end', 'start', 'both', 'none']) for (const style of ['pres', 'line']) {
    const t = m.sketchUpdate({ ...sp, style }, id0, { form, shape, head, dash: 'dashdot', amp: -0.6, bend: 1.4, width: 12 });
    last = m.renderSketch(t, { selected: id0, interactive: true });
    if (/NaN|undefined|Infinity/.test(last.svg)) throw new Error(`${form}/${shape}/${head}/${style}: NaN`);
  }
  return last;
});
run('S자 변곡점: 옮기면 곡선이 그 점을 지나고, 이동·끝점 이동·뒤집기에 따라간다', () => {
  const fresh = m.makeSketchSpec(m.normalizeSketchRead(rawRead, [1256, 1131]), null); const id0 = fresh.winds[0].id; // 앞 시험이 끝점을 겹쳐 둔 sp 는 쓰지 않는다
  let t = m.sketchUpdate(fresh, id0, { shape: 's', amp: 0.5, form: 'line', head: 'none' });
  const d0 = m.renderSketch(t, { interactive: true }).svg.match(new RegExp(`data-eid="${id0}" d="([^"]+)"`))[1];
  if ((d0.match(/ C/g) || []).length !== 2) throw new Error('S자는 두 구간(C 2개)으로 그려져야 함');
  const w0 = t.winds.find((w) => w.id === id0); const mid = [(w0.pts[0][0] + w0.pts.at(-1)[0]) / 2 + 6, (w0.pts[0][1] + w0.pts.at(-1)[1]) / 2 - 4];
  t = m.sketchSetVia(t, id0, mid);
  const stored = t.winds.find((w) => w.id === id0).via; // 앱은 변곡점을 소수 첫째 자리로 저장한다
  const sc = m.sketchView(t).toScreen(stored).map((v) => v.toFixed(1)).join(' ');
  const d1 = m.renderSketch(t, { interactive: true }).svg.match(new RegExp(`data-eid="${id0}" d="([^"]+)"`))[1];
  if (!d1.includes(sc)) throw new Error('곡선이 옮긴 변곡점을 지나지 않음');
  if (d0 === d1) throw new Error('변곡점을 옮겼는데 곡선이 안 바뀜');
  const moved = m.sketchMoveBy(t, id0, 3, 2).winds.find((w) => w.id === id0).via; if (Math.abs(moved[0] - mid[0] - 3) > 0.2) throw new Error('이동 때 변곡점이 따라가지 않음');
  const e = t.winds.find((w) => w.id === id0); const ends = m.sketchSetEnd(t, id0, 'end', [e.pts.at(-1)[0] + 5, e.pts.at(-1)[1] + 5]).winds.find((w) => w.id === id0);
  if (!ends.via || ends.via.some((v) => !Number.isFinite(v))) throw new Error('끝점 이동 뒤 변곡점이 깨짐');
  const flipped = m.sketchSetAmp(t, id0, [mid[0], mid[1] + 8]).winds.find((w) => w.id === id0); if (!(Math.abs(flipped.amp) <= 1.2)) throw new Error('휨 조절 범위 벗어남');
  t = m.sketchSetVia(t, id0, null); if (t.winds.find((w) => w.id === id0).via !== null) throw new Error('변곡점 되돌리기 실패');
  return m.renderSketch(t);
});
// 기본 위치 표현(0~1000, [y,x])으로 읽은 결과: 도형·화살표·호·글자·벽 표시·칸막이가 모두 들어오고, 화살표 방향·꼬리 정리·합의가 맞아야 한다
const nativeRead = {
  summary: 'n',
  blocks: [{ box_2d: [400, 300, 600, 700], hatched: false, color: 'black' }, { box_2d: [200, 650, 800, 850], hatched: false, color: 'black' }, { box_2d: [350, 400, 450, 500], hatched: true, color: 'blue' }],
  arrows: [{ tail: [500, 700], tip: [150, 750], color: 'red' }, { tail: [100, 100], tip: [100, 250], color: 'red' }],
  arcs: [{ points: [[120, 650], [100, 750], [120, 850]], color: 'red' }],
  flows: [{ points: [[420, 350], [470, 360], [520, 340], [570, 350]], color: 'blue' }],
  partitions: [{ from: [400, 500], to: [600, 500] }],
  texts: [{ text: 'OPEN', point: [60, 750], color: 'red' }, { text: '', point: [0, 0] }],
  edges: [{ from: [400, 300], to: [600, 300], color: 'red', note: '열린 벽' }],
};
run('기본 위치 표현 읽기: 도형·화살표·호·흐름·칸막이·글자·벽표시', () => {
  const rd = m.normalizeSketchRead(nativeRead, [1000, 1000]);
  if (rd.blocks.length !== 3 || rd.blocks.filter((b) => b.hatched).length !== 1) throw new Error('도형 읽기 실패');
  const arrows = rd.lines.filter((l) => l.kind === 'arrow'); if (arrows.length !== 2 || arrows.some((l) => l.arrow !== 'end')) throw new Error('화살표 읽기 실패');
  if (rd.lines.filter((l) => l.kind === 'arc').length !== 1 || rd.lines.filter((l) => l.kind === 'flow').length !== 1 || rd.lines.filter((l) => l.kind === 'partition').length !== 1) throw new Error('호·흐름·칸막이 읽기 실패');
  if (rd.texts.length !== 1 || rd.texts[0].text !== 'OPEN' || rd.edges.length !== 1) throw new Error('글자(빈 글자는 버림)·벽표시 읽기 실패');
  const b0 = rd.blocks[0].rect; if (Math.abs(b0[0] - 30) > 0.01 || Math.abs(b0[1] - 40) > 0.01) throw new Error('0~1000 → 0~100 좌표 변환 오류');
  const sp = m.makeSketchSpec(rd, null);
  if (sp.blocks.filter((b) => b.kind === 'opening').length !== 1 || sp.memos.length !== 1) throw new Error('벽표시→개구부, 글자→메모 변환 실패');
  const first = sp.winds.find((w) => Math.abs(w.pts.at(-1)[0] - 75) < 0.1 && Math.abs(w.pts.at(-1)[1] - 15) < 0.1); // tip [150,750] → x 75, y 15
  const inside = (p) => sp.blocks.some((b) => b.kind !== 'opening' && p[0] > b.rect[0] && p[0] < b.rect[2] && p[1] > b.rect[1] && p[1] < b.rect[3]);
  if (!first || inside(first.pts[0])) throw new Error('건물 안에서 시작하는 화살표 꼬리가 벽 경계로 정리되지 않음');
  const out = sp.winds.find((w) => Math.abs(w.pts.at(-1)[0] - 25) < 0.1); if (!out || Math.abs(out.pts[0][0] - 10) > 0.1) throw new Error('건물 밖 화살표 꼬리는 그대로여야 함');
  return m.renderSketch(sp);
});
run('화살표 방향: tip 으로 순서를 바로잡는 옛 형식', () => {
  const rd = m.normalizeSketchRead({ blocks: [{ pts: [[10, 10], [30, 10], [30, 30], [10, 30]] }], lines: [{ kind: 'arrow', pts: [[80, 80], [60, 60]], tip: [80, 80], color: 'red' }] }, null);
  const l = rd.lines[0]; if (l.pts.at(-1)[0] !== 80) throw new Error('tip 에 가까운 점이 끝이 되어야 함'); return m.renderSketch(m.makeSketchSpec(rd, null));
});
run('합의: 한 번 크게 빗나간 읽기를 고르지 않는다', () => {
  const mk = (x0) => m.normalizeSketchRead({ blocks: [{ box_2d: [400, x0, 600, x0 + 400], hatched: false }, { box_2d: [100, 700, 900, 800], hatched: true }] }, null);
  const good1 = mk(200); const good2 = mk(205); const bad = mk(550);
  const pick = m.pickConsensusSketch([bad, good1, good2]); if (pick === bad) throw new Error('이탈값을 골랐음');
  return m.renderSketch(m.makeSketchSpec(pick, null));
});
run('복사·붙여넣기·복제: 새 id, 비껴 놓임, 원본 유지, 모든 종류', () => {
  let t = m.makeSketchSpec(m.normalizeSketchRead(rawRead, [1256, 1131]), { items: [{ target: 'b1', name: 'A' }] });
  for (const k of ['wind', 'line', 'memo', 'opening']) t = m.sketchAdd(t, k).spec;
  const ids = [...t.blocks, ...t.lines, ...t.winds, ...t.memos].map((e) => e.id);
  const total = ids.length;
  for (const id of ids) {
    const snap = m.sketchSnapshot(t, id); if (!snap) throw new Error(`스냅샷 실패 ${id}`);
    const r = m.sketchPaste(t, snap, 3, 3);
    if (!r.id || r.id === id) throw new Error(`붙여넣기 id 가 새로 만들어지지 않음 ${id}`);
    const all = [...r.spec.blocks, ...r.spec.lines, ...r.spec.winds, ...r.spec.memos];
    if (all.length !== total + 1) throw new Error(`요소가 하나 늘어야 함 ${id}`);
    if (new Set(all.map((e) => e.id)).size !== all.length) throw new Error(`id 중복 ${id}`);
    const a = m.sketchSnapshot(r.spec, id).el; const b = m.sketchSnapshot(r.spec, r.id).el;
    if (JSON.stringify(a) !== JSON.stringify(m.sketchSnapshot(t, id).el)) throw new Error(`원본이 바뀜 ${id}`);
    const pos = (e) => (e.rect ? [e.rect[0], e.rect[1]] : e.pts ? e.pts[0] : [e.x, e.y]);
    if (Math.abs(pos(b)[0] - pos(a)[0] - 3) > 1e-6 || Math.abs(pos(b)[1] - pos(a)[1] - 3) > 1e-6) throw new Error(`3칸 비껴 놓이지 않음 ${id}`);
    m.renderSketch(r.spec);
  }
  const chained = m.sketchPaste(m.sketchPaste(t, m.sketchSnapshot(t, ids[0]), 3, 3).spec, m.sketchSnapshot(t, ids[0]), 6, 6); // 연속 붙여넣기
  if ([...chained.spec.blocks, ...chained.spec.lines, ...chained.spec.winds, ...chained.spec.memos].length !== total + 2) throw new Error('연속 붙여넣기 실패');
  const none = m.sketchPaste(t, null); if (none.id !== '') throw new Error('빈 클립보드는 아무것도 붙이지 않아야 함');
  return m.renderSketch(chained.spec);
});
run('개구부 추가·그리기', () => { const a = m.sketchAdd(sp, 'opening'); const r = m.renderSketch(a.spec); for (const style of ['concept', 'line']) { const r2 = m.renderSketch({ ...a.spec, style }); if (!(style === 'concept' ? r2.svg.includes('stroke-dasharray="0.1 8.5"') : r2.svg.includes('stroke-dasharray="5 4"'))) throw new Error(`개구부가 안 그려짐(${style})`); } return r; });
run('개념도 스타일: 크림 배경·회색 코어·주황 점선, 이름이 도형 안에, 번호 칼럼 없음 / 도면용은 번호 칼럼', () => {
  const t = m.makeSketchSpec(m.normalizeSketchRead(rawRead, [1256, 1131]), { title: '제목', subtitle: '부제', items: [{ target: 'b1', name: '큰 판' }, { target: 'b3', name: 'CORE' }] });
  const c = m.renderSketch({ ...t, style: 'concept' }).svg; const l = m.renderSketch({ ...t, style: 'line' }).svg;
  if (!c.includes('#FDF8EC') || !c.includes('#D9D5CE') || !c.includes('>CORE<')) throw new Error('개념도 배경·코어 면·코어 이름이 없음');
  if (c.includes('font-size="13" font-weight="800"')) throw new Error('개념도에 번호 표식이 남아 있음');
  if (!l.includes('font-size="13" font-weight="800"') || l.includes('#FDF8EC')) throw new Error('도면용은 흰 배경에 번호 칼럼이어야 함');
  if (t.style !== 'concept') throw new Error('기본 스타일은 개념도여야 함');
  return m.renderSketch(t);
});
run('한 점뿐인 바람(길이 0)도 그려진다', () => m.renderSketch({ ...sp, winds: [{ id: 'z', pts: [[10, 10], [10, 10]], form: 'ribbon', shape: 's', head: 'both' }] }));
if (!/data-eid=/.test(m.renderSketch(sp, { interactive: true }).svg)) fails.push('편집용 SVG 에 data-eid 가 없음');
if (/data-eid=|class="hit"/.test(m.renderSketch(sp).svg)) fails.push('저장용 SVG 에 편집용 속성이 섞임');
let threw = false; try { m.normalizeSketchRead({ blocks: [] }, null); } catch { threw = true; }
if (!threw) fails.push('도형이 없는 스케치 읽기는 오류여야 함');
console.log(`다이어그램 렌더 점검 ${ok}개 통과`);
fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
