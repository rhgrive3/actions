"""Upscaled crop of an image with a labelled pixel grid (sheet coordinates) for manual landmark reading.
python3 gridcrop.py <image> x0 y0 x1 y1 <out.png> [scale] [step] [points.json view]"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
k = int(sys.argv[7]) if len(sys.argv) > 7 else 3
step = int(sys.argv[8]) if len(sys.argv) > 8 else 10
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1)).resize(((x1 - x0) * k, (y1 - y0) * k), Image.LANCZOS)
d = ImageDraw.Draw(im)
font = ImageFont.load_default()
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * k
    major = x % (step * 5) == 0
    d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if major else (255, 255, 255), width=1)
    if major:
        d.text((X + 2, 2), str(x), fill=(255, 0, 0), font=font)
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * k
    major = y % (step * 5) == 0
    d.line([(0, Y), (im.width, Y)], fill=(255, 0, 0) if major else (255, 255, 255), width=1)
    if major:
        d.text((2, Y + 2), str(y), fill=(255, 0, 0), font=font)
if len(sys.argv) > 10:
    pts = json.load(open(sys.argv[9]))[sys.argv[10]]
    for name, (px, py) in pts.items():
        X, Y = (px - x0) * k, (py - y0) * k
        d.ellipse([X - 4, Y - 4, X + 4, Y + 4], outline=(255, 255, 0), width=2)
        d.text((X + 6, Y - 6), name, fill=(255, 255, 0), font=font)
im.save(out)
