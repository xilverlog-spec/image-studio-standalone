# 🎨 AI 이미지 생성 스튜디오 (Standalone 독립 패키지)

이 폴더는 **DX 디자인 랩의 '이미지 생성 스튜디오' 기능만을 100% 독립 분리**하여 다른 PC에서
단독으로 실행하고 완성할 수 있도록 구성된 패키지입니다. DX 랩 본체(위키, 텔레그램, PPT/슬라이드
생성, 멀티 에이전트 시스템 등)에 대한 의존성은 전혀 없습니다.

**새 PC에 아무것도 설치되어 있지 않다면 → [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)를 처음부터
그대로 따라가세요.** 아래는 이미 환경이 갖춰졌다는 전제의 요약입니다.

---

## 📁 폴더 구성

```
image-studio-standalone/
├── backend/                        # FastAPI 백엔드 (Port 5000)
│   ├── routes/
│   │   ├── media.py                # 이미지 생성/이력/업스케일/자동튜닝 라우터
│   │   └── chat.py                 # 대화형 탭이 쓰는 /v1/chat/completions
│   ├── services/
│   │   ├── image_history_store.py  # SQLite 생성 이력 저장소
│   │   └── simple_chat.py          # Ollama 직결 채팅 래퍼 (자동튜닝도 여기 사용)
│   ├── comfyui_client.py           # ComfyUI(Port 8188) 연동 클라이언트 & 프리셋
│   ├── config.py                   # DB 경로, Ollama URL 등 최소 설정
│   ├── requirements.txt
│   └── server.py                   # 독립 구동 FastAPI 서버
├── comfyui_workflows/
│   └── sdxl_turbo_workflow.json    # 실제 생성에 쓰이는 ComfyUI 워크플로 템플릿 (필수)
├── src/                            # React + Vite 프론트엔드 (Port 5174)
│   ├── App.jsx                     # 대화형 탭 + 프롬프트 탭 + 갤러리
│   ├── main.jsx
│   └── index.css
├── .env.example                    # backend/.env로 복사해서 사용
├── package.json / vite.config.js
└── SETUP_GUIDE.md                  # 처음부터 차근차근 설치 가이드
```

`data/`(SQLite DB)와 `output/images/`(생성된 이미지)는 최초 실행 시 자동으로 생성됩니다.

---

## 🚀 실행 방법 (환경이 이미 갖춰졌다면)

### 1. 백엔드
```bash
cd backend
pip install -r requirements.txt
python server.py
```
* 백엔드: `http://localhost:5000`
* ComfyUI 연동: `http://localhost:8188` (기본값, `.env`로 변경 가능)
* Ollama 연동: `http://localhost:11434` (기본값, `.env`로 변경 가능)

### 2. 프론트엔드
```bash
npm install
npm run dev
```
* 브라우저 접속: `http://localhost:5174`

또는 루트의 `run_studio.bat`을 더블클릭하면 둘 다 자동으로 실행됩니다.

---

## ⚙️ 주요 화면 구성

1. **💬 대화형 탭**: 디자이너 페르소나와 대화하며 원하는 이미지를 구체화합니다. 이 탭에서는
   이미지가 생성되지 않습니다 — "🧭 이 대화로 생성 준비하기" 버튼을 눌러야 대화 전체를
   요약한 최종 프롬프트가 프롬프트 탭으로 넘어갑니다.
2. **✍️ 프롬프트 입력 탭**: 한글 프롬프트를 직접 쓰거나 대화 탭에서 넘어온 프롬프트를 검토/수정한
   뒤, 화면비/품질/스타일/체크포인트/수량을 정하고 실제 생성을 실행합니다. **이미지 생성은 오직
   이 탭의 버튼을 눌러야만 일어납니다.**
3. **생성 갤러리**: 이력이 새로고침 후에도 남고(SQLite), 각 항목을 클릭하면 크게 볼 수 있고
   삭제할 수 있습니다.

## 🧠 필요한 외부 서비스

- **ComfyUI** (이미지 실제 렌더링) — 꺼져 있으면 생성 버튼을 눌러도 실패합니다.
- **Ollama** (한글 프롬프트 → 영문 자동 튜닝, 대화형 탭) — 꺼져 있으면 대화/자동튜닝만 실패하고
  프롬프트 직접 생성은 (자동튜닝 없이) 계속 시도됩니다.

둘 다 다른 PC(예: GPU가 더 좋은 PC)에서 돌고 있다면, `backend/.env`에 `COMFYUI_URL=`/`OLLAMA_URL=`을
지정하세요(`.env.example` 참고).
