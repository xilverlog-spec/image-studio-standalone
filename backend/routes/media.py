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

router = APIRouter(prefix="/v1")

class LoraSpec(BaseModel):
    name: str
    strength: float = 0.8

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

@router.post("/image/generate")
async def image_generate(request: ImageGenerateRequest):
    """
    Call ComfyUI REST API to generate an image.
    Delegates to the existing comfyui_client.py module.

    응답에는 프론트엔드가 채팅창에 바로 그려 넣을 수 있도록 base64를 함께 담는다.
    """
    # output file path will be saved inside output/images
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(output_dir, exist_ok=True)

    filename = request.filename or f"gen_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, filename)

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
        res_path = comfyui_client.generate_image_or_raise(
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
        )
    except Exception as e:
        # 실제 원인을 그대로 올려보낸다 (체크포인트 없음/타임아웃/노드 오류 등)
        raise HTTPException(status_code=500, detail=f"이미지 생성 실패: {e}")

    if not (res_path and os.path.exists(res_path)):
        raise HTTPException(
            status_code=500,
            detail="ComfyUI가 이미지를 반환하지 않았습니다. ComfyUI가 켜져 있는지 확인하세요."
        )

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

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(output_dir, exist_ok=True)
    filename = f"kontext_edit_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, filename)

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[KONTEXT] Editing image with instruction '{request.instruction[:50]}...' -> {output_path} (seed={seed_used})")

    try:
        comfyui_client.edit_image_with_kontext_or_raise(
            image_bytes, request.instruction, output_path,
            seed=seed_used, guidance=request.guidance, steps=request.steps,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 편집 실패: {e}")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="ComfyUI가 편집된 이미지를 반환하지 않았습니다.")

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

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(output_dir, exist_ok=True)
    mode = "outpaint" if outpaint else "inpaint"
    filename = f"{mode}_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, filename)

    try:
        checkpoint_used = comfyui_client.get_available_checkpoint(prefer=request.checkpoint)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 조회 실패: {e}")

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[{mode.upper()}] prompt='{request.prompt[:30]}...' -> {output_path} "
          f"(ckpt={checkpoint_used}, seed={seed_used}"
          f"{', expand=' + str(outpaint) if outpaint else ''})")

    try:
        comfyui_client.inpaint_or_raise(
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
async def get_image_history(project: str = image_history_store.DEFAULT_PROJECT, limit: int = 60):
    """이미지 생성 스튜디오의 생성 이력 (2026-08-20 신설)."""
    return {"status": "success", "generations": image_history_store.list_generations(project, limit)}


@router.delete("/image/history/{gen_id}")
async def delete_image_history(gen_id: int, project: str = image_history_store.DEFAULT_PROJECT):
    """이력 한 건과 그 실제 이미지 파일을 함께 지운다(2026-08-20, "생성 결과물 삭제" 요청).
    DB 행만 지우고 파일을 안 지우면 디스크에 계속 쌓이므로 같이 처리한다."""
    image_filename = image_history_store.delete_generation(gen_id, project)
    if image_filename is None:
        raise HTTPException(status_code=404, detail="해당 이력을 찾을 수 없습니다.")

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    # 경로 탈출 방지 — DB에 있던 값이라도 파일명만 허용한다
    safe_name = os.path.basename(image_filename)
    file_path = os.path.join(output_dir, safe_name)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as e:
            print(f"[WARNING] ImageHistory: 이력은 지웠지만 파일 삭제 실패({safe_name}): {e}")

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


class UpscaleRequest(BaseModel):
    filename: str  # output/images/의 기존 이미지 파일명 (경로 아님)
    model_name: Optional[str] = None  # 없으면 설치된 것 중 첫 번째


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
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    safe_name = os.path.basename(request.filename)  # 경로 탈출 방지
    source_path = os.path.join(output_dir, safe_name)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail=f"원본 이미지를 찾을 수 없습니다: {safe_name}")

    result_filename = f"upscaled_{safe_name}"
    result_path = os.path.join(output_dir, result_filename)

    try:
        comfyui_client.upscale_image_or_raise(source_path, result_path, model_name=request.model_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업스케일 실패: {e}")

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
        photoreal_categories = {"architecture"} | ({"portrait", "cinematic"} if suggested_style in ("photograph", "cinematic") else set())
        if category in photoreal_categories:
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
    }


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


class UpscaleRequest(BaseModel):
    filename: Optional[str] = None
    image_filename: Optional[str] = None
    scale_by: float = 2.0


@router.post("/image/upscale")
async def upscale_image_endpoint(req: UpscaleRequest):
    """갤러리의 마음에 드는 이미지를 4K 초고화질로 2배~4배 리터칭 및 확장한다."""
    target_filename = req.image_filename or req.filename
    if not target_filename:
        raise HTTPException(status_code=400, detail="업스케일할 이미지 파일명이 전달되지 않았습니다.")

    input_path = os.path.join(OUTPUT_DIR, target_filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail=f"업스케일할 원본 이미지를 찾을 수 없습니다: {target_filename}")

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    upscaled_filename = f"studio_4k_{timestamp_str}.png"
    output_path = os.path.join(OUTPUT_DIR, upscaled_filename)

    try:
        res_path = comfyui_client.upscale_image(input_path, output_path, scale_by=req.scale_by)
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"4K 업스케일 처리 중 오류: {e}")

    # 이력 저장소에 4K 업스케일 결과 등록
    try:
        image_history_store.save_generation(
            prompt=f"[4K 초고화질 업스케일] {req.image_filename}",
            style="photograph",
            aspect_ratio="4K",
            sampler_name="bicubic",
            scheduler="normal",
            seed=0,
            loras=[],
            image_filename=upscaled_filename,
            checkpoint="ComfyUI_Upscaler_4K"
        )
    except Exception as e:
        print(f"[WARNING] 4K 업스케일 이력 저장 실패: {e}")

    return {
        "status": "success",
        "message": "4K 초고화질 업스케일 완료",
        "filename": upscaled_filename,
        "file_path": res_path
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
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(output_dir, exist_ok=True)

    filename = f"quality_{request.preset}_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, filename)

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[QUALITY] Generating with preset='{request.preset}', sharpness={request.sharpness}, "
          f"adm_guidance={request.adm_guidance}, seed={seed_used}")

    try:
        metadata = comfyui_client.generate_fooocus_quality_or_raise(
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

    # 생성된 이미지를 base64로 읽어서 응답에 포함
    try:
        with open(output_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"[WARNING] 이미지 base64 인코딩 실패: {e}")
        image_base64 = ""

    # 이력 저장
    try:
        image_history_store.save_image_record(
            project=request.project,
            prompt=request.prompt,
            output_filename=filename,
            metadata={
                "mode": "fooocus_quality",
                "preset": request.preset,
                "sharpness": request.sharpness,
                "adm_guidance": request.adm_guidance,
                "prompt_enhance": request.prompt_enhance,
                **metadata
            }
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
class ImageBlendRequest(BaseModel):
    """이미지 블렌딩 요청."""
    base_image: str  # base64 (데이터 URL 접두사 없이)
    reference_image: str  # base64 (데이터 URL 접두사 없이)
    influence: float = 0.5  # 참조 이미지 영향도 (0.0 ~ 1.0)
    blend_mode: str = "normal"  # 블렌드 모드: normal, multiply, screen, overlay, soft_light, difference
    prompt: str = ""  # 선택사항: 블렌딩 결과물에 추가 설명
    seed: Optional[int] = None
    project: str = image_history_store.DEFAULT_PROJECT


@router.post("/image/blend")
async def image_blend(request: ImageBlendRequest):
    """기존 이미지와 참조 이미지를 블렌딩하여 새로운 이미지를 생성한다.

    기존 이미지를 기본으로 하고 참조 이미지의 특성을 영향도(0~1)에 따라 반영한다.
    """
    try:
        base_image_bytes = base64.b64decode(request.base_image)
        reference_image_bytes = base64.b64decode(request.reference_image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코딩 실패: {e}")

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(output_dir, exist_ok=True)

    filename = f"blend_{time.strftime('%Y%m%d_%H%M%S')}_{os.urandom(3).hex()}.png"
    output_path = os.path.join(output_dir, filename)

    seed_used = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")

    print(f"[BLEND] Blending images with influence={request.influence}, seed={seed_used} -> {output_path}")

    try:
        # ComfyUI 블렌딩 워크플로우 호출 (Fooocus 스타일의 여러 blend 모드 지원)
        comfyui_client.blend_images_or_raise(
            base_image_bytes=base_image_bytes,
            reference_image_bytes=reference_image_bytes,
            influence=request.influence,
            output_path=output_path,
            seed=seed_used,
            blend_mode=request.blend_mode
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 블렌딩 실패: {e}")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="ComfyUI가 블렌딩된 이미지를 반환하지 않았습니다.")

    # 이력 저장
    try:
        image_history_store.save_generation(
            prompt=f"[블렌딩] 영향도 {int(request.influence * 100)}%" + (f" - {request.prompt}" if request.prompt else ""),
            style="none",
            aspect_ratio=None,
            sampler_name="blend",
            scheduler="simple",
            seed=seed_used,
            loras=[],
            image_filename=filename,
            checkpoint="blend",
            project=request.project,
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

