#!/usr/bin/env python3
"""
ComfyUI에 인기 있는 무료 SDXL 모델들을 자동으로 다운로드하는 스크립트
"""
import os
import urllib.request
import json
from pathlib import Path

# 다운로드할 모델 목록 (Hugging Face)
MODELS = [
    {
        "name": "dreamshaperXL_turboDpmppSde.safetensors",
        "url": "https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaperXL_Turbo_v2_1.safetensors",
        "description": "DreamShaper XL Turbo"
    },
    {
        "name": "realvisxlV50_v50Bakedvae.safetensors",
        "url": "https://huggingface.co/SG161222/RealVisXL_V5.0/resolve/main/RealVisXL_V5.0_BAKEDVAE.safetensors",
        "description": "RealVisXL V5.0"
    },
    {
        "name": "sd_xl_turbo_1.0_fp16.safetensors",
        "url": "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors",
        "description": "SDXL Turbo (빠른 생성)"
    },
]

def download_model(url, output_path):
    """모델 파일 다운로드"""
    try:
        print(f"다운로드 중: {url}")
        print(f"저장 위치: {output_path}")

        def progress_hook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, int(100.0 * downloaded / total_size))
                print(f"  진행률: {percent}% ({downloaded / (1024*1024):.1f}MB / {total_size / (1024*1024):.1f}MB)")

        urllib.request.urlretrieve(url, output_path, progress_hook)
        print(f"✓ 다운로드 완료: {output_path}\n")
        return True
    except Exception as e:
        print(f"✗ 다운로드 실패: {e}\n")
        return False

def main():
    checkpoint_dir = os.path.expanduser("~/Downloads/ComfyUI/models/checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)

    print("=" * 60)
    print("ComfyUI SDXL 모델 자동 다운로드")
    print("=" * 60)
    print(f"저장 폴더: {checkpoint_dir}\n")

    downloaded = 0
    for model in MODELS:
        output_path = os.path.join(checkpoint_dir, model["name"])

        # 이미 다운로드되었으면 스킵
        if os.path.exists(output_path):
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"[OK] 이미 있음 (크기: {size_mb:.1f}MB): {model['name']}")
            continue

        print(f"\n[DL] {model['description']} 다운로드")
        if download_model(model["url"], output_path):
            downloaded += 1

    print("=" * 60)
    print(f"완료: {downloaded}개 모델 다운로드됨")
    print("=" * 60)

if __name__ == "__main__":
    main()
