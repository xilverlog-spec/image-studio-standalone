"""백엔드(5000) 안전 재시작 — 사용 중이면 거부한다 (2026-10-26).

  python scripts/servers/safe_restart_backend.py [최대 대기 분]   (기본 0 = 기다리지 않고 지금 판정)

재시작은 처리 중이던 요청의 결과 저장을 끊는다(2026-10-26 사용자의 이미지 생성 한 건이 기록에서 빠진 사고). 그래서 다음을 모두 만족할 때만 한다.
  - ComfyUI(8188)·Qwen(8189) 큐가 비어 있다(실행 중·대기 모두 0)
  - 마지막 이미지 생성이 3분 넘게 지났다
조건이 안 되면 재시작하지 않고(종료 코드 2) 이유를 출력한다. 최대 대기 분을 주면 그동안 20초마다 다시 본다.
재시작은 서버 프로세스를 끝내는 것뿐이고, 감시 스크립트(ImageStudio-Watchdog)가 15~20초 안에 새 코드로 다시 띄운다.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
wait_min = float(sys.argv[1]) if len(sys.argv) > 1 else 0


def queue_busy(port):
    try:
        j = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/queue", timeout=5))
        return len(j.get("queue_running", [])) + len(j.get("queue_pending", []))
    except Exception:
        return 0            # 서버가 꺼져 있으면 일이 없는 것


def recent_generation_age():
    try:
        c = sqlite3.connect(os.path.join(ROOT, "data", "image_studio.db"))
        r = c.execute("select max(created_at) from image_generations").fetchone()[0] or 0
        return time.time() - r
    except Exception:
        return 1e9


def idle_reason():
    for port in (8188, 8189):
        n = queue_busy(port)
        if n:
            return f"{port} 큐에 작업 {n}개"
    age = recent_generation_age()
    if age < 180:
        return f"{age:.0f}초 전에 이미지 생성이 끝남(곧 이어질 수 있음)"
    return None


def main():
    t_end = time.time() + wait_min * 60
    while True:
        why = idle_reason()
        if why is None:
            break
        print("대기:", why, flush=True)
        if time.time() >= t_end:
            print("재시작하지 않음 — 서버가 사용 중입니다.")
            return 2
        time.sleep(20)
    time.sleep(5)           # 확인 직후 시작된 요청이 없는지 한 번 더
    why = idle_reason()
    if why is not None:
        print("재시작하지 않음 — 마지막 확인에서 사용 중:", why)
        return 2
    cmd = "(Get-NetTCPConnection -LocalPort 5000 -State Listen).OwningProcess"
    pid = subprocess.run(["powershell.exe", "-NoProfile", "-Command", cmd], capture_output=True, text=True).stdout.strip()
    print("백엔드 PID", pid, "재시작")
    subprocess.run(["powershell.exe", "-NoProfile", "-Command", f"Stop-Process -Id {pid} -Force"])
    for i in range(24):
        time.sleep(5)
        try:
            urllib.request.urlopen("http://localhost:5000/health", timeout=4)
            print(f"재기동 확인 (약 {(i + 1) * 5}초)")
            return 0
        except Exception:
            pass
    print("재기동 확인 실패 — logs/watchdog.log 확인 필요")
    return 3


if __name__ == "__main__":
    sys.exit(main())
