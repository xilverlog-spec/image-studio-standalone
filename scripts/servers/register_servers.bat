@echo off
chcp 65001 > nul
echo 서버 감시 스크립트를 작업 스케줄러에 등록합니다 (로그인 시 시작 + 5분마다 확인)...
echo (백엔드 5000 / ComfyUI 8188 이 꺼지거나 멈추면 자동으로 다시 시작합니다)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Register-Servers-Task.ps1"
if %errorlevel% neq 0 (
    echo.
    echo 등록이 거부되면 관리자 권한으로 다시 시도합니다. 권한 요청 창에서 "예"를 눌러 주세요...
    powershell -NoProfile -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0Register-Servers-Task.ps1\"'"
)
echo.
pause
