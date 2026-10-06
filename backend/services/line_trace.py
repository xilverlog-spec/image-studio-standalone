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


def _find_text_clusters(mask, long_edge):
    """작은 어두운 덩어리들이 가로로 늘어선 묶음 = 글자줄. 반환: [{'bbox':(x0,y0,x1,y1), 'pix': bool mask}]"""
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return []
    objs = ndi.find_objects(lab)
    max_side = 0.03 * long_edge
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
        if h < 0.005 * long_edge or h > 0.035 * long_edge or w / h < 1.8:
            continue
        nl, _ = ndi.label(pix, structure=np.ones((3, 3)))
        if nl.max() < 3:
            continue
        cov = np.cov(np.vstack([xs, ys]))
        ev, evec = np.linalg.eigh(cov)
        main = evec[:, np.argmax(ev)]
        ang = abs(math.degrees(math.atan2(main[1], main[0]))) % 180
        if min(ang, 180 - ang) > 9:
            continue
        clusters.append({"bbox": (int(x0), int(y0), int(x1), int(y1)), "pix": pix})
    return clusters


def trace_lines(image_bytes, ocr_texts=None, target_long_edge=2700, debug=None):
    im0 = Image.open(io.BytesIO(image_bytes))
    if im0.mode in ("RGBA", "LA", "P"):
        rgba = im0.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        im0 = flat
    else:
        im0 = im0.convert("RGB")
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
    clusters = _find_text_clusters(ink, long_edge)
    text_mask = np.zeros((H, W), bool)
    for c in clusters:
        text_mask |= c["pix"]
    text_zone = ndi.binary_dilation(text_mask, structure=np.ones((3, 3)), iterations=max(2, int(3 * f)))

    # ── 화살촉: 선보다 굵은 어두운 덩어리 ──
    dark = (gray < 125) & ~text_zone
    opened = morphology.opening(dark, morphology.disk(max(2, int(round(4 * f)))))
    lab, n = ndi.label(opened)
    arrows = []
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
        mid = (y0 + y1) / 2
        arrows.append((x0, y0, x1, y1, "down" if (ys < mid).sum() > (ys >= mid).sum() else "up"))
    arrow_zone = morphology.dilation(opened, morphology.disk(max(2, int(3 * f))))

    line_ink = ink & ~arrow_zone & ~text_zone
    line_ink = morphology.remove_small_objects(line_ink, max(20, int(40 * f * f)))
    # 선이 아니라 면의 명암 차이로만 그려진 모서리(흰 윗면/회색 옆면 경계)도 잡는다: 완만한 밝기 변화의 기울기 능선
    smooth = filters.gaussian(gray, sigma=max(1.5, 2.2 * f))
    grad = filters.sobel(smooth)
    orange_zone = ndi.binary_dilation((rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140), iterations=max(2, int(4 * f)))
    tonal = filters.apply_hysteresis_threshold(grad, TONAL_LOW, TONAL_HIGH) & ~arrow_zone & ~text_zone & ~orange_zone
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
            if clusters_k and abs(it[0] - np.mean([x[0] for x in clusters_k[-1]])) <= 7 * f:
                clusters_k[-1].append(it)
            else:
                clusters_k.append([it])
        for cl in clusters_k:
            c = float(np.mean([x[0] for x in cl]))
            ivs = sorted((x[1], x[2]) for x in cl)
            res = [list(ivs[0])]
            for a, b in ivs[1:]:
                gap = a - res[-1][1]
                if gap <= 4 * f or (gap <= 60 * f and coverage(k, c, res[-1][1], a) >= 0.55):
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
                    if np.median(lens) < 45 * f and cover < 0.8 and np.std(gaps) < 0.7 * np.mean(gaps) + 6 * f:
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
    merged = [L for L in merged if L[3] - L[2] >= 40 * f or L[4] == 'dash']
    if debug is not None:
        debug['line_ink'] = line_ink; debug['merged'] = [list(m) for m in merged]; debug['scale'] = s

    # 바닥판(주황) 가장자리 질감에서 생긴 짧은 선 제거
    plate_zone = ndi.binary_dilation((rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140), iterations=max(1, int(2 * f)))

    def _in_plate(L):
        k, c, t0, t1 = L[0], L[1], L[2], L[3]
        pts = [UNIT[k] * (t0 + (t1 - t0) * q) + NORM[k] * c for q in np.linspace(0.05, 0.95, 12)]
        hit = sum(1 for p in pts if 0 <= int(p[0]) < W and 0 <= int(p[1]) < H and plate_zone[int(p[1]), int(p[0])])
        return hit / len(pts) > 0.6

    merged = [L for L in merged if not (_in_plate(L) and (L[3] - L[2]) < 160 * f)]
    # ── 선 역할/색 ──
    def is_bg(p):
        x, y = int(round(p[0])), int(round(p[1]))
        return True if not (0 <= x < W and 0 <= y < H) else bool(background[y, x])

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

    # ── 면 채우기 ──
    out_parts = []
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
            out_parts.append('<polygon points="%s" fill="%s" fill-opacity="0.92"%s/>' % (pts, col, extra))
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
            out_parts.append('<polygon points="%s" fill="%s" fill-opacity="%s"/>' % (pts, col, op))

    # ── 굵기(원본 픽셀 기준, 큰 이미지는 비례) ──
    k_w = max(1.0, long0 / 1200.0)
    W_OUT, W_IN, W_DASH = 1.7 * k_w, 1.05 * k_w, 0.9 * k_w
    order = {"inner": 0, "dash": 1, "outline": 2}
    for p0, p1, role, brown in sorted(lines, key=lambda l: order[l[2]]):
        col = "#5a2f1d" if brown else "#1d1d1d"
        w = {"outline": W_OUT, "inner": W_IN, "dash": W_DASH}[role]
        d = ' stroke-dasharray="%.1f %.1f"' % (3.2 * k_w, 2.6 * k_w) if role == "dash" else ""
        out_parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.2f" stroke-linecap="round"%s/>' % (
            p0[0] / s, p0[1] / s, p1[0] / s, p1[1] / s, col, w, d))
    for x0, y0, x1, y1, dr_ in arrows:
        x0, y0, x1, y1 = x0 / s, y0 / s, x1 / s, y1 / s
        cx = (x0 + x1) / 2
        pts = ("%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (x0, y0, x1, y0, cx, y1)) if dr_ == "down" else ("%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (x0, y1, x1, y1, cx, y0))
        out_parts.append('<polygon points="%s" fill="#1d1d1d"/>' % pts)

    # ── 글자: 내용을 알면 <text>, 모르면 글자 윤곽 그대로 ──
    texts_used = 0
    ocr_texts = ocr_texts or []
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
           '<rect width="100%" height="100%" fill="#fff"/>'] + out_parts + ["</svg>"]
    roles = {r: sum(1 for l in lines if l[2] == r) for r in ("outline", "inner", "dash")}
    return {
        "svg": "\n".join(svg),
        "stats": {"lines": len(lines), "roles": roles, "arrows": len(arrows), "text_lines": len(clusters), "text_editable": texts_used,
                  "size": [W0, H0]},
    }
