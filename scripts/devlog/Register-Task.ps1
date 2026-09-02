<#
.SYNOPSIS
  "ImageStudio-DevLog" Windows 작업 스케줄러 작업을 등록(또는 재등록)한다.
  최초 1회, 또는 스케줄/경로를 바꿨을 때 직접 실행하면 된다.

.NOTES
  관리자 권한이 없어도 "현재 로그인한 사용자" 범위로 등록 가능하다(트리거가 Daily이므로).
#>

$TaskName = "ImageStudio-DevLog"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RunScript = Join-Path $PSScriptRoot "Run-DevLog.ps1"

if (-not (Test-Path $RunScript)) {
    throw "Run-DevLog.ps1을 찾을 수 없습니다: $RunScript"
}

# 기존 등록이 있으면 제거 후 재등록 (idempotent)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "기존 작업 '$TaskName' 발견 — 제거 후 재등록합니다."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunScript`""

$trigger = New-ScheduledTaskTrigger -Daily -At 18:00

# StartWhenAvailable: PC가 꺼져있거나 절전이어서 18:00에 못 돌았으면, 다음 부팅/로그인 후
# 가능한 즉시 실행한다 (요청하신 "Run task as soon as possible after a scheduled start is missed").
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "매일 18:00 기준 하루치 Git 개발 활동을 요약해 docs/Dev Log에 자동 기록 (image-studio-standalone)" | Out-Null

Write-Host "작업 스케줄러에 '$TaskName' 등록 완료 (매일 18:00, 놓치면 재부팅/로그인 시 즉시 실행)."
Write-Host "지금 바로 한 번 테스트하려면: Start-ScheduledTask -TaskName '$TaskName'"
