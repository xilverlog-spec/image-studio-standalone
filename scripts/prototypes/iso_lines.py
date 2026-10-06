"""아이소메트릭 도식 래스터 -> 정돈된 선(stroke) SVG 시제품.
선 검출 -> 3방향(수직, ±30°) 스냅 -> 동일선 병합 -> 역할별 굵기(외곽/내부/점선) + 면 색 + 화살촉 + 글자."""
import sys, math, warnings
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology, transform, measure
from PIL import ImageDraw

SCALE = 3
BH_THR = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
src, out_svg, label = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
im0 = Image.open(src).convert('RGB')
W0, H0 = im0.size
im = im0.resize((W0 * SCALE, H0 * SCALE), Image.LANCZOS)
rgb = np.asarray(im).astype(np.float32)
H, W = rgb.shape[:2]
gray = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)

dark = gray < 125
orange = (rgb[..., 0] - rgb[..., 2] > 38) & (rgb[..., 0] > 140)
print('dark %.3f orange %.3f' % (dark.mean(), orange.mean()))

# ── 글자 영역: 아래쪽 어두운 덩어리 ──
text_box = None
ys, xs = np.nonzero(dark[int(H * 0.82):, :])
if len(ys):
    text_box = (xs.min(), ys.min() + int(H * 0.82), xs.max(), ys.max() + int(H * 0.82))
if text_box:
    x0, y0, x1, y1 = text_box
    dark[max(0, y0 - 6):y1 + 7, max(0, x0 - 6):x1 + 7] = False

# ── 화살촉: 선보다 굵은 어두운 덩어리 ──
opened = morphology.binary_opening(dark, morphology.disk(4))
lab, n = ndi.label(opened)
arrows = []
for i in range(1, n + 1):
    ys, xs = np.nonzero(lab == i)
    if len(ys) < 230:
        continue
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    if (x1 - x0) < 14 or (y1 - y0) < 14:
        continue
    mid = (y0 + y1) / 2
    top_area = (ys < mid).sum(); bot_area = (ys >= mid).sum()
    arrows.append((x0, y0, x1, y1, 'down' if top_area > bot_area else 'up'))
arrow_mask = morphology.binary_dilation(opened, morphology.disk(3))
bh = morphology.black_tophat(gray.astype(np.uint8), morphology.disk(7)).astype(np.float32)
line_dark = (bh > BH_THR) & ~arrow_mask
if text_box:
    tx0, ty0, tx1, ty1 = text_box
    line_dark[max(0, ty0 - 8):ty1 + 9, max(0, tx0 - 8):tx1 + 9] = False
line_dark = morphology.remove_small_objects(line_dark, 40)

# ── 배경(흰 바탕) 플러드필: 선으로 막힌 면은 배경이 아니다 ──
light = (gray > 225) & ~morphology.dilation(line_dark, morphology.disk(2))
lab_l, n_l = ndi.label(light)
border = set(np.unique(np.concatenate([lab_l[0], lab_l[-1], lab_l[:, 0], lab_l[:, -1]]))) - {0}
background = np.isin(lab_l, list(border))

# ── 선 검출 ──
Image.fromarray((line_dark * 255).astype(np.uint8)).save(out_svg + '.mask.png')
skel = morphology.skeletonize(line_dark)
dirs = {'V': 90.0, 'A': 30.0, 'B': 150.0}
thetas = []
for a in dirs.values():
    for d in np.arange(-6, 6.01, 0.5):
        thetas.append(math.radians(a + d + 90.0))
thetas = np.array(thetas)
segs = transform.probabilistic_hough_line(skel, threshold=8, line_length=22, line_gap=5, theta=thetas, rng=7)
print('hough segments', len(segs))

dt = ndi.distance_transform_edt(line_dark)

def classify(p0, p1):
    ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0])) % 180
    best = min(dirs.items(), key=lambda kv: min(abs(ang - kv[1]), 180 - abs(ang - kv[1])))
    return best[0]

UNIT = {k: np.array([math.cos(math.radians(a)), math.sin(math.radians(a))]) for k, a in dirs.items()}
NORM = {k: np.array([-u[1], u[0]]) for k, u in UNIT.items()}

groups = {k: [] for k in dirs}
for (p0, p1) in segs:
    k = classify(p0, p1)
    u, nrm = UNIT[k], NORM[k]
    p0 = np.array(p0, float); p1 = np.array(p1, float)
    c = float(np.dot((p0 + p1) / 2, nrm))
    t0, t1 = sorted([float(np.dot(p0, u)), float(np.dot(p1, u))])
    groups[k].append([c, t0, t1])

merged = []   # (key, c, t0, t1)
for k, items in groups.items():
    items.sort()
    clusters = []
    for it in items:
        if clusters and abs(it[0] - np.mean([x[0] for x in clusters[-1]])) <= 7:
            clusters[-1].append(it)
        else:
            clusters.append([it])
    for cl in clusters:
        c = float(np.mean([x[0] for x in cl]))
        ivs = sorted([(x[1], x[2]) for x in cl])
        cur = list(ivs[0])
        res = []
        for a, b in ivs[1:]:
            if a <= cur[1] + 16:
                cur[1] = max(cur[1], b)
            else:
                res.append(tuple(cur)); cur = [a, b]
        res.append(tuple(cur))
        # 점선 판정: 짧은 조각이 3개 이상이고 간격이 규칙적
        span = res[-1][1] - res[0][0]
        cover = sum(b - a for a, b in res) / (span + 1e-6)
        if len(res) >= 3 and np.median([b - a for a, b in res]) < 45 and cover < 0.78:
            gaps = [res[i + 1][0] - res[i][1] for i in range(len(res) - 1)]
            if np.std(gaps) < 0.7 * np.mean(gaps) + 6:
                merged.append((k, c, res[0][0], res[-1][1], 'dash'))
                continue
        for a, b in res:
            if b - a >= 28:
                merged.append((k, c, a, b, 'solid'))
print('merged lines', len(merged))
_ov = Image.fromarray((line_dark * 120).astype(np.uint8)).convert('RGB')
_dr = ImageDraw.Draw(_ov)
for (k, c, t0, t1, style) in merged:
    _u, _n = UNIT[k], NORM[k]
    _a = _u * t0 + _n * c; _b = _u * t1 + _n * c
    _dr.line([tuple(_a), tuple(_b)], fill={'V': (255, 60, 60), 'A': (60, 255, 60), 'B': (80, 140, 255)}[k], width=3)
_ov.save(out_svg + '.overlay.png')
for (p0, p1) in segs[:0]:
    pass

def sample(p):
    x, y = int(round(p[0])), int(round(p[1]))
    if 0 <= x < W and 0 <= y < H:
        return background[y, x]
    return True

lines = []
for (k, c, t0, t1, style) in merged:
    u, nrm = UNIT[k], NORM[k]
    p0 = u * t0 + nrm * c; p1 = u * t1 + nrm * c
    mid = (p0 + p1) / 2
    off = 7 * SCALE / 3
    outside = sample(mid + nrm * off) != sample(mid - nrm * off)
    # 평균 색(갈색 선인지)
    pts = [p0 + (p1 - p0) * f for f in np.linspace(0.1, 0.9, 12)]
    cols = [rgb[min(H - 1, max(0, int(p[1]))), min(W - 1, max(0, int(p[0])))] for p in pts]
    cmean = np.mean(cols, axis=0)
    brown = (cmean[0] - cmean[2]) > 14
    role = 'dash' if style == 'dash' else ('outline' if outside else 'inner')
    lines.append((p0, p1, role, brown))
print('roles', {r: sum(1 for l in lines if l[2] == r) for r in ('outline', 'inner', 'dash')})

# ── 면 채우기 ──
def poly_svg(mask, tol, fill, extra=''):
    parts = []
    lab2, n2 = ndi.label(mask)
    for i in range(1, n2 + 1):
        comp = lab2 == i
        if comp.sum() < 500:
            continue
        for cnt in measure.find_contours(np.pad(comp, 1).astype(float), 0.5):
            if len(cnt) < 30:
                continue
            ap = measure.approximate_polygon(cnt, tol)
            pts = ' '.join('%.1f,%.1f' % ((x - 1) / SCALE, (y - 1) / SCALE) for y, x in ap)
            parts.append('<polygon points="%s" fill="%s" %s/>' % (pts, fill(comp), extra))
    return parts

def mean_hex(comp, mix=0.0):
    c = rgb[comp].mean(axis=0)
    c = c * (1 - mix) + 255 * mix
    return '#%02x%02x%02x' % tuple(int(v) for v in c)

orange_clean = morphology.binary_closing(morphology.binary_opening(orange, morphology.disk(3)), morphology.disk(5))
fills = []
fills += poly_svg(orange_clean, 4.0, lambda comp: mean_hex(comp), 'fill-opacity="0.92"')
# 면 채우기: 정리된 선을 조금 늘려 그린 뒤, 선으로 둘러싸인 영역마다 원본의 중앙값 색을 단순화해 칠한다
mask_img = Image.new('L', (W, H), 0)
dr = ImageDraw.Draw(mask_img)
for (p0, p1, role, brown) in lines:
    v = (p1 - p0) / (np.linalg.norm(p1 - p0) + 1e-6)
    a0 = p0 - v * 9; a1 = p1 + v * 9
    dr.line([tuple(a0), tuple(a1)], fill=255, width=5)
line_raster = np.asarray(mask_img) > 0
free = ~line_raster
lab_f, n_f = ndi.label(free)
bg_label = lab_f[2, 2]
fills_gray = []
TONES = [255, 242, 228, 212]
for i in range(1, n_f + 1):
    if i == bg_label:
        continue
    comp = lab_f == i
    if comp.sum() < 1500:
        continue
    er = morphology.erosion(comp, morphology.disk(4))
    if er.sum() < 200:
        continue
    med_c = np.median(rgb[er], axis=0)
    is_orange = (med_c[0] - med_c[2]) > 38
    if is_orange:
        col = '#%02x%02x%02x' % tuple(int(v) for v in med_c)
    else:
        lum = float(np.median(gray[er]))
        tone = min(TONES, key=lambda t: abs(t - lum))
        if tone >= 255:
            continue
        col = '#%02x%02x%02x' % (tone, tone, tone)
    for cnt in measure.find_contours(np.pad(comp, 1).astype(float), 0.5):
        if len(cnt) < 30:
            continue
        ap = measure.approximate_polygon(cnt, 2.5)
        pts = ' '.join('%.1f,%.1f' % ((x - 1) / SCALE, (y - 1) / SCALE) for y, x in ap)
        fills_gray.append('<polygon points="%s" fill="%s" fill-opacity="%s"/>' % (pts, col, '0.9' if is_orange else '1'))
# ── SVG 조립 ──
HEAVY, INNER, DASH = 2.4, 1.5, 1.2
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W0, H0, W0, H0),
       '<rect width="100%" height="100%" fill="#fff"/>']
svg += fills_gray + fills
for (p0, p1, role, brown) in sorted(lines, key=lambda l: {'inner': 0, 'dash': 1, 'outline': 2}[l[2]]):
    col = '#5a2f1d' if brown else '#1d1d1d'
    w = {'outline': HEAVY, 'inner': INNER, 'dash': DASH}[role]
    d = ' stroke-dasharray="3.2 2.6"' if role == 'dash' else ''
    svg.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.2f" stroke-linecap="round"%s/>' % (
        p0[0] / SCALE, p0[1] / SCALE, p1[0] / SCALE, p1[1] / SCALE, col, w, d))
for (x0, y0, x1, y1, dr) in arrows:
    x0, y0, x1, y1 = x0 / SCALE, y0 / SCALE, x1 / SCALE, y1 / SCALE
    cx = (x0 + x1) / 2
    if dr == 'down':
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f' % (x0, y0, x1, y0, cx, y1)
    else:
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f' % (x0, y1, x1, y1, cx, y0)
    svg.append('<polygon points="%s" fill="#1d1d1d"/>' % pts)
if text_box and label:
    x0, y0, x1, y1 = [v / SCALE for v in text_box]
    fs = (y1 - y0) / 0.72
    svg.append('<text x="%.1f" y="%.1f" text-anchor="middle" font-family="Malgun Gothic, Arial, sans-serif" font-size="%.1f" font-weight="600" letter-spacing="1.2" fill="#1d1d1d">%s</text>' % ((x0 + x1) / 2, y1, fs, label))
svg.append('</svg>')
open(out_svg, 'w', encoding='utf-8').write('\n'.join(svg))
print('wrote', out_svg, len(svg), 'elements')
