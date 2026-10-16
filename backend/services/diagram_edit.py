"""도면 + 말 → 동선·구역을 표시한 다이어그램 (무료 로컬 AI 이미지 편집, 2026-10-16).

  1) 무료 Gemini 가 도면과 요청을 읽고, 이미지 편집 모델에 줄 영어 지시문(부서 색·동선 경로)과 한국어 제목·범례 초안을 쓴다.
  2) 로컬 Qwen-Image 2.1(ComfyUI 0.41 이상, 별도 포트)이 도면을 지시대로 다시 그린다. 이 모델은 글자를 조금씩 틀리게 그린다.
  3) 그래서 모델 결과에서 '연한 채움 색'과 '굵은 화살표'만 가져와 원본 도면 위에 곱해 얹는다 → 원본의 선·글자·치수는 100% 그대로.
  4) 결과에 실제로 나온 화살표 색만 범례로 만든다(Gemini 가 정한 색 이름과 맞춰 뜻을 붙임).

기존 FLUX/SDXL 이 쓰는 ComfyUI(포트 8188)는 건드리지 않는다. Qwen 서버는 없으면 자동으로 켜고, 끝나면 GPU 메모리를 비운다.
"""
import io
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import comfyui_client

QWEN_URL = os.getenv("QWEN_COMFY_URL", "http://127.0.0.1:8189").rstrip("/")
QWEN_DIR = os.getenv("QWEN_COMFY_DIR", r"C:\ComfyUI_v041")                 # 0.37 이상으로 올린 ComfyUI(코드·파이썬)
QWEN_MODELS = os.getenv("QWEN_MODELS_DIR", r"C:\ComfyUI\ComfyUI\models")    # 모델 파일은 기존 폴더를 공유한다
UNET = "qwen_image_2.1_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_w4a8.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
INSTRUCT_MODEL = os.getenv("DIAGRAM_EDIT_INSTRUCT_MODEL", "gemini-3.5-flash")
SEC_PER_IT_1536 = 10.5      # RTX 4070 Laptop 8GB 실측(해상도 1536). 해상도 제곱에 거의 비례
LOAD_SEC = 70               # 모델을 처음 불러오는 시간(추정)
JOB_TTL = 3600

JOBS = {}
_JOBS_LOCK = threading.Lock()
_RUN_LOCK = threading.Lock()   # 그림 서버(=GPU)는 동시에 하나만


def _project_logs():
    d = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))
    os.makedirs(d, exist_ok=True)
    return d


def _out_dir():
    d = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "images"))
    os.makedirs(d, exist_ok=True)
    return d


def is_available():
    """이 PC 에 Qwen 서버를 켤 수 있는 파일이 다 있는지(서버가 꺼져 있어도 True)."""
    return all(os.path.exists(p) for p in (
        os.path.join(QWEN_DIR, "ComfyUI", "main.py"), os.path.join(QWEN_DIR, "python_embeded", "pythonw.exe"),
        os.path.join(QWEN_MODELS, "diffusion_models", UNET), os.path.join(QWEN_MODELS, "text_encoders", CLIP), os.path.join(QWEN_MODELS, "vae", VAE),
    ))


def _up(url, timeout=2.0):
    try:
        urllib.request.urlopen(url + "/system_stats", timeout=timeout).read()
        return True
    except Exception:
        return False


def status_info():
    return {"available": is_available(), "server_up": _up(QWEN_URL), "est_minutes": "3~6"}


def _free(url):
    try:
        req = urllib.request.Request(url + "/free", data=json.dumps({"unload_models": True, "free_memory": True}).encode(), headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print(f"[DIAGRAM-EDIT] 메모리 비우기 실패({url}): {str(e)[:80]}")


def ensure_server():
    if _up(QWEN_URL):
        return
    if not is_available():
        raise RuntimeError("이 PC 에 Qwen 이미지 편집 환경(C:\\ComfyUI_v041 과 모델 파일)이 없습니다.")
    port = urllib.parse.urlparse(QWEN_URL).port or 8189
    logs = _project_logs()
    flags = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW — 백엔드가 꺼져도 살아 있게
    out = open(os.path.join(logs, "comfyui41_stdout.log"), "ab")
    err = open(os.path.join(logs, "comfyui41_stderr.log"), "ab")
    subprocess.Popen([os.path.join(QWEN_DIR, "python_embeded", "pythonw.exe"), "-s", r"ComfyUI\main.py", "--windows-standalone-build", "--port", str(port), "--disable-smart-memory"],
                     cwd=QWEN_DIR, stdout=out, stderr=err, stdin=subprocess.DEVNULL, creationflags=flags)
    t0 = time.time()
    while time.time() - t0 < 180:
        if _up(QWEN_URL):
            return
        time.sleep(2)
    raise RuntimeError("Qwen 그림 서버가 180초 안에 켜지지 않았습니다(logs/comfyui41_stderr.log 확인).")


# ── 1) 지시문 ─────────────────────────────────────────────────────────────

def fallback_instruction(ask):
    """Gemini 가 지시문을 쓰지 못할 때(한도·혼잡): 도면을 읽지 못하므로 방 이름·경로는 모른다 → 사용자 요청(한국어 그대로)을 넣고 그림 종류에 중립인 일반 지시문을 쓴다.
    (시험: 방 이름 목록이 없으면 방 색칠이 거의 안 되므로 품질이 눈에 띄게 낮다 — 결과에 'fallback' 으로 표시해 화면이 알린다)"""
    return (
        "Keep the image exactly as it is: every line, shape, object, existing text, label and number stays unchanged and legible. Do NOT add any new text, title or legend. "
        f'Overlay the diagram the user asked for on top of the image (the request, in Korean: "{(ask or "").strip() or "동선을 표시한 다이어그램"}"). '
        "Use soft translucent pastel color fills for the zones, rooms or objects involved, giving the same color to those of the same use or department so that no relevant room or area is left uncolored, "
        "and bold continuous dashed arrows with clear arrowheads for any flows, each flow type in a different color, drawn strictly along real paths such as corridors, roads, sidewalks and open spaces."
    )


_COLOR_NAMES = ("red", "orange", "yellow", "green", "blue", "purple")


def _instruct_prompt(ask):
    return f"""You write instructions for an image-editing model (it receives the attached image and your instruction, and repaints the image).
The user's request (Korean): "{ask}"
The attached image can be any architectural image: a floor plan, a site/aerial view, a 3D (SketchUp) view, a render or photo, a section/elevation, or a sketch. Look at it and answer with JSON only (no code fence):
{{"instruction": "...", "title": "...", "legend": [{{"color": "red|orange|yellow|green|blue|purple", "kind": "zone|flow", "label": "..."}}]}}
- "instruction": ONE English instruction (max 260 words) that makes the editing model overlay the diagram the user asked for ON TOP OF the existing image. It must:
  1. start by saying: keep the image exactly as it is (every line, shape, object, existing text, label and number unchanged and legible) and do NOT add any new text, title or legend;
  2. decide what kind of diagram the request means (e.g. circulation/movement, zoning or functional areas, access, sun/daylight/wind, massing) and describe precisely what to overlay: soft translucent pastel color fills for the zones or objects involved (name them using text visible in the image, or by position/appearance if there is no text), and bold continuous dashed arrows with clear arrowheads for flows, each flow type in a different color;
  3. say where each arrow starts and ends and which real paths it follows (corridors, roads, sidewalks, open space, entrance), using left/right/top/bottom and the names or objects visible in the image; for a perspective or aerial view say the arrows lie on the ground or floor following the perspective;
  4. if the image is a plan with many rooms, list the Korean room names you can read (copy them exactly), group them into 3-5 zones with distinct pastel colors, say every room is colored, and start the main route at the main entrance.
- "title": a short Korean diagram title (max 20 characters) that fits the request.
- "legend": one entry per color you used, with the same color name, "kind" = "zone" for a color fill or "flow" for an arrow, and a short Korean label (max 16 characters, e.g. "가공 구역" or "주 동선: 출입구→중앙홀"). Use each color name only once across the whole legend (at most 6 entries); if you need more zones, merge related ones."""


def _parse_json(txt):
    s = (txt or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    try:
        return json.loads(s)
    except Exception:
        m = re.search(r"\{.*\}", s, re.S)
        if m:
            return json.loads(m.group(0))
        raise


def build_instruction(png_bytes, ask):
    """(지시문, 제목, 범례 초안, 출처). Gemini 가 안 되면(한도·혼잡) 사용자 요청을 담은 일반 지시문으로 대체하고 출처를 'fallback' 으로 표시한다."""
    import base64
    from services import gemini_chat as G
    ask = (ask or "").strip() or "동선을 표시한 다이어그램"
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    k = 1800 / max(img.size)
    if k < 1:
        img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    last = None
    for attempt in range(2):   # 모든 모델이 한꺼번에 혼잡(503)한 때가 있어, 실패하면 잠시 뒤 한 번 더 해 본다
        try:
            txt = G.gemini_chat_completion(INSTRUCT_MODEL, [{"role": "user", "content": _instruct_prompt(ask), "images": [b64]}], max_tokens=4000, temperature=0.3)
            d = _parse_json(txt)
            ins = str(d.get("instruction") or "").strip()
            if len(ins) < 60:
                raise ValueError("지시문이 비어 있음")
            legend = [{"color": str(r.get("color", "")).lower(), "kind": "zone" if str(r.get("kind", "")).lower() == "zone" else "flow", "label": str(r.get("label", ""))[:24]} for r in (d.get("legend") or d.get("routes") or []) if isinstance(r, dict)][:6]
            return ins, str(d.get("title") or "")[:30], legend, "gemini"
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt == 0:
                print(f"[DIAGRAM-EDIT] 지시문 작성 실패, 15초 뒤 한 번 더: {str(e)[:100]}")
                time.sleep(15)
    print(f"[DIAGRAM-EDIT] 지시문 작성 실패 → 일반 지시문 사용: {str(last)[:120]}")
    return fallback_instruction(ask), "", [], "fallback"


# ── 2) Qwen 편집 ──────────────────────────────────────────────────────────

def _upload(png_bytes):
    name = f"dgedit_{uuid.uuid4().hex[:8]}.png"
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n').encode() + png_bytes + (f'\r\n--{b}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{b}--\r\n').encode()
    req = urllib.request.Request(QWEN_URL + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=60))["name"]


def build_workflow(image_name, instruction, resolution, steps, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "QwenImage21Cache", "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "5": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "6": {"class_type": "TextEncodeQwenImage21", "inputs": {"clip": ["3", 0], "prompt": instruction, "negative_prompt": "", "resolution": resolution, "images.image_1": ["5", 0], "vae": ["4", 0]}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "positive": ["6", 0], "negative": ["6", 1], "latent_image": ["6", 2], "seed": seed, "steps": steps, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["4", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "qwen21_dgedit"}},
    }


def pick_resolution(size):
    long_side = max(size)
    return 1024 if long_side <= 1100 else 1280 if long_side <= 1400 else 1536   # 2048(원래 해상도)은 8GB 에서 시험하지 않았다


def estimate_seconds(resolution, steps, cold=True):
    return (LOAD_SEC if cold else 10) + steps * SEC_PER_IT_1536 * (resolution / 1536.0) ** 2


def run_qwen(png_bytes, instruction, resolution, steps, seed, on_wait=None, timeout=1500):
    name = _upload(png_bytes)
    wf = build_workflow(name, instruction, resolution, steps, seed)
    req = urllib.request.Request(QWEN_URL + "/prompt", data=json.dumps({"prompt": wf, "client_id": "diagram-edit"}).encode(), headers={"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req, timeout=60))["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"그림 서버가 작업을 받지 않았습니다: {e.read().decode(errors='replace')[:300]}")
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.load(urllib.request.urlopen(f"{QWEN_URL}/history/{pid}", timeout=30))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError("그림 서버에서 오류가 났습니다: " + json.dumps(st.get("messages", [])[-1:], ensure_ascii=False)[:300])
            for o in h[pid]["outputs"].values():
                for im in o.get("images", []):
                    q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})
                    return Image.open(io.BytesIO(urllib.request.urlopen(f"{QWEN_URL}/view?{q}", timeout=60).read())).convert("RGB")
            raise RuntimeError("그림 서버가 이미지를 돌려주지 않았습니다.")
        if on_wait:
            on_wait(time.time() - t0)
        time.sleep(2)
    raise TimeoutError("그림 서버가 제한 시간 안에 끝내지 못했습니다.")


# ── 3) 원본 위에 합성 + 범례 ─────────────────────────────────────────────

_HUE_BANDS = (("red", 0, 12), ("orange", 12, 32), ("yellow", 32, 50), ("green", 50, 110), ("blue", 135, 185), ("purple", 185, 225), ("red", 244, 256))   # PIL HSV 색상(0~255)


def _strong(img, s, v):
    hsv = np.asarray(img.convert("HSV"), np.float32) / 255
    return (hsv[..., 1] > s) & (hsv[..., 2] > v)


def composite(original, model_out):
    """모델 결과의 '연한 채움 색'(곱하기)과 '굵은 화살표'만 원본 위에 얹는다. 반환: (합성 이미지, 화살표 마스크)."""
    O = original.convert("RGB")
    W, H = O.size
    Qi = model_out.convert("RGB").resize((W, H), Image.LANCZOS)
    Of = np.asarray(O, np.float32) / 255
    Qf = np.asarray(Qi, np.float32) / 255
    T = ndi.grey_dilation(Qf, size=(13, 13, 1))              # 가는 선·글자를 지우고 주변 채움색만 남긴다
    T = np.clip(ndi.gaussian_filter(T, sigma=(1.5, 1.5, 0)), 0, 1)
    o_strong = ndi.binary_dilation(_strong(O, 0.45, 0.45), structure=np.ones((9, 9)))   # 원본에 있던 강한 색(범위선·식재)은 원본 것을 쓴다
    arrow = _strong(Qi, 0.55, 0.5) & ~o_strong
    arrow = ndi.binary_opening(arrow, structure=np.ones((2, 2)))
    arrow = ndi.binary_dilation(arrow, structure=np.ones((3, 3)))
    a = ndi.gaussian_filter(arrow.astype(np.float32), 0.8)[..., None]
    R = Of * T
    R = R * (1 - a) + Qf * a
    return Image.fromarray((np.clip(R, 0, 1) * 255).astype(np.uint8)), arrow


def is_line_drawing(img, white_frac=0.45):
    """흰 종이 위의 선 도면인지(평면도·단면도·CAD). 사진·렌더·3D 캡처는 아니다 — 곱하기 합성은 선 도면에서만 맞다."""
    a = np.asarray(img.convert("RGB").resize((256, int(256 * img.height / img.width) or 1)))
    return float((a.min(axis=2) > 235).mean()) >= white_frac


def finish(original, model_out):
    """모델 결과 → 최종 이미지. 선 도면이면 원본 위에 색·화살표만 얹고(글자·선 원본 그대로), 사진·3D 뷰면 모델 결과를 원본 크기로 맞춰 쓴다. 반환: (이미지, 화살표 마스크, 방식)."""
    if is_line_drawing(original):
        comp, arrow = composite(original, model_out)
        return comp, arrow, "overlay"
    O = original.convert("RGB")
    Qi = model_out.convert("RGB").resize(O.size, Image.LANCZOS)
    o_strong = ndi.binary_dilation(_strong(O, 0.45, 0.45), structure=np.ones((9, 9)))
    arrow = ndi.binary_opening(_strong(Qi, 0.55, 0.5) & ~o_strong, structure=np.ones((2, 2)))
    return Qi, arrow, "model"


def _hue_name(h):
    for n, lo, hi in _HUE_BANDS:
        if lo <= h < hi:
            return n
    return None


def legend_from_result(final, original, arrow, gem_legend, min_arrow_px=350, min_fill_frac=0.004):
    """결과에 실제로 나온 색만 범례로: ① 굵은 화살표 색(kind=flow) ② 원본 위에 새로 칠해진 연한 채움 색(kind=zone, 선 도면 합성일 때만).
    뜻은 Gemini 가 정한 같은 색 이름·종류의 설명을 쓴다(없으면 '구역'/'동선')."""
    rgb = np.asarray(final.convert("RGB"))
    hsv = np.asarray(final.convert("HSV"))
    lab = {}
    for r in gem_legend or []:
        if r.get("color") in _COLOR_NAMES and r.get("label"):
            lab.setdefault((r.get("kind", "flow"), r["color"]), r["label"])
    out = []
    if arrow is not None and arrow.any():
        for name in dict.fromkeys(b[0] for b in _HUE_BANDS):
            m = arrow & (hsv[..., 1] > 140) & np.isin(hsv[..., 0], [h for h in range(256) if _hue_name(h) == name])
            cnt = int(m.sum())
            if cnt >= min_arrow_px:
                out.append((cnt, "flow", name, np.median(rgb[m], axis=0).astype(int)))
    out.sort(key=lambda t: -t[0])
    flows = [{"color": "#%02X%02X%02X" % tuple(c), "kind": "flow", "label": lab.get(("flow", n)) or lab.get(("zone", n)) or "동선"} for _cnt, _k, n, c in out[:4]]
    zones = []
    if original is not None:
        o = np.asarray(original.convert("RGB").resize(final.size)).astype(np.int16)
        tinted = (np.abs(rgb.astype(np.int16) - o).sum(axis=2) > 24) & (hsv[..., 1] > 25) & (hsv[..., 1] < 140)
        if arrow is not None:
            tinted &= ~ndi.binary_dilation(arrow, structure=np.ones((5, 5)))
        total = tinted.size
        found = []
        for name in dict.fromkeys(b[0] for b in _HUE_BANDS):
            m = tinted & np.isin(hsv[..., 0], [h for h in range(256) if _hue_name(h) == name])
            frac = float(m.sum()) / total
            if frac >= min_fill_frac:
                found.append((frac, name, np.median(rgb[m], axis=0).astype(int)))
        found.sort(key=lambda t: -t[0])
        zones = [{"color": "#%02X%02X%02X" % tuple(c), "kind": "zone", "label": lab.get(("zone", n)) or lab.get(("flow", n)) or "구역"} for _f, n, c in found[:5]]
    if lab:   # Gemini 가 범례를 줬다면, 뜻을 모르는 색(원본에 원래 있던 갈색 정원 등이 곱하기로 바뀐 것)은 범례에서 뺀다
        zones = [z for z in zones if z["label"] != "구역"]
        flows = [f for f in flows if f["label"] != "동선"]
    return zones + flows


# ── 작업 ──────────────────────────────────────────────────────────────────

def _update(job, **kw):
    with _JOBS_LOCK:
        job.update(kw)


def _run(job_id, png_bytes, ask, steps, seed):
    job = JOBS[job_id]
    try:
        original = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        _update(job, status="running", stage="1/4 지시문을 쓰는 중(무료 Gemini)", percent=3)
        instruction, title, routes, source = build_instruction(png_bytes, ask)
        resolution = pick_resolution(original.size)
        _update(job, stage="앞선 그림 작업을 기다리는 중", percent=8)
        from services import line_pipeline   # 같은 GPU 를 쓰는 선 추출 파이프라인과 순서를 맞춘다
        with line_pipeline._RUN_LOCK, _RUN_LOCK:
            cold = not _up(QWEN_URL)
            _update(job, stage="2/4 그림 서버를 준비하는 중" + (" (처음에는 1~2분 더 걸립니다)" if cold else ""), percent=10)
            _free(comfyui_client.COMFYUI_URL)      # 기존 FLUX 쪽이 잡고 있는 그래픽 메모리를 먼저 비운다
            ensure_server()
            expect = estimate_seconds(resolution, steps, cold)

            def on_wait(el):
                _update(job, stage=f"3/4 AI 가 그리는 중 (예상 {int(expect // 60) + 1}분 안팎)", percent=min(92, 12 + int(80 * el / expect)))
            try:
                out = run_qwen(png_bytes, instruction, resolution, steps, seed, on_wait)
            finally:
                _free(QWEN_URL)                    # 끝나면(실패해도) Qwen 이 잡은 그래픽 메모리를 돌려준다
        _update(job, stage="4/4 원본 도면 위에 색·화살표를 얹는 중", percent=95)
        comp, arrow, how = finish(original, out)
        legend = legend_from_result(comp, original if how == "overlay" else None, arrow, routes)
        fid = f"diagram_edit_{job_id}"
        comp.save(os.path.join(_out_dir(), fid + ".png"))
        out.save(os.path.join(_out_dir(), fid + "_raw.png"))
        _update(job, status="done", stage="완료", percent=100, result={"image": f"/generated/{fid}.png", "raw": f"/generated/{fid}_raw.png", "width": comp.width, "height": comp.height,
                                                                         "title": title, "legend": legend, "instruction": instruction, "instruction_source": source, "finish": how, "resolution": resolution, "seconds": int(time.time() - job["created"])})
    except Exception as e:  # noqa: BLE001 — 사유를 화면에 그대로 보여 준다
        print(f"[DIAGRAM-EDIT] 실패: {e}")
        _update(job, status="error", stage="실패", error=str(e)[:400])


def start_job(png_bytes, ask="", steps=25, seed=None):
    if not is_available():
        raise RuntimeError("이 PC 에 Qwen 이미지 편집 환경이 없습니다(C:\\ComfyUI_v041 과 모델 파일 필요).")
    now = time.time()
    steps = max(8, min(50, int(steps)))
    seed = int(seed) if seed is not None else int.from_bytes(os.urandom(3), "big")
    with _JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if now - v.get("created", now) > JOB_TTL]:
            JOBS.pop(k, None)
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = {"status": "queued", "stage": "대기 중", "percent": 0, "created": now}
    threading.Thread(target=_run, args=(job_id, png_bytes, ask, steps, seed), daemon=True).start()
    return job_id


def get_job(job_id):
    with _JOBS_LOCK:
        j = JOBS.get(job_id)
        return dict(j) if j else None
