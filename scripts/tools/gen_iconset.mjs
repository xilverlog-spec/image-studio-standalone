// Lucide 아이콘(ISC)에서 고른 건축·도시 관련 아이콘을 src/conceptDiagram/iconset.js 로 만든다.
// 원본 SVG: third_party/lucide/icons/*.svg (lucide-static 1.59.0, 라이선스 third_party/lucide/LICENSE).
// 실행: node scripts/tools/gen_iconset.mjs   (아이콘을 더하거나 이름을 바꿀 때만 다시 실행)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'third_party/lucide/icons');

export const CATS = [
  ['structure', '구조·건물'], ['energy', '설비·에너지'], ['nature', '자연·환경'], ['safety', '안전·방재'], ['living', '주거·생활'], ['route', '동선·방향'], ['general', '일반'],
];
// [분류, 아이콘 id(= Lucide 파일 이름), 한국어 뜻]
const META = [
  ['structure', 'building-2', '업무·오피스'], ['structure', 'house', '주택'], ['structure', 'warehouse', '창고·물류'], ['structure', 'factory', '공장·생산'],
  ['structure', 'school', '학교·교육시설'], ['structure', 'hospital', '병원·의료시설'], ['structure', 'church', '종교시설'], ['structure', 'landmark', '공공·관공서'], ['structure', 'store', '상점·판매'],
  ['structure', 'hotel', '숙박시설'], ['structure', 'fence', '울타리·경계'], ['structure', 'brick-wall', '벽·조적'], ['structure', 'layers', '층·적층'], ['structure', 'blocks', '블록·모듈'],
  ['structure', 'ruler', '치수·규모'], ['structure', 'pencil-ruler', '설계·도면'], ['structure', 'drafting-compass', '제도·원'], ['structure', 'door-open', '출입구'], ['structure', 'square-dashed', '영역·공간'], ['structure', 'columns-2', '기둥·구조'],
  ['energy', 'zap', '전기'], ['energy', 'plug', '전원·충전'], ['energy', 'battery-charging', '축전·ESS'], ['energy', 'wind', '바람·통풍'], ['energy', 'fan', '송풍·환기'],
  ['energy', 'thermometer', '온도'], ['energy', 'thermometer-sun', '열·냉방부하'], ['energy', 'snowflake', '냉방·냉기'], ['energy', 'flame', '난방·열원'], ['energy', 'droplets', '물방울·수자원'],
  ['energy', 'droplet', '급수·물'], ['energy', 'waves', '수공간·물결'], ['energy', 'cloud-rain', '우수·빗물'], ['energy', 'lightbulb', '조명·아이디어'], ['energy', 'lamp', '조명기구'],
  ['energy', 'air-vent', '공조·덕트'], ['energy', 'recycle', '재활용·순환'],
  ['nature', 'trees', '숲·녹지'], ['nature', 'tree-pine', '침엽수'], ['nature', 'tree-deciduous', '활엽수'], ['nature', 'sprout', '새싹·성장'], ['nature', 'flower-2', '꽃·정원'], ['nature', 'mountain', '산·지형'], ['nature', 'cloud', '구름·대기'],
  ['safety', 'shield-check', '안전·인증'], ['safety', 'shield-alert', '위험·경계'], ['safety', 'siren', '경보'], ['safety', 'fire-extinguisher', '소화·방화'], ['safety', 'triangle-alert', '주의'],
  ['safety', 'hard-hat', '시공·안전모'], ['safety', 'cctv', '감시·보안'], ['safety', 'lock', '잠금·보안'], ['safety', 'eye', '조망·시선'], ['safety', 'accessibility', '무장애·접근성'],
  ['safety', 'heart-pulse', '건강·보건'], ['safety', 'life-buoy', '구조·대피'],
  ['living', 'bed-double', '침실·숙박'], ['living', 'sofa', '거실·휴게'], ['living', 'bath', '욕실'], ['living', 'utensils', '식당·주방'], ['living', 'bike', '자전거'], ['living', 'bus', '버스·대중교통'],
  ['living', 'train-front', '철도·지하철'], ['living', 'square-parking', '주차'], ['living', 'plane', '공항·항공'], ['living', 'users', '커뮤니티'], ['living', 'user', '사람'], ['living', 'baby', '영유아·돌봄'],
  ['living', 'dog', '반려동물'], ['living', 'graduation-cap', '교육·학습'], ['living', 'book-open', '도서·독서'], ['living', 'dumbbell', '운동·피트니스'], ['living', 'coffee', '카페·휴식'],
  ['living', 'shopping-bag', '쇼핑'], ['living', 'wifi', '통신·스마트'], ['living', 'trash-2', '폐기물'], ['living', 'package', '택배·물류'],
  ['route', 'route', '동선·경로'], ['route', 'map-pin', '위치·거점'], ['route', 'map', '지도·배치'], ['route', 'navigation', '진행 방향'], ['route', 'compass', '방위·나침반'],
  ['route', 'footprints', '보행·산책'], ['route', 'arrow-right-left', '양방향·교차'], ['route', 'signpost', '안내·사인'], ['route', 'split', '분기·갈림'],
  ['general', 'heart', '선호·애정'], ['general', 'award', '수상·특화'], ['general', 'sparkles', '특별·새로움'], ['general', 'target', '목표·핵심'], ['general', 'globe', '지구·글로벌'],
  ['general', 'handshake', '협력·상생'], ['general', 'megaphone', '홍보·알림'], ['general', 'calendar', '일정'], ['general', 'clock', '시간'], ['general', 'chart-column', '통계·막대'],
  ['general', 'chart-pie', '비율·원형'], ['general', 'trending-up', '성장·증가'],
];

const BASIC = ['leaf', 'sun', 'tree', 'water', 'people', 'bench', 'home', 'car', 'flag', 'star', 'path', 'building']; // icons.js 의 기본 12개(직접 그린 채운 아이콘) — 이름이 겹치면 안 된다
for (const [, id] of META) if (BASIC.includes(id)) { console.error(`기본 아이콘과 이름이 겹침: ${id}`); process.exit(1); }

const ALLOWED = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const lines = [];
for (const [cat, id, label] of META) {
  const f = path.join(src, `${id}.svg`);
  if (!fs.existsSync(f)) { console.error(`없음: ${id}`); process.exit(1); }
  const raw = fs.readFileSync(f, 'utf-8');
  const inner = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const els = [...inner.matchAll(/<(\w+)\b([^>]*?)\/>/g)];
  if (!els.length) { console.error(`요소 없음: ${id}`); process.exit(1); }
  const out = els.map(([, tag, attrs]) => {
    if (!ALLOWED.has(tag)) { console.error(`허용 안 된 요소 ${tag}: ${id}`); process.exit(1); }
    const a = attrs.replace(/\s+/g, ' ').trim();
    if (/\b(on\w+|style|href|xlink:href|fill|stroke)=/.test(a)) { console.error(`허용 안 된 속성: ${id}`); process.exit(1); }
    return `<${tag} ${a}/>`;
  }).join('');
  lines.push(`  '${id}': { cat: '${cat}', label: '${label}', svg: '${out.replace(/'/g, "\\'")}' },`);
}
const js = `// 건축·도시 관련 선(stroke) 아이콘 ${META.length}개 — Lucide(https://lucide.dev, ISC 라이선스, lucide-static 1.59.0)에서 골랐다.
// 이 파일은 scripts/tools/gen_iconset.mjs 가 만든다(손으로 고치지 말 것). 라이선스 전문: third_party/lucide/LICENSE
// 24x24 좌표계, 선 굵기·색은 그리는 쪽(icons.js 의 iconGlyph)이 정한다.
export const ICON_CATS = ${JSON.stringify(CATS.map(([id, label]) => ({ id, label })))};
export const ICONSET = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(root, 'src/conceptDiagram/iconset.js'), js);
console.log(`iconset.js: ${META.length}개, ${(js.length / 1024).toFixed(1)}KB`);
