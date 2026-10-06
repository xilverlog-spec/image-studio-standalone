@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 관리자 권한이 필요합니다. 권한 요청 창에서 "예"를 눌러 주세요...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo 백엔드/ComfyUI를 작업 스케줄러에 등록합니다 (로그인 시 자동 시작 + 죽으면 자동 재시작)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Register-Servers-Task.ps1"
echo.
pause
