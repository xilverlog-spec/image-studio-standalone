<#
.SYNOPSIS
  서버 감시 스크립트(Watchdog.ps1)를 작업 스케줄러에 등록한다 — 로그인 시 시작 + 5분마다 살아 있는지 확인해 꺼져 있으면 다시 시작.
  감시 스크립트가 백엔드(5000)와 ComfyUI(8188)를 지켜보다가 꺼지거나 멈추면 다시 띄운다.

.NOTES
  2026-10-19 교체: 예전에는 백엔드·ComfyUI 를 각각 작업으로 등록해 pythonw.exe 를 직접 실행했는데, 로그 연결 없는 pythonw 는
  시작 직후 종료 코드 1 로 죽어서 한 번도 서버를 못 띄웠다(재현 확인). 그래서 옛 작업(ImageStudio-Backend/ComfyUI)은 지우고
  감시 스크립트 하나(ImageStudio-Watchdog)만 등록한다. 감시 스크립트는 항상 로그를 연결해 서버를 띄운다.
  내 계정으로 도는 일반 권한 작업이라 관리자 권한이 필요 없다(필요하다고 나오면 register_servers.bat 을 더블클릭).
#>

$ErrorActionPreference = 'Stop'
$script:needAdmin = $false
$Root = 'C:\Users\user\Desktop\image-studio-standalone'
$Script = Join-Path $Root 'scripts\servers\Watchdog.ps1'
$TaskName = 'ImageStudio-Watchdog'
$User = "$env:USERDOMAIN\$env:USERNAME"
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null

# 1) 고장 난 옛 작업 지우기
foreach ($old in 'ImageStudio-Backend', 'ImageStudio-ComfyUI') {
    if (Get-ScheduledTask -TaskName $old -ErrorAction SilentlyContinue) {
        try {
            Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction Stop
            Write-Host "옛 작업 '$old' 제거 (pythonw 를 로그 없이 실행해 시작 직후 죽던 방식)."
        } catch {
            # 관리자 권한으로 등록된 작업은 일반 권한으로 못 지운다 → register_servers.bat(관리자 권한 요청)으로 다시 실행하면 지워진다
            Write-Warning "옛 작업 '$old' 를 지우지 못했습니다(관리자 권한 필요): $($_.Exception.Message)"
            $script:needAdmin = $true
        }
    }
}
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }

# 2) 감시 스크립트 등록: 로그인할 때 + 5분마다(감시 스크립트 자체가 죽었을 때를 대비. 이미 떠 있으면 뮤텍스가 두 번째를 바로 끝낸다)
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`"" -WorkingDirectory (Split-Path $Script)
$t1 = New-ScheduledTaskTrigger -AtLogOn -User $User
$t2 = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($t1, $t2) -Settings $settings -Principal $principal `
    -Description '이미지 스튜디오 서버 감시: 백엔드(5000)·ComfyUI(8188)가 꺼지거나 멈추면 다시 시작한다' | Out-Null
Write-Host "'$TaskName' 등록 완료."

# 3) 지금 바로 시작(내 로그인 화면 안에서 돈다 — GPU 를 쓰는 ComfyUI 도 같은 화면에서 떠야 한다)
Start-ScheduledTask -TaskName $TaskName
if ($script:needAdmin) { exit 5 }  # register_servers.bat 이 이 값을 보고 관리자 권한으로 한 번 더 실행한다
Write-Host ""
Write-Host "감시를 시작했습니다. 1분쯤 뒤 logs\watchdog.log 에 '정상' 기록이 보이면 됩니다."
Write-Host "코드를 고친 뒤 서버를 다시 켜려면 서버 프로세스만 끝내면 됩니다(곧 감시 스크립트가 새로 띄웁니다)."
