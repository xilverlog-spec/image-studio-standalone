"""촬영 조건 강건성 시험: 합성 손그림에 조명 얼룩·그림자·잡음·JPEG·저해상도·연필(회색)·약간의 기울어짐을 입혀 잉크 보정이 버티는지 잰다.
AI 읽기는 정답에 '실제 AI 오류 수준'의 잡음(경계 ±3~6, 화살표 꼬리 크게 어긋남, 가끔 화살표 누락)을 섞은 가짜 읽기로 대신해 AI 호출 없이 빠르게 돌린다.
사용: python scripts/regression/sketch_synth/robustness.py [--seeds 3]"""
import io, json, math, os, random, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'backend')); sys.path.insert(0, HERE)
import gen_sketches as G
import check_refine as C
from services import sketch_refine as sr

NAMES = list(G.LAYOUTS)


def sim_ai_read(truth, rng):
    """정답 + 실제 AI 오류 수준의 잡음 → 앞단(읽기) 결과 모양의 dict."""
    blocks = []
    for i, tb in enumerate(truth['blocks']):
        r = tb['rect']; core = tb['kind'] == 'core'
        # 판은 가끔 한쪽 변이 크게(7) 어긋나고, 나머지 변은 ±3 안팎
        j = lambda big=False: rng.uniform(-3, 3) + (rng.choice([-7, 7]) if big and rng.random() < 0.25 else 0)
        rr = [r[0] + j(), r[1] + j(True), r[2] + j(), r[3] + j(True)]
        if rr[2] - rr[0] < 3: rr[2] = rr[0] + 3
        if rr[3] - rr[1] < 3: rr[3] = rr[1] + 3
        blocks.append({'id': f'b{i + 1}', 'hatched': core, 'rect': rr, 'color': 'blue'})
    lines = []
    for i, a in enumerate(truth['arrows']):
        if rng.random() < 0.1:
            continue  # 가끔 화살표 누락
        tail = [a['tail'][0] + rng.uniform(-8, 8), a['tail'][1] + rng.uniform(-8, 8)]  # 꼬리는 크게 어긋난다
        tip = [a['tip'][0] + rng.uniform(-3, 3), a['tip'][1] + rng.uniform(-3, 3)]
        lines.append({'id': f'l{len(lines) + 1}', 'kind': 'arrow', 'pts': [tail, tip], 'color': 'red'})
    for a in truth['arcs']:
        p = a['pts']
        lines.append({'id': f'l{len(lines) + 1}', 'kind': 'arc', 'pts': [[q[0] + rng.uniform(-4, 4), q[1] + rng.uniform(-4, 4)] for q in p], 'color': 'red'})
    return {'blocks': blocks, 'lines': lines}


def photometric(img, kind, rng):
    a = np.asarray(img).astype(float); H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    if kind == 'clean':
        pass
    elif kind == 'gradient_light':   # 한쪽이 어두운 조명
        a *= (0.62 + 0.45 * (xx / W))[..., None]
    elif kind == 'shadow':           # 손·휴대폰 그림자(비스듬한 띠)
        m = ((xx - 0.45 * W) * 0.6 + (yy - 0.3 * H) * 0.8)
        band = np.where((m > 0) & (m < 0.35 * W), 0.62, 1.0)
        band = np.asarray(Image.fromarray((band * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))).astype(float) / 255.0  # 그림자 가장자리만 부드럽게(선은 선명하게 둔다)
        a *= band[..., None]
    elif kind == 'noise':
        a += np.random.default_rng(rng.randint(0, 9999)).normal(0, 12, a.shape)
    elif kind == 'warm':             # 노란 실내 조명
        a *= np.array([1.05, 0.98, 0.78])
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if kind == 'blur_light':         # 초점이 약간 나간 사진
        out = out.filter(ImageFilter.GaussianBlur(1.6))
    if kind == 'blur_heavy':         # 초점이 많이 나가거나 손 떨림
        out = out.filter(ImageFilter.GaussianBlur(3.2))
    if kind == 'lowres':
        out = out.resize((W // 2, H // 2), Image.LANCZOS).resize((W, H), Image.BILINEAR)
    if kind == 'jpeg':
        buf = io.BytesIO(); out.save(buf, 'JPEG', quality=35); out = Image.open(buf).convert('RGB')
    if kind == 'pencil':             # 파랑·검정이 연한 회색 연필로, 빨강은 그대로
        b = np.asarray(out).astype(float); blue = (b[..., 2] > b[..., 0] + 25) & (b[..., 2] > 60) | ((b.sum(-1) < 170))
        b[blue] = np.array([105, 105, 112]) + (b[blue] - b[blue].mean(0)) * 0.15
        out = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8))
    return out


def rotate(img, truth, deg):
    """이미지를 deg 만큼 돌리고 정답 좌표도 같이 돌린다(도형은 돌린 모서리의 바깥 상자로 근사)."""
    W, H = img.size; cx, cy = W / 2, H / 2; th = math.radians(deg)
    out = img.rotate(-deg, resample=Image.BICUBIC, center=(cx, cy), fillcolor=tuple(int(v) for v in np.asarray(img)[5, 5]))
    S = max(W, H) / 100.0
    def tr(p):
        x, y = p[0] * S - cx, p[1] * S - cy
        return [round((cx + x * math.cos(th) - y * math.sin(th)) / S, 2), round((cy + x * math.sin(th) + y * math.cos(th)) / S, 2)]
    t = json.loads(json.dumps(truth))
    for b in t['blocks']:
        r = b['rect']; cs = [tr([r[0], r[1]]), tr([r[2], r[1]]), tr([r[2], r[3]]), tr([r[0], r[3]])]
        b['rect'] = [min(c[0] for c in cs), min(c[1] for c in cs), max(c[0] for c in cs), max(c[1] for c in cs)]
    for a in t['arrows']: a['tail'], a['tip'] = tr(a['tail']), tr(a['tip'])
    for a in t['arcs']: a['pts'] = [tr(p) for p in a['pts']]
    for p in t['parts']: p['a'], p['b'] = tr(p['a']), tr(p['b'])
    return out, t


def shrink(img, truth, sc):
    """그림을 sc 배로 줄여 같은 크기 종이 한가운데(약간 비껴서)에 놓는다. 정답 좌표도 같이 옮긴다."""
    W, H = img.size; S = max(W, H) / 100.0
    small = img.resize((int(W * sc), int(H * sc)), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), tuple(int(v) for v in np.asarray(img)[5, 5]))
    ox, oy = int((W - small.width) * 0.62), int((H - small.height) * 0.35)
    canvas.paste(small, (ox, oy))
    tr = lambda p: [round((p[0] * S * sc + ox) / S, 2), round((p[1] * S * sc + oy) / S, 2)]
    t = json.loads(json.dumps(truth))
    for b in t['blocks']:
        r = b['rect']; a, z = tr([r[0], r[1]]), tr([r[2], r[3]]); b['rect'] = [a[0], a[1], z[0], z[1]]
    for a in t['arrows']: a['tail'], a['tip'] = tr(a['tail']), tr(a['tip'])
    for a in t['arcs']: a['pts'] = [tr(p) for p in a['pts']]
    for p in t['parts']: p['a'], p['b'] = tr(p['a']), tr(p['b'])
    return canvas, t


def map_truth(truth, info, orig_size):
    """정리 전 이미지 기준 정답을 정리된 이미지 기준으로 옮긴다(자르기·배율만 — 회전은 info['angle'] 로 따로)."""
    W0, H0 = orig_size; S0 = max(W0, H0) / 100.0
    ow, oh = info['out_size']; S1 = max(ow, oh) / 100.0
    cx0, cy0 = (info['crop'][0], info['crop'][1]) if info['crop'] else (0, 0)
    sc = info['scale']
    ang = math.radians(info.get('angle', 0.0)); Wr, Hr = info.get('rot_size', [W0, H0])
    def rot(px, py):  # PIL rotate(angle, expand=True): 반시계(+)로 중심 기준 회전 후 새 캔버스 중심으로 옮김
        dx, dy = px - W0 / 2, py - H0 / 2
        return Wr / 2 + dx * math.cos(ang) + dy * math.sin(ang), Hr / 2 - dx * math.sin(ang) + dy * math.cos(ang)
    def tr(p):
        x, y = rot(p[0] * S0, p[1] * S0)
        return [round(((x - cx0) * sc) / S1, 2), round(((y - cy0) * sc) / S1, 2)]
    t = json.loads(json.dumps(truth))
    for b in t['blocks']:
        r = b['rect']; a, z = tr([r[0], r[1]]), tr([r[2], r[3]]); b['rect'] = [a[0], a[1], z[0], z[1]]
    for a in t['arrows']: a['tail'], a['tip'] = tr(a['tail']), tr(a['tip'])
    for a in t['arcs']: a['pts'] = [tr(p) for p in a['pts']]
    for p_ in t['parts']: p_['a'], p_['b'] = tr(p_['a']), tr(p_['b'])
    return t


CONDITIONS = [('clean', 0), ('gradient_light', 0), ('shadow', 0), ('noise', 0), ('warm', 0), ('lowres', 0), ('jpeg', 0), ('pencil', 0), ('blur_light', 0), ('blur_heavy', 0), ('clean', 1), ('clean', 2), ('clean', 4), ('shadow', -3), ('small70', 0), ('small50', 0), ('small35', 0)]


def main():
    seeds = 3
    if '--seeds' in sys.argv: seeds = int(sys.argv[sys.argv.index('--seeds') + 1])
    for i, n in enumerate(NAMES): G.build(n, 100 + i)
    only = os.environ.get('ONLY')
    conds = [c for c in CONDITIONS if not only or c[0] in only.split(',')]
    print(f"{'조건':22s} 도형IoU 화살표(재현) 꼬리오차 오검출 호 칸막이")
    summary = {}
    for kind, deg in conds:
        rows = []
        for n in NAMES:
            truth0 = json.load(open(os.path.join(G.OUT, f'syn_{n}.json'), encoding='utf-8'))
            base = Image.open(os.path.join(G.OUT, f'syn_{n}.png')).convert('RGB')
            for sd in range(seeds):
                rng = random.Random(1000 * sd + hash(n) % 997)
                if kind.startswith('small'):
                    img, truth = shrink(base, truth0, int(kind[5:]) / 100.0)
                else:
                    img, truth = (rotate(base, truth0, deg) if deg else (base, truth0))
                img = photometric(img, 'clean' if kind.startswith('small') else kind, rng)
                buf = io.BytesIO(); img.save(buf, 'PNG'); data = buf.getvalue()
                if os.environ.get('PREP'):
                    from services import sketch_prepare as SP
                    data, info = SP.prepare(data)
                    truth = map_truth(truth, info, img.size)
                fused = sim_ai_read(truth, rng)
                res = sr.refine(data, [{'id': b['id'], 'rect': b['rect'], 'hatched': b['hatched']} for b in fused['blocks']],
                                [{'id': l['id'], 'pts': l['pts'], 'color': l['color']} for l in fused['lines'] if l['kind'] == 'arrow'],
                                [{'id': l['id'], 'pts': l['pts'], 'color': l['color']} for l in fused['lines'] if l['kind'] == 'arc'])
                rows.append(C.score(C.apply(fused, res), truth))
        iou = sum(r['iou'] for r in rows) / len(rows)
        ah = sum(r['hit'] for r in rows); at = sum(r['n_truth_arrow'] for r in rows); fp = sum(max(0, r['n_arrow'] - r['hit']) for r in rows)
        tails = [t for r in rows for t in r['tails']]; tm = sum(tails) / len(tails) if tails else float('nan')
        ac = sum(r['arc_hit'] for r in rows); at2 = sum(r['arc_total'] for r in rows); ph = sum(r['p_hit'] for r in rows); pt = sum(r['p_total'] for r in rows)
        label = f'{kind}{"+%d°" % deg if deg else ""}'
        summary[label] = (iou, ah / at, tm)
        print(f"{label:22s} {iou:.2f}   {ah:3d}/{at:3d}   {tm:5.1f}   {fp:3d}   {ac}/{at2}  {ph}/{pt}")
    return summary


if __name__ == '__main__':
    main()
