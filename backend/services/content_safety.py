"""사내 배포용 콘텐츠 안전 필터(2026-09-11 신설).

이 프로젝트는 원래 콘텐츠 검열 장치가 전혀 없었다 — 네거티브 프롬프트도 순전히
화질 관련 항목뿐이었고, 사용자가 프롬프트에 뭘 쓰든 그대로 ComfyUI로 넘어갔다.
사내(건축설계 회사) 여러 부서가 같이 쓰는 공유 배포라 이건 실제 리스크라 판단해서,
생성 요청이 ComfyUI로 넘어가기 *전에* 프롬프트를 검사해 명백히 선정적/폭력적/혐오
표현이면 아예 거부한다(GPU 낭비도 막음). 키워드 매칭이라 완벽하지 않지만,
1차 방어선으로는 충분하고 우회하기 어렵게 한글/영문 변형을 폭넓게 잡아둔다.
"""

import datetime
import os
import re
import threading

_nsfw_classifier = None
_nsfw_lock = threading.Lock()
_violence_classifier = None
_violence_lock = threading.Lock()

# 결과물이 이 확률 이상으로 "nsfw"면 차단한다. 2026-09-11: 사내 배포는 "절대 안 나오면
# 안 된다"는 요구가 있어서, 오탐(정상 사진을 잘못 거르는 것)을 다소 감수하더라도
# 엄격한 쪽으로 낮췄다(기존 0.5 → 0.2).
NSFW_SCORE_THRESHOLD = 0.2

# 폭력/고어 판정 임계값 — CLIP 제로샷이라 절대 확률보다는 "안전 문구 대비 얼마나 더
# 그럴듯한가"가 중요해서, 안전 라벨보다 이 이상 높으면 차단한다.
# 2026-09-11 실측: 0.35는 완전히 정상적인 인물 초상화(장식이 화려한 판타지풍 드레스)에서
# "혐오스러운 훼손 이미지" 56.6%로 오탐이 났다 — CLIP 제로샷이 이 문구 자체에 과민하게
# 반응하는 걸로 보여서, 확실히 그럴듯할 때만 걸리도록 크게 올렸다(안전 라벨과의 격차
# 조건도 추가).
VIOLENCE_SCORE_THRESHOLD = 0.75
VIOLENCE_SAFE_MARGIN = 0.3

_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs", "content_safety_blocked.log"))


def log_blocked(kind: str, detail: str):
    """차단된 시도를 감사 로그로 남긴다(2026-09-11) — 필터가 뭔가를 놓치더라도, 누가
    무엇을 시도했는지 최소한 기록에 남아야 사내 배포에서 책임 소재/패턴 파악이 된다."""
    try:
        os.makedirs(os.path.dirname(_LOG_PATH), exist_ok=True)
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now().isoformat()} [{kind}] {detail}\n")
    except OSError:
        pass


def _get_nsfw_classifier():
    """선정적 콘텐츠(누드/성적 이미지) 판별 모델 — 최초 1회만 로드해서 재사용."""
    global _nsfw_classifier
    if _nsfw_classifier is None:
        with _nsfw_lock:
            if _nsfw_classifier is None:
                from transformers import pipeline
                _nsfw_classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection")
    return _nsfw_classifier


def _get_violence_classifier():
    """2026-09-11 추가: Falconsai 모델은 선정적 콘텐츠 전용이라 폭력/고어는 못 걸러낸다는
    빈틈이 있었다 — CLIP 제로샷 분류로 "폭력적/고어/끔찍한" 쪽과 "평범하고 안전한" 쪽을
    비교해서 그 빈틈을 메운다. 전용 폭력 판별 모델만큼 정확하진 않지만, 명백한 고어/폭력
    이미지는 충분히 잡아낸다."""
    global _violence_classifier
    if _violence_classifier is None:
        with _violence_lock:
            if _violence_classifier is None:
                from transformers import pipeline
                _violence_classifier = pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")
    return _violence_classifier


_VIOLENCE_LABELS = [
    "a graphic violent or gory image with blood and injuries",
    "a disturbing gruesome mutilated image",
    "a normal safe everyday photo or illustration",
]


def check_image_safety(image_path: str):
    """생성된 이미지 파일을 검사해서 (is_safe, reason, score)를 반환한다. 두 모델을
    순서대로 통과시킨다 — 선정적 콘텐츠(Falconsai) → 폭력/고어(CLIP 제로샷). 분류 모델
    자체가 실패하면(드묾) 서비스 전체를 막지 않도록 안전 쪽으로 넘어가되 로그를 남긴다."""
    try:
        clf = _get_nsfw_classifier()
        results = clf(image_path)
        nsfw_score = next((r["score"] for r in results if r["label"] == "nsfw"), 0.0)
        if nsfw_score >= NSFW_SCORE_THRESHOLD:
            log_blocked("image-nsfw", f"{image_path} score={nsfw_score:.3f}")
            return False, "선정적", nsfw_score
    except Exception as e:
        print(f"[WARNING] content_safety: NSFW 이미지 검사 실패(허용 처리): {e}")

    try:
        vclf = _get_violence_classifier()
        results = vclf(image_path, candidate_labels=_VIOLENCE_LABELS)
        by_label = {r["label"]: r["score"] for r in results}
        safe_score = by_label.get(_VIOLENCE_LABELS[2], 0.0)
        violent_score = max(by_label.get(_VIOLENCE_LABELS[0], 0.0), by_label.get(_VIOLENCE_LABELS[1], 0.0))
        if violent_score >= VIOLENCE_SCORE_THRESHOLD and (violent_score - safe_score) >= VIOLENCE_SAFE_MARGIN:
            log_blocked("image-violence", f"{image_path} violent={violent_score:.3f} safe={safe_score:.3f}")
            return False, "폭력적/혐오스러운", violent_score
    except Exception as e:
        print(f"[WARNING] content_safety: 폭력성 이미지 검사 실패(허용 처리): {e}")

    return True, None, 0.0

# 선정적/성적 콘텐츠
_SEXUAL_TERMS = (
    "누드", "나체", "노출", "섹스", "정사", "야동", "포르노", "음란", "선정적", "관능적",
    "성기", "젖가슴", "가슴노출", "국부", "유두", "자위", "성행위", "성적 매력", "성인용",
    "야한", "벗은", "벗은몸", "알몸", "옷벗은", "속옷차림", "비키니 노출", "전라",
    "nude", "naked", "nudity", "nsfw", "porn", "pornographic", "hentai", "sex act",
    "sexual intercourse", "explicit sexual", "genitals", "genitalia", "penis", "vagina",
    "nipples", "areola", "topless", "bottomless", "erotic", "erotica", "fetish",
    "masturbat", "orgasm", "seductive pose", "lingerie photoshoot", "underboob",
    "no clothes", "without clothes", "unclothed", "undressed", "stripped naked",
    "bare breasts", "bare chest woman", "exposed body", "sensual pose", "provocative pose",
    "xxx", "18+", "adult content", "r18", "onlyfans",
)

# 폭력/잔인/혐오스러운 콘텐츠
_VIOLENCE_TERMS = (
    "고문", "시체", "참수", "유혈", "잔인한 살인", "학살", "자해", "자살", "고어",
    "신체 훼손", "토막", "살해", "살인 장면", "총살", "폭행", "피흘리는", "잔혹한",
    "gore", "gory", "torture", "beheading", "decapitat", "mutilated corpse",
    "dismember", "self-harm", "suicide method", "graphic violence", "massacre",
    "dead body", "bloodbath", "disembowel", "execution scene", "stabbing victim",
    "brutal murder", "corpse", "severed limb", "blood splatter", "slaughter",
)

# 혐오 상징/표현
_HATE_TERMS = (
    "나치 상징", "스와스티카", "인종차별 상징", "혐오 발언", "인종차별적",
    "nazi symbol", "swastika", "kkk hood", "racist caricature", "hate symbol",
    "ethnic slur imagery",
)

_ALL_TERMS = _SEXUAL_TERMS + _VIOLENCE_TERMS + _HATE_TERMS

# 프롬프트에 공백/특수문자를 끼워 필터를 우회하는 걸 어느 정도 막기 위해, 검사 시
# 알파벳/한글/숫자가 아닌 문자를 제거하고 비교한다("n u d e", "n.u.d.e" 등 방지).
_STRIP_PATTERN = re.compile(r"[^0-9a-zA-Z가-힣]")


def _normalize(text: str) -> str:
    return _STRIP_PATTERN.sub("", text or "").lower()


# 2026-09-15 실측(Kontext 편집 지시문 자동 번역 기능 회귀 테스트 중 발견): 위 _ALL_TERMS는
# 공백을 완전히 제거하고 비교하기 때문에, "remove clothing"처럼 사전에 등록해둬도 실제 문장이
# "remove ALL clothing"/"remove clothing from the person"처럼 단어 사이에 다른 말이 끼면
# 붙여놓은 문자열과 정확히 겹치지 않아 그대로 통과해버린다("옷을 다 벗겨줘" → 번역
# "Remove all clothing from the subject." → 필터 미탐지 확인). 한 단어짜리 우회(자간 띄어쓰기
# 등)는 위 방식이 맞지만, "탈의를 지시하는 문장 패턴" 자체는 단어 사이 거리에 관대한 정규식으로
# 따로 잡아야 한다.
_UNDRESS_PATTERNS = (
    re.compile(r"remove[\w\s]{0,20}cloth", re.I),
    re.compile(r"take[\w\s]{0,15}off[\w\s]{0,15}cloth", re.I),
    re.compile(r"strip[\w\s]{0,15}(naked|cloth)", re.I),
    re.compile(r"without[\w\s]{0,10}cloth", re.I),
    re.compile(r"\bno[\w\s]{0,10}cloth", re.I),
    re.compile(r"disrobe", re.I),
    re.compile(r"(옷|의상).{0,10}(벗기|벗겨|없애|제거|탈의)"),
    re.compile(r"(벗기|벗겨).{0,10}(옷|나체|알몸)"),
    re.compile(r"탈의"),
)


def find_blocked_terms(*texts: str) -> list:
    """주어진 텍스트들(원본 프롬프트, AI가 다듬은 프롬프트 등)에서 차단 키워드를 찾아
    실제로 걸린 원본 키워드 목록을 반환한다. 비어있으면 안전하다는 뜻."""
    joined = " ".join(t for t in texts if t)
    haystack = _normalize(joined)
    if not haystack:
        return []
    found = []
    for term in _ALL_TERMS:
        needle = _normalize(term)
        if needle and needle in haystack:
            found.append(term)
    for pattern in _UNDRESS_PATTERNS:
        if pattern.search(joined):
            found.append(f"[패턴] {pattern.pattern}")
    return found