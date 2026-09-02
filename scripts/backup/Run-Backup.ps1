<#
.SYNOPSIS
  Windows 작업 스케줄러가 매시간 실행하는 로컬 Git 백업.
  이 PC의 실제 작업 폴더에서 변경사항을 감지해 커밋하고 origin main에 푸시한다.

.DESCRIPTION
  예전엔 클라우드 루틴이 이 역할을 했는데, 클라우드는 GitHub에서 저장소를 새로
  클론해서 보기 때문에 이 PC의 로컬 변경사항을 아예 볼 수가 없었다 — 그래서 항상
  "변경사항 없음"만 나오고 실제로는 아무것도 백업되지 않았다. 이 스크립트는 로컬
  작업 스케줄러에서 직접 실행되므로 실제 로컬 파일 변경을 볼 수 있다.

  이 스크립트가 실패해도 프로젝트 실행에는 아무 영향이 없어야 하므로, 모든 예외는
  이 안에서 흡수하고 로그 파일에만 남긴다.
#>

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "backup-$timestamp.log"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Output $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

try {
    Set-Location $RepoRoot

    # git 경고(CRLF 변환 등)가 stderr로 나와도 실행이 죽지 않도록 별도 처리.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $statusOutput = & git status --short 2>$null
    $ErrorActionPreference = $prevEAP

    if (-not $statusOutput) {
        Write-Log "변경사항 없음 — 작업 디렉터리 깨끗함. 커밋 생략."
    } else {
        $fileCount = ($statusOutput | Measure-Object).Count
        Write-Log "변경사항 $fileCount 개 감지됨. 커밋을 시작합니다."

        & git add -A 2>&1 | ForEach-Object { Write-Log "  $_" }

        $commitMsg = "[Auto-Backup] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') KST - $fileCount files changed"
        $commitResult = & git commit -m $commitMsg 2>&1
        $commitResult | ForEach-Object { Write-Log "  $_" }

        if ($LASTEXITCODE -eq 0) {
            $pushResult = & git push origin main 2>&1
            $pushResult | ForEach-Object { Write-Log "  $_" }
            if ($LASTEXITCODE -eq 0) {
                $hash = (& git rev-parse --short HEAD 2>$null)
                Write-Log "백업 완료: commit $hash, $fileCount개 파일, origin main에 푸시됨."
            } else {
                Write-Log "경고: 커밋은 됐지만 push 실패 — 네트워크/인증 확인 필요."
            }
        } else {
            Write-Log "경고: 커밋 실패 — 위 git 출력 참고."
        }
    }
} catch {
    Write-Log "처리되지 않은 예외: $_"
}

# 오래된 로그 정리 (최근 30개만 유지)
Get-ChildItem $LogDir -Filter "backup-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -ErrorAction SilentlyContinue
