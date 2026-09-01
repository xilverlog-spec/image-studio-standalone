@echo off
chcp 65001 > nul
echo ========================================================
echo   🎨 AI Image Studio (Standalone) 1-Click Installer
echo ========================================================
echo.

echo [1/4] Python 가상환경 및 백엔드 패키지 점검/설치 중...
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [경고] pip 설치 중 오류가 발생했습니다. Python이 PATH에 잡혀있는지 확인하세요.
) else (
    echo [성공] Python 백엔드 필수 패키지 설치 완료!
)
echo.

echo [2/4] Node.js 프론트엔드 패키지 설치 중...
call npm install
if %errorlevel% neq 0 (
    echo [경고] npm install 중 오류가 발생했습니다. Node.js가 설치되어 있는지 확인하세요.
) else (
    echo [성공] Node.js 의존성 패키지 설치 완료!
)
echo.

echo [3/4] 환경 진단 스크립트 실행 중...
python .agents\skills\image_studio_installer\scripts\check_env.py
echo.

echo ========================================================
echo   ✨ 설치 및 진단이 완료되었습니다!
echo   실행하려면 run_studio.bat 을 더블 클릭하세요.
echo ========================================================
pause
