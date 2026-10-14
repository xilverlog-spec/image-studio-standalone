"""손스케치 읽기 보정: AI 가 눈대중으로 준 도형 경계·화살표 꼬리를 실제 잉크 위치에 맞춘다(완전 로컬).

AI 는 '무엇이 몇 개 있는지'는 잘 읽지만 경계 좌표는 3~7 정도 일관되게 어긋난다(시험: 도형 겹침 0.65).
펜 색(파랑·검정 = 건물, 빨강 = 방향·열린 면)으로 잉크를 나눈 뒤
  ① 빗금으로 꽉 채운 도형(코어)은 빗금이 몰린 덩어리의 바깥 상자로,
  ② 윤곽만 있는 도형(판)은 네 변을 선 잉크가 가장 길게 이어진 위치로(코어 변은 우선),
  ③ 화살표 꼬리는 빨간 선을 가늘게 깎은 뒤 화살촉 반대편 끝점으로
맞춘다. 맞출 근거가 약하면 AI 값을 그대로 둔다.
좌표는 이미지의 긴 변을 100 으로 하는 같은 비율 좌표(가로세로 비율 유지)다.
"""
import io

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology

LONG = 1000  # 분석용으로 긴 변을 맞추는 픽셀 수 → 1 단위 = 10px


def _load(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    s = LONG / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return np.asarray(im).astype(float)


def ink_masks(a):
    """종이 바탕(느린 변화)을 빼고 빨간 잉크와 파랑·검정 잉크를 나눈다."""
    small = a[::4, ::4]
    bg = np.stack([ndi.gaussian_filter(ndi.median_filter(small[..., c], 15), 8) for c in range(3)], -1)
    bg = np.stack([ndi.zoom(bg[..., c], 4, order=1)[:a.shape[0], :a.shape[1]] for c in range(3)], -1)
    d = a - bg
    dark = bg.mean(-1) - a.mean(-1)
    red = (d[..., 0] - d[..., 1] > 22) & (a[..., 0] - a[..., 2] > 30) & (dark > 8)
    body = (dark > 55) & ~red  # 파랑·검정
    return red, body


def _iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    i = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


def _dense_components(body):
    """빗금이 촘촘히 몰린 덩어리(코어) 후보: [(상자 px, 면적)]"""
    dens = ndi.uniform_filter(body.astype(float), 15)
    m = dens > 0.42
    m = ndi.binary_opening(m, structure=np.ones((5, 5)))
    m = ndi.binary_closing(m, structure=np.ones((9, 9)))
    lab, n = ndi.label(m)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        area = int((lab[sl] == i).sum())
        if area < 900:
            continue
        # 빗금 상자는 밀도 창 때문에 안쪽으로 조금 줄어드므로 실제 잉크가 있는 범위로 되늘린다
        ys, xs = np.nonzero(body[max(0, sl[0].start - 10):sl[0].stop + 10, max(0, sl[1].start - 10):sl[1].stop + 10] & ndi.binary_dilation(lab[max(0, sl[0].start - 10):sl[0].stop + 10, max(0, sl[1].start - 10):sl[1].stop + 10] == i, iterations=3))
        if len(xs) == 0:
            continue
        x0 = max(0, sl[1].start - 10) + xs.min(); x1 = max(0, sl[1].start - 10) + xs.max()
        y0 = max(0, sl[0].start - 10) + ys.min(); y1 = max(0, sl[0].start - 10) + ys.max()
        out.append(([float(x0), float(y0), float(x1), float(y1)], area))
    return out, m


def _snap_edge(prof, p0, w, bonus, thr=0.62):
    """prof[p] = 그 위치에 선 잉크가 이어진 비율. p0 근처(±w)에서 가장 확실한 위치를 고른다. 근거가 약하면 None."""
    lo = max(0, int(p0) - w); hi = min(len(prof) - 1, int(p0) + w)
    if hi <= lo:
        return None
    best = None
    for p in range(lo, hi + 1):
        sc = prof[p] - 0.0028 * abs(p - p0) + bonus(p)
        if best is None or sc > best[0]:
            best = (sc, p)
    sc, p = best
    return p if prof[p] >= thr else None


def _extend_edges(body, rect, K):
    """빗금 덩어리 상자는 빗금이 닿지 않는 모서리에서 안쪽으로 줄어들 수 있다. 각 변 바깥 4 단위 안에 윤곽선이 이어져 있으면 거기까지 넓힌다."""
    H, W = body.shape
    x0, y0, x1, y1 = [v * K for v in rect]
    ink = ndi.maximum_filter(body.astype(np.uint8), size=7) > 0
    w = int(0.04 * LONG)
    ys = slice(int(y0 + 0.15 * (y1 - y0)), max(int(y0 + 0.15 * (y1 - y0)) + 1, int(y1 - 0.15 * (y1 - y0))))
    xs = slice(int(x0 + 0.15 * (x1 - x0)), max(int(x0 + 0.15 * (x1 - x0)) + 1, int(x1 - 0.15 * (x1 - x0))))
    col = ink[ys, :].mean(0); row = ink[:, xs].mean(1)
    def far(prof, p, outward, n):  # 바깥쪽(outward=±1)으로 윤곽선(이어진 잉크)이 가장 멀리 있는 위치
        best = p
        for d in range(0, w + 1):
            q = int(p + outward * d)
            if not (0 <= q < n) or prof[q] < 0.2:
                break  # 잉크가 끊기면 거기서 멈춘다(떨어져 있는 다른 도형의 선까지 넓히지 않는다)
            if prof[q] >= 0.7:
                best = q
        return best
    nx0 = far(col, x0, -1, W); nx1 = far(col, x1, 1, W); ny0 = far(row, y0, -1, H); ny1 = far(row, y1, 1, H)
    return [nx0 / K, ny0 / K, nx1 / K, ny1 / K]


def refine(png_bytes, blocks, arrows):
    """blocks=[{id,rect,hatched}], arrows=[{id,pts:[꼬리,화살촉]}] → {blocks:{id:rect}, arrows:{id:[꼬리,화살촉]}, notes:[...]}"""
    a = _load(png_bytes)
    H, W = a.shape[:2]
    red, body = ink_masks(a)
    K = LONG / 100.0
    notes = []
    out_blocks = {}
    out_arrows = {}

    # ① 코어(빗금 도형): 빗금이 몰린 덩어리의 상자로
    comps, _ = _dense_components(body)
    comps_u = [([v / K for v in bx], ar) for bx, ar in comps]
    cores = []
    for b in blocks:
        if not b.get("hatched"):
            continue
        best = max(((_iou(b["rect"], bx), bx) for bx, _ in comps_u), default=(0, None), key=lambda t: t[0])
        if best[1] is not None and best[0] >= 0.15:
            bx = _extend_edges(body, best[1], K)
            out_blocks[b["id"]] = [round(v, 1) for v in bx]
            cores.append(bx)
            notes.append(f"{b['id']}: 빗금 덩어리에 맞춤 (겹침 {best[0]:.2f})")
        else:
            cores.append(b["rect"])

    # ② 판(윤곽 도형): 네 변을 선 잉크 위치로. 빗금 속은 제외하고(코어 변은 따로 후보로 더한다), 선이 조금 흔들려도 되도록 살짝 두껍게 본다
    _, dm = _dense_components(body)
    edge_ink = body & ~ndi.binary_erosion(dm, iterations=7)
    edge_ink = ndi.maximum_filter(edge_ink.astype(np.uint8), size=7) > 0
    core_x = sorted({c[0] for c in cores} | {c[2] for c in cores})
    core_y = sorted({c[1] for c in cores} | {c[3] for c in cores})
    for b in blocks:
        if b.get("hatched"):
            continue
        x0, y0, x1, y1 = [v * K for v in b["rect"]]
        x0 = float(np.clip(x0, 0, W - 1)); x1 = float(np.clip(x1, 0, W - 1)); y0 = float(np.clip(y0, 0, H - 1)); y1 = float(np.clip(y1, 0, H - 1))
        w = int(0.09 * LONG)
        # 변마다 겹쳐 있는 범위의 가운데 80% 만 본다
        ys = slice(int(y0 + 0.1 * (y1 - y0)), max(int(y0 + 0.1 * (y1 - y0)) + 1, int(y1 - 0.1 * (y1 - y0))))
        xs = slice(int(x0 + 0.1 * (x1 - x0)), max(int(x0 + 0.1 * (x1 - x0)) + 1, int(x1 - 0.1 * (x1 - x0))))
        colprof = edge_ink[ys, :].mean(0) if (ys.stop - ys.start) > 0 else np.zeros(W)   # x 위치별
        rowprof = edge_ink[:, xs].mean(1) if (xs.stop - xs.start) > 0 else np.zeros(H)   # y 위치별
        near = lambda targets: (lambda p: 0.22 if any(abs(p - t * K) <= 22 for t in targets) else 0.0)
        nx0 = _snap_edge(colprof, x0, w, near(core_x)); nx1 = _snap_edge(colprof, x1, w, near(core_x))
        ny0 = _snap_edge(rowprof, y0, w, near(core_y)); ny1 = _snap_edge(rowprof, y1, w, near(core_y))
        r = [(nx0 if nx0 is not None else x0) / K, (ny0 if ny0 is not None else y0) / K, (nx1 if nx1 is not None else x1) / K, (ny1 if ny1 is not None else y1) / K]
        if r[2] - r[0] > 2 and r[3] - r[1] > 2:
            out_blocks[b["id"]] = [round(v, 1) for v in r]
            notes.append(f"{b['id']}: 변 위치 {[nx0, ny0, nx1, ny1]}")

    # ③ 화살표 꼬리: 빨간 선을 가늘게 깎아(뼈대) 화살촉 반대편 끝점을 찾는다
    rm = ndi.binary_closing(red, structure=np.ones((3, 3)))
    rm = ndi.binary_opening(rm, structure=np.ones((1, 1)))
    lab0, n0 = ndi.label(rm)
    keep = np.isin(lab0, [i for i, c in enumerate(ndi.sum(rm, lab0, range(1, n0 + 1)), start=1) if c >= 120])
    rm = keep
    sk = morphology.skeletonize(rm)
    lab, n = ndi.label(sk, structure=np.ones((3, 3)))
    nb = ndi.convolve(sk.astype(int), np.ones((3, 3), int), mode="constant") - 1
    endp = np.argwhere(sk & (nb == 1))  # [y, x]
    skpts = np.argwhere(sk)
    for ar in arrows:
        tail, tip = ar["pts"][0], ar["pts"][-1]
        tipp = np.array([tip[0] * K, tip[1] * K]); tailp = np.array([tail[0] * K, tail[1] * K])
        if len(skpts) == 0:
            break
        d = np.hypot(skpts[:, 1] - tipp[0], skpts[:, 0] - tipp[1])
        j = int(np.argmin(d))
        if d[j] > 4.0 * K:
            continue  # 화살촉 근처에 빨간 선이 없다
        comp = lab[skpts[j][0], skpts[j][1]]
        v = tailp - tipp; L = float(np.hypot(*v))
        if L < 1e-6:
            continue
        ends = [(float(x), float(y)) for y, x in endp if lab[y, x] == comp]
        best = None
        for ex, ey in ends:
            e = np.array([ex, ey]) - tipp; le = float(np.hypot(*e))
            if le < 0.35 * L or le > 1.6 * L:
                continue
            cosang = float(e @ v) / (le * L)
            if cosang < 0.82:  # 약 35° 안쪽 방향만
                continue
            if best is None or le > best[0]:
                best = (le, ex, ey)
        if best:
            out_arrows[ar["id"]] = [[round(best[1] / K, 1), round(best[2] / K, 1)], [tip[0], tip[1]]]
            notes.append(f"{ar['id']}: 꼬리 이동 {tail} → [{best[1] / K:.1f},{best[2] / K:.1f}]")
    return {"blocks": out_blocks, "arrows": out_arrows, "notes": notes}
