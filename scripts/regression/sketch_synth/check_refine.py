"""손스케치 잉크 보정(backend/services/sketch_refine.py) 회귀 점검.
합성 손그림 6장(gen_sketches.py)을 만들고, 저장해 둔 AI 읽기 결과(ai_reads/)에 보정을 적용해 정답과 비교한다. AI 를 부르지 않아 빠르고 무료다.
사용: python scripts/regression/sketch_synth/check_refine.py          (임계값 미달이면 종료 코드 1)
옵션: --drop-all  AI 화살표·호를 모두 지우고 잉크만으로 찾는 능력을 잰다 / --drop-two  앞의 화살표 2개를 지운다"""
import json, math, os, sys, warnings
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'backend'))
sys.path.insert(0, HERE)
import gen_sketches as G
from services import sketch_refine as sr

NAMES = list(G.MAIN)
OUT = G.OUT


def iou(a, c):
    ix = max(0, min(a[2], c[2]) - max(a[0], c[0])); iy = max(0, min(a[3], c[3]) - max(a[1], c[1])); i = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (c[2] - c[0]) * (c[3] - c[1]) - i
    return i / u if u > 0 else 0


def d(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


def apply(read, res):
    rc = res.get('reclass', {})
    blocks = [dict(b, rect=res['blocks'].get(b['id'], b['rect']), hatched=rc.get(b['id'], b['hatched'])) for b in read['blocks']]
    blocks += [{'id': f'bx{i}', 'hatched': True, 'rect': r} for i, r in enumerate(res.get('new_cores', []))]
    lines = []
    for l in read['lines']:
        if l['kind'] == 'partition':
            continue
        r = res['arrows'].get(l['id'], 'x')
        if r is None:
            continue
        lines.append(dict(l, pts=r) if r != 'x' else l)
    lines += [{'kind': 'arrow', 'pts': p} for p in res.get('extra_arrows', [])] + [{'kind': 'arc', 'pts': p} for p in res.get('extra_arcs', [])]
    lines += [{'kind': 'partition', 'pts': p} for p in res.get('partitions', [])]
    return dict(read, blocks=blocks, lines=lines)


def score(read, truth):
    ious = []
    for tb in truth['blocks']:
        cand = [b['rect'] for b in read['blocks'] if bool(b['hatched']) == (tb['kind'] == 'core')]
        ious.append(max([iou(c, tb['rect']) for c in cand], default=0))
    arrows = [l for l in read['lines'] if l['kind'] == 'arrow']; hit = 0; tails = []
    for ta in truth['arrows']:
        if arrows:
            best = min(arrows, key=lambda l: d(l['pts'][-1], ta['tip']))
            if d(best['pts'][-1], ta['tip']) <= 12:
                hit += 1; tails.append(d(best['pts'][0], ta['tail']))
    arcs = [l for l in read['lines'] if l['kind'] == 'arc']
    ah = sum(1 for ta in truth['arcs'] if arcs and min(d(l['pts'][len(l['pts']) // 2], ta['pts'][1]) for l in arcs) <= 10)
    parts = [l for l in read['lines'] if l['kind'] == 'partition']
    ph = sum(1 for tp in truth['parts'] if any(d(l['pts'][0], tp['a']) < 3 and d(l['pts'][-1], tp['b']) < 3 for l in parts))
    return dict(iou=sum(ious) / len(ious), hit=hit, n_arrow=len(arrows), tails=tails, arc_hit=ah, arc_total=len(truth['arcs']), p_hit=ph, p_total=len(truth['parts']), p_n=len(parts), n_truth_arrow=len(truth['arrows']))


def main():
    mode = 'drop-all' if '--drop-all' in sys.argv else 'drop-two' if '--drop-two' in sys.argv else 'normal'
    G.main_build = [G.build(n, 100 + i) for i, n in enumerate(NAMES)]
    rows = []
    for n in NAMES:
        truth = json.load(open(os.path.join(OUT, f'syn_{n}.json'), encoding='utf-8'))
        fused = json.load(open(os.path.join(HERE, 'ai_reads', f'{n}.json'), encoding='utf-8'))
        if mode == 'drop-all':
            fused = dict(fused, lines=[l for l in fused['lines'] if l['kind'] not in ('arrow', 'arc')])
        elif mode == 'drop-two':
            seen = 0; keep = []
            for l in fused['lines']:
                if l['kind'] == 'arrow' and seen < 2:
                    seen += 1; continue
                keep.append(l)
            fused = dict(fused, lines=keep)
        png = open(os.path.join(OUT, f'syn_{n}.png'), 'rb').read()
        res = sr.refine(png, [{'id': b['id'], 'rect': b['rect'], 'hatched': b['hatched']} for b in fused['blocks']],
                        [{'id': l['id'], 'pts': l['pts'], 'color': l['color']} for l in fused['lines'] if l['kind'] == 'arrow'],
                        [{'id': l['id'], 'pts': l['pts'], 'color': l['color']} for l in fused['lines'] if l['kind'] == 'arc'])
        s = score(apply(fused, res), truth); rows.append(s)
        print(f"{n:15s} 도형IoU {s['iou']:.2f} | 화살표 {s['hit']}/{s['n_truth_arrow']} (읽은 {s['n_arrow']}) | 호 {s['arc_hit']}/{s['arc_total']} | 칸막이 {s['p_hit']}/{s['p_total']} (읽은 {s['p_n']})")
    iou_m = sum(r['iou'] for r in rows) / len(rows)
    ar = (sum(r['hit'] for r in rows), sum(r['n_truth_arrow'] for r in rows)); fp = sum(max(0, r['n_arrow'] - r['hit']) for r in rows)
    pt = (sum(r['p_hit'] for r in rows), sum(r['p_total'] for r in rows)); tails = [t for r in rows for t in r['tails']]
    tail_m = sum(tails) / len(tails) if tails else float('nan')
    print(f"== [{mode}] 도형 평균 IoU {iou_m:.2f}, 화살표 {ar[0]}/{ar[1]} (오검출 {fp}), 꼬리 오차 {tail_m:.1f}, 칸막이 {pt[0]}/{pt[1]}")
    if mode == 'normal':
        ok = iou_m >= 0.82 and ar[0] >= ar[1] - 1 and fp <= 1 and tail_m <= 3.5 and pt[0] >= pt[1] - 1
        print('통과' if ok else '미달: 임계값(IoU 0.82, 화살표 24/25, 오검출 1, 꼬리 3.5, 칸막이 -1) 아래')
        sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
