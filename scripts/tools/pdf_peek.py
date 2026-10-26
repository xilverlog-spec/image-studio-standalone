"""큰 PDF 를 토큰을 아끼며 훑어 보는 도구(로컬 전용 — 문서를 어디로도 보내지 않는다).

원리: 쪽마다 이미지로 다 읽으면 비싸다. 그래서 ① 글자부터 뽑아 쪽을 찾고(거의 공짜) ② 여러 쪽을 한 장에 모은 '접촉 시트'로 훑고
③ 필요한 쪽만 낮은 해상도(또는 일부만 잘라서)로 본다.

설치(한 번): python -m pip install pymupdf pillow   (또는 PEEK_LIB 환경변수에 라이브러리 폴더를 지정)
사용:
  python pdf_peek.py find  <PDF또는폴더> 키워드 [키워드...]     글자에서 키워드가 있는 쪽 찾기(글자가 없는 쪽은 '이미지 쪽'으로 따로 센다)
  python pdf_peek.py sheet <PDF> [쪽범위 예: 1-12] [--cols 4] [--width 1800] [--out 파일.png]   쪽 번호가 붙은 접촉 시트 한 장
  python pdf_peek.py page  <PDF> <쪽> [--dpi 70] [--crop x0,y0,x1,y1(0~1 비율)] [--out 파일.png]  한 쪽(또는 그 일부)
"""
import argparse
import os
import re
import sys

lib = os.environ.get('PEEK_LIB')
if lib:
    sys.path.insert(0, lib)
import fitz  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402


def pages_of(spec, n):
    if not spec:
        return list(range(1, n + 1))
    out = []
    for part in spec.split(','):
        if '-' in part:
            a, b = part.split('-')
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return [p for p in out if 1 <= p <= n]


def cmd_find(a):
    paths = [a.pdf] if a.pdf.lower().endswith('.pdf') else [os.path.join(a.pdf, f) for f in sorted(os.listdir(a.pdf)) if f.lower().endswith('.pdf')]
    for p in paths:
        d = fitz.open(p)
        print('==', os.path.basename(p), d.page_count, '쪽')
        noText = []
        for i in range(d.page_count):
            t = d[i].get_text('text') or ''
            if len(t.strip()) < 20:
                noText.append(i + 1)
                continue
            hits = [k for k in a.keys if k.lower() in t.lower()]
            if hits:
                print(f'  p{i + 1:>3} [{",".join(hits)}] {re.sub(chr(92) + "s+", " ", t).strip()[:70]}')
        if noText:
            print(f'  (글자가 거의 없는 이미지 쪽 {len(noText)}개: {",".join(map(str, noText[:40]))}{"…" if len(noText) > 40 else ""} → sheet 로 훑어 보세요)')


def cmd_sheet(a):
    d = fitz.open(a.pdf)
    ps = pages_of(a.pages, d.page_count)
    cols = a.cols
    cell_w = a.width // cols
    thumbs = []
    for p in ps:
        page = d[p - 1]
        k = cell_w / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(k, k))
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        thumbs.append((p, im))
    cell_h = max(im.height for _, im in thumbs) + 18
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new('RGB', (cell_w * cols, cell_h * rows), 'white')
    dr = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('malgun.ttf', 14)
    except Exception:  # noqa: BLE001
        font = ImageFont.load_default()
    for i, (p, im) in enumerate(thumbs):
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        sheet.paste(im, (x, y + 18))
        dr.rectangle([x, y, x + 46, y + 17], fill=(30, 30, 30))
        dr.text((x + 4, y + 1), f'p{p}', fill='white', font=font)
        dr.rectangle([x, y + 18, x + cell_w - 1, y + 18 + im.height - 1], outline=(200, 200, 200))
    out = a.out or f'{os.path.splitext(os.path.basename(a.pdf))[0]}_sheet.png'
    sheet.save(out)
    print('saved', out, sheet.size, f'{len(thumbs)}쪽')


def cmd_page(a):
    d = fitz.open(a.pdf)
    page = d[a.page - 1]
    clip = None
    if a.crop:
        x0, y0, x1, y1 = [float(v) for v in a.crop.split(',')]
        r = page.rect
        clip = fitz.Rect(r.x0 + r.width * x0, r.y0 + r.height * y0, r.x0 + r.width * x1, r.y0 + r.height * y1)
    pix = page.get_pixmap(dpi=a.dpi, clip=clip)
    out = a.out or f'{os.path.splitext(os.path.basename(a.pdf))[0]}_p{a.page}.png'
    pix.save(out)
    print('saved', out, pix.width, pix.height)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    f = sp.add_parser('find'); f.add_argument('pdf'); f.add_argument('keys', nargs='+'); f.set_defaults(fn=cmd_find)
    s = sp.add_parser('sheet'); s.add_argument('pdf'); s.add_argument('pages', nargs='?', default=''); s.add_argument('--cols', type=int, default=4); s.add_argument('--width', type=int, default=1800); s.add_argument('--out'); s.set_defaults(fn=cmd_sheet)
    g = sp.add_parser('page'); g.add_argument('pdf'); g.add_argument('page', type=int); g.add_argument('--dpi', type=int, default=70); g.add_argument('--crop'); g.add_argument('--out'); g.set_defaults(fn=cmd_page)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
