@echo off
chcp 65001 > nul
title AI Image Studio
echo ========================================================
echo   AI Image Studio 실행 중...
echo ========================================================
echo.

set APP_DIR=%~dp0..\..
set COMFY_DIR=C:\ImageStudio\ComfyUI

echo [1/3] ComfyUI 시작 중 (Port 8188)...
tasklist /FI "WINDOWTITLE eq ComfyUI (8188)*" | find "cmd.exe" > nul
if %errorlevel% neq 0 (
    if exist "%COMFY_DIR%\run_nvidia_gpu.bat" (
        start "ComfyUI (8188)" /min cmd /c "cd /d %COMFY_DIR% && run_nvidia_gpu.bat"
    ) else if exist "%COMFY_DIR%\venv\Scripts\python.exe" (
        start "ComfyUI (8188)" /min cmd /c "cd /d %COMFY_DIR% && venv\Scripts\python.exe main.py --port 8188"
    ) else (
        echo   [!] ComfyUI를 찾을 수 없습니다: %COMFY_DIR%
    )
) else (
    echo   이미 실행 중입니다.
)

echo [2/3] Ollama 확인 중...
tasklist /FI "IMAGENAME eq ollama.exe" | find "ollama.exe" > nul
if %errorlevel% neq 0 (
    start "" /min ollama serve
) else (
    echo   이미 실행 중입니다.
)

echo [3/3] 백엔드 서버 시작 중 (Port 5000)...
cd /d "%APP_DIR%\backend"
set PYTHONUTF8=1
start "AI Image Studio Server" cmd /k "chcp 65001 > nul && python server.py"

echo.
echo 서버가 켜질 때까지 몇 초 기다린 뒤 브라우저를 엽니다...
timeout /t 5 /nobreak > nul
start "" http://localhost:5000

echo.
echo 브라우저가 안 열리면 직접 http://localhost:5000 으로 접속하세요.
echo 이 창은 닫아도 됩니다 (서버는 별도 창에서 계속 실행됩니다).
pause
