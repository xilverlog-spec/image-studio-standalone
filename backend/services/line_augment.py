"""AI 가 다시 그린 선화에서 빠진 요소를 '원본'에서 읽어 보충한다.

AI 재생성은 선을 깨끗하게 만들어 주지만 화살표나 바닥판을 빼먹기도 한다(특히 질감 있는 입력). 원본에는 그 요소가 또렷하게 남아 있으므로
  · 화살표: 원본에서 화살촉(채운 삼각형)과 점선 줄을 따로 찾아, AI 결과에 없는 것만 보탠다.
  · 바닥판: 원본의 주황·갈색 바닥판 영역에서 아이소 방향 평행사변형을 구해 앞쪽 두 변을 점선으로 보탠다(AI 결과에 점선이 하나도 없을 때만).
"정확한 위치는 원본에서, 깨끗함은 AI에서" 라는 이 프로젝트의 기본 방식을 따른다. 모든 좌표는 선 추출 결과 SVG 의 좌표계(AI 재생성본 픽셀)로 옮긴다.
"""
import math
import re

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology

from services import line_trace

_INK = "#1d1d1d"


def _work(im):
    """line_trace.trace_lines 와 같은 확대 비율로 키운 (RGB 배열, 비율)."""
    W0, H0 = im.size
    s = min(3.0, max(1.0, 3600.0 / max(W0, H0)))
    im2 = im.resize((int(round(W0 * s)), int(round(H0 * s))), Image.LANCZOS) if s != 1.0 else im
    return np.asarray(im2.convert("RGB")).astype(np.float32), s


def find_arrows(im):
    """원본 이미지에서 화살표를 찾는다. 반환: [{'tail': (x, y), 'base': (x, y), 'poly': [3점], 'center': (x, y)}] (원본 픽셀 좌표)."""
    rgb, s = _work(im)
    gray = rgb.mean(axis=2)
    no_text = np.zeros(gray.shape, bool)
    out = []
    v, vz = line_trace._find_vertical_arrows(gray, no_text, s)
    for xs, yt, yb, hx0, hx1, tip in v:
        poly = [(hx0 / s, yb / s), (hx1 / s, yb / s), (xs / s, tip / s)]
        out.append({"tail": (xs / s, yt / s), "base": (xs / s, yb / s), "poly": poly,
                    "center": (xs / s, (yb + tip) / 2.0 / s)})
    g_left = np.where(vz, 255.0, gray)
    for key in ("A", "B"):
        ia, iz = line_trace._find_iso_arrows(g_left, no_text, s, key)
        for pt, pb, poly in ia:
            pts = [(p[0] / s, p[1] / s) for p in poly]
            out.append({"tail": (pt[0] / s, pt[1] / s), "base": (pb[0] / s, pb[1] / s), "poly": pts,
                        "center": (float(np.mean([p[0] for p in pts])), float(np.mean([p[1] for p in pts])))})
        g_left = np.where(iz, 255.0, g_left)
    return out


def find_plate_edges(im):
    """원본의 바닥판(주황·갈색 영역 중 가장 아래쪽 큰 덩어리)을 아이소 평행사변형으로 근사해 앞쪽(아래) 두 변을 돌려준다.
    반환: [((x0, y0), (x1, y1)), ...] 원본 픽셀 좌표. 못 찾으면 []."""
    arr = np.asarray(im.convert("RGB")).astype(np.float32)
    H, W = arr.shape[:2]
    orange = (arr[..., 0] - arr[..., 2] > 38) & (arr[..., 0] > 140) & (arr[..., 1] < arr[..., 0] - 22)   # 노란 형광펜(초록≈빨강) 제외
    orange = morphology.closing(morphology.opening(orange, morphology.disk(1)), morphology.disk(2))
    lab, n = ndi.label(orange)
    if n == 0:
        return []
    best = None
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        area = int((lab[sl] == i).sum())
        if area < 0.008 * H * W:
            continue
        ymax = sl[0].stop
        if best is None or ymax > best[0]:
            best = (ymax, i)
    if best is None:
        return []
    ys, xs = np.nonzero(lab == best[1])
    pts = np.stack([xs, ys], 1).astype(np.float64)
    ua, ub = line_trace.UNIT["A"], line_trace.UNIT["B"]       # 아래-오른쪽(30°), 아래-왼쪽(150°) 방향
    na, nb = line_trace.NORM["A"], line_trace.NORM["B"]
    size = max(W, H)
    pa, pb = pts @ na, pts @ nb
    ca = float(np.percentile(pa, 99.5))      # 왼쪽 앞변: A 방향 선 중 가장 아래쪽(법선 방향 최대)
    cb = float(np.percentile(pb, 0.5))       # 오른쪽 앞변: B 방향 선 중 가장 오른쪽 아래(법선 방향 최소)
    try:
        bottom = np.linalg.solve(np.array([na, nb]), np.array([ca, cb]))   # 두 앞변이 만나는 아래 꼭짓점
    except np.linalg.LinAlgError:
        return []
    tol = 0.03 * size
    sel_a, sel_b = np.abs(pa - ca) < tol, np.abs(pb - cb) < tol
    if sel_a.sum() < 30 or sel_b.sum() < 30:
        return []
    ta = np.percentile(pts[sel_a] @ ua, 1.0)             # 왼쪽 끝(꼭짓점에서 거꾸로)
    tb = np.percentile(pts[sel_b] @ ub, 1.0)             # 오른쪽 끝(B 방향은 아래-왼쪽이 +이므로 위-오른쪽 끝이 최소)
    left = bottom + ua * (ta - float(bottom @ ua))
    right = bottom + ub * (tb - float(bottom @ ub))
    if np.hypot(*(left - bottom)) < 0.12 * size or np.hypot(*(right - bottom)) < 0.12 * size:
        return []
    if not (-0.05 * size <= bottom[0] <= 1.05 * W and -0.05 * size <= bottom[1] <= 1.05 * H):
        return []
    return [(tuple(left), tuple(bottom)), (tuple(bottom), tuple(right))]


def _polygons(svg):
    out = []
    for m in re.finditer(r'<polygon points="([^"]+)"', svg):
        pts = [tuple(float(v) for v in p.split(",")) for p in m.group(1).split()]
        if pts:
            out.append((float(np.mean([p[0] for p in pts])), float(np.mean([p[1] for p in pts]))))
    return out


def augment(traced, crop):
    """traced = line_trace.trace_lines 결과(dict), crop = 원본 칸 이미지. 보충한 새 dict 와 {'arrows': 더한 화살표 수, 'plate': 더했는지} 를 돌려준다."""
    svg = traced["svg"]
    sw, sh = traced["stats"]["size"]
    cw, ch = crop.size
    fx, fy = sw / float(cw), sh / float(ch)
    k_w = traced["stats"].get("k_w", 1.0)
    add, added = [], {"arrows": 0, "plate": False}

    # 1) 화살표: AI 결과에 이미 있는 화살촉 가까이에 있는 것은 건너뛴다
    have = _polygons(svg)
    near = 0.06 * max(sw, sh)
    for ar in find_arrows(crop):
        c = (ar["center"][0] * fx, ar["center"][1] * fy)
        if any(math.hypot(c[0] - h[0], c[1] - h[1]) < near for h in have):
            continue
        t, b = (ar["tail"][0] * fx, ar["tail"][1] * fy), (ar["base"][0] * fx, ar["base"][1] * fy)
        if math.hypot(t[0] - b[0], t[1] - b[1]) > 3:
            add.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.2f" stroke-dasharray="%.1f %.1f"/>' % (
                t[0], t[1], b[0], b[1], _INK, 1.4 * k_w, 3.2 * k_w, 2.6 * k_w))
        add.append('<polygon points="%s" fill="%s"/>' % (" ".join("%.1f,%.1f" % (p[0] * fx, p[1] * fy) for p in ar["poly"]), _INK))
        have.append(c)
        added["arrows"] += 1

    # 2) 바닥판: AI 결과에 점선(role=dash)이 하나도 없을 때만 원본에서 보충한다
    if int(traced["stats"].get("roles", {}).get("dash", 0)) == 0:
        edges = find_plate_edges(crop)
        for (x0, y0), (x1, y1) in edges:
            add.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.2f" stroke-linecap="round" stroke-dasharray="%.1f %.1f"/>' % (
                x0 * fx, y0 * fy, x1 * fx, y1 * fy, _INK, 0.85 * k_w, 3.2 * k_w, 2.6 * k_w))
        added["plate"] = bool(edges)

    if not add:
        return traced, added
    new = dict(traced)
    new["svg"] = svg.replace("</svg>", "".join(add) + "</svg>", 1) if "</svg>" in svg else svg + "".join(add)
    st = dict(traced["stats"])
    st["arrows"] = int(st.get("arrows", 0)) + added["arrows"]
    if added["plate"]:
        roles = dict(st.get("roles", {}))
        roles["dash"] = roles.get("dash", 0) + 2
        st["roles"] = roles
    st["augmented"] = added
    new["stats"] = st
    return new, added
