@echo off
chcp 65001 > nul
echo 백엔드/ComfyUI를 작업 스케줄러에 등록합니다 (로그인 시 자동 시작 + 죽으면 자동 재시작)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Register-Servers-Task.ps1"
echo.
pause
