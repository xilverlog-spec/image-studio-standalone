"""시험용 서버(포트 5100, 이 PC 안에서만) — 실서버(5000)를 재시작하지 않고 새 백엔드 코드를 시험한다.

  python scripts/tools/test_server.py [포트]

- 같은 코드·같은 .env 로 별개 프로세스를 띄운다. 127.0.0.1 에만 열어 다른 PC 가 접속하지 못한다.
- 도면 위 표시(diagram_edit)의 AI 그림 서버(Qwen)와 GPU 메모리 비우기는 막는다 → 실서버·ComfyUI(8188)의 작업에 영향이 없다.
  (구역·동선을 코드가 그리는 경로는 Gemini 만 쓰므로 그대로 시험된다. 코드가 경로를 못 찾아 Qwen 으로 가야 하는 경우는 '시험용 서버: AI 그림 서버 사용 금지' 오류로 끝난다.)
- 결과 이미지는 실서버와 같은 output/images 폴더에 저장된다(diagram_edit_*.png).
- 2026-10-26: 사용자가 이미지 생성을 쓰는 동안 서버를 재시작해 작업을 끊은 일이 있어 만들었다.
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND = os.path.join(ROOT, "backend")
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

import server  # noqa: E402
from services import diagram_edit as de  # noqa: E402


def _no(*a, **k):
    raise RuntimeError("시험용 서버: AI 그림 서버(Qwen) 사용 금지")


de.is_available = lambda: True
de.run_qwen = _no
de.ensure_server = _no
de._free = lambda *a, **k: None

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(server.app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 5100, log_level="warning")
