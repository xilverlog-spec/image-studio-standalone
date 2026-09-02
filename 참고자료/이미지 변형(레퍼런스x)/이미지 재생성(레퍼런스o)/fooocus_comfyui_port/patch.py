# ComfyUI port of Fooocus's modules/patch.py custom sampling logic.
#
# Source of truth: D:\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\Fooocus\modules\patch.py
# Fooocus's "ldm_patched" package is a renamed fork of ComfyUI's own "comfy" package, so the
# classes/functions patched below (comfy.samplers.sampling_function, comfy.model_base.SDXL.encode_adm,
# comfy.cldm.cldm.ControlNet.forward, comfy.ldm.modules.diffusionmodules.openaimodel.UNetModel.forward)
# are the exact same objects Fooocus patches, just under their original ComfyUI names.
#
# Two of the four patches (sampling_function, SDXL.encode_adm) are copied close to verbatim from
# Fooocus, since Fooocus's versions are already small, self-contained functions.
# The other two (ControlNet.forward, UNetModel.forward) are NOT copied verbatim -- Fooocus reimplements
# their entire body just to inject a couple of lines. Reimplementing an internal forward pass is brittle
# across ComfyUI versions, so this port instead WRAPS the original method: call the real ComfyUI forward,
# then apply the same post-processing Fooocus applies. This produces identical output with far less
# version risk.

import os
import math
import torch

import comfy.samplers
import comfy.model_base
import comfy.cldm.cldm as cldm
import comfy.ldm.modules.diffusionmodules.openaimodel as openaimodel

from . import anisotropic

calc_cond_uncond_batch = comfy.samplers.calc_cond_uncond_batch


class PatchSettings:
    def __init__(self):
        # Defaults mirror Fooocus's own defaults (modules/config.py).
        self.adaptive_cfg = 7.0
        self.sharpness = 2.0
        self.positive_adm_scale = 1.5
        self.negative_adm_scale = 0.8
        self.adm_scaler_end = 0.3
        self.controlnet_softness = 0.25
        self.global_diffusion_progress = 0.0


# Keyed by pid so multiple ComfyUI worker processes don't share state, same as Fooocus.
patch_settings: dict[int, PatchSettings] = {}


def get_patch_settings() -> PatchSettings:
    pid = os.getpid()
    if pid not in patch_settings:
        patch_settings[pid] = PatchSettings()
    return patch_settings[pid]


# ---------------------------------------------------------------------------
# 1. Adaptive CFG  (patch.py:212-223)
# ---------------------------------------------------------------------------
def compute_cfg(uncond, cond, cfg_scale, t):
    ps = get_patch_settings()
    mimic_cfg = float(ps.adaptive_cfg)
    real_cfg = float(cfg_scale)

    real_eps = uncond + real_cfg * (cond - uncond)

    if cfg_scale > ps.adaptive_cfg:
        mimicked_eps = uncond + mimic_cfg * (cond - uncond)
        return real_eps * t + mimicked_eps * (1 - t)
    return real_eps


# ---------------------------------------------------------------------------
# 2. Sharpness + Adaptive CFG combined  (patch.py:226-253)
#    This REPLACES comfy.samplers.sampling_function outright, same as Fooocus does.
# ---------------------------------------------------------------------------
_original_sampling_function = comfy.samplers.sampling_function


def patched_sampling_function(model, x, timestep, uncond, cond, cond_scale, model_options=None, seed=None):
    ps = get_patch_settings()
    model_options = model_options or {}

    if math.isclose(cond_scale, 1.0) and not model_options.get("disable_cfg1_optimization", False):
        return calc_cond_uncond_batch(model, cond, None, x, timestep, model_options)[0]

    positive_x0, negative_x0 = calc_cond_uncond_batch(model, cond, uncond, x, timestep, model_options)

    positive_eps = x - positive_x0
    negative_eps = x - negative_x0

    alpha = 0.001 * ps.sharpness * ps.global_diffusion_progress

    positive_eps_degraded = anisotropic.adaptive_anisotropic_filter(x=positive_eps, g=positive_x0)
    positive_eps_degraded_weighted = positive_eps_degraded * alpha + positive_eps * (1.0 - alpha)

    final_eps = compute_cfg(uncond=negative_eps, cond=positive_eps_degraded_weighted,
                             cfg_scale=cond_scale, t=ps.global_diffusion_progress)

    return x - final_eps


# ---------------------------------------------------------------------------
# 3. ADM Scale (positive / negative / end-step)  (patch.py:256-294, 330-336)
# ---------------------------------------------------------------------------
def round_to_64(x):
    return int(round(float(x) / 64.0) * 64)


_original_sdxl_encode_adm = comfy.model_base.SDXL.encode_adm


def sdxl_encode_adm_patched(self, **kwargs):
    ps = get_patch_settings()
    clip_pooled = comfy.model_base.sdxl_pooled(kwargs, self.noise_augmentor)
    width = kwargs.get("width", 1024)
    height = kwargs.get("height", 1024)
    target_width, target_height = width, height

    prompt_type = kwargs.get("prompt_type", "")
    if prompt_type == "negative":
        width = float(width) * ps.negative_adm_scale
        height = float(height) * ps.negative_adm_scale
    elif prompt_type == "positive":
        width = float(width) * ps.positive_adm_scale
        height = float(height) * ps.positive_adm_scale

    def embedder(number_list):
        h = self.embedder(torch.tensor(number_list, dtype=torch.float32))
        h = torch.flatten(h).unsqueeze(dim=0).repeat(clip_pooled.shape[0], 1)
        return h

    width, height = int(width), int(height)
    target_width, target_height = round_to_64(target_width), round_to_64(target_height)

    adm_emphasized = embedder([height, width, 0, 0, target_height, target_width])
    adm_consistent = embedder([target_height, target_width, 0, 0, target_height, target_width])

    clip_pooled = clip_pooled.to(adm_emphasized)
    return torch.cat((clip_pooled, adm_emphasized, clip_pooled, adm_consistent), dim=1)


def timed_adm(y, timesteps):
    ps = get_patch_settings()
    if isinstance(y, torch.Tensor) and int(y.dim()) == 2 and int(y.shape[1]) == 5632:
        y_mask = (timesteps > 999.0 * (1.0 - float(ps.adm_scaler_end))).to(y)[..., None]
        y_with_adm = y[..., :2816].clone()
        y_without_adm = y[..., 2816:].clone()
        return y_with_adm * y_mask + y_without_adm * (1.0 - y_mask)
    return y


# ---------------------------------------------------------------------------
# 4. ControlNet Softness  (patch.py:339-373)
#    Wraps the real ControlNet.forward instead of reimplementing it.
# ---------------------------------------------------------------------------
_original_cldm_forward = cldm.ControlNet.forward


def patched_cldm_forward(self, x, hint, timesteps, context, y=None, **kwargs):
    ps = get_patch_settings()

    if y is not None:
        y = timed_adm(y, timesteps)

    outs = _original_cldm_forward(self, x, hint, timesteps, context, y=y, **kwargs)

    if ps.controlnet_softness > 0 and isinstance(outs, (list, tuple)) and len(outs) >= 10:
        outs = list(outs)
        for i in range(10):
            k = 1.0 - float(i) / 9.0
            outs[i] = outs[i] * (1.0 - ps.controlnet_softness * k)

    return outs


# ---------------------------------------------------------------------------
# 5. Diffusion-progress tracking + ADM time-gating for the main UNet
#    (patch.py:330-336, 376-378). Wraps the real UNetModel.forward.
# ---------------------------------------------------------------------------
_original_unet_forward = openaimodel.UNetModel.forward


def patched_unet_forward(self, x, timesteps=None, context=None, y=None, control=None,
                          transformer_options={}, **kwargs):
    ps = get_patch_settings()

    current_step = 1.0 - timesteps.to(x) / 999.0
    self.current_step = current_step  # read directly by ip_adapter.py's attention patcher
    ps.global_diffusion_progress = float(current_step.detach().cpu().numpy().tolist()[0])

    y = timed_adm(y, timesteps)

    return _original_unet_forward(self, x, timesteps=timesteps, context=context, y=y, control=control,
                                   transformer_options=transformer_options, **kwargs)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
_patched = False


def patch_all():
    """Idempotent. Call once (done automatically by __init__.py on node-pack load)."""
    global _patched
    if _patched:
        return

    comfy.samplers.sampling_function = patched_sampling_function
    comfy.model_base.SDXL.encode_adm = sdxl_encode_adm_patched
    cldm.ControlNet.forward = patched_cldm_forward
    openaimodel.UNetModel.forward = patched_unet_forward

    _patched = True
    print('[Fooocus Port] Adaptive CFG / Sharpness / ADM Scale / ControlNet Softness patches applied.')


def unpatch_all():
    global _patched
    if not _patched:
        return

    comfy.samplers.sampling_function = _original_sampling_function
    comfy.model_base.SDXL.encode_adm = _original_sdxl_encode_adm
    cldm.ControlNet.forward = _original_cldm_forward
    openaimodel.UNetModel.forward = _original_unet_forward

    _patched = False
