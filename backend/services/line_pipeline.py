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
from services import line_augment
from services import diagram_kind

REDRAW_INSTRUCTION = (
    "Redraw this isometric architecture diagram as a clean, crisp, high-resolution black line drawing on a pure white background. "
    "Keep every shape, proportion, edge position and the camera angle exactly the same. Remove all textures, shading, colors and noise. "
    "Use only thin uniform black single lines. Do not add or remove any object. "
    "Draw every arrowhead as a small solid filled black triangle (never hollow), keeping dashed arrow shafts as dashed lines."
)
REDRAW_LONG_EDGE = 1100
SHAPE_IOU_MIN = 0.72     # 이 이상이면 안심하고 쓴다
SHAPE_IOU_FLOOR = 0.62   # 이 미만이면 AI가 형태를 많이 바꾼 것이라 버린다(그 사이는 경고를 붙여 쓴다)
LINE_QUALITY_OK = 0.62   # AI 재생성본의 선이 반듯한 정도(0~1). 이 미만이면 흔들린 결과로 보고 다시 그려 본다
REDRAW_PREP = False      # True 면 AI 에 넣기 전에 입력의 질감·얼룩을 정리한다(_prep_for_redraw). 시험으로 효과를 확인한 뒤 켠다
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


def _line_quality(img):
    """AI 가 다시 그린 선화가 '반듯한 선'인지 0~1로 잰다: 뼈대(골격) 선의 방향이 아이소·세로 3방향에 맞는 비율.
    깨끗한 결과는 0.69~0.82, 손으로 그린 듯 흔들리고 끊긴 결과는 0.54 안팎(실측). 복잡한 장면은 본래 낮다."""
    from scipy import ndimage as ndi
    from skimage import morphology
    g0 = img.convert("L")
    k = 900.0 / max(g0.size)
    g = np.asarray(g0.resize((max(1, int(g0.width * k)), max(1, int(g0.height * k))), Image.LANCZOS)).astype(np.float32)
    ink = morphology.remove_small_objects(g < 140, max_size=30)
    sk = morphology.skeletonize(ink)
    if sk.sum() < 50:
        return 0.0
    sm = ndi.gaussian_filter(g, 1.2)
    gx, gy = ndi.sobel(sm, axis=1), ndi.sobel(sm, axis=0)
    ang = (np.degrees(np.arctan2(gy[sk], gx[sk])) + 90.0) % 180.0
    d = lambda a: np.minimum(np.abs(ang - a), 180 - np.abs(ang - a))
    return float(((d(30) < 8) | (d(90) < 8) | (d(150) < 8)).mean())


def _prep_for_redraw(img):
    """질감·얼룩·잔노이즈를 줄여 AI 가 선을 흔들어 그리지 않게 한다(색과 윤곽은 유지): 중간값 필터 + 색 수 줄이기(디더 없음)."""
    from PIL import ImageFilter
    im = img.convert("RGB").filter(ImageFilter.MedianFilter(5))
    return im.quantize(colors=10, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")


def _redraw_panel(crop, seed, tag, prep=None):
    """칸 하나를 Kontext로 선화로 재생성. 성공하면 PIL 이미지, 아니면 (None, 사유). prep=True 면 입력을 먼저 정리한다(기본은 REDRAW_PREP)."""
    k = REDRAW_LONG_EDGE / float(max(crop.size))
    sized = crop.resize((max(64, int(crop.width * k)), max(64, int(crop.height * k))), Image.LANCZOS)
    if REDRAW_PREP if prep is None else prep:
        sized = _prep_for_redraw(sized)
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
            panel_info = []
            margin = int(0.012 * max(W, H))
            for idx, (x0, y0, x1, y1) in enumerate(objects):
                bx0, by0 = max(0, x0 - margin), max(0, y0 - margin)
                bx1, by1 = min(W, x1 + margin), min(H, y1 + margin)
                crop = img.crop((bx0, by0, bx1, by1))
                cw, ch = crop.size
                _update(job, stage=f"칸 {idx + 1}/{len(objects)}: 원본 분석")
                direct = line_trace.trace_lines(_png_bytes(crop), fills=fills)
                chosen, used_ai = direct, False
                if use_ai and direct["stats"].get("clean"):
                    pass  # 이미 깨끗한 도식이면 AI 재생성이 모양을 바꿀 위험만 있어서 건너뛰고 원본에서 바로 추출한다(수 초)
                elif use_ai:
                    _update(job, stage=f"칸 {idx + 1}/{len(objects)}: AI가 깨끗한 선화로 다시 그리는 중 (칸당 약 3분)")
                    redrawn, err = _redraw_panel(crop, seed=7 + idx, tag=str(idx))
                    if redrawn is None:  # 일시적인 지연·멈춤으로 실패했을 수 있어서 한 번 더(다른 시드로) 시도한다
                        _update(job, stage=f"칸 {idx + 1}/{len(objects)}: AI 재생성 재시도 중")
                        redrawn, err = _redraw_panel(crop, seed=107 + idx, tag=str(idx))
                    if redrawn is None:
                        warnings.append(f"칸 {idx + 1}: AI 재생성 실패 → 원본에서 직접 추출 ({err})")
                    else:
                        iou, qual = _shape_iou(crop, redrawn), _line_quality(redrawn)
                        # 형태 일치도와 선이 반듯한 정도가 둘 다 합격이면 바로 쓰고, 아니면 다른 시드로 최대 2번 더 그려서 가장 나은 것을 쓴다
                        # (AI 가 선을 흔들어 그리거나 형태를 조금 바꾸는 일이 시드마다 달라서, 질감 있는 이미지는 직접 추출보다 훨씬 낫다)
                        best = (iou + 0.5 * qual, iou, qual, redrawn)
                        for extra_seed in (207 + idx, 307 + idx):
                            if best[1] >= SHAPE_IOU_MIN and best[2] >= LINE_QUALITY_OK:
                                break
                            _update(job, stage=f"칸 {idx + 1}/{len(objects)}: 더 깨끗한 결과를 위해 다시 그리는 중")
                            again, _err2 = _redraw_panel(crop, seed=extra_seed, tag=str(idx))
                            if again is None:
                                continue
                            i2, q2 = _shape_iou(crop, again), _line_quality(again)
                            if i2 + 0.5 * q2 > best[0] + 0.03:   # 차이가 작으면 먼저 그린 것을 유지한다
                                best = (i2 + 0.5 * q2, i2, q2, again)
                        _, iou, qual, redrawn = best
                        if iou < SHAPE_IOU_FLOOR:
                            warnings.append(f"칸 {idx + 1}: AI가 형태를 바꿔서(일치도 {iou:.0%}) 원본에서 직접 추출")
                        else:
                            if iou < SHAPE_IOU_MIN:
                                warnings.append(f"칸 {idx + 1}: AI 재생성본의 형태 일치도가 {iou:.0%}로 다소 낮습니다. 결과를 원본과 비교해 확인하세요")
                            _update(job, stage=f"칸 {idx + 1}/{len(objects)}: 선 추출")
                            traced = line_trace.trace_lines(_png_bytes(redrawn), fills=fills, line_art=True, role_by="geometry")
                            if traced["stats"]["lines"] >= 4:
                                try:   # AI 가 빼먹은 화살표·바닥판을 원본에서 읽어 보충(이미 있는 것은 건드리지 않는다)
                                    traced, aug = line_augment.augment(traced, crop)
                                    if aug["arrows"] or aug["plate"]:
                                        what = ([f"화살표 {aug['arrows']}개"] if aug["arrows"] else []) + (["바닥판"] if aug["plate"] else [])
                                        warnings.append(f"칸 {idx + 1}: AI가 빼먹은 요소를 원본에서 보충했습니다 ({', '.join(what)})")
                                except Exception:
                                    pass
                                chosen, used_ai = traced, True
                            else:
                                warnings.append(f"칸 {idx + 1}: 재생성본에서 선이 거의 안 잡혀 원본에서 직접 추출")
                sw, sh = chosen["stats"]["size"]
                sx, sy = cw / float(sw), ch / float(sh)
                inner = _rescale_strokes(_svg_inner(chosen["svg"]), k_final / (chosen["stats"]["k_w"] * sx))
                parts.append('<g data-panel="%d" transform="translate(%d %d) scale(%.5f %.5f)">%s</g>' % (idx, bx0, by0, sx, sy, inner))
                panel_info.append({"i": idx, "bbox": [bx0, by0, bx1, by1], "complex": bool(chosen["stats"].get("complex")), "ai": used_ai})
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
                     "redraw_used": use_ai, "panel_info": panel_info}
            _update(job, status="done", stage="완료", svg=svg, stats=stats, warnings=warnings, finished=time.time())
        except BaseException as e:
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            _update(job, status="error", stage="실패", error=str(e)[:300], finished=time.time())


def _run_color(job_id, png_bytes, kind_info):
    """색 면(블록) 도식: 선 추출 대신 색 영역 그대로 벡터화한다(AI 재생성 없음, 수 초)."""
    job = JOBS[job_id]
    _update(job, status="running", stage="색 면 도식으로 판단 — 색 영역 그대로 벡터 변환 중")
    try:
        svg, (W, H) = diagram_kind.vectorize_color(png_bytes)
        stats = {"method": "color", "kind": kind_info, "panels": 1, "lines": 0, "arrows": 0, "text_lines": 0, "text_editable": 0,
                 "size": [W, H], "redraw_used": False, "ai_panels": 0, "fallback_panels": 0, "panel_info": []}
        _update(job, status="done", stage="완료", svg=svg, stats=stats, warnings=[], finished=time.time(), done=1, total=1)
    except BaseException as e:
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        _update(job, status="error", stage="실패", error=str(e)[:300], finished=time.time())


def start_job(png_bytes, read_text=False, fills=False, redraw=True, ocr_texts=None, max_panels=None, method="auto"):
    now = time.time()
    with _JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if now - v.get("created", now) > JOB_TTL]:
            JOBS.pop(k, None)
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = {"status": "queued", "stage": "대기 중(앞선 작업이 끝나면 시작)", "done": 0, "total": 0, "created": now}
    kind_info = None
    use_color = method == "color"
    if method == "auto":
        try:
            kind_info = diagram_kind.classify_diagram(png_bytes)
            use_color = kind_info["kind"] == "color"
        except Exception:
            use_color = False
    if use_color:
        JOBS[job_id]["stage"] = "색 면 도식으로 판단"
        threading.Thread(target=_run_color, args=(job_id, png_bytes, kind_info), daemon=True).start()
        return job_id
    threading.Thread(target=_run, args=(job_id, png_bytes, read_text, fills, redraw, ocr_texts, max_panels), daemon=True).start()
    return job_id


def get_job(job_id):
    with _JOBS_LOCK:
        j = JOBS.get(job_id)
        return dict(j) if j else None
