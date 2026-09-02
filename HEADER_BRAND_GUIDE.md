# 상단 헤더(로고 · 제목 · 소제목) 디자인 가이드

`company-share-hub`의 상단 헤더(Navbar) 구성 요소를 다른 사이트에도 동일하게 적용할 수 있도록 정리한 문서입니다. 전체 컬러/타이포 시스템은 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) 참고.

## 1. 전체 구조

```
[로고 이미지]  [메인 타이틀]         ...........  [상태 뱃지/버튼들]
              [소제목(캡션)]
```

- 컴포넌트: `src/components/Navbar.tsx`
- 로고 컴포넌트: `src/components/Logo.tsx` (`public/logo.png` 사용)
- 헤더 컨테이너 예시 코드:

```tsx
<header className="sticky top-0 z-40 w-full border-b border-white/60 bg-white/45 backdrop-blur-lg shadow-xs">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div className="flex h-20 items-center justify-between">
      <div className="flex items-center gap-4.5">
        <Logo width={48} />
        <div className="flex flex-col justify-center">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800 bg-gradient-to-r from-slate-900 to-[#333399] bg-clip-text text-transparent">
            {메인 타이틀}
          </h1>
          <p className="text-[11px] sm:text-xs font-bold text-slate-500 tracking-wide mt-0.5">
            {소제목}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* 우측 상태 뱃지 / 버튼 영역 */}
      </div>
    </div>
  </div>
</header>
```

## 2. 헤더 컨테이너 스타일 규칙

| 속성 | 값 | 설명 |
|---|---|---|
| 위치 | `sticky top-0 z-40` | 스크롤 시 상단 고정 |
| 배경 | `bg-white/45 backdrop-blur-lg` | 반투명 유리(glass) 효과 |
| 하단 보더 | `border-b border-white/60` | 은은한 경계선 |
| 그림자 | `shadow-xs` | 아주 약한 그림자 |
| 높이 | `h-20` | 고정 80px 높이 |
| 컨테이너 폭 | `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` | 본문과 동일한 폭 제한 |

## 3. 로고

- 원본 파일: `public/logo.png` (PNG 래스터 이미지, "S·E·A" 이니셜 모티프)
- 표시 크기: 헤더에서는 `width={48}` (48px), 정사각형 비율 유지 (`objectFit: contain`)
- 호버 인터랙션: `transition-transform duration-300 hover:scale-105` (살짝 확대)
- 컴포넌트 코드:

```tsx
export default function Logo({ width, height, className = '' }: LogoProps) {
  const style = {
    width: width ? `${width}px` : '100%',
    height: height ? `${height}px` : 'auto',
    objectFit: 'contain',
  };
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img src="/logo.png" alt="로고" style={style}
        className="transition-transform duration-300 hover:scale-105" />
    </div>
  );
}
```

### 3.1 파비콘 (로고의 라인아트 버전)

파비콘은 별도의 인라인 SVG로, 브랜드 메인 컬러(`#333399`) 단색 라인/도형으로 구성된 "막대 그래프/블록" 모티프입니다 (`src/app/layout.tsx`의 `<head>` 내 data URI SVG). 새 사이트에도 동일한 라인아트 스타일(단색 `#333399`, 얇은 stroke, 라운드 코너)로 파비콘을 제작하면 통일감을 줄 수 있습니다.

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...(#333399 단색 라인아트)..." />
```

> 다른 사이트에 적용 시: `public/logo.png`를 그대로 복사해서 재사용하거나, 사이트별 서비스명을 반영한 이니셜로 같은 스타일(단색 `#333399`, 심플한 도형/라인)로 새로 제작합니다.

## 4. 메인 타이틀

```tsx
<h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800 bg-gradient-to-r from-slate-900 to-[#333399] bg-clip-text text-transparent">
  상지건축 DX Share Platform
</h1>
```

| 속성 | 값 |
|---|---|
| 폰트 굵기 | `font-black` (900) |
| 자간 | `tracking-tight` |
| 크기 | 모바일 `text-xl` → 데스크탑 `text-2xl` |
| 색상 | 그라데이션 텍스트: `slate-900 → #333399` (좌→우), `bg-clip-text text-transparent` 필수 |

동일한 그라데이션 텍스트는 전역 유틸 클래스로도 정의되어 있음 (`globals.css`):

```css
.gradient-title {
  background: linear-gradient(135deg, #1e1b4b 0%, #333399 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

> 다른 사이트 적용 시: 타이틀 텍스트만 서비스명으로 교체하고, 그라데이션 컬러(시작색 `slate-900`/`#1e1b4b`, 끝색 `#333399`)와 `font-black tracking-tight`는 그대로 유지합니다.

## 5. 소제목(캡션)

```tsx
<p className="text-[11px] sm:text-xs font-bold text-slate-500 tracking-wide mt-0.5">
  사내 업무 사이트 및 공용 계정 공유 플랫폼
</p>
```

| 속성 | 값 |
|---|---|
| 크기 | `text-[11px]` (모바일) → `text-xs` (데스크탑) |
| 굵기 | `font-bold` |
| 색상 | `text-slate-500` (중간 회색, 타이틀보다 톤 다운) |
| 자간 | `tracking-wide` |
| 타이틀과의 간격 | `mt-0.5` (타이틀 바로 아래, 촘촘하게) |

> 타이틀보다 한 톤 연한 회색 + 넓은 자간으로, "제목 아래 설명 배지" 느낌을 유지합니다. 한 줄 요약형 문구(서비스 성격을 간단히 설명)가 어울립니다.

## 6. 우측 상태 뱃지 (선택 요소)

헤더 우측에는 현재 모드/상태를 알려주는 pill 형태 뱃지를 배치합니다.

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-[11px] font-bold text-[#333399]">
  <span className="h-2 w-2 rounded-full bg-[#333399] animate-pulse"></span>
  사내 전용
</span>
```

- 형태: `rounded-full`, 연한 배경(`bg-indigo-50`) + 옅은 보더(`border-indigo-100`)
- 강조 점: `h-2 w-2 rounded-full animate-pulse` (실시간/활성 상태 표시)
- 경고성 상태(예: 관리자 모드)는 동일 패턴에 `rose` 계열 컬러만 교체: `bg-rose-50 border-rose-100 text-rose-600`

## 7. 다른 사이트 적용 체크리스트

1. 헤더 컨테이너 클래스(`sticky`, `bg-white/45 backdrop-blur-lg`, `h-20`, `max-w-7xl`)를 그대로 복사
2. 로고는 `public/logo.png`를 재사용하거나, 동일 스타일(단색 `#333399` 라인아트)로 서비스별 이니셜 로고 제작 후 `Logo.tsx` 컴포넌트 구조 재사용
3. 메인 타이틀에 서비스명을 넣고 `slate-900 → #333399` 그라데이션 + `font-black tracking-tight` 유지
4. 소제목에 한 줄 설명 문구를 넣고 `text-slate-500 font-bold tracking-wide` 유지
5. 필요 시 우측에 pill 뱃지로 현재 상태(전용/관리자/버전 등) 표시
