---
name: devlog
description: image-studio-standalone 프로젝트의 하루 단위 작업일지(Dev Log) 자동 생성(Windows 작업 스케줄러, 매일 18:00)을 관리한다. 사용자가 "작업일지 써줘", "오늘 작업일지 확인해줘", "작업일지가 왜 안 만들어졌어" 같은 요청을 하면 이 스킬을 사용해야 한다.
---

# 작업일지(Dev Log) 자동 생성 관리

매일 18:00(KST)에 로컬 Windows 작업 스케줄러 태스크가 돌아서, 전날 18:00 ~ 오늘 18:00
구간의 Git 활동을 모아 `docs/Dev Log/YYYY-MM-DD.md`를 자동으로 만든다.

## 구성 요소

- 태스크 이름: `ImageStudio-DevLog`
- 실행 스크립트: [scripts/devlog/Run-DevLog.ps1](../../../scripts/devlog/Run-DevLog.ps1)
  → 내부에서 [scripts/devlog/Generate-DevLog.ps1](../../../scripts/devlog/Generate-DevLog.ps1) 호출
- 등록 스크립트: [scripts/devlog/Register-Task.ps1](../../../scripts/devlog/Register-Task.ps1)
- 상태 파일: `.claude/devlog-state.json` — 마지막으로 처리 완료한 cutoff(18:00 경계) 기록.
  이 파일 덕분에 하루 이상 PC를 꺼뒀다 켜도 밀린 날짜들을 순서대로 backfill한다.
- 문서 형식: `## Done` / `## Problem` / `## Decision` / `## Next` (내용 없는 섹션은 생략) +
  맨 끝에 `## 요약` — 전문용어(IP-Adapter, ControlNet, API 등) 없이 쉬운 말로 3~5문장,
  개발 지식이 전혀 없는 사람도 읽을 수 있게 정리. Done에 쓸 내용이 하나라도 있으면
  요약은 항상 포함되도록 [Generate-DevLog.ps1](../../../scripts/devlog/Generate-DevLog.ps1)의
  프롬프트에 규칙으로 명시돼 있다(2026-09-02, 스크래치 테스트로 실제 출력 확인 완료).
  이미 만들어진 옛날 날짜 파일(예: 2026-09-01.md)에는 이 섹션이 없을 수 있다 — idempotent라
  기존 파일을 재생성하지 않기 때문이며, 정상이다.
- 출력: `docs/Dev Log/YYYY-MM-DD.md` (의미 있는 변경이 없는 날짜는 파일을 만들지 않음,
  이미 있는 날짜 파일은 건드리지 않음 — idempotent)
- 로그: `scripts/devlog/logs/devlog-YYYYMMDD-HHmmss.log` (최근 30개만 보관)

## 상태 확인

```powershell
Get-ScheduledTask -TaskName 'ImageStudio-DevLog' | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName 'ImageStudio-DevLog' | Select-Object LastRunTime, LastTaskResult, NextRunTime
```

가장 최근 로그 파일을 읽으면 "처리할 새 구간이 없습니다"(아직 18:00 경계를 안 지남,
정상)인지, 실제로 파일을 생성했는지, 아니면 예외가 났는지 알 수 있다.

## 지금 바로 한 번 실행 (18:00을 기다리지 않고)

```powershell
Start-ScheduledTask -TaskName 'ImageStudio-DevLog'
```

단, 아직 오늘의 18:00 경계를 지나지 않았다면 "처리할 새 구간 없음"으로 끝나는 게
정상이다 — 이건 버그가 아니라 설계대로 동작하는 것이니 그렇게 설명할 것.

## 재등록이 필요한 경우

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\devlog\Register-Task.ps1"
```

이 리포의 실행 정책이 기본적으로 스크립트 실행을 막아두므로(`PSSecurityException`),
`-ExecutionPolicy Bypass`를 반드시 붙여야 한다.

## 주의할 점

- 가장 최근에 "막 닫힌" 구간(이번 실행이 처리하는 마지막 cutoff)에는 실행 시점의
  uncommitted 변경사항도 참고하지만, 그보다 과거의 backfill 구간은 오직 그 시점의 Git
  커밋 기록만 사용한다 — 과거 날짜에 지금의 uncommitted 변경을 임의로 끼워넣지 않는다.
- 이 스크립트가 실패해도 프로젝트 실행 자체에는 영향이 없도록 설계돼 있다(예외를
  스크립트 내부에서 흡수) — 실패했다면 로그 파일에서 원인을 확인한다.
