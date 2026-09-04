<#
.SYNOPSIS
  하루 단위(전날 18:00 ~ 해당일 18:00) Git 활동을 모아 docs/Dev Log/YYYY-MM-DD.md를 자동 생성한다.

.DESCRIPTION
  - .claude/devlog-state.json 에 마지막으로 처리 완료된 cutoff를 저장해두고, 그 이후
    처리되지 않은 날짜들을 순서대로 backfill한다.
  - 가장 최근에 "막 닫힌" 구간(이번 실행에서 처리하는 마지막 cutoff)에는 현재
    working tree의 uncommitted 변경사항도 함께 참고한다. 그보다 과거의 backfill
    구간은 오직 그 구간의 git 커밋 기록만 사용한다(uncommitted 변경을 과거 날짜에
    임의로 끼워넣지 않는다).
  - 실제 의미있는 변경이 없는 날짜는 파일을 만들지 않는다.
  - 이미 존재하는 날짜 파일은 건드리지 않는다(idempotent).
  - 이 스크립트가 실패해도 프로젝트 실행에는 아무 영향이 없어야 하므로, 모든 처리는
    이 프로세스 안에서만 일어나고 예외는 호출자(Run-DevLog.ps1)가 흡수한다.
#>

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

# Windows 작업 스케줄러가 실행하는 PowerShell 5.1은 콘솔 인코딩이 시스템 로캘(한글 Windows면
# CP949)로 잡혀있다. 이 상태로 claude -p에 한글 프롬프트를 파이프로 넘기거나 응답을 받으면
# 전부 깨진다(mojibake) — 그래서 아래에서 명시적으로 UTF-8로 맞춘다.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $RepoRoot

$StateFile = Join-Path $RepoRoot ".claude\devlog-state.json"
$DevLogDir = Join-Path $RepoRoot "docs\Dev Log"
$DocsDir   = Join-Path $RepoRoot "docs"

New-Item -ItemType Directory -Force -Path $DevLogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $StateFile -Parent) | Out-Null

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts] $msg"
}

# git은 경고를 stderr로 흘려보내는 경우가 많은데(예: CRLF 변환 경고), 스크립트
# 전역의 $ErrorActionPreference="Stop"과 만나면 그런 경고조차 실행을 중단시켜버린다.
# 이 헬퍼 안에서만 일시적으로 SilentlyContinue로 낮춰서 git 호출을 안전하게 만든다.
function Invoke-GitSafe {
    # -GitArgs를 명시적으로 받는다 — ValueFromRemainingArguments를 쓰면 "-p" 같은 짧은
    # 인자가 PowerShell 공통 파라미터(-PipelineVariable 등)로 잘못 매칭되는 문제가 있다.
    param([string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $out = & git @GitArgs 2>$null
        return $out
    } finally {
        $ErrorActionPreference = $prev
    }
}

# ── 1. 상태 파일 읽기 ─────────────────────────────────────────────
$now = Get-Date

if (Test-Path $StateFile) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    $lastCutoff = [datetime]$state.lastProcessedCutoff
    Write-Log "상태 파일에서 마지막 처리 cutoff 로드: $lastCutoff"
} else {
    # 최초 실행: "어제 18:00"을 기준점으로 삼아, 이번 실행에서는 오늘 하루치 구간만 처리한다.
    $lastCutoff = (Get-Date -Hour 18 -Minute 0 -Second 0).AddDays(-1)
    Write-Log "상태 파일 없음 — 최초 실행으로 간주, 기준점을 $lastCutoff 로 설정"
}

# ── 2. 아직 처리 안 된 cutoff 목록 계산 ─────────────────────────────
$cutoffs = @()
$cursor = $lastCutoff.AddDays(1)
while ($cursor -le $now) {
    $cutoffs += $cursor
    $cursor = $cursor.AddDays(1)
}

if ($cutoffs.Count -eq 0) {
    Write-Log "처리할 새 구간이 없습니다. (마지막 처리: $lastCutoff, 현재: $now)"
    exit 0
}

Write-Log "처리 대상 cutoff $($cutoffs.Count)개: $($cutoffs -join ', ')"

# ── 3. 회사 공용 문서(있으면) 기존 내용 미리 읽어두기 ─────────────────
function Read-IfExists($path) {
    if (Test-Path $path) { return Get-Content $path -Raw } else { return $null }
}

$currentStatusPath = Join-Path $DocsDir "Current Status.md"
$architecturePath  = Join-Path $DocsDir "Architecture.md"
$decisionsPath     = Join-Path $DocsDir "Decisions.md"

# ── 4. 각 cutoff(=하루 구간)에 대해 처리 ────────────────────────────
# "최신 구간" = uncommitted 변경을 참고해도 되는 구간. 단순히 "이번 배치의 마지막
# cutoff"가 아니라, 그 cutoff가 실제로 "지금"과 충분히 가까운 시각이어야 한다 —
# 그래야 지금 워킹트리에 남아있는 uncommitted 변경이 그 구간(오늘)의 작업이라고
# 신뢰할 수 있다. PC가 며칠 꺼져있다가 한번에 여러 날을 backfill하는 경우, 배치의
# 마지막 항목이라도 며칠 전에 이미 닫힌 구간일 수 있으므로 그런 경우는 제외한다.
$UncommittedAttributionThreshold = New-TimeSpan -Hours 6

$isLastIndex = $cutoffs.Count - 1

for ($i = 0; $i -le $isLastIndex; $i++) {
    $cutoff = $cutoffs[$i]
    $windowStart = $cutoff.AddDays(-1)
    $windowEnd = $cutoff
    $dateLabel = $cutoff.ToString("yyyy-MM-dd")
    $isLatestWindow = ($i -eq $isLastIndex) -and (($now - $cutoff) -lt $UncommittedAttributionThreshold)

    Write-Log "── $dateLabel 구간 처리 시작 [$windowStart ~ $windowEnd) (uncommitted 반영=$isLatestWindow) ──"

    $outFile = Join-Path $DevLogDir "$dateLabel.md"
    if (Test-Path $outFile) {
        Write-Log "이미 존재하는 Dev Log — 스킵: $outFile"
        # state는 그래도 갱신 (이 cutoff는 처리 완료로 간주)
        @{ lastProcessedCutoff = $cutoff.ToString("o") } | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
        continue
    }

    $sinceStr = $windowStart.ToString("yyyy-MM-dd HH:mm:ss")
    $untilStr = $windowEnd.ToString("yyyy-MM-dd HH:mm:ss")

    $commitHashes = Invoke-GitSafe -GitArgs @("log", "--since=$sinceStr", "--until=$untilStr", "--pretty=format:%H")
    $hasCommits = -not [string]::IsNullOrWhiteSpace(($commitHashes -join "`n"))

    $hasUncommitted = $false
    $uncommittedDiff = ""
    if ($isLatestWindow) {
        $porcelain = Invoke-GitSafe -GitArgs @("status", "--porcelain")
        $porcelainText = $porcelain -join "`n"
        if (-not [string]::IsNullOrWhiteSpace($porcelainText)) {
            $hasUncommitted = $true
            $diffText = (Invoke-GitSafe -GitArgs @("diff")) -join "`n"
            $diffCachedText = (Invoke-GitSafe -GitArgs @("diff", "--cached")) -join "`n"
            $uncommittedDiff = "$diffText`n$diffCachedText`n[untracked/변경 목록]`n$porcelainText"
        }
    }

    if (-not $hasCommits -and -not $hasUncommitted) {
        Write-Log "$dateLabel : 의미있는 변경 없음 — Dev Log 생성 안 함"
        @{ lastProcessedCutoff = $cutoff.ToString("o") } | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
        continue
    }

    # ── git 활동 상세 수집 (커밋 메시지 + stat + diff) ──
    $gitDetail = ""
    if ($hasCommits) {
        $gitDetail = (Invoke-GitSafe -GitArgs @("log", "--since=$sinceStr", "--until=$untilStr", "--stat", "-p")) -join "`n"
        # 프롬프트 크기 방어: 너무 크면 앞부분만 사용
        if ($gitDetail.Length -gt 60000) {
            $gitDetail = $gitDetail.Substring(0, 60000) + "`n`n...(내용이 길어 일부 생략됨)..."
        }
    }

    if ($hasUncommitted) {
        $trimmedUncommitted = $uncommittedDiff
        if ($trimmedUncommitted.Length -gt 20000) {
            $trimmedUncommitted = $trimmedUncommitted.Substring(0, 20000) + "`n...(생략)..."
        }
        $gitDetail += "`n`n[아직 commit되지 않은 현재 작업 중인 변경사항 — 오늘($dateLabel) 구간의 일부로 참고]`n" + $trimmedUncommitted
    }

    # ── 회사 공용 문서 현재 내용 ──
    $currentStatusContent = Read-IfExists $currentStatusPath
    $architectureContent  = Read-IfExists $architecturePath
    $decisionsContent     = Read-IfExists $decisionsPath

    # ── claude -p 프롬프트 구성 ──
    $promptPath = Join-Path $env:TEMP "devlog-prompt-$dateLabel.txt"

    $promptLines = @()
    $promptLines += "너는 이 프로젝트의 개발일지를 작성하는 어시스턴트다. 아래는 $dateLabel 날짜 구간($sinceStr ~ $untilStr)에 있었던 Git 활동(커밋 메시지, 변경 파일, diff, 그리고 있다면 아직 commit되지 않은 현재 변경사항)이다."
    $promptLines += ""
    $promptLines += "=== GIT ACTIVITY ==="
    $promptLines += $gitDetail
    $promptLines += "=== END GIT ACTIVITY ==="
    $promptLines += ""
    $promptLines += "이 내용을 바탕으로 다음 형식의 Dev Log를 작성해라:"
    $promptLines += ""
    $promptLines += "# $dateLabel"
    $promptLines += ""
    $promptLines += "## Done"
    $promptLines += "- 실제 완료된 주요 개발 내용"
    $promptLines += ""
    $promptLines += "## Problem"
    $promptLines += "- 발견하거나 해결한 중요한 문제"
    $promptLines += ""
    $promptLines += "## Decision"
    $promptLines += "- 중요한 기술적 결정이 있었던 경우만"
    $promptLines += ""
    $promptLines += "## Next"
    $promptLines += "- 코드나 TODO에서 명확하게 추론 가능한 다음 작업"
    $promptLines += ""
    $promptLines += "## 요약"
    $promptLines += "- 위 Done/Problem/Decision/Next를 개발 지식이 전혀 없는 사람도 이해할 수 있는 쉬운 말로 3~5문장 정리해라."
    $promptLines += "  전문용어(IP-Adapter, ControlNet, LoRA, API, 워크플로우 등)는 쓰지 말고, '~하는 기능을 추가했다', '~하던 문제를 고쳤다'처럼 일상적인 말로 풀어써라."
    $promptLines += "  오늘 결과적으로 사용자 입장에서 뭐가 달라졌는지/좋아졌는지를 중심으로 써라."
    $promptLines += ""
    $promptLines += "규칙:"
    $promptLines += "- 커밋 메시지를 그대로 나열하지 말고, 같은 기능/문제를 다루는 커밋들은 하나의 개발 작업 단위로 묶어서 자연스럽게 요약해라 (예: 'Add IP-Adapter' + 'Fix IP-Adapter loader' + 'Fix CLIP Vision' → 'SDXL 파이프라인에 IP-Adapter와 CLIP Vision 기반 reference image 기능을 통합'). 무엇을 했는지뿐 아니라 왜 그렇게 했는지도 diff/메시지에서 읽히면 반영해라."
    $promptLines += "- 상세한 파일별 변경 로그가 아니라, 나중에 이 프로젝트를 다시 열었을 때 그날 무엇을 했고 왜 그랬는지 빠르게 이해할 수 있는 수준으로 작성해라."
    $promptLines += "- 섹션에 쓸 내용이 없으면 그 섹션 전체(제목 포함)를 생략해라. 억지로 내용을 만들지 마라. 단, '## 요약'은 Done에 쓸 내용이 하나라도 있으면 항상 포함해라."
    $promptLines += "- 코드 조회/질문/git 상태 확인처럼 실제 코드·설계 변경이 아닌 것은 개발로 취급하지 마라."
    $promptLines += ""
    $promptLines += "Dev Log를 작성한 뒤, 아래 3개 문서 중 이번 변경으로 실제로 갱신이 필요한 것이 있는지 판단해라. 필요 없으면 해당 블록에 정확히 NONE 이라고만 써라. 필요하면 그 문서의 '갱신된 전체 파일 내용'을 통째로 써라(기존 내용을 참고해서 자연스럽게 이어지도록, 같은 내용을 중복 기술하지 말고)."
    $promptLines += ""
    $promptLines += "--- Current Status.md 현재 내용 ---"
    $promptLines += ($(if ($currentStatusContent) { $currentStatusContent } else { "(파일 없음)" }))
    $promptLines += "--- Architecture.md 현재 내용 ---"
    $promptLines += ($(if ($architectureContent) { $architectureContent } else { "(파일 없음)" }))
    $promptLines += "--- Decisions.md 현재 내용 ---"
    $promptLines += ($(if ($decisionsContent) { $decisionsContent } else { "(파일 없음)" }))
    $promptLines += ""
    $promptLines += "출력은 반드시 아래 구분자 형식을 정확히 지켜라 (다른 설명/인사말 없이):"
    $promptLines += ""
    $promptLines += "===DEVLOG==="
    $promptLines += "(여기에 Dev Log 마크다운 전체)"
    $promptLines += "===END_DEVLOG==="
    $promptLines += "===CURRENT_STATUS==="
    $promptLines += "(NONE 또는 갱신된 전체 파일 내용)"
    $promptLines += "===END_CURRENT_STATUS==="
    $promptLines += "===ARCHITECTURE==="
    $promptLines += "(NONE 또는 갱신된 전체 파일 내용)"
    $promptLines += "===END_ARCHITECTURE==="
    $promptLines += "===DECISIONS==="
    $promptLines += "(NONE 또는 갱신된 전체 파일 내용)"
    $promptLines += "===END_DECISIONS==="

    $promptText = $promptLines -join "`n"
    Set-Content -Path $promptPath -Value $promptText -Encoding UTF8

    Write-Log "$dateLabel : claude -p 호출 중..."
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $response = (Get-Content $promptPath -Raw | & claude -p 2>&1) -join "`n"
    } catch {
        Write-Log "claude 호출 실패: $_"
        $ErrorActionPreference = $prevPref
        Remove-Item $promptPath -ErrorAction SilentlyContinue
        continue
    }
    $ErrorActionPreference = $prevPref
    Remove-Item $promptPath -ErrorAction SilentlyContinue

    # ── 응답 파싱 ──
    function Extract-Block($text, $tag) {
        $pattern = "(?s)===${tag}===\s*(.*?)\s*===END_${tag}==="
        $m = [regex]::Match($text, $pattern)
        if ($m.Success) { return $m.Groups[1].Value.Trim() }
        return $null
    }

    $devlogContent = Extract-Block $response "DEVLOG"
    $statusUpdate = Extract-Block $response "CURRENT_STATUS"
    $archUpdate = Extract-Block $response "ARCHITECTURE"
    $decisionsUpdate = Extract-Block $response "DECISIONS"

    if ([string]::IsNullOrWhiteSpace($devlogContent)) {
        Write-Log "$dateLabel : claude 응답에서 Dev Log 내용을 파싱하지 못함. 원본 응답 로그에 기록."
        Write-Log "----- RAW RESPONSE START -----"
        Write-Log $response
        Write-Log "----- RAW RESPONSE END -----"
        # 실패했다고 state를 진행시키지 않는다 — 다음 실행에서 재시도되도록.
        continue
    }

    Set-Content -Path $outFile -Value $devlogContent -Encoding UTF8
    Write-Log "$dateLabel : Dev Log 생성 완료 -> $outFile"

    if ($statusUpdate -and $statusUpdate -ne "NONE") {
        Set-Content -Path $currentStatusPath -Value $statusUpdate -Encoding UTF8
        Write-Log "$dateLabel : Current Status.md 갱신됨"
    }
    if ($archUpdate -and $archUpdate -ne "NONE") {
        Set-Content -Path $architecturePath -Value $archUpdate -Encoding UTF8
        Write-Log "$dateLabel : Architecture.md 갱신됨"
    }
    if ($decisionsUpdate -and $decisionsUpdate -ne "NONE") {
        Set-Content -Path $decisionsPath -Value $decisionsUpdate -Encoding UTF8
        Write-Log "$dateLabel : Decisions.md 갱신됨"
    }

    # ── 이 cutoff까지 처리 완료로 상태 저장 ──
    @{ lastProcessedCutoff = $cutoff.ToString("o") } | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
    Write-Log "$dateLabel : 상태 파일 갱신 (lastProcessedCutoff=$cutoff)"
}

Write-Log "전체 처리 완료."
