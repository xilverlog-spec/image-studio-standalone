---
name: start-servers
description: image-studio-standalone 프로젝트의 서버 3개(백엔드 5000/ComfyUI 8188/Vite 5181)를 켜거나 재시작한다. 백엔드와 ComfyUI 는 감시 스크립트(ImageStudio-Watchdog)가 지키므로 "재시작"은 서버 프로세스를 끝내는 것으로 한다. 사용자가 "서버 켜줘", "서버 다시 시작해줘", "배포 링크가 안 되는데 살려줘", "재부팅했더니 서버가 꺼졌어", "코드 고쳤으니 서버 반영해줘" 같은 요청을 하면 이 스킬을 사용해야 한다. 상태 "확인"만 필요하면 이 스킬 대신 server-status 스킬을 쓴다.
---

# 서버 켜기 / 재시작

이 스킬은 실제로 프로세스를 **끝내거나 시작**한다 — `server-status`(읽기 전용, 절대 재시작 안 함)와 역할이 다르다.

## 0. 서버를 누가 지키는가 (2026-10-19 개편)

백엔드(5000)와 ComfyUI(8188)는 작업 스케줄러의 **`ImageStudio-Watchdog`** 작업이 돌리는
[scripts/servers/Watchdog.ps1](../../../scripts/servers/Watchdog.ps1)이 지킨다(로그인 시 시작 + 5분마다 확인).
20초마다 포트와 HTTP 응답을 점검해서 **꺼졌으면 다시 띄우고, 포트는 열려 있는데 응답이 3번 연속 없으면(멈춤) 끝내고 다시 띄운다.**
기록은 `logs\watchdog.log`, 서버 로그는 `logs\backend_*.log` / `logs\comfyui_*.log`(직전 것은 `*.prev.log`).

왜 이렇게 바꿨나(원인 조사, 2026-10-19):
1. 예전 작업(ImageStudio-Backend/ComfyUI)은 `pythonw.exe`를 **로그 연결 없이** 실행해서, `sys.stdout/stderr`가 `None`인 탓에
   uvicorn·ComfyUI가 시작 직후 종료 코드 1로 죽었다(재현 확인). 그래서 한 번도 서버를 못 띄웠다.
2. 도구(PowerShell)에서 `Start-Process`로 띄운 서버는 도구 세션과 수명이 묶여 세션 정리 때 같이 사라질 수 있다(2026-09-11 사고).
3. ComfyUI의 `pythonw.exe`는 Windows가 "응답 없음"으로 종료한 기록이 5주간 8번 있다(이벤트 로그 Application 1002/1001, `AppHangXProcB1`). 원인은 못 밝혔고, 감시 스크립트가 몇십 초 안에 다시 살린다.
4. PC(노트북)가 평일 저녁 ~18:05에 사용자 조작으로 절전에 들어가면(이벤트 42, `Application API`) 그동안은 접속이 안 된다. 서버가 꺼진 것이 아니라 PC가 잠든 것이다.

## 1. 원칙

- 켜져 있는 서버는 건드리지 않는다. 먼저 `server-status` 방식으로 상태를 확인한다.
- **재시작은 사용자가 요청했거나, 코드 수정을 서버에 반영해야 할 때만** 한다. 재시작 전엔 `data/image_studio.db`의 `image_generations.created_at` 최근 기록과 ComfyUI 큐(`http://127.0.0.1:8188/queue`, Qwen용 `:8189/queue`)가 비어 있는지 확인하고, 작업이 돌고 있으면 사용자에게 먼저 알린다.
- **도구에서 `pythonw.exe`/`python.exe`로 서버를 직접 `Start-Process` 하지 않는다**(세션에 묶여 사라지고, 로그 연결을 빼먹으면 시작 직후 죽는다). 항상 감시 스크립트가 띄우게 한다.
- `backend/server.py`는 `reload=False`라 코드를 고쳐도 재시작 전까지 반영되지 않는다. 프런트(`dist/`)는 `npm run build`만 하면 재시작 없이 바로 반영된다.

## 2. 재시작 = 서버 프로세스만 끝내기

```powershell
# 백엔드 (코드 수정 반영)
$pid5000 = (Get-NetTCPConnection -LocalPort 5000 -State Listen).OwningProcess
Stop-Process -Id $pid5000 -Force
# → 감시 스크립트가 20초 안에 새로 띄운다(약 15~20초). 확인:
curl.exe -s -m 5 http://localhost:5000/health
```

```powershell
# ComfyUI (모델 로딩 때문에 약 25~40초)
$pid8188 = (Get-NetTCPConnection -LocalPort 8188 -State Listen).OwningProcess
Stop-Process -Id $pid8188 -Force
curl.exe -s -m 5 http://127.0.0.1:8188/queue
```

- Qwen용 ComfyUI(8189, `C:\ComfyUI_v041`)는 백엔드가 AI 이미지 편집을 할 때 알아서 띄운다(감시 대상 아님).
- 확인할 때는 `logs\watchdog.log` 마지막 줄이 `시작함 → 정상`으로 이어지는지 본다.

## 3. 감시 스크립트가 안 돌고 있을 때

```powershell
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'Watchdog.ps1' } | Select-Object ProcessId, CreationDate
Start-ScheduledTask -TaskName 'ImageStudio-Watchdog'   # 도구에서 실행 가능(확인됨). 이미 떠 있으면 두 번째는 시작되지 않는다
```

- 작업의 마지막 결과 코드 `0x800710E0`(2147946720)은 "이미 실행 중이라 두 번째는 시작 안 함"이라는 뜻의 **정상** 값이다.
- 작업이 아예 없으면 `scripts\servers\register_servers.bat`(또는 `Register-Servers-Task.ps1`)로 등록한다. 내 계정의 일반 권한 작업이라 도구에서도 등록된다.
- **옛 작업(`ImageStudio-Backend`, `ImageStudio-ComfyUI`)이 남아 있으면** 관리자 권한이 있어야 지워진다(도구에서는 Access is denied). 사용자가 `register_servers.bat`을 더블클릭해 "예"를 누르면 지워진다. 남아 있어도 해롭지는 않다(ComfyUI 쪽은 로그인 때 죽고, 백엔드 쪽은 `server.py`의 로그 보강 덕에 정상 기동하며 감시 스크립트가 이어받는다).
- 감시 스크립트가 "150초 안에 5번 시작했는데도 계속 꺼짐 → 5분 쉼"이라고 기록했다면 서버가 시작 직후 계속 죽는 것이다. `logs\<이름>_stderr.log`를 읽어 원인을 찾는다.

## 4. Vite 개발 서버 (포트 5181/5173, 배포엔 필수 아님 — 감시 대상 아님)

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$logDir = "C:\Users\user\Desktop\image-studio-standalone\logs"
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npm run dev > `"$logDir\vite_stdout.log`" 2> `"$logDir\vite_stderr.log`"" `
  -WorkingDirectory "C:\Users\user\Desktop\image-studio-standalone" -WindowStyle Hidden
```

- `npm`/`npm.cmd`는 Win32 실행파일이 아니라서 `Start-Process -FilePath`에 직접 못 넣는다 — `cmd.exe /c npm run dev`로 감싼다.
- 직원들이 접속하는 배포 링크는 백엔드(5000)가 빌드된 `dist/`를 직접 서빙하는 것이라 Vite는 개발용일 뿐이다.

## 5. 마지막 수단: 감시 없이 수동으로 띄워야 할 때 (거의 없음)

작업 스케줄러 자체가 고장 난 경우에만. **반드시 stdout/stderr를 파일로 연결해야 한다**(안 하면 `pythonw`가 시작 직후 죽는다).

```powershell
$env:PYTHONUTF8 = "1"
$logDir = "C:\Users\user\Desktop\image-studio-standalone\logs"
$pythonwPath = Join-Path (Split-Path (Get-Command python).Source) "pythonw.exe"
Start-Process -FilePath $pythonwPath -ArgumentList "server.py" -WorkingDirectory "C:\Users\user\Desktop\image-studio-standalone\backend" `
  -WindowStyle Hidden -RedirectStandardOutput "$logDir\backend_stdout.log" -RedirectStandardError "$logDir\backend_stderr.log"
# ComfyUI: C:\ComfyUI\python_embeded\pythonw.exe -s ComfyUI\main.py --windows-standalone-build (WorkingDirectory C:\ComfyUI, 같은 방식으로 로그 연결)
```

이 방식으로 띄운 서버는 도구 세션이 끝나면 사라질 수 있다. 가능한 빨리 감시 스크립트가 띄우는 상태로 되돌린다(서버 프로세스를 끝내면 감시가 새로 띄운다).

## 6. 보고

포트/HTTP 결과와 함께 사내망 접속 링크(`http://<LAN IP>:5000`)를 알려준다. LAN IP는 `Get-NetIPAddress`로 매번 다시 확인한다(고정 아님).
무언가 계속 안 뜨면 `logs\watchdog.log`와 `logs\*_stderr.log`를 읽어서 원인을 찾는다.
