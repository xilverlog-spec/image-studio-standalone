@echo off
chcp 65001 > nul

rem 2026-09-04: cmd.exe는 UNC 경로(\\서버\공유폴더)를 "현재 디렉터리"로 잡지 못해서,
rem NAS에서 이 배치파일을 직접 더블클릭하면 "내부 또는 외부 명령이 아닙니다" 오류가 난다.
rem UNC에서 실행 중이면 이 설치 폴더를 로컬 임시폴더로 복사한 뒤 거기서 다시 실행한다.
set "SRC_DIR=%~dp0"
if "%SRC_DIR:~0,2%"=="\\" (
    echo 네트워크 공유폴더에서 실행 중입니다 — 로컬로 복사한 뒤 다시 시작합니다...
    set "LOCAL_DIR=%TEMP%\ImageStudioInstaller"
    if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
    xcopy "%SRC_DIR%*" "%LOCAL_DIR%\" /E /Y /I /Q > nul
    start "" "%LOCAL_DIR%\설치하기.bat"
    exit /b
)

echo ========================================================
echo   AI Image Studio - 사내 설치 프로그램
echo ========================================================
echo.
echo 관리자 권한이 필요합니다. 권한 요청 창이 뜨면 "예"를 눌러주세요.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC_DIR%Elevate.ps1"

echo.
echo 설치 창이 안 보이거나 바로 닫혔다면 이 창에 오류 메시지가 있는지 확인하세요.
pause
