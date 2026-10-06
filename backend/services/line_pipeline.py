"""이미지 → 깨끗한 단선 SVG 전체 파이프라인(백그라운드 작업).

  1) 이미지를 '칸(도식 덩어리)'과 '글자줄'로 나눈다.
  2) 칸마다: AI(FLUX Kontext, 로컬)로 깨끗한 선화로 다시 그리고 → 원본과 형태가 같은지 검증 → 선 추출(line_trace).
     AI가 형태를 바꿨거나 실패하면 그 칸만 원본에서 바로 선 추출한다.
  3) 글자는 AI가 망가뜨리지 않도록 원본에서 따로 옮긴다(글자 인식이 주어지면 편집 가능한 <text>).
  4) 칸 결과를 원래 위치에 합쳐 하나의 SVG로 만든다.
ComfyUI는 한 번에 하나만 처리하므로 작업은 전역 락으로 한 줄로 세운다.
"""
import io
import os
import re
import threading
import time
import uuid

import numpy as np
from PIL import Image

import comfyui_client
from services import line_trace

REDRAW_INSTRUCTION = (
    "Redraw this isometric architecture diagram as a clean, crisp, high-resolution black line drawing on a pure white background. "
    "Keep every shape, proportion, edge position and the camera angle exactly the same. Remove all textures, shading, colors and noise. "
    "Use only thin uniform black single lines. Do not add or remove any object."
)
REDRAW_LONG_EDGE = 1100
SHAPE_IOU_MIN = 0.72
JOB_TTL = 3600

JOBS = {}
_JOBS_LOCK = threading.Lock()
_RUN_LOCK = threading.Lock()   # 파이프라인(=GPU)은 동시에 하나만


def _tmp_dir():
    d = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "output", "tmp"))
    os.makedirs(d, exist_ok=True)
    return d


def _svg_inner(svg):
    body = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    return re.sub(r'^\s*<rect width="100%" height="100%" fill="#fff"/>\s*', "", body, count=1)


def _rescale_strokes(inner, factor):
    def num(m):
        return 'stroke-width="%.3f"' % (float(m.group(1)) * factor)

    def dash(m):
        return 'stroke-dasharray="%s"' % " ".join("%.2f" % (float(v) * factor) for v in m.group(1).split())
    inner = re.sub(r'stroke-width="([\d.]+)"', num, inner)
    return re.sub(r'stroke-dasharray="([\d.\s]+)"', dash, inner)


def _png_bytes(img):
    b = io.BytesIO()
    img.convert("RGB").save(b, "PNG")
    return b.getvalue()


def _shape_iou(original, redrawn):
    a = line_trace.filled_shape_mask(original, line_art=False)
    b = line_trace.filled_shape_mask(redrawn, line_art=True)
    if a is None or b is None:
        return 0.0
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter) / float(union) if union else 0.0


def _redraw_panel(crop, seed, tag):
    """칸 하나를 Kontext로 선화로 재생성. 성공하면 PIL 이미지, 아니면 (None, 사유)."""
    k = REDRAW_LONG_EDGE / float(max(crop.size))
    sized = crop.resize((max(64, int(crop.width * k)), max(64, int(crop.height * k))), Image.LANCZOS)
    out_path = os.path.join(_tmp_dir(), f"redraw_{tag}_{uuid.uuid4().hex[:6]}.png")
    try:
        comfyui_client.edit_image_with_kontext_or_raise(_png_bytes(sized), REDRAW_INSTRUCTION, out_path, seed=seed)
        if not os.path.exists(out_path):
            return None, "AI가 이미지를 반환하지 않았습니다"
        img = Image.open(out_path).convert("RGB")
        img.load()
        if os.environ.get("LINE_PIPELINE_KEEP"):  # 디버그: AI가 다시 그린 중간 이미지 보관
            img.save(os.path.join(os.environ["LINE_PIPELINE_KEEP"], f"redraw_{tag}.png"))
        return img, None
    except Exception as e:
        return None, str(e)[:160]
    finally:
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass


def _update(job, **kw):
    with _JOBS_LOCK:
        job.update(kw)


def _run(job_id, png_bytes, read_text, fills, redraw, ocr_texts, max_panels=None):
    job = JOBS[job_id]
    with _RUN_LOCK:
        _update(job, status="running", stage="이미지 분석 중")
        try:
            img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
            W, H = img.size
            layout = line_trace.analyze_layout(img)
            objects = layout["objects"] or [(0, 0, W, H)]
            labels = layout["labels"]
            if max_panels and len(objects) > max_panels:
                all_objs, objects = objects, objects[:max_panels]
                def _near(lb):
                    cx, cy = (lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2
                    return min(range(len(all_objs)), key=lambda i: ((all_objs[i][0] + all_objs[i][2]) / 2 - cx) ** 2 + ((all_objs[i][1] + all_objs[i][3]) / 2 - cy) ** 2)
                labels = [lb for lb in labels if _near(lb) < max_panels]
            use_ai = bool(redraw) and comfyui_client.is_flux_kontext_available()
            warnings = []
            if redraw and not use_ai:
                warnings.append("AI 재생성 모델(FLUX Kontext)을 사용할 수 없어 원본에서 바로 추출했습니다.")
            _update(job, total=len(objects), done=0)

            k_final = max(1.0, max(W, H) / 1200.0)
            parts, stats_acc = [], {"lines": 0, "arrows": 0, "ai_panels": 0, "fallback_panels": 0}
            margin = int(0.012 * max(W, H))
            for idx, (x0, y0, x1, y1) in enumerate(objects):
                bx0, by0 = max(0, x0 - margin), max(0, y0 - margin)
                bx1, by1 = min(W, x1 + margin), min(H, y1 + margin)
                crop = img.crop((bx0, by0, bx1, by1))
                cw, ch = crop.size
                _update(job, stage=f"칸 {idx + 1}/{len(objects)}: 원본 분석")
                direct = line_trace.trace_lines(_png_bytes(crop), fills=fills)
                chosen, used_ai = direct, False
                if use_ai:
                    _update(job, stage=f"칸 {idx + 1}/{len(objects)}: AI가 깨끗한 선화로 다시 그리는 중 (칸당 약 3분)")
                    redrawn, err = _redraw_panel(crop, seed=7 + idx, tag=str(idx))
                    if redrawn is None:
                        warnings.append(f"칸 {idx + 1}: AI 재생성 실패 → 원본에서 직접 추출 ({err})")
                    else:
                        iou = _shape_iou(crop, redrawn)
                        if iou < SHAPE_IOU_MIN:
                            warnings.append(f"칸 {idx + 1}: AI가 형태를 바꿔서(일치도 {iou:.0%}) 원본에서 직접 추출")
                        else:
                            _update(job, stage=f"칸 {idx + 1}/{len(objects)}: 선 추출")
                            traced = line_trace.trace_lines(_png_bytes(redrawn), fills=fills, line_art=True)
                            if traced["stats"]["lines"] >= 4:
                                chosen, used_ai = traced, True
                            else:
                                warnings.append(f"칸 {idx + 1}: 재생성본에서 선이 거의 안 잡혀 원본에서 직접 추출")
                sw, sh = chosen["stats"]["size"]
                sx, sy = cw / float(sw), ch / float(sh)
                inner = _rescale_strokes(_svg_inner(chosen["svg"]), k_final / (chosen["stats"]["k_w"] * sx))
                parts.append('<g transform="translate(%d %d) scale(%.5f %.5f)">%s</g>' % (bx0, by0, sx, sy, inner))
                stats_acc["lines"] += chosen["stats"]["lines"]
                stats_acc["arrows"] += chosen["stats"]["arrows"]
                stats_acc["ai_panels" if used_ai else "fallback_panels"] += 1
                _update(job, done=idx + 1)

            _update(job, stage="글자 옮기는 중")
            text_editable = 0
            for (lx0, ly0, lx1, ly1) in labels:
                match = None
                for t in (ocr_texts or []):
                    tb = t.get("box") or []
                    if len(tb) != 4:
                        continue
                    ix = max(0, min(lx1, tb[2]) - max(lx0, tb[0])); iy = max(0, min(ly1, tb[3]) - max(ly0, tb[1]))
                    if ix * iy > 0.3 * (lx1 - lx0) * (ly1 - ly0) and (match is None or ix * iy > match[0]):
                        match = (ix * iy, t["text"])
                if match and match[1].strip():
                    h = ly1 - ly0
                    esc = match[1].strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    parts.append('<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" font-weight="600" fill="#1d1d1d" textLength="%.1f" lengthAdjust="spacingAndGlyphs">%s</text>' % (
                        lx0, ly1 - h * 0.04, line_trace.FONT, h / 0.72, lx1 - lx0, esc))
                    text_editable += 1
                else:
                    gp = line_trace.glyph_path(img, (lx0, ly0, lx1, ly1))
                    if gp:
                        parts.append(gp)

            svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
                   '<rect width="100%%" height="100%%" fill="#fff"/>%s</svg>') % (W, H, W, H, "\n".join(parts))
            stats = {**stats_acc, "panels": len(objects), "text_lines": len(labels), "text_editable": text_editable, "size": [W, H],
                     "redraw_used": use_ai}
            _update(job, status="done", stage="완료", svg=svg, stats=stats, warnings=warnings, finished=time.time())
        except BaseException as e:
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            _update(job, status="error", stage="실패", error=str(e)[:300], finished=time.time())


def start_job(png_bytes, read_text=False, fills=False, redraw=True, ocr_texts=None, max_panels=None):
    now = time.time()
    with _JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if now - v.get("created", now) > JOB_TTL]:
            JOBS.pop(k, None)
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = {"status": "queued", "stage": "대기 중(앞선 작업이 끝나면 시작)", "done": 0, "total": 0, "created": now}
    threading.Thread(target=_run, args=(job_id, png_bytes, read_text, fills, redraw, ocr_texts, max_panels), daemon=True).start()
    return job_id


def get_job(job_id):
    with _JOBS_LOCK:
        j = JOBS.get(job_id)
        return dict(j) if j else None
