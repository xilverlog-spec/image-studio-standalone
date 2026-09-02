---
name: backup
description: image-studio-standalone 프로젝트의 로컬 Git 자동 백업(Windows 작업 스케줄러, 매시간)을 관리한다. 사용자가 "백업해줘", "지금 백업 좀", "백업 상태 확인해줘", "백업이 왜 안 돼" 같은 요청을 하면 이 스킬을 사용해야 한다.
---

# 프로젝트 자동 백업 관리

이 프로젝트는 **로컬 Windows 작업 스케줄러**에 등록된 태스크로 매시간 Git 백업을
수행한다. (예전엔 클라우드 루틴으로 시도했지만, 클라우드는 이 PC의 로컬 파일을 볼 수
없어서 항상 "변경사항 없음"만 나오고 실제로는 아무것도 백업이 안 됐다 — 그래서
클라우드 루틴은 비활성화하고 로컬 스케줄 태스크로 교체했다.)

## 구성 요소

- 태스크 이름: `ImageStudio-HourlyBackup`
- 실행 스크립트: [scripts/backup/Run-Backup.ps1](../../../scripts/backup/Run-Backup.ps1)
  — `git status --short`로 변경 감지 → 있으면 `git add -A` → 커밋(`[Auto-Backup] ... N files changed`) → `git push origin main`
- 등록 스크립트: [scripts/backup/Register-Task.ps1](../../../scripts/backup/Register-Task.ps1)
  — 최초 등록 또는 재등록(idempotent, 기존 태스크 있으면 지우고 다시 만듦)
- 로그: `scripts/backup/logs/backup-YYYYMMDD-HHmmss.log` (최근 30개만 보관)

## 상태 확인

```powershell
Get-ScheduledTask -TaskName 'ImageStudio-HourlyBackup' | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName 'ImageStudio-HourlyBackup' | Select-Object LastRunTime, LastTaskResult, NextRunTime
```

`LastTaskResult`가 `0`이면 성공. 최근 로그 파일을 읽어서 실제로 커밋/푸시까지 됐는지
확인하려면 `scripts/backup/logs/`에서 가장 최근 파일을 읽는다. `git log origin/main -1`과
`git log HEAD -1`을 비교해서 실제로 원격까지 반영됐는지 최종 확인할 수 있다.

## 지금 바로 한 번 실행

```powershell
Start-ScheduledTask -TaskName 'ImageStudio-HourlyBackup'
```

몇 초 후 `Get-ScheduledTaskInfo`로 결과 코드를 확인하고, 최신 로그 파일을 읽어서
실제로 무슨 일이 있었는지 보고한다 (변경사항 없어서 스킵됐는지, 커밋/푸시가 됐는지,
아니면 에러가 났는지).

## 재등록이 필요한 경우

스크립트 경로를 옮겼거나, 스케줄을 바꾸고 싶거나, 태스크가 사라졌을 때만 다시 등록한다:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\backup\Register-Task.ps1"
```

이 리포의 실행 정책이 기본적으로 스크립트 실행을 막아두므로(`PSSecurityException`),
`-ExecutionPolicy Bypass`를 반드시 붙여야 한다.

## 주의할 점

- `git add -A`를 쓰기 때문에 `.gitignore`에 안 걸려있는 민감 파일(예: `.env`, API 키)이
  있으면 그대로 커밋된다. 새로운 민감 파일을 추가했다면 `.gitignore`부터 먼저 확인할 것.
- 다른 사람이 터널 링크로 접속해서 테스트 중일 때는 백업 자체는 프로세스를 안 죽이니
  괜찮지만, 혹시 사용자가 "지금은 아무것도 재시작하지 말아달라"고 명시했다면 그 기간엔
  `Start-ScheduledTask`로 수동 실행하는 것도 피하고 다음 정규 실행을 기다리는 게 안전하다.
