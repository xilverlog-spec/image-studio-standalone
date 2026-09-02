"""
Fooocus의 "Image Prompt" 패널(Structure 1장 + Reference N장 조합)을 ComfyUI API로 재현하는 클라이언트.

사용 흐름 (사용자가 요청한 시나리오):
  - 이미지 1장: Structure  -> 외곽선/형태 유지 (PyraCanny 또는 CPDS ControlNet)
  - 이미지 N장: Reference  -> 재질/분위기/색감 반영 (ImagePrompt = IP-Adapter-Plus)

전제 조건:
  1. ComfyUI가 실행 중이고 (기본 http://127.0.0.1:8188), 이 리포의 fooocus_comfyui_port/ 폴더가
     <ComfyUI>/custom_nodes/fooocus_port/ 에 설치되어 있어야 한다 (fooocus-image-generation-preset.md,
     multi_image_prompt_comfyui_port.md 참고).
  2. Fooocus가 이미 받아둔 모델 파일들을 ComfyUI에서도 그대로 참조하거나 복사해 둔다:
     - Checkpoint: realisticStockPhoto_v20.safetensors
     - LoRA: SDXL_FILM_PHOTOGRAPHY_STYLE_V1.safetensors
     - ControlNet (PyraCanny): control-lora-canny-rank128.safetensors
     - ControlNet (CPDS):      fooocus_xl_cpds_128.safetensors
     - CLIP-Vision:            clip_vision_vit_h.safetensors
     - IP-Adapter negative:    fooocus_ip_negative.safetensors
     - IP-Adapter (ImagePrompt): ip-adapter-plus_sdxl_vit-h.bin
     - IP-Adapter (FaceSwap):    ip-adapter-plus-face_sdxl_vit-h.bin
     ComfyUI의 ControlNetLoader/체크포인트 로더는 자기 models/ 폴더 안 상대경로만 받으므로,
     이 파일들을 ComfyUI/models/{checkpoints,loras,controlnet,clip_vision}/ 밑에 심볼릭 링크하거나
     복사해두는 것을 권장한다.

필요 패키지: requests
    pip install requests
"""
import json
import time
import uuid
from pathlib import Path

import requests

COMFYUI_SERVER = "http://127.0.0.1:8188"


# ---------------------------------------------------------------------------
# 저수준 ComfyUI HTTP API 래퍼
# ---------------------------------------------------------------------------
def upload_image(image_path: str, server: str = COMFYUI_SERVER) -> str:
    """ComfyUI의 /upload/image 로 로컬 이미지를 업로드하고, 워크플로우에서 쓸 파일명을 반환."""
    p = Path(image_path)
    with open(p, "rb") as f:
        resp = requests.post(f"{server}/upload/image", files={"image": (p.name, f, "image/png")})
    resp.raise_for_status()
    return resp.json()["name"]


def queue_prompt(workflow: dict, server: str = COMFYUI_SERVER, client_id: str = None) -> str:
    client_id = client_id or str(uuid.uuid4())
    payload = {"prompt": workflow, "client_id": client_id}
    resp = requests.post(f"{server}/prompt", json=payload)
    resp.raise_for_status()
    return resp.json()["prompt_id"]


def wait_for_completion(prompt_id: str, server: str = COMFYUI_SERVER, timeout: float = 1800.0, poll: float = 2.0):
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(f"{server}/history/{prompt_id}")
        resp.raise_for_status()
        history = resp.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(poll)
    raise TimeoutError(f"ComfyUI prompt {prompt_id} did not finish within {timeout}s")


def download_outputs(history_entry: dict, out_dir: str, server: str = COMFYUI_SERVER) -> list:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for node_id, node_output in history_entry.get("outputs", {}).items():
        for img in node_output.get("images", []):
            params = {"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img["type"]}
            resp = requests.get(f"{server}/view", params=params)
            resp.raise_for_status()
            dest = out_dir / img["filename"]
            dest.write_bytes(resp.content)
            saved.append(str(dest))
    return saved


# ---------------------------------------------------------------------------
# 워크플로우 빌더
# ---------------------------------------------------------------------------
def build_workflow(
    *,
    checkpoint: str = "realisticStockPhoto_v20.safetensors",
    lora: str = "SDXL_FILM_PHOTOGRAPHY_STYLE_V1.safetensors",
    lora_weight: float = 0.25,
    clip_skip: int = -2,  # Fooocus "CLIP Skip = 2" -> ComfyUI stop_at_clip_layer -2
    positive_prompt: str,
    negative_prompt: str = "",
    structure_image_filename: str,
    structure_type: str = "PyraCanny",  # "PyraCanny" | "CPDS"
    structure_stop_at: float = 0.5,
    structure_weight: float = 1.0,
    canny_low_threshold: int = 64,
    canny_high_threshold: int = 128,
    controlnet_canny_path: str = "control-lora-canny-rank128.safetensors",
    controlnet_cpds_path: str = "fooocus_xl_cpds_128.safetensors",
    reference_image_filenames: list,  # N개의 업로드된 파일명 리스트 (재질/분위기/색감용)
    reference_stop_at: float = 0.5,
    reference_weight: float = 0.6,
    clip_vision_path: str = "clip_vision_vit_h.safetensors",
    ip_negative_path: str = "fooocus_ip_negative.safetensors",
    ip_adapter_path: str = "ip-adapter-plus_sdxl_vit-h.bin",
    steps: int = 60,
    refiner_switch_step: int = 30,  # Fooocus "Steps = 60 - 30" 참고용 (joint refiner_swap이라 실제로는 미사용)
    cfg: float = 3.0,
    sampler_name: str = "dpmpp_2m_sde_gpu",
    scheduler: str = "karras",
    width: int = 1024,
    height: int = 1024,
    batch_size: int = 4,
    seed: int = 0,
    adaptive_cfg: float = 7.0,
    sharpness: float = 2.0,
    positive_adm_scale: float = 1.5,
    negative_adm_scale: float = 0.8,
    adm_scaler_end: float = 0.3,
    controlnet_softness: float = 0.25,
) -> dict:
    """Structure 1장 + Reference N장 조합 워크플로우 JSON(ComfyUI /prompt API 형식)을 만든다."""

    g = {}  # node_id -> node dict
    nid = [0]

    def add(class_type, inputs):
        nid[0] += 1
        node_id = str(nid[0])
        g[node_id] = {"class_type": class_type, "inputs": inputs}
        return node_id

    # --- 체크포인트 / LoRA / CLIP Skip ---
    ckpt = add("CheckpointLoaderSimple", {"ckpt_name": checkpoint})
    lora_n = add("LoraLoader", {
        "model": [ckpt, 0], "clip": [ckpt, 1],
        "lora_name": lora, "strength_model": lora_weight, "strength_clip": lora_weight,
    })
    clip_n = add("CLIPSetLastLayer", {"clip": [lora_n, 1], "stop_at_clip_layer": clip_skip})

    # --- Fooocus Advanced Settings (Adaptive CFG / Sharpness / ADM / ControlNet Softness) ---
    settings_n = add("FooocusAdvancedSettings", {
        "model": [lora_n, 0],
        "adaptive_cfg": adaptive_cfg, "sharpness": sharpness,
        "positive_adm_scale": positive_adm_scale, "negative_adm_scale": negative_adm_scale,
        "adm_scaler_end": adm_scaler_end, "controlnet_softness": controlnet_softness,
    })

    # --- 프롬프트 인코딩 ---
    pos_n = add("CLIPTextEncode", {"clip": [clip_n, 0], "text": positive_prompt})
    neg_n = add("CLIPTextEncode", {"clip": [clip_n, 0], "text": negative_prompt})

    # --- Structure 이미지: PyraCanny/CPDS 전처리 -> ControlNet 적용 ---
    struct_img_n = add("LoadImage", {"image": structure_image_filename})
    struct_pre_n = add("FooocusStructurePreprocessor", {
        "image": [struct_img_n, 0], "type": structure_type,
        "canny_low_threshold": canny_low_threshold, "canny_high_threshold": canny_high_threshold,
    })
    cn_path = controlnet_canny_path if structure_type == "PyraCanny" else controlnet_cpds_path
    cn_loader_n = add("ControlNetLoader", {"control_net_name": cn_path})
    cn_apply_n = add("ControlNetApplyAdvanced", {
        "positive": [pos_n, 0], "negative": [neg_n, 0],
        "control_net": [cn_loader_n, 0], "image": [struct_pre_n, 0],
        "strength": structure_weight, "start_percent": 0.0, "end_percent": structure_stop_at,
    })
    positive_cond = [cn_apply_n, 0]
    negative_cond = [cn_apply_n, 1]

    # --- Reference 이미지 N장: IP-Adapter(ImagePrompt) 누적 후 한 번에 모델 패치 ---
    ip_loader_n = add("FooocusIPAdapterLoader", {
        "type": "ImagePrompt",
        "clip_vision_path": clip_vision_path,
        "ip_negative_path": ip_negative_path,
        "ip_adapter_path": ip_adapter_path,
    })

    ip_tasks_ref = None
    for ref_filename in reference_image_filenames:
        ref_img_n = add("LoadImage", {"image": ref_filename})
        pre_inputs = {
            "ip_adapter": [ip_loader_n, 0],
            "image": [ref_img_n, 0],
            "stop_at": reference_stop_at,
            "weight": reference_weight,
            "face_crop": False,
        }
        if ip_tasks_ref is not None:
            pre_inputs["ip_tasks"] = ip_tasks_ref
        ip_pre_n = add("FooocusIPAdapterPreprocess", pre_inputs)
        ip_tasks_ref = [ip_pre_n, 0]

    if ip_tasks_ref is not None:
        model_out = add("FooocusIPAdapterPatchModel", {"model": [settings_n, 0], "ip_tasks": ip_tasks_ref})
    else:
        model_out = settings_n

    # --- 샘플링 ---
    latent_n = add("EmptyLatentImage", {"width": width, "height": height, "batch_size": batch_size})

    denoise_start_step = max(0, int(round(steps * 0.0)))  # 순수 txt2img+ControlNet: denoise=1.0 (전 구간 샘플링)
    sampler_n = add("KSamplerAdvanced", {
        "model": [model_out, 0],
        "positive": positive_cond, "negative": negative_cond,
        "latent_image": [latent_n, 0],
        "sampler_name": sampler_name, "scheduler": scheduler,
        "steps": steps, "cfg": cfg,
        "start_at_step": denoise_start_step, "end_at_step": steps,
        "add_noise": "enable", "return_with_leftover_noise": "disable",
        "noise_seed": seed,
    })

    vae_decode_n = add("VAEDecode", {"samples": [sampler_n, 0], "vae": [ckpt, 2]})
    add("SaveImage", {"images": [vae_decode_n, 0], "filename_prefix": "fooocus_port"})

    return g


# ---------------------------------------------------------------------------
# 실행 예시
# ---------------------------------------------------------------------------
def generate(
    structure_image_path: str,
    reference_image_paths: list,
    positive_prompt: str,
    negative_prompt: str = "low quality, blurry, distorted, watermark, text",
    out_dir: str = "./output",
    **kwargs,
):
    structure_filename = upload_image(structure_image_path)
    reference_filenames = [upload_image(p) for p in reference_image_paths]

    workflow = build_workflow(
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        structure_image_filename=structure_filename,
        reference_image_filenames=reference_filenames,
        **kwargs,
    )

    prompt_id = queue_prompt(workflow)
    print(f"[ComfyUI] queued prompt_id={prompt_id}")

    history_entry = wait_for_completion(prompt_id)
    saved = download_outputs(history_entry, out_dir)
    print(f"[ComfyUI] saved {len(saved)} image(s):")
    for s in saved:
        print("  ", s)
    return saved


if __name__ == "__main__":
    # 사용자 시나리오 예시: Structure 1장(외곽선/형태) + Reference 2장(재질/분위기/색감)
    generate(
        structure_image_path="./inputs/structure.png",
        reference_image_paths=["./inputs/reference_material.png", "./inputs/reference_mood.png"],
        positive_prompt=(
            "luxurious exclusive cafe exterior realistic rendering. Clear sky and summer high-noon "
            "lights with short shadows that does not darken main building facade. 2 point perspective "
            "human view camera angle. grass and wild flower on the green area. Building's exterior "
            "finish will be matte porcelain tiles with transparent glass wall. left side used by cafe "
            "and right side used by residence. second floor open space used by parking lot so we can "
            "see parked cars. people are on the ground floor and balcony, roof top. Iconic pine tree "
            "located center of the site."
        ),
        structure_type="PyraCanny",
        structure_stop_at=0.5,
        structure_weight=1.0,
        reference_stop_at=0.5,
        reference_weight=0.6,
        width=1280, height=768,
        batch_size=4,
        seed=4587917253200053205 % (2**32),
        out_dir="./output",
    )
