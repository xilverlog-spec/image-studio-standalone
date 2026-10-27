"""조감도 탭의 무료 엔진(로컬 ComfyUI). 유료 API 없이도 같은 화면·같은 흐름으로 쓸 수 있게 한다.

- sdxl    : 모델링 이미지의 윤곽(Canny)을 붙잡고 SDXL(Juggernaut)로 실사화. 빠르다(약 40~70초). 참조 이미지가 있으면 IP-Adapter 로 재료·분위기를 섞는다.
- kontext : FLUX Kontext 로 "이 이미지를 이렇게 바꿔라"를 지시문으로 수행. 느리지만(약 3분) 원본을 더 그대로 둔 채 바꾼다.
유료 모델(GPT Image·Gemini)보다 형태 보존이 떨어진다 — 형태 점수(form_check)로 그 정도를 숫자로 보여 준다.
"""
import io
import math
import os
import threading
import time

from PIL import Image

import comfyui_client

SDXL_CHECKPOINT = "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors"
SDXL_PIXELS = 1.25e6
NEGATIVE_EXTRA = "warped perspective, floating objects, unrealistic proportions, tilted horizon, distorted details, sketch, monochrome, cartoon, text, watermark"


def sdxl_size(w: int, h: int) -> tuple:
    """입력 비율을 그대로 살린 SDXL 생성 크기(64 배수, 약 125만 화소). 비율이 달라지면 형태 점수도 못 매기고 찌그러진다."""
    r = max(0.5, min(2.2, w / h))
    hh = math.sqrt(SDXL_PIXELS / r)
    ww = r * hh
    return int(round(ww / 64) * 64), int(round(hh / 64) * 64)


def keep_to_params(keep_form: int) -> dict:
    """형태 유지 슬라이더(0~100) → 윤곽 고정 세기·재생성 정도. App.jsx 의 건축 실사화와 같은 식."""
    k = max(0, min(100, keep_form)) / 100.0
    return {"controlnet_strength": round(0.5 + k * 0.45, 3), "denoise": round(0.95 - k * 0.20, 3)}


_AVAIL = {"t": -1e9, "v": None}
_AVAIL_LOCK = threading.Lock()
AVAIL_TTL_UP = 20.0       # ComfyUI 가 켜져 있을 때 확인 결과를 기억하는 시간(초) — 화면이 조감도 옵션을 자주 불러도 ComfyUI 를 매번 두드리지 않게
AVAIL_TTL_DOWN = 5.0      # 꺼져 있을 때는 짧게(켜지면 곧 알아챈다)


def _probe_available() -> dict:
    import urllib.request
    try:
        urllib.request.urlopen(f"{comfyui_client.COMFYUI_URL}/system_stats", timeout=3).read()
        up = True
    except Exception:
        up = False
    sdxl = False
    if up:
        try:
            sdxl = comfyui_client.is_controlnet_canny_available()
        except Exception:
            sdxl = False
    return {"sdxl": up and sdxl, "kontext": up and comfyui_client.is_flux_kontext_available()}


def available() -> dict:
    """엔진별 사용 가능 여부(ComfyUI 응답·모델 설치 여부). 확인에 4~6초가 걸리고(생성이 도는 중엔 더) 화면이 자주 부르므로 결과를 잠깐 기억한다
    (2026-10-26: 이 확인이 겹쳐 서버가 느려졌다는 의심이 있어 20초 기억 + 한 번에 하나만 확인)."""
    with _AVAIL_LOCK:
        now = time.monotonic()
        v = _AVAIL["v"]
        if v is not None and now - _AVAIL["t"] < (AVAIL_TTL_UP if (v["sdxl"] or v["kontext"]) else AVAIL_TTL_DOWN):
            return dict(v)
        v = _probe_available()
        _AVAIL.update(t=time.monotonic(), v=v)
        return dict(v)


def render_sdxl(input_png: bytes, prompt: str, out_path: str, seed: int, keep_form: int = 85, refs: list | None = None, ref_weight: float = 0.6) -> tuple:
    """반환: (저장 경로, (가로, 세로)). refs = [PNG 바이트...] 가 있으면 구조(윤곽)+참조(IP-Adapter) 블렌딩."""
    with Image.open(io.BytesIO(input_png)) as im:
        w, h = sdxl_size(*im.size)
        src = im.convert("RGB").resize((w, h), Image.LANCZOS)
    buf = io.BytesIO()
    src.save(buf, "PNG")
    params = keep_to_params(keep_form)
    if refs:
        slots = [{"image_bytes": buf.getvalue(), "type": "PyraCanny", "stop_at": 0.6, "weight": 1.0}]
        for r in refs:
            slots.append({"image_bytes": r, "type": "ImagePrompt", "stop_at": 0.5, "weight": ref_weight})
        comfyui_client.blend_images_or_raise(buf.getvalue(), slots, out_path, seed, prompt=prompt)
    else:
        comfyui_client.generate_image_or_raise(
            prompt, out_path, w, h, steps=30, cfg=4.5, style="architecture", seed=seed,
            negative_extra=NEGATIVE_EXTRA, loras=[], checkpoint=SDXL_CHECKPOINT,
            input_image_bytes=buf.getvalue(), denoise=params["denoise"], disable_face_detailer=True,
            controlnet_strength=params["controlnet_strength"],
        )
    with Image.open(out_path) as o:
        return out_path, o.size


def render_kontext(input_png: bytes, instruction: str, out_path: str, seed: int, refs: list | None = None) -> tuple:
    """Kontext 는 약 1메가픽셀로 줄여 처리한다. 지시문은 영어. refs = 참조 이미지(PNG 바이트) 목록."""
    with Image.open(io.BytesIO(input_png)) as im:
        s = 1344.0 / max(im.size)
        src = im.convert("RGB")
        if s < 1:
            src = src.resize((max(1, int(src.width * s)), max(1, int(src.height * s))), Image.LANCZOS)
    buf = io.BytesIO()
    src.save(buf, "PNG")
    comfyui_client.edit_image_with_kontext_or_raise(buf.getvalue(), instruction, out_path, seed=seed, ref_images=refs or None)
    # Kontext 는 자기 선호 해상도로 비율을 살짝 바꿔 돌려준다(실측 1.73 → 1.66). 건물이 가로로 눌려 보이고 형태 점수도 어긋나므로 입력 비율로 되돌린다.
    with Image.open(out_path) as o:
        out = o.convert("RGB")
        if abs(out.width / out.height - src.width / src.height) / (src.width / src.height) > 0.01:
            nw = out.width
            out = out.resize((nw, max(1, int(round(nw * src.height / src.width)))), Image.LANCZOS)
            out.save(out_path, "PNG")
        return out_path, out.size
