"""파란 물결선(바람 표시) 검출 점검: 합성 G(파란 펜 + 물결선 4개)에서 정답 물결선과 검출 결과를 비교한다.
사용: python scripts/regression/sketch_synth/check_flows.py"""
import json, os, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'backend')); sys.path.insert(0, HERE)
import gen_sketches as G
from services import sketch_refine as sr


def meand(a, b):
    B = np.array(b)
    return float(np.mean([np.min(np.hypot(B[:, 0] - p[0], B[:, 1] - p[1])) for p in a]))


def evaluate(png, truth, verbose=True):
    blocks = [{'id': f'b{i + 1}', 'rect': b['rect'], 'hatched': b['kind'] == 'core'} for i, b in enumerate(truth['blocks'])]
    res = sr.refine(png, blocks, [], [])
    det = res['flows']; hit = 0; errs = []; used = set()
    for k, f in enumerate(truth['flows']):
        cands = sorted(((meand(f['pts'], d) + meand(d, f['pts'])) / 2, i) for i, d in enumerate(det) if i not in used)
        if cands and cands[0][0] <= 4.0:
            hit += 1; used.add(cands[0][1]); errs.append(cands[0][0])
            if verbose: print(f' 정답 {k}: 검출 {cands[0][1]} (평균거리 {cands[0][0]:.1f})')
        elif verbose:
            print(f' 정답 {k}: 못 찾음' + (f' (가장 가까운 검출 {cands[0][0]:.1f})' if cands else ''))
    fp = len(det) - len(used)
    return hit, len(truth['flows']), fp, errs, det


if __name__ == '__main__':
    G.build('G_blue_flows', 100 + list(G.LAYOUTS).index('G_blue_flows'))
    png = open(os.path.join(G.OUT, 'syn_G_blue_flows.png'), 'rb').read(); truth = json.load(open(os.path.join(G.OUT, 'syn_G_blue_flows.json'), encoding='utf-8'))
    hit, tot, fp, errs, det = evaluate(png, truth)
    print(f'== 물결선 검출 {hit}/{tot}, 오검출 {fp}, 평균 거리 {sum(errs) / max(1, len(errs)):.1f}')
    sys.exit(0 if hit >= tot - 1 and fp <= 1 else 1)
