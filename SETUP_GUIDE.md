# 🛠️ 이미지 생성 스튜디오 — 처음부터 설치하기 (아무것도 없는 새 PC용)

이 문서는 **Python/Node/ComfyUI/모델 중 아무것도 설치되어 있지 않은 새 PC**를 기준으로,
위에서 아래로 순서대로 따라가면 이 폴더(`image-studio-standalone`)가 완전히 동작하도록
작성되었습니다. AI 작업자(Antigravity 등)가 이 문서를 그대로 읽고 한 단계씩 실행하면 됩니다.

각 단계는 이전 단계가 끝난 뒤에만 진행하세요. 중간에 막히면 해당 단계의 "확인" 항목으로
정상 여부를 먼저 점검하세요.

---

## 0단계. 전체 그림

```
[사용자] → 브라우저(:5174, React) → 백엔드(:5000, FastAPI)
                                        ├─→ ComfyUI(:8188)   ← 실제 이미지 렌더링
                                        └─→ Ollama(:11434)   ← 한글→영문 프롬프트 자동 튜닝, 대화형 채팅
```

네 프로세스(프론트, 백엔드, ComfyUI, Ollama)가 전부 로컬에서 떠 있어야 정상 동작합니다.

---

## 1단계. Python 설치

1. [python.org](https://www.python.org/downloads/)에서 **Python 3.10 이상** 설치.
2. 설치 화면에서 **"Add python.exe to PATH"** 체크박스를 반드시 켤 것.
3. 확인:
   ```bash
   python --version
   pip --version
   ```

## 2단계. Node.js 설치

1. [nodejs.org](https://nodejs.org/)에서 **LTS 버전(v18 이상)** 설치.
2. 확인:
   ```bash
   node -v
   npm -v
   ```

## 3단계. GPU/드라이버 확인 (NVIDIA GPU 기준)

ComfyUI는 GPU(VRAM 6GB 이상 권장)가 있어야 실용적인 속도로 동작합니다.
- `nvidia-smi` 명령이 정상 동작하면 드라이버는 이미 설치된 것입니다.
- GPU가 없다면 CPU로도 켜지긴 하지만 이미지 한 장에 수 분~수십 분이 걸릴 수 있습니다.

## 4단계. Ollama 설치 + 모델 다운로드

1. [ollama.com](https://ollama.com/download)에서 Windows용 Ollama 설치 후 실행 (설치하면
   `http://localhost:11434`에서 자동으로 백그라운드 서비스가 뜹니다).
2. 이 스튜디오가 실제로 쓰는 모델을 받습니다:
   ```bash
   ollama pull qwen2.5-coder:7b
   ```
   (대화형 탭, 프롬프트 다듬기, 자동 튜닝이 전부 이 모델 하나를 씁니다. PPT/슬라이드 스튜디오
   전용 모델인 `gemma4:e2b` 등은 이 이미지 스튜디오에는 필요 없습니다.)
3. 확인:
   ```bash
   ollama list
   ```
   목록에 `qwen2.5-coder:7b`가 보이면 완료.

## 5단계. ComfyUI 설치

1. 아무 폴더에나(예: `C:\ComfyUI`) 아래 방법 중 하나로 설치합니다.
   - **방법 A (권장, 초보자용)**: ComfyUI 공식 GitHub 릴리즈 페이지에서 Windows용
     **"Portable"** 압축 패키지를 받아 원하는 폴더에 그대로 풀기만 하면 됩니다(파이썬/torch가
     내장되어 있어 별도 설치가 거의 필요 없음).
   - **방법 B (git 사용)**:
     ```bash
     git clone https://github.com/comfyanonymous/ComfyUI.git
     cd ComfyUI
     python -m venv venv
     venv\Scripts\activate
     pip install -r requirements.txt
     ```
     NVIDIA GPU라면 CUDA 버전에 맞는 PyTorch를 ComfyUI 공식 README 안내대로 먼저 설치하세요.
2. 실행:
   - Portable판: `run_nvidia_gpu.bat` (또는 CPU만 있다면 `run_cpu.bat`) 더블클릭.
   - git판: `python main.py` (venv 활성화된 상태에서).
3. 확인: 브라우저로 `http://localhost:8188` 접속 시 ComfyUI 화면이 뜨면 성공.

### 5-1단계. 체크포인트(생성 모델) 설치 — 최소 1개는 필수

`ComfyUI/models/checkpoints/` 폴더에 `.safetensors` 체크포인트 파일을 최소 1개 넣어야
이미지 생성이 가능합니다. 이 스튜디오는 어떤 체크포인트든 설치된 것 중 자동으로 하나를 골라
쓰지만(`get_available_checkpoint`), 아래 3종을 넣으면 **자동 튜닝(AI가 알아서 스타일/체크포인트를
고르는 기능)의 정확도가 가장 높습니다** — 코드의 카테고리 매칭 규칙이 이 이름들을 기준으로
작성되어 있기 때문입니다(`backend/routes/media.py`의 `CATEGORY_CHECKPOINT_HINTS`).

| 용도 | 파일명에 포함되어야 하는 문구 | 예시 파일명 |
|---|---|---|
| 건축/공간 렌더링 | `juggernaut` | `Juggernaut-XL_v9.safetensors` |
| 인물/시네마틱 사실적 사진 | `realvisxl` | `RealVisXL_V5.0_fp16.safetensors` |
| 범용 사실적 사진(기본값) | `realistic_vision` 또는 `realisticvision` | `Realistic_Vision_V6.0_NV_B1_fp16.safetensors` |

Civitai 또는 HuggingFace에서 위 표의 모델명으로 검색해 `.safetensors` 파일을 받아
`ComfyUI/models/checkpoints/`에 넣으면 됩니다. **위 3개가 다 없어도 스튜디오 자체는 켜지고
동작하며**, 설치된 체크포인트 중 하나로 생성됩니다 — 다만 자동 튜닝이 카테고리별로 다른
모델을 골라주는 정교함은 떨어집니다.

### 5-2단계. LoRA 설치 (선택, 건축 렌더링 품질 향상용)

건축/공간 디자인 프롬프트에 자동으로 함께 적용되는 LoRA입니다. 없어도 생성 자체는 되지만,
건축 렌더링 품질이 눈에 띄게 좋아집니다.

- `ComfyUI/models/loras/`에 파일명에 `arcviz`가 포함된 ArcvizXL 계열 LoRA를 넣으면
  자동 인식됩니다(트리거 단어 `arcviz_1`이 코드에 이미 내장되어 있어 별도 설정 불필요).

### 5-3단계. 업스케일 모델 설치 (선택, "4K 업스케일" 버튼용)

- `ComfyUI/models/upscale_models/`에 `RealESRGAN_x4plus.pth`(약 67MB)를 넣으면 생성된
  이미지를 4배 확대하는 업스케일 기능이 동작합니다. 없어도 나머지 기능(생성/대화/이력)은
  정상 동작하고, 업스케일 버튼만 오류를 반환합니다.

### 확인 (5단계 전체)
ComfyUI가 켜진 상태에서 아래 주소들에 브라우저로 접속했을 때 JSON이 보이면 정상입니다:
- `http://localhost:8188/object_info/CheckpointLoaderSimple` → 방금 넣은 체크포인트 이름이 보여야 함

## 6단계. 이 스튜디오(image-studio-standalone) 설치

이 폴더(`image-studio-standalone`) 전체를 새 PC의 원하는 위치로 복사한 뒤:

```bash
# 폴더 루트에서
install.bat
```
더블클릭 한 번으로 아래가 자동 실행됩니다:
- `backend/requirements.txt` 기준 Python 패키지 설치
- `npm install`
- 환경 진단(`check_env.py`) — Python/Node/ComfyUI(:8188)/Ollama(:11434) 연결 상태를 점검해 알려줍니다.

진단 결과에서 ComfyUI/Ollama가 "접속 불가"로 나오면 4~5단계가 아직 끝나지 않았다는 뜻이니
그것부터 해결하세요.

## 7단계. 실행

```bash
run_studio.bat
```
- 백엔드가 `http://localhost:5000`, 프론트엔드가 `http://localhost:5174`에서 뜹니다.
- 브라우저에서 `http://localhost:5174` 접속.

### 최종 확인 체크리스트
- [ ] 브라우저에 "AI 이미지 생성 스튜디오" 화면이 뜬다
- [ ] 좌측 "💬 대화형" 탭에서 메시지를 보내면 디자이너가 응답한다 (Ollama 연동 확인)
- [ ] "✍️ 프롬프트 입력" 탭에서 화면비/품질 드롭다운에 옵션이 채워져 있다
- [ ] "체크포인트 모델" 드롭다운에 5단계에서 넣은 모델 이름이 보인다 (ComfyUI 연동 확인)
- [ ] 프롬프트를 입력하고 "이미지 바로 생성하기"를 누르면 우측 갤러리에 이미지가 나타난다
- [ ] 브라우저를 새로고침해도 갤러리 이미지가 그대로 남아 있다 (SQLite 이력 확인)

## 원격 GPU PC 구성 (선택)

ComfyUI나 Ollama를 GPU가 더 좋은 다른 PC에서 돌리고 싶다면, 이 스튜디오가 실행되는
PC에서 `backend/.env`를 만들고(`.env.example` 복사) 아래처럼 IP를 지정하세요:
```
COMFYUI_URL=http://<ComfyUI가 도는 PC의 IP>:8188
OLLAMA_URL=http://<Ollama가 도는 PC의 IP>:11434
```
