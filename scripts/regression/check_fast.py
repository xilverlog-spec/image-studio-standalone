"""빠른 회귀 점검(GPU·서버 불필요, 수 초): 조감도 지시문 조합과 다이어그램 렌더가 깨지지 않았는지 본다.

  python scripts/regression/check_fast.py

- 조감도: 모든 작업 방식·깊이·입면·분위기·참조 역할 조합이 지시문을 만들고, 안전 필터에 걸리지 않고,
  꼭 들어가야 할 문구(형태 유지·이웃 건물 유지 등)를 포함하며, 길이가 상한 안인지
- 다이어그램: 예시와 일부러 망가뜨린 입력(빈 배열·빠진 필드)을 넣어도 렌더가 예외 없이 SVG 를 내는지(node 필요)
"""
import itertools
import math
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from services import aerial_modes as am  # noqa: E402
from services import content_safety  # noqa: E402

fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)


MAX_SHORT = 1400   # 짧은 지시문 상한(자). 지금 최대는 약 1100자
n = 0
facades = [f["id"] for f in am.FACADES]
atmos = [a["id"] for a in am.ATMOSPHERES] + [""]
for mode, depth, var in itertools.chain(
    (("render", "material", a) for a in atmos),
    (("facade", d, f) for d in ("material", "redesign") for f in facades),
):
    for keep_site in (True, False):
        p = am.kontext_short(mode, "make it a cafe", var, depth, keep_site)
        n += 1
        check(not content_safety.find_blocked_terms(p), f"안전 필터 오탐: {mode}/{depth}/{var}")
        check("unchanged" in p, f"유지 문구 없음: {mode}/{depth}/{var}")
        check(("neighboring buildings unchanged" in p) == keep_site, f"부지 유지 문구가 keep_site 와 다름: {mode}/{depth}/{var}")
        check(len(p) <= MAX_SHORT, f"너무 김({len(p)}자): {mode}/{depth}/{var}")
        if mode == "facade":
            check("main building only" in p and "sunny" in p, f"입면 지시문에 '주 건물만'·'화창한' 문구 없음: {depth}/{var}")

roles_sets = [["facade"], ["material"], ["mood"], ["site"], ["facade", "material"], ["facade", "mood", "site"]]
for depth, roles, var in itertools.product(("ref_apply", "ref_propose"), roles_sets, ("", "sunny", "dusk")):
    hints = ["tinted glass and thin vertical fins"] * len(roles)
    for notes in ([], ["Smooth brick cladding. " * 30]):
        p = am.kontext_short_ref("reference", depth, var, roles, hints if not notes else [""] * len(roles), notes * len(roles) if notes else [], "")
        n += 1
        check(not content_safety.find_blocked_terms(p), f"참조 지시문 안전 필터 오탐: {depth}/{roles}/{var}")
        check("never their building shape" in p, f"형태 베끼기 금지 문구 없음: {depth}/{roles}")
        check(len(p) <= 1800, f"참조 지시문이 너무 김({len(p)}자): {depth}/{roles}/{var}")
        check(not p.rstrip().endswith("(") and p.count("(") == p.count(")"), f"괄호가 닫히지 않음: {depth}/{roles}")
print(f"조감도 지시문 조합 {n}개 검사")

# 긴 지시문(직접 수정·유료 API 용)도 계속 안전 필터를 통과해야 한다
for mode, depth in (("render", "material"), ("facade", "redesign"), ("reference", "ref_propose")):
    p = am.common_prompt(mode, "", ["facade"], depth, [""], ["warm timber slats"], True) + " " + am.variant_phrase(mode, "sunny" if mode != "facade" else "glass", depth)
    check(not content_safety.find_blocked_terms(p), f"긴 지시문 안전 필터 오탐: {mode}/{depth}")

# 분석 축측도 바탕(평면 도면 → 입체 벽체): 합성 평면은 만들어지고, 벽이 아닌 그림은 엉뚱하게 세우지 않고 거절해야 한다
from PIL import Image as _Img, ImageDraw as _Draw
from services import plan_axon
def _png(im):
    import io
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
_plan = _Img.new("RGB", (1000, 640), "white"); _d = _Draw.Draw(_plan)
for box in ((60, 80, 940, 560),):
    _d.rectangle(box, outline=(25, 25, 25), width=14)
for seg in ((400, 80, 400, 330), (400, 330, 940, 330), (230, 560, 230, 330), (700, 330, 700, 560)):
    _d.line(seg, fill=(35, 35, 35), width=10)
_d.rectangle((150, 120, 340, 300), fill=(205, 190, 175))
_d.text((180, 200), "ROOM", fill=(0, 0, 0))
_r = plan_axon.build_axon(_png(_plan))
check(_r["svg"].startswith("<g>") and "<path" in _r["svg"] and "nan" not in _r["svg"].lower(), "축측 바탕 SVG 이상")
check(len(_r["vb"]) == 4 and all(v == v and abs(v) < 1e5 for v in _r["vb"]) and _r["vb"][2] > 0 and _r["vb"][3] > 0, "축측 바탕 viewBox 이상")
check(_r["stats"]["black"] >= 1 and _r["plan_size"][0] == 1000, "축측 바탕에서 벽을 못 찾음")
_rt = plan_axon.build_axon(_png(_plan), texture=True)
check("<image" in _rt["svg"] and "url(#axfloor)" in _rt["svg"] and "<image" not in _r["svg"], "바닥 질감(원본 도면 그림) 입히기 이상")
_txt = _Img.new("RGB", (1000, 640), "white"); _dt = _Draw.Draw(_txt)
for i in range(6):
    _dt.text((100 + i * 120, 300), "R1 L D/K", fill=(0, 0, 0))
_rej = 0
for _bad in (_txt, _Img.new("RGB", (800, 500), (90, 90, 90)), _Img.new("RGB", (800, 500), "white")):
    try:
        plan_axon.build_axon(_png(_bad))
    except ValueError:
        _rej += 1
check(_rej == 3, f"벽이 아닌 그림(글자·단색·빈 그림)은 거절해야 함: {_rej}/3")

# 유료 API 누적 총 한도(원): 장부에 합산되고, 넘기는 호출은 막혀야 한다
import tempfile as _tf
from services import paid_image as _pi
_saved = (_pi._USAGE_FILE, _pi.PAID_TOTAL_LIMIT_KRW, _pi.USD_KRW, _pi.PAID_DAILY_LIMIT_USD)
try:
    _pi._USAGE_FILE = os.path.join(_tf.mkdtemp(), "u.json")
    _pi.PAID_TOTAL_LIMIT_KRW, _pi.USD_KRW, _pi.PAID_DAILY_LIMIT_USD = 1400, 1400.0, 100.0   # 총 한도 $1 로 환산
    _pi.check_budget_amount(0.5)
    _pi.record_usage_amount(0.9)
    check(abs(_pi.usage_total()["usd"] - 0.9) < 1e-9 and _pi.usage_total()["krw"] == 1260 and _pi.usage_total()["remaining_krw"] == 140, "누적 합계·원화 환산 이상")
    _blocked = False
    try:
        _pi.check_budget_amount(0.2)
    except RuntimeError as _e:
        _blocked = "1,400원" in str(_e)
    check(_blocked, "누적 총 한도를 넘는 호출이 막히지 않음")
    _pi.check_budget_amount(0.05)
    check(_pi.usage_today()["total_krw"] == 1260 and _pi.usage_today()["total_limit_krw"] == 1400, "usage_today 에 누적 합계가 없음")
    _pi.PAID_TOTAL_LIMIT_KRW = 0
    _pi.check_budget_amount(50.0)   # 한도 0 이면 총 한도 검사는 하지 않는다
finally:
    _pi._USAGE_FILE, _pi.PAID_TOTAL_LIMIT_KRW, _pi.USD_KRW, _pi.PAID_DAILY_LIMIT_USD = _saved

# 구글 이미지 생성 해상도(2026-10-27): 요청에 화질 단계(imageSize)를 싣고(비율이 없어도), 허용 값이 아니면 보내지 않고, 4K 는 예상 비용을 올린다
import base64 as _b64
_sent = []
def _fake_http(url, body, headers):
    _sent.append(body)
    return {"candidates": [{"content": {"parts": [{"inlineData": {"data": _b64.b64encode(_png(_Img.new("RGB", (4, 4), "white"))).decode()}}]}}]}
_saved_img = (_pi._http_json, getattr(_pi, "GEMINI_IMAGE_SIZE", None))
try:
    _pi._http_json = _fake_http
    for _size, _ratio, _want in (("2K", "16:9", {"aspectRatio": "16:9", "imageSize": "2K"}), ("1K", "16:9", {"aspectRatio": "16:9", "imageSize": "1K"}),
                                 ("4K", "3:2", {"aspectRatio": "3:2", "imageSize": "4K"}), ("2K", None, {"imageSize": "2K"}),
                                 ("", "16:9", {"aspectRatio": "16:9"}), ("8K", "16:9", {"aspectRatio": "16:9"}), ("2k", "16:9", {"aspectRatio": "16:9"})):
        _pi.GEMINI_IMAGE_SIZE = _size
        _sent.clear()
        _pi._generate_gemini("p", _ratio, None)
        _got = _sent[0]["generationConfig"].get("imageConfig") if _sent else None
        check(_got == _want, f"구글 이미지 요청의 imageConfig 이상: 단계 {_size!r}/비율 {_ratio} → {_got} (기대 {_want})")
    _c4 = getattr(_pi, "PAID_COST_GEMINI_4K_USD", None)
    for _size in ("1K", "2K"):
        _pi.GEMINI_IMAGE_SIZE = _size
        check(abs(_pi.estimate_cost("gemini") - _pi.PAID_COST_GEMINI_USD) < 1e-9, f"{_size} 예상 비용은 기본 단가여야 함: {_pi.estimate_cost('gemini')}")
    _pi.GEMINI_IMAGE_SIZE = "4K"
    check(_c4 is not None and _c4 > _pi.PAID_COST_GEMINI_USD and abs(_pi.estimate_cost("gemini") - _c4) < 1e-9, f"4K 예상 비용은 4K 단가여야 함: {_pi.estimate_cost('gemini')} / 4K 단가 {_c4}")
    check(abs(_pi.estimate_cost("gemini", 3) - 3 * (_c4 or 0)) < 1e-3 and any(p["id"] == "gemini" and abs(p["est_cost_usd"] - (_c4 or 0)) < 1e-9 for p in _pi.provider_status()), "4K: 여러 장 비용·공급자 목록의 예상 비용도 4K 단가")
finally:
    _pi._http_json = _saved_img[0]
    if _saved_img[1] is None:
        if hasattr(_pi, "GEMINI_IMAGE_SIZE"): del _pi.GEMINI_IMAGE_SIZE
    else:
        _pi.GEMINI_IMAGE_SIZE = _saved_img[1]

# 도면 위에 표시(AI 이미지 편집): 합성은 원본 선·글자를 지키고 색·화살표만 가져오는지, 범례는 실제 나온 색만 만드는지(GPU·서버 불필요)
from PIL import Image, ImageDraw  # noqa: E402
from services import diagram_edit as de  # noqa: E402

_o = Image.new("RGB", (400, 260), "white")
_d = ImageDraw.Draw(_o)
_d.rectangle([20, 20, 380, 240], outline="black", width=3)
_d.line([200, 20, 200, 240], fill="black", width=3)
_d.text((60, 120), "ROOM A", fill="black")
# 모델 출력(가상): 크기가 다르고, 글자는 틀리게(위치 어긋남) 그렸고, 왼쪽 방을 칠했고, 빨간 굵은 화살표와 파란 화살표를 얹었다
_q = Image.new("RGB", (432, 281), "white")
_qd = ImageDraw.Draw(_q)
_qd.rectangle([22, 22, 410, 259], outline="black", width=3)
_qd.line([216, 22, 216, 259], fill="black", width=3)
_qd.rectangle([26, 26, 212, 255], fill=(200, 225, 250))        # 왼쪽 방 연한 파랑
_qd.text((64, 150), "R00M Q", fill="black")                     # 깨진 글자(원본 위치와 다름)
_qd.line([40, 80, 190, 80], fill=(240, 20, 20), width=9)         # 빨간 화살표
_qd.line([240, 200, 390, 200], fill=(20, 80, 240), width=9)      # 파란 화살표
_comp, _arrow = de.composite(_o, _q)
_oa, _ca = _o.load(), _comp.load()
check(_comp.size == _o.size, "합성 결과 크기가 원본과 다름")
check(all(_ca[xy] == (255, 255, 255) for xy in [(300, 130), (250, 100), (350, 230)]), "채우지 않은 오른쪽 방이 흰색을 유지하지 않음")
_wall = _ca[20, 100]
check(max(_wall) < 60, "원본의 벽 선이 합성 뒤에도 검은색으로 남지 않음")
_tint = _ca[60, 60]
check(_tint[2] > _tint[0] + 15, f"채움 색(연한 파랑)이 얹히지 않음 {_tint}")
_red = _ca[int(40 * 400 / 432 + 40), int(80 * 260 / 281)]
check(_arrow.any(), "화살표 마스크가 비어 있음")
_leg = de.legend_from_result(_comp, _o, _arrow, [{"color": "blue", "kind": "zone", "label": "왼쪽 방"}, {"color": "red", "kind": "flow", "label": "주 동선"}, {"color": "blue", "kind": "flow", "label": "보조 동선"}, {"color": "green", "kind": "flow", "label": "쓰이지 않음"}], min_arrow_px=120)
_got = sorted((l["kind"], l["label"]) for l in _leg)
check(_got == [("flow", "보조 동선"), ("flow", "주 동선"), ("zone", "왼쪽 방")], f"범례가 실제 나온 채움·화살표 색만 담지 않음 {_leg}")
_leg2 = de.legend_from_result(_comp, None, _arrow, [{"color": "red", "kind": "flow", "label": "주 동선"}, {"color": "blue", "kind": "flow", "label": "보조 동선"}], min_arrow_px=120)
check(all(l["kind"] == "flow" for l in _leg2) and len(_leg2) == 2, "원본이 없으면(사진·3D) 화살표 범례만 나와야 함")
_leg3 = de.legend_from_result(_comp, _o, _arrow, [{"color": "red", "kind": "flow", "label": "주 동선"}], min_arrow_px=120)
check(sorted(l["label"] for l in _leg3) == ["주 동선"], f"Gemini 범례에 없는 색은 빠져야 함 {_leg3}")
check(de.legend_from_result(_o, _o, None, []) == [] and de.legend_from_result(_o, None, __import__("numpy").zeros((260, 400), bool), []) == [], "바뀐 곳이 없으면 범례도 비어야 함")
# 사진·3D 뷰: 원본에 원래 있던 색(잔디)은 구역으로 잡지 않고, 새로 칠해진 색만 잡는다
_ph = Image.new("RGB", (300, 200), (150, 190, 230))
_pd = ImageDraw.Draw(_ph)
_pd.rectangle([0, 120, 300, 200], fill=(60, 140, 50))            # 원래 있던 잔디
_ph2 = _ph.copy()
ImageDraw.Draw(_ph2).rectangle([40, 30, 140, 110], fill=(150, 90, 190))   # 새로 칠한 보라
_gl = [{"color": "purple", "kind": "zone", "label": "코어"}, {"color": "green", "kind": "zone", "label": "공용"}]
check([l["label"] for l in de.legend_from_result(_ph2, _ph, None, _gl, photo=True)] == ["코어"], "사진 범례가 원래 있던 잔디 색을 구역으로 잡음")
check(de.legend_from_result(_ph, _ph, None, _gl, photo=True) == [], "바뀐 곳이 없는 사진에 범례가 생김")
# 범례 확인(Gemini)은 구역이 없으면 부르지 않고 그대로 통과, 색→이름 변환
_noz, _okz = de.verify_zone_legend(_o, [{"color": "#F61918", "kind": "flow", "label": "주 동선"}])
check(_okz is True and _noz[0]["label"] == "주 동선", "구역이 없는 범례는 확인 없이 그대로여야 함")
check(de._names_for([{"color": "#F61918"}, {"color": "#2870E9"}, {"color": "#3DB13B"}, {"color": "#F68818"}]) == ["red", "blue", "green", "orange"], "범례 색 → 색 이름 변환")
check(de.pick_resolution((900, 600)) == 1024 and de.pick_resolution((1743, 1167)) == 1536, "해상도 선택 규칙")
check(de._parse_json(chr(96) * 3 + 'json' + chr(10) + '{"instruction": "a", "title": "t", "routes": []}' + chr(10) + chr(96) * 3)["title"] == "t", "지시문 JSON 해석(코드펜스)")
check(de.build_workflow("x.png", "p", 1024, 25, 1)["6"]["inputs"]["images.image_1"] == ["5", 0], "Qwen 작업 흐름의 입력 연결")
# Gemini 의 JSON 에서 흔한 문법 오류(후행 쉼표·객체/배열 사이 쉼표 누락·줄바꿈 뒤 쉼표 누락)는 고쳐서 읽는다. 고칠 수 없으면 예전처럼 오류
check(de._parse_json('{"a": [{"x": 1} {"x": 2}], "b": "t",}')["a"][1]["x"] == 2, "객체 사이 쉼표 누락·후행 쉼표를 고쳐 읽어야 함")
check(de._parse_json('{"a": "가", \n "b": "나"\n "c": 3}')["c"] == 3, "줄바꿈 뒤 쉼표 누락을 고쳐 읽어야 함")
check(de._parse_json('{"a": "x, }", "b": [1, 2,]}')["a"] == "x, }", "문자열 안의 쉼표·괄호는 건드리지 않아야 함")
_bad_ok = False
try:
    de._parse_json('{"a": [1, 2')
except Exception:
    _bad_ok = True
check(_bad_ok, "고칠 수 없는 JSON 은 오류여야 함")
check("조닝 다이어그램" in de.fallback_instruction("조닝 다이어그램") and "Do NOT add any new text" in de.fallback_instruction(""), "대체 지시문에 사용자 요청과 글자 보존 문구가 없음")
# 사내 도면 관례의 동선 색(차량·진입=빨강, 보행=파랑, 녹지·산책=초록, 주요·강조=주황)이 지시문 작성 규칙과 대체 지시문에 있어야 함(2026-10-26)
for _t in (de._instruct_prompt("차량과 보행 동선"), de.fallback_instruction("차량과 보행 동선")):
    _lo = _t.lower()
    check("vehicle" in _lo and "pedestrian" in _lo and "red" in _lo and "blue" in _lo and "green" in _lo and "orange" in _lo, "동선 색 관례(차량 빨강·보행 파랑·녹지 초록·주요 주황)가 지시문 규칙에 없음")

# 결과를 편집 가능한 층으로 나누기: 화살표 → 벡터 선, 구역 색 → 농도 마스크 + 기준 색, 바탕에는 선·글자만 남는다
import numpy as _np  # noqa: E402
from services import diagram_vector as dv  # noqa: E402

_q2 = _q.copy()
_q2d = ImageDraw.Draw(_q2)
for _x in range(236, 380, 24):                                      # 오른쪽 방에 초록 파선 + 삼각 화살촉
    _q2d.line([_x, 120, _x + 14, 120], fill=(20, 170, 40), width=7)
_q2d.polygon([(372, 106), (372, 134), (402, 120)], fill=(20, 170, 40))
_pl = de.tint_parts(_o, _q)
check(set(_pl) >= {"O", "Qi", "Of", "Qf", "T", "core", "arrow"} and _pl["core"].shape == (260, 400) and (_pl["arrow"].sum() > _pl["core"].sum()), "tint_parts 가 화살표 마스크(core·부풀린 arrow)와 곱하기 판을 내놓지 않음")
_c0, _a0 = de.composite(_o, _q)
check(_np.array_equal(_a0, _pl["arrow"]), "composite 가 tint_parts 의 화살표 마스크와 달라짐(리팩터링 회귀)")
_lg = [{"color": "#C8E1FA", "kind": "zone", "label": "왼쪽 방"}, {"color": "#F01414", "kind": "flow", "label": "주 동선"}, {"color": "#1450F0", "kind": "flow", "label": "보조 동선"}]
_L = dv.build_layers(_pl, "overlay", _lg)
check(_L is not None and len(_L["arrows"]) == 2 and len(_L["zones"]) == 1, f"화살표 2개·구역 1개로 나눠야 함 {None if _L is None else (len(_L['arrows']), len(_L['zones']))}")
_ra = next(a for a in _L["arrows"] if a["band"] == "red")
_rx = sorted(_ra["pts"], key=lambda p: p[0])
check(abs(_rx[0][1] - 74) < 6 and abs(_rx[-1][1] - 74) < 6 and _rx[0][0] < 60 and _rx[-1][0] > 150 and len(_ra["pts"]) == 2, f"빨간 화살표가 가로 직선(두 점)으로 읽히지 않음 {_ra['pts']}")
check(_ra["color"].startswith("#F") and _ra["width"] >= 5 and _ra["dash"] == "solid" and _ra["head"] == "none", f"빨간 화살표의 색·굵기·실선·화살촉 없음 판정 {_ra}")
_ba = next(a for a in _L["arrows"] if a["band"] == "blue")
_bx = sorted(_ba["pts"], key=lambda p: p[0])
check(_bx[0][0] > 200 and _bx[-1][0] > 330 and abs(_bx[0][1] - 185) < 8, f"파란 화살표 위치 {_ba['pts']}")
_zone = _L["zones"][0]
_mk = _np.asarray(_zone["mask"].resize((400, 260)))
check(_mk[130, 100] > 200 and _mk[130, 300] < 10 and _mk[10, 10] < 10, f"구역 마스크가 칠한 방(왼쪽)만 덮어야 함 {_mk[130, 100]}/{_mk[130, 300]}")
_bs = _L["base"].load()
check(all(v > 235 for v in _bs[60, 60]) and max(_bs[20, 100]) < 60 and all(v > 235 for v in _bs[100, 50]), f"바탕에는 채움 색이 없고 벽 선은 남아야 함 {_bs[60, 60]} {_bs[20, 100]}")
_ar_x, _ar_y = int(_rx[0][0] + 20), 74
check(not (_bs[_ar_x, _ar_y][0] > 200 and _bs[_ar_x, _ar_y][1] < 80), f"바탕에 화살표 색이 남음 {_bs[_ar_x, _ar_y]}")
# 층을 다시 합치면(바탕 × 곱하기) 합성 그림과 거의 같다(화살표 자리 제외)
_rec = _np.asarray(_L["base"]).astype(_np.float32) / 255
_cz = _np.array([int(_zone["color"][i:i + 2], 16) for i in (1, 3, 5)], _np.float32) / 255
_rec = _rec * (1 - (_mk.astype(_np.float32) / 255)[..., None] * (1 - _cz))
_diff = _np.abs(_rec * 255 - _np.asarray(_c0).astype(_np.float32)).mean(axis=2)
_far = ~__import__("scipy.ndimage", fromlist=["x"]).binary_dilation(_pl["arrow"], iterations=6)
check(float(_diff[_far].mean()) < 6, f"바탕×구역 층이 합성 그림과 다름(평균 {float(_diff[_far].mean()):.1f})")
# 파선 + 삼각 화살촉은 화살촉 있는 파선으로
_pl2 = de.tint_parts(_o, _q2)
_L2 = dv.build_layers(_pl2, "overlay", _lg + [{"color": "#14AA28", "kind": "flow", "label": "초록"}])
_ga = [a for a in _L2["arrows"] if a["band"] == "green"]
check(len(_ga) == 1 and _ga[0]["head"] == "end" and _ga[0]["dash"] in ("dashed", "dotted", "dashdot") and _ga[0]["pts"][-1][0] > _ga[0]["pts"][0][0], f"초록 파선 화살표(끝 화살촉)를 못 읽음 {_ga}")
# 같은 색 띠의 화살표는 한 색으로 맞춰지고 범례 색도 그에 맞춰짐
check(len({a["color"] for a in _L["arrows"] if a["band"] == "red"}) == 1 and next(l for l in _L["legend"] if l["label"] == "주 동선")["color"] == _ra["color"], "화살표·범례 색이 같은 색으로 맞춰지지 않음")
check(next(l for l in _L["legend"] if l["kind"] == "zone")["color"] == _zone["color"], "구역 범례 색이 구역 층 색과 다름")
# 사진·3D(model): 화살표 자리가 메워진 바탕, 새로 칠해진 색은 color 혼합 층
_O3 = Image.new("RGB", (300, 200), (150, 190, 230))
ImageDraw.Draw(_O3).rectangle([0, 120, 300, 200], fill=(60, 140, 50))
_Q3 = _O3.copy()
_q3d = ImageDraw.Draw(_Q3)
_q3d.rectangle([40, 30, 140, 110], fill=(190, 90, 60))              # 새로 칠한 주황 면
_q3d.line([160, 60, 270, 60], fill=(250, 220, 10), width=9)         # 노란 화살표
_p3 = de.tint_parts(_O3, _Q3)
_L3 = dv.build_layers(_p3, "model", [{"color": "#BE5A3C", "kind": "zone", "label": "코어"}, {"color": "#FADC0A", "kind": "flow", "label": "동선"}])
check(_L3 is not None and len(_L3["arrows"]) == 1 and len(_L3["zones"]) == 1 and _L3["zones"][0]["blend"] == "color", f"사진 결과: 화살표 1·색 혼합 구역 1로 나눠야 함 {None if _L3 is None else (len(_L3['arrows']), [z.get('blend') for z in _L3['zones']])}")
_b3 = _L3["base"].load()
check(abs(_b3[215, 60][0] - 150) < 25 and abs(_b3[215, 60][2] - 230) < 25, f"사진 바탕에서 화살표 자리가 둘레 색으로 메워지지 않음 {_b3[215, 60]}")
check(dv.build_layers(de.tint_parts(_O3, _O3), "model", []) is None and dv.build_layers(de.tint_parts(_o, _o), "overlay", []) is None, "바뀐 게 없으면 층 나누기는 None(합성 그림 그대로 사용)")
# 얇은 점선 + 떨어진 화살촉, 채도 높은 구역 면(구역 색 띠 제외), 화살촉만 있는 덩어리
_O5 = Image.new("RGB", (800, 520), "white")
ImageDraw.Draw(_O5).rectangle([20, 20, 780, 500], outline="black", width=3)
_Q5 = _O5.copy()
_q5 = ImageDraw.Draw(_Q5)
_q5.rectangle([60, 60, 300, 200], fill=(255, 214, 0))             # 구역 범례가 있는 노란색 면(선으로 착각하면 안 됨)
_x5 = 80
while _x5 < 600:
    _q5.line([_x5, 300, _x5 + 4, 300], fill=(20, 170, 40), width=2)   # 가는 초록 점선(점 4, 사이 8)
    _x5 += 12
_q5.polygon([(612, 286), (612, 314), (650, 300)], fill=(20, 170, 40))
_leg5 = [{"color": "#14AA28", "kind": "flow", "label": "보조 동선"}, {"color": "#FFD600", "kind": "zone", "label": "구역"}]
_L5 = dv.build_layers(de.tint_parts(_O5, _Q5), "overlay", _leg5)
_g5 = [a for a in _L5["arrows"] if a["band"] == "green"]
check(len(_L5["arrows"]) == 1 and len(_g5) == 1 and _g5[0]["head"] == "end" and _g5[0]["length"] > 450 and _g5[0]["pts"][-1][0] > 600 and _g5[0]["pts"][0][0] < 100, f"가는 점선 + 화살촉이 한 화살표(끝 화살촉)로 읽히지 않음 {[(a['band'], a['head'], a['length']) for a in _L5['arrows']]}")
check(all(a["band"] != "yellow" for a in _L5["arrows"]) and len(_L5["zones"]) == 1, "구역 범례가 있는 색 띠의 채움 면을 화살표로 읽음")
_Q6 = _O5.copy()
ImageDraw.Draw(_Q6).polygon([(412, 286), (412, 314), (450, 300)], fill=(20, 170, 40))
_L6 = dv.build_layers(de.tint_parts(_O5, _Q6), "overlay", _leg5[:1])
check(len(_L6["arrows"]) == 1 and _L6["arrows"][0]["head"] == "end" and _L6["arrows"][0]["pts"][-1][0] > _L6["arrows"][0]["pts"][0][0] + 20 and abs(_L6["arrows"][0]["pts"][0][1] - 300) < 4, f"떨어진 화살촉 하나는 방향이 맞는 짧은 화살표여야 함 {_L6['arrows']}")
_Q7 = _O5.copy()
ImageDraw.Draw(_Q7).polygon([(300, 200), (330, 200), (315, 160)], fill=(20, 170, 40))
_L7 = dv.build_layers(de.tint_parts(_O5, _Q7), "overlay", _leg5[:1])
check(len(_L7["arrows"]) == 1 and _L7["arrows"][0]["pts"][-1][1] < _L7["arrows"][0]["pts"][0][1] - 20, "위로 향한 화살촉의 방향(끝이 위)")

# 구역 칠하기를 코드가 한다(2026-10-26): Gemini 는 '방 이름·방 범위·구역 묶음'만, 칠은 벽선에 맞춰 단색으로. 원본은 칠한 곳 밖에서 한 점도 바뀌지 않는다
from services import diagram_zone as dz  # noqa: E402

_zi = Image.new("RGB", (600, 400), "white")
_zd = ImageDraw.Draw(_zi)
for _r in ([40, 100, 240, 260], [240, 100, 440, 260], [40, 260, 440, 360]):          # 방 3개(아래 방은 가로로 긴 한 칸), 벽 2px
    _zd.rectangle(_r, outline="black", width=2)
_zd.line([240, 160, 240, 190], fill="white", width=3)                               # 가운데 벽에 문 틈(30px)
_zd.rectangle([90, 150, 130, 190], outline=(80, 80, 80), width=1)                   # 방 안의 가구(가는 선) — 칠이 이 선 때문에 끊기면 안 됨
_zd.text((100, 120), "A", fill="black")
# 방 B 의 범위 상자는 위쪽 벽 밖(바깥 공간)으로 30px 넘치게 준다
_plan = {"zones": [
    {"color": "red", "label": "가공", "rooms": [{"name": "A", "label_box_2d": [295, 163, 330, 185], "room_box_2d": [240, 60, 660, 407]}]},
    {"color": "blue", "label": "연구", "rooms": [{"name": "B", "label_box_2d": [425, 550, 475, 600], "room_box_2d": [175, 393, 665, 740]}, {"name": "C", "label_box_2d": [750, 333, 800, 400], "room_box_2d": [640, 60, 910, 740]}]},
]}
_Z = dz.parse_zone_plan(_plan, _zi.size)
check(len(_Z) == 2 and _Z[0]["color"] == "red" and len(_Z[1]["rooms"]) == 2 and _Z[0]["rooms"][0]["room_box"] == (36, 96, 244, 264), f"구역 계획 해석(0~1000 상자 → 화소) {_Z[:1]}")
check(dz.parse_zone_plan(None, (600, 400)) == [] and dz.parse_zone_plan({"zones": "x"}, (600, 400)) == [] and dz.parse_zone_plan({"zones": []}, (600, 400)) == [], "구역 계획이 비었거나 이상하면 빈 목록")
_bad = {"zones": [{"color": "pink", "label": "x", "rooms": [{"name": "a", "label_box_2d": [0, 0, 10, 10], "room_box_2d": [0, 0, 100, 100]}]},
                  {"color": "red", "label": "역전", "rooms": [{"name": "a", "label_box_2d": [0, 0, 10, 10], "room_box_2d": [500, 500, 400, 600]}, {"name": "큼", "label_box_2d": [0, 0, 10, 10], "room_box_2d": [0, 0, 1000, 1000]}]},
                  {"color": "green", "label": "G" * 40, "rooms": [{"name": "ok", "label_box_2d": [100, 100, 120, 130], "room_box_2d": [90, 90, 300, 300]}]},
                  {"color": "green", "label": "중복", "rooms": [{"name": "dup", "label_box_2d": [500, 500, 520, 530], "room_box_2d": [490, 490, 600, 600]}]}]}
_B = dz.parse_zone_plan(_bad, (600, 400))
check([z["color"] for z in _B] == ["green"] and len(_B[0]["rooms"]) == 2 and len(_B[0]["label"]) <= 20, f"모르는 색·뒤집힌 상자·화면 전체 상자는 버리고 같은 색은 합침 {_B}")
check(len(dz.parse_zone_plan({"zones": [{"color": c, "label": c, "rooms": [{"name": c, "label_box_2d": [10, 10, 20, 20], "room_box_2d": [5 + i, 5, 100 + i, 100]}]} for i, c in enumerate(["red", "orange", "yellow", "green", "blue", "purple"])]}, (600, 400))) == 5, "구역은 최대 5개")
# 상자가 벽에서 조금 벗어나 있어도 벽선에 붙는다
_dark = _np.asarray(_zi.convert("L"), _np.float32) < 120
_sn = dz.snap_box(_dark, (47, 108, 233, 252))
check(all(abs(a - b) <= 1 for a, b in zip(_sn, (40, 100, 240, 260))), f"방 범위 상자가 벽선에 붙지 않음 {_sn}")
check(dz.snap_box(_dark, (300, 300, 330, 330)) == (300, 300, 330, 330), "근처에 벽이 없으면 상자를 그대로")
_pl, _lg2, _st = dz.build_plate(_zi, _Z)
_plc = lambda x, y: tuple(int(round(v * 255)) for v in _pl[y, x])
check(_pl.shape == (400, 600, 3) and _plc(150, 130) == dz.ZONE_FILL_RGB["red"] and _plc(350, 130) == dz.ZONE_FILL_RGB["blue"] and _plc(240, 310) == dz.ZONE_FILL_RGB["blue"], f"방 안이 구역 색 단색이 아님 {_plc(150, 130)} {_plc(350, 130)} {_plc(240, 310)}")
check(_plc(110, 170) == dz.ZONE_FILL_RGB["red"], "방 안 가구 선의 안쪽까지 칠해져야 함(구멍 메우기)")
check(_plc(300, 105 - 12) == (255, 255, 255) and _plc(300, 20) == (255, 255, 255) and _plc(500, 130) == (255, 255, 255), "벽 밖(범위 상자가 넘친 곳·바깥)은 칠하면 안 됨")
check(_plc(246, 175) == dz.ZONE_FILL_RGB["blue"] and _plc(234, 175) == dz.ZONE_FILL_RGB["red"], "문 틈이 있어도 옆 방 색이 번지면 안 됨")
check([(l["kind"], l["label"]) for l in _lg2] == [("zone", "가공"), ("zone", "연구")] and _lg2[0]["color"].upper() == "#%02X%02X%02X" % dz.ZONE_FILL_RGB["red"], f"구역 범례 {_lg2}")
check(_st["rooms"] == 3 and _st["filled"] == 3 and _st["rect_fallback"] <= 1, f"방 통계 {_st}")
# 방 이름이 작은 닫힌 칸(상자의 15% 미만)에 갇히면 상자 전체를 칠한다
_zi2 = _zi.copy()
ImageDraw.Draw(_zi2).line([40, 114, 240, 114], fill="black", width=2)
ImageDraw.Draw(_zi2).line([40, 118, 240, 118], fill="black", width=2)
_z2 = dz.parse_zone_plan({"zones": [{"color": "red", "label": "가공", "rooms": [{"name": "A", "label_box_2d": [260, 160, 280, 190], "room_box_2d": [250, 60, 650, 407]}]}]}, _zi2.size)
_pl2, _l2, _s2 = dz.build_plate(_zi2, _z2)
check(_s2["rect_fallback"] == 1 and tuple(int(round(v * 255)) for v in _pl2[235, 100]) == dz.ZONE_FILL_RGB["red"], f"칸이 아주 작게 갇히면 상자 전체 칠 {_s2}")
# 상자가 방보다 훨씬 크게 잡혀도(칸이 상자의 절반 남짓) 방 칸만 칠하고 바깥으로 넘치지 않는다
_oi = Image.new("RGB", (600, 400), "white")
ImageDraw.Draw(_oi).rectangle([200, 120, 400, 280], outline="black", width=2)
ImageDraw.Draw(_oi).text((290, 190), "R", fill="black")
_oz = dz.parse_zone_plan({"zones": [{"color": "red", "label": "R", "rooms": [{"name": "R", "label_box_2d": [470, 480, 490, 500], "room_box_2d": [175, 100, 775, 600]}]}]}, _oi.size)
_op, _ol, _os = dz.build_plate(_oi, _oz)
_opc = lambda x, y: tuple(int(round(v * 255)) for v in _op[y, x])
check(_opc(300, 200) == dz.ZONE_FILL_RGB["red"] and _opc(150, 200) == (255, 255, 255) and _opc(300, 90) == (255, 255, 255) and _opc(450, 200) == (255, 255, 255) and _os["rect_fallback"] == 0, f"상자가 방보다 크면 방 칸만 칠해야 함 {_os} {_opc(300, 200)} {_opc(150, 200)}")
# 합성: 칠한 판을 곱한다 — 칠한 방 밖은 원본과 한 점도 다르지 않고, 벽은 그대로 검다
_qz = _zi.copy()
ImageDraw.Draw(_qz).line([60, 330, 400, 330], fill=(240, 20, 20), width=9)         # Qwen 이 그린 빨간 화살표(구역 칠은 쓰지 않는다)
ImageDraw.Draw(_qz).rectangle([45, 105, 235, 255], fill=(200, 225, 250))             # Qwen 이 멋대로 칠한 연한 파랑 — 무시돼야 함
_cz, _az = de.composite(_zi, _qz, plate=_pl)
_oa2, _ca2 = _np.asarray(_zi), _np.asarray(_cz)
_outside = (_pl.min(axis=2) >= 0.999) & ~__import__("scipy.ndimage", fromlist=["x"]).binary_dilation(_az, iterations=3)
check(int(_np.abs(_oa2.astype(int) - _ca2.astype(int))[_outside].max()) == 0, "칠한 방과 화살표 밖의 원본이 바뀜(원본 보존)")
check(max(_ca2[100, 100]) < 60 and tuple(_ca2[130, 150]) == dz.ZONE_FILL_RGB["red"] and _ca2[330, 200][0] > 200 and _ca2[330, 200][1] < 80, f"벽은 검고 방은 구역 색, 화살표는 빨강 {_ca2[100, 100]} {_ca2[130, 150]} {_ca2[330, 200]}")
check(tuple(_ca2[230, 60]) == dz.ZONE_FILL_RGB["red"], "Qwen 이 칠한 파랑이 아니라 칠한 판의 색이어야 함")
_f, _fa, _how = de.finish(_zi, _qz, plate=_pl)
check(_how == "overlay" and _np.array_equal(_np.asarray(_f), _ca2), "finish 가 칠한 판을 합성에 쓰지 않음")
check(de.composite(_zi, _qz)[0].getpixel((60, 230)) != dz.ZONE_FILL_RGB["red"], "칠한 판이 없으면 예전 방식(Qwen 채움)이어야 함")
# 지시문: 구역을 코드가 칠하는 모드에서는 Qwen 에게 칠하라고 하지 않는다
_pz = de._instruct_prompt("연구실을 기능별로 구역 표시", allow_zones=True)
check("room_box_2d" in _pz and "label_box_2d" in _pz and '"zones"' in _pz and '"arrows"' in _pz and "must NOT ask the editing model to color" in _pz, "구역 모드 지시문에 방 범위·구역·arrows 안내가 없음")
check("room_box_2d" not in de._instruct_prompt("동선 표시") and "room_box_2d" not in de._instruct_prompt("동선 표시", allow_zones=False), "구역 모드가 아니면 지시문이 예전 그대로여야 함")
# build_plan: Gemini 응답을 흉내 내어 구역·화살표 여부를 읽는다
import json as _json  # noqa: E402
from services import gemini_chat as _G  # noqa: E402
_g_saved = _G.gemini_chat_completion
_calls = []


def _fake_gemini(model, messages, **kw):
    _calls.append(messages[0]["content"][:40])
    return _json.dumps({"instruction": "", "title": "구역도", "legend": [], "zones": _plan["zones"], "arrows": False}, ensure_ascii=False)


_G.gemini_chat_completion = _fake_gemini
_saved = (de.run_qwen, de.verify_zone_legend, de._out_dir)
try:
    _buf = __import__("io").BytesIO()
    _zi.save(_buf, "PNG")
    _bp = de.build_plan(_buf.getvalue(), "구역 표시", allow_zones=True)
    check(_bp["source"] == "gemini" and _bp["arrows"] is False and len(_bp["zones"]) == 2 and _bp["title"] == "구역도", f"build_plan 이 구역·arrows=false 를 읽지 못함 {_bp}")
    # 구역만 요청: Qwen 을 부르면 안 되고, 합성·범례·층이 코드 칠로 만들어진다(검증 단계의 Gemini 도 부르지 않는다)
    _tmp = __import__("tempfile").mkdtemp()

    def _no_qwen(*a, **k):
        raise AssertionError("구역만 요청인데 Qwen 을 불렀음")

    def _no_verify(*a, **k):
        raise AssertionError("코드가 칠했는데 범례 확인(Gemini)을 또 불렀음")

    de.run_qwen, de.verify_zone_legend, de._out_dir = _no_qwen, _no_verify, (lambda: _tmp)
    de.JOBS["zt"] = {"status": "queued", "created": 0}
    de._run("zt", _buf.getvalue(), "구역 표시", 25, 1)
    _jr = de.JOBS["zt"]
    check(_jr.get("status") == "done", f"구역만 요청한 작업이 끝나지 않음 {_jr.get('status')} {_jr.get('error')}")
    if _jr.get("status") == "done":
        _rs = _jr["result"]
        check(_rs["finish"] == "overlay" and _rs["legend_verified"] is True and [l["label"] for l in _rs["legend"] if l["kind"] == "zone"] == ["가공", "연구"], f"결과 범례 {_rs['legend']}")
        check(_rs["layers"] is not None and len(_rs["layers"]["zones"]) == 2 and not _rs["layers"]["arrows"], f"구역 층 2개·화살표 없음이어야 함 {None if _rs['layers'] is None else (len(_rs['layers']['zones']), len(_rs['layers']['arrows']))}")
        _out = _np.asarray(Image.open(__import__("os").path.join(_tmp, "diagram_edit_zt.png")).convert("RGB"))
        check(tuple(_out[130, 150]) == dz.ZONE_FILL_RGB["red"] and int(_np.abs(_np.asarray(_zi).astype(int) - _out.astype(int))[_pl.min(axis=2) >= 0.999].max()) == 0, "결과 그림이 칠한 방 밖에서 원본과 다름")
finally:
    _G.gemini_chat_completion = _g_saved
    de.run_qwen, de.verify_zone_legend, de._out_dir = _saved

# 옅은 회색 벽선: 가까운 옅은 선이 멀리 있는 뚜렷한 선보다 우선하고, 회색 벽도 칠이 넘치는 것을 막는다(사내 평면도의 이중 벽선은 회색)
_fi = Image.new("RGB", (600, 400), "white")
_fd = ImageDraw.Draw(_fi)
_fd.rectangle([40, 100, 240, 260], outline=(185, 185, 185), width=2)       # 방: 옅은 회색 벽(185)
_fd.line([40, 285, 240, 285], fill="black", width=3)                        # 25px 아래의 뚜렷한 벽(이웃 방의 윗벽)
_fl = _np.asarray(_fi.convert("L"), _np.float32)
_fk = dz.snap_box(_fl < dz.DARK_THR, (40, 100, 240, 263), tol=30, faint=_fl < dz.FAINT_THR)
check(all(abs(a - b) <= 2 for a, b in zip(_fk, (40, 100, 240, 260))), f"가까운 옅은 벽선(아래변)이 멀리 있는 뚜렷한 선보다 우선해야 함 {_fk}")
check(abs(dz.snap_box(_fl < dz.DARK_THR, (40, 100, 240, 263), tol=30)[3] - 285) <= 2, "옅은 선 단계가 없으면(faint 없음) 넓은 단계의 뚜렷한 선을 고름")
_gi = Image.new("RGB", (600, 400), "white")
ImageDraw.Draw(_gi).rectangle([40, 100, 240, 260], outline=(160, 160, 160), width=2)    # 회색(160) 벽
ImageDraw.Draw(_gi).text((100, 150), "R", fill="black")
_gz = dz.parse_zone_plan({"zones": [{"color": "green", "label": "G", "rooms": [{"name": "R", "label_box_2d": [360, 160, 380, 185], "room_box_2d": [200, 40, 650, 410]}]}]}, _gi.size)
_gp, _gl, _gs = dz.build_plate(_gi, _gz)
check(tuple(int(round(v * 255)) for v in _gp[200, 100]) == dz.ZONE_FILL_RGB["green"] and tuple(int(round(v * 255)) for v in _gp[88, 100]) == (255, 255, 255) and _gs["rect_fallback"] == 0, f"회색 벽 밖(넘친 곳)은 칠하면 안 됨 {_gs}")

# 구역을 요청하지 않은 동선 표시: Qwen 의 채움(곱하기 판)을 쓰지 않아 원본 색이 변하지 않고, 범례에는 동선만 있다
_saved2 = (de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server)
_tmp2 = __import__("tempfile").mkdtemp()
_fb = __import__("io").BytesIO()
_g2 = Image.new("RGB", (400, 260), "white")                                # 흰 종이 도면 + 왼쪽에 회색 도로 띠(Qwen 이 어둡게 다시 그리던 곳)
_g2d = ImageDraw.Draw(_g2)
_g2d.rectangle([0, 0, 90, 260], fill=(190, 190, 190))
_g2d.rectangle([120, 60, 340, 200], outline="black", width=3)
_g2.save(_fb, "PNG")
_qwen_out = _g2.point(lambda v: int(v * 0.8))                              # Qwen 이 전체를 어둡게 다시 그림
ImageDraw.Draw(_qwen_out).line([80, 130, 320, 130], fill=(240, 20, 20), width=9)
ImageDraw.Draw(_qwen_out).rectangle([20, 20, 50, 50], fill=(200, 225, 250))   # 엉뚱하게 칠한 연한 파랑


def _flows_plan(png, ask, allow_zones=False, source="gemini"):
    return {"instruction": "x" * 80, "title": "동선도", "legend": [{"color": "red", "kind": "flow", "label": "차량 동선"}], "source": source, "zones": [], "arrows": True, "zones_asked": False}


def _fake_qwen(*a, **k):
    return _qwen_out


try:
    de.build_plan = _flows_plan
    de.run_qwen, de._out_dir, de._up, de._free, de.ensure_server = _fake_qwen, (lambda: _tmp2), (lambda *a, **k: True), (lambda *a, **k: None), (lambda *a, **k: None)
    de.verify_zone_legend = lambda *a, **k: (_ for _ in ()).throw(AssertionError("구역이 없는 동선 요청인데 범례 확인(Gemini)을 불렀음"))
    de.JOBS["ft"] = {"status": "queued", "created": 0}
    de._run("ft", _fb.getvalue(), "차량 동선", 25, 1)
    _fr = de.JOBS["ft"]
    check(_fr.get("status") == "done", f"구역 없는 동선 작업이 끝나지 않음 {_fr.get('status')} {_fr.get('error')}")
    if _fr.get("status") == "done":
        _rr = _fr["result"]
        check(_rr["zone_fill"] == "none" and all(l["kind"] == "flow" for l in _rr["legend"]) and [l["label"] for l in _rr["legend"]] == ["차량 동선"], f"동선만 요청하면 범례에는 동선만 있어야 함 {_rr['legend']}")
        _fo = _np.asarray(Image.open(__import__("os").path.join(_tmp2, "diagram_edit_ft.png")).convert("RGB")).astype(int)
        _go = _np.asarray(_g2).astype(int)
        _far2 = ~__import__("scipy.ndimage", fromlist=["x"]).binary_dilation(_np.abs(_fo - _go).sum(axis=2) > 60, iterations=12)
        check(int(_np.abs(_fo[20:50, 20:50] - _go[20:50, 20:50]).max()) == 0 and int(_np.abs(_fo[225:255, 5:60] - _go[225:255, 5:60]).max()) == 0, "Qwen 이 칠한 연한 파랑이나 어두워진 회색이 결과에 남음(원본 훼손)")
        check(_fo[130, 200][0] > 200 and _fo[130, 200][1] < 90, f"동선 화살표(빨강)는 얹혀야 함 {_fo[130, 200]}")
    # Gemini 가 안 돼 일반 지시문(fallback)으로 갈 때는 예전처럼 Qwen 채움을 쓴다
    de.build_plan = lambda png, ask, allow_zones=False: _flows_plan(png, ask, allow_zones, source="fallback")
    de.verify_zone_legend = lambda final, legend: (legend, True)
    de.JOBS["fb"] = {"status": "queued", "created": 0}
    de._run("fb", _fb.getvalue(), "구역과 동선", 25, 1)
    _fbr = de.JOBS["fb"]
    check(_fbr.get("status") == "done" and _fbr["result"]["zone_fill"] == "model", f"fallback 지시문이면 예전 방식(zone_fill=model) {_fbr.get('status')} {_fbr.get('result', {}).get('zone_fill')}")
finally:
    de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server = _saved2

# Qwen 그림 서버가 도중에 멈추면(연결 거부) 서버를 다시 켜서 한 번만 다시 해 본다. 모델 오류(RuntimeError)는 다시 하지 않는다
import urllib.error as _ue  # noqa: E402
_saved3 = (de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server)
_calls3 = {"qwen": 0, "ensure": 0}


def _flaky_qwen(*a, **k):
    _calls3["qwen"] += 1
    if _calls3["qwen"] == 1:
        raise _ue.URLError(ConnectionRefusedError(10061, "refused"))
    return _qwen_out


def _count_ensure(*a, **k):
    _calls3["ensure"] += 1


try:
    de.build_plan = _flows_plan
    de.run_qwen, de._out_dir, de._up, de._free, de.ensure_server = _flaky_qwen, (lambda: _tmp2), (lambda *a, **k: True), (lambda *a, **k: None), _count_ensure
    de.verify_zone_legend = lambda final, legend: (legend, True)
    de.JOBS["rt"] = {"status": "queued", "created": 0}
    de._run("rt", _fb.getvalue(), "차량 동선", 25, 1)
    check(de.JOBS["rt"].get("status") == "done" and _calls3 == {"qwen": 2, "ensure": 2}, f"그림 서버 연결이 끊기면 서버를 다시 켜고 한 번 다시 해야 함 {de.JOBS['rt'].get('status')} {de.JOBS['rt'].get('error')} {_calls3}")
    _calls3.update(qwen=0, ensure=0)
    de.run_qwen = lambda *a, **k: (_calls3.__setitem__("qwen", _calls3["qwen"] + 1), (_ for _ in ()).throw(_ue.URLError(ConnectionRefusedError(10061, "refused"))))[1]
    de.JOBS["rt2"] = {"status": "queued", "created": 0}
    de._run("rt2", _fb.getvalue(), "차량 동선", 25, 1)
    check(de.JOBS["rt2"].get("status") == "error" and _calls3["qwen"] == 2, f"두 번 다 끊기면 실패로 끝나야 함(무한 반복 금지) {de.JOBS['rt2'].get('status')} {_calls3}")
    _calls3.update(qwen=0, ensure=0)
    de.run_qwen = lambda *a, **k: (_calls3.__setitem__("qwen", _calls3["qwen"] + 1), (_ for _ in ()).throw(RuntimeError("그림 서버에서 오류가 났습니다")))[1]
    de.JOBS["rt3"] = {"status": "queued", "created": 0}
    de._run("rt3", _fb.getvalue(), "차량 동선", 25, 1)
    check(de.JOBS["rt3"].get("status") == "error" and _calls3["qwen"] == 1, f"모델 오류는 다시 하지 않아야 함 {de.JOBS['rt3'].get('status')} {_calls3}")
finally:
    de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server = _saved3

# 동선 경로를 코드가 찾는다(2026-10-26, B): Gemini 는 '출발·경유·도착'(종류·순서·열린 공간 위의 점)만, 길은 도면의 벽·복도를 비용 지도로 삼아 코드가 찾고 사내 문법의 벡터 화살표로 그린다
from services import diagram_route as dr  # noqa: E402

_ri = Image.new("RGB", (600, 400), "white")
_rd = ImageDraw.Draw(_ri)
_rd.rectangle([298, 0, 301, 399], fill="black")                  # 가운데 세로 벽(4px)
_rd.rectangle([298, 130, 301, 148], fill="white")                # 벽의 문 틈(19px) — 출발·도착 높이(y=100)에서 30~48px 아래
# 0~1000 → 화소: x = v*0.6, y = v*0.4
_rp = {"routes": [
    {"label": "주 동선: 출입구→홀", "kind": "main", "via": [{"name": "출입구", "point_2d": [250, 167]}, {"name": "홀", "point_2d": [250, 833]}]},
    {"label": "보행", "kind": "pedestrian", "via": [{"name": "a", "point_2d": [900, 100]}, {"name": "b", "point_2d": [900, 200]}, {"name": "c", "point_2d": [850, 300]}]},
    {"label": "차량", "kind": "vehicle", "via": [{"name": "한 점만", "point_2d": [500, 500]}]},
    {"label": "나쁜 점", "kind": "vehicle", "via": [{"name": "x", "point_2d": [2000, 100]}, {"name": "y", "point_2d": "z"}]},
    {"label": "L" * 40, "kind": "unknown", "via": [{"name": "p", "point_2d": [100, 100]}, {"name": "q", "point_2d": [100, 100]}, {"name": "r", "point_2d": [200, 400]}]},
]}
_R = dr.parse_routes(_rp, _ri.size)
check(len(_R) == 3 and [r["kind"] for r in _R] == ["main", "pedestrian", "other"], f"경로 해석: 점이 모자라거나 이상한 경로는 버림 {[(r['kind'], len(r['points'])) for r in _R]}")
check(_R[0]["color"] == "orange" and _R[1]["color"] == "blue" and _R[2]["color"] in dr.ROUTE_COLORS and _R[0]["points"] == [(100, 100), (500, 100)], f"종류별 색(주=주황·보행=파랑)과 화소 좌표 {_R[0]}")
check(len(_R[2]["label"]) <= 16 and len(_R[2]["points"]) == 2, "라벨은 16자까지, 겹치는 연속 점은 하나로")
check(dr.parse_routes(None, (600, 400)) == [] and dr.parse_routes({"routes": "x"}, (600, 400)) == [] and len(dr.parse_routes({"routes": [_rp["routes"][0]] * 9}, (600, 400))) == 6, "경로가 비었거나 이상하면 빈 목록, 최대 6개")
# 길 찾기: 가운데 벽을 그대로 뚫지 않고 문 틈으로 돌아가며, 벽을 못 건너는 경우에도 길은 나온다
_cg = dr.cost_grid(_ri)
_pa, _sa = dr.find_path(_cg, [(100, 100), (500, 100)])
def _y_at(path, x):      # 꺾은선이 세로선 x 를 지나는 높이
    for p, q in zip(path, path[1:]):
        if (p[0] - x) * (q[0] - x) <= 0 and p[0] != q[0]:
            return p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])
    return None


_yd = _y_at(_pa, 300)
check(_yd is not None and 128 <= _yd <= 150 and _sa["wall_cells"] == 0, f"문 틈(y 130~148)으로 지나야 함 y={_yd} {_sa}")
check(abs(_pa[0][0] - 100) <= 6 and abs(_pa[-1][0] - 500) <= 6 and abs(_pa[0][1] - 100) <= 6 and abs(_pa[-1][1] - 100) <= 6, f"출발·도착점이 맞아야 함 {_pa[0]} {_pa[-1]}")
check(len(_pa) <= 8, f"경로가 곧게 펴져야 함(계단 모양 금지) {len(_pa)}점")
_ri2 = Image.new("RGB", (600, 400), "white")
ImageDraw.Draw(_ri2).rectangle([298, 0, 301, 399], fill="black")                  # 문이 없는 벽
_pb, _sb = dr.find_path(dr.cost_grid(_ri2), [(100, 100), (500, 100)])
check(len(_pb) >= 2 and _sb["wall_cells"] >= 1, f"벽을 건널 수밖에 없으면 건너고 그 수를 알려야 함 {_sb}")
_pc, _sc = dr.find_path(_cg, [(100, 100), (300, 50), (500, 100)])                 # 경유점이 벽 위에 있어도 벽 밖으로 옮겨 쓴다
check(len(_pc) >= 3 and _sc["wall_cells"] <= 2, f"벽 위의 경유점을 옮겨 쓰지 못함 {_sc}")
# 화살표 목록(화면이 읽는 형식)과 그리기
_A, _lgf, _stA = dr.build_arrows(_ri, _R[:2])
check(len(_A) == 2 and all(set(("pts", "width", "color", "head", "dash", "smooth", "band", "length")) <= set(a) for a in _A), f"화살표 항목 형식 {[sorted(a) for a in _A[:1]]}")
_a0 = _A[0]
check(_a0["head"] == "end" and _a0["color"] == dr.ROUTE_COLORS["orange"] and _a0["band"] == "orange" and _a0["dash"] == "dashed" and _a0["width"] > 0 and abs(_a0["pts"][0][0] - 100) <= 6 and abs(_a0["pts"][-1][0] - 500) <= 6, f"주 동선 화살표: 끝 화살촉·주황·점선 {_a0}")
check(_A[1]["color"] == dr.ROUTE_COLORS["blue"] and _A[1]["dash"] == "dashed" and all(a["dash"] == "dashed" for a in _A), "동선 화살표는 모두 점선(앱의 동선 관례), 보행은 파랑")
check([(l["kind"], l["label"]) for l in _lgf] == [("flow", "주 동선: 출입구→홀"), ("flow", "보행")] and _lgf[0]["color"] == _a0["color"], f"동선 범례 {_lgf}")
check(_stA["routes"] == 2 and "wall_cells" in _stA, f"통계 {_stA}")
_dg = dr.draw_arrows(_ri, _A)
_dq = _np.asarray(_dg).astype(int)
_mid = _a0["pts"][len(_a0["pts"]) // 2]
_sm = lambda a_: (int(round((a_["pts"][0][0] + a_["pts"][1][0]) / 2)), int(round((a_["pts"][0][1] + a_["pts"][1][1]) / 2)))     # 첫 선분의 가운데
def _orange_share(img_arr, a_):     # 그려진 꺾은선을 따라(점 둘레 1화소 안에) 주황 화소가 있는 점의 비율(점선이라 틈이 있고 선이 가늘다)
    pts_ = [tuple(p) for p in a_["pts"]]
    ks = [(int(round(p[0] + (q[0] - p[0]) * t / 20)), int(round(p[1] + (q[1] - p[1]) * t / 20))) for p, q in zip(pts_, pts_[1:]) for t in range(21)]
    hit = 0
    for x, y in ks:
        win = img_arr[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 3)
        if ((win[:, 0] > 200) & (win[:, 2] < 130) & (win[:, 1] < 190)).any():
            hit += 1
    return hit / len(ks)


check(_dg.size == _ri.size and _orange_share(_dq, _a0) >= 0.4, f"그린 화살표(주황 점선)가 경로 위에 있어야 함 {_orange_share(_dq, _a0):.2f}")
_far = _np.abs(_dq - _np.asarray(_ri).astype(int)).sum(axis=2)
check(int(_far[200:, 350:].max()) == 0 and int(_far[:60, :].max()) == 0, "화살표에서 먼 곳의 원본은 그대로")
check(dr.draw_arrows(_ri, []).tobytes() == _ri.tobytes(), "화살표가 없으면 그림 그대로")

# 표현: 큰 도면(1820px)에서 AI 방식의 화살표(5.5~7.5px 점선)만큼 굵고, 꼭짓점이 적고(≤9), 부드러운 곡선이다
_bi = Image.new("RGB", (1820, 1287), "white")
_bd = ImageDraw.Draw(_bi)
for _x in range(100, 1700, 9):                                     # 가는 세로선 여러 개(주차 구획 같은 잔 선) — 곧게 펴기가 자꾸 끊겨 꼭짓점이 많아지는 상황
    _bd.line([_x, 300, _x, 900], fill=(120, 120, 120), width=1)
_bR = [{"label": "주 동선", "kind": "main", "color": "orange", "dash": "dashed", "points": [(60, 600), (1750, 650)]},
       {"label": "차량", "kind": "vehicle", "color": "red", "dash": "dashed", "points": [(60, 200), (900, 240), (1750, 200)]}]
_bA, _bl, _bs = dr.build_arrows(_bi, _bR)
check(len(_bA) == 2 and _bA[0]["width"] >= 6.5 and _bA[1]["width"] >= 5.5 and all(a["dash"] == "dashed" and a["smooth"] is False for a in _bA), f"굵기·점선·직선(곡선 아님: smooth=False) {[(a['width'], a['dash'], a['smooth']) for a in _bA]}")
check(all(len(a["pts"]) <= 7 for a in _bA), f"꼭짓점 수는 7개 이하(직선 구간을 이은 단순한 꺾은선) {[len(a['pts']) for a in _bA]}")
_zz = [(float(x), 300 + (12 if (x // 40) % 2 else -12)) for x in range(0, 1200, 20)]
_zs = dr.simplify_path(_zz, eps=30.0, max_pts=9)
check(len(_zs) <= 9 and _zs[0] == _zz[0] and _zs[-1] == _zz[-1], f"지그재그는 시작·끝을 지키며 9점 이하로 줄어야 함 {len(_zs)}")
check(not hasattr(dr, "spline_points"), "곡선(스플라인) 처리는 없어야 함 — 선은 직선만")
_sx = dr.snap_axes([(0.0, 0.0), (100.0, 6.0), (104.0, 100.0), (200.0, 140.0)], tol_deg=14.0)
check(_sx == [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (200.0, 140.0)], f"거의 수평·수직인 구간은 정확한 수평·수직으로(시작·끝은 그대로, 비스듬한 구간은 그대로) {_sx}")
_sy = dr.snap_axes([(0.0, 0.0), (100.0, 40.0), (200.0, 80.0)], tol_deg=14.0)
check(_sy == [(0.0, 0.0), (100.0, 40.0), (200.0, 80.0)], f"비스듬한 직선(약 22°)은 건드리지 않음 {_sy}")
_sb = dr.snap_axes([(0.0, 0.0), (100.0, 6.0), (104.0, 100.0), (200.0, 140.0)], tol_deg=14.0, bad=lambda p: p == (100.0, 0.0))
check(_sb[1] == (100.0, 6.0), f"맞춘 자리가 벽·글자 위면 맞추지 않고 원래 자리로 {_sb}")
_ar = dr.build_arrows(_bi, _bR)[0]
check(all(all(abs(a["pts"][i + 1][0] - a["pts"][i][0]) > 0.1 or abs(a["pts"][i + 1][1] - a["pts"][i][1]) > 0.1 for i in range(len(a["pts"]) - 1)) for a in _ar), "꼭짓점이 겹쳐 길이 0인 구간이 없어야 함")
check(dr.draw_arrows(_bi, _bA[:1]).getbbox() is not None, "굵은 점선 화살표 그리기")

# 경로 다듬기: 큰 흐름은 따르되 잔 지그재그는 펴고, 시작·끝과 고정한 점(문 틈 같은 좁은 곳)은 그대로
_zig = _np.array([[float(x), 300.0 + (9.0 if (x // 10) % 2 else -9.0)] for x in range(0, 400, 5)])
_sm1 = dr.smooth_path(_zig, win=15)
check(_sm1.shape == _zig.shape and tuple(_sm1[0]) == tuple(_zig[0]) and tuple(_sm1[-1]) == tuple(_zig[-1]), "다듬어도 시작·끝은 그대로")
check(float(_np.abs(_sm1[10:-10, 1] - 300.0).max()) < 5.0 and float(_np.abs(_zig[:, 1] - 300.0).max()) == 9.0, f"지그재그(±9)가 절반 아래로 펴져야 함 {float(_np.abs(_sm1[10:-10, 1] - 300.0).max()):.1f}")
_pin = _np.zeros(len(_zig), bool)
_pin[40] = True
_sm2 = dr.smooth_path(_zig, win=15, pin=_pin)
check(tuple(_sm2[40]) == tuple(_zig[40]), "고정한 점(문 틈)은 그대로")
_bad2 = lambda pts: (pts[:, 0] > 150) & (pts[:, 0] < 170) & (_np.abs(pts[:, 1] - 300.0) < 3)      # 다듬은 점이 장애물 위에 놓이는 곳
_sm3 = dr.smooth_path(_zig, win=15, bad=_bad2)
check(not _bad2(_sm3).any() or all(tuple(_sm3[i]) == tuple(_zig[i]) for i in range(len(_zig)) if _bad2(_sm3[i:i + 1])[0]), "장애물 위로 다듬어진 점은 원래 자리로 되돌아가야 함")
# 장애물이 많은 도면에서도 경로가 문 틈을 지나고 꼭짓점이 적다(다듬어도 벽을 뚫지 않는다)
_pd, _sd = dr.find_path(dr.cost_grid(_ri), [(100, 100), (500, 100)])
_yd2 = _y_at(_pd, 300)
check(_yd2 is not None and 128 <= _yd2 <= 150 and _sd["wall_cells"] == 0 and len(_pd) <= 9, f"다듬은 뒤에도 문 틈으로 지나야 함 y={_yd2} {len(_pd)}점")

# 화살표의 시작·끝이 글자(굵은 덩어리) 위에 걸리지 않는다: 경유점이 글자 위에 있어도 글자에서 떨어진 빈 곳으로 옮겨 쓴다
_ti = Image.new("RGB", (600, 400), "white")
ImageDraw.Draw(_ti).rectangle([200, 193, 259, 207], fill="black")              # 글자 덩어리(60×15)
_pt_, _st_ = dr.find_path(dr.cost_grid(_ti), [(230, 200), (450, 200)])
_dx = max(200 - _pt_[0][0], _pt_[0][0] - 259, 0)
_dy = max(193 - _pt_[0][1], _pt_[0][1] - 207, 0)
check(math.hypot(_dx, _dy) >= dr.DT_END - 1 and _st_["wall_cells"] == 0, f"시작점이 글자에서 {dr.DT_END - 1:.0f}px 이상(이 그림은 1칸=1px) 떨어져야 함 {_pt_[0]} {_st_}")
_pt2, _ = dr.find_path(dr.cost_grid(_ti), [(450, 200), (230, 200)])
_dx = max(200 - _pt2[-1][0], _pt2[-1][0] - 259, 0)
_dy = max(193 - _pt2[-1][1], _pt2[-1][1] - 207, 0)
check(math.hypot(_dx, _dy) >= dr.DT_END - 1, f"끝점도 글자에서 {dr.DT_END - 1:.0f}px 이상 떨어져야 함 {_pt2[-1]}")

# 작업 흐름: 구역과 동선을 모두 코드가 그리면 Qwen 을 아예 부르지 않고, 화살표는 편집 가능한 선으로 나뉜다
_saved4 = (de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server)
_tmp4 = __import__("tempfile").mkdtemp()
_rbuf = __import__("io").BytesIO()
_ri.save(_rbuf, "PNG")


def _plan_with_routes(png, ask, allow_zones=False):
    return {"instruction": "x" * 80, "title": "동선도", "legend": [], "source": "gemini", "zones": [], "arrows": True, "zones_asked": False, "routes": _R[:2]}


def _no_qwen4(*a, **k):
    raise AssertionError("경로를 코드가 그리는데 Qwen 을 불렀음")


try:
    de.build_plan = _plan_with_routes
    de.run_qwen, de._out_dir, de.ensure_server = _no_qwen4, (lambda: _tmp4), _no_qwen4
    de.verify_zone_legend = lambda *a, **k: (_ for _ in ()).throw(AssertionError("범례 확인을 불렀음"))
    de.JOBS["rc"] = {"status": "queued", "created": 0}
    de._run("rc", _rbuf.getvalue(), "동선", 25, 1)
    _rj = de.JOBS["rc"]
    check(_rj.get("status") == "done", f"동선을 코드가 그리는 작업이 끝나지 않음 {_rj.get('status')} {_rj.get('error')}")
    if _rj.get("status") == "done":
        _rr = _rj["result"]
        check(_rr.get("route_by") == "code" and _rr["layers"] is not None and len(_rr["layers"]["arrows"]) == 2, f"편집 가능한 화살표 2개 {None if _rr['layers'] is None else len(_rr['layers']['arrows'])} {_rr.get('route_by')}")
        check([l["label"] for l in _rr["legend"] if l["kind"] == "flow"] == ["주 동선: 출입구→홀", "보행"], f"결과 범례 {_rr['legend']}")
        _ro = _np.asarray(Image.open(__import__("os").path.join(_tmp4, "diagram_edit_rc.png")).convert("RGB")).astype(int)
        check(int(_np.abs(_ro - _np.asarray(_ri).astype(int)).sum(axis=2)[200:, 350:].max()) == 0 and _orange_share(_ro, _A[0]) >= 0.4, "결과 그림: 화살표는 얹히고 나머지 원본은 그대로")
        _bs4 = _np.asarray(Image.open(__import__("os").path.join(_tmp4, "diagram_edit_rc_base.png")).convert("RGB")).astype(int)
        check(int(_np.abs(_bs4 - _np.asarray(_ri).astype(int)).sum(axis=2).max()) <= 3, "층의 바탕에는 화살표가 없어야 함(원본 그대로)")
finally:
    de.build_plan, de.run_qwen, de.verify_zone_legend, de._out_dir, de._up, de._free, de.ensure_server = _saved4

# 서버 멈춤 대비(2026-10-26): ① /health 는 스레드 풀과 무관하게 즉시 응답(async) ② 조감도 옵션이 부르는 ComfyUI 사용 가능 확인은 20초 동안 기억 ③ 이벤트 루프가 막히면 그 순간의 모든 스레드 호출 기록을 파일로 남김
import ast as _ast  # noqa: E402
_srv = open(os.path.join(ROOT, "backend", "server.py"), encoding="utf-8").read()
_fns = {n.name: n for n in _ast.walk(_ast.parse(_srv)) if isinstance(n, (_ast.FunctionDef, _ast.AsyncFunctionDef))}
check(isinstance(_fns.get("health_check"), _ast.AsyncFunctionDef), "/health 는 async 여야 함(스레드 풀이 찼어도 즉시 응답)")
check("hang_probe" in _srv and any(isinstance(n, _ast.AsyncFunctionDef) and any(isinstance(d, _ast.Call) and getattr(d.func, "attr", "") == "on_event" for d in n.decorator_list) for n in _fns.values()), "서버 시작 때 멈춤 진단(hang_probe)을 켜야 함")

import urllib.request as _ur  # noqa: E402
import comfyui_client as _cc  # noqa: E402
from services import aerial_local as _al  # noqa: E402


class _FT:
    t = 1000.0

    @staticmethod
    def monotonic():
        return _FT.t


_cnt = {"up": 0, "canny": 0, "kontext": 0}


class _Resp:
    def read(self):
        return b"{}"


def _fake_open(*a, **k):
    _cnt["up"] += 1
    if _cnt.get("down"):
        raise OSError("down")
    return _Resp()


_al_saved = (getattr(_al, "time", None), _ur.urlopen, _cc.is_controlnet_canny_available, _cc.is_flux_kontext_available)
try:
    _al.time = _FT
    _ur.urlopen = _fake_open
    _cc.is_controlnet_canny_available = lambda: (_cnt.__setitem__("canny", _cnt["canny"] + 1), True)[1]
    _cc.is_flux_kontext_available = lambda: (_cnt.__setitem__("kontext", _cnt["kontext"] + 1), True)[1]
    if hasattr(_al, "_AVAIL"):
        _al._AVAIL.update(t=-1e9, v=None)
    _a1 = _al.available()
    _a2 = _al.available()
    check(_a1 == {"sdxl": True, "kontext": True} and _a2 == _a1 and _cnt == {"up": 1, "canny": 1, "kontext": 1}, f"20초 안의 두 번째 호출은 ComfyUI 를 다시 부르지 않아야 함 {_cnt}")
    _FT.t += 21
    _al.available()
    check(_cnt["up"] == 2, f"20초가 지나면 다시 확인해야 함 {_cnt}")
    _a2["sdxl"] = False
    check(_al.available()["sdxl"] is True, "돌려준 값을 고쳐도 기억해 둔 값이 바뀌면 안 됨")
    _cnt["down"] = True
    _FT.t += 21
    _ad = _al.available()
    _FT.t += 6
    _al.available()
    check(_ad == {"sdxl": False, "kontext": False} and _cnt["up"] == 4, f"ComfyUI 가 꺼져 있으면 짧게(5초)만 기억해 켜지면 곧 알아채야 함 {_ad} {_cnt}")
finally:
    _al.time = _al_saved[0]
    _ur.urlopen, _cc.is_controlnet_canny_available, _cc.is_flux_kontext_available = _al_saved[1:]
    if hasattr(_al, "_AVAIL"):
        _al._AVAIL.update(t=-1e9, v=None)

import asyncio as _aio  # noqa: E402
import glob as _gl  # noqa: E402
import tempfile as _tf  # noqa: E402
import threading as _th  # noqa: E402
import time as _tm  # noqa: E402
from services import hang_probe as _hp  # noqa: E402


def _probe_case(block_sec):
    out = _tf.mkdtemp()
    loop = _aio.new_event_loop()
    t = _th.Thread(target=loop.run_forever, name="loop-test", daemon=True)
    t.start()
    pr = _hp.HangProbe(loop, out, interval=0.1, threshold=0.4, cooldown=0.0)
    pr.start()
    _tm.sleep(0.6)
    healthy = _gl.glob(os.path.join(out, "hang_*.log"))

    def _blocker():
        _tm.sleep(block_sec)

    loop.call_soon_threadsafe(_blocker)
    _tm.sleep(block_sec + 1.0)
    files = _gl.glob(os.path.join(out, "hang_*.log"))
    pr.stop()
    loop.call_soon_threadsafe(loop.stop)
    return healthy, files


_h0, _f0 = _probe_case(1.3)
check(_h0 == [] and len(_f0) >= 1, f"건강한 동안엔 기록이 없고, 루프가 막히면 기록이 생겨야 함 {_h0} {_f0}")
if _f0:
    _txt = open(_f0[0], encoding="utf-8").read()
    check("_blocker" in _txt and "loop-test" in _txt and "recovered" in _txt, f"기록에 막은 함수(_blocker)·스레드 이름·풀린 시간이 있어야 함 {_txt[:200]!r}")
_h1, _f1 = _probe_case(0.05)
check(_f1 == [], f"짧게 막힌 것(임계값 미만)은 기록하지 않아야 함 {_f1}")

# 다이어그램 렌더(node)
node = subprocess.run(["node", os.path.join(ROOT, "scripts", "regression", "check_diagrams.mjs")], capture_output=True, text=True, encoding="utf-8")
print(node.stdout.strip())
if node.returncode != 0:
    fails.append("다이어그램 렌더 점검 실패: " + (node.stderr or node.stdout)[-600:])

print()
if fails:
    print(f"실패 {len(fails)}건")
    for f in fails[:40]:
        print(" -", f)
    sys.exit(1)
print("모두 통과")
