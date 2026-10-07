import asyncio
import base64
import io
import json
import os
import re
import sys
import time
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Allow import of comfyui_client from parent backend folder
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import comfyui_client
from services.simple_chat import chat_completion
from services import image_history_store
from services import content_safety
from services import paid_image
from services import aerial_modes
from services import aerial_local

router = APIRouter(prefix="/v1")


def _reject_if_unsafe(*texts: str, project: str = ""):
    """사내 공유 배포용 1차 방어선(2026-09-11) — ComfyUI로 넘기기 전에 프롬프트에
    선정적/폭력적/혐오 표현이 섞여 있으면 GPU를 쓰기도 전에 거부한다."""
    blocked = content_safety.find_blocked_terms(*texts)
    if blocked:
        content_safety.log_blocked("prompt", f"project={project} terms={blocked} text={' | '.join(t for t in texts if t)[:200]}")
        raise HTTPException(
            status_code=400,
            detail="부적절한 내용(선정적/폭력적 표현 등)이 포함된 요청이라 생성할 수 없습니다. 프롬프트를 수정해주세요.",
        )


async def _reject_if_unsafe_image(*file_paths: str, project: str = ""):
    """2차 방어선(2026-09-11) — 프롬프트가 무해해 보여도, 모델 자체 편향 등으로 결과물이
    부적절하게 나올 수 있다. 실제 생성된 파일을 검사해서 걸리면 그 파일(들)을 지우고
    거부한다 — 부적절한 이미지가 갤러리/디스크에 남지 않게 한다."""
    for path in file_paths:
        if not path or not os.path.exists(path):
            continue
        is_safe, reason, score = await asyncio.to_thread(content_safety.check_image_safety, path)
        if not is_safe:
            content_safety.log_blocked("image", f"project={project} path={path} reason={reason} score={score:.3f}")
            for p in file_paths:
                if p and os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass
            raise HTTPException(
                status_code=400,
                detail=f"생성된 이미지가 {reason} 내용으로 판단되어 차단되었습니다(신뢰도 {score:.0%}). 프롬프트를 수정해서 다시 시도해주세요.",
            )


class LoraSpec(BaseModel):
    name: str
    strength: float = 0.8

class RefImage(BaseModel):
    role: str = ""           # 'material' | 'mood' | 'site' 등 (프롬프트 문장은 프론트/aerial-prompt 가 만든다)
    base64: str              # 데이터 URL 접두사 없는 base64


class ImageGenerateRequest(BaseModel):
    prompt: str
    # 프론트엔드는 filename을 보내지 않는다 — 필수로 두면 요청이 전부 422로 거절된다.
    filename: Optional[str] = None
    # 기본값은 comfyui_client가 설치된 모델에 맞춰 정한 값을 그대로 쓴다.
    width: int = comfyui_client.DEFAULT_WIDTH
    height: int = comfyui_client.DEFAULT_HEIGHT
    # model_id는 실제 생성을 담당하는 로컬 ComfyUI 체크포인트와 무관해 받아만 두고 무시한다.
    model_id: Optional[str] = None
    # 2026-08-20: num_steps/guidance_scale은 예전엔 받아만 두고 버려졌었다 — 이제 steps/cfg로 실제 반영.
    num_steps: Optional[int] = None
    guidance_scale: Optional[float] = None
    # 2026-08-20 Fooocus 기능 이식: 스타일/화면비 프리셋 + 전문가용 세부 제어.
    style: str = "none"
    aspect_ratio: Optional[str] = None  # 지정 시 width/height보다 우선
    sampler_name: Optional[str] = None
    scheduler: Optional[str] = None
    seed: Optional[int] = None  # 고정하면 같은 그림 재현 가능. 없으면 매번 랜덤.
    negative_prompt_extra: str = ""
    # 2026-08-20: LoRA 스택(최대 5개, Fooocus와 동일 상한). 파일은 ComfyUI/models/loras에 직접 넣어야 함.
    loras: List[LoraSpec] = []
    # 2026-08-20: 체크포인트(생성 모델) 직접 선택. 없으면 기본 우선순위대로 고른다.
    # 이 값에 따라 화면비 → 실제 픽셀 크기가 달라진다(SD1.5 512계열 vs SDXL 1024계열).
    checkpoint: Optional[str] = None
    project: str = image_history_store.DEFAULT_PROJECT
    # 2026-08-27: img2img — base64 인코딩된 참고 이미지(데이터 URL 접두사 없이). 주어지면
    # 순수 노이즈 대신 이 이미지를 기반으로 다시 그린다("밤으로 바꿔줘" 같은 부분 수정용).
    input_image_base64: Optional[str] = None
    # img2img일 때만 의미 있음. 낮을수록 원본 보존, 1.0이면 원본과 사실상 무관해진다.
    denoise: float = 0.6
    # 2026-08-31: 건축 실사화처럼 인물이 없는 img2img 생성에서 FaceDetailer(얼굴 보정)를
    # 강제로 끄기 위한 옵션. 없어도 될 얼굴 탐지 단계 때문에 매 생성이 몇 분씩 더 걸렸었다.
    disable_face_detailer: bool = False
    # 2026-08-31: img2img일 때 Canny ControlNet으로 원본 외곽선(형태)을 고정한 채
    # denoise를 높여 재질/조명만 실사로 다시 그리게 한다. 0이면 미사용(기존 동작).
    controlnet_strength: float = 0.0
    # 2026-09-15: ControlNet이 diffusion 과정 중 몇 %까지 개입할지. 1.0(기본값)이면 끝까지
    # 강제 — strength를 낮게 줘도 Canny 엣지 자체가 워낙 촘촘해서 "약하게 거는" 느낌이 잘 안
    # 살아 여전히 형태가 거의 고정되는 문제가 있었다. 이 값을 낮추면 초반 일부 스텝만 참고하고
    # 후반은 AI가 자유롭게 재해석하게 되어 훨씬 부드러운 형태 보존율 조절이 된다.
    controlnet_end_percent: float = 1.0
    # 2026-10-06: "local"(ComfyUI, 기본) 또는 유료 API("openai"/"gemini"). 유료는 프롬프트와 참고 이미지가
    # 외부 서버로 전송되며, 체크포인트/LoRA/샘플러 등 로컬 전용 옵션은 무시된다.
    provider: str = "local"
    # 2026-10-07: 유료 API 전용. 형태 이미지(input_image_base64) 외에 재질·분위기·대지 참고 이미지(최대 3장),
    # 그리고 이미지·설명이 외부 서버로 나가는 것에 대한 사용자 동의(없으면 서버가 거절한다).
    reference_images: List[RefImage] = []
    external_consent: bool = False

async def _generate_with_paid_provider(request: ImageGenerateRequest, output_path: str, filename: str):
    if not request.external_consent:
        raise HTTPException(status_code=400, detail="이미지와 설명이 외부 서버(OpenAI/Google)로 전송되는 것에 동의해야 유료 생성을 쓸 수 있습니다.")
    input_image_bytes = None
    if request.input_image_base64:
        try:
            input_image_bytes = base64.b64decode(request.input_image_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"참고 이미지 디코딩 실패: {e}")
    extra_images = []
    for ref in request.reference_images[:paid_image.MAX_REFERENCE_IMAGES]:
        try:
            extra_images.append(base64.b64decode(ref.base64))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"참조 이미지 디코딩 실패: {e}")

    print(f"[PAID:{request.provider}] prompt '{request.prompt[:30]}...' -> {output_path} (ratio={request.aspect_ratio}, refs={len(extra_images)})")
    try:
        png = await asyncio.to_thread(
            paid_image.generate_png, request.provider, request.prompt, request.aspect_ratio, input_image_bytes, extra_images
        )
    except Exception as e:
        msg = str(e)
        code = 429 if "사용 한도" in msg else 502
        raise HTTPException(status_code=code, detail=msg if code == 429 else f"유료 API 이미지 생성 실패: {msg}")

    with open(output_path, "wb") as f:
        f.write(png)
    from PIL import Image
    with Image.open(io.BytesIO(png)) as im:
        width, height = im.size

    await _reject_if_unsafe_image(output_path, project=request.project)

    status = {p["id"]: p for p in paid_image.provider_status()}[request.provider]
    model_label = f"{request.provider}:{status['model']}"
    form = {"score": None, "note": ""}
    if input_image_bytes:   # 입력의 뼈대 선이 결과에 얼마나 남았는지(로컬 계산, 외부 전송 없음)
        try:
            from services import form_check
            form = await asyncio.to_thread(form_check.form_score, input_image_bytes, png)
        except Exception as e:
            form = {"score": None, "note": f"형태 점수 계산 실패: {e}"}
    try:
        image_history_store.save_generation(
            prompt=request.prompt, style=request.style, aspect_ratio=request.aspect_ratio,
            sampler_name=None, scheduler=None, seed=0, loras=[], image_filename=filename,
            checkpoint=model_label, project=request.project,
        )
    except Exception as e:
        print(f"[WARNING] ImageHistory: 이력 저장 실패(생성 자체는 성공): {e}")

    return {
        "status": "success",
        "message": "Image generated successfully.",
        "filename": filename,
        "file_path": output_path,
        "seed_used": None,
        "checkpoint_used": model_label,
        "width": width,
        "height": height,
        "form_score": form["score"],
        "form_note": form["note"],
        "est_cost_usd": paid_image.estimate_cost(request.provider),
        "usage_today": paid_image.usage_today(),
    }


@router.post("/image/generate")
async def image_generate(request: ImageGenerateRequest):
    """
    Call ComfyUI REST API to generate an image.
    Delegates to the existing comfyui_client.py module.

    응답에는 프론트엔드가 채팅창에 바로 그려 넣을 수 있도록 base64를 함께 담는다.
    """
    _reject_if_unsafe(request.prompt, project=request.project)
    # output file path will be saved inside output/images/<project> — 프로젝트마다 결과물
    # 파일 자체를 실제로 분리 저장한다(2026-09-10, DB 필터링만으로는 부족하다는 요청).
    project_dir = image_history_store.project_dir_name(request.project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)

    bare_filename = request.filename or f"gen_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, bare_filename)
    filename = f"{project_dir}/{bare_filename}"

    if request.provider != "local":
        return await _generate_with_paid_provider(request, output_path, filename)

    # 실제로 어떤 체크포인트가 쓰일지 먼저 확정한다 — 화면비→픽셀 변환이 여기에 따라 달라진다.
    # (SD1.5에 1024를 주거나 SDXL에 640을 주면 결과물이 망가진다 — resolve_dimensions 주석 참고)
    try:
        checkpoint_used = comfyui_client.get_available_checkpoint(prefer=request.checkpoint)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 조회 실패: {e}")

    # aspect_ratio가 지정되면 width/height보다 우선(화면비 프리셋과 동일한 사용 흐름)
    width, height = comfyui_client.resolve_dimensions(
        request.aspect_ratio, checkpoint_used, request.width, request.height
    )

    # 시드를 프론트에 알려줄 수 있도록, 지정 안 됐으면 여기서 미리 뽑아 넘긴다
    # (그래야 응답에 "이번에 실제로 쓰인 시드"를 정확히 담을 수 있다 — Fooocus의 "시드 재사용" 대응).
    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    input_image_bytes = None
    if request.input_image_base64:
        try:
            input_image_bytes = base64.b64decode(request.input_image_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"참고 이미지 디코딩 실패: {e}")

    print(f"[COMFYUI] Generating image for prompt '{request.prompt[:30]}...' -> {output_path} "
          f"(ckpt={checkpoint_used}, {width}x{height}, style={request.style}, seed={seed_used}"
          f"{', img2img denoise=' + str(request.denoise) if input_image_bytes else ''})")

    try:
        # 2026-09-02: 이 호출은 ComfyUI 완료를 폴링하며 수십 초~수 분씩 걸리는 동기 함수다.
        # await 없이 그대로 부르면 그 시간 동안 uvicorn의 이벤트 루프 전체가 막혀서
        # 다른 요청(갤러리 조회 등)이 전부 응답 불가 상태가 된다 — 스레드로 넘겨 격리한다.
        res_path = await asyncio.to_thread(
            comfyui_client.generate_image_or_raise,
            request.prompt, output_path, width, height,
            steps=request.num_steps or comfyui_client.DEFAULT_STEPS,
            cfg=request.guidance_scale or comfyui_client.DEFAULT_CFG,
            style=request.style,
            sampler_name=request.sampler_name,
            scheduler=request.scheduler,
            seed=seed_used,
            negative_extra=request.negative_prompt_extra,
            loras=[l.model_dump() for l in request.loras],
            checkpoint=checkpoint_used,
            input_image_bytes=input_image_bytes,
            denoise=request.denoise,
            disable_face_detailer=request.disable_face_detailer,
            controlnet_strength=request.controlnet_strength,
            controlnet_end_percent=request.controlnet_end_percent,
        )
    except Exception as e:
        # 실제 원인을 그대로 올려보낸다 (체크포인트 없음/타임아웃/노드 오류 등)
        raise HTTPException(status_code=500, detail=f"이미지 생성 실패: {e}")

    if not (res_path and os.path.exists(res_path)):
        raise HTTPException(
            status_code=500,
            detail="ComfyUI가 이미지를 반환하지 않았습니다. ComfyUI가 켜져 있는지 확인하세요."
        )

    await _reject_if_unsafe_image(res_path, project=request.project)

    # 2026-08-20: 이미지 생성 스튜디오의 "이력이 새로고침 후에도 남아야 한다" 요구사항 —
    # 콘솔 자동 위임/스튜디오 직접 생성 어느 경로든 여기 한 줄씩 쌓인다.
    try:
        image_history_store.save_generation(
            prompt=request.prompt, style=request.style, aspect_ratio=request.aspect_ratio,
            sampler_name=request.sampler_name, scheduler=request.scheduler, seed=seed_used,
            loras=[l.model_dump() for l in request.loras], image_filename=filename,
            checkpoint=checkpoint_used, project=request.project,
        )
    except Exception as e:
        # 이력 저장 실패로 방금 성공한 생성 자체를 실패로 만들 필요는 없다 — 로그만 남긴다.
        print(f"[WARNING] ImageHistory: 이력 저장 실패(생성 자체는 성공): {e}")

    return {
        "status": "success",
        "message": "Image generated successfully.",
        "filename": filename,
        "file_path": output_path,
        "seed_used": seed_used,
        "checkpoint_used": checkpoint_used,
        "width": width,
        "height": height,
    }


class ImageEditRequest(BaseModel):
    # 캡처/업로드한 원본 이미지 (base64, 데이터 URL 접두사 없이)
    image_base64: str
    # "하늘을 파란색으로 바꿔줘" 같은 자연어 수정 지시문
    instruction: str
    seed: Optional[int] = None
    guidance: float = comfyui_client.FLUX_KONTEXT_DEFAULT_GUIDANCE
    steps: int = comfyui_client.FLUX_KONTEXT_DEFAULT_STEPS
    project: str = image_history_store.DEFAULT_PROJECT


@router.post("/image/edit")
async def image_edit(request: ImageEditRequest):
    """캡처한 이미지 + 수정 지시문을 받아 FLUX.1 Kontext로 지시를 반영한 이미지를 만든다.

    일반 생성(/image/generate)의 img2img와 달리 프롬프트를 처음부터 다시 쓰는 게 아니라
    "이 이미지에서 이것만 바꿔줘" 식의 지시를 그대로 이해해서 편집한다.
    """
    _reject_if_unsafe(request.instruction, project=request.project)
    if not comfyui_client.is_flux_kontext_available():
        raise HTTPException(
            status_code=503,
            detail=f"FLUX Kontext 모델이 아직 설치되지 않았습니다 ({comfyui_client.FLUX_KONTEXT_GGUF_UNET}). "
                   "다운로드가 끝날 때까지 기다려주세요."
        )

    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")

    project_dir = image_history_store.project_dir_name(request.project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)
    bare_filename = f"kontext_edit_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, bare_filename)
    filename = f"{project_dir}/{bare_filename}"

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[KONTEXT] Editing image with instruction '{request.instruction[:50]}...' -> {output_path} (seed={seed_used})")

    try:
        await asyncio.to_thread(
            comfyui_client.edit_image_with_kontext_or_raise,
            image_bytes, request.instruction, output_path,
            seed=seed_used, guidance=request.guidance, steps=request.steps,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 편집 실패: {e}")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="ComfyUI가 편집된 이미지를 반환하지 않았습니다.")

    await _reject_if_unsafe_image(output_path, project=request.project)

    try:
        image_history_store.save_generation(
            prompt=f"[Kontext 편집] {request.instruction}", style="none", aspect_ratio=None,
            sampler_name="euler", scheduler="simple", seed=seed_used, loras=[],
            image_filename=filename, checkpoint=comfyui_client.FLUX_KONTEXT_GGUF_UNET,
            project=request.project,
        )
    except Exception as e:
        print(f"[WARNING] ImageHistory: Kontext 편집 이력 저장 실패: {e}")

    with open(output_path, "rb") as f:
        result_base64 = base64.b64encode(f.read()).decode("ascii")

    return {
        "status": "success",
        "message": "이미지 편집이 완료되었습니다.",
        "filename": filename,
        "file_path": output_path,
        "seed_used": seed_used,
        "image_base64": result_base64,
    }


class ImageInpaintRequest(BaseModel):
    # 원본 이미지 (base64, 데이터 URL 접두사 없이)
    image_base64: str
    # 인페인트일 때만 필요 — 흰색=다시 그릴 영역, 검은색=그대로 유지 (base64, 흑백 PNG)
    mask_base64: Optional[str] = None
    # 아웃페인트일 때만 필요 — 각 방향으로 확장할 픽셀 수. 0이면 그 방향은 확장하지 않는다.
    expand_left: int = 0
    expand_top: int = 0
    expand_right: int = 0
    expand_bottom: int = 0
    # 다시 그릴 영역에 무엇을 그릴지에 대한 지시(비워두면 스타일 프리셋만으로 채운다).
    prompt: str = ""
    style: str = "none"
    negative_prompt_extra: str = ""
    num_steps: Optional[int] = None
    guidance_scale: Optional[float] = None
    sampler_name: Optional[str] = None
    scheduler: Optional[str] = None
    seed: Optional[int] = None
    checkpoint: Optional[str] = None
    # 마스크 영역을 얼마나 원본과 무관하게 새로 그릴지. 인페인트/아웃페인트는 완전히 새로
    # 채우는 게 목적이라 기본값은 1.0(사실상 img2img의 denoise와 반대로 "낮출 이유가 없음").
    denoise: float = 1.0
    project: str = image_history_store.DEFAULT_PROJECT
    # 2026-09-01: Fooocus 고급 기능 추가
    use_color_correction: bool = True  # Fooocus 스타일 색상 정정 (경계선 부드럽게)
    mask_feather_radius: int = 0  # 마스크 가장자리 feathering (0=미사용)
    mask_grow_pixels: int = 0  # 마스크 확대할 픽셀 수 (음수면 축소)
    mask_smooth_iterations: int = 0  # 마스크 가장자리 부드럽게 (0=미사용)


@router.post("/image/inpaint")
async def image_inpaint(request: ImageInpaintRequest):
    """이미지 인페인트(마스크 영역만 재생성) / 아웃페인트(캔버스 확장 후 여백 채우기).

    Fooocus의 Inpaint/Outpaint 기능을 이 프로젝트의 ComfyUI 백엔드로 이식한 것 —
    InpaintModelConditioning 노드를 써서 별도 모델 다운로드 없이 지금 체크포인트 그대로 동작한다.
    """
    _reject_if_unsafe(request.prompt, project=request.project)
    has_mask = bool(request.mask_base64)
    has_expand = any([request.expand_left, request.expand_top, request.expand_right, request.expand_bottom])
    if not has_mask and not has_expand:
        raise HTTPException(status_code=400, detail="마스크(인페인트) 또는 확장 픽셀(아웃페인트) 중 하나는 필요합니다.")

    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")

    mask_bytes = None
    if has_mask:
        try:
            mask_bytes = base64.b64decode(request.mask_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"마스크 디코딩 실패: {e}")

    outpaint = None
    if has_expand:
        outpaint = {
            "left": request.expand_left, "top": request.expand_top,
            "right": request.expand_right, "bottom": request.expand_bottom,
        }

    project_dir = image_history_store.project_dir_name(request.project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)
    mode = "outpaint" if outpaint else "inpaint"
    bare_filename = f"{mode}_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, bare_filename)
    filename = f"{project_dir}/{bare_filename}"

    try:
        checkpoint_used = comfyui_client.get_available_checkpoint(prefer=request.checkpoint)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 조회 실패: {e}")

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[{mode.upper()}] prompt='{request.prompt[:30]}...' -> {output_path} "
          f"(ckpt={checkpoint_used}, seed={seed_used}"
          f"{', expand=' + str(outpaint) if outpaint else ''})")

    try:
        await asyncio.to_thread(
            comfyui_client.inpaint_or_raise,
            request.prompt, image_bytes, output_path, mask_bytes=mask_bytes, outpaint=outpaint,
            checkpoint=checkpoint_used,
            steps=request.num_steps or comfyui_client.DEFAULT_STEPS,
            cfg=request.guidance_scale or comfyui_client.DEFAULT_CFG,
            style=request.style, sampler_name=request.sampler_name, scheduler=request.scheduler,
            seed=seed_used, negative_extra=request.negative_prompt_extra, denoise=request.denoise,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{mode} 실패: {e}")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="ComfyUI가 이미지를 반환하지 않았습니다.")

    await _reject_if_unsafe_image(output_path, project=request.project)

    try:
        image_history_store.save_generation(
            prompt=f"[{mode}] {request.prompt}", style=request.style, aspect_ratio=None,
            sampler_name=request.sampler_name, scheduler=request.scheduler, seed=seed_used,
            loras=[], image_filename=filename, checkpoint=checkpoint_used, project=request.project,
        )
    except Exception as e:
        print(f"[WARNING] ImageHistory: {mode} 이력 저장 실패(생성 자체는 성공): {e}")

    with open(output_path, "rb") as f:
        result_base64 = base64.b64encode(f.read()).decode("ascii")

    return {
        "status": "success",
        "message": f"{mode} 완료.",
        "filename": filename,
        "file_path": output_path,
        "seed_used": seed_used,
        "checkpoint_used": checkpoint_used,
        "image_base64": result_base64,
    }


@router.get("/image/history")
async def get_image_history(project: str = image_history_store.DEFAULT_PROJECT, limit: int = 500,
                             folder_id: Optional[int] = None):
    """이미지 생성 스튜디오의 생성 이력 (2026-08-20 신설). folder_id를 주면 그 폴더에
    속한 이미지만 반환한다(2026-09-03, 즐겨찾기 폴더 기능)."""
    return {"status": "success", "generations": image_history_store.list_generations(project, limit, folder_id)}


@router.delete("/image/history/{gen_id}")
async def delete_image_history(gen_id: int, project: str = image_history_store.DEFAULT_PROJECT):
    """이력 한 건과 그 실제 이미지 파일을 함께 지운다(2026-08-20, "생성 결과물 삭제" 요청).
    DB 행만 지우고 파일을 안 지우면 디스크에 계속 쌓이므로 같이 처리한다."""
    deleted = image_history_store.delete_generation(gen_id, project)
    if deleted is None:
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")
    image_filename = deleted["image_filename"]

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    # 경로 탈출 방지 — DB에 있던 값이라도 output_dir 밖으로 못 나가게만 막는다.
    # 2026-09-10: 이미지가 프로젝트별 하위 폴더에 저장되므로 os.path.basename으로 폴더째
    # 지워버리면 파일을 못 찾아 삭제가 조용히 실패한다 — normpath 검증으로 바꿨다.
    for fname in (deleted["image_filename"], deleted["before_image_filename"]):
        if not fname:
            continue
        normalized_rel = os.path.normpath(fname.replace("\\", "/"))
        if normalized_rel.startswith("..") or os.path.isabs(normalized_rel):
            continue
        file_path = os.path.join(output_dir, normalized_rel)
        if not os.path.abspath(file_path).startswith(os.path.abspath(output_dir) + os.sep):
            continue
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as e:
                print(f"[WARNING] ImageHistory: 이력은 지웠지만 파일 삭제 실패({normalized_rel}): {e}")

    return {"status": "success", "deleted": 1, "image_filename": image_filename}


class SetFavoriteRequest(BaseModel):
    is_favorite: bool
    project: str = image_history_store.DEFAULT_PROJECT


@router.put("/image/history/{gen_id}/favorite")
async def set_image_favorite(gen_id: int, request: SetFavoriteRequest):
    """갤러리 즐겨찾기 토글(2026-08-27)."""
    ok = image_history_store.set_favorite(gen_id, request.is_favorite, request.project)
    if not ok:
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")
    return {"status": "success", "id": gen_id, "is_favorite": request.is_favorite}


# ── 보관함 즐겨찾기 폴더 (2026-09-03) ──────────────────────────────────────
# 이미지 1장은 폴더 1개에만 속한다(참고자료 FAVORITES_FOLDER_FEATURE.md 검토 후,
# 사용자 확인 결과 여러 폴더 동시 소속은 불필요 — image_generations.folder_id 컬럼 방식).

class CreateFolderRequest(BaseModel):
    name: str
    project: str = image_history_store.DEFAULT_PROJECT


class RenameFolderRequest(BaseModel):
    name: str
    project: str = image_history_store.DEFAULT_PROJECT


class SetFolderRequest(BaseModel):
    folder_id: Optional[int] = None  # None이면 폴더에서 뺀다("폴더 없음")
    project: str = image_history_store.DEFAULT_PROJECT


@router.get("/image/folders")
async def list_image_folders(project: str = image_history_store.DEFAULT_PROJECT):
    return {"status": "success", "folders": image_history_store.list_folders(project)}


@router.post("/image/folders")
async def create_image_folder(request: CreateFolderRequest):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="폴더 이름을 입력해주세요.")
    folder_id = image_history_store.create_folder(name, request.project)
    return {"status": "success", "id": folder_id, "name": name}


@router.put("/image/folders/{folder_id}")
async def rename_image_folder(folder_id: int, request: RenameFolderRequest):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="폴더 이름을 입력해주세요.")
    ok = image_history_store.rename_folder(folder_id, name, request.project)
    if not ok:
        raise HTTPException(status_code=404, detail="해당 폴더를 찾을 수 없습니다.")
    return {"status": "success", "id": folder_id, "name": name}


@router.delete("/image/folders/{folder_id}")
async def delete_image_folder(folder_id: int, project: str = image_history_store.DEFAULT_PROJECT):
    """폴더를 지운다 — 안에 있던 이미지는 지워지지 않고 "폴더 없음" 상태로 돌아간다."""
    ok = image_history_store.delete_folder(folder_id, project)
    if not ok:
        raise HTTPException(status_code=404, detail="해당 폴더를 찾을 수 없습니다.")
    return {"status": "success", "id": folder_id}


@router.put("/image/history/{gen_id}/folder")
async def set_image_folder(gen_id: int, request: SetFolderRequest):
    """이미지 한 장을 폴더에 넣거나(folder_id 지정) 뺀다(folder_id 생략/None)."""
    ok = image_history_store.set_folder(gen_id, request.folder_id, request.project)
    if not ok:
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")
    return {"status": "success", "id": gen_id, "folder_id": request.folder_id}


class UpscaleRequest(BaseModel):
    filename: str  # output/images/<project>/파일명 (project 하위 경로 포함)
    model_name: Optional[str] = None  # 없으면 설치된 것 중 첫 번째
    project: str = image_history_store.DEFAULT_PROJECT


@router.get("/image/upscale_models")
async def image_upscale_models():
    """설치된 업스케일 모델 목록 (2026-08-21, § CONSENSUS.md C-011)."""
    try:
        models = comfyui_client.list_available_upscale_models()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ComfyUI에서 업스케일 모델 목록을 가져오지 못했습니다: {e}")
    return {"status": "success", "models": models}


@router.post("/image/upscale")
async def image_upscale(request: UpscaleRequest):
    """기존 생성 이미지를 업스케일 모델로 확대해 별도 파일로 저장한다.

    원본은 건드리지 않고 `upscaled_<원본파일명>`으로 새로 저장한다 — 업스케일 결과가
    마음에 안 들어도 원본을 잃지 않도록.
    """
    # 2026-09-10: 이미지가 프로젝트별 하위 폴더(output/images/<project>/...)에 저장되므로
    # 파일명에 폴더 구분자가 하나 섞여 들어온다 — 예전처럼 os.path.basename으로 통째로
    # 지워버리면 원본을 못 찾는다. 대신 정규화한 경로가 output_dir 밖으로 못 나가게만 막는다.
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    normalized_rel = os.path.normpath(request.filename.replace("\\", "/"))
    if normalized_rel.startswith("..") or os.path.isabs(normalized_rel):
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다.")
    source_path = os.path.join(output_dir, normalized_rel)
    if not os.path.abspath(source_path).startswith(os.path.abspath(output_dir) + os.sep):
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다.")
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail=f"원본 이미지를 찾을 수 없습니다: {request.filename}")

    rel_dir = os.path.dirname(normalized_rel)
    result_bare_name = f"upscaled_{os.path.basename(normalized_rel)}"
    result_filename = f"{rel_dir}/{result_bare_name}" if rel_dir else result_bare_name
    result_path = os.path.join(output_dir, rel_dir, result_bare_name) if rel_dir else os.path.join(output_dir, result_bare_name)

    try:
        await asyncio.to_thread(
            comfyui_client.upscale_image_or_raise, source_path, result_path, model_name=request.model_name
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업스케일 실패: {e}")

    # 2026-09-11: 업스케일 결과 파일은 원본과 같은 프로젝트 폴더에 잘 저장되고 있었지만
    # 이력(image_generations)에 남기는 걸 빠뜨려서, 실제로는 성공해도 갤러리에 영영 안 보였다
    # (프론트는 "보관함에 추가되었습니다"라고 토스트까지 띄우는데 거짓말이 되는 상태였음).
    try:
        image_history_store.save_generation(
            prompt=f"[4K 업스케일] {request.filename}", style="none", aspect_ratio=None,
            sampler_name=None, scheduler=None, seed=0, loras=[],
            image_filename=result_filename, checkpoint=request.model_name or "upscale",
            project=request.project,
        )
    except Exception as e:
        print(f"[WARNING] ImageHistory: 업스케일 이력 저장 실패(업스케일 자체는 성공): {e}")

    with open(result_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("ascii")

    return {"status": "success", "filename": result_filename, "image_base64": image_base64}


# 2026-08-24: 대장님 요청 — "체크포인트 LoRA도 내가 선택하는게 아니라 AI가 알아서 정해줬으면".
# 화면비/퀄리티/생성개수만 사람이 정하고, 나머지(체크포인트/LoRA/스타일/샘플러/네거티브)는
# 프롬프트 카테고리를 보고 여기서 결정한다. 새 체크포인트나 LoRA를 설치하면 여기 패턴만 늘리면 된다.
CATEGORY_CHECKPOINT_HINTS = {
    # 2026-08-21 § CONSENSUS.md C-008에서 ArcvizXL LoRA와 실제 조합 검증까지 끝난 체크포인트.
    "architecture": ("juggernaut",),
    # 2026-08-24: 설치된 체크포인트 중 인물/실사 사진 계열에 가장 적합한 RealVisXL을 사람/인물/영화적
    # 장면에도 자동 매칭한다(기존엔 architecture 외 카테고리는 전부 백엔드 기본값으로만 빠졌음).
    "portrait": ("realvisxl",),
    "cinematic": ("realvisxl",),
    # 2026-08-28 신규 모델 매핑: 애니메이션/일러스트 및 범용 판타지/회화풍 모델 자동 연결
    "anime": ("animagine",),
    "illustration": ("dreamshaper",),
    "general": ("dreamshaper",),
}
CATEGORY_LORA_HINTS = {
    # (파일명에 포함될 패턴, 프롬프트에 추가할 트리거 단어, 강도) — 트리거 단어는 LoRA 학습
    # 메타데이터에서 확인된 값(§ C-008: arcviz_1, 빈도 99)을 그대로 쓴다.
    "architecture": [("arcviz", "arcviz_1", 0.8)],
}
CATEGORY_NEGATIVE_EXTRA = {
    "portrait": "extra fingers, fused fingers, bad anatomy, malformed hands, extra limbs, mutated hands",
    "architecture": "warped perspective, floating objects, unrealistic proportions, tilted horizon",
    "anime": "photorealistic skin texture, extra limbs, bad anatomy",
    "cinematic": "flat lighting, overexposed, extra limbs",
}


class AutoTuneRequest(BaseModel):
    prompt: str

@router.post("/image/auto-tune")
async def image_auto_tune(request: AutoTuneRequest):
    """
    프롬프트를 분석하여 고품질 영문 태그로 재작성하고,
    주제/성격에 맞는 최적의 생성 옵션(스타일, 화면비, 성능, 샘플러, 스케줄러 등)을 추천 세팅합니다.
    """
    user_prompt = request.prompt.strip()
    if not user_prompt:
        raise HTTPException(status_code=400, detail="프롬프트 내용이 비어있습니다.")

    # 1. Ollama LLM을 통해 프롬프트의 영문 정밀화 및 카테고리 분석
    analysis_system_prompt = (
        "You are an expert AI prompt engineer and image generation specialist. "
        "Analyze the user's input prompt (which may be in Korean or rough concept) and output a clean JSON object.\n"
        "Output ONLY valid JSON with no conversational preamble or markdown codeblocks.\n\n"
        "JSON Schema:\n"
        "{\n"
        '  "refined_prompt": "detailed comma-separated English Stable Diffusion tags describing the scene, subjects, materials, lighting, atmosphere, 8k uhd, masterpiece",\n'
        '  "category": "architecture" | "portrait" | "landscape" | "cinematic" | "anime" | "illustration" | "general",\n'
        '  "aspect_ratio": "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "3:2",\n'
        '  "suggested_style": "architecture" | "photograph" | "cinematic" | "anime" | "flat_illustration" | "fooocus_enhance" | "none",\n'
        '  "reasoning": "A concise Korean explanation (1-2 sentences) of why these settings were chosen"\n'
        "}"
    )

    raw_json_str = ""
    try:
        raw_json_str = chat_completion(
            model="gemma4:e4b",
            messages=[
                {"role": "system", "content": analysis_system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=500,
            temperature=0.2,
        )
    except Exception as e:
        print(f"[WARNING] AutoTune LLM call failed: {e}")
        raw_json_str = "{}"

    # 2. JSON 파싱 및 정제
    cleaned = raw_json_str.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()

    parsed = {}
    try:
        parsed = json.loads(cleaned)
    except Exception:
        # JSON 파싱 실패 시 fallback
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                pass

    # 💡 2.5 결정적(Deterministic) 영문 프롬프트 합성기 (소형 모델 실패 시 완벽한 영문 번역 보장)
    refined_prompt = parsed.get("refined_prompt") or ""
    # 만약 LLM이 한국어 원문을 그대로 줬거나 빈 값이면 전문 SDXL 프롬프트 합성기로 변환
    if not refined_prompt or any(ord(char) >= 0xAC00 and ord(char) <= 0xD7A3 for char in refined_prompt):
        # 한국어 키워드 매핑 사전
        SDXL_KEYWORD_MAP = {
            "해변": "tropical beach, ocean coast, golden sand",
            "수영장": "luxury infinity swimming pool, crystal clear turquoise water",
            "시원한": "refreshing breeze, bright sunny day, summer aesthetic",
            "고양이": "cute funny cat, fluffy fur, adorable expression",
            "강아지": "playful cute puppy, happy expression",
            "오피스": "modern architectural office, glass windows, clean interior",
            "카페": "cozy cafe interior, warm aesthetic lighting, wooden tables",
            "노을": "vibrant sunset, golden hour lighting, dramatic sky",
            "도시": "modern cityscape, futuristic skyscrapers, cyberpunk night lights",
            "자연": "lush green nature, forest, mountains, serene landscape",
            "인물": "photorealistic portrait, highly detailed facial features, 8k",
            "사진": "professional photography, 8k uhd, sharp focus, masterpiece"
        }
        extracted_tags = []
        for kw, tag in SDXL_KEYWORD_MAP.items():
            if kw in user_prompt:
                extracted_tags.append(tag)
        
        if extracted_tags:
            refined_prompt = "masterpiece, 8k uhd, professional photography, " + ", ".join(extracted_tags)
        else:
            refined_prompt = f"masterpiece, 8k uhd, high quality photorealistic, {user_prompt}"

    category = parsed.get("category", "general")
    suggested_style = parsed.get("suggested_style", "none")
    suggested_aspect = parsed.get("aspect_ratio", "16:9")
    reasoning = parsed.get("reasoning") or "프롬프트 키워드를 정밀 분석하여 최적의 SDXL 영문 태그와 구도/스타일을 추천했습니다."

    # 2.6 카테고리 자기 검증 — 소형 LLM의 분류만 믿고 스타일/체크포인트/LoRA를 확정하면 위험하다.
    # 실측 사례: "노을 지는 도시 옥상에서 커피 마시는 고양이, 수채화 느낌"이 "옥상"이라는 단어 때문에
    # category="architecture"로 오분류됨 → 그대로 두면 건축 렌더링 스타일 문구와 ArcvizXL(건축 LoRA)이
    # 고양이 수채화 그림에 그대로 붙어버린다. 생물/인물이 주제로 보이는데 architecture로 분류됐으면
    # 분류를 신뢰하지 않고 general로 되돌린다 — 이후의 스타일/체크포인트/LoRA 선택 전부에 자동 반영된다.
    LIVING_SUBJECT_KEYWORDS = (
        "고양이", "강아지", "동물", "사람", "인물", "캐릭터", "아이", "여성", "남성",
        "cat", "dog", "animal", "person", "people", "character", "portrait", "kid", "child"
    )
    if category == "architecture" and any(
        kw in user_prompt or kw.lower() in refined_prompt.lower() for kw in LIVING_SUBJECT_KEYWORDS
    ):
        category = "general"

    # 2.7 세부 스타일 키워드 강제 보정 — auto-tune이 LLM에게 주는 스키마(위 analysis_system_prompt)는
    # "architecture"|"photograph"|"cinematic"|"anime"|"flat_illustration"|"fooocus_enhance"|"none" 7개만
    # 선택지로 주기 때문에, 픽셀아트/수채화/만화책 같은 sai-* 세부 스타일은 LLM이 애초에 고를 수 없다.
    # 2026-09-10 실측: "cute pixel art..." 프롬프트가 category=cinematic으로 오분류되며
    # style="none"으로 저장됨(픽셀아트 스타일 프리셋이 전혀 적용 안 됨). 프롬프트에 특정 스타일을
    # 명확히 가리키는 키워드가 있으면 LLM 응답과 무관하게 그 스타일로 강제 확정한다.
    STYLE_KEYWORD_HINTS = {
        "sai-pixel-art": ("pixel art", "pixelart", "8-bit", "8bit", "픽셀 아트", "픽셀아트", "도트 아트", "도트그림"),
        "sai-watercolor": ("watercolor", "수채화"),
        "sai-comic-book": ("comic book", "comic style", "만화책", "코믹북"),
        "sai-line-art": ("line art", "라인 아트", "라인아트"),
        "sai-neon-punk": ("neon punk", "네온펑크"),
        "sai-fantasy-art": ("fantasy art", "판타지 아트"),
        "sai-origami": ("origami", "종이접기"),
        "sai-ukiyo-e": ("ukiyo-e", "우키요에"),
        "sai-3d-model": ("3d render", "3d model", "3d 렌더", "3d 모델"),
        "sai-sketch": ("pencil sketch", "연필 스케치", "스케치풍"),
    }
    _style_haystack = f"{user_prompt} {refined_prompt}".lower()
    for _style_key, _keywords in STYLE_KEYWORD_HINTS.items():
        if any(kw.lower() in _style_haystack for kw in _keywords):
            suggested_style = _style_key
            break

    # 3. Rule-based Guardrails (화이트리스트 대조 및 안전한 확정 매핑)
    # 스타일 검증
    if suggested_style not in comfyui_client.STYLE_PRESETS:
        if category == "architecture":
            suggested_style = "architecture"
        elif category == "portrait":
            suggested_style = "photograph"
        elif category == "cinematic":
            suggested_style = "cinematic"
        elif category == "anime":
            suggested_style = "anime"
        elif category == "illustration":
            suggested_style = "flat_illustration"
        else:
            suggested_style = "fooocus_enhance"

    # 화면비 검증
    if suggested_aspect not in comfyui_client.ASPECT_RATIOS:
        if category in ("landscape", "architecture", "cinematic"):
            suggested_aspect = "16:9"
        elif category in ("portrait", "character"):
            suggested_aspect = "3:4"
        else:
            suggested_aspect = "1:1"

    # 샘플러 & 스케줄러 & 성능 매핑
    if suggested_style in ("architecture", "photograph", "cinematic"):
        rec_sampler = "dpmpp_2m_sde"
        rec_scheduler = "karras"
        rec_performance = "extreme_quality"
    elif suggested_style == "anime":
        rec_sampler = "euler_ancestral"
        rec_scheduler = "normal"
        rec_performance = "quality"
    else:
        rec_sampler = "dpmpp_2m"
        rec_scheduler = "karras"
        rec_performance = "quality"

    # 4. 체크포인트·LoRA 자동 선택 (카테고리 기반 규칙). ComfyUI가 잠깐 응답이 없어도
    # 자동튜닝 자체를 실패시키지 않는다 — 그 경우 체크포인트/LoRA는 백엔드 기본값에 맡긴다.
    rec_checkpoint = None
    rec_loras = []
    try:
        installed_checkpoints = comfyui_client.list_available_checkpoints()
        installed_lora_names = comfyui_client.list_available_loras()

        # portrait/cinematic 힌트는 RealVisXL(포토리얼 전용) 강제 배정이므로, 확정된 스타일이
        # 실사 계열(photograph/cinematic)일 때만 적용한다 — 그렇지 않으면 "수채화 느낌의 고양이"처럼
        # illustration/anime로 확정된 요청에도 포토리얼 체크포인트가 잘못 씌워진다(실측으로 발견).
        # architecture/anime/illustration/general은 이런 충돌이 없으므로 항상 힌트를 적용한다 —
        # 예전 코드가 portrait/cinematic 전용 제약을 anime/illustration에도 실수로 걸어놔서
        # animagine/dreamshaper 힌트가 전혀 매칭되지 않던 버그를 수정(2026-09-10).
        skip_photoreal_hint = category in ("portrait", "cinematic") and suggested_style not in ("photograph", "cinematic")
        if not skip_photoreal_hint:
            for pattern in CATEGORY_CHECKPOINT_HINTS.get(category, ()):
                match = next((c["name"] for c in installed_checkpoints if pattern in c["name"].lower()), None)
                if match:
                    rec_checkpoint = match
                    break

        trigger_words = []
        for pattern, trigger, strength in CATEGORY_LORA_HINTS.get(category, []):
            match = next((n for n in installed_lora_names if pattern in n.lower()), None)
            if match:
                rec_loras.append({"name": match, "strength": strength})
                if trigger:
                    trigger_words.append(trigger)
        if trigger_words:
            refined_prompt = f"{refined_prompt}, {', '.join(trigger_words)}"
    except Exception as e:
        print(f"[WARNING] AutoTune: 체크포인트/LoRA 자동 선택 조회 실패(기본값으로 진행): {e}")

    # 5. 네거티브 프롬프트 제안 — 실제 생성 시 build_sdxl_turbo_workflow가 적용하는 것과
    # 동일한 조합(기본 네거티브 + 스타일 네거티브 + 카테고리별 추가분)을 미리 보여준다.
    negative_extra = CATEGORY_NEGATIVE_EXTRA.get(category, "")
    negative_preview = comfyui_client.DEFAULT_NEGATIVE
    style_negative = comfyui_client.STYLE_PRESETS.get(suggested_style, {}).get("negative", "")
    if style_negative:
        negative_preview += f", {style_negative}"
    if negative_extra:
        negative_preview += f", {negative_extra}"

    return {
        "status": "success",
        "refined_prompt": refined_prompt,
        "reasoning": reasoning,
        "negative_prompt_preview": negative_preview,
        "recommended_options": {
            "style": suggested_style,
            "aspect_ratio": suggested_aspect,
            "performance": rec_performance,
            "sampler_name": rec_sampler,
            "scheduler": rec_scheduler,
            "batch_count": 2,
            "checkpoint": rec_checkpoint,
            "loras": rec_loras,
            "negative_extra": negative_extra
        }
    }


@router.get("/image/options")
async def image_options():
    """프론트가 스타일/화면비/성능 프리셋 선택지를 그릴 수 있도록 제공(2026-08-20, Fooocus 기능 이식)."""
    return {
        "status": "success",
        "styles": comfyui_client.STYLE_PRESETS,
        "aspect_ratios": comfyui_client.ASPECT_RATIOS,
        "performance_presets": comfyui_client.PERFORMANCE_PRESETS,
        "samplers": comfyui_client.AVAILABLE_SAMPLERS,
        "schedulers": comfyui_client.AVAILABLE_SCHEDULERS,
        "sampler_descriptions": comfyui_client.SAMPLER_DESCRIPTIONS,
        "scheduler_descriptions": comfyui_client.SCHEDULER_DESCRIPTIONS,
        "paid_providers": paid_image.provider_status(),
        "paid_usage": paid_image.usage_today(),
    }


class AerialPromptRequest(BaseModel):
    extra: str = ""                       # 사용자가 쓴 추가 요구사항(한글 가능)
    ref_roles: List[str] = []             # 참조 이미지 역할 순서: 'facade' | 'material' | 'mood' | 'site'
    mode: str = "render"                  # 'render' | 'facade' | 'reference'
    depth: str = "material"               # 입면 비교의 변경 폭: 'material'(재료만) | 'redesign'(입면 재디자인, 형태 약 70%)


@router.get("/image/aerial-options")
async def aerial_options():
    """조감도 탭 선택지(작업 방식·입면 후보·분위기·참조 역할)와 엔진 목록. 문구는 aerial_modes 한 곳에서만 관리한다."""
    return {"status": "success", **aerial_modes.options(), "providers": await asyncio.to_thread(_aerial_provider_list)}


def _aerial_common_prompt(extra_en: str, ref_roles: list, mode: str = "render", depth: str = "material") -> str:
    return aerial_modes.common_prompt(mode, extra_en, ref_roles, depth)


def _expand_extra_to_english(extra: str, kind: str = "render") -> str:
    """한글 요청을 건축 렌더링 지시용 영어로 옮긴다(무료 Gemini 텍스트). 키가 없거나 실패하면 원문 그대로 쓴다. kind='edit' 은 결과 이미지 부분 수정 지시용."""
    if not extra.strip():
        return ""
    if kind == "edit":
        ask = ("Rewrite the following request as one concise English instruction for editing an existing architectural rendering "
               "(what to change, where). Do not add other changes. Under 40 words, plain text only, no preface.\n\nRequest: ")
    else:
        ask = ("Rewrite the following request as concise English directions for an architectural photorealistic rendering "
               "(materials, time of day, weather, landscaping, people, mood). Do NOT change or invent building geometry, floor count or camera. "
               "Under 70 words, plain text only, no preface.\n\nRequest: ")
    try:
        from services.gemini_chat import gemini_chat_completion
        text = gemini_chat_completion(
            model="gemini-3.1-flash-lite",
            messages=[{"role": "user", "content": ask + extra.strip()}],
            max_tokens=400, temperature=0.2,
        )
        text = (text or "").strip()
        return text if text else extra.strip()
    except Exception:
        return extra.strip()


@router.post("/image/aerial-prompt")
async def aerial_prompt(request: AerialPromptRequest):
    """조감도 탭: 최종 공통 프롬프트(형태 고정 문구 + 참조 이미지 역할 + 한글 요청의 영어 확장)를 만들어 미리 보여 준다."""
    extra_en = await asyncio.to_thread(_expand_extra_to_english, request.extra)
    return {"status": "success", "prompt": _aerial_common_prompt(extra_en, request.ref_roles, request.mode, request.depth), "extra_en": extra_en, "expanded": bool(request.extra.strip()) and extra_en != request.extra.strip()}


LOCAL_ENGINES = {
    "local_kontext": {"label": "무료 · 고품질 (로컬)", "model": "FLUX Kontext dev", "kind": "kontext", "note": "약 3분/장(참조 이미지가 있으면 더 걸림). 원본 형태·재질 배치를 가장 잘 지킴"},
    "local_sdxl": {"label": "무료 · 빠른 초안 (로컬)", "model": "Juggernaut XL + ControlNet", "kind": "sdxl", "note": "약 1분/장. 형태가 바뀔 수 있어 분위기 초안 확인용"},
}


def _aerial_provider_list() -> list:
    avail = aerial_local.available()
    out = [{"id": pid, "label": e["label"], "model": e["model"], "available": avail[e["kind"]], "est_cost_usd": 0.0, "free": True, "note": e["note"]}
           for pid, e in LOCAL_ENGINES.items()]
    for p in paid_image.provider_status():
        out.append({**p, "free": False, "note": "외부 서버로 전송 · 장당 과금. 최종본·형태 보존이 중요할 때"})
    return out


class AerialGenerateRequest(BaseModel):
    mode: str = "render"                  # 'render' | 'facade' | 'reference'
    variant: str = ""                     # 분위기 id 또는 입면 id
    depth: str = "material"               # 입면 비교의 변경 폭(aerial_modes.DEPTHS)
    common_prompt: str = ""               # /image/aerial-prompt 가 만든 공통 프롬프트(영어, 사용자가 고쳤을 수 있음)
    extra_en: str = ""                    # 추가 요구사항의 영어 확장(로컬 SDXL 키워드 프롬프트용)
    provider: str = "local_sdxl"
    aspect_ratio: Optional[str] = None    # 유료 API 용. 로컬은 입력 비율을 그대로 쓴다
    input_image_base64: str
    reference_images: List[RefImage] = []
    external_consent: bool = False
    keep_form: int = 85                   # 로컬 SDXL: 형태 유지 정도(0~100)
    seed: Optional[int] = None
    project: str = image_history_store.DEFAULT_PROJECT


def _new_output_path(project: str, prefix: str = "gen") -> tuple:
    project_dir = image_history_store.project_dir_name(project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)
    bare = f"{prefix}_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    return os.path.join(output_dir, bare), f"{project_dir}/{bare}"


def _decode_b64(data: str, what: str) -> bytes:
    try:
        return base64.b64decode(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{what} 디코딩 실패: {e}")


async def _local_aerial(request: AerialGenerateRequest, engine: dict, instruction_or_prompt: str, input_bytes: bytes, refs: list, seed: int,
                        output_path: str, filename: str, project: str, label: str):
    avail = aerial_local.available()
    if not avail[engine["kind"]]:
        raise HTTPException(status_code=503, detail="로컬 이미지 엔진(ComfyUI)을 쓸 수 없습니다. ComfyUI가 켜져 있고 모델이 설치되어 있는지 관리자에게 확인하세요.")
    t0 = time.time()
    try:
        if engine["kind"] == "sdxl":
            _, (w, h) = await asyncio.to_thread(aerial_local.render_sdxl, input_bytes, instruction_or_prompt, output_path, seed, request.keep_form, refs)
        else:
            _, (w, h) = await asyncio.to_thread(aerial_local.render_kontext, input_bytes, instruction_or_prompt, output_path, seed, refs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"로컬 이미지 생성 실패: {e}")
    await _reject_if_unsafe_image(output_path, project=project)
    form = {"score": None, "note": ""}
    try:
        with open(output_path, "rb") as f:
            out_bytes = f.read()
        from services import form_check
        form = await asyncio.to_thread(form_check.form_score, input_bytes, out_bytes)
    except Exception as e:
        form = {"score": None, "note": f"형태 점수 계산 실패: {e}"}
    try:
        image_history_store.save_generation(
            prompt=instruction_or_prompt, style=label, aspect_ratio=None, sampler_name=None, scheduler=None, seed=seed,
            loras=[], image_filename=filename, checkpoint=engine["model"], project=project,
        )
    except Exception as e:
        print(f"[WARNING] ImageHistory: 이력 저장 실패(생성 자체는 성공): {e}")
    return {
        "status": "success", "filename": filename, "file_path": output_path, "seed_used": seed, "checkpoint_used": engine["model"],
        "width": w, "height": h, "form_score": form["score"], "form_note": form["note"], "est_cost_usd": 0.0,
        "usage_today": paid_image.usage_today(), "elapsed_sec": round(time.time() - t0), "prompt_used": instruction_or_prompt,
    }


@router.post("/image/aerial/generate")
async def aerial_generate(request: AerialGenerateRequest):
    """조감도 탭 생성 한 장. 엔진이 무료(로컬)든 유료(OpenAI·Gemini)든 같은 요청·같은 응답이다."""
    _reject_if_unsafe(request.common_prompt + " " + request.extra_en, project=request.project)
    input_bytes = _decode_b64(request.input_image_base64, "원본 이미지")
    refs = [_decode_b64(r.base64, "참조 이미지") for r in request.reference_images[:paid_image.MAX_REFERENCE_IMAGES]]
    output_path, filename = _new_output_path(request.project, "aerial")
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")
    label = aerial_modes.variant_label(request.mode, request.variant)

    engine = LOCAL_ENGINES.get(request.provider)
    if engine is None:      # 유료 API
        prompt = f"{request.common_prompt.strip()} {aerial_modes.variant_phrase(request.mode, request.variant, request.depth)}".strip()
        paid_req = ImageGenerateRequest(
            prompt=prompt, aspect_ratio=request.aspect_ratio, provider=request.provider, input_image_base64=request.input_image_base64,
            reference_images=request.reference_images, external_consent=request.external_consent, project=request.project, style=label,
        )
        res = await _generate_with_paid_provider(paid_req, output_path, filename)
        res["prompt_used"] = prompt
        res["seed_used"] = None
        return res

    if engine["kind"] == "sdxl":
        prompt = aerial_modes.local_prompt(request.mode, request.extra_en, request.variant, request.depth)
    else:   # kontext: 문장형 지시
        prompt = f"{request.common_prompt.strip()} {aerial_modes.variant_phrase(request.mode, request.variant, request.depth)}".strip()
    return await _local_aerial(request, engine, prompt, input_bytes, refs, seed, output_path, filename, request.project, label)


class AerialEditRequest(BaseModel):
    image_base64: str                     # 방금 나온 결과 이미지
    instruction: str                      # "창을 더 크게", "나무를 늘려줘" 등(한글 가능)
    provider: str = "local_kontext"
    aspect_ratio: Optional[str] = None
    external_consent: bool = False
    seed: Optional[int] = None
    project: str = image_history_store.DEFAULT_PROJECT


@router.post("/image/aerial/edit")
async def aerial_edit(request: AerialEditRequest):
    """조감도 결과를 이어서 고친다(결과 → 입력). 무료는 Kontext, 유료는 같은 API 의 편집."""
    _reject_if_unsafe(request.instruction, project=request.project)
    img_bytes = _decode_b64(request.image_base64, "이미지")
    instr_en = await asyncio.to_thread(_expand_extra_to_english, request.instruction, "edit")
    output_path, filename = _new_output_path(request.project, "aerial_edit")
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")
    prompt = f"Edit this architectural rendering: {instr_en}. Keep everything else - building shape, camera angle, materials and lighting - exactly identical."
    engine = LOCAL_ENGINES.get(request.provider)
    if engine is None:
        paid_req = ImageGenerateRequest(
            prompt=prompt, aspect_ratio=request.aspect_ratio, provider=request.provider, input_image_base64=request.image_base64,
            external_consent=request.external_consent, project=request.project, style="수정",
        )
        res = await _generate_with_paid_provider(paid_req, output_path, filename)
        res["prompt_used"] = prompt
        return res
    if engine["kind"] != "kontext":
        engine = LOCAL_ENGINES["local_kontext"]   # SDXL 은 지시문 편집이 안 되므로 Kontext 로 보낸다
    req = AerialGenerateRequest(input_image_base64=request.image_base64, provider="local_kontext", project=request.project)
    return await _local_aerial(req, engine, prompt, img_bytes, [], seed, output_path, filename, request.project, "수정")


@router.get("/image/checkpoints")
async def image_checkpoints():
    """설치된 생성 모델(체크포인트) 목록 (2026-08-20, 모델 전환 UI용).

    각 항목의 family(SDXL/SD1.5)에 따라 프론트가 표시할 해상도가 달라진다 —
    같은 화면비라도 계열별로 실제 픽셀 크기가 다르기 때문(resolve_dimensions 참고).
    """
    try:
        checkpoints = comfyui_client.list_available_checkpoints()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ComfyUI에서 모델 목록을 가져오지 못했습니다: {e}")
    return {"status": "success", "checkpoints": checkpoints}


@router.get("/image/loras")
async def image_loras():
    """설치된 LoRA 파일 목록 (2026-08-20, LoRA 관리 도구). ComfyUI에 실제로 물어봐서
    로컬이든 원격 PC의 ComfyUI든 항상 실제 설치 상태를 반영한다."""
    try:
        names = comfyui_client.list_available_loras()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ComfyUI에서 LoRA 목록을 가져오지 못했습니다: {e}")
    return {"status": "success", "loras": names}


@router.get("/image/progress")
async def get_generation_progress():
    """실시간 생성 및 업스케일 진행률(퍼센트 및 스텝 수)을 반환한다."""
    prog = comfyui_client.get_current_progress()
    return {
        "status": "success",
        "progress": prog
    }


# ── [Fooocus Quality Mode] ─────────────────────────────────────────
class QualityModeGenerateRequest(BaseModel):
    """Fooocus Quality Mode 생성 요청."""
    prompt: str
    style: str = "fooocus_enhance"
    negative_prompt_extra: str = ""
    seed: Optional[int] = None
    preset: str = "quality"  # 'speed', 'quality', 'extreme_quality'
    prompt_enhance: bool = True  # GPT-2 프롬프트 확장
    sharpness: float = 2.0  # 0.0(OFF), 1.0(약함), 2.0(기본)
    adm_guidance: bool = True  # ADM Guidance ON/OFF
    checkpoint: Optional[str] = None
    project: str = image_history_store.DEFAULT_PROJECT


@router.post("/image/generate-quality")
async def image_generate_quality(request: QualityModeGenerateRequest):
    """
    Fooocus Quality Mode 이미지 생성.
    기존 production 파이프라인과 독립적인 별도 경로로 실행된다.
    """
    _reject_if_unsafe(request.prompt, project=request.project)
    project_dir = image_history_store.project_dir_name(request.project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)

    bare_filename = f"quality_{request.preset}_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, bare_filename)
    filename = f"{project_dir}/{bare_filename}"

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[QUALITY] Generating with preset='{request.preset}', sharpness={request.sharpness}, "
          f"adm_guidance={request.adm_guidance}, seed={seed_used}")

    try:
        metadata = await asyncio.to_thread(
            comfyui_client.generate_fooocus_quality_or_raise,
            request.prompt,
            style=request.style,
            negative_extra=request.negative_prompt_extra,
            seed=seed_used,
            output_path=output_path,
            preset=request.preset,
            sharpness=request.sharpness,
            adm_guidance=request.adm_guidance,
            checkpoint_name=request.checkpoint,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fooocus Quality Mode 생성 실패: {e}")

    await _reject_if_unsafe_image(output_path, project=request.project)

    # 생성된 이미지를 base64로 읽어서 응답에 포함
    try:
        with open(output_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"[WARNING] 이미지 base64 인코딩 실패: {e}")
        image_base64 = ""

    # 이력 저장
    # 2026-09-10: 예전에는 존재하지 않는 save_image_record()를 호출하고 있어서 try/except에
    # 조용히 삼켜졌다 — Quality Mode로 생성한 이미지가 이력에 전혀 안 남던 버그였다.
    # 다른 생성 경로와 동일하게 save_generation()으로 통일해서 고친다.
    try:
        image_history_store.save_generation(
            prompt=request.prompt, style=request.style, aspect_ratio=None,
            sampler_name="fooocus", scheduler="fooocus", seed=seed_used, loras=[],
            image_filename=filename, checkpoint=request.checkpoint, project=request.project,
        )
    except Exception as e:
        print(f"[WARNING] 이미지 이력 저장 실패: {e}")

    return {
        "status": "success",
        "filename": filename,
        "image_base64": image_base64,
        "seed_used": seed_used,
        "metadata": metadata,
    }


# ── [Image Blending] ─────────────────────────────────────────
class BlendSlot(BaseModel):
    """Fooocus의 Image Prompt 슬롯 하나 — 타입/Stop At/Weight가 슬롯마다 독립적이다."""
    image: str  # base64 (데이터 URL 접두사 없이)
    type: str = "ImagePrompt"  # "PyraCanny" | "CPDS" | "ImagePrompt" | "FaceSwap"
    stop_at: Optional[float] = None  # None이면 타입별 Fooocus 기본값 사용
    weight: Optional[float] = None


class ImageBlendRequest(BaseModel):
    """이미지 블렌딩 요청 — Fooocus의 Image Prompt 패널과 동일하게 슬롯(최대 4개)마다
    Structure(PyraCanny/CPDS)·Reference(ImagePrompt/FaceSwap) 타입과 강도를 독립적으로 가진다."""
    base_image: str  # base64 (데이터 URL 접두사 없이) — 캔버스 크기 + (Structure 슬롯 없을 때) img2img 소스
    slots: List[BlendSlot]  # 1~4개
    blend_mode: str = "normal"  # (레거시 필드, 폴백 경로에서만 참고)
    prompt: str = ""  # 선택사항: 블렌딩 결과물에 추가 설명 (실제 생성에도 반영됨)
    denoise: Optional[float] = None  # 프로 모드 "기존 이미지 감도" — 지정 시 자동 계산 대신 이 값을 그대로 씀
    seed: Optional[int] = None
    project: str = image_history_store.DEFAULT_PROJECT


@router.post("/image/blend")
async def image_blend(request: ImageBlendRequest):
    """기본 이미지 + 슬롯(최대 4개, 각자 타입/강도 독립)을 Fooocus Image Prompt 방식으로 블렌딩한다."""
    _reject_if_unsafe(request.prompt, project=request.project)
    try:
        base_image_bytes = base64.b64decode(request.base_image)
        if not request.slots:
            raise ValueError("슬롯이 최소 1개 필요합니다.")
        slots = [
            {
                "image_bytes": base64.b64decode(s.image),
                "type": s.type,
                **({"stop_at": s.stop_at} if s.stop_at is not None else {}),
                **({"weight": s.weight} if s.weight is not None else {}),
            }
            for s in request.slots
        ]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")

    project_dir = image_history_store.project_dir_name(request.project)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images", project_dir))
    os.makedirs(output_dir, exist_ok=True)

    suffix = os.urandom(3).hex()
    bare_filename = f"blend_{time.strftime('%Y%m%d_%H%M%S')}_{suffix}.png"
    output_path = os.path.join(output_dir, bare_filename)
    filename = f"{project_dir}/{bare_filename}"

    # 라이트박스의 "전/후" 비교 슬라이더가 새로고침/서버 재시작 후에도 동작하도록, 원본(블렌딩
    # 전) 이미지도 결과와 함께 파일로 저장해둔다.
    bare_before_filename = f"blend_before_{time.strftime('%Y%m%d_%H%M%S')}_{suffix}.png"
    before_path = os.path.join(output_dir, bare_before_filename)
    before_filename = f"{project_dir}/{bare_before_filename}"
    with open(before_path, "wb") as f:
        f.write(base_image_bytes)

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[BLEND] Blending images with {len(slots)} slots, seed={seed_used} -> {output_path}")

    try:
        await asyncio.to_thread(
            comfyui_client.blend_images_or_raise,
            base_image_bytes=base_image_bytes,
            slots=slots,
            output_path=output_path,
            seed=seed_used,
            blend_mode=request.blend_mode,
            prompt=request.prompt,
            denoise_override=request.denoise
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 블렌딩 실패: {e}")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="ComfyUI가 블렌딩된 이미지를 반환하지 않았습니다.")

    # 결과물뿐 아니라 업로드된 원본(before) 이미지 자체가 부적절한 경우까지 같이 잡는다.
    await _reject_if_unsafe_image(output_path, before_path, project=request.project)

    # 이력 저장
    try:
        structure_types = [s.type for s in request.slots if s.type in ("PyraCanny", "CPDS")]
        reference_count = sum(1 for s in request.slots if s.type in ("ImagePrompt", "FaceSwap"))
        summary_parts = []
        if structure_types:
            summary_parts.append(f"구조유지({'/'.join(structure_types)})")
        if reference_count:
            summary_parts.append(f"참조 {reference_count}장")
        image_history_store.save_generation(
            prompt=f"[블렌딩] {', '.join(summary_parts)}" + (f" - {request.prompt}" if request.prompt else ""),
            style="none",
            aspect_ratio=None,
            sampler_name="blend",
            scheduler="simple",
            seed=seed_used,
            loras=[],
            image_filename=filename,
            checkpoint="blend",
            project=request.project,
            before_image_filename=before_filename,
        )
    except Exception as e:
        print(f"[WARNING] 블렌딩 이력 저장 실패: {e}")

    return {
        "status": "success",
        "message": "이미지 블렌딩이 완료되었습니다.",
        "image_filename": filename,
        "file_path": output_path,
        "seed_used": seed_used,
    }


# ── 2026-09-01: Fooocus 고급 기능 - 마스크 전처리 엔드포인트 ────────────────────
class MaskProcessRequest(BaseModel):
    mask_base64: str  # 흑백 PNG 마스크 (base64)
    operation: str  # "feather" | "grow" | "shrink" | "invert" | "smooth"
    radius_or_pixels: int = 5  # feather는 radius, grow/shrink는 pixels


@router.post("/image/mask/process")
async def process_mask(request: MaskProcessRequest):
    """마스크 전처리: feather, grow, shrink, invert, smooth."""
    try:
        mask_bytes = base64.b64decode(request.mask_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"마스크 디코딩 실패: {e}")

    from PIL import Image
    import numpy as np

    mask_img = Image.open(io.BytesIO(mask_bytes)).convert('L')
    mask_uint8 = np.array(mask_img, dtype=np.uint8)

    operation = request.operation.lower()

    if operation == "feather":
        result_mask = comfyui_client.apply_mask_feather(mask_uint8, radius=request.radius_or_pixels)
    elif operation == "grow":
        result_mask = comfyui_client.apply_mask_grow_shrink(mask_uint8, pixels=request.radius_or_pixels, grow=True)
    elif operation == "shrink":
        result_mask = comfyui_client.apply_mask_grow_shrink(mask_uint8, pixels=request.radius_or_pixels, grow=False)
    elif operation == "invert":
        result_mask = comfyui_client.apply_mask_invert(mask_uint8)
    elif operation == "smooth":
        result_mask = comfyui_client.apply_mask_smooth_edges(mask_uint8, iterations=request.radius_or_pixels)
    else:
        raise HTTPException(status_code=400, detail=f"알 수 없는 연산: {operation}")

    result_img = Image.fromarray(result_mask, mode='L')
    buffer = io.BytesIO()
    result_img.save(buffer, format='PNG')
    result_base64 = base64.b64encode(buffer.getvalue()).decode('ascii')

    return {
        "status": "success",
        "operation": operation,
        "mask_base64": result_base64,
    }


# ── 2026-09-18: 다이어그램 탭 - 래스터 PNG를 벡터 SVG로 변환 (vtracer, 완전 로컬/무료) ──
class VectorizeRequest(BaseModel):
    image_base64: str
    # "clean": 3배 확대 + 노이즈 제거 후 변환 — 모서리가 반듯하고 일러스트처럼 깔끔(기본, 2026-10-06 실측으로 채택).
    # "faithful": 원본 해상도 그대로 변환 — 질감/잔무늬까지 따라가지만 모서리가 뭉개지고 경로가 많다.
    mode: str = "clean"


@router.post("/image/vectorize")
async def vectorize_image(request: VectorizeRequest):
    """SDXL로 생성한 플랫 일러스트 스타일 PNG를 vtracer로 SVG로 변환한다.
    진짜 벡터 논리로 그리는 게 아니라 래스터를 트레이싱하는 방식이라, 복잡한 이미지보다는
    플랫 컬러/단순한 도형 위주 다이어그램에서 결과가 깔끔하다."""
    try:
        import vtracer
    except ImportError:
        raise HTTPException(status_code=500, detail="vtracer가 설치되어 있지 않습니다 (pip install vtracer).")

    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")

    tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "tmp"))
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_in = os.path.join(tmp_dir, f"vectorize_in_{int(time.time() * 1000)}.png")
    tmp_out = tmp_in.replace("_in_", "_out_").replace(".png", ".svg")

    try:
        # vtracer 는 확장자로 형식을 판단해서, JPG/WebP 바이트를 .png 로 저장해 넘기면 "No image file found"로
        # 죽는다 — 어떤 형식이 오든 PIL 로 읽어서 진짜 PNG(RGB, 투명은 흰 배경)로 다시 저장한다.
        try:
            from PIL import Image as _PILImage
            src_img = _PILImage.open(io.BytesIO(image_bytes))
            if src_img.mode in ("RGBA", "LA", "P"):
                rgba = src_img.convert("RGBA")
                flat = _PILImage.new("RGB", rgba.size, (255, 255, 255))
                flat.paste(rgba, mask=rgba.split()[-1])
                src_img = flat
            else:
                src_img = src_img.convert("RGB")
            clean = request.mode != "faithful"
            if clean:
                from PIL import ImageFilter as _PILFilter
                factor = min(3.0, max(1.0, 3600 / max(src_img.size)))
                if factor > 1.0:
                    src_img = src_img.resize((int(src_img.width * factor), int(src_img.height * factor)), _PILImage.LANCZOS)
                src_img = src_img.filter(_PILFilter.MedianFilter(5))
            src_img.save(tmp_in, "PNG")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"이미지 형식을 읽을 수 없습니다: {e}")

        trace_params = (
            dict(filter_speckle=12, color_precision=5, layer_difference=24, corner_threshold=75,
                 length_threshold=6.0, splice_threshold=45, path_precision=2)
            if clean else
            dict(filter_speckle=4, color_precision=6, layer_difference=16, corner_threshold=60,
                 length_threshold=4.0, splice_threshold=45, path_precision=3)
        )
        await asyncio.to_thread(
            vtracer.convert_image_to_svg_py,
            tmp_in, tmp_out,
            colormode="color", hierarchical="stacked", mode="spline", max_iterations=10,
            **trace_params,
        )

        with open(tmp_out, "r", encoding="utf-8") as f:
            svg_text = f.read()
    except (HTTPException, asyncio.CancelledError, KeyboardInterrupt, SystemExit):
        raise
    except BaseException as e:
        # vtracer(Rust)의 패닉은 Exception 이 아니라 BaseException 계열이라 함께 잡는다.
        raise HTTPException(status_code=500, detail=f"벡터화 실패: {e}")
    finally:
        for p in (tmp_in, tmp_out):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass

    return {"status": "success", "svg": svg_text}


# ── CAD 배치도에서 건물 윤곽·대지 경계를 이미지 분석으로 직접 추출(AI 눈대중 없이 원본 모양 그대로, 완전 로컬) ──
class SiteExtractRequest(BaseModel):
    image_base64: str


@router.post("/image/site-extract")
async def site_extract(request: SiteExtractRequest):
    try:
        png = base64.b64decode(request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")
    try:
        from services import site_extract as _se
        return {"status": "success", **(await asyncio.to_thread(_se.extract_site, png))}
    except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
        raise
    except BaseException as e:
        raise HTTPException(status_code=500, detail=f"배치도 분석 실패: {e}")


class PlanSegmentRequest(BaseModel):
    image_base64: str
    seeds: list  # [{id, x, y}] — x,y 는 이미지 가로·세로에 대한 0~1 비율


@router.post("/image/plan-segment")
async def plan_segment(request: PlanSegmentRequest):
    """평면도: AI 가 짚은 방 위치(씨앗)에서 시작해 벽선을 따라 방 경계를 나눈다(완전 로컬)."""
    try:
        png = base64.b64decode(request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")
    seeds = [s for s in request.seeds if isinstance(s, dict) and "id" in s and "x" in s and "y" in s][:60]
    try:
        from services import plan_segment as _ps
        return {"status": "success", **(await asyncio.to_thread(_ps.segment_rooms, png, seeds))}
    except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
        raise
    except BaseException as e:
        raise HTTPException(status_code=500, detail=f"평면 분할 실패: {e}")


# ── 2026-10-06: 이미지 → 정돈된 선(SVG) 추출 (선 검출 + 3방향 스냅, 완전 로컬) ──
class LineTraceRequest(BaseModel):
    image_base64: str
    # True 면 글자 내용을 Gemini(외부)로 읽어 편집 가능한 <text>로 만든다. 기본(False)은 글자 모양 그대로 윤곽선으로 옮긴다.
    read_text: bool = False
    # True 면 단선 위에 면 색(주황 볼륨, 회색 음영)도 단색으로 얹는다. 기본(False)은 질감·면을 무시하고 외곽선 중심 단선만.
    fills: bool = False


def _ocr_labels_with_gemini(png_bytes: bytes, width: int, height: int) -> list:
    from services.gemini_chat import gemini_chat_completion
    prompt = (
        "Read every piece of text in this image. Return JSON only (no markdown): "
        '[{"text": "exact text", "box": [ymin, xmin, ymax, xmax]}] with box coordinates normalized to 0-1000 '
        "relative to the image. Keep the original language and spelling exactly; one entry per line of text."
    )
    raw = gemini_chat_completion(
        model="gemini-3.1-flash-lite",
        messages=[{"role": "user", "content": prompt, "images": [base64.b64encode(png_bytes).decode()]}],
        max_tokens=3000, temperature=0.0,
    )
    m = re.search(r"\[[\s\S]*\]", raw)
    if not m:
        return []
    out = []
    for item in json.loads(m.group(0)):
        box = item.get("box") or []
        if item.get("text") and len(box) == 4:
            ymin, xmin, ymax, xmax = [float(v) for v in box]
            out.append({"text": str(item["text"]), "box": [xmin / 1000 * width, ymin / 1000 * height, xmax / 1000 * width, ymax / 1000 * height]})
    return out


LINETRACE_MAX_EDGE = 4000   # 선 추출은 어차피 긴 변 3600px 로 줄여서 처리하므로, 그보다 큰 원본은 올라오는 즉시 줄인다(서버 메모리·시간 보호)


def _prepare_upload_png(image_base64: str):
    """업로드된 이미지를 RGB PNG 로 바꾸고 너무 크면 줄인다. 큰 이미지의 디코딩은 수 초~수십 초 걸리므로 반드시 별도 스레드에서 부른다.
    반환: (png 바이트, 가로, 세로, 원본 가로, 원본 세로)"""
    from PIL import Image as _I
    _I.MAX_IMAGE_PIXELS = None
    raw = base64.b64decode(image_base64)
    with _I.open(io.BytesIO(raw)) as im:
        ow, oh = im.size
        if max(ow, oh) > LINETRACE_MAX_EDGE * 1.5:
            im.draft("RGB", (LINETRACE_MAX_EDGE, LINETRACE_MAX_EDGE))   # JPEG 는 디코딩 단계에서 바로 줄여 훨씬 빠르다
        rgb = im.convert("RGB")
    if max(rgb.size) > LINETRACE_MAX_EDGE:
        rgb.thumbnail((LINETRACE_MAX_EDGE, LINETRACE_MAX_EDGE), _I.LANCZOS)
    buf = io.BytesIO()
    rgb.save(buf, "PNG")
    return buf.getvalue(), rgb.size[0], rgb.size[1], ow, oh


@router.post("/image/linetrace")
async def linetrace_image(request: LineTraceRequest):
    try:
        from services import line_trace
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"선 추출에 필요한 라이브러리가 없습니다(scikit-image, scipy): {e}")
    try:
        png, w, h, _ow, _oh = await asyncio.to_thread(_prepare_upload_png, request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지를 읽을 수 없습니다: {e}")

    warning = None
    ocr = []
    if request.read_text:
        try:
            ocr = await asyncio.to_thread(_ocr_labels_with_gemini, png, w, h)
        except Exception as e:
            warning = f"글자 인식에 실패해 글자는 모양 그대로 옮겼습니다: {e}"

    try:
        result = await asyncio.to_thread(lambda: line_trace.trace_lines(png, ocr, fills=request.fills))
    except BaseException as e:
        if isinstance(e, (asyncio.CancelledError, KeyboardInterrupt, SystemExit)):
            raise
        raise HTTPException(status_code=500, detail=f"선 추출 실패: {e}")
    return {"status": "success", "svg": result["svg"], "stats": result["stats"], "warning": warning}


class LineTraceStartRequest(BaseModel):
    image_base64: str
    read_text: bool = False
    fills: bool = False
    # 기본 True: 칸마다 AI(로컬 FLUX Kontext)로 깨끗한 선화로 다시 그린 뒤 선을 추출한다(형태가 바뀌면 그 칸만 원본에서 직접 추출).
    redraw: bool = True
    max_panels: Optional[int] = None  # 시험용: 앞의 N칸만 처리
    # 'auto'(기본): 이미지를 보고 선 도식/색 면 도식을 자동 판별. 'lines': 선 추출 고정, 'color': 색 영역 그대로 벡터화 고정.
    method: str = "auto"


@router.post("/image/linetrace/start")
async def linetrace_start(request: LineTraceStartRequest):
    try:
        from services import line_pipeline
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"선 추출에 필요한 라이브러리가 없습니다: {e}")
    try:
        png, w, h, _ow, _oh = await asyncio.to_thread(_prepare_upload_png, request.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지를 읽을 수 없습니다: {e}")
    ocr = []
    if request.read_text:
        try:
            ocr = await asyncio.to_thread(_ocr_labels_with_gemini, png, w, h)
        except Exception as e:
            print(f"[LINETRACE] OCR 실패(글자는 모양 그대로 옮김): {e}")
    # start_job 은 도식 종류 판별(이미지 분석)을 하므로 이벤트 루프를 막지 않게 별도 스레드에서 부른다
    job_id = await asyncio.to_thread(line_pipeline.start_job, png, request.read_text, request.fills, request.redraw, ocr, request.max_panels, request.method)
    return {"status": "success", "job_id": job_id}


@router.get("/image/linetrace/status/{job_id}")
async def linetrace_status(job_id: str):
    from services import line_pipeline
    j = line_pipeline.get_job(job_id)
    if not j:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다(서버가 재시작되었거나 만료됨).")
    return {k: v for k, v in j.items() if k != "created"}

