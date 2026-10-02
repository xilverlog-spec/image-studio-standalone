import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)

DATA_DIR = os.path.join(ROOT_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "image_studio.db")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# 2026-10-01: Gemini API 키. 이미지 "생성"은 무료 쿼터가 0이라 쓰지 않는다(§ 세션 기록) — 여기서는
# 텍스트/비전(이미지 "분석"만, 생성 아님) 용도로만 쓴다. Flash 계열은 Google 가격표에 무료로
# 표시돼 있고, 2026-10-01에 이 키로 실제 호출해 과금 없이 동작하는 것을 확인했다.
# 주의: 무료 등급은 전송한 데이터가 Google 제품 개선에 쓰일 수 있다 — 민감한 이미지는 보내지 않는다.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
