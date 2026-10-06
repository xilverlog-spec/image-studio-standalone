"""CAD 배치도에서 건물 윤곽과 대지 경계를 이미지 분석으로 직접 따낸다(AI 눈대중 없이 원본 모양 그대로).

건물은 굵은 검은 선으로 닫힌 도형이고, 치수선·글자·도로선은 가늘다. 그래서
  ① 어두운 픽셀 중 굵은 선만 남기고(열기 연산) ② 닫힌 도형 안을 채워서 ③ 큰 덩어리를 건물로 보고 윤곽 다각형을 딴다.
대지 경계선은 붉은 점선(일점쇄선)을 이어 붙여 바깥 윤곽으로 만든다.
좌표는 이미지의 긴 변을 100 으로 하는 같은 비율 좌표(가로세로 비율 유지)로 돌려준다.
"""
import io

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure, morphology


def _poly(mask, tol):
    cnts = measure.find_contours(np.pad(mask, 1).astype(float), 0.5)
    if not cnts:
        return None
    c = max(cnts, key=len)
    ap = measure.approximate_polygon(c, tol)[:-1]
    return [[float(x - 1), float(y - 1)] for y, x in ap]


def extract_site(png_bytes, min_area_ratio=0.0015):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    s = 1000.0 / max(im.size)  # 선 굵기 기준값이 일정하도록 긴 변을 1000px 로 맞춘다(키우거나 줄임)
    im = im.resize((max(1, int(round(im.width * s))), max(1, int(round(im.height * s)))), Image.LANCZOS)
    a = np.asarray(im).astype(int)
    W, H = im.size
    g = a.mean(axis=2)
    r, gg, b = a[..., 0], a[..., 1], a[..., 2]
    dark = (g < 100) & (np.abs(r - b) < 40)

    # ① 굵은 선만(건물 외곽선): 가는 치수선·글자 획은 열기 연산으로 사라진다
    thick = morphology.opening(dark, morphology.disk(1))
    thick = morphology.closing(thick, morphology.disk(4))  # 윤곽선의 작은 끊김을 이어 닫힌 도형으로 만든다
    filled = ndi.binary_fill_holes(thick)
    filled = morphology.remove_small_objects(filled, max_size=int(min_area_ratio * W * H))
    lab, n = ndi.label(filled)
    buildings = []
    unit = 100.0 / max(W, H)
    for i in range(1, n + 1):
        comp = lab == i
        p = _poly(comp, 1.6)
        if not p or len(p) < 3:
            continue
        buildings.append({"area": int(comp.sum()), "pts": [[x * unit, y * unit] for x, y in p]})
    buildings.sort(key=lambda b_: (round(np.mean([q[1] for q in b_["pts"]]) / 20), np.mean([q[0] for q in b_["pts"]])))

    # ② 대지 경계: 붉은 선(점선)을 이어 붙여 바깥 윤곽
    red = (r > 190) & (gg < 110) & (b < 110)
    boundary = None
    if red.sum() > 200:
        joined = morphology.closing(morphology.dilation(red, morphology.disk(2)), morphology.disk(9))
        joined = ndi.binary_fill_holes(joined)
        joined = morphology.remove_small_objects(joined, max_size=int(0.02 * W * H))
        lab2, n2 = ndi.label(joined)
        if n2:
            big = max(range(1, n2 + 1), key=lambda k: (lab2 == k).sum())
            bp = _poly(lab2 == big, 3.0)
            if bp and len(bp) >= 3:
                boundary = [[x * unit, y * unit] for x, y in bp]
    return {"buildings": buildings, "boundary": boundary, "size": [W, H]}
