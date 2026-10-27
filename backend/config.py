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
# 2026-10-27: 구글 이미지 해상도 단계. 지정하지 않으면 1K(약 100만 화소, 16:9 에서 1376×768)로 나온다. 공식 가격표상 2K(약 400만 화소)는 1K 와 같은 요금($0.134)이고 4K(약 1,600만 화소)는 $0.24 다.
# 값은 1K / 2K / 4K 뿐이며 대문자 K 여야 한다(소문자는 거절됨). 그 밖의 값이나 빈 값이면 단계를 보내지 않고 구글 기본값(1K)을 쓴다.
GEMINI_IMAGE_SIZE = os.getenv("GEMINI_IMAGE_SIZE", "2K").strip().upper()
# 비용 통제: 기본은 중간 품질. 필요하면 .env에서 high 등으로 올린다.
OPENAI_IMAGE_QUALITY = os.getenv("OPENAI_IMAGE_QUALITY", "medium")
# 2026-10-07: 한 장당 예상 비용(USD)과 하루 사용 한도. 예상값은 공식 가격표의 대략치이고 실제 청구액과 다를 수 있다 —
# 모델·품질을 바꾸면 .env 에서 맞춰 준다. 한도를 넘으면 그날은 유료 생성이 막힌다(0이면 한도 없음).
PAID_COST_OPENAI_USD = float(os.getenv("PAID_COST_OPENAI_USD", "0.07"))
PAID_COST_GEMINI_USD = float(os.getenv("PAID_COST_GEMINI_USD", "0.13"))
PAID_COST_GEMINI_4K_USD = float(os.getenv("PAID_COST_GEMINI_4K_USD", "0.24"))   # GEMINI_IMAGE_SIZE=4K 일 때의 한 장 예상 비용
PAID_DAILY_LIMIT_USD = float(os.getenv("PAID_DAILY_LIMIT_USD", "10"))
# 2026-10-16: 유료 API 누적 총 한도(원). 이미지 생성·정밀 읽기 등 모든 유료 호출의 예상 비용을 한 장부에 합산해서, 이 금액을 넘기는 호출은 막는다(0 이하면 검사 안 함).
# 예상 비용은 달러로 잡혀 있어 USD_KRW(환율 가정, 기본 1400원/$)로 원화로 바꿔 비교한다. 실제 청구액과 다를 수 있으니 Google Cloud·OpenAI 쪽 예산 알림도 같이 걸어 두는 것이 안전하다.
PAID_TOTAL_LIMIT_KRW = int(float(os.getenv("PAID_TOTAL_LIMIT_KRW", "10000")))
USD_KRW = float(os.getenv("USD_KRW", "1400"))

# 2026-10-14: 손스케치 '정밀 읽기'(유료 비전 모델). 결제가 연결된 Gemini 키(GEMINI_PAID_API_KEY, 없으면 위 GEMINI_IMAGE_API_KEY 를 같이 쓴다)와
# 읽기용 모델 ID(GEMINI_PAID_VISION_MODEL)가 둘 다 있어야 화면에 '정밀 읽기' 버튼이 나타난다. 모델 ID 는 공급자가 자주 바꾸므로 코드에 박지 않고
# .env 로 지정한다(예: Pro 급 모델 ID). 호출 한 번의 예상 비용(USD)은 대략치이며 실제 청구액과 다를 수 있다 — 하루 한도(PAID_DAILY_LIMIT_USD)에 합산된다.
GEMINI_PAID_API_KEY = os.getenv("GEMINI_PAID_API_KEY", "") or GEMINI_IMAGE_API_KEY
GEMINI_PAID_VISION_MODEL = os.getenv("GEMINI_PAID_VISION_MODEL", "")
PAID_COST_VISION_USD = float(os.getenv("PAID_COST_VISION_USD", "0.07"))   # 상위 모델은 생각 토큰이 많아 호출당 $0.04~0.10 정도라 0.03 에서 올렸다(2026-10-16)
