"""평면도 방 분할: AI가 짚어 준 방 위치(씨앗)를 출발점으로, 이미지의 벽을 따라 방 경계를 나눈다.

AI 가 방을 직사각형으로 눈대중으로 그리면 위치·크기가 어긋나지만, 방 '이름과 대략 위치'는 잘 맞춘다.
그래서 위치만 AI 에게 받고 경계는 이미지 분석(벽선 + 남는 공간의 거리 지도 + 씨앗 기반 분할)으로 정한다.
좌표는 이미지의 긴 변 = 100 인 같은 비율 좌표.
"""
import io

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure, morphology, segmentation


def _poly(mask, tol):
    cnts = measure.find_contours(np.pad(mask, 1).astype(float), 0.5)
    if not cnts:
        return None
    c = max(cnts, key=len)
    ap = measure.approximate_polygon(c, tol)[:-1]
    return [[float(x - 1), float(y - 1)] for y, x in ap]


def _max_rect(mask):
    """마스크 안에 들어가는 가장 큰 축 정렬 직사각형 (x0, y0, x1, y1). 히스토그램 스택 방식."""
    h, w = mask.shape
    heights = np.zeros(w, int)
    best = (0, 0, 0, 0, 0)
    for y in range(h):
        heights = np.where(mask[y], heights + 1, 0)
        stack = []
        for x in range(w + 1):
            cur = heights[x] if x < w else 0
            start = x
            while stack and stack[-1][1] >= cur:
                sx, sh = stack.pop()
                area = sh * (x - sx)
                if area > best[0]:
                    best = (area, sx, y - sh + 1, x, y + 1)
                start = sx
            stack.append((start, cur))
    return best[1:] if best[0] > 0 else None


def segment_rooms(png_bytes, seeds, snap=38):
    """seeds: [{'id': str, 'x': 0~1, 'y': 0~1}] (이미지 가로·세로에 대한 비율). 반환: {'rooms': {id: [[x,y],...]}, 'size': [W,H]}"""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    s = 1000.0 / max(im.size)
    im = im.resize((max(1, int(round(im.width * s))), max(1, int(round(im.height * s)))), Image.LANCZOS)
    W, H = im.size
    g = np.asarray(im).astype(float).mean(axis=2)

    dark = g < 115
    # 벽 = 굵은 검정(바깥벽) + 길게 이어진 선(안쪽 벽). 가구·기호의 짧은 선은 벽이 아니다.
    thick = morphology.opening(dark, morphology.disk(2))
    long_lines = morphology.opening(dark, morphology.rectangle(1, 22)) | morphology.opening(dark, morphology.rectangle(22, 1))
    walls = morphology.closing(thick | long_lines, morphology.disk(2))
    walls = morphology.dilation(walls, morphology.disk(2))

    # 세대 안쪽(흰 종이 바깥 제외): 칠해진 바닥·벽 덩어리를 메워서 바깥 흰 바탕과 구분
    nonwhite = morphology.opening(g < 244, morphology.disk(6))
    inside = ndi.binary_fill_holes(morphology.closing(nonwhite, morphology.disk(24)))
    lab, n = ndi.label(inside)
    if n:
        inside = lab == (1 + int(np.argmax(ndi.sum(inside, lab, range(1, n + 1)))))
    free = inside & ~walls
    dts = ndi.gaussian_filter(ndi.distance_transform_edt(free), 2)

    mk = np.zeros((H, W), int)
    order = []
    for i, sd in enumerate(seeds, 1):
        cx = int(min(max(sd["x"], 0), 1) * (W - 1)); cy = int(min(max(sd["y"], 0), 1) * (H - 1))
        y0, y1 = max(0, cy - snap), min(H, cy + snap + 1); x0, x1 = max(0, cx - snap), min(W, cx + snap + 1)
        sub = dts[y0:y1, x0:x1]
        if sub.size and sub.max() > 0:  # 씨앗이 가구선·글자 위에 놓였으면 가까운 가장 넓은 빈 곳으로 옮긴다
            yy, xx = np.unravel_index(np.argmax(sub), sub.shape)
            cy, cx = y0 + yy, x0 + xx
        r0, r1, c0, c1 = max(0, cy - 4), cy + 5, max(0, cx - 4), cx + 5
        mk[r0:r1, c0:c1] = np.where(free[r0:r1, c0:c1], i, 0)
        order.append(sd["id"])
    ws = segmentation.watershed(-dts, mk, mask=free)

    unit = 100.0 / max(W, H)
    rooms = {}
    rects = {}
    union = np.zeros((H, W), bool)
    for i, rid in enumerate(order, 1):
        m = ws == i
        if m.sum() < 0.0012 * W * H:
            continue
        m = morphology.closing(m, morphology.disk(4))   # 방 안의 가구·글자 때문에 생긴 구멍과 가는 틈을 메운다
        m = ndi.binary_fill_holes(m)
        m = morphology.opening(m, morphology.disk(3))
        lab2, n2 = ndi.label(m)
        if n2 == 0:
            continue
        if n2 > 1:
            m = lab2 == (1 + int(np.argmax(ndi.sum(m, lab2, range(1, n2 + 1)))))
        union |= m
        p = _poly(m, 3.0)
        if p and len(p) >= 3:
            rooms[rid] = [[x * unit, y * unit] for x, y in p]
        er = morphology.erosion(m, morphology.disk(3))      # 벽에 붙은 가장자리는 빼고 방 안쪽에서 가장 큰 직사각형을 딴다
        r = _max_rect(er if er.sum() > 0.5 * m.sum() else m)
        if r:
            x0, y0, x1, y1 = r
            rects[rid] = [[x0 * unit, y0 * unit], [x1 * unit, y0 * unit], [x1 * unit, y1 * unit], [x0 * unit, y1 * unit]]
    # 바깥 윤곽: 방들을 합친 모양을 벽 두께만큼 부풀리고 매끈하게 다듬는다
    outline = None
    if union.any():
        o = morphology.dilation(union, morphology.disk(12))
        o = morphology.closing(o, morphology.disk(30))
        o = ndi.binary_fill_holes(o)
        o = morphology.opening(o, morphology.disk(22))
        o = morphology.closing(o, morphology.disk(14))
        lab3, n3 = ndi.label(o)
        if n3:
            o = lab3 == (1 + int(np.argmax(ndi.sum(o, lab3, range(1, n3 + 1)))))
            op = _poly(o, 7.0)
            if op and len(op) >= 3:
                outline = [[x * unit, y * unit] for x, y in op]
    return {"rooms": rooms, "rects": rects, "outline": outline, "size": [W, H]}
