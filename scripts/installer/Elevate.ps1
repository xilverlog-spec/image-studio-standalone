# 설치하기.bat이 호출하는 관리자 권한 승격용 런처.
# cmd.exe -> powershell -Command 안에 경로(공백/한글 포함)를 문자열로 직접 끼워넣으면
# 여러 겹 따옴표 escaping이 꼬여서 깨지기 쉬우므로, 별도 .ps1 파일로 분리해
# $PSScriptRoot로 경로를 안전하게 구한다.
$target = Join-Path $PSScriptRoot "Install-ImageStudio.ps1"

try {
    # Start-Process -ArgumentList는 배열 요소에 공백이 있어도 자동으로 따옴표를 붙여주지
    # 않으므로, 경로 인자는 직접 큰따옴표로 감싸서 넘긴다.
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$target`""
    )
} catch {
    Write-Host "설치 프로그램 실행 실패: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "엔터를 누르면 종료합니다"
}
