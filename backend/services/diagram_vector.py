"""AI 이미지 편집 결과를 '편집 가능한 층'으로 나눈다.

  · 화살표(굵은 채색 선) → 벡터 선: 점 목록·두께·색·화살촉·실선/파선/점선. 화면에서 끝점·굽음·선 종류·색을 그대로 고칠 수 있다.
  · 구역 색(연한 채움) → 색마다 '농도 마스크' 한 장 + 기준 색. 화면에서 색·농도를 바꾸면 곱하기로 다시 칠해진다.
  · 나머지 → 바탕 그림(선 도면이면 원본 그대로, 사진·3D 면 화살표 자리를 메운 모델 결과).

자동으로 뽑는 것이라 완벽하지 않다: 겹친 화살표는 갈라 읽고, 짧은 얼룩은 버린다. 못 뽑은 것은 바탕에 그대로 남는다(사라지지 않는다)."""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from skimage.color import rgb2hsv
from skimage.morphology import disk, skeletonize

# diagram_edit 의 색 띠와 같은 기준(PIL HSV 0~255)
HUE_BANDS = (("red", 0, 12), ("orange", 12, 32), ("yellow", 32, 50), ("green", 50, 110), ("blue", 135, 185), ("purple", 185, 225), ("red", 244, 256))
MAX_ARROWS = 24


def _hex(c):
    return "#%02X%02X%02X" % tuple(int(v) for v in c)


def _band_luts():
    luts = {}
    for name, lo, hi in HUE_BANDS:
        luts.setdefault(name, np.zeros(256, bool))[lo:hi] = True
    return luts


# ── 화살표 ────────────────────────────────────────────────────────────────

def _graph(skel):
    """뼈대 화소 → (좌표 N×2 [y,x], 인접 그래프)."""
    co = np.argwhere(skel)
    idx = -np.ones(skel.shape, np.int64)
    idx[co[:, 0], co[:, 1]] = np.arange(len(co))
    rows, cols, w = [], [], []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        y2, x2 = co[:, 0] + dy, co[:, 1] + dx
        ok = (y2 >= 0) & (y2 < skel.shape[0]) & (x2 >= 0) & (x2 < skel.shape[1])
        j = np.full(len(co), -1)
        j[ok] = idx[y2[ok], x2[ok]]
        hit = j >= 0
        rows += [np.arange(len(co))[hit]]
        cols += [j[hit]]
        w += [np.full(int(hit.sum()), 1.0 if dy * dx == 0 else 1.4142)]
    r, c, v = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
    g = coo_matrix((np.r_[v, v], (np.r_[r, c], np.r_[c, r])), shape=(len(co), len(co))).tocsr()
    return co, g


def _path(g, a, alive):
    """a 에서 가장 먼 살아 있는 점까지의 최단 경로(점 번호 목록)."""
    sub = g.copy()
    dead = ~alive
    sub = sub.tolil()
    sub = sub.tocsr()
    mask = alive.astype(np.float64)
    sub = sub.multiply(mask[:, None]).multiply(mask[None, :]).tocsr()
    d, pred = dijkstra(sub, directed=False, indices=a, return_predecessors=True)
    d[~np.isfinite(d)] = -1
    d[dead] = -1
    b = int(np.argmax(d))
    out = [b]
    while out[-1] != a and pred[out[-1]] >= 0:
        out.append(int(pred[out[-1]]))
    return out[::-1], float(d[b])


def _skeleton_paths(skel, min_len):
    """뼈대에서 중심선들을 뽑는다: 연결된 덩어리마다 가장 긴 경로, 그 경로에서 뻗은 가지는 따로 경로로(갈림길 앞 점을 이어 붙인다)."""
    co, g = _graph(skel)
    if len(co) < 2:
        return [], [], co
    ncomp, lab = connected_components(g, directed=False)
    alive = np.ones(len(co), bool)
    used_nodes = np.zeros(len(co), bool)
    paths = []
    branch = []
    for c in range(ncomp):
        nodes = np.where(lab == c)[0]
        if len(nodes) < min_len:
            alive[nodes] = False
            continue
        a0 = int(nodes[0])
        comp_alive = alive & (lab == c)
        p, _ = _path(g, a0, comp_alive)
        p, _ = _path(g, p[-1], comp_alive)
        paths.append(p)
        branch.append(False)
        alive[p] = False
        used_nodes[p] = True
    # 가지: 이미 쓴 점 곁에 붙은 남은 조각마다 가장 먼 끝까지
    for _round in range(40):
        if not alive.any():
            break
        sub = g[alive][:, alive]
        ids = np.where(alive)[0]
        nc, l2 = connected_components(sub, directed=False)
        made = False
        used_idx = np.where(used_nodes)[0]
        tree = None
        if len(used_idx):
            from scipy.spatial import cKDTree
            tree = cKDTree(co[used_idx])
        for k in range(nc):
            frag = ids[l2 == k]
            if len(frag) < min_len or tree is None:
                alive[frag] = False
                continue
            dist, near = tree.query(co[frag])
            order = np.argsort(dist)
            if dist[order[0]] > 3.5:
                alive[frag] = False
                continue
            start = int(frag[order[0]])
            comp_alive = np.zeros(len(co), bool)
            comp_alive[frag] = True
            p, ln = _path(g, start, comp_alive)
            if ln < min_len:
                alive[frag] = False
                continue
            anchor = int(used_idx[near[order[0]]])
            paths.append([anchor] + p)
            branch.append(True)
            alive[p] = False
            used_nodes[p] = True
            made = True
        if not made:
            break
    return paths, branch, co


def _rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = np.hypot(*ab)
    if L < 1e-9:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        left = _rdp(pts[: i + 1], eps)
        right = _rdp(pts[i:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


def _smooth_xy(xy, win):
    if len(xy) < win + 2:
        return xy
    k = np.ones(win) / win
    pad = win // 2
    p = np.vstack([np.repeat(xy[:1], pad, 0), xy, np.repeat(xy[-1:], pad, 0)])
    out = np.stack([np.convolve(p[:, 0], k, "valid"), np.convolve(p[:, 1], k, "valid")], 1)
    out[0], out[-1] = xy[0], xy[-1]
    return out


def _runs(flags):
    """참/거짓 열 → [(값, 길이)]."""
    out = []
    for f in flags:
        if out and out[-1][0] == bool(f):
            out[-1][1] += 1
        else:
            out.append([bool(f), 1])
    return out


def _dash_kind(on, step, width):
    """경로를 따라 색이 있는지(on) 열 → 실선/파선/점선/일점쇄선."""
    r = _runs(on)
    if len(r) > 2 and not r[0][0]:
        r = r[1:]
    if len(r) > 2 and not r[-1][0]:
        r = r[:-1]
    dashes = [n * step for v, n in r if v]
    gaps = [n * step for v, n in r if not v]
    if not gaps or sum(gaps) < 0.08 * (sum(dashes) + sum(gaps)):
        return "solid"
    long_d = [d for d in dashes if d >= 2.2 * width]
    short_d = [d for d in dashes if d < 1.6 * width]
    if len(dashes) >= 4 and long_d and short_d and len(short_d) >= 0.3 * len(long_d):
        return "dashdot"
    if np.median(dashes) < 1.8 * width:
        return "dotted"
    return "dashed"


def _merge_collinear(arrows, S):
    """같은 색 띠에서 끝과 끝이 같은 방향으로 이어지는 조각들을 한 화살표로 합친다(밝은 배경에서 화살표가 토막 난 경우).
    가까우면 넉넉히, 멀면(그림 크기의 14% 안) 방향이 거의 일치할 때만."""
    def unit(a, b):
        v = np.array(b, float) - np.array(a, float)
        n = np.hypot(*v)
        return v / n if n > 1e-9 else v

    def end_dir(pts, d):
        """끝점에서 호 길이 d 만큼 거슬러 간 점을 향한 방향의 반대 = 끝으로 나가는 방향."""
        q = pts[::-1]
        acc = 0.0
        for k in range(1, len(q)):
            acc += float(np.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]))
            if acc >= d or k == len(q) - 1:
                return unit(q[k], q[0])
        return unit(q[-1], q[0])

    def flip(a):
        a = dict(a)
        a["pts"] = a["pts"][::-1]
        a["head"] = {"end": "start", "start": "end"}.get(a["head"], a["head"])
        return a

    def ends(a):
        return a["head"] in ("start", "both"), a["head"] in ("end", "both")

    arrows = [dict(a) for a in arrows]
    changed = True
    while changed:
        changed = False
        for i in range(len(arrows)):
            for j in range(i + 1, len(arrows)):
                if arrows[i]["band"] != arrows[j]["band"]:
                    continue
                for ra in (False, True):
                    for rb in (False, True):
                        A = flip(arrows[i]) if ra else arrows[i]
                        B = flip(arrows[j]) if rb else arrows[j]
                        if ends(A)[1] or ends(B)[0]:           # 잇는 자리에 화살촉이 있으면 안 된다
                            continue
                        pa, pb = A["pts"], B["pts"]
                        gap = float(np.hypot(pa[-1][0] - pb[0][0], pa[-1][1] - pb[0][1]))
                        wmax = max(A["width"], B["width"])
                        if gap > 0.14 * S:
                            continue
                        dd = max(6 * wmax, 0.03 * S)
                        da, db = end_dir(pa, dd), -end_dir(pb[::-1], dd)
                        v = unit(pa[-1], pb[0]) if gap > 1e-6 else da
                        near = gap <= max(4 * wmax, 0.04 * S)
                        need = (0.8, 0.7) if near else (0.93, 0.9)
                        if np.dot(da, db) < need[0] or np.dot(da, v) < need[1] or np.dot(v, db) < need[1]:
                            continue
                        la, lb = A["length"], B["length"]
                        pts = pa + pb
                        sm = bool(A["smooth"] and B["smooth"]) and len(pts) <= 2
                        head = "both" if (ends(A)[0] and ends(B)[1]) else "end" if ends(B)[1] else "start" if ends(A)[0] else "none"
                        m = {"pts": pts, "width": round((A["width"] * la + B["width"] * lb) / (la + lb), 1), "color": A["color"] if la >= lb else B["color"],
                             "head": head, "dash": A["dash"] if la >= lb else B["dash"], "smooth": sm, "band": A["band"], "length": round(la + lb + gap, 1)}
                        if m["head"] == "start":
                            m = flip(m)
                        arrows[i] = m
                        arrows.pop(j)
                        changed = True
                        break
                    if changed:
                        break
                if changed:
                    break
            if changed:
                break
    # 합친 뒤 점이 너무 많거나 거의 직선이면 다시 단순화
    for a in arrows:
        if len(a["pts"]) > 2:
            simp = _rdp(np.array(a["pts"], float), max(2.0, 0.006 * S, 0.3 * a["width"]))
            if len(simp) < len(a["pts"]):
                a["pts"] = [[round(float(x), 1), round(float(y), 1)] for x, y in simp]
        q = np.array(a["pts"], float)
        turn = []
        for k in range(1, len(q) - 1):
            v1, v2 = q[k] - q[k - 1], q[k + 1] - q[k]
            cs = np.dot(v1, v2) / ((np.hypot(*v1) * np.hypot(*v2)) or 1)
            turn.append(np.degrees(np.arccos(np.clip(cs, -1, 1))))
        a["smooth"] = not (turn and max(turn) > 55)                      # 꺾임이 뚜렷하면 꺾은선, 아니면 부드러운 곡선
    return arrows


def _head_blobs(mm, r_open):
    """몸통(가는 선)을 지우고 화살촉(굵은 삼각형)만 남기는 열림 연산. 반환: (열린 마스크, [{c(중심), base(밑변 쪽), tip(뾰족한 끝), area, rmax}])
    삼각형의 뾰족한 끝은 열림 연산에서 깎이므로 반경만큼 바깥으로 늘려 잡는다."""
    op = ndi.binary_opening(mm, structure=disk(r_open))
    lab, n = ndi.label(op, structure=np.ones((3, 3)))
    out = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(xs) < 10:
            continue
        pts = np.stack([xs, ys], 1).astype(float)
        c = pts.mean(0)
        _u, _sv, vt = np.linalg.svd(pts - c, full_matrices=False)
        ax, pe = vt[0], vt[1]
        proj = (pts - c) @ ax
        perp = (pts - c) @ pe
        t0, t1 = float(proj.min()), float(proj.max())
        span = max(1e-6, t1 - t0)
        lo = perp[proj <= t0 + 0.3 * span]
        hi = perp[proj >= t1 - 0.3 * span]
        wlo = float(lo.max() - lo.min()) if len(lo) else 0.0
        whi = float(hi.max() - hi.min()) if len(hi) else 0.0
        side = 1.0 if whi < wlo else -1.0                       # 좁은 쪽 = 뾰족한 끝
        d = ax * side
        tip = c + ax * (t1 if side > 0 else t0)
        base = c + ax * (t0 if side > 0 else t1)
        tip = tip + d * r_open * 0.8
        out.append({"c": c, "base": base, "tip": tip, "area": int(len(xs)), "pix": (ys, xs)})
    return op, out


def vectorize_arrows(core, arrow, rgb, hsv_h, scale_ref=None, thin=False):
    """굵은 채색 선 마스크 → 화살표 목록. core = 부풀리지 않은 것(색·선 종류 판정), arrow = 3×3 부풀린 것(모양 뽑기: 얇은 선·점선도 끊기지 않게).
    좌표는 화소(x, y). 반환: (목록, 받아들인 덩어리의 core 화소 마스크).
    각 항목: pts, width(화소), color, head(end/none/both), dash, smooth, band, length."""
    H, W = core.shape
    S = scale_ref or max(H, W)
    luts = _band_luts()
    accepted = np.zeros_like(core, bool)
    arrows = []
    close_r = max(5, int(round(S * 0.011)))
    pad = close_r + 1
    min_cc = max(14, int(2e-5 * S * S))
    for name, lut in luts.items():
        band = lut[hsv_h]
        m = arrow & band                       # 모양
        c0 = core & band                       # 색·종류
        if int(c0.sum()) < 50:
            continue
        # 파선·점선의 끊긴 곳을 이어 한 덩어리로
        closed = ndi.binary_closing(np.pad(m, pad), structure=disk(close_r))[pad:-pad, pad:-pad] | m
        # 점·짧은 파선(두께가 얇아 닫기 연산으로는 안 이어지는 것)은 가볍게 부풀려 한 덩어리로 묶는다(부풀린 모양은 묶는 데만 쓰고 뼈대는 그 가운데를 따른다)
        if thin:
            closed |= ndi.binary_dilation(m, structure=disk(max(3, int(round(S * 0.007)))))
        lab, n = ndi.label(closed, structure=np.ones((3, 3)))
        dt = ndi.distance_transform_edt(m)
        for objs, i in zip(ndi.find_objects(lab), range(1, n + 1)):
            if objs is None:
                continue
            comp = (lab[objs] == i)
            mm = m[objs] & comp
            cc = c0[objs] & comp
            if int(cc.sum()) < min_cc:
                continue
            ddt = dt[objs]
            # 화살표답지 않은 큰 면(두께가 그림의 4% 넘음)은 화살표가 아니다 → 바탕에 남긴다
            if float(ddt[mm].max()) > 0.045 * S:
                continue
            skel = skeletonize(comp)
            on_skel = skel & mm
            have_skel = int(on_skel.sum()) >= 6
            maxdt = float(ddt[mm].max())
            half = float(np.median(ddt[on_skel])) if have_skel else 0.0   # 몸통 반폭(화소, 부풀린 마스크 기준)
            if not have_skel or half <= 0:
                half = max(1.0, maxdt / 1.9)                              # 화살촉 하나뿐인 덩어리: 가장 굵은 곳(안쪽 원 반지름)에서 몸통 폭을 짐작
            ww = max(2.5, 2 * half - 0.5)                         # 보이는 굵기: 부풀린 마스크(양쪽 1화소)에서 반화소만 뺀다(합성 때 가장자리가 번져 보이던 굵기에 맞춘다)
            min_len = max(8, int(3 * half))
            paths, is_branch, co = _skeleton_paths(skel, min_len) if have_skel else ([], [], np.zeros((0, 2), int))
            # 화살촉 덩어리(몸통을 열림 연산으로 지우고 남은 굵은 삼각형): 뼈대 끝점이 어긋나거나 점선에 붙어 있어도 찾는다
            r_open = max(2, int(round(0.9 * half)))                     # 작게 열어 후보를 넉넉히 잡고(파선 조각도 남는다), 아래에서 '몸통보다 확실히 굵은 것'만 화살촉으로 친다
            _op, cand_blobs = _head_blobs(mm, r_open)
            skel_xy = co[:, ::-1].astype(float) if have_skel and len(co) else np.zeros((0, 2))
            skel_r = ddt[co[:, 0], co[:, 1]] if have_skel and len(co) else np.zeros(0)
            skel_tree = None
            if len(skel_xy):
                from scipy.spatial import cKDTree
                skel_tree = cKDTree(skel_xy)
            blobs = []
            for bl in cand_blobs:
                rmax = float(ddt[bl["pix"]].max())
                local = half
                if skel_tree is not None:                                  # 그 둘레(7×폭 안) 몸통의 반폭 중앙값 — 같은 선 위의 파선 조각은 몸통과 같은 굵기라 걸러진다
                    near_i = skel_tree.query_ball_point(bl["c"], 7 * ww)
                    if near_i:
                        local = float(np.median(skel_r[near_i]))
                if rmax >= 1.45 * max(local, 1.0) and rmax >= 2.5:
                    bl["rmax"] = rmax
                    blobs.append(bl)
            head_mask = np.zeros(mm.shape, bool)
            for bl in blobs:
                head_mask[bl["pix"]] = True
            dist_open = ndi.distance_transform_edt(~head_mask) if head_mask.any() else None
            longest = max((float(np.hypot(*np.diff(co[pp][:, ::-1].astype(float), axis=0).T).sum()) for pp in paths), default=0.0)
            if blobs and longest <= 7 * ww and int(mm.sum()) <= 1.8 * sum(bl["area"] for bl in blobs) + 12:
                paths, is_branch = [], []                                  # 덩어리 거의 전부가 화살촉: 삼각형의 뼈대를 선으로 읽지 않고 '화살촉 하나'로 남긴다
            if not paths and not blobs:
                continue
            # 뼈대 끝점(차수 1)만 화살촉 후보
            nb = ndi.convolve(skel.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - skel
            endpoint = skel & (nb == 1)
            color = np.median(rgb[objs][cc], axis=0)
            near = ndi.binary_dilation(cc, iterations=1)
            got_any = False
            cands = []
            for p, br in zip(paths, is_branch):
                yx = co[p]
                xy = yx[:, ::-1].astype(float)
                if len(xy) < min_len:
                    continue
                L = float(np.hypot(*np.diff(xy, axis=0).T).sum())
                if L < max(3.2 * ww, 0.025 * S):
                    continue

                # 화살촉: 뼈대 끝점이고, 끝에서 3×폭 안에서 두께가 몸통의 1.5배를 넘을 때
                def head_at(end, xy=xy, yx=yx):
                    seg = xy[-1 - int(3 * ww):] if end else xy[: 1 + int(3 * ww)]
                    ys, xs = seg[:, 1].astype(int), seg[:, 0].astype(int)
                    ey, ex = (yx[-1][0], yx[-1][1]) if end else (yx[0][0], yx[0][1])
                    tip_ok = endpoint[ey, ex]
                    blob_ok = dist_open is not None and float(dist_open[ey, ex]) <= 3.5 * ww + r_open
                    return bool((tip_ok and ddt[ys, xs].max() >= 1.5 * half) or blob_ok)
                cands.append({"xy": xy, "yx": yx, "L": L, "branch": br, "he": head_at(True), "hs": head_at(False)})
            # 화살촉 날개 쪽으로 난 짧은 가지(굵은 화살촉의 뼈대 곁가지)는 화살표가 아니다
            tips = [c["xy"][-1] for c in cands if c["he"]] + [c["xy"][0] for c in cands if c["hs"]]
            keep = []
            for c in cands:
                if c["branch"] and c["L"] < 10 * ww and any(np.hypot(*(c["xy"][0] - t)) < 6 * ww for t in tips):
                    continue
                keep.append(c)
            # 어느 선 끝에도 붙지 않은 화살촉 덩어리는 '화살촉만 있는 짧은 화살표'로 남긴다(점선 조각과 이어 붙이는 것은 아래 합치기가 한다)
            ends = [c["xy"][0] for c in keep] + [c["xy"][-1] for c in keep]
            on_path = None
            if keep:
                from scipy.spatial import cKDTree
                on_path = cKDTree(np.vstack([c["xy"][::2] for c in keep]))
            for bl in blobs:
                if bl["area"] > 6 * (3 * ww) ** 2:                       # 너무 큰 덩어리는 화살촉이 아니다
                    continue
                if any(np.hypot(*(bl["c"] - e)) <= 4.5 * ww + r_open for e in ends):
                    continue
                if on_path is not None and float(on_path.query(bl["c"])[0]) < 2.5 * ww + r_open:   # 이미 있는 선 한가운데의 굵은 곳(파선 조각·갈림길)은 화살촉이 아니다
                    continue
                off0 = np.array([objs[1].start, objs[0].start], float)
                a_, b_ = bl["base"], bl["tip"]
                Lh = float(np.hypot(*(b_ - a_)))
                if Lh < 2 * ww:
                    continue
                wpiece = ww if have_skel else max(2.5, 0.95 * float(ddt[mm].max()))
                arrows.append({"pts": [[round(float(a_[0] + off0[0]), 1), round(float(a_[1] + off0[1]), 1)], [round(float(b_[0] + off0[0]), 1), round(float(b_[1] + off0[1]), 1)]], "width": round(wpiece, 1), "color": _hex(color),
                               "head": "end", "dash": "solid", "smooth": True, "band": name, "length": round(Lh, 1)})
                got_any = True
            for c in keep:
                xy, L, he, hs = c["xy"], c["L"], c["he"], c["hs"]
                win = int(max(7, min(31, ww * 1.5))) | 1
                dense = _smooth_xy(xy, win)
                # 선 종류: 경로를 따라 원본(부풀리지 않은) 마스크가 켜진 모양
                ys = np.clip(np.round(dense[:, 1]).astype(int), 0, near.shape[0] - 1)
                xs = np.clip(np.round(dense[:, 0]).astype(int), 0, near.shape[1] - 1)
                on = near[ys, xs]
                head_len = int(3.2 * ww)
                shaft = on[(head_len if hs else 0): len(on) - (head_len if he else 0)]
                dash = _dash_kind(shaft, 1.0, ww) if len(shaft) > 6 else "solid"
                # 단순화: 거의 직선이면 두 점, 꺾임이 있으면 꺾임을 보존한 꺾은선, 아니면 부드러운 곡선(4~9점)
                eps = max(2.0, 0.006 * S, 0.3 * ww)
                simp = _rdp(dense, eps)
                turn = []
                for k in range(1, len(simp) - 1):
                    v1, v2 = simp[k] - simp[k - 1], simp[k + 1] - simp[k]
                    cs = np.dot(v1, v2) / ((np.hypot(*v1) * np.hypot(*v2)) or 1)
                    turn.append(np.degrees(np.arccos(np.clip(cs, -1, 1))))
                sharp = bool(turn) and max(turn) > 55
                if len(simp) == 2:
                    pts, smooth = simp, True
                elif sharp:
                    pts, smooth = simp, False
                else:
                    n_pts = int(np.clip(round(L / (0.09 * S)) + 3, 4, 9))
                    cum = np.r_[0, np.cumsum(np.hypot(*np.diff(dense, axis=0).T))]
                    tt = np.linspace(0, cum[-1], n_pts)
                    pts = np.stack([np.interp(tt, cum, dense[:, 0]), np.interp(tt, cum, dense[:, 1])], 1)
                    smooth = True
                head = "both" if (he and hs) else "end" if (he or hs) else "none"
                if hs and not he:        # 화살촉이 시작 쪽에만 있으면 방향을 뒤집어 '끝'에 오게
                    pts = pts[::-1]
                off = np.array([objs[1].start, objs[0].start], float)
                arrows.append({"pts": [[round(float(x + off[0]), 1), round(float(y + off[1]), 1)] for x, y in pts], "width": round(ww, 1), "color": _hex(color),
                               "head": head, "dash": dash, "smooth": smooth, "band": name, "length": round(L, 1)})
                got_any = True
            if got_any:
                accepted[objs] |= cc
    arrows = _merge_collinear(arrows, S)
    kept = [a for a in arrows if a["head"] != "none" or a["length"] >= 0.04 * S]      # 화살촉도 없고 아주 짧은 토막은 얼룩일 가능성이 크다
    arrows = kept or arrows
    arrows.sort(key=lambda a: -a["length"])
    return arrows[:MAX_ARROWS], accepted


# ── 구역 색 ───────────────────────────────────────────────────────────────

def split_zones(tint, zone_entries, max_side=1000):
    """곱하기 색 판 T(0~1, H×W×3)에서 구역 색별 농도 마스크를 뽑는다. T ≈ 1 − Σ a_k(1 − c_k).
    zone_entries: [{'color': '#RRGGBB', 'label': ...}]. 반환: (층 목록, 남은 T). 층: color(#RRGGBB, 최대 농도 때의 색), label, mask(L 이미지), cover(비율)."""
    H, W, _ = tint.shape
    hsv = rgb2hsv(np.clip(tint, 0, 1))
    tinted = (tint.max(axis=2) - tint.min(axis=2)) > 0.045
    hues = []
    for z in zone_entries:
        c = z["color"].lstrip("#")
        rgb = np.array([[[int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]]])
        hues.append(float(rgb2hsv(rgb)[0, 0, 0]))
    if not hues:
        return [], tint
    hv = np.array(hues)
    dist = np.abs(hsv[..., 0][..., None] - hv[None, None, :])
    dist = np.minimum(dist, 1 - dist)
    owner = np.argmin(dist, axis=2)
    near = np.take_along_axis(dist, owner[..., None], 2)[..., 0] < 0.09
    rest = tint.copy()
    layers = []
    for k, z in enumerate(zone_entries):
        sel = tinted & near & (owner == k)
        if int(sel.sum()) < 0.002 * H * W:
            continue
        strength = 1 - tint.min(axis=2)
        top = sel & (strength >= np.percentile(strength[sel], 70))
        c = tint[top].mean(axis=0)
        d = 1 - c
        den = float((d * d).sum()) or 1e-6
        a = np.zeros((H, W), np.float32)
        a[sel] = np.clip(((1 - tint[sel]) @ d) / den, 0, 1.0)
        a = ndi.gaussian_filter(a, 0.6)
        rest = rest + a[..., None] * d[None, None, :]
        m = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L")
        k_ = max_side / max(m.size)
        if k_ < 1:
            m = m.resize((round(m.width * k_), round(m.height * k_)), Image.LANCZOS)
        layers.append({"color": _hex(np.clip(c, 0, 1) * 255), "label": z.get("label", "구역"), "mask": m, "cover": round(float(sel.mean()), 4), "legend_color": z["color"]})
    return layers, np.clip(rest, 0, 1)


def split_zones_photo(original, final, zone_entries, max_side=1000):
    """사진·3D 뷰 결과: 모델이 장면을 다시 그려서 곱하기 판이 없다. 대신 '원래 없던 그 색'이 새로 생긴 자리를 마스크로 잡고(범례의 색 띠 기준),
    화면에서는 색조·채도만 바꾸는 'color' 혼합으로 다시 칠한다(밝기·질감은 그대로). 반환: 층 목록(blend='color')."""
    f = final.convert("RGB")
    fh = np.asarray(f.convert("HSV"))
    oh = np.asarray(original.convert("RGB").resize(f.size).convert("HSV"))
    rgb = np.asarray(f)
    H, W = fh.shape[:2]
    luts = _band_luts()
    from services import diagram_edit as D
    layers = []
    for z, nm in zip(zone_entries, D._names_for(zone_entries)):
        lut = luts.get(nm)
        if lut is None:
            continue
        fm = lut[fh[..., 0]] & (fh[..., 1] > 45) & (fh[..., 2] > 90)
        om = lut[oh[..., 0]] & (oh[..., 1] > 45) & (oh[..., 2] > 90)
        m = fm & ~ndi.binary_dilation(om, structure=np.ones((5, 5)))
        m = ndi.binary_opening(m, structure=np.ones((3, 3)))
        lab, n = ndi.label(m)
        if n:
            area = np.asarray(ndi.sum(m, lab, np.arange(1, n + 1)))
            m = np.isin(lab, 1 + np.where(area >= 0.0015 * H * W)[0])
        m = ndi.binary_closing(m, structure=np.ones((5, 5))) & fm
        if int(m.sum()) < 0.004 * H * W:
            continue
        a = ndi.gaussian_filter(m.astype(np.float32), 1.5)
        a = np.clip(a * 1.15, 0, 1)
        mk = Image.fromarray((a * 255).astype(np.uint8), "L")
        k_ = max_side / max(mk.size)
        if k_ < 1:
            mk = mk.resize((round(mk.width * k_), round(mk.height * k_)), Image.LANCZOS)
        layers.append({"color": _hex(np.median(rgb[m], axis=0)), "label": z.get("label", "구역"), "mask": mk, "cover": round(float(m.mean()), 4), "legend_color": z["color"], "blend": "color"})
    return layers


# ── 바탕(화살표 자리 메우기) ─────────────────────────────────────────────

def fill_holes(img_f, hole, sigmas=(3, 6, 12, 24)):
    """hole(참)인 화소를 둘레 색으로 메운다(정규화 가우시안을 점점 넓혀 가며). img_f: H×W×3 0~1."""
    out = img_f.copy()
    valid = (~hole).astype(np.float32)
    todo = hole.copy()
    for s in sigmas:
        if not todo.any():
            break
        num = np.stack([ndi.gaussian_filter(out[..., c] * valid, s) for c in range(3)], -1)
        den = ndi.gaussian_filter(valid, s)[..., None]
        ok = todo & (den[..., 0] > 0.05)
        out[ok] = num[ok] / den[ok]
        valid = np.where(ok, 1.0, valid).astype(np.float32)
        todo &= ~ok
    return out


# ── 한 번에: 결과 → 편집 가능한 층 ───────────────────────────────────────

def sensitive_core(parts, S=None, exclude_bands=()):
    """선 도면(overlay)용 더 민감한 화살표 마스크. 합성에 쓰는 엄격한 마스크(core)는 1~2화소 두께의 점선·가는 선을 열림 연산으로 지워서 놓치므로,
    채도 기준을 낮추고 열림 연산을 빼되, 구역 채움 같은 '넓은 면'은 큰 원으로 열어 낸 부분(+여유)을 빼서 가는 구조(선·화살촉)만 남긴다. 원본에서 실제로 바뀐 화소만 본다."""
    from services import diagram_edit as D
    Qi, O = parts["Qi"], parts["O"]
    S = S or max(parts["core"].shape)
    o_strong = ndi.binary_dilation(D._strong(O, 0.40, 0.40), structure=np.ones((7, 7)))
    changed = np.abs(np.asarray(Qi, np.int16) - np.asarray(O.resize(Qi.size), np.int16)).sum(axis=2) > 60
    m = D._strong(Qi, 0.42, 0.45) & ~o_strong & changed
    r = max(4, int(round(0.0055 * S)))
    big = ndi.binary_opening(m, structure=disk(r))
    thin = m & ~ndi.binary_dilation(big, iterations=2)
    if exclude_bands:                                       # 구역을 칠한 색 띠는 연한 채움이 많아 민감하게 보면 면을 선으로 착각한다 → 엄격한 마스크만
        hh = np.asarray(Qi.convert("HSV"))[..., 0]
        luts = _band_luts()
        zone = np.zeros(hh.shape, bool)
        for b in exclude_bands:
            if b in luts:
                zone |= luts[b][hh]
        thin &= ~zone
    return thin | parts["core"]


def build_layers(parts, how, legend, only_bands=None):
    """tint_parts() 결과와 마무리 방식('overlay' 선 도면 합성 / 'model' 사진·3D), 범례로 층을 만든다.
    반환: {'base': PIL RGB, 'arrows': [...], 'zones': [{color,label,mask(PIL L),legend_color}], 'legend': 범례(색을 층·화살표 색에 맞춘 것)}.
    화살표도 구역도 못 뽑았으면 None(호출한 쪽이 합성 그림 그대로 쓴다)."""
    O, Qi, Of, Qf, T, core, arrow = (parts[k] for k in ("O", "Qi", "Of", "Qf", "T", "core", "arrow"))
    rgb = np.asarray(Qi)
    hh = np.asarray(Qi.convert("HSV"))[..., 0]
    if how == "overlay":
        from services import diagram_edit as _D
        zone_bands = {n for n, l in zip(_D._names_for([l for l in legend if l.get("kind") == "zone"]), [l for l in legend if l.get("kind") == "zone"]) if n}
        core = sensitive_core(parts, exclude_bands=zone_bands)
        arrow = ndi.binary_dilation(core, structure=np.ones((3, 3))) | parts["arrow"]
    arrows, acc = vectorize_arrows(core, arrow, rgb, hh, thin=(how == "overlay"))
    if only_bands:                                 # 영역만 다시 그릴 때: 범례에 있는 동선 색 띠의 화살표만(그 밖의 색은 조각에서 생긴 얼룩일 가능성이 크다)
        arrows = [a for a in arrows if a["band"] in only_bands] or arrows[:0]
    S = max(core.shape)
    lab, n = ndi.label(arrow, structure=np.ones((3, 3)))
    blob = np.zeros_like(arrow, bool)                                   # 두께가 큰 덩어리(굵은 색 면)는 화살표가 아니니 바탕에 그대로 둔다
    if n:
        dt = ndi.distance_transform_edt(arrow)
        mx = ndi.maximum(dt, lab, np.arange(1, n + 1))
        blob = np.isin(lab, 1 + np.where(np.asarray(mx) > 0.045 * S)[0])
    zones, rest = [], None
    if how == "overlay":
        zones, rest = split_zones(T, [l for l in legend if l.get("kind") == "zone"])
        a = ndi.gaussian_filter(blob.astype(np.float32), 0.8)[..., None]
        R = Of * (rest if rest is not None else T) * (1 - a) + Qf * a
    else:
        R = fill_holes(Qf, ndi.binary_dilation(arrow & ~blob, iterations=2))
        zones = split_zones_photo(O, Qi, [l for l in legend if l.get("kind") == "zone"])
    if not arrows and not zones:
        return None
    base = Image.fromarray((np.clip(R, 0, 1) * 255).astype(np.uint8))
    # 같은 색 띠의 화살표는 한 색으로 맞추고(가장 긴 것 기준), 범례의 색도 거기에 맞춘다 → 범례·화살표를 같은 색으로 한 번에 바꿀 수 있다
    band_color = {}
    for a_ in arrows:
        band_color.setdefault(a_["band"], a_["color"])
    for a_ in arrows:
        a_["color"] = band_color[a_["band"]]
    names = {"red": "red", "orange": "orange", "yellow": "yellow", "green": "green", "blue": "blue", "purple": "purple"}
    from services import diagram_edit as D
    lg = []
    for l in legend:
        l = dict(l)
        nm = D._names_for([l])[0]
        if l.get("kind") == "flow" and nm in band_color:
            l["color"] = band_color[nm]
        elif l.get("kind") == "zone":
            z = next((z for z in zones if z["legend_color"] == l["color"]), None)
            if z:
                l["color"] = z["color"]
        lg.append(l)
    return {"base": base, "arrows": arrows, "zones": zones, "legend": lg}
