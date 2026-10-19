<#
.SYNOPSIS
  백엔드(5000)와 ComfyUI(8188)를 지켜보다가 꺼지거나 멈추면 다시 띄운다(2026-10-19).

.DESCRIPTION
  왜 필요한가(원인 조사 결과)
   1) 작업 스케줄러가 pythonw.exe 를 '로그 연결 없이' 실행하면 sys.stdout/stderr 가 None 이라 uvicorn·ComfyUI 가
      시작 직후 종료 코드 1 로 죽는다(재현함). 그래서 등록된 작업은 한 번도 서버를 못 띄웠다.
   2) Claude Code 도구에서 띄운 서버는 도구 세션과 수명이 묶여 세션이 끝나면 같이 사라진다.
   3) ComfyUI 의 pythonw.exe 는 Windows 가 "응답 없음"으로 종료한 기록이 5주간 8번 있다(AppHangXProcB1).
  이 스크립트는 위 어느 경우든 몇십 초 안에 서버를 다시 살린다. 항상 로그를 연결해 띄운다.

  동작
   - 20초마다 각 서버의 포트와 HTTP 응답을 점검한다.
   - 포트가 닫혀 있으면(죽음) 바로 시작한다. 포트는 열려 있는데 HTTP 가 연속 3번 응답이 없으면(멈춤) 그 프로세스를 끝내고 다시 시작한다.
   - 시작하자마자 계속 죽으면(150초 안에 5번) 5분 쉬었다가 다시 시도한다(무한 재시작으로 PC 를 괴롭히지 않기 위해).
   - 서버를 새로 시작할 때 옛 로그는 *.prev.log 로 한 세대 남긴다. 이 스크립트의 기록은 logs\watchdog.log.
   - 이미 떠 있는 서버는 건드리지 않는다(이어받는다). 이 스크립트가 두 개 떠도 하나만 일한다(뮤텍스).

  코드를 고친 뒤 서버를 다시 켜려면: 서버 프로세스만 끝내면 된다(예: Stop-Process -Id <5000 번 포트 PID>). 곧 이 스크립트가 새로 띄운다.

.PARAMETER ConfigPath
  (시험용) 서버 목록 JSON. 없으면 아래 기본값(실제 백엔드·ComfyUI)을 쓴다.
#>
param(
    [string]$ConfigPath = '',
    [string]$LogDir = 'C:\Users\user\Desktop\image-studio-standalone\logs',
    [int]$IntervalSec = 20,
    [string]$MutexName = 'Global\ImageStudioWatchdog'
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$WatchLog = Join-Path $LogDir 'watchdog.log'

function Write-Log([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
    try {
        if ((Test-Path $WatchLog) -and (Get-Item $WatchLog).Length -gt 1MB) { Move-Item -Force $WatchLog "$WatchLog.old" }
        Add-Content -Path $WatchLog -Value $line -Encoding UTF8
    } catch { }
}

# 한 번에 하나만(같은 이름으로 두 번째가 뜨면 바로 끝낸다)
$created = $false
$mutex = New-Object System.Threading.Mutex($true, $MutexName, [ref]$created)
if (-not $created) { exit 0 }

# 서버 목록
if ($ConfigPath -and (Test-Path $ConfigPath)) {
    $services = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $py = Join-Path (Split-Path (Get-Command python -ErrorAction SilentlyContinue).Source -ErrorAction SilentlyContinue) 'pythonw.exe'
    if (-not (Test-Path $py)) { $py = 'C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe' }
    $services = @(
        [pscustomobject]@{ name = 'backend'; exe = $py; args = 'server.py'; dir = 'C:\Users\user\Desktop\image-studio-standalone\backend'; port = 5000; url = 'http://127.0.0.1:5000/health'; env = @{ PYTHONUTF8 = '1' } },
        [pscustomobject]@{ name = 'comfyui'; exe = 'C:\ComfyUI\python_embeded\pythonw.exe'; args = '-s ComfyUI\main.py --windows-standalone-build'; dir = 'C:\ComfyUI'; port = 8188; url = 'http://127.0.0.1:8188/queue'; env = @{} }
    )
}

$state = @{}
foreach ($s in $services) { $state[$s.name] = @{ fails = 0; starts = New-Object System.Collections.ArrayList; pauseUntil = [datetime]::MinValue; startedAt = [datetime]::MinValue; wasUp = $null; proc = $null } }

function Test-Http([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch {
        # 4xx 는 서버가 살아서 대답한 것이다
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }
        return $false
    }
}
function Get-Owner([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess } else { return 0 }
}
function Get-Grace($s) { if ($s.graceSec) { return [int]$s.graceSec } else { return 180 } } # 시작하고 이 시간(초)은 느려도 기다린다
function Get-EnvPairs($e) { # 해시테이블(기본값)과 JSON 객체(시험용 설정) 둘 다 받는다
    if ($null -eq $e) { return @() }
    if ($e -is [hashtable]) { return @($e.GetEnumerator() | ForEach-Object { @{ k = $_.Key; v = $_.Value } }) }
    return @($e.PSObject.Properties | ForEach-Object { @{ k = $_.Name; v = $_.Value } })
}
function Start-Service-Proc($s) {
    $out = Join-Path $LogDir ("{0}_stdout.log" -f $s.name); $err = Join-Path $LogDir ("{0}_stderr.log" -f $s.name)
    foreach ($f in $out, $err) { if (Test-Path $f) { Move-Item -Force $f ($f -replace '\.log$', '.prev.log') -ErrorAction SilentlyContinue } }
    foreach ($kv in (Get-EnvPairs $s.env)) { Set-Item -Path ("Env:" + $kv.k) -Value ([string]$kv.v) }
    $p = Start-Process -FilePath $s.exe -ArgumentList $s.args -WorkingDirectory $s.dir -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    return $p
}

Write-Log ("감시 시작 (PID {0}, 점검 {1}초마다, 대상: {2})" -f $PID, $IntervalSec, (($services | ForEach-Object { "$($_.name):$($_.port)" }) -join ', '))

while ($true) {
    foreach ($s in $services) {
        $st = $state[$s.name]
        try {
            if ((Get-Date) -lt $st.pauseUntil) { continue }
            $owner = Get-Owner $s.port
            if ($owner -eq 0 -and $st.proc -and -not $st.proc.HasExited -and ((Get-Date) - $st.startedAt).TotalSeconds -lt (Get-Grace $s)) { continue } # 우리가 방금 띄운 서버가 아직 포트를 여는 중(ComfyUI 는 20~40초 걸린다)
            $up = $false
            if ($owner -gt 0) { $up = Test-Http $s.url }

            if ($up) {
                if ($st.wasUp -ne $true) { Write-Log ("[{0}] 정상 (포트 {1}, PID {2})" -f $s.name, $s.port, $owner) }
                $st.wasUp = $true; $st.fails = 0; continue
            }

            if ($owner -gt 0) {
                # 포트는 열려 있는데 대답이 없다: 시작 중일 수 있으니 연속 3번 확인한 뒤에야 멈춘 것으로 본다
                $grace = ((Get-Date) - $st.startedAt).TotalSeconds -lt (Get-Grace $s)
                if ($grace) { continue }
                $st.fails++
                if ($st.fails -lt 3) { continue }
                Write-Log ("[{0}] 포트 {1} 은 열려 있으나 HTTP 응답이 없음({2}회 연속) → PID {3} 종료 후 재시작" -f $s.name, $s.port, $st.fails, $owner)
                Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
            } elseif ($st.wasUp -eq $true) {
                Write-Log ("[{0}] 꺼진 것을 확인(포트 {1} 닫힘) → 재시작" -f $s.name, $s.port)
            }

            # 너무 자주 죽으면 쉰다: 150초 안에 시작이 5번 쌓이면(= 계속 곧바로 죽는 것) 5분 대기
            $now = Get-Date
            $recent = @($st.starts | Where-Object { ($now - $_).TotalSeconds -lt 150 })
            if ($recent.Count -ge 5) {
                Write-Log ("[{0}] 150초 안에 {1}번 시작했는데도 계속 꺼짐 → 5분 쉬고 다시 시도 (로그: {0}_stderr.log 를 확인하세요)" -f $s.name, $recent.Count)
                $st.pauseUntil = $now.AddMinutes(5); $st.starts.Clear(); continue
            }
            if (-not (Test-Path $s.exe)) { Write-Log ("[{0}] 실행 파일이 없음: {1}" -f $s.name, $s.exe); $st.pauseUntil = $now.AddMinutes(10); continue }

            $p = Start-Service-Proc $s
            [void]$st.starts.Add($now); $st.startedAt = $now; $st.fails = 0; $st.wasUp = $false; $st.proc = $p
            Write-Log ("[{0}] 시작함 (PID {1})" -f $s.name, $p.Id)
        } catch {
            Write-Log ("[{0}] 점검 중 오류: {1}" -f $s.name, $_.Exception.Message)
        }
    }
    Start-Sleep -Seconds $IntervalSec
}
