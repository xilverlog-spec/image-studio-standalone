# Drop this folder into ComfyUI/custom_nodes/ as e.g. "fooocus_port" and restart ComfyUI.
# Applies Fooocus's Adaptive CFG / Sharpness / ADM Scale / ControlNet Softness monkeypatches
# globally (affects every KSampler in the ComfyUI instance, matching how Fooocus itself works),
# and exposes nodes to control the values and to reproduce Vary/Prompt-Expansion behavior.
from .patch import patch_all
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

patch_all()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
