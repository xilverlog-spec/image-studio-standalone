# 배포 스크립트
Write-Host "====== AI 이미지 생성 스튜디오 배포 ======" -ForegroundColor Cyan
Write-Host ""

$currentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distPath = Join-Path $currentDir "dist"

# IP 주소 확인
$ipAddress = (ipconfig | Select-String "IPv4 Address" | Select-Object -First 1 -ExpandProperty Line).Split(": ")[1].Trim()
Write-Host "현재 IP 주소: $ipAddress" -ForegroundColor Yellow
Write-Host ""

# 서버 시작 안내
Write-Host "⚠️  다음 명령어들을 각각 별도의 터미널에서 실행하세요:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Frontend 서버 (이 디렉토리에서):" -ForegroundColor Cyan
Write-Host "   python -m http.server 8080 --directory dist" -ForegroundColor Green
Write-Host ""
Write-Host "2️⃣  Backend 서버 (backend 디렉토리에서):" -ForegroundColor Cyan
Write-Host "   python main.py --host 0.0.0.0 --port 5000" -ForegroundColor Green
Write-Host ""
Write-Host "3️⃣  ComfyUI 서버 (ComfyUI 디렉토리에서):" -ForegroundColor Cyan
Write-Host "   python main.py --listen 0.0.0.0 --port 8188" -ForegroundColor Green
Write-Host ""
Write-Host "====== 배포 링크 ======" -ForegroundColor Cyan
Write-Host "다른 PC에서 접근: http://$ipAddress:8080" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backend API: http://$ipAddress:5000" -ForegroundColor Gray
Write-Host "ComfyUI: http://$ipAddress:8188" -ForegroundColor Gray
