@echo off
chcp 65001 > nul
echo ========================================================
echo   AI Image Studio - 사내 설치 프로그램
echo ========================================================
echo.
echo 관리자 권한이 필요합니다. 권한 요청 창이 뜨면 "예"를 눌러주세요.
echo.

set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT_DIR%Install-ImageStudio.ps1\"' -Verb RunAs -Wait"
