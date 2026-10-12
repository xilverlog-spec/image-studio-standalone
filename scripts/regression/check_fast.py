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
