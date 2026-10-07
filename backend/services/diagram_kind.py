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


def classify_diagram(png_bytes):
    """반환: {'kind': 'color'|'line', 'area': 큰 색 면 비율, 'outlined': 면 가장자리가 선에 닿은 비율, 'iso': 아이소 방향 윤곽 비율}
    아이소 방향 선이 거의 없으면(평면도·단면도·배치도·컨셉 다이어그램) 선 추출 대신 원본 그대로 벡터화하는 'color' 로 보낸다."""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
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
            filter_speckle=4, color_precision=8, layer_difference=6, corner_threshold=60,
            length_threshold=4.0, splice_threshold=45, path_precision=3,
        )
        with open(tmp_out, "r", encoding="utf-8") as f:
            svg = f.read()
        return _finish_color_svg(svg, im, work.size), orig_size
    finally:
        for p in (tmp_in, tmp_out):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
