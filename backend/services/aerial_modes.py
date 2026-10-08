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

# 입면 재디자인에서 재료와 함께 지시하는 구체적인 디자인 수법(창 비율·분할·깊이). 재료만 바뀌고 리듬이 그대로 남는 것을 막는다.
REDESIGN_MOVES = {
    "glass": "replace the existing window pattern with a unitized curtain wall of tall glass panels, alternating clear glass and opaque spandrel bands every floor, with deep projecting vertical fins at regular intervals",
    "white": "replace the existing window pattern with large framed rectangular openings of varied sizes set deep into thick white walls, with a few cantilevered horizontal slab edges and crisp shadow lines",
    "redbrick": "replace the existing window pattern with brick piers between tall recessed window bays, with soldier-course brick bands at each floor line and a few deep-set brick-framed openings",
    "greybrick": "replace the existing window pattern with wide horizontal ribbon windows between grey brick spandrels, with projecting brick corbel bands at the floor lines",
    "concrete": "replace the existing window pattern with a strong grid of deep concrete frames, each frame holding recessed glazing, with heavy horizontal beams and deep shadows",
    "metal": "replace the existing window pattern with continuous horizontal ribbon windows separated by wide dark metal spandrel panels, with a rhythm of vertical metal fins and a recessed entrance canopy",
    "perforated": "wrap the facade in a layered perforated metal screen with a large-scale pattern that varies in density, set a short distance in front of recessed glazing, so the original window pattern disappears behind the screen",
    "timber": "replace the existing window pattern with a rhythm of vertical timber louver bays alternating with full-height glazing, with deep timber fins and horizontal timber bands at the floor lines",
    "stone": "replace the existing window pattern with tall slender stone-framed openings of uniform width, with thick stone piers and projecting stone sills and lintels",
    "terracotta": "replace the existing window pattern with large glazed openings framed by terracotta fins, with baguette tiles running vertically in varied depths to create a rippled rhythm",
    "corten": "replace the existing window pattern with deep-set corten steel framed windows of varying heights, with folded corten panels projecting at some floors to make a bold sculptural rhythm",
}

# 시간대·날씨·계절 분위기
ATMOSPHERES = [
    {"id": "sunny", "label": "화창한 오후 (건물이 잘 보임)", "prompt": "bright sunny afternoon, clear blue sky with a few soft clouds, soft natural daylight with gentle shadows so the whole building is clearly and evenly visible"},
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

# 입면 비교의 변경 폭: material = 재료만 교체(형태 100% 유지), redesign = 입면 디자인 자체를 새로 구성(전체 매스는 유지, 형태 약 70%)
DEPTHS = [
    {"id": "material", "mode": "facade", "label": "재료만 바꾸기", "desc": "형태·창 배치는 그대로, 외장 재료만 교체합니다.", "keep_form": 90},
    {"id": "redesign", "mode": "facade", "label": "입면 재디자인", "desc": "전체 매스·높이·카메라는 유지하되(형태 약 70%), 창 구성·패널 리듬·루버·발코니 등 입면 디자인을 새로 짭니다.", "keep_form": 70},
    {"id": "ref_apply", "mode": "reference", "label": "그대로 입히기", "desc": "참조 사진의 재료·분위기를 내 건물에 그대로 입힙니다(형태 유지).", "keep_form": 85},
    {"id": "ref_propose", "mode": "reference", "label": "참고해서 새로 제안", "desc": "참조 사진의 입면 언어(재료·비례·리듬·디테일)를 분석해 내 건물에 맞는 새 입면을 제안합니다(형태 약 70%). 참조를 베끼지 않습니다.", "keep_form": 70},
]
DEFAULT_DEPTH = {"facade": "material", "reference": "ref_apply"}
INSPIRATION_SENTENCE = ("is a DESIGN INSPIRATION: study its facade language (cladding materials, proportions, window rhythm, panel divisions, depth and detailing) "
                        "and use that language to design the facade of image 1, never its overall shape or its precise floor plan")
KEEP_FORM_REDESIGN = (
    "Keep the overall building massing, footprint, height, number of floors, roof silhouette and camera angle from image 1 (about 70% of the form must remain recognizable), "
    "and keep the surrounding site, roads and neighboring buildings as drawn. The facade design itself - window arrangement, panel rhythm, fins, louvers, balconies, entrance articulation - may be redesigned."
)


def _by_id(items: list, key: str) -> dict:
    return next((x for x in items if x["id"] == key), {})


def options() -> dict:
    strip = lambda items: [{"id": x["id"], "label": x["label"]} for x in items]
    return {"modes": MODES, "depths": DEPTHS, "default_depth": DEFAULT_DEPTH, "facades": strip(FACADES), "atmospheres": strip(ATMOSPHERES), "ref_roles": [{"id": k, "label": {"facade": "입면", "material": "재질", "mood": "분위기", "site": "대지·주변"}[k]} for k in REF_ROLES]}


def variant_phrase(mode: str, variant_id: str, depth: str = "material") -> str:
    """한 장마다 달라지는 문구(선택한 분위기 또는 입면)."""
    if mode == "facade":
        f = _by_id(FACADES, variant_id)
        if not f:
            return ""
        if depth == "redesign":
            move = REDESIGN_MOVES.get(variant_id, "give it a new window proportion, panel division and rhythm")
            return (f"Facade redesign: completely redesign the facade of the building as {f['prompt']}. Specifically, {move}. "
                    "The facade must look clearly different from image 1 in window proportions, divisions and rhythm, not just in color or material, "
                    "while the overall massing, height and silhouette stay recognizable.")
        return f"Facade design: change only the facade finish of the building to {f['prompt']}. Everything else stays identical."
    a = _by_id(ATMOSPHERES, variant_id)
    return f"Atmosphere: {a['prompt']}." if a else ""


def variant_label(mode: str, variant_id: str) -> str:
    return (_by_id(FACADES if mode == "facade" else ATMOSPHERES, variant_id) or {}).get("label", variant_id)


KEEP_SITE = ("Keep the site exactly as in image 1: the terrain and slopes, ground surfaces, roads, fences, retaining walls and neighboring buildings must not be moved, "
             "removed, redrawn or replaced. Only add small landscaping such as trees and plants where it does not change the site layout.")


def common_prompt(mode: str, extra_en: str, ref_roles: list, depth: str = "material", ref_notes: list | None = None, ref_hints: list | None = None, keep_site: bool = False) -> str:
    """모든 장에 공통으로 들어가는 영어 프롬프트."""
    propose = mode == "reference" and depth == "ref_propose"
    keep = KEEP_FORM_REDESIGN if (propose or (mode == "facade" and depth == "redesign")) else KEEP_FORM
    parts = ["Transform image 1, an architectural massing / 3D model / sketch capture, into a photorealistic architectural rendering as if produced by a professional render engine.", keep]
    for i, role in enumerate(ref_roles):
        sent = REF_ROLES.get(role)
        if propose and role == "facade":
            sent = INSPIRATION_SENTENCE
        if sent:
            parts.append(f"Image {i + 2} {sent}.")
        hint = (ref_hints[i] if ref_hints and i < len(ref_hints) else "").strip()
        note = (ref_notes[i] if ref_notes and i < len(ref_notes) else "").strip()
        if sent and hint:   # 사용자가 직접 적은 "이 사진에서 가져올 것"이 자동 분석보다 우선한다
            parts.append(f"From image {i + 2}, take exactly this and nothing else: {hint}. Never take its building shape.")
        elif sent and note:   # 이미지 모델이 참조에서 재료·리듬을 못 읽는 것을 글로 보완한다
            parts.append(f"Surface language of image {i + 2} (take only these surface qualities, never its building shape): {note}")
    if propose:
        parts.append("Propose a new, original facade design for the building of image 1 inspired by the reference. The facade must clearly differ from image 1 in window proportions, divisions and rhythm, and must not be a copy of the reference. "
                     "The building must keep the exact volumes, roof forms, terraces and curved or angular shapes of image 1; only the facade surface is redesigned.")
    if mode == "facade":
        parts.append("Use realistic daylight, with natural landscaping and sky; keep lighting identical across variants so only the facade differs.")
    else:
        parts.append("Add realistic materials, lighting, landscaping and sky.")
    if keep_site:
        parts.append(KEEP_SITE)
    if extra_en.strip():
        parts.append(f"Additional requirements: {extra_en.strip()}")
    return " ".join(parts)


def kontext_short(mode: str, extra_en: str, variant_id: str, depth: str = "material", keep_site: bool = True) -> str:
    """BFL(Kontext 제작사) 가이드식 짧은 지시문: '바꿀 것을 직접 동사로 말하고, 그대로 둘 것을 한 문장으로 명시'한다.
    템플릿: "Change [대상] to [새 상태], keep [유지할 것] unchanged". 참조 이미지가 없는 렌더·입면 비교용(비교 시험 2026-10-08)."""
    if mode == "facade":
        f = _by_id(FACADES, variant_id)
        # 입면만 바꾸라고만 하면 모델이 스케치업 캡처 느낌(회색 하늘·평평한 조명)을 그대로 둔다(시험 2026-10-08). 사진처럼 만들라는 말과 조명을 함께 지시한다.
        what = ("Change this 3D model screenshot into a photorealistic architectural photograph in bright sunny afternoon light with a clear blue sky, "
                + (f"and change the facade of the building to {f['prompt']}" if f else "and change the facade of the building"))
        if depth == "redesign" and f:
            what += ", " + REDESIGN_MOVES.get(variant_id, "with a new window proportion and rhythm")
        keep = "keep the overall building massing, height, roof and camera angle unchanged"
        if depth != "redesign":
            keep = "keep the building shape, window layout, roof lines and camera angle unchanged"
    else:
        a = _by_id(ATMOSPHERES, variant_id)
        what = "Change this 3D model screenshot into a photorealistic architectural photograph" + (f", {a['prompt']}" if a else "")
        keep = "keep the building shape, number of floors, window layout, roof lines and camera angle unchanged"
    if keep_site:
        keep += " and keep the site, roads and surroundings unchanged"
    out = f"{what}, {keep}."
    if extra_en.strip():
        out += f" {extra_en.strip()}"
    return out


def local_prompt(mode: str, extra_en: str, variant_id: str, depth: str = "material") -> str:
    """로컬 SDXL 용 키워드형 프롬프트(문장 지시를 이해하지 못하므로 장면 묘사로 쓴다)."""
    base = "photorealistic architectural photograph of a building, professional architectural visualization, realistic materials, detailed landscaping, natural light"
    if mode == "facade":
        f = _by_id(FACADES, variant_id)
        v = f["prompt"] if f else ""
        base += f", {v}, bright daylight, blue sky"
        if depth == "redesign":
            base += ", newly designed contemporary facade composition, distinctive window rhythm"
    elif mode == "reference" and depth == "ref_propose":
        base += ", newly designed contemporary facade composition, distinctive window rhythm"
        a = _by_id(ATMOSPHERES, variant_id)
        base += f", {a['prompt']}" if a else ""
    else:
        a = _by_id(ATMOSPHERES, variant_id)
        base += f", {a['prompt']}" if a else ""
    if extra_en.strip():
        base += f", {extra_en.strip()}"
    return base
