"""서버 멈춤 진단 (2026-10-26).

감시 스크립트가 "응답 없음"으로 서버를 강제 재시작해도, 무엇이 서버를 막았는지는 남지 않았다(재시작하면 흔적이 사라진다).
이 모듈은 별도 스레드가 5초마다 이벤트 루프에 일을 하나 맡겨 보고, threshold 초 안에 돌려받지 못하면(= 루프가 막혔다)
그 순간 모든 스레드의 호출 기록(어느 함수에서 멈췄는가)을 logs/hang_<시각>.log 로 남긴다. 루프가 풀리면 막혔던 시간도 같은 파일 끝에 적는다.
서버 동작에는 영향이 없다(읽기만 하는 스레드).
"""
import asyncio
import concurrent.futures
import os
import sys
import threading
import time
import traceback


async def _noop():
    return None


class HangProbe:
    def __init__(self, loop, out_dir, interval=5.0, threshold=8.0, cooldown=120.0):
        self.loop = loop
        self.out_dir = out_dir
        self.interval = interval
        self.threshold = threshold
        self.cooldown = cooldown
        self._stop = threading.Event()
        self._thread = None
        self._last_dump = -1e18

    def start(self):
        self._thread = threading.Thread(target=self._run, name="hang-probe", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    def _dump(self, waited):
        os.makedirs(self.out_dir, exist_ok=True)
        path = os.path.join(self.out_dir, "hang_%s.log" % time.strftime("%Y%m%d_%H%M%S"))
        names = {t.ident: t.name for t in threading.enumerate()}
        lines = ["서버 이벤트 루프가 %.1f초 넘게 응답하지 않아 기록함 (PID %d, %s)\n" % (waited, os.getpid(), time.strftime("%Y-%m-%d %H:%M:%S"))]
        for ident, frame in sys._current_frames().items():
            lines.append("\n--- 스레드 %s (%s) ---\n" % (names.get(ident, "?"), ident))
            lines.extend(traceback.format_stack(frame))
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        return path

    def _run(self):
        while not self._stop.wait(self.interval):
            t0 = time.monotonic()
            try:
                fut = asyncio.run_coroutine_threadsafe(_noop(), self.loop)
            except Exception:
                continue
            try:
                fut.result(timeout=self.threshold)
                continue
            except concurrent.futures.TimeoutError:
                pass
            except Exception:
                continue
            if time.monotonic() - self._last_dump < self.cooldown:
                continue
            self._last_dump = time.monotonic()
            try:
                path = self._dump(time.monotonic() - t0)
            except Exception:
                continue
            try:                                                   # 루프가 풀릴 때까지 기다려 막혔던 시간을 적는다
                fut.result(timeout=900)
                with open(path, "a", encoding="utf-8") as f:
                    f.write("\n이벤트 루프가 풀림 (recovered): 총 %.1f초 막혔음\n" % (time.monotonic() - t0))
            except Exception:
                pass


_probe = None


def start(loop, out_dir, **kw):
    """서버 시작 때 한 번 부른다. 이미 켜져 있으면 무시."""
    global _probe
    if _probe is None:
        _probe = HangProbe(loop, out_dir, **kw)
        _probe.start()
    return _probe
