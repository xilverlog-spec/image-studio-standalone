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
