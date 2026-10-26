// 개요표 칸(페이지 칸 전용 표): 표 하나가 칸을 채우는 종류. 편집기 요소 "＋ 표"와 같은 표(table.js)를 쓰되, 이쪽은 설명(AI)·붙여넣기·폼으로 만들고 페이지 칸에 맞춰 크기가 정해진다.
//  spec = { title(페이지 머리가 쓰므로 보통 비움), accent, size, table:{ title, cols(2~4), style, rows } }
import { normalizeTable, tableLayout, tableSvg, SAMPLE_TABLE, TABLE_COLOR } from './table';

const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s || '');
export const TABLE_DOC_SCHEMA = `{
  "title": "",                          // 비워 둔다(제목은 페이지 머리가 쓴다)
  "accent": "#2F6B4F",                  // 제목 띠·선 색
  "table": {
    "title": "건축개요",                 // 표 제목(40자 이내, 없으면 빈 문자열)
    "cols": 2,                          // label·stripe 는 2~4열(라벨–값이면 2, 라벨–값–라벨–값이면 4), doc 는 3~5열
    "style": "label",                   // "label"(회색 라벨 열 + 가는 선, 건축개요형) 또는 "stripe"(색 띠 + 줄무늬, 면적표형) 또는 "doc"(설계개요형: 구분 칸 합침 + 머리글 띠 + 소계 줄 강조)
    "header": ["구분", "항목", "설계내용", "비고"],   // (doc 만, 선택) 회색 머리글 띠의 열 이름. 열 수와 같게
    "unit": "단위: ㎡",                  // (doc 만, 선택) 표 오른쪽 위 단위 줄(20자 이내)
    "rows": [ ["대지위치", "서울시 ○○구"], ["용도", "공동주택"] ]   // 행은 최대 30개, 한 칸은 40자 이내. doc 는 열 = [구분, 항목, 내용…, (비고)]
  }
}`;
export const TABLE_DOC_RULES = `- 좌표·크기를 정하지 않는다. 라벨–값 표(label·stripe)와 설계개요형(doc)만 만든다(임의 병합 셀·계산·간트·조직도는 만들지 않는다).
- 설계개요형(doc)은 건물개요·주차개요처럼 구분 아래에 항목이 여러 줄이거나, 면적표처럼 소계·합계 줄이 있거나, 비고(법정 기준 등) 열이 필요할 때 쓴다. cols 3~5 = [구분, 항목, 내용…(, 비고)]. 같은 구분이 이어지면 구분 칸은 첫 줄에만 쓰고 아래 줄은 빈 문자열("")로 둔다(한 칸으로 합쳐 보인다). 소계·합계 줄은 항목 칸 글자를 "소계"·"합계"로 쓴다(굵게 강조된다). header 로 열 이름을, unit 으로 "단위: ㎡" 같은 단위 줄을 적을 수 있다.
- 요청에 있는 항목과 값만 넣고 없는 수치는 지어내지 않는다(모르면 값 칸을 비워 둔다). 단위(㎡·%·층·대)는 값에 붙여 쓴다.
- 열 수는 2~4. 4열이면 [라벨, 값, 라벨, 값] 순서로 쓴다. 면적표처럼 숫자가 많으면 style 을 "stripe" 로 한다.`;

export function normalizeTableDoc(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const size = Math.min(40, Math.max(10, Number(s.size) || 18));
  const table = normalizeTable(s.table && typeof s.table === 'object' ? s.table : SAMPLE_TABLE);
  if (!table.rows.length) throw new Error('표의 행이 비어 있습니다.');
  return { title: String(s.title ?? '').slice(0, 70), accent: isHex(s.accent) ? s.accent : TABLE_COLOR, size, table };
}

// 그림: 표를 여백(글자 크기의 1.2배)을 두고 그린다. 칸에 맞춰 늘고 주는 것은 페이지 조립이 한다
export function renderTableDoc(raw) {
  const n = normalizeTableDoc(raw); const pad = Math.round(n.size * 1.2);
  const L = tableLayout({ x: pad, y: pad, size: n.size, table: n.table });
  const W = Math.ceil(L.w + pad * 2); const H = Math.ceil(L.h + pad * 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${tableSvg({ x: pad, y: pad, size: n.size, color: n.accent, table: n.table })}</svg>`;
  return { svg, width: W, height: H };
}

// 글자 수정 폼·그림 위 더블클릭 편집용 글자 목록
export function getTableDocFields(spec) {
  const out = []; if (!spec || !spec.table) return out;
  out.push({ path: ['table', 'title'], label: '표 제목', value: spec.table.title || '' });
  (spec.table.rows || []).forEach((r, i) => (r || []).forEach((v, j) => out.push({ path: ['table', 'rows', i, j], label: `${i + 1}행 ${j + 1}열`, value: v ?? '' })));
  return out;
}
