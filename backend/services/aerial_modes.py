"""조감도 탭의 작업 방식(분위기 렌더 / 입면 비교 / 레퍼런스 적용)과 선택지, 그리고 영어 프롬프트 조립.

프론트는 /v1/image/aerial-options 로 이 선택지를 받아 그리고, /v1/image/aerial-prompt 로 조립된 프롬프트를 미리 본다.
엔진(로컬 ComfyUI / OpenAI / Gemini)이 달라도 같은 지시문을 쓰도록 문장은 여기서 한 번만 만든다.
"""

MODES = [
    {"id": "render", "label": "분위기 렌더", "desc": "모델링 이미지를 실사 렌더처럼. 시간대·날씨 분위기를 여러 가지로 비교합니다.", "pick": "atmosphere", "needs_ref": False},
    {"id": "facade", "label": "입면 비교", "desc": "같은 형태에 입면 재료·디자인만 바꿔 여러 안을 비교합니다.", "pick": "facade", "needs_ref": False},
    {"id": "reference", "label": "레퍼런스 적용", "desc": "원하는 느낌의 사진을 넣으면 그 재료·분위기를 내 건물에 입힙니다.", "pick": "atmosphere", "needs_ref": True},
]

# 입면 후보: 형태·창 배치는 두고 재료·패턴만 바꾸는 문장
FACADES = [
    {"id": "glass", "label": "유리 커튼월", "prompt": "a glass curtain wall facade with slim dark aluminum mullions and subtle reflections of sky"},
    {"id": "white", "label": "백색 마감", "prompt": "a smooth off-white plaster facade with crisp edges and thin dark window frames"},
    {"id": "redbrick", "label": "적벽돌", "prompt": "a red-brown face brick facade with fine mortar joints and a running-bond pattern"},
    {"id": "greybrick", "label": "회색 벽돌", "prompt": "a warm grey brick facade with subtle tonal variation and recessed mortar joints"},
    {"id": "concrete", "label": "노출콘크리트", "prompt": "an exposed board-formed concrete facade with fine formwork lines and tie holes"},
    {"id": "metal", "label": "금속 패널", "prompt": "a dark grey aluminum composite panel facade with clean panel joints and flush windows"},
    {"id": "perforated", "label": "타공 메탈 스크린", "prompt": "a perforated metal screen facade in light champagne tone, with the glass volume faintly visible behind it"},
    {"id": "timber", "label": "목재 루버", "prompt": "a vertical timber louver facade in warm oak tone with evenly spaced slats and glazing behind"},
    {"id": "stone", "label": "석재 마감", "prompt": "a light grey granite stone cladding facade with fine panel joints and a honed finish"},
    {"id": "terracotta", "label": "테라코타", "prompt": "a terracotta rainscreen facade in warm orange-brown tone with long baguette-shaped tiles"},
    {"id": "corten", "label": "코르텐강", "prompt": "a weathered Corten steel panel facade with rich rust-brown patina"},
]

# 시간대·날씨·계절 분위기
ATMOSPHERES = [
    {"id": "sunny", "label": "화창한 한낮", "prompt": "bright sunny midday, clear blue sky with a few soft clouds, crisp natural shadows"},
    {"id": "golden", "label": "해질녘", "prompt": "golden hour late afternoon, warm low sunlight, long soft shadows, glowing sky"},
    {"id": "dusk", "label": "황혼 (실내 조명)", "prompt": "blue hour dusk, deep blue sky, warm interior lights glowing through the windows"},
    {"id": "night", "label": "야경", "prompt": "night scene, dark blue sky, illuminated windows and architectural lighting, lit paths and street lights"},
    {"id": "overcast", "label": "흐린 날", "prompt": "soft overcast daylight, even diffuse light, muted sky, calm atmosphere"},
    {"id": "rain", "label": "비 오는 날", "prompt": "rainy day, wet reflective pavement, misty moody atmosphere, warm glowing windows"},
    {"id": "snow", "label": "눈 온 풍경", "prompt": "winter scene with fresh snow on the ground and roofs, cold clear light"},
    {"id": "spring", "label": "봄 (꽃·신록)", "prompt": "spring season, fresh green foliage and blooming cherry trees, soft clear light"},
    {"id": "autumn", "label": "가을 단풍", "prompt": "autumn season, orange and red foliage, warm low sunlight"},
]

# 참조 이미지 역할
REF_ROLES = {
    "facade": "is a FACADE reference: apply its facade design (cladding material, pattern, panel rhythm, color) to the building of image 1, never its overall shape or window layout",
    "material": "is a MATERIAL reference: take the facade materials, colors and textures from it, never its shape",
    "mood": "is a MOOD reference: take the lighting, atmosphere, weather and color grading from it, never its shape",
    "site": "is a SITE reference: take the surrounding context (terrain, roads, neighboring buildings, landscaping) from it, never the main building shape",
}

KEEP_FORM = (
    "Keep the building massing, proportions, number of floors, window layout, roof lines and camera angle exactly as in image 1; "
    "do not add, remove, merge or restyle floors, volumes or openings. Keep the surrounding site, roads and neighboring buildings as drawn unless asked otherwise."
)


def _by_id(items: list, key: str) -> dict:
    return next((x for x in items if x["id"] == key), {})


def options() -> dict:
    strip = lambda items: [{"id": x["id"], "label": x["label"]} for x in items]
    return {"modes": MODES, "facades": strip(FACADES), "atmospheres": strip(ATMOSPHERES), "ref_roles": [{"id": k, "label": {"facade": "입면", "material": "재질", "mood": "분위기", "site": "대지·주변"}[k]} for k in REF_ROLES]}


def variant_phrase(mode: str, variant_id: str) -> str:
    """한 장마다 달라지는 문구(선택한 분위기 또는 입면)."""
    if mode == "facade":
        f = _by_id(FACADES, variant_id)
        return f"Facade design: change only the facade finish of the building to {f['prompt']}. Everything else stays identical." if f else ""
    a = _by_id(ATMOSPHERES, variant_id)
    return f"Atmosphere: {a['prompt']}." if a else ""


def variant_label(mode: str, variant_id: str) -> str:
    return (_by_id(FACADES if mode == "facade" else ATMOSPHERES, variant_id) or {}).get("label", variant_id)


def common_prompt(mode: str, extra_en: str, ref_roles: list) -> str:
    """모든 장에 공통으로 들어가는 영어 프롬프트."""
    parts = ["Transform image 1, an architectural massing / 3D model / sketch capture, into a photorealistic architectural rendering as if produced by a professional render engine.", KEEP_FORM]
    for i, role in enumerate(ref_roles):
        sent = REF_ROLES.get(role)
        if sent:
            parts.append(f"Image {i + 2} {sent}.")
    if mode == "facade":
        parts.append("Use realistic daylight, with natural landscaping and sky; keep lighting identical across variants so only the facade differs.")
    else:
        parts.append("Add realistic materials, lighting, landscaping and sky.")
    if extra_en.strip():
        parts.append(f"Additional requirements: {extra_en.strip()}")
    return " ".join(parts)


def local_prompt(mode: str, extra_en: str, variant_id: str) -> str:
    """로컬 SDXL 용 키워드형 프롬프트(문장 지시를 이해하지 못하므로 장면 묘사로 쓴다)."""
    base = "photorealistic architectural photograph of a building, professional architectural visualization, realistic materials, detailed landscaping, natural light"
    if mode == "facade":
        f = _by_id(FACADES, variant_id)
        v = f["prompt"] if f else ""
        base += f", {v}, bright daylight, blue sky"
    else:
        a = _by_id(ATMOSPHERES, variant_id)
        base += f", {a['prompt']}" if a else ""
    if extra_en.strip():
        base += f", {extra_en.strip()}"
    return base
