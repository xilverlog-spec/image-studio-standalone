// 다이어그램 렌더 회귀 점검(node). check_fast.py 가 호출한다. 단독 실행: node scripts/regression/check_diagrams.mjs
import { rolldown } from '../../node_modules/rolldown/dist/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../src/conceptDiagram/spec.js');
const sketch = path.resolve(here, '../../src/conceptDiagram/sketch.js');
const subjectJs = path.resolve(here, '../../src/conceptDiagram/subject.js');
const pageJs = path.resolve(here, '../../src/conceptDiagram/page.js');
const inlineJs = path.resolve(here, '../../src/conceptDiagram/inlineText.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-reg-'));
const fwd = (p) => JSON.stringify(p.split(path.sep).join('/'));
fs.writeFileSync(path.join(tmp, 'entry.js'), `export { renderSpec, EXAMPLE_SPECS, getTextFields, buildConceptPrompt, DIAGRAM_TYPES } from ${fwd(spec)};
export { snapSegToWall, sketchSnapToWall, pickConsensusSketch, sketchSnapshot, sketchPaste, sketchView, sketchSetVia, sketchSetAmp, sketchMoveBy, sketchSetEnd, FORMS, SHAPES, DASHES, renderSketch, normalizeSketchRead, makeSketchSpec, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd, buildFreeformPrompt, normalizeFreeformRead, makeFreeformSpec, buildSketchReadPrompt, normalizeSketch, sketchBox, sketchAxes, sketchSnapGuides, sketchSnapPointG, sketchAlign, sketchMirrorPlace, sketchMirrorCopy, sketchSameSize, buildAxonPrompt, normalizeAxonRead, makeAxonSpec, makeEditSpec, axonProject, sketchSetPt, sketchAddPt, sketchDelPt, sketchSetZone } from ${fwd(sketch)};
export { SUBJECT_TYPES, SUBJECT_TYPE_LABEL, SUBJECT_KINDS, buildSubjectClassifyPrompt, normalizeSubjectType, routeSubject } from ${fwd(subjectJs)};
export { PAGE_PRESETS, PAGE_LAYOUTS, FONT_OPTIONS, ENGINE_FONT, PT_MM, recommendType, recommendFont, typeTiers, scaleTexts, fitPage, composePage, fontById, layoutById, cellIds, resolveCells, bestCols, presetToCustom, normalizeCustom, scopeIds, getCells, dragEdge, dragMove, setCellMm, splitCell, removeCell, overlappingCells, nextCellId, MAX_CELLS } from ${fwd(pageJs)};
export { sketchContentTop } from ${fwd(sketch)};
export { normText, pickByText, responsiveSvg, sketchTextTargets, sketchApplyText } from ${fwd(inlineJs)};`);
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
  if (!sp.blocks.some((b) => b.openSides.includes('left')) || sp.blocks.filter((b) => b.kind === 'opening').length !== 0 || sp.memos.length !== 1) throw new Error('벽 전체를 덮는 표시→열린 변(left), 글자→메모 변환 실패');
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
run('열린 벽 표시가 도형 외곽선(벽)에 붙고, 벽 길이 안으로 맞춰진다', () => {
  const slab = [20, 30, 60, 50]; // 윗변 y=30, 아랫변 y=50, 왼변 x=20
  const near = m.snapSegToWall([22, 31.7 - 1.3, 70, 31.7 + 1.3], [{ rect: slab }]); // 윗변에서 1.7 떨어진 가로 구간, 오른쪽으로 벽을 넘어섬
  if (Math.abs((near[1] + near[3]) / 2 - 30) > 1e-6) throw new Error('윗변에 붙지 않음'); if (near[2] > 60 + 1e-6 || near[0] < 22 - 1e-6) throw new Error('벽 길이 안으로 맞춰지지 않음');
  const vert = m.snapSegToWall([58.5 - 1.3, 32, 58.5 + 1.3, 48], [{ rect: slab }, { rect: [50, 35, 59, 45], penalty: 1.5 }]); // 코어 오른변(59)과 판 오른변(60) 사이
  if (Math.abs((vert[0] + vert[2]) / 2 - 60) > 1e-6 && Math.abs((vert[0] + vert[2]) / 2 - 59) > 1e-6) throw new Error('세로 구간이 벽에 붙지 않음');
  const far = m.snapSegToWall([30, 70, 50, 72], [{ rect: slab }]); if (far[1] !== 70) throw new Error('멀리 있는 표시는 그대로여야 함');
  const none = m.snapSegToWall([22, 10, 40, 12], [{ rect: slab }]); if (none[1] !== 10) throw new Error('벽과 겹치지 않는 구간은 붙이지 않아야 함');
  const t = m.makeSketchSpec(m.normalizeSketchRead({ blocks: [{ box_2d: [300, 200, 500, 600], hatched: false }], edges: [{ from: [313, 220], to: [313, 580], color: 'red' }] }, null), null);
  if (!t.blocks[0].openSides.includes('top')) throw new Error('벽의 절반 이상을 덮는 표시는 그 변 전체가 열린 변이 되어야 함');
  const t2 = m.makeSketchSpec(m.normalizeSketchRead({ blocks: [{ box_2d: [300, 200, 500, 600], hatched: false }], edges: [{ from: [313, 220], to: [313, 300], color: 'red' }] }, null), null); // 벽의 20% 만 덮는 짧은 표시
  const op = t2.blocks.find((b) => b.kind === 'opening'); if (!op || Math.abs((op.rect[1] + op.rect[3]) / 2 - 30) > 1e-6) throw new Error('짧은 표시가 윗변(y=30)에 붙은 개구부로 남지 않음');
  if (t2.blocks[0].openSides.length) throw new Error('짧은 표시는 변 전체로 합치면 안 됨');
  const op2 = m.sketchUpdate(t2, op.id, { rect: [op.rect[0], op.rect[1] + 3, op.rect[2], op.rect[3] + 3] });
  const back = m.sketchSnapToWall(op2, op.id).blocks.find((b) => b.id === op.id); if (Math.abs((back.rect[1] + back.rect[3]) / 2 - 30) > 1e-6) throw new Error('붙이기 버튼 동작 실패');
  const sides = m.renderSketch({ ...t, style: 'concept' }).svg; if (!sides.includes('stroke-dasharray="0.1 8.5"')) throw new Error('열린 변 점선이 그려지지 않음');
  const ob = m.sketchUpdate(t, t.blocks[0].id, { openSides: ['top', 'left', 'bogus'], inset: 0 }); const lines = (m.renderSketch(ob).svg.match(/stroke-dasharray="0.1 8.5"/g) || []).length; if (lines !== 2) throw new Error('유효한 열린 변 2개만 그려야 함(없는 변 이름은 무시)');
  return m.renderSketch(t);
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

// 자유 해석(입체·수채 등 평면 도면이 아닌 그림): AI 가 준 요소·움직임이 편집 가능한 spec 으로 바뀌고, 이상한 값이 와도 그려진다
const ffRaw = { summary: '경첩으로 회전하는 판', title: 'HINGED SPACE', subtitle: '가변형 공간', elements: [{ id: 'e1', role: 'fixed', label: '중앙벽', box: [200, 100, 700, 900] }, { id: 'e2', role: 'movable', label: '좌측판', box: [250, 120, 500, 300] }, { id: 'e3', role: 'movable', label: '', box: [300, 500, 300, 520] }, { id: 'bad', box: [1, 2] }],
  motions: [{ id: 'm1', type: 'rotate', from: [250, 300], to: [500, 300], bulge: [370, 380], label: '회전' }, { id: 'm2', type: 'slide', from: [100, 100], to: [100, 300] }, { id: 'm3', type: 'flow', from: [900, 100], to: [900, 500] }, { id: 'm4', type: 'rotate', from: [10, 10], to: [10, 10] }, { type: 'x' }],
  texts: [{ text: 'HINGED SPACE !', point: [950, 500] }, { text: '7/15/15 S. Holl', point: [950, 800] }] };
run('자유 해석: 읽기 정리 → spec → 그리기(회전·이동·흐름·제목 중복 글자 제거)', () => {
  const rd = m.normalizeFreeformRead(ffRaw, [1200, 870]);
  if (rd.elements.length !== 3) throw new Error(`요소 수 ${rd.elements.length} (상자가 없는 항목은 버려야 함)`);
  if (rd.motions.length !== 3) throw new Error(`움직임 수 ${rd.motions.length} (길이 0·종류 없는 항목은 버려야 함)`);
  const sp2 = m.makeFreeformSpec(rd);
  if (sp2.blocks.length !== 3 || sp2.winds.length !== 3) throw new Error('도형·화살표 수가 읽은 값과 다름');
  if (sp2.blocks.filter((b) => b.fill === '#F2C94C').length !== 2 || sp2.blocks[0].fill !== '#D9D5CE') throw new Error('고정은 회색·가변은 노랑이어야 함');
  const w = sp2.winds[0]; if (w.shape !== 'arc' || w.dash !== 'dashed' || !(Math.abs(w.amp) >= 0.15)) throw new Error('회전은 점선 호여야 함');
  if (sp2.memos.length !== 1 || sp2.memos[0].text !== '7/15/15 S. Holl') throw new Error('제목과 같은 글자 메모는 빼야 함');
  const many = m.makeFreeformSpec(m.normalizeFreeformRead({ ...ffRaw, motions: [1, 2, 3].map(() => ({ type: 'rotate', from: [250, 300], to: [500, 300], label: '회전' })).concat([{ type: 'slide', from: [100, 100], to: [100, 300], label: '이동' }]) }, null));
  if (many.winds.slice(0, 3).some((w) => w.outLabel) || many.winds[3].outLabel !== '이동') throw new Error('3번 이상 반복되는 라벨은 빼고 한 번뿐인 라벨은 남겨야 함');
  const thin = sp2.blocks[2].rect; if (thin[2] - thin[0] < 1.5) throw new Error('얇은 요소는 최소 두께로 키워야 함');
  const mirrored = m.makeFreeformSpec(m.normalizeFreeformRead({ ...ffRaw, motions: [{ type: 'rotate', from: [250, 300], to: [500, 300], bulge: [370, 220] }] }, null)).winds[0].amp;
  if (!(mirrored * w.amp < 0)) throw new Error('호가 불룩한 쪽(bulge)에 따라 휨 방향이 바뀌어야 함');
  return m.renderSketch(m.sketchUpdate(sp2, 'b2', { fill: '#F2C94C' }), { interactive: true, selected: 'b2' });
});
{
  let t2 = false; try { m.normalizeFreeformRead({ elements: [] }, null); } catch { t2 = true; }
  if (!t2) fails.push('요소가 없는 자유 해석은 오류여야 함');
  const pr = m.buildFreeformPrompt('가변형 공간이 많다는 다이어그램');
  if (!pr.includes('가변형 공간이 많다는 다이어그램') || !pr.includes('"elements"') || !pr.includes('"motions"')) fails.push('자유 해석 프롬프트에 설명·스키마가 없음');
  if (!m.buildSketchReadPrompt().includes('"view"')) fails.push('손스케치 읽기에 그림 종류(view) 판별이 없음');
  if (m.normalizeSketchRead({ blocks: [{ box_2d: [0, 0, 500, 500] }], view: '3d' }, null).view !== '3d' || m.normalizeSketchRead({ blocks: [{ box_2d: [0, 0, 500, 500] }] }, null).view !== 'plan') fails.push('view 값을 읽지 못함(없으면 plan)');
}

// 정렬·대칭: 끌 때 안내선에 붙는 위치, 버튼 정렬·대칭 위치·대칭 복제·같은 크기
{
  const A = { id: 'b1', kind: 'slab', rect: [10, 10, 30, 30], openSides: ['left'] };
  const B = { id: 'b2', kind: 'slab', rect: [60, 10, 80, 30] };
  const Cc = { id: 'b3', kind: 'core', rect: [40, 50, 50, 60] };
  const W1 = { id: 'w1', pts: [[10, 80], [40, 90]], shape: 's', amp: 0.5, head: 'end', via: [25, 85] };
  const g0 = m.normalizeSketch({ frame: [0, 0, 100, 100], blocks: [A, B, Cc], winds: [W1] });
  const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
  run('정렬 안내선: 변·가운데·그림 가운데·대칭 위치에 붙고, 멀면 붙지 않는다', () => {
    let r = m.sketchSnapGuides(g0, 'b3', [10.6, 40, 30.6, 50]);
    if (!near(r.dx, -0.6) || !r.guides.some((g) => g.dim === 'x')) throw new Error(`변 맞춤 실패 dx=${r.dx}`);
    r = m.sketchSnapGuides(g0, 'b3', [44.5, 70, 54.5, 80]);
    if (!near(r.dx, 0.5) || !r.guides.some((g) => g.kind === 'axis' && g.dim === 'x' && near(g.v, 50))) throw new Error(`그림 가운데 맞춤 실패 dx=${r.dx}`);
    r = m.sketchSnapGuides(g0, 'b3', [69.4, 60, 89.4, 70]);
    if (!near(r.dx, 0.6) || !r.guides.some((g) => g.kind === 'mirror') || !r.guides.some((g) => g.kind === 'axis')) throw new Error(`대칭 위치 맞춤 실패 dx=${r.dx} ${JSON.stringify(r.guides.map((g) => g.kind))}`);
    r = m.sketchSnapGuides(g0, 'b3', [200, 300, 220, 320]); if (r.dx !== 0 || r.dy !== 0 || r.guides.length) throw new Error('멀리 있으면 붙지 않아야 함');
    r = m.sketchSnapGuides(g0, 'b3', [44, 70, 54, 80], 1.4, []); // 위쪽 판 B 의 아래변(y=30) 등과 무관하게 y 는 가까운 기준만
    for (const g of m.sketchSnapGuides(g0, 'b3', [10.6, 40.4, 30.6, 50.4]).guides) if (![g.v, g.lo, g.hi].every(Number.isFinite)) throw new Error('안내선에 NaN');
    return m.renderSketch(g0);
  });
  run('정렬 안내선: 화살표 끝점을 끌 때 반대쪽 끝과 수평·수직으로 맞춘다, 글자·선·화살표 영역', () => {
    const r = m.sketchSnapPointG(g0, 'w1', [70.2, 90.3], 1.4, [[10, 90, 10, 90]]);
    if (!near(r.pt[1], 90)) throw new Error(`수평 맞춤 실패 ${r.pt}`);
    const mm = m.normalizeSketch({ frame: [0, 0, 100, 100], blocks: [A], memos: [{ id: 'm1', x: 20.3, y: 70, text: '가' }] });
    if (!near(m.sketchSnapGuides(mm, 'm1', m.sketchBox(mm, 'm1')).dx, -0.3)) throw new Error('글자가 도형 가운데에 붙지 않음');
    const bw = m.sketchBox(g0, 'w1'); if (!near(bw[0], 10) || !near(bw[3], 90)) throw new Error('화살표 영역 계산 오류');
    const ax = m.sketchAxes(g0, 'b3'); if (!ax.x.length || !ax.y.length) throw new Error('대칭축 후보 없음');
    return m.renderSketch(g0);
  });
  run('정렬·대칭 버튼: 정렬, 대칭 위치, 같은 크기', () => {
    let t = m.sketchAlign(g0, 'b3', 'b1', 'left'); if (!near(m.sketchBox(t, 'b3')[0], 10)) throw new Error('왼쪽 맞춤 실패');
    t = m.sketchAlign(g0, 'b3', 'axis', 'hcenter'); const bb = m.sketchBox(t, 'b3'); if (!near((bb[0] + bb[2]) / 2, 50)) throw new Error('그림 가운데 맞춤 실패');
    t = m.sketchAlign(g0, 'b3', 'b2', 'bottom'); if (!near(m.sketchBox(t, 'b3')[3], 30)) throw new Error('아래 맞춤 실패');
    t = m.sketchMirrorPlace(g0, 'b2', 'b1', 50, 'h'); const mb = m.sketchBox(t, 'b2'); if (!near((mb[0] + mb[2]) / 2, 80)) throw new Error('좌우 대칭 위치 실패');
    t = m.sketchMirrorPlace(g0, 'b3', 'b1', 50, 'v'); const vb = m.sketchBox(t, 'b3'); if (!near((vb[1] + vb[3]) / 2, 80)) throw new Error('상하 대칭 위치 실패');
    t = m.sketchSameSize(g0, 'b3', 'b1'); const sb = m.sketchBox(t, 'b3'); if (!near(sb[2] - sb[0], 20) || !near((sb[0] + sb[2]) / 2, 45)) throw new Error('같은 크기 실패');
    if (m.sketchAlign(g0, 'nope', 'b1', 'left') !== g0 || m.sketchAlign(g0, 'b3', 'nope', 'left') !== g0) throw new Error('없는 요소는 그대로여야 함');
    return m.renderSketch(t);
  });
  run('대칭 복제: 도형(열린 변 좌우 교환)·화살표(휘는 방향 반전)·글자·상하', () => {
    let r = m.sketchMirrorCopy(g0, 'b1', 50, 'h'); const nb = r.spec.blocks.find((b) => b.id === r.id);
    if (!r.id || r.id === 'b1' || !nb) throw new Error('복제 실패');
    if (!near(nb.rect[0], 70) || !near(nb.rect[2], 90) || nb.openSides.join() !== 'right') throw new Error(`도형 복제 오류 ${JSON.stringify(nb)}`);
    r = m.sketchMirrorCopy(g0, 'b1', 50, 'v'); const vb = r.spec.blocks.find((b) => b.id === r.id); if (!near(vb.rect[1], 70) || !near(vb.rect[3], 90) || vb.openSides.join() !== 'left') throw new Error('상하 복제 오류');
    r = m.sketchMirrorCopy(g0, 'w1', 50, 'h'); const nw = r.spec.winds.find((w) => w.id === r.id);
    if (!near(nw.pts[0][0], 90) || !near(nw.pts[1][0], 60) || !near(nw.amp, -0.5) || !near(nw.via[0], 75)) throw new Error(`화살표 복제 오류 ${JSON.stringify(nw)}`);
    const mm = m.normalizeSketch({ frame: [0, 0, 100, 100], memos: [{ id: 'm1', x: 20, y: 70, text: '가' }] });
    r = m.sketchMirrorCopy(mm, 'm1', 50, 'h'); if (!near(r.spec.memos.find((q) => q.id === r.id).x, 80)) throw new Error('글자 복제 오류');
    if (m.sketchMirrorCopy(g0, 'nope', 50).id !== '') throw new Error('없는 요소 복제는 아무것도 만들지 않아야 함');
    return m.renderSketch(r.spec);
  });
}

// 분석 축측도: 입체 바탕 + 바람 띠 + 일조 호·해 아이콘 + 오른쪽 문구 블록이 편집 가능한 spec 으로 만들어지고 그려진다
{
  const axon = { svg: '<g><path d="M0 0 L100 0 L100 60 L0 60 Z" fill="#ddd"/></g>', vb: [-60, -40, 120, 100], proj: { rot: -15, elev: 38, cx: 500, cy: 300, hgt: 40 }, plan_size: [1000, 600] };
  const raw = { reference: { parts: ['입체 평면', '바람 띠'], unsupported: [] }, title: '전 세대 남향배치\n맞통풍 극대화', subs: ['채광 확보', '맞통풍'], winds: [{ from: [900, 300], to: [100, 320], label: '' }, { from: [900, 600], to: [100, 620] }, { from: [5, 5] }], sun: { from: [1150, 100], via: [1250, 500], to: [1150, 900] } };
  run('분석 축측도: 읽기 정리 → spec → 그리기(바탕·바람·해·문구)', () => {
    const rd = m.normalizeAxonRead(raw, axon);
    if (rd.winds.length !== 2 || !rd.sun || rd.referenceParts.length !== 2) throw new Error(`읽기 정리 오류 winds=${rd.winds.length}`);
    if (!rd.title.includes(String.fromCharCode(10))) throw new Error('제목의 줄바꿈이 바뀌지 않음');
    const sp2 = m.makeAxonSpec(rd);
    if (sp2.layout !== 'axon' || !sp2.base || sp2.winds.length !== 3 || sp2.memos[0].icon !== 'sun' || sp2.textBlock.subs.length !== 2) throw new Error('spec 구성 오류');
    if (sp2.winds[0].form !== 'soft' || sp2.winds[2].shape !== 'arc' || sp2.winds[2].head !== 'both' || sp2.winds[2].dash !== 'dashed') throw new Error('바람 띠(번짐)·일조 호(점선, 양쪽 화살촉) 모양이 아님');
    const longT = m.renderSketch({ ...sp2, textBlock: { ...sp2.textBlock, title: '맞통풍과 수변조망을 극대화하는\n남향 배치 계획안' } }).svg; const fsz = Number((longT.match(/font-size="([\d.]+)" font-weight="800"/) || [])[1]); if (!(fsz > 0 && fsz < 44)) throw new Error('긴 제목은 글자를 줄여 칸 안에 맞춰야 함: ' + fsz);
    const r = m.renderSketch(sp2, { interactive: true });
    if (!r.svg.includes('data-base="1"') || !r.svg.includes('남향배치') || !r.svg.includes('stroke-linecap="round"')) throw new Error('바탕·문구가 그려지지 않음');
    if (/data-eid=[^>]*data-base|data-base[^>]*data-eid/.test(r.svg)) throw new Error('바탕이 선택·끌기에 반응하면 안 됨');
    const n2 = m.normalizeSketch(JSON.parse(JSON.stringify(sp2))); if (!n2.base || !n2.textBlock || n2.layout !== 'axon') throw new Error('정규화에서 바탕·문구가 사라짐');
    const bad = m.normalizeSketch({ ...sp2, base: { svg: 5, vb: [1, 2], rect: [0, 0, 1, 1] }, textBlock: 'x' }); if (bad.base !== null) throw new Error('잘못된 바탕은 버려야 함');
    return r;
  });
  const p0 = m.axonProject(axon, [0, 0, 100, 83.3], [500, 500], 0);
  if (!(p0[0] > 0 && p0[0] < 100 && p0[1] > 0 && p0[1] < 83.3)) fails.push(`평면 가운데가 바탕 안에 안 놓임 ${p0}`);
  const hi = m.axonProject(axon, [0, 0, 100, 83.3], [500, 500], 1);
  if (!(hi[1] < p0[1])) fails.push('벽 윗면 점이 바닥 점보다 위에 놓여야 함');
  try { m.normalizeAxonRead({ winds: [] }, null); fails.push('바탕이 없으면 오류여야 함'); } catch { /* 의도된 오류 */ }
  const pr = m.buildAxonPrompt('남향 맞통풍', { south: 'left', hasRef: true });
  if (!pr.includes('남향 맞통풍') || !pr.includes('도면의 왼쪽') || !pr.includes('두 번째 이미지')) fails.push('분석 축측도 프롬프트에 설명·방향·참고 안내가 없음');
}

// 이미지 종류 자동 판별: 분류 결과 → 읽기 방식 경로, 이상한 응답은 안전하게 처리
{
  const R = m.routeSubject;
  const expect = (cond, msg) => { if (!cond) fails.push('자동 판별: ' + msg); else ok++; };
  expect(R('hand_sketch') === 'sketch' && R('artwork_3d') === 'freeform' && R('building_photo') === 'form' && R('site_plan') === 'site', '기본 경로(스케치·입체 그림·사진·배치도)');
  expect(R('plan_drawing') === 'plan', '단서 없는 평면도는 평면 다이어그램');
  expect(R('plan_drawing', { hasRef: true }) === 'axon', '참고 이미지가 있는 평면도는 분석 축측도');
  for (const t of ['맞통풍을 보여줘', '남향 채광 분석', '일조와 조망', '입체로']) expect(R('plan_drawing', { text: t }) === 'axon', `분석 단서 '${t}' → 분석 축측도`);
  expect(R('plan_drawing', { text: '공용과 사적 공간 구분' }) === 'plan', '분석 단서 없는 설명은 평면 다이어그램');
  for (const t of ['동선을 표시한 다이어그램', '동선을 나타내는 건축다이어그램을 만들어줘', '부서별 조닝', 'zoning diagram']) expect(R('plan_drawing', { text: t }) === 'edit', `동선·조닝 요청 '${t}' → AI 이미지 편집`);
  expect(R('plan_drawing', { text: '통풍과 동선' }) === 'axon' && R('plan_drawing', { text: '동선', hasRef: true }) === 'axon', '분석 단서·참고 이미지가 있으면 동선 요청이어도 분석 축측도가 우선');
  // 사진·3D 뷰·배치도·그 밖의 그림: 흐름·구역·방향·색을 얹는 요청 → AI 이미지 편집, 아니면 기존 경로(2026-10-16)
  for (const [ty, t, want] of [['building_photo', '주출입구와 보행자 접근 동선', 'edit'], ['building_photo', '일조 방향과 시선', 'edit'], ['building_photo', '기능별로 색을 나눠 구분', 'edit'], ['building_photo', '', 'form'], ['building_photo', '매스 과정도', 'form'],
    ['site_plan', '차량 동선과 보행 동선', 'edit'], ['site_plan', '구역 구분', 'edit'], ['site_plan', '', 'site'], ['site_plan', '코어 스퀘어와 순환', 'site'],
    ['artwork_3d', '동선을 표시', 'edit'], ['artwork_3d', '가변형 공간이 많다는 다이어그램', 'freeform'], ['artwork_3d', '바람 흐름', 'freeform'], ['other', '접근 동선', 'edit'], ['other', '', 'freeform'], ['hand_sketch', '동선', 'sketch']]) {
    expect(R(ty, { text: t }) === want, `${ty} + '${t}' → ${want} (실제 ${R(ty, { text: t })})`);
  }
  for (const ty of ['building_photo', 'site_plan', 'artwork_3d', 'other']) expect(R(ty, { text: '동선', hasRef: true }) !== 'edit', `${ty}: 스타일 참고 이미지가 있으면 이미지 편집으로 보내지 않음(참고 이미지를 쓰지 못함)`);
  expect(R('other') === 'freeform' && R('엉뚱') === 'freeform' && R(undefined) === 'freeform', '모르는 종류는 자유 해석');
  expect(m.normalizeSubjectType({ type: 'Hand_Sketch', reason: 'x' }).type === 'hand_sketch' && m.normalizeSubjectType({ type: 'zzz' }).type === 'other' && m.normalizeSubjectType(null).type === 'other', '분류 응답 정리');
  expect(m.SUBJECT_TYPES.every((t) => m.SUBJECT_TYPE_LABEL[t]) && ['sketch', 'freeform', 'form', 'plan', 'site', 'axon', 'edit'].every((k) => m.SUBJECT_KINDS[k]), '종류 이름표가 모두 있음');
  expect(m.SUBJECT_TYPES.every((t) => m.buildSubjectClassifyPrompt().includes(t)), '분류 프롬프트에 모든 종류가 있음');
}
// 도면 위에 표시(AI 이미지 편집) 결과: 그림을 바탕으로 깔고 제목·범례가 편집 가능한 글자로 얹힌다
{
  const expect = (cond, msg) => { if (!cond) fails.push('이미지 편집 결과: ' + msg); else ok++; };
  const url = 'data:image/jpeg;base64,/9j/AAAA';
  const sp = m.makeEditSpec({ imageUrl: url, w: 1743, h: 1167, title: '동선 다이어그램', legend: [{ color: '#F61918', kind: 'flow', label: '주 동선' }, { color: '#2870E9', kind: 'zone', label: '위쪽 구역' }, { color: 'bad', label: '무시' }] });
  const n = m.normalizeSketch(sp);
  expect(n.layout === 'image' && n.base?.isImage && n.memos.length === 2 && n.title === '동선 다이어그램', 'spec 이 정규화 뒤에도 유지됨(레이아웃·바탕·범례 2개·제목)');
  const r = m.renderSketch(sp);
  expect(r.svg.includes('<image href="data:image/jpeg') && r.svg.includes('동선 다이어그램') && r.svg.includes('━ 주 동선') && r.svg.includes('■ 위쪽 구역') && r.svg.includes('#F61918'), '그림·제목·범례 글자(동선 ━, 구역 ■)가 그려짐');
  const v = m.sketchView(sp); const p0 = v.toScreen([0, 0]); const p1 = v.toScreen([100, 100 * 1167 / 1743]);
  expect(p0[0] >= 30 - 0.5 && p1[0] <= 1170 + 0.5 && p1[1] <= 735 + 0.5 && p1[0] - p0[0] > 600, '그림이 화면 영역 안에 크게 놓임');
  const sp0 = m.makeEditSpec({ imageUrl: url, w: 800, h: 600, legend: [] });
  expect(m.renderSketch(sp0).svg.includes('<image') && m.normalizeSketch(sp0).memos.length === 0, '범례가 없어도 그려짐');
}
// 도면 위에 표시(AI 이미지 편집) 결과를 편집 가능한 층으로: 화살표 → 선(winds), 구역 색 → 곱하기 층(zones)
{
  const expect = (cond, msg) => { if (!cond) fails.push('이미지 편집 층: ' + msg); else ok++; };
  const url = 'data:image/jpeg;base64,/9j/AAAA'; const mk = 'data:image/png;base64,iVBORw0KGgo=';
  const layers = { arrows: [{ pts: [[100, 300], [400, 280], [800, 300]], width: 4, color: '#F20B09', head: 'end', dash: 'dashed', smooth: true }, { pts: [[100, 500], [700, 500]], width: 6, color: '#2870E9', head: 'both', dash: 'solid', smooth: true }, { pts: [[1, 1]], width: 3, color: '#000000' }],
    zones: [{ color: '#BAD6B0', label: '녹지', maskUrl: mk }, { color: '#A6CDF3', label: '업무', maskUrl: mk, blend: 'color' }, { color: 'bad', label: '무시', maskUrl: mk }, { color: '#F9DF84', label: '마스크없음' }] };
  const legend = [{ color: '#F20B09', kind: 'flow', label: '주 동선' }, { color: '#BAD6B0', kind: 'zone', label: '녹지' }, { color: '#A6CDF3', kind: 'zone', label: '업무' }];
  const sp = m.makeEditSpec({ imageUrl: url, w: 961, h: 600, title: 'T', legend, layers });
  const n = m.normalizeSketch(sp);
  expect(n.winds.length === 2 && n.zones.length === 2, `화살표 2개(점이 모자란 것 제외)·구역 층 2개(색이 잘못되거나 마스크 없는 것 제외) (실제 ${n.winds.length}/${n.zones.length})`);
  const w0 = n.winds[0]; const k = 100 / 961;
  expect(w0.shape === 'read' && w0.bend === 1 && w0.head === 'end' && w0.dash === 'dashed' && w0.form === 'line' && Math.abs(w0.pts[0][0] - 100 * k) < 0.06 && Math.abs(w0.pts[2][0] - 800 * k) < 0.06, '화살표 좌표가 그림 화소 → 다이어그램 좌표(0~100)로 바뀌고 모양은 읽은 그대로(read)');
  expect(w0.width >= 1.6 && w0.width <= 14 && n.winds[1].width > w0.width && n.winds[1].head === 'both', '굵기가 화면 좌표로 바뀌고 굵을수록 굵게, 양쪽 화살촉 유지');
  expect(n.zones[0].blend === 'multiply' && n.zones[1].blend === 'color' && n.zones[0].opacity === 1, '구역 층: 선 도면은 곱하기, 사진·3D 는 color 혼합');
  expect(n.memos.find((q) => q.text.includes('녹지')).zone === n.zones[0].id && !n.memos.find((q) => q.text.includes('주 동선')).zone, '구역 범례 글자는 구역 층에 연결, 동선 범례는 연결 없음');
  const r = m.renderSketch(sp).svg;
  expect(r.includes('data-zone="z1"') && r.includes('mix-blend-mode:multiply') && r.includes('mix-blend-mode:color') && r.includes('<mask id="zm_z1"') && r.includes('mask="url(#zm_z1)"') && r.includes('marker-end'), '렌더: 구역 층(마스크+곱하기/color)과 화살촉 표시');
  expect(!m.renderSketch({ ...sp, zones: sp.zones.map((z) => ({ ...z, hidden: true })) }).svg.includes('data-zone='), '숨긴 구역 층은 그려지지 않음');
  const filled = m.renderSketch(sp).svg.match(/<marker id="aw_w1"[^>]*>[\s\S]*?<\/marker>/)[0];
  expect(filled.includes('M0 0L10 5L0 10Z') && filled.includes('markerWidth="4"'), '이미지 편집 화살촉은 채운 삼각형');
  // 구역 층 고치기: 색·이름이 연결된 범례 글자에 따라감
  const s2 = m.sketchSetZone(n, 'z1', { color: '#F6B8B3', label: '공용' });
  const mm = s2.memos.find((q) => q.zone === 'z1');
  expect(s2.zones[0].color === '#F6B8B3' && mm.color === '#F6B8B3' && mm.text === '■ 공용' && s2.memos.find((q) => q.text.includes('주 동선')).color === '#F20B09', '구역 색·이름을 바꾸면 연결된 범례 글자만 따라 바뀜');
  expect(m.sketchSetZone(n, 'nope', { color: '#000000' }) === n && m.sketchSetZone(n, 'z2', { hidden: true }).zones[1].hidden === true && m.sketchSetZone(n, 'z2', { opacity: 0.4 }).zones[1].opacity === 0.4, '없는 층은 그대로, 숨김·농도 변경');
  // 읽은 그대로(read) 선의 점 편집
  const w = n.winds[0]; const mid = w.pts[1];
  const a = m.sketchSetPt(n, w.id, 1, [mid[0] + 5, mid[1] - 3]); const p1 = a.winds[0].pts[1];
  expect(Math.abs(p1[0] - (mid[0] + 5)) < 0.06 && Math.abs(p1[1] - (mid[1] - 3)) < 0.06 && a.winds[0].pts[0][0] === w.pts[0][0], '중간 점만 옮겨짐(끝점은 그대로)');
  expect(m.sketchSetPt(n, w.id, 0, [1, 1]) === n && m.sketchSetPt(n, w.id, 2, [1, 1]) === n, '끝점 번호는 이 함수로 옮기지 않음');
  const bent = { ...n, winds: n.winds.map((q, i) => (i === 0 ? { ...q, bend: 0.5 } : q)) };
  const b2 = m.sketchSetPt(bent, w.id, 1, [mid[0], mid[1] + 4]); const c0 = [(w.pts[0][0] + w.pts[2][0]) / 2, (w.pts[0][1] + w.pts[2][1]) / 2];
  expect(Math.abs((c0[1] + (b2.winds[0].pts[1][1] - c0[1]) * 0.5) - (mid[1] + 4)) < 0.1, '곡선 세기(bend)가 1 이 아니어도 화면에 보이는 위치로 옮겨짐(거꾸로 계산)');
  const ad = m.sketchAddPt(n, w.id); const dl = m.sketchDelPt(ad, w.id);
  expect(ad.winds[0].pts.length === w.pts.length + 1 && dl.winds[0].pts.length === w.pts.length && m.sketchDelPt(m.sketchDelPt(m.sketchDelPt(n, w.id), w.id), w.id).winds[0].pts.length === 2, '점 추가(+1)·점 빼기(-1), 두 점 아래로는 안 줄어듦');
  expect(m.sketchAddPt(m.sketchUpdate(n, w.id, { shape: 'arc' }), w.id).winds[0].pts.length === w.pts.length, "'read' 모양이 아니면 점 추가는 무시");
  // 편집기에서 선택한 read 화살표에는 중간 점 조절 손잡이(pt:i)가 나옴
  const ri = m.renderSketch(n, { interactive: true, selected: w.id }).svg;
  expect(ri.includes('data-handle="pt:1"') && !ri.includes('data-handle="pt:0"') && !ri.includes('data-handle="pt:2"'), '선택한 읽은-모양 화살표의 중간 점마다 손잡이(끝점 제외)');
  // 정규화·저장 왕복에서도 층이 유지됨
  const rt = m.normalizeSketch(JSON.parse(JSON.stringify(n)));
  expect(rt.zones.length === 2 && rt.zones[1].blend === 'color' && rt.memos.some((q) => q.zone === 'z1'), '정규화·직렬화 왕복에서 층·연결이 유지됨');
  // 층이 없는 예전 결과(합성 그림 한 장)도 그대로 동작
  const old = m.makeEditSpec({ imageUrl: url, w: 800, h: 600, legend });
  expect(m.normalizeSketch(old).zones.length === 0 && m.normalizeSketch(old).winds.length === 0 && m.renderSketch(old).svg.includes('<image') && !m.renderSketch(old).svg.includes('data-zone='), '층이 없으면 예전처럼 그림 한 장 + 글자 범례');
  // 여러 칸 페이지: 칸마다 id 접두어가 붙어 같은 id 가 충돌하지 않음
  const sc = m.scopeIds('<defs><marker id="aw_w1"/><mask id="zm_z1"/></defs><path marker-end="url(#aw_w1)" mask="url(#zm_z1)" data-eid="w1"/><use href="#aw_w1"/>', 'c1_');
  expect(sc.includes('id="c1_aw_w1"') && sc.includes('url(#c1_aw_w1)') && sc.includes('url(#c1_zm_z1)') && sc.includes('href="#c1_aw_w1"') && sc.includes('data-eid="w1"'), 'scopeIds: id·url(#)·href 에 접두어, data-eid 는 그대로');
  const lay = { svg: r, width: 1200, height: 760 };
  const pg = m.composePage({ w: 420, h: 297, medium: 'print' }, [{ id: 'c1', render: lay }, { id: 'c2', render: lay }], { layoutId: '2x1' });
  const ids = [...pg.svg.matchAll(/\sid="([^"]+)"/g)].map((q) => q[1]);
  expect(ids.length > 0 && new Set(ids).size === ids.length && pg.svg.includes('c0_zm_z1') && pg.svg.includes('c1_zm_z1'), '같은 그림을 두 칸에 넣어도 id 가 겹치지 않음(마스크·화살촉이 서로 덮어쓰지 않음)');
  const one = m.composePage({ w: 420, h: 297, medium: 'print' }, [{ id: 'c1', render: lay }], { layoutId: '1x1' });
  expect(one.svg.includes('id="zm_z1"') && !one.svg.includes('c0_zm_z1'), '한 칸 페이지는 id 를 바꾸지 않음');
}
// 출력 크기·글자 위계(page.js): 추천 pt, 크기 맞춤, 글꼴 바꿈, 경고
{
  const expect = (cond, msg) => { if (!cond) fails.push('출력 크기: ' + msg); else ok++; };
  const rt = (id) => m.recommendType(m.PAGE_PRESETS.find((x) => x.id === id));
  const a3 = rt('a3l'); const a4 = rt('a4l'); const a1 = rt('a1l'); const ppt = rt('ppt');
  expect(a3.title === 32 && a3.sub === 18 && a3.label === 11 && a3.small === 8, `A3 기준 32/18/11/8pt (실제 ${a3.title}/${a3.sub}/${a3.label}/${a3.small})`);
  expect(a4.title < a3.title && a3.title < a1.title && a4.label < a3.label && a3.label < a1.label, '용지가 클수록 글자도 커짐');
  expect(rt('a3p').title === a3.title, '가로·세로가 달라도 짧은 변이 같으면 같은 위계');
  for (const t of [a4, a3, a1, ppt]) expect(t.title > t.sub && t.sub > t.label && t.label > t.small, `위계 제목>소제목>본문>작은 글자 (${t.title}/${t.sub}/${t.label}/${t.small})`);
  expect(ppt.title === 36 && ppt.label === 14 && ppt.labelMin === 11 && a3.labelMin === 7, 'PPT 기준 36/…/14pt, 최소 읽기 크기');
  const sp = m.makeEditSpec({ imageUrl: 'data:image/jpeg;base64,/9j/AAAA', w: 1743, h: 1167, title: '', legend: [{ color: '#F61918', kind: 'flow', label: '주 동선' }] });
  const base = m.renderSketch({ ...sp, title: '', subtitle: '' });
  expect(base.svg.includes(m.ENGINE_FONT), '렌더러가 내는 글꼴 값이 page.js 의 ENGINE_FONT 와 같음(바꿔 끼울 수 있음)');
  const page = { w: 420, h: 297, medium: 'print' };
  const fp = m.fitPage(base, page, { title: '동선 다이어그램', subtitle: '연구시설 1층', fontId: 'noto', cropTop: m.sketchContentTop(sp) });
  expect(fp.svg.includes('width="420mm"') && fp.svg.includes('height="297mm"') && fp.svg.includes('viewBox="0 0 420 297"'), '실제 크기(mm)로 저장됨');
  expect(!fp.svg.includes(m.ENGINE_FONT) && fp.svg.includes("'Noto Sans KR'"), '글꼴이 바뀜');
  const tm = fp.svg.match(/font-size="([\d.]+)" font-weight="800"[^>]*>동선 다이어그램</);
  expect(tm && Math.abs(Number(tm[1]) / m.PT_MM - 32) < 0.05, `제목이 추천 32pt 로 그려짐 (${tm && Number(tm[1]) / m.PT_MM})`);
  const sm = fp.svg.match(/font-size="([\d.]+)" font-weight="500"[^>]*>연구시설 1층</);
  expect(sm && Math.abs(Number(sm[1]) / m.PT_MM - 18) < 0.05, '소제목이 추천 18pt 로 그려짐');
  expect(fp.width === 1587 && fp.height === 1123, `96dpi 픽셀 크기 ${fp.width}x${fp.height}`);
  const sc = fp.report.scale; const tr = m.typeTiers(base.svg);
  expect(tr && Math.abs(fp.report.engine.label - tr.label * sc / m.PT_MM) < 0.06, '다이어그램 속 글자의 실제 pt = 글자 단위 × 배율');
  const fo = m.fitPage(base, page, { title: '제목', sizes: { title: 40 } });
  expect(Math.abs(Number(fo.svg.match(/font-size="([\d.]+)" font-weight="800"/)[1]) / m.PT_MM - 40) < 0.05, '직접 정한 제목 pt 가 추천값보다 우선');
  for (const pg of [{ w: 210, h: 297, medium: 'print' }, { w: 338.67, h: 190.5, medium: 'screen' }, { w: 800, h: 300, medium: 'print' }]) {
    const f = m.fitPage(base, pg, { title: '제목' });
    const g = f.svg.match(/clipPath id="[^"]+"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    expect(g && Number(g[1]) >= 0 && Number(g[2]) >= 0 && Number(g[1]) + Number(g[3]) <= pg.w + 0.01 && Number(g[2]) + Number(g[4]) <= pg.h + 0.01, `${pg.w}x${pg.h} 용지 안에 그림이 들어감`);
  }
  const lay = m.renderSpec('layout', { title: '', shapes: [{ id: 'r1', name: '거실', kind: 'room', pts: [[0, 0], [40, 0], [40, 30], [0, 30]] }, { id: 'r2', name: '주방', kind: 'room', pts: [[40, 0], [80, 0], [80, 30], [40, 30]] }], panels: [{ heading: '동선', flows: [{ from: 'r1', to: 'r2' }] }] });
  const small = m.fitPage(lay, { w: 100, h: 70, medium: 'print' }, { title: '제목' });
  expect(small.report.warnings.some((w) => w.level === 'warn' && w.text.includes('너무 작습니다')), '작은 용지에서 글자가 너무 작으면 경고');
  const big = m.fitPage(lay, { w: 841, h: 594, medium: 'print' }, {});
  const tgt = m.fitPage(lay, { w: 841, h: 594, medium: 'print' }, { fill: false, sizes: { label: 20 } });
  expect(Math.abs(tgt.report.engine.label - 20) < 0.3 && tgt.report.scale <= big.report.scale, '본문 글자를 목표 pt 에 맞추면(내용을 꽉 채우지 않고) 20pt 가 됨');
  expect(m.fitPage(lay, { w: 420, h: 297, medium: 'print' }, { title: '아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 제목입니다 정말로 아주 아주 길어서 한 줄에 안 들어갑니다 정말로' }).report.warnings.some((w) => w.text.includes('줄였습니다')), '긴 제목은 줄여서 한 줄에 넣음');
  let threwP = false; try { m.fitPage(base, { w: 10, h: 10, medium: 'print' }, {}); } catch { threwP = true; }
  expect(threwP, '너무 작은 용지는 오류');
  expect(m.recommendFont('print').includes('인쇄용') && m.recommendFont('screen').includes('화면') && m.fontById('zzz').id === 'malgun', '글꼴 추천 문구와 기본 글꼴');
  // 그림 속 글자만 본문 목표 pt 에 맞춤('both'): 그림은 칸을 꽉 채운 배율 그대로, 글자 크기만 같은 비율로 바꾼다
  const stx = '<svg><text x="50" y="40" font-size="20" text-anchor="middle" fill="#000">A</text><text x="10" y="90" font-size="10" stroke-width="3" paint-order="stroke">B</text><text x="5" y="5" font-size="12" transform="rotate(90)">C</text><text x="5" y="9" font-size="12" dy="2">D</text></svg>';
  const sc2 = m.scaleTexts(stx, 0.5);
  expect(sc2.includes('font-size="10.000"') && sc2.includes('y="36.500"'), '글자 크기를 0.5배: 가운데(40-0.35×20=33)를 지키도록 기준선이 이동(40→36.5)');
  expect(sc2.includes('font-size="5.000"') && sc2.includes('stroke-width="1.500"') && sc2.includes('y="88.250"'), '글자 둘레 테두리도 같은 비율');
  expect(sc2.includes('font-size="12" transform="rotate(90)"') && sc2.includes('font-size="12" dy="2"'), '회전·dy 가 있는 글자는 건드리지 않음');
  expect(m.scaleTexts(stx, 1) === stx && m.scaleTexts(stx, 1.001) === stx, '배율 1 이면 그대로');
  { const c0 = 17 * 0.35 * 0.5; const t2 = m.scaleTexts('<text x="0" y="100" font-size="17">T</text>', 1.3); expect(Math.abs(Number(t2.match(/y="([\d.]+)"/)[1]) - (100 - 0.35 * 17 * (1 - 1.3))) < 0.001 && c0 > 0, '키울 때도 가운데 유지(기준선이 아래로)'); }
  { // 큰 칸에 작게 그려진 그림: 글자가 소제목보다 커지던 문제(23pt)가 목표 pt 로 맞춰짐
    const big = { w: 841, h: 594, medium: 'print' };
    const fillMode = m.composePage(big, [{ id: 'c1', render: lay, caption: '' }], { title: '제목', layoutId: '1x1', fit: 'fill' });
    const both = m.composePage(big, [{ id: 'c1', render: lay, caption: '' }], { title: '제목', layoutId: '1x1', fit: 'both' });
    const ps = (r) => Math.abs(r.cells[0].engine.label);
    expect(ps(fillMode) > both.report.pt.label * 1.3, `꽉 채우기만 하면 본문이 목표(${both.report.pt.label}pt)보다 큼 (${ps(fillMode)}pt)`);
    expect(Math.abs(ps(both) - both.report.pt.label) < 0.3 && both.cells[0].scale === fillMode.cells[0].scale, `'both': 그림 배율은 같고 본문이 목표 ${both.report.pt.label}pt 가 됨 (${ps(both)}pt)`);
    expect(!both.report.warnings.some((w) => w.text.includes('거꾸로') || w.text.includes('목표(')), "'both' 에서는 목표보다 크다/위계가 맞지 않는다는 경고가 없음");
    expect(both.cells[0].engine.heading <= both.report.pt.sub + 0.01 || both.cells[0].engine.heading < both.cells[0].engine.label * 1.6, '그림 속 소제목급 글자도 비율을 지킴');
    expect(Math.abs(both.cells[0].textScale - both.report.pt.label * m.PT_MM / (both.cells[0].scale * m.typeTiers(lay.svg).label)) < 0.02, '글자 배율 = 목표 / (그림 배율 × 원래 본문 크기)');
    const tiny = m.composePage({ w: 100, h: 70, medium: 'print' }, [{ id: 'c1', render: lay, caption: '' }], { layoutId: '1x1', fit: 'both' });
    expect(tiny.cells[0].textScale >= 0.3 && tiny.cells[0].textScale <= 1.3, '글자 배율은 0.3~1.3 안');
  }
  // 그림 위 글자를 눌러 고치기: 글자 매칭·손스케치 글자 자리 목록·적용
  expect(m.normText('  누구나 함께 즐기는 {플로우 허브}  ') === '누구나 함께 즐기는 플로우 허브' && m.normText('EXTRUSION') === m.normText('extrusion'), '글자 비교: {} 제거·공백 정리·대소문자 무시');
  const lst = [{ value: '거실', n: 1 }, { value: '주방', n: 2 }, { value: '거실', n: 3 }];
  expect(m.pickByText(lst, '거실', 0).n === 1 && m.pickByText(lst, '거실', 1).n === 3 && m.pickByText(lst, '거실', 9).n === 3 && m.pickByText(lst, '없음') === null && m.pickByText(lst, '  ') === null, '같은 글자가 여럿이면 화면에서 몇 번째인지로 고름, 없으면 null');
  expect(m.responsiveSvg('<svg xmlns="x" width="1200" height="760" viewBox="0 0 1200 760">').includes('width="100%"') && !m.responsiveSvg('<svg width="420mm" height="297mm" viewBox="0 0 420 297">').includes('420mm') && m.responsiveSvg('<svg width="420mm" height="297mm" viewBox="0 0 420 297">').includes('viewBox="0 0 420 297"'), 'SVG 를 화면 폭에 맞게(px·mm 둘 다, viewBox 유지)');
  const ns = m.normalizeSketch({ title: '제목', subtitle: '부제', frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [0, 0, 40, 40], name: '거실', desc: '설명 글' }], winds: [{ id: 'w1', pts: [[0, 0], [10, 10]], inLabel: '들어옴', outLabel: '' }], memos: [{ id: 'm1', x: 10, y: 10, text: '메모 글자' }], textBlock: { title: '큰 제목' + String.fromCharCode(10) + '두 줄', subs: ['부제 하나', '부제 둘'] }, notes: ['핵심 메시지'], showLegend: true, legend: { wind: '기류', core: '코어', opening: '창' } });
  const tg = m.sketchTextTargets(ns); const vals = tg.map((x) => x.value);
  expect(['제목', '부제', '거실', '설명 글', '들어옴', '메모 글자', '큰 제목' + String.fromCharCode(10) + '두 줄', '부제 하나', '부제 둘', '핵심 메시지', '기류', '코어', '창'].every((v) => vals.includes(v)) && tg.find((x) => x.value.startsWith('큰 제목')).multiline === true && !vals.includes(''), '손스케치의 고칠 수 있는 글자 자리가 모두 목록에 있음(제목·도형 이름·화살표 라벨·메모·문구 블록·핵심 메시지·범례)');
  expect(!m.sketchTextTargets({ ...ns, showLegend: false }).some((x) => x.value === '기류'), '범례가 안 보이면 범례 글자는 목록에 없음');
  const ap = (v, nv) => m.sketchApplyText(ns, tg.find((x) => x.value === v).apply, nv);
  expect(ap('제목', '새 제목').global.title === '새 제목' && ap('거실', '침실').update.id === 'b1' && ap('거실', '침실').update.patch.name === '침실' && ap('메모 글자', 'x').update.patch.text === 'x' && ap('들어옴', 'y').update.patch.inLabel === 'y', '적용 조각: 전체 값 / 요소 갱신(도형 이름·메모·화살표 라벨)');
  expect(ap('부제 둘', '바뀐 부제').global.textBlock.subs.join('|') === '부제 하나|바뀐 부제' && ap('큰 제목' + String.fromCharCode(10) + '두 줄', '한 줄').global.textBlock.title === '한 줄' && ap('핵심 메시지', '새 메시지').global.notes[0] === '새 메시지' && ap('기류', '바람').global.legend.wind === '바람' && ap('기류', '바람').global.legend.core === '코어', '적용 조각: 문구 블록·핵심 메시지·범례(다른 값은 유지)');
  // 위계가 거꾸로 되지 않게: 아주 작은 용지의 추천값, 직접 넣은 거꾸로 값은 경고
  for (const [w, h, md] of [[42, 29.7, 'print'], [50, 30, 'print'], [100, 70, 'print'], [60, 40, 'screen']]) { const t = m.recommendType({ w, h, medium: md }); expect(t.title > t.sub && t.sub > t.label && t.label > t.small, `작은 용지(${w}x${h}) 추천값도 제목>소제목>본문>작은 글자 (${t.title}/${t.sub}/${t.label}/${t.small})`); }
  const inv = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { title: '페이지 제목', subtitle: '페이지 소제목', sizes: { title: 6, sub: 40 } });
  expect(inv.report.warnings.some((w) => w.level === 'warn' && w.text.includes('거꾸로') && w.text.includes('제목(6pt)')), '직접 넣은 pt 가 거꾸로면(제목 6·소제목 40) 경고');
  expect(!m.composePage({ w: 420, h: 297, medium: 'print' }, [], { title: '제목', subtitle: '소제목' }).report.warnings.some((w) => w.text.includes('거꾸로')), '추천값에는 위계 경고가 없음');
  // 칸 나누기
  expect(m.layoutById('2x2').cells.length === 4 && m.layoutById('g3x2').cells.length === 6 && m.layoutById('엉뚱').id === '1x1' && m.cellIds('L3').join() === 'c1,c2,c3,c4', '칸 목록(프리셋·격자·알 수 없는 이름)');
  for (const L of m.PAGE_LAYOUTS) {
    const cs = m.resolveCells(L.id, { x: 10, y: 20, w: 400, h: 250 }, 6);
    let inside = true; let overlap = false;
    cs.forEach((c, i) => { if (c.x < 10 - 0.01 || c.y < 20 - 0.01 || c.x + c.w > 410 + 0.01 || c.y + c.h > 270 + 0.01 || c.w <= 0 || c.h <= 0) inside = false; cs.forEach((d, j) => { if (j > i && c.x < d.x + d.w - 0.01 && d.x < c.x + c.w - 0.01 && c.y < d.y + d.h - 0.01 && d.y < c.y + c.h - 0.01) overlap = true; }); });
    expect(inside && !overlap, `칸 나누기 '${L.id}': 영역 안에 있고 서로 겹치지 않음`);
  }
  { const c = m.resolveCells('2x1', { x: 0, y: 0, w: 100, h: 50 }, 10); expect(Math.abs(c[1].x - (c[0].x + c[0].w) - 10) < 0.01, '칸 사이 간격이 정해진 값(10mm)'); }
  expect(m.bestCols(2, 0.5, 480, 440) === 1 && m.bestCols(2, 2.0, 480, 440) === 2 && m.bestCols(4, 1.0, 480, 440) === 2 && m.bestCols(4, 2.4, 480, 440) === 3 && m.bestCols(1, 3, 480, 440) === 1, '칸 비율에 맞춘 패널 열 수(세로로 긴 칸은 한 줄에 1개, 가로로 긴 칸은 여러 개)');
  // 여러 칸 조립: 칸 제목은 소제목 pt, 칸마다 그림이 자기 칸 안에 들어가고, 빈 칸은 미리보기에서만 표시
  const items = [{ id: 'c1', render: lay, caption: '1층 동선' }, { id: 'c2', render: lay, caption: '2층 동선' }];
  const mp = m.composePage({ w: 420, h: 297, medium: 'print' }, items, { title: '연구시설 계획', layoutId: '2x2', gap: 8 });
  expect(mp.cells.length === 4 && mp.cells.filter((c) => !c.empty).length === 2 && mp.cells[2].empty, '4칸 중 2칸만 채우면 나머지는 빈 칸');
  expect(mp.svg.includes('1층 동선') && mp.svg.includes('2층 동선') && !mp.svg.includes('비어 있음'), '칸 제목이 그려지고 저장본에는 빈 칸 표시가 없음');
  const cap = mp.svg.match(/font-size="([\d.]+)" font-weight="600"[^>]*>1층 동선</);
  expect(cap && Math.abs(Number(cap[1]) / m.PT_MM - 18) < 0.05 && mp.cells[0].caption === 18, '칸 제목이 소제목 18pt');
  expect(mp.svg.includes('pgclip0') && mp.svg.includes('pgclip1') && mp.cells[0].engine && mp.cells[0].engine.label > 0, '칸마다 따로 맞춤(실제 pt 계산)');
  const pv = m.composePage({ w: 420, h: 297, medium: 'print' }, items, { title: '계획', layoutId: '2x2', preview: true, selected: 'c2' });
  expect(pv.svg.includes('칸 3 — 비어 있음') && pv.svg.includes('#F28C28'), '미리보기에는 빈 칸 표시와 고른 칸 강조');
  const one = m.composePage({ w: 420, h: 297, medium: 'print' }, items, { layoutId: '2x1', gap: 8 });
  expect(one.cells[0].engine.label > 0 && one.cells[1].engine.label > 0, '2칸 모두 실제 글자 크기가 계산됨');
  // 칸 끌기(직접 조정): 경계선 끌기(이웃 함께), Alt(한 칸만), 최소 크기, 붙기, 이동, 숫자 입력, 나누기·삭제
  const g22 = m.presetToCustom('2x2'); const R = (cs, id) => cs.find((c) => c.id === id).r;
  const e1 = m.dragEdge(g22, 'c1', 'e', 0.6, { snap: false });
  expect(Math.abs(R(e1, 'c1')[2] - 0.6) < 1e-9 && Math.abs(R(e1, 'c3')[2] - 0.6) < 1e-9 && Math.abs(R(e1, 'c2')[0] - 0.6) < 1e-9 && Math.abs(R(e1, 'c4')[0] - 0.6) < 1e-9, '경계선을 끌면 맞닿은 칸 네 개가 함께 바뀜(2×2)');
  const e2 = m.dragEdge(g22, 'c1', 'e', 0.6, { snap: false, group: false });
  expect(Math.abs(R(e2, 'c1')[2] - 0.6) < 1e-9 && R(e2, 'c3')[2] === 0.5 && R(e2, 'c2')[0] === 0.5, 'Alt(group=false)는 그 칸 하나만 바뀜');
  const e3 = m.dragEdge(g22, 'c1', 'e', 0.99, { snap: false, min: { x: 0.1, y: 0.1 } });
  expect(Math.abs(R(e3, 'c2')[0] - 0.9) < 1e-9, '이웃 칸의 최소 크기 아래로는 못 끌림(0.9 에서 멈춤)');
  const e4 = m.dragEdge(g22, 'c1', 'e', 0.515, { tol: 0.02 });
  expect(R(e4, 'c1')[2] === 0.5, '가운데(0.5) 근처에서는 가운데에 붙음');
  const L = m.presetToCustom('L2'); const e5 = m.dragEdge(L, 'c1', 'e', 0.7, { snap: false });
  expect(Math.abs(R(e5, 'c2')[0] - 0.7) < 1e-9 && Math.abs(R(e5, 'c3')[0] - 0.7) < 1e-9, 'L자 배치: 큰 칸 경계를 끌면 오른쪽 두 칸이 함께 바뀜');
  const e6 = m.dragEdge(g22, 'c1', 's', 0.3, { snap: false });
  expect(Math.abs(R(e6, 'c1')[3] - 0.3) < 1e-9 && Math.abs(R(e6, 'c2')[3] - 0.3) < 1e-9 && Math.abs(R(e6, 'c3')[1] - 0.3) < 1e-9, '세로 방향 경계선도 같은 방식');
  expect(m.overlappingCells(e1).length === 0 && m.overlappingCells(e5).length === 0, '경계선을 끌어도 칸이 서로 겹치지 않음');
  const mv = m.dragMove(g22, 'c1', 0.3, 0.3, { snap: false });
  expect(Math.abs(R(mv, 'c1')[0] - 0.3) < 1e-9 && R(mv, 'c1')[2] <= 1 + 1e-9 && R(mv, 'c1')[3] <= 1 + 1e-9, '칸 옮기기(바깥으로 못 나감)');
  expect(m.dragMove(g22, 'c1', 5, 5, { snap: false }).find((c) => c.id === 'c1').r[2] === 1, '너무 멀리 끌어도 페이지 안에 머묾');
  expect(m.overlappingCells(mv).length > 0, '옮겨서 겹치면 겹침으로 알려 줌');
  const bx = { x: 10, y: 20, w: 400, h: 250 };
  const cmm = m.setCellMm(g22, 'c1', { x: 30, w: 100 }, bx);
  expect(Math.abs(R(cmm, 'c1')[0] - 20 / 400) < 1e-9 && Math.abs(R(cmm, 'c1')[2] - 120 / 400) < 1e-9, 'mm 로 위치·가로를 입력하면 비율로 바뀜');
  expect(m.setCellMm(g22, 'c1', { w: 99999 }, bx).find((c) => c.id === 'c1').r[2] <= 1, 'mm 입력이 너무 커도 페이지 안');
  const sp1 = m.splitCell(g22, 'c1', 'v');
  expect(sp1.cells.length === 5 && sp1.newId === 'c5' && Math.abs(R(sp1.cells, 'c1')[2] - 0.25) < 1e-9 && Math.abs(R(sp1.cells, 'c5')[0] - 0.25) < 1e-9, '칸을 좌우로 반으로 나눔(새 칸 c5)');
  const sp2 = m.splitCell(g22, 'c2', 'h');
  expect(Math.abs(R(sp2.cells, 'c2')[3] - 0.25) < 1e-9 && Math.abs(R(sp2.cells, sp2.newId)[1] - 0.25) < 1e-9, '칸을 위아래로 반으로 나눔');
  expect(m.removeCell(g22, 'c2').length === 3 && m.removeCell(m.presetToCustom('1x1'), 'c1').length === 1, '칸 삭제(마지막 한 칸은 남김)');
  let many = m.presetToCustom('3x2'); while (many.length < m.MAX_CELLS) many = m.splitCell(many, many[0].id, 'v').cells;
  expect(many.length === m.MAX_CELLS && m.splitCell(many, 'c1', 'v').cells.length === m.MAX_CELLS, '칸은 최대 12개');
  expect(m.normalizeCustom([{ id: 'c1', r: [0.6, 0.2, 0.1, 0.9] }, { id: 'c1', r: [0, 0, 5, 1] }, { id: 'x', r: [0, 0, 0.001, 1] }, null]).length === 2 && m.normalizeCustom('엉뚱') === null && m.normalizeCustom([]) === null, 'custom 정리(뒤바뀐 좌표 바로잡기·범위·중복 id·너무 작은 칸·잘못된 값)');
  const cc = m.getCells('custom', [{ id: 'c1', r: [0, 0, 0.3, 1] }, { id: 'c7', r: [0.3, 0, 1, 1] }]);
  expect(cc.length === 2 && cc[1].id === 'c7' && m.getCells('custom', null).length === 1 && m.cellIds('custom', [{ id: 'c3', r: [0, 0, 1, 1] }])[0] === 'c3', "'custom' 배치의 칸 번호 유지, 없으면 한 칸");
  const rc = m.resolveCells('custom', { x: 0, y: 0, w: 100, h: 50 }, 10, [{ id: 'c1', r: [0, 0, 0.3, 1] }, { id: 'c2', r: [0.3, 0, 1, 1] }]);
  expect(Math.abs(rc[0].raw[2] - 30) < 1e-9 && Math.abs(rc[1].raw[0] - 30) < 1e-9 && Math.abs(rc[1].x - 35) < 1e-9 && Math.abs(rc[1].raw[2] - 70) < 1e-9, '직접 조정한 칸의 mm 크기(raw)와 간격 적용');
  const cp = m.composePage({ w: 420, h: 297, medium: 'print' }, [{ id: 'c1', render: lay, caption: '왼쪽' }, { id: 'c7', render: lay, caption: '오른쪽' }], { layoutId: 'custom', custom: [{ id: 'c1', r: [0, 0, 0.3, 1] }, { id: 'c7', r: [0.3, 0, 1, 1] }], gap: 6 });
  expect(cp.cells.length === 2 && cp.cells[0].rect[2] < cp.cells[1].rect[2] && cp.svg.includes('왼쪽') && cp.svg.includes('오른쪽') && cp.box.w > 0, '직접 조정한 배치로 페이지가 조립됨(좁은 칸·넓은 칸, 칸 번호 c7 유지)');
  // 바깥 여백·테두리선
  const mA = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1' });
  expect(Math.abs(mA.box.x - mA.report.margin.l) < 1e-9 && mA.report.margin.t === mA.report.marginAuto, '여백 자동값(인쇄 8mm 이상·짧은 변의 4%)');
  const m1 = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: 20 });
  expect(m1.box.x === 20 && m1.box.y === 20 && Math.abs(m1.box.w - 380) < 1e-9 && Math.abs(m1.box.h - 257) < 1e-9, '여백 한 값(20mm)이 네 변에 같게');
  const m2 = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: { t: 10, b: 30, l: 40, r: 5 } });
  expect(m2.box.x === 40 && m2.box.y === 10 && Math.abs(m2.box.w - 375) < 1e-9 && Math.abs(m2.box.h - 257) < 1e-9, '여백을 변마다 따로(위10·아래30·왼쪽40·오른쪽5)');
  const m3 = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: { t: 0, b: '', l: 9999, r: 0 } });
  expect(m3.report.margin.t === 0 && m3.report.margin.b === m3.report.marginAuto && m3.report.margin.l <= 420 * 0.3 + 1e-9, '여백 0 허용, 빈 칸은 자동, 너무 큰 값은 용지의 30%로 제한');
  const mt = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: { t: 10, b: 10, l: 25, r: 10 }, title: '제목' });
  expect(Math.abs(Number(mt.svg.match(/<text x="([\d.]+)"/)[1]) - 25) < 0.01, '제목이 왼쪽 여백(25mm)에서 시작함');
  const fr = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: 20, frame: { w: 0.5 } });
  expect(fr.svg.includes('stroke-width="0.500"') && fr.svg.includes('x="10.00" y="10.00" width="400.00" height="277.00"'), '테두리선: 기본 간격은 여백의 절반(10mm)');
  const fr2 = m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: 20, frame: { w: 0.35, inset: 5, color: '#C00000' } });
  expect(fr2.svg.includes('x="5.00" y="5.00"') && fr2.svg.includes('stroke="#C00000"') && !m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1' }).svg.includes('fill="none" stroke'), '테두리선 간격·색 지정, 끄면 안 그려짐');
  expect(m.composePage({ w: 420, h: 297, medium: 'print' }, [], { layoutId: '1x1', margin: { t: 90, b: 90, l: 0, r: 0 } }).report.warnings.some((w) => w.level === 'warn'), '여백이 너무 커서 그림 자리가 좁으면 경고');
}
let threw = false; try { m.normalizeSketchRead({ blocks: [] }, null); } catch { threw = true; }
if (!threw) fails.push('도형이 없는 스케치 읽기는 오류여야 함');
console.log(`다이어그램 렌더 점검 ${ok}개 통과`);
fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
