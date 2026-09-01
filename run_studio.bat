@echo off
chcp 65001 > nul
echo ========================================================
echo   🚀 AI Image Studio (Standalone) 런처
echo ========================================================
echo.

echo [1/3] ComfyUI 시작 중 (Port 8188)...
if exist "C:\ComfyUI\venv\Scripts\python.exe" (
    start "ComfyUI (8188)" cmd /k "cd /d C:\ComfyUI && venv\Scripts\python.exe main.py --port 8188"
) else (
    echo   ⚠️ C:\ComfyUI 를 찾을 수 없습니다 — SETUP_GUIDE.md 5단계를 먼저 진행하세요.
)

echo [2/3] 백엔드 서버 시작 중 (Port 5000)...
start "Image Studio Backend (5000)" cmd /k "chcp 65001 > nul && cd backend && set PYTHONUTF8=1 && python server.py"

echo [3/3] 프론트엔드 개발 서버 시작 중 (Port 5174)...
start "Image Studio Frontend (5174)" cmd /k "npm run dev"

echo.
echo ✅ 서비스가 시작되었습니다!
echo 🌐 브라우저 접속 주소: http://localhost:5174
echo.
pause
