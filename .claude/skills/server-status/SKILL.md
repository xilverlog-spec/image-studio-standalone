---
name: server-status
description: image-studio-standalone 프로젝트의 개발 서버(Vite/백엔드/ComfyUI) 및 접속 링크(로컬 네트워크 IP, Cloudflare 터널) 상태를 확인한다. 사용자가 "서버 상태 확인해줘", "지금 잘 돌아가고 있어?", "링크 살아있어?", "다른 PC에서 접속 안 된대" 같은 요청을 하면 이 스킬을 사용해야 한다.
---

# 서버 상태 체크 (읽기 전용)

> **가장 중요한 규칙: 이 스킬은 오직 상태를 "읽기"만 한다. 어떤 프로세스도 절대
> 재시작·종료하지 않는다.** 특히 다른 PC에서 테스트가 진행 중이라고 사용자가 말한
> 상태라면, 백엔드/Vite/ComfyUI/cloudflared 중 하나가 죽어 있는 것처럼 보여도 이
> 스킬 안에서 임의로 살리려 하지 말 것 — 무엇을 발견했는지 사용자에게 보고하고,
> 재시작 여부는 반드시 사용자 확인을 받은 뒤에 별도로 처리한다. 재시작은 이 스킬의
> 책임이 아니다.

## 확인할 것 4가지

### 1. 포트 (Vite 5181 / 백엔드 5000 / ComfyUI 8188)

```powershell
Get-NetTCPConnection -LocalPort 5181,5000,8188 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

또는 Bash 도구에서:
```bash
netstat -ano | grep -E ":5181|:5000|:8188" | grep LISTENING
```

### 2. 실제 응답 확인 (읽기 전용 GET만)

```bash
curl -s -m 5 -o /dev/null -w "vite(5181) HTTP %{http_code}\n" http://localhost:5181/
curl -s -m 5 -o /dev/null -w "backend(5000) HTTP %{http_code}\n" http://localhost:5000/v1/image/options
curl -s -m 5 -o /dev/null -w "comfyui(8188) HTTP %{http_code}\n" http://localhost:8188/
```

절대 POST 요청(이미지 생성 등)을 테스트 목적으로 보내지 않는다 — 다른 PC에서 실제로
생성 중일 수 있고, 불필요한 GPU 작업을 만들 이유가 없다.

### 3. LAN 접속 링크

```bash
powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -notlike '169.254.*' -and \$_.IPAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty IPAddress"
```

현재 알려진 값은 `192.168.164.82` (바뀔 수 있으니 매번 다시 확인). 링크는
`http://<IP>:5181` 형태.

### 4. 외부(Cloudflare Quick Tunnel) 링크

```bash
tasklist 2>/dev/null | grep -i cloudflared
```

프로세스가 살아있으면, 현재 URL은 [scripts/tunnel/current-tunnel-url.txt](../../../scripts/tunnel/current-tunnel-url.txt)에
기록돼 있다 — 이 파일을 읽어서 그 URL로 실제 응답까지 확인한다:

```bash
curl -s -m 10 -o /dev/null -w "tunnel HTTP %{http_code}\n" <파일에 적힌 URL>
```

**주의**: Quick Tunnel은 cloudflared가 재시작될 때마다 URL이 바뀐다. 이 텍스트 파일은
사람이 수동으로 갱신하는 기록일 뿐이라, 실제 프로세스가 살아있는데도 파일 속 URL이
404/타임아웃이 나면 "터널은 살아있지만 기록된 URL이 오래된 값"일 가능성을 먼저
의심한다 — 이 경우에도 cloudflared를 임의로 재시작하지 말고, 사용자에게 "터널
프로세스는 살아있는데 기록된 링크가 응답을 안 한다"고 보고하고 어떻게 할지 물어본다.

## 보고 형식

4가지를 각각 정상/비정상으로 짧게 정리해서 보고한다. 하나라도 비정상이면:
- 그게 무엇인지, 왜 그런 것 같은지 설명
- 고치려면 재시작이 필요하다는 것과, 지금 재시작해도 되는지 사용자에게 물어본다
  (다른 PC 테스트 중이면 특히 반드시 물어볼 것 — 절대 알아서 재시작하지 않는다)
