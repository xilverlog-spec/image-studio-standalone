"""래스터 도식이 '선으로 그린 도식'인지 '색 면(블록)으로 칠한 도식'인지 판별하고, 색 면 도식은 색 영역 그대로 벡터화한다.

선 도식(아이소메트릭 단계도 등)은 면 가장자리가 어두운 선으로 둘러싸여 있고, 색 블록 도식은 면이 선 없이 색으로만 구분된다.
그래서 '큰 색 면의 가장자리 중 어두운 선에 맞닿은 비율'(outlined)로 가른다. 실측: 색 블록 0.16~0.19, 선 도식 0.43~0.78.
"""
import io
import os
import re
import time

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

OUTLINED_MAX = 0.32     # 이 값보다 낮으면 색 면 도식
FILL_AREA_MIN = 0.05    # 큰 색 면이 화면의 5% 이상이어야 색 면 도식으로 본다


ISO_MAX_FOR_FLAT = 0.16   # 아이소 방향(30°·150°) 윤곽선 비율이 이보다 낮으면 아이소 매스 도식이 아니다 (실측: 매스 도식 0.37~0.75, 평면도·컨셉도·색 블록 0.02~0.12)


def iso_edge_share(im, tol=7.0):
    """강한 윤곽 중 30°·150° 방향 선이 차지하는 비율(0~1). 평면도·단면도·컨셉 다이어그램은 거의 0, 아이소메트릭 매스 도식은 0.4 이상."""
    s = 900.0 / max(im.size)
    if s < 1:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    g = ndi.gaussian_filter(np.asarray(im.convert("L")).astype(np.float32), 1.0)
    gx, gy = ndi.sobel(g, axis=1), ndi.sobel(g, axis=0)
    mag = np.hypot(gx, gy)
    m = mag > max(40.0, np.percentile(mag, 97))
    if not m.any():
        return 0.0
    ang = (np.degrees(np.arctan2(gy[m], gx[m])) + 90.0) % 180.0
    w = mag[m]
    d = lambda t: np.minimum(np.abs(ang - t), 180 - np.abs(ang - t))
    return float(w[(d(30) < tol) | (d(150) < tol)].sum() / w.sum())


PHOTO_TOP1_MAX = 0.30   # 가장 큰 색(보통 흰 배경)이 화소의 30% 미만이면 사진·렌더·모델 캡처 (실측: 사진·렌더 샘플 0.05~0.24, 도식·평면 0.48~0.96)


def top_color_share(im):
    """4비트로 줄인 색 중 가장 많은 색이 차지하는 비율. 도식·평면은 흰 배경이 압도적이라 높고, 하늘·지형·음영이 있는 사진·렌더는 낮다."""
    s = 600.0 / max(im.size)
    if s < 1:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BOX)
    a = np.asarray(im.convert("RGB")).astype(np.int32)
    q = (a[..., 0] >> 4) * 256 + (a[..., 1] >> 4) * 16 + (a[..., 2] >> 4)
    return float(np.bincount(q.ravel(), minlength=4096).max()) / q.size


def classify_diagram(png_bytes):
    """반환: {'kind': 'color'|'line', 'area': 큰 색 면 비율, 'outlined': 면 가장자리가 선에 닿은 비율, 'iso': 아이소 방향 윤곽 비율}
    아이소 방향 선이 거의 없으면(평면도·단면도·배치도·컨셉 다이어그램) 선 추출 대신 원본 그대로 벡터화하는 'color' 로 보낸다."""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    top1 = top_color_share(im)
    if top1 < PHOTO_TOP1_MAX:
        # 원근 모델 캡처·렌더·사진: 도식이 아니므로 색 영역 그대로 따면 원본 복사본(수~수십 MB)이 된다 → AI 선화로 다시 그려 선 도면으로 만든다
        return {"kind": "perspective", "area": 0.0, "outlined": 0.0, "iso": 0.0, "top1": round(top1, 3)}
    iso = iso_edge_share(im)
    s = 900.0 / max(im.size)
    if s < 1:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    g = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    dark = g < 110
    fill = (((g >= 120) & (g <= 247)) | (sat > 28)) & ~dark
    fill = ndi.binary_opening(fill, iterations=2)  # 선·글자 가장자리의 안티앨리어싱 제거
    lab, n = ndi.label(fill)
    flat = iso < ISO_MAX_FOR_FLAT
    if n == 0:
        return {"kind": "color" if flat else "line", "area": 0.0, "outlined": 1.0, "iso": round(iso, 3)}
    sizes = ndi.sum(fill, lab, range(1, n + 1))
    big = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z > 0.004 * fill.size])
    area = float(big.sum()) / fill.size
    edge = big & ~ndi.binary_erosion(big, iterations=1)
    outlined = float((edge & ndi.binary_dilation(dark, iterations=3)).sum()) / max(1, int(edge.sum()))
    kind = "color" if (flat or (area >= FILL_AREA_MIN and outlined < OUTLINED_MAX)) else "line"
    return {"kind": kind, "area": round(area, 3), "outlined": round(outlined, 3), "iso": round(iso, 3)}


def _finish_color_svg(svg, im, work_size):
    """키워서 딴 SVG 의 크기 표기를 원래 크기로 맞춘다(좌표계 viewBox 는 키운 크기 그대로 둔다)."""
    ww, wh = work_size
    ow, oh = im.size
    svg = re.sub(r'(<svg\b[^>]*?)\swidth="[^"]*"', r'\1', svg, count=1)
    svg = re.sub(r'(<svg\b[^>]*?)\sheight="[^"]*"', r'\1', svg, count=1)
    return svg.replace("<svg", '<svg width="%d" height="%d" viewBox="0 0 %d %d"' % (ow, oh, ww, wh), 1)


def vectorize_lineart(line_img, out_size):
    """AI 가 그린 검은 선 이미지(흰 바탕)를 선 모양 그대로 SVG 로 벡터화한다(vtracer 흑백). out_size = 원본 가로·세로(표시 크기)."""
    import vtracer
    g = line_img.convert("L")
    # AI 선화의 가는 선(1~2px)은 그대로 이진화하면 조각조각 끊긴다(실측). 2배로 키우고 회색 선까지 잉크로 치는 부드러운 문턱값(185~230)을 쓰면 끊김 없이 이어진다.
    g = g.resize((g.width * 2, g.height * 2), Image.LANCZOS)
    g = g.point(lambda v: 0 if v < 185 else (255 if v > 230 else int((v - 185) * 255 / 45)))
    tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "tmp"))
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_in = os.path.join(tmp_dir, f"lineart_in_{int(time.time() * 1000)}.png")
    tmp_out = tmp_in.replace("_in_", "_out_").replace(".png", ".svg")
    try:
        g.save(tmp_in, "PNG")
        vtracer.convert_image_to_svg_py(
            tmp_in, tmp_out, colormode="binary", hierarchical="stacked", mode="spline", filter_speckle=4,
            corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=2,
        )
        with open(tmp_out, "r", encoding="utf-8") as f:
            svg = f.read()
        svg = _finish_color_svg(svg, Image.new("RGB", out_size), g.size)
        m = re.search(r"<svg\b[^>]*>", svg)
        if m:   # 바탕을 흰색으로 깔아 PNG 저장·다른 배경 위에서도 선이 보이게 한다
            svg = svg[:m.end()] + '<rect width="100%" height="100%" fill="#fff"/>' + svg[m.end():]
        return svg
    finally:
        for p in (tmp_in, tmp_out):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


def slim_svg_paths(svg):
    """vtracer 색 변환 SVG 의 용량을 줄인다(화질은 거의 그대로).
    ① 소수점 좌표를 정수로 반올림(작업 캔버스가 원본의 약 3배라 눈에 보이는 차이가 없다) ② 직전 점 기준 상대 좌표(c/l)로 바꿔 숫자 자릿수를 줄인다 ③ 쓸모없는 translate(0,0) 제거.
    실측(21번 평면 4.9MB, 25번 4.4MB): 정수화만으로 -40%, 상대 좌표까지 하면 3.5배 이상 줄고(1.5~1.7MB), 원본과의 평균 오차는 1.9 → 2.2 로 눈에 안 띈다.
    M/C/L/Z 만 쓰는 vtracer spline 출력 전용이며, 형식이 다르면 해당 경로는 건드리지 않는다."""
    svg = svg.replace(' transform="translate(0,0)"', '')

    def conv(m):
        toks = re.findall(r"[MCLZ]|-?\d+(?:\.\d+)?", m.group(1))
        if not toks or any(not re.fullmatch(r"[MCLZ]|-?\d+(?:\.\d+)?", t) for t in toks):
            return m.group(0)
        out, i = [], 0
        cx = cy = sx = sy = 0
        cmd = None
        try:
            while i < len(toks):
                t = toks[i]
                if t in ("M", "C", "L", "Z"):
                    cmd = t
                    i += 1
                    if t == "Z":
                        out.append("z")
                        cx, cy = sx, sy
                    continue
                if cmd == "M":
                    x, y = int(round(float(t))), int(round(float(toks[i + 1])))
                    i += 2
                    out.append("M%d %d" % (x, y))
                    cx, cy, sx, sy = x, y, x, y
                    cmd = "L"           # M 뒤에 좌표가 더 오면 선으로 이어진다
                elif cmd == "C":
                    v = [int(round(float(toks[i + k]))) for k in range(6)]
                    i += 6
                    out.append("c" + " ".join(str(v[k] - (cx if k % 2 == 0 else cy)) for k in range(6)))
                    cx, cy = v[4], v[5]
                else:
                    x, y = int(round(float(t))), int(round(float(toks[i + 1])))
                    i += 2
                    out.append("l%d %d" % (x - cx, y - cy))
                    cx, cy = x, y
        except (ValueError, IndexError):
            return m.group(0)
        return 'd="' + "".join(out) + '"'

    return re.sub(r'\bd="([^"]*)"', conv, svg)


COLOR_FILTER_SPECKLE = 8   # 작은 얼룩 제거 크기. 4 → 8 로 올리면 경로가 절반으로 줄고 글자·점선은 그대로(12 이상은 작은 글자가 뭉개짐)


def vectorize_color(png_bytes):
    """색 영역을 그대로 따서 SVG 로(원본 해상도, vtracer). 반환: (svg_text, (W, H))"""
    import vtracer
    im = Image.open(io.BytesIO(png_bytes))
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "tmp"))
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_in = os.path.join(tmp_dir, f"colorvec_in_{int(time.time() * 1000)}.png")
    tmp_out = tmp_in.replace("_in_", "_out_").replace(".png", ".svg")
    # 작은 이미지는 키워서 따야 곡선·글자가 뭉개지지 않는다(결과 SVG 는 원래 크기로 되돌린다). 다만 너무 많이(≈8배) 키우면
    # LANCZOS 번짐 때문에 옅은 색 면이 바탕과 합쳐지므로 3배까지만 키운다.
    orig_size = im.size
    k = min(3.0, max(1.0, 2000.0 / max(orig_size)))
    work = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS) if k > 1.0 else im
    try:
        work.save(tmp_in, "PNG")
        vtracer.convert_image_to_svg_py(
            tmp_in, tmp_out, colormode="color", hierarchical="stacked", mode="spline", max_iterations=10,
            filter_speckle=COLOR_FILTER_SPECKLE, color_precision=8, layer_difference=6, corner_threshold=60,
            length_threshold=4.0, splice_threshold=45, path_precision=3,
        )
        with open(tmp_out, "r", encoding="utf-8") as f:
            svg = f.read()
        return _finish_color_svg(slim_svg_paths(svg), im, work.size), orig_size
    finally:
        for p in (tmp_in, tmp_out):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
