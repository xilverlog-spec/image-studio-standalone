"""손스케치 '정밀 읽기': 결제가 연결된 Gemini 키와 읽기용 상위 모델로 이미지를 읽는다(유료, 사용자가 버튼을 눌렀을 때만).

- 키(GEMINI_PAID_API_KEY 또는 GEMINI_IMAGE_API_KEY)와 모델 ID(GEMINI_PAID_VISION_MODEL)가 둘 다 .env 에 있어야 켜진다. 없으면 available=False.
- 무료 Flash 로 되돌아가는 자동 대체(fallback)를 하지 않는다: 유료를 눌렀는데 몰래 무료로 읽으면 결과를 믿을 수 없다. 실패하면 사유를 그대로 올린다.
- 호출 한 번의 예상 비용은 이미지 생성과 같은 하루 장부(data/paid_usage.json)에 합산되고, 하루 한도를 넘으면 막힌다.
"""
from config import GEMINI_PAID_API_KEY, GEMINI_PAID_VISION_MODEL, PAID_COST_VISION_USD
from services import paid_image
from services.gemini_chat import _gemini_chat_once


def status() -> dict:
    return {
        "available": bool(GEMINI_PAID_API_KEY and GEMINI_PAID_VISION_MODEL),
        "model": GEMINI_PAID_VISION_MODEL or "",
        "est_cost_usd": PAID_COST_VISION_USD,
        "usage_today": paid_image.usage_today(),
    }


def chat(messages: list, max_tokens: int = 16000, temperature: float = 0.2) -> str:
    st = status()
    if not st["available"]:
        raise RuntimeError("유료 정밀 읽기가 설정되어 있지 않습니다 (backend/.env 의 GEMINI_PAID_API_KEY 또는 GEMINI_IMAGE_API_KEY, 그리고 GEMINI_PAID_VISION_MODEL).")
    paid_image.check_budget_amount(PAID_COST_VISION_USD, "정밀 읽기")
    text = _gemini_chat_once(GEMINI_PAID_VISION_MODEL, messages, max(max_tokens, 8000), temperature, api_key=GEMINI_PAID_API_KEY)
    paid_image.record_usage_amount(PAID_COST_VISION_USD)  # 성공한 호출만 장부에 올린다
    return text
