import os
import sys
from dotenv import load_dotenv

# .env는 comfyui_client.py/config.py가 os.getenv()로 값을 읽기 전에 먼저 로드되어야 한다.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from routes.media import router as media_router
from routes.chat import router as chat_router
from services.image_history_store import init_image_history_db

app = FastAPI(title="AI Image Studio Standalone API", version="1.0.0")

# CORS middleware for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Image Generation & ComfyUI Media Router (media_router already has prefix="/v1")
app.include_router(media_router)
app.include_router(chat_router)

init_image_history_db()

# 생성된 이미지는 이 패키지 안에서 완결되도록 로컬 output/images 폴더에만 저장한다
# (DX 랩 본체의 workspace_outputs 산출물 보관함은 여러 스튜디오가 공유하는 개념이라
# 독립 패키지에는 맞지 않는다 — 다른 프로젝트 경로로 되돌아가지 않는다).
OUTPUT_IMAGES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "output", "images"))
os.makedirs(OUTPUT_IMAGES_DIR, exist_ok=True)
app.mount("/generated", StaticFiles(directory=OUTPUT_IMAGES_DIR), name="generated")

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "image-studio-standalone"}

# 2026-09-04: 100명 규모 사내 배포를 위해 각 PC에 Node.js/npm 설치를 요구하지 않도록,
# `npm run build`로 미리 빌드해둔 정적 파일(dist/)을 백엔드가 직접 서빙한다 — 이러면
# 설치기가 Python 하나만 준비하면 되고, 프론트도 백엔드도 이 프로세스 하나(포트 5000)로 뜬다.
# dist/가 없으면(개발 중 `npm run dev`로 따로 띄우는 경우) 조용히 건너뛴다.
FRONTEND_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
if os.path.isdir(FRONTEND_DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")), name="frontend-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = os.path.join(FRONTEND_DIST_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        # SPA 라우팅: 나머지 경로는 전부 index.html로 돌려보내 React Router 등에 위임한다.
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=5000, reload=False)
