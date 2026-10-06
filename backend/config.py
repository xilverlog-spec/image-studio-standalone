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

# 2026-10-06: 이미지 "생성"용 유료 API(로컬 ComfyUI와 선택 가능). 키가 없으면 해당 공급자는 화면에서 비활성화된다.
# 모델 ID는 공급자가 자주 바꾸므로 .env로 덮어쓸 수 있게 둔다. 무료 Gemini 키(GEMINI_API_KEY)는 이미지 생성
# 쿼터가 0이라 쓸 수 없다 — 결제가 연결된 키를 GEMINI_IMAGE_API_KEY로 따로 넣어야 Google 엔진이 활성화된다.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare")
GEMINI_IMAGE_API_KEY = os.getenv("GEMINI_IMAGE_API_KEY", "")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
# 비용 통제: 기본은 중간 품질. 필요하면 .env에서 high 등으로 올린다.
OPENAI_IMAGE_QUALITY = os.getenv("OPENAI_IMAGE_QUALITY", "medium")
