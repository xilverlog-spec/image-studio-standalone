# 사내 배포용 NAS 준비 가이드 (관리자용, 1회만 하면 됨)

100명이 쓸 설치 프로그램(`설치하기.bat`)은 아래 경로에서 필요한 파일을 그대로 복사해온다.
그러니 이 문서대로 **NAS(`\\192.168.166.7\Ax-lab\AI Image Studio`) 안에 미리 다 채워놓는
작업**을 먼저 한 번 해야 한다. 여기 준비만 끝나면, 이후 100명은 `설치하기.bat` 더블클릭
한 번으로 끝난다.

## 최종적으로 NAS에 있어야 하는 구조

```
\\192.168.166.7\Ax-lab\AI Image Studio\
├── ComfyUI\                     ← 지금 이 PC에서 잘 돌아가는 ComfyUI 폴더 통째로
│                                    (체크포인트/LoRA/업스케일모델/커스텀노드 다 포함된 "완성본")
├── Ollama\
│   ├── OllamaSetup.exe          ← ollama.com에서 받은 Windows 설치파일
│   └── models\                  ← 이 PC의 %USERPROFILE%\.ollama\models 를 그대로 복사
├── app\                         ← 이 프로젝트 폴더 (아래 "app 폴더 준비" 참고)
└── python-installer.exe         ← python.org에서 받은 Windows용 설치파일 (3.10 이상)
```

## 1. ComfyUI 통째로 복사

지금 쓰고 있는 `C:\ComfyUI` (또는 실제 설치 경로) 폴더를 그대로
`\\192.168.166.7\Ax-lab\AI Image Studio\ComfyUI` 로 복사하면 된다.
체크포인트, LoRA, 커스텀 노드가 전부 이미 설치되어 있으니 그대로 복사하는 게 제일 빠르고
안전하다 (다른 PC에서 또 설치할 필요 없음).

```powershell
robocopy "C:\ComfyUI" "\\192.168.166.7\Ax-lab\AI Image Studio\ComfyUI" /E /Z /MT:8
```

## 2. Ollama 설치파일 + 모델 복사

1. [ollama.com/download](https://ollama.com/download) 에서 Windows용 `OllamaSetup.exe`를 받아
   `\\192.168.166.7\Ax-lab\AI Image Studio\Ollama\OllamaSetup.exe` 에 넣는다.
2. 이 PC에 이미 받아둔 모델(`qwen2.5-coder:7b`)을 다시 인터넷에서 받을 필요 없이 그대로
   복사한다 — Ollama는 모델을 `%USERPROFILE%\.ollama\models` 밑에 파일로 저장해두기 때문에,
   그 폴더를 통째로 복사하면 다른 PC에서도 인터넷 없이 그대로 인식한다.

```powershell
robocopy "$env:USERPROFILE\.ollama\models" "\\192.168.166.7\Ax-lab\AI Image Studio\Ollama\models" /E /Z /MT:8
```

## 3. Python 설치파일

[python.org/downloads](https://www.python.org/downloads/) 에서 Windows installer(64-bit,
3.10 이상)를 받아 `\\192.168.166.7\Ax-lab\AI Image Studio\python-installer.exe` 에 넣는다.

## 4. app 폴더 준비

이 프로젝트 폴더를 배포용으로 정리해서 NAS에 올린다. 프론트엔드는 미리 빌드해둬야
각 직원 PC에 Node.js를 설치할 필요가 없어진다.

```powershell
# 1) 프론트엔드 빌드 (dist/ 폴더 생성)
npm run build

# 2) NAS로 복사 (node_modules, .git, data, output은 제외 — 용량 크고 개인 PC마다 새로 생성됨)
robocopy "." "\\192.168.166.7\Ax-lab\AI Image Studio\app" /E /Z /MT:8 /XD node_modules .git data output "참고자료"
```

## 5. 새 버전 배포할 때 (업데이트)

앱 코드를 고친 뒤 다시 전 직원한테 반영하고 싶으면, **4번(app 폴더)만 다시** NAS에
덮어쓰면 된다 (ComfyUI/Ollama는 그대로 두면 됨). 각 직원은 `설치하기.bat`을 다시
실행하면 `app` 폴더만 최신 버전으로 덮어써진다 (ComfyUI/Ollama는 이미 있으면 건너뛰므로
매번 새로 받지 않음).

## 검증

준비가 끝나면 사내망에 연결된 아무 PC(가급적 아직 아무것도 안 깔린 PC)에서
`\\192.168.166.7\Ax-lab\AI Image Studio\app\scripts\installer\설치하기.bat` 를
직접 실행해서 끝까지 잘 되는지 먼저 1대에 테스트해보고, 문제없으면 그때 전 직원한테
경로를 공지하면 된다.
