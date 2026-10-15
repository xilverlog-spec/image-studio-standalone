"""이미지 → SVG 변환 전처리: 색 영역을 먼저 정리해서 '부드러운 경계의 평면 색 그림'으로 바꾼 뒤 vtracer 에 넘긴다(완전 로컬).

vtracer 는 색이 연속적으로 변하는 그림(수채·그라데이션·흐린 화살표·연한 회색 면)을 그대로 따라가면
  · 비슷한 색을 층층이 쪼개 계단 모양 띠가 생기고, 가장자리가 짜글짜글해지고(원본에 가깝게),
  · 흰 바탕에 가까운 연한 면이 배경에 먹혀 사라진다(깔끔하게: 중간값 필터 + 거친 색 단계).
그래서 ① 색을 소수(기본 14개)의 대표색으로 묶고(Lab 색공간 k-평균, 연한 색도 따로 살린다)
② 각 대표색 영역의 경계를 가우시안으로 부드럽게 만들어(가는 어두운 선은 가중치를 주어 보존) 계단·짜글짜글함을 없애고
③ 평면 색으로 칠한 이미지를 vtracer 로 변환한다.
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2
from skimage import color as skcolor

TARGET_LONG = 2400     # 변환용 작업 해상도(긴 변): 너무 작으면 확대하고, 너무 크면 줄인다
MAX_UPSCALE = 2.5


def gradient_score(img):
    """색이 연속적으로 변하는 정도(0~1): 5비트로 줄인 서로 다른 색 수가 많고 중간 톤이 넓게 퍼져 있으면 높다. 평평한 색 일러스트는 낮다."""
    a = np.asarray(img.convert("RGB").resize((min(img.width, 600), min(img.height, 600))))
    q = (a >> 3).reshape(-1, 3)
    codes = (q[:, 0].astype(np.int32) << 10) | (q[:, 1].astype(np.int32) << 5) | q[:, 2].astype(np.int32)
    u, c = np.unique(codes, return_counts=True)
    frac = c / c.sum()
    big = int((frac > 0.004).sum())            # 0.4% 이상 차지하는 색 수(평평한 그림은 적다)
    tail = float(frac[frac <= 0.004].sum())    # 잔 색(그라데이션·번짐)이 차지하는 비율
    return min(1.0, tail * 1.2 + max(0, big - 12) * 0.01), big, tail


def quantize_smooth(img, k=14, sigma=1.3, dark_boost=1.35, median=3):
    """img(PIL RGB) → (평면 색 PIL RGB, 대표색 목록). 경계는 가우시안으로 부드럽게."""
    w0, h0 = img.size
    f = min(MAX_UPSCALE, max(1.0, TARGET_LONG / max(w0, h0)))
    if max(w0, h0) > TARGET_LONG:
        f = TARGET_LONG / max(w0, h0)
    if abs(f - 1.0) > 0.02:
        img = img.resize((max(1, round(w0 * f)), max(1, round(h0 * f))), Image.LANCZOS)
    if median and median >= 3:
        img = img.filter(ImageFilter.MedianFilter(int(median)))   # 낱알 잡음 제거(창이 클수록 가장자리가 매끄럽지만 가는 선이 줄어든다)
    rgb = np.asarray(img).astype(np.float64) / 255.0
    lab = skcolor.rgb2lab(rgb)
    H, W = lab.shape[:2]
    flat = lab.reshape(-1, 3)
    # 대표색 찾기: 화소를 무작위로 뽑아 k-평균(고정 시드). 흰 바탕이 압도적이어도 연한 색이 남도록 흰색에 가까운 화소는 일부만 쓴다
    rng = np.random.default_rng(7)
    idx = rng.choice(flat.shape[0], size=min(160000, flat.shape[0]), replace=False)
    samp = flat[idx]
    bg = samp[:, 0] > 94
    keep = np.where(bg)[0]
    if len(keep) > 0.25 * len(samp):
        drop = rng.choice(keep, size=int(len(keep) - 0.25 * len(samp)), replace=False)
        samp = np.delete(samp, drop, axis=0)
    k = max(2, min(k, len(np.unique(np.round(samp, 0), axis=0))))
    cent, _ = kmeans2(samp, k, minit="++", seed=7, iter=25)
    cent = cent[~np.isnan(cent).any(axis=1)]
    # 가장 가까운 대표색으로 배정(조각 단위로 계산해 메모리를 아낀다)
    lab_idx = np.empty(flat.shape[0], dtype=np.int16)
    step = 400000
    for s in range(0, flat.shape[0], step):
        d = ((flat[s:s + step, None, :] - cent[None, :, :]) ** 2).sum(-1)
        lab_idx[s:s + step] = d.argmin(1)
    lab_idx = lab_idx.reshape(H, W)
    # 경계 부드럽게: 대표색마다 0/1 마스크를 가우시안으로 흐린 뒤 가장 큰 값을 고른다. 가는 어두운 선은 가중치를 줘서 안 지워지게 한다
    best = np.full((H, W), -1.0, dtype=np.float32)
    out = np.zeros((H, W), dtype=np.int16)
    for c in range(len(cent)):
        m = (lab_idx == c)
        if not m.any():
            continue
        g = ndi.gaussian_filter(m.astype(np.float32), sigma)
        if cent[c][0] < 35:
            g *= dark_boost
        better = g > best
        out[better] = c
        best[better] = g[better]
    pal = (np.clip(skcolor.lab2rgb(cent[None, :, :])[0], 0, 1) * 255).round().astype(np.uint8)
    return Image.fromarray(pal[out], "RGB"), pal


VTRACER_SMOOTH = dict(colormode="color", hierarchical="stacked", mode="spline", filter_speckle=8, color_precision=8,
                      layer_difference=4, corner_threshold=70, length_threshold=5.0, splice_threshold=45, path_precision=2, max_iterations=10)


# ── 선 + 색 분리 변환(2026-10-15): 선은 선대로, 색은 색대로 따로 변환해서 겹친다 ──
LINE_DARK = 105        # 이 밝기보다 어두운 화소를 '선'으로 본다
LINE_BLUR = 0.6        # 선 마스크를 흐렸다가 다시 자르는 정도(계단·짜글짜글함 제거, 너무 크면 가는 선이 끊긴다)
LINE_CUT = 0.36        # 다시 자르는 문턱(낮출수록 가는 선이 남는다)
LINE_WEAK = 150        # 가는 선 화소로 이어 붙일 최대 밝기
THIN_CONTRAST = 40     # 가는 선으로 볼 최소 대비(주변 밝기와의 차이)


def vectorize_hybrid(img, k=10, sigma=1.9):
    """img(PIL RGB) → (SVG 문자열(크기 표기 없는 vtracer 출력), (작업 가로, 세로)).
    ① 어두운 선: 흐렸다가 0.42 에서 다시 잘라 부드러운 윤곽으로 만든 뒤 vtracer 이진 변환
    ② 색 면: 선 자리를 가장 가까운 밝은 색으로 메워 색이 선 밑으로 이어지게 하고, 색을 k 개로 묶어 경계를 부드럽게 해서 vtracer 색 변환
    ③ 색 위에 선을 겹친다.  AI 재생성이 아니라 원본에서 직접 따므로 구성·색·글자 위치가 바뀌지 않는다."""
    import os, re, tempfile
    import vtracer
    w0, h0 = img.size
    f = min(MAX_UPSCALE, max(1.0, TARGET_LONG / max(w0, h0)))
    if max(w0, h0) > TARGET_LONG:
        f = TARGET_LONG / max(w0, h0)
    big = img.resize((max(1, round(w0 * f)), max(1, round(h0 * f))), Image.LANCZOS) if abs(f - 1.0) > 0.02 else img
    a = np.asarray(big).astype(np.float32)
    lum = a.mean(-1)
    # 선 마스크: 확실한 어두운 화소(강) + 거기에 이어진, 주변보다 뚜렷이 어두운 가는 선 화소(약, 안티앨리어싱으로 흐려진 1px 선) — 가는 선이 점선처럼 끊기지 않게 이어 붙인다
    win = max(5, int(round(0.004 * max(lum.shape))) | 1)
    top = ndi.minimum_filter(ndi.maximum_filter(lum, size=win), size=win) - lum      # 블랙 탑햇: 넓은 회색 면은 빠지고 가는 선만 남는다
    strong = lum < LINE_DARK
    weak = (lum < LINE_WEAK) & (top > THIN_CONTRAST)
    dark = ndi.binary_propagation(strong, mask=strong | weak)
    soft = ndi.gaussian_filter(dark.astype(np.float32), LINE_BLUR) > LINE_CUT          # 흐렸다가 다시 자르면 계단이 사라진 부드러운 윤곽이 된다
    line_img = Image.fromarray(np.where(soft, 0, 255).astype(np.uint8), "L")
    grow = ndi.binary_dilation(dark, iterations=2)
    idx = ndi.distance_transform_edt(grow, return_distances=False, return_indices=True)
    filled = a.copy()
    filled[grow] = a[idx[0][grow], idx[1][grow]]
    col_q, _pal = quantize_smooth(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8), "RGB").resize((w0, h0), Image.LANCZOS), k=k, sigma=sigma, median=3)
    tmp = tempfile.mkdtemp(prefix="hyb_")
    try:
        lin, lout, cin, cout = (os.path.join(tmp, n) for n in ("l_in.png", "l_out.svg", "c_in.png", "c_out.svg"))
        line_img.save(lin)
        col_q.save(cin)
        vtracer.convert_image_to_svg_py(lin, lout, colormode="binary", hierarchical="stacked", mode="spline", filter_speckle=3, corner_threshold=70, length_threshold=4.0, splice_threshold=45, path_precision=2)
        vtracer.convert_image_to_svg_py(cin, cout, colormode="color", hierarchical="stacked", mode="spline", filter_speckle=12, color_precision=8, layer_difference=4, corner_threshold=85, length_threshold=7.0, splice_threshold=55, path_precision=2, max_iterations=10)
        csvg = open(cout, encoding="utf-8").read()
        lsvg = open(lout, encoding="utf-8").read()
    finally:
        for n in os.listdir(tmp):
            try:
                os.remove(os.path.join(tmp, n))
            except OSError:
                pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass
    cw, ch = col_q.size
    lw, lh = line_img.size
    inner = re.search(r"<svg[^>]*>([\s\S]*)</svg>", lsvg).group(1).replace('fill="#000000"', 'fill="#121212"')
    svg = csvg.replace("</svg>", '<g transform="scale(%.5f %.5f)">%s</g></svg>' % (cw / lw, ch / lh, inner))   # 색 위에 선을 겹친다
    return svg, (cw, ch)
