#!/usr/bin/env python3
"""Hugging Face에서 체크포인트 모델 다운로드"""

import os
from pathlib import Path
from huggingface_hub import hf_hub_download

# 다운로드 경로
CHECKPOINT_DIR = r"C:\Users\unjin\Downloads\ComfyUI\models\checkpoints"
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

# 다운로드할 모델들
MODELS = [
    ("stabilityai/stable-diffusion-xl-base-1.0", "sd_xl_base_1.0.safetensors"),
    ("runwayml/stable-diffusion-v1-5", "v1-5-pruned-emaonly.safetensors"),
]

print("🚀 Hugging Face에서 모델 다운로드 시작...\n")

for repo_id, filename in MODELS:
    try:
        print(f"⏳ {filename} 다운로드 중...")
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            cache_dir=CHECKPOINT_DIR,
        )
        print(f"✅ {filename} 다운로드 완료\n")
    except Exception as e:
        print(f"❌ {filename} 실패: {e}\n")

print("모든 다운로드 완료! 🎉")
