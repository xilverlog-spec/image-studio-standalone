import sys
import subprocess
import urllib.request
import json
import shutil

def check_command(cmd, name):
    path = shutil.which(cmd)
    if path:
        print(f"  ✅ {name}: 감지됨 ({path})")
        return True
    else:
        print(f"  ❌ {name}: 설치되어 있지 않거나 PATH에 없습니다.")
        return False

def check_service(url, name):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as res:
            if res.status in (200, 404, 405): # 서버 응답 확인
                print(f"  ✅ {name}: 정상 가동 중 ({url})")
                return True
    except Exception as e:
        print(f"  ⚠️ {name}: 접속 불가 ({url}) - {e}")
        return False

def main():
    print("🔍 [환경 진단] 다른 PC 실행 환경 체크 중...")
    print("-" * 50)
    
    # 1. 런타임 체크
    has_python = check_command("python", "Python 3.10+")
    has_node = check_command("node", "Node.js (v18+)")
    has_npm = check_command("npm", "NPM 패키지 매니저")
    
    print("-" * 50)
    print("🌐 [연동 서비스 진단] (외부/로컬 AI 엔진)")
    
    # 2. 로컬 서비스 체크
    comfy_ok = check_service("http://localhost:8188", "ComfyUI (이미지 렌더링 엔진)")
    ollama_ok = check_service("http://localhost:11434/api/tags", "Ollama (프롬프트 자동 튜닝 엔진)")
    
    print("-" * 50)
    if not comfy_ok:
        print("💡 [ComfyUI 안내]: ComfyUI가 다른 PC에서 돌고 있다면 backend/.env 파일에")
        print("    COMFYUI_URL=http://<해당PC_IP>:8188 형태로 설정해 주세요.")
    if not ollama_ok:
        print("💡 [Ollama 안내]: 프롬프트 자동 튜닝을 사용하려면 Ollama를 실행해 주세요.")
    
    print("✨ 환경 진단이 완료되었습니다.\n")

if __name__ == "__main__":
    main()
