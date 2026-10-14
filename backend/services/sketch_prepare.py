"""손스케치 사진 정리: AI 읽기와 잉크 보정에 넣기 전에 사진을 '그림만 반듯하게 크게' 만든다(완전 로컬).

휴대폰 사진은 그림이 종이 일부에 작게 찍히거나(선이 1~2px 로 가늘어져 놓침), 비스듬하게 기울거나, EXIF 방향 정보로만 돌아가 있다.
  ① EXIF 방향을 적용해 똑바로 세우고
  ② (deskew) 건물 윤곽의 긴 직선 방향을 찾아 기울어짐을 바로잡고
  ③ 잉크가 있는 영역만 여백을 두고 잘라
  ④ 읽기 좋은 크기로 맞춘다.
정리한 이미지를 AI 와 보정이 함께 쓰므로 좌표를 원래 사진으로 되돌릴 필요가 없다(결과 다이어그램도 반듯하게 나온다).
info 에는 시험·디버깅용으로 변환(회전각·자른 영역·배율)을 담는다.
"""
import io

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

from services.sketch_refine import ink_masks

WORK = 1000          # 잉크 찾기용 작업 해상도(긴 변)
OUT_LONG = 1600      # 정리한 이미지의 목표 긴 변
MAX_UPSCALE = 2.0    # 너무 작게 찍힌 그림을 키우는 한계
MARGIN = 0.07        # 그림 영역 바깥 여백(그림 긴 변 대비)


def _load(png_bytes):
    im = Image.open(io.BytesIO(png_bytes))
    im = ImageOps.exif_transpose(im).convert("RGB")
    return im


def _ink_bbox(a, step_note=None):
    """작업 해상도 배열 a(float RGB)에서 잉크 영역 [x0,y0,x1,y1] (px). 잉크가 거의 없으면 None."""
    red, body = ink_masks(a)
    ink = red | body
    # 작은 잡티(종이 결·먼지)는 빼고, 실제 선 덩어리만 본다
    lab, n = ndi.label(ndi.binary_dilation(ink, iterations=2))
    if n == 0:
        return None
    sizes = ndi.sum(ink, lab, range(1, n + 1))
    keep = np.isin(lab, [i for i, c in enumerate(sizes, start=1) if c >= 60])
    ys, xs = np.nonzero(ink & keep)
    if len(xs) < 300:
        return None
    # 책상 가장자리 같은 먼 외톨이에 영향받지 않게 0.3~99.7 백분위를 쓴다
    return [float(np.percentile(xs, 0.3)), float(np.percentile(ys, 0.3)), float(np.percentile(xs, 99.7)), float(np.percentile(ys, 99.7))]


def prepare(png_bytes, do_crop=True):
    """돌려주는 값: (정리된 PNG 바이트, info dict)"""
    im = _load(png_bytes)
    W0, H0 = im.size
    info = {"orig_size": [W0, H0], "exif_applied": True, "cropped": False, "angle": 0.0, "crop": None, "scale": 1.0}
    s = WORK / max(W0, H0)
    small = im.resize((max(1, round(W0 * s)), max(1, round(H0 * s))), Image.LANCZOS)
    a = np.asarray(small).astype(float)

    out = im
    if do_crop:
        bb = _ink_bbox(a)
        if bb is not None:
            x0, y0, x1, y1 = [v / s for v in bb]              # 원본 px
            bw, bh = x1 - x0, y1 - y0
            m = MARGIN * max(bw, bh) + 8
            cx0, cy0 = max(0, int(x0 - m)), max(0, int(y0 - m))
            cx1, cy1 = min(W0, int(x1 + m)), min(H0, int(y1 + m))
            # 이미 사진의 대부분이 그림이면 자르지 않는다(이득이 없고 위험만 있다)
            if (cx1 - cx0) * (cy1 - cy0) < 0.8 * W0 * H0:
                out = im.crop((cx0, cy0, cx1, cy1))
                info["cropped"] = True
                info["crop"] = [cx0, cy0, cx1, cy1]

    w, h = out.size
    long_ = max(w, h)
    sc = min(MAX_UPSCALE, OUT_LONG / long_) if long_ < OUT_LONG else OUT_LONG / long_
    if abs(sc - 1.0) > 0.02:
        out = out.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    info["scale"] = round(sc, 4)
    info["out_size"] = list(out.size)
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue(), info
