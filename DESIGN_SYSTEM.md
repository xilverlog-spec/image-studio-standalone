# 상지건축 DX 디자인 시스템

이 문서는 `company-share-hub` 앱에서 사용 중인 UI 디자인(색상, 타이포그래피, 컴포넌트 스타일)을 정리한 것입니다. 다른 사내 사이트에도 동일한 스타일을 적용해 "같은 곳에서 만든" 통일감을 주는 것이 목적입니다.

## 1. 브랜드 컬러

CSS 변수로 정의 (`src/app/globals.css`):

```css
:root {
  --background: #F4F7FB;
  --foreground: #0d0d26;

  --brand-main: #333399;   /* 메인 브랜드 컬러 (인디고/블루) */
  --brand-accent: #FF5E36; /* 포인트 컬러 (오렌지) */
  --brand-bg: #F4F7FB;     /* 페이지 배경 */
  --brand-sub-bg: #DCE4F2; /* 보조 배경 */
  --brand-cool: #B3C5EA;   /* 쿨톤 포인트 */
  --brand-warm: #FCE4D6;   /* 웜톤 포인트 */
}
```

| 이름 | 값 | 용도 |
|---|---|---|
| brand-main | `#333399` | 로고, 주요 버튼, 타이틀 그라데이션, 강조 텍스트 |
| brand-accent | `#FF5E36` | 결제/경고성 강조, 보조 포인트 |
| brand-bg | `#F4F7FB` | 전체 배경 |
| brand-sub-bg | `#DCE4F2` | 카드/섹션 보조 배경 |
| brand-cool | `#B3C5EA` | 은은한 포인트, 배경 글로우 |
| brand-warm | `#FCE4D6` | 은은한 포인트, 배경 글로우 |
| foreground | `#0d0d26` | 기본 텍스트 |

버튼/뱃지 등에는 위 색상을 hover용 어두운 톤과 함께 조합해서 사용합니다 (예: `bg-[#333399] hover:bg-[#252573]`, `bg-[#FF5E36] hover:bg-[#d33c16]`).

카테고리 색상 팔레트 (카드/뱃지 구분용, `src/app/page.tsx`):

```js
'brand-main':   { border: 'border-[#333399]', bg: 'bg-[#333399]', text: 'text-[#333399]' }
'brand-accent': { border: 'border-[#FF5E36]', bg: 'bg-[#FF5E36]', text: 'text-[#FF5E36]' }
'brand-cool':   { border: 'border-[#b2b2ee]', bg: 'bg-[#B3C5EA]', text: 'text-[#252573]' }
'brand-warm':   { border: 'border-[#FCE4D6]', bg: 'bg-[#FCE4D6]', text: 'text-[#b45309]' }
'brand-subBg':  { border: 'border-[#DCE4F2]', bg: 'bg-[#DCE4F2]', text: 'text-[#1e3a8a]' }
```

기타 상태 색상은 Tailwind 기본 팔레트 사용: `rose`(경고/관리자), `emerald`(성공/월간), `violet`(연간), `slate`(중립 텍스트/보더).

## 2. 타이포그래피

- 폰트: `'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- 루트 폰트 크기: `112.5%` (16px → 18px로 확대, `html { font-size: 112.5%; }`)
- 타이틀은 그라데이션 텍스트로 강조:

```css
.gradient-title {
  background: linear-gradient(135deg, #1e1b4b 0%, #333399 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

Navbar 타이틀 예시: `bg-gradient-to-r from-slate-900 to-[#333399] bg-clip-text text-transparent font-black tracking-tight`

- 본문/보조 텍스트는 `text-slate-400` ~ `text-slate-800` 범위, 작은 라벨은 `text-[10px]`~`text-[11px] font-bold tracking-wide`.

## 3. 배경 & 레이아웃

- 전체 배경색은 `--brand-bg` (`#F4F7FB`).
- 은은한 배경 글로우 효과 (fixed, blur, 클릭 불가):

```css
.bg-glow-container { position: fixed; inset: 0; pointer-events: none; z-index: -10; overflow: hidden; }
.bg-glow-left-top {
  position: absolute; top: -10%; left: -10%; width: 50%; height: 50%;
  background: radial-gradient(circle, rgba(179,197,234,0.35) 0%, rgba(179,197,234,0) 70%);
  filter: blur(80px);
}
.bg-glow-right-bottom {
  position: absolute; bottom: -10%; right: -10%; width: 50%; height: 50%;
  background: radial-gradient(circle, rgba(252,228,214,0.3) 0%, rgba(252,228,214,0) 70%);
  filter: blur(80px);
}
```

- 컨테이너 폭: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`

## 4. 컴포넌트 스타일

### 4.1 유리(Glassmorphism) 패널

```css
.glass-panel {
  background: rgba(220, 228, 242, 0.45);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.70);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.04);
}
```
용도: 대시보드 섹션, 모달 배경 등. 보통 `rounded-2xl` ~ `rounded-3xl`과 함께 사용.

### 4.2 프리미엄 카드

```css
.premium-card {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.80);
  box-shadow: 0 16px 40px rgba(30, 27, 75, 0.07);
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.premium-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 48px rgba(30, 27, 75, 0.12);
  border-color: rgba(51, 51, 153, 0.2);
}
```

### 4.3 헤더(Navbar)

- `sticky top-0 z-40 w-full border-b border-white/60 bg-white/45 backdrop-blur-lg shadow-xs`
- 높이 `h-20`, 좌측 로고 + 타이틀, 우측 상태 뱃지/버튼
- 상태 뱃지 예: `inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-[11px] font-bold text-[#333399]` + 애니메이션 점 (`h-2 w-2 rounded-full bg-[#333399] animate-pulse`)

### 4.4 버튼

- Primary: `rounded-xl bg-[#333399] hover:bg-[#252573] px-4 py-1.5 text-xs font-bold text-white shadow-md transition`
- Secondary/Neutral: `rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition shadow-xs`
- Light/브랜드톤 버튼: `rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 text-[11px] font-bold text-[#333399]`
- 모서리는 대체로 `rounded-xl`(버튼), `rounded-2xl`/`rounded-3xl`(카드·섹션), `rounded-full`(뱃지·pill)

### 4.5 입력 필드

`rounded-xl border border-slate-200 bg-white/70 py-1.5 px-3 text-xs text-slate-700 font-semibold focus:border-indigo-400 focus:outline-none transition`

포커스 강조가 필요한 경우: `focus:border-[#333399] focus:outline-none focus:ring-4 focus:ring-[#333399]/10`

### 4.6 진행률 바 / 통계 카드

```
bg-gradient-to-br from-[#333399]/10 to-white/95 rounded-2xl p-5 border border-[#333399]/20 shadow-xs
```
숫자 강조: `text-3xl font-extrabold text-[#333399] tracking-tight`

### 4.7 모달

- 배경 오버레이 + `rounded-3xl bg-white p-6 shadow-2xl border border-slate-100/80 glass-panel`
- 등장 애니메이션:

```css
@keyframes modal-fade-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-modal-in { animation: modal-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
```

### 4.8 공지 티커(NoticeTicker)

가로 스크롤 애니메이션:
```css
@keyframes notice-scroll {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-100%); }
}
.animate-notice-scroll {
  display: inline-block;
  padding-left: 100%;
  animation: notice-scroll 18s linear infinite;
}
```

### 4.9 스크롤바

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
```

## 5. 디자인 원칙 요약

1. **은은한 유리(glassmorphism) + 부드러운 그림자**로 깊이감 표현 (강한 테두리·직각 대신 blur/투명도 활용)
2. **라운드 코너 위주**: 버튼 `rounded-xl`, 카드/섹션 `rounded-2xl`~`rounded-3xl`, 뱃지 `rounded-full`
3. **브랜드 컬러(#333399 인디고 + #FF5E36 오렌지)를 포인트로만 사용**, 배경은 중립 톤(`slate`, `#F4F7FB`) 유지
4. **작고 굵은 라벨 텍스트** (`text-[10px]~[11px] font-bold tracking-wide`)로 정보 위계 표현
5. **미세한 트랜지션/호버 효과** (`transition`, `hover:-translate-y-1`, `shadow` 변화)로 인터랙션 피드백 제공
6. **폰트는 Outfit/Inter 계열**을 사용해 모던하고 기하학적인 느낌 유지

## 6. 다른 사이트 적용 방법

1. `globals.css`의 `:root` 변수(`--brand-main`, `--brand-accent`, `--brand-bg` 등)와 `.glass-panel`, `.premium-card`, `.gradient-title` 클래스를 그대로 복사해 사용
2. Tailwind 설정에서 `font-sans`를 Outfit/Inter로 지정
3. 버튼/뱃지/카드는 위 4번 항목의 클래스 조합을 재사용
4. 배경 글로우(`bg-glow-*`)를 최상위 레이아웃에 추가해 동일한 "공기감" 부여
5. 파비콘/로고는 `#333399` 단색 라인 아트 스타일 유지 (`src/components/Logo.tsx` 참고)
