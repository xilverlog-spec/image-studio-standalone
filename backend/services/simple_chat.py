"""이미지 생성 스튜디오 전용 초경량 LLM 채팅 래퍼.

DX 랩 본체의 llm_router.py는 멀티 에이전트 툴 루프, 클라우드 에스컬레이션, 검증/재시도
루프까지 포함된 무거운 시스템이라(§ agent_router/services/llm_router.py) 이미지 스튜디오
단독 패키지에는 과하다. 여기서는 Ollama에 직접 채팅 요청만 보내는 최소 기능만 남긴다 —
대화 탭, 대화→프롬프트 컴파일, 프롬프트 다듬기, 자동 튜닝(AI 옵션 추천)이 전부 이 함수 하나로 동작한다.
"""

import json
import re
import urllib.request

from config import OLLAMA_URL


def _strip_thinking(content: str) -> str:
    """content 필드 안에 <think> 태그가 섞여 들어온 경우를 위한 방어적 처리."""
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    if "</think>" in content:
        content = content.split("</think>", 1)[-1]
    return content.strip()


def _think_param(model: str):
    """모델별 think 파라미터 값을 정한다.

    - qwen3 계열: Ollama 템플릿이 think 값과 무관하게 항상 <think> 블록을 생성하므로,
      think:true로 요청해야 Ollama가 그 추론을 message.thinking으로 분리해 주고
      content에는 최종 답변만 남는다.
    - gemma4 계열: think:false가 정상적으로 추론 자체를 건너뛰어 훨씬 빠르다(실측 3초대
      vs think:true일 때 15초 이상). 이 스튜디오의 대화/프롬프트 작업은 답변 품질보다
      속도가 중요해 false로 고정한다.
    - qwen2.5-coder 등 thinking 기능이 없는 모델: think 키 자체를 보내면 Ollama가
      400 Bad Request를 반환하므로 아예 생략한다(None → payload에서 제외).
    """
    m = model.lower()
    if "qwen3" in m:
        return True
    if "gemma" in m:
        return False
    return None


def chat_completion(model: str, messages: list, max_tokens: int = 3000, temperature: float = 0.3) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    think = _think_param(model)
    if think is not None:
        payload["think"] = think

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        data = json.loads(res.read())

    # message.thinking 필드는 완전히 무시하고 content만 사용한다.
    message = data.get("message") or {}
    content = message.get("content", "")

    return _strip_thinking(content)
