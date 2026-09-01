---
name: "image_studio_installer"
description: "AI 이미지 생성 스튜디오(image-studio-standalone)를 새로운 PC나 원격 환경에 처음 가져갔을 때, Python/Node.js 의존성을 1-Click 자동 설치하고 ComfyUI/Ollama 연결 상태를 진단해 즉시 실행 환경을 구축해주는 설치용 스킬입니다."
---

# 🛠️ AI 이미지 생성 스튜디오 설치 스킬 (image_studio_installer)

이 스킬은 `image-studio-standalone` 폴더를 다른 PC로 복사했을 때 필요한 필수 런타임, 라이브러리, 프론트엔드 의존성을 원클릭으로 셋업하고 정상 가동 상태를 보장하는 설치 가이드 및 자동화 스킬입니다.

---

## 📋 필수 사전 준비 항목 (Prerequisites)

새로운 PC에는 다음 기본 도구가 설치되어 있어야 합니다:
1. **Python 3.10 이상**: `python --version`
2. **Node.js v18 이상 & NPM**: `node -v`, `npm -v`
3. **ComfyUI**: 로컬 실행(`http://localhost:8188`) 또는 네트워크 상의 ComfyUI 서버
   (체크포인트 최소 1개 필요)
4. **Ollama**: 로컬 실행(`http://localhost:11434`) + `qwen2.5-coder:7b` 모델 pull 완료

**아무것도 설치되어 있지 않은 완전히 새 PC**라면, 이 스킬 대신 폴더 루트의
[`SETUP_GUIDE.md`](../../../SETUP_GUIDE.md)를 0단계부터 순서대로 따라가세요. 이 스킬은
"Python/Node/ComfyUI/Ollama는 이미 있고 이 폴더만 설치하면 되는" 경우를 위한 것입니다.

---

## ⚡ 원클릭 자동 설치 절차

### 방법 1. 윈도우 원클릭 배치파일 실행 (가장 추천)
폴더 루트에 위치한 **`install.bat`** 파일을 더블 클릭합니다.
- `backend/requirements.txt` 기준 Python 백엔드 패키지 자동 설치
- React 프론트엔드 `npm install` 의존성 자동 설치
- `check_env.py`를 통한 네트워크/AI 서비스 연결 상태 자동 진단

### 방법 2. CLI / 터미널 직접 실행
```bash
# 1. 백엔드 패키지 설치
pip install -r backend/requirements.txt

# 2. 프론트엔드 패키지 설치
npm install

# 3. 환경 진단 스크립트 실행
python .agents/skills/image_studio_installer/scripts/check_env.py
```

---

## 🚀 앱 실행 (1-Click Run)

설치가 완료되면 루트의 **`run_studio.bat`**을 더블 클릭하거나 터미널에서 실행합니다:
```bash
# 백엔드 (Port 5000)
cd backend && python server.py

# 프론트엔드 (Port 5174)
npm run dev
```
* 웹 브라우저 접속: `http://localhost:5174`

---

## 🌐 원격/네트워크 ComfyUI 연동 안내
ComfyUI가 다른 고사양 GPU PC에서 실행 중인 경우:
1. `backend/.env` 파일을 생성
2. `COMFYUI_URL=http://192.168.0.XXX:8188` 와 같이 IP를 지정하면 해당 PC의 GPU를 활용해 이미지를 생성합니다.
