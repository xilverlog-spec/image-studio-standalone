import os
import sys
from dotenv import load_dotenv

# .env는 comfyui_client.py/config.py가 os.getenv()로 값을 읽기 전에 먼저 로드되어야 한다.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=5000, reload=False)
