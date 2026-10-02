<#
.SYNOPSIS
  백엔드(5000)와 ComfyUI(8188)를 Windows 작업 스케줄러에 등록한다 — 로그인 시 자동 시작,
  죽으면 자동 재시작(5회, 1분 간격). 창 없이(pythonw.exe) 돈다.

.NOTES
  관리자 권한 없이 "현재 로그인한 사용자" 범위로 등록된다. Claude Code의 PowerShell 도구는
  작업 스케줄러 접근 권한이 없어서(Access is denied), 이 스크립트는 반드시 사용자가 직접
  (더블클릭 또는 본인 터미널에서) 실행해야 한다 — 최초 1회만 하면 된다.
#>

$LogDir = "C:\Users\user\Desktop\image-studio-standalone\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$RestartSettings = New-ScheduledTaskSettingsSet `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew

function Register-Or-Reregister($TaskName, $Exe, $Args, $WorkDir) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "기존 작업 '$TaskName' 발견 — 제거 후 재등록합니다."
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    $action = New-ScheduledTaskAction -Execute $Exe -Argument $Args -WorkingDirectory $WorkDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $RestartSettings -RunLevel Limited | Out-Null
    Write-Host "'$TaskName' 등록 완료."
}

Register-Or-Reregister `
    -TaskName "ImageStudio-Backend" `
    -Exe "C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe" `
    -Args "server.py" `
    -WorkDir "C:\Users\user\Desktop\image-studio-standalone\backend"

Register-Or-Reregister `
    -TaskName "ImageStudio-ComfyUI" `
    -Exe "C:\ComfyUI\python_embeded\pythonw.exe" `
    -Args "-s ComfyUI\main.py --windows-standalone-build" `
    -WorkDir "C:\ComfyUI"

Write-Host ""
Write-Host "지금 바로 시작하려면:"
Write-Host "  Start-ScheduledTask -TaskName 'ImageStudio-Backend'"
Write-Host "  Start-ScheduledTask -TaskName 'ImageStudio-ComfyUI'"
Write-Host ""
Write-Host "다음부턴 로그인할 때 자동으로 켜지고, 죽어도 1분 안에 최대 5번까지 알아서 재시작됩니다."
