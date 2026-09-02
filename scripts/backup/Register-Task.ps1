<#
.SYNOPSIS
  "ImageStudio-HourlyBackup" Windows 작업 스케줄러 작업을 등록(또는 재등록)한다.
  최초 1회, 또는 스케줄/경로를 바꿨을 때 직접 실행하면 된다.

.NOTES
  관리자 권한이 없어도 "현재 로그인한 사용자" 범위로 등록 가능하다.
#>

$TaskName = "ImageStudio-HourlyBackup"
$RunScript = Join-Path $PSScriptRoot "Run-Backup.ps1"

if (-not (Test-Path $RunScript)) {
    throw "Run-Backup.ps1을 찾을 수 없습니다: $RunScript"
}

# 기존 등록이 있으면 제거 후 재등록 (idempotent)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "기존 작업 '$TaskName' 발견 — 제거 후 재등록합니다."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunScript`""

# 매시간 반복 실행. RepetitionDuration에 TimeSpan::MaxValue를 쓰면 작업 스케줄러가
# 유효하지 않은 XML로 거부하므로, 대신 충분히 긴 기간(10년)을 준다.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "매시간 이 PC의 로컬 Git 변경사항을 커밋하고 origin main에 푸시 (image-studio-standalone)" | Out-Null

Write-Host "작업 스케줄러에 '$TaskName' 등록 완료 (매시간, 놓치면 재부팅/로그인 시 즉시 실행)."
Write-Host "지금 바로 한 번 테스트하려면: Start-ScheduledTask -TaskName '$TaskName'"
