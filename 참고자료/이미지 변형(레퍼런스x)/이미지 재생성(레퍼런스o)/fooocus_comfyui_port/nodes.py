import os

import numpy as np
import torch

from . import patch as fooocus_patch
from . import vary as fooocus_vary
from . import preprocessors as fooocus_preprocessors

FOOOCUS_ROOT_DEFAULT = r"D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus"


class FooocusAdvancedSettings:
    """Sets the Fooocus 'Advanced' tab knobs (Adaptive CFG, Sharpness, ADM Scale, ControlNet
    Softness) that patch.py's monkeypatches read from at sample time.

    Wire the MODEL through this node (input -> output) so ComfyUI's dependency graph runs it
    before the KSampler node -- these are process-global settings, this node's only job is to
    force ordering and make the values visible/editable in the graph.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "adaptive_cfg": ("FLOAT", {"default": 7.0, "min": 1.0, "max": 30.0, "step": 0.1}),
                "sharpness": ("FLOAT", {"default": 2.0, "min": 0.0, "max": 30.0, "step": 0.1}),
                "positive_adm_scale": ("FLOAT", {"default": 1.5, "min": 0.1, "max": 3.0, "step": 0.01}),
                "negative_adm_scale": ("FLOAT", {"default": 0.8, "min": 0.1, "max": 3.0, "step": 0.01}),
                "adm_scaler_end": ("FLOAT", {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.01}),
                "controlnet_softness": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply"
    CATEGORY = "fooocus_port"

    def apply(self, model, adaptive_cfg, sharpness, positive_adm_scale, negative_adm_scale,
              adm_scaler_end, controlnet_softness):
        fooocus_patch.patch_all()
        ps = fooocus_patch.get_patch_settings()
        ps.adaptive_cfg = adaptive_cfg
        ps.sharpness = sharpness
        ps.positive_adm_scale = positive_adm_scale
        ps.negative_adm_scale = negative_adm_scale
        ps.adm_scaler_end = adm_scaler_end
        ps.controlnet_softness = controlnet_softness
        return (model,)


def _tensor_to_np(image: torch.Tensor) -> np.ndarray:
    # ComfyUI IMAGE tensors are [B, H, W, C] float 0..1. Fooocus's helpers want uint8 HWC.
    arr = image[0].cpu().numpy()
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return arr


def _np_to_tensor(arr: np.ndarray) -> torch.Tensor:
    t = torch.from_numpy(arr.astype(np.float32) / 255.0)
    if t.ndim == 2:
        t = t.unsqueeze(-1).repeat(1, 1, 3)
    return t.unsqueeze(0)


class FooocusVaryImage:
    """Reproduces Fooocus's 'Vary (Subtle)' / 'Vary (Strong)' preprocessing: resize the
    reference image to Fooocus's shape-ceil target (clamped to [1024, 2048]) and report the
    matching denoising strength, ready to feed into a VAEEncode -> KSampler (denoise) chain.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "method": (["strong", "subtle"],),
            },
            "optional": {
                "overwrite_denoise": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("IMAGE", "FLOAT")
    RETURN_NAMES = ("image", "denoise")
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, image, method, overwrite_denoise=0.0):
        arr = _tensor_to_np(image)
        resized, denoise = fooocus_vary.prepare_vary_image(
            arr, method=method, overwrite_denoise=overwrite_denoise or None)
        return (_np_to_tensor(resized), float(denoise))


_expansion_singleton = {}


class FooocusPromptExpansion:
    """Standalone port of Fooocus's GPT-2 'Prompt Expansion' (Fooocus V2 style suffix).
    model_dir must point at Fooocus's models/prompt_expansion/fooocus_expansion folder
    (tokenizer + positive.txt + model weights) -- point it in place, no need to copy files.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "model_dir": ("STRING", {
                    "default": os.path.join(FOOOCUS_ROOT_DEFAULT, "models", "prompt_expansion", "fooocus_expansion")
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, prompt, seed, model_dir):
        if model_dir not in _expansion_singleton:
            from . import expansion as fooocus_expansion
            _expansion_singleton[model_dir] = fooocus_expansion.FooocusExpansion(model_dir)
        expander = _expansion_singleton[model_dir]
        expanded = expander(prompt, seed)
        return (expanded,)


# ---------------------------------------------------------------------------
# Structure family: PyraCanny / CPDS  -> plain IMAGE, feed into stock ComfyUI
# ControlNetLoader + ControlNetApplyAdvanced (core.apply_controlnet in Fooocus is literally
# that stock node, nothing custom to port there).
# ---------------------------------------------------------------------------
class FooocusStructurePreprocessor:
    """Reproduces the 'Structure' family of Image Prompt types (PyraCanny / CPDS).
    Output feeds a standard ComfyUI ControlNetLoader -> ControlNetApplyAdvanced pair.
    Fooocus's default (stop_at, weight): PyraCanny=(0.5, 1.0), CPDS=(0.5, 1.0).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "type": (["PyraCanny", "CPDS"],),
                "canny_low_threshold": ("INT", {"default": 64, "min": 1, "max": 255}),
                "canny_high_threshold": ("INT", {"default": 128, "min": 1, "max": 255}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, image, type, canny_low_threshold, canny_high_threshold):
        arr = _tensor_to_np(image)
        if type == "PyraCanny":
            out = fooocus_preprocessors.canny_pyramid(arr, canny_low_threshold, canny_high_threshold)
        else:
            out = fooocus_preprocessors.cpds(arr)
        return (_np_to_tensor(out),)


# ---------------------------------------------------------------------------
# Reference family: ImagePrompt / FaceSwap -> accumulate into IP_TASKS, patch MODEL once.
# Mirrors Fooocus's cn_tasks[cn_ip] + cn_tasks[cn_ip_face] -> ip_adapter.patch_model(model, tasks).
# ---------------------------------------------------------------------------
class FooocusIPAdapterLoader:
    """Loads the CLIP-Vision encoder + negative embedding + IP-Adapter weights for one
    Image Prompt type. Load once per type (ImagePrompt / FaceSwap) and reuse across images
    of that type -- Fooocus caches these globally too.
    Model files (from Fooocus's models/ dir, see modules/config.py):
      clip_vision:  models/clip_vision/clip_vision_vit_h.safetensors
      ip_negative:  models/controlnet/fooocus_ip_negative.safetensors
      ImagePrompt:  models/controlnet/ip-adapter-plus_sdxl_vit-h.bin
      FaceSwap:     models/controlnet/ip-adapter-plus-face_sdxl_vit-h.bin
    """

    @classmethod
    def INPUT_TYPES(cls):
        models_dir = os.path.join(FOOOCUS_ROOT_DEFAULT, "models")
        return {
            "required": {
                "type": (["ImagePrompt", "FaceSwap"],),
                "clip_vision_path": ("STRING", {
                    "default": os.path.join(models_dir, "clip_vision", "clip_vision_vit_h.safetensors")}),
                "ip_negative_path": ("STRING", {
                    "default": os.path.join(models_dir, "controlnet", "fooocus_ip_negative.safetensors")}),
                "ip_adapter_path": ("STRING", {
                    "default": os.path.join(models_dir, "controlnet", "ip-adapter-plus_sdxl_vit-h.bin")}),
            }
        }

    RETURN_TYPES = ("FOOOCUS_IPADAPTER",)
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, type, clip_vision_path, ip_negative_path, ip_adapter_path):
        from . import ip_adapter as fooocus_ip_adapter
        fooocus_ip_adapter.load_ip_adapter(clip_vision_path, ip_negative_path, ip_adapter_path)
        return ({"type": type, "ip_adapter_path": ip_adapter_path},)


class FooocusIPAdapterPreprocess:
    """Adds one reference image to the running IP_TASKS list. Chain multiple of these
    (feeding `ip_tasks` output back into the next node's `ip_tasks` input) to combine several
    Structure/Reference images the way Fooocus's Image Prompt panel does -- e.g. one
    ImagePrompt-type node for material/mood/color, chained after another for a second
    reference image, then all fed into one FooocusIPAdapterPatchModel at the end.

    Fooocus default (stop_at, weight): ImagePrompt=(0.5, 0.6), FaceSwap=(0.9, 0.75).
    For FaceSwap, enable face_crop to align/crop the face first (needs Fooocus's bundled
    facexlib, see face_crop.py).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ip_adapter": ("FOOOCUS_IPADAPTER",),
                "image": ("IMAGE",),
                "stop_at": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "weight": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 2.0, "step": 0.01}),
                "face_crop": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "ip_tasks": ("FOOOCUS_IP_TASKS",),
            }
        }

    RETURN_TYPES = ("FOOOCUS_IP_TASKS",)
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, ip_adapter, image, stop_at, weight, face_crop, ip_tasks=None):
        from . import ip_adapter as fooocus_ip_adapter
        arr = _tensor_to_np(image)

        if face_crop:
            from . import face_crop as fooocus_face_crop
            arr = fooocus_face_crop.crop_image(arr)

        resized = fooocus_vary.resample_image(arr, width=224, height=224)
        cond, uncond = fooocus_ip_adapter.preprocess(resized, ip_adapter["ip_adapter_path"])

        tasks = list(ip_tasks) if ip_tasks else []
        tasks.append(((cond, uncond), stop_at, weight))
        return (tasks,)


class FooocusIPAdapterPatchModel:
    """Applies all accumulated ImagePrompt/FaceSwap reference tasks to the model in a single
    attention patch (mirrors Fooocus calling ip_adapter.patch_model(model, all_ip_tasks) once,
    after gathering every ImagePrompt + FaceSwap image). Requires FooocusAdvancedSettings (or at
    least fooocus_patch.patch_all()) to have run on this model so current_step tracking exists.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "ip_tasks": ("FOOOCUS_IP_TASKS",),
            }
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "run"
    CATEGORY = "fooocus_port"

    def run(self, model, ip_tasks):
        from . import ip_adapter as fooocus_ip_adapter
        fooocus_patch.patch_all()
        return (fooocus_ip_adapter.patch_model(model, ip_tasks),)


NODE_CLASS_MAPPINGS = {
    "FooocusAdvancedSettings": FooocusAdvancedSettings,
    "FooocusVaryImage": FooocusVaryImage,
    "FooocusPromptExpansion": FooocusPromptExpansion,
    "FooocusStructurePreprocessor": FooocusStructurePreprocessor,
    "FooocusIPAdapterLoader": FooocusIPAdapterLoader,
    "FooocusIPAdapterPreprocess": FooocusIPAdapterPreprocess,
    "FooocusIPAdapterPatchModel": FooocusIPAdapterPatchModel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FooocusAdvancedSettings": "Fooocus Advanced Settings (CFG/Sharpness/ADM/ControlNet)",
    "FooocusVaryImage": "Fooocus Vary Image (resize + denoise)",
    "FooocusPromptExpansion": "Fooocus Prompt Expansion (GPT2)",
    "FooocusStructurePreprocessor": "Fooocus Structure Preprocessor (PyraCanny/CPDS)",
    "FooocusIPAdapterLoader": "Fooocus IP-Adapter Loader (ImagePrompt/FaceSwap)",
    "FooocusIPAdapterPreprocess": "Fooocus IP-Adapter Add Reference Image",
    "FooocusIPAdapterPatchModel": "Fooocus IP-Adapter Patch Model",
}
