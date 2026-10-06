// 개념도용 단순 아이콘 모음(20x20 좌표계). 색은 호출하는 쪽이 정한다 — 칩 안에서는 흰색, 단독이면 지정색.
export const ICON_NAMES = ['leaf', 'sun', 'tree', 'water', 'people', 'bench', 'home', 'car', 'flag', 'star', 'path', 'building'];

export const ICON_LABEL = {
  leaf: '식물/정원', sun: '해/일조', tree: '나무/숲', water: '물/수공간', people: '사람/커뮤니티', bench: '휴게/벤치',
  home: '주거', car: '차량/주차', flag: '거점/진입', star: '특화/랜드마크', path: '산책로/동선', building: '건물/상가',
};

export const iconGlyph = (name, color = '#fff') => {
  const f = `fill="${color}"`;
  switch (name) {
    case 'leaf': return `<path ${f} d="M4 16C4 8 9 4 16 4C16 11 12 16 4 16Z"/><path d="M4 16L11 9" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'sun': return `<circle cx="10" cy="10" r="3.6" ${f}/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="10" y1="2.6" x2="10" y2="4.8" transform="rotate(${a} 10 10)" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`).join('');
    case 'tree': return `<circle cx="10" cy="8" r="5.2" ${f}/><rect x="9" y="11.5" width="2" height="6" rx="0.6" ${f}/>`;
    case 'water': return `<path ${f} d="M10 3C13.6 8 15 10.2 15 12.8A5 5 0 0 1 5 12.8C5 10.2 6.4 8 10 3Z"/>`;
    case 'people': return `<circle cx="10" cy="6" r="2.6" ${f}/><path ${f} d="M4.8 17C4.8 11.4 15.2 11.4 15.2 17Z"/>`;
    case 'bench': return `<rect x="3" y="6" width="14" height="2.4" rx="1" ${f}/><rect x="3" y="10" width="14" height="2.6" rx="1" ${f}/><rect x="4.5" y="12.4" width="1.8" height="4" ${f}/><rect x="13.7" y="12.4" width="1.8" height="4" ${f}/>`;
    case 'home': return `<path ${f} d="M2.8 10L10 3.8L17.2 10V17H2.8Z"/>`;
    case 'car': return `<rect x="2.5" y="8.5" width="15" height="6" rx="2" ${f}/><path ${f} d="M5 8.5L7 5H13L15 8.5Z"/><circle cx="6" cy="15" r="1.7" ${f} stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/><circle cx="14" cy="15" r="1.7" ${f} stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>`;
    case 'flag': return `<line x1="5" y1="3" x2="5" y2="17" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/><path ${f} d="M5 4H16L13 7.6L16 11H5Z"/>`;
    case 'star': return `<path ${f} d="M10 2.6L12.2 7.6L17.6 8.1L13.5 11.7L14.8 17L10 14.2L5.2 17L6.5 11.7L2.4 8.1L7.8 7.6Z"/>`;
    case 'path': return `<path d="M3 15C7 15 5 9 10 9C15 9 13 4 17 4" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/><circle cx="3" cy="15" r="1.4" ${f}/><circle cx="17" cy="4" r="1.4" ${f}/>`;
    case 'building': return `<rect x="4.5" y="3" width="11" height="14" rx="1" ${f}/>` + [5.6, 9, 12.4].map((y) => `<rect x="6.4" y="${y}" width="2.2" height="2" fill="rgba(0,0,0,0.28)"/><rect x="11.4" y="${y}" width="2.2" height="2" fill="rgba(0,0,0,0.28)"/>`).join('');
    default: return `<circle cx="10" cy="10" r="5" ${f}/>`;
  }
};
