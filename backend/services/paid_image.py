"""유료 이미지 생성 API 래퍼(OpenAI GPT Image / Google Gemini 이미지). 결과는 항상 PNG 바이트로 돌려준다."""
import base64
import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image

import threading
import time

from config import (
    DATA_DIR, GEMINI_API_URL, GEMINI_IMAGE_API_KEY, GEMINI_IMAGE_MODEL,
    OPENAI_API_KEY, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY,
    PAID_COST_GEMINI_USD, PAID_COST_OPENAI_USD, PAID_DAILY_LIMIT_USD,
)

_TIMEOUT_SEC = 240
_GEMINI_RATIOS = {"1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"}
MAX_REFERENCE_IMAGES = 3

PROVIDERS = {
    "openai": {"label": "OpenAI (GPT Image)", "key": lambda: OPENAI_API_KEY, "model": lambda: OPENAI_IMAGE_MODEL, "cost": lambda: PAID_COST_OPENAI_USD},
    "gemini": {"label": "Google (Nano Banana)", "key": lambda: GEMINI_IMAGE_API_KEY, "model": lambda: GEMINI_IMAGE_MODEL, "cost": lambda: PAID_COST_GEMINI_USD},
}

# ── 비용 장부: 하루 단위로 예상 비용을 누적해 한도를 넘으면 막는다(서버 재시작 후에도 유지) ──
_USAGE_FILE = os.path.join(DATA_DIR, "paid_usage.json")
_USAGE_LOCK = threading.Lock()


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def _read_usage() -> dict:
    try:
        with open(_USAGE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def usage_today() -> dict:
    """오늘 누적: {'date', 'usd', 'count', 'limit_usd'} (예상 비용 기준)."""
    with _USAGE_LOCK:
        day = _read_usage().get(_today(), {})
    return {"date": _today(), "usd": round(float(day.get("usd", 0.0)), 4), "count": int(day.get("count", 0)), "limit_usd": PAID_DAILY_LIMIT_USD}


def estimate_cost(provider: str, n_images: int = 1) -> float:
    p = PROVIDERS.get(provider)
    return round(p["cost"]() * max(1, n_images), 4) if p else 0.0


def check_budget(provider: str) -> None:
    """한도를 넘기게 되면 RuntimeError. 한도 0 이하면 검사하지 않는다."""
    if PAID_DAILY_LIMIT_USD <= 0:
        return
    u = usage_today()
    if u["usd"] + estimate_cost(provider) > PAID_DAILY_LIMIT_USD:
        raise RuntimeError(f"오늘 유료 이미지 사용 한도(${PAID_DAILY_LIMIT_USD:g})에 도달했습니다 (현재 약 ${u['usd']:.2f}). 내일 다시 쓰거나 관리자가 한도를 올려야 합니다.")


def _record_usage(provider: str) -> None:
    with _USAGE_LOCK:
        data = _read_usage()
        day = data.setdefault(_today(), {"usd": 0.0, "count": 0})
        day["usd"] = float(day.get("usd", 0.0)) + estimate_cost(provider)
        day["count"] = int(day.get("count", 0)) + 1
        for k in [k for k in data if k < time.strftime("%Y-%m-%d", time.localtime(time.time() - 40 * 86400))]:
            data.pop(k, None)   # 40일 지난 기록은 정리
        with open(_USAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)


def provider_status() -> list:
    return [
        {"id": pid, "label": p["label"], "model": p["model"](), "available": bool(p["key"]()), "est_cost_usd": p["cost"]()}
        for pid, p in PROVIDERS.items()
    ]


def _http_json(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json", **headers})
    return _send(req)


def _send(req: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SEC) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except Exception:
            pass
        raise RuntimeError(f"({e.code}) {detail}"[:600]) from e


def _to_png(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    buf = io.BytesIO()
    img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB").save(buf, "PNG")
    return buf.getvalue()


def _openai_size(aspect_ratio: str | None) -> str:
    if not aspect_ratio or ":" not in aspect_ratio:
        return "1024x1024"
    w, h = (float(x) for x in aspect_ratio.split(":"))
    long_edge = 1536
    if w >= h:
        width, height = long_edge, long_edge * h / w
    else:
        width, height = long_edge * w / h, long_edge
    snap = lambda v: max(16, int(round(v / 16)) * 16)
    return f"{snap(width)}x{snap(height)}"


def _multipart(fields: dict, files: list) -> tuple[bytes, str]:
    boundary = "----studio" + os.urandom(8).hex()
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for name, filename, ctype, data in files:
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
        out.write(data)
        out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def _generate_openai(prompt: str, aspect_ratio: str | None, input_image: bytes | None, extra_images: list | None = None) -> bytes:
    auth = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    size = _openai_size(aspect_ratio)
    if input_image:
        files = [("image[]", "input.png", "image/png", input_image)]
        files += [("image[]", f"ref{i + 1}.png", "image/png", b) for i, b in enumerate(extra_images or [])]
        body, ctype = _multipart(
            {"model": OPENAI_IMAGE_MODEL, "prompt": prompt, "size": size, "quality": OPENAI_IMAGE_QUALITY},
            files,
        )
        req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body, headers={"Content-Type": ctype, **auth})
        data = _send(req)
    else:
        data = _http_json(
            "https://api.openai.com/v1/images/generations",
            {"model": OPENAI_IMAGE_MODEL, "prompt": prompt, "size": size, "quality": OPENAI_IMAGE_QUALITY, "n": 1},
            auth,
        )
    items = data.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise RuntimeError("OpenAI 응답에 이미지가 없습니다.")
    return base64.b64decode(items[0]["b64_json"])


def _generate_gemini(prompt: str, aspect_ratio: str | None, input_image: bytes | None, extra_images: list | None = None) -> bytes:
    parts = [{"text": prompt}]
    for b in ([input_image] if input_image else []) + list(extra_images or []):
        parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(b).decode()}})
    gen_cfg = {"responseModalities": ["IMAGE"]}
    if aspect_ratio in _GEMINI_RATIOS:
        gen_cfg["imageConfig"] = {"aspectRatio": aspect_ratio}
    data = _http_json(
        f"{GEMINI_API_URL}/{GEMINI_IMAGE_MODEL}:generateContent",
        {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen_cfg},
        {"x-goog-api-key": GEMINI_IMAGE_API_KEY},
    )
    candidates = data.get("candidates") or []
    if not candidates:
        reason = (data.get("promptFeedback") or {}).get("blockReason")
        raise RuntimeError(f"Gemini가 요청을 거부했습니다: {reason}" if reason else "Gemini 응답에 결과가 없습니다.")
    for part in (candidates[0].get("content") or {}).get("parts") or []:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])
    raise RuntimeError("Gemini 응답에 이미지가 없습니다(텍스트만 반환됨).")


def generate_png(provider: str, prompt: str, aspect_ratio: str | None = None, input_image: bytes | None = None, extra_images: list | None = None) -> bytes:
    """input_image = 형태를 정하는 주 이미지, extra_images = 재질·분위기 등 참조 이미지(최대 MAX_REFERENCE_IMAGES장; 역할은 prompt 에 적는다)."""
    if provider not in PROVIDERS:
        raise RuntimeError(f"알 수 없는 이미지 공급자: {provider}")
    if not PROVIDERS[provider]["key"]():
        raise RuntimeError(f"{PROVIDERS[provider]['label']} API 키가 설정되어 있지 않습니다 (backend/.env).")
    check_budget(provider)
    fn = _generate_openai if provider == "openai" else _generate_gemini
    png = _to_png(fn(prompt, aspect_ratio, input_image, (extra_images or [])[:MAX_REFERENCE_IMAGES]))
    _record_usage(provider)   # 호출이 성공했을 때만 장부에 올린다(실패는 보통 과금되지 않는다)
    return png
