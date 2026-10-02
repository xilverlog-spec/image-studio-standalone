---
name: start-servers
description: image-studio-standalone 프로젝트의 개발 서버 3개(Vite/백엔드/ComfyUI)를 켜거나 재시작한다. 사용자가 "서버 켜줘", "서버 다시 시작해줘", "배포 링크가 안 되는데 살려줘", "재부팅했더니 서버가 꺼졌어" 같은 요청을 하면 이 스킬을 사용해야 한다. 상태 "확인"만 필요하면 이 스킬 대신 server-status 스킬을 쓴다.
---

# 서버 켜기 / 재시작

이 스킬은 실제로 프로세스를 **시작(및 필요 시 종료 후 재시작)**한다 — `server-status`(읽기 전용, 절대 재시작 안 함)와 역할이 다르다.

> **더 근본적인 해결책이 있다**: 2026-09-11에 Claude Code의 PowerShell 도구로 띄운 백엔드/ComfyUI가
> 원인 불명으로(에러 로그도 없이) 함께 죽는 사고가 있었다 — 아마 도구 세션에 묶인 프로세스라서
> 세션 정리 시 같이 정리되는 것으로 추정된다. 이 문제를 근본적으로 없애려면
> [scripts/servers/Register-Servers-Task.ps1](../../../scripts/servers/Register-Servers-Task.ps1)로
> 작업 스케줄러에 등록해두는 게 맞다(로그인 시 자동 시작 + 죽으면 자동 재시작) — 단, Claude Code의
> PowerShell 도구는 작업 스케줄러 접근 권한이 없어서(Access is denied) **사용자가 직접**
> `scripts\servers\register_servers.bat`을 한 번 실행해줘야 한다. 아래 이 스킬의 수동 방식은
> 그 등록 전까지, 또는 작업 스케줄러 자체에 문제가 생겼을 때 쓰는 임시방편이다.

## 0. 원칙

- 켜져 있는 서버는 건드리지 않는다. 먼저 상태를 확인해서 **꺼져 있는 것만** 켠다.
- 이미 떠 있는데 사용자가 명시적으로 "재시작"을 요청한 경우에만 기존 프로세스를 종료하고 새로 띄운다.
- 재시작 전엔 `data/image_studio.db`의 `image_generations.created_at` 최근 기록으로 다른 PC가 방금까지 쓰고 있었는지 짧게 확인하고, 애매하면 사용자에게 먼저 알린다(완전히 막을 필요는 없음 — 정보 제공 후 진행).
- PowerShell 세션마다 PATH가 새로 로드되지 않을 수 있으니, 명령 실행 전에 항상 아래로 새로고침한다:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```
- `npm`/`npm.cmd`는 Win32 실행파일이 아니라서 `Start-Process -FilePath`에 직접 못 넣는다 — `cmd.exe /c npm run dev`로 감싼다.
- `python`이 Windows Store 스텁으로 잡힐 수 있으니, 백엔드 실행 전엔 `(Get-Command python).Source`로 실제 경로를 확인하고 그 경로로 실행한다.
- 나중에 문제를 진단할 수 있도록 매번 stdout/stderr를 `logs/`에 파일로 남긴다(리포지토리 `.gitignore`에 `*.log`가 이미 포함돼 있어 커밋되지 않는다).
- **콘솔 창을 아예 띄우지 않는다** (2026-09-11 실측: 사용자가 최소화된 창을 실수로 닫아서
  백엔드+ComfyUI가 통째로 죽는 사고가 실제로 있었다). ComfyUI/백엔드는 `python.exe`가 아니라
  같은 폴더의 `pythonw.exe`로 실행한다(콘솔 서브시스템 자체가 없어서 `-WindowStyle`도 필요
  없고, 실수로 닫을 창이 애초에 존재하지 않는다). npm(Vite)처럼 `pythonw` 짝이 없는 경우엔
  `-WindowStyle Hidden`으로 띄운다.

## 1. 현재 상태 확인

```powershell
netstat -ano | Select-String ":5181|:5000|:8188"
```

떠 있는 포트는 건드리지 않는다. 꺼진 것만 아래에서 켠다.

## 2. ComfyUI (포트 8188)

```powershell
$logDir = "C:\Users\user\Desktop\image-studio-standalone\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-Path "C:\ComfyUI\python_embeded\pythonw.exe") {
    Start-Process -FilePath "C:\ComfyUI\python_embeded\pythonw.exe" `
      -ArgumentList "-s ComfyUI\main.py --windows-standalone-build" `
      -WorkingDirectory "C:\ComfyUI" `
      -RedirectStandardOutput "$logDir\comfyui_stdout.log" `
      -RedirectStandardError "$logDir\comfyui_stderr.log"
} elseif (Test-Path "C:\ComfyUI\venv\Scripts\pythonw.exe") {
    Start-Process -FilePath "C:\ComfyUI\venv\Scripts\pythonw.exe" `
      -ArgumentList "main.py --port 8188" `
      -WorkingDirectory "C:\ComfyUI" `
      -RedirectStandardOutput "$logDir\comfyui_stdout.log" `
      -RedirectStandardError "$logDir\comfyui_stderr.log"
} else {
    Write-Output "C:\ComfyUI 를 찾을 수 없음 — SETUP_GUIDE.md 5단계 참고"
}
```

## 3. 백엔드 (포트 5000)

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:PYTHONUTF8 = "1"
$pythonwPath = Join-Path (Split-Path (Get-Command python).Source) "pythonw.exe"
Start-Process -FilePath $pythonwPath -ArgumentList "server.py" `
  -WorkingDirectory "C:\Users\user\Desktop\image-studio-standalone\backend" `
  -RedirectStandardOutput "$logDir\backend_stdout.log" `
  -RedirectStandardError "$logDir\backend_stderr.log"
```

이 백엔드가 `192.168.164.171:5000`으로 사내 배포되는 실제 서비스다(`reload=False`라 코드를 고쳐도
재시작 전까진 반영 안 됨 — 그래서 코드 수정 직후엔 이 스킬로 재시작이 필요하다).

## 4. Vite 개발 서버 (포트 5181/5173, 배포엔 필수 아님)

```powershell
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npm run dev > `"$logDir\vite_stdout.log`" 2> `"$logDir\vite_stderr.log`"" `
  -WorkingDirectory "C:\Users\user\Desktop\image-studio-standalone" -WindowStyle Hidden
```

직원들이 실제로 접속하는 배포 링크는 백엔드(5000)가 빌드된 `dist/`를 직접 서빙하는 것이므로,
Vite(5181)는 개발용일 뿐 배포엔 필요 없다 — 그래도 `run_studio.bat`과 동일하게 항상 같이 띄운다.

## 5. 기동 확인 (5~6초 대기 후)

```powershell
Start-Sleep -Seconds 6
netstat -ano | Select-String ":5181|:5000|:8188"
curl.exe -s -m 5 -o NUL -w "vite(5181) HTTP %{http_code}`n" http://localhost:5181/
curl.exe -s -m 5 -o NUL -w "backend(5000) HTTP %{http_code}`n" http://localhost:5000/v1/image/options
curl.exe -s -m 8 -o NUL -w "comfyui(8188) HTTP %{http_code}`n" http://localhost:8188/
```

ComfyUI는 모델 로딩 때문에 첫 응답까지 더 걸릴 수 있다 — 200이 아니어도 바로 실패로 보지 말고
10~20초 정도 더 기다렸다 한 번 더 확인해본다.

## 6. 보고

포트/HTTP 결과와 함께, 사내망 접속 링크(`http://<LAN IP>:5000`)를 알려준다. LAN IP는
`Get-NetIPAddress`로 매번 다시 확인한다(고정 아님). 무언가 계속 안 뜨면 `logs/*_stderr.log`를
읽어서 원인을 찾는다.
