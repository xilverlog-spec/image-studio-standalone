"""아이소메트릭 도식 래스터 → 정돈된 선(stroke) SVG.

색 영역을 따라 그리는 일반 벡터 변환(vtracer)과 달리, 선을 "선"으로 찾아서
  ① 수직/±30° 세 방향으로 정렬(스냅) ② 같은 선 병합·모서리 맞물림 ③ 역할별 굵기(외곽/안쪽/점선)
  ④ 선으로 둘러싸인 면을 단순한 단색으로 칠함 ⑤ 화살촉·글자 처리
를 해서 일정한 선굵기와 위계가 있는 깨끗한 도면 선으로 만든다. 완전히 로컬(외부 전송 없음).
글자는 기본적으로 글자 모양 그대로 윤곽선으로 옮기고, 글자 내용(ocr_texts)이 주어지면 편집 가능한 <text>로 바꾼다.
"""
import io
import math
import warnings

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import filters, measure, morphology, transform

warnings.filterwarnings("ignore")

DIRS = {"V": 90.0, "A": 30.0, "B": 150.0}
UNIT = {k: np.array([math.cos(math.radians(a)), math.sin(math.radians(a))]) for k, a in DIRS.items()}
NORM = {k: np.array([-u[1], u[0]]) for k, u in UNIT.items()}
FONT = "Malgun Gothic, Apple SD Gothic Neo, Arial, sans-serif"
TONAL_LOW, TONAL_HIGH = 1.6, 3.2


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _hex(c):
    return "#%02x%02x%02x" % tuple(int(max(0, min(255, v))) for v in c)


def _classify(p0, p1):
    ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0])) % 180
    return min(DIRS.items(), key=lambda kv: min(abs(ang - kv[1]), 180 - abs(ang - kv[1])))[0]


def _seg_dist(p, a, b):
    ab = b - a
    t = float(np.clip((p - a) @ ab / (ab @ ab + 1e-9), 0.0, 1.0))
    return float(np.linalg.norm(p - (a + ab * t)))


def _close_open_ends(lines, max_ext, free_tol, orphan_len=0.0, W_img=1000, H_img=1000, info=None):
    """어디에도 닿지 않은 선 끝(자유 끝)을 진행 방향으로 연장해 가까운 다른 선(또는 그 선의 연장)과 만나게 한다.
    점선·희미한 선이 끊긴 채 모서리에서 어긋나거나 벽에 못 닿는 부분을 이어 준다."""
    segs = [[np.array(L[0], float), np.array(L[1], float), L[2], L[3]] for L in lines]

    # 어디에도 닿지 않은 짧은 토막(나무·사람 스케치 조각 등)은 도식의 선이 아니므로 버린다
    def _orphan(i):
        A, B = segs[i][0], segs[i][1]
        if segs[i][2] == "dash" or float(np.linalg.norm(B - A)) >= orphan_len:
            return False
        return all(_seg_dist(A, segs[j][0], segs[j][1]) > free_tol and _seg_dist(B, segs[j][0], segs[j][1]) > free_tol for j in range(len(segs)) if j != i)
    # 선이 아주 많은 복잡한 장면(나무·사람·루버·계단 같은 잔 디테일)은 짧은 선을 모두 버려 건물 구조 위주의 개념도로 단순화한다
    if len(segs) > 60:
        detail_len = 0.045 * max(W_img, H_img)
        segs = [sg for sg in segs if sg[2] == "dash" or float(np.linalg.norm(sg[1] - sg[0])) >= detail_len]
    keep_ = [i for i in range(len(segs)) if not _orphan(i)]
    segs = [segs[i] for i in keep_]

    def _seg_seg(a0, a1, b0, b1):
        # 두 선분이 교차하거나 가까우면 연결된 것으로 본다
        def _cross(o, p_, q):
            return (p_[0] - o[0]) * (q[1] - o[1]) - (p_[1] - o[1]) * (q[0] - o[0])
        d1, d2 = _cross(b0, b1, a0), _cross(b0, b1, a1)
        d3, d4 = _cross(a0, a1, b0), _cross(a0, a1, b1)
        if d1 * d2 < 0 and d3 * d4 < 0:
            return 0.0
        return min(_seg_dist(a0, b0, b1), _seg_dist(a1, b0, b1), _seg_dist(b0, a0, a1), _seg_dist(b1, a0, a1))

    complex_scene = len(segs) > 60
    if info is not None:
        info['complex'] = complex_scene
    if complex_scene and len(segs) > 1:
        par = list(range(len(segs)))
        def _f(i):
            while par[i] != i:
                par[i] = par[par[i]]; i = par[i]
            return i
        for i in range(len(segs)):
            for j in range(i + 1, len(segs)):
                if _seg_seg(segs[i][0], segs[i][1], segs[j][0], segs[j][1]) <= free_tol:
                    par[_f(i)] = _f(j)
        tot = {}
        for i, sg in enumerate(segs):
            tot[_f(i)] = tot.get(_f(i), 0.0) + float(np.linalg.norm(sg[1] - sg[0]))
        big = max(tot.values())
        segs = [sg for i, sg in enumerate(segs) if tot[_f(i)] >= 0.2 * big or sg[2] == "dash"]

    def free(i, e):
        P = segs[i][e]
        return all(_seg_dist(P, segs[j][0], segs[j][1]) > free_tol for j in range(len(segs)) if j != i)

    for i in range(len(segs)):
        for e in (0, 1):
            P, Q = segs[i][e], segs[i][1 - e]
            length = float(np.linalg.norm(P - Q))
            if length < 1e-6:
                continue
            is_free = free(i, e)
            d = (P - Q) / length
            best = None
            for j in range(len(segs)):
                if j == i:
                    continue
                A, B = segs[j][0], segs[j][1]
                lj = float(np.linalg.norm(B - A))
                if lj < 1e-6:
                    continue
                dj = (B - A) / lj
                cr = d[0] * dj[1] - d[1] * dj[0]
                if abs(cr) < 0.3:
                    continue
                w = A - P
                t = (w[0] * dj[1] - w[1] * dj[0]) / cr   # P + t·d
                u = (w[0] * d[1] - w[1] * d[0]) / cr     # A + u·dj
                if is_free:
                    if t < 0 or t > min(max_ext, 0.6 * length):
                        continue
                    if u < -max_ext or u > lj + max_ext:
                        continue
                else:  # 이미 닿아 있는 끝은 살짝 어긋난 것만 교점으로 바로잡는다
                    if abs(t) > 1.5 * free_tol or u < -1.5 * free_tol or u > lj + 1.5 * free_tol:
                        continue
                if is_free and (u < 0 or u > lj):  # 상대 선의 연장선에서 만나려면 그쪽 끝도 자유 끝이어야 한다
                    if not free(j, 0 if u < 0 else 1):
                        continue
                if best is None or t < best[0]:
                    best = (t, j, u, lj)
            if best:
                t, j, u, lj = best
                X = P + d * t
                segs[i][e] = X
                if u < 0:
                    segs[j][0] = X
                elif u > lj:
                    segs[j][1] = X
    return [(s_[0], s_[1], s_[2], s_[3]) for s_ in segs]


def _find_vertical_arrows(gray, text_zone, u):
    """AI가 그린 '점선 세로 화살표'(짧은 대시들이 세로로 늘어서고 끝에 채운 삼각 화살촉)를 한 묶음으로 찾는다.
    u = 원본 1px 에 해당하는 작업 픽셀 수. 반환: [(x, y_tail, y_head_base, head_x0, head_x1, y_tip)], 지울 영역 마스크."""
    dark = (gray < 125) & ~text_zone
    lab, n = ndi.label(dark)
    objs = ndi.find_objects(lab)
    dashes, heads = [], []
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        area = int((lab[sl] == i).sum())
        if area < 40:
            continue
        if w <= 7 * u and 5 * u <= h <= 20 * u and w / float(h) <= 0.7 and area / float(w * h) >= 0.6:
            dashes.append((i, (x0 + x1) / 2.0, y0, y1))
    # 화살촉: 선(굵기 ~4px)보다 훨씬 굵은 채운 삼각형만 남도록 큰 원으로 열기 연산 후, 원래 크기로 되살린다
    op = morphology.opening(dark, morphology.disk(max(3, int(round(3.4 * u)))))
    lab_h, n_h = ndi.label(op)
    for j, sl in enumerate(ndi.find_objects(lab_h), start=1):
        if sl is None:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        area = int((lab_h[sl] == j).sum())
        pad = int(round(1.6 * u))
        if 8 * u <= w <= 40 * u and 8 * u <= h <= 70 * u and 0.3 <= area / float(w * h) <= 0.85 and w / float(h) <= 1.6 and h / float(w) <= 2.2:
            heads.append((-j, x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    arrows, kill = [], np.zeros(gray.shape, bool)
    for hid, hx0, hy0, hx1, hy1 in heads:
        hcx = (hx0 + hx1) / 2.0
        chain = sorted([d for d in dashes if abs(d[1] - hcx) <= 5 * u], key=lambda d: d[2])
        above = [d for d in chain if d[3] <= hy0 + 2 * u]
        below = [d for d in chain if d[2] >= hy1 - 2 * u]
        for side, dl in (("up", below), ("down", above)):
            if len(dl) < 2:
                continue
            ordered = sorted(dl, key=lambda d: d[2]) if side == "up" else sorted(dl, key=lambda d: -d[3])
            near = [d for d in ordered]
            # 머리에서 가까운 것부터 간격이 이어지는 것만
            if side == "up":
                near = sorted(dl, key=lambda d: d[2])
                grp = [near[0]]
                for d in near[1:]:
                    if d[2] - grp[-1][3] <= 25 * u:
                        grp.append(d)
                    else:
                        break
                if hy1 - 0 > 0 and near[0][2] - hy1 > 30 * u:
                    continue
                tail = grp[-1][3]
            else:
                near = sorted(dl, key=lambda d: -d[3])
                grp = [near[0]]
                for d in near[1:]:
                    if grp[-1][2] - d[3] <= 25 * u:
                        grp.append(d)
                    else:
                        break
                if hy0 - near[0][3] > 30 * u:
                    continue
                tail = grp[-1][2]
            if len(grp) < 2:
                continue
            for d in grp:
                kill |= (lab == d[0])
            if hid > 0:
                kill |= (lab == hid)
            else:
                kill |= ndi.binary_dilation(lab_h == -hid, iterations=max(2, int(2 * u)))  # 삼각형 본체만 지운다(그 뒤로 지나가는 선은 최대한 남긴다)
            x_shaft = float(np.median([d[1] for d in grp]))
            hh = min(hy1 - hy0, 1.6 * (hx1 - hx0))  # 머리 높이(블록에 붙은 대시 조각은 제외)
            if side == "up":
                arrows.append((x_shaft, float(tail), float(hy0 + hh), float(hx0), float(hx1), float(hy0)))
            else:
                arrows.append((x_shaft, float(tail), float(hy1 - hh), float(hx0), float(hx1), float(hy1)))
            break
    return arrows, ndi.binary_dilation(kill, iterations=max(2, int(2 * u)))


def _find_text_clusters(mask, long_edge):
    """작은 어두운 덩어리들이 가로로 늘어선 묶음 = 글자줄. 반환: [{'bbox':(x0,y0,x1,y1), 'pix': bool mask}]"""
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return []
    objs = ndi.find_objects(lab)
    max_side = 0.06 * long_edge
    small = np.zeros_like(mask)
    count = 0
    for i, sl in enumerate(objs, start=1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if max(h, w) <= max_side and h * w >= 10:
            small[sl][lab[sl] == i] = True
            count += 1
    if count < 3:
        return []
    gap = max(5, int(0.013 * long_edge))
    joined = ndi.binary_dilation(small, structure=np.ones((3, gap * 2 + 1), bool))
    jl, jn = ndi.label(joined)
    clusters = []
    for j in range(1, jn + 1):
        pix = (jl == j) & small
        ys, xs = np.nonzero(pix)
        if len(ys) < 40:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        h = y1 - y0 + 1; w = x1 - x0 + 1
        if h < 0.005 * long_edge or h > 0.07 * long_edge or w / h < 1.8:
            continue
        nl, _ = ndi.label(pix, structure=np.ones((3, 3)))
        if nl.max() < 3:
            continue
        # 진짜 글자줄은 글자들의 높이가 비슷하고 세로 위치(중심)가 거의 같다 — 박스 꼭대기처럼 사선 조각이 모인 것은 걸러낸다
        comps = [(sl[0].stop - sl[0].start, (sl[0].start + sl[0].stop) / 2.0) for sl in ndi.find_objects(nl)]
        comps = [c_ for c_ in comps if c_[0] >= 0.35 * h]
        if len(comps) < 3:
            continue
        hs = np.array([c_[0] for c_ in comps], float); cy = np.array([c_[1] for c_ in comps], float)
        if np.std(cy) > 0.2 * h or np.std(hs) > 0.4 * np.mean(hs):
            continue
        cov = np.cov(np.vstack([xs, ys]))
        ev, evec = np.linalg.eigh(cov)
        main = evec[:, np.argmax(ev)]
        ang = abs(math.degrees(math.atan2(main[1], main[0]))) % 180
        if min(ang, 180 - ang) > 9:
            continue
        clusters.append({"bbox": (int(x0), int(y0), int(x1), int(y1)), "pix": pix})
    return clusters


def analyze_layout(im):
    """이미지를 '칸(객체)'과 '글자줄'로 나눈다. 반환 좌표는 입력 이미지 픽셀 기준.
    objects: 도식 덩어리(바닥판·떠 있는 볼륨 포함) 상자 목록, labels: 글자줄 상자 목록."""
    im = im.convert("RGB")
    W0, H0 = im.size
    k = min(1.0, 2000.0 / max(W0, H0))
    work = im.resize((int(W0 * k), int(H0 * k)), Image.LANCZOS) if k < 1.0 else im
    arr = np.asarray(work).astype(np.float32)
    gray = arr.mean(axis=2)
    H, W = gray.shape
    L = max(H, W)
    clusters = _find_text_clusters(gray < 140, L)
    orange = (arr[..., 0] - arr[..., 2] > 38) & (arr[..., 0] > 140)
    mask = (gray < 232) | orange
    mask = morphology.closing(mask, morphology.disk(max(3, int(0.007 * L))))
    mask = ndi.binary_fill_holes(mask)
    mask = morphology.remove_small_objects(mask, int(0.0006 * H * W))
    lab, n = ndi.label(mask)
    boxes = []
    for sl in ndi.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) * (x1 - x0) >= 0.002 * H * W:
            boxes.append([x0, y0, x1, y1])
    # 가까이 있는 상자(떠 있는 볼륨 등)는 하나의 칸으로 합친다
    pad = int(0.02 * L)
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a[0] - pad < b[2] and b[0] - pad < a[2] and a[1] - pad < b[3] and b[1] - pad < a[3]:
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    boxes.pop(j); changed = True
                    break
            if changed:
                break
    # 글자줄 = 도식 상자 바깥에 있는 글자 후보만(도식 안쪽의 화살촉 줄 같은 오검출 제외), 글자줄 자체가 상자가 된 것도 제외
    def _inside(cx, cy, b):
        return b[0] <= cx <= b[2] and b[1] <= cy <= b[3]
    cand = []
    for c in clusters:
        x0, y0, x1, y1 = c["bbox"]
        cand.append((x0, y0, x1 + 1, y1 + 1))
    label_boxes = [lb for lb in cand if not any(_inside((lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2, b) for b in boxes if (b[2] - b[0]) * (b[3] - b[1]) > 4 * (lb[2] - lb[0]) * (lb[3] - lb[1]))]
    boxes = [b for b in boxes if not any(_inside((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, lb) for lb in label_boxes)]
    labels = label_boxes
    inv = 1.0 / k
    to_orig = lambda b: tuple(int(round(v * inv)) for v in b)
    return {"objects": [to_orig(b) for b in sorted(boxes, key=lambda b: (b[1] // max(1, int(0.15 * H)), b[0]))],
            "labels": [to_orig(b) for b in labels], "size": (W0, H0)}


def glyph_path(im, bbox, pad=3):
    """원본의 글자줄 영역을 글자 모양 그대로 윤곽선(닫힌 경로)으로 옮긴다."""
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    g = np.asarray(im.convert("L").crop((x0, y0, x1, y1)).resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.LANCZOS)).astype(np.float32)
    glyph = g < 150
    ds = []
    for cnt in measure.find_contours(np.pad(glyph, 1).astype(float), 0.5):
        if len(cnt) < 8:
            continue
        ap = measure.approximate_polygon(cnt, 0.9)
        ds.append("M" + " L".join("%.1f %.1f" % (x0 + (x - 1) / 3.0, y0 + (y - 1) / 3.0) for y, x in ap) + "Z")
    return '<path d="%s" fill="#1d1d1d" fill-rule="evenodd"/>' % " ".join(ds) if ds else ""


def filled_shape_mask(im, line_art=False, size=200):
    """형태 비교용: 도식의 채워진 실루엣(불리언)을 bbox 기준으로 size x size 로 정규화해서 돌려준다."""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    g = a.mean(axis=2)
    m = (g < 200) if line_art else ((g < 215) | ((a[..., 0] - a[..., 2] > 38) & (a[..., 0] > 140)))
    m = morphology.closing(m, morphology.disk(max(2, int(0.006 * max(m.shape)))))
    m = ndi.binary_fill_holes(m)
    ys, xs = np.nonzero(m)
    if len(ys) < 50:
        return None
    crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((size, size), Image.NEAREST)) > 127


def enhance_image(im):
    """캡처/AI 이미지처럼 화질이 떨어지는 입력을 선 추출 전에 다듬는다(완전 로컬).
    ① 배경이 회색빛이면 흰색으로 펴고(레벨 보정) ② JPEG 블록·잔노이즈를 약하게 제거하고 ③ 너무 작으면 먼저 확대한다."""
    arr = np.asarray(im.convert("RGB")).astype(np.float32)
    gray = arr.mean(axis=2)
    lo = float(np.percentile(gray, 0.3))
    hi = float(np.percentile(gray, 70))
    if hi - lo > 40:
        arr = np.clip((arr - lo) / (hi - lo) * 255.0, 0, 255)
    arr = np.stack([ndi.median_filter(arr[..., c], size=3) for c in range(3)], axis=2)
    out = Image.fromarray(arr.astype(np.uint8))
    long_edge = max(out.size)
    if long_edge < 1500:
        k = 1500.0 / long_edge
        out = out.resize((int(out.width * k), int(out.height * k)), Image.LANCZOS)
    return out

def texture_noise(im):
    """이미지가 '깨끗한 합성/AI 도식'인지 '캡처·사진·스캔'인지 가르는 값. 평평한 면(흰 바탕 제외) 안의 잔무늬(라플라시안 평균)를 잰다.
    깨끗한 도식 0.05~0.14, 캡처/사진 2.2~4.9 (실측). 면이 거의 없는 순수 선화는 전체 잡음으로 본다. 반환: (면 잡음 또는 -1, 전체 잡음)"""
    g0 = im.convert("RGB")
    sc = 900.0 / max(g0.size)
    if sc < 1:
        g0 = g0.resize((max(1, int(g0.width * sc)), max(1, int(g0.height * sc))), Image.LANCZOS)
    g = np.asarray(g0).astype(np.float32).mean(axis=2)
    flat = (ndi.maximum_filter(g, size=5) - ndi.minimum_filter(g, size=5)) < 14
    lap = np.abs(ndi.laplace(g))
    face = flat & (g < 248)
    n_all = float(lap[flat].mean()) if flat.any() else 0.0
    return (float(lap[face].mean()) if face.sum() > 500 else -1.0), n_all


def is_clean_diagram(im):
    nf, n_all = texture_noise(im)
    return (nf < 1.0) if nf >= 0 else (n_all < 0.15)


def trace_lines(image_bytes, ocr_texts=None, target_long_edge=3600, debug=None, enhance=None, fills=False, line_art=False, auto_clean=True):
    im0 = Image.open(io.BytesIO(image_bytes))
    if im0.mode in ("RGBA", "LA", "P"):
        rgba = im0.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        im0 = flat
    else:
        im0 = im0.convert("RGB")
    clean_auto = False
    if auto_clean and not line_art and is_clean_diagram(im0):
        # 깨끗한 도식(합성·AI 도식)은 바깥 실루엣을 따로 만들면 이웃한 덩어리가 하나로 합쳐지므로, 검출한 선을 그대로 쓰는 방식으로 처리한다
        line_art = True; clean_auto = True
    if enhance is None:  # 자동: 작은 이미지이거나 배경이 회색빛인 캡처/저화질 입력만 다듬는다(고화질에는 오히려 해롭다)
        g0 = np.asarray(im0.convert('L'))
        enhance = (not clean_auto) and (max(im0.size) < 1100 or float(np.percentile(g0, 70)) < 238)
    orig_long = max(im0.size)
    if enhance:
        im0 = enhance_image(im0)
    W0, H0 = im0.size
    long0 = max(W0, H0)
    s = min(3.0, max(1.0, target_long_edge / long0))
    f = s / 3.0
    im = im0.resize((int(round(W0 * s)), int(round(H0 * s))), Image.LANCZOS) if s != 1.0 else im0
    rgb = np.asarray(im).astype(np.float32)
    H, W = rgb.shape[:2]
    gray = rgb.mean(axis=2)
    long_edge = max(W, H)

    bh = morphology.black_tophat(gray.astype(np.uint8), morphology.disk(max(3, int(round(7 * f))))).astype(np.float32)
    ink = bh > 30.0
    ink = morphology.remove_small_objects(ink, 12)

    # ── 글자줄 ──
    clusters = _find_text_clusters(ink | (gray < 120), long_edge)  # 굵은 글자 획은 선 검출만으론 윤곽 조각이 되므로 어두운 영역도 함께 본다
    if debug is not None:
        debug['text_boxes'] = [c['bbox'] for c in clusters]; debug['size_work'] = (W, H)
    text_mask = np.zeros((H, W), bool)
    for c in clusters:
        text_mask |= c["pix"]
    text_zone = ndi.binary_dilation(text_mask, structure=np.ones((3, 3)), iterations=max(2, int(3 * f)))
    for c in clusters:  # 글자줄 사각형 전체(양옆 한 글자 여유)를 글자 영역으로: 'A' 같은 삼각형 글자가 화살촉으로 오인되지 않게
        bx0, by0, bx1, by1 = c['bbox']; padx = int(1.6 * (by1 - by0 + 1)); pady = int(0.2 * (by1 - by0 + 1))
        text_zone[max(0, by0 - pady):by1 + pady + 1, max(0, bx0 - padx):bx1 + padx + 1] = True

    # ── 화살촉: 선보다 굵은 어두운 덩어리 ──
    dark = (gray < 125) & ~text_zone
    opened = morphology.opening(dark, morphology.disk(max(2, int(round(4 * f)))))
    lab, n = ndi.label(opened)
    arrows = []
    arrow_blobs = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 230 * f * f:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        if (x1 - x0) < 14 * f or (y1 - y0) < 14 * f:
            continue
        blob = lab == i
        bw, bh_ = (x1 - x0 + 1), (y1 - y0 + 1)
        fill_ratio = len(ys) / float(bw * bh_)
        if not (0.5 <= bw / bh_ <= 2.0) or not (0.35 <= fill_ratio <= 0.8):
            continue
        mean_rgb = rgb[blob].mean(axis=0)
        if (mean_rgb.max() - mean_rgb.min()) > 28 or mean_rgb.mean() > 95:
            continue
        ev = np.linalg.eigvalsh(np.cov(np.vstack([xs, ys]).astype(np.float64)))
        if ev[0] <= 0 or math.sqrt(ev[1] / ev[0]) > 2.2:  # 길쭉한 덩어리(굵은 선)는 화살촉이 아니다
            continue
        mid = (y0 + y1) / 2
        arrows.append((x0, y0, x1, y1, "down" if (ys < mid).sum() > (ys >= mid).sum() else "up"))
        arrow_blobs.append(blob)
    # 일정 간격으로 줄지어 선 작은 덩어리(점선 가장자리를 점으로 다시 그린 것)는 화살촉이 아니다 — 아이소 방향으로 3개 이상 촘촘히 정렬되면 버린다
    if len(arrows) >= 3:
        cs = [((a[0] + a[2]) / 2.0, (a[1] + a[3]) / 2.0, max(a[2] - a[0], a[3] - a[1], 1)) for a in arrows]
        parent = list(range(len(arrows)))
        def _find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for i in range(len(cs)):
            for j in range(i + 1, len(cs)):
                d = np.array([cs[j][0] - cs[i][0], cs[j][1] - cs[i][1]])
                dist = float(np.linalg.norm(d))
                size = max(cs[i][2], cs[j][2])
                if dist == 0 or dist > 2.6 * size:
                    continue
                ang = math.degrees(math.atan2(d[1], d[0])) % 180
                if min(min(abs(ang - a_), 180 - abs(ang - a_)) for a_ in DIRS.values()) <= 7:
                    parent[_find(i)] = _find(j)
        comp_size = {}
        for i in range(len(arrows)):
            comp_size[_find(i)] = comp_size.get(_find(i), 0) + 1
        keep = [i for i in range(len(arrows)) if comp_size[_find(i)] < 3]
        arrows = [arrows[i] for i in keep]
        arrow_blobs = [arrow_blobs[i] for i in keep]
    arrow_only = np.zeros((H, W), bool)
    for bm in arrow_blobs:
        arrow_only |= bm
    arrow_zone = morphology.dilation(arrow_only, morphology.disk(max(2, int(3 * f))))  # 화살촉만 선 검출에서 뺀다(굵은 선까지 지우지 않는다)
    v_arrows = []
    if line_art:  # AI 선화의 점선 세로 화살표(대시 + 채운 화살촉)는 한 묶음으로 따로 뽑는다
        v_arrows, v_zone = _find_vertical_arrows(gray, text_zone, s)
        arrow_zone = arrow_zone | v_zone

    line_ink = ink & ~arrow_zone & ~text_zone
    line_ink = morphology.remove_small_objects(line_ink, max(20, int(40 * f * f)))
    # 두꺼운 선: 가는 선 기준의 검출(black-tophat)은 굵은 선의 한가운데를 놓치고 양쪽 가장자리만 잡아서 선이 두 줄이 된다.
    # 진한 획(굵기가 일정 이하인 어두운 덩어리)은 통째로 선으로 넣어서 중심선 하나로 만든다. 큰 면(화살촉·채운 면)은 제외한다.
    dark_core = (gray < 115) & ~arrow_zone & ~text_zone
    stroke_mask = np.zeros_like(dark_core)
    if dark_core.any():
        dt_dark = ndi.distance_transform_edt(dark_core)
        lab_d, n_d = ndi.label(dark_core, structure=np.ones((3, 3)))
        mx = ndi.maximum(dt_dark, lab_d, range(1, n_d + 1))
        tmax = 0.0060 * long_edge        # 반굵기 상한(긴 변의 약 0.6%, 선 굵기로는 1.2%): 이보다 두꺼운 덩어리는 선이 아니라 면
        okc = [i + 1 for i, v in enumerate(mx) if 2.4 <= v <= tmax]   # 반굵기 2.4px 이상 = 가는 선 검출이 놓치는 굵기
        if okc:
            stroke_mask = np.isin(lab_d, okc)
            line_ink = line_ink | stroke_mask
    if debug is not None:
        debug['stroke_mask'] = stroke_mask; debug['dark_comps'] = (n_d if dark_core.any() else 0, len(okc) if dark_core.any() else 0, (sorted([round(float(v),1) for v in mx])[-8:] if dark_core.any() else []))
    # 선이 아니라 면의 명암 차이로만 그려진 모서리(흰 윗면/회색 옆면 경계)도 잡는다: 완만한 밝기 변화의 기울기 능선
    smooth = filters.gaussian(gray, sigma=max(1.5, 2.2 * f))
    grad = filters.sobel(smooth)
    orange_zone = ndi.binary_dilation((rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140), iterations=max(2, int(4 * f)))
    tonal = filters.apply_hysteresis_threshold(grad, TONAL_LOW, TONAL_HIGH) & ~arrow_zone & ~text_zone & ~orange_zone
    if stroke_mask.any():   # 굵은 선의 양쪽 경계는 이미 중심선으로 잡았으니 명암 경계(tonal)로 한 번 더 잡지 않는다
        tonal &= ~ndi.binary_dilation(stroke_mask, iterations=max(4, int(14 * f)))
    tonal = morphology.remove_small_objects(tonal, max(30, int(60 * f * f)))
    tonal = morphology.skeletonize(tonal)
    if debug is not None:
        debug['tonal'] = tonal; debug['grad_p'] = [float(np.percentile(grad, p)) for p in (50, 90, 99)]
    line_ink = line_ink | tonal
    line_dil = ndi.binary_dilation(line_ink, iterations=max(1, int(2 * f)))

    # ── 배경(바깥 흰 바탕): 선으로 막힌 면은 배경이 아니다 ──
    light = (gray > 225) & ~line_dil
    lab_l, _ = ndi.label(light)
    border = set(np.unique(np.concatenate([lab_l[0], lab_l[-1], lab_l[:, 0], lab_l[:, -1]]))) - {0}
    background = np.isin(lab_l, list(border))

    # ── 선 검출 → 3방향 스냅 ──
    skel = morphology.skeletonize(line_ink)
    thetas = np.array([math.radians(a + d + 90.0) for a in DIRS.values() for d in np.arange(-6, 6.01, 0.5)])
    segs = transform.probabilistic_hough_line(skel, threshold=8, line_length=int(22 * f), line_gap=int(6 * f), theta=thetas, rng=7)

    groups = {k: [] for k in DIRS}
    for p0, p1 in segs:
        k = _classify(p0, p1)
        u, nrm = UNIT[k], NORM[k]
        a = np.array(p0, float); b = np.array(p1, float)
        t0, t1 = sorted([float(a @ u), float(b @ u)])
        groups[k].append([float((a + b) / 2 @ nrm), t0, t1])

    def coverage(k, c, ta, tb):
        u, nrm = UNIT[k], NORM[k]
        pts = [u * (ta + (tb - ta) * q) + nrm * c for q in np.linspace(0, 1, 9)]
        hit = 0
        for p in pts:
            x, y = int(round(p[0])), int(round(p[1]))
            if 0 <= x < W and 0 <= y < H and line_dil[y, x]:
                hit += 1
        return hit / len(pts)

    merged = []  # [k, c, t0, t1, style]
    for k, items in groups.items():
        items.sort()
        clusters_k = []
        for it in items:
            if clusters_k and abs(it[0] - np.mean([x[0] for x in clusters_k[-1]])) <= 22 * f:
                clusters_k[-1].append(it)
            else:
                clusters_k.append([it])
        for cl in clusters_k:
            c = float(np.mean([x[0] for x in cl]))
            ivs = sorted((x[1], x[2]) for x in cl)
            res = [list(ivs[0])]
            for a, b in ivs[1:]:
                gap = a - res[-1][1]
                long_pair = (res[-1][1] - res[-1][0]) >= 100 * f and (b - a) >= 100 * f
                if gap <= 4 * f or (gap <= 60 * f and coverage(k, c, res[-1][1], a) >= 0.55) or (long_pair and gap <= 90 * f and (not line_art or coverage(k, c, res[-1][1], a) >= 0.3)) or (line_art and k != 'V' and gap <= 45 * f):
                    res[-1][1] = max(res[-1][1], b)
                else:
                    res.append([a, b])
            # 가까운 조각끼리만 묶는다(다른 칸의 선과 한 줄로 이어붙지 않도록)
            near_groups = [[res[0]]]
            for piece in res[1:]:
                if piece[0] - near_groups[-1][-1][1] <= 90 * f:
                    near_groups[-1].append(piece)
                else:
                    near_groups.append([piece])
            for grp in near_groups:
                if len(grp) >= 3:
                    span = grp[-1][1] - grp[0][0]
                    cover = sum(b - a for a, b in grp) / (span + 1e-6)
                    lens = [b - a for a, b in grp]
                    gaps = [grp[i + 1][0] - grp[i][1] for i in range(len(grp) - 1)]
                    if (not line_art or k == 'V') and np.median(lens) < 45 * f and cover < 0.8 and np.std(gaps) < 0.7 * np.mean(gaps) + 6 * f:
                        merged.append([k, c, grp[0][0], grp[-1][1], "dash"])
                        continue
                for a, b in grp:
                    if b - a >= 28 * f:
                        merged.append([k, c, a, b, "solid"])

    # ── 모서리 맞물림: 끝점을 다른 방향 선과의 교점에 맞춘다 ──
    snap = 12 * f
    for i, L1 in enumerate(merged):
        k1, c1 = L1[0], L1[1]
        for end in (2, 3):
            best = None
            for j, L2 in enumerate(merged):
                if i == j or L2[0] == k1:
                    continue
                A = np.array([UNIT[k1], -UNIT[L2[0]]]).T
                rhs = NORM[L2[0]] * L2[1] - NORM[k1] * c1
                try:
                    t1, t2 = np.linalg.solve(A, rhs)
                except np.linalg.LinAlgError:
                    continue
                d = abs(t1 - L1[end])
                if d <= snap and L2[2] - snap <= t2 <= L2[3] + snap and (best is None or d < best[0]):
                    best = (d, t1)
            if best:
                L1[end] = best[1]
    changed = True
    while changed:
        changed = False
        solids = [L for L in merged if L[4] == 'solid']
        solids.sort(key=lambda L: (L[0], L[1], L[2]))
        for ia in range(len(solids)):
            A = solids[ia]
            for ib in range(len(solids)):
                B = solids[ib]
                if A is B or A[0] != B[0] or abs(A[1] - B[1]) > 5 * f or B[2] <= A[3]:
                    continue
                gap = B[2] - A[3]
                if gap > 140 * f or (A[3] - A[2]) < 50 * f or (B[3] - B[2]) < 50 * f:
                    continue
                k_, c_ = A[0], (A[1] + B[1]) / 2
                mid_ = UNIT[k_] * ((A[3] + B[2]) / 2) + NORM[k_] * c_
                inside = True
                for sgn in (1, -1):
                    pp = mid_ + NORM[k_] * (7 * f * sgn)
                    xx, yy = int(round(pp[0])), int(round(pp[1]))
                    if not (0 <= xx < W and 0 <= yy < H) or background[yy, xx]:
                        inside = False
                if (inside and not line_art) or coverage(k_, c_, A[3], B[2]) >= 0.3:
                    A[3] = max(A[3], B[3]); A[1] = c_
                    merged.remove(B); changed = True
                    break
            if changed:
                break
    merged = [L for L in merged if L[3] - L[2] >= 55 * f or L[4] == 'dash']
    if debug is not None:
        debug['line_ink'] = line_ink; debug['merged'] = [list(m) for m in merged]; debug['scale'] = s

    # 바닥판(주황) 가장자리 질감에서 생긴 짧은 선 제거
    plate_raw = (rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140)
    plate_zone = ndi.binary_dilation(plate_raw, iterations=max(1, int(2 * f)))
    plate_core = ndi.binary_erosion(plate_raw, iterations=max(2, int(6 * f)))
    plate_wide = ndi.binary_dilation(plate_raw, iterations=max(2, int(7 * f)))

    def _in_plate(L):
        k, c, t0, t1 = L[0], L[1], L[2], L[3]
        pts = [UNIT[k] * (t0 + (t1 - t0) * q) + NORM[k] * c for q in np.linspace(0.05, 0.95, 12)]
        hit = sum(1 for p in pts if 0 <= int(p[0]) < W and 0 <= int(p[1]) < H and plate_core[int(p[1]), int(p[0])])
        return hit / len(pts) > 0.5

    merged = [L for L in merged if not (_in_plate(L) and (L[3] - L[2]) < 160 * f)]
    # ── 선 역할/색 ──
    def is_bg(p):
        x, y = int(round(p[0])), int(round(p[1]))
        return True if not (0 <= x < W and 0 <= y < H) else bool(background[y, x] or plate_wide[y, x])

    lines = []
    for k, c, t0, t1, style in merged:
        u, nrm = UNIT[k], NORM[k]
        p0 = u * t0 + nrm * c; p1 = u * t1 + nrm * c
        mid = (p0 + p1) / 2
        off = 7 * f
        outside = is_bg(mid + nrm * off) != is_bg(mid - nrm * off)
        cols = []
        for q in np.linspace(0.1, 0.9, 10):
            p = p0 + (p1 - p0) * q
            cols.append(rgb[min(H - 1, max(0, int(p[1]))), min(W - 1, max(0, int(p[0])))])
        cm = np.mean(cols, axis=0)
        role = "dash" if style == "dash" else ("outline" if outside else "inner")
        lines.append((p0, p1, role, (cm[0] - cm[2]) > 14))

    # ── 바깥 실루엣: 배경과 맞닿는 도식의 바깥 경계를 영역으로 따서 3방향 직선으로 맞춘 닫힌 곡선(끊김 없는 외곽선) ──
    silhouettes = []
    merged_into_sil = set()
    # 실제로 어둡거나 색이 있는 픽셀(선·바닥판)만으로 영역을 만든다 — 선 근처의 흐린 잡음은 제외
    obj = ((gray < 215) | ((rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140))) & ~text_zone
    if line_art:  # 깨끗한 선화는 건물 윤곽을 따로 만들지 않고 선 그대로 쓴다. 단, 점선으로 흐릿하게 그려지는 주황 바닥판은 색 영역에서 윤곽을 딴다
        obj = (rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140) & ~text_zone
    obj = morphology.remove_small_objects(obj, int(60 * f * f))
    obj = ndi.binary_fill_holes(obj)
    obj = morphology.closing(obj, morphology.disk(max(3, int(7 * f))))
    obj = morphology.opening(obj, morphology.disk(max(3, int(7 * f))))
    obj = ndi.binary_fill_holes(obj)
    obj = morphology.remove_small_objects(obj, int(2500 * f * f))
    lab_s, n_s = ndi.label(obj)
    boundary = obj & ~ndi.binary_erosion(obj, iterations=1)
    for i in range(1, n_s + 1):
        comp = lab_s == i
        cnts = measure.find_contours(np.pad(comp, 1).astype(float), 0.5)
        if not cnts:
            continue
        cnt = max(cnts, key=len)
        ap = measure.approximate_polygon(cnt, 9.0 * f)[:-1]
        pts = np.array([[x - 1, y - 1] for y, x in ap], float)
        n = len(pts)
        if n < 3:
            continue
        edge_line = []  # 각 변: (k, c) 또는 None
        for a in range(n):
            p, q = pts[a], pts[(a + 1) % n]
            if np.linalg.norm(q - p) < 18 * f:
                edge_line.append(None); continue
            ang = math.degrees(math.atan2(q[1] - p[1], q[0] - p[0])) % 180
            k, dk = min(((kk, min(abs(ang - aa), 180 - abs(ang - aa))) for kk, aa in DIRS.items()), key=lambda z: z[1])
            edge_line.append((k, float(((p + q) / 2) @ NORM[k])) if dk <= 12 else None)
        # 실루엣 변과 같은 방향·가까운 실제 선이 있으면, 변을 그 선의 중심에 맞추고 그 선은 합친다(이중선 방지)
        for a in range(n):
            el = edge_line[a]
            if not el or line_art:   # 선화 모드의 실루엣은 바닥판뿐이라, 건물 모서리 선을 실루엣 변에 합치지 않는다(지워지는 것을 막음)
                continue
            k_, c_ = el
            p_, q_ = pts[a], pts[(a + 1) % n]
            ta, tb = sorted([float(p_ @ UNIT[k_]), float(q_ @ UNIT[k_])])
            best_c, wsum, csum = None, 0.0, 0.0
            for idx_, L_ in enumerate(lines):
                kk_ = _classify(L_[0], L_[1])
                if kk_ != k_:
                    continue
                mid_ = (L_[0] + L_[1]) / 2
                cl_ = float(mid_ @ NORM[k_])
                if abs(cl_ - c_) > 42 * f:
                    continue
                la, lb = sorted([float(L_[0] @ UNIT[k_]), float(L_[1] @ UNIT[k_])])
                ov = min(tb, lb) - max(ta, la)
                if ov > 0.3 * min(tb - ta, lb - la):
                    wl = lb - la
                    wsum += wl; csum += cl_ * wl
                    merged_into_sil.add(idx_)
            if wsum > 0:
                edge_line[a] = (k_, csum / wsum)
        # 직선(아이소 3방향) 변이 둘레의 일정 비율 이하이면 곡선 객체(나무·사람 등)라서 실루엣을 만들지 않는다
        perim = sum(float(np.linalg.norm(pts[(a + 1) % n] - pts[a])) for a in range(n))
        straight = sum(float(np.linalg.norm(pts[(a + 1) % n] - pts[a])) for a in range(n) if edge_line[a])
        if debug is not None:
            debug.setdefault('sil_stats', []).append((round(straight / perim, 2) if perim else 0, n))
        if perim <= 0 or straight / perim < 0.6:
            continue
        verts = []
        for a in range(n):
            e0, e1 = edge_line[a - 1], edge_line[a]
            if e0 and e1 and e0[0] != e1[0]:
                A = np.array([UNIT[e0[0]], -UNIT[e1[0]]]).T
                try:
                    t0_, _ = np.linalg.solve(A, NORM[e1[0]] * e1[1] - NORM[e0[0]] * e0[1])
                    v = UNIT[e0[0]] * t0_ + NORM[e0[0]] * e0[1]
                    if np.linalg.norm(v - pts[a]) <= 20 * f:
                        verts.append(v); continue
                except np.linalg.LinAlgError:
                    pass
            verts.append(pts[a])
        silhouettes.append(np.array(verts))
    if silhouettes:
        dist_b = ndi.distance_transform_edt(~boundary)
        def _on_silhouette(L):
            p0_, p1_ = L[0], L[1]
            for q_ in (0.1, 0.3, 0.5, 0.7, 0.9):
                pt_ = p0_ + (p1_ - p0_) * q_
                x_, y_ = int(round(pt_[0])), int(round(pt_[1]))
                if not (0 <= x_ < W and 0 <= y_ < H) or dist_b[y_, x_] >= 16 * f:
                    return False
            return True
        lines = [L for i_, L in enumerate(lines) if i_ not in merged_into_sil and not _on_silhouette(L)]
    if debug is not None:
        debug['silhouettes'] = [v.tolist() for v in silhouettes]
        debug['lines_after'] = [(L[0].tolist(), L[1].tolist(), L[2]) for L in lines]; debug['f'] = f
    _trace_info = {}
    if line_art and lines:
        dt_thick = ndi.distance_transform_edt(gray < 140)
        thick = []
        for p0_, p1_, _r, _b in lines:
            vals = []
            for q_ in np.linspace(0.1, 0.9, 15):
                pt_ = p0_ + (p1_ - p0_) * q_
                x_, y_ = int(round(pt_[0])), int(round(pt_[1]))
                if 0 <= x_ < W and 0 <= y_ < H:
                    r0, r1 = max(0, y_ - 3), min(H, y_ + 4); c0, c1 = max(0, x_ - 3), min(W, x_ + 4)
                    vals.append(float(dt_thick[r0:r1, c0:c1].max()))
            thick.append(2.0 * float(np.percentile(vals, 70)) if vals else 0.0)
        med_t = float(np.median([x for x in thick if x > 0])) if any(x > 0 for x in thick) else 1.0
        tcap = 0.014 * long_edge   # 이보다 두꺼운 '선'은 이미지 가장자리의 어두운 테두리·채운 면이라 선이 아니다
        pos_ = [x for x in thick if 0 < x <= tcap] or [1.0]
        hi_t, lo_t = float(np.percentile(pos_, 90)), float(np.percentile(pos_, 10))
        spread_ok = hi_t / max(lo_t, 1e-6) >= 1.5  # 굵기 차이가 뚜렷할 때만 위계를 둔다(전부 비슷하면 모두 같은 선)
        if debug is not None:
            debug['thick'] = [round(x, 1) for x in thick]; debug['med_t'] = med_t
        sil_fill = None
        if not spread_ok:  # 굵기 차이가 없으면 선으로 둘러싸인 전체 모양을 채워서 바깥 경계 여부로 위계를 정한다
            m_img = Image.new("L", (W, H), 0)
            dm = ImageDraw.Draw(m_img)
            for L_ in lines:
                dm.line([tuple(L_[0]), tuple(L_[1])], fill=255, width=max(15, int(0.012 * max(W, H))))
            sil_fill = ndi.binary_fill_holes(np.asarray(m_img) > 0)
            if debug is not None: debug['sil_fill'] = sil_fill
        off_ = max(10.0, 0.012 * max(W, H))

        def _inside_sil(pt):
            x_, y_ = int(round(pt[0])), int(round(pt[1]))
            return 0 <= x_ < W and 0 <= y_ < H and bool(sil_fill[y_, x_])
        new_lines = []
        for idx_, (L_, tk) in enumerate(zip(lines, thick)):
            if tk > tcap:
                continue
            # 이미지 가장자리를 따라 길게 뻗은 선은 도식이 아니라 틀(스크린샷 테두리·시트 외곽)이다
            _mx = 0.065 * max(W, H)
            _xs = (L_[0][0], L_[1][0]); _ys = (L_[0][1], L_[1][1])
            if (max(_xs) - min(_xs) < 4 and (max(_xs) < _mx or min(_xs) > W - _mx) and abs(_ys[1] - _ys[0]) > 0.4 * H) or                (max(_ys) - min(_ys) < 4 and (max(_ys) < _mx or min(_ys) > H - _mx) and abs(_xs[1] - _xs[0]) > 0.4 * W):
                continue
            style_ = merged[idx_][4] if idx_ < len(merged) else "solid"
            if style_ == "dash":
                role_ = "dash"
            elif spread_ok:
                role_ = "outline" if tk >= 0.72 * hi_t else "inner"
            else:  # AI가 굵기 차이를 안 줬으면 배경과 맞닿는 바깥 경계를 외곽선으로(칸마다 위계가 같게)
                mid_ = (L_[0] + L_[1]) / 2
                v_ = L_[1] - L_[0]
                n_ = np.array([-v_[1], v_[0]]) / (np.linalg.norm(v_) + 1e-9)
                role_ = "outline" if _inside_sil(mid_ + n_ * off_) != _inside_sil(mid_ - n_ * off_) else "inner"
            new_lines.append((L_[0], L_[1], role_, L_[3]))
        lines = _close_open_ends(new_lines, max_ext=0.04 * max(W, H), free_tol=max(8 * f, 0.008 * max(W, H)), orphan_len=0.06 * max(W, H), W_img=W, H_img=H, info=_trace_info)

    # ── 면 채우기 ──
    out_parts = []
    fill_parts = []
    if fills:  # 기본은 단선만: 질감/면 음영은 무시하고 외곽선 중심으로 뽑는다
        orange = (rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140)
        orange = morphology.closing(morphology.opening(orange, morphology.disk(max(2, int(3 * f)))), morphology.disk(max(2, int(5 * f))))
        mask_img = Image.new("L", (W, H), 0)
        dr = ImageDraw.Draw(mask_img)
        for p0, p1, role, brown in lines:
            v = (p1 - p0) / (np.linalg.norm(p1 - p0) + 1e-6)
            dr.line([tuple(p0 - v * 9 * f), tuple(p1 + v * 9 * f)], fill=255, width=max(3, int(5 * f)))
        free = ~(np.asarray(mask_img) > 0)
        lab_f, n_f = ndi.label(free)
        bg_label = lab_f[2, 2]
        TONES = [255, 242, 228, 212]
        min_area = 1500 * f * f

        def contour_polys(comp, tol):
            polys = []
            for cnt in measure.find_contours(np.pad(comp, 1).astype(float), 0.5):
                if len(cnt) < 24:
                    continue
                ap = measure.approximate_polygon(cnt, tol)
                polys.append(" ".join("%.1f,%.1f" % ((x - 1) / s, (y - 1) / s) for y, x in ap))
            return polys

        # 주황 바닥판/볼륨(바탕)
        lab_o, n_o = ndi.label(orange)
        for i in range(1, n_o + 1):
            comp = lab_o == i
            if comp.sum() < 500 * f * f:
                continue
            col = _hex(rgb[comp].mean(axis=0))
            edge = comp & ~ndi.binary_erosion(comp, iterations=2)
            plate = (edge & line_dil).sum() / max(1, edge.sum()) < 0.4
            for pts in contour_polys(comp, 4.0 * f):
                extra = ' stroke="#7b4a35" stroke-width="0.8" stroke-dasharray="1.2 2.4"' if plate else ""
                fill_parts.append('<polygon points="%s" fill="%s" fill-opacity="0.92"%s/>' % (pts, col, extra))
        # 선으로 둘러싸인 면(회색 음영/볼륨 면)
        for i in range(1, n_f + 1):
            if i == bg_label:
                continue
            comp = lab_f == i
            if comp.sum() < min_area:
                continue
            er = morphology.erosion(comp, morphology.disk(max(2, int(4 * f))))
            if er.sum() < 200 * f * f:
                continue
            med = np.median(rgb[er], axis=0)
            if (med[0] - med[2]) > 38:
                col, op = _hex(med), "0.9"
            else:
                lum = float(np.median(gray[er]))
                tone = min(TONES, key=lambda t: abs(t - lum))
                if tone >= 255:
                    continue
                col, op = "#%02x%02x%02x" % (tone, tone, tone), "1"
            for pts in contour_polys(comp, 2.5 * f):
                fill_parts.append('<polygon points="%s" fill="%s" fill-opacity="%s"/>' % (pts, col, op))


    # ── 굵기(원본 픽셀 기준, 큰 이미지는 비례) ──
    # 선 굵기는 '도식의 크기'에 비례해야 한다: 작은 입력을 확대해 처리했다면 확대 비율만큼 굵게 그린다.
    k_w = max(1.0, orig_long / 1200.0) * (long0 / float(orig_long))
    W_OUT, W_IN, W_DASH = (2.4 if line_art else 1.7) * k_w, 1.0 * k_w, 0.85 * k_w
    order = {"inner": 0, "dash": 1, "outline": 2}
    for p0, p1, role, brown in sorted(lines, key=lambda l: order[l[2]]):
        col = "#5a2f1d" if (brown and fills) else "#1d1d1d"
        w = {"outline": W_OUT, "inner": W_IN, "dash": W_DASH}[role]
        d = ' stroke-dasharray="%.1f %.1f"' % (3.2 * k_w, 2.6 * k_w) if role == "dash" else ""
        out_parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.2f" stroke-linecap="round"%s/>' % (
            p0[0] / s, p0[1] / s, p1[0] / s, p1[1] / s, col, w, d))
    for v in silhouettes:
        d_ = 'M' + ' L'.join('%.1f %.1f' % (p[0] / s, p[1] / s) for p in v) + ' Z'
        out_parts.append('<path d="%s" fill="none" stroke="#1d1d1d" stroke-width="%.2f" stroke-linejoin="round" stroke-linecap="round"/>' % (d_, (1.4 * W_IN) if line_art else W_OUT))
    for xs_, yt_, yb_, hx0_, hx1_, ytip_ in v_arrows:  # 점선 세로 화살표: 대시 줄 + 채운 삼각 화살촉
        w_ = (W_IN if False else 1.4 * k_w)
        out_parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#1d1d1d" stroke-width="%.2f" stroke-dasharray="%.1f %.1f"/>' % (
            xs_ / s, yt_ / s, xs_ / s, yb_ / s, w_, 3.2 * k_w, 2.6 * k_w))
        out_parts.append('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#1d1d1d"/>' % (
            hx0_ / s, yb_ / s, hx1_ / s, yb_ / s, xs_ / s, ytip_ / s))
    v_lines = [(float(-L[1]), float(L[2]), float(L[3])) for L in merged if L[0] == 'V']
    for x0, y0, x1, y1, dr_ in ([] if line_art else arrows):
        sz_ = max(x1 - x0, y1 - y0, 1)
        cx_ = (x0 + x1) / 2.0
        base_y = y0 if dr_ == 'down' else y1
        if not any(abs(lx - cx_) <= 1.4 * sz_ and (ya - 1.6 * sz_ <= base_y <= yb + 1.6 * sz_) for lx, ya, yb in v_lines):
            continue  # 선에 붙어 있지 않은 작은 삼각형(모서리 점 등)은 화살촉이 아니다
        x0, y0, x1, y1 = x0 / s, y0 / s, x1 / s, y1 / s
        cx = (x0 + x1) / 2
        pts = ("%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (x0, y0, x1, y0, cx, y1)) if dr_ == "down" else ("%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (x0, y1, x1, y1, cx, y0))
        out_parts.append('<polygon points="%s" fill="#1d1d1d"/>' % pts)

    # ── 글자: 내용을 알면 <text>, 모르면 글자 윤곽 그대로 ──
    texts_used = 0
    ocr_texts = ocr_texts or []
    ocr_boxes = [t["box"] for t in ocr_texts if len(t.get("box") or []) == 4]
    for c in clusters:
        x0, y0, x1, y1 = c["bbox"]
        bx0, by0, bx1, by1 = x0 / s, y0 / s, (x1 + 1) / s, (y1 + 1) / s
        match = None
        for t in ocr_texts:
            tb = t.get("box") or []
            if len(tb) != 4:
                continue
            ix = max(0, min(bx1, tb[2]) - max(bx0, tb[0])); iy = max(0, min(by1, tb[3]) - max(by0, tb[1]))
            inter = ix * iy
            if inter > 0.3 * (bx1 - bx0) * (by1 - by0) and (match is None or inter > match[0]):
                match = (inter, t["text"])
        if match and match[1].strip():
            h = by1 - by0
            out_parts.append('<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" font-weight="600" fill="#1d1d1d" textLength="%.1f" lengthAdjust="spacingAndGlyphs">%s</text>' % (
                bx0, by1 - h * 0.04, FONT, h / 0.72, bx1 - bx0, _esc(match[1].strip())))
            texts_used += 1
        else:
            cx_, cy_ = (bx0 + bx1) / 2, (by0 + by1) / 2
            m_ = 8  # 글자 인식된 줄 바로 옆의 잔여 조각은 중복이므로 버린다
            if any(b[0] - m_ <= cx_ <= b[2] + m_ and b[1] - m_ <= cy_ <= b[3] + m_ for b in ocr_boxes):
                continue
            pad = max(3, int(3 * f))
            sub_y0, sub_y1 = max(0, y0 - pad), min(H, y1 + pad + 1); sub_x0, sub_x1 = max(0, x0 - pad), min(W, x1 + pad + 1)
            glyph = (gray[sub_y0:sub_y1, sub_x0:sub_x1] < 150)
            ds = []
            for cnt in measure.find_contours(np.pad(glyph, 1).astype(float), 0.5):
                if len(cnt) < 8:
                    continue
                ap = measure.approximate_polygon(cnt, 0.8 * f)
                ds.append("M" + " L".join("%.1f %.1f" % ((x - 1 + sub_x0) / s, (y - 1 + sub_y0) / s) for y, x in ap) + "Z")
            if ds:
                out_parts.append('<path d="%s" fill="#1d1d1d" fill-rule="evenodd"/>' % " ".join(ds))

    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W0, H0, W0, H0),
           '<rect width="100%" height="100%" fill="#fff"/>'] + (fill_parts if fills else []) + out_parts + ["</svg>"]
    roles = {r: sum(1 for l in lines if l[2] == r) for r in ("outline", "inner", "dash")}
    return {
        "svg": "\n".join(svg),
        "stats": {"clean": clean_auto, "complex": bool(_trace_info.get("complex")), "lines": len(lines), "roles": roles, "arrows": len(arrows), "text_lines": len(clusters), "text_editable": texts_used,
                  "size": [W0, H0], "enhanced": bool(enhance), "k_w": k_w},
    }
