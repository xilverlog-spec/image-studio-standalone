"""Gemini API(텍스트/비전) 래퍼.

simple_chat.py(로컬 Ollama)와 같은 메시지 형식([{role, content, images?}, ...])을 받아서
Gemini의 generateContent 형식으로 변환해 호출한다. chat.py의 /v1/chat/completions가
model 이름이 "gemini"로 시작하면 이쪽으로 라우팅한다.

중요: 여기는 텍스트/비전("분석")만 다룬다. Gemini 이미지 "생성"은 무료 쿼터가 0이라
(2026-09-18 확인, § 세션 기록) 절대 쓰지 않는다 — generateContent 응답에 텍스트가 아니라
이미지가 섞여 올 일이 없는 모델만 호출해야 한다.
"""

import json
import time
import urllib.request
import urllib.error

from config import GEMINI_API_KEY, GEMINI_API_URL

# 2026-10-01: 실측 결과 Gemini 무료 등급은 "모델이 혼잡함(503)" 오류가 꽤 자주 난다
# (같은 요청을 6번 보냈더니 3번 503 — § 세션 기록). 로컬 Ollama는 이 문제가 없지만(내 GPU라
# 남과 경쟁 안 함) 그 대신 느리고 GPU를 점유한다. 503은 보통 몇 초 뒤 재시도하면 풀리므로
# 자동으로 짧게 재시도한다 — 사용자에게 "분석 실패"를 바로 보여주기 전에.
_RETRY_STATUS = {503}  # 429(한도 초과)는 같은 모델로 재시도해도 소용없으니 바로 다음 모델로 넘어간다
_MAX_RETRIES = 2
_RETRY_DELAY_SEC = 3


def _to_gemini_contents(messages: list) -> tuple[list, str | None]:
    """OpenAI 스타일 메시지 배열 -> Gemini contents 배열. system 메시지는 따로 분리해서 반환한다
    (Gemini는 system_instruction을 contents와 별도 필드로 받는다)."""
    system_text = None
    contents = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            # 여러 개면 이어붙인다(흔치 않지만 방어적으로)
            system_text = (system_text + "\n\n" + m["content"]) if system_text else m["content"]
            continue
        gem_role = "model" if role == "assistant" else "user"
        parts = []
        if m.get("content"):
            parts.append({"text": m["content"]})
        for img_b64 in (m.get("images") or []):
            parts.append({"inline_data": {"mime_type": "image/png", "data": img_b64}})
        if parts:
            contents.append({"role": gem_role, "parts": parts})
    return contents, system_text


# 무료 키는 모델마다 하루/분당 한도가 따로라서, 한도(429)에 걸리면 다음 모델로 자동으로 넘어간다.
_QUOTA_FALLBACKS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.6-flash", "gemini-3.1-flash-lite"]


def gemini_chat_completion(model: str, messages: list, max_tokens: int = 3000, temperature: float = 0.3) -> str:
    chain = [model] + [m for m in _QUOTA_FALLBACKS if m != model]
    last = None
    for m in chain:
        try:
            # 3.x 모델은 '생각'에 쓴 토큰도 출력 한도에 들어가서, 한도가 작으면 답이 중간에 잘린다 — 최소 8000 을 보장한다.
            return _gemini_chat_once(m, messages, max(max_tokens, 8000), temperature)
        except Exception as e:  # noqa: BLE001 — 한도/혼잡/시간초과는 다음 모델로 넘기고, 그 밖의 오류(잘못된 요청 등)는 그대로 올린다
            msg = str(e)
            quota = isinstance(e, (TimeoutError, OSError)) or "(429)" in msg or "quota" in msg.lower() or "(503)" in msg or "timed out" in msg.lower()
            if not quota:
                raise
            print(f"[GEMINI] {m} 한도/혼잡 → 다음 모델로 전환: {msg[:90]}")
            last = e
    raise last


def _gemini_chat_once(model: str, messages: list, max_tokens: int = 3000, temperature: float = 0.3) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되어 있지 않습니다 (backend/.env).")

    contents, system_text = _to_gemini_contents(messages)
    body = {
        "contents": contents,
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if system_text:
        body["system_instruction"] = {"parts": [{"text": system_text}]}

    url = f"{GEMINI_API_URL}/{model}:generateContent?key={GEMINI_API_KEY}"
    payload = json.dumps(body).encode("utf-8")

    last_err = None
    for attempt in range(_MAX_RETRIES + 1):
        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                data = json.loads(res.read())
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(detail).get("error", {}).get("message", detail)
            except Exception:
                pass
            last_err = RuntimeError(f"Gemini API 오류({e.code}): {detail}")
            if e.code in _RETRY_STATUS and attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY_SEC)
                continue
            raise last_err from e
    else:
        raise last_err

    candidates = data.get("candidates") or []
    if not candidates:
        block_reason = (data.get("promptFeedback") or {}).get("blockReason")
        if block_reason:
            raise RuntimeError(f"Gemini가 요청을 거부했습니다: {block_reason}")
        raise RuntimeError("Gemini 응답에 결과가 없습니다.")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if "text" in p)
    return text.strip()
