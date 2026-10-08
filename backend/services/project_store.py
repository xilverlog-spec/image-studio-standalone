"""프로젝트(작업 공간) 계정 관리 — 여러 PC에서 같은 서버를 쓸 때 각자 이름/비밀번호로
자기 프로젝트를 만들어 결과물이 서로 섞이지 않게 한다(2026-09-10).

image_generations/gallery_folders 테이블은 이미 project 컬럼으로 데이터를 분리하고
있었다 — 여기서는 그 project 이름에 비밀번호를 붙이는 계정 테이블만 추가한다.
비밀번호는 소금(salt) + PBKDF2-SHA256으로 해시해 저장하고 평문은 저장하지 않는다.
"""
import hashlib
import os
import shutil
import sqlite3
import time

from config import DB_PATH
from services.image_history_store import project_dir_name

_OUTPUT_IMAGES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))

_PBKDF2_ITERATIONS = 100_000


def _get_conn():
    return sqlite3.connect(DB_PATH)


def init_project_db():
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            name TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    # 2026-10-08: 프로젝트별 외부 전송 허용 여부(1=허용, 0=금지). 대외비 프로젝트는 이미지·설명이 OpenAI/Google 서버로 나가는 유료 엔진을 막는다.
    cols = [r[1] for r in cur.execute("PRAGMA table_info(projects)").fetchall()]
    if "external_allowed" not in cols:
        cur.execute("ALTER TABLE projects ADD COLUMN external_allowed INTEGER NOT NULL DEFAULT 1")
    conn.commit()
    conn.close()


def get_external_allowed(name: str) -> bool:
    """프로젝트가 외부 서버 전송(유료 이미지 API)을 허용하는지. 계정이 없는 프로젝트(default 등)는 허용으로 본다."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT external_allowed FROM projects WHERE name = ?", (name,))
    row = cur.fetchone()
    conn.close()
    return True if row is None else bool(row[0])


def set_external_allowed(name: str, allowed: bool, password: str):
    """바꾸려면 프로젝트 비밀번호가 필요하다(아무나 대외비 보호를 풀지 못하게)."""
    if not verify_project(name, password):
        raise ValueError("비밀번호가 올바르지 않습니다.")
    conn = _get_conn()
    conn.execute("UPDATE projects SET external_allowed = ? WHERE name = ?", (1 if allowed else 0, name))
    conn.commit()
    conn.close()


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, _PBKDF2_ITERATIONS).hex()


def list_projects() -> list:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT name FROM projects ORDER BY created_at ASC")
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


def project_exists(name: str) -> bool:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM projects WHERE name = ?", (name,))
    exists = cur.fetchone() is not None
    conn.close()
    return exists


def create_project(name: str, password: str):
    if project_exists(name):
        raise ValueError("이미 존재하는 프로젝트 이름입니다.")
    salt = os.urandom(16)
    password_hash = _hash_password(password, salt)
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO projects (name, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
        (name, password_hash, salt.hex(), time.time()),
    )
    conn.commit()
    conn.close()


def verify_project(name: str, password: str) -> bool:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT password_hash, salt FROM projects WHERE name = ?", (name,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return False
    password_hash, salt_hex = row
    return _hash_password(password, bytes.fromhex(salt_hex)) == password_hash


def rename_project(name: str, new_name: str, password: str):
    if not verify_project(name, password):
        raise ValueError("비밀번호가 올바르지 않습니다.")
    if project_exists(new_name):
        raise ValueError("이미 존재하는 프로젝트 이름입니다.")
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE projects SET name = ? WHERE name = ?", (new_name, name))
    # 기존 이미지 이력/폴더도 새 이름으로 함께 옮겨야 결과물이 그대로 보인다.
    cur.execute("UPDATE image_generations SET project = ? WHERE project = ?", (new_name, name))
    cur.execute("UPDATE gallery_folders SET project = ? WHERE project = ?", (new_name, name))
    conn.commit()
    conn.close()


def delete_project(name: str, password: str):
    """프로젝트 계정 + 생성 이력/폴더 DB 행 + 실제 결과물 폴더(output/images/<project_dir>)를
    전부 지운다(2026-09-11, 되돌릴 수 없는 작업이라 비밀번호 확인 필수). "default" 프로젝트는
    비밀번호 없이 기본 폴백으로 쓰이는 공용 공간이라 삭제 대상에서 제외한다."""
    if project_dir_name(name) == "default":
        raise ValueError("기본(default) 프로젝트는 삭제할 수 없습니다.")
    if not verify_project(name, password):
        raise ValueError("비밀번호가 올바르지 않습니다.")

    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM projects WHERE name = ?", (name,))
    cur.execute("DELETE FROM image_generations WHERE project = ?", (name,))
    cur.execute("DELETE FROM gallery_folders WHERE project = ?", (name,))
    conn.commit()
    conn.close()

    folder = os.path.join(_OUTPUT_IMAGES_DIR, project_dir_name(name))
    # 방어적 확인: 정규화된 경로가 output/images 바로 아래에 있는지 재확인 후 삭제
    # (project_dir_name이 이미 화이트리스트 정규화를 하지만, 이중으로 경로 탈출을 막는다).
    if os.path.commonpath([os.path.abspath(folder), _OUTPUT_IMAGES_DIR]) == _OUTPUT_IMAGES_DIR:
        shutil.rmtree(folder, ignore_errors=True)
