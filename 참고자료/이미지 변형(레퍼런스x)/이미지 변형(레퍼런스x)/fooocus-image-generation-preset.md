# Fooocus 생성 설정 → ComfyUI API 이식 가이드

이 문서는 첨부된 Fooocus 실행 로그(2026-09-02, "luxurious exclusive cafe exterior" 생성)에서 추출한
설정값을 새로 만드는 생성형 이미지 웹사이트(ComfyUI API 연동)에 그대로 적용하기 위한 참조 문서다.

## 1. 로그에서 추출한 설정값

| 항목 | 값 |
|---|---|
| Base Checkpoint | `realisticStockPhoto_v20.safetensors` |
| LoRA | `SDXL_FILM_PHOTOGRAPHY_STYLE_V1.safetensors`, weight `0.25` (UNet/CLIP 동일) |
| Performance | Quality → Steps `60`, Refiner switch `30` (refiner_swap_method = joint, 실제 refiner 모델은 unload됨) |
| Sampler / Scheduler | `dpmpp_2m_sde_gpu` / `karras` |
| CFG Scale | `3` |
| Adaptive CFG | `7` |
| CLIP Skip | `2` |
| Sharpness | `2` |
| ControlNet Softness | `0.25` |
| ADM Scale (SDXL) | `1.5 : 0.8 : 0.3` (positive : negative : guidance) |
| 이미지 매수 | `4` (동일 프롬프트, 프롬프트 확장만 매 장마다 다르게 적용) |
| Seed | `4587917253200053205` (고정 시드, 4장 모두 variation은 프롬프트 확장에서만 발생) |
| Denoising Strength | `0.85` (레퍼런스 이미지에 대한 Vary 처리) |
| 최종 해상도 | `2368 × 1664` (레퍼런스 이미지가 크면 자동 리사이즈 후 이 비율로 latent 생성) |
| Negative Prompt | 로그에는 텍스트 노출 안 됨 (Encoding negative #1~4만 확인) → Fooocus 기본 negative 사용 추정 |

레퍼런스 이미지는 "[Fooocus] Loading control models ..."와 "[Vary] Image is resized because it is too big"
두 로그가 같이 찍힌 것으로 보아, **Image Prompt(ControlNet 계열) + Vary(img2img, denoise 0.85)** 조합으로 처리된 것으로 판단됨.

## 2. 원본 프롬프트

```
luxurious exclusive cafe exterior realistic rendering. Clear sky and summer high-noon lights with short
shadows that does not darken main building facade. 2 point perspective human view camera angle. grass and
wild flower on the green area. Building's exterior finish will be matte porcelain tiles with transparent
glass wall. left side used by cafe and right side used by residence. second floor open space used by
parking lot so we can see parked cars. people are on the ground floor and balcony, roof top. Iconic pine
tree located center of the site.
```

Fooocus는 여기에 **Prompt Expansion(내부 GPT2 기반 "Fooocus V2" 스타일 확장기)**을 붙여 4장 각각 다른 스타일 수식어
(cinematic, epic, elegant, sharp focus 등)를 자동으로 덧붙였다. 이는 Fooocus 전용 기능이라 그대로 이식은 불가능하고,
아래 3-5절에서 대체 방법을 제시한다.

## 3. ComfyUI 워크플로우 매핑

| Fooocus 개념 | ComfyUI 노드 |
|---|---|
| Checkpoint | `CheckpointLoaderSimple` |
| LoRA | `LoraLoader` (strength_model=0.25, strength_clip=0.25) |
| CLIP Skip | `CLIPSetLastLayer` (stop_at_clip_layer = -2) |
| Positive/Negative Prompt | `CLIPTextEncode` × 2 |
| Image Prompt (레퍼런스) | `LoadImage` → `ControlNetLoader` + `ControlNetApplyAdvanced` (strength는 ControlNet Softness 0.25를 참고해 조정) |
| Vary(리믹스) | `LoadImage` → `VAEEncode` → `KSampler`의 latent 입력으로 사용, `denoise=0.85` |
| Adaptive CFG / Sharpness / ADM Scale / ControlNet Softness | `fooocus_comfyui_port` 커스텀 노드 패키지의 `FooocusAdvancedSettings` 노드 (7절 참조) — Fooocus 원본 소스 코드를 그대로 이식했음 |
| Sampler | `KSamplerAdvanced` (sampler_name=`dpmpp_2m_sde_gpu`, scheduler=`karras`, steps=60, cfg=3) |
| VAE Decode | `VAEDecode` |
| 4장 생성 | `EmptyLatentImage`의 `batch_size=4` 또는 동일 워크플로우 4회 큐잉(시드만 변경) |
| 저장 | `SaveImage` |

## 4. ComfyUI Prompt API 워크플로우 예시 (JSON, 축약)

실제 `/prompt` 엔드포인트로 POST할 워크플로우 그래프의 핵심 노드만 표시. 노드 ID는 임의 부여했으므로
실제 ComfyUI 서버에 로드된 커스텀 노드(ControlNet 등) 이름에 맞춰 조정 필요.

```json
{
  "3": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "realisticStockPhoto_v20.safetensors" }
  },
  "4": {
    "class_type": "LoraLoader",
    "inputs": {
      "model": ["3", 0],
      "clip": ["3", 1],
      "lora_name": "SDXL_FILM_PHOTOGRAPHY_STYLE_V1.safetensors",
      "strength_model": 0.25,
      "strength_clip": 0.25
    }
  },
  "5": {
    "class_type": "CLIPSetLastLayer",
    "inputs": { "clip": ["4", 1], "stop_at_clip_layer": -2 }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": ["5", 0],
      "text": "luxurious exclusive cafe exterior realistic rendering. Clear sky and summer high-noon lights with short shadows that does not darken main building facade. 2 point perspective human view camera angle. grass and wild flower on the green area. Building's exterior finish will be matte porcelain tiles with transparent glass wall. left side used by cafe and right side used by residence. second floor open space used by parking lot so we can see parked cars. people are on the ground floor and balcony, roof top. Iconic pine tree located center of the site."
    }
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["5", 0], "text": "low quality, blurry, distorted, watermark, text" }
  },
  "10": {
    "class_type": "LoadImage",
    "inputs": { "image": "reference.png" }
  },
  "11": {
    "class_type": "VAEEncode",
    "inputs": { "pixels": ["10", 0], "vae": ["3", 2] }
  },
  "12": {
    "class_type": "KSamplerAdvanced",
    "inputs": {
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["11", 0],
      "sampler_name": "dpmpp_2m_sde_gpu",
      "scheduler": "karras",
      "steps": 60,
      "cfg": 3,
      "start_at_step": 9,
      "add_noise": "enable",
      "return_with_leftover_noise": "disable",
      "noise_seed": 4587917253200053205
    }
  },
  "13": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["12", 0], "vae": ["3", 2] }
  },
  "14": {
    "class_type": "SaveImage",
    "inputs": { "images": ["13", 0], "filename_prefix": "cafe_exterior" }
  }
}
```

주의: `denoise=0.85`를 `KSamplerAdvanced`로 흉내내려면 `start_at_step`을 `steps * (1-denoise)` ≈ `9`로 설정
(위 예시에 반영됨). 일반 `KSampler` 노드를 쓸 경우 `denoise` 파라미터에 `0.85`를 직접 지정하면 된다.

## 5. 웹사이트 구현 시 반영할 로직

1. **레퍼런스 이미지 업로드 → 전처리**: 업로드된 이미지가 target 해상도보다 크면 서버에서 자동 리사이즈(Fooocus의
   "[Vary] Image is resized" 동작 재현). 목표 해상도는 SDXL 권장 비율(예: 1024×1024 배수) 중 원본 비율에 가장 가까운
   값으로 스냅.
2. **4장 배치 생성**: `batch_size=4`로 한 번에 큐잉하거나, 동일 그래프를 4번 큐잉하되 시드를 `base_seed, base_seed+1, ...`
   식으로 증가시켜 다양성 확보.
3. **프롬프트 확장(선택)**: Fooocus의 GPT2 기반 자동 스타일 확장은 이식이 번거로우므로, 대신
   - 고정된 스타일 수식어 풀(cinematic, elegant, sharp focus, rich deep colors 등)을 코드에 두고 4장마다 랜덤 조합을 프롬프트 뒤에 덧붙이거나,
   - LLM(Claude 등) API로 원본 프롬프트를 확장하는 방식으로 대체 가능.
4. **Negative Prompt 기본값**: Fooocus 기본 negative prompt를 그대로 하드코딩해두고, 사용자가 별도 입력하지 않으면
   이를 사용하도록 설계.
5. **진행 상태 표시**: ComfyUI는 WebSocket(`/ws`)으로 progress 이벤트를 보내므로, 웹사이트에서 이를 구독해 로그에서
   보였던 "Preparing task N/4", 스텝 진행률(%) 같은 UI 피드백을 구현.
6. **결과 조회**: 생성 완료 후 `/history/{prompt_id}` 또는 `/view` 엔드포인트로 이미지 4장을 가져와 갤러리로 표시.

## 6. 미확정 항목 (실제 서버에서 확인 필요)

- Image Prompt에 사용된 ControlNet 종류(PyraCanny/CPDS/FaceSwap 등)가 로그에 명시되지 않아, 실제 사용 모델은
  Fooocus UI 설정 화면에서 재확인 필요.
- 7절의 커스텀 노드 패키지는 특정 ComfyUI 버전(Fooocus가 포크한 시점의 `comfy` 내부 구조)을 기준으로 이식되었다.
  ComfyUI를 최신 버전으로 쓸 경우 `comfy.samplers.sampling_function`, `comfy.model_base.SDXL.encode_adm`,
  `comfy.cldm.cldm.ControlNet`, `comfy.ldm.modules.diffusionmodules.openaimodel.UNetModel` 네 개의 경로가
  실제로 그대로인지 먼저 확인할 것 (아래 8절 검증 방법 참고).

## 7. Fooocus 커스텀 로직 이식 — `fooocus_comfyui_port/` 패키지

Adaptive CFG, Sharpness, ADM Scale, ControlNet Softness, Prompt Expansion(GPT2), Vary 리사이즈/디노이즈
로직은 근사치가 아니라 **Fooocus 원본 소스 코드(`D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus\modules\`)를
직접 읽어 그대로 이식**했다. 결과물은 이 문서와 같은 폴더의 [`fooocus_comfyui_port/`](fooocus_comfyui_port) 에 있다.

### 구성 파일

| 파일 | 역할 | Fooocus 원본 대응 |
|---|---|---|
| [`patch.py`](fooocus_comfyui_port/patch.py) | Adaptive CFG, Sharpness, ADM Scale, ControlNet Softness 몽키패치 | `modules/patch.py` |
| [`anisotropic.py`](fooocus_comfyui_port/anisotropic.py) | Sharpness가 쓰는 edge-aware bilateral filter (그대로 복사, Fooocus 의존성 없음) | `modules/anisotropic.py` |
| [`vary.py`](fooocus_comfyui_port/vary.py) | 레퍼런스 이미지 리사이즈(shape-ceil) + Vary/Upscale denoise 프리셋 | `modules/util.py`, `modules/async_worker.py` (`apply_vary`) |
| [`expansion.py`](fooocus_comfyui_port/expansion.py) | GPT2 기반 Prompt Expansion("Fooocus V2") 독립 실행 버전 | `extras/expansion.py` |
| [`nodes.py`](fooocus_comfyui_port/nodes.py) | 위 로직을 감싼 ComfyUI 노드 3종 | — |
| [`__init__.py`](fooocus_comfyui_port/__init__.py) | ComfyUI custom_nodes 로더 진입점, 로드 시 패치 자동 적용 | `modules/patch.py`의 `patch_all()` 호출부 |

### 이식 방식 (왜 100% 원본 재구현이 아닌 부분이 있는가)

- **Adaptive CFG / Sharpness** (`patched_sampling_function`) — Fooocus 원본은 `comfy.samplers.sampling_function`
  전체를 자체 구현으로 교체하는 짧고 독립적인 함수라, **원본 코드를 그대로** `comfy` 네임스페이스에 옮겼다.
- **ADM Scale** (`sdxl_encode_adm_patched`, `timed_adm`) — 마찬가지로 짧고 독립적인 함수라 **원본 그대로** 이식.
- **ControlNet Softness** (`patched_cldm_forward`) — Fooocus 원본은 `ControlNet.forward` 전체 본문을 재구현하는데,
  실제로 추가하는 로직은 마지막 3줄(출력 10개를 softness로 감쇠)뿐이다. ComfyUI 버전마다 forward 내부 구현이
  달라질 수 있어 위험하므로, **원본 `forward`를 그대로 호출한 뒤 결과에 동일한 감쇠 로직만 후처리**하는 방식으로
  안전하게 재작성했다(효과는 100% 동일, 버전 호환성만 개선).
- **UNetModel.forward 진행률 추적 + ADM 타임게이팅** (`patched_unet_forward`) — 같은 이유로 원본 전체를 복사하는 대신
  원본 `forward`를 감싸서 진행률 계산과 `timed_adm()` 호출만 앞에 끼워넣었다.
- **Prompt Expansion** — `ldm_patched.modules.model_management` / `ModelPatcher` 의존성을 표준 `comfy.model_management`로
  치환한 것 외에는 원본 그대로.
- **Vary 리사이즈/디노이즈** — `modules/util.py`의 `get_shape_ceil`/`set_image_shape_ceil`/`resample_image`와
  `modules/async_worker.py`의 `apply_vary` 프리셋(`subtle=0.5`, `strong=0.85`, 1024~2048 클램프)을 원본 그대로 이식.

### 설치 방법

```bash
cp -r "fooocus_comfyui_port" "<ComfyUI 설치 경로>/custom_nodes/fooocus_port"
```

ComfyUI를 재시작하면 노드 목록에 다음 3개가 나타난다 (카테고리: `fooocus_port`):

1. **Fooocus Advanced Settings (CFG/Sharpness/ADM/ControlNet)** — `MODEL`을 통과시키며 6개 값을 설정.
   그래프에서 `CheckpointLoaderSimple`/`LoraLoader` 다음, `KSampler` 앞에 연결.
2. **Fooocus Vary Image (resize + denoise)** — 레퍼런스 이미지를 넣으면 리사이즈된 이미지와 `denoise` 값(FLOAT)을
   출력. `denoise` 출력을 `KSampler`의 `denoise` 입력에 연결.
3. **Fooocus Prompt Expansion (GPT2)** — `model_dir`에 `Fooocus/models/prompt_expansion/fooocus_expansion` 폴더
   경로를 넣으면(파일 복사 불필요, 그 자리 그대로 참조 가능) GPT2가 프롬프트 뒤에 스타일 수식어를 이어 붙여 반환.
   `CLIPTextEncode`의 `text` 입력 앞단에 연결.

주의: 4절의 JSON 예시에 아래 노드를 추가해야 로그와 완전히 동일한 파이프라인이 된다.

```json
"20": {
  "class_type": "FooocusAdvancedSettings",
  "inputs": {
    "model": ["4", 0],
    "adaptive_cfg": 7, "sharpness": 2,
    "positive_adm_scale": 1.5, "negative_adm_scale": 0.8, "adm_scaler_end": 0.3,
    "controlnet_softness": 0.25
  }
}
```
그리고 `"12"` (KSamplerAdvanced) 노드의 `"model": ["4", 0]` 를 `"model": ["20", 0]` 로 바꿔 연결한다.

### 필요 패키지

`transformers`, `torch`, `numpy`, `Pillow` — ComfyUI 환경에는 보통 `torch`/`numpy`/`Pillow`가 이미 있고,
`FooocusPromptExpansion` 노드를 쓰려면 `transformers`만 추가 설치하면 된다 (`pip install transformers`).

## 8. 검증 방법 (실제 ComfyUI에 설치 전 확인)

로컬에 Fooocus만 있고 별도 ComfyUI 서버가 아직 없어 실제 로드 테스트는 못했다. 문법 검사(`py_compile`)는
5개 파일 모두 통과했지만, `import comfy...` 부분은 실제 ComfyUI 프로세스 안에서만 해석 가능하다. 설치 후:

1. ComfyUI 콘솔에 `[Fooocus Port] Adaptive CFG / Sharpness / ADM Scale / ControlNet Softness patches applied.`
   로그가 뜨는지 확인 (import 시점에 `patch_all()`이 자동 실행됨).
2. 위 4개 경로(`comfy.samplers.sampling_function`, `comfy.model_base.SDXL.encode_adm`,
   `comfy.cldm.cldm.ControlNet.forward`, `comfy.ldm.modules.diffusionmodules.openaimodel.UNetModel.forward`)가
   `AttributeError` 없이 patch되면 구조가 맞는 것. 에러가 나면 그 모듈 경로만 실제 설치된 ComfyUI 버전 기준으로
   `grep -rn "class ControlNet" ComfyUI/comfy/` 식으로 재확인해서 `patch.py` 상단 import를 수정하면 된다.
