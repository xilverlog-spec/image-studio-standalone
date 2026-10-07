"""조감도 생성 결과의 '형태 보존' 점수 — 입력(매스·스케치·모델 캡처)의 뼈대 선이 결과 이미지에 얼마나 그대로 남았는지 0~100으로 매긴다.

방법: 두 이미지에서 윤곽선(edge)을 뽑고, 입력의 윤곽선 중 결과 윤곽선(약간의 오차 허용) 위에 놓인 비율(재현율)을 구한다.
결과는 질감·식재 때문에 윤곽선이 많아서 아무 데나 겹쳐도 어느 정도 높게 나오므로, 결과 윤곽선을 옆으로 밀어서 구한 '우연히 겹치는 비율'을 빼서 보정한다.
완전 로컬 계산(외부 전송 없음)이고 몇 초 이내에 끝난다.
"""
import io

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import feature, morphology

_LONG = 360
# 입력과 결과의 가로세로비가 이 이상 다르면 구도가 달라진 것이라 점수를 매기지 않는다(잘림·여백 때문에 억울하게 낮아진다)
_MAX_ASPECT_DIFF = 0.10


def _edges(img, size):
    g = np.asarray(img.convert("L").resize(size, Image.LANCZOS)).astype(np.float32) / 255.0
    e = feature.canny(g, sigma=1.5, low_threshold=0.02, high_threshold=0.06)
    return morphology.remove_small_objects(e, max_size=24)


def form_score(input_bytes, output_bytes):
    """반환: {'score': 0~100 또는 None, 'note': 사유}"""
    a = Image.open(io.BytesIO(input_bytes)).convert("RGB")
    b = Image.open(io.BytesIO(output_bytes)).convert("RGB")
    ra, rb = a.width / float(a.height), b.width / float(b.height)
    if abs(ra - rb) / ra > _MAX_ASPECT_DIFF:
        return {"score": None, "note": "입력과 결과의 가로세로비가 달라 비교할 수 없습니다(화면 비율을 입력과 맞추세요)."}
    k = _LONG / float(max(a.size))
    size = (max(64, int(a.width * k)), max(64, int(a.height * k)))
    ea, eb = _edges(a, size), _edges(b, size)
    if ea.sum() < 80:
        return {"score": None, "note": "입력에서 뚜렷한 윤곽선을 찾지 못했습니다."}
    r = max(2, int(0.02 * max(size)))
    near_b = ndi.binary_dilation(eb, structure=morphology.disk(r))
    recall = float((ea & near_b).sum()) / float(ea.sum())
    dx, dy = int(0.09 * size[0]), int(0.07 * size[1])
    shifted = np.roll(np.roll(eb, dx, axis=1), dy, axis=0)
    base = float((ea & ndi.binary_dilation(shifted, structure=morphology.disk(r))).sum()) / float(ea.sum())
    score = max(0.0, min(1.0, (recall - base) / max(1e-6, 1.0 - base)))
    return {"score": int(round(score * 100)), "note": ""}
