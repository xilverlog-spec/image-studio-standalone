"""이미지 생성 스튜디오의 생성 이력 저장소.

2026-08-20: "이미지 생성 스튜디오"(디자이너 전용 작업 공간) 요구사항 중 "이력이 새로고침 후에도
남아야 한다"를 위해 신설. `/v1/image/generate`가 호출될 때마다(콘솔 자동 위임이든 스튜디오
직접 생성이든 상관없이) 여기 한 줄씩 쌓인다 — 두 경로를 따로 추적할 이유가 없어 하나로 합쳤다.
"""

import json
import sqlite3
import time

from config import DB_PATH

DEFAULT_PROJECT = "default"


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_image_history_db():
    conn = _connect()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS image_generations (
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
            created_at REAL NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_image_gen_project ON image_generations(project, id DESC)")
    # 2026-08-27: 갤러리 즐겨찾기 기능 추가. 기존 DB에는 컬럼이 없을 수 있으므로 ALTER TABLE로
    # 보강한다 — 이미 있으면 sqlite3가 "duplicate column" 에러를 던지므로 무시한다.
    try:
        cur.execute("ALTER TABLE image_generations ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    # 2026-08-27: "이 설정으로 다시 만들기"가 체크포인트까지 정확히 재현하려면 이력에 실제
    # 사용된 체크포인트가 남아있어야 한다 — 지금까진 저장 안 해서 재생성 시 AI 자동 선택에
    # 맡길 수밖에 없었고, 그 결과 완전히 다른 체크포인트가 골라져 다른 그림이 나왔다.
    try:
        cur.execute("ALTER TABLE image_generations ADD COLUMN checkpoint TEXT")
    except sqlite3.OperationalError:
        pass
    # 2026-09-03: 블렌딩 결과를 라이트박스에서 "전/후" 비교 슬라이더로 보여주기 위해, 원본(블렌딩
    # 전) 이미지도 파일로 같이 저장해두고 그 파일명을 이력에 남긴다. 새로고침/재시작 후에도
    # 비교가 되게 하려는 목적 — 블렌딩이 아닌 이력에서는 그냥 NULL로 둔다.
    try:
        cur.execute("ALTER TABLE image_generations ADD COLUMN before_image_filename TEXT")
    except sqlite3.OperationalError:
        pass
    # 2026-09-03: 보관함 "즐겨찾기 폴더" 기능. 이미지 1장은 폴더 1개에만 속한다(참고자료
    # FAVORITES_FOLDER_FEATURE.md 검토 후, 여러 폴더 동시 소속은 필요 없다고 확인됨) —
    # 그래서 N:M 매핑 테이블 대신 image_generations에 folder_id 컬럼만 추가하는 가벼운 방식.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gallery_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gallery_folders_project ON gallery_folders(project)")
    try:
        cur.execute("ALTER TABLE image_generations ADD COLUMN folder_id INTEGER")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def save_generation(prompt: str, style: str, aspect_ratio: str, sampler_name: str, scheduler: str,
                    seed: int, loras: list, image_filename: str, checkpoint: str = None,
                    project: str = DEFAULT_PROJECT, before_image_filename: str = None) -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO image_generations "
            "(project, prompt, style, aspect_ratio, sampler_name, scheduler, seed, loras_json, image_filename, checkpoint, before_image_filename, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (project, prompt, style, aspect_ratio, sampler_name, scheduler, seed,
             json.dumps(loras or [], ensure_ascii=False), image_filename, checkpoint, before_image_filename, time.time()),
        )
        new_id = cur.lastrowid
        conn.commit()
        return new_id
    finally:
        conn.close()


def list_generations(project: str = DEFAULT_PROJECT, limit: int = 60, folder_id: int = None) -> list:
    conn = _connect()
    try:
        cur = conn.cursor()
        query = (
            "SELECT id, prompt, style, aspect_ratio, sampler_name, scheduler, seed, loras_json, "
            "image_filename, created_at, is_favorite, checkpoint, before_image_filename, folder_id "
            "FROM image_generations WHERE project = ?"
        )
        params = [project]
        if folder_id is not None:
            query += " AND folder_id = ?"
            params.append(folder_id)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        cur.execute(query, params)
        rows = cur.fetchall()
        return [
            {
                "id": r[0], "prompt": r[1], "style": r[2], "aspectRatio": r[3],
                "samplerName": r[4], "scheduler": r[5], "seed": r[6],
                "loras": json.loads(r[7] or "[]"), "imageFilename": r[8], "createdAt": r[9],
                "isFavorite": bool(r[10]), "checkpoint": r[11], "beforeImageFilename": r[12],
                "folderId": r[13],
            }
            for r in rows
        ]
    finally:
        conn.close()


def set_favorite(gen_id: int, is_favorite: bool, project: str = DEFAULT_PROJECT) -> bool:
    """즐겨찾기 상태를 바꾼다. 해당 이력이 없으면 False를 반환한다."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE image_generations SET is_favorite = ? WHERE id = ? AND project = ?",
            (1 if is_favorite else 0, gen_id, project),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def create_folder(name: str, project: str = DEFAULT_PROJECT) -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO gallery_folders (project, name, created_at) VALUES (?, ?, ?)",
            (project, name, time.time()),
        )
        new_id = cur.lastrowid
        conn.commit()
        return new_id
    finally:
        conn.close()


def list_folders(project: str = DEFAULT_PROJECT) -> list:
    """폴더 목록과, 폴더마다 몇 장이 들어있는지(itemCount)를 같이 반환한다."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT f.id, f.name, f.created_at, "
            "(SELECT COUNT(*) FROM image_generations g WHERE g.folder_id = f.id) AS item_count "
            "FROM gallery_folders f WHERE f.project = ? ORDER BY f.created_at ASC",
            (project,),
        )
        rows = cur.fetchall()
        return [{"id": r[0], "name": r[1], "createdAt": r[2], "itemCount": r[3]} for r in rows]
    finally:
        conn.close()


def rename_folder(folder_id: int, name: str, project: str = DEFAULT_PROJECT) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE gallery_folders SET name = ? WHERE id = ? AND project = ?",
            (name, folder_id, project),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_folder(folder_id: int, project: str = DEFAULT_PROJECT) -> bool:
    """폴더를 지운다. SQLite는 기본적으로 FK CASCADE를 강제하지 않으므로, 그 폴더에
    속해 있던 이미지들의 folder_id를 명시적으로 NULL로 되돌려 "폴더 없음" 상태로 만든다
    (이미지 자체나 파일은 지우지 않는다 — 폴더만 없어질 뿐)."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE image_generations SET folder_id = NULL WHERE folder_id = ? AND project = ?",
            (folder_id, project),
        )
        cur.execute("DELETE FROM gallery_folders WHERE id = ? AND project = ?", (folder_id, project))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def set_folder(gen_id: int, folder_id: int, project: str = DEFAULT_PROJECT) -> bool:
    """이미지 한 장을 폴더에 넣거나(folder_id 지정) 뺀다(folder_id=None)."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE image_generations SET folder_id = ? WHERE id = ? AND project = ?",
            (folder_id, gen_id, project),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_generation(gen_id: int, project: str = DEFAULT_PROJECT):
    """이력 한 건을 지우고, 그 행이 가리키던 (image_filename, before_image_filename)을
    돌려준다(호출자가 실제 파일도 지울 수 있도록 — 2026-08-20, "생성 결과물을 삭제할 수
    있어야 한다" 요청으로 추가). 지울 행이 없으면 None을 반환한다.
    """
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT image_filename, before_image_filename FROM image_generations WHERE id = ? AND project = ?",
            (gen_id, project),
        )
        row = cur.fetchone()
        if not row:
            return None
        cur.execute("DELETE FROM image_generations WHERE id = ? AND project = ?", (gen_id, project))
        conn.commit()
        return {"image_filename": row[0], "before_image_filename": row[1]}
    finally:
        conn.close()
