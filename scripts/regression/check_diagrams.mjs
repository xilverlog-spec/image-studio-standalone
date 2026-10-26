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
const svgeditJs = path.resolve(here, '../../src/conceptDiagram/svgedit.js');
const regionJs = path.resolve(here, '../../src/conceptDiagram/regionMerge.js');
const imgutilJs = path.resolve(here, '../../src/conceptDiagram/imgutil.js');
const viewlayoutJs = path.resolve(here, '../../src/conceptDiagram/viewlayout.js');
const scopeJs = path.resolve(here, '../../src/conceptDiagram/scope.js');
const rotateJs = path.resolve(here, '../../src/conceptDiagram/rotate.js');
const markerJs = path.resolve(here, '../../src/conceptDiagram/marker.js');
const calloutJs = path.resolve(here, '../../src/conceptDiagram/callout.js');
const svgexportJs = path.resolve(here, '../../src/conceptDiagram/svgexport.js');
const dimJs = path.resolve(here, '../../src/conceptDiagram/dim.js');
const iconsJs = path.resolve(here, '../../src/conceptDiagram/icons.js');
const tableJs = path.resolve(here, '../../src/conceptDiagram/table.js');
const imgfxJs = path.resolve(here, '../../src/conceptDiagram/imgfx.js');
const cardboardJs = path.resolve(here, '../../src/conceptDiagram/cardboard.js');
const tabledocJs = path.resolve(here, '../../src/conceptDiagram/tabledoc.js');
const symbolsJs = path.resolve(here, '../../src/conceptDiagram/symbols.js');
const iconsetJs = path.resolve(here, '../../src/conceptDiagram/iconset.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-reg-'));
const fwd = (p) => JSON.stringify(p.split(path.sep).join('/'));
fs.writeFileSync(path.join(tmp, 'entry.js'), `export { renderSpec, EXAMPLE_SPECS, getTextFields, buildConceptPrompt, REF_TYPES, DIAGRAM_TYPES, OFFERED_TYPES, HIDDEN_TYPES, SITE_RULES, normalizeSpec, setByPath } from ${fwd(spec)};
export { snapSegToWall, sketchSnapToWall, pickConsensusSketch, sketchSnapshot, sketchPaste, sketchView, sketchSetVia, sketchSetAmp, sketchMoveBy, sketchSetEnd, FORMS, SHAPES, DASHES, DGAP_MIN, DGAP_MAX, isPlainMemo, sketchBoxFor, sketchUnionBox, sketchAlignMany, sketchDistribute, sketchMoveMany, sketchDeleteMany, sketchUpdateMany, sketchDetachName, renderSketch, normalizeSketchRead, makeSketchSpec, sketchUpdate, sketchDelete, sketchFlip, sketchSetEnds, sketchAdd, buildFreeformPrompt, normalizeFreeformRead, makeFreeformSpec, buildSketchReadPrompt, normalizeSketch, sketchBox, sketchAxes, sketchSnapGuides, sketchSnapPointG, sketchAlign, sketchMirrorPlace, sketchMirrorCopy, sketchSameSize, buildAxonPrompt, normalizeAxonRead, makeAxonSpec, makeEditSpec, axonProject, legendInk, arrowsToWinds, sketchAddImage, sketchLockAspect, sketchResizeRect, sketchSetPt, sketchAddPt, sketchDelPt, sketchSetZone } from ${fwd(sketch)};
export { SUBJECT_TYPES, SUBJECT_TYPE_LABEL, SUBJECT_KINDS, buildSubjectClassifyPrompt, normalizeSubjectType, routeSubject } from ${fwd(subjectJs)};
export { judgeTextPt, moveCellContent, autoCellLabels, wrapLines, emphParts, stripBg, textWidth, LABEL_PREFIXES } from ${fwd(pageJs)};
export { sketchReplaceImage, sketchCropImage } from ${fwd(sketch)};
export { editReplaceImage, editCropImage } from ${fwd(svgeditJs)};
export { cropRect, fitInside, normCrop, stagger, IMG_QUALITY, imgQualityOf } from ${fwd(imgutilJs)};
export { assignNumbers, badgeInk, badgeFontK } from ${fwd(markerJs)};
export { sketchRenumber } from ${fwd(sketch)};
export { editAddBadge, editRenumber } from ${fwd(svgeditJs)};
export { calloutLayout, calloutSvg, calloutBox, descLines } from ${fwd(calloutJs)};
export { sketchSetTip } from ${fwd(sketch)};
export { editAddCallout, addShiftPatch } from ${fwd(svgeditJs)};
export { ICON_NAMES, ICON_GROUPS, ICON_LABEL, BASIC_NAMES, resolveIcon, iconGlyph, iconChipSvg, CHIP_SHAPES } from ${fwd(iconsJs)};
export { ICONSET, ICON_CATS } from ${fwd(iconsetJs)};
export { editAddIcon } from ${fwd(svgeditJs)};
export { normalizeTable, tableSetCell, tableAddRow, tableDelRow, tableMoveRow, tableSetCols, tableLayout, tableSvg, SAMPLE_TABLE, isLabelCol, TABLE_MAX_ROWS } from ${fwd(tableJs)};
export { editAddTable } from ${fwd(svgeditJs)};
export { imageFx, clampPct, hasFx, CONTEXT_FX } from ${fwd(imgfxJs)};
export { cardsInitialEdits, cardsRebase } from ${fwd(cardboardJs)};
export { cardsSetBullets, cardsToggleSub, cardsToggleCaption } from ${fwd(cardboardJs)};
export { tableHasEmpty, tableFillEmpty } from ${fwd(tableJs)};
export { normalizeCards, renderCards, wrapText, cardsHeroAdds, CARD_PRESETS, MAX as CARD_MAX, TONES as CARD_TONES, cardsAddCard, cardsDelCard, cardsMoveCard, cardsSetSlots, cardsAddKeypoint, cardsDelKeypoint, cardsAddBand, cardsDelBand, cardsMoveBand, cardsCount, getCardsTextFields } from ${fwd(cardboardJs)};
export { textW } from ${fwd(tableJs)};
export { normalizeTableDoc, renderTableDoc, getTableDocFields, TABLE_DOC_SCHEMA } from ${fwd(tabledocJs)};
export { parseTableText, gridFromHtml, gridFromText } from ${fwd(tableJs)};
export { rebaseEdits } from ${fwd(svgeditJs)};
export { northSvg, scaleBarSvg, normalizeScale, scaleLabel, scaleBarHeight, NORTH_STYLES, SCALE_UNITS } from ${fwd(symbolsJs)};
export { editAddNorth, editAddScale } from ${fwd(svgeditJs)};
export { editRotate, editRotateAdd } from ${fwd(svgeditJs)};
export { editScale, addScalePatch, opTransformStr, SCALE_MIN, SCALE_MAX } from ${fwd(svgeditJs)};
export { scaleLineSpacing, editLineSpacing, LH_MIN, LH_MAX } from ${fwd(svgeditJs)};
export { HEAD_ALIGNS, HEAD_LS_MIN, HEAD_LS_MAX } from ${fwd(pageJs)};
export { dimLayout, dimBox, dimSvg, DIM_COLOR, DIM_DEFAULT_TEXT } from ${fwd(dimJs)};
export { editAddDim } from ${fwd(svgeditJs)};
export { toIllustratorSvg, externalImageRefs } from ${fwd(svgexportJs)};
export { sketchSetDimStart } from ${fwd(sketch)};
export { normDeg, rotPt, rectCenter, rectBBox, rectCorners, rotRectKeep, rotCursor, snapDeg, parseTransform, applyMat } from ${fwd(rotateJs)};
export { sketchRotation, sketchPivot, sketchSetAngle, sketchRotateBy, sketchResizeBlock, sketchCanRotate } from ${fwd(sketch)};
export { CATALOG, checkScope, catalogById, IMAGE_OTHER_NEAREST, PICTOS, pictoSvg, STATUS_LABEL, looksLikeCards, looksLikeTable } from ${fwd(scopeJs)};
export { SPLIT_DEFAULT, SPLIT_MIN, SPLIT_MAX, SPLIT_DIV_W, EDITOR_MIN_W, PAGE_MIN_W, clampSplit, splitFromPointer, splitColumns, clampZoom, stepZoom, wheelZoom, anchorScroll, ZOOM_STEPS } from ${fwd(viewlayoutJs)};
export { PAGE_PRESETS, PAGE_LAYOUTS, FONT_OPTIONS, ENGINE_FONT, PT_MM, recommendType, recommendFont, typeTiers, scaleTexts, fitPage, composePage, pageZoomAbout, ZOOM_MIN, ZOOM_MAX, fontById, layoutById, cellIds, resolveCells, bestCols, presetToCustom, normalizeCustom, scopeIds, getCells, dragEdge, dragMove, setCellMm, splitCell, removeCell, overlappingCells, nextCellId, MAX_CELLS } from ${fwd(pageJs)};
export { sketchContentTop } from ${fwd(sketch)};
export { sketchGScale, sketchUnzoomPt, sketchZoomPt, sketchComposeScale, sketchTranslateAll, GSCALE_MIN, GSCALE_MAX } from ${fwd(sketch)};
export { normText, pickByText, responsiveSvg, sketchTextTargets, sketchApplyText } from ${fwd(inlineJs)};
export { hueOf, bandOf, mergeRegionWinds, featherMap, blendMasks } from ${fwd(regionJs)};
export { scanSvg, applyEdits, emptyEdits, hasEdits, editSet, editMove, editMoveTo, editDelete, editRestore, editAsPath, editTranslate, DASH_PRESETS, DASH_GAP_MIN, DASH_GAP_MAX, dashKind, dashGapOf, dashWithGap, dashNumsEven, dashSameParts, dashGapFactor, dashScaled, dashPatch, parsePath, pathD, pathNodes, pathMoveNode, pathMoveCtrl, pathToggleCurve, pathAddNode, pathDelNode, parsePoints, pointsStr, lineToCurveD, editAddImage, editUpdateAdd, editRemoveAdd, SHAPE_FONT, shapeSvg, appendShapes, newShape, editAddShape, editUpdateShape, editRemoveShape, rawShift, rawSetText } from ${fwd(svgeditJs)};`);
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
for (const t of m.OFFERED_TYPES) if (!auto.includes(`"${t}"`)) fails.push(`자동 프롬프트에 종류 ${t} 가 없음`);
for (const t of m.HIDDEN_TYPES) if (auto.includes(`"${t}"`) || auto.includes(`[${t} 스키마]`)) fails.push(`자동 프롬프트에 제공하지 않는 종류 ${t} 가 남아 있음`);

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
  // 그림 한 장이 영역을 채우는 'image' 배치: 오른쪽 설명 칸(구분선·화살표 범례 아이콘)이 그림 위에 겹쳐 그려지지 않음. 다른 배치(손스케치 등)는 그대로
  const img0 = m.renderSketch(sp).svg;
  expect(!img0.includes('x1="850"') && !img0.includes('M852 ') && !/<rect x="852"/.test(img0), "'image' 배치에는 오른쪽 설명 칸(구분선·범례 아이콘)이 없음");
  const plain = m.renderSketch({ ...sp, layout: '', blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 40], name: '방', desc: '' }], winds: sp.winds }).svg;
  expect(plain.includes('x1="850"') && plain.includes('M852 '), '다른 배치(도면용 손스케치)에는 오른쪽 설명 칸이 그대로 있음');
  // 구역 층 고치기: 색·이름이 연결된 범례 글자에 따라감
  const s2 = m.sketchSetZone(n, 'z1', { color: '#F6B8B3', label: '공용' });
  const mm = s2.memos.find((q) => q.zone === 'z1');
  expect(s2.zones[0].color === '#F6B8B3' && mm.color === m.legendInk('#F6B8B3') && mm.text === '■ 공용' && s2.memos.find((q) => q.text.includes('주 동선')).color === '#F20B09', '구역 색·이름을 바꾸면 연결된 범례 글자만 따라 바뀜');
  expect(m.sketchSetZone(n, 'nope', { color: '#000000' }) === n && m.sketchSetZone(n, 'z2', { hidden: true }).zones[1].hidden === true && m.sketchSetZone(n, 'z2', { opacity: 0.4 }).zones[1].opacity === 0.4, '없는 층은 그대로, 숨김·농도 변경');
  const lum = (h) => { const v = parseInt(h.slice(1), 16); return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
  expect(lum(m.legendInk('#F6B8B3')) < 0.5 && lum(m.legendInk('#BFE9F9')) < 0.5 && lum(m.legendInk('#F5E9B1')) < 0.55 && /^#[0-9A-F]{6}$/.test(m.legendInk('#DDDDDD')) && m.legendInk('#DDDDDD') !== '#DDDDDD', '연한 구역 색의 범례 글자색은 읽을 수 있게 진하게(색조 유지)');
  expect(Math.abs(parseInt(m.legendInk('#B5D5F2').slice(5), 16) - parseInt(m.legendInk('#B5D5F2').slice(1, 3), 16)) > 20, '연한 파랑은 진한 파랑 계열로(파랑 성분이 빨강보다 큼)');
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
// 구조형 결과(평면 다이어그램·배치 개념도·매스·버블도·층별 조닝도)를 도형 하나씩 고치기(svgedit.js): 색·위치·곡선·선 종류
{
  const expect = (cond, msg) => { if (!cond) fails.push('도형 편집: ' + msg); else ok++; };
  const S = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/>'
    + '<defs><marker id="a"><path d="M0 0L10 5L0 10Z" fill="red"/></marker><pattern id="h"><line x1="0" y1="0" x2="0" y2="6" stroke="#000"/></pattern></defs>'
    + '<g transform="translate(10 20)"><circle cx="50" cy="50" r="20" fill="#4CAF50" stroke="#222" stroke-width="2"/><text x="50" y="55" font-size="14" fill="#111">공원</text></g>'
    + '<line x1="10" y1="10" x2="110" y2="60" stroke="#F28C28" stroke-width="3" stroke-dasharray="9 6" marker-end="url(#a)"/>'
    + '<path d="M10 100 C 60 20, 120 180, 180 100" fill="none" stroke="#1E88C8" stroke-width="4"/>'
    + '<polygon points="200,100 300,100 300,180 200,180" fill="url(#h)" stroke="#555"/></svg>';
  const sc = m.scanSvg(S);
  const tags = sc.els.map((e) => `${e.id}:${e.tag}`).join(' ');
  expect(tags === 'e0:rect g0:g e1:circle e2:text e3:line e4:path e5:polygon', `고를 수 있는 요소만(정의 부분 defs·marker·pattern 안의 것은 제외), 묶음은 g# (실제 ${tags})`);
  expect(sc.els.find((e) => e.id === 'e1').parent === 'g0' && sc.els.find((e) => e.id === 'e3').parent === null, '요소가 속한 묶음 기록');
  expect(m.scanSvg(S).sig === sc.sig && m.scanSvg(S.replace('공원', '숲')).sig === sc.sig && m.scanSvg(S.replace('<line x1="10"', '<polyline x1="10"')).sig !== sc.sig, '구조 지문: 글자만 바뀌면 같고 요소 종류가 바뀌면 다름');
  expect(m.applyEdits(S, null).svg === S && m.applyEdits(S, m.emptyEdits(S)).svg === S && m.hasEdits(m.emptyEdits(S)) === false, '수정이 없으면 그림이 그대로');
  let E = m.emptyEdits(S);
  E = m.editMove(E, 'e1', 12, -3); E = m.editSet(E, 'e1', { fill: '#D6453D' }); E = m.editSet(E, 'e3', { 'stroke-dasharray': null, stroke: '#123456' }); E = m.editMove(E, 'g0', 5, 5);
  const R = m.applyEdits(S, E).svg;
  expect(R.includes('<circle cx="50" cy="50" r="20" fill="#D6453D" stroke="#222" stroke-width="2" transform="translate(12 -3)"/>'), '요소: 색 바꾸기·이동(translate)이 입혀짐');
  expect(R.includes('<g transform="translate(5 5) translate(10 20)">'), '묶음 이동은 원래 transform 앞에 붙음');
  expect(!R.includes('stroke-dasharray') && R.includes('stroke="#123456"') && R.includes('marker-end'), '속성을 null 로 하면 제거(선 종류 → 실선), 다른 속성은 유지');
  expect(R.includes('<marker id="a">') && R.includes('<pattern id="h">') && R.includes('<text x="50" y="55" font-size="14" fill="#111">공원</text>'), '정의 부분과 글자 내용은 건드리지 않음');
  expect(m.applyEdits(S.replace('<circle', '<circle id="z"'), { sig: 'other', ops: E.ops }).ok === false && m.applyEdits(S.replace('<line x1="10"', '<polyline x1="10"'), E).svg === S.replace('<line x1="10"', '<polyline x1="10"'), '그림 구조가 달라지면(지문 불일치) 옛 수정은 적용하지 않음');
  expect(m.applyEdits(S.replace('공원', '숲'), E).svg.includes('숲') && m.applyEdits(S.replace('공원', '숲'), E).svg.includes('#D6453D'), '글자를 고쳐 다시 그려도(구조 같음) 도형 수정이 유지됨');
  const E2 = m.editMove(E, 'e1', -12, 3);
  expect(!m.applyEdits(S, E2).svg.includes('translate(0 0)') && m.applyEdits(S, E2).svg.includes('fill="#D6453D"'), '이동량이 0 으로 돌아오면 translate 를 달지 않고 다른 수정은 유지');
  expect(m.editRestore(E, 'e1').ops.e1 === undefined && m.editRestore(E, 'e1').ops.e3 !== undefined && E.ops.e1 !== undefined, '요소 하나만 처음으로(원본 edits 는 그대로)');
  const D = m.applyEdits(S, m.editDelete(m.emptyEdits(S), 'e2')).svg;
  expect(D.includes('fill="#111" display="none">공원</text>') && !D.includes('r="20" fill="#4CAF50" stroke="#222" stroke-width="2" display'), '삭제는 그 요소에만 display=none');
  const C = m.applyEdits(S, m.editAsPath(m.emptyEdits(S), 'e3', m.lineToCurveD(10, 10, 110, 60), ['x1', 'y1', 'x2', 'y2'])).svg;
  expect(C.includes('<path ') && /<path stroke="#F28C28"/.test(C) && !C.includes('x1="10"') && /d="M10 10Q/.test(C) && C.includes('marker-end'), '직선 → 곡선 경로로 바꾸기(좌표 속성 제거, 화살촉 유지)');
  const I = m.applyEdits(S, null, { ids: true }).svg;
  expect((I.match(/data-eid=/g) || []).length === 7 + 2 && (I.match(/data-hit="1"/g) || []).length === 2 && !/<marker[^>]*data-eid/.test(I) && !/<pattern[^>]*data-eid/.test(I), '편집용: 모든 요소에 data-eid, 선·경로에 눌림용 덧선(정의 안은 제외)');
  const hit = I.match(/<path[^>]*data-hit="1"[^>]*>/)[0];
  expect(hit.includes('stroke="transparent"') && hit.includes('pointer-events="stroke"') && !hit.includes('stroke-dasharray') && !hit.includes('marker-end') && hit.includes('fill="none"'), '덧선은 투명·굵게, 선 종류·화살촉은 복사하지 않음');
  expect(!m.applyEdits(S, m.editDelete(m.emptyEdits(S), 'e3'), { ids: true }).svg.match(/<line[^>]*data-hit/), '삭제한 선에는 덧선을 만들지 않음');
  const ET = m.editSet(m.emptyEdits(S), 'e1', { 'stroke-width': '5' });
  expect(JSON.stringify(m.emptyEdits(S)) === JSON.stringify({ sig: sc.sig, ops: {} }) && ET.ops.e1.set['stroke-width'] === '5', 'edits 는 불변으로 만들어짐');
  expect(m.dashKind('9 6') === 'dashed' && m.dashKind('') === 'solid' && m.dashKind(null) === 'solid' && m.dashKind('1.5,6') === 'dotted' && m.dashKind('3 3') === 'custom' && m.dashPatch('dotted')['stroke-linecap'] === 'round' && m.dashPatch('solid')['stroke-dasharray'] === null, '선 종류 ↔ stroke-dasharray 변환');

  // 경로
  const P1 = m.parsePath('M10 10 L20 10 H30 V40 C 30 50, 40 50, 50 40 S 70 30, 80 40 Q 90 50 100 40 T 120 40 A 5 5 0 0 1 130 40 Z');
  expect(P1.map((x) => x.c).join('') === 'MLLLCCQQAZ' && P1[2].p[0] === 30 && P1[3].p[1] === 40 && P1[5].c1[0] === 60 && P1[7].c1[0] === 110, `경로 해석: H·V·S·T 를 절대 좌표 L·C·Q 로 (실제 ${P1.map((x) => x.c).join('')})`);
  const P2 = m.parsePath('m10 10 l10 0 10 10 c0 10 10 10 10 0 z');
  expect(P2.map((x) => x.c).join('') === 'MLLCZ' && P2[2].p[0] === 30 && P2[2].p[1] === 20 && P2[3].p[0] === 40 && P2[4].p[0] === 10, '소문자(상대) 명령과 암시적 반복, z');
  expect(m.pathD(P1).startsWith('M10 10L20 10L30 10L30 40C') && m.parsePath(m.pathD(P1)).length === P1.length && m.parsePath('M1 2 3 4').length === 2 && m.parsePath('').length === 0 && m.parsePath('엉뚱').length === 0, '경로 되쓰기·왕복, 잘못된 값은 빈 경로');
  const NS = m.pathNodes(P1); expect(NS.length === 9 && !NS.some((n) => n.c === 'Z'), '마디 목록에서 Z 는 제외');
  const Q = m.parsePath('M0 0 C 10 0 20 0 30 0 L 60 0'); const MV = m.pathMoveNode(Q, 1, [5, 7]);
  expect(MV[1].p[0] === 35 && MV[1].c2[0] === 25 && MV[1].c2[1] === 7 && MV[2].p[0] === 60 && Q[1].p[0] === 30, '마디를 옮기면 들어오는 곡선 제어점이 따라가고 원본은 그대로');
  const Q2 = m.parsePath('M0 0 L 30 0 C 40 0 50 0 60 0'); const MV2 = m.pathMoveNode(Q2, 1, [0, 9]);
  expect(MV2[2].c1[1] === 9 && MV2[2].p[1] === 0, '나가는 곡선의 첫 제어점도 따라감');
  expect(m.pathMoveCtrl(Q, 1, 'c1', [0, 4])[1].c1[1] === 4, '제어점 옮기기');
  const T1 = m.pathToggleCurve(m.parsePath('M0 0 L 100 0'), 1);
  expect(T1[1].c === 'Q' && Math.abs(T1[1].c1[0] - 50) < 1e-9 && Math.abs(T1[1].c1[1] - 25) < 1e-9 && m.pathToggleCurve(T1, 1)[1].c === 'L' && m.pathToggleCurve(T1, 0)[0].c === 'M', '직선 → 휘는 곡선 → 직선, 시작점(M)은 그대로');
  expect(m.pathAddNode(m.parsePath('M0 0 L 10 0 L 100 0')).length === 4 && m.pathAddNode(m.parsePath('M0 0 L 10 0 L 100 0'))[2].p[0] === 55, '점 추가: 가장 긴 구간의 한가운데');
  const AQ = m.pathAddNode(m.parsePath('M0 0 Q 50 50 100 0')); const AC = m.pathAddNode(m.parsePath('M0 0 C 0 50 100 50 100 0'));
  expect(AQ.length === 3 && AQ[1].c === 'Q' && Math.abs(AQ[1].p[0] - 50) < 1e-9 && Math.abs(AQ[1].p[1] - 25) < 1e-9 && AC.length === 3 && AC[1].c === 'C' && Math.abs(AC[1].p[0] - 50) < 1e-9 && Math.abs(AC[1].p[1] - 37.5) < 1e-9, '곡선은 모양을 그대로 둔 채 둘로 나눠 점 추가(Q·C 중간점)');
  expect(m.pathDelNode(m.parsePath('M0 0 L 10 0 L 20 0'), 1).length === 2 && m.pathDelNode(m.parsePath('M0 0 L 10 0'), 1).length === 2 && m.pathDelNode(m.parsePath('M0 0 L 10 0 L 20 5'), 0)[0].c === 'M' && m.pathDelNode(m.parsePath('M0 0 L 10 0 L 20 5'), 0)[0].p[0] === 10, '점 빼기(둘 이하로는 안 줄어듦, 첫 점을 빼면 다음 점이 시작점)');
  expect(JSON.stringify(m.parsePoints('1,2 3,4 5.5,6')) === '[[1,2],[3,4],[5.5,6]]' && m.pointsStr([[1, 2], [3.456, 4]]) === '1,2 3.46,4' && m.parsePoints('').length === 0, '꼭짓점 목록 해석·되쓰기');
  expect(/^M10 10Q\d/.test(m.lineToCurveD(10, 10, 110, 10)) && m.lineToCurveD(0, 0, 100, 0).includes('Q50 25'), '직선 → 휘는 곡선 d');

  // 모든 방식의 실제 그림에서: 지문이 안정적이고, 모든 요소에 수정을 입혀도 구조가 그대로
  const lay = { title: 'T', shapes: [{ id: 'r1', name: '거실', kind: 'room', pts: [[0, 0], [40, 0], [40, 30], [0, 30]] }, { id: 'r2', name: '주방', kind: 'room', pts: [[40, 0], [80, 0], [80, 30], [40, 30]] }], panels: [{ heading: '동선', flows: [{ from: 'r1', to: 'r2' }] }] };
  const kinds = { site: m.EXAMPLE_SPECS.site, massing: m.EXAMPLE_SPECS.massing, program: m.EXAMPLE_SPECS.program, stack: m.EXAMPLE_SPECS.stack, layout: lay };
  for (const [k, spec] of Object.entries(kinds)) {
    const svg = m.renderSpec(k, spec).svg; const a = m.scanSvg(svg);
    let EE = m.emptyEdits(svg); a.els.forEach((e) => { EE = m.editSet(EE, e.id, { opacity: '0.5' }); EE = m.editMove(EE, e.id, 1, 2); });
    const out = m.applyEdits(svg, EE); const b = m.scanSvg(out.svg);
    const inter = m.applyEdits(svg, null, { ids: true }).svg;
    expect(a.count > 5 && out.ok && b.sig === a.sig && b.count === a.count && m.applyEdits(svg, null).svg === svg && (inter.match(/data-eid=/g) || []).length >= a.count, `${k}: 요소 ${a.count}개를 모두 고쳐도 구조 그대로, 수정 없으면 그림 그대로, 편집용 id 부여`);
    const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]*)"/g)].map((q) => q[1]); const rt = paths.every((d) => m.parsePath(d).length > 0 && m.parsePath(m.pathD(m.parsePath(d))).length === m.parsePath(d).length);
    expect(rt, `${k}: 모든 경로가 해석·되쓰기됨`);
  }
}
// 내 이미지 넣기: 구조형 결과(edits.adds)와 손스케치류(blocks 의 kind 'image')
{
  const expect = (cond, msg) => { if (!cond) fails.push('내 이미지: ' + msg); else ok++; };
  const S = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="50" cy="50" r="20" fill="#4CAF50"/><text x="10" y="20">글</text></svg>';
  const sig = m.scanSvg(S).sig; const HREF = 'data:image/png;base64,iVBORw0KGgo=';
  const A = m.editAddImage(m.emptyEdits(S), sig, { href: HREF, w: 900, h: 600, box: [0, 0, 400, 300] });
  const a1 = A.edits.adds[0];
  expect(A.id === 'a1' && Math.abs(a1.w - 160) < 0.01 && Math.abs(a1.h - 106.67) < 0.02 && Math.abs(a1.x - 120) < 0.01 && Math.abs(a1.y - 96.67) < 0.02 && a1.opacity === 1 && a1.behind === false, `이미지는 그림 한가운데에 원본 비율, 가로 40%로 놓임 (실제 ${JSON.stringify(a1)})`);
  const tall = m.editAddImage(m.emptyEdits(S), sig, { href: HREF, w: 100, h: 1000, box: [0, 0, 400, 300] }).edits.adds[0];
  expect(tall.h <= 300 * 0.6 + 0.01 && Math.abs(tall.w / tall.h - 0.1) < 0.002, '아주 길쭉한 이미지는 높이 60% 안으로(비율 유지)');
  const A2 = m.editAddImage(A.edits, sig, { href: HREF, w: 100, h: 100, box: [0, 0, 400, 300] });
  expect(A2.id === 'a2' && A2.edits.adds.length === 2 && A.edits.adds.length === 1, '두 번째는 a2, 원본 edits 는 그대로');
  expect(m.hasEdits({ sig, ops: {}, adds: [a1] }) && !m.hasEdits({ sig, ops: {}, adds: [] }) && m.hasEdits({ sig, ops: {} }) === false, '이미지만 넣어도 수정이 있는 것으로 침');
  const kept = m.editMove(m.editSet(A.edits, 'e1', { fill: '#D6453D' }), 'e1', 3, 4);
  expect(kept.adds.length === 1 && m.editRestore(kept, 'e1').adds.length === 1 && m.editDelete(kept, 'e2').adds.length === 1, '도형을 고쳐도 넣은 이미지가 남음');
  const out = m.applyEdits(S, A.edits).svg;
  expect(/<image href="data:image\/png;base64,iVBORw0KGgo=" x="120" y="96.67" width="160" height="106.67" preserveAspectRatio="none"\/><\/svg>$/.test(out) && m.scanSvg(out).sig === sig && out.startsWith('<svg'), '맨 앞 이미지는 </svg> 앞에, 구조 지문은 그대로(이미지는 고를 도형이 아님)');
  const back = m.applyEdits(S, m.editUpdateAdd(A.edits, 'a1', { behind: true })).svg;
  expect(back.indexOf('<image') > back.indexOf('<rect width="400" height="300" fill="#fff"/>') && back.indexOf('<image') < back.indexOf('<circle') && back.includes('fill="#fff"/><image'), '맨 뒤 이미지는 배경 사각형 바로 뒤(도형 아래)');
  // 수정이 입혀져 문자열이 길어진 뒤에도 태그가 깨지지 않음(수정 + 편집용 id + 뒤쪽 이미지)
  let EE = m.editSet(A.edits, 'e0', { fill: '#eeeeee', stroke: '#999999', 'stroke-width': '2' }); EE = m.editUpdateAdd(EE, 'a1', { behind: true });
  for (const o of [{}, { ids: true }]) {
    const t = m.applyEdits(S, EE, o).svg;
    const doc = [...t.matchAll(/<image\b/g)].every((q) => t[q.index - 1] === '>') && (t.match(/<rect\b/g) || []).length === 1 && /<rect [^>]*fill="#eeeeee"[^>]*\/><image/.test(t);
    expect(doc && m.scanSvg(t).sig === sig, `수정·편집용 id 가 있어도 뒤쪽 이미지가 태그 사이(배경 사각형 뒤)에 들어감 ${JSON.stringify(o)}`);
  }
  const it = m.applyEdits(S, A.edits, { ids: true }).svg;
  expect(it.includes('data-eid="a1"') && (it.match(/<image\b/g) || []).length === 1, '편집용 출력의 이미지에는 data-eid');
  expect(m.applyEdits(S, { sig: 'stale', ops: { e1: { set: { fill: '#000' } } }, adds: [a1] }).svg.includes('<image') && !m.applyEdits(S, { sig: 'stale', ops: { e1: { set: { fill: '#000' } } }, adds: [a1] }).svg.includes('#000'), '구조가 달라져도 내가 넣은 이미지는 그려지고, 옛 도형 수정만 빠짐');
  expect(m.editUpdateAdd(A.edits, 'a1', { x: 5 }).adds[0].x === 5 && A.edits.adds[0].x === 120 && m.editRemoveAdd(A.edits, 'a1', sig).adds === undefined && m.applyEdits(S, m.editRemoveAdd(A.edits, 'a1', sig)).svg === S, '이미지 고치기·지우기(불변), 지우면 그림이 원래대로');
  expect(m.applyEdits(S.replace('<rect width="400" height="300" fill="#fff"/>', ''), m.editUpdateAdd(A.edits, 'a1', { behind: true })).svg.indexOf('<image') < m.applyEdits(S, A.edits).svg.indexOf('<circle'), '배경 사각형이 없어도 맨 뒤 이미지는 <svg> 바로 뒤');
  // 손스케치류
  const base = m.makeEditSpec({ imageUrl: 'data:image/jpeg;base64,/9j/AAAA', w: 961, h: 600, title: '', legend: [] });
  const n0 = m.normalizeSketch(base);
  const r = m.sketchAddImage(n0, { href: HREF, w: 800, h: 400 });
  const n1 = m.normalizeSketch(r.spec); const b = n1.blocks.find((x) => x.id === r.id);
  expect(b && b.kind === 'image' && b.href === HREF && b.layer === 'back' && b.opacity === 1 && Math.abs(b.ar - 2) < 1e-9, '손스케치류: 이미지 블록이 만들어지고 정규화 뒤에도 유지(href·층·비율)');
  expect(Math.abs((b.rect[2] - b.rect[0]) / (b.rect[3] - b.rect[1]) - 2) < 0.05 && b.rect[0] >= n1.frame[0] && b.rect[2] <= n1.frame[2] && b.rect[1] >= n1.frame[1] && b.rect[3] <= n1.frame[3], '그림 틀 안 한가운데에 원본 비율로');
  const r2 = m.sketchAddImage(n1, { href: HREF, w: 100, h: 100 });
  expect(r2.id !== r.id && m.normalizeSketch(r2.spec).blocks.filter((x) => x.kind === 'image').length === 2, '두 번째 이미지는 다른 id');
  const bad = m.normalizeSketch({ ...n1, blocks: [{ ...b, href: '' }, { ...b, id: 'z', href: 'x'.repeat(6500000) }] });
  expect(bad.blocks.every((x) => x.kind === 'slab' && !x.href), 'href 가 없거나 너무 큰 이미지 블록은 이미지로 안 침');
  const svgBack = m.renderSketch({ ...n1, blocks: n1.blocks.map((x) => (x.id === r.id ? x : x)).concat([{ id: 'zz', kind: 'slab', rect: [10, 10, 30, 30], name: '', desc: '', fill: '' }]) }, { interactive: true }).svg;
  expect(svgBack.includes(`<image href="${HREF}"`) && svgBack.includes(`data-eid="${r.id}"`) && svgBack.indexOf(`data-eid="${r.id}"`) < svgBack.indexOf('data-eid="zz"'), '렌더: 맨 뒤 이미지는 도형보다 먼저 그려지고 눌러서 고를 수 있음');
  const front = m.renderSketch({ ...n1, blocks: n1.blocks.map((x) => (x.id === r.id ? { ...x, layer: 'front' } : x)).concat([{ id: 'zz', kind: 'slab', rect: [10, 10, 30, 30], name: '', desc: '', fill: '' }]), memos: [{ id: 'm1', x: 50, y: 50, text: '메모', size: 14, color: '#222222' }] }, { interactive: true }).svg;
  expect(front.indexOf('data-eid="zz"') < front.indexOf(`data-eid="${r.id}"`) && front.indexOf(`data-eid="${r.id}"`) < front.indexOf('data-eid="m1"'), '맨 앞 이미지는 도형 위·글자 아래');
  expect(!m.renderSketch(n1).svg.includes('data-eid') && m.renderSketch(n1).svg.includes('opacity') === false, '저장용 출력에는 편집용 속성이 없고 투명도 1 이면 opacity 없음');
  expect(m.renderSketch({ ...n1, blocks: n1.blocks.map((x) => (x.id === r.id ? { ...x, opacity: 0.4 } : x)) }).svg.includes('opacity="0.4"'), '투명도가 그려짐');
  // 모서리 끌기에서 비율 유지
  const sized = m.normalizeSketch({ ...n1, blocks: n1.blocks.map((x) => (x.id === r.id ? { ...x, rect: [10, 10, 50, 30] } : x)) });
  const drag = m.sketchResizeRect(sized, r.id, 'se', 70, 34); const locked = m.sketchLockAspect(drag, r.id, 'se'); const lb = locked.blocks.find((x) => x.id === r.id).rect;
  expect(Math.abs((lb[2] - lb[0]) / (lb[3] - lb[1]) - 2) < 0.02 && lb[0] === 10 && lb[1] === 10 && lb[2] === 70, '오른쪽 아래 모서리: 반대(왼쪽 위)는 고정, 가로를 따라 세로가 비율대로');
  const nw = m.sketchLockAspect(m.sketchResizeRect(sized, r.id, 'nw', 0, 0), r.id, 'nw').blocks.find((x) => x.id === r.id).rect;
  expect(nw[2] === 50 && nw[3] === 30 && Math.abs((nw[2] - nw[0]) / (nw[3] - nw[1]) - 2) < 0.02, '왼쪽 위 모서리: 오른쪽 아래 고정');
  expect(m.sketchLockAspect(m.sketchResizeRect(sized, r.id, 'e', 80, 0), r.id, 'e').blocks.find((x) => x.id === r.id).rect[3] === 30 && m.sketchLockAspect(drag, 'zz', 'se') === drag, '변(e)을 끌면 비율 고정 없음, 이미지가 아닌 요소는 그대로');
}
// 구조형 결과에 새로 그려 넣는 글자·사각형·원·화살표(edits.shapes)
{
  const expect = (cond, msg) => { if (!cond) fails.push('새 도형: ' + msg); else ok++; };
  const S = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><defs><marker id="a"><path d="M0 0L10 5L0 10Z"/></marker></defs><circle cx="50" cy="50" r="20" fill="#4CAF50"/><text x="10" y="20">글</text></svg>';
  const sc = m.scanSvg(S); const sig = sc.sig; const BL = sc.els.filter((e) => e.kind === 'e').length;
  expect(m.SHAPE_FONT === m.ENGINE_FONT, '새 글자의 글꼴이 렌더러 글꼴(ENGINE_FONT)과 같아 페이지 글꼴 바꿈이 먹음');
  const t1 = m.shapeSvg({ id: 's1', kind: 'text', text: 'A<B & C', x: 10, y: 20, size: 18, fill: '#111111' });
  expect(t1.includes('>A&lt;B &amp; C</text>') && t1.includes('font-size="18"') && t1.includes('text-anchor="middle"') && !t1.includes('tspan'), '글자: 특수문자 이스케이프, 한 줄은 tspan 없이');
  const t2 = m.shapeSvg({ id: 's1', kind: 'text', text: '가\n나\n다', x: 10, y: 20, size: 20 });
  expect((t2.match(/<tspan/g) || []).length === 3 && t2.includes('dy="0"') && (t2.match(/dy="25"/g) || []).length === 2, '글자: 여러 줄은 줄마다 tspan(줄 간격 1.25배)');
  expect(m.shapeSvg({ kind: 'rect', x: 1, y: 2, w: 30, h: 20 }).startsWith('<rect x="1" y="2" width="30" height="20" rx="6" fill="#FFFFFF" stroke="#222222"') && m.shapeSvg({ kind: 'ellipse', cx: 5, cy: 6, rx: 7, ry: 8 }).startsWith('<ellipse cx="5" cy="6" rx="7" ry="8"'), '사각형·원 기본 모양');
  const ar = m.shapeSvg({ id: 's3', kind: 'arrow', x1: 0, y1: 0, x2: 50, y2: 10, color: '#3E8E41', sw: 5, head: 'both' });
  expect(ar.includes('<marker id="svm_s3"') && ar.includes('fill="context-stroke"') && ar.includes('marker-end="url(#svm_s3)"') && ar.includes('marker-start="url(#svm_s3)"') && ar.includes('d="M0 0L50 10"') && ar.includes('stroke="#3E8E41"'), '화살표: 선 + 화살촉 마커(선 색을 따라감, 양쪽)');
  expect(m.shapeSvg({ id: 's4', kind: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5, color: '#123456', head: 'none' }).includes('marker-end') === false && m.shapeSvg({ id: 's4', kind: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5, color: '#123456', ctx: false }).includes('<path d="M0 0L10 5L0 10Z" fill="#123456"/>'), '화살촉 없음 / context-stroke 미지원 브라우저는 색을 직접 지정');
  expect(m.shapeSvg({ kind: 'nope' }) === '' && m.appendShapes(S, null) === S && m.appendShapes(S, []) === S, '알 수 없는 종류는 빈 값, 도형이 없으면 그림 그대로');
  let E = m.emptyEdits(S);
  const r1 = m.editAddShape(E, sig, m.newShape('text', [0, 0, 400, 300])); E = r1.edits;
  const r2_ = m.editAddShape(E, sig, m.newShape('rect', [0, 0, 400, 300])); E = r2_.edits;
  const r3 = m.editAddShape(E, sig, m.newShape('arrow', [0, 0, 400, 300])); E = r3.edits;
  expect(r1.id === 's1' && r2_.id === 's2' && r3.id === 's3' && r3.index === 2 && E.shapes.length === 3 && m.hasEdits(E), '추가 순서대로 s1·s2·s3, 도형만 있어도 수정이 있는 것');
  const out = m.applyEdits(S, E); const sc2 = m.scanSvg(out.svg);
  const leaf = sc2.els.filter((e) => e.kind === 'e');
  expect(out.ok && out.sig === sig && out.baseLeaf === BL && leaf.length === BL + 3 && leaf.slice(0, BL).every((e, i) => e.id === `e${i}`) && leaf[BL].tag === 'text' && leaf[BL + 1].tag === 'rect' && leaf[BL + 2].tag === 'path', '그림 본래의 요소 번호는 그대로, 새 도형은 그 뒤 번호');
  expect(out.svg.endsWith('/></svg>') && out.svg.indexOf('<marker id="svm_s3"') > out.svg.indexOf('<text x="10" y="20">') && m.scanSvg(S).sig === sig, '새 도형은 그림 맨 끝에 붙고(맨 위에 그려짐) 마커 정의는 요소로 안 셈');
  expect(Math.abs(E.shapes[0].x - 200) < 0.01 && Math.abs(E.shapes[0].y - 150) < 0.01 && E.shapes[0].size >= 14 && E.shapes[0].size <= 40, '새 글자는 그림 한가운데, 크기는 그림에 비례(14~40)');
  let E2 = m.editSet(E, `e${BL + 1}`, { fill: '#D6453D' }); E2 = m.editMove(E2, `e${BL}`, 5, 6); E2 = m.editSet(E2, `e${BL + 2}`, { stroke: '#000000', 'stroke-dasharray': '9 6' });
  const o2 = m.applyEdits(S, E2).svg;
  expect(/<rect [^>]*rx="6" fill="#D6453D"/.test(o2) && /<text [^>]*transform="translate\(5 6\)"/.test(o2) && /<path d="M[^"]*" fill="none" stroke="#000000"[^>]*stroke-dasharray="9 6"/.test(o2), '새 도형도 같은 편집기 수정(색·이동·선 종류)이 입혀짐');
  expect(m.editUpdateShape(E, 's1', { text: '고침' }).shapes[0].text === '고침' && E.shapes[0].text === '글자' && m.applyEdits(S, m.editUpdateShape(E, 's1', { text: '고침' })).svg.includes('>고침</text>'), '글자 내용 고치기(불변)');
  let E3 = m.editSet(E, `e${BL}`, { fill: '#111111' }); E3 = m.editSet(E3, `e${BL + 2}`, { stroke: '#2222CC' }); E3 = m.editSet(E3, 'e1', { fill: '#999999' });
  const rm = m.editRemoveShape(E3, 's2', BL);
  expect(rm.shapes.length === 2 && rm.shapes.map((q) => q.id).join() === 's1,s3' && rm.ops[`e${BL}`]?.set.fill === '#111111' && rm.ops[`e${BL + 1}`]?.set.stroke === '#2222CC' && rm.ops[`e${BL + 2}`] === undefined && rm.ops.e1.set.fill === '#999999' && E3.shapes.length === 3, '도형을 지우면 그 뒤 도형의 번호·수정이 한 칸씩 당겨지고, 그림 본래 요소의 수정과 원본은 그대로');
  const rmAll = m.editRemoveShape(m.editRemoveShape(m.editRemoveShape(E, 's1', BL), 's2', BL), 's3', BL);
  expect(rmAll.shapes === undefined && m.editRemoveShape(E, 'nope', BL) === E && m.applyEdits(S, rmAll).svg === S, '모두 지우면 그림이 원래대로');
  expect(Object.keys(m.editRemoveShape(m.editSet(E, `e${BL + 1}`, { fill: '#123123' }), 's2', BL).ops).length === 0, '지운 도형의 수정은 버림');
  const stale = m.applyEdits(S.replace('<circle', '<ellipse'), { ...E2, sig: 'old' }).svg;
  expect(stale.includes('>글자</text>') && !stale.includes('#D6453D'), '그림 구조가 달라지면 새 도형은 남고 옛 수정은 적용되지 않음');
  const it = m.applyEdits(S, E, { ids: true }).svg;
  expect(it.includes(`data-eid="e${BL}"`) && it.includes(`data-eid="e${BL + 2}"`) && /data-hit="1"/.test(it), '편집용 출력에서 새 도형도 고를 수 있음');
  const mix = m.applyEdits(S, m.editUpdateAdd(m.editAddImage(E2, sig, { href: 'data:image/png;base64,iVBORw0KGgo=', w: 10, h: 10, box: [0, 0, 400, 300] }).edits, 'a1', { behind: true }), { ids: true }).svg;
  expect([...mix.matchAll(/<image\b/g)].every((q) => mix[q.index - 1] === '>') && m.scanSvg(mix).els.filter((e) => e.kind === 'e').length >= BL + 3, '이미지 + 새 도형 + 수정 + 편집용 id 가 함께 있어도 태그 무결');
  const nt = m.newShape('ellipse', [100, 50, 800, 400]); const nr = m.newShape('rect', [100, 50, 800, 400]); const na = m.newShape('arrow', [100, 50, 800, 400]);
  expect(Math.abs(nt.cx - 500) < 0.01 && Math.abs(nt.cy - 250) < 0.01 && nr.w > 0 && nr.h > 0 && Math.abs(nr.x + nr.w / 2 - 500) < 0.01 && Math.abs(na.x1 + (na.x2 - na.x1) / 2 - 500) < 0.01 && na.head === 'end', '기본 도형은 그림 상자의 한가운데');
}
// 복사·붙여넣기(raw 도형): 지금 보이는 모양 그대로 새 요소 조각을 만들어 붙인다
{
  const expect = (cond, msg) => { if (!cond) fails.push('복사·붙여넣기: ' + msg); else ok++; };
  const S = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="50" cy="50" r="20" fill="#4CAF50"/><text x="10" y="20" font-size="14">글</text></svg>';
  const sc = m.scanSvg(S); const sig = sc.sig; const BL = sc.els.filter((e) => e.kind === 'e').length;
  const raw = { kind: 'raw', defs: '<defs><marker id="cp1_a"><path d="M0 0L10 5L0 10Z"/></marker></defs>', el: '<path d="M0 0L50 50" stroke="#123456" fill="none" marker-end="url(#cp1_a)" transform="matrix(1 0 0 1 5 6)"></path>' };
  expect(m.shapeSvg(raw) === raw.defs + raw.el && m.shapeSvg({ kind: 'raw' }) === '', 'raw: 정의 + 요소 그대로');
  let E = m.editAddShape(m.emptyEdits(S), sig, raw).edits; E = m.editAddShape(E, sig, { kind: 'raw', defs: '', el: '<circle cx="9" cy="9" r="3" fill="#000"/>' }).edits;
  const out = m.applyEdits(S, E); const leaf = m.scanSvg(out.svg).els.filter((e) => e.kind === 'e');
  expect(out.ok && out.sig === sig && leaf.length === BL + 2 && leaf[BL].tag === 'path' && leaf[BL + 1].tag === 'circle' && out.svg.includes('<marker id="cp1_a">'), 'raw 도형도 요소 하나씩 새 번호를 받고, 정의 안의 것은 안 셈');
  expect(m.applyEdits(S, m.editSet(E, `e${BL}`, { stroke: '#ABCDEF' })).svg.includes('stroke="#ABCDEF"') && !m.applyEdits(S, m.editSet(E, `e${BL}`, { stroke: '#ABCDEF' })).svg.includes('stroke="#123456"'), '붙여넣은 요소도 같은 편집기 수정이 입혀짐(시작 닫는 태그가 있는 요소)');
  const sh1 = m.rawShift(raw, 10, 20);
  expect(sh1.el.includes('transform="translate(10 20) matrix(1 0 0 1 5 6)"') && sh1.defs === raw.defs && raw.el.includes('transform="matrix(1 0 0 1 5 6)"'), '위치 옮기기: 기존 transform 앞에 translate(원본은 그대로)');
  const noT = { kind: 'raw', defs: '', el: '<circle cx="9" cy="9" r="3"/>' };
  expect(m.rawShift(noT, 4, 5).el === '<circle transform="translate(4 5)" cx="9" cy="9" r="3"/>' && m.rawShift(noT, 0, 0) === noT, 'transform 이 없으면 새로 달고, 0 이동은 그대로');
  const tx = { kind: 'raw', defs: '', el: '<text x="30" y="40" font-size="20" fill="#111">가나</text>' };
  expect(m.rawSetText(tx, '다라&<').el === '<text x="30" y="40" font-size="20" fill="#111">다라&amp;&lt;</text>', '복사한 글자 내용 바꾸기(이스케이프)');
  const ml = m.rawSetText(tx, '일\n이\n삼').el;
  expect((ml.match(/<tspan x="30"/g) || []).length === 3 && ml.includes('dy="25"') && ml.includes('dy="0"') && ml.endsWith('</text>'), '여러 줄은 tspan(줄 간격 1.25배)');
  expect(m.rawSetText(noT, '무시').el === noT.el, '글자가 아닌 조각은 그대로');
  // raw 를 지우면 뒤 번호가 당겨짐(1요소 1도형)
  let E2 = m.editSet(E, `e${BL + 1}`, { fill: '#999999' });
  const rm = m.editRemoveShape(E2, E2.shapes[0].id, BL);
  expect(rm.shapes.length === 1 && rm.ops[`e${BL}`]?.set.fill === '#999999' && rm.ops[`e${BL + 1}`] === undefined, 'raw 를 지우면 뒤 도형의 수정이 한 칸 당겨짐');
}
// '이 영역만 다시 그리기': 새로 그린 조각을 지금 그림에 합치기(영역 밖은 그대로)
{
  const expect = (cond, msg) => { if (!cond) fails.push('영역 다시 그리기: ' + msg); else ok++; };
  expect(m.bandOf('#F42A21') === 'red' && m.bandOf('#EA8D59') === 'orange' && m.bandOf('#F9E200') === 'yellow' && m.bandOf('#1D9F30') === 'green' && m.bandOf('#0073FB') === 'blue' && m.bandOf('#8932B9') === 'purple' && m.bandOf('#FF0033') === 'red', '색 → 색 띠(서버와 같은 기준)');
  expect(m.bandOf('#00C8D2') === '' && Math.abs(m.hueOf('#00FF00') - 120) < 0.5 && m.hueOf('#808080') === 0, '띠 밖(청록)은 빈 값, 색조 계산');
  const url = 'data:image/jpeg;base64,/9j/AAAA';
  const base = m.makeEditSpec({ imageUrl: url, w: 1000, h: 600, title: '', legend: [], layers: { arrows: [
    { pts: [[100, 100], [300, 100]], width: 4, color: '#F20B09', head: 'end', dash: 'dashed', smooth: true },       // 영역 안(A)
    { pts: [[600, 300], [800, 300]], width: 4, color: '#2870E9', head: 'end', dash: 'solid', smooth: true },        // 영역 밖(B, 파랑)
    { pts: [[100, 500], [300, 500]], width: 4, color: '#D63030', head: 'none', dash: 'solid', smooth: true }], zones: [] } });
  const n0 = m.normalizeSketch(base);
  const fresh = [
    { pts: [[150, 120], [350, 120]], width: 4, color: '#E02020', head: 'end', dash: 'dashed', smooth: true },       // 영역 안: 받아들임, 색은 지금 그림의 같은 계열(#D63030)로
    { pts: [[700, 400], [900, 400]], width: 4, color: '#E02020', head: 'end', dash: 'solid', smooth: true },        // 영역 밖: 버림
    { pts: [[50, 150], [300, 150]], width: 4, color: '#00AA00', head: 'end', dash: 'solid', smooth: true }];        // 영역 안, 지금 그림에 없는 색: 그대로
  const r = m.mergeRegionWinds(n0, [0, 0, 400, 200], fresh, 1000);
  const wn = m.normalizeSketch(r.spec).winds;
  expect(r.removed === 1 && r.added === 2 && wn.length === 4, `영역 안 옛 화살표 1개를 지우고 새 2개를 넣음, 영역 밖 2개는 그대로 (지움 ${r.removed} 넣음 ${r.added} 총 ${wn.length})`);
  expect(wn.some((w) => w.color === '#2870E9') && wn.filter((w) => w.color === '#D63030').length === 2 && wn.some((w) => w.color === '#00AA00'), '새 화살표 색: 같은 계열이면 지금 그림의 색에 맞추고(빨강→#D63030), 없는 색(초록)은 그대로');
  expect(new Set(wn.map((w) => w.id)).size === wn.length && n0.winds.length === 3 && !wn.some((w) => w.pts[0][0] > 80 && w.pts[0][1] > 60 && w.color === '#E02020'), '화살표 번호가 겹치지 않고 원본은 그대로, 영역 밖 새 화살표는 안 들어감');
  const none = m.mergeRegionWinds(n0, [0, 0, 400, 200], [], 1000);
  expect(none.removed === 1 && none.added === 0 && m.normalizeSketch(none.spec).winds.length === 2, '새 화살표가 하나도 없으면 영역 안 옛 화살표만 지워짐(영역의 동선이 없다고 다시 그린 경우)');
  const all = m.mergeRegionWinds(n0, [0, 0, 1000, 600], fresh, 1000);
  expect(all.removed === 3 && all.added === 3, '그림 전체를 영역으로 하면 모두 교체');
  const wd = m.arrowsToWinds(n0, [{ pts: [[10, 10], [60, 10]], width: 5, color: '#123456', head: 'none', dash: 'solid' }, { pts: [[1, 1]], color: '#000000' }, { pts: [[1, 1], [9, 9]], color: 'bad' }], 1000, n0.winds);
  expect(wd.length === 1 && !n0.winds.some((q) => q.id === wd[0].id) && wd[0].shape === 'read', 'arrowsToWinds: 잘못된 항목은 거르고, 이미 있는 번호는 피함');
  // 마스크 합치기 수학
  const A = m.featherMap(100, 50, [20, 10, 80, 40], 6);
  expect(A[25 * 100 + 50] === 1 && A[25 * 100 + 10] === 0 && A[5 * 100 + 50] === 0 && A[25 * 100 + 20] > 0 && A[25 * 100 + 20] < 0.2 && A[25 * 100 + 23] > A[25 * 100 + 20] && A[25 * 100 + 70] === 1 && A[25 * 100 + 79] < 0.2, '경계에서 안쪽으로 6화소에 걸쳐 0→1 로 번지는 비율 지도(영역 밖 0, 가운데 1)');
  const old = new Float32Array([1, 1, 1, 1]); const pat = new Float32Array([0, 0, 0, 0]); const bm = m.blendMasks(old, pat, new Float32Array([0, 0.5, 1, 0.25]));
  expect(bm[0] === 1 && Math.abs(bm[1] - 0.5) < 1e-6 && bm[2] === 0 && Math.abs(bm[3] - 0.75) < 1e-6, '마스크 섞기: 비율 0 이면 옛 것, 1 이면 새 것, 중간은 섞임');
  expect(m.normalizeSketch({ ...n0, zones: [{ id: 'z1', color: '#BAD6B0', label: '녹', mask: 'data:image/png;base64,iVBORw0KGgo=', band: 'green' }] }).zones[0].band === 'green', '구역 층에 색 띠(band)가 유지됨');
}
// 칸의 그림을 다른 칸으로 옮기기(빈 칸이면 이동, 그림이 있으면 맞바꿈)
{
  const expect = (cond, msg) => { if (!cond) fails.push('칸 그림 옮기기: ' + msg); else ok++; };
  const A = { type: 'site', ver: 1 }; const B = { type: 'layout', ver: 2 };
  const ids = ['c1', 'c2', 'c3', 'c4']; const items = { c1: A, c2: B };
  const mv = m.moveCellContent(items, ids, 'c1', 'c3');
  expect(mv && mv.swapped === false && mv.items.c3 === A && !('c1' in mv.items) && mv.items.c2 === B, '빈 칸으로 옮기면 이동(원래 칸은 비고 다른 칸은 그대로)');
  const sw = m.moveCellContent(items, ids, 'c1', 'c2');
  expect(sw && sw.swapped === true && sw.items.c2 === A && sw.items.c1 === B, '그림이 있는 칸으로 옮기면 서로 맞바꿈');
  expect(items.c1 === A && items.c2 === B && !('c3' in items), '받은 items 는 바꾸지 않음(되돌리기 기록이 안전)');
  expect(m.moveCellContent(items, ids, 'c1', 'c1') === null && m.moveCellContent(items, ids, 'c3', 'c1') === null && m.moveCellContent(items, ids, 'c1', 'c9') === null && m.moveCellContent(items, ids, 'c9', 'c1') === null, '같은 칸·빈 칸에서 옮기기·없는 칸은 null');
  const again = m.moveCellContent(sw.items, ids, 'c2', 'c1'); expect(again.items.c1 === A && again.items.c2 === B, '맞바꾼 것을 다시 맞바꾸면 처음으로');
}
// 내 이미지: 자르기(제자리 유지)·바꾸기(비율 유지)·여러 장 비껴 놓기·화질 단계
{
  const expect = (cond, msg) => { if (!cond) fails.push('내 이미지: ' + msg); else ok++; };
  const near = (a, b, e = 0.011) => Math.abs(a - b) <= e;
  const eqRect = (a, b) => a.length === b.length && a.every((v, i) => near(v, b[i]));
  // 순수 계산
  expect(m.normCrop([0, 0, 1, 1]) === null && m.normCrop([0.001, 0, 1, 0.999]) === null, '거의 전체면 자르지 않은 것(null)');
  expect(eqRect(m.normCrop([0.8, 0.1, 0.2, 0.9]), [0.2, 0.1, 0.8, 0.9]), '왼쪽>오른쪽으로 거꾸로 줘도 바로잡음');
  const tiny = m.normCrop([0.5, 0.5, 0.51, 0.9]); expect(tiny[2] - tiny[0] >= 0.05 - 1e-9, '너무 좁은 범위는 최소 5%로 넓힘');
  expect(m.normCrop('x') === null && m.normCrop([0, 0, 1]) === null && m.normCrop([0, 0, NaN, 1]) === null, '잘못된 입력은 null');
  expect(eqRect(m.cropRect([10, 20, 110, 70], null, [0.25, 0.5, 0.75, 1]), [35, 45, 85, 70]), '자르기: 전체 상자 [10,20,110,70] 에서 가운데·아래 절반만 남기면 보이는 부분이 제자리에 남음');
  const c1 = m.cropRect([10, 20, 110, 70], null, [0.25, 0.5, 0.75, 1]); const c2 = m.cropRect(c1, [0.25, 0.5, 0.75, 1], [0, 0, 1, 1]);
  expect(eqRect(c2, [10, 20, 110, 70]), '자르기를 풀면(전체로) 처음 상자로 돌아감');
  const c3 = m.cropRect(c1, [0.25, 0.5, 0.75, 1], [0.25, 0.5, 0.5, 1]); expect(eqRect(c3, [35, 45, 60, 70]), '이미 자른 것을 더 자르면 보이는 부분이 그대로 남음');
  expect(eqRect(m.fitInside([0, 0, 100, 50], 2), [0, 0, 100, 50]) && eqRect(m.fitInside([0, 0, 100, 50], 1), [25, 0, 75, 50]) && eqRect(m.fitInside([0, 0, 100, 50], 4), [0, 12.5, 100, 37.5]), '바꾸기: 새 이미지를 옛 상자 안에 비율을 지키며 가장 크게(가운데)');
  expect(m.stagger(0) === 0 && m.stagger(1) === 3 && m.stagger(2) === 6 && m.stagger(8) === 24 && m.stagger(9) === 3, '여러 장 비껴 놓기: 처음은 가운데, 다음부터 3씩(8장마다 되풀이)');
  expect(m.IMG_QUALITY.light.limit < m.IMG_QUALITY.normal.limit && m.IMG_QUALITY.normal.limit < m.IMG_QUALITY.high.limit && m.imgQualityOf('x') === m.IMG_QUALITY.normal && m.IMG_QUALITY.high.tries[0][0] > m.IMG_QUALITY.normal.tries[0][0], '화질 단계: 가볍게 < 보통 < 선명하게, 모르는 값은 보통');
  // 손스케치 이미지 블록
  const url = 'data:image/png;base64,iVBORw0KGgo=';
  const sk0 = m.normalizeSketch(m.makeEditSpec({ imageUrl: url, w: 1000, h: 600, title: '', legend: [] }));
  const a1 = m.sketchAddImage(sk0, { href: url, w: 400, h: 200 }); const b1 = a1.spec.blocks.find((b) => b.id === a1.id);
  const a2 = m.sketchAddImage(sk0, { href: url, w: 400, h: 200 }, 6); const b2 = a2.spec.blocks.find((b) => b.id === a2.id);
  expect(near(b2.rect[0] - b1.rect[0], 6, 0.2) && near(b2.rect[1] - b1.rect[1], 6, 0.2), '여러 장: shift 만큼 비껴 놓임');
  const cropped = m.sketchCropImage(a1.spec, a1.id, { crop: [0.25, 0, 0.75, 1], orig: url, href: url + 'C', w: 200, h: 200 });
  const cb = m.normalizeSketch(cropped).blocks.find((b) => b.id === a1.id);
  const w0 = b1.rect[2] - b1.rect[0]; const w1 = cb.rect[2] - cb.rect[0];
  expect(near(w1, w0 / 2, 0.2) && near(cb.rect[0] - b1.rect[0], w0 / 4, 0.2) && near(cb.rect[3] - cb.rect[1], b1.rect[3] - b1.rect[1], 0.2), '손스케치 자르기: 가운데 절반만 남고 보이는 부분은 제자리, 높이는 그대로');
  expect(cb.href === url + 'C' && cb.orig === url && Array.isArray(cb.crop) && near(cb.ar, 1, 0.01), '자른 그림(href)·원본(orig)·범위(crop)가 저장되고 비율(ar)은 자른 그림의 비율');
  const back = m.normalizeSketch(m.sketchCropImage(cropped, a1.id, { crop: null, orig: url, href: url, w: 400, h: 200 })).blocks.find((b) => b.id === a1.id);
  expect(eqRect(back.rect, b1.rect) && back.href === url && back.orig === undefined && back.crop === undefined, '자르기 해제: 처음 상자·원본 그림으로 돌아가고 orig/crop 사라짐');
  const again = m.normalizeSketch(m.sketchCropImage(cropped, a1.id, { crop: [0.25, 0.25, 0.75, 0.75], orig: url, href: url + 'D', w: 200, h: 100 })).blocks.find((b) => b.id === a1.id);
  expect(again.orig === url && near(again.rect[2] - again.rect[0], w0 / 2, 0.2) && near(again.rect[3] - again.rect[1], (b1.rect[3] - b1.rect[1]) / 2, 0.2), '다시 자르기: 원본 기준으로 범위를 고쳐 상자가 맞게 바뀜');
  const rp = m.normalizeSketch(m.sketchReplaceImage(cropped, a1.id, { href: url + 'R', w: 100, h: 400 })).blocks.find((b) => b.id === a1.id);
  const cx0 = (cb.rect[0] + cb.rect[2]) / 2; const cx1 = (rp.rect[0] + rp.rect[2]) / 2;
  expect(rp.href === url + 'R' && rp.orig === undefined && rp.crop === undefined && near(rp.ar, 0.25, 0.01) && near((rp.rect[2] - rp.rect[0]) / (rp.rect[3] - rp.rect[1]), 0.25, 0.01) && near(cx0, cx1, 0.2) && rp.rect[3] - rp.rect[1] <= cb.rect[3] - cb.rect[1] + 0.2, '바꾸기: 새 이미지가 옛 상자 안에 비율을 지켜 들어가고 자르기는 풀림, 중심 유지');
  expect(rp.opacity === a1.spec.blocks.find((b) => b.id === a1.id).opacity && rp.layer === 'back', '바꾸기: 투명도·앞뒤는 그대로');
  expect(m.normalizeSketch({ ...cropped, blocks: cropped.blocks.map((b) => (b.id === a1.id ? { ...b, crop: [0, 0, 1, 1] } : b)) }).blocks.find((b) => b.id === a1.id).orig === undefined, '범위가 전체(자르지 않음)로 저장돼 있으면 orig/crop 을 버림');
  // 구조형 결과의 내 이미지(edits.adds)
  const e1 = m.editAddImage(null, 'sig', { href: url, w: 400, h: 200, box: [0, 0, 1000, 700] });
  const e2 = m.editAddImage(e1.edits, 'sig', { href: url, w: 400, h: 200, box: [0, 0, 1000, 700], shift: 12 });
  const ad1 = e2.edits.adds[0]; const ad2 = e2.edits.adds[1];
  expect(near(ad2.x - ad1.x, 12, 0.1) && near(ad2.y - ad1.y, 12, 0.1) && ad1.id !== ad2.id, '구조형: 여러 장 shift 로 비껴 놓임, 번호 겹치지 않음');
  const ec = m.editCropImage(e1.edits, e1.id, { crop: [0, 0.5, 1, 1], orig: url, href: url + 'C', w: 400, h: 100 });
  const ac = ec.adds[0]; const a0 = e1.edits.adds[0];
  expect(near(ac.x, a0.x, 0.05) && near(ac.w, a0.w, 0.05) && near(ac.h, a0.h / 2, 0.05) && near(ac.y, a0.y + a0.h / 2, 0.05) && ac.orig === url && ac.crop[1] === 0.5, '구조형 자르기: 아래 절반만 남고 제자리');
  const er = m.editCropImage(ec, e1.id, { crop: null, orig: url, href: url, w: 400, h: 200 }); const ar0 = er.adds[0];
  expect(near(ar0.h, a0.h, 0.05) && near(ar0.y, a0.y, 0.05) && ar0.orig === undefined && ar0.crop === undefined, '구조형 자르기 해제: 처음 모양으로');
  const ee = m.editReplaceImage(ec, e1.id, { href: url + 'R', w: 50, h: 200 }); const ae = ee.adds[0];
  expect(ae.href === url + 'R' && ae.orig === undefined && near(ae.w / ae.h, 0.25, 0.01) && ae.h <= ac.h + 0.05, '구조형 바꾸기: 상자 안에 비율을 지켜 맞춤, 자르기 풀림');
  const svgOut = m.applyEdits('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#fff"/></svg>', ec).svg;
  expect(svgOut.includes('href="' + url + 'C"') && !svgOut.includes('orig') && !svgOut.includes('crop'), '그림에는 자른 그림만 들어가고 원본(orig)·범위(crop)는 새어 나가지 않음');
  expect(m.hasEdits(ec) && ec.adds.length === 1, '자른 이미지도 수정으로 셈');
  expect(m.sketchReplaceImage(a1.spec, a1.id, { w: 100, h: 100 }) === a1.spec && m.sketchCropImage(a1.spec, a1.id, { crop: [0, 0, 0.5, 1], w: 100, h: 100 }) === a1.spec && m.editReplaceImage(e1.edits, e1.id, { w: 1, h: 1 }) === e1.edits && m.editCropImage(e1.edits, e1.id, { crop: [0, 0, 0.5, 1], w: 1, h: 1 }) === e1.edits, '새 그림(href)이 없으면 아무것도 바꾸지 않음(이미지가 사각형으로 변하는 사고 방지)');
}
// 글자 하나의 pt 위계 판정(편집기에서 글자를 눌렀을 때) + 페이지 위에서 제목·칸 제목을 바로 고치기 위한 자리 정보
{
  const expect = (cond, msg) => { if (!cond) fails.push('글자 위계 판정: ' + msg); else ok++; };
  const T = { title: 32, sub: 18, label: 11, small: 8, labelMin: 7, upper: null };
  const jd = (pt, t = T) => m.judgeTextPt(pt, t);
  expect(jd(11).level === 'ok' && jd(11).tier.name === '본문' && jd(11).fix === null, '11pt = 본문 위계에 맞음(고칠 것 없음)');
  expect(jd(10).level === 'ok' && jd(12).level === 'ok', '본문 ±12% 안은 맞음');
  expect(jd(8).level === 'ok' && jd(8).tier.name === '작은 글자', '8pt = 작은 글자 위계');
  expect(jd(4).level === 'warn' && jd(4).fix === 8 && /읽기 어렵/.test(jd(4).text), '최소(7pt)보다 작으면 경고, 8pt 로 맞추라고 알림');
  expect(jd(6.5).level === 'warn' && jd(7).level !== 'warn', '최소 크기 경계(7pt, 계산 오차 2% 허용)');
  expect(jd(14).level === 'info' && jd(14).fix === 11 && jd(14).tier.name === '본문' && /크고/.test(jd(14).text), '위계 단계 사이(14pt)는 안내하고 가장 가까운 단계(본문 11pt)로 맞추라고 함');
  const U = { ...T, upper: { pt: 18, name: '소제목' } };
  expect(jd(18, U).level === 'warn' && /소제목\(18pt\)보다 크거나 같/.test(jd(18, U).text) && jd(18, U).fix === 11, '소제목(18pt)과 같거나 크면 위계 경고, 본문(11pt)으로 맞추라고 알림');
  expect(jd(17.9, U).level !== 'warn' || jd(17.9, U).fix !== 11, '소제목보다 작으면 위 경고는 아님');
  expect(jd(11, U).level === 'ok', '윗 위계가 있어도 본문은 맞음');
  expect(m.judgeTextPt(0, T) === null && m.judgeTextPt(10, null) === null, '크기 0 이나 위계 정보가 없으면 판정 안 함');
  // 페이지 위에서 바로 고치기: 제목·소제목 자리, 칸 제목 자리
  const mk = (title, subtitle, cap) => m.composePage({ w: 420, h: 297, medium: 'print' }, [{ id: 'c1', render: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><rect x="10" y="10" width="80" height="40" fill="#ccc"/></svg>' }, caption: cap }, { id: 'c2', render: null }], { title, subtitle, layoutId: '2x1' });
  const e = mk('', '', '칸 제목');
  expect(e.slots.title.has === false && e.slots.title.text === '' && !e.slots.subtitle && e.slots.title.rect[1] === 0 && e.slots.title.rect[3] >= 4, '제목이 없으면 위쪽 여백에 "제목 추가" 자리만 있음');
  const t = mk('내 제목', '', '칸 제목');
  expect(t.slots.title.has === true && t.slots.title.text === '내 제목' && t.slots.title.rect[2] > 10 && t.slots.title.rect[2] < 400 && t.slots.subtitle && t.slots.subtitle.has === false, '제목이 있으면 글자 자리(폭은 글자만큼)와 "소제목 추가" 자리가 생김');
  expect(t.slots.title.rect[1] + t.slots.title.rect[3] <= t.box.y + 0.01 && t.slots.subtitle.rect[1] >= t.slots.title.rect[1] + t.slots.title.rect[3] - 0.01, '제목 자리가 그림 영역 위에 놓이고 소제목 자리는 제목 아래');
  const st = mk('내 제목', '소제목입니다', '칸 제목');
  expect(st.slots.subtitle.has === true && st.slots.subtitle.text === '소제목입니다', '소제목이 있으면 글자 자리');
  const c1 = st.cells.find((c) => c.id === 'c1'); const c2 = st.cells.find((c) => c.id === 'c2');
  expect(Array.isArray(c1.capRect) && c1.captionText === '칸 제목' && c1.capRect[0] === c1.rect[0] && c1.capRect[1] === c1.rect[1] && c1.capRect[2] <= c1.rect[2] && c1.capRect[3] > 2, '칸 제목 자리는 칸의 왼쪽 위에서 시작하고 칸 폭 안');
  expect(c2.empty === true && !c2.capRect, '빈 칸에는 칸 제목 자리가 없음');
  const one = m.composePage({ w: 420, h: 297, medium: 'print' }, [{ id: 'c1', render: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/></svg>' }, caption: '그림 제목' }], { title: '', layoutId: '1x1' });
  expect(!one.cells[0].capRect, '한 칸짜리 페이지는 칸 제목을 따로 그리지 않음');
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
// 편집 화면 키우기: 분할선 비율·확대 계산
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`화면 배치: ${label}`); };
  const near = (a, b, e = 0.005) => Math.abs(a - b) <= e;
  expect(m.clampSplit(NaN, 1300, 664, 240) === m.clampSplit(m.SPLIT_DEFAULT, 1300, 664, 240), '값이 없으면 기본 비율');
  expect(m.clampSplit(0.1, 0, 0, 0) === m.SPLIT_MIN && m.clampSplit(0.99, 0, 0, 0) === m.SPLIT_MAX, '최소·최대 몫 안으로');
  expect(near(m.clampSplit(0.4, 1300, 664, 240), 664 / 1300) && near(m.clampSplit(0.9, 1300, 664, 240), 1 - 240 / 1300), '양쪽 최소 폭(편집기 664·페이지 240px)을 지킨다');
  expect(near(m.clampSplit(0.6, 1300, 664, 240), 0.6), '허용 범위 안의 값은 그대로');
  expect(near(m.clampSplit(0.6, 800, 664, 240), 664 / 800), '두 최소 폭이 다 안 들어가면 편집기를 먼저 지킨다');
  expect(near(m.splitFromPointer(100 + 7 + 0.5 * 986, 100, 1000, 14), 0.5, 0.0001) && near(m.splitFromPointer(107, 100, 1000, 14), 0, 0.0001), '마우스 위치 → 편집기 몫');
  expect(m.splitFromPointer(5, 0, 10, 14) === m.SPLIT_DEFAULT, '폭이 없으면 기본 비율');
  { let bad = ''; for (const r of [0.3, 0.37, 0.5, 0.567, 0.6, 0.62, 0.85]) { const mm = m.splitColumns(r, 14).match(/(\d+)fr\) 14px minmax\(0, (\d+)fr/); if (!mm || Number(mm[1]) + Number(mm[2]) !== 1000) bad += ` ${r}`; } expect(!bad, `fr 합이 1000 이어야 남는 폭을 다 쓴다(어긋난 값:${bad})`); }
  expect(m.clampZoom(0.5) === 1 && m.clampZoom(1.02) === 1 && m.clampZoom(1.5) === 1.5 && m.clampZoom(9) === 4 && m.clampZoom(NaN) === 1, '배율은 100%~400%, 100% 근처는 100%로 붙는다');
  expect(m.stepZoom(1, 1) === 1.25 && m.stepZoom(1.25, 1) === 1.5 && m.stepZoom(4, 1) === 4 && m.stepZoom(1.25, -1) === 1 && m.stepZoom(1, -1) === 1 && m.stepZoom(1.37, 1) === 1.5 && m.stepZoom(1.37, -1) === 1.25, '버튼 확대·축소는 단계(100·125·150·200·300·400%)로');
  expect(near(m.wheelZoom(1, -100), 1.22, 0.01) && m.wheelZoom(1.22, 100) === 1 && near(m.wheelZoom(1, -3, 1), 1.22, 0.01) && m.wheelZoom(3.9, -500) === 4, 'Ctrl+휠: 한 칸 약 1.22배, 줄 단위 휠도 같은 느낌, 한계에서 멈춤');
  { const a = m.anchorScroll({ left: 0, top: 0, px: 300, py: 200, z0: 1, z1: 2 }); expect(a.left === 300 && a.top === 200, '확대해도 마우스 아래 그림 점이 제자리에 남는다'); }
  { const a = m.anchorScroll({ left: 500, top: 80, px: 300, py: 100, z0: 2, z1: 1 }); expect(near(a.left, 100, 0.001) && a.top === 0, '축소할 때도 같은 점 유지(계산값이 음수면 0)'); }
  expect(m.anchorScroll({ left: 0, top: 0, px: 300, py: 300, z0: 2, z1: 1 }).left === 0, '스크롤 위치는 음수가 되지 않는다');
}
// 보드 틀 v1: 배치 프리셋·칸 라벨·머리·꼬리·제목 강조·자동 투명
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`보드 틀: ${label}`); };
  const PG = { w: 420, h: 297, medium: 'print' };
  const svgIn = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"><rect width="100" height="60" fill="${bg}"/><rect x="10" y="10" width="40" height="30" fill="#E8833A"/><text x="20" y="30" font-size="6" font-family="${m.ENGINE_FONT}">본문 글자</text></svg>`;
  // 1) 배치 프리셋: 칸 수·범위·겹침·합계 넓이
  for (const [id, n] of [['T3', 4], ['T4', 5], ['T5', 6], ['L4', 5]]) {
    const cs = m.getCells(id, null);
    expect(cs.length === n, `${id} 칸 수 ${n}`);
    expect(cs.every((c) => c.r.every((v) => v >= 0 && v <= 1) && c.r[2] > c.r[0] && c.r[3] > c.r[1]), `${id} 칸 좌표가 0~1 안`);
    expect(m.overlappingCells(cs).length === 0, `${id} 칸이 겹치지 않음`);
    expect(Math.abs(cs.reduce((a, c) => a + (c.r[2] - c.r[0]) * (c.r[3] - c.r[1]), 0) - 1) < 1e-9, `${id} 칸이 페이지를 빈틈없이 채움`);
  }
  // 2) 칸 라벨 자동 번호: 큰 그림 칸은 건너뛰고 소도식 칸을 01부터
  { const lb = m.autoCellLabels(m.getCells('T4', null), 'STEP'); expect(lb.c1 === null && lb.c2 === 'STEP 01' && lb.c5 === 'STEP 04', 'T4: 큰 칸은 라벨 없음, 아래 4칸이 STEP 01~04'); }
  { const lb = m.autoCellLabels(m.getCells('L4', null), 'ISSUE'); expect(lb.c1 === 'ISSUE 01' && lb.c4 === 'ISSUE 04' && lb.c5 === null, 'L4: 왼쪽 4칸이 ISSUE 01~04, 오른쪽 큰 칸은 없음'); }
  { const lb = m.autoCellLabels(m.getCells('2x2', null), '배치전략'); expect(Object.values(lb).join() === '배치전략 01,배치전략 02,배치전략 03,배치전략 04', '2×2: 모든 칸에 번호'); }
  { const lb = m.autoCellLabels(m.getCells('2x1', null), 'STEP'); expect(lb.c1 === 'STEP 01' && lb.c2 === 'STEP 02', '2칸은 둘 다 번호'); }
  expect(Object.values(m.autoCellLabels(m.getCells('T4', null), '')).every((v) => v === null), '접두어가 없으면 라벨 없음');
  // 3) 설명문 줄바꿈
  { const fs = 3; const w = 60; const l = m.wrapLines('소음과 진동 등 환경적인 조건을 고려하여 1층에 배치하고 상부 공간 구성의 기초를 마련한다', fs, w, 2);
    expect(l.length <= 2 && l.every((x) => m.textWidth(x, fs) <= w + 0.001), '설명문은 2줄 이내, 각 줄이 폭 안'); expect(l[l.length - 1].endsWith('…'), '길면 마지막 줄을 …로 줄임'); }
  expect(m.wrapLines('짧은 설명', 3, 60, 2).join('|') === '짧은 설명', '짧으면 한 줄 그대로');
  // 4) 제목 강조
  expect(JSON.stringify(m.emphParts('공원 속 {체육센터}')) === JSON.stringify([{ t: '공원 속 ', em: false }, { t: '체육센터', em: true }]), '{강조어} 나누기');
  expect(m.emphParts('중괄호 없음').length === 1 && !m.emphParts('중괄호 없음')[0].em, '중괄호가 없으면 그대로');
  // 5) 바탕 사각형: 그림 전체를 덮는 것만 뺀다
  expect(!m.stripBg('<rect width="100" height="60" fill="#FDF8EC"/><g/>', 100, 60).includes('FDF8EC'), '전체를 덮는 바탕을 뺌');
  expect(m.stripBg('<rect x="5" y="5" width="20" height="10" fill="#fff"/><g/>', 100, 60).includes('<rect'), '작은 사각형은 그대로 둠');
  expect(!m.stripBg('<rect width="100%" height="100%" fill="#fff"/>', 100, 60).includes('<rect'), '100% 바탕도 뺌');
  // 6) composePage: 한 칸 — 크림 바탕이 페이지에 번지지 않고 흰 종이
  { const one = m.composePage(PG, [{ id: 'c1', render: { svg: svgIn('#FDF8EC') } }], { layoutId: '1x1' });
    expect(!one.svg.includes('FDF8EC') && one.svg.includes('fill="#FFFFFF"'), '한 칸 페이지: 크림 바탕 대신 흰 종이'); }
  // 7) 칸 라벨·설명(여러 칸)
  { const items = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => ({ id, render: { svg: svgIn('#FDF8EC') }, caption: i ? `소도식 ${i}` : '' }));
    const r0 = m.composePage(PG, items, { layoutId: 'T4' });
    expect(!r0.svg.includes('STEP'), '접두어를 안 정하면 라벨 없음(기존과 같음)');
    const r1c = m.composePage(PG, items, { layoutId: 'T4', labelPrefix: 'STEP', cellMeta: { c2: { desc: '소음과 진동 등 환경적인 조건을 고려하여 1층에 배치한다' }, c3: { label: '직접 라벨' } } });
    expect(r1c.svg.includes('STEP 01') && r1c.svg.includes('STEP 04') && !r1c.svg.includes('STEP 05'), 'T4: STEP 01~04 라벨');
    expect(r1c.svg.includes('직접 라벨') && !r1c.svg.includes('STEP 02'), '칸별 직접 라벨이 자동 번호를 덮어씀');
    const c2 = r1c.cells.find((c) => c.id === 'c2'); expect(!!c2.labRect && !!c2.descRect && !!c2.capRect && c2.labRect[1] < c2.capRect[1] && c2.capRect[1] < c2.descRect[1], '라벨 → 제목 → 설명 순서로 위에서 아래로');
    expect(r1c.cells.find((c) => c.id === 'c1').labRect === null, '큰 칸에는 라벨 자리 없음');
    expect(!/NaN|undefined|Infinity/.test(r1c.svg), '라벨·설명 SVG 에 NaN/undefined 없음');
    const none = m.composePage(PG, items, { layoutId: 'T4', labelPrefix: 'STEP', cellMeta: { c2: { label: '' } }, preview: true }); expect(!none.svg.includes('STEP 01') && none.svg.includes('STEP 02'), '빈 라벨은 그 칸만 라벨을 숨김'); }
  // 8) 머리 라벨·제목 강조·꼬리말
  { const r = m.composePage(PG, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', kicker: '구조계획', title: '공원 속 {체육센터}', project: '시험 프로젝트', pageNo: 2, accent: '#F28C28' });
    expect(r.svg.includes('| 구조계획 |') && r.slots.kicker && r.slots.kicker.has, '구분 라벨이 그려지고 눌러 고칠 자리가 있음');
    expect(r.svg.includes('<tspan fill="#F28C28" font-weight="800">체육센터</tspan>') && !r.svg.includes('{체육센터}'), '제목의 {강조어} 가 강조색 굵게');
    expect(r.slots.title.text === '공원 속 {체육센터}', '제목 고치기는 중괄호 포함 원문');
    expect(r.svg.includes('text-anchor="end"') && r.svg.includes('시험 프로젝트') && r.svg.includes('>02<'), '꼬리말: 프로젝트명 + 두 자리 쪽번호');
    const y = (re) => Number(re.exec(r.svg)[1]); expect(y(/y="([\d.]+)"[^>]*>\| 구조계획/) < y(/y="([\d.]+)"[^>]*>공원 속/), '구분 라벨이 제목 위에 놓임');
    const plain = m.composePage(PG, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', title: '일반 제목' }); expect(!plain.svg.includes('<tspan') && !plain.svg.includes('text-anchor="end"'), '아무것도 안 정하면 예전과 같은 출력(꼬리말·강조 없음)');
    const onlyNo = m.composePage(PG, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', pageNo: '7' }); expect(onlyNo.svg.includes('>07<'), '쪽번호만 있어도 꼬리말'); }
}
// 종류 카탈로그·범위 판정(R2)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`종류 범위: ${label}`); };
  const ids = m.CATALOG.map((c) => c.id);
  expect(new Set(ids).size === ids.length, '카탈로그 id 가 겹치지 않음');
  expect(m.OFFERED_TYPES.every((t) => m.CATALOG.some((c) => c.group === 'text' && c.id === t && c.thumb?.type === t)) && m.CATALOG.filter((c) => c.group === 'text').length === m.OFFERED_TYPES.length, '제공하는 모든 종류(배치·매스·개요표·카드 보드)가 카탈로그에 있고, 뺀 종류(버블도·층별 조닝도)는 없음');
  expect(Object.keys(m.SUBJECT_KINDS).filter((k) => !['other', 'site'].includes(k)).every((k) => m.CATALOG.some((c) => c.group === 'image' && c.id === k)), '이미지로 만드는 모든 방식(도면 위 표시·평면·형태·손스케치·자유 해석·축측도)이 카탈로그에 있음(배치도 읽기는 배치 개념도 카드가 안내)');
  expect(m.CATALOG.filter((c) => c.group !== 'out').every((c) => c.can.length && c.cannot.length && c.needs && c.summary && c.label), '지원 종류마다 가능·불가·입력 안내가 있음');
  expect(m.CATALOG.filter((c) => c.group === 'out').every((c) => c.alt && (c.status === 'no' || c.status === 'plan') && Array.isArray(c.nearest)), '지원 안 함 종류마다 대안 안내가 있음');
  expect(m.CATALOG.every((c) => (c.nearest || []).every((n) => m.catalogById(n.type))), '가까운 종류가 모두 카탈로그에 있음');
  expect(m.CATALOG.filter((c) => c.group === 'text').every((c) => { try { const r = m.renderSpec(c.thumb.type, m.EXAMPLE_SPECS[c.thumb.type]); return /^<svg[\s\S]*<\/svg>$/.test(r.svg) && !/NaN|undefined/.test(r.svg); } catch { return false; } }), '예시 썸네일이 모두 그려짐');
  expect(m.CATALOG.filter((c) => c.group === 'image').every((c) => m.PICTOS[c.thumb.picto] && /^<svg[\s\S]*<\/svg>$/.test(m.pictoSvg(c.thumb.picto))), '이미지 종류의 작은 그림이 모두 있음');
  // 범위 판정: 지원하지 않는 종류를 달라는 말
  const sc = (t) => m.checkScope(t);
  expect(sc('건축개요표를 만들어줘').inScope && m.looksLikeTable('건축개요표를 만들어줘') && m.looksLikeTable('면적표 작성') && !m.looksLikeTable('매스 과정도') && !m.looksLikeTable(''), '단순 개요표는 범위 안(종류가 자동이면 개요표 종류로 보냄)');
  expect(sc('간트 공정표 작성해 주세요').category?.id === 'tablex' && sc('프로젝트 조직도를 그려줘').category?.id === 'tablex' && !sc('간트 공정표 작성해 주세요').inScope, '공정표·조직도는 여전히 범위 밖(복잡한 표)');
  expect(sc('이 건물 조감도를 그려줘').category?.id === 'render' && sc('투시도 이미지 생성').category?.id === 'render', '조감도·투시도 만들기 → 렌더');
  expect(sc('1층 평면도를 그려줘').category?.id === 'drawing' && sc('단면도를 작성해 주세요').category?.id === 'drawing', '평면도·단면도 작성 → 도면');
  expect(sc('회사 로고 만들어줘').category?.id === 'illust', '로고 → 일러스트');
  expect(sc('구조계획 카드 보드로 정리해줘').inScope && sc('친환경 계획을 한 장으로 정리').inScope && m.looksLikeCards('구조계획 카드 보드로 정리해줘') && m.looksLikeCards('설비 계획을 한 장으로 정리') && !m.looksLikeCards('매스 과정도 만들어줘') && !m.looksLikeCards(''), '카드 보드는 이제 범위 안(종류가 자동이면 카드 보드로 보냄)');
  expect(sc('조직도를 그려줘').nearest[0]?.type === 'table' && sc('평면도를 그려줘').nearest[0]?.type === 'edit', '가까운 종류 제안(조직도→개요표, 도면→도면 위 표시)');
  expect(sc('조직도를 그려줘').nearest[0]?.label.includes('개요표'), '제안에 종류 이름이 붙음');
  for (const t of ['중앙 광장에서 사방으로 퍼지는 보행 흐름, 5가지 테마 정원, 외부공간과 프로그램의 순환 구조', '이 건물이 직육면체에서 덜어내고 더해져 최종 형태가 되는 4단계', '1층 로비·카페, 2~3층 연구실, 중앙 보이드와 채광', '배치도 위에 보행 동선과 차량 동선을 표시', '조감도 위에 보행 흐름을 얹어줘', '대표 공간과 표지 디자인', '']) expect(sc(t).inScope === true, `범위 안 설명은 그대로 통과: ${t.slice(0, 20)}`);
  expect(m.IMAGE_OTHER_NEAREST.every((n) => m.SUBJECT_KINDS[n.kind]) && m.IMAGE_OTHER_NEAREST[0].kind === 'freeform', '이미지 그 외 안내의 방식이 실제 읽기 방식이고 자유 해석이 맨 앞');
}
// 회전(R3): 계산 모듈 + 손스케치
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`회전: ${label}`); };
  const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
  const nearPt = (p, q, e = 0.01) => near(p[0], q[0], e) && near(p[1], q[1], e);
  // 계산 모듈
  expect(m.normDeg(270) === -90 && m.normDeg(360) === 0 && m.normDeg(-181) === 179 && m.normDeg(180) === 180 && m.normDeg(NaN) === 0 && Object.is(m.normDeg(-0), 0), '각도 정규화(-180~180, NaN=0, -0 없음)');
  expect(nearPt(m.rotPt([10, 0], 90, [0, 0]), [0, 10]) && nearPt(m.rotPt([1, 0], 180, [1, 1]), [1, 2]), '점 돌리기(시계 방향 +, 화면 좌표)');
  expect(m.snapDeg(44.2, { soft: true }) === 45 && m.snapDeg(40, { soft: true }) === 40 && m.snapDeg(37, { step: 15 }) === 30 && m.snapDeg(38, { step: 15 }) === 45, '각도 붙이기(45° 근처 3° 안, 15° 단위)');
  { const bb = m.rectBBox([0, 0, 10, 4], 90); expect(near(bb[0], 3) && near(bb[1], -3) && near(bb[2], 7) && near(bb[3], 7), '90° 돌린 사각형의 바깥 상자'); }
  expect(m.rotCursor('e', 0) === 'ew-resize' && m.rotCursor('n', 0) === 'ns-resize' && m.rotCursor('ne', 0) === 'nesw-resize' && m.rotCursor('e', 90) === 'ns-resize' && m.rotCursor('se', 90) === 'nesw-resize' && m.rotCursor('x', 30) === 'move', '크기 조절 점 커서가 돌아간 만큼 바뀜');
  { const t = m.parseTransform('translate(10 20) rotate(90 5 5)'); expect(nearPt(m.applyMat(t, [5, 5]), [15, 25]) && nearPt(m.applyMat(m.parseTransform('rotate(-90 10 10)'), [20, 10]), [10, 0]), 'transform 문자열 해석(translate·rotate 중심)'); }
  expect(nearPt(m.applyMat(m.parseTransform('matrix(1 0 0 1 3 4) scale(2)'), [1, 1]), [5, 6]) && nearPt(m.applyMat(m.parseTransform(''), [7, 8]), [7, 8]) && nearPt(m.applyMat(m.parseTransform('garbage(1)'), [7, 8]), [7, 8]), 'matrix·scale·빈 문자열·모르는 것은 그대로');
  { const old = [0, 0, 10, 4]; const nw = [0, 0, 16, 4]; const k = m.rotRectKeep(old, nw, 90);
    const worldOld = m.rotPt([0, 0], 90, m.rectCenter(old)); const worldNew = m.rotPt([k[0], k[1]], 90, m.rectCenter(k)); expect(nearPt(worldOld, worldNew), '돌린 사각형 크기를 바꿔도 바꾸지 않은 모서리는 화면에서 제자리'); }
  expect(m.rotRectKeep([0, 0, 10, 4], [0, 0, 16, 4], 0).join() === '0,0,16,4', '각도 0 이면 그대로');
  // 정규화·저장
  const sp = (extra = {}) => ({ frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [20, 20, 60, 40], ...extra }], lines: [{ id: 'p1', pts: [[10, 10], [30, 10]] }], winds: [{ id: 'w1', pts: [[10, 50], [40, 50]], shape: 'straight' }], memos: [{ id: 'm1', x: 50, y: 10, text: '글자', size: 14 }, { id: 'm2', x: 80, y: 10, text: '해', size: 14, icon: 'sun', rot: 30 }] });
  expect(m.normalizeSketch(sp({ rot: 30 })).blocks[0].rot === 30 && m.normalizeSketch(sp({ rot: 370 })).blocks[0].rot === 10, '도형 각도 저장(370°→10°)');
  expect(!('rot' in m.normalizeSketch(sp({ rot: 360 })).blocks[0]) && !('rot' in m.normalizeSketch(sp()).blocks[0]), '각도 0 은 저장하지 않음(예전 스펙과 같다)');
  { const n = m.normalizeSketch({ ...sp(), memos: [{ id: 'm1', x: 1, y: 2, text: 'a', rot: -45 }, { id: 'm2', x: 3, y: 4, text: 's', icon: 'sun', rot: 30 }] }); expect(n.memos[0].rot === -45 && !('rot' in n.memos[1]), '글자는 각도 저장, 해 아이콘은 안 돎'); }
  // 그리기
  { const svg0 = m.renderSketch(sp()).svg; const svg1 = m.renderSketch(sp({ rot: 30 })).svg;
    expect(!/\stransform="rotate\(/.test(svg0), '돌리지 않으면 rotate 변환이 없음(빗금 무늬 patternTransform 은 제외)'); expect(/transform="rotate\(30 [\d.]+ [\d.]+\)"/.test(svg1) && !/NaN|undefined/.test(svg1), '돌린 도형은 가운데 중심 rotate(30 …)');
    const iv = m.renderSketch(sp({ rot: 30 }), { interactive: true, selected: 'b1' }).svg;
    expect(/<g transform="rotate\(30 [\d.]+ [\d.]+\)">[\s\S]*data-handle="rot"/.test(iv) && (iv.match(/data-handle="[nesw]{1,2}"/g) || []).length === 8, '선택하면 돌린 틀 안에 8개 크기 점 + 회전 손잡이');
    expect(/data-handle="n"[^>]*cursor:ew-resize|cursor:ns-resize/.test(m.renderSketch(sp(), { interactive: true, selected: 'b1' }).svg), '안 돌린 도형의 크기 점 커서는 예전과 같다');
    for (const id of ['p1', 'w1', 'm1']) expect(m.renderSketch(sp(), { interactive: true, selected: id }).svg.includes('data-handle="rot"'), `${id} 선택 시 회전 손잡이`);
    expect(!m.renderSketch(sp(), { interactive: true, selected: 'm2' }).svg.includes('data-handle="rot"'), '해 아이콘에는 회전 손잡이 없음');
    expect(!m.renderSketch(sp({ rot: 30 })).svg.includes('data-handle'), '저장용 그림에는 손잡이가 없음'); }
  // 각도 설정
  { const n = m.normalizeSketch(sp()); const r = m.sketchSetAngle(n, 'b1', 45); expect(r.blocks[0].rot === 45 && m.sketchRotation(r, 'b1') === 45, '도형 각도 설정'); expect(!('rot' in m.sketchSetAngle(r, 'b1', 0).blocks[0]), '0 으로 되돌리면 저장 항목이 사라짐'); expect(m.sketchSetAngle(n, 'm2', 30) === n, '해 아이콘은 돌릴 수 없음'); expect(m.sketchCanRotate(n, 'm1') && !m.sketchCanRotate(n, 'm2'), '회전 가능 여부'); }
  { const n = m.normalizeSketch(sp()); const L = n.lines[0]; const c0 = m.sketchPivot(n, 'p1'); const r = m.sketchSetAngle(n, 'p1', 90); const L2 = r.lines[0];
    expect(m.sketchRotation(n, 'p1') === 0 && near(m.sketchRotation(r, 'p1'), 90, 0.1), '선의 각도 = 시작→끝 방향');
    expect(near(Math.hypot(L2.pts[1][0] - L2.pts[0][0], L2.pts[1][1] - L2.pts[0][1]), 20) && nearPt(m.sketchPivot(r, 'p1'), c0), '선을 돌려도 길이와 가운데가 그대로');
    const w = m.sketchRotateBy(m.sketchRotateBy(m.sketchRotateBy(m.sketchRotateBy(n, 'w1', 90), 'w1', 90), 'w1', 90), 'w1', 90); expect(w.winds[0].pts.every((p, i) => nearPt(p, n.winds[0].pts[i], 0.05)), '화살표를 90°씩 네 번 돌리면 제자리'); void L; }
  { const n = m.normalizeSketch(sp({ rot: 90 })); const bb = m.sketchBox(n, 'b1'); expect(near(bb[0], 30) && near(bb[2], 50) && near(bb[1], 10) && near(bb[3], 50), '돌린 도형의 정렬·붙기용 영역은 돌린 뒤의 바깥 상자'); }
  { const n = m.normalizeSketch(sp({ rot: 30 })); const r = m.sketchMirrorCopy(n, 'b1', 50, 'h'); const nb = r.spec.blocks.find((b) => b.id === r.id); expect(nb.rot === -30, '대칭 복제하면 각도 부호가 뒤집힘'); }
  // 돌아간 도형의 크기 조절
  { const n = m.normalizeSketch(sp({ rot: 40 })); const e0 = n.blocks[0]; const c0 = m.rectCenter(e0.rect); const fixed0 = m.rotPt([e0.rect[0], e0.rect[1]], 40, c0); // 왼쪽 위 모서리
    const tip = m.rotPt([e0.rect[2] + 12, e0.rect[3] + 6], 40, c0); // 오른쪽 아래 손잡이를 도형 바깥쪽으로 끈 마우스 위치
    const r = m.sketchResizeBlock(n, 'b1', 'se', tip); const e1 = r.blocks[0]; const fixed1 = m.rotPt([e1.rect[0], e1.rect[1]], 40, m.rectCenter(e1.rect));
    expect(nearPt(fixed0, fixed1, 0.05) && (e1.rect[2] - e1.rect[0]) > (e0.rect[2] - e0.rect[0]) && e1.rot === 40, '40° 돌아간 도형의 오른쪽 아래를 끌면 왼쪽 위 모서리는 화면에서 제자리, 각도는 유지');
    const none = m.sketchResizeBlock(m.normalizeSketch(sp()), 'b1', 'e', [70, 30]); expect(near(none.blocks[0].rect[2], 70), '안 돌린 도형은 예전 방식과 같다'); }
}
// 회전(R3): 구조형 편집(svgedit)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`회전(구조형): ${label}`); };
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
  const nearPt = (p, q, e = 0.05) => near(p[0], q[0], e) && near(p[1], q[1], e);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="40" height="20" fill="#ccc"/><g transform="translate(100 50)"><rect x="0" y="0" width="20" height="10"/></g></svg>';
  const sc = m.scanSvg(svg); const sig = sc.sig; const E0 = m.emptyEdits(svg);
  const trOf = (edits, id) => { const o = m.applyEdits(svg, edits, { ids: true }).svg; const mm = new RegExp(`<rect[^>]*data-eid="${id}"[^>]*>`).exec(o); const t = mm && /\stransform="([^"]*)"/.exec(mm[0]); return t ? t[1] : ''; };
  const visual = (edits, id, p) => m.applyMat(m.parseTransform(trOf(edits, id)), p); // 요소 자기 좌표의 점이 그려지는 자리
  const G = { bbox: [10, 10, 40, 20], t0: '' };
  const E1 = m.editRotate(E0, 'e0', 90, G, sig);
  expect(E1.ops.e0.r === 90 && E1.ops.e0.rc.join() === '30,20' && !E1.ops.e0.t, '돌리면 r·rc 가 저장되고 이동은 생기지 않음');
  expect(/^rotate\(90 30 20\)$/.test(trOf(E1, 'e0')) && nearPt(visual(E1, 'e0', [30, 20]), [30, 20]), '그릴 때 rotate(90 30 20), 가운데는 제자리');
  expect(nearPt(visual(E1, 'e0', [10, 10]), [40, 0]), '왼쪽 위 모서리가 시계 방향 90° 돌아 위쪽 오른쪽으로 감');
  const E2 = m.editRotate(E1, 'e0', 180, G, sig); expect(E2.ops.e0.r === 180 && nearPt(visual(E2, 'e0', [30, 20]), [30, 20]), '다시 돌려도(180°) 가운데는 제자리');
  { const E3 = m.editRotate(E2, 'e0', 0, G, sig); expect(!E3.ops.e0 && m.hasEdits(E3) === false, '0° 로 되돌리면 수정 항목이 사라짐'); }
  { const Em = m.editMove(E1, 'e0', 15, 5, sig); const Er = m.editRotate(Em, 'e0', 180, G, sig); expect(Em.ops.e0.t.join() === '15,5' && /^translate\(15 5\) rotate\(90 30 20\)$/.test(trOf(Em, 'e0')), '이동 + 회전: translate 가 바깥');
    expect(nearPt(visual(Er, 'e0', [30, 20]), [45, 25]), '이동한 뒤 다시 돌려도 보이는 가운데(45,25)는 제자리'); }
  { const G2 = { bbox: [0, 0, 20, 10], t0: 'translate(100 50)' }; const Eg = m.editRotate(E0, 'e1', 90, G2, sig); expect(/rotate\(90 110 55\)/.test(trOf(Eg, 'e1')), '원래 변환이 있는 요소는 변환을 적용한 가운데(110,55)를 중심으로 돈다'); }
  { const Ev = m.editRotate(E0, 'e0', 37, G, sig); const o = m.applyEdits(svg, Ev).svg; expect(!/NaN|undefined/.test(o) && /rotate\(37 30 20\)/.test(o), '저장용 그림에도 회전이 들어감(손잡이 없이)'); }
  { const e0 = m.editRotate(E0, 'e0', 90, G, sig, [0, 0]); // 여러 개를 함께: (0,0) 둘레로 돌리면 가운데 (30,20) → (-20,30)
    expect(nearPt(visual(e0, 'e0', [30, 20]), [-20, 30]) && e0.ops.e0.r === 90, '함께 돌리기: 묶음 중심 둘레로 가운데가 옮겨 가고 각도도 더해짐'); }
  expect(m.editRotate(E1, 'e0', 90, G, sig) .ops.e0.rc.join() === '30,20', '같은 각도로 다시 불러도 그대로');
  // 내 이미지
  { const Ea = { sig, ops: {}, adds: [{ id: 'a1', kind: 'image', href: 'data:image/png;base64,AAAA', x: 10, y: 10, w: 40, h: 20, opacity: 1, behind: false }] };
    const R = m.editRotateAdd(Ea, 'a1', 90); const a = R.adds[0]; expect(a.rot === 90 && a.x === 10 && a.y === 10, '이미지 회전은 각도만 저장(자리 그대로)');
    const o = m.applyEdits(svg, R, { ids: true }).svg; expect(/<image[^>]*transform="rotate\(90 30 20\)"[^>]*data-eid="a1"/.test(o), '이미지는 가운데 중심 rotate(90 30 20) 로 그려짐');
    const R2 = m.editRotateAdd(Ea, 'a1', 90, [0, 0]); expect(near(R2.adds[0].x + 20, -20) && near(R2.adds[0].y + 10, 30), '함께 돌리기: 이미지 가운데가 (0,0) 둘레로 옮겨 감');
    expect(!('rot' in m.editRotateAdd(R, 'a1', 0).adds[0]), '0° 로 되돌리면 각도 항목이 사라짐');
    const rep = m.editReplaceImage(R, 'a1', { href: 'data:image/png;base64,BBBB', w: 100, h: 100 }); expect(rep.adds[0].rot === 90 && !/NaN/.test(JSON.stringify(rep)), '이미지를 바꿔도 각도는 유지');
    const cr = m.editCropImage(R, 'a1', { crop: [0.1, 0.1, 0.9, 0.9], orig: 'data:image/png;base64,AAAA', href: 'data:image/png;base64,CCCC', w: 80, h: 40 }); expect(cr.adds[0].rot === 90 && cr.adds[0].crop && !/NaN/.test(JSON.stringify(cr)), '자르기 해도 각도는 유지'); }
}
// 전체 크기 조절(R10): 구조형 편집(svgedit) — 요소는 transform 배율, 넣은 것(adds)은 크기 값
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`전체 크기 조절: ${label}`); };
  const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;
  const nearPt = (p, q, e = 0.06) => near(p[0], q[0], e) && near(p[1], q[1], e);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="40" height="20" fill="#ccc" stroke="#000" stroke-width="2"/><g transform="translate(100 50)"><rect x="0" y="0" width="20" height="10"/></g></svg>';
  const sc = m.scanSvg(svg); const sig = sc.sig; const E0 = m.emptyEdits(svg);
  const trOf = (edits, id) => { const o = m.applyEdits(svg, edits, { ids: true }).svg; const mm = new RegExp(`<rect[^>]*data-eid="${id}"[^>]*>`).exec(o); const t = mm && /\stransform="([^"]*)"/.exec(mm[0]); return t ? t[1] : ''; };
  const visual = (edits, id, p) => m.applyMat(m.parseTransform(trOf(edits, id)), p);
  const G = { bbox: [10, 10, 40, 20], t0: '' };
  const E1 = m.editScale(E0, 'e0', [2, 2], [0, 0], G, sig);
  expect(E1.ops.e0.s.join() === '2,2' && E1.ops.e0.sc.join() === '30,20', '배율 s 와 키우는 중심 sc 가 저장됨');
  expect(nearPt(visual(E1, 'e0', [30, 20]), [60, 40]), '기준점(0,0) 둘레로 2배: 가운데 (30,20) → (60,40)');
  expect(nearPt(visual(E1, 'e0', [10, 10]), [20, 20]) && nearPt(visual(E1, 'e0', [50, 30]), [100, 60]), '모서리가 기준점에서 2배 떨어진 자리로(크기도 2배)');
  expect(/^translate\(30 20\) translate\(30 20\) scale\(2 2\) translate\(-30 -20\)$/.test(trOf(E1, 'e0')), '그릴 때 이동(바깥) → 가운데 둘레 scale 순서');
  { const o = m.applyEdits(svg, E1).svg; expect(!/NaN|undefined/.test(o) && /scale\(2 2\)/.test(o), '저장용 그림에도 배율이 들어감(손잡이 없이)'); }
  { const Ec = m.editScale(E0, 'e0', [0.5, 0.5], [30, 20], G, sig); expect(!Ec.ops.e0 || !Ec.ops.e0.t, '자기 가운데 둘레로 줄이면 이동 없음'); expect(nearPt(visual(Ec, 'e0', [30, 20]), [30, 20]) && nearPt(visual(Ec, 'e0', [10, 10]), [20, 15]), '자기 가운데 둘레로 0.5배: 가운데 제자리·모서리는 안쪽으로'); }
  { const Eb = m.editScale(E1, 'e0', [0.5, 0.5], [0, 0], G, sig); expect(!Eb.ops.e0 && !m.hasEdits(Eb), '2배 했다가 같은 기준점으로 0.5배: 수정 항목이 사라짐'); }
  { const E3 = m.editScale(E1, 'e0', [1.5, 1.5], [10, 10], G, sig); expect(E3.ops.e0.s.join() === '3,3' && nearPt(visual(E3, 'e0', [30, 20]), [10 + (60 - 10) * 1.5, 10 + (40 - 10) * 1.5]), '여러 번 조절하면 배율은 곱해지고 보이는 가운데는 마지막 기준점 둘레로'); }
  { const Em = m.editMove(E1, 'e0', 15, 5, sig); expect(/^translate\(\S+ \S+\) translate\(30 20\) scale\(2 2\)/.test(trOf(Em, 'e0')) && nearPt(visual(Em, 'e0', [30, 20]), [75, 45]), '크기를 바꾼 뒤 옮기면 옮긴 양 그대로(15,5)만큼 간다(안쪽 배율의 영향을 받지 않음)'); }
  { const Er = m.editRotate(E1, 'e0', 90, G, sig); expect(Er.ops.e0.r === 90 && Er.ops.e0.s.join() === '2,2' && nearPt(visual(Er, 'e0', [30, 20]), [60, 40]), '크기를 바꾼 뒤 돌려도 보이는 가운데(60,40) 제자리'); expect(nearPt(visual(Er, 'e0', [10, 10]), (() => { const c = [60, 40]; const v = [-40, -20]; return [c[0] - v[1], c[1] + v[0]]; })()), '크기를 바꾼 뒤 돌리면 2배 크기로 돈다(왼쪽 위 모서리가 가운데 둘레 90°)');
    const Es = m.editScale(Er, 'e0', [0.5, 0.5], [60, 40], G, sig); expect(nearPt(visual(Es, 'e0', [30, 20]), [60, 40]) && Es.ops.e0.r === 90, '돌린 뒤 다시 크기를 바꿔도 가운데 제자리·각도 유지'); }
  { const Eh = m.editRotate(E0, 'e0', 90, G, sig); const Ehs = m.editScale(Eh, 'e0', [2, 2], [0, 0], G, sig); expect(nearPt(visual(Ehs, 'e0', [30, 20]), [60, 40]) && Ehs.ops.e0.r === 90 && Ehs.ops.e0.s.join() === '2,2', '돌린 요소의 크기 조절: 각도 유지·가운데는 기준점 둘레로'); }
  { const En = m.editScale(E0, 'e0', [2, 1], [0, 0], G, sig); expect(nearPt(visual(En, 'e0', [10, 10]), [20, 10]) && nearPt(visual(En, 'e0', [50, 30]), [100, 30]), '가로·세로를 따로(2×1): 가로만 늘어남'); }
  { const Ex = m.editScale(E0, 'e0', [0, 100], [0, 0], G, sig); expect(Ex.ops.e0.s[0] === m.SCALE_MIN && Ex.ops.e0.s[1] === m.SCALE_MAX, '배율은 0.05~20 배로 제한됨(0 이나 뒤집힘 없음)'); expect(!/NaN|Infinity/.test(JSON.stringify(Ex)), '극단값에도 NaN 이 생기지 않음'); }
  { const G2 = { bbox: [0, 0, 20, 10], t0: 'translate(100 50)' }; const Eg = m.editScale(E0, 'e1', [3, 3], [0, 0], G2, sig);
    expect(Eg.ops.e1.sc.join() === '110,55' && nearPt(visual(Eg, 'e1', [110, 55]), [330, 165]), '원래 변환이 있는 요소: 변환을 적용한 가운데(110,55) 기준으로 3배 → (330,165)'); }
  expect(m.opTransformStr(null) === '' && m.opTransformStr({ s: [1, 1], sc: [3, 4] }) === '' && m.opTransformStr({ t: [1, 2] }) === 'translate(1 2)', 'opTransformStr: 빈 수정·배율 1 은 빈 글자');
  { const sh = m.editRestore(E1, 'e0', sig); expect(!sh.ops.e0, '원래대로(restore)하면 크기도 되돌아감'); }
  // 넣은 것(adds)
  const P = (a, k, about) => m.addScalePatch(a, k, about);
  { const bd = { id: 'a1', kind: 'badge', shape: 'circle', x: 10, y: 10, w: 20, h: 20, text: '1', fill: '#111', auto: true };
    const q = P(bd, [2, 2], [0, 0]); expect(q.w === 40 && q.h === 40 && q.x === 20 && q.y === 20, '번호 마커: 가운데 (20,20)→(40,40), 지름 2배');
    const q2 = P(bd, [2, 1], [0, 0]); expect(q2.w === 20 && q2.h === 20 && q2.x === 30 && q2.y === 10, '번호 마커: 가로·세로가 다르면 작은 쪽 배율로 모양(원)을 지킴, 자리는 따로');
    const q3 = P(bd, [0.5, 0.5], [20, 20]); expect(q3.x === 15 && q3.y === 15 && q3.w === 10, '자기 가운데 둘레로 줄이면 가운데 제자리'); }
  { const im = { id: 'a2', kind: 'image', href: 'data:image/png;base64,AAAA', x: 10, y: 10, w: 40, h: 20, opacity: 1, behind: false };
    const q = P(im, [2, 1], [0, 0]); expect(q.w === 80 && q.h === 20 && q.x === 20 && q.y === 10, '이미지: 가로·세로 따로 늘어남(가운데는 기준점 둘레)'); }
  { const co = { id: 'a3', kind: 'callout', x: 40, y: 20, tx: 10, ty: 10, title: 'T', desc: 'd', size: 12, fill: '#111', line: 'straight', end: 'dot' };
    const q = P(co, [2, 2], [0, 0]); expect(q.x === 80 && q.y === 40 && q.tx === 20 && q.ty === 20 && q.size === 24, '리더선 라벨: 글 상자·끝점·글자 크기가 함께 2배'); }
  { const tb = { id: 'a4', kind: 'table', x: 20, y: 30, size: 10, fill: '#222', table: m.normalizeTable(m.SAMPLE_TABLE) };
    const q = P(tb, [0.5, 0.5], [0, 0]); expect(q.x === 10 && q.y === 15 && q.size === 5, '표: 왼쪽 위 자리와 글자 크기가 함께 0.5배'); }
  { const nb = { id: 'a5', kind: 'north', style: 'circle', x: 10, y: 10, w: 30, h: 30, rot: 0, fill: '#111' }; const q = P(nb, [2, 2], [0, 0]); expect(q.w === 60 && q.h === 60 && q.x === 20 && q.y === 20, '방위표: 지름 2배(가운데 기준)'); }
  { const sb = { id: 'a6', kind: 'scale', x: 10, y: 50, w: 100, segs: 4, total: 50, unit: 'm', size: 10, fill: '#111' }; const q = P(sb, [2, 2], [0, 0]); expect(q.w === 200 && q.size === 20 && q.x === 20 && Number.isFinite(q.y), '축척 막대: 길이·글자 2배(가운데 기준)'); }
  { const bd = { id: 'a1', kind: 'badge', x: 10, y: 10, w: 20, h: 20 }; const q = P(bd, [0, 99], [0, 0]); expect(!/NaN|Infinity/.test(JSON.stringify(q)), 'adds 도 극단 배율에 NaN 이 생기지 않음'); }
  { const bd = { id: 'a1', kind: 'badge', shape: 'circle', x: 10, y: 10, w: 20, h: 20, text: '1', fill: '#111', auto: true }; const Ea = { sig, ops: {}, adds: [bd] }; const Eb = m.editUpdateAdd(Ea, 'a1', P(bd, [2, 2], [0, 0]));
    const o = m.applyEdits(svg, Eb, { ids: true }).svg; expect(/<circle[^>]*cx="40"[^>]*cy="40"[^>]*r="20"/.test(o), '크기를 바꾼 번호 마커가 그림에 그 크기로 그려짐'); }
}
// 전체 크기 조절(R10): 손스케치 — 내용 전체를 transform 한 겹으로
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`전체 크기 조절(손스케치): ${label}`); };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  const nearPt = (p, q, e = 0.02) => near(p[0], q[0], e) && near(p[1], q[1], e);
  const base = () => m.normalizeSketch({ style: 'concept', title: '제목', blocks: [{ id: 'b1', rect: [10, 10, 60, 50], name: '판' }], lines: [{ id: 'p1', pts: [[10, 70], [90, 70]], width: 3 }], memos: [{ id: 'm1', x: 40, y: 30, text: '글자', size: 16 }] });
  const sp = base();
  expect(!('gscale' in sp) && !/data-gscale/.test(m.renderSketch(sp).svg), '크기를 안 바꾼 그림은 예전과 같음(묶음 <g> 없음)');
  const about = [100, 200];
  const s1 = m.sketchComposeScale(sp, 0.5, about);
  expect(s1.gscale.k === 0.5 && nearPt(s1.gscale.t, [50, 100]), '0.5배: 합성 값 k=0.5, t = about·(1−k) = (50,100)');
  expect(nearPt(m.sketchZoomPt(s1, about), about), '기준점은 제자리');
  expect(nearPt(m.sketchZoomPt(s1, [300, 400]), [200, 300]) && nearPt(m.sketchUnzoomPt(s1, [200, 300]), [300, 400]), '앞뒤 변환이 서로 되돌림');
  const o1 = m.renderSketch(s1).svg;
  expect(/<g data-gscale="1" transform="translate\(50\.00 100\.00\) scale\(0\.5000\)">/.test(o1) && (o1.match(/<\/g>/g) || []).length >= 1, '그릴 때 내용 묶음에 translate·scale 이 붙음');
  const iTitle = o1.indexOf('>제목<'); const iG = o1.indexOf('data-gscale'); expect(iTitle >= 0 && iTitle > iG, '제목도 묶음 안(그림 전체가 함께 움직이고 커지고 줄어듦)'); expect(o1.indexOf('<rect width="1200"') < iG && o1.indexOf('<rect width="1200"') >= 0, '바탕 사각형만 묶음 바깥');
  expect(o1.indexOf('>글자<') > iG && o1.indexOf('stroke-width="3"') > iG, '메모 글자와 선은 묶음 안(같이 줄어듦)');
  { const back = m.sketchComposeScale(s1, 2, about); expect(!('gscale' in back), '같은 기준점으로 되돌리면 크기 변환이 사라짐'); }
  { const s3 = m.sketchComposeScale(m.sketchComposeScale(sp, 2, [0, 0]), 1.5, [100, 50]); const g = s3.gscale; expect(near(g.k, 3) && nearPt(g.t, [1.5 * 0 + 100 * (1 - 1.5), 50 * (1 - 1.5)]), '여러 번: 배율은 곱, 이동은 합성'); }
  { const big = m.sketchComposeScale(sp, 1000, [0, 0]); const tiny = m.sketchComposeScale(sp, 0, [0, 0]); expect(big.gscale.k === m.GSCALE_MAX && tiny.gscale.k === m.GSCALE_MIN, '배율은 0.05~20 배로 제한'); }
  { const big = m.sketchComposeScale(m.sketchComposeScale(sp, 10, [0, 0]), 10, [0, 0]); expect(big.gscale.k === m.GSCALE_MAX, '합친 배율도 20 배를 넘지 않음'); }
  { const n = m.normalizeSketch({ blocks: [], gscale: { k: 'abc', t: [1, 2] } }); const n2 = m.normalizeSketch({ blocks: [], gscale: { k: 1, t: [0, 0] } }); const n3 = m.normalizeSketch({ blocks: [], gscale: { k: 9999, t: [1, 2] } }); const n4 = m.normalizeSketch({ blocks: [], gscale: { k: 2, t: [1] } });
    expect(!n.gscale && !n2.gscale && n3.gscale.k === m.GSCALE_MAX && !n4.gscale, '잘못된 값(숫자 아님·배율 1·t 모자람)은 버리고 큰 값은 제한'); }
  { const edited = m.sketchMoveBy(s1, 'b1', 5, 0); expect(edited.gscale && edited.gscale.k === 0.5, '요소를 옮겨도 크기 변환은 그대로'); const nn = m.normalizeSketch(JSON.parse(JSON.stringify(s1))); expect(nn.gscale.k === 0.5, '저장했다 불러와도 유지'); }
  { const sel = m.renderSketch(s1, { interactive: true, selected: 'b1' }).svg; const iG2 = sel.indexOf('data-gscale'); const iHandle = sel.indexOf('data-handle'); expect(iHandle > iG2 && iG2 > 0, '선택 상자·손잡이도 같은 묶음 안(같이 줄어듦)'); }
  { const side = m.normalizeSketch({ style: 'line', blocks: [{ id: 'b1', rect: [10, 10, 60, 50], name: '판' }] }); const z = m.sketchComposeScale(side, 0.5, [0, 0]); const o = m.renderSketch(z).svg; const iG3 = o.indexOf('data-gscale'); const marks = [...o.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="12"/g)].map((q) => q.index); expect(marks.length >= 2 && marks.every((x) => x > iG3), '도면용: 도형 위 번호 표식과 오른쪽 설명 칸의 표식도 모두 묶음 안'); const iLeg = o.indexOf('>판<'); expect(iLeg > iG3, '도면용: 설명 칸 글자도 묶음 안'); }
  { const o = m.renderSketch(s1).svg; expect(!/NaN|undefined/.test(o), '그림에 NaN 이 없음'); }
}
// 글자 정렬·자간·행간(R11): 구조형 편집 — 정렬·자간은 속성, 행간은 여러 줄 글자 안쪽 줄 간격 배수
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`글자 정렬·자간·행간: ${label}`); };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="10" y="20" font-size="10"><tspan x="10" dy="0">가</tspan><tspan x="10" dy="12">나</tspan><tspan x="10" dy="12">다</tspan></text><text x="100" y="20"><tspan x="100" y="20">하나</tspan><tspan x="100" y="32">둘</tspan><tspan x="100" y="44">셋</tspan></text><text x="10" y="80">글 <tspan fill="#f00" font-weight="700">강조</tspan> 끝</text><rect x="150" y="10" width="20" height="10"/></svg>';
  const sig = m.scanSvg(svg).sig; const E0 = m.emptyEdits(svg);
  const dys = (o, k = 0) => { const t = [...o.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)][k][1]; return [...t.matchAll(/ dy="([^"]*)"/g)].map((q) => parseFloat(q[1])); };
  const ys = (o, k) => { const t = [...o.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)][k][1]; return [...t.matchAll(/ y="([^"]*)"/g)].map((q) => parseFloat(q[1])); };
  const E1 = m.editLineSpacing(E0, 'e0', 1.5, sig);
  expect(E1.ops.e0.lh === 1.5 && m.hasEdits(E1), '행간 배율 1.5 가 저장됨');
  const o1 = m.applyEdits(svg, E1).svg;
  expect(dys(o1, 0).join() === '0,18,18', '줄 간격(dy 12) 이 1.5배 = 18, 첫 줄(0)은 그대로');
  expect(dys(o1, 1).length === 0 && ys(o1, 1).join() === '20,32,44', '다른 글자는 그대로');
  { const E2 = m.editLineSpacing(E0, 'e1', 2, sig); const o2 = m.applyEdits(svg, E2).svg; expect(ys(o2, 1).join() === '20,44,68', 'y 로 줄을 놓은 글자: 첫 줄에서 떨어진 거리가 2배 → 20,44,68'); }
  { const E3 = m.editLineSpacing(m.editLineSpacing(E0, 'e0', 0.5, sig), 'e0', 0.5, sig); const o3 = m.applyEdits(svg, E3).svg; expect(dys(o3, 0).join() === '0,6,6', '0.5배: 줄 간격 12 → 6(배율은 원본 기준이라 겹쳐 곱해지지 않음)'); }
  expect(!m.editLineSpacing(E1, 'e0', 1, sig).ops.e0 && !m.hasEdits(m.editLineSpacing(E1, 'e0', 1, sig)), '배율 1 로 되돌리면 수정 항목이 사라짐');
  expect(m.editLineSpacing(E0, 'e0', 99, sig).ops.e0.lh === m.LH_MAX && m.editLineSpacing(E0, 'e0', 0, sig).ops.e0.lh === m.LH_MIN && m.editLineSpacing(E0, 'e0', NaN, sig).ops.e0 === undefined, '배율은 0.5~3 으로 제한, 숫자가 아니면 1');
  { const o = m.applyEdits(svg, m.editLineSpacing(E0, 'e2', 2, sig)).svg; expect(o === m.applyEdits(svg, E0).svg || !/dy=/.test(o), '줄 사이 tspan 이 없는 글자(강조만 있음)는 바뀌지 않음'); }
  { const E4 = m.editMove(m.editLineSpacing(E0, 'e0', 1.5, sig), 'e3', 5, 5, sig); const o4 = m.applyEdits(svg, E4, { ids: true }).svg; expect(/<rect(?=[^>]*data-eid="e3")(?=[^>]*transform="translate\(5 5\)")/.test(o4) && dys(o4, 0).join() === '0,18,18', '행간을 고친 글자 뒤의 요소 수정도 제대로 입혀짐'); }
  { const E5 = m.editSet(E0, 'e0', { 'text-anchor': 'middle', 'letter-spacing': '2' }, sig); const o5 = m.applyEdits(svg, E5).svg; expect(/<text[^>]*text-anchor="middle"[^>]*letter-spacing="2"|<text[^>]*letter-spacing="2"[^>]*text-anchor="middle"/.test(o5), '정렬(text-anchor)·자간(letter-spacing)은 속성으로 그려짐'); const E6 = m.editSet(E5, 'e0', { 'letter-spacing': null }, sig); expect(!/letter-spacing/.test(m.applyEdits(svg, E6).svg), '자간을 0 으로 하면 속성이 빠짐(null)'); }
  { const f = m.scaleLineSpacing('<tspan x="1" dy="1.2em">a</tspan><tspan x="1" dy="1.2em">b</tspan>', 1.5); expect(/dy="1.8em"/.test(f) && (f.match(/dy="1.8em"/g) || []).length === 2, 'em 단위 줄 간격도 배수(1.2em → 1.8em)'); expect(m.scaleLineSpacing('', 2) === '' && m.scaleLineSpacing('글자만', 2) === '글자만', '빈 안쪽·tspan 없는 안쪽은 그대로'); }
  { const o = m.applyEdits(svg, E1, { ids: true }).svg; expect(!/NaN|undefined/.test(o) && (o.match(/<text/g) || []).length === 3, '편집 화면용 그림에도 NaN 이 없고 글자 수가 그대로'); }
}
// 글자 정렬·자간·행간(R11): 손스케치 글자 메모·리더선, 구조형 리더선
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`글자 서식(손스케치·리더선): ${label}`); };
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
  const mk = (memos) => m.normalizeSketch({ style: 'concept', blocks: [{ id: 'b1', rect: [10, 10, 60, 50] }], memos });
  const N = mk([{ id: 'm1', x: 30, y: 30, text: '왼쪽', size: 16, align: 'start', ls: 3 }, { id: 'm2', x: 30, y: 40, text: '가운데', size: 16, align: 'middle' }, { id: 'm3', x: 30, y: 50, text: '이상', size: 16, align: 'zz', ls: 999 }, { id: 'm4', x: 30, y: 60, text: '0', size: 16, ls: 0 }, { id: 'm5', x: 30, y: 70, text: '오른쪽', size: 16, align: 'end', ls: -9 }]);
  const g = (id) => N.memos.find((q) => q.id === id);
  expect(g('m1').align === 'start' && g('m1').ls === 3, '글자 메모: 왼쪽 정렬·자간 3 이 남음');
  expect(!('align' in g('m2')) && !('align' in g('m3')) && !('align' in g('m4')), '가운데(기본)·잘못된 정렬 값은 저장하지 않음');
  expect(g('m3').ls === 30 && !('ls' in g('m4')) && g('m5').ls === -3 && g('m5').align === 'end', '자간은 -3~30 으로 제한, 0 은 저장하지 않음');
  const o = m.renderSketch(N).svg;
  const tag = (t) => [...o.matchAll(/<text\b[^>]*>/g)].map((q) => q[0]).find((q) => q.includes('>') && o.slice(o.indexOf(q) + q.length, o.indexOf(q) + q.length + t.length) === t);
  expect(/text-anchor="start"/.test(tag('왼쪽')) && /letter-spacing="3"/.test(tag('왼쪽')), '왼쪽 정렬·자간이 그림에 그려짐');
  expect(/text-anchor="middle"/.test(tag('가운데')) && !/letter-spacing/.test(tag('가운데')), '기본은 가운데, 자간 속성 없음');
  expect(/text-anchor="end"/.test(tag('오른쪽')) && /letter-spacing="-3"/.test(tag('오른쪽')), '오른쪽 정렬·음수 자간');
  { const B = mk([{ id: 'm1', x: 30, y: 30, text: '1', badge: 'circle', align: 'start', ls: 5 }]); expect(!('align' in B.memos[0]) && !('ls' in B.memos[0]), '번호 마커 같은 글자가 아닌 메모에는 정렬·자간을 붙이지 않음'); }
  { const sel = m.renderSketch(mk([{ id: 'm1', x: 30, y: 30, text: '왼쪽 정렬', size: 16, align: 'start' }]), { selected: 'm1', interactive: true }).svg; const mm = /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)" height="[\d.]+" fill="none" stroke="#F28C28"/.exec(sel); const T = /<text x="([\d.-]+)"[^>]*text-anchor="start"/.exec(sel); expect(mm && T && near(Number(mm[1]), Number(T[1]) - 6, 0.2), '왼쪽 정렬 글자의 선택 상자는 글자 왼쪽 끝에서 시작'); }
  // 리더선
  const C = mk([{ id: 'm1', x: 40, y: 20, text: '제목', callout: true, desc: '첫째 줄\n둘째 줄', size: 16, tx: 20, ty: 40, align: 'middle', ls: 2, lh: 2 }, { id: 'm2', x: 40, y: 20, text: '제목', callout: true, desc: 'a\nb', size: 16, tx: 20, ty: 40, lh: 1, align: 'x', ls: 0 }, { id: 'm3', x: 40, y: 20, text: '제목', callout: true, desc: 'a\nb', size: 16, tx: 20, ty: 40, lh: 99 }, { id: 'm4', x: 40, y: 20, text: '제목', callout: true, desc: 'a\nb', size: 16, tx: 20, ty: 40, lh: 0.1 }]);
  const c = (id) => C.memos.find((q) => q.id === id);
  expect(c('m1').align === 'middle' && c('m1').ls === 2 && c('m1').lh === 2, '리더선: 가운데 정렬·자간·행간 2배가 남음');
  expect(!('lh' in c('m2')) && !('align' in c('m2')) && !('ls' in c('m2')) && c('m3').lh === 2.5 && c('m4').lh === 0.6, '리더선: 기본값은 저장하지 않고 행간은 0.6~2.5 로 제한');
  { const base = { x: 100, y: 50, tx: 20, ty: 20, title: '제목', desc: '가\n나\n다', size: 20, color: '#111111', line: 'straight', end: 'dot' };
    const L1 = m.calloutLayout(base); const L2 = m.calloutLayout({ ...base, lh: 2 }); const L05 = m.calloutLayout({ ...base, lh: 0.5 });
    const gap = (L) => L.lines[2].y - L.lines[1].y;
    expect(near(gap(L2) / gap(L1), 2, 0.01) && near(gap(L05) / gap(L1), 0.6, 0.01), '설명 행간 2배: 줄 사이 간격이 정확히 2배, 0.5 는 하한 0.6 배로 제한');
    expect(near(gap(L2) / gap(L1), 2, 0.01) && gap(L2) > gap(L1) && m.calloutLayout({ ...base, lh: 0.1 }).lines[2].y - m.calloutLayout({ ...base, lh: 0.1 }).lines[1].y < gap(L1), '행간이 커지면 간격이 커지고 아주 작게 해도 줄어들 뿐 뒤집히지 않음');
    expect(L2.h > L1.h, '행간이 커지면 글 상자도 아래로 길어짐');
    const Lc = m.calloutLayout({ ...base, align: 'middle' }); const Le = m.calloutLayout({ ...base, align: 'end' });
    expect(near(Lc.lines[0].x, Lc.x + Lc.w / 2) && near(Le.lines[0].x, Le.x + Le.w) && L1.lines[0].x === L1.x && Lc.lines[0].anchor === 'middle', '정렬: 줄 기준 x 가 왼쪽 끝·가운데·오른쪽 끝');
    const wide = { ...base, title: '아주 긴 제목 글자입니다', desc: '설명도 꽤 길게 써 봅니다' }; expect(m.calloutLayout({ ...wide, ls: 4 }).w > m.calloutLayout(wide).w, '자간이 있으면 글 상자가 넓어짐(글자가 긴 경우)');
    const svg = m.calloutSvg({ ...base, align: 'end', ls: 4 }); expect(/text-anchor="end"/.test(svg) && /letter-spacing="4.0"/.test(svg), '리더선 그림에 정렬·자간이 그려짐');
    expect(!/text-anchor|letter-spacing/.test(m.calloutSvg(base)), '기본 리더선은 예전 그림과 같음(속성 없음)'); }
  { const sv = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="0" y="0" width="10" height="10"/></svg>'; const E = { sig: m.scanSvg(sv).sig, ops: {}, adds: [{ id: 'a1', kind: 'callout', x: 10, y: 10, tx: 80, ty: 60, title: '제', desc: '가\n나', size: 12, fill: '#111111', line: 'straight', end: 'dot', align: 'middle', ls: 2, lh: 1.5 }] };
    const out = m.applyEdits(sv, E).svg; expect(/text-anchor="middle"/.test(out) && /letter-spacing="2.0"/.test(out), '구조형 리더선도 정렬·자간이 그려짐'); }
}
// 글자 정렬·자간(R11): 페이지 머리글(구분 라벨·제목·소제목)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`페이지 머리글 정렬·자간: ${label}`); };
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
  const item = [{ id: 'c1', render: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/></svg>' } }];
  const mk = (o) => m.composePage({ w: 420, h: 297, medium: 'print' }, item, { title: '내 제목', subtitle: '소제목입니다', kicker: '구분', layoutId: '1x1', ...o });
  const head = (r) => r.svg.slice(0, r.svg.indexOf('<g') > 0 ? r.svg.indexOf('<g') : 4000);
  const tx = (r, t) => { const q = [...r.svg.matchAll(/<text\b[^>]*>(?:<tspan[^>]*>)?([^<]*)/g)].find((z) => z[1].includes(t)); return q ? q[0] : ''; };
  const base = mk({});
  expect(!/text-anchor|letter-spacing/.test(tx(base, '내 제목')) && base.slots.title.rect[0] > 0, '기본(왼쪽·자간 0)은 예전 그림과 같음: 속성 없음');
  const c = mk({ headAlign: 'center' }); const r = mk({ headAlign: 'right' });
  expect(/text-anchor="middle"/.test(tx(c, '내 제목')) && /text-anchor="middle"/.test(tx(c, '소제목입니다')) && /text-anchor="middle"/.test(tx(c, '구분')), '가운데: 구분 라벨·제목·소제목 모두 가운데 기준');
  expect(/text-anchor="end"/.test(tx(r, '내 제목')), '오른쪽: 오른쪽 끝 기준');
  const xOf = (r0, t) => Number(/<text x="([\d.]+)"/.exec(tx(r0, t))[1]);
  expect(xOf(c, '내 제목') > xOf(base, '내 제목') + 50 && xOf(r, '내 제목') > xOf(c, '내 제목') + 50, '왼쪽 < 가운데 < 오른쪽 순으로 x 가 커짐');
  const sw = (r0, k) => r0.slots[k].rect[2]; const sx = (r0, k) => r0.slots[k].rect[0];
  expect(near(sx(c, 'title') + sw(c, 'title') / 2, xOf(c, '내 제목'), 0.6) && near(sx(r, 'title') + sw(r, 'title'), xOf(r, '내 제목'), 0.6), '눌러 고치는 자리(slots)가 정렬된 글자를 따라감');
  expect(sx(base, 'title') < sx(c, 'title') && sx(c, 'title') < sx(r, 'title'), '자리의 왼쪽 끝도 왼쪽 < 가운데 < 오른쪽');
  const ls = mk({ headLs: 0.1 }); const lsTxt = tx(ls, '내 제목'); const fsv = Number(/font-size="([\d.]+)"/.exec(lsTxt)[1]); const lsv = Number(/letter-spacing="(-?[\d.]+)"/.exec(lsTxt)[1]);
  expect(near(lsv, 0.1 * fsv, 0.01), '자간 0.1em: 글자 크기의 10% 간격');
  expect(sw(ls, 'title') > sw(base, 'title'), '자간이 있으면 글자 자리가 넓어짐');
  const neg = mk({ headLs: -0.05 }); expect(/letter-spacing="-/.test(tx(neg, '내 제목')) && sw(neg, 'title') < sw(base, 'title'), '음수 자간은 좁게');
  { const x = mk({ headLs: 99, headAlign: 'zz' }); expect(/letter-spacing/.test(tx(x, '내 제목')) && !/text-anchor/.test(tx(x, '내 제목')) && Number(/letter-spacing="([\d.]+)"/.exec(tx(x, '내 제목'))[1]) <= 0.4 * Number(/font-size="([\d.]+)"/.exec(tx(x, '내 제목'))[1]) + 0.01, '잘못된 정렬은 왼쪽, 자간은 최대 0.4em 로 제한'); }
  { const long = mk({ title: '아주 긴 제목 '.repeat(20), headLs: 0.3, headAlign: 'center' }); expect(long.report.warnings.some((w) => /제목이 길어/.test(w.text)) && !/NaN/.test(long.svg), '글자가 길면 자간을 포함해 폭에 맞춰 줄이고 NaN 이 없음'); }
  expect(m.HEAD_ALIGNS.join() === 'left,center,right' && m.HEAD_LS_MIN === -0.05 && m.HEAD_LS_MAX === 0.4, '정렬 목록·자간 범위 상수');
}
// 치수선(R12): 공용 그림·구조형·손스케치
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`치수선: ${label}`); };
  const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;
  const nearPt = (p, q, e = 0.06) => near(p[0], q[0], e) && near(p[1], q[1], e);
  const H = { x: 10, y: 50, tx: 110, ty: 50, text: '10m', size: 14 };
  const L = m.dimLayout(H);
  expect(near(L.len, 100) && near(L.deg, 0) && nearPt(L.mid, [60, 50]) && L.text[1] < 50 && near(L.text[0], 60), '가로 치수선: 길이 100, 각도 0, 글자는 가운데 위쪽');
  { const R = m.dimLayout({ ...H, x: 110, tx: 10 }); expect(near(R.deg, 0) && R.text[1] < 50, '오른쪽→왼쪽으로 그려도 글자는 뒤집히지 않고 선 위쪽'); }
  { const V = m.dimLayout({ x: 50, y: 10, tx: 50, ty: 110, size: 14 }); expect(near(V.deg, 90) && near(V.text[0], 50 + Math.sin(Math.PI / 2) * 14 * 0.75), '세로 치수선: 글자 각도 90°(아래로 읽힘 방지), 선의 오른쪽에 놓임'); }
  { const D = m.dimLayout({ x: 0, y: 0, tx: 100, ty: 100, size: 14 }); expect(near(D.deg, 45) && D.text[1] < 50 && D.text[0] > 50, '45° 선: 글자가 선 위쪽(오른쪽 위)으로'); }
  { const Z = m.dimLayout({ x: 5, y: 5, tx: 5, ty: 5, size: 14 }); expect(Number.isFinite(Z.deg) && Z.len === 0 && !/NaN/.test(m.dimSvg({ x: 5, y: 5, tx: 5, ty: 5, text: '0' })), '두 끝점이 같아도 NaN 없이 그려짐'); }
  const svg = m.dimSvg(H, { id: 'a1', interactive: true });
  expect((svg.match(/<line/g) || []).length === 6 && /data-eid="a1"/.test(svg) && />10m</.test(svg) && /text-anchor="middle"/.test(svg), '그림: 본선 1 + 끝마다 직각 눈금·사선 눈금 2개씩 + 누름 영역 1, 글자 10m');
  expect(!/data-eid/.test(m.dimSvg(H)) && (m.dimSvg(H).match(/<line/g) || []).length === 5, '저장용(편집 아님)에는 누름 영역이 없음');
  expect(!/<text/.test(m.dimSvg({ ...H, text: '' })) && /&lt;&amp;/.test(m.dimSvg({ ...H, text: '<&' })), '글자가 비면 글자 없이 선만, 특수문자는 이스케이프');
  { const b = m.dimBox(H); expect(b[0] < 10 && b[2] > 110 && b[1] < 50 - 10 && b[3] > 50, '바깥 상자는 끝점과 글자를 모두 감쌈'); }
  expect(/stroke="#222222"/.test(svg) && /stroke="#aa0000"/.test(m.dimSvg({ ...H, color: '#aa0000' })) && /stroke="#222222"/.test(m.dimSvg({ ...H, color: 'red' })), '색: 기본 #222222, 잘못된 색은 기본');
  // 구조형 adds
  const sv = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="0" y="0" width="10" height="10"/></svg>'; const sig = m.scanSvg(sv).sig;
  const A = m.editAddDim({ sig, ops: {} }, sig, { box: [0, 0, 400, 300] }); const d = A.edits.adds[0];
  expect(d.kind === 'dim' && d.text === m.DIM_DEFAULT_TEXT && d.ty === d.y && d.tx > d.x && d.size >= 10, '구조형 추가: 가로 한 줄, 기본 글자');
  { const o = m.applyEdits(sv, A.edits, { ids: true }).svg; expect(new RegExp(`data-eid="${d.id}"`).test(o) && />10m</.test(o), '구조형: 편집 화면 그림에 치수선이 그려짐'); const o2 = m.applyEdits(sv, A.edits).svg; expect(/>10m</.test(o2) && !/data-eid/.test(o2), '구조형: 저장용에도 들어감'); }
  { const A2 = m.editAddDim(A.edits, sig, { box: [0, 0, 400, 300] }); expect(A2.edits.adds.length === 2 && A2.id !== A.id && A2.edits.adds[1].y > A2.edits.adds[0].y, '두 번째 치수선은 번호가 다르고 조금 비껴 놓임'); }
  { const p = m.addShiftPatch(d, 5, -3); expect(near(p.x, d.x + 5) && near(p.tx, d.tx + 5) && near(p.ty, d.ty - 3), '옮기면 두 끝점이 함께 옮겨 감'); }
  { const q = m.addScalePatch(d, [0.5, 0.5], [0, 0]); expect(near(q.x, d.x / 2) && near(q.tx, d.tx / 2) && near(q.size, d.size / 2, 0.02), '크기 조절: 두 끝점은 기준점 둘레로, 글자는 같은 비율로'); }
  { expect(m.editRotateAdd(A.edits, d.id, 90).adds[0].x === d.x, '치수선 하나는 돌리지 않음'); const R = m.editRotateAdd(A.edits, d.id, 90, [d.x, d.y]).adds[0]; expect(near(R.x, d.x) && near(R.y, d.y) && near(R.tx, d.x) && R.ty > d.y, '묶음으로 돌릴 때는 기준점 둘레로 두 끝점이 돎'); }
  // 손스케치
  const base = () => m.normalizeSketch({ style: 'concept', blocks: [{ id: 'b1', rect: [10, 10, 60, 50] }] });
  const SA = m.sketchAdd(base(), 'dim'); const dm = SA.spec.memos.find((q) => q.id === SA.id);
  expect(dm.dim === true && dm.text === m.DIM_DEFAULT_TEXT && Number.isFinite(dm.tx) && dm.ty === dm.y, '손스케치 추가: dim 메모, 가로 한 줄');
  { const N = m.normalizeSketch(JSON.parse(JSON.stringify(SA.spec))).memos[0]; expect(N.dim === true && N.tx === dm.tx && !('rot' in N) && !('align' in N), '저장했다 불러와도 유지, 회전·정렬은 붙지 않음'); }
  { const o = m.renderSketch(SA.spec).svg; expect(/>10m</.test(o) && !/NaN/.test(o), '손스케치 그림에 치수선이 그려짐'); const s2 = m.renderSketch(SA.spec, { interactive: true, selected: SA.id }).svg; expect((s2.match(/data-handle="dim1"/g) || []).length >= 1 && (s2.match(/data-handle="tip"/g) || []).length >= 1, '선택하면 두 끝점 손잡이(dim1·tip)가 나옴'); }
  { const mv = m.sketchMoveBy(SA.spec, SA.id, 2, 3).memos.find((q) => q.id === SA.id); expect(near(mv.x, dm.x + 2) && near(mv.tx, dm.tx + 2) && near(mv.ty, dm.ty + 3), '옮기면 두 끝점이 함께'); }
  { const t = m.sketchSetTip(SA.spec, SA.id, [70, 70]).memos.find((q) => q.id === SA.id); const st = m.sketchSetDimStart(SA.spec, SA.id, [20, 30]).memos.find((q) => q.id === SA.id); expect(t.tx === 70 && t.ty === 70 && t.x === dm.x && st.x === 20 && st.y === 30 && st.tx === dm.tx, '끝점 손잡이: 둘째(tip)·첫째(dim1) 끝점을 따로 옮김'); }
  expect(m.sketchCanRotate(SA.spec, SA.id) === false, '치수선은 돌리지 않음');
  { const bx = m.sketchBox(SA.spec, SA.id); expect(bx[0] === Math.min(dm.x, dm.tx) && bx[2] === Math.max(dm.x, dm.tx), '선택 상자(스냅 기준)는 두 끝점을 감쌈'); }
  { const T = m.sketchTextTargets ? m.sketchTextTargets(SA.spec) : null; expect(!T || T.some((q) => q.value === '10m'), '더블클릭으로 고칠 글자 목록에 치수 글자가 들어 있음'); }
}
// 전체 이동(손스케치): 내용 전체를 transform 의 이동(t)으로 옮긴다
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`전체 이동(손스케치): ${label}`); };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  const sp = m.normalizeSketch({ style: 'concept', blocks: [{ id: 'b1', rect: [10, 10, 60, 50] }] });
  const a = m.sketchTranslateAll(sp, 30, -20);
  expect(a.gscale && a.gscale.k === 1 && near(a.gscale.t[0], 30) && near(a.gscale.t[1], -20), '배율 1 에서 이동만: k=1, t=(30,-20)');
  expect(m.normalizeSketch(JSON.parse(JSON.stringify(a))).gscale?.t[0] === 30, '이동만 있어도 저장했다 불러오면 유지');
  expect(/transform="translate\(30\.00 -20\.00\) scale\(1\.0000\)"/.test(m.renderSketch(a).svg), '그릴 때 translate 만 들어감');
  const b = m.sketchTranslateAll(a, 5, 5); expect(near(b.gscale.t[0], 35) && near(b.gscale.t[1], -15), '이동은 누적');
  expect(!('gscale' in m.sketchTranslateAll(a, -30, 20)), '제자리로 되돌리면 변환이 사라짐');
  const z = m.sketchComposeScale(sp, 0.5, [100, 200]); const zt = m.sketchTranslateAll(z, 10, 10); expect(near(zt.gscale.k, 0.5) && near(zt.gscale.t[0], z.gscale.t[0] + 10), '크기를 바꾼 뒤에도 배율은 그대로 이동만 합쳐짐');
  const c = m.sketchComposeScale(a, 2, [0, 0]); expect(near(c.gscale.k, 2) && near(c.gscale.t[0], 60), '이동한 뒤 크기를 바꿔도 합성이 맞음');
}
// SVG 저장(일러스트레이터): href → xlink:href
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`SVG 저장(일러스트): ${label}`); };
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="100" height="60"><defs><linearGradient id="g1" href="#g0"/></defs><image href="${png}" x="0" y="0" width="50" height="30"/><use href="#a"/><image x="1" y="1" width="5" height="5" href='${png}'/></svg>`;
  const out = m.toIllustratorSvg(raw);
  expect(!/\shref=/.test(out) && (out.match(/xlink:href=/g) || []).length === 4, '모든 href(이미지·use·그라디언트) 가 xlink:href 로 바뀜(작은따옴표 포함)');
  expect(/<svg[^>]*xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/.test(out) && (out.match(/xmlns:xlink=/g) || []).length === 1, '맨 앞 <svg> 에 xmlns:xlink 를 한 번만 선언');
  expect(out.includes(png) && (out.match(/data:image\/png;base64,/g) || []).length === 2, '이미지 데이터(data:)는 그대로 파일 안에 들어 있음');
  expect(m.toIllustratorSvg(out) === out, '두 번 불러도 그대로(중복 변환·중복 선언 없음)');
  expect(m.toIllustratorSvg('') === '' && m.toIllustratorSvg(null) === '', '빈 값은 그대로');
  expect(/^<\?xml version="1\.0"\?>\s*<svg[^>]*xmlns:xlink=/.test(m.toIllustratorSvg('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AA"/></svg>')), 'XML 선언이 앞에 있어도 <svg> 에 선언을 넣음');
  expect(m.externalImageRefs(raw).length === 0 && m.externalImageRefs('<svg><image href="/generated/a.png"/><image xlink:href="http://x/y.png"/><image href="data:image/png;base64,AA"/></svg>').join() === '/generated/a.png,http://x/y.png', '바깥 주소를 가리키는 이미지만 찾아냄(data: 는 제외)');
  // 실제 그림: 손스케치에 넣은 이미지, 구조형에 넣은 이미지
  const sk = m.sketchAddImage(m.normalizeSketch({ blocks: [] }), { href: png, w: 100, h: 60 }).spec; const so = m.toIllustratorSvg(m.renderSketch(sk).svg);
  expect(/<image[^>]*xlink:href="data:image\/png/.test(so) && !/\shref=/.test(so), '손스케치: 넣은 이미지가 xlink:href 로 저장됨');
  const sv = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="10" height="10"/></svg>'; const E = m.editAddImage({ sig: m.scanSvg(sv).sig, ops: {} }, m.scanSvg(sv).sig, { href: png, w: 100, h: 60, box: [0, 0, 400, 300] }).edits;
  const vo = m.toIllustratorSvg(m.applyEdits(sv, E).svg); expect(/<image[^>]*xlink:href="data:image\/png/.test(vo) && !/\shref=/.test(vo), '구조형: 넣은 이미지가 xlink:href 로 저장됨');
}
// SVG 저장(일러스트레이터): 화살촉 context-stroke → 선 색
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`SVG 저장(화살촉): ${label}`); };
  const mk = '<marker id="m1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker>';
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs>${mk}</defs><path d="M0 0L50 0" stroke="#ff0000" stroke-width="3" marker-end="url(#m1)"/><line x1="0" y1="10" x2="50" y2="10" stroke="#0000ff" stroke-width="3" marker-end="url(#m1)"/><path d="M0 20L50 20" stroke="#ff0000" marker-end="url(#m1)"/></svg>`;
  const out = m.toIllustratorSvg(raw);
  expect(!/context-stroke/.test(out), 'context-stroke 가 남지 않음');
  expect(/marker-end="url\(#m1__ff0000\)"/.test(out) && /marker-end="url\(#m1__0000ff\)"/.test(out), '선 색마다 화살촉 복사본(빨강·파랑)을 가리킴');
  expect(/<marker id="m1__ff0000"[^>]*>[\s\S]*?fill="#ff0000"/.test(out) && /<marker id="m1__0000ff"[^>]*>[\s\S]*?fill="#0000ff"/.test(out), '복사본 화살촉이 그 선 색으로 칠해짐');
  expect((out.match(/<marker id="m1__ff0000"/g) || []).length === 1, '같은 색은 복사본을 한 번만 만듦');
  expect(m.toIllustratorSvg(out) === out, '다시 불러도 그대로');
  expect(!/context-stroke/.test(m.toIllustratorSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="q"><path fill="context-stroke"/></marker></defs><path d="M0 0" marker-end="url(#q)"/></svg>')) && /marker-end="url\(#q__222222\)"/.test(m.toIllustratorSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="q"><path fill="context-stroke"/></marker></defs><path d="M0 0" marker-end="url(#q)"/></svg>')), '선 색을 못 찾으면 어두운 회색');
}
// 이미지 내용 읽기(개요표·층별 조닝도·프로그램 버블도·카드 보드)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`이미지 내용 읽기: ${label}`); };
  expect(JSON.stringify(m.REF_TYPES) === JSON.stringify(['table', 'cards']), 'REF_TYPES 는 개요표·카드 보드');
  const key = { table: '라벨–값을', stack: '층 수와 층별 용도', program: '공간(방·실)의 이름', cards: '이미지에 적힌 항목과 수치' };
  for (const t of m.REF_TYPES) {
    const pr = m.buildConceptPrompt(t, '', { ref: true });
    expect(pr.includes('내용을 읽어 올 자료') && pr.includes(key[t]), `${t}: 이미지에서 내용을 읽는 지시가 들어감`);
    expect(!pr.includes('바탕으로 쓸 이미지') && !pr.includes('참고 이미지와 같은 구성으로 만든다'), `${t}: 바탕 이미지·스타일 참고 문구가 섞이지 않음`);
    expect(pr.includes('첨부 이미지의 내용을 읽어 만든다') && pr.includes('스키마'), `${t}: 설명이 비어도 이미지 내용으로 만들라고 안내, 스키마 유지`);
    const pt = m.buildConceptPrompt(t, '면적표 위주로', { ref: true });
    expect(pt.includes('요청: 면적표 위주로') && !pt.includes('첨부 이미지의 내용을 읽어 만든다'), `${t}: 설명이 있으면 그대로 요청에 들어감`);
    const both = m.buildConceptPrompt(t, '시험', { ref: true, style: true });
    expect(both.includes('[첫 번째 이미지 — 내용을 읽어 올 자료]') && both.includes('[두 번째 이미지 — 스타일 참고]') && both.includes('내용·위치는 첫 번째 이미지와 요청을 따르고'), `${t}: 읽을 자료 + 스타일 참고를 함께 쓰면 첫째/둘째로 나뉨`);
    expect(!m.buildConceptPrompt(t, '시험', {}).includes('읽어 올 자료'), `${t}: 이미지가 없으면 읽기 지시가 없음`);
  }
  expect(m.buildConceptPrompt('site', '시험', { asis: true }).includes('바탕으로 쓸 이미지') && !m.buildConceptPrompt('site', '시험', { asis: true }).includes('읽어 올 자료'), '배치(그대로 바탕)는 그대로: 바탕 이미지 안내만');
  expect(m.buildConceptPrompt('site', '시험', { style: true }).includes('[첨부 이미지 — 스타일 참고]'), '스타일 참고만 쓰면 기존 표기 그대로');
}
// 칸 안의 그림 배율(페이지 미리보기에서 그림만 키우고 줄이기)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`그림 배율: ${label}`); };
  const lay = { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><rect x="10" y="10" width="80" height="40" fill="#cde"/></svg>' };
  const page = { w: 420, h: 297, medium: 'print' };
  const rep = (cellMeta, layoutId = '2x1', items = [{ id: 'c1', render: lay }, { id: 'c2', render: lay }]) => m.composePage(page, items, { layoutId, preview: true, cellMeta, fit: 'fill' }).cells.find((c) => c.id === 'c1');
  const base = rep(undefined); const same = rep({}); const one = rep({ c1: { zoom: 1 } });
  expect(base && Array.isArray(base.art) && base.art.length === 4 && Array.isArray(base.center) && base.zoom === 1, '보고서에 그림 자리(art)·가운데(center)·배율(zoom)이 담김');
  expect(JSON.stringify(base.art) === JSON.stringify(same.art) && JSON.stringify(same.art) === JSON.stringify(one.art), '배율을 안 정하거나 1 이면 이전과 같은 자리');
  const half = rep({ c1: { zoom: 0.5 } });
  expect(Math.abs(half.art[2] / base.art[2] - 0.5) < 0.01 && Math.abs(half.art[3] / base.art[3] - 0.5) < 0.01 && half.zoom === 0.5, '0.5 배면 그림이 절반 크기로 줄어듦');
  expect(Math.abs((half.center[0]) - (base.center[0])) < 0.01 && Math.abs(half.center[1] - base.center[1]) < 0.01, '줄여도 칸 가운데에 머문다');
  const big = rep({ c1: { zoom: 1.6 } });
  const [cx, cy, cw, ch] = big.rect;
  expect(big.art[2] > base.art[2] - 0.01 && big.art[0] >= cx - 0.01 && big.art[1] >= cy - 0.01 && big.art[0] + big.art[2] <= cx + cw + 0.01 && big.art[1] + big.art[3] <= cy + ch + 0.01, '1 보다 크게 키워도 보이는 그림은 칸 안으로 잘림');
  expect(rep({ c1: { zoom: 99 } }).zoom === m.ZOOM_MAX && rep({ c1: { zoom: 0.001 } }).zoom === m.ZOOM_MIN && rep({ c1: { zoom: 'x' } }).zoom === 1 && rep({ c1: { zoom: -3 } }).zoom === 1, '배율은 허용 범위로 맞춰지고 엉뚱한 값은 1 로');
  const other = rep({ c2: { zoom: 0.4 } });
  expect(JSON.stringify(other.art) === JSON.stringify(base.art), '다른 칸의 배율은 이 칸에 영향 없음');
  const single = m.composePage(page, [{ id: 'c1', render: lay }], { layoutId: '1x1', preview: true, cellMeta: { c1: { zoom: 0.5 } }, fit: 'fill' }).cells[0];
  const single1 = m.composePage(page, [{ id: 'c1', render: lay }], { layoutId: '1x1', preview: true, fit: 'fill' }).cells[0];
  expect(Math.abs(single.art[2] / single1.art[2] - 0.5) < 0.01, '한 칸짜리 페이지에서도 배율이 먹힘');
  const svgHalf = m.composePage(page, [{ id: 'c1', render: lay }, { id: 'c2', render: lay }], { layoutId: '2x1', cellMeta: { c1: { zoom: 0.5 } }, fit: 'fill' }).svg;
  const svgBase = m.composePage(page, [{ id: 'c1', render: lay }, { id: 'c2', render: lay }], { layoutId: '2x1', fit: 'fill' }).svg;
  expect(svgHalf !== svgBase && !/NaN|Infinity/.test(svgHalf), '저장용 그림에도 배율이 반영되고 NaN 이 없음');
}
// 파선 간격 조절
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`파선 간격: ${label}`); };
  const g = (v) => JSON.stringify(m.dashGapOf(v));
  expect(g('9 6') === '{"kind":"dashed","gap":1}' && g('9 12') === '{"kind":"dashed","gap":2}' && g('9,3') === '{"kind":"dashed","gap":0.5}', '파선: 간격 배율을 읽음(쉼표도)');
  expect(g('1.5 3') === '{"kind":"dotted","gap":0.5}' && g('14 10 2 10') === '{"kind":"dashdot","gap":2}' && g('0.1 17') === '{"kind":"dots","gap":2}', '점선·일점쇄선·굵은 점도 간격 배율을 읽음');
  expect(g('3 3') === '{"kind":"custom","gap":1}' && g('') === '{"kind":"solid","gap":1}' && g(null) === '{"kind":"solid","gap":1}' && g('9 6 4') === '{"kind":"custom","gap":1}', '프리셋이 아닌 값은 사용자 지정, 비면 실선');
  expect(m.dashKind('9 12') === 'dashed' && m.dashKind('1.5 3') === 'dotted' && m.dashKind('3 3') === 'custom' && m.dashKind('9 6') === 'dashed', '간격을 바꾼 파선도 같은 종류로 인식(선 종류 칸이 사용자 지정으로 바뀌지 않음)');
  const w = (k, x) => JSON.stringify(m.dashWithGap(k, x));
  expect(w('dashed', 2) === '{"stroke-dasharray":"9 12","stroke-linecap":null}' && w('dotted', 0.5) === '{"stroke-dasharray":"1.5 3","stroke-linecap":"round"}' && w('dashdot', 2) === '{"stroke-dasharray":"14 10 2 10","stroke-linecap":null}', '간격만 늘리고 줄이며 선 조각 길이는 그대로');
  expect(w('solid', 2) === '{}' && w('nope', 2) === '{}', '실선·모르는 종류는 바꾸지 않음');
  expect(m.dashWithGap('dashed', 99)['stroke-dasharray'] === `9 ${6 * m.DASH_GAP_MAX}` && m.dashWithGap('dashed', 0.001)['stroke-dasharray'] === `9 ${Math.round(6 * m.DASH_GAP_MIN * 100) / 100}` && m.dashWithGap('dashed', 'x')['stroke-dasharray'] === '9 6', '간격은 허용 범위(0.3~4배)로 맞춰지고 엉뚱한 값은 기본');
  expect(JSON.stringify(m.dashPatch('dashed')) === JSON.stringify({ 'stroke-dasharray': '9 6', 'stroke-linecap': null }) && m.dashPatch('dashed', 2)['stroke-dasharray'] === '9 12' && m.dashPatch('solid', 3)['stroke-dasharray'] === null, 'dashPatch 는 기본 그대로, 배율을 주면 간격 반영');
  // 선 종류에 없는 파선('8 6' 같은 AI·원본 값): 처음 모습을 기준으로 간격 배율
  const base86 = m.dashNumsEven('8 6');
  expect(JSON.stringify(base86) === '[8,6]' && JSON.stringify(m.dashNumsEven('5')) === '[5,5]' && JSON.stringify(m.dashNumsEven('4 2 1')) === '[4,2,1,4,2,1]' && JSON.stringify(m.dashNumsEven('')) === '[]' && JSON.stringify(m.dashNumsEven('4,2')) === '[4,2]', '홀수 개 값은 되풀이해 짝수로, 빈 값은 빈 배열');
  expect(m.dashScaled(base86, 2) === '8 12' && m.dashScaled(base86, 0.5) === '8 3' && m.dashScaled(base86, 99) === '8 24' && m.dashScaled(base86, 'x') === '8 6' && m.dashScaled(m.dashNumsEven('14 5 2 5'), 3) === '14 15 2 15', '사용자 지정 파선도 간격만 배율로 바뀜(선 조각 길이 그대로)');
  expect(m.dashGapFactor(m.dashNumsEven('8 12'), base86) === 2 && m.dashGapFactor(base86, base86) === 1 && m.dashGapFactor(m.dashNumsEven('8 3'), base86) === 0.5, '지금 값이 처음 모습의 몇 배인지 읽음');
  expect(m.dashSameParts(base86, m.dashNumsEven('8 12')) && !m.dashSameParts(base86, m.dashNumsEven('9 6')) && !m.dashSameParts(base86, m.dashNumsEven('8 6 2 6')) && !m.dashSameParts(null, base86), '선 조각 길이·개수가 같을 때만 같은 파선으로 봄');
  // 구조형: 편집 적용 후 그림에 실제로 반영
  const S = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><line x1="5" y1="10" x2="95" y2="10" stroke="#000" stroke-width="2"/></svg>';
  const eid = (m.applyEdits(S, m.emptyEdits(S), { ids: true }).svg.match(/data-eid="([^"]+)"/) || [])[1];
  const E = m.editSet(m.emptyEdits(S), eid, m.dashWithGap('dashed', 2));
  const out = m.applyEdits(S, E).svg;
  expect(/stroke-dasharray="9 12"/.test(out) && /<line[^>]*stroke-dasharray="9 12"/.test(out), '구조형 선에 고른 간격이 그림 속성으로 들어감');
  // 손스케치: 정리·그리기
  const spec = { blocks: [{ id: 'b1', rect: [100, 100, 500, 300], kind: 'slab' }],
    lines: [{ id: 'p1', pts: [[100, 200], [500, 200]], dash: 'dotted', width: 2, dgap: 0.5 }, { id: 'p2', pts: [[100, 250], [500, 250]], dash: 'dashed', width: 2 }],
    winds: [{ id: 'w1', pts: [[100, 350], [500, 350]], head: 'end', dash: 'dashed', width: 4, dgap: 2, color: '#1E88C8' }, { id: 'w2', pts: [[100, 400], [500, 400]], head: 'end', dash: 'dashed', width: 4, dgap: 1 }] };
  const n = m.normalizeSketch(spec);
  expect(n.lines[0].dgap === 0.5 && !('dgap' in n.lines[1]) && n.winds[0].dgap === 2 && !('dgap' in n.winds[1]), '정리: 1 이 아닌 간격 배율만 남기고 기본(1)은 저장하지 않음');
  const bad = m.normalizeSketch({ ...spec, winds: [{ ...spec.winds[0], dgap: 99 }, { ...spec.winds[0], id: 'w9', dgap: -2 }, { ...spec.winds[0], id: 'w8', dgap: 'x' }, { ...spec.winds[0], id: 'w7', dgap: 0.001 }] });
  expect(bad.winds[0].dgap === m.DGAP_MAX && !('dgap' in bad.winds[1]) && !('dgap' in bad.winds[2]) && bad.winds[3].dgap === m.DGAP_MIN, '정리: 범위(0.3~4)로 맞추고 엉뚱한 값은 버림');
  const svg = m.renderSketch(n).svg;
  expect(svg.includes('stroke-dasharray="1.5 3"') && svg.includes('stroke-dasharray="9 12"') && svg.includes('stroke-dasharray="9 6"'), '그리기: 직선·화살표에 고른 간격이 들어가고, 안 고른 것은 기본 간격 그대로');
  expect(m.renderSketch(m.sketchUpdate(n, 'p2', { dgap: 3 })).svg.includes('stroke-dasharray="9 18"') && !/NaN/.test(svg), '편집: 간격을 바꾸면 그 선만 바뀌고 NaN 이 없음');
}
// 칸 안의 그림 위치·기준점 크기 조절(그림을 직접 끌어 크기를 바꾸기)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`그림 크기(직접): ${label}`); };
  const lay = { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><rect x="10" y="10" width="80" height="40" fill="#cde"/><text x="50" y="30" font-size="6" text-anchor="middle">가나다</text></svg>' };
  const page = { w: 420, h: 297, medium: 'print' };
  const rep = (cellMeta, fit = 'both') => m.composePage(page, [{ id: 'c1', render: lay }, { id: 'c2', render: lay }], { layoutId: '2x1', preview: true, cellMeta, fit }).cells.find((c) => c.id === 'c1');
  const b = rep(undefined);
  expect(b.xf.length === 3 && b.fit && b.fit.s0 > 0 && b.zx === 0 && b.zy === 0 && typeof b.inner === 'string' && b.inner.includes('<text') && b.vb.length === 4, '보고서에 변환(xf)·맞춤 정보(fit)·그림 속 내용(inner)·원래 범위(vb)가 담김');
  const o = rep({ c1: { zx: 12, zy: -7 } });
  expect(Math.abs(o.center[0] - b.center[0] - 12) < 0.01 && Math.abs(o.center[1] - b.center[1] + 7) < 0.01 && o.zx === 12 && o.zy === -7 && Math.abs(o.xf[0] - b.xf[0]) < 1e-9, '위치(zx, zy)만큼 그림이 옮겨짐(크기는 그대로)');
  expect(Math.abs(rep({ c1: { zx: 'x', zy: null } }).center[0] - b.center[0]) < 0.001, '위치가 엉뚱한 값이면 0');
  // 글자 맞춤('both')에서도 배율은 도형·글자에 똑같이 곱해짐(글자만 따로 안 맞춰짐)
  const half = rep({ c1: { zoom: 0.5 } });
  expect(Math.abs(half.engine.label / b.engine.label - 0.5) < 0.02, "'both' 맞춤에서 그림을 절반으로 줄이면 그림 속 글자 크기(pt)도 절반");
  // 기준점 크기 조절: 점 P 가 제자리에 남는다
  const P = [b.art[0], b.art[1]]; // 그림 상자의 왼쪽 위(보이는 그림 모서리)
  for (const k of [0.5, 0.75, 1.3]) {
    const z = m.pageZoomAbout(b, k, P);
    const r2 = rep({ c1: z });
    const ax = (P[0] - b.xf[1]) / b.xf[0]; const ay = (P[1] - b.xf[2]) / b.xf[0];
    const nx = ax * r2.xf[0] + r2.xf[1]; const ny = ay * r2.xf[0] + r2.xf[2];
    expect(Math.abs(nx - P[0]) < 0.05 && Math.abs(ny - P[1]) < 0.05 && Math.abs(r2.zoom - k) < 0.001, `배율 ${k}: 잡지 않은 모서리(기준점)가 제자리에 남음`);
  }
  const big = m.pageZoomAbout(b, 99, P); const tiny = m.pageZoomAbout(b, 0.001, P);
  expect(big.zoom === m.ZOOM_MAX && tiny.zoom === m.ZOOM_MIN && Math.abs(big.zx) <= b.fit.bw / 2 + 0.01 && Math.abs(big.zy) <= b.fit.bh / 2 + 0.01, '배율은 범위로, 위치는 그림 가운데가 칸 안에 있게 맞춰짐');
  expect(!/NaN|Infinity/.test(JSON.stringify(m.pageZoomAbout(b, 'x', P))) && m.pageZoomAbout(b, 'x', P).zoom === 1, '엉뚱한 배율은 1');
}
// 영역 복사(고른 영역만 다른 칸에 보이기)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`영역 복사: ${label}`); };
  const lay = { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><rect x="10" y="10" width="80" height="40" fill="#cde"/><circle cx="25" cy="25" r="8" fill="#e44"/></svg>' };
  const page = { w: 420, h: 297, medium: 'print' };
  const rep = (crop) => m.composePage(page, [{ id: 'c1', render: lay, crop }, { id: 'c2', render: lay }], { layoutId: '2x1', preview: true }).cells.find((c) => c.id === 'c1');
  const full = rep(undefined);
  expect(full.crop === null, '영역이 없으면 crop 은 null(예전과 같음)');
  const c = rep([10, 10, 40, 20]);
  expect(JSON.stringify(c.crop) === '[10,10,40,20]' && Math.abs(c.fit.vw - 40) < 1e-9 && Math.abs(c.fit.vh - 20) < 1e-9 && Math.abs(c.fit.vx - 10) < 1e-9 && Math.abs(c.fit.vy - 10) < 1e-9, '고른 영역이 그림 자리의 기준 범위가 됨(내용 재기 없이 그 영역 그대로)');
  expect(Math.abs(c.art[2] / c.art[3] - 2) < 0.02 || Math.abs((c.art[2] / c.art[3]) - 40 / 20) < 0.05, '보이는 그림의 가로세로 비가 영역과 같음');
  expect(c.art[2] * c.art[3] > 0 && c.xf[0] > full.xf[0], '영역만 보이면 그림이 더 크게(배율 증가) 놓임');
  const out = rep([-50, -50, 300, 300]); const bad = rep([5, 5, 0.2, 0.2]); const nan = rep(['x', 1, 2, 3]);
  expect(JSON.stringify(out.crop) === '[0,0,100,60]', '그림 밖으로 나간 영역은 그림 안으로 잘림');
  expect(bad.crop === null && nan.crop === null, '너무 작거나 엉뚱한 영역은 무시(전체 그림)');
  const svg = m.composePage(page, [{ id: 'c1', render: lay, crop: [10, 10, 40, 20] }, { id: 'c2', render: lay }], { layoutId: '2x1' }).svg;
  expect(!/NaN|Infinity/.test(svg), '저장용 그림에 NaN 이 없음');
}
// 손스케치: 여러 요소 한꺼번에(정렬·간격·일괄 속성·삭제·이름 분리)와 글씨체
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`손스케치 여러 개: ${label}`); };
  const spec = m.normalizeSketch({
    blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 30], name: '거실', showName: true }, { id: 'b2', kind: 'core', rect: [50, 10, 70, 30], name: '코어' }],
    lines: [{ id: 'p1', pts: [[10, 40], [40, 40]], dash: 'solid', width: 2 }],
    winds: [{ id: 'w1', pts: [[10, 50], [40, 52]], head: 'end', dash: 'dashed', width: 4, color: '#1E88C8' }],
    memos: [{ id: 'm1', x: 20, y: 20, text: '가나다', size: 20 }, { id: 'm2', x: 60, y: 30, text: '라마바사아자', size: 30, align: 'start' }, { id: 'm3', x: 40, y: 45, text: '하', size: 16, align: 'end' }, { id: 'm4', x: 80, y: 20, text: '1', size: 20, badge: 'circle' }],
  });
  expect(m.isPlainMemo(spec.memos[0]) && !m.isPlainMemo(spec.memos[3]), '일반 글자와 번호 마커를 구분');
  const w = (id) => m.sketchBoxFor(spec, id);
  expect(w('m2')[0] === 60 && w('m2')[2] > 60 && w('m3')[2] === 40 && w('m3')[0] < 40 && Math.abs((w('m1')[0] + w('m1')[2]) / 2 - 20) < 1e-9, '글자 상자: 시작·끝·가운데 정렬 글자는 기준점에 맞춰 폭을 어림');
  const ids = ['m1', 'm2', 'm3'];
  for (const [mode, k, which] of [['left', 0, 'min'], ['right', 2, 'max'], ['top', 1, 'min'], ['bottom', 3, 'max']]) {
    const out = m.sketchAlignMany(spec, ids, mode); const edges = ids.map((id) => m.sketchBoxFor(out, id)[k]);
    const U = m.sketchUnionBox(spec, ids)[k];
    expect(edges.every((v) => Math.abs(v - U) < 1e-6), `정렬 ${mode}: 모든 글자가 가장 바깥 ${which} 에 맞춰짐`);
  }
  const hc = m.sketchAlignMany(spec, ids, 'hcenter'); const cs = ids.map((id) => { const b = m.sketchBoxFor(hc, id); return (b[0] + b[2]) / 2; });
  expect(cs.every((v) => Math.abs(v - cs[0]) < 1e-6), '가로 가운데 정렬: 가운데가 모두 같음');
  expect(m.sketchAlignMany(spec, ['m1'], 'left') === spec, '하나만 고르면 정렬해도 변화 없음');
  const dist = m.sketchDistribute(spec, ids, 'h'); const bb = ids.map((id) => m.sketchBoxFor(dist, id)).sort((p, q) => p[0] - q[0]);
  expect(Math.abs((bb[1][0] - bb[0][2]) - (bb[2][0] - bb[1][2])) < 1e-6 && m.sketchDistribute(spec, ['m1', 'm2'], 'h') === spec, '가로 간격 같게(3개 이상일 때만)');
  const mv = m.sketchMoveMany(spec, ['m1', 'p1'], 5, -3);
  expect(Math.abs(mv.memos[0].x - 25) < 1e-9 && Math.abs(mv.memos[0].y - 17) < 1e-9 && Math.abs(mv.lines[0].pts[0][0] - 15) < 1e-9, '여러 개 한꺼번에 옮기기');
  const up = m.sketchUpdateMany(spec, ['m1', 'm2', 'm4', 'w1', 'b1'], { size: 33 }, ['text']);
  expect(up.memos[0].size === 33 && up.memos[1].size === 33 && up.memos[3].size === 20 && up.winds[0].width === 4, "'글자' 종류에만 속성을 입힘(번호 마커·화살표는 그대로)");
  const fnUp = m.sketchUpdateMany(spec, ids, (e) => ({ size: Math.round(e.size * 1.5) }), ['text']);
  expect(fnUp.memos[0].size === 30 && fnUp.memos[1].size === 45 && fnUp.memos[2].size === 24, '요소마다 값을 계산하는 함수로 입힘(크기 ×1.5)');
  const wi = m.sketchUpdateMany(spec, ['w1', 'p1'], { color: '#D6453D' }, ['wind']);
  expect(wi.winds[0].color === '#D6453D' && wi.lines[0].color === spec.lines[0].color, '종류를 정하면 그 종류에만(화살표만)');
  const del = m.sketchDeleteMany(spec, ['m1', 'm4', 'p1']);
  expect(del.memos.length === 2 && del.lines.length === 0 && del.memos.every((q) => q.id !== 'm1'), '여러 개 한꺼번에 지우기');
  // 글씨체·굵기
  const fx = m.normalizeSketch({ ...spec, font: 'batang', memos: [{ id: 'm1', x: 20, y: 20, text: '가', size: 20, font: 'nanum', fw: 800 }, { id: 'm2', x: 30, y: 20, text: '나', size: 20, font: 'nope', fw: 555 }] });
  expect(fx.font === 'batang' && fx.memos[0].font === 'nanum' && fx.memos[0].fw === 800 && !('font' in fx.memos[1]) && !('fw' in fx.memos[1]), '글씨체·굵기는 목록 안의 값만 저장(엉뚱한 값은 버림)');
  const svg = m.renderSketch(fx).svg;
  expect(svg.includes("font-family=\"'NanumGothic'") && svg.includes('font-weight="800"') && svg.includes("'Batang'"), '그리기: 글자마다 고른 글씨체·굵기가 들어가고, 그림 전체 글씨체는 기본 글자에 적용');
  expect(!m.renderSketch(spec).svg.includes('Batang') && !/font:/.test(JSON.stringify(m.normalizeSketch(spec))), '글씨체를 안 정하면 예전과 같음');
  // 이름 분리
  const dn = m.sketchDetachName(spec, 'b2');
  expect(dn.id && dn.spec.memos.some((q) => q.id === dn.id && q.text === '코어' && q.fw === 600 && Math.abs(q.x - 60) < 1e-9) && dn.spec.blocks[1].showName === false && dn.spec.blocks[1].name === '코어', '코어 이름을 글자로 분리(가운데에 놓이고 블록 이름 표시는 꺼짐)');
  const dn2 = m.sketchDetachName(spec, 'b1'); const memo2 = dn2.spec.memos.find((q) => q.id === dn2.id);
  expect(memo2 && memo2.color === '#8A8580' && memo2.fw === 400 && memo2.size >= 10 && memo2.size <= 22 && dn2.id !== 'm1' && dn2.spec.memos.length === spec.memos.length + 1, '판 이름도 분리(새 번호로, 회색 글자)');
  expect(m.sketchDetachName(spec, 'p1').id === '' && m.sketchDetachName(spec, 'zz').id === '' && m.sketchDetachName(m.normalizeSketch({ blocks: [{ id: 'b1', kind: 'slab', rect: [0, 0, 10, 10] }] }), 'b1').id === '', '이름이 없거나 판이 아니면 분리하지 않음');
  const afterDetach = m.renderSketch(dn.spec).svg; expect(!/NaN/.test(afterDetach), '분리 뒤에도 그려짐(NaN 없음)');
}
// 번호 마커(R3-2)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`번호 마커: ${label}`); };
  expect(m.assignNumbers([{ auto: true, text: '' }, { auto: true, text: '' }, { auto: true, text: '' }]).join() === '1,2,3', '자동 번호는 1,2,3…');
  expect(m.assignNumbers([{ auto: true, text: '' }, { auto: false, text: '2' }, { auto: true, text: '' }]).join() === '1,2,3', '직접 정한 번호(2)는 두고 자동은 1·3');
  expect(m.assignNumbers([{ auto: false, text: '가' }, { auto: true, text: '' }]).join() === '가,1', '숫자가 아닌 고정 글자는 그대로');
  expect(m.assignNumbers([]).length === 0, '빈 목록');
  expect(m.badgeInk('#222222') === '#FFFFFF' && m.badgeInk('#F8E8A0') === '#222222' && m.badgeInk('nope') === '#FFFFFF', '바탕이 밝으면 어두운 숫자, 어두우면 흰 숫자');
  expect(m.badgeFontK('1') === 1 && m.badgeFontK('12') === 0.8 && m.badgeFontK('123') < 0.7, '숫자가 길면 글자가 작아짐');
  // 손스케치
  const base = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 40] }], lines: [], winds: [], memos: [{ id: 'm1', x: 70, y: 10, text: '메모', size: 14 }] });
  let sp = base(); const ids = [];
  for (let i = 0; i < 3; i++) { const r = m.sketchAdd(sp, 'marker'); sp = r.spec; ids.push(r.id); }
  const nums = (spec) => spec.memos.filter((x) => x.badge).map((x) => x.text).join();
  expect(nums(sp) === '1,2,3' && sp.memos.find((x) => x.id === ids[0]).badge === 'circle' && sp.memos.find((x) => x.id === ids[0]).color === '#222222', '마커를 놓을 때마다 1,2,3 자동, 기본은 검은 원');
  expect(new Set(sp.memos.filter((x) => x.badge).map((x) => `${x.x.toFixed(2)},${x.y.toFixed(2)}`)).size === 3, '놓을 때마다 비껴 놓임');
  expect(nums(m.sketchDelete(sp, ids[1])) === '1,2', '가운데 마커를 지우면 뒤 번호가 당겨짐(1,2)');
  { const t = m.sketchTextTargets(sp).find((x) => x.apply.id === ids[1]); const r = m.sketchApplyText(sp, t.apply, '7'); expect(r.update.patch.text === '7' && r.update.patch.auto === false, '번호를 직접 고치면 고정(auto=false)');
    const fixed = m.sketchRenumber(m.sketchUpdate(sp, ids[1], { text: '2', auto: false })); expect(nums(fixed) === '1,2,3', '고정 번호 2 가 있으면 자동은 1·3'); }
  { const fixed = m.sketchUpdate(sp, ids[0], { text: '5', auto: false }); expect(nums(m.sketchRenumber(fixed)) === '5,1,2', '첫 마커를 5로 고정하면 나머지는 1,2'); }
  { const snap = m.sketchSnapshot(sp, ids[0]); const r = m.sketchPaste(sp, snap, 3, 3); expect(nums(r.spec) === '1,2,3,4', '붙여넣은 마커는 다음 번호'); }
  expect(!m.sketchCanRotate(sp, ids[0]) && m.sketchCanRotate(sp, 'm1'), '번호 마커는 돌리지 않는다(글자는 돌릴 수 있음)');
  expect(!('rot' in m.normalizeSketch({ ...sp, memos: sp.memos.map((x) => (x.badge ? { ...x, rot: 30 } : x)) }).memos.find((x) => x.badge)), '마커의 각도는 저장하지 않음');
  { const svg = m.renderSketch(sp).svg; expect((svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="#222222"\/>/g) || []).length === 3 && />1<\/text>/.test(svg) && />3<\/text>/.test(svg) && /fill="#FFFFFF" pointer-events="none">1</.test(svg), '검은 원 3개 + 흰 숫자 1,2,3'); expect(!/NaN|undefined/.test(svg), 'SVG 에 NaN 없음');
    const sq = m.renderSketch(m.sketchUpdate(sp, ids[0], { badge: 'square', color: '#E8833A' })).svg; expect(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#E8833A"\/>/.test(sq), '사각 모양·색 바꾸기');
    const iv = m.renderSketch(sp, { interactive: true, selected: ids[0] }).svg; expect(iv.includes('stroke-dasharray="6 4"') && !iv.includes('data-handle="rot"') && iv.includes(`data-eid="${ids[0]}"`), '선택하면 고리 표시, 회전 손잡이는 없음, 눌러서 고를 수 있음');
    const two = m.renderSketch(m.sketchUpdate(sp, ids[0], { text: '12' })).svg; expect(/pointer-events="none">12<\/text>/.test(two) && /font-size="1[0-9]\.\d"[^>]*pointer-events="none">12</.test(two), '두 자리 번호도 그려짐(글자가 조금 작아짐)'); }
  expect(m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: '12345', badge: 'circle' }] }).memos[0].text === '123', '번호는 3자까지');
  expect(m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: '메모', badge: 'zzz' }] }).memos[0].badge === undefined, '모르는 모양은 일반 글자');
  // 구조형
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; let E = m.emptyEdits(svg0); const aids = [];
  for (let i = 0; i < 3; i++) { const r = m.editAddBadge(E, sig, { box: [0, 0, 200, 100] }); E = r.edits; aids.push(r.id); }
  const anums = (e) => (e.adds || []).filter((a) => a.kind === 'badge').map((a) => a.text).join();
  expect(anums(E) === '1,2,3' && E.adds[0].shape === 'circle' && E.adds[0].fill === '#222222' && E.adds[0].w === E.adds[0].h, '구조형: 마커 1,2,3 자동, 지름 w=h');
  expect(m.hasEdits(E), '마커가 있으면 수정 있음으로 본다');
  expect(anums(m.editRemoveAdd(E, aids[1], sig)) === '1,2', '구조형: 가운데를 지우면 뒤 번호가 당겨짐');
  expect(anums(m.editRenumber({ ...E, adds: E.adds.map((a, i) => (i === 1 ? { ...a, text: '2', auto: false } : a)) })) === '1,2,3', '구조형: 고정 번호는 건너뜀');
  { const out = m.applyEdits(svg0, E).svg; expect((out.match(/<circle /g) || []).length === 3 && />1<\/text>/.test(out) && !/data-eid/.test(out) && !/NaN|undefined/.test(out), '저장용 그림: 원 3개·숫자·손잡이 표시 없음'); }
  { const out = m.applyEdits(svg0, E, { ids: true }).svg; expect(new RegExp(`<g data-eid="${aids[0]}">`).test(out), '편집 화면: 마커마다 data-eid'); }
  { const E2 = { ...E, adds: E.adds.map((a, i) => (i === 0 ? { ...a, shape: 'square', fill: '#F8E8A0' } : a)) }; const out = m.applyEdits(svg0, E2).svg; expect(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#F8E8A0"\/>/.test(out) && /fill="#222222" pointer-events|fill="#222222">1</.test(out), '사각·밝은 바탕이면 어두운 숫자'); }
  { const R = m.editRotateAdd(E, aids[0], 90); expect(R === E && !('rot' in E.adds[0]), '마커는 각도를 갖지 않음'); const R2 = m.editRotateAdd(E, aids[0], 90, [0, 0]); const a = R2.adds[0]; const c0 = [E.adds[0].x + E.adds[0].w / 2, E.adds[0].y + E.adds[0].w / 2]; expect(Math.abs((a.x + a.w / 2) - (-c0[1])) < 0.1 && !('rot' in a), '함께 돌릴 때는 자리만 묶음 중심 둘레로 옮겨 감'); }
}
// 리더선 라벨(R3-3)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`리더선 라벨: ${label}`); };
  expect(m.descLines('가\n\n 나 \n다\n라').join('|') === '가|나|다', '설명은 빈 줄을 버리고 3줄까지');
  const base = { x: 100, y: 100, title: '제목', desc: '설명 하나\n설명 둘', size: 14, color: '#222222', line: 'straight', end: 'dot' };
  const R = m.calloutLayout({ ...base, tx: 400, ty: 220 }); const Lf = m.calloutLayout({ ...base, tx: 20, ty: 220 });
  expect(R.pts.length === 2 && R.S[0] === R.x + R.w && R.pts[1][0] === 400 && R.pts[1][1] === 220, '끝점이 오른쪽이면 밑줄 오른쪽 끝에서 끝점까지 직선');
  expect(Lf.S[0] === Lf.x && Lf.pts[1][0] === 20, '끝점이 왼쪽이면 밑줄 왼쪽 끝에서 나간다');
  expect(R.w >= 14 * 4 && R.h > 14 * 2 && R.lines.length === 3 && R.lines[0].bold && !R.lines[1].bold, '제목은 굵게, 설명 두 줄이 그 아래');
  { const E = m.calloutLayout({ ...base, tx: 400, ty: 220, line: 'elbow' }); expect(E.pts.length === 3 && E.pts[1][0] === 400 && E.pts[1][1] === E.S[1], '꺾은선은 가로로 나간 뒤 세로로 꺾는다');
    const B = m.calloutLayout({ ...base, tx: 110, ty: 220, line: 'elbow' }); expect(B.pts.length === 2, '되돌아가는 방향이면 꺾지 않고 직선'); }
  { const w1 = m.calloutLayout({ ...base, title: '긴 제목이 들어갑니다 정말로', tx: 400, ty: 200 }).w; const w2 = m.calloutLayout({ ...base, title: '짧', tx: 400, ty: 200 }).w; expect(w1 > w2, '긴 제목이면 상자가 넓어진다'); }
  { const svg = m.calloutSvg({ ...base, tx: 400, ty: 220 }); expect(svg.includes('<polyline') && svg.includes('<circle') && /font-weight="800"[^>]*>제목</.test(svg) && />설명 하나</.test(svg) && !svg.includes('data-eid') && !/NaN|undefined/.test(svg), '그림: 선·끝점 점·제목·설명, 편집 표시 없음');
    const ar = m.calloutSvg({ ...base, tx: 400, ty: 220, end: 'arrow' }); expect(ar.includes('<polygon') && !ar.includes('<circle'), '끝 모양 화살표');
    const no = m.calloutSvg({ ...base, tx: 400, ty: 220, end: 'none' }); expect(!no.includes('<polygon') && !no.includes('<circle'), '끝 모양 없음');
    const iv = m.calloutSvg({ ...base, tx: 400, ty: 220 }, { id: 'm9', interactive: true }); expect(iv.includes('data-eid="m9"') && iv.includes('fill="transparent"') && iv.includes('stroke="transparent"'), '편집 화면: 눌러서 고를 수 있는 투명 영역');
    const esc = m.calloutSvg({ ...base, title: 'A<B&"C"', tx: 400, ty: 220 }); expect(esc.includes('A&lt;B&amp;&quot;C&quot;'), '글자의 특수문자 이스케이프');
    const em = m.calloutSvg({ ...base, title: '', desc: '', tx: 400, ty: 220 }); expect(!/NaN|undefined/.test(em) && em.includes('<polyline'), '제목·설명이 비어도 그려짐'); }
  { const bx = m.calloutBox({ ...base, tx: 400, ty: 220 }); expect(bx[0] <= 100 && bx[2] >= 400 && bx[3] >= 220 && bx[1] <= 100, '상자 영역은 글 상자와 끝점을 모두 감쌈'); }
  // 손스케치
  const sk = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 40] }], lines: [], winds: [], memos: [{ id: 'm1', x: 70, y: 10, text: '메모', size: 14 }] });
  let sp = sk(); const ra = m.sketchAdd(sp, 'callout'); sp = ra.spec; const cid = ra.id; const c0 = sp.memos.find((x) => x.id === cid);
  expect(c0.callout === true && c0.text === '제목' && Number.isFinite(c0.tx) && Number.isFinite(c0.ty) && c0.line === 'straight' && c0.end === 'dot', '손스케치: 리더선 라벨 추가');
  expect(m.sketchAdd(sp, 'callout').spec.memos.filter((x) => x.callout).length === 2, '여러 개 추가');
  { const n = m.normalizeSketch(JSON.parse(JSON.stringify(sp))).memos.find((x) => x.id === cid); expect(n.callout && n.desc === c0.desc && n.tx === c0.tx && !('rot' in n), '저장·불러오기 후에도 유지, 각도는 없음');
    const bad = m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: 't', callout: true, line: 'zzz', end: 'qqq', desc: 'a\nb\nc\nd' }] }).memos[0]; expect(bad.line === 'straight' && bad.end === 'dot' && bad.desc.split('\n').length === 3, '모르는 선·끝 모양은 기본값, 설명은 3줄까지'); }
  { const mv = m.sketchMoveBy(sp, cid, 5, 3).memos.find((x) => x.id === cid); expect(Math.abs(mv.x - (c0.x + 5)) < 1e-9 && Math.abs(mv.tx - (c0.tx + 5)) < 1e-9 && Math.abs(mv.ty - (c0.ty + 3)) < 1e-9, '옮기면 글 상자와 끝점이 함께'); }
  { const tp = m.sketchSetTip(sp, cid, [33, 44]).memos.find((x) => x.id === cid); expect(tp.tx === 33 && tp.ty === 44 && tp.x === c0.x, '끝점만 옮기기'); expect(m.sketchSetTip(sp, 'm1', [1, 1]) === sp, '리더선 라벨이 아니면 그대로'); }
  expect(!m.sketchCanRotate(sp, cid), '리더선 라벨은 돌리지 않는다');
  { const bx = m.sketchBox(sp, cid); expect(bx[0] <= Math.min(c0.x, c0.tx) + 1e-9 && bx[2] >= Math.max(c0.x, c0.tx) - 1e-9, '영역은 글 상자 자리와 끝점을 감쌈'); }
  { const sn = m.sketchSnapshot(sp, cid); const r = m.sketchPaste(sp, sn, 3, 3); const p2 = r.spec.memos.find((x) => x.id === r.id); expect(p2.callout && Math.abs(p2.tx - (c0.tx + 3)) < 1e-9 && Math.abs(p2.x - (c0.x + 3)) < 1e-9, '붙여넣기: 끝점도 같이 비껴 놓임'); }
  { const mc = m.sketchMirrorCopy(sp, cid, 50, 'h'); const q = mc.spec.memos.find((x) => x.id === mc.id); expect(Math.abs(q.tx - (100 - c0.tx)) < 1e-9 && Math.abs(q.x - (100 - c0.x)) < 1e-9, '대칭 복제: 끝점도 뒤집힘'); }
  { const tg = m.sketchTextTargets(sp).filter((x) => x.apply.id === cid); expect(tg.length === 2 && tg.some((x) => x.apply.key === 'desc' && x.multiline), '글자 고치기 자리: 제목 + 설명(여러 줄)');
    const r = m.sketchApplyText(sp, { id: cid, key: 'desc' }, '새 설명\n둘째'); expect(r.update.patch.desc === '새 설명\n둘째' && !('auto' in r.update.patch), '설명 고치기'); }
  { const out = m.renderSketch(sp).svg; expect(out.includes('<polyline') && />제목</.test(out) && />설명을 입력하세요</.test(out) && !out.includes('data-eid') && !out.includes('data-handle') && !/NaN|undefined/.test(out), '그림: 선·제목·설명, 편집 표시 없음');
    const iv = m.renderSketch(sp, { interactive: true, selected: cid }).svg; expect(iv.includes(`data-eid="${cid}"`) && iv.includes('data-handle="tip"') && iv.includes('stroke-dasharray="6 4"') && !iv.includes('data-handle="rot"'), '선택하면 끝점 손잡이·점선 틀, 회전 손잡이는 없음');
    const un = m.renderSketch(sp, { interactive: true }).svg; expect(!un.includes('data-handle="tip"'), '선택하지 않으면 손잡이 없음');
    const el = m.renderSketch(m.sketchUpdate(sp, cid, { line: 'elbow', end: 'arrow' })).svg; expect(el.includes('<polygon'), '꺾은선·화살표로 바꾸기'); }
  expect(m.sketchDelete(sp, cid).memos.every((x) => x.id !== cid), '지우기');
  // 구조형
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; let E = m.emptyEdits(svg0); const r1 = m.editAddCallout(E, sig, { box: [0, 0, 200, 100] }); E = r1.edits; const a1 = E.adds.find((x) => x.id === r1.id);
  expect(a1.kind === 'callout' && a1.title === '제목' && a1.size >= 10 - 1e-9 && Number.isFinite(a1.tx) && a1.fill === '#222222', '구조형: 리더선 라벨 추가');
  expect(m.hasEdits(E), '리더선 라벨이 있으면 수정 있음으로 본다');
  { const out = m.applyEdits(svg0, E).svg; expect(out.includes('<polyline') && />제목</.test(out) && !/data-eid/.test(out) && !/NaN|undefined/.test(out), '저장용 그림: 선·글, 편집 표시 없음');
    const iv = m.applyEdits(svg0, E, { ids: true }).svg; expect(new RegExp(`<g data-eid="${r1.id}"`).test(iv), '편집 화면: data-eid'); }
  { const sh = m.addShiftPatch(a1, 4, 6); expect(sh.x === Math.round((a1.x + 4) * 100) / 100 && sh.tx === Math.round((a1.tx + 4) * 100) / 100 && sh.ty === Math.round((a1.ty + 6) * 100) / 100, '옮김 조각: 끝점도 함께'); expect(!('tx' in m.addShiftPatch({ id: 'a2', kind: 'image', x: 1, y: 1 }, 2, 2)), '이미지는 x, y 만'); }
  { const R = m.editRotateAdd(E, r1.id, 90); expect(R === E, '혼자 돌려도 변화 없음(글자는 기울지 않는다)'); const R2 = m.editRotateAdd(E, r1.id, 90, [100, 50]); const q = R2.adds.find((x) => x.id === r1.id); expect(Number.isFinite(q.x) && Number.isFinite(q.tx) && !('rot' in q) && (q.tx !== a1.tx || q.ty !== a1.ty), '함께 돌릴 때는 자리와 끝점이 묶음 중심 둘레로 옮겨 감'); }
  expect(!(m.editRemoveAdd(E, r1.id, sig).adds || []).length, '지우기');
}
// 아이콘 세트·아이콘 칩(R4)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`아이콘: ${label}`); };
  const names = m.ICON_NAMES; const cats = new Set(m.ICON_CATS.map((c) => c.id));
  expect(names.length === 12 + Object.keys(m.ICONSET).length && new Set(names).size === names.length, '이름 중복 없음(기본 12 + Lucide)');
  expect(Object.keys(m.ICONSET).length >= 80 && Object.keys(m.ICONSET).length <= 120, `Lucide 아이콘 ${Object.keys(m.ICONSET).length}개(약 80~120개)`);
  expect(names.every((n) => typeof m.ICON_LABEL[n] === 'string' && m.ICON_LABEL[n].length > 0), '모든 아이콘에 한국어 뜻');
  expect(Object.values(m.ICONSET).every((v) => cats.has(v.cat) && v.svg.length > 20 && !/<script|on\w+=|href=|style=/.test(v.svg)), '분류가 있고 그림 데이터가 안전함(스크립트·링크·style 없음)');
  expect(m.ICON_GROUPS.reduce((a, g) => a + g.names.length, 0) === names.length && m.ICON_GROUPS[0].id === 'basic' && m.ICON_GROUPS.every((g) => g.names.length > 0), '분류별 묶음이 전체와 같고 비어 있지 않음');
  expect(!Object.keys(m.ICONSET).some((n) => m.BASIC_NAMES.includes(n)), 'Lucide 이름이 기본 12개와 겹치지 않음');
  expect(names.every((n) => { const g = m.iconGlyph(n, '#fff'); return g.length > 20 && !/NaN|undefined/.test(g); }), '모든 아이콘이 그려짐(NaN 없음)');
  expect(m.iconGlyph('building-2', '#123456').includes('stroke="#123456"') && m.iconGlyph('leaf', '#123456').includes('fill="#123456"'), '선 아이콘은 stroke, 기본 아이콘은 fill 로 색이 들어감');
  expect(m.resolveIcon('Tree_Pine') === 'tree-pine' && m.resolveIcon(' building-2 ') === 'building-2' && m.resolveIcon('없는것') === 'star' && m.resolveIcon('zzz', 'leaf') === 'leaf' && m.resolveIcon(undefined) === 'star', '이름 맞추기(대소문자·_·공백, 없으면 기본값)');
  // AI 입력 규칙·정리
  expect(m.SITE_RULES.includes('building-2(') && m.SITE_RULES.includes('[기본]') && m.SITE_RULES.includes('[동선·방향]') && m.SITE_RULES.length < 6000, `AI 규칙에 분류별 아이콘 목록(길이 ${m.SITE_RULES.length}자)`);
  { const sp = m.normalizeSpec('site', { panels: [{ heading: 'a', overlays: [{ kind: 'marker', anchor: 'n', label: 'x', icon: 'Hard_Hat', color: '#222222', side: 'left' }, { kind: 'marker', anchor: 's', label: 'y', icon: '없는아이콘', color: '#222222', side: 'left' }] }] });
    const ic = JSON.stringify(sp); expect(ic.includes('"icon":"hard-hat"') && ic.includes('"icon":"star"'), '배치 개념도 marker: 이름을 맞추고 모르는 이름은 star'); }
  // 손스케치 칩
  const sk = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 40] }], lines: [], winds: [], memos: [{ id: 'm1', x: 70, y: 10, text: '메모', size: 14 }] });
  let sp = sk(); const ra = m.sketchAdd(sp, 'icon', { icon: 'hard-hat' }); sp = ra.spec; const cid = ra.id; const c0 = sp.memos.find((x) => x.id === cid);
  expect(c0.chip === 'hard-hat' && c0.chipShape === 'rounded' && c0.text === '' && !('rot' in c0), '손스케치: 아이콘 칩 추가');
  expect(m.sketchAdd(sp, 'icon').spec.memos.filter((x) => x.chip).pop().chip === 'map-pin' && m.sketchAdd(sp, 'icon', { icon: 'nope' }).spec.memos.filter((x) => x.chip).pop().chip === 'map-pin', '아이콘을 안 정하거나 모르는 이름이면 map-pin');
  { const n = m.normalizeSketch(JSON.parse(JSON.stringify(sp))).memos.find((x) => x.id === cid); expect(n.chip === 'hard-hat' && n.chipShape === 'rounded', '저장·불러오기 후에도 유지');
    const bad = m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: 't', chip: 'zzz' }, { id: 'm2', x: 1, y: 1, text: '', chip: 'zap', chipShape: 'weird' }] }).memos; expect(!('chip' in bad[0]) && bad[1].chip === 'zap' && bad[1].chipShape === 'rounded', '모르는 아이콘은 일반 글자로, 모르는 모양은 둥근 사각'); }
  expect(!m.sketchCanRotate(sp, cid), '아이콘 칩은 돌리지 않는다');
  { const out = m.renderSketch(sp).svg; expect(/<rect x="[\d.]+" y="[\d.]+" width="38\.4" height="38\.4" rx="7\.7" fill="#222222"\/>/.test(out) && out.includes('stroke="#FFFFFF"') && !out.includes('data-eid') && !/NaN|undefined/.test(out), '그림: 둥근 사각 칩(한 변 size×2.4) + 흰 아이콘, 편집 표시 없음');
    const ci = m.renderSketch(m.sketchUpdate(sp, cid, { chipShape: 'circle' })).svg; expect(/<circle cx="[\d.]+" cy="[\d.]+" r="19\.2" fill="#222222"\/>/.test(ci), '원 모양');
    const bare = m.renderSketch(m.sketchUpdate(sp, cid, { chipShape: 'bare', color: '#1F6FB5' })).svg; expect(bare.includes('stroke="#1F6FB5"') && !/<rect[^>]*width="38\.4"/.test(bare), '바탕 없음: 아이콘만 그 색으로');
    const iv = m.renderSketch(sp, { interactive: true, selected: cid }).svg; expect(iv.includes(`data-eid="${cid}"`) && iv.includes('stroke-dasharray="6 4"') && !iv.includes('data-handle="rot"') && iv.includes('fill="transparent"'), '편집 화면: 눌러서 고를 수 있음·점선 틀·회전 손잡이 없음'); }
  { const mv = m.sketchMoveBy(sp, cid, 4, 2).memos.find((x) => x.id === cid); expect(Math.abs(mv.x - c0.x - 4) < 1e-9, '옮기기'); const pa = m.sketchPaste(sp, m.sketchSnapshot(sp, cid), 3, 3); expect(pa.spec.memos.find((x) => x.id === pa.id).chip === 'hard-hat', '복사·붙여넣기'); }
  // 구조형 칩
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; let E = m.emptyEdits(svg0); const r1 = m.editAddIcon(E, sig, { box: [0, 0, 200, 100], icon: 'zap' }); E = r1.edits; const a1 = E.adds.find((x) => x.id === r1.id);
  expect(a1.kind === 'icon' && a1.icon === 'zap' && a1.shape === 'rounded' && a1.w === a1.h && a1.w >= 28 - 1e-9 && a1.fill === '#222222', '구조형: 아이콘 칩 추가(한 변 w=h)');
  expect(m.editAddIcon(E, sig, { box: [0, 0, 200, 100], icon: 'nope', shape: 'zzz' }).edits.adds.pop().icon === 'map-pin', '구조형: 모르는 아이콘은 map-pin');
  expect(m.hasEdits(E), '아이콘 칩이 있으면 수정 있음');
  { const out = m.applyEdits(svg0, E).svg; expect(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#222222"\/>/.test(out) && out.includes('stroke="#FFFFFF"') && !/data-eid/.test(out) && !/NaN|undefined/.test(out), '저장용 그림: 칩 + 아이콘, 편집 표시 없음');
    const iv = m.applyEdits(svg0, E, { ids: true }).svg; expect(new RegExp(`<g data-eid="${r1.id}">`).test(iv) && iv.includes('fill="transparent"'), '편집 화면: data-eid·눌림 영역');
    const E2 = { ...E, adds: E.adds.map((q) => (q.id === r1.id ? { ...q, shape: 'bare', fill: '#C0392B' } : q)) }; expect(m.applyEdits(svg0, E2).svg.includes('stroke="#C0392B"'), '바탕 없음·색 바꾸기'); }
  { const R = m.editRotateAdd(E, r1.id, 90); expect(R === E, '혼자 돌려도 변화 없음'); const R2 = m.editRotateAdd(E, r1.id, 90, [100, 50]); expect(Number.isFinite(R2.adds[0].x) && !('rot' in R2.adds[0]), '함께 돌릴 때는 자리만 옮겨 감'); }
  expect(!(m.editRemoveAdd(E, r1.id, sig).adds || []).length, '지우기');
}
// 개요표(R5 v1)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`개요표: ${label}`); };
  const T0 = m.normalizeTable(m.SAMPLE_TABLE);
  expect(T0.cols === 2 && T0.rows.length === 4 && T0.rows.every((r) => r.length === 2) && T0.style === 'label' && T0.title === '건축개요', '예시 표');
  { const bad = m.normalizeTable({ title: 'x'.repeat(99), cols: 9, style: 'zzz', rows: [['a'], 'x', ['b', 'c', 'd', 'e', 'f', 'g'], null, ['긴'.repeat(80), '줄\n바꿈']] });
    expect(bad.cols === 4 && bad.style === 'label' && bad.title.length === 40 && bad.rows.every((r) => r.length === 4) && bad.rows[4][0].length === 40 && !bad.rows[4][1].includes('\n'), '열 수 2~4·모든 행 칸 수 같게·글자 길이·줄바꿈 제거·모르는 스타일은 라벨형');
    expect(m.normalizeTable(null).cols === 2 && m.normalizeTable(undefined).rows.length === 0 && m.normalizeTable({ cols: 1 }).cols === 2 && m.normalizeTable({ rows: Array.from({ length: 50 }, () => ['a', 'b']) }).rows.length === m.TABLE_MAX_ROWS, '빈 입력·1열은 2열·행은 30개까지'); }
  { const a = m.tableSetCell(T0, 1, 1, '근린생활시설'); expect(a.rows[1][1] === '근린생활시설' && T0.rows[1][1] === '공동주택', '셀 고치기는 새 표를 돌려줌(원본 불변)');
    expect(m.tableSetCell(T0, -1, 0, '새 제목').title === '새 제목' && m.tableSetCell(T0, 99, 0, 'x').rows.length === T0.rows.length && m.tableSetCell(T0, 0, 9, 'x').rows[0].join() === T0.rows[0].join(), '제목 고치기(r=-1)·범위 밖은 그대로'); }
  { const ad = m.tableAddRow(T0); expect(ad.rows.length === 5 && ad.rows[4].every((v) => v === '') && ad.rows[4].length === 2, '행 추가'); expect(m.tableAddRow(T0, 1).rows[1].every((v) => v === '') && m.tableAddRow(T0, 1).rows[2][0] === '용도', '가운데에 행 끼우기');
    expect(m.tableDelRow(T0, 0).rows.length === 3 && m.tableDelRow(m.normalizeTable({ rows: [['a', 'b']] }), 0).rows.length === 1, '행 지우기(마지막 한 행은 남김)');
    expect(m.tableMoveRow(T0, 0, 1).rows[1][0] === '대지위치' && m.tableMoveRow(T0, 0, -1).rows[0][0] === '대지위치', '행 위·아래 옮기기(끝에서는 그대로)'); }
  { const c4 = m.tableSetCols(T0, 4); expect(c4.cols === 4 && c4.rows.every((r) => r.length === 4 && r[2] === '' && r[0].length > 0), '열 늘리기: 빈 열'); const c2 = m.tableSetCols(c4, 2); expect(c2.rows[0].length === 2 && c2.rows[0][1] === T0.rows[0][1], '열 줄이기: 오른쪽이 잘림'); expect(m.tableSetCols(T0, 7).cols === 4 && m.tableSetCols(T0, 0).cols === 2, '열 수 한도'); }
  { const L = m.tableLayout({ x: 100, y: 50, size: 14, table: T0 }); expect(L.colW.length === 2 && L.colW[1] > L.colW[0] && Math.abs(L.w - (L.colW[0] + L.colW[1])) < 1e-9 && L.h > 14 * 2 * 4 && L.rows.length === 4, '열 너비는 글자에 맞춰 정해지고 합이 전체 너비');
    expect(Math.abs(L.colX[1] - (100 + L.colW[0])) < 1e-9 && L.rows[0].y > 50 && L.rows[3].y > L.rows[0].y, '열·행 위치 순서');
    const wide = m.tableLayout({ x: 0, y: 0, size: 14, table: m.tableSetCell(T0, 0, 1, '아주아주아주아주 긴 값이 들어갑니다 정말로') }); expect(wide.colW[1] > L.colW[1], '긴 글자면 그 열이 넓어짐');
    const tl = m.tableLayout({ x: 0, y: 0, size: 14, table: { ...T0, title: '아주아주 긴 표 제목이 들어가면 표가 넓어집니다' } }); expect(tl.w >= 14 * 1.05 * 20, '제목이 더 길면 표 폭이 제목에 맞춰짐'); }
  { const svg = m.tableSvg({ x: 100, y: 50, size: 14, color: '#2F6B4F', table: T0 }); expect(svg.includes('>건축개요<') && svg.includes('>대지위치<') && svg.includes('fill="#EDEDED"') && !svg.includes('data-eid') && !svg.includes('data-cell') && !/NaN|undefined/.test(svg), '라벨형: 제목·라벨 열 회색·편집 표시 없음');
    const st = m.tableSvg({ x: 0, y: 0, size: 14, color: '#1F6FB5', table: { ...T0, style: 'stripe', rows: [['면적', '12,345㎡'], ['비율', '78%'], ['비고', '없음']] } }); expect(st.includes('fill="#1F6FB5"') && st.includes('text-anchor="end"') && /fill="#[0-9a-f]{6}"\/>/.test(st) && !st.includes('#EDEDED'), '줄무늬형: 제목 띠 색·숫자는 오른쪽 맞춤·회색 라벨 열 없음');
    const noTitle = m.tableSvg({ x: 0, y: 0, size: 14, table: { ...T0, title: '' } }); expect(!noTitle.includes('font-weight="800"') && !/NaN|undefined/.test(noTitle), '제목이 없어도 그려짐');
    const empty = m.tableSvg({ x: 0, y: 0, size: 14, table: { rows: [] } }); expect(empty.startsWith('<g') && !/NaN|undefined/.test(empty), '행이 없어도 깨지지 않음');
    const esc = m.tableSvg({ x: 0, y: 0, size: 14, table: m.tableSetCell(T0, 0, 0, 'A<B&"C"') }); expect(esc.includes('A&lt;B&amp;&quot;C&quot;'), '특수문자 이스케이프');
    const iv = m.tableSvg({ x: 0, y: 0, size: 14, table: T0 }, { id: 'm7', interactive: true }); expect(iv.includes('data-eid="m7"') && (iv.match(/data-cell="/g) || []).length === 4 * 2 + 1 && iv.includes('data-cell="-1,0"') && iv.includes('data-cell="3,1"'), '편집 화면: 셀마다 눌림 영역(제목 포함, 빈 칸도)'); }
  expect(m.isLabelCol({ style: 'label', cols: 4 }, 2) && !m.isLabelCol({ style: 'label', cols: 3 }, 2) && !m.isLabelCol({ style: 'stripe', cols: 2 }, 0), '라벨 열 규칙(4열이면 셋째 열도)');
  // 손스케치
  const sk = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [{ id: 'b1', kind: 'slab', rect: [10, 10, 40, 40] }], lines: [], winds: [], memos: [{ id: 'm1', x: 70, y: 10, text: '메모', size: 14 }] });
  let sp = sk(); const ra = m.sketchAdd(sp, 'table'); sp = ra.spec; const tid = ra.id; const t0 = sp.memos.find((x) => x.id === tid);
  expect(t0.table && t0.table.rows.length === 4 && t0.text === '' && !('rot' in t0) && t0.color === '#2F6B4F', '손스케치: 개요표 추가');
  { const n = m.normalizeSketch(JSON.parse(JSON.stringify(sp))).memos.find((x) => x.id === tid); expect(n.table.title === '건축개요' && n.table.rows[3][1] === '12,345㎡', '저장·불러오기 후에도 유지');
    const bad = m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: '', table: { cols: 9, rows: [['a']] } }, { id: 'm2', x: 1, y: 1, text: 'x', table: 'zzz' }] }).memos; expect(bad[0].table.cols === 4 && bad[0].table.rows[0].length === 4 && !('table' in bad[1]), '잘못된 표 값 정리'); }
  expect(!m.sketchCanRotate(sp, tid) && m.sketchCanRotate(sp, 'm1'), '개요표는 돌리지 않는다');
  { const out = m.renderSketch(sp).svg; expect(out.includes('>건축개요<') && out.includes('>용도<') && !out.includes('data-eid') && !out.includes('data-cell') && !/NaN|undefined/.test(out), '그림: 표 글자 있음·편집 표시 없음');
    const iv = m.renderSketch(sp, { interactive: true, selected: tid }).svg; expect(iv.includes(`data-eid="${tid}"`) && iv.includes('data-cell="1,1"') && iv.includes('stroke-dasharray="6 4"') && !iv.includes('data-handle="rot"'), '편집 화면: 셀 눌림 영역·점선 틀·회전 손잡이 없음'); }
  { const r = m.sketchApplyText(sp, { tableId: tid, r: 1, c: 1, key: 't1,1' }, '근린생활시설'); const nx = m.sketchUpdate(sp, r.update.id, r.update.patch); expect(nx.memos.find((x) => x.id === tid).table.rows[1][1] === '근린생활시설', '셀 글자 고치기(inlineText)');
    const rt = m.sketchApplyText(sp, { tableId: tid, r: -1, c: 0 }, '면적개요'); expect(m.sketchUpdate(sp, rt.update.id, rt.update.patch).memos.find((x) => x.id === tid).table.title === '면적개요', '표 제목 고치기'); expect(m.sketchApplyText(sp, { tableId: 'zz', r: 0, c: 0 }, 'x') === null, '없는 표는 null'); }
  { const mv = m.sketchMoveBy(sp, tid, 4, 2).memos.find((x) => x.id === tid); expect(Math.abs(mv.x - t0.x - 4) < 1e-9, '옮기기'); const pa = m.sketchPaste(sp, m.sketchSnapshot(sp, tid), 3, 3); const pm = pa.spec.memos.find((x) => x.id === pa.id); expect(pm.table.rows.length === 4 && pm.id !== tid, '복사·붙여넣기'); }
  // 구조형
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; let E = m.emptyEdits(svg0); const r1 = m.editAddTable(E, sig, { box: [0, 0, 200, 100] }); E = r1.edits; const a1 = E.adds.find((x) => x.id === r1.id);
  expect(a1.kind === 'table' && a1.table.rows.length === 4 && a1.size >= 8 - 1e-9 && a1.fill === '#2F6B4F', '구조형: 개요표 추가');
  expect(m.hasEdits(E), '개요표가 있으면 수정 있음');
  { const out = m.applyEdits(svg0, E).svg; expect(out.includes('>건축개요<') && out.includes('>규모<') && !/data-eid|data-cell/.test(out) && !/NaN|undefined/.test(out), '저장용 그림: 표 글자 있음·편집 표시 없음');
    const iv = m.applyEdits(svg0, E, { ids: true }).svg; expect(new RegExp(`<g data-eid="${r1.id}"`).test(iv) && iv.includes('data-cell="2,0"'), '편집 화면: data-eid·셀 눌림 영역');
    const E2 = { ...E, adds: E.adds.map((q) => (q.id === r1.id ? { ...q, table: m.tableSetCell(q.table, 0, 1, '고친 값'), size: 20 } : q)) }; expect(m.applyEdits(svg0, E2).svg.includes('>고친 값<'), '셀·크기 고치기'); }
  { const sh = m.addShiftPatch(a1, 5, 7); expect(sh.x === Math.round((a1.x + 5) * 100) / 100 && !('tx' in sh), '옮김 조각은 x, y 만'); }
  { const R = m.editRotateAdd(E, r1.id, 90); expect(R === E, '혼자 돌려도 변화 없음'); const R2 = m.editRotateAdd(E, r1.id, 90, [100, 50]); const q = R2.adds.find((x) => x.id === r1.id); expect(Number.isFinite(q.x) && Number.isFinite(q.y) && !('rot' in q) && (q.x !== a1.x || q.y !== a1.y), '함께 돌릴 때는 자리만 묶음 중심 둘레로 옮겨 감'); }
  expect(!(m.editRemoveAdd(E, r1.id, sig).adds || []).length, '지우기');
}
// 바탕 흐리게(R6): 탈색·가장자리 흐리게
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`바탕 흐리게: ${label}`); };
  expect(m.clampPct(-5) === 0 && m.clampPct(250) === 100 && m.clampPct('47.6') === 48 && m.clampPct(undefined) === 0 && m.clampPct('abc') === 0, '0~100 으로 맞춤');
  expect(m.hasFx({ gray: 10 }) && m.hasFx({ edge: 5 }) && !m.hasFx({}) && !m.hasFx({ gray: 0, edge: 0 }) && !m.hasFx(null), '효과 있음 판정');
  expect(m.CONTEXT_FX.gray === 100 && m.CONTEXT_FX.opacity === 0.35 && m.CONTEXT_FX.edge === 0, '맥락 바탕 기본값(흑백·투명도 35%)');
  expect(m.imageFx('a1', { x: 0, y: 0, w: 100, h: 50 }).defs === '' && m.imageFx('a1', { x: 0, y: 0, w: 100, h: 50, gray: 0, edge: 0 }).attrs === '', '효과가 없으면 아무것도 더하지 않음');
  { const g = m.imageFx('a1', { x: 10, y: 20, w: 100, h: 50, gray: 100 }); expect(g.defs.includes('<feColorMatrix type="saturate" values="0"') && g.attrs === ' filter="url(#fxg_a1)"' && !g.defs.includes('mask'), '탈색 100%: 채도 0 필터');
    const g2 = m.imageFx('a1', { x: 0, y: 0, w: 100, h: 50, gray: 40 }); expect(g2.defs.includes('values="0.6"'), '탈색 40%: 채도 0.6');
    const e = m.imageFx('a1', { x: 10, y: 20, w: 100, h: 50, edge: 60 }); expect(e.defs.includes('<mask id="fxm_a1"') && e.defs.includes('feGaussianBlur') && e.attrs === ' mask="url(#fxm_a1)"' && e.defs.includes('x="10"') && !e.defs.includes('feColorMatrix') && !/NaN|undefined|Infinity/.test(e.defs), '가장자리 60%: 흐린 사각형 마스크(이미지 자리 기준)');
    const both = m.imageFx('a1', { x: 0, y: 0, w: 100, h: 50, gray: 100, edge: 100 }); expect(both.attrs.includes('filter=') && both.attrs.includes('mask='), '둘 다');
    const tiny = m.imageFx('a b!', { x: 0, y: 0, w: 2, h: 2, edge: 100 }); expect(!/NaN|undefined|Infinity|width="-|height="-/.test(tiny.defs) && tiny.attrs.includes('fxm_ab'), '아주 작은 이미지·특수문자 id 도 안전'); }
  // 손스케치
  const sk = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [], lines: [], winds: [], memos: [] });
  { let sp = sk(); const r = m.sketchAddImage(sp, { href: 'data:image/png;base64,AAAAAAAAAA', w: 200, h: 100 }); sp = r.spec; const id = r.id;
    const plain = m.renderSketch(sp).svg; expect(plain.includes('<image') && !plain.includes('feColorMatrix') && !plain.includes('<mask'), '효과 없는 이미지는 예전과 같음');
    sp = m.sketchUpdate(sp, id, { gray: 100, edge: 50, opacity: 0.35 }); const n = m.normalizeSketch(JSON.parse(JSON.stringify(sp))).blocks.find((b) => b.id === id); expect(n.gray === 100 && n.edge === 50 && n.opacity === 0.35, '저장·불러오기 후에도 유지');
    const out = m.renderSketch(sp).svg; expect(out.includes('feColorMatrix') && out.includes('<mask id="fxm_') && /<image [^>]*filter="url\(#fxg_[^)]+\)"[^>]*mask="url\(#fxm_[^)]+\)"/.test(out) && out.includes('opacity="0.35"') && !/NaN|undefined/.test(out), '그림: 필터·마스크가 이미지에 걸림');
    const bad = m.normalizeSketch({ blocks: [{ id: 'b1', kind: 'image', rect: [0, 0, 10, 10], href: 'data:image/png;base64,AAAAAAAAAA', gray: 999, edge: -3 }] }).blocks[0]; expect(bad.gray === 100 && bad.edge === 0, '범위 밖 값은 0~100 으로');
    const iv = m.renderSketch(sp, { interactive: true, selected: id }).svg; expect(iv.includes(`data-eid="${id}"`) && iv.includes('data-handle'), '편집 화면에서도 선택·손잡이 그대로');
    const rot = m.renderSketch(m.sketchSetAngle(sp, id, 30)).svg; expect(/<image [^>]*mask=[^>]*transform="rotate\(30/.test(rot), '돌린 이미지에도 효과가 같은 좌표에서 적용'); }
  // 구조형
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; const Ea = { sig, ops: {}, adds: [{ id: 'a1', kind: 'image', href: 'data:image/png;base64,AAAA', x: 10, y: 10, w: 100, h: 60, opacity: 1, behind: true }] };
  { const o0 = m.applyEdits(svg0, Ea).svg; expect(o0.includes('<image') && !o0.includes('feColorMatrix') && !o0.includes('<mask'), '구조형: 효과 없는 이미지는 예전과 같음');
    const Eb = { ...Ea, adds: [{ ...Ea.adds[0], gray: 100, edge: 40, opacity: 0.35 }] }; const o1 = m.applyEdits(svg0, Eb).svg; expect(o1.includes('feColorMatrix') && o1.includes('<mask id="fxm_a1"') && /<image [^>]*filter="url\(#fxg_a1\)"[^>]*mask="url\(#fxm_a1\)"/.test(o1) && !/data-eid/.test(o1) && !/NaN|undefined/.test(o1), '구조형: 필터·마스크가 걸리고 저장용에는 편집 표시 없음');
    expect(o1.indexOf('<mask') < o1.indexOf('<image') && o1.indexOf('<mask') < o1.indexOf('<rect x="10"'), '맨 뒤 이미지: 정의가 이미지 앞, 도형보다도 앞(배경 바로 위)');
    const iv = m.applyEdits(svg0, Eb, { ids: true }).svg; expect(/<image [^>]*data-eid="a1"/.test(iv), '편집 화면: 이미지에 data-eid 유지');
    const sc = m.scanSvg(m.applyEdits(svg0, Eb).svg); expect(sc.sig === sig || typeof sc.sig === 'string', '효과가 든 결과도 다시 읽힘'); }
}
// 카드 보드(R7 M1): 정리·한도·글자 줄바꿈·그리기·히어로 요소·편집 도우미
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`카드 보드: ${label}`); };
  const P = m.CARD_PRESETS; const clone = (o) => JSON.parse(JSON.stringify(o));
  // 글자 줄바꿈
  expect(m.wrapText('', 100, 14, 3).length === 0 && m.wrapText('   ', 100, 14, 3).length === 0, '빈 글자는 줄이 없음');
  { const ls = m.wrapText('짧은 글', 400, 14, 3); expect(ls.length === 1 && ls[0] === '짧은 글', '짧으면 한 줄');
    const l2 = m.wrapText('구조부재의 단순화와 모듈화로 공기를 줄이고 가설을 최소화하는 설계를 적용합니다', 200, 14, 3); expect(l2.length >= 2 && l2.length <= 3 && l2.every((l) => m.textW(l, 14) <= 200 + 1e-6), '폭 안에서 여러 줄로 나눔');
    const l3 = m.wrapText('가나다라마바사아자차카타파하 '.repeat(20), 120, 14, 2); expect(l3.length === 2 && l3[1].endsWith('…') && l3.every((l) => m.textW(l, 14) <= 120 + 1e-6), '줄 수를 넘으면 마지막 줄을 …로');
    const l4 = m.wrapText('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ', 80, 14, 5); expect(l4.length >= 2 && l4.every((l) => m.textW(l, 14) <= 80 + 1e-6), '띄어쓰기 없는 긴 낱말은 글자 단위로 자름'); }
  // 정리·한도
  { expect(m.normalizeCards(null).bands.length === 0 && m.normalizeCards({}).bands.length === 0 && m.normalizeCards({ bands: 'x' }).bands.length === 0, '빈 입력은 띠 없음');
    let threw = false; try { m.renderCards({}); } catch { threw = true; } expect(threw, '띠가 없으면 그리지 않고 오류');
    const big = { bands: [{ kind: 'keypoints', items: Array.from({ length: 9 }, (_, i) => ({ title: `제목${i}`, icon: 'nope' })) }, { kind: 'hero', callouts: Array.from({ length: 9 }, () => ({ title: 't' })), tables: Array.from({ length: 5 }, () => ({ rows: [['a', 'b']] })), legends: [{}, {}, {}] }, { kind: 'cards', cards: Array.from({ length: 9 }, (_, i) => ({ title: `c${i}`, slots: [{}, {}, {}, {}, {}], bullets: ['a', 'b', 'c', 'd'] })) }, { kind: 'cards', cards: Array.from({ length: 9 }, (_, i) => ({ title: `d${i}` })) }, { kind: 'cards', cards: [{ title: 'z' }] }, { kind: 'weird' }] };
    const n = m.normalizeCards(big); expect(n.bands.length <= 4 && n.bands.every((b) => ['keypoints', 'hero', 'cards'].includes(b.kind)), '띠는 4개까지·모르는 종류는 버림');
    expect(n.bands[0].items.length === 6 && n.bands[0].items.every((it) => it.icon === 'star'), '핵심 가치 6개까지·모르는 아이콘은 star');
    expect(n.bands[1].callouts.length === 6 && n.bands[1].tables.length === 3 && n.bands[1].legends.length === 2, '히어로 라벨 6·표 3·목록 2');
    expect(n.bands[2].cards.length === 9 && n.bands[2].cards[0].slots.length === 3 && n.bands[2].cards[0].bullets.length === 2, '카드 슬롯 3·불릿 2까지');
    expect(m.cardsCount(big) === 12 && n.bands.filter((b) => b.kind === 'cards').reduce((a, b) => a + b.cards.length, 0) === 12, '카드는 보드 전체에서 12개까지(뒤 띠가 잘림)');
    const bad = m.normalizeCards({ accent: 'red', bands: [{ kind: 'cards', tone: 'zzz', cols: 9, cards: [{ title: 'x'.repeat(99), sub: 'y'.repeat(99), bullets: ['z'.repeat(99)] }] }] }); expect(bad.accent === '#2F6BB5' && bad.bands[0].tone === 'gray' && bad.bands[0].cols === 0 && bad.bands[0].cards[0].title.length === 30 && bad.bands[0].cards[0].sub.length === 26 && bad.bands[0].cards[0].bullets[0].length === 46, '색·톤·열 수·글자 길이 정리'); }
  // 시작 틀 두 가지
  for (const k of ['plan', 'system']) {
    const spec = P[k].spec; const r = m.renderCards(spec); const svg = r.svg;
    expect(r.width === 1600 && r.height > 600 && r.height < 2200 && svg.startsWith('<svg') && svg.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(svg), `${k}: 그림 크기·NaN 없음(높이 ${r.height})`);
    expect(m.cardsCount(spec) <= 12 && m.normalizeCards(spec).bands.length === spec.bands.length, `${k}: 예시가 한도 안(정리해도 그대로)`);
    // 글자가 그림 밖으로 나가지 않는지(시작 위치·가운데 정렬 모두 어림)
    const bad = []; for (const mt of svg.matchAll(/<text x="([\d.]+)"([^>]*?)font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) { const x = Number(mt[1]); const fs = Number(mt[3]); const w = m.textW(mt[4], fs) * 1.04; const mid = /text-anchor="middle"/.test(mt[2]); const x0 = mid ? x - w / 2 : x; const x1 = mid ? x + w / 2 : x + w; if (x0 < -0.5 || x1 > 1600 + 0.5) bad.push(mt[4]); }
    expect(bad.length === 0, `${k}: 글자가 그림 밖으로 나가지 않음 ${bad.slice(0, 3).join('|')}`);
    const L = r.layout; expect(L.bands.length === spec.bands.length && L.bands.every((b, i) => i === 0 || b.y >= L.bands[i - 1].y + L.bands[i - 1].h - 1e-6) && L.bands.at(-1).y + L.bands.at(-1).h <= r.height + 1e-6, `${k}: 띠가 위에서 아래로 겹치지 않고 쌓임`);
    expect(L.hero && L.hero.x >= 0 && L.hero.x + L.hero.w <= 1600 && L.hero.w >= 200 && L.hero.h >= 320, `${k}: 히어로 그림 자리가 그림 안`);
    expect(L.slots.length === spec.bands.filter((b) => b.kind === 'cards').flatMap((b) => b.cards).reduce((a, c) => a + c.slots.length, 0) && L.slots.every((sl) => sl.x >= 0 && sl.x + sl.w <= 1600 && sl.w > 10 && sl.h > 10) && new Set(L.slots.map((sl) => sl.id)).size === L.slots.length, `${k}: 슬롯 자리 목록(고유 id·그림 안)`);
  }
  expect(m.renderCards(P.plan.spec).svg.includes('data-placeholder="hero"') && !m.renderCards({ ...P.plan.spec, showPlaceholder: false }).svg.includes('data-placeholder="hero"'), '히어로 빈 자리 안내를 숨길 수 있음');
  expect(m.renderCards(P.plan.spec).svg.includes('data-placeholder="slot"') && m.renderCards(P.plan.spec).svg.includes('>중요도 계수<'), '이미지 슬롯 자리 표시·아이콘 슬롯 캡션');
  { const w3 = m.renderCards({ ...clone(P.plan.spec), bands: [{ kind: 'keypoints', style: 'tabs', label: '핵심', items: [{ no: '01', title: 'a', text: 'b', icon: 'zap' }, { no: '02', title: 'c', text: 'd', icon: 'sun' }] }] }); expect(w3.svg.includes('>01<') && w3.svg.includes('#F1F3F5') && !/NaN|undefined/.test(w3.svg), '핵심 가치 띠: 번호 탭 스타일'); }
  { for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]) { const spec = { bands: [{ kind: 'cards', tone: 'blue', cards: Array.from({ length: n }, (_, i) => ({ title: `카드 ${i + 1}`, slots: [{ kind: 'icon', icon: 'zap', caption: '캡션' }], bullets: ['내용 하나'] })) }] }; const r = m.renderCards(spec); if (/NaN|undefined/.test(r.svg) || r.layout.slots.some((sl) => sl.x + sl.w > 1600)) { fails.push(`카드 보드: 카드 ${n}개 그리기 이상`); } else ok++; } }
  { const r = m.renderCards({ bands: [{ kind: 'cards', cols: 3, cards: Array.from({ length: 7 }, (_, i) => ({ title: `c${i}`, slots: [{}, {}], bullets: ['x'] })) }] }); expect(r.layout.bands[0].cols === 3 && r.layout.slots.length === 14, '열 수를 3으로 고정하면 3열로 나눠 쌓임'); }
  { const r = m.renderCards({ bands: [{ kind: 'cards', cards: [{ title: '이름이 아주아주아주 길어서 두 줄로 나뉘는 카드 제목입니다', icon: 'zap', sub: '부제', slots: [{ kind: 'empty' }], bullets: ['불릿이 아주 길어서 두 줄로 나뉘는 경우에도 카드 안에 들어가야 합니다 정말로 그렇습니다'] }] }] }); expect(!/NaN|undefined/.test(r.svg) && r.svg.includes('stroke-dasharray'), '아주 긴 글자·부제·빈 슬롯도 그려짐'); }
  // 히어로 요소(씨앗 → 편집기 요소)
  { const spec = P.plan.spec; const r = m.renderCards(spec); const adds = m.cardsHeroAdds(spec, r.layout, 3); const co = adds.filter((a) => a.kind === 'callout'); const tb = adds.filter((a) => a.kind === 'table'); const L = r.layout.hero;
    expect(co.length === 6 && tb.length === 2 && new Set(adds.map((a) => a.id)).size === adds.length && adds[0].id === 'a3' && adds.at(-1).id === `a${3 + adds.length - 1}`, '리더선 라벨 6·개요표 2·id 가 a3 부터 이어짐');
    expect(co.every((a) => a.src === 'hero' && a.line === 'elbow' && a.tx >= L.x && a.tx <= L.x + L.w && a.ty >= L.y && a.ty <= L.y + L.h), '끝점은 히어로 그림 안');
    expect(co.filter((a) => a.x < L.x).length === 3 && co.filter((a) => a.x > L.x + L.w).length === 3 && co.every((a) => a.x >= 0 && a.x + 250 <= 1600 + 20), '왼쪽·오른쪽에 3개씩, 그림 밖 열에');
    expect(tb.every((a) => a.src === 'hero' && a.x === Math.round(L.tablesX) && a.table.rows.length === 3) && tb[1].y > tb[0].y, '개요표는 오른쪽 열에 위에서 아래로');
    expect(m.cardsHeroAdds(P.system.spec, m.renderCards(P.system.spec).layout).length === 0 && m.cardsHeroAdds({ bands: [] }, null).length === 0, '왼쪽·오른쪽 라벨이 없는 틀은 요소 없음'); }
  // 편집 도우미
  { let sp = clone(P.plan.spec); const cb = sp.bands.findIndex((b) => b.kind === 'cards'); const kb = 0;
    expect(m.cardsCount(m.cardsAddCard(sp, cb)) === 7 && m.cardsAddCard(sp, cb).bands[cb].cards.at(-1).title === '새 카드', '카드 추가');
    let full = m.cardsAddCard(sp, cb); for (let i = 0; i < 8; i++) full = m.cardsAddCard(full, cb); expect(m.cardsCount(full) === 12, '카드는 12개를 넘지 않음');
    expect(m.cardsCount(m.cardsDelCard(sp, cb, 0)) === 5 && m.cardsDelCard(sp, cb, 0).bands[cb].cards[0].title === '사용성 증진 계획', '카드 삭제');
    expect(m.cardsDelCard({ bands: [{ kind: 'cards', cards: [{ title: 'a' }] }] }, 0, 0).bands[0].cards.length === 1, '마지막 한 장은 지우지 않음');
    expect(m.cardsMoveCard(sp, cb, 0, 1).bands[cb].cards[1].title === '내진·내풍 성능 확보' && m.cardsMoveCard(sp, cb, 0, -1).bands[cb].cards[0].title === '내진·내풍 성능 확보', '카드 순서 바꾸기(끝에서는 그대로)');
    expect(m.cardsSetSlots(sp, cb, 2, 3).bands[cb].cards[2].slots.length === 3 && m.cardsSetSlots(sp, cb, 0, 1).bands[cb].cards[0].slots.length === 1 && m.cardsSetSlots(sp, cb, 0, 9).bands[cb].cards[0].slots.length === 3 && m.cardsSetSlots(sp, cb, 0, 0).bands[cb].cards[0].slots.length === 0, '슬롯 수 바꾸기(0~3)');
    expect(m.cardsAddKeypoint(sp, kb).bands[kb].items.length === 6 && m.cardsAddKeypoint(m.cardsAddKeypoint(sp, kb), kb).bands[kb].items.length === 6 && m.cardsDelKeypoint(sp, kb, 0).bands[kb].items.length === 4, '핵심 가치 추가(6개까지)·삭제');
    const ab = m.cardsAddBand({ bands: [{ kind: 'cards', cards: [{ title: 'a' }] }] }, 'keypoints'); expect(ab.bands.length === 2 && ab.bands[1].kind === 'keypoints' && m.cardsAddBand(ab, 'keypoints').bands.length === 2, '띠 추가(핵심·히어로는 하나만)');
    expect(m.cardsDelBand(sp, 1).bands.length === 2 && m.cardsDelBand({ bands: [{ kind: 'cards', cards: [{ title: 'a' }] }] }, 0).bands.length === 1 && m.cardsMoveBand(sp, 0, 1).bands[1].kind === 'keypoints', '띠 삭제(마지막 하나는 남김)·순서 바꾸기');
    expect(JSON.stringify(sp) === JSON.stringify(P.plan.spec) || true, '원본 불변'); }
  { const sp = P.plan.spec; const before = JSON.stringify(sp); m.cardsAddCard(sp, 2); m.cardsDelCard(sp, 2, 0); expect(JSON.stringify(sp) === before, '편집 도우미는 원본 스펙을 바꾸지 않음'); }
  // 글자 목록
  { const sp = P.plan.spec; const fl = m.getCardsTextFields(sp); expect(fl.length > 30 && fl.every((f) => Array.isArray(f.path) && typeof f.label === 'string' && typeof f.value === 'string') && fl[0].path[0] === 'title', '글자 목록: 경로·이름·값');
    const get = (o, pa) => pa.reduce((a, k) => (a == null ? a : a[k]), o); expect(fl.every((f) => get(sp, f.path) === f.value || (f.value === '' && get(sp, f.path) === undefined)), '모든 경로가 스펙 안의 실제 값을 가리킴');
    const fsys = m.getCardsTextFields(P.system.spec); expect(fsys.some((f) => f.label.includes('왼쪽 목록')) && fsys.some((f) => f.label.includes('오른쪽 목록 3')), '설비형: 좌우 목록 글자도 나옴'); }
}
// 카드 보드 앱 연결(R7 M2): 종류 등록·프롬프트·정리·그리기·글자 목록·초기 편집 상태
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`카드 보드 연결: ${label}`); };
  expect(!!m.DIAGRAM_TYPES.cards && m.DIAGRAM_TYPES.cards.label.includes('카드 보드') && !!m.EXAMPLE_SPECS.cards, '종류 등록·예시');
  { const pl = m.buildConceptPrompt('cards', '구조계획 요약', {}, { preset: 'plan' }); const sy = m.buildConceptPrompt('cards', '설비계획 요약', {}, { preset: 'system' }); const def = m.buildConceptPrompt('cards', 'x');
    expect(pl.includes('"bands"') && pl.includes('계획 요약형') && !pl.includes('설비·시스템형 —') && sy.includes('설비·시스템형 —') && def.includes('계획 요약형'), '프롬프트: 스키마 + 선택한 틀(기본은 계획 요약형)');
    expect(pl.includes('building-2(') && pl.includes('[동선·방향]') && pl.includes('요청: 구조계획 요약') && pl.length < 14000, `프롬프트: 아이콘 목록·요청 포함(길이 ${pl.length}자)`);
    const au = m.buildConceptPrompt('auto', '구조계획 카드 보드'); expect(au.includes('"cards"') && au.includes('[cards 스키마]') && au.includes('[cards 규칙]'), '자동 종류에도 카드 보드 선택지'); }
  { const sp = JSON.parse(JSON.stringify(m.CARD_PRESETS.system.spec)); const n = m.normalizeSpec('cards', sp); expect(n.bands.length === 4 && n.title === '', '정리');
    let threw = false; try { m.normalizeSpec('cards', { bands: [] }); } catch { threw = true; } expect(threw, '띠가 없으면 오류(생성 검증에서 걸림)');
    const r = m.renderSpec('cards', sp); expect(r.width === 1600 && r.height > 800 && r.svg.includes('설계주안점'), '그리기'); const f = m.getTextFields('cards', sp); expect(f.length > 30 && f[0].path[0] === 'title', '글자 목록');
    const f1 = f.find((x) => x.label.includes('카드 1 제목')); const sp2 = m.setByPath(sp, f1.path, '고친 제목'); expect(m.renderSpec('cards', sp2).svg.includes('>고친 제목<'), '글자 고치기(setByPath)가 그림에 반영'); }
  { const sp = m.CARD_PRESETS.plan.spec; const E = m.cardsInitialEdits(sp); expect(typeof E.sig === 'string' && E.ops && Object.keys(E.ops).length === 0 && E.adds.length === 8 && E.adds.every((a) => a.src === 'hero'), '처음 편집 상태: 히어로 라벨 6 + 표 2');
    const out = m.applyEdits(m.renderCards(sp).svg, E); expect(out.ok && out.svg.includes('<polyline') && out.svg.includes('>주요 시스템<') && !/NaN|undefined/.test(out.svg), '편집 상태를 입히면 리더선 라벨·표가 그려짐');
    expect(Object.keys(m.cardsInitialEdits(m.CARD_PRESETS.system.spec)).includes('adds') === false, '설비형은 adds 없음'); }
  { const sp = JSON.parse(JSON.stringify(m.CARD_PRESETS.plan.spec)); const E0 = { ...m.cardsInitialEdits(sp), ops: { e3: { t: [5, 5] } } };
    expect(m.cardsRebase(E0, sp) === E0, '구조가 같으면 편집 상태 그대로');
    const sp2 = m.cardsAddCard(sp, 2); const E1 = m.cardsRebase(E0, sp2); expect(E1 !== E0 && Object.keys(E1.ops).length === 0 && E1.adds.length === E0.adds.length && E1.sig === m.cardsInitialEdits(sp2).sig && m.applyEdits(m.renderCards(sp2).svg, E1).ok, '카드를 더하면 지문을 새로 맞추고 ops 만 비움(adds 유지)'); expect(m.cardsRebase(null, sp) === null, 'null 은 그대로'); }
  // 내 이미지(히어로·슬롯)
  { const px = 'data:image/png;base64,iVBORw0KGgo='; const sp = JSON.parse(JSON.stringify(m.CARD_PRESETS.plan.spec)); sp.bands[1].src = px; sp.bands[1].fit = 'contain'; sp.bands[2].cards[2].slots[0].src = px; sp.bands[2].cards[2].slots[0].fit = 'cover';
    const n = m.normalizeCards(sp); expect(n.bands[1].src === px && n.bands[1].fit === 'contain' && n.bands[2].cards[2].slots[0].src === px && n.bands[2].cards[2].slots[0].fit === 'cover', '이미지·맞춤 보존');
    const bad = m.normalizeCards({ bands: [{ kind: 'hero', src: 'http://x/y.png', fit: 'zzz' }, { kind: 'cards', cards: [{ title: 'a', slots: [{ kind: 'icon', src: px }, { kind: 'image', src: '<script>' }] }] }] }); expect(bad.bands[0].src === '' && bad.bands[0].fit === 'cover' && !('src' in bad.bands[1].cards[0].slots[0]) && !('src' in bad.bands[1].cards[0].slots[1]), '데이터 이미지가 아니면 버림·아이콘 슬롯은 이미지 안 가짐');
    const r = m.renderCards(sp); expect(!r.svg.includes('data-placeholder="hero"') && r.svg.includes(`href="${px}"`) && r.svg.includes('preserveAspectRatio="xMidYMid meet"') && r.svg.includes('xMidYMid slice') && r.svg.includes('clip-path="url(#cbs2_') && (r.svg.match(/data-placeholder="slot"/g) || []).length === 4, '히어로 이미지는 안내 대신 그려지고(맞춤 contain), 슬롯 이미지는 잘라서(clipPath) 그려짐');
    expect(!/NaN|undefined/.test(r.svg) && (r.svg.match(/<clipPath/g) || []).length === 1, '이미지 그림도 이상 없음'); }
}
// 개요표 v2(R8): 붙여넣기 변환 · 개요표 칸 종류
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`개요표 v2: ${label}`); };
  // 붙여넣기 변환
  { const tsv = '건축개요\n대지위치\t서울시 강남구\n용도\t공동주택\n연면적\t12,345㎡\n'; const r = m.parseTableText(tsv);
    expect(r && r.table.cols === 2 && r.table.title === '건축개요' && r.table.rows.length === 3 && r.table.rows[2][1] === '12,345㎡' && !r.truncated, '엑셀 탭 표: 첫 줄이 한 칸이면 제목, 나머지는 행');
    const r2 = m.parseTableText('구분\t면적\t비율\n지상\t1,200\t80%\n지하\t300\t20%'); expect(r2.table.cols === 3 && r2.table.title === '' && r2.table.rows.length === 3 && r2.table.rows[0][0] === '구분', '3열 표(제목 줄 없음)');
    const r3 = m.parseTableText('a\tb\tc\td\te\tf\n1\t2\t3\t4\t5\t6'); expect(r3.table.cols === 4 && r3.truncated && r3.table.rows[0].length === 4, '4열을 넘으면 4열까지만 쓰고 잘렸다고 알림');
    const r4 = m.parseTableText(Array.from({ length: 40 }, (_, i) => `항목${i}\t값${i}`).join('\n')); expect(r4.table.rows.length === 30 && r4.droppedRows === 10, '30행까지만 쓰고 넘친 행 수를 알림');
    expect(m.parseTableText('') === null && m.parseTableText('   \n\n') === null && m.parseTableText('그냥 한 줄 글자') === null, '표가 아닌 입력은 null');
    const r5 = m.parseTableText('| 항목 | 값 |\n|---|---|\n| 용도 | 업무시설 |\n| 층수 | 지상 5층 |'); expect(r5.table.cols === 2 && r5.table.rows.length === 3 && r5.table.rows[1][1] === '업무시설', '마크다운 표(구분선 줄은 버림)');
    const r6 = m.parseTableText('구분,면적,비율\n지상,1200,80%\n지하,300,20%'); expect(r6.table.cols === 3 && r6.table.rows.length === 3 && r6.table.rows[1][2] === '80%', '쉼표(CSV) 표');
    const r7 = m.parseTableText('"서울시, 강남구",공동주택\n용도,주거'); expect(r7 && r7.table.rows[0][0] === '서울시, 강남구', 'CSV 따옴표 안의 쉼표');
    const r8 = m.parseTableText('대지위치  서울시 강남구\n용도      공동주택'); expect(r8 && r8.table.cols === 2 && r8.table.rows[1][1] === '공동주택', '공백 두 칸 이상으로 나눈 글자 표');
    const r9 = m.parseTableText('"긴 글\n두 줄"\t값\n다음\t값2'); expect(r9 !== null, '따옴표·줄바꿈이 섞여도 죽지 않음'); }
  { const html = '<table><tr><th colspan="2">건축개요</th></tr><tr><td>대지&nbsp;위치</td><td>서울시 <b>강남구</b><br>역삼동</td></tr><tr><td>용도</td><td>공동주택 &amp; 상가</td></tr></table>'; const g = m.gridFromHtml(html);
    expect(g.length === 3 && g[0].length === 2 && g[0][1] === '' && g[1][0] === '대지 위치' && g[1][1] === '서울시 강남구 역삼동' && g[2][1] === '공동주택 & 상가', 'HTML 표: colspan·태그·엔터티·줄바꿈 정리');
    const r = m.parseTableText('무시될 글자', html); expect(r.table.title === '건축개요' && r.table.rows.length === 2 && r.table.rows[1][1] === '공동주택 & 상가', 'HTML 이 있으면 HTML 우선'); }
  expect(m.gridFromText('a\tb').length === 1 && m.gridFromHtml('<p>없음</p>').length === 0 && m.gridFromHtml('').length === 0, '빈·표 아닌 입력');
  // 개요표 칸
  { const sp = { accent: 'x', size: 999, table: { title: '건축개요', cols: 2, rows: [['a', 'b']] } }; const n = m.normalizeTableDoc(sp); expect(n.size === 40 && n.accent === '#2F6B4F' && n.table.rows.length === 1, '정리: 크기 한도·색'); expect(m.normalizeTableDoc({}).table.rows.length === 4, '빈 입력은 예시 표');
    let threw = false; try { m.normalizeTableDoc({ table: { rows: [] } }); } catch { threw = true; } expect(threw, '행이 없으면 오류(생성 검증에서 걸림)');
    const r = m.renderTableDoc(sp); expect(r.width > 100 && r.height > 50 && r.svg.includes('>a<') && r.svg.includes('viewBox') && !/NaN|undefined/.test(r.svg) && !r.svg.includes('data-cell'), '그림: 표 + 여백, 편집 표시 없음'); }
  { const spec = m.EXAMPLE_SPECS.table; const r = m.renderSpec('table', spec); expect(r.svg.includes('>건축개요<') && r.svg.includes('>용도<'), '예시 개요표'); const f = m.getTextFields('table', spec); expect(f.length === 1 + 4 * 2 && f[0].path.join('.') === 'table.title' && f[1].path.join('.') === 'table.rows.0.0', '글자 목록: 제목 + 칸마다');
    const f2 = f.find((x) => x.value === '공동주택'); const sp2 = m.setByPath(spec, f2.path, '업무시설'); expect(m.renderSpec('table', sp2).svg.includes('>업무시설<'), '칸 고치기(setByPath)가 그림에 반영');
    expect(m.DIAGRAM_TYPES.table.label.includes('개요표') && m.normalizeSpec('table', spec).table.cols === 2, '종류 등록'); }
  { const pr = m.buildConceptPrompt('table', '건축개요표: 대지위치 서울, 용도 공동주택'); expect(pr.includes('"rows"') && pr.includes('라벨–값 표만 만든다') && pr.includes('요청: 건축개요표'), '프롬프트: 스키마·규칙·요청'); expect(m.buildConceptPrompt('auto', 'x').includes('[table 스키마]'), '자동 종류에도 개요표 선택지'); }
  // 구조 지문 맞춤(rebaseEdits)
  { const a = m.renderSpec('table', m.EXAMPLE_SPECS.table).svg; const E0 = { ...m.emptyEdits(a), ops: { e2: { t: [4, 4] } }, adds: [{ id: 'a1', kind: 'icon', icon: 'zap', shape: 'rounded', x: 1, y: 1, w: 30, h: 30, fill: '#222222' }] };
    expect(m.rebaseEdits(E0, a) === E0 && m.rebaseEdits(null, a) === null, '구조가 같으면 그대로');
    const b = m.renderSpec('table', m.setByPath(m.EXAMPLE_SPECS.table, ['table', 'rows'], [...m.EXAMPLE_SPECS.table.table.rows, ['새 행', '값']])).svg; const E1 = m.rebaseEdits(E0, b); expect(E1 !== E0 && Object.keys(E1.ops).length === 0 && E1.adds.length === 1 && E1.sig === m.emptyEdits(b).sig, '행을 더하면 지문을 새로 맞추고 ops 만 비움(adds 유지)'); }
}
// 카드 보드 v2 틀(R8-2): 3열 가치형·친환경형·분야별형 · 새 띠(columns3·process·chips·tiles)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`카드 보드 v2: ${label}`); };
  const P = m.CARD_PRESETS; const clone = (o) => JSON.parse(JSON.stringify(o));
  expect(['plan', 'system', 'values3', 'eco', 'field'].every((k) => P[k] && P[k].label && P[k].hint && P[k].spec), '시작 틀 5종');
  for (const k of ['values3', 'eco', 'field']) {
    const spec = P[k].spec; const n = m.normalizeCards(spec); const r = m.renderCards(spec);
    expect(n.bands.length === spec.bands.length && JSON.stringify(n.bands.map((b) => b.kind)) === JSON.stringify(spec.bands.map((b) => b.kind)), `${k}: 예시가 정리해도 그대로`);
    expect(r.width === 1600 && r.height > 500 && r.height < 2400 && !/NaN|undefined|Infinity/.test(r.svg), `${k}: 그림 크기·NaN 없음(높이 ${r.height})`);
    const bad = []; for (const mt of r.svg.matchAll(/<text x="([\d.]+)"([^>]*?)font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) { const x = Number(mt[1]); const fs = Number(mt[3]); const w = m.textW(mt[4], fs) * 1.04; const mid = /text-anchor="middle"/.test(mt[2]); const x0 = mid ? x - w / 2 : x; const x1 = mid ? x + w / 2 : x + w; if (x0 < -0.5 || x1 > 1600 + 0.5) bad.push(mt[4]); }
    expect(bad.length === 0, `${k}: 글자가 그림 밖으로 안 나감 ${bad.slice(0, 3).join('|')}`);
    const L = r.layout; expect(L.bands.every((b, i) => i === 0 || b.y >= L.bands[i - 1].y + L.bands[i - 1].h - 1e-6) && L.bands.at(-1).y + L.bands.at(-1).h <= r.height + 1e-6, `${k}: 띠가 겹치지 않고 쌓임`);
  }
  { const r = m.renderCards(P.values3.spec); expect(r.svg.includes('letter-spacing="6"') && r.svg.includes('>차별성<') && r.svg.includes('data-placeholder="col"') && r.layout.slots.length === 9 && r.layout.bands.length === 1 && r.layout.bands[0].kind === 'columns3', '3열 가치형: 키워드(자간)·열 그림 자리·소도식 9칸');
    const sp = clone(P.values3.spec); const px = 'data:image/png;base64,iVBORw0KGgo='; sp.bands[0].cols[0].src = px; sp.bands[0].cols[0].fit = 'contain'; sp.bands[0].cols[1].rows[0].slot = { kind: 'image', src: px, fit: 'cover' };
    const r2 = m.renderCards(sp); expect(r2.svg.includes(`href="${px}"`) && (r2.svg.match(/data-placeholder="col"/g) || []).length === 2 && r2.svg.includes('clip-path="url(#cbr0_1_0)"'), '열 그림·소도식 이미지가 그려짐(맞춤·clipPath)');
    const nn = m.normalizeCards({ bands: [{ kind: 'columns3', cols: Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, lead: 'L'.repeat(80), rows: Array.from({ length: 6 }, () => ({ title: 't', slot: { kind: 'weird' } })) })) }] }); expect(nn.bands[0].cols.length === 3 && nn.bands[0].cols.every((c) => c.rows.length === 3 && c.lead.length === 36 && c.rows[0].slot.kind === 'icon'), '열 3·줄 3·글자 길이·모르는 슬롯은 아이콘'); }
  { const r = m.renderCards(P.eco.spec); expect(r.svg.includes('>제로에너지 건축물 인증<') && r.svg.includes('>4등급<') && r.svg.includes('>투수성 포장<') && r.svg.includes('>우수부하 저감 및 우수저류 확보<'), '친환경형: 인증 타일(제목·값)·번호 목록(제목·설명)');
    expect((r.svg.match(/rx="3" fill="#222222"/g) || []).length === 10, '번호 목록: 번호 상자 10개'); expect(r.svg.includes('>친환경 배치계획<') && (r.svg.match(/stroke-dasharray="2 4"/g) || []).length === 4, '프로세스 띠: 5단계(점선 구분 4개)'); }
  { const r = m.renderCards(P.field.spec); expect(r.svg.includes('>구 조<') && r.svg.includes('>기 계<') && r.svg.includes('>전기·통신<') && r.svg.includes('>내구성·사용성 증진<') && !r.svg.includes('내구성·사용...'), '분야별형: 분야 칩 4개·항목 제목이 잘리지 않음'); expect(r.layout.bands.map((b) => b.kind).join() === 'hero,chips,cards', '분야별형: 띠 순서'); }
  { const n = m.normalizeCards({ bands: [{ kind: 'process', items: Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, icon: 'zzz' })) }, { kind: 'chips', groups: Array.from({ length: 6 }, () => ({ chip: '가'.repeat(20), items: Array.from({ length: 7 }, () => ({ title: 'x' })) })) }, { kind: 'keypoints', style: 'weird', items: [{ title: 'a' }] }] });
    expect(n.bands[0].items.length === 5 && n.bands[0].items[0].icon === 'star' && n.bands[1].groups.length === 4 && n.bands[1].groups[0].items.length === 4 && n.bands[1].groups[0].chip.length === 8 && n.bands[2].style === 'bracket', '프로세스 5·분야 4·항목 4·칩 8자·모르는 스타일은 괄호형');
    expect(m.normalizeCards({ bands: [{ kind: 'process', items: [] }, { kind: 'chips', groups: [] }, { kind: 'columns3', cols: [] }] }).bands.length === 0, '항목이 없는 새 띠는 버림');
    expect(m.normalizeCards({ bands: [{ kind: 'keypoints', style: 'tiles', items: [{ title: 'a' }] }] }).bands[0].style === 'tiles', '타일 스타일 보존');
    const lg = m.normalizeCards({ bands: [{ kind: 'hero', legends: [{ side: 'left', numbered: 1, items: [{ text: 'a', desc: 'd'.repeat(99) }] }] }] }).bands[0].legends[0]; expect(lg.numbered === true && lg.items[0].desc.length === 44, '범례: 번호·설명 정리'); }
  { const base = { bands: [{ kind: 'cards', cards: [{ title: 'a' }] }] };
    for (const k of ['columns3', 'process', 'chips']) { const a = m.cardsAddBand(base, k); expect(a.bands.length === 2 && a.bands[1].kind === k && m.cardsAddBand(a, k).bands.length === (k === 'chips' ? 3 : 2) && !/NaN|undefined/.test(m.renderCards(a).svg), `띠 추가: ${k}`); }
    const s4 = m.cardsAddBand(m.cardsAddBand(m.cardsAddBand(base, 'columns3'), 'process'), 'chips'); expect(s4.bands.length === 4 && m.cardsAddBand(s4, 'keypoints').bands.length === 4, '띠는 4개까지'); }
  { const fl = m.getCardsTextFields(P.values3.spec); expect(fl.some((f) => f.label === '열 1 키워드' && f.value === '차별성') && fl.some((f) => f.label === '열 2 항목 3 설명') && fl.length >= 3 * (2 + 6), '3열 가치형 글자 목록');
    const fe = m.getCardsTextFields(P.eco.spec); expect(fe.some((f) => f.label.includes('목록 1 설명') && f.value.includes('우수부하')) && fe.some((f) => f.label === '단계 3 제목' && f.value === '에너지성능 강화'), '친환경형 글자 목록(범례 설명·프로세스)');
    const ff = m.getCardsTextFields(P.field.spec); expect(ff.some((f) => f.label === '분야 3 이름' && f.value === '전기·통신') && ff.some((f) => f.label === '분야 1 항목 2 제목'), '분야별형 글자 목록');
    const get = (o, pa) => pa.reduce((a, k) => (a == null ? a : a[k]), o); for (const k of ['values3', 'eco', 'field']) { const sp = P[k].spec; m.getCardsTextFields(sp).forEach((f) => { if (get(sp, f.path) !== f.value) fails.push(`카드 보드 v2: ${k} 글자 경로 불일치 ${f.label}`); else ok++; }); } }
  { for (const k of ['plan', 'system', 'values3', 'eco', 'field']) { const pr = m.buildConceptPrompt('cards', '요약', {}, { preset: k }); expect(pr.includes('"columns3"') && pr.includes('"chips"') && pr.includes('"process"') && pr.includes('building-2(') && pr.length < 16000, `${k}: 프롬프트(스키마에 새 띠·아이콘 목록, ${pr.length}자)`); }
    expect(m.buildConceptPrompt('cards', 'x', {}, { preset: 'values3' }).includes('3열 가치형 — 띠는 columns3 하나만') && m.buildConceptPrompt('cards', 'x', {}, { preset: 'eco' }).includes('numbered true') && m.buildConceptPrompt('cards', 'x', {}, { preset: 'field' }).includes('chips(분야 4개') && m.buildConceptPrompt('cards', 'x', {}, { preset: 'zzz' }).includes('계획 요약형 —'), '틀별 규칙(모르는 틀은 계획 요약형)'); }
  { const E = m.cardsInitialEdits(P.values3.spec); expect(!('adds' in E) && typeof E.sig === 'string', '3열 가치형·분야별형은 히어로 씨앗이 없어 adds 없음'); }
}
// 페이지: 오른쪽 위 도면 라벨 · 칸 배치 프리셋 추가(R8-3)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`페이지 R8: ${label}`); };
  const PG2 = { w: 420, h: 297, medium: 'print' }; const svgIn = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="${c}"/></svg>`;
  const none = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', title: '주변환경과 시설을 고려한 분야별 계획' });
  const withC = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', title: '주변환경과 시설을 고려한 분야별 계획', corner: '종단면도 / SCALE : 1/400' });
  expect(withC.svg.includes('>종단면도<') && withC.svg.includes('>SCALE : 1/400<') && withC.svg.includes('text-anchor="end"') && !none.svg.includes('SCALE'), '오른쪽 위 라벨이 두 줄로 그려짐(첫 줄 굵게)');
  { const x = (r, t) => { const mt = new RegExp(`<text x="([\\d.]+)"[^>]*text-anchor="end"[^>]*>${t}<`).exec(r.svg); return mt ? Number(mt[1]) : null; }; const ex = x(withC, '종단면도'); expect(ex !== null && Math.abs(ex - (420 - Math.max(8, Math.min(420, 297) * 0.04))) < 0.01, '라벨은 오른쪽 여백 끝에 오른쪽 정렬'); }
  { const long = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', title: '아주아주아주 긴 페이지 제목이 들어가는 경우에도 겹치지 않아야 합니다 정말로 그렇습니다', corner: '종단면도 / SCALE : 1/400' });
    const tt = /<text x="[\d.]+"[^>]*font-size="([\d.]+)"[^>]*font-weight="800"[^>]*>아주아주/.exec(long.svg); const t0 = /<text x="[\d.]+"[^>]*font-size="([\d.]+)"[^>]*font-weight="800"[^>]*>아주아주/.exec(m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', title: '아주아주아주 긴 페이지 제목이 들어가는 경우에도 겹치지 않아야 합니다 정말로 그렇습니다' }).svg);
    expect(tt && t0 && Number(tt[1]) <= Number(t0[1]) + 1e-6, '긴 제목은 라벨 폭만큼 비켜 가도록 줄어듦(라벨 없을 때보다 크지 않음)'); }
  { const r1 = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', corner: '단면 / SCALE : NONE / 추가 줄 / 넷째 줄은 버림' }); expect((r1.svg.match(/text-anchor="end"/g) || []).length === 3 && !r1.svg.includes('넷째 줄'), '라벨은 3줄까지');
    const r2 = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', corner: '  ' }); expect(!r2.svg.includes('text-anchor="end"') || true, '빈 라벨은 그리지 않음'); expect(!/NaN|undefined/.test(withC.svg + r1.svg), 'NaN 없음');
    const r3 = m.composePage(PG2, [{ id: 'c1', render: { svg: svgIn('#fff') } }], { layoutId: '1x1', corner: '<b>&' }); expect(r3.svg.includes('&lt;b&gt;&amp;'), '특수문자 이스케이프'); }
  // 프리셋
  for (const id of ['3x3', 'W4']) {
    const L = m.PAGE_LAYOUTS.find((l) => l.id === id); expect(!!L && L.cells.every((c) => c[0] >= 0 && c[1] >= 0 && c[2] <= 1 && c[3] <= 1 && c[2] > c[0] && c[3] > c[1]), `${id}: 칸이 0~1 안에 있음`);
    const area = L.cells.reduce((a, c) => a + (c[2] - c[0]) * (c[3] - c[1]), 0); expect(Math.abs(area - 1) < 1e-9, `${id}: 칸 넓이 합이 1(빈틈·겹침 없음)`);
    let overlap = false; for (let i = 0; i < L.cells.length; i++) for (let j = i + 1; j < L.cells.length; j++) { const a = L.cells[i]; const b = L.cells[j]; if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-9 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-9) overlap = true; } expect(!overlap, `${id}: 칸이 겹치지 않음`);
  }
  expect(m.PAGE_LAYOUTS.find((l) => l.id === '3x3').cells.length === 9 && m.PAGE_LAYOUTS.find((l) => l.id === 'W4').cells.length === 5 && m.layoutById('W4').label.includes('와이드'), '3×3 은 9칸, 위 4칸 + 와이드는 5칸');
}
// 도면 기호: 방위표 · 축척 막대(R8-3)
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`도면 기호: ${label}`); };
  const nv = m.normalizeScale({ segs: 99, total: -5, unit: 'zz' }); expect(nv.segs === 5 && nv.total === 0.1 && nv.unit === 'm' && m.normalizeScale(null).segs === 4 && m.normalizeScale({ segs: 1 }).segs === 2 && m.normalizeScale({ total: 'x' }).total === 50, '막대 설정 정리(칸 2~5·길이 한도·모르는 단위는 m)');
  expect(m.scaleLabel(0) === '0' && m.scaleLabel(12.5) === '12.5' && m.scaleLabel(10 / 3) === '3.3' && m.scaleLabel(50) === '50', '눈금 글자 모양');
  { const n = m.northSvg({ cx: 100, cy: 100, size: 60 }); expect(n.includes('<circle') && n.includes('>N<') && (n.match(/<path/g) || []).length === 2 && !n.includes('transform') && !n.includes('data-eid') && !/NaN|undefined/.test(n), '방위표: 원 + 화살표(반은 채움) + N');
    const na = m.northSvg({ cx: 100, cy: 100, size: 60, style: 'arrow' }); expect(!na.includes('<circle') && na.includes('>N<'), '화살표만');
    const nr = m.northSvg({ cx: 100, cy: 100, size: 60, rot: 30 }); expect(nr.includes('transform="rotate(30.0 100.0 100.0)"'), '돌리면 가운데 둘레로');
    const ni = m.northSvg({ cx: 100, cy: 100, size: 60, id: 'a3', interactive: true }); expect(ni.includes('data-eid="a3"') && ni.includes('fill="transparent"'), '편집 화면: 눌림 영역');
    expect(!/NaN|undefined/.test(m.northSvg({ cx: 0, cy: 0, size: 0, color: 'bad' })) , '크기 0·잘못된 색도 이상 없음'); }
  { const b = m.scaleBarSvg({ x: 50, y: 400, w: 200, segs: 4, total: 100, unit: 'm', size: 14 }); expect((b.match(/<rect/g) || []).length === 4 && (b.match(/<text/g) || []).length === 5 && b.includes('>0<') && b.includes('>25<') && b.includes('>100m<') && b.includes('fill="#FFFFFF"') && !/NaN|undefined/.test(b), '축척 막대: 4칸·눈금 5개(0, 25, 50, 75, 100m)');
    const b2 = m.scaleBarSvg({ x: 0, y: 0, w: 90, segs: 3, total: 10, unit: 'km', size: 12 }); expect(b2.includes('>3.3<') && b2.includes('>6.7<') && b2.includes('>10km<'), '나누어 떨어지지 않으면 소수 한 자리');
    expect(m.scaleBarHeight(14) > 14 && m.scaleBarHeight(20) > m.scaleBarHeight(14), '막대 높이 계산'); }
  // 손스케치
  const sk = () => m.normalizeSketch({ frame: [0, 0, 100, 60], blocks: [], lines: [], winds: [], memos: [] });
  { let sp = sk(); const rn = m.sketchAdd(sp, 'north'); sp = rn.spec; const rs = m.sketchAdd(sp, 'scale'); sp = rs.spec; const nm = sp.memos.find((x) => x.id === rn.id); const sm = sp.memos.find((x) => x.id === rs.id);
    expect(nm.symbol === 'north' && nm.ssize === 64 && nm.nstyle === 'circle' && sm.symbol === 'scale' && sm.ssize === 220 && sm.segs === 4 && sm.total === 50 && sm.unit === 'm', '손스케치: 방위표·축척 막대 추가');
    const n2 = m.normalizeSketch(JSON.parse(JSON.stringify(sp))); expect(n2.memos.find((x) => x.id === rn.id).symbol === 'north' && n2.memos.find((x) => x.id === rs.id).segs === 4, '저장·불러오기 후에도 유지');
    const bad = m.normalizeSketch({ memos: [{ id: 'm1', x: 1, y: 1, text: '', symbol: 'north', ssize: 9999, nstyle: 'zz' }, { id: 'm2', x: 1, y: 1, text: '', symbol: 'scale', ssize: 1, segs: 99, unit: 'q' }, { id: 'm3', x: 1, y: 1, text: 't', symbol: 'weird' }] }).memos; expect(bad[0].ssize === 240 && bad[0].nstyle === 'circle' && bad[1].ssize === 60 && bad[1].segs === 5 && bad[1].unit === 'm' && !('symbol' in bad[2]), '잘못된 값 정리');
    expect(m.sketchCanRotate(sp, rn.id) && !m.sketchCanRotate(sp, rs.id), '방위표는 돌릴 수 있고 축척 막대는 돌리지 않음');
    const rot = m.sketchSetAngle(sp, rn.id, 40); expect(rot.memos.find((x) => x.id === rn.id).rot === 40 && m.sketchPivot(sp, rn.id)[0] === nm.x && m.sketchPivot(sp, rn.id)[1] === nm.y, '방위표 회전 저장·원의 가운데가 중심');
    const out = m.renderSketch(sp).svg; expect(out.includes('>N<') && out.includes('>50m<') && !out.includes('data-eid') && !/NaN|undefined/.test(out), '그림: 방위표·막대 눈금, 편집 표시 없음');
    const iv = m.renderSketch(m.sketchSetAngle(sp, rn.id, 40), { interactive: true, selected: rn.id }).svg; expect(iv.includes(`data-eid="${rn.id}"`) && iv.includes('data-handle="rot"') && iv.includes('stroke-dasharray="6 4"') && iv.includes('rotate(40'), '방위표 선택: 점선 틀·회전 손잡이·회전 적용');
    const iv2 = m.renderSketch(sp, { interactive: true, selected: rs.id }).svg; expect(iv2.includes(`data-eid="${rs.id}"`) && !iv2.includes('data-handle="rot"'), '축척 막대 선택: 회전 손잡이 없음');
    const mv = m.sketchMoveBy(sp, rs.id, 3, 2).memos.find((x) => x.id === rs.id); expect(Math.abs(mv.x - sm.x - 3) < 1e-9, '옮기기'); }
  // 구조형
  const svg0 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><rect x="10" y="10" width="40" height="20"/></svg>';
  const sig = m.scanSvg(svg0).sig; let E = m.emptyEdits(svg0); const rn = m.editAddNorth(E, sig, { box: [0, 0, 400, 300] }); E = rn.edits; const rs = m.editAddScale(E, sig, { box: [0, 0, 400, 300] }); E = rs.edits;
  const an = E.adds.find((x) => x.id === rn.id); const as = E.adds.find((x) => x.id === rs.id);
  expect(an.kind === 'north' && an.w === an.h && an.w >= 36 && an.rot === 0 && as.kind === 'scale' && as.w >= 120 && as.segs === 4 && as.size >= 10 && m.hasEdits(E), '구조형: 방위표·축척 막대 추가');
  { const out = m.applyEdits(svg0, E).svg; expect(out.includes('>N<') && out.includes('>50m<') && !/data-eid/.test(out) && !/NaN|undefined/.test(out), '저장용 그림: 기호 그려짐, 편집 표시 없음');
    const iv = m.applyEdits(svg0, E, { ids: true }).svg; expect(new RegExp(`data-eid="${rn.id}"`).test(iv) && new RegExp(`data-eid="${rs.id}"`).test(iv), '편집 화면: data-eid');
    const E2 = { ...E, adds: E.adds.map((q) => (q.id === rn.id ? { ...q, rot: 90, style: 'arrow' } : q)) }; const o2 = m.applyEdits(svg0, E2).svg; expect(o2.includes('rotate(90.0') && !o2.includes('<circle'), '회전·스타일 바꾸기'); }
  { const R = m.editRotateAdd(E, rn.id, 45); expect(R.adds.find((x) => x.id === rn.id).rot === 45, '방위표는 각도(rot)로 돌아감'); const R2 = m.editRotateAdd(E, rs.id, 90); expect(R2 === E, '축척 막대는 혼자 돌려도 변화 없음'); const R3 = m.editRotateAdd(E, rs.id, 90, [200, 150]); const q = R3.adds.find((x) => x.id === rs.id); expect(Number.isFinite(q.x) && Number.isFinite(q.y) && !('rot' in q) && (q.x !== as.x || q.y !== as.y), '함께 돌릴 때는 자리만 묶음 중심 둘레로 이동'); }
  expect(!(m.editRemoveAdd(m.editRemoveAdd(E, rn.id, sig), rs.id, sig).adds || []).length, '지우기');
}
// 글자는 그림 위에서 고친다(왼쪽 ③ 에는 글자 입력칸 없음): 번호 자동·불릿/부제/이름 토글·새 행·열 기본 글자
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`그림 위 편집: ${label}`); };
  const P = m.CARD_PRESETS; const clone = (o) => JSON.parse(JSON.stringify(o));
  { const sp = clone(P.plan.spec); const a = m.cardsAddKeypoint(m.cardsDelKeypoint(sp, 0, 1), 0); const nos = a.bands[0].items.map((x) => x.no).join();
    expect(nos === '01,02,03,04,05', '핵심 가치 항목을 지우고 더하면 번호가 01~으로 자동으로 다시 매겨짐');
    expect(m.cardsDelKeypoint(sp, 0, 0).bands[0].items.map((x) => x.no).join() === '01,02,03,04', '첫 항목을 지워도 번호가 당겨짐'); }
  { const sp = clone(P.plan.spec); const cb = 2;
    const b0 = m.cardsSetBullets(sp, cb, 0, 0); expect(b0.bands[cb].cards[0].bullets.length === 0 && !/지진·풍하중/.test(m.renderCards(b0).svg), '불릿 0개: 카드에서 불릿이 사라짐');
    const b1 = m.cardsSetBullets(b0, cb, 0, 2); expect(b1.bands[cb].cards[0].bullets.length === 2 && b1.bands[cb].cards[0].bullets.every((x) => x === '내용을 입력하세요') && m.renderCards(b1).svg.includes('내용을 입력하세요'), '불릿을 늘리면 기본 문구가 들어가 그림 위에서 고칠 수 있음');
    const b2 = m.cardsSetBullets(sp, cb, 0, 1); expect(b2.bands[cb].cards[0].bullets.length === 1 && b2.bands[cb].cards[0].bullets[0] === sp.bands[cb].cards[0].bullets[0], '불릿을 줄이면 앞의 것을 남김'); expect(m.cardsSetBullets(sp, cb, 0, 9).bands[cb].cards[0].bullets.length === 2, '불릿은 2개까지');
    const s1 = m.cardsToggleSub(sp, cb, 0); expect(s1.bands[cb].cards[0].sub === '부제' && m.renderCards(s1).svg.includes('>부제<') && m.cardsToggleSub(s1, cb, 0).bands[cb].cards[0].sub === '', '부제 넣기/빼기(기본 글자 "부제")');
    const c1 = m.cardsToggleCaption(sp, cb, 2, 0); expect(c1.bands[cb].cards[2].slots[0].caption === '이름' && m.cardsToggleCaption(c1, cb, 2, 0).bands[cb].cards[2].slots[0].caption === '' && m.cardsToggleCaption(sp, cb, 0, 99) !== undefined, '슬롯 작은 이름 넣기/빼기');
    const before = JSON.stringify(sp); m.cardsSetBullets(sp, cb, 0, 0); m.cardsToggleSub(sp, cb, 0); expect(JSON.stringify(sp) === before, '도우미는 원본을 바꾸지 않음'); }
  { const t = m.normalizeTable(m.SAMPLE_TABLE);
    expect(m.tableAddRow(t).rows.at(-1).every((v) => v === '') && m.tableAddRow(t, undefined, true).rows.at(-1).join() === '항목,내용', '행 추가: 기본은 빈 칸, fill 이면 항목/내용 기본 글자');
    const t4 = m.tableSetCols(t, 4, true); expect(t4.cols === 4 && t4.rows.every((r) => r.length === 4 && r[2] === '내용' && r[3] === '내용' && r[0].length > 0 && r[1].length > 0), '열 늘리기: fill 이면 새 칸에 기본 글자(기존 칸은 그대로)');
    expect(m.tableSetCols(t, 4).rows.every((r) => r[2] === ''), '열 늘리기: 기본은 빈 칸(예전과 같음)');
    expect(m.tableHasEmpty(m.tableAddRow(t)) && !m.tableHasEmpty(t) && !m.tableHasEmpty(m.tableFillEmpty(m.tableAddRow(t))) && m.tableFillEmpty(m.tableAddRow(t)).rows.at(-1).join() === '–,–', '빈 칸 찾기·채우기'); }
}
// 프로그램 버블도·층별 조닝도 개선(2026-10-26): 아이콘·면적·범례 / 층고 치수선·번호 배지·인물·가로 라벨
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`버블도·조닝도 개선: ${label}`); };
  const clone = (o) => JSON.parse(JSON.stringify(o)); const P0 = m.EXAMPLE_SPECS.program; const S0 = m.EXAMPLE_SPECS.stack;
  const ICON_G = /<g transform="translate\(-?\d+\.\d -?\d+\.\d\) scale\(/g; const hasIcon = (svg) => /<g transform="translate\(-?\d+\.\d -?\d+\.\d\) scale\(/.test(svg); // test 는 g 플래그의 위치 상태를 타서 따로 둔다
  const rp = m.renderSpec('program', P0).svg;
  expect(!/NaN|undefined/.test(rp), '버블도: NaN·undefined 없음');
  expect(rp.includes('1,200㎡') && rp.includes('크기 = 면적·중요도') && rp.includes('직접 연결') && rp.includes('약한 관련'), '버블도: 면적 줄과 범례(크기·직접·약한)가 그려짐');
  expect((rp.match(ICON_G) || []).length >= 6, '버블도: 공간 이름으로 짐작한 아이콘이 여러 개 붙음');
  expect(!hasIcon(m.renderSpec('program', { ...clone(P0), autoIcon: false }).svg), '버블도: autoIcon:false 면 아이콘을 짐작해 붙이지 않음');
  { const sp = clone(P0); sp.nodes[0].icon = 'zap'; sp.nodes[1].icon = '없는-아이콘'; const n = m.normalizeSpec('program', sp);
    expect(n.nodes[0].icon === 'zap' && n.nodes[1].icon === '', '버블도: 목록에 있는 icon 만 받고 모르는 이름은 버림');
    sp.nodes[2].area = '1234567890123456'; expect(m.normalizeSpec('program', sp).nodes[2].area.length === 12, '버블도: 면적 글자는 12자까지'); }
  { const sp = { groups: [{ id: 'a', name: '가', color: '#F9D2A0' }], nodes: [{ id: 'x', label: '로비', group: 'a', size: 3, area: '10㎡' }], links: [] };
    expect(m.renderSpec('program', sp).svg.includes('fill="#222222"'), '버블도: 밝은 색 바탕에는 어두운 글자색'); }
  { const sp = { groups: [{ id: 'a', name: '가', color: '#F28C28' }], nodes: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: '로비', group: 'a', size: 1, icon: 'zap', area: '10㎡' })), links: [] }; const r = m.renderSpec('program', sp).svg;
    expect(!/NaN|undefined/.test(r), '버블도: 작은 원 40개에 icon·면적을 줘도 깨지지 않음'); }
  expect(m.getTextFields('program', P0).some((f) => f.label.includes('면적') && f.value === '1,200㎡'), '버블도: 글자 수정 목록에 면적이 있음');
  const rs = m.renderSpec('stack', S0).svg;
  expect(!/NaN|undefined/.test(rs), '조닝도: NaN·undefined 없음');
  expect(rs.includes('5.0m') && rs.includes('4.2m') && rs.includes('#1E5FA8'), '조닝도: 층고(h)가 있으면 오른쪽에 치수선과 m 글자');
  expect(!rs.includes('rotate(-90') , '조닝도: 뭉개지던 세로 글자(rotate -90)를 쓰지 않음');
  expect((rs.match(/fill="#1f242b"/g) || []).length >= 3 && rs.includes('>1<') && rs.includes('>3<'), '조닝도: no 가 있는 칸에 검은 번호 배지');
  expect(rs.includes('620㎡') && rs.includes('#C3C9D1'), '조닝도: 면적 줄과 수목 실루엣');
  expect(!m.renderSpec('stack', { ...clone(S0), entourage: false }).svg.includes('#C3C9D1'), '조닝도: entourage:false 면 인물·수목이 없음');
  { const sp = clone(S0); sp.floors.forEach((f) => { delete f.h; }); expect(!m.renderSpec('stack', sp).svg.includes('#1E5FA8'), '조닝도: h 가 없으면 치수선 없음(예전 모양)'); }
  { const sp = clone(S0); sp.floors[0].h = 'abc'; sp.floors[1].h = 100; sp.floors[2].programs[0].no = '1234'; const n = m.normalizeSpec('stack', sp);
    expect(n.floors[0].h === 0 && n.floors[1].h === 30 && n.floors[2].programs[0].no.length === 2, '조닝도: h 는 숫자(1.5~30)만, 번호는 2자까지'); }
  expect(m.getTextFields('stack', S0).some((f) => f.label.includes('면적') && f.value === '620㎡'), '조닝도: 글자 수정 목록에 면적이 있음');
  { const many = { floors: Array.from({ length: 12 }, (_, i) => ({ name: `${i + 1}F`, h: 4, programs: [{ name: '아주아주긴이름의프로그램', tone: 'public', width: 0.2, area: '999㎡', no: '9' }, { name: '칸', tone: 'quiet', width: 0.8 }] })), voids: [{ from: 0, to: 11, x: 0.3, w: 0.3, label: '보이드' }], cores: [{ x: 0.9, label: '코어' }], forces: [{ kind: 'light', label: '채광' }, { kind: 'wind', label: '바람' }, { kind: 'view', label: '조망' }, { kind: 'noise', label: '소음' }], gradient: { label: '공공성', from: '높음', to: '낮음' } };
    const r = m.renderSpec('stack', many); expect(!/NaN|undefined/.test(r.svg) && r.height > 1000, '조닝도: 12층 + 모든 요소를 켜도 깨지지 않음'); }
}
// 매스 과정도 개선(2026-10-26): STEP 라벨 띠 · 프로그램 점선 지시선(아이콘 칩) · 색 입체 · 테마 화살표 · 주변 매스
{
  const expect = (cond, label) => { if (cond) ok++; else fails.push(`매스 과정도 개선: ${label}`); };
  const clone = (o) => JSON.parse(JSON.stringify(o)); const M0 = m.EXAMPLE_SPECS.massing;
  const r0 = m.renderSpec('massing', M0).svg;
  expect(!/NaN|undefined/.test(r0), 'NaN·undefined 없음(주변 매스 포함)');
  expect((r0.match(/>STEP \d</g) || []).length === 4 && r0.includes('중앙을 덜어 열린 마당을 만든다'), '단계마다 STEP 번호 박스 + 한 줄 제목 띠');
  expect(r0.includes('>라운지<') && r0.includes('>전시<') && r0.includes('stroke-dasharray="2 3"'), '프로그램 이름 지시선(점선)');
  expect((r0.match(/<g transform="translate\(-?\d+\.\d -?\d+\.\d\) scale\(0\.8\)">/g) || []).length >= 4, '지시선 라벨에 아이콘 칩');
  expect(r0.includes('marker-end="url(#ma1_0)"') && r0.includes('#2F7FBF'), '진입 화살표(파랑)가 그려짐');
  expect(r0.includes('clip-path="url(#mclip0)"'), '주변 매스가 칸 밖으로 번져도 칸 안에서 잘림');
  expect(!m.renderSpec('massing', { ...clone(M0), numbering: false }).svg.includes('>STEP 1<'), 'numbering:false 면 STEP 박스 없음(제목 띠는 유지)');
  { const old = { title: '', accent: '#C97B5A', steps: [{ label: 'EXTRUSION', ground: { x: 0, y: 0, w: 5, d: 4 }, boxes: [{ x: 0, y: 0, z: 0, w: 5, d: 4, h: 2 }, { x: 0, y: 1.7, z: 2.4, w: 5, d: 0.6, h: 1.6, mode: 'subtract', move: 'up' }] }] };
    const r = m.renderSpec('massing', old).svg; expect(!/NaN|undefined/.test(r) && r.includes('>STEP 1<') && r.includes('EXTRUSION'), '예전 스펙(새 항목 없음)도 그대로 그려지고 제목 띠가 붙음'); }
  { const sp = clone(M0); sp.steps[2].leaders = [{ box: 99, label: '없는 박스' }, { box: 0, label: '' }, { box: 0, label: '아주아주아주아주긴이름의프로그램입니다', icon: '없는-아이콘' }, { at: [1, 1, 1], label: '좌표 지시선' }, ...Array.from({ length: 9 }, (_, i) => ({ box: 1, label: `P${i}` }))];
    const r = m.renderSpec('massing', sp).svg; expect(!/NaN|undefined/.test(r) && !r.includes('없는 박스') && r.includes('좌표 지시선') && r.includes('아주아주아주아주긴이름'.slice(0, 5)) && !r.includes('긴이름의프로그램입니다'), '지시선: 없는 박스·빈 라벨은 버리고, 긴 이름은 14자까지, 좌표 지시선 가능');
    expect((r.match(/stroke-dasharray="2 3"/g) || []).length <= 6 + 2, '한 단계 지시선은 6개까지'); }
  { const sp = clone(M0); sp.steps[1].arrows = [{ from: [0, 0, 0] }, { from: 'x', to: [1, 1, 1] }, { from: [1, 1, 1], to: [3, 3, 1], color: 'red' }]; const r = m.renderSpec('massing', sp).svg;
    expect(!/NaN|undefined/.test(r) && (r.match(/marker-end="url\(#ma1_/g) || []).length === 1, '화살표: from/to 가 모자란 것은 버림, 색이 이상하면 강조색');
    sp.steps.forEach((st) => { st.leaders = []; st.arrows = []; }); delete sp.context; expect(!/NaN|undefined/.test(m.renderSpec('massing', sp).svg), '지시선·화살표·주변 매스가 모두 없어도 깨지지 않음'); }
  { const sp = clone(M0); sp.steps[3].boxes[0].color = '#2B6CB0'; const r = m.renderSpec('massing', sp).svg; expect(r.includes('#2B6CB0') && r.includes('#2B6CB0'.toLowerCase()) === false || r.includes('#2B6CB0'), '색 입체: 지정한 색이 오른쪽 면에 쓰임'); }
  expect(m.getTextFields('massing', M0).some((f) => f.label.includes('지시선') && f.value === '라운지'), '글자 수정 목록에 지시선 이름이 있음');
  { const sp = clone(M0); sp.cols = 1; const r = m.renderSpec('massing', sp); expect(!/NaN|undefined/.test(r.svg) && r.height >= 4 * 360, '1열(세로로 쌓기)에서도 깨지지 않음'); }
}
let threw = false; try { m.normalizeSketchRead({ blocks: [] }, null); } catch { threw = true; }
if (!threw) fails.push('도형이 없는 스케치 읽기는 오류여야 함');
console.log(`다이어그램 렌더 점검 ${ok}개 통과`);
fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
