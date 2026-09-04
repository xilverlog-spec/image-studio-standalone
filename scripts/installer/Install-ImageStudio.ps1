# AI Image Studio - 사내 배포용 원클릭 설치 스크립트
# 2026-09-04: 100명 규모 배포를 위해 만듦. NAS(사내 공유폴더)에 미리 준비해둔
# ComfyUI(체크포인트/LoRA 포함), Ollama 모델, 앱 본체를 로컬 PC로 그대로 복사해와서
# 설치한다 - 인터넷에서 대용량 파일을 새로 받지 않으므로 사내망 속도로 빠르게 끝난다.
#
# 전제: 아래 NAS 경로 밑에 이런 구조로 "완성본"이 미리 올라가 있어야 한다.
#   AI Image Studio\
#     ComfyUI\                 (체크포인트/LoRA/업스케일 모델/커스텀노드까지 다 넣은 완성본)
#     Ollama\OllamaSetup.exe
#     Ollama\models\           (관리자 PC의 %USERPROFILE%\.ollama\models 를 그대로 복사)
#     app\                     (이 프로젝트 폴더. node_modules/.git 제외, dist/는 빌드 완료 상태)
#     python-installer.exe     (python.org에서 받은 Windows용 설치 파일)

param(
    [string]$NasRoot = "\\192.168.166.7\Ax-lab\AI Image Studio",
    [string]$InstallRoot = "C:\ImageStudio"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [X] $msg" -ForegroundColor Red }

Write-Host "========================================================"
Write-Host "  AI Image Studio - 사내 배포 설치 프로그램"
Write-Host "========================================================"

# ── 0. NAS 접근 확인 ──
Write-Step "0/6 공유폴더 접근 확인"
if (-not (Test-Path $NasRoot)) {
    Write-Err "공유폴더에 접근할 수 없습니다: $NasRoot"
    Write-Err "사내망에 연결되어 있는지, 경로가 맞는지 확인하세요."
    Read-Host "엔터를 누르면 종료합니다"
    exit 1
}
Write-Ok "공유폴더 확인됨: $NasRoot"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

# ── 1. Python 설치 확인/설치 ──
Write-Step "1/6 Python 확인"
$hasPython = $null -ne (Get-Command python -ErrorAction SilentlyContinue)
if ($hasPython) {
    Write-Ok "Python 이미 설치됨: $(python --version)"
} else {
    $pyInstaller = Join-Path $NasRoot "python-installer.exe"
    if (Test-Path $pyInstaller) {
        Write-Warn "Python이 없어서 자동 설치를 시작합니다 (몇 분 소요될 수 있음)..."
        Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_launcher=0" -Wait
        Write-Ok "Python 설치 완료. 새 PATH를 반영하기 위해 이 창을 닫고 설치 프로그램을 다시 실행해주세요."
        Read-Host "엔터를 누르면 종료합니다"
        exit 0
    } else {
        Write-Err "Python이 없고, NAS에 python-installer.exe도 없습니다. python.org에서 직접 설치 후 다시 실행하세요."
        Read-Host "엔터를 누르면 종료합니다"
        exit 1
    }
}

# ── 2. ComfyUI 복사 ──
Write-Step "2/6 ComfyUI (렌더링 엔진 + 체크포인트) 복사"
$comfyDest = Join-Path $InstallRoot "ComfyUI"
$comfyPortable = Join-Path $comfyDest "run_nvidia_gpu.bat"
$comfyVenv = Join-Path $comfyDest "venv\Scripts\python.exe"
if ((Test-Path $comfyPortable) -or (Test-Path $comfyVenv)) {
    Write-Ok "이미 설치되어 있어 건너뜁니다: $comfyDest"
} else {
    $comfySrc = Join-Path $NasRoot "ComfyUI"
    if (-not (Test-Path $comfySrc)) {
        Write-Err "NAS에 ComfyUI 폴더가 없습니다: $comfySrc"
        Read-Host "엔터를 누르면 종료합니다"
        exit 1
    }
    Write-Host "  복사 중... (체크포인트 포함이라 용량이 크고 시간이 걸립니다)"
    robocopy $comfySrc $comfyDest /E /Z /MT:8 /R:2 /W:5 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Err "ComfyUI 복사 중 오류 발생 (robocopy 코드 $LASTEXITCODE)"
        exit 1
    }
    Write-Ok "ComfyUI 복사 완료"
}

# ── 3. Ollama 설치 + 모델 복사 ──
Write-Step "3/6 Ollama (프롬프트 튜닝 엔진) 설치"
$hasOllama = $null -ne (Get-Command ollama -ErrorAction SilentlyContinue)
if (-not $hasOllama) {
    $ollamaInstaller = Join-Path $NasRoot "Ollama\OllamaSetup.exe"
    if (Test-Path $ollamaInstaller) {
        Write-Host "  Ollama 설치 중..."
        Start-Process -FilePath $ollamaInstaller -ArgumentList "/SILENT" -Wait
        Start-Sleep -Seconds 3
        Write-Ok "Ollama 설치 완료"
    } else {
        Write-Warn "NAS에 OllamaSetup.exe가 없어 Ollama 설치를 건너뜁니다. (대화형/프롬프트 다듬기 기능이 동작하지 않습니다)"
    }
} else {
    Write-Ok "Ollama 이미 설치됨"
}

Write-Step "3-1/6 Ollama 모델 복사 (인터넷 다운로드 없이 NAS에서 바로 복사)"
$ollamaModelsSrc = Join-Path $NasRoot "Ollama\models"
$ollamaModelsDest = Join-Path $env:USERPROFILE ".ollama\models"
if (Test-Path $ollamaModelsSrc) {
    New-Item -ItemType Directory -Force -Path $ollamaModelsDest | Out-Null
    robocopy $ollamaModelsSrc $ollamaModelsDest /E /Z /MT:8 /R:2 /W:5 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Warn "Ollama 모델 복사 중 일부 오류 (robocopy 코드 $LASTEXITCODE) - 이후 ollama pull로 직접 받아도 됩니다"
    } else {
        Write-Ok "Ollama 모델 복사 완료"
    }
} else {
    Write-Warn "NAS에 Ollama 모델이 없어 건너뜁니다. 필요하면 나중에 'ollama pull qwen2.5-coder:7b'를 직접 실행하세요."
}

# ── 4. 앱 본체 복사 ──
Write-Step "4/6 AI Image Studio 앱 복사"
$appDest = Join-Path $InstallRoot "app"
$appSrc = Join-Path $NasRoot "app"
if (-not (Test-Path $appSrc)) {
    Write-Err "NAS에 app 폴더가 없습니다: $appSrc"
    Read-Host "엔터를 누르면 종료합니다"
    exit 1
}
robocopy $appSrc $appDest /E /Z /MT:8 /R:2 /W:5 /NFL /NDL /NP /XD node_modules .git | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Err "앱 복사 중 오류 발생 (robocopy 코드 $LASTEXITCODE)"
    exit 1
}
Write-Ok "앱 복사 완료: $appDest"

# ── 5. 백엔드 Python 패키지 설치 ──
Write-Step "5/6 Python 패키지 설치"
Push-Location $appDest
& python -m pip install --quiet --upgrade pip
& python -m pip install --quiet -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Err "pip install 실패"
    Pop-Location
    exit 1
}
Pop-Location
Write-Ok "패키지 설치 완료"

# ── 6. 바탕화면 바로가기 생성 ──
Write-Step "6/6 바탕화면 바로가기 생성"
$startBat = Join-Path $appDest "scripts\installer\Start-ImageStudio.bat"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "AI Image Studio.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startBat
$shortcut.WorkingDirectory = $appDest
$shortcut.Save()
Write-Ok "바로가기 생성됨: $shortcutPath"

Write-Host "`n========================================================"
Write-Host "  설치가 완료되었습니다!"
Write-Host "  바탕화면의 'AI Image Studio' 아이콘을 더블클릭해 실행하세요."
Write-Host "========================================================"
Read-Host "엔터를 누르면 종료합니다"
