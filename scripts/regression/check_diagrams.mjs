// 다이어그램 렌더 회귀 점검(node). check_fast.py 가 호출한다. 단독 실행: node scripts/regression/check_diagrams.mjs
import { rolldown } from '../../node_modules/rolldown/dist/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../src/conceptDiagram/spec.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-reg-'));
fs.writeFileSync(path.join(tmp, 'entry.js'), `export { renderSpec, EXAMPLE_SPECS, getTextFields, buildConceptPrompt, DIAGRAM_TYPES } from ${JSON.stringify(spec.replace(/\\/g, '/'))};`);
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

console.log(`다이어그램 렌더 점검 ${ok}개 통과`);
fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
