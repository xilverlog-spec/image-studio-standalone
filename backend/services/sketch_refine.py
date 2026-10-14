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


def _dense_components(body, thr=0.42):
    """빗금이 촘촘히 몰린 덩어리(코어) 후보: [(상자 px, 면적)]"""
    dens = ndi.uniform_filter(body.astype(float), 15)
    m = dens > thr
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


def _snap_edge(prof, p0, w, bonus, thr=0.62, outer=0):
    """prof[p] = 그 위치에 선 잉크가 이어진 비율. p0 근처(±w)에서 가장 확실한 위치를 고른다. 근거가 약하면 None.
    outer = -1(위·왼쪽 변)/+1(아래·오른쪽 변): 비슷하게 확실한 선이 여럿이면 가장 바깥 선을 고른다(안쪽 선은 코어 변·칸막이일 가능성이 크다)."""
    lo = max(0, int(p0) - w); hi = min(len(prof) - 1, int(p0) + w)
    if hi <= lo:
        return None
    scores = {p: prof[p] - 0.0028 * abs(p - p0) + bonus(p) for p in range(lo, hi + 1) if prof[p] >= thr}
    if not scores:
        return None
    top = max(scores.values())
    cands = [p for p, sc in scores.items() if sc >= top - 0.12]
    return (min(cands) if outer < 0 else max(cands)) if outer else max(scores, key=scores.get)


def _snap2(prof_t, prof_s, p0, w, bonus, outer):
    """1단계: 너그러운 값으로 대략 위치를 잡고(기울어진 손선 대응), 2단계: 엄격한 값으로 ±1.4 단위 안에서 선 위치를 정밀하게 맞춘다."""
    p = _snap_edge(prof_s, p0, w, bonus, thr=0.62, outer=outer)
    if p is None:
        return None
    lo = max(0, p - 14); hi = min(len(prof_s) - 1, p + 14)
    q = max(range(lo, hi + 1), key=lambda i: prof_s[i] - 0.004 * abs(i - p))
    return q if prof_s[q] >= 0.3 else p


def _median_edge(ink, p0, w, span, vertical):
    """손으로 그려 기울어진 변: 직선 근거가 없을 때, p0 근처에서 줄(행/열)마다 p0 에 가장 가까운 선 위치를 구해 중앙값을 쓴다.
    (바깥 끝이 아니라 중간 위치를 쓰면 기울어진 사다리꼴도 사용자가 의도한 반듯한 직사각형에 가깝다.) 줄의 절반 이상에서 선이 보이지 않으면 None."""
    H, W = ink.shape
    vals = []
    n = 0
    for r in range(span[0], span[1]):
        n += 1
        lo = max(0, int(p0) - w); hi = min((W if vertical else H) - 1, int(p0) + w)
        line = ink[r, lo:hi + 1] if vertical else ink[lo:hi + 1, r]
        idx = np.nonzero(line)[0]
        if len(idx):
            vals.append(lo + idx[int(np.argmin(np.abs(lo + idx - p0)))])
    if n == 0 or len(vals) < 0.6 * n:
        return None
    return float(np.median(vals))


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


def _remove_ticks(rm, body):
    """벽을 따라 붙은 빨간 톱니(열린 면 눈금)를 지운다. 눈금은 벽 선(파랑·검정) 바로 옆에 길게 붙어 있다. 벽 선 14px 안에 있는 빨간 잉크 중
    60px 넘게 이어진 조각만 눈금으로 보고 지운다(화살표가 벽을 가로지르는 짧은 구간은 남는다)."""
    band = ndi.binary_dilation(body, iterations=14)
    near = rm & band
    lab, n = ndi.label(near, structure=np.ones((3, 3)))
    out = rm.copy()
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if max(h, w) >= 60:
            out[sl][lab[sl] == i] = False
    return out


class _SkelGraph:
    """뼈대 픽셀을 이웃(8방향)끼리 이은 그래프. 가장 짧은 길로 거리·경로를 구한다."""

    def __init__(self, sk):
        from scipy.sparse import coo_matrix
        self.H, self.W = sk.shape
        ys, xs = np.nonzero(sk)
        self.ys, self.xs = ys, xs
        n = len(ys)
        idx = -np.ones(sk.shape, int)
        idx[ys, xs] = np.arange(n)
        r, c, w = [], [], []
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            y2, x2 = ys + dy, xs + dx
            ok = (y2 >= 0) & (y2 < self.H) & (x2 >= 0) & (x2 < self.W)
            a = np.nonzero(ok)[0]
            b = idx[y2[a], x2[a]]
            m = b >= 0
            r += list(a[m]); c += list(b[m]); w += [float(np.hypot(dy, dx))] * int(m.sum())
        self.g = coo_matrix((w + w, (r + c, c + r)), shape=(n, n)).tocsr() if n else None
        deg = np.asarray((self.g > 0).sum(1)).ravel() if n else np.zeros(0)
        self.ends = np.nonzero(deg == 1)[0]
        self.junctions = np.nonzero(deg >= 3)[0]  # 갈라지는 점(화살촉의 날개가 만나는 곳 등)
        self.n = n
        from scipy.sparse.csgraph import connected_components
        self.labels = connected_components(self.g, directed=False)[1] if n else np.zeros(0, int)

    def nearest(self, x, y, tol):
        if not self.n:
            return None
        d = np.hypot(self.xs - x, self.ys - y)
        j = int(np.argmin(d))
        return j if d[j] <= tol else None

    def nearest_per_component(self, x, y, tol):
        """tol 안에 있는 뼈대 점을 덩어리별로 묶어, 덩어리마다 가장 가까운 점 하나씩(가까운 순)."""
        if not self.n:
            return []
        d = np.hypot(self.xs - x, self.ys - y)
        out = {}
        for j in np.nonzero(d <= tol)[0]:
            c = int(self.labels[j])
            if c not in out or d[j] < d[out[c]]:
                out[c] = int(j)
        return sorted(out.values(), key=lambda j: d[j])

    def paths(self, src):
        from scipy.sparse.csgraph import dijkstra
        return dijkstra(self.g, directed=False, indices=src, return_predecessors=True)

    def route(self, pred, src, dst):
        out = [dst]
        while out[-1] != src:
            p = pred[out[-1]]
            if p < 0:
                return None
            out.append(int(p))
        return out[::-1]  # src → dst


def _resample_px(pts, n):
    pts = np.asarray(pts, float)
    cum = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])
    t = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(t, cum, pts[:, 0]), np.interp(t, cum, pts[:, 1])], 1)


def _trace_arrow(graph, tail, tip, K):
    """AI 화살촉(tip) 근처 빨간 선 덩어리마다 시도해서, 곧고 긴 화살대 끝점이 가장 잘 나오는 것을 꼬리로 삼고 그 선을 따라 점을 뽑는다. 못 찾으면 None."""
    L = float(np.hypot(tail[0] - tip[0], tail[1] - tip[1])) * K
    if L < 1e-6:
        return None
    v = np.array([tail[0] - tip[0], tail[1] - tip[1]]) * K
    best = None  # (점수, 출발 노드, 끝점 노드, pred)
    for src in graph.nearest_per_component(tip[0] * K, tip[1] * K, 7.5 * K)[:4]:
        dist, pred = graph.paths(src)
        # 화살촉이 있으면 가까이에 날개가 갈라지는 점이 있다. 없으면(호 끝 등) 화살표가 아닐 가능성이 크므로 점수를 크게 깎는다
        jn = graph.junctions[graph.labels[graph.junctions] == graph.labels[src]] if len(graph.junctions) else []
        head = len(jn) > 0 and float(np.min(np.hypot(graph.xs[jn] - graph.xs[src], graph.ys[jn] - graph.ys[src]))) <= 4.5 * K
        for e in graph.ends:
            if not np.isfinite(dist[e]) or e == src:
                continue
            d = np.array([graph.xs[e] - graph.xs[src], graph.ys[e] - graph.ys[src]], float)
            chord = float(np.hypot(*d))
            if chord < max(0.3 * L, 6.0 * K) or chord > 3.2 * L or dist[e] > 1.35 * chord + 12:
                continue  # 너무 짧거나(화살촉 날개) 길거나 구불구불(빗금·글자)하면 화살대가 아니다
            cosang = float(d @ v) / (chord * L)
            if cosang < -0.1:
                continue  # AI 꼬리 위치는 자주 틀리지만, 화살촉에서 정반대 쪽(화살촉 쪽)은 아니다
            sc = chord * (1.0 + max(0.0, cosang)) - 3.0 * float(np.hypot(graph.xs[src] - tip[0] * K, graph.ys[src] - tip[1] * K))  # 길고 곧으며 AI 가 짚은 방향·화살촉 위치에 가까운 선을 우대
            if not head:
                sc *= 0.3 if sc > 0 else 1.0
            if best is None or sc > best[0]:
                best = (sc, src, e, pred)
    if best is None:
        return None
    route = graph.route(best[3], best[1], best[2])
    if not route or len(route) < 3:
        return None
    px = np.stack([graph.xs[route], graph.ys[route]], 1)[::-1]  # 꼬리(끝점) → 화살촉(출발 점)
    # AI 가 화살촉을 반대쪽 끝에 짚었을 수 있다. 날개가 갈라지는 점(화살촉)이 끝점 쪽에만 있으면 방향을 뒤집는다
    def has_head(node):
        jn = graph.junctions[graph.labels[graph.junctions] == graph.labels[node]] if len(graph.junctions) else []
        return len(jn) > 0 and float(np.min(np.hypot(graph.xs[jn] - graph.xs[node], graph.ys[jn] - graph.ys[node]))) <= 4.5 * K
    if has_head(best[2]) and not has_head(best[1]):
        px = px[::-1]
    return [[round(float(x) / K, 1), round(float(y) / K, 1)] for x, y in _resample_px(px, 4 if len(px) > 60 else 2)]


def _trace_arc(graph, pts, K):
    """호: AI 가 찍은 점들에서 가장 가까운 빨간 선 덩어리를 찾고, 그 안의 끝점 쌍 중 AI 점들과 가장 잘 겹치는 곡선 경로를 고른다.
    (AI 의 호 끝점은 4~6 단위 어긋나는 일이 잦아서 끝점이 아니라 곡선 전체의 겹침으로 고른다)"""
    from scipy.sparse.csgraph import connected_components
    if not graph.n:
        return None
    mid = np.array(pts[len(pts) // 2]) * K
    m = graph.nearest(mid[0], mid[1], 8.0 * K)
    if m is None:
        return None
    _, labels = connected_components(graph.g, directed=False)
    ends = [int(e) for e in graph.ends if labels[e] == labels[m]]
    if len(ends) < 2 or len(ends) > 14:
        return None
    ai = np.array(pts, float) * K
    ai_chord = float(np.hypot(*(ai[-1] - ai[0])))
    best = None
    for a_i, a in enumerate(ends):
        dist, pred = graph.paths(a)
        for z in ends[a_i + 1:]:
            if not np.isfinite(dist[z]):
                continue
            chord = float(np.hypot(graph.xs[z] - graph.xs[a], graph.ys[z] - graph.ys[a]))
            if dist[z] < 5.0 * K or dist[z] > 2.4 * chord + 20:
                continue
            if chord < 0.5 * ai_chord or chord > 2.0 * ai_chord or chord < 8.0 * K:
                continue  # AI 가 짚은 호와 길이가 크게 다르면 다른 선이다
            route = graph.route(pred, a, z)
            if not route:
                continue
            px = np.stack([graph.xs[route], graph.ys[route]], 1)
            ds = [float(np.min(np.hypot(px[:, 0] - q[0], px[:, 1] - q[1]))) for q in ai]
            sc = float(np.mean(ds))
            if best is None or sc < best[0]:
                best = (sc, px)
    if best is None or best[0] > 8.0 * K:
        return None
    return [[round(float(x) / K, 1), round(float(y) / K, 1)] for x, y in _resample_px(best[1], 7)]


def refine(png_bytes, blocks, arrows, arcs=()):
    """blocks=[{id,rect,hatched}], arrows=[{id,pts:[꼬리,화살촉]}] → {blocks:{id:rect}, arrows:{id:[꼬리,화살촉]}, notes:[...]}"""
    a = _load(png_bytes)
    H, W = a.shape[:2]
    red, body = ink_masks(a)
    K = LONG / 100.0
    notes = []
    out_blocks = {}
    out_arrows = {}

    # ① 코어(빗금 도형): 빗금이 몰린 덩어리의 상자로
    comps_by_thr = {}
    def comps_at(thr):
        if thr not in comps_by_thr:
            cc, _ = _dense_components(body, thr)
            comps_by_thr[thr] = [([v / K for v in bx], ar) for bx, ar in cc]
        return comps_by_thr[thr]
    cores = []
    for b in blocks:
        if not b.get("hatched"):
            continue
        found = None
        # 빗금이 성긴 그림(가는 펜·넓은 간격)은 밀도 기준을 낮춰 가며 찾는다. 낮은 기준일수록 AI 상자와 더 많이 겹쳐야 받아들인다
        for thr, need in ((0.42, 0.15), (0.32, 0.3), (0.25, 0.4)):
            best = max(((_iou(b["rect"], bx), bx, ar) for bx, ar in comps_at(thr)), default=(0, None, 0), key=lambda t: t[0])
            if best[1] is not None and best[0] >= need:
                bw = (best[1][2] - best[1][0]) * (best[1][3] - best[1][1]) * K * K
                if thr < 0.42 and best[2] < 0.55 * bw:  # 낮은 기준에서는 속이 꽉 찬 덩어리만
                    continue
                found = best; break
        if found:
            bx = _extend_edges(body, found[1], K)
            out_blocks[b["id"]] = [round(v, 1) for v in bx]
            cores.append(bx)
            notes.append(f"{b['id']}: 빗금 덩어리에 맞춤 (겹침 {found[0]:.2f})")
        else:
            cores.append(b["rect"])

    # ② 판(윤곽 도형): 네 변을 선 잉크 위치로. 빗금 속은 제외하고(코어 변은 따로 후보로 더한다), 선이 조금 흔들려도 되도록 살짝 두껍게 본다
    _, dm = _dense_components(body)
    edge_ink = body & ~ndi.binary_erosion(dm, iterations=7)
    edge_ink = ndi.maximum_filter(edge_ink.astype(np.uint8), size=7) > 0
    edge_t_x = ndi.maximum_filter1d(edge_ink.astype(np.uint8), size=29, axis=1) > 0  # 세로 변: 가로로 ±14px 흔들려도 같은 선으로
    edge_t_y = ndi.maximum_filter1d(edge_ink.astype(np.uint8), size=29, axis=0) > 0  # 가로 변: 세로로 ±14px
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
        colprof_t = edge_t_x[ys, :].mean(0) if (ys.stop - ys.start) > 0 else np.zeros(W)  # 기울어진 선도 잡도록 수직 방향으로 너그럽게 본 값
        rowprof_t = edge_t_y[:, xs].mean(1) if (xs.stop - xs.start) > 0 else np.zeros(H)
        near = lambda targets: (lambda p: 0.10 if any(abs(p - t * K) <= 22 for t in targets) else 0.0)
        nx0 = _snap2(colprof_t, colprof, x0, w, near(core_x), -1); nx1 = _snap2(colprof_t, colprof, x1, w, near(core_x), 1)
        ny0 = _snap2(rowprof_t, rowprof, y0, w, near(core_y), -1); ny1 = _snap2(rowprof_t, rowprof, y1, w, near(core_y), 1)
        # 곧은 선 근거가 없는 변(손으로 기울여 그린 변)은 중간 위치로
        yr = (int(y0 + 0.1 * (y1 - y0)), int(y1 - 0.1 * (y1 - y0))); xr = (int(x0 + 0.1 * (x1 - x0)), int(x1 - 0.1 * (x1 - x0)))
        raw_ink = body & ~ndi.binary_erosion(dm, iterations=7)
        if nx0 is None:
            nx0 = _median_edge(raw_ink, x0, w, yr, True)
        if nx1 is None:
            nx1 = _median_edge(raw_ink, x1, w, yr, True)
        if ny0 is None:
            ny0 = _median_edge(raw_ink, y0, w, xr, False)
        if ny1 is None:
            ny1 = _median_edge(raw_ink, y1, w, xr, False)
        r = [(nx0 if nx0 is not None else x0) / K, (ny0 if ny0 is not None else y0) / K, (nx1 if nx1 is not None else x1) / K, (ny1 if ny1 is not None else y1) / K]
        if r[2] - r[0] > 2 and r[3] - r[1] > 2:
            out_blocks[b["id"]] = [round(v, 1) for v in r]
            notes.append(f"{b['id']}: 변 위치 {[nx0, ny0, nx1, ny1]}")

    # ③ 화살표·호: 빨간 선을 가늘게 깎은 뒤(뼈대) 실제 잉크를 따라 추적한다. AI 가 찍은 점은 '어느 선인지' 고르는 데만 쓴다
    rm = ndi.binary_closing(red, structure=np.ones((3, 3)))
    lab0, n0 = ndi.label(rm)
    sizes = ndi.sum(rm, lab0, range(1, n0 + 1))
    rm = np.isin(lab0, [i for i, c in enumerate(sizes, start=1) if c >= 120])
    rm = _remove_ticks(rm, body)
    sk = morphology.skeletonize(rm)
    graph = _SkelGraph(sk)
    for ar in arrows:
        pts = _trace_arrow(graph, ar["pts"][0], ar["pts"][-1], K)
        if pts:
            out_arrows[ar["id"]] = pts
            notes.append(f"{ar['id']}: 화살표 추적 꼬리 {ar['pts'][0]} → {pts[0]}")
    seen = []
    for aid in list(out_arrows):
        pts = out_arrows[aid]
        if any(np.hypot(pts[0][0] - q[0][0], pts[0][1] - q[0][1]) < 3 and np.hypot(pts[-1][0] - q[-1][0], pts[-1][1] - q[-1][1]) < 3 for q in seen):
            out_arrows[aid] = None  # 같은 선을 가리킨 중복 — 호출한 쪽에서 지운다
            notes.append(f"{aid}: 중복 화살표")
        else:
            seen.append(pts)
    for ac in arcs:
        pts = _trace_arc(graph, ac["pts"], K)
        if pts:
            out_arrows[ac["id"]] = pts
            notes.append(f"{ac['id']}: 호 추적 {len(pts)}점")
    # 빨간 잉크가 충분한 그림에서, 빨간 펜으로 읽은 화살표·호가 실제 빨간 선에서 확인되지 않으면 AI 가 지어낸 것이므로 버린다
    if int(red.sum()) >= 1500:
        for it in list(arrows) + list(arcs):
            if it.get("color") != "red" or it["id"] in out_arrows:
                continue
            # AI 선을 따라 점을 찍어, 빨간 잉크(원본, 눈금 포함)가 가까이(2.5 단위) 있는 비율이 낮으면 지어낸 선으로 본다
            P = np.array(it["pts"], float) * K
            samples = [P[0] + (P[-1] - P[0]) * t for t in np.linspace(0, 1, 21)] if len(P) == 2 else list(P)
            near = ndi.binary_dilation(red, iterations=int(2.5 * K))
            cov = float(np.mean([bool(near[int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))]) for x, y in samples]))
            if cov < 0.4:
                out_arrows[it["id"]] = None
                notes.append(f"{it['id']}: 선 주변에 빨간 잉크가 거의 없어 제외 ({cov:.2f})")
    return {"blocks": out_blocks, "arrows": out_arrows, "notes": notes}
