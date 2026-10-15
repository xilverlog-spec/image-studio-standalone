"""평면 도면 이미지 → 축측(입체) 벽체 바탕 SVG (완전 로컬, AI 없음).

도면의 굵은 검정 벽(구조벽)과 회색 벽선을 이미지에서 직접 뽑아 다각형으로 만든 뒤, 일정한 높이로 세워서
비스듬히 내려다본 축측도로 그린다. 바탕 위에 바람·일조 같은 분석 화살표를 얹을 수 있도록,
화면 좌표 변환(proj)과 평면 이미지의 크기·중심을 함께 돌려준다.

출력 SVG 는 '그룹'(<g>…</g>)이고 좌표계는 viewBox(vb)이다. 평면 이미지 위의 점 (x, y)(분석용 크기 px)은
proj 로 화면 좌표 (X, Y) 에 놓인다:  u = (x-cx)cos(rot) - (y-cy)sin(rot);  v = (x-cx)sin(rot) + (y-cy)cos(rot);
X = u;  Y = v·sin(elev) - z·cos(elev).
"""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure
from skimage.morphology import skeletonize

ANALYSIS_LONG = 1000       # 분석용 크기(긴 변). 문턱·창 크기가 이 크기에 맞춰져 있다
DEFAULT_ROT = -15.0        # 평면을 돌리는 각도(도): 참고 그림처럼 길쭉한 평면이 비스듬히 보이게
DEFAULT_ELEV = 38.0        # 내려다보는 각도(도)
DEFAULT_HEIGHT = 0.040     # 벽 높이 = 긴 변 × 비율(참고 그림처럼 낮은 벽)
GRAY_MAX = 172             # 회색 벽 밝기 상한
MIN_WALL_SKEL = 1.0        # 굵은 벽선 뼈대 길이 / 긴 변 의 하한
MIN_WHITE = 0.12           # 흰 바탕(밝기 245 초과) 비율의 하한


def _load(png_bytes):
    import io
    im = Image.open(io.BytesIO(png_bytes))
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    s = ANALYSIS_LONG / max(im.size)
    if abs(s - 1.0) > 0.02:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def _contours(mask, tol, min_len=4):
    out = []
    for c in measure.find_contours(np.pad(mask, 1).astype(float), 0.5):
        ap = measure.approximate_polygon(c - 1, tolerance=tol)
        if len(ap) >= min_len:
            out.append([(float(p[1]), float(p[0])) for p in ap[:-1]])
    return out


def _inside(pt, P):
    x, y = pt
    c = False
    j = len(P) - 1
    for i in range(len(P)):
        xi, yi = P[i]
        xj, yj = P[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            c = not c
        j = i
    return c


def _shapes(mask, tol, min_len=4):
    """마스크 → [(바깥 윤곽, [구멍 윤곽…])]. 방 안쪽처럼 벽으로 둘러싸인 빈 곳은 구멍으로 남긴다(윗면을 뚫어서 그린다)."""
    cs = _contours(mask, tol, min_len)
    outers = [c for c in cs if _area(c) > 0]
    holes = [c for c in cs if _area(c) <= 0]
    res = [(o, []) for o in outers]
    for h in holes:
        best = None
        for o, hl in res:
            if _inside(h[0], o) and (best is None or abs(_area(o)) < abs(_area(best[0]))):
                best = (o, hl)
        if best is not None:
            best[1].append(h)
    return res


def _area(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2


def extract_walls(im):
    """돌려주는 값: (검정 벽 마스크, 회색 벽 마스크, 바닥 마스크). 가는 선(치수선·글자 획·가구선)은 두께·길이로 걸러낸다."""
    a = np.asarray(im).astype(float)
    lum = a.mean(-1)
    dark = lum < 95
    wall = ndi.binary_opening(dark, structure=np.ones((5, 5)))
    wall = ndi.binary_closing(wall, structure=np.ones((3, 3)))
    lab, n = ndi.label(wall)
    sizes = ndi.sum(wall, lab, range(1, n + 1))
    wall = np.isin(lab, [i for i, s in enumerate(sizes, start=1) if s >= 120])
    # 회색 벽 = 밝기 90~172 의 두께 3px 이상인 선(바닥 목재·타일·가구는 175 이상으로 더 밝아 제외, 실측: 바닥 190~210, 벽선 100~170)
    mid = (lum < GRAY_MAX) & ~ndi.binary_dilation(wall, iterations=1)
    mid = ndi.binary_opening(mid, structure=np.ones((3, 3)))
    # 두꺼운 덩어리(타일 채움·가구 면)는 벽이 아니다: 반지름 8 안쪽이 통째로 차는 곳을 지운다
    core = ndi.binary_opening(mid, structure=_disk(8))
    mid &= ~ndi.binary_dilation(core, iterations=3)
    labm, _nm = ndi.label(ndi.binary_dilation(mid, iterations=1))
    gray = np.zeros_like(mid)
    for i, sl in enumerate(ndi.find_objects(labm), start=1):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if max(h, w) >= 90:   # 가구선·문 호·치수 글자 같은 짧은 조각은 벽이 아니다
            gray |= (labm == i) & mid
    # 건물 바닥(외곽): 흰 바깥과 구분되는 영역에서 가는 치수선·글자를 열기로 지우고 가장 큰 덩어리를 채운다
    body = ndi.binary_opening(lum < 240, structure=np.ones((13, 13)))
    body = ndi.binary_closing(body, structure=np.ones((9, 9)))
    lb, nb = ndi.label(body)
    if nb:
        sz = ndi.sum(body, lb, range(1, nb + 1))
        body = lb == (int(np.argmax(sz)) + 1)
    floor = ndi.binary_fill_holes(body)
    # 외벽 띠: 바닥 가장자리 안쪽 7px(창 구멍까지 이어진 낮은 벽 — 구조벽(검정)은 그 위에 따로 그려진다)
    ring = floor & ~ndi.binary_erosion(floor, iterations=7)
    return wall, (gray | ring) & ~ndi.binary_dilation(wall, iterations=2), floor   # 구조벽(검정) 자리는 회색 띠에서 비워 윗면이 가려지지 않게 한다


def build_axon(png_bytes, rot=DEFAULT_ROT, elev=DEFAULT_ELEV, height=DEFAULT_HEIGHT):
    """돌려주는 값: dict(svg=<g>…</g>, vb=[x,y,w,h], proj={rot,elev,cx,cy,hgt}, plan_size=[W,H], stats={...})"""
    im = _load(png_bytes)
    W, H = im.size
    wall, gray, floor = extract_walls(im)
    black_shapes = _shapes(wall, 1.6)
    gray_shapes = _shapes(gray, 1.4)
    floor_polys = [p for p in _contours(floor, 2.0) if _area(p) > 0.03 * W * H]
    # 벽이 있는 평면도인지 확인(시험으로 정한 기준: 평면도 skel 1.76·흰 여백 0.50, 블록 다이어그램 0.30, 손스케치 0.05~0.21, 입체 수채 0.88, 사진 흰 여백 0.04, 배치도 흰 여백 0.06)
    #  ① 굵은 벽선의 뼈대 길이가 그림 긴 변의 1.0배 미만이면 벽이 아니다(글자 획·작은 도형·가는 선뿐)
    #  ② 흰 바탕 여백이 12% 미만이면 평면 도면이 아니다(사진·렌더·꽉 찬 배치도)
    skel_len = int(skeletonize(wall).sum())
    white = float((np.asarray(im).mean(-1) > 245).mean())
    if skel_len < MIN_WALL_SKEL * max(W, H) or white < MIN_WHITE:
        raise ValueError("벽이 굵은 선으로 그려진 평면도(CAD 평면 등)가 아닌 것 같습니다. 블록 다이어그램·사진·스케치·배치도는 이 방식으로 입체 바탕을 만들 수 없습니다.")
    hgt = height * max(W, H)
    ra = math.radians(rot)
    eb = math.radians(elev)
    cx, cy = W / 2.0, H / 2.0

    def proj(x, y, z=0.0):
        x -= cx
        y -= cy
        u = x * math.cos(ra) - y * math.sin(ra)
        v = x * math.sin(ra) + y * math.cos(ra)
        return u, v * math.sin(eb) - z * math.cos(eb), v

    faces = []   # (정렬 키, 그릴 SVG 조각 만드는 데 쓸 점 목록들, 칠, 선, evenodd 여부)
    for P in floor_polys:
        faces.append((-1e12, [[proj(x, y, 0)[:2] for x, y in P]], "#f6f6f4", "#cfcfcf"))
    for shapes, top_fill, kind in [(gray_shapes, "#d9d9d9", "g"), (black_shapes, "#1b1b1b", "b")]:
        for outer, holes in shapes:
            rings = [outer] + holes
            for P in rings:
                for i in range(len(P)):
                    x0, y0 = P[i]
                    x1, y1 = P[(i + 1) % len(P)]
                    a0, a1, b1, b0 = proj(x0, y0, 0), proj(x1, y1, 0), proj(x1, y1, hgt), proj(x0, y0, hgt)
                    ang = math.atan2(-(x1 - x0), (y1 - y0)) + ra     # 면이 바라보는 방향에 따라 밝기를 달리해 입체감을 낸다
                    shade = 0.62 + 0.30 * math.cos(ang - math.radians(-60))
                    g = int(max(200, min(250, 255 * shade + 28))) if kind == "g" else int(max(160, min(236, 255 * shade + 8)))
                    faces.append(((a0[2] + a1[2]) / 2, [[(a0[0], a0[1]), (a1[0], a1[1]), (b1[0], b1[1]), (b0[0], b0[1])]], f"rgb({g},{g},{g})", "#9a9a9a"))
            top_rings = [[proj(x, y, hgt)[:2] for x, y in P] for P in rings]
            depth = max(proj(x, y, hgt)[2] for x, y in outer)
            faces.append((depth + 1e-3, top_rings, top_fill, top_fill if kind == "b" else "#aaaaaa"))
    faces.sort(key=lambda f: f[0])
    xs = [p[0] for f in faces for ring in f[1] for p in ring]
    ys = [p[1] for f in faces for ring in f[1] for p in ring]
    pad = 0.04 * max(max(xs) - min(xs), max(ys) - min(ys))
    vb = [min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad]
    def piece(f):
        d = "".join("M" + " L".join("%.1f %.1f" % (x, y) for x, y in ring) + "Z" for ring in f[1])
        return '<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="0.7" stroke-linejoin="round"/>' % (d, f[2], f[3])
    body = "".join(piece(f) for f in faces)
    return {
        "svg": "<g>%s</g>" % body, "vb": [round(v, 1) for v in vb],
        "proj": {"rot": rot, "elev": elev, "cx": cx, "cy": cy, "hgt": round(hgt, 2)},
        "plan_size": [W, H],
        "stats": {"black": len(black_shapes), "gray": len(gray_shapes), "floor": len(floor_polys), "faces": len(faces)},
    }
