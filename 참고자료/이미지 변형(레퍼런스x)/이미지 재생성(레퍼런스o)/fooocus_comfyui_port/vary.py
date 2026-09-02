# ComfyUI port of Fooocus's "Vary" image resize + denoise logic.
# Source: modules/util.py (get_shape_ceil / set_image_shape_ceil / resample_image)
#         modules/async_worker.py:apply_vary (denoise-strength presets + resolution clamp)
import math

import numpy as np
from PIL import Image
from PIL.Image import LANCZOS


def resample_image(im: np.ndarray, width: int, height: int) -> np.ndarray:
    im = Image.fromarray(im)
    im = im.resize((int(width), int(height)), resample=LANCZOS)
    return np.array(im)


def get_shape_ceil(h, w) -> float:
    return math.ceil(((h * w) ** 0.5) / 64.0) * 64.0


def get_image_shape_ceil(im: np.ndarray) -> float:
    H, W = im.shape[:2]
    return get_shape_ceil(H, W)


def set_image_shape_ceil(im: np.ndarray, shape_ceil: float) -> np.ndarray:
    shape_ceil = float(shape_ceil)

    H_origin, W_origin = im.shape[:2]
    H, W = H_origin, W_origin

    for _ in range(256):
        current_shape_ceil = get_shape_ceil(H, W)
        if abs(current_shape_ceil - shape_ceil) < 0.1:
            break
        k = shape_ceil / current_shape_ceil
        H = int(round(float(H) * k / 64.0) * 64)
        W = int(round(float(W) * k / 64.0) * 64)

    if H == H_origin and W == W_origin:
        return im
    return resample_image(im, width=W, height=H)


# Fooocus's two "Vary" presets (Upscale or Variation tab -> Vary (Subtle) / Vary (Strong))
VARY_SUBTLE_DENOISE = 0.5
VARY_STRONG_DENOISE = 0.85
UPSCALE_DENOISE = 0.382


def prepare_vary_image(input_image: np.ndarray, method: str = "strong", overwrite_denoise: float = None):
    """Reproduces Fooocus's apply_vary() resize + denoise-strength selection.

    method: "subtle" or "strong" (case-insensitive substring match, like Fooocus's uov_method string).
    Returns: (resized_image, denoising_strength)
    """
    method = method.lower()
    denoising_strength = VARY_STRONG_DENOISE
    if 'subtle' in method:
        denoising_strength = VARY_SUBTLE_DENOISE
    if 'strong' in method:
        denoising_strength = VARY_STRONG_DENOISE
    if overwrite_denoise is not None and overwrite_denoise > 0:
        denoising_strength = overwrite_denoise

    shape_ceil = get_image_shape_ceil(input_image)
    if shape_ceil < 1024:
        print('[Vary] Image is resized because it is too small.')
        shape_ceil = 1024
    elif shape_ceil > 2048:
        print('[Vary] Image is resized because it is too big.')
        shape_ceil = 2048

    resized = set_image_shape_ceil(input_image, shape_ceil)
    return resized, denoising_strength


def prepare_upscale_image(input_image: np.ndarray, overwrite_denoise: float = None):
    """Reproduces Fooocus's apply_upscale() resize + denoise-strength selection (low-end clamp only)."""
    denoising_strength = UPSCALE_DENOISE
    if overwrite_denoise is not None and overwrite_denoise > 0:
        denoising_strength = overwrite_denoise

    shape_ceil = get_image_shape_ceil(input_image)
    if shape_ceil < 1024:
        shape_ceil = 1024

    resized = set_image_shape_ceil(input_image, shape_ceil)
    return resized, denoising_strength
