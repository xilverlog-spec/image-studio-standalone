# ComfyUI port of Fooocus's extras/face_crop.py (used by the "FaceSwap" Image Prompt type to
# align/crop a face before feeding it into IP-Adapter-Plus-Face).
#
# This is a RetinaFace landmark detector + affine warp (facexlib), NOT an identity-swap model.
# Reimplementing a face detector from scratch is impractical, so this wrapper instead reuses
# Fooocus's own bundled `extras/facexlib` package in place, by adding the Fooocus install root to
# sys.path. Point FOOOCUS_ROOT at your Fooocus install (default matches the log's install path).
import os
import sys

import cv2
import numpy as np

FOOOCUS_ROOT = os.environ.get(
    "FOOOCUS_ROOT",
    r"D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus",
)

_face_restore_helper = None


def _ensure_facexlib_importable():
    if FOOOCUS_ROOT not in sys.path:
        sys.path.insert(0, FOOOCUS_ROOT)


def align_warp_face(helper, landmark, border_mode='constant'):
    affine_matrix = cv2.estimateAffinePartial2D(landmark, helper.face_template, method=cv2.LMEDS)[0]
    helper.affine_matrices.append(affine_matrix)
    if border_mode == 'constant':
        border_mode = cv2.BORDER_CONSTANT
    elif border_mode == 'reflect101':
        border_mode = cv2.BORDER_REFLECT101
    elif border_mode == 'reflect':
        border_mode = cv2.BORDER_REFLECT
    input_img = helper.input_img
    return cv2.warpAffine(input_img, affine_matrix, helper.face_size,
                           borderMode=border_mode, borderValue=(135, 133, 132))


def crop_image(img_rgb: np.ndarray, controlnet_model_dir: str = None) -> np.ndarray:
    """controlnet_model_dir: folder facexlib should look in / download its RetinaFace weights to
    (Fooocus points this at its own models/controlnet folder; any writable folder works)."""
    global _face_restore_helper

    _ensure_facexlib_importable()

    if _face_restore_helper is None:
        from extras.facexlib.utils.face_restoration_helper import FaceRestoreHelper
        _face_restore_helper = FaceRestoreHelper(
            upscale_factor=1,
            model_rootpath=controlnet_model_dir or os.path.join(FOOOCUS_ROOT, "models", "controlnet"),
            device='cpu',
        )

    _face_restore_helper.clean_all()
    _face_restore_helper.read_image(np.ascontiguousarray(img_rgb[:, :, ::-1].copy()))
    _face_restore_helper.get_face_landmarks_5()

    landmarks = _face_restore_helper.all_landmarks_5
    if len(landmarks) == 0:
        print('[Fooocus Port] No face detected, using original image.')
        return img_rgb

    result = align_warp_face(_face_restore_helper, landmarks[0])
    return np.ascontiguousarray(result[:, :, ::-1].copy())
