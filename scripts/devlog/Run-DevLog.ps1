<#
.SYNOPSIS
  Windows 작업 스케줄러가 매일 18:00에 실행하는 진입점.
  Generate-DevLog.ps1을 호출하고, 어떤 예외가 나도 여기서 흡수해서 로그 파일에만
  남긴다 — 이 자동화가 실패해도 프로젝트 실행에는 절대 영향을 주지 않는다.
#>

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "devlog-$timestamp.log"

try {
    # Tee-Object/Out-File 기본 인코딩(PS 5.1에서는 UTF-16)은 다른 도구로 읽을 때 깨져 보이므로
    # UTF-8로 명시해서 저장한다.
    $output = & (Join-Path $PSScriptRoot "Generate-DevLog.ps1") -RepoRoot $RepoRoot.Path *>&1 | Out-String
    Write-Output $output
    Set-Content -Path $LogFile -Value $output -Encoding UTF8
} catch {
    $errMsg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Run-DevLog.ps1에서 처리되지 않은 예외: $_"
    $errMsg | Add-Content -Path $LogFile -Encoding UTF8
    # 여기서 다시 throw하지 않는다 — 작업 스케줄러 실행 실패가 다른 어떤 것에도 영향을 주면 안 됨.
}

# 오래된 로그 정리 (최근 30개만 유지)
Get-ChildItem $LogDir -Filter "devlog-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -ErrorAction SilentlyContinue
