# Ported verbatim from Fooocus modules/anisotropic.py (no Fooocus-internal dependencies).
# Used by patch.py to reproduce the "Sharpness" slider's edge-aware smoothing.
import torch

Tensor = torch.Tensor
pad = torch.nn.functional.pad


def _compute_zero_padding(kernel_size):
    ky, kx = _unpack_2d_ks(kernel_size)
    return (ky - 1) // 2, (kx - 1) // 2


def _unpack_2d_ks(kernel_size):
    if isinstance(kernel_size, int):
        ky = kx = kernel_size
    else:
        ky, kx = kernel_size
    return int(ky), int(kx)


def gaussian(window_size, sigma, *, device=None, dtype=None):
    batch_size = sigma.shape[0]
    x = (torch.arange(window_size, device=sigma.device, dtype=sigma.dtype) - window_size // 2).expand(batch_size, -1)
    if window_size % 2 == 0:
        x = x + 0.5
    gauss = torch.exp(-x.pow(2.0) / (2 * sigma.pow(2.0)))
    return gauss / gauss.sum(-1, keepdim=True)


def get_gaussian_kernel1d(kernel_size, sigma, force_even=False, *, device=None, dtype=None):
    return gaussian(kernel_size, sigma, device=device, dtype=dtype)


def get_gaussian_kernel2d(kernel_size, sigma, force_even=False, *, device=None, dtype=None):
    sigma = torch.Tensor([[sigma, sigma]]).to(device=device, dtype=dtype)
    ksize_y, ksize_x = _unpack_2d_ks(kernel_size)
    sigma_y, sigma_x = sigma[:, 0, None], sigma[:, 1, None]
    kernel_y = get_gaussian_kernel1d(ksize_y, sigma_y, force_even, device=device, dtype=dtype)[..., None]
    kernel_x = get_gaussian_kernel1d(ksize_x, sigma_x, force_even, device=device, dtype=dtype)[..., None]
    return kernel_y * kernel_x.view(-1, 1, ksize_x)


def _bilateral_blur(input, guidance, kernel_size, sigma_color, sigma_space,
                     border_type='reflect', color_distance_type='l1'):
    if isinstance(sigma_color, Tensor):
        sigma_color = sigma_color.to(device=input.device, dtype=input.dtype).view(-1, 1, 1, 1, 1)

    ky, kx = _unpack_2d_ks(kernel_size)
    pad_y, pad_x = _compute_zero_padding(kernel_size)

    padded_input = pad(input, (pad_x, pad_x, pad_y, pad_y), mode=border_type)
    unfolded_input = padded_input.unfold(2, ky, 1).unfold(3, kx, 1).flatten(-2)

    if guidance is None:
        guidance = input
        unfolded_guidance = unfolded_input
    else:
        padded_guidance = pad(guidance, (pad_x, pad_x, pad_y, pad_y), mode=border_type)
        unfolded_guidance = padded_guidance.unfold(2, ky, 1).unfold(3, kx, 1).flatten(-2)

    diff = unfolded_guidance - guidance.unsqueeze(-1)
    if color_distance_type == "l1":
        color_distance_sq = diff.abs().sum(1, keepdim=True).square()
    elif color_distance_type == "l2":
        color_distance_sq = diff.square().sum(1, keepdim=True)
    else:
        raise ValueError("color_distance_type only accepts l1 or l2")
    color_kernel = (-0.5 / sigma_color**2 * color_distance_sq).exp()

    space_kernel = get_gaussian_kernel2d(kernel_size, sigma_space, device=input.device, dtype=input.dtype)
    space_kernel = space_kernel.view(-1, 1, 1, 1, kx * ky)

    kernel = space_kernel * color_kernel
    out = (unfolded_input * kernel).sum(-1) / kernel.sum(-1)
    return out


def adaptive_anisotropic_filter(x, g=None):
    if g is None:
        g = x
    s, m = torch.std_mean(g, dim=(1, 2, 3), keepdim=True)
    s = s + 1e-5
    guidance = (g - m) / s
    y = _bilateral_blur(x, guidance,
                         kernel_size=(13, 13),
                         sigma_color=3.0,
                         sigma_space=3.0,
                         border_type='reflect',
                         color_distance_type='l1')
    return y
