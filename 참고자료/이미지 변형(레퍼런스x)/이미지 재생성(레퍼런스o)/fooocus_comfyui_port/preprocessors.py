# Ported verbatim from Fooocus extras/preprocessors.py (no Fooocus-internal dependencies).
# These produce the "structure" control image for the two Structure-family Image Prompt types:
#   PyraCanny -> canny_pyramid()   (feeds the SDXL Control-LoRA canny model)
#   CPDS      -> cpds()            (feeds Fooocus's custom fooocus_xl_cpds_128 control-lora)
import cv2
import numpy as np


def centered_canny(x: np.ndarray, canny_low_threshold, canny_high_threshold):
    assert isinstance(x, np.ndarray)
    assert x.ndim == 2 and x.dtype == np.uint8

    y = cv2.Canny(x, int(canny_low_threshold), int(canny_high_threshold))
    y = y.astype(np.float32) / 255.0
    return y


def centered_canny_color(x: np.ndarray, canny_low_threshold, canny_high_threshold):
    assert isinstance(x, np.ndarray)
    assert x.ndim == 3 and x.shape[2] == 3

    result = [centered_canny(x[..., i], canny_low_threshold, canny_high_threshold) for i in range(3)]
    result = np.stack(result, axis=2)
    return result


def pyramid_canny_color(x: np.ndarray, canny_low_threshold, canny_high_threshold):
    assert isinstance(x, np.ndarray)
    assert x.ndim == 3 and x.shape[2] == 3

    H, W, C = x.shape
    acc_edge = None

    for k in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
        Hs, Ws = int(H * k), int(W * k)
        small = cv2.resize(x, (Ws, Hs), interpolation=cv2.INTER_AREA)
        edge = centered_canny_color(small, canny_low_threshold, canny_high_threshold)
        if acc_edge is None:
            acc_edge = edge
        else:
            acc_edge = cv2.resize(acc_edge, (edge.shape[1], edge.shape[0]), interpolation=cv2.INTER_LINEAR)
            acc_edge = acc_edge * 0.75 + edge * 0.25

    return acc_edge


def norm255(x, low=4, high=96):
    assert isinstance(x, np.ndarray)
    assert x.ndim == 2 and x.dtype == np.float32

    v_min = np.percentile(x, low)
    v_max = np.percentile(x, high)

    x -= v_min
    x /= (v_max - v_min)

    return x * 255.0


def canny_pyramid(x, canny_low_threshold, canny_high_threshold):
    # For some reasons, SAI's Control-LoRA Canny seems to be trained on canny maps with
    # arbitrary global scales, so we use pyramid to eliminate the global scale problem.
    color_canny = pyramid_canny_color(x, canny_low_threshold, canny_high_threshold)
    result = np.sum(color_canny, axis=2)
    return norm255(result, low=1, high=99).clip(0, 255).astype(np.uint8)


def cpds(x):
    # cv2.decolor implements Cewu Lu's "Contrast Preserving Decolorization" -- gives a
    # grayscale structure map that keeps edges/contrast that a naive Rec.601 grayscale loses.
    raw = cv2.GaussianBlur(x, (0, 0), 0.8)
    density, boost = cv2.decolor(raw)

    raw = raw.astype(np.float32)
    density = density.astype(np.float32)
    boost = boost.astype(np.float32)
    offset = np.sum((raw - boost) ** 2.0, axis=2) ** 0.5

    result = density + offset
    return norm255(result, low=4, high=96).clip(0, 255).astype(np.uint8)
