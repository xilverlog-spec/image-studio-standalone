"""빠른 회귀 점검(GPU·서버 불필요, 수 초): 조감도 지시문 조합과 다이어그램 렌더가 깨지지 않았는지 본다.

  python scripts/regression/check_fast.py

- 조감도: 모든 작업 방식·깊이·입면·분위기·참조 역할 조합이 지시문을 만들고, 안전 필터에 걸리지 않고,
  꼭 들어가야 할 문구(형태 유지·이웃 건물 유지 등)를 포함하며, 길이가 상한 안인지
- 다이어그램: 예시와 일부러 망가뜨린 입력(빈 배열·빠진 필드)을 넣어도 렌더가 예외 없이 SVG 를 내는지(node 필요)
"""
import itertools
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
check("조닝 다이어그램" in de.fallback_instruction("조닝 다이어그램") and "Do NOT add any new text" in de.fallback_instruction(""), "대체 지시문에 사용자 요청과 글자 보존 문구가 없음")

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
