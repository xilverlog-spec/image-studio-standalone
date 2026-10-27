"""동선 경로를 코드가 찾는다 (2026-10-26, B).

도면 위 표시의 동선 화살표를 AI 이미지 편집 모델(Qwen)에게 맡기면 화살촉이 반대로 그려지고, 기존 글자(예: '주출입구')를 가리고, 도면의 길을 따르지 않았다(사내 평면도·배치도 시험).
그래서 Gemini 는 '무엇이 어디서 어디로 가는가'(종류·거쳐 갈 곳을 순서대로·열린 공간 위의 점)만 알려 주고, 길은 이 모듈이 도면 그림 자체를 비용 지도로 삼아 찾는다.

  1) parse_routes   Gemini 의 {"routes":[{label,kind,via:[{name,point_2d}]}]}(0~1000, y·x 순서)를 화소 점으로 바꾸고 검증한다.
  2) cost_grid      도면을 격자로 줄여 비용 지도를 만든다: 벽·글자·가는 선은 비싸게(건너는 비용은 약 120~180화소를 돌아가는 값), 장애물에서 먼 열린 곳은 싸게.
                    그래서 벽을 뚫기보다 가까운 문 틈·복도·도로로 돌아가는 길이 가장 싸다.
  3) find_path      경유점을 차례로 잇는 최소 비용 경로를 찾고, 이동 평균으로 잔 지그재그를 펴서(문 틈은 그대로) 직선 구간 몇 개의 꺾은선으로 줄이고 거의 수평·수직인 구간은 반듯하게 맞춘다. 곡선은 쓰지 않는다.
  4) build_arrows   화면이 읽는 편집 가능한 화살표 목록(diagram_vector 와 같은 형식) + 동선 범례.
  5) draw_arrows    합성 그림(래스터)에 같은 화살표를 그린다: 흰 테두리·점선·끝 화살촉(사내 동선 문법).
"""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.graph import route_through_array

# 선 색(diagram_edit._HUE_BANDS 의 색 띠 이름과 같아 범례·층 나누기가 그대로 읽는다). 사내 관례: 차량 빨강·보행 파랑·주 동선 주황·녹지 초록
ROUTE_COLORS = {"red": "#E0312B", "orange": "#F28C28", "yellow": "#E8B800", "green": "#3E9A47", "blue": "#2F6FD0", "purple": "#8A4FC8"}
KIND_COLOR = {"vehicle": "red", "pedestrian": "blue", "main": "orange", "other": "green"}
KIND_DASH = {"vehicle": "dashed", "pedestrian": "dashed", "main": "dashed", "other": "dashed"}   # 앱의 동선 관례: 굵은 점선 화살표(AI 방식의 결과도 모두 점선이었고, 그것이 더 읽기 좋다는 평가를 받았다)
KIND_WIDTH = {"main": 0.0042, "vehicle": 0.0037, "pedestrian": 0.0036, "other": 0.0035}         # × 그림의 긴 변(1820px 에서 6.4~7.6px — AI 방식의 5.5~7.5px 과 같은 힘)
MAX_PTS = 7                  # 편집 가능한 화살표의 꼭짓점 수 상한. 선은 곡선이 아니라 직선 구간을 이은 꺾은선이다(사용자 요구 2026-10-27)
SNAP_DEG = 14.0              # 이 각도 안이면 거의 수평·수직인 구간을 정확한 수평·수직으로 맞춘다
MAX_ROUTES = 6
MAX_VIA = 10
LABEL_MAX = 16

WALL_PX = 120.0              # 굵은 선·글자를 건너는 비용(화소 단위로 환산: 120화소를 돌아가는 것과 같다)
LINE_PX = 60.0               # 가는 선(회색 이중 벽선 등)을 건너는 비용
CENTER = 3.0                 # 장애물 곁을 지나는 데 드는 추가 비용(복도 가운데로 가게)
SMOOTH_FRAC = 0.035           # 경로를 다듬는 이동 평균 창(그림 긴 변의 비율, 1820px 에서 약 64px)
DT_END = 3.0                 # 화살표의 시작·끝·경유점이 글자·선에서 떨어져야 하는 거리(격자 칸, 1820px 에서 약 9px)


def _pt(v, W, H):
    """[y, x] (0~1000) → (x, y) 화소. 범위 밖이거나 숫자가 아니면 None."""
    if not isinstance(v, (list, tuple)) or len(v) != 2:
        return None
    try:
        y, x = float(v[0]), float(v[1])
    except (TypeError, ValueError):
        return None
    if not (0 <= y <= 1000 and 0 <= x <= 1000):
        return None
    return (min(W - 1, int(round(x * W / 1000))), min(H - 1, int(round(y * H / 1000))))


def parse_routes(obj, size):
    """Gemini 의 경로 계획 → [{label, kind, color, dash, points:[(x,y)…]}]. 점이 2개 미만인 경로는 버리고, 연속으로 겹치는 점은 하나로, 종류를 모르면 'other', 최대 MAX_ROUTES 개."""
    W, H = size
    rs = obj.get("routes") if isinstance(obj, dict) else None
    if not isinstance(rs, list):
        return []
    out = []
    for r in rs:
        if not isinstance(r, dict) or not isinstance(r.get("via"), list):
            continue
        pts = []
        for v in r["via"][:MAX_VIA]:
            p = _pt(v.get("point_2d"), W, H) if isinstance(v, dict) else None
            if p is not None and (not pts or math.hypot(p[0] - pts[-1][0], p[1] - pts[-1][1]) > 3):
                pts.append(p)
        if len(pts) < 2:
            continue
        kind = str(r.get("kind", "")).strip().lower()
        kind = kind if kind in KIND_COLOR else "other"
        out.append({"label": (str(r.get("label") or "동선").strip() or "동선")[:LABEL_MAX], "kind": kind, "color": KIND_COLOR[kind], "dash": KIND_DASH[kind], "points": pts})
        if len(out) >= MAX_ROUTES:
            break
    return out


def cost_grid(img):
    """도면 → 비용 지도 {cost, obst, dt, s, size}. 격자 한 칸은 s 화소(긴 변 700칸 안팎)."""
    g = np.asarray(img.convert("L"), np.float32)
    H, W = g.shape
    s = max(1, int(round(max(H, W) / 700)))
    thin = (ndi.gaussian_filter(g, 2.0) - g) > 18          # 가는 어두운 선(회색 바탕 위의 선도 잡는다)
    strong = g < 110                                       # 굵은 선·글자
    h2, w2 = -(-H // s), -(-W // s)

    def pool(m):
        pad = np.zeros((h2 * s, w2 * s), bool)
        pad[:H, :W] = m
        return pad.reshape(h2, s, w2, s).any(axis=(1, 3))

    ps, pt = pool(strong), pool(thin)
    obst = ps | pt
    dt = ndi.distance_transform_edt(~obst).astype(np.float32)
    cost = s * (1.0 + CENTER / (1.0 + dt)) + WALL_PX * ps + LINE_PX * (pt & ~ps)
    return {"cost": cost.astype(np.float32), "obst": obst, "dt": dt, "s": s, "size": (W, H)}


def _snap(cg, cell, r=14):
    """경유점을 장애물(글자·선)에서 DT_END 칸 이상 떨어진 가장 가까운 열린 칸으로 옮긴다(그래야 화살표의 시작·끝이 글자를 가리지 않는다). 그런 칸이 없으면 아무 열린 칸."""
    obst, dt = cg["obst"], cg["dt"]
    h2, w2 = obst.shape
    cx = min(w2 - 1, max(0, cell[0]))
    cy = min(h2 - 1, max(0, cell[1]))
    if dt[cy, cx] >= DT_END:
        return cy, cx
    for need in (DT_END, 1.0):
        for rad in range(1, r + 1):
            y0, y1, x0, x1 = max(0, cy - rad), min(h2, cy + rad + 1), max(0, cx - rad), min(w2, cx + rad + 1)
            sub = dt[y0:y1, x0:x1] >= need
            if sub.any():
                yy, xx = np.nonzero(sub)
                k = int(np.argmin((yy + y0 - cy) ** 2 + (xx + x0 - cx) ** 2))
                return int(yy[k] + y0), int(xx[k] + x0)
        if not obst[cy, cx]:
            return cy, cx
    return cy, cx


def smooth_path(dense, win, pin=None, bad=None, iters=3):
    """촘촘한 경로 점들을 이동 평균(win 개)으로 다듬는다: 큰 흐름은 따르고 잔 지그재그는 편다.
    시작·끝과 pin(참인 점)은 그대로, bad(점 배열 → 불리언)가 참인 곳(다듬어진 점이 장애물 위에 놓임)은 원래 자리로 되돌린다."""
    orig = np.asarray(dense, float).copy()
    n = len(orig)
    if n < 3:
        return orig
    win = max(3, int(win) | 1)
    half = win // 2
    keep = np.zeros(n, bool) if pin is None else np.asarray(pin, bool).copy()
    keep[0] = keep[-1] = True
    pts = orig.copy()
    k = np.ones(win) / win
    for _ in range(iters):
        padded = np.vstack([np.repeat(pts[:1], half, 0), pts, np.repeat(pts[-1:], half, 0)])
        sm = np.stack([np.convolve(padded[:, j], k, mode="valid") for j in (0, 1)], 1)
        sm[keep] = orig[keep]
        if bad is not None:
            b = np.asarray(bad(sm), bool)
            sm[b] = orig[b]
        pts = sm
    return pts


def find_path(cg, pts):
    """화소 점 목록을 차례로 잇는 최소 비용 경로. 반환: (꼭짓점 [(x,y)…] 화소, 통계 {wall_cells, length, detour}).
    wall_cells = 경로가 장애물(벽·글자·선) 칸을 지난 칸 수. detour = 경로 길이 / 점들을 곧게 이은 길이."""
    cost, obst, dt, s = cg["cost"], cg["obst"], cg["dt"], cg["s"]
    cells = [_snap(cg, (int(x // s), int(y // s))) for x, y in pts]
    full = []
    for a, b in zip(cells, cells[1:]):
        idx, _ = route_through_array(cost, a, b, fully_connected=True, geometric=True)
        full.extend(idx if not full else idx[1:])
    wall_cells = int(sum(bool(obst[r, c]) for r, c in full))
    W, H = cg["size"]
    h2, w2 = obst.shape
    dense = np.array([((c + 0.5) * s, (r + 0.5) * s) for r, c in full], float)
    narrow = np.array([bool(dt[r, c] < 1.2) for r, c in full])         # 아주 좁은 곳(문 틈)은 다듬지 않고 그대로 지난다

    def on_obst(sm):
        rr = np.clip((sm[:, 1] // s).astype(int), 0, h2 - 1)
        cc = np.clip((sm[:, 0] // s).astype(int), 0, w2 - 1)
        return obst[rr, cc]

    S = max(W, H)
    sm = smooth_path(dense, win=max(5, int(round(SMOOTH_FRAC * S / s))), pin=narrow, bad=on_obst)
    xy = simplify_path([(min(W - 1.0, float(x)), min(H - 1.0, float(y))) for x, y in sm], eps=max(6.0, 0.010 * S))
    xy = snap_axes(xy, bad=lambda q: bool(on_obst(np.array([q]))[0]))
    length = sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(xy, xy[1:]))
    straight = sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(pts, pts[1:])) or 1.0
    return xy, {"wall_cells": wall_cells, "length": round(length, 1), "detour": round(length / straight, 2)}


def _rdp(pts, eps):
    """Ramer–Douglas–Peucker: 시작·끝을 지키며 eps 화소 안에서 꼭짓점을 줄인다."""
    if len(pts) < 3:
        return list(pts)
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    L = math.hypot(x1 - x0, y1 - y0)
    dmax, k = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = math.hypot(px - x0, py - y0) if L < 1e-9 else abs((x1 - x0) * (y0 - py) - (x0 - px) * (y1 - y0)) / L
        if d > dmax:
            dmax, k = d, i
    if dmax <= eps:
        return [pts[0], pts[-1]]
    return _rdp(pts[:k + 1], eps)[:-1] + _rdp(pts[k:], eps)


def simplify_path(xy, eps, max_pts=MAX_PTS):
    """꼭짓점을 eps 화소 오차 안에서 줄이고, 그래도 max_pts 보다 많으면 오차를 늘려가며 max_pts 이하로. 시작·끝은 그대로."""
    out = _rdp(list(xy), eps)
    while len(out) > max_pts:
        eps *= 1.35
        out = _rdp(list(xy), eps)
    return out


def snap_axes(pts, tol_deg=SNAP_DEG, bad=None):
    """꺾은선의 거의 수평·수직인(tol_deg 안) 구간을 정확한 수평·수직으로 맞춘다 — 건축 도면다운 반듯한 직선. 시작·끝 점은 그대로.
    bad(점 → 불리언)가 참인 자리(벽·글자 위)로는 옮기지 않는다."""
    P = [(float(x), float(y)) for x, y in pts]
    n = len(P)
    if n < 3:
        return P
    tol = math.tan(math.radians(tol_deg))

    def near(a, b):
        dx, dy = abs(b[0] - a[0]), abs(b[1] - a[1])
        if dx < 1e-9 and dy < 1e-9:
            return None
        if dy <= tol * dx:
            return "h"
        if dx <= tol * dy:
            return "v"
        return None

    def move(i, q):
        if bad is None or not bad(q):
            P[i] = q

    for k in range(1, n - 1):
        kind = near(P[k - 1], P[k])
        if kind == "h":
            move(k, (P[k][0], P[k - 1][1]))
        elif kind == "v":
            move(k, (P[k - 1][0], P[k][1]))
    kind = near(P[n - 2], P[n - 1])                                     # 마지막 구간은 끝 점이 고정이라 그 앞 꼭짓점을 맞춘다
    if kind == "h":
        move(n - 2, (P[n - 2][0], P[n - 1][1]))
    elif kind == "v":
        move(n - 2, (P[n - 1][0], P[n - 2][1]))
    return P


def build_arrows(img, routes):
    """경로 계획 → (화살표 목록, 동선 범례, 통계). 화살표 항목은 diagram_vector.vectorize_arrows 와 같은 형식이라 화면에서 그대로 고칠 수 있다.
    범례는 색(=종류)마다 하나, 첫 경로의 라벨. 길을 못 찾은 경로는 건너뛴다."""
    cg = cost_grid(img)
    S = max(img.size)
    arrows, legend, seen = [], [], set()
    st = {"routes": 0, "wall_cells": [], "detour": []}
    for r in routes:
        try:
            xy, ps = find_path(cg, r["points"])
        except Exception:  # noqa: BLE001 — 한 경로의 실패가 나머지를 막지 않게
            continue
        if len(xy) < 2:
            continue
        xy = snap_axes(simplify_path(xy, eps=max(6.0, 0.010 * S)))          # 꼭짓점이 많아도 직선 구간 몇 개로, 거의 수평·수직은 반듯하게
        length = round(sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(xy, xy[1:])), 1)
        arrows.append({"pts": [[round(float(x), 1), round(float(y), 1)] for x, y in xy], "width": round(max(2.5, KIND_WIDTH[r["kind"]] * S), 1), "color": ROUTE_COLORS[r["color"]],
                       "head": "end", "dash": r["dash"], "smooth": False, "band": r["color"], "length": length})
        st["routes"] += 1
        st["wall_cells"].append(ps["wall_cells"])
        st["detour"].append(ps["detour"])
        if r["color"] not in seen:
            seen.add(r["color"])
            legend.append({"color": ROUTE_COLORS[r["color"]], "kind": "flow", "label": r["label"]})
    return arrows, legend, st


def _rgb(hexc):
    return tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))


def draw_arrows(img, arrows, ss=3):
    """합성 그림 위에 화살표를 그린다(흰 테두리 → 선(점선이면 5:3) → 끝 화살촉). ss 배 크게 그려 줄여 매끈하게."""
    base = img.convert("RGB")
    if not arrows:
        return base.copy()
    W, H = base.size
    big = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    jobs = []
    for a in arrows:
        raw = [(x, y) for x, y in a["pts"]]
        if len(raw) < 2:
            continue
        pts = [(x * ss, y * ss) for x, y in raw]
        w = a["width"] * ss
        jobs.append((pts, w, a))
    for pts, w, a in jobs:                                           # 1) 흰 테두리(선 뒤)
        halo = w + 2.2 * ss
        d.line(pts, fill=(255, 255, 255, 235), width=int(round(halo)), joint="curve")
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - halo / 2, p[1] - halo / 2, p[0] + halo / 2, p[1] + halo / 2], fill=(255, 255, 255, 235))
    for pts, w, a in jobs:                                           # 2) 선
        col = _rgb(a["color"]) + (255,)
        if a.get("dash") in ("dashed", "dotted", "dashdot"):
            on, off = (4.2 * w, 2.4 * w) if a["dash"] == "dashed" else (1.2 * w, 2.2 * w)
            pos, draw_on = 0.0, True
            for p, q in zip(pts, pts[1:]):
                L = math.hypot(q[0] - p[0], q[1] - p[1])
                t = 0.0
                while t < L:
                    seg = min((on if draw_on else off) - pos, L - t)
                    if draw_on:
                        x0, y0 = p[0] + (q[0] - p[0]) * t / L, p[1] + (q[1] - p[1]) * t / L
                        x1, y1 = p[0] + (q[0] - p[0]) * (t + seg) / L, p[1] + (q[1] - p[1]) * (t + seg) / L
                        d.line([(x0, y0), (x1, y1)], fill=col, width=int(round(w)))
                    t += seg
                    pos += seg
                    if pos >= (on if draw_on else off) - 1e-6:
                        pos, draw_on = 0.0, not draw_on
        else:
            d.line(pts, fill=col, width=int(round(w)), joint="curve")
            for p in (pts[0], pts[-1]):
                d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=col)
    for pts, w, a in jobs:                                           # 3) 끝 화살촉
        if a.get("head") not in ("end", "both"):
            continue
        p, q = pts[-2], pts[-1]
        ux, uy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(ux, uy) or 1.0
        ux, uy = ux / L, uy / L
        hl, hw = 5.0 * w, 2.9 * w
        bx, by = q[0] - ux * hl, q[1] - uy * hl
        tri = [(q[0] + ux * 0.4 * w, q[1] + uy * 0.4 * w), (bx - uy * hw, by + ux * hw), (bx + uy * hw, by - ux * hw)]
        d.polygon(tri, fill=(255, 255, 255, 235), outline=(255, 255, 255, 235), width=int(round(1.6 * ss)))
        k = 0.8
        tri2 = [(q[0] + ux * 0.4 * w * k, q[1] + uy * 0.4 * w * k), (bx - uy * hw * k, by + ux * hw * k), (bx + uy * hw * k, by - ux * hw * k)]
        d.polygon(tri2, fill=_rgb(a["color"]) + (255,))
    small = big.resize((W, H), Image.LANCZOS)
    out = base.convert("RGBA")
    out.alpha_composite(small)
    return out.convert("RGB")
