import numpy as np
import torch

from . import patch as fooocus_patch
from . import vary as fooocus_vary


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
                    "default": r"D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus\models\prompt_expansion\fooocus_expansion"
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


NODE_CLASS_MAPPINGS = {
    "FooocusAdvancedSettings": FooocusAdvancedSettings,
    "FooocusVaryImage": FooocusVaryImage,
    "FooocusPromptExpansion": FooocusPromptExpansion,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FooocusAdvancedSettings": "Fooocus Advanced Settings (CFG/Sharpness/ADM/ControlNet)",
    "FooocusVaryImage": "Fooocus Vary Image (resize + denoise)",
    "FooocusPromptExpansion": "Fooocus Prompt Expansion (GPT2)",
}
