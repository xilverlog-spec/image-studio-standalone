# 보관함 "즐겨찾기 폴더" 기능 추가 — 백엔드 검토 및 구현 가이드

> 작성일: 2026-09-02
> 대상: `image-studio-standalone` (상지건축 AI Image Studio, `http://192.168.164.82:5181`)
> 목적: 보관함(갤러리)에 이름을 붙인 "즐겨찾기 폴더"를 여러 개 만들 수 있도록 기능을 추가하려는 다음 작업자를 위한 인수인계 문서.
> 이 문서는 **코드 변경 없이 현재 구조를 검토한 결과**이며, 실제 구현은 아래 설계안을 참고해 진행하면 된다.

---

## 1. 요청 배경

현재 보관함에는 이미지 1건당 `즐겨찾기 여부(on/off)` 딱 하나만 있고, 여러 개의 이름 붙은 폴더(예: "1차 시안", "고객 승인용", "블렌딩 참고")로 묶어서 관리하는 기능은 없다. 사용자는 보관함 안에 **새 즐겨찾기 폴더를 만들고** 그 폴더에 이미지를 담고 싶어 한다.

---

## 2. 현재 구조 검토 (As-Is)

### 2.1 데이터베이스

- 위치: `data/image_studio.db` (SQLite, `backend/config.py`의 `DB_PATH`)
- 테이블: `image_generations` 단일 테이블 (`backend/services/image_history_store.py`)

```sql
CREATE TABLE image_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL DEFAULT 'default',
    prompt TEXT,
    style TEXT,
    aspect_ratio TEXT,
    sampler_name TEXT,
    scheduler TEXT,
    seed INTEGER,
    loras_json TEXT,
    image_filename TEXT NOT NULL,
    created_at REAL NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,   -- 2026-08-27 ALTER TABLE로 추가
    checkpoint TEXT                            -- 2026-08-27 ALTER TABLE로 추가
);
CREATE INDEX idx_image_gen_project ON image_generations(project, id DESC);
```

- **폴더 개념이 아예 없다.** `is_favorite`은 불리언 1개뿐이라 "여러 폴더"를 표현할 수 없음.
- 스키마 확장은 `ALTER TABLE ... ADD COLUMN`을 `init_image_history_db()` 안에서 `try/except sqlite3.OperationalError`로 감싸는 패턴을 이미 쓰고 있음(멱등하게 여러 번 실행돼도 안전). 새 테이블을 추가할 때도 이 패턴을 그대로 따르면 된다.

### 2.2 백엔드 API (`backend/routes/media.py`)

`/v1` 프리픽스, `backend/server.py`에서 `app.include_router(media_router)`로 등록됨.

| 메서드/경로 | 설명 | 관련 함수 |
|---|---|---|
| `GET /v1/image/history` | 보관함 목록 조회 (project, limit) | `image_history_store.list_generations` |
| `DELETE /v1/image/history/{gen_id}` | 이력 + 실제 파일 삭제 | `image_history_store.delete_generation` |
| `PUT /v1/image/history/{gen_id}/favorite` | 즐겨찾기 on/off 토글 (`SetFavoriteRequest{is_favorite, project}`) | `image_history_store.set_favorite` |

`image_history_store.py`가 SQLite 접근을 전담하고, `routes/media.py`는 FastAPI 라우트에서 이 모듈을 호출하는 얇은 레이어. 폴더 기능도 이 구조(스토어 함수 + 라우트)를 그대로 따라야 함.

### 2.3 프론트엔드 (`src/App.jsx`)

- 상태: `studioGallery`(전체 이력 배열), `showFavoritesOnly`(불리언 필터), `selectedImage`(라이트박스)
- 즐겨찾기 토글: `toggleFavorite(item)` (L398) — 낙관적 업데이트 후 `PUT /v1/image/history/{id}/favorite` 호출, 실패 시 롤백
- UI:
  - 보관함 헤더의 "즐겨찾기만" 토글 버튼 (L2556~2568)
  - 그리드 카드의 별 아이콘 버튼 (L2616~2626)
  - 라이트박스 모달의 즐겨찾기 버튼 (L2681~2694)
- **폴더 UI 자체가 없음.** 새 컴포넌트(폴더 목록 사이드바/드롭다운, "새 폴더 만들기" 모달, 카드에서 폴더로 드래그 앤 드롭 등)를 새로 만들어야 함.

---

## 3. 설계안 (To-Be)

### 3.1 데이터 모델

이미지 1장이 여러 폴더에 동시에 들어갈 수 있어야 자연스러우므로(예: "고객 승인용"이면서 "블렌딩 참고"), **N:M 관계**로 설계 권장.

```sql
-- 새 테이블 1: 폴더 정의
CREATE TABLE IF NOT EXISTS gallery_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_folders_project ON gallery_folders(project);

-- 새 테이블 2: 이미지 ↔ 폴더 매핑
CREATE TABLE IF NOT EXISTS gallery_folder_items (
    folder_id INTEGER NOT NULL REFERENCES gallery_folders(id) ON DELETE CASCADE,
    generation_id INTEGER NOT NULL REFERENCES image_generations(id) ON DELETE CASCADE,
    added_at REAL NOT NULL,
    PRIMARY KEY (folder_id, generation_id)
);
```

> 단순하게 "이미지 1장 = 폴더 1개"만 필요하다면 `image_generations`에 `folder_id INTEGER` 컬럼만 추가(ALTER TABLE)하는 쪽이 훨씬 가볍다. 기획 의도가 "즐겨찾기 폴더별 분류"에 가깝다면 N:M보다 이 단순 버전으로 시작하고, 나중에 필요해지면 N:M으로 마이그레이션하는 것도 방법. **다음 작업자가 실제 요구사항(한 이미지가 여러 폴더에 들어갈 필요가 있는지)을 사용자에게 먼저 확인하고 결정할 것.**

SQLite는 기본적으로 FK 제약을 강제하지 않으므로(`PRAGMA foreign_keys=ON`을 켜지 않는 한) `ON DELETE CASCADE`를 신뢰하지 말고, 폴더/이미지 삭제 시 관련 매핑 행도 코드에서 명시적으로 같이 지워야 한다(기존 `delete_generation`이 파일도 같이 지우는 것과 같은 패턴).

### 3.2 백엔드 추가 작업 (`image_history_store.py`)

- `init_image_history_db()`에 위 두 `CREATE TABLE IF NOT EXISTS` 추가
- 새 함수:
  - `create_folder(name, project) -> int`
  - `list_folders(project) -> list[{id, name, createdAt, itemCount}]`
  - `rename_folder(folder_id, name, project) -> bool`
  - `delete_folder(folder_id, project) -> bool` (매핑 행도 함께 삭제)
  - `add_to_folder(folder_id, gen_id, project) -> bool`
  - `remove_from_folder(folder_id, gen_id, project) -> bool`
  - `list_generations`에 `folder_id: Optional[int] = None` 파라미터 추가해서 특정 폴더만 필터링하는 옵션(JOIN `gallery_folder_items`)

### 3.3 백엔드 추가 작업 (`routes/media.py`)

| 메서드/경로 | 설명 |
|---|---|
| `POST /v1/image/folders` | 폴더 생성 (`{name, project}`) |
| `GET /v1/image/folders` | 폴더 목록 조회 (`project`) |
| `PUT /v1/image/folders/{folder_id}` | 폴더 이름 변경 |
| `DELETE /v1/image/folders/{folder_id}` | 폴더 삭제 |
| `POST /v1/image/folders/{folder_id}/items/{gen_id}` | 이미지를 폴더에 추가 |
| `DELETE /v1/image/folders/{folder_id}/items/{gen_id}` | 이미지를 폴더에서 제거 |
| `GET /v1/image/history?folder_id=...` | 기존 엔드포인트에 쿼리 파라미터만 추가 |

기존 `SetFavoriteRequest` 패턴처럼 Pydantic 모델(`CreateFolderRequest{name, project}`)을 만들고, 404는 기존과 동일하게 "해당 폴더/이력을 찾을 수 없습니다" 메시지로 통일.

### 3.4 프론트엔드 추가 작업 (`src/App.jsx`)

- 상태 추가: `galleryFolders`(폴더 목록), `activeFolderId`(현재 보는 폴더, `null`이면 전체)
- 보관함 로드 시 `GET /v1/image/folders`도 같이 호출
- 헤더 영역(L2549~2569)에 "즐겨찾기만" 버튼 옆에:
  - 폴더 선택 드롭다운/칩 목록 (전체 / 폴더별)
  - "+ 새 폴더" 버튼 → 이름 입력 모달 → `POST /v1/image/folders`
- 그리드 카드(L2601~2634)에 폴더 담기 액션 추가(예: 우클릭 메뉴 또는 별 아이콘 옆에 폴더 아이콘 버튼) → 폴더 선택 팝오버 → `POST /v1/image/folders/{folder_id}/items/{gen_id}`
- 기존 `toggleFavorite`과 동일하게 낙관적 업데이트 + 실패 시 롤백 패턴 재사용 권장(L398~415 참고)

---

## 4. 참고 파일 목록

| 파일 | 역할 |
|---|---|
| `backend/services/image_history_store.py` | 보관함 SQLite 스토어 (여기에 폴더 테이블/함수 추가) |
| `backend/routes/media.py` | `/v1/image/*` API 라우트 (여기에 폴더 엔드포인트 추가) |
| `backend/config.py` | `DB_PATH` 정의 |
| `backend/server.py` | 라우터 등록 지점 (수정 불필요, 이미 `media_router` 등록됨) |
| `src/App.jsx` | 프론트엔드 전체 (보관함 UI는 L2549~2712 부근) |

## 5. 구현 순서 제안

1. 사용자에게 "이미지 1장이 여러 폴더에 동시에 들어갈 수 있어야 하는지"부터 확인 (§3.1 참고)
2. `image_history_store.py`에 테이블 생성 + CRUD 함수 추가
3. `routes/media.py`에 엔드포인트 추가 (기존 즐겨찾기 엔드포인트를 그대로 템플릿으로 사용)
4. 프론트 상태/API 연동 추가
5. 폴더 생성 → 이미지 담기 → 폴더별 필터링 → 폴더 삭제 순으로 수동 테스트
6. `작업_인수인계서.md`에 변경 파일과 커밋 여부 기록 (작업지시서 규칙 4)
