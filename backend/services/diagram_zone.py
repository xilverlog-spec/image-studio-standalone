"""구역(방) 칠하기를 코드가 한다 (2026-10-26).

도면 위 표시에서 구역 색칠을 AI 이미지 편집 모델(Qwen)에게 맡기면 ① 경계가 번지고 ② 방과 색의 대응이 자주 틀리고 ③ 회색 도로 같은 원본 색이 어두워졌다(사내 평면도 시험).
그래서 Gemini 는 '방 이름이 적힌 자리·방 전체 범위(사각형)·구역 묶음'만 알려 주고, 칠은 이 모듈이 한다.

  1) parse_zone_plan  Gemini 의 구역 계획(0~1000 상자)을 화소 좌표로 바꾸고 검증한다.
  2) snap_box         방 범위 상자의 네 변을 가까운 벽선에 붙인다.
  3) build_plate      상자 안에서 방 이름과 이어진 칸만(가는 가구선·글자 구멍은 메워서) 구역 색 단색으로 칠한 '곱하기 판'을 만든다.
                      칸이 상자의 15%에도 못 미치면(방 이름이 작은 닫힌 칸에 갇힌 경우) 상자 전체를 칠한다. 칠은 상자 밖으로 나가지 못하므로 문·큰 개구부로 새도 방 둘레에 갇힌다.

판(plate)은 H×W×3 실수(0~1)로, 칠하지 않은 곳은 1.0 이라 원본에 곱해도 원본 그대로다(diagram_edit.composite).
"""
import numpy as np
from scipy import ndimage as ndi

# 구역 색(흰 종이 위에 곱했을 때 보이는 색). 색 띠(diagram_edit._HUE_BANDS)와 같은 이름이라 범례·층 나누기가 그대로 읽는다.
# 사내 참고사례의 옅은 면 평균(주황 #EED0AD, 파랑 #A6C9E8)에 가깝게 맞춘 단색.
ZONE_FILL_RGB = {
    "red": (242, 196, 192),
    "orange": (243, 211, 166),
    "yellow": (245, 234, 158),
    "green": (200, 229, 184),
    "blue": (178, 211, 239),
    "purple": (216, 200, 235),
}
MAX_ZONES = 5
LABEL_MAX = 20
MAX_ROOM_FRAC = 0.5          # 한 방의 범위가 그림의 이 비율보다 크면 믿지 않는다(그림 전체를 가리킨 상자)
MIN_BOX_PX = 4
DARK_THR = 170               # 이보다 어두운 화소를 벽·선으로 본다(사내 평면도의 이중 벽선은 회색 150~170 이라 120 으로는 놓친다)
MIN_COMPONENT_FRAC = 0.15    # 방 이름과 이어진 칸이 상자의 이 비율에도 못 미치면(방 이름이 작은 닫힌 칸 안에 갇힌 경우) 상자 전체를 칠한다. 상자가 방보다 크게 잡힌 경우(칸이 상자의 50% 남짓)는 칸만 칠해야 넘치지 않는다
SNAP_MIN_DARK = 0.45         # 벽선으로 붙이려면 그 줄의 이 비율 이상이 어두워야 한다
FAINT_THR = 205              # 가까운 곳(±_near)에서는 이 밝기보다 어두운 옅은 선도 벽선으로 본다


def _box(v, W, H):
    """[ymin, xmin, ymax, xmax] (0~1000) → (x0, y0, x1, y1) 화소. 뒤집혔거나 너무 작으면 None."""
    if not isinstance(v, (list, tuple)) or len(v) != 4:
        return None
    try:
        y0, x0, y1, x1 = [min(1000.0, max(0.0, float(t))) for t in v]
    except (TypeError, ValueError):
        return None
    if y1 <= y0 or x1 <= x0:
        return None
    b = (int(round(x0 * W / 1000)), int(round(y0 * H / 1000)), int(round(x1 * W / 1000)), int(round(y1 * H / 1000)))
    if b[2] - b[0] < MIN_BOX_PX or b[3] - b[1] < MIN_BOX_PX:
        return None
    return b


def parse_zone_plan(obj, size):
    """Gemini 의 {"zones":[{color,label,rooms:[{name,label_box_2d,room_box_2d}]}]} → [{color,label,rooms:[{name,label_box,room_box}]}] (화소 상자).
    모르는 색·뒤집힌 상자·그림 전체를 덮는 상자는 버리고, 같은 색은 한 구역으로 합치며, 구역은 최대 MAX_ZONES 개. 쓸 게 없으면 []."""
    W, H = size
    zs = obj.get("zones") if isinstance(obj, dict) else None
    if not isinstance(zs, list):
        return []
    out, order = {}, []
    for z in zs:
        if not isinstance(z, dict):
            continue
        color = str(z.get("color", "")).strip().lower()
        if color not in ZONE_FILL_RGB or not isinstance(z.get("rooms"), list):
            continue
        rooms = []
        for r in z["rooms"]:
            if not isinstance(r, dict):
                continue
            rb = _box(r.get("room_box_2d"), W, H)
            if rb is None or (rb[2] - rb[0]) * (rb[3] - rb[1]) > MAX_ROOM_FRAC * W * H:
                continue
            lb = _box(r.get("label_box_2d"), W, H) or ((rb[0] + rb[2]) // 2 - 2, (rb[1] + rb[3]) // 2 - 2, (rb[0] + rb[2]) // 2 + 2, (rb[1] + rb[3]) // 2 + 2)
            rooms.append({"name": str(r.get("name", ""))[:40], "label_box": lb, "room_box": rb})
        if not rooms:
            continue
        if color in out:
            out[color]["rooms"].extend(rooms)
        else:
            out[color] = {"color": color, "label": (str(z.get("label") or "구역").strip() or "구역")[:LABEL_MAX], "rooms": rooms}
            order.append(color)
    return [out[c] for c in order][:MAX_ZONES]


def dark_mask(img):
    """PIL 이미지 → 벽·선(어두운 화소) 불리언 판."""
    return np.asarray(img.convert("L"), np.float32) < DARK_THR


def _tol(shape):
    """벽선에 붙이는 허용 거리(화소). Gemini 의 방 범위 상자는 흐린 벽 쪽에서 20~25px 어긋나기도 해서 넉넉히(1820px 도면에서 28px) 둔다."""
    return max(12, int(round(0.0155 * max(shape))))


def _near(shape):
    return max(6, int(round(0.0045 * max(shape))))


def snap_box(dark, box, tol=None, faint=None):
    """방 범위 상자(x0,y0,x1,y1)의 네 변을 벽선에 붙인다. 벽이 없으면 그 변은 그대로.
    1단계(faint 가 있을 때): 가까운 곳(±_near)에서 옅은 선까지 포함해 그 줄의 45% 이상이 선인 곳 가운데 가장 가까운 선.
    2단계: tol 화소 안에서 뚜렷한 벽선(45% 이상 어두움, 가장 뚜렷한 줄의 70% 이상) 가운데 가장 가까운 선."""
    H, W = dark.shape
    x0, y0, x1, y1 = box
    if x1 - x0 < 20 or y1 - y0 < 20:
        return box
    tol = tol or _tol(dark.shape)
    near = _near(dark.shape)
    ys = slice(max(0, y0 + 6), max(max(0, y0 + 7), min(H, y1 - 5)))
    xs = slice(max(0, x0 + 6), max(max(0, x0 + 7), min(W, x1 - 5)))

    def pick(v, hi, colwise):
        def fr_of(mask, c):
            c = min(hi, max(0, c))
            return float(mask[ys, c].mean()) if colwise else float(mask[c, xs].mean())

        def best(mask, r):
            cands = range(max(0, v - r), min(hi, v + r) + 1)
            fr = {c: fr_of(mask, c) for c in cands}
            top = max(fr.values()) if fr else 0.0
            if top < SNAP_MIN_DARK:
                return None
            return min((c for c in cands if fr[c] >= max(SNAP_MIN_DARK, 0.7 * top)), key=lambda c: (abs(c - v), -fr[c]))

        if faint is not None:
            b = best(faint, near)
            if b is not None:
                return b
        b = best(dark, tol)
        return v if b is None else b

    return pick(x0, W - 1, True), pick(y0, H - 1, False), pick(x1, W - 1, True), pick(y1, H - 1, False)


def _closing(mask, k):
    """k×k 사각 구조로 닫기(벽의 작은 틈을 메움). 분리형 필터라 빠르다."""
    m = mask.astype(np.uint8)
    return ndi.minimum_filter(ndi.maximum_filter(m, size=k), size=k).astype(bool)


def _room_mask(dark, box, label_box):
    """상자 안에서 방 이름 자리와 이어진 칸(구멍 메움). 반환: (불리언 판(상자 크기), 상자 전체로 대신했는가). 판이 None 이면 칠할 수 없음."""
    H, W = dark.shape
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W - 1, x1), min(H - 1, y1)
    if x1 - x0 < MIN_BOX_PX or y1 - y0 < MIN_BOX_PX:
        return None, 0, (x0, y0, x1, y1)
    crop = dark[y0:y1 + 1, x0:x1 + 1]
    full = np.ones(crop.shape, bool)
    k = 2 * max(3, int(round(0.0035 * max(H, W)))) + 1
    free = ~_closing(crop, k)
    lab, n = ndi.label(free)
    lx0, ly0, lx1, ly1 = label_box
    sub = lab[max(0, ly0 - y0):max(0, ly1 - y0) + 1, max(0, lx0 - x0):max(0, lx1 - x0) + 1]
    ids, cnt = np.unique(sub[sub > 0], return_counts=True) if sub.size else (np.array([]), np.array([]))
    if not len(ids):
        return full, 1, (x0, y0, x1, y1)
    m = ndi.binary_fill_holes(lab == ids[int(np.argmax(cnt))])
    if m.mean() < MIN_COMPONENT_FRAC:
        return full, 1, (x0, y0, x1, y1)
    return m, 0, (x0, y0, x1, y1)


def build_plate(original, zones):
    """구역 계획 → (곱하기 판 H×W×3 0~1, 구역 범례 [{color:'#RRGGBB', kind:'zone', label}], 통계 {rooms, filled, rect_fallback}).
    범례는 방을 하나라도 칠한 구역만, 구역 순서대로. 방이 겹치면 먼저 칠한 것이 이긴다(뒤 방은 칠해진 곳을 덮지 않는다)."""
    img = original.convert("RGB")
    W, H = img.size
    dark = dark_mask(img)
    faint = np.asarray(img.convert("L"), np.float32) < FAINT_THR
    plate = np.ones((H, W, 3), np.float32)
    taken = np.zeros((H, W), bool)
    legend = []
    st = {"rooms": 0, "filled": 0, "rect_fallback": 0}
    for z in zones:
        rgb = ZONE_FILL_RGB[z["color"]]
        col = np.array(rgb, np.float32) / 255
        ok = 0
        for r in z["rooms"]:
            st["rooms"] += 1
            m, fb, (x0, y0, x1, y1) = _room_mask(dark, snap_box(dark, r["room_box"], faint=faint), r["label_box"])
            if m is None:
                continue
            sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
            put = m & ~taken[sl]
            plate[sl][put] = col
            taken[sl] |= m
            st["filled"] += 1
            st["rect_fallback"] += fb
            ok += 1
        if ok:
            legend.append({"color": "#%02X%02X%02X" % rgb, "kind": "zone", "label": z["label"]})
    return plate, legend, st
