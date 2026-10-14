"""손그림 스타일 합성 스케치 생성기: 손떨림·펜 색·빗금 코어·빨간 눈금·화살표·호·OPEN 글자를 그리고, 정답(도형·화살표·호)을 JSON 으로 저장한다.
좌표 정답은 앱 좌표계(긴 변 = 100)로 저장한다."""
import json, math, random, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'output', 'sketch_synth')  # 이미지·정답은 output/(git 제외)에 만든다
os.makedirs(OUT, exist_ok=True)
W, H = 1200, 1000
SS = 2  # 슈퍼샘플

PAPER = {'green': (214, 226, 176), 'cream': (240, 236, 214), 'white': (244, 244, 240)}
PEN = {'blue': (34, 42, 120), 'black': (30, 30, 34), 'red': (205, 40, 40)}


class Pen:
    def __init__(self, seed, paper='green'):
        self.rng = random.Random(seed)
        self.img = Image.new('RGB', (W * SS, H * SS), PAPER[paper])
        arr = np.asarray(self.img).astype(float)
        nrng = np.random.default_rng(seed)
        arr += nrng.normal(0, 3.0, arr.shape[:2])[..., None]
        yy, xx = np.mgrid[0:H * SS, 0:W * SS]
        arr *= (1 - 0.06 * ((xx / (W * SS) - 0.5) ** 2 + (yy / (H * SS) - 0.5) ** 2))[..., None]  # 사진 같은 가장자리 어둡기
        self.img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        self.d = ImageDraw.Draw(self.img)

    def noise(self, n, amp, freq=(1.0, 2.3, 4.1)):
        ph = [self.rng.random() * 6.28 for _ in freq]
        return [amp * sum(math.sin(2 * math.pi * f * t / max(1, n - 1) + p) / (i + 1) for i, (f, p) in enumerate(zip(freq, ph))) / 1.6 for t in range(n)]

    def stroke(self, pts, color, width=3.2, wob=2.4):
        """pts: 꺾은선(px). 손떨림을 주어 그린다."""
        c = PEN[color] if isinstance(color, str) else color
        dense = []
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0); n = max(2, int(L / 14))
            for k in range(n):
                dense.append((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n))
        dense.append(pts[-1])
        nz = self.noise(len(dense), wob); nz2 = self.noise(len(dense), wob)
        pp = [(x + a, y + b) for (x, y), a, b in zip(dense, nz, nz2)]
        for i in range(len(pp) - 1):
            w = max(1.5, width + self.rng.uniform(-0.7, 0.7))
            self.d.line([(p[0] * SS, p[1] * SS) for p in pp[i:i + 2]], fill=c, width=int(w * SS))
            r = w * SS / 2
            self.d.ellipse([pp[i][0] * SS - r, pp[i][1] * SS - r, pp[i][0] * SS + r, pp[i][1] * SS + r], fill=c)
        return pp

    def line(self, p0, p1, color, width=3.2, over=6):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy) or 1
        a = (p0[0] - dx / L * self.rng.uniform(0, over), p0[1] - dy / L * self.rng.uniform(0, over))
        b = (p1[0] + dx / L * self.rng.uniform(0, over), p1[1] + dy / L * self.rng.uniform(0, over))
        return self.stroke([a, b], color, width)

    def rect(self, r, color, width=3.4, skew=0.012):
        x0, y0, x1, y1 = r; s = lambda v: v * self.rng.uniform(-skew, skew)
        q = [(x0 + s(x1 - x0), y0 + s(y1 - y0)), (x1 + s(x1 - x0), y0 + s(y1 - y0)), (x1 + s(x1 - x0), y1 + s(y1 - y0)), (x0 + s(x1 - x0), y1 + s(y1 - y0))]
        for i in range(4):
            self.line(q[i], q[(i + 1) % 4], color, width)

    def hatch(self, r, color, vertical=False, gap=9):
        x0, y0, x1, y1 = r
        if vertical:
            x = x0 + 4
            while x < x1 - 2:
                self.stroke([(x + self.rng.uniform(-1, 1), y0 + 3), (x + self.rng.uniform(-1, 1), y1 - 3)], color, 2.4, 0.8); x += gap * self.rng.uniform(0.7, 1.2)
        else:
            k = -(y1 - y0)
            while k < (x1 - x0):
                a = (x0 + k, y1); b = (x0 + k + (y1 - y0), y0)
                # 사각형 안으로 잘라낸다
                ax, ay = a; bx, by = b
                t0, t1 = 0.0, 1.0
                for p, q, lo, hi in ((ax, bx - ax, x0, x1), (ay, by - ay, y0, y1)):
                    if abs(q) < 1e-9:
                        if p < lo or p > hi: t0, t1 = 1, 0
                    else:
                        ta, tb = (lo - p) / q, (hi - p) / q
                        if ta > tb: ta, tb = tb, ta
                        t0, t1 = max(t0, ta), min(t1, tb)
                if t0 < t1:
                    self.stroke([(ax + (bx - ax) * t0, ay + (by - ay) * t0), (ax + (bx - ax) * t1, ay + (by - ay) * t1)], color, 2.4, 0.8)
                k += gap * self.rng.uniform(0.8, 1.3)

    def ticks(self, p0, p1, outward, color='red', gap=13, size=13):
        """벽을 따라 붙는 톱니 모양 빨간 눈금. outward = (dx,dy) 바깥 방향"""
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
        t = 0; pts = [p0]; flip = 1
        while t < L:
            t += gap * self.rng.uniform(0.7, 1.2)
            base = (p0[0] + ux * min(t, L), p0[1] + uy * min(t, L))
            pts.append((base[0] + outward[0] * size * flip * self.rng.uniform(0.5, 1.0), base[1] + outward[1] * size * flip * self.rng.uniform(0.5, 1.0)))
            flip = 1 if flip < 0.5 else 0.0
        self.stroke(pts, color, 2.6, 0.6)

    def arrow(self, tail, tip, bulge=0.0, color='red', width=3.2):
        mx, my = (tail[0] + tip[0]) / 2, (tail[1] + tip[1]) / 2
        dx, dy = tip[0] - tail[0], tip[1] - tail[1]; L = math.hypot(dx, dy)
        nx, ny = -dy / L, dx / L
        c = (mx + nx * bulge * L, my + ny * bulge * L)
        pts = [((1 - t) ** 2 * tail[0] + 2 * (1 - t) * t * c[0] + t * t * tip[0], (1 - t) ** 2 * tail[1] + 2 * (1 - t) * t * c[1] + t * t * tip[1]) for t in [i / 14 for i in range(15)]]
        pp = self.stroke(pts, color, width, 1.6)
        a0 = math.atan2(pts[-1][1] - pts[-3][1], pts[-1][0] - pts[-3][0])
        for s in (-1, 1):
            ang = a0 + math.pi + s * math.radians(27)
            self.stroke([pts[-1], (pts[-1][0] + math.cos(ang) * 26, pts[-1][1] + math.sin(ang) * 26)], color, width, 0.5)

    def arc(self, p0, p1, bulge, color='red', width=3.0):
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
        c = (mx + nx * bulge * L * 2, my + ny * bulge * L * 2)
        pts = [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]) for t in [i / 16 for i in range(17)]]
        self.stroke(pts, color, width, 1.4)
        return pts

    def text(self, s, xy, color='red', size=46):
        for fn in ('segoepr.ttf', 'ariblk.ttf', 'arial.ttf'):
            try:
                f = ImageFont.truetype('C:/Windows/Fonts/' + fn, size * SS); break
            except Exception:
                f = None
        layer = Image.new('L', self.img.size, 0); ImageDraw.Draw(layer).text((xy[0] * SS, xy[1] * SS), s, font=f, fill=255, anchor='mm')
        layer = layer.rotate(self.rng.uniform(-4, 4), center=(xy[0] * SS, xy[1] * SS))
        self.img.paste(Image.new('RGB', self.img.size, PEN[color]), (0, 0), layer.point(lambda v: 255 if v > 90 else 0))

    def save(self, path):
        im = self.img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
        im.save(path)


def app(p):  # px → 앱 좌표(긴 변 100)
    return [round(p[0] / max(W, H) * 100, 2), round(p[1] / max(W, H) * 100, 2)]
def appr(r):
    return [round(r[0] / max(W, H) * 100, 2), round(r[1] / max(W, H) * 100, 2), round(r[2] / max(W, H) * 100, 2), round(r[3] / max(W, H) * 100, 2)]


LAYOUTS = {
    # 이름: (제목, 펜색, 종이, 슬래브들, 코어들, 칸막이들, 눈금들, 화살표들, 호들, 글자들)
    'A_panel_cross': dict(pen='blue', paper='green',
        slabs=[(250, 470, 640, 600), (560, 230, 760, 780)], cores=[(430, 400, 540, 475), (560, 420, 650, 600)],
        parts=[((470, 475), (470, 595))], ticks=[((560, 235), (560, 775), (-1, 0)), ((755, 235), (755, 775), (1, 0)), ((255, 600), (640, 600), (0, 1))],
        arrows=[((590, 330), (540, 150), 0.1), ((730, 340), (780, 160), -0.1), ((580, 720), (560, 880), 0.05), ((740, 690), (850, 860), -0.15), ((330, 470), (170, 400), 0.1)],
        arcs=[((560, 130), (780, 130), -0.18), ((420, 700), (420, 880), 0.18)], texts=[('OPEN', (660, 70)), ('OPEN', (110, 560))]),
    'B_single_slab': dict(pen='black', paper='cream',
        slabs=[(250, 380, 950, 560)], cores=[(560, 400, 640, 540)], parts=[((420, 385), (420, 555)), ((780, 385), (780, 555))],
        ticks=[((255, 385), (255, 555), (-1, 0)), ((945, 385), (945, 555), (1, 0))],
        arrows=[((250, 470), (90, 470), 0.0), ((950, 470), (1110, 470), 0.0), ((400, 380), (380, 220), 0.1), ((700, 560), (720, 730), -0.1)],
        arcs=[((180, 330), (180, 610), -0.2)], texts=[('OPEN', (110, 700))]),
    'C_tower': dict(pen='blue', paper='white',
        slabs=[(400, 300, 800, 700)], cores=[(540, 440, 660, 560)], parts=[],
        ticks=[((405, 305), (795, 305), (0, -1)), ((405, 695), (795, 695), (0, 1)), ((405, 305), (405, 695), (-1, 0)), ((795, 305), (795, 695), (1, 0))],
        arrows=[((600, 300), (600, 130), 0.0), ((600, 700), (600, 880), 0.0), ((400, 500), (230, 500), 0.0), ((800, 500), (970, 500), 0.0)],
        arcs=[], texts=[('OPEN', (600, 80))]),
    'D_Lshape': dict(pen='blue', paper='green',
        slabs=[(200, 300, 800, 430), (200, 430, 330, 800)], cores=[(200, 300, 330, 430)], parts=[((560, 305), (560, 425))],
        ticks=[((205, 800), (330, 800), (0, 1)), ((800, 305), (800, 430), (1, 0)), ((335, 430), (335, 795), (1, 0))],
        arrows=[((500, 300), (480, 150), 0.1), ((800, 370), (980, 370), 0.0), ((335, 650), (520, 650), 0.0), ((270, 800), (270, 930), 0.0)],
        arcs=[((420, 90), (700, 90), -0.15)], texts=[('OPEN', (880, 460))]),
    'E_courtyard': dict(pen='black', paper='cream',
        slabs=[(200, 250, 520, 750), (680, 250, 1000, 750)], cores=[(420, 420, 520, 540), (680, 420, 780, 540)], parts=[((360, 255), (360, 745))],
        ticks=[((205, 255), (205, 745), (-1, 0)), ((995, 255), (995, 745), (1, 0))],
        arrows=[((205, 500), (70, 500), 0.0), ((995, 500), (1130, 500), 0.0), ((600, 250), (600, 110), 0.0), ((600, 750), (600, 900), 0.0)],
        arcs=[((140, 200), (140, 800), -0.12)], texts=[('OPEN', (600, 60)), ('OPEN', (600, 950))]),
    'F_tilt_pair': dict(pen='blue', paper='white',
        slabs=[(180, 180, 520, 420), (680, 560, 1020, 800)], cores=[(430, 340, 520, 420), (680, 560, 770, 640)], parts=[((350, 185), (350, 415))],
        ticks=[((185, 180), (515, 180), (0, -1)), ((685, 800), (1015, 800), (0, 1))],
        arrows=[((350, 180), (350, 60), 0.0), ((850, 800), (850, 930), 0.0), ((520, 300), (640, 300), 0.0), ((680, 700), (560, 700), 0.0)],
        arcs=[((200, 100), (500, 100), -0.15)], texts=[('OPEN', (350, 40))]),
}


def build(name, seed):
    L = LAYOUTS[name]; p = Pen(seed, L['paper']); R = random.Random(seed + 7)
    for r in L['slabs']: p.rect(r, L['pen'])
    for a, b in L['parts']: p.line(a, b, L['pen'], 2.4)
    for r in L['cores']:
        p.hatch(r, L['pen'], vertical=R.random() < 0.5); p.rect(r, L['pen'], 3.0)
    for a, b, o in L['ticks']: p.ticks(a, b, o)
    for t, tip, bu in L['arrows']: p.arrow(t, tip, bu)
    arcs = [p.arc(a, b, bu) for a, b, bu in L['arcs']]
    for s, xy in L['texts']: p.text(s, xy)
    p.save(f'{OUT}/syn_{name}.png')
    truth = {
        'blocks': [{'kind': 'slab', 'rect': appr(r)} for r in L['slabs']] + [{'kind': 'core', 'rect': appr(r)} for r in L['cores']],
        'arrows': [{'tail': app(t), 'tip': app(tip)} for t, tip, _ in L['arrows']],
        'arcs': [{'pts': [app(q[0]), app(q[len(q) // 2]), app(q[-1])]} for q in arcs],
        'parts': [{'a': app(a), 'b': app(b)} for a, b in L['parts']],
    }
    json.dump(truth, open(f'{OUT}/syn_{name}.json', 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    for i, n in enumerate(LAYOUTS):
        build(n, 100 + i)
    print('ok', list(LAYOUTS))
