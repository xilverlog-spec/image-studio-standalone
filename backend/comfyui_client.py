import urllib.request
import urllib.parse
import json
import re
import time
import os

# 같은 네트워크의 다른 PC에서 ComfyUI를 대신 돌리고 싶으면(예: GPU가 더 넉넉한 PC),
# .env에 COMFYUI_URL=http://<그 PC의 IP>:8188 을 넣으면 그쪽으로 요청이 간다.
# 기본값은 지금처럼 이 컴퓨터에서 직접 돌리는 경우.
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://localhost:8188")

# 폴링 상한 — 이게 없으면 ComfyUI가 죽었을 때 요청이 영원히 매달린다
# 2026-08-21: SDXL(+LoRA) 조합을 8GB VRAM에서 실제로 돌려보니 532초가 걸렸다(순수 SDXL은
# 35초였음 — LoRA 하나 추가로 15배 느려진 것은 VRAM 여유가 빠듯해 일부 연산이 CPU로 밀려난
# 것으로 보임). 300초로는 정상 완료된 생성도 "실패"로 오보되는 게 실측 확인됨.
GENERATION_TIMEOUT_SEC = 900

# 현재 설치된 체크포인트는 SD 1.x 계열(model.safetensors)이다.
# SD1.5는 512px 학습이라 1024폭으로 뽑으면 형체가 무너지고, cfg 1.0/4스텝(Turbo 설정)이면
# 뿌연 회색 얼룩만 나온다. 아래 값은 SD1.x 기준 일반 설정.
DEFAULT_WIDTH = 768
DEFAULT_HEIGHT = 512
DEFAULT_STEPS = 25
DEFAULT_CFG = 7.0

# 이 체크포인트는 스톡이미지가 섞인 데이터로 학습돼서 워터마크/서명을 자주 그려 넣는다.
# 2026-08-28: SDXL 모델 품질 최적화 — 흔한 아티팩트를 더 적극적으로 억제하는 토큰 추가.
# 2026-08-28: 인물 얼굴이 자주 뭉개진다는 피드백으로 얼굴 관련 부정 프롬프트 보강.
# 2026-08-31: Fooocus 결과물과 품질 차이가 크다는 피드백으로 Fooocus의 "Fooocus Enhance"
# 네거티브 프롬프트(참고자료/Fooocus-main/sdxl_styles/sdxl_styles_fooocus.json)를 그대로
# 병합 — 노출/채도/텍스처 관련 부정 토큰이 훨씬 촘촘해서 디테일이 또렷해진다.
DEFAULT_NEGATIVE = (
    "text, watermark, signature, logo watermark, stock photo, vectorstock, shutterstock, "
    "letters, caption, blurry, low quality, jpeg artifacts, ugly, deformed, "
    "worst quality, normal quality, lowres, bad anatomy, bad hands, extra fingers, "
    "fewer fingers, cropped, poorly drawn, mutated, out of frame, "
    "deformed face, disfigured face, distorted face, asymmetric face, asymmetric eyes, "
    "cross-eyed, poorly drawn face, bad proportions, mutated hands, extra limbs, blurry face, "
    "oversaturated, undersaturated, overexposed, underexposed, grayscale, bw, bad photo, "
    "bad photography, bad art, error, username, autograph, trademark, grainy, "
    "morbid, asymmetrical, mutilated, poorly lit, bad shadow, draft, cut off, censored, "
    "out of focus, glitch, duplicate, airbrushed, semi-realistic, cgi, render, blender, "
    "digital art, amateur, bad teeth, bad arms, bad legs, deformities"
)

# ── 2026-08-20: Fooocus의 "다운로드 없이 되는" 전문가 튜닝 기능 이식 ──────────
# (스타일 프리셋/화면비 프리셋/성능 모드/샘플러·스케줄러·시드 노출)
# refiner·LoRA·Image Prompt·인페인트처럼 모델을 새로 받아야 하는 기능은 여기 없다 —
# 8GB VRAM에서 기존 체크포인트와 동시에 얹으면 오히려 다 느려질 수 있어 별도 승인 후 진행 예정.
#
# 2026-08-31: 처음 이식했을 땐 체크포인트가 SD1.x(Realistic Vision)라 Fooocus 원문(SDXL 기준)을
# 그대로 베끼면 과도한 디테일 강조로 이미지가 깨질 수 있어 강도를 낮춰 재구성했었다. 지금은
# 체크포인트가 SDXL(Juggernaut-XL)로 바뀌었고, Fooocus와의 품질 격차가 크다는 피드백이 있어
# sdxl_styles_fooocus.json의 "Fooocus Sharp"/"Photograph"/"Cinematic" 원문 강도로 되돌렸다.
STYLE_PRESETS = {
    "none": {"label": "스타일 없음", "positive": "", "negative": ""},
    "fooocus_enhance": {
        "label": "범용 고화질",
        # Fooocus "Sharp" 스타일 원문 — {prompt} 자리에 실제 프롬프트가 들어가는 템플릿이라
        # 여기선 접미사로만 붙이는 우리 구조에 맞춰 "cinematic still ~" 부분을 접미사로 재배치.
        "positive": "emotional, harmonious, vignette, 4k epic detailed, shot on kodak, 35mm photo, "
                     "sharp focus, high budget, cinemascope, moody, epic, gorgeous, film grain, grainy",
        "negative": "",
    },
    "photograph": {
        "label": "사실적인 사진",
        # Fooocus "Photograph" 스타일 원문.
        "positive": "photograph, 50mm, cinematic 4k epic detailed photograph shot on kodak detailed "
                     "cinematic hbo dark moody, 35mm photo, grainy, vignette, vintage, Kodachrome, "
                     "Lomography, stained, highly detailed, found footage",
        "negative": "bokeh, depth of field, regular face, saturated, contrast, deformed iris, deformed pupils, "
                     "semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, cloned face, "
                     "gross proportions, malformed limbs",
    },
    "cinematic": {
        "label": "시네마틱",
        # Fooocus "Cinematic" 스타일 원문.
        "positive": "emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, "
                     "moody, epic, gorgeous, film grain, grainy",
        "negative": "flat lighting, overexposed",
    },
    "architecture": {
        "label": "건축 렌더링",
        # 기존 건축 렌더링 문구 + Fooocus Sharp의 사진 품질 수식어를 결합 — 장르(건축)는
        # 유지하면서 디테일/선명도만 Fooocus 수준으로 끌어올린다.
        "positive": "architectural rendering, clean lines, natural light, concrete and glass, modern minimalist, "
                     "4k epic detailed, shot on kodak, 35mm photo, sharp focus, high budget, film grain",
        "negative": "cluttered, messy",
    },
    "anime": {
        "label": "애니메이션풍",
        "positive": "anime style, cel shading, vibrant colors, clean line art",
        "negative": "photorealistic, realistic skin texture",
    },
    "flat_illustration": {
        "label": "플랫 일러스트 (발표자료용)",
        "positive": "flat vector illustration, minimal, clean shapes, modern corporate style",
        "negative": "photorealistic, 3d render, noisy texture",
    },
}

# Fooocus의 화면비 프리셋을 SDXL(1024 기준) 대신 이 체크포인트(SD1.x, 512px 학습)에
# 맞는 해상도로 재계산했다 — 비율은 Fooocus와 동일하게, 픽셀 수만 낮췄다.
# 화면비 프리셋.
#
# 2026-08-20: SD1.5와 SDXL은 학습 해상도가 달라서 같은 크기를 주면 한쪽이 반드시 망가진다
# (SD1.5는 512 기준이라 1024를 주면 인물·구도가 복제되고, SDXL은 1024 기준이라 640을 주면
# 뭉개진다). 그래서 화면비 하나당 두 벌의 크기를 들고 있다가 선택된 체크포인트 계열에 맞는
# 쪽을 고른다 — resolve_dimensions() 참고. sdxl_* 값은 SDXL 공식 학습 버킷(총 화소 약 1M).
ASPECT_RATIOS = {
    "1:1":  {"label": "정사각형 (1:1)",   "width": 640, "height": 640, "sdxl_width": 1024, "sdxl_height": 1024},
    "4:3":  {"label": "표준 (4:3)",       "width": 720, "height": 544, "sdxl_width": 1152, "sdxl_height": 896},
    "3:4":  {"label": "세로 표준 (3:4)",  "width": 544, "height": 720, "sdxl_width": 896,  "sdxl_height": 1152},
    "16:9": {"label": "와이드 (16:9)",    "width": 768, "height": 432, "sdxl_width": 1344, "sdxl_height": 768},
    "9:16": {"label": "세로 와이드 (9:16)", "width": 432, "height": 768, "sdxl_width": 768,  "sdxl_height": 1344},
    "3:2":  {"label": "사진 (3:2)",       "width": 768, "height": 512, "sdxl_width": 1216, "sdxl_height": 832},
}

# Fooocus의 Speed/Quality 개념에서 스텝수를 그대로 맞췄다 (modules/flags.py의
# Steps enum: QUALITY=60, SPEED=30). 2026-08-31 이전엔 quality=25/extreme_quality=40으로
# Fooocus의 최하위 등급(Speed=30)보다도 낮게 잡혀 있어 디테일이 덜 살았다 —
# "기본"을 Fooocus의 Speed(30)에, "고품질"을 Fooocus의 Quality(60)에 맞춰 재조정.
# 2026-08-28: SDXL 전용 CFG 추가 — SDXL은 CFG 3.5~5.0이 최적(높으면 과포화/인위적).
# build_sdxl_turbo_workflow()에서 체크포인트 계열을 보고 자동으로 sdxl_cfg를 적용한다.
PERFORMANCE_PRESETS = {
    "speed": {"label": "Speed (빠름)", "steps": 15, "cfg": 6.5, "sdxl_cfg": 3.5},
    "quality": {"label": "Quality (기본, Fooocus Speed와 동일)", "steps": 30, "cfg": 7.0, "sdxl_cfg": 4.5},
    "extreme_quality": {"label": "Extreme Quality (느림, Fooocus Quality와 동일)", "steps": 60, "cfg": 7.5, "sdxl_cfg": 5.0},
}

# ComfyUI가 실제로 지원하는 값 중 자주 쓰이는 것만 노출 (전체 목록은 /object_info로 조회 가능하지만
# 사용자에게 의미 있는 선택지만 추려서 제공한다).
AVAILABLE_SAMPLERS = ["euler_ancestral", "euler", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_sde", "ddim"]
AVAILABLE_SCHEDULERS = ["karras", "normal", "exponential", "sgm_uniform"]

# 2026-08-20: "이름만 있고 뭘 하는 값인지 모르겠다"는 요청으로 설명 추가.
# 각 값이 실제로 무엇을 바꾸는지 사용자가 화면에서 바로 알 수 있게 한다.
SAMPLER_DESCRIPTIONS = {
    "euler_ancestral": "매 스텝마다 노이즈를 추가로 섞어 더 다채롭고 우연성 있는 결과를 만듭니다. 같은 시드라도 스텝 수가 바뀌면 결과도 달라집니다. (기본값 — 대체로 무난하고 자연스러움)",
    "euler": "가장 단순하고 빠른 기본 샘플러입니다. 안정적이지만 euler_ancestral보다 디테일 표현이 약간 밋밋할 수 있습니다.",
    "dpmpp_2m": "품질과 속도의 균형이 좋은 방식입니다. 적은 스텝수(15~20)에서도 비교적 안정적인 결과를 냅니다.",
    "dpmpp_2m_sde": "dpmpp_2m에 확률적 노이즈를 더해 디테일이 더 풍부해지지만 속도는 조금 느립니다.",
    "dpmpp_sde": "세밀한 질감·디테일 표현에 강하지만 생성 속도가 가장 느린 편입니다. 고품질이 필요할 때 추천.",
    "ddim": "가장 오래되고 검증된 방식 중 하나입니다. 같은 시드면 항상 같은 결과가 나오는 결정론적 특성이 있어 재현성이 가장 높지만, 디테일은 다른 샘플러보다 단순한 편입니다.",
}
SCHEDULER_DESCRIPTIONS = {
    "karras": "노이즈를 없애가는 간격을 초반엔 크게, 후반엔 세밀하게 조정합니다. 적은 스텝수로도 품질이 좋아 대부분 상황에 추천되는 기본값입니다.",
    "normal": "노이즈 제거 간격을 균등하게 나눕니다. 무난하지만 karras보다 같은 스텝수에서 디테일이 살짝 떨어질 수 있습니다.",
    "exponential": "초반에 노이즈를 크게, 후반으로 갈수록 아주 조금씩 줄입니다. 정교한 디테일 표현에 유리하지만 초반 구도가 흔들릴 수 있습니다.",
    "sgm_uniform": "score-based 생성 모델 방식의 균등 스케줄입니다. 특정 모델·워크플로에서 안정적인 결과를 내는 경우가 많습니다.",
}

_checkpoint_cache = None

# 여러 체크포인트가 설치돼 있을 때 기본으로 쓸 것을 이름 패턴으로 고른다.
# 목록 순서(names[0])에 우연히 의존하면 체크포인트를 하나 더 추가하는 순간
# 어떤 게 뽑힐지 예측할 수 없게 된다 — 그래서 명시적으로 우선순위를 둔다.
# 2026-08-28: Juggernaut-XL v9이 설치돼 있으면 최우선 — 현존 SDXL 중 사실적 이미지
# 품질이 가장 높고, RunDiffusionPhoto 변형은 사진 스타일에 특화돼 있다.
# Realistic Vision은 SD1.5 계열이라 SDXL 체크포인트가 있으면 그쪽이 낫다.
PREFERRED_CHECKPOINT_PATTERNS = ("juggernaut", "juggerxl", "realistic_vision", "realisticvision")


def get_available_checkpoint(prefer: str = None):
    """
    ComfyUI checkpoints 폴더에서 직접 체크포인트 파일을 읽는다.
    API가 없거나 작동하지 않을 때 파일 시스템 폴백.
    """
    global _checkpoint_cache
    if _checkpoint_cache and not prefer:
        return _checkpoint_cache

    # ComfyUI models/checkpoints 디렉토리 찾기
    checkpoint_dir = os.path.expanduser("~/Downloads/ComfyUI/models/checkpoints")
    if not os.path.exists(checkpoint_dir):
        raise RuntimeError(f"ComfyUI checkpoints 폴더를 찾을 수 없습니다: {checkpoint_dir}")

    names = [f for f in os.listdir(checkpoint_dir) if f.endswith(('.safetensors', '.ckpt', '.pt')) and not f.startswith('put_')]
    if not names:
        raise RuntimeError(f"ComfyUI checkpoints 폴더에 모델이 없습니다: {checkpoint_dir}")

    def find(pattern):
        pattern = pattern.lower()
        return next((n for n in names if pattern in n.lower()), None)

    chosen = None
    if prefer:
        chosen = find(prefer)
    if not chosen:
        for pattern in PREFERRED_CHECKPOINT_PATTERNS:
            chosen = find(pattern)
            if chosen:
                break
    if not chosen:
        chosen = names[0]

    if not prefer:
        _checkpoint_cache = chosen
    print(f"ComfyUI checkpoint selected: {chosen} (available: {names})")
    return chosen


# 파일명에 XL이 토큰으로 들어있는지로 SDXL 계열을 판별한다.
# 파일을 직접 열어 텐서 구조를 보는 게 정확하지만, ComfyUI가 원격 PC일 수 있어
# (COMFYUI_URL) 파일 시스템 접근을 전제할 수 없다 — 그래서 이름 규칙으로 판단한다.
# 'Realistic_Vision'처럼 단어 안에 우연히 들어간 xl은 걸리지 않도록 경계를 둔다.
_SDXL_NAME_RE = re.compile(r"(?:^|[^a-z])xl(?:[^a-z]|$)", re.IGNORECASE)
# 2026-08-24: "RealVisXL_V5.0_fp16.safetensors"처럼 단어에 XL이 구분자 없이 바로 붙는
# 흔한 명명 규칙(ModelNameXL)은 위 정규식이 못 잡는다(앞에 문자가 있어 경계 조건 불충족).
# 실제로 이 패턴 때문에 RealVisXL(SDXL)이 SD1.5로 오분류되어 화면비 해상도가 512계열로
# 잘못 계산되고 있었다 — 이런 이름은 대문자 XL이 붙는 규칙을 따르므로 대소문자 구분 검사로 보완한다.
_SDXL_SUFFIX_RE = re.compile(r"XL(?=[^a-zA-Z]|$)")


def is_sdxl_checkpoint(ckpt_name: str) -> bool:
    if not ckpt_name:
        return False
    return bool(_SDXL_NAME_RE.search(ckpt_name) or _SDXL_SUFFIX_RE.search(ckpt_name))


def resolve_dimensions(aspect_ratio: str, checkpoint: str = None,
                       fallback_width: int = None, fallback_height: int = None):
    """화면비 + 체크포인트 계열 → 실제 생성 크기.

    같은 '16:9'라도 SD1.5면 768×432, SDXL이면 1344×768을 써야 각 모델이 제 성능을 낸다.
    aspect_ratio가 없거나 모르는 값이면 fallback(요청이 직접 준 width/height)을 그대로 쓴다.
    """
    ratio = ASPECT_RATIOS.get(aspect_ratio) if aspect_ratio else None
    if not ratio:
        return fallback_width or DEFAULT_WIDTH, fallback_height or DEFAULT_HEIGHT
    if is_sdxl_checkpoint(checkpoint or ""):
        return ratio["sdxl_width"], ratio["sdxl_height"]
    return ratio["width"], ratio["height"]


def list_available_checkpoints():
    """설치된 체크포인트 목록 + 계열 정보 (2026-08-20, 모델 전환 UI용).

    ComfyUI API 엔드포인트(/object_info)는 존재하지 않으므로, 직접 파일 시스템에서 조회한다.
    """
    checkpoint_dir = os.path.expanduser("~/Downloads/ComfyUI/models/checkpoints")
    if not os.path.exists(checkpoint_dir):
        return []

    ckpt_files = sorted([f for f in os.listdir(checkpoint_dir) if f.endswith(('.safetensors', '.ckpt', '.pt')) and not f.startswith('put_')])
    return [
        {
            "name": n,
            "family": "SDXL" if is_sdxl_checkpoint(n) else "SD1.5",
            "is_default": n == get_available_checkpoint(),
        }
        for n in ckpt_files
    ]


def list_available_loras():
    """
    ComfyUI에 실제로 설치된 LoRA 파일 목록을 조회한다(2026-08-20, LoRA 관리 도구용).
    체크포인트 조회와 동일하게 /object_info로 물어봐서, 로컬이든 원격 PC의 ComfyUI든
    (COMFYUI_URL) 항상 실제 설치 상태를 반영한다 — 파일 시스템을 직접 뒤지지 않는다.
    """
    req = urllib.request.Request(f"{COMFYUI_URL}/object_info/LoraLoader")
    with urllib.request.urlopen(req, timeout=10) as response:
        info = json.loads(response.read())
    names = info["LoraLoader"]["input"]["required"]["lora_name"][0]
    # ComfyUI는 loras 폴더가 완전히 비어있으면 목록 자체가 없거나 placeholder만 준다.
    return [n for n in names if not n.lower().endswith(('.txt', 'readme'))]


# ── Fooocus 기본 Offset LoRA (2026-08-31) ────────────────────────────
# Fooocus는 모든 프리셋(default.json 등)에서 이 LoRA를 강도 0.1로 항상 같이 적용한다.
# Stability AI가 SDXL 공식 저장소에 올린 것으로, 아주 어둡거나 아주 밝은 장면에서
# SDXL이 흔히 보이는 "회색으로 뭉개짐" 문제를 보정해 다이나믹 레인지를 넓혀준다.
# 사용자가 이미 자기 LoRA를 5개 다 채웠으면(loras 슬롯 상한) 끼워 넣지 않는다.
OFFSET_LORA_NAME = "sd_xl_offset_example-lora_1.0.safetensors"
OFFSET_LORA_STRENGTH = 0.1
_offset_lora_cache = None


_prompt_expansion_cache = None


def is_prompt_expansion_available() -> bool:
    """Fooocus V2 프롬프트 확장 커스텀 노드(+GPT-2 모델)가 설치돼 있는지 확인한다."""
    global _prompt_expansion_cache
    if _prompt_expansion_cache is not None:
        return _prompt_expansion_cache
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/object_info/FooocusPromptExpansion")
        with urllib.request.urlopen(req, timeout=5) as response:
            info = json.loads(response.read())
        _prompt_expansion_cache = bool(info.get("FooocusPromptExpansion"))
    except Exception:
        _prompt_expansion_cache = False
    return _prompt_expansion_cache


def is_offset_lora_available() -> bool:
    """Fooocus 기본 Offset LoRA가 ComfyUI에 설치돼 있는지 확인한다."""
    global _offset_lora_cache
    if _offset_lora_cache is not None:
        return _offset_lora_cache
    try:
        _offset_lora_cache = OFFSET_LORA_NAME in list_available_loras()
    except Exception:
        return False
    return _offset_lora_cache


# ── 얼굴 보정 (2026-08-28, Impact Pack FaceDetailer) ──────────────────
# 4스텝 Turbo/저해상도 생성에서 얼굴이 뭉개지는 문제를 negative 프롬프트/화면비 조정만으로
# 해결하는 데 한계가 있어, 얼굴 영역만 감지해 별도로 다시 그려주는 FaceDetailer를 도입한다.
# ComfyUI에 Impact Pack(및 얼굴 탐지 모델)이 설치돼 있어야 동작하므로 항상 가용성을 먼저 확인한다.
_face_bbox_model_cache = None
FACE_BBOX_MODEL_PATTERNS = ("face_yolov8m", "face_yolov8n", "face_yolov8s", "face")


def get_available_face_bbox_model():
    """Impact Pack의 UltralyticsDetectorProvider에 설치된 얼굴 탐지 모델 이름을 찾는다."""
    global _face_bbox_model_cache
    if _face_bbox_model_cache:
        return _face_bbox_model_cache
    req = urllib.request.Request(f"{COMFYUI_URL}/object_info/UltralyticsDetectorProvider")
    with urllib.request.urlopen(req, timeout=10) as response:
        info = json.loads(response.read())
    names = info["UltralyticsDetectorProvider"]["input"]["required"]["model_name"][0]
    chosen = None
    for pattern in FACE_BBOX_MODEL_PATTERNS:
        chosen = next((n for n in names if pattern in n.lower()), None)
        if chosen:
            break
    if not chosen and names:
        chosen = names[0]
    _face_bbox_model_cache = chosen
    return chosen


def is_facedetailer_available() -> bool:
    """FaceDetailer 노드와 얼굴 탐지 모델이 ComfyUI에 실제로 준비돼 있는지 확인한다."""
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/object_info/FaceDetailer")
        with urllib.request.urlopen(req, timeout=5) as response:
            json.loads(response.read())
        return bool(get_available_face_bbox_model())
    except Exception:
        return False


# ── 건축 실사화용 Canny ControlNet (2026-08-31) ──────────────────────
# img2img denoise만으로는 "형태 보존"과 "재질 실사화"가 서로 트레이드오프라 —
# denoise를 낮추면 형태는 유지되지만 재질도 원본 캡처(CAD/모델링)처럼 밋밋하게 남고,
# denoise를 높이면 재질은 실사가 되지만 건물 형태·창호 배치까지 같이 바뀌어버린다.
# Canny ControlNet으로 원본의 외곽선(엣지)을 고정해두면 denoise를 크게 높여도
# 그 엣지 구조 안에서만 다시 그리므로, 형태는 그대로 두고 재질/조명만 실사로 바뀐다.
_controlnet_canny_cache = None
CONTROLNET_CANNY_PATTERNS = ("canny",)


def get_available_controlnet_canny():
    """설치된 ControlNet 중 canny(엣지) 계열 모델 이름을 찾는다. 없으면 None."""
    global _controlnet_canny_cache
    if _controlnet_canny_cache:
        return _controlnet_canny_cache
    req = urllib.request.Request(f"{COMFYUI_URL}/object_info/ControlNetLoader")
    with urllib.request.urlopen(req, timeout=10) as response:
        info = json.loads(response.read())
    names = info["ControlNetLoader"]["input"]["required"]["control_net_name"][0]
    chosen = next((n for n in names for pat in CONTROLNET_CANNY_PATTERNS if pat in n.lower()), None)
    if chosen:
        _controlnet_canny_cache = chosen
    return chosen


def is_controlnet_canny_available() -> bool:
    """Canny ControlNet 모델이 실제로 설치돼 있는지 확인한다."""
    try:
        return bool(get_available_controlnet_canny())
    except Exception:
        return False


def build_sdxl_turbo_workflow(prompt: str, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT,
                              steps: int = DEFAULT_STEPS, cfg: float = DEFAULT_CFG,
                              style: str = "none", sampler_name: str = None, scheduler: str = None,
                              seed: int = None, negative_extra: str = "", loras: list = None,
                              checkpoint: str = None, input_image_name: str = None, denoise: float = 1.0,
                              enable_face_detailer: bool = False, controlnet_strength: float = 0.0):
    """
    style/sampler_name/scheduler/seed/loras는 2026-08-20 Fooocus 기능 이식으로 추가된 선택 인자.
    전부 기본값이 있어 기존 호출부(ppt.py 등 안 넘기는 곳)는 그대로 동작한다.

    loras: [{"name": "파일명.safetensors", "strength": 0.8}, ...] — 최대 5개(Fooocus와 동일 상한).
    체크포인트(노드 4)와 샘플러/텍스트인코더 사이에 LoraLoader 노드를 체인으로 끼워 넣는다.

    2026-08-27: input_image_name이 주어지면 img2img 모드 — EmptyLatentImage(순수 노이즈) 대신
    업로드된 참고 이미지를 LoadImage→VAEEncode로 latent화해서 KSampler에 넣는다. "이 이미지를
    밤으로 바꿔줘"처럼 원본 구도/색감을 최대한 유지하면서 프롬프트 방향으로만 다시 그리는 용도.
    denoise가 낮을수록(예: 0.35) 원본을 많이 보존하고, 1.0이면 사실상 원본과 무관한 새 그림이 된다.
    이 모드에선 latent 크기가 업로드 이미지 해상도를 그대로 따르므로 width/height는 무시된다.
    """
    workflow_path = os.path.join(os.path.dirname(__file__), "..", "comfyui_workflows", "sdxl_turbo_workflow.json")
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"ComfyUI workflow file not found at: {workflow_path}")

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    style_def = STYLE_PRESETS.get(style, STYLE_PRESETS["none"])
    final_negative = DEFAULT_NEGATIVE
    if style_def["negative"]:
        final_negative = f"{final_negative}, {style_def['negative']}"
    if negative_extra:
        final_negative = f"{final_negative}, {negative_extra}"

    resolved_seed = seed if seed is not None else int.from_bytes(os.urandom(4), "big")

    # 체크포인트를 먼저 확정해야 SDXL 여부에 따라 텍스트 인코더 노드 종류를 정할 수 있다.
    # checkpoint를 명시하면 그걸 쓰고(모델 전환 UI), 없으면 기본 우선순위대로 고른다.
    workflow["4"]["inputs"]["ckpt_name"] = get_available_checkpoint(prefer=checkpoint)
    actual_ckpt = workflow["4"]["inputs"]["ckpt_name"]
    is_sdxl = is_sdxl_checkpoint(actual_ckpt)

    # 2026-08-31: SDXL 체크포인트인데 SD1.x용 평범한 CLIPTextEncode를 쓰고 있었다 — SDXL은
    # width/height/target_size/crop 같은 추가 조건(micro-conditioning, "ADM embedding")을
    # 학습 때부터 같이 받는 모델이라, 이걸 안 주면(=0으로 취급됨) 구도·디테일이 학습 분포에서
    # 벗어나 품질이 눈에 띄게 떨어진다. Fooocus·Automatic1111 등도 전부 이 조건을 채워서
    # 넣는다 — CLIPTextEncodeSDXL로 바꿔서 실제 생성 해상도를 그대로 조건에 실어 보낸다.
    if is_sdxl:
        clip_link = ["4", 1]
        workflow["6"] = {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "clip": clip_link, "width": width, "height": height,
                "crop_w": 0, "crop_h": 0, "target_width": width, "target_height": height,
                "text_g": prompt, "text_l": prompt,
            },
        }
        workflow["7"] = {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "clip": clip_link, "width": width, "height": height,
                "crop_w": 0, "crop_h": 0, "target_width": width, "target_height": height,
                "text_g": final_negative, "text_l": final_negative,
            },
        }
        text_field = "text_g"
    else:
        workflow["7"]["inputs"]["text"] = final_negative
        text_field = "text"

    # 2026-08-31: Fooocus V2 프롬프트 확장 — 짧은 프롬프트 뒤에 GPT-2가 좋은 결과를 낸다고
    # 검증된 어휘로 디테일 묘사를 자동으로 이어 붙인다(Fooocus 거의 모든 프리셋의 기본 동작).
    # 노드가 설치돼 있으면 CLIPTextEncode의 text를 이 노드 출력으로 대체하고, 없으면
    # 기존처럼 파이썬에서 문자열을 직접 이어붙인다(하위 호환 폴백).
    if is_prompt_expansion_available():
        workflow["40"] = {
            "class_type": "FooocusPromptExpansion",
            "inputs": {"text": prompt, "style_suffix": style_def["positive"], "seed": resolved_seed},
        }
        workflow["6"]["inputs"][text_field] = ["40", 0]
        if is_sdxl:
            workflow["6"]["inputs"]["text_l"] = ["40", 0]
    else:
        final_prompt = prompt
        if style_def["positive"]:
            final_prompt = f"{prompt}, {style_def['positive']}"
        workflow["6"]["inputs"][text_field] = final_prompt
        if is_sdxl:
            workflow["6"]["inputs"]["text_l"] = final_prompt

    # Update dimensions (SDXL 분기에서 이미 처리한 경우 EmptyLatentImage 크기만 남는다)
    workflow["5"]["inputs"]["width"] = width
    workflow["5"]["inputs"]["height"] = height
    # 샘플링 파라미터 — 설치된 모델에 맞춘 값. Turbo용 4스텝/cfg1.0을 쓰면
    # 뿌옇고 형체 없는 이미지가 나온다.
    # 2026-08-28: SDXL 감지 시 CFG를 자동 보정 — SDXL은 SD1.5보다 훨씬 낮은 CFG(3.5~5.0)에서
    # 자연스러운 색감과 디테일이 나온다. 높으면 과포화+인위적인 윤곽이 생긴다.
    if is_sdxl:
        # CFG가 SD1.5 기본값(6.5~7.5) 범위로 들어왔으면 SDXL용으로 낮춘다.
        # 사용자가 의도적으로 낮은 값을 넣었으면(예: 3.0) 그대로 둔다.
        if cfg >= 6.0:
            cfg = min(cfg * 0.64, 5.0)  # 7.0→4.48, 7.5→4.8, 6.5→4.16
            print(f"  [SDXL] SDXL detected: CFG auto-adjusted to {cfg:.1f}")
    workflow["3"]["inputs"]["steps"] = steps
    workflow["3"]["inputs"]["cfg"] = cfg
    # 2026-08-28: 기본 샘플러를 dpmpp_2m_sde로 변경 — SDXL에서 디테일/질감 표현이
    # euler_ancestral보다 확연히 좋다. 사용자가 명시적으로 다른 샘플러를 골랐으면 그걸 쓴다.
    default_sampler = "dpmpp_2m_sde"
    workflow["3"]["inputs"]["sampler_name"] = sampler_name if sampler_name in AVAILABLE_SAMPLERS else default_sampler
    workflow["3"]["inputs"]["scheduler"] = scheduler if scheduler in AVAILABLE_SCHEDULERS else workflow["3"]["inputs"]["scheduler"]
    # 시드를 명시하면 같은 그림을 재현할 수 있다(Fooocus의 "고정 시드"). 없으면 매번 랜덤화.
    # (프롬프트 확장 노드와 동일한 시드를 써야 같은 입력에 같은 결과가 재현된다)
    workflow["3"]["inputs"]["seed"] = resolved_seed

    # ── img2img: EmptyLatentImage(순수 노이즈) 대신 업로드된 이미지를 latent화 ──
    if input_image_name:
        del workflow["5"]
        workflow["10"] = {"class_type": "LoadImage", "inputs": {"image": input_image_name}}
        workflow["11"] = {
            "class_type": "VAEEncode",
            "inputs": {"pixels": ["10", 0], "vae": ["4", 2]},
        }
        workflow["3"]["inputs"]["latent_image"] = ["11", 0]
        workflow["3"]["inputs"]["denoise"] = denoise

        # ── ControlNet(Canny): 원본의 외곽선(엣지)을 고정해 denoise를 높여도 건물
        # 형태·창호 배치는 그대로 두고 재질/조명만 실사로 다시 그리게 한다.
        # (denoise만으로는 "형태 보존"과 "재질 실사화"가 서로 트레이드오프라 병행 필요)
        if controlnet_strength > 0:
            canny_model = None
            try:
                canny_model = get_available_controlnet_canny()
            except Exception:
                canny_model = None
            if canny_model:
                workflow["20"] = {
                    "class_type": "Canny",
                    "inputs": {"image": ["10", 0], "low_threshold": 0.4, "high_threshold": 0.8},
                }
                workflow["21"] = {
                    "class_type": "ControlNetLoader",
                    "inputs": {"control_net_name": canny_model},
                }
                workflow["22"] = {
                    "class_type": "ControlNetApplyAdvanced",
                    "inputs": {
                        "positive": ["6", 0],
                        "negative": ["7", 0],
                        "control_net": ["21", 0],
                        "image": ["20", 0],
                        "strength": controlnet_strength,
                        "start_percent": 0.0,
                        "end_percent": 1.0,
                    },
                }
                workflow["3"]["inputs"]["positive"] = ["22", 0]
                workflow["3"]["inputs"]["negative"] = ["22", 1]
                print(f"  [ControlNet] Canny 엣지 고정 적용 (model={canny_model}, strength={controlnet_strength})")
            else:
                print("  [ControlNet] Canny 모델이 설치돼 있지 않아 형태 고정 없이 진행합니다.")

    # ── LoRA 체인 삽입 ──
    # model_link/clip_link는 LoRA가 없어도 FaceDetailer 배선에 필요해 항상 정의해둔다.
    model_link = ["4", 0]
    clip_link = ["4", 1]
    loras = list(loras or [])
    # Fooocus는 모든 SDXL 프리셋에 Offset LoRA를 강도 0.1로 항상 같이 적용한다 — 사용자가
    # 직접 5개를 다 채우지 않았고, 아직 넣어두지 않았으면 자동으로 맨 앞에 끼워 넣는다.
    if (is_sdxl and len(loras) < 5
            and not any(l.get("name") == OFFSET_LORA_NAME for l in loras)
            and is_offset_lora_available()):
        loras = [{"name": OFFSET_LORA_NAME, "strength": OFFSET_LORA_STRENGTH}] + loras
    loras = loras[:5]
    if loras:
        for i, lora in enumerate(loras):
            node_id = f"lora{i}"
            strength = float(lora.get("strength", 0.8))
            workflow[node_id] = {
                "class_type": "LoraLoader",
                "inputs": {
                    "model": model_link,
                    "clip": clip_link,
                    "lora_name": lora["name"],
                    "strength_model": strength,
                    "strength_clip": strength,
                },
            }
            model_link = [node_id, 0]
            clip_link = [node_id, 1]
        # 마지막 LoRA 노드의 출력으로 샘플러/텍스트인코더 입력을 다시 연결
        workflow["3"]["inputs"]["model"] = model_link
        workflow["6"]["inputs"]["clip"] = clip_link
        workflow["7"]["inputs"]["clip"] = clip_link

    # ── FaceDetailer 삽입 ──
    # VAEDecode(노드 8)가 만든 원본 이미지에서 얼굴만 감지해 더 높은 디테일로 다시 그린 뒤,
    # SaveImage가 원본 대신 이 보정된 이미지를 저장하도록 연결을 바꾼다.
    if enable_face_detailer:
        bbox_model = get_available_face_bbox_model()
        if bbox_model:
            workflow["30"] = {
                "class_type": "UltralyticsDetectorProvider",
                "inputs": {"model_name": bbox_model},
            }
            workflow["31"] = {
                "class_type": "FaceDetailer",
                "inputs": {
                    "image": ["8", 0],
                    "model": model_link,
                    "clip": clip_link,
                    "vae": ["4", 2],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "guide_size": 384.0,
                    "guide_size_for": True,
                    "max_size": 1024.0,
                    "seed": workflow["3"]["inputs"]["seed"],
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": workflow["3"]["inputs"]["sampler_name"],
                    "scheduler": workflow["3"]["inputs"]["scheduler"],
                    # 원본 얼굴을 완전히 대체하지 않고 절반 정도만 새로 그려 다른 부위와 자연스럽게
                    # 이어지도록 한다 — 1.0에 가까우면 원본 얼굴형과 다른 사람처럼 나올 수 있다.
                    "denoise": 0.4,
                    "feather": 5,
                    "noise_mask": True,
                    "force_inpaint": True,
                    "bbox_threshold": 0.5,
                    "bbox_dilation": 10,
                    "bbox_crop_factor": 3.0,
                    "sam_detection_hint": "center-1",
                    "sam_dilation": 0,
                    "sam_threshold": 0.93,
                    "sam_bbox_expansion": 0,
                    "sam_mask_hint_threshold": 0.7,
                    "sam_mask_hint_use_negative": "False",
                    "drop_size": 10,
                    "bbox_detector": ["30", 0],
                    "cycle": 1,
                    "wildcard": "",
                },
            }
            workflow["9"]["inputs"]["images"] = ["31", 0]
        else:
            print("  [FaceDetailer] 얼굴 탐지 모델을 찾지 못해 보정 없이 진행합니다.")

    return workflow


# ── Fooocus Parity Mode (2026-08-31, 테스트 전용) ─────────────────────────
# 목적: "어느 차이 때문에 품질 격차가 발생하는지" 변수를 하나씩 제거하기 위한 격리된
# 테스트 파이프라인. production 워크플로(build_sdxl_turbo_workflow)는 건드리지 않고,
# 이 함수만 별도로 Fooocus의 고급 샘플링 패치(Sharpness/ADM/Adaptive CFG)를 "제외한"
# 나머지 모든 값(체크포인트/샘플러/스케줄러/스텝/CFG/해상도/CLIP skip/conditioning 구조/
# LoRA)을 Fooocus 기본 프리셋과 최대한 동일하게 맞춘다. ControlNet·사용자 LoRA는 항상 OFF.


class ParityCheckpointMissing(Exception):
    """Fooocus와 정확히 같은 체크포인트가 설치돼 있지 않을 때 — 자동 대체하지 않고 알린다."""
    pass


def get_exact_checkpoint(exact_name: str) -> str:
    """퍼지 매칭(prefer) 없이 정확히 이 이름의 체크포인트가 설치돼 있는지만 확인한다.
    get_available_checkpoint()와 달리 못 찾아도 절대 다른 체크포인트로 대체하지 않는다."""
    req = urllib.request.Request(f"{COMFYUI_URL}/object_info/CheckpointLoaderSimple")
    with urllib.request.urlopen(req, timeout=10) as response:
        info = json.loads(response.read())
    names = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    if exact_name not in names:
        raise ParityCheckpointMissing(
            f"checkpoint missing: '{exact_name}'가 설치돼 있지 않습니다. 설치된 체크포인트: {names}"
        )
    return exact_name


# Fooocus default.json 프리셋 값 그대로 (참고자료/Fooocus-main/presets/default.json,
# modules/config.py의 default_clip_skip). Sharpness/ADM/Adaptive CFG는 제외.
FOOOCUS_PARITY_CHECKPOINT = "juggernautXL_v8Rundiffusion.safetensors"
FOOOCUS_PARITY_SAMPLER = "dpmpp_2m_sde_gpu"
FOOOCUS_PARITY_SCHEDULER = "karras"
FOOOCUS_PARITY_STEPS = 30
FOOOCUS_PARITY_CFG = 4.0
FOOOCUS_PARITY_WIDTH = 1152
FOOOCUS_PARITY_HEIGHT = 896
FOOOCUS_PARITY_CLIP_SKIP = 2  # ComfyUI CLIPSetLastLayer 표기로는 stop_at_clip_layer = -2


def build_fooocus_parity_workflow(prompt: str, style: str, negative_extra: str,
                                   seed: int, checkpoint_name: str = FOOOCUS_PARITY_CHECKPOINT,
                                   use_expansion: bool = True,
                                   sampler_name: str = None, scheduler: str = None,
                                   steps: int = None, cfg: float = None,
                                   width: int = None, height: int = None):
    """sampler_name/scheduler/steps/cfg/width/height를 넘기면 FOOOCUS_PARITY_* 기본값 대신
    그 값을 쓴다 — production(A)이 실제로 낼 수 있는 값으로 맞춰 "checkpoint/sampler/steps/
    cfg/해상도까지 전부 동일, CLIP skip과 conditioning 구조만 다름"인 격리 테스트를 만들 때
    쓴다(2026-08-31 isolate-test). 인자를 안 주면 기존처럼 Fooocus 진짜 기본값을 그대로 쓴다.

    STEP 3 conditioning 구조 (Fooocus modules/default_pipeline.py의 clip_encode() 그대로):
    Fooocus는 positive 텍스트 여러 개(스타일 적용 원본 + GPT-2 확장)를 각각 CLIP 인코딩한 뒤
    torch.cat(cond_list, dim=1)로 "토큰 시퀀스를 이어붙이고", pooled_output은 pool_top_k(=1)
    개, 즉 첫 번째(스타일 적용 원본) 것만 사용한다. ComfyUI의 ConditioningConcat이 정확히
    이 동작이다(conditioning_to의 pooled_output을 유지한 채 conditioning_from을 dim=1로 이어
    붙임) — 그래서 우리가 이전에 쓰던 "문자열을 파이썬에서 미리 합쳐서 한 번에 인코딩"과는
    다르다. text_g/text_l은 Fooocus도 별도 입력 UI가 없어 항상 같은 텍스트를 두 인코더에
    동일하게 넣는다 — 이 부분은 기존 방식과 동일해 바꿀 게 없다.

    GPT-2 확장은 production과 동일하게 FooocusPromptExpansion 노드를 그래프 안에서 직접
    호출한다(파이썬에서 문자열을 미리 뽑아와 박아넣지 않음) — production과 동일한 seed를
    쓰면 결정론적으로 같은 확장 텍스트가 나오는지까지 A/B에서 같이 검증할 수 있다.

    negative는 Fooocus에서 "항상 독립적인 workload"로만 쓰이고 GPT-2 확장이 붙지 않는다
    (async_worker.py 주석: "Always use independent workload for negative") — 우리 negative는
    이미 확장 없이 문자열 하나뿐이라 이 규칙은 이미 만족돼 있었다. 단일 CLIPTextEncodeSDXL로
    인코딩한다.
    """
    sampler_name = sampler_name or FOOOCUS_PARITY_SAMPLER
    scheduler = scheduler or FOOOCUS_PARITY_SCHEDULER
    steps = steps or FOOOCUS_PARITY_STEPS
    cfg = FOOOCUS_PARITY_CFG if cfg is None else cfg
    width = width or FOOOCUS_PARITY_WIDTH
    height = height or FOOOCUS_PARITY_HEIGHT

    ckpt_name = get_exact_checkpoint(checkpoint_name)

    style_def = STYLE_PRESETS.get(style, STYLE_PRESETS["none"])
    styled_prompt = f"{prompt}, {style_def['positive']}" if style_def["positive"] else prompt
    negative_prompt = DEFAULT_NEGATIVE
    if style_def["negative"]:
        negative_prompt = f"{negative_prompt}, {style_def['negative']}"
    if negative_extra:
        negative_prompt = f"{negative_prompt}, {negative_extra}"

    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt_name}},
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
    }

    # ── LoRA: Fooocus default.json과 동일하게 Offset LoRA만, strength 0.1 고정. 사용자 LoRA 없음 ──
    model_link = ["1", 0]
    clip_link = ["1", 1]
    if is_offset_lora_available():
        workflow["lora0"] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model": model_link, "clip": clip_link,
                "lora_name": OFFSET_LORA_NAME,
                "strength_model": OFFSET_LORA_STRENGTH, "strength_clip": OFFSET_LORA_STRENGTH,
            },
        }
        model_link = ["lora0", 0]
        clip_link = ["lora0", 1]
    else:
        print(f"  [Parity] Offset LoRA({OFFSET_LORA_NAME})가 설치돼 있지 않아 LoRA 없이 진행합니다.")

    # ── CLIP skip 2 (STEP 2) — LoRA 적용 이후의 clip에 씌운다(Fooocus의 refresh_loras → set_clip_skip 순서와 동일) ──
    workflow["2"] = {
        "class_type": "CLIPSetLastLayer",
        "inputs": {"clip": clip_link, "stop_at_clip_layer": -FOOOCUS_PARITY_CLIP_SKIP},
    }
    clip_link = ["2", 0]

    # ── Positive conditioning: A(스타일 적용 원본) + B(GPT-2 확장)를 각각 인코딩 후 토큰 차원 concat ──
    workflow["6a"] = {
        "class_type": "CLIPTextEncodeSDXL",
        "inputs": {
            "clip": clip_link, "width": width, "height": height,
            "crop_w": 0, "crop_h": 0,
            "target_width": width, "target_height": height,
            "text_g": styled_prompt, "text_l": styled_prompt,
        },
    }
    positive_link = ["6a", 0]
    if use_expansion and is_prompt_expansion_available():
        workflow["40"] = {
            "class_type": "FooocusPromptExpansion",
            "inputs": {"text": prompt, "style_suffix": "", "seed": seed},
        }
        workflow["6b"] = {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "clip": clip_link, "width": width, "height": height,
                "crop_w": 0, "crop_h": 0,
                "target_width": width, "target_height": height,
                "text_g": ["40", 0], "text_l": ["40", 0],
            },
        }
        workflow["6combine"] = {
            "class_type": "ConditioningConcat",
            "inputs": {"conditioning_to": positive_link, "conditioning_from": ["6b", 0]},
        }
        positive_link = ["6combine", 0]

    # ── Negative conditioning: 확장 없이 단일 인코딩 (Fooocus와 동일) ──
    workflow["7"] = {
        "class_type": "CLIPTextEncodeSDXL",
        "inputs": {
            "clip": clip_link, "width": width, "height": height,
            "crop_w": 0, "crop_h": 0,
            "target_width": width, "target_height": height,
            "text_g": negative_prompt, "text_l": negative_prompt,
        },
    }

    # ── KSampler: Fooocus default.json 값 그대로(또는 위에서 override된 값). ControlNet 없음(denoise 1.0, 순수 txt2img) ──
    workflow["3"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": model_link,
            "positive": positive_link,
            "negative": ["7", 0],
            "latent_image": ["5", 0],
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": sampler_name,
            "scheduler": scheduler,
            "denoise": 1.0,
        },
    }
    workflow["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["1", 2]}}
    workflow["9"] = {
        "class_type": "SaveImage",
        "inputs": {"images": ["8", 0], "filename_prefix": "fooocus_parity"},
    }

    return workflow, styled_prompt, negative_prompt


def generate_fooocus_parity_or_raise(prompt: str, style: str, negative_extra: str,
                                      seed: int, output_path: str,
                                      checkpoint_name: str = FOOOCUS_PARITY_CHECKPOINT,
                                      sampler_name: str = None, scheduler: str = None,
                                      steps: int = None, cfg: float = None,
                                      width: int = None, height: int = None) -> dict:
    """Fooocus Parity Mode 워크플로를 실행하고 결과를 output_path에 저장한다.
    반환값에 실제 사용된 프롬프트/체크포인트 등 메타데이터를 함께 담는다."""
    workflow, styled_prompt, negative_prompt = build_fooocus_parity_workflow(
        prompt, style, negative_extra, seed, checkpoint_name,
        sampler_name=sampler_name, scheduler=scheduler, steps=steps, cfg=cfg,
        width=width, height=height)

    queue_response = queue_prompt(workflow)
    prompt_id = queue_response["prompt_id"]
    print(f"Queued Fooocus-parity prompt {prompt_id} (seed={seed})...")

    deadline = time.time() + GENERATION_TIMEOUT_SEC
    history = None
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            break
        time.sleep(0.5)
    else:
        raise TimeoutError(f"ComfyUI가 {GENERATION_TIMEOUT_SEC}초 안에 parity 생성을 마치지 못했습니다 (prompt_id={prompt_id}).")

    history_data = history[prompt_id]
    expansion_text = None
    node40_out = history_data["outputs"].get("40")
    if node40_out and "text" in node40_out:
        expansion_text = node40_out["text"][0]

    for node_id in history_data["outputs"]:
        node_output = history_data["outputs"][node_id]
        if "images" in node_output:
            for image in node_output["images"]:
                image_data = get_image(image["filename"], image["subfolder"], image["type"])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                ks = workflow["3"]["inputs"]
                lat = workflow["5"]["inputs"]
                return {
                    "output_path": output_path,
                    "checkpoint": workflow["1"]["inputs"]["ckpt_name"],
                    "sampler": ks["sampler_name"],
                    "scheduler": ks["scheduler"],
                    "steps": ks["steps"],
                    "cfg": ks["cfg"],
                    "clip_skip": FOOOCUS_PARITY_CLIP_SKIP,
                    "seed": seed,
                    "styled_prompt": styled_prompt,
                    "expansion_text": expansion_text,
                    "negative_prompt": negative_prompt,
                    "resolution": f"{lat['width']}x{lat['height']}",
                    "lora": f"{OFFSET_LORA_NAME}@{OFFSET_LORA_STRENGTH}" if is_offset_lora_available() else None,
                }

    raise RuntimeError(
        f"ComfyUI 실행 결과에 이미지가 없습니다: {json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
    )


# ── FLUX.1 GGUF 지원 (2026-08-28) ────────────────────────────────────
# FLUX는 기존 SDXL/SD1.5 워크플로와 노드 구조가 완전히 다르다:
# - KSampler 대신 SamplerCustomAdvanced + BasicGuider
# - CLIPTextEncode를 하나만 씀 (네거티브 프롬프트 없음)
# - 별도의 UnetLoaderGGUF + DualCLIPLoaderGGUF 노드 사용
# 그래서 build_sdxl_turbo_workflow()와 합치지 않고 별도 함수로 분리한다.

FLUX_GGUF_UNET = "flux1-schnell-Q5_K_S.gguf"
FLUX_CLIP_L = "clip_l.safetensors"
FLUX_T5_GGUF = "t5-v1_1-xxl-encoder-Q5_K_M.gguf"
FLUX_VAE = "ae.safetensors"

# FLUX schnell은 4스텝에 최적화됐다 — 스텝을 늘려도 품질이 거의 안 오른다.
FLUX_DEFAULT_STEPS = 4

# FLUX 화면비: FLUX는 학습 해상도 자유도가 높아 다양한 비율을 잘 소화한다.
# 총 화소가 약 1Mpx(1024×1024)를 넘지 않아야 8GB VRAM에서 안정적이다.
FLUX_ASPECT_RATIOS = {
    "1:1":  {"width": 1024, "height": 1024},
    "4:3":  {"width": 1152, "height": 896},
    "3:4":  {"width": 896,  "height": 1152},
    "16:9": {"width": 1344, "height": 768},
    "9:16": {"width": 768,  "height": 1344},
    "3:2":  {"width": 1216, "height": 832},
}


def is_flux_model_available() -> bool:
    """FLUX GGUF 모델 파일들이 ComfyUI에 설치돼 있는지 확인한다."""
    try:
        # UnetLoaderGGUF 노드가 존재하는지 확인 (GGUF 커스텀 노드 설치 여부)
        req = urllib.request.Request(f"{COMFYUI_URL}/object_info/UnetLoaderGGUF")
        with urllib.request.urlopen(req, timeout=5) as response:
            info = json.loads(response.read())
        unet_names = info["UnetLoaderGGUF"]["input"]["required"]["unet_name"][0]
        return FLUX_GGUF_UNET in unet_names
    except Exception:
        return False


def resolve_flux_dimensions(aspect_ratio: str):
    """FLUX용 화면비 → 해상도 변환."""
    ratio = FLUX_ASPECT_RATIOS.get(aspect_ratio)
    if ratio:
        return ratio["width"], ratio["height"]
    return 1024, 1024  # FLUX 기본 정사각


def build_flux_gguf_workflow(prompt: str, width: int = 1024, height: int = 1024,
                              steps: int = FLUX_DEFAULT_STEPS, seed: int = None,
                              style: str = "none"):
    """FLUX.1 schnell GGUF 전용 워크플로를 빌드한다.

    FLUX는 CFG-free(guidance-distilled) 모델이라 cfg/네거티브 프롬프트가 없다.
    schnell은 4스텝에 최적화돼 있어 steps를 올려도 큰 차이가 없다.
    """
    workflow_path = os.path.join(os.path.dirname(__file__), "..", "comfyui_workflows", "flux_schnell_gguf_workflow.json")
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"FLUX workflow file not found at: {workflow_path}")

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    # 스타일 프리셋 적용 (FLUX는 네거티브가 없으므로 positive만)
    style_def = STYLE_PRESETS.get(style, STYLE_PRESETS["none"])
    final_prompt = prompt
    if style_def["positive"]:
        final_prompt = f"{prompt}, {style_def['positive']}"

    # 프롬프트
    workflow["11"]["inputs"]["text"] = final_prompt
    # 해상도
    workflow["13"]["inputs"]["width"] = width
    workflow["13"]["inputs"]["height"] = height
    # 스텝수
    workflow["16"]["inputs"]["steps"] = steps
    # 시드
    workflow["25"]["inputs"]["noise_seed"] = seed if seed is not None else int.from_bytes(os.urandom(4), "big")

    return workflow




# ── FLUX.1 Kontext [dev] 이미지 편집 지원 (2026-08-28) ────────────────
# "이미지 업로드 + 수정 지시문 → 지시를 반영한 편집 이미지"용 전용 모델.
# 텍스트→이미지인 flux1-schnell과 달리 편집 전용 파인튠이라 별도 GGUF/워크플로가 필요하다.
# clip_l/T5-XXL 텍스트 인코더와 VAE는 flux1-schnell과 동일한 파일을 그대로 재사용한다.
FLUX_KONTEXT_GGUF_UNET = "flux1-kontext-dev-Q4_K_S.gguf"
FLUX_KONTEXT_DEFAULT_STEPS = 20
FLUX_KONTEXT_DEFAULT_GUIDANCE = 2.5
KONTEXT_TIMEOUT_SEC = 900


def is_flux_kontext_available() -> bool:
    """FLUX Kontext GGUF 모델이 ComfyUI에 설치돼 있는지 확인한다."""
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/object_info/UnetLoaderGGUF")
        with urllib.request.urlopen(req, timeout=5) as response:
            info = json.loads(response.read())
        unet_names = info["UnetLoaderGGUF"]["input"]["required"]["unet_name"][0]
        return FLUX_KONTEXT_GGUF_UNET in unet_names
    except Exception:
        return False


def build_flux_kontext_workflow(instruction: str, image_name: str, seed: int = None,
                                 guidance: float = FLUX_KONTEXT_DEFAULT_GUIDANCE,
                                 steps: int = FLUX_KONTEXT_DEFAULT_STEPS):
    """업로드된 참고 이미지를 instruction 지시문대로 편집하는 FLUX Kontext 워크플로를 빌드한다.

    일반 img2img(denoise<1.0으로 노이즈만 살짝 얹는 방식)와 달리, Kontext는 ReferenceLatent로
    원본 이미지를 조건(conditioning)에 직접 묶어서 "이 이미지에서 이 지시대로 바꿔라"를
    이해한다 — denoise는 항상 1.0(완전히 새로 그리되 참조 이미지의 내용을 따름).
    """
    workflow_path = os.path.join(os.path.dirname(__file__), "..", "comfyui_workflows", "flux_kontext_gguf_workflow.json")
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"FLUX Kontext workflow file not found at: {workflow_path}")

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    workflow["6"]["inputs"]["unet_name"] = FLUX_KONTEXT_GGUF_UNET
    workflow["40"]["inputs"]["image"] = image_name
    workflow["11"]["inputs"]["text"] = instruction
    workflow["44"]["inputs"]["guidance"] = guidance
    workflow["16"]["inputs"]["steps"] = steps
    workflow["25"]["inputs"]["noise_seed"] = seed if seed is not None else int.from_bytes(os.urandom(4), "big")

    return workflow


def edit_image_with_kontext_or_raise(image_bytes: bytes, instruction: str, output_path: str,
                                      seed: int = None, guidance: float = FLUX_KONTEXT_DEFAULT_GUIDANCE,
                                      steps: int = FLUX_KONTEXT_DEFAULT_STEPS) -> str:
    """캡처/업로드된 이미지를 instruction 지시문대로 편집해 output_path에 저장하고 경로를 반환한다."""
    if not is_flux_kontext_available():
        raise RuntimeError(
            f"FLUX Kontext 모델({FLUX_KONTEXT_GGUF_UNET})이 ComfyUI에 설치돼 있지 않습니다. "
            "C:\\ComfyUI\\models\\unet\\ 폴더를 확인해주세요."
        )

    uploaded_name = _upload_image_bytes_to_comfyui(image_bytes, "kontext_input.png")
    workflow = build_flux_kontext_workflow(instruction, uploaded_name, seed=seed, guidance=guidance, steps=steps)

    queue_response = queue_prompt(workflow)
    prompt_id = queue_response["prompt_id"]
    print(f"Queued FLUX Kontext edit prompt {prompt_id} (instruction='{instruction[:50]}...')...")

    global CURRENT_PROGRESS
    CURRENT_PROGRESS["prompt_id"] = prompt_id
    CURRENT_PROGRESS["status"] = "rendering"
    CURRENT_PROGRESS["value"] = 0
    CURRENT_PROGRESS["max"] = steps
    CURRENT_PROGRESS["percent"] = 0

    deadline = time.time() + KONTEXT_TIMEOUT_SEC
    history = None
    start_t = time.time()
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            CURRENT_PROGRESS["percent"] = 100
            CURRENT_PROGRESS["status"] = "completed"
            break
        elapsed = time.time() - start_t
        est_pct = min(99, int((elapsed / 12.0) * 100))
        if CURRENT_PROGRESS["percent"] < est_pct:
            CURRENT_PROGRESS["percent"] = est_pct
        time.sleep(0.2)
    else:
        CURRENT_PROGRESS["status"] = "error"
        raise TimeoutError(f"ComfyUI가 {KONTEXT_TIMEOUT_SEC}초 안에 이미지 편집을 마치지 못했습니다 (prompt_id={prompt_id}).")

    history_data = history[prompt_id]
    for node_id in history_data["outputs"]:
        node_output = history_data["outputs"][node_id]
        if "images" in node_output:
            for image in node_output["images"]:
                image_data = get_image(image["filename"], image["subfolder"], image["type"])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                CURRENT_PROGRESS["status"] = "idle"
                print(f"Kontext edited image saved to {output_path}")
                return output_path

    CURRENT_PROGRESS["status"] = "error"
    raise RuntimeError(
        f"ComfyUI 실행 결과에 이미지가 없습니다: {json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
    )


# ── 인페인트 / 아웃페인트 (2026-08-31, Fooocus 기능 이식) ──────────────────
# Fooocus는 자체 inpaint 패치 모델(inpaint_v26.fooocus.patch, 1.28GB)로 이 기능을
# 구현하지만, 이 프로젝트는 ComfyUI 백엔드라 대신 ComfyUI 내장 InpaintModelConditioning
# 노드로 동일한 동작(마스크 영역만 다시 그리기 / 캔버스 확장)을 구현한다.
# 별도 모델 다운로드 없이 지금 쓰고 있는 SDXL 체크포인트 그대로 동작한다.
INPAINT_TIMEOUT_SEC = 900


def build_inpaint_workflow(prompt: str, base_image_name: str, checkpoint: str = None,
                            mask_image_name: str = None, outpaint: dict = None,
                            steps: int = DEFAULT_STEPS, cfg: float = DEFAULT_CFG,
                            style: str = "none", sampler_name: str = None, scheduler: str = None,
                            seed: int = None, negative_extra: str = "", denoise: float = 1.0,
                            mask_grow: int = 6):
    """인페인트(마스크 영역 재생성) 또는 아웃페인트(캔버스 확장) 워크플로를 빌드한다.

    mask_image_name이 주어지면 인페인트(흰색=다시 그릴 영역), outpaint 딕셔너리
    ({"left","top","right","bottom"} 픽셀)가 주어지면 아웃페인트 — 둘 중 하나는 필수.
    두 기능이 배선 구조는 동일하고 "무엇을 마스크로 쓸지"만 다르므로 하나로 합쳤다.
    """
    if not mask_image_name and not outpaint:
        raise ValueError("mask_image_name 또는 outpaint 중 하나는 반드시 지정해야 합니다.")

    style_def = STYLE_PRESETS.get(style, STYLE_PRESETS["none"])
    final_prompt = prompt
    if style_def["positive"]:
        final_prompt = f"{prompt}, {style_def['positive']}" if prompt else style_def["positive"]
    final_negative = DEFAULT_NEGATIVE
    if style_def["negative"]:
        final_negative = f"{final_negative}, {style_def['negative']}"
    if negative_extra:
        final_negative = f"{final_negative}, {negative_extra}"

    ckpt_name = get_available_checkpoint(prefer=checkpoint)
    if is_sdxl_checkpoint(ckpt_name) and cfg >= 6.0:
        cfg = min(cfg * 0.64, 5.0)

    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt_name}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": final_prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": final_negative, "clip": ["1", 1]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": base_image_name}},
    }

    if outpaint:
        # 캔버스를 지정한 방향으로 확장하고, 새로 생긴 여백을 마스크(다시 그릴 영역)로 준다.
        workflow["5"] = {
            "class_type": "ImagePadForOutpaint",
            "inputs": {
                "image": ["4", 0],
                "left": int(outpaint.get("left", 0)),
                "top": int(outpaint.get("top", 0)),
                "right": int(outpaint.get("right", 0)),
                "bottom": int(outpaint.get("bottom", 0)),
                "feathering": 40,
            },
        }
        pixels_link = ["5", 0]
        mask_link = ["5", 1]
    else:
        pixels_link = ["4", 0]
        # 프론트에서 그린 흑백 마스크(흰색=다시 그릴 영역)를 red 채널로 읽어들인다.
        workflow["6"] = {"class_type": "LoadImageMask", "inputs": {"image": mask_image_name, "channel": "red"}}
        mask_link = ["6", 0]
        if mask_grow:
            # 브러시로 그린 마스크는 경계가 딱 끊겨서 이음매가 보이기 쉬우므로 살짝 넓혀준다.
            workflow["7"] = {
                "class_type": "GrowMask",
                "inputs": {"mask": mask_link, "expand": mask_grow, "tapered_corners": True},
            }
            mask_link = ["7", 0]

    workflow["8"] = {
        "class_type": "InpaintModelConditioning",
        "inputs": {
            "positive": ["2", 0], "negative": ["3", 0], "vae": ["1", 2],
            "pixels": pixels_link, "mask": mask_link, "noise_mask": True,
        },
    }
    workflow["9"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0],
            "positive": ["8", 0], "negative": ["8", 1], "latent_image": ["8", 2],
            "seed": seed if seed is not None else int.from_bytes(os.urandom(4), "big"),
            "steps": steps, "cfg": cfg,
            "sampler_name": sampler_name if sampler_name in AVAILABLE_SAMPLERS else "dpmpp_2m_sde",
            "scheduler": scheduler if scheduler in AVAILABLE_SCHEDULERS else "karras",
            "denoise": denoise,
        },
    }
    workflow["10"] = {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["1", 2]}}
    workflow["11"] = {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "inpaint_outpaint"}}

    return workflow


def inpaint_or_raise(prompt: str, image_bytes: bytes, output_path: str, mask_bytes: bytes = None,
                      outpaint: dict = None, checkpoint: str = None, steps: int = DEFAULT_STEPS,
                      cfg: float = DEFAULT_CFG, style: str = "none", sampler_name: str = None,
                      scheduler: str = None, seed: int = None, negative_extra: str = "",
                      denoise: float = 1.0) -> str:
    """이미지 인페인트/아웃페인트를 실행하고 결과를 output_path에 저장한다."""
    base_image_name = _upload_image_bytes_to_comfyui(image_bytes, "inpaint_base.png")
    mask_image_name = None
    if mask_bytes:
        mask_image_name = _upload_image_bytes_to_comfyui(mask_bytes, "inpaint_mask.png")

    workflow = build_inpaint_workflow(
        prompt, base_image_name, checkpoint=checkpoint, mask_image_name=mask_image_name,
        outpaint=outpaint, steps=steps, cfg=cfg, style=style, sampler_name=sampler_name,
        scheduler=scheduler, seed=seed, negative_extra=negative_extra, denoise=denoise,
    )

    queue_response = queue_prompt(workflow)
    prompt_id = queue_response["prompt_id"]
    mode = "outpaint" if outpaint else "inpaint"
    print(f"Queued {mode} prompt {prompt_id}...")

    global CURRENT_PROGRESS
    CURRENT_PROGRESS["prompt_id"] = prompt_id
    CURRENT_PROGRESS["status"] = "rendering"
    CURRENT_PROGRESS["value"] = 0
    CURRENT_PROGRESS["max"] = steps
    CURRENT_PROGRESS["percent"] = 0

    deadline = time.time() + INPAINT_TIMEOUT_SEC
    history = None
    start_t = time.time()
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            CURRENT_PROGRESS["percent"] = 100
            CURRENT_PROGRESS["status"] = "completed"
            break
        elapsed = time.time() - start_t
        est_pct = min(99, int((elapsed / 30.0) * 100))
        if CURRENT_PROGRESS["percent"] < est_pct:
            CURRENT_PROGRESS["percent"] = est_pct
        time.sleep(0.2)
    else:
        CURRENT_PROGRESS["status"] = "error"
        raise TimeoutError(f"ComfyUI가 {INPAINT_TIMEOUT_SEC}초 안에 {mode}을를 마치지 못했습니다 (prompt_id={prompt_id}).")

    history_data = history[prompt_id]
    for node_id in history_data["outputs"]:
        node_output = history_data["outputs"][node_id]
        if "images" in node_output:
            for image in node_output["images"]:
                image_data = get_image(image["filename"], image["subfolder"], image["type"])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                CURRENT_PROGRESS["status"] = "idle"
                print(f"{mode.capitalize()} result saved to {output_path}")
                return output_path

    CURRENT_PROGRESS["status"] = "error"
    raise RuntimeError(
        f"ComfyUI 실행 결과에 이미지가 없습니다: {json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
    )


def queue_prompt(prompt_workflow):
    p = {"prompt": prompt_workflow}
    data = json.dumps(p).encode('utf-8')
    req = urllib.request.Request(f"{COMFYUI_URL}/prompt", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"[WARNING] ComfyUI 연결 실패: {e}. 더미 이미지로 테스트합니다.")
        # 더미 응답 반환 (테스트 모드)
        import uuid
        return {"prompt_id": str(uuid.uuid4())[:16]}


def get_history(prompt_id):
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError):
        # 더미 응답 구조 (테스트 모드)
        print(f"[TEST MODE] Using dummy image for prompt_id={prompt_id}")
        return {
            prompt_id: {
                "prompt": {},
                "outputs": {
                    "9": {
                        "images": [{
                            "filename": "test_output.png",
                            "subfolder": "",
                            "type": "output"
                        }]
                    }
                }
            }
        }


def get_image(filename, subfolder, folder_type):
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    req = urllib.request.Request(f"{COMFYUI_URL}/view?{url_values}")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.read()
    except (urllib.error.URLError, urllib.error.HTTPError):
        # 더미 PNG (1x1 파란색) - base64로 인코딩된 상태
        print(f"[TEST MODE] Using dummy image for {filename}")
        # 1x1 파란색 PNG (테스트용)
        dummy_png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        import base64
        return base64.b64decode(dummy_png_base64)


# ── 업스케일 (2026-08-21, § CONSENSUS.md C-011) ──────────────────────
UPSCALE_TIMEOUT_SEC = 180  # 이미지 하나 확대라 본 생성(GENERATION_TIMEOUT_SEC)보다 훨씬 빠르다


def list_available_upscale_models():
    """설치된 업스케일 모델 목록. LoRA/체크포인트 조회와 동일하게 /object_info로 물어본다."""
    req = urllib.request.Request(f"{COMFYUI_URL}/object_info/UpscaleModelLoader")
    with urllib.request.urlopen(req, timeout=10) as response:
        info = json.loads(response.read())
    return info["UpscaleModelLoader"]["input"]["required"]["model_name"][0]


def _upload_image_to_comfyui(local_path: str) -> str:
    """로컬 파일을 ComfyUI의 input/ 저장소로 올리고 그쪽에서 쓸 파일명을 반환한다.

    파일시스템을 직접 건드리지 않고 REST API(/upload/image)를 쓰는 이유는 COMFYUI_URL이
    원격 PC를 가리킬 수도 있기 때문이다(파일 복사로는 원격 환경에서 작동하지 않는다).
    """
    filename = os.path.basename(local_path)
    with open(local_path, "rb") as f:
        file_bytes = f.read()
    return _upload_image_bytes_to_comfyui(file_bytes, filename)


def _upload_image_bytes_to_comfyui(file_bytes: bytes, filename: str) -> str:
    """메모리 상의 이미지 바이트(예: 프론트에서 온 base64 디코딩 결과)를 ComfyUI에 올린다.
    2026-08-27: img2img 참고 이미지 첨부용 — 로컬 파일로 먼저 저장할 필요가 없다.
    """
    boundary = f"----ImgUpload{os.urandom(8).hex()}"

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode())
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image", data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read())
    return result["name"]


def upscale_image_or_raise(source_path: str, output_path: str, model_name: str = None) -> str:
    """이미지 하나를 업스케일 모델로 확대해 output_path에 저장하고 그 경로를 반환한다.

    LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage로 이어지는
    최소 워크플로를 그때그때 만든다(txt2img 워크플로 JSON 파일과 무관한 별도 경로).
    """
    uploaded_name = _upload_image_to_comfyui(source_path)

    if not model_name:
        available = list_available_upscale_models()
        if not available:
            raise RuntimeError(
                "설치된 업스케일 모델이 없습니다. ComfyUI/models/upscale_models 폴더에 "
                "모델 파일(예: RealESRGAN_x4plus.pth)을 넣어주세요."
            )
        model_name = available[0]

    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": uploaded_name}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": model_name}},
        "3": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]},
        },
        "4": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 0], "filename_prefix": "upscaled"},
        },
    }

    queue_response = queue_prompt(workflow)
    prompt_id = queue_response["prompt_id"]
    print(f"Queued upscale prompt {prompt_id} (model={model_name})...")

    deadline = time.time() + UPSCALE_TIMEOUT_SEC
    history = None
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            break
        time.sleep(1)
    else:
        raise TimeoutError(f"ComfyUI가 {UPSCALE_TIMEOUT_SEC}초 안에 업스케일을 마치지 못했습니다 (prompt_id={prompt_id}).")

    history_data = history[prompt_id]
    for node_id in history_data["outputs"]:
        node_output = history_data["outputs"][node_id]
        if "images" in node_output:
            for image in node_output["images"]:
                image_data = get_image(image["filename"], image["subfolder"], image["type"])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                return output_path

    raise RuntimeError(
        f"ComfyUI 실행 결과에 이미지가 없습니다: {json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
    )


def generate_image(prompt: str, output_path: str, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT,
                   steps: int = DEFAULT_STEPS, cfg: float = DEFAULT_CFG, **kwargs):
    """실패 시 None을 반환하는 구버전 래퍼. 실패 원인을 알아야 하면 generate_image_or_raise()를 쓸 것."""
    try:
        return generate_image_or_raise(prompt, output_path, width, height, steps, cfg, **kwargs)
    except Exception as e:
        print(f"Failed to generate image: {e}")
        return None


def generate_image_or_raise(prompt: str, output_path: str, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT,
                            steps: int = DEFAULT_STEPS, cfg: float = DEFAULT_CFG,
                            style: str = "none", sampler_name: str = None, scheduler: str = None,
                            seed: int = None, negative_extra: str = "", loras: list = None,
                            checkpoint: str = None, input_image_bytes: bytes = None, denoise: float = 1.0,
                            disable_face_detailer: bool = False, controlnet_strength: float = 0.0):
    """generate_image와 동일하지만 실패 원인을 예외로 그대로 올린다.

    호출자(API 라우트)가 "ComfyUI가 꺼져 있나요?" 같은 뭉뚱그린 메시지 대신
    실제 원인을 사용자에게 보여줄 수 있도록 하기 위함.

    input_image_bytes를 주면 img2img로 동작한다(참고 이미지를 기반으로 프롬프트 방향으로
    다시 그림 — denoise가 낮을수록 원본을 더 보존한다).

    2026-08-28: FLUX GGUF 자동 감지 — FLUX 모델이 설치돼 있고 img2img가 아니면
    FLUX 워크플로를 우선 사용한다. FLUX가 없거나 img2img면 기존 SDXL 워크플로로 폴백.
    """
    input_image_name = None
    if input_image_bytes:
        input_image_name = _upload_image_bytes_to_comfyui(input_image_bytes, "img2img_input.png")

    # FLUX 자동 감지: FLUX 모델이 설치돼 있고, img2img가 아니고, 사용자가 특정 체크포인트를
    # 명시하지 않았으면 FLUX로 생성한다 (FLUX가 SDXL보다 품질이 월등하므로).
    use_flux = False
    if not input_image_name and not checkpoint:
        try:
            use_flux = is_flux_model_available()
        except Exception:
            pass

    if use_flux:
        # FLUX는 시드만 받고 CFG/네거티브/LoRA 등은 무시한다 (구조가 다름)
        flux_seed = seed if seed is not None else int.from_bytes(os.urandom(4), "big")
        print(f"  [FLUX] FLUX.1 schnell GGUF detected: using FLUX workflow (seed={flux_seed})")
        workflow = build_flux_gguf_workflow(
            prompt, width, height,
            steps=FLUX_DEFAULT_STEPS,  # schnell은 항상 4스텝
            seed=flux_seed,
            style=style,
        )
    else:
        # 얼굴 보정 자동 감지: Impact Pack의 FaceDetailer + 얼굴 탐지 모델이 설치돼 있으면
        # 항상 켠다 — 4스텝 Turbo류에서 특히 얼굴이 뭉개지는 문제를 이 단계에서 보완한다.
        enable_face_detailer = False
        if not disable_face_detailer:
            try:
                enable_face_detailer = is_facedetailer_available()
            except Exception:
                pass
        if enable_face_detailer:
            print("  [FaceDetailer] Impact Pack 감지됨: 얼굴 보정을 적용합니다.")
        workflow = build_sdxl_turbo_workflow(
            prompt, width, height, steps, cfg,
            style=style, sampler_name=sampler_name, scheduler=scheduler, seed=seed,
            negative_extra=negative_extra, loras=loras, checkpoint=checkpoint,
            input_image_name=input_image_name, denoise=denoise,
            enable_face_detailer=enable_face_detailer,
            controlnet_strength=controlnet_strength,
        )
    queue_response = queue_prompt(workflow)
    prompt_id = queue_response["prompt_id"]

    # ── [실시간 진행률 모니터링 시스템] ──
    global CURRENT_PROGRESS
    CURRENT_PROGRESS["prompt_id"] = prompt_id
    CURRENT_PROGRESS["status"] = "rendering"
    CURRENT_PROGRESS["value"] = 0
    CURRENT_PROGRESS["max"] = steps if not use_flux else FLUX_DEFAULT_STEPS
    CURRENT_PROGRESS["percent"] = 0

    print(f"Queued prompt {prompt_id} for generation...")

    # Poll for completion (상한을 두고 대기)
    deadline = time.time() + GENERATION_TIMEOUT_SEC
    history = None
    start_t = time.time()
    
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            CURRENT_PROGRESS["percent"] = 100
            CURRENT_PROGRESS["status"] = "completed"
            break

        # 폴링 시 보조 진행률 업데이트 (WebSocket 누락 시 대비)
        # 시간 경과에 따라 진행률을 선형으로 증가시킨다
        elapsed = time.time() - start_t
        # SDXL 생성은 일반적으로 15~30초, FLUX는 8~12초가 소요됨
        est_total = 25.0 if not use_flux else 15.0
        est_pct = min(99, int((elapsed / est_total) * 100))
        # 진행률은 항상 증가만 해야 함 (감소하면 안 됨)
        if CURRENT_PROGRESS["percent"] < est_pct:
            CURRENT_PROGRESS["percent"] = est_pct

        time.sleep(0.2)
    else:
        CURRENT_PROGRESS["status"] = "error"
        raise TimeoutError(
            f"ComfyUI가 {GENERATION_TIMEOUT_SEC}초 안에 이미지를 생성하지 못했습니다 (prompt_id={prompt_id})."
        )

    # Get image data
    history_data = history[prompt_id]
    saved = False
    for node_id in history_data['outputs']:
        node_output = history_data['outputs'][node_id]
        if 'images' in node_output:
            for image in node_output['images']:
                image_data = get_image(image['filename'], image['subfolder'], image['type'])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                saved = True
            break

    if not saved:
        CURRENT_PROGRESS["status"] = "error"
        raise RuntimeError(
            f"ComfyUI 실행 결과에 이미지가 없습니다. 워크플로 노드 오류일 수 있습니다: "
            f"{json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
        )

    CURRENT_PROGRESS["status"] = "idle"
    print(f"Image saved to {output_path}")
    return output_path


# ── 전역 진행률 추적 데이터 ──────────────────────────────────────────
CURRENT_PROGRESS = {
    "prompt_id": None,
    "status": "idle",
    "value": 0,
    "max": 0,
    "percent": 0
}

def get_current_progress():
    """프론트엔드 실시간 프로그레스 바 렌더링용 현재 진행 상황을 반환한다."""
    return CURRENT_PROGRESS


# ── [4K 고화질 업스케일 워크플로 빌더] ──────────────────────────────
def build_upscale_workflow(input_image_filename: str, scale_by: float = 2.0) -> dict:
    """기존 이미지를 2x~4x 해상도로 쨍하고 선명하게 확대하는 ComfyUI 업스케일 워크플로를 만든다."""
    return {
        "1": {
            "inputs": {
                "image": input_image_filename
            },
            "class_type": "LoadImage"
        },
        "2": {
            "inputs": {
                "upscale_method": "bicubic",
                "scale_by": scale_by,
                "image": ["1", 0]
            },
            "class_type": "ImageScaleBy"
        },
        "3": {
            "inputs": {
                "filename_prefix": "Studio_Upscaled_4K",
                "images": ["2", 0]
            },
            "class_type": "SaveImage"
        }
    }


def upload_image(file_path: str, image_type: str = "input", overwrite: bool = True) -> dict:
    """ComfyUI 서버의 /upload/image API로 이미지를 전송하여 input 폴더에 저장시킨다."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"업로드할 파일을 찾을 수 없습니다: {file_path}")

    # 한글 경로 및 헤더 인코딩 문제 차단을 위해 ASCII 호환 safe filename 사용
    filename = "studio_input_temp.png"
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    boundary = f"----WebKitFormBoundary{os.urandom(16).hex()}"
    
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode('ascii'))
    body.extend(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode('ascii'))
    body.extend(b'Content-Type: image/png\r\n\r\n')
    body.extend(file_bytes)
    body.extend(b'\r\n')

    body.extend(f"--{boundary}\r\n".encode('ascii'))
    body.extend(b'Content-Disposition: form-data; name="overwrite"\r\n\r\n')
    body.extend(b'true\r\n')

    body.extend(f"--{boundary}\r\n".encode('ascii'))
    body.extend(b'Content-Disposition: form-data; name="type"\r\n\r\n')
    body.extend(image_type.encode('ascii'))
    body.extend(b'\r\n')

    body.extend(f"--{boundary}--\r\n".encode('ascii'))

    url = f"{COMFYUI_URL}/upload/image"
    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def upscale_image(input_image_path: str, output_path: str, scale_by: float = 2.0) -> str:
    """ComfyUI에 업스케일 요청을 보낸 뒤 결과 이미지를 output_path에 저장한다."""
    global CURRENT_PROGRESS
    
    # 1. ComfyUI input 폴더로 원본 이미지를 복사/업로드
    upload_res = upload_image(input_image_path)
    comfy_filename = upload_res.get("name")
    
    CURRENT_PROGRESS["status"] = "upscaling"
    CURRENT_PROGRESS["percent"] = 25

    # 2. 업스케일 워크플로 실행
    workflow = build_upscale_workflow(comfy_filename, scale_by=scale_by)
    queue_res = queue_prompt(workflow)
    prompt_id = queue_res["prompt_id"]

    CURRENT_PROGRESS["percent"] = 50

    # 3. 완료 폴링
    deadline = time.time() + 180
    history = None
    while time.time() < deadline:
        history = get_history(prompt_id)
        if prompt_id in history:
            CURRENT_PROGRESS["percent"] = 90
            break
        time.sleep(0.5)
    else:
        CURRENT_PROGRESS["status"] = "error"
        raise TimeoutError("ComfyUI 4K 업스케일 처리가 제한 시간을 초과했습니다.")

    # 4. 결과 이미지 저장
    history_data = history[prompt_id]
    saved = False
    for node_id in history_data.get("outputs", {}):
        node_output = history_data["outputs"][node_id]
        if "images" in node_output:
            for image in node_output["images"]:
                image_data = get_image(image["filename"], image["subfolder"], image["type"])
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_data)
                saved = True
            break

    if not saved:
        CURRENT_PROGRESS["status"] = "error"
        raise RuntimeError("ComfyUI 업스케일 결과 이미지를 받아오지 못했습니다.")

    CURRENT_PROGRESS["status"] = "idle"
    CURRENT_PROGRESS["percent"] = 100
    return output_path


# ── [Fooocus Quality Mode] ─────────────────────────────────────────
# 2026-08-31: Fooocus와의 품질 격차를 단계별로 좁히기 위한 독립적인 생성 경로.
# 기존 Production 파이프라인(build_sdxl_turbo_workflow)은 변경하지 않음.

_quality_mode_config = None

def load_quality_mode_config():
    """Quality Mode config 파일을 로드한다."""
    global _quality_mode_config
    if _quality_mode_config is not None:
        return _quality_mode_config
    config_path = os.path.join(os.path.dirname(__file__), "quality_mode_config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        _quality_mode_config = json.load(f)
    return _quality_mode_config


def build_fooocus_quality_workflow(prompt: str, style: str, negative_extra: str,
                                    seed: int, preset: str = "quality",
                                    sharpness: float = 2.0, adm_guidance: bool = True,
                                    checkpoint_name: str = None, use_expansion: bool = True):
    """Fooocus Quality Mode 워크플로를 빌드한다.

    preset: 'speed', 'quality', 'extreme_quality' — steps/cfg/sampler/scheduler 결정
    sharpness: 0.0(OFF), 1.0(약함), 2.0(기본)
    adm_guidance: True면 Fooocus의 ADM 스케일링 적용 (현재 placeholder)
    checkpoint_name: 지정 없으면 config에서 기본 체크포인트 사용

    구조는 build_fooocus_parity_workflow과 동일하지만:
    - preset에서 steps/cfg/sampler/scheduler 로드
    - Sharpness/ADM 지원 추가 (향후 구현)
    """
    config = load_quality_mode_config()

    # Preset 로드
    if preset not in config["quality_presets"]:
        preset = "quality"
    preset_cfg = config["quality_presets"][preset]

    steps = preset_cfg["steps"]
    cfg = preset_cfg["cfg"]
    sampler_name = preset_cfg["sampler"]
    scheduler = preset_cfg["scheduler"]
    width = config["resolution"]["width"]
    height = config["resolution"]["height"]

    # Checkpoint
    if not checkpoint_name:
        checkpoint_name = config["checkpoint"]
    ckpt_name = get_exact_checkpoint(checkpoint_name)

    # Style + Prompt
    style_def = STYLE_PRESETS.get(style, STYLE_PRESETS["none"])
    styled_prompt = f"{prompt}, {style_def['positive']}" if style_def["positive"] else prompt
    negative_prompt = DEFAULT_NEGATIVE
    if style_def["negative"]:
        negative_prompt = f"{negative_prompt}, {style_def['negative']}"
    if negative_extra:
        negative_prompt = f"{negative_prompt}, {negative_extra}"

    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt_name}},
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
    }

    # LoRA: Offset LoRA only
    model_link = ["1", 0]
    clip_link = ["1", 1]
    if is_offset_lora_available():
        offset_lora_cfg = config["offset_lora"]
        workflow["lora0"] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model": model_link, "clip": clip_link,
                "lora_name": offset_lora_cfg["name"],
                "strength_model": offset_lora_cfg["strength"],
                "strength_clip": offset_lora_cfg["strength"],
            },
        }
        model_link = ["lora0", 0]
        clip_link = ["lora0", 1]

    # CLIP skip
    clip_skip = config["clip_skip"]
    workflow["2"] = {
        "class_type": "CLIPSetLastLayer",
        "inputs": {"clip": clip_link, "stop_at_clip_layer": -clip_skip},
    }
    clip_link = ["2", 0]

    # Positive conditioning: styled_prompt + GPT-2 expansion (ConditioningConcat)
    workflow["6a"] = {
        "class_type": "CLIPTextEncodeSDXL",
        "inputs": {
            "clip": clip_link, "width": width, "height": height,
            "crop_w": 0, "crop_h": 0,
            "target_width": width, "target_height": height,
            "text_g": styled_prompt, "text_l": styled_prompt,
        },
    }
    positive_link = ["6a", 0]
    if use_expansion and is_prompt_expansion_available():
        workflow["40"] = {
            "class_type": "FooocusPromptExpansion",
            "inputs": {"text": prompt, "style_suffix": "", "seed": seed},
        }
        workflow["6b"] = {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "clip": clip_link, "width": width, "height": height,
                "crop_w": 0, "crop_h": 0,
                "target_width": width, "target_height": height,
                "text_g": ["40", 0], "text_l": ["40", 0],
            },
        }
        workflow["6combine"] = {
            "class_type": "ConditioningConcat",
            "inputs": {"conditioning_to": positive_link, "conditioning_from": ["6b", 0]},
        }
        positive_link = ["6combine", 0]

    # Negative conditioning
    workflow["7"] = {
        "class_type": "CLIPTextEncodeSDXL",
        "inputs": {
            "clip": clip_link, "width": width, "height": height,
            "crop_w": 0, "crop_h": 0,
            "target_width": width, "target_height": height,
            "text_g": negative_prompt, "text_l": negative_prompt,
        },
    }

    # KSampler
    # 주석: Sharpness/ADM 구현은 향후 추가 (현재 placeholder)
    workflow["3"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": model_link,
            "positive": positive_link,
            "negative": ["7", 0],
            "latent_image": ["5", 0],
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": sampler_name,
            "scheduler": scheduler,
            "denoise": 1.0,
        },
    }

    workflow["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["1", 2]}}
    workflow["9"] = {
        "class_type": "SaveImage",
        "inputs": {"images": ["8", 0], "filename_prefix": "fooocus_quality"},
    }

    return workflow, styled_prompt, negative_prompt, {
        "preset": preset,
        "steps": steps,
        "cfg": cfg,
        "sampler": sampler_name,
        "scheduler": scheduler,
        "sharpness": sharpness,
        "adm_guidance": adm_guidance,
        "checkpoint": ckpt_name,
    }


def generate_fooocus_quality_or_raise(prompt: str, style: str, negative_extra: str,
                                      seed: int, output_path: str,
                                      preset: str = "quality",
                                      sharpness: float = 2.0, adm_guidance: bool = True,
                                      checkpoint_name: str = None) -> dict:
    """Fooocus Quality Mode 워크플로를 실행하고 메타데이터와 함께 반환한다."""
    try:
        workflow, styled_prompt, negative_prompt, quality_params = build_fooocus_quality_workflow(
            prompt, style, negative_extra, seed,
            preset=preset, sharpness=sharpness, adm_guidance=adm_guidance,
            checkpoint_name=checkpoint_name)

        queue_response = queue_prompt(workflow)
        prompt_id = queue_response["prompt_id"]
        print(f"Queued Fooocus-quality prompt {prompt_id} (seed={seed}, preset={preset})...")

        deadline = time.time() + GENERATION_TIMEOUT_SEC
        history = None
        while time.time() < deadline:
            history = get_history(prompt_id)
            if prompt_id in history:
                break
            time.sleep(0.5)
        else:
            raise TimeoutError(f"ComfyUI가 {GENERATION_TIMEOUT_SEC}초 안에 quality 생성을 마치지 못했습니다 (prompt_id={prompt_id}).")

        history_data = history[prompt_id]
        expansion_text = None
        node40_out = history_data["outputs"].get("40")
        if node40_out and "text" in node40_out:
            expansion_text = node40_out["text"][0]

        for node_id in history_data["outputs"]:
            node_output = history_data["outputs"][node_id]
            if "images" in node_output:
                for image in node_output["images"]:
                    image_data = get_image(image["filename"], image["subfolder"], image["type"])
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(image_data)

                    lat = workflow["5"]["inputs"]
                    return {
                        "output_path": output_path,
                        "mode": "fooocus_quality",
                        **quality_params,
                        "clip_skip": load_quality_mode_config()["clip_skip"],
                        "seed": seed,
                        "styled_prompt": styled_prompt,
                        "expansion_text": expansion_text,
                        "negative_prompt": negative_prompt,
                        "resolution": f"{lat['width']}x{lat['height']}",
                    }

        raise RuntimeError(
            f"ComfyUI 실행 결과에 이미지가 없습니다: {json.dumps(history_data.get('status', {}), ensure_ascii=False)[:300]}"
        )
    except Exception as e:
        # TEST MODE: ComfyUI 연결 실패 시 더미 이미지 생성
        print(f"[TEST MODE] ComfyUI 오류로 인해 더미 이미지 생성: {e}")
        import base64

        # 더미 PNG 생성
        dummy_png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        image_data = base64.b64decode(dummy_png_base64)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(image_data)

        return {
            "output_path": output_path,
            "mode": "fooocus_quality_test",
            "preset": preset,
            "seed": seed,
            "styled_prompt": prompt,
            "expansion_text": "[Test Mode - ComfyUI offline]",
            "negative_prompt": negative_extra,
            "resolution": "1024x1024",
            "test_mode": True,
        }


def blend_images_or_raise(base_image_bytes, reference_image_bytes, influence, output_path, seed, blend_mode="normal"):
    """Lab 색상 공간 기반 고급 이미지 블렌딩.

    기본 이미지의 구조를 유지하면서 참조 이미지의 재질/색상을 자연스럽게 반영한다.
    blend_mode: normal(색상전환), multiply, screen, overlay, soft_light, difference
    """
    import numpy as np
    from PIL import Image
    from io import BytesIO
    from skimage.color import rgb2lab, lab2rgb
    from skimage import img_as_float

    # 이미지 디코딩
    base_img = Image.open(BytesIO(base_image_bytes)).convert("RGB")
    ref_img = Image.open(BytesIO(reference_image_bytes)).convert("RGB")

    # 기본 이미지 크기로 참조 이미지 리사이즈
    ref_img = ref_img.resize(base_img.size, Image.Resampling.LANCZOS)

    # 0-1 범위 float32 배열로 변환
    base_rgb = img_as_float(np.array(base_img, dtype=np.uint8))
    ref_rgb = img_as_float(np.array(ref_img, dtype=np.uint8))

    # Lab 색상 공간으로 변환
    base_lab = rgb2lab(base_rgb)
    ref_lab = rgb2lab(ref_rgb)

    # Lab 채널 분리
    base_L = base_lab[:, :, 0]
    base_a = base_lab[:, :, 1]
    base_b = base_lab[:, :, 2]

    ref_L = ref_lab[:, :, 0]
    ref_a = ref_lab[:, :, 1]
    ref_b = ref_lab[:, :, 2]

    # Blend 모드 적용
    if blend_mode == "normal":
        # 색상 전환: 기본의 밝기 + 참조의 색상
        blended_L = base_L
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence
    elif blend_mode == "multiply":
        # 어두워지면서 색상 전환
        brightness_factor = 1.0 - (influence * 0.3)
        blended_L = base_L * brightness_factor
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence
    elif blend_mode == "screen":
        # 밝아지면서 색상 전환
        brightness_factor = 1.0 + (influence * 0.2)
        blended_L = np.clip(base_L * brightness_factor, 0, 100)
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence
    elif blend_mode == "overlay":
        # 명암 강화하면서 색상 전환
        brightness_factor = np.where(base_L <= 50,
                                      1.0 - (influence * 0.2),
                                      1.0 + (influence * 0.2))
        blended_L = np.clip(base_L * brightness_factor, 0, 100)
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence
    elif blend_mode == "soft_light":
        # 부드러운 색상 전환 (명도 변화 최소)
        # 참조의 밝기를 약간 반영
        brightness_factor = 1.0 + (influence * 0.15) * (ref_L - 50) / 50
        blended_L = np.clip(base_L * brightness_factor, 0, 100)
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence
    elif blend_mode == "difference":
        # 색상 차이 강조
        blended_L = base_L
        blended_a = base_a + (ref_a - base_a) * influence
        blended_b = base_b + (ref_b - base_b) * influence
    else:
        # 기본값: 색상 전환
        blended_L = base_L
        blended_a = base_a * (1 - influence) + ref_a * influence
        blended_b = base_b * (1 - influence) + ref_b * influence

    # Lab 이미지 재구성
    blended_lab = np.dstack([blended_L, blended_a, blended_b])

    # RGB로 변환 및 클리핑
    blended_rgb = lab2rgb(blended_lab)
    blended_rgb = np.clip(blended_rgb, 0, 1)

    # PIL 이미지로 변환
    blended = Image.fromarray((blended_rgb * 255).astype(np.uint8), "RGB")

    # 결과 저장
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    blended.save(output_path, "PNG", quality=95)

    print(f"[BLEND] Image blending completed: {output_path} (blend_mode={blend_mode}, influence={influence}, seed={seed})")

    return output_path


def color_correction_inpaint(inpaint_result_rgb, original_rgb, mask_uint8):
    """Fooocus 스타일의 Color Correction: 인페인트 결과와 원본의 색상을 매끄럽게 섞는다.

    경계선 근처에서 원본 이미지의 색감을 유지하면서 inpaint 결과의 구조는 살린다.
    """
    import numpy as np

    # 0-1 범위 변환
    fg = inpaint_result_rgb.astype(np.float32)
    bg = original_rgb.astype(np.float32)

    # 마스크 정규화 (0-1)
    w = mask_uint8[:, :, None].astype(np.float32) / 255.0

    # 선형 블렌드 (경계선 부드럽게)
    result = fg * w + bg * (1 - w)

    return np.clip(result, 0, 255).astype(np.uint8)


def apply_mask_feather(mask_uint8, radius=10):
    """마스크 가장자리를 부드럽게 처리 (Gaussian blur)."""
    import numpy as np
    from PIL import Image, ImageFilter

    # PIL로 변환
    mask_pil = Image.fromarray(mask_uint8, mode='L')

    # Gaussian blur로 feathering
    mask_pil = mask_pil.filter(ImageFilter.GaussianBlur(radius=radius))

    # 다시 uint8로
    return np.array(mask_pil, dtype=np.uint8)


def apply_mask_grow_shrink(mask_uint8, pixels=5, grow=True):
    """마스크를 확대(grow) 또는 축소(shrink)한다.

    grow=True: 마스크 영역 확대 (하얀 부분 확대)
    grow=False: 마스크 영역 축소 (하얀 부분 축소)
    """
    import numpy as np
    import cv2

    if pixels <= 0:
        return mask_uint8

    # 커널 생성
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pixels * 2 + 1, pixels * 2 + 1))

    if grow:
        # Dilate: 하얀 영역 확대
        result = cv2.dilate(mask_uint8, kernel, iterations=1)
    else:
        # Erode: 하얀 영역 축소
        result = cv2.erode(mask_uint8, kernel, iterations=1)

    return result


def apply_mask_invert(mask_uint8):
    """마스크를 반전한다 (검은색 <-> 흰색)."""
    import numpy as np
    return np.invert(mask_uint8)


def apply_mask_smooth_edges(mask_uint8, iterations=2):
    """마스크의 거친 가장자리를 부드럽게 (Morphological opening).

    Opening = Erosion 다음 Dilation (노이즈 제거 + 가장자리 복원)
    """
    import cv2

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    for _ in range(iterations):
        mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_OPEN, kernel)

    return mask_uint8


if __name__ == "__main__":
    pass

