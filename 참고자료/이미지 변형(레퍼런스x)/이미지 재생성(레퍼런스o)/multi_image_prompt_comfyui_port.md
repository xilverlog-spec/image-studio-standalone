# Fooocus "Image Prompt" (Structure + Reference 다중 이미지) → ComfyUI API 이식

이 문서는 Fooocus의 Image Prompt 패널 — 여러 장의 레퍼런스 이미지를 각각
**Image Prompt / PyraCanny / CPDS / FaceSwap** 타입으로 지정해 조합하는 기능 — 을
"1장은 Structure(외곽선/형태 유지), 나머지 N장은 Reference(재질/분위기/색감)"로 쓰는
사용자의 워크플로우에 맞춰 ComfyUI API로 재현하기 위한 참조 문서다.

Fooocus 원본 소스: `D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus`
이식 코드: [`fooocus_comfyui_port/`](fooocus_comfyui_port) (이전에 만든 CFG/Sharpness/ADM/ControlNet Softness
패치 패키지에, 이번에 Structure/Reference 관련 노드를 추가했다)
API 클라이언트 예시: [`comfyui_client.py`](comfyui_client.py)

> 참고: 이전에 만든 CFG/Sharpness/ADM/ControlNet Softness 이식 문서는
> `../이미지 변형(레퍼런스x)/fooocus-image-generation-preset.md` 에 있다. 이 문서는 그 위에
> Structure/Reference 다중 이미지 기능만 추가로 다룬다 — `fooocus_comfyui_port/`는 두 문서가 함께 쓰는
> 같은 코드 기반이지만, 이 폴더의 사본은 Structure/Reference 노드가 추가된 최신 버전이다.

## 1. Fooocus가 실제로 하는 일 (소스 코드 기준)

Fooocus의 Image Prompt 패널은 이미지 슬롯 N개(기본 4개)를 제공하고, 슬롯마다
`(이미지, Stop At, Weight, Type)` 를 받는다. 소스를 직접 읽은 결과:

**`modules/flags.py`**
```python
cn_ip = "ImagePrompt"
cn_ip_face = "FaceSwap"
cn_canny = "PyraCanny"
cn_cpds = "CPDS"

default_parameters = {
    cn_ip: (0.5, 0.6), cn_ip_face: (0.9, 0.75), cn_canny: (0.5, 1.0), cn_cpds: (0.5, 1.0)
}  # (stop_at, weight)
```

**`modules/async_worker.py`**는 슬롯들을 타입별로 버킷에 담는다:
```python
self.cn_tasks = {x: [] for x in ip_list}
for _ in range(default_controlnet_image_count):
    cn_img = args.pop(); cn_stop = args.pop(); cn_weight = args.pop(); cn_type = args.pop()
    if cn_img is not None:
        self.cn_tasks[cn_type].append([cn_img, cn_stop, cn_weight])
```

그리고 두 "계열"로 완전히 다르게 처리한다:

| 계열 | 타입 | 적용 방식 |
|---|---|---|
| **Structure** | PyraCanny, CPDS | 전처리(엣지/구조맵) 후 **ComfyUI 표준 `ControlNetApplyAdvanced`** 로 조건(conditioning)에 순차 적용 |
| **Reference** | ImagePrompt, FaceSwap | CLIP-Vision + IP-Adapter로 인코딩한 뒤, **UNet의 모든 cross-attention 블록에 K/V를 추가**하는 방식으로 한 번에 패치 (`ip_adapter.patch_model(model, all_tasks)`) |

즉 사용자가 원하는 "1장은 Structure(외곽선), 나머지는 Reference(재질/분위기)"는 Fooocus 내부에서도
**서로 다른 두 메커니즘**을 쓴다 — 하나는 ControlNet, 하나는 IP-Adapter다. 이 문서/코드는 그 두 메커니즘을
각각 ComfyUI에 맞게 이식했다.

### Structure: PyraCanny / CPDS

- **PyraCanny** (`extras/preprocessors.py: canny_pyramid`) — 이미지를 9단계 피라미드(0.2~1.0배)로
  줄여가며 각 스케일마다 RGB 채널별 Canny 엣지를 뽑고, `누적 = 누적*0.75 + 새엣지*0.25` 로 합성한다.
  일반 Canny와 달리 전역 스케일 문제를 줄이기 위한 Fooocus만의 전처리. 사용 모델은
  `control-lora-canny-rank128.safetensors` (SDXL Control-LoRA, rank128).
- **CPDS** — OpenCV `cv2.decolor`(Cewu Lu의 Contrast-Preserving Decolorization)로 만든 구조맵.
  Fooocus 전용 `fooocus_xl_cpds_128.safetensors` control-lora가 필요해서, 표준 ComfyUI 노드로는
  대체 모델이 없다(구조맵 생성 함수는 이식했지만, control-lora 가중치 파일 자체는 Fooocus 설치 폴더의
  것을 그대로 가져다 써야 한다).
- Fooocus의 `core.apply_controlnet()`은 사실 **ComfyUI의 `ControlNetApplyAdvanced` 노드를 그대로 감싼
  것**이라, 이 부분은 커스텀 노드가 필요 없다 — 표준 `ControlNetLoader` + `ControlNetApplyAdvanced`만
  쓰면 된다.

### Reference: ImagePrompt (/ FaceSwap)

- **ImagePrompt** = IP-Adapter-Plus (`ip-adapter-plus_sdxl_vit-h.bin`, CLIP-ViT-H 비전 인코더).
  224×224로 리사이즈 → CLIP-Vision → Resampler(Perceiver) → `To_KV` 선형층들을 거쳐 UNet의 각
  cross-attention 블록에 주입할 K/V 세트를 만든다.
- **FaceSwap**은 이름과 달리 얼굴 교체(identity swap) 모델이 아니라, 얼굴을 정렬/크롭한 뒤 같은
  IP-Adapter-Plus 메커니즘을 **얼굴 전용 가중치**(`ip-adapter-plus-face_sdxl_vit-h.bin`)로 태우는 것.
  정렬은 `facexlib`(RetinaFace 랜드마크) 기반 affine warp.
- 핵심은 `extras/ip_adapter.py`의 `patch_model()` — 표준 ComfyUI IPAdapter-Plus 커스텀 노드와
  **가중치 계산식이 다르다**:
  ```python
  ip_v_mean = torch.mean(ip_v, dim=1, keepdim=True)
  ip_v_offset = ip_v - ip_v_mean
  channel_penalty = float(C) / 1280.0
  weight = cn_weight * channel_penalty
  ip_k = ip_k * weight
  ip_v = ip_v_offset + ip_v_mean * weight       # V는 '평균만' weight로 스케일, 나머지(디테일)는 그대로
  ```
  (Fooocus 소스 주석: "Midjourney's attention formulation of image prompt, non-official
  reimplementation" — Lvmin Zhang, 비상업적 용도로만 사용 허가 명시). 이 때문에 결과를 최대한 동일하게
  재현하려면 표준 IPAdapter-Plus 노드 대신 **이 공식을 그대로 이식한 커스텀 노드**가 필요해서,
  아래 2절의 `ip_adapter.py`에 포팅해두었다.
- **여러 장의 Reference를 합치는 방식**: Fooocus는 ImagePrompt/FaceSwap 이미지를 각각 독립적으로
  전처리한 뒤, `all_ip_tasks = cn_tasks[ImagePrompt] + cn_tasks[FaceSwap]` 로 합쳐서 **한 번의
  `patch_model()` 호출**에 전부 넘긴다. 즉 순차 합성이 아니라, 매 attention 스텝마다 각 레퍼런스의
  K/V 조각을 전부 concat해서 같은 attention 연산에 동시에 참여시킨다(가중치는 이미지별로 독립적).

## 2. 이식한 코드 (`fooocus_comfyui_port/`)

이전 CFG/Sharpness/ADM 이식에 이어, 이번에 추가한 파일:

| 파일 | 내용 | Fooocus 원본 |
|---|---|---|
| [`preprocessors.py`](fooocus_comfyui_port/preprocessors.py) | `canny_pyramid()`(PyraCanny), `cpds()` — 원본 그대로 이식 | `extras/preprocessors.py` |
| [`resampler.py`](fooocus_comfyui_port/resampler.py) | IP-Adapter-Plus용 Perceiver Resampler (의존성 없음, 원본 그대로) | `extras/resampler.py` |
| [`ip_adapter.py`](fooocus_comfyui_port/ip_adapter.py) | CLIP-Vision 로드, IP-Adapter 가중치 로드/전처리, `patch_model()`(커스텀 attention 가중치 공식 포함) — `ldm_patched` → `comfy` 네임스페이스만 교체, 로직은 원본 그대로 | `extras/ip_adapter.py` |
| [`face_crop.py`](fooocus_comfyui_port/face_crop.py) | FaceSwap용 얼굴 정렬/크롭 — 랜드마크 검출기를 새로 구현하는 대신 Fooocus가 내장한 `extras/facexlib`를 `sys.path`로 그대로 재사용 | `extras/face_crop.py` |
| [`nodes.py`](fooocus_comfyui_port/nodes.py) (갱신) | 아래 4개 노드 추가 | — |

### 추가된 ComfyUI 노드

1. **Fooocus Structure Preprocessor (PyraCanny/CPDS)** — `IMAGE` 입력 → 전처리된 `IMAGE` 출력.
   이후 표준 `ControlNetLoader` + `ControlNetApplyAdvanced`에 연결.
2. **Fooocus IP-Adapter Loader (ImagePrompt/FaceSwap)** — CLIP-Vision/IP-Adapter 가중치를 로드해
   `FOOOCUS_IPADAPTER` 번들 출력. 타입(ImagePrompt/FaceSwap)당 한 번만 로드해서 재사용.
3. **Fooocus IP-Adapter Add Reference Image** — Reference 이미지 1장을 `FOOOCUS_IP_TASKS` 리스트에
   추가. `ip_tasks` 출력을 다음 노드의 `ip_tasks` 입력에 연결해서 **N장을 체인으로 계속 이어붙일 수 있음**
   (Fooocus의 `cn_tasks[...].append(...)`와 동일한 누적 구조).
4. **Fooocus IP-Adapter Patch Model** — 누적된 모든 Reference 작업을 한 번에 모델에 패치
   (`ip_adapter.patch_model(model, all_tasks)`와 동일). 이 노드의 출력을 `KSampler`의 `model`에 연결.

### 설치

```bash
cp -r "fooocus_comfyui_port" "<ComfyUI 설치 경로>/custom_nodes/fooocus_port"
pip install transformers requests
```
(`torch`/`numpy`/`opencv-python`/`Pillow`는 ComfyUI 환경에 보통 이미 있음. CPDS 전처리기가
`cv2.decolor`를 쓰므로 `opencv-contrib-python`이 필요할 수 있다 — `opencv-python`만 설치되어 있고
`decolor` 관련 `AttributeError`가 나면 `pip install opencv-contrib-python`으로 교체.)

### 모델 파일

Fooocus가 이미 받아둔 파일을 ComfyUI의 해당 폴더에 복사하거나 심볼릭 링크한다
(출처: `modules/config.py`, 전부 HuggingFace `lllyasviel/misc` 리포지토리):

| 역할 | 파일명 | Fooocus 내 경로 → ComfyUI 내 경로 |
|---|---|---|
| PyraCanny ControlNet | `control-lora-canny-rank128.safetensors` | `models/controlnet/` → `ComfyUI/models/controlnet/` |
| CPDS ControlNet | `fooocus_xl_cpds_128.safetensors` | 〃 |
| CLIP-Vision | `clip_vision_vit_h.safetensors` | `models/clip_vision/` → `ComfyUI/models/clip_vision/` |
| IP-Adapter negative | `fooocus_ip_negative.safetensors` | `models/controlnet/` → `ComfyUI/models/controlnet/` |
| IP-Adapter (ImagePrompt) | `ip-adapter-plus_sdxl_vit-h.bin` | 〃 |
| IP-Adapter (FaceSwap) | `ip-adapter-plus-face_sdxl_vit-h.bin` | 〃 |

`comfyui_client.py`의 각 `*_path` 인자는 ComfyUI의 `models/<종류>/` 기준 **상대 파일명**이어야 한다
(ComfyUI의 `ControlNetLoader`/`CheckpointLoaderSimple` 등이 그렇게 동작). Fooocus 설치 경로를 그대로
쓰고 싶다면 심볼릭 링크를 권장:

```bash
# 예시 (관리자 권한 필요할 수 있음)
mklink /D "ComfyUI\models\controlnet\control-lora-canny-rank128.safetensors" "D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus\models\controlnet\control-lora-canny-rank128.safetensors"
```

## 3. API 클라이언트: `comfyui_client.py`

`build_workflow()`가 아래 그래프를 코드로 조립한다 (레퍼런스 이미지 수 N은 자유):

```
CheckpointLoaderSimple ─┬─ LoraLoader ─ CLIPSetLastLayer ─┬─ CLIPTextEncode(positive)
                         │                                 └─ CLIPTextEncode(negative)
                         └─ FooocusAdvancedSettings(model)          │        │
                                                                     ▼        ▼
LoadImage(structure) ─ FooocusStructurePreprocessor ─┐      ControlNetApplyAdvanced
                                                       ├────────────►  (positive, negative)
                                 ControlNetLoader ─────┘                    │
                                                                            │
FooocusIPAdapterLoader(ImagePrompt)                                        │
   LoadImage(ref_1) ─ FooocusIPAdapterPreprocess ─┐                        │
   LoadImage(ref_2) ─ FooocusIPAdapterPreprocess ─┤(ip_tasks 체인)          │
   LoadImage(ref_N) ─ FooocusIPAdapterPreprocess ─┘                        │
                              │                                            │
   FooocusAdvancedSettings(model) ─ FooocusIPAdapterPatchModel(model)      │
                              │                                            │
                              ▼                                            ▼
                    EmptyLatentImage ──────────────────────────► KSamplerAdvanced
                                                                            │
                                                                     VAEDecode ─ SaveImage
```

### 사용법

```python
from comfyui_client import generate

generate(
    structure_image_path="./inputs/structure.png",          # 형태/외곽선을 유지할 원본 이미지
    reference_image_paths=[                                   # 재질/분위기/색감 레퍼런스 (몇 장이든)
        "./inputs/reference_material.png",
        "./inputs/reference_mood.png",
    ],
    positive_prompt="luxurious exclusive cafe exterior realistic rendering. ...",
    structure_type="PyraCanny",     # 또는 "CPDS"
    structure_stop_at=0.5,          # Fooocus 기본값
    structure_weight=1.0,           # Fooocus 기본값
    reference_stop_at=0.5,          # Fooocus 기본값 (ImagePrompt)
    reference_weight=0.6,           # Fooocus 기본값 (ImagePrompt)
    width=1280, height=768,
    batch_size=4,
    out_dir="./output",
)
```

파일 맨 아래 `if __name__ == "__main__":` 블록에 로그의 카페 프롬프트를 그대로 넣은 실행 예시가 있다.

```bash
python comfyui_client.py
```

### 주요 파라미터 대응표 (Fooocus UI ↔ 코드)

| Fooocus UI | 코드 인자 | 기본값 |
|---|---|---|
| Structure 이미지 Stop At | `structure_stop_at` | PyraCanny/CPDS 공통 `0.5` |
| Structure 이미지 Weight | `structure_weight` | PyraCanny/CPDS 공통 `1.0` |
| Reference 이미지 Stop At | `reference_stop_at` | ImagePrompt `0.5` (FaceSwap은 `0.9`) |
| Reference 이미지 Weight | `reference_weight` | ImagePrompt `0.6` (FaceSwap은 `0.75`) |
| Canny Low/High Threshold | `canny_low_threshold` / `canny_high_threshold` | `64` / `128` |
| Adaptive CFG, Sharpness, ADM Scale, ControlNet Softness | 동일 이름 kwarg | 이전 문서(레퍼런스x)와 동일 |

FaceSwap 타입을 쓰고 싶으면 `FooocusIPAdapterLoader`의 `type`을 `"FaceSwap"`, `ip_adapter_path`를
`ip-adapter-plus-face_sdxl_vit-h.bin`으로, `FooocusIPAdapterPreprocess`의 `face_crop`을 `True`로 설정하고
`stop_at=0.9, weight=0.75`를 쓰면 된다 (`comfyui_client.py`의 `build_workflow`를 FaceSwap용으로
호출부만 복제해서 쓰면 됨 — 코드 구조상 ImagePrompt와 FaceSwap을 동시에 섞는 것도 가능하다, Fooocus도
`all_ip_tasks`로 두 타입을 합치기 때문).

## 4. 검증 방법

Fooocus 소스를 그대로(또는 최소 수정으로) 옮긴 코드라 로직 자체는 신뢰할 수 있지만, 실제 ComfyUI 서버가
없는 상태에서 작성했다. 설치 후 다음을 확인할 것:

1. ComfyUI 콘솔에서 4개 신규 노드(`FooocusStructurePreprocessor`, `FooocusIPAdapterLoader`,
   `FooocusIPAdapterPreprocess`, `FooocusIPAdapterPatchModel`)가 노드 목록에 나타나는지 확인.
2. `cv2.decolor` 호출부(CPDS)에서 `AttributeError`가 나면 `opencv-contrib-python` 설치.
3. FaceSwap을 쓸 경우 `face_crop.py`가 `extras.facexlib`를 import할 수 있도록
   `face_crop.FOOOCUS_ROOT` 환경변수(`FOOOCUS_ROOT`)가 실제 Fooocus 설치 경로를 가리키는지 확인
   (기본값은 로그에 나온 `D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus`).
4. `comfyui_client.py`의 `*_path` 값들이 ComfyUI `models/` 하위의 실제 상대경로와 일치하는지 확인
   (3절 표 참고).
5. 소규모(steps=20, batch_size=1)로 먼저 1회 돌려서 배관(파이프라인) 연결이 맞는지 확인한 뒤, 실제
   설정값(steps=60 등)으로 올릴 것을 권장.
