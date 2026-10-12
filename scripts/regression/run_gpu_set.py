"""GPU 회귀 점검: 고정 시드로 10장을 만들어 기준값(baseline.json)과 비교한다(장당 약 3~4분, 전체 약 35분).

  python scripts/regression/run_gpu_set.py                 # 점검(기준값과 비교)
  python scripts/regression/run_gpu_set.py --update        # 지금 결과를 새 기준값으로 저장
  python scripts/regression/run_gpu_set.py --only 3 7      # 일부만(번호는 CASES 순서, 1부터)

전제: 백엔드(5000)와 ComfyUI(8188)가 켜져 있어야 한다. 시험 이미지는 로컬 '모델링' 폴더(원격에 올리지 않는 고객 샘플)에서 읽는다.
같은 코드·같은 시드면 결과가 거의 같으므로, 점수가 기준값보다 TOL 이상 떨어지거나 결과 비율이 입력과 다르면 '확인 필요'로 표시한다.
형태 점수는 조명·색이 바뀌면 흔들리는 거친 지표라서(2026-10-08 확인) 통과/실패 판정이 아니라 눈으로 볼 대상을 좁히는 용도다. 결과 시트를 같이 저장한다.
"""
import argparse
import base64
import glob
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(ROOT, "모델링")
OUT_DIR = os.path.join(ROOT, "output", "regression")
BASELINE = os.path.join(os.path.dirname(__file__), "baseline.json")
API = "http://127.0.0.1:5000"
TOL = 15
SEED = 21


def model_file(prefix: str) -> str:
    hits = sorted(glob.glob(os.path.join(MODEL_DIR, prefix + "*")))
    if not hits:
        sys.exit(f"시험 이미지를 찾을 수 없습니다: 모델링/{prefix}*")
    return hits[0]


# (이름, 원본 접두사, 작업 방식, 입면/분위기, 깊이, 참조 [(접두사, 역할, 가져올 것)])
CASES = [
    ("render_s11", "1-1", "render", "sunny", "material", []),
    ("render_alt3", "ALT3", "render", "sunny", "material", []),
    ("render_big", "대안1", "render", "sunny", "material", []),
    ("render_c3", "●3", "render", "sunny", "material", []),
    ("facade_s11_redbrick", "1-1", "facade", "redbrick", "material", []),
    ("facade_alt3_timber", "ALT3", "facade", "timber", "material", []),
    ("redesign_s11_metal", "1-1", "facade", "metal", "redesign", []),
    ("redesign_alt3_glass", "ALT3", "facade", "glass", "redesign", []),
    ("ref_apply_s11", "1-1", "reference", "sunny", "ref_apply", [("1.", "facade", "exposed concrete with grey board-form texture and thick horizontal slab bands")]),
    ("ref_propose_alt3", "ALT3", "reference", "sunny", "ref_propose", [("1.", "facade", "exposed concrete with grey board-form texture, large glass windows")]),
]


def call(path, body=None, timeout=3000):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data, {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def b64(path, edge):
    im = Image.open(path).convert("RGB")
    s = edge / max(im.size)
    if s < 1:
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode(), im.size


def run_case(case):
    name, src, mode, variant, depth, refs = case
    src_path = model_file(src)
    img, size = b64(src_path, 2048)
    ref_files = [(model_file(p), role, hint) for p, role, hint in refs]
    p = call("/v1/image/aerial-prompt", {
        "extra": "", "ref_roles": [r for _, r, _ in ref_files], "ref_images": [b64(f, 1024)[0] for f, _, _ in ref_files],
        "ref_hints": [h for _, _, h in ref_files], "mode": mode, "depth": depth, "keep_site": True,
    })
    t = time.time()
    r = call("/v1/image/aerial/generate", {
        "mode": mode, "variant": variant, "depth": depth, "common_prompt": p["prompt"], "extra_en": p["extra_en"], "provider": "local_kontext",
        "input_image_base64": img, "reference_images": [{"role": role, "base64": b64(f, 1280)[0]} for f, role, _ in ref_files], "seed": SEED, "keep_site": True,
        "ref_roles": p["ref_roles_used"], "ref_hints_en": p["ref_hints_en"], "ref_notes": p["ref_notes"], "ticket": "regression",
    })
    out = Image.open(r["file_path"]).convert("RGB")
    os.makedirs(OUT_DIR, exist_ok=True)
    out.save(os.path.join(OUT_DIR, name + ".png"))
    aspect_gap = abs(out.width / out.height - size[0] / size[1]) / (size[0] / size[1])
    return {"score": r["form_score"], "sec": round(time.time() - t), "aspect_gap": round(aspect_gap, 3), "prompt_chars": len(r["prompt_used"])}


def contact_sheet(rows):
    font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 20) if os.name == "nt" else ImageFont.load_default()
    pw, cols = 600, 3
    tiles = []
    for name, res, note in rows:
        f = os.path.join(OUT_DIR, name + ".png")
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert("RGB")
        im = im.resize((pw, int(im.height * pw / im.width)), Image.LANCZOS)
        tiles.append((f"{name}  점수 {res['score']}{note}", im))
    if not tiles:
        return None
    th = max(im.height for _, im in tiles) + 30
    rowsn = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * pw + (cols - 1) * 8, rowsn * th), "white")
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(tiles):
        x, y = (i % cols) * (pw + 8), (i // cols) * th
        d.text((x + 4, y + 3), label, fill="black", font=font)
        sheet.paste(im, (x, y + 28))
    path = os.path.join(OUT_DIR, "_sheet.png")
    sheet.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="결과를 새 기준값으로 저장")
    ap.add_argument("--only", nargs="*", type=int, help="일부만 실행(1부터)")
    args = ap.parse_args()
    base = json.load(open(BASELINE, encoding="utf-8")) if os.path.exists(BASELINE) else {}
    todo = [c for i, c in enumerate(CASES, 1) if not args.only or i in args.only]
    print(f"{len(todo)}장 생성(기준값 {'없음' if not base else '있음'}, 허용 하락 {TOL}점)")
    rows, flagged = [], []
    for case in todo:
        name = case[0]
        try:
            res = run_case(case)
        except Exception as e:
            print(f"  {name}: 실패 - {e}")
            flagged.append(f"{name}: 생성 실패 {e}")
            continue
        note = ""
        b = base.get(name)
        if b and b.get("score") is not None and res["score"] is not None and res["score"] < b["score"] - TOL:
            note = f"  ▼기준 {b['score']}"
            flagged.append(f"{name}: 점수 {res['score']} (기준 {b['score']})")
        if res["aspect_gap"] > 0.02:
            note += "  ▲비율 어긋남"
            flagged.append(f"{name}: 결과 비율이 입력과 {res['aspect_gap'] * 100:.1f}% 다름")
        print(f"  {name}: 점수 {res['score']} ({res['sec']}초, 지시문 {res['prompt_chars']}자){note}")
        rows.append((name, res, note))
        if args.update:
            base[name] = {"score": res["score"], "prompt_chars": res["prompt_chars"]}
    if args.update:
        json.dump(base, open(BASELINE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("기준값 저장:", BASELINE)
    sheet = contact_sheet(rows)
    if sheet:
        print("결과 시트:", sheet)
    print()
    if flagged and not args.update:
        print(f"확인 필요 {len(flagged)}건 (시트를 눈으로 보세요)")
        for f in flagged:
            print(" -", f)
        sys.exit(1)
    print("완료")


if __name__ == "__main__":
    main()
