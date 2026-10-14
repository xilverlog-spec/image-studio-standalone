"""유료 '정밀 읽기' 통로 점검(실제 유료 호출 없이 가짜 응답으로). 키가 없을 때 꺼지는지, 키·모델이 있으면 켜지고 장부에 기록되는지,
하루 한도를 넘으면 막히는지, 실패하면 장부에 올리지 않는지, 무료 모델로 몰래 대체하지 않는지를 확인한다.
사용: python scripts/regression/check_paid_vision.py"""
import json, os, sys, tempfile, urllib.error, warnings
warnings.filterwarnings('ignore')
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'backend'))
from services import paid_image, paid_vision, gemini_chat  # noqa: E402

fails = []
def check(name, cond, extra=''):
    print(('통과  ' if cond else '실패  ') + name + (f'  ({extra})' if extra and not cond else ''))
    if not cond: fails.append(name)

tmp = tempfile.mkdtemp(); paid_image._USAGE_FILE = os.path.join(tmp, 'paid_usage.json'); paid_image.PAID_DAILY_LIMIT_USD = 0.05
paid_vision.PAID_COST_VISION_USD = 0.03
msgs = [{'role': 'user', 'content': '읽어라', 'images': ['AAAA']}]

# 1) 키·모델이 없으면 꺼져 있다
paid_vision.GEMINI_PAID_API_KEY = ''; paid_vision.GEMINI_PAID_VISION_MODEL = ''
check('키·모델 없음 → available False', paid_vision.status()['available'] is False)
try: paid_vision.chat(msgs); check('키 없이 호출하면 오류', False)
except RuntimeError: check('키 없이 호출하면 오류', True)
paid_vision.GEMINI_PAID_API_KEY = 'KEY'; paid_vision.GEMINI_PAID_VISION_MODEL = ''
check('키만 있고 모델 없음 → available False', paid_vision.status()['available'] is False)

# 2) 켜진 상태: 지정한 모델·키로 한 번만 호출하고 장부에 올린다
calls = []
def fake_ok(model, messages, max_tokens, temperature, api_key=None):
    calls.append((model, api_key, max_tokens)); return '{"ok":1}'
paid_vision._gemini_chat_once = fake_ok
paid_vision.GEMINI_PAID_API_KEY = 'PAIDKEY'; paid_vision.GEMINI_PAID_VISION_MODEL = 'gemini-pro-test'
check('키+모델 → available True', paid_vision.status()['available'] is True)
out = paid_vision.chat(msgs)
check('지정한 모델·유료 키로 정확히 1번 호출', calls == [('gemini-pro-test', 'PAIDKEY', 16000)] and out == '{"ok":1}', str(calls))
u = paid_image.usage_today()
check('성공하면 장부에 기록(count 1, $0.03)', u['count'] == 1 and abs(u['usd'] - 0.03) < 1e-9, str(u))

# 3) 하루 한도: 0.03 + 0.03 > 0.05 → 막히고 호출하지 않는다
try: paid_vision.chat(msgs); check('한도 초과 시 막힘', False)
except RuntimeError as e: check('한도 초과 시 막힘', '한도' in str(e))
check('막힌 호출은 API 를 부르지 않고 장부도 그대로', len(calls) == 1 and paid_image.usage_today()['count'] == 1)

# 4) 호출이 실패하면 장부에 올리지 않는다
paid_image.PAID_DAILY_LIMIT_USD = 10
def fake_fail(*a, **k): raise RuntimeError('Gemini API 오류(500): boom')
paid_vision._gemini_chat_once = fake_fail
try: paid_vision.chat(msgs); check('실패는 그대로 올림', False)
except RuntimeError: check('실패는 그대로 올림', True)
check('실패한 호출은 장부에 안 올림', paid_image.usage_today()['count'] == 1)

# 5) 실제 요청 형태: 유료 키·지정 모델 URL 로 가고, 429 가 나도 다른(무료) 모델로 넘어가지 않는다
seen = []
class _Res:
    def __init__(self, d): self.d = d
    def read(self): return json.dumps(self.d).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False
orig_urlopen = gemini_chat.urllib.request.urlopen
def fake_urlopen(req, timeout=0):
    seen.append(req.full_url)
    raise urllib.error.HTTPError(req.full_url, 429, 'quota', {}, __import__('io').BytesIO(b'{"error":{"message":"quota exceeded"}}'))
gemini_chat.urllib.request.urlopen = fake_urlopen
import importlib; importlib.reload(paid_vision)  # 가짜를 걷어내고 진짜 _gemini_chat_once 로
paid_vision.GEMINI_PAID_API_KEY = 'PAIDKEY'; paid_vision.GEMINI_PAID_VISION_MODEL = 'gemini-pro-test'
try: paid_vision.chat(msgs); check('429 는 오류로 올라옴', False)
except RuntimeError as e: check('429 는 오류로 올라옴', '429' in str(e))
gemini_chat.urllib.request.urlopen = orig_urlopen
check('요청 URL 이 유료 키·지정 모델 한 곳뿐(무료 모델 대체 없음)', len(seen) == 1 and 'gemini-pro-test:generateContent' in seen[0] and 'key=PAIDKEY' in seen[0], str(seen))

# 6) 라우트: 설정이 없으면 400, 있으면 200
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import chat as chat_route
app = FastAPI(); app.include_router(chat_route.router); c = TestClient(app)
body = {'messages': [{'role': 'user', 'content': 'x'}], 'paid': True}
paid_vision.GEMINI_PAID_VISION_MODEL = ''
r = c.post('/v1/chat/completions', json=body); check('라우트: 설정 없으면 400', r.status_code == 400, str(r.status_code))
r = c.get('/v1/paid/vision-status'); check('라우트: 상태 조회(키 노출 없음)', r.status_code == 200 and 'KEY' not in r.text and r.json()['available'] is False)
paid_vision.GEMINI_PAID_VISION_MODEL = 'gemini-pro-test'
paid_vision._gemini_chat_once = lambda *a, **k: 'hello'
r = c.post('/v1/chat/completions', json=body); check('라우트: 설정 있으면 200', r.status_code == 200 and r.json()['choices'][0]['message']['content'] == 'hello', r.text[:80])

print('\n모두 통과' if not fails else f'\n실패 {len(fails)}건: {fails}')
sys.exit(1 if fails else 0)
