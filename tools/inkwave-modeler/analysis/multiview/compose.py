"""Comparison sheet: per view  reference | before | after | clay before | clay after | outline overlay.
python3 compose.py <render_dir> <field.json> <out.jpg> [scale]"""
import json, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
import mvcore as M, fit, contours as C, camfit

rd, fj, out = sys.argv[1], sys.argv[2], sys.argv[3]
k = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
BOX = {'front': (60, 230, 430, 520), 'q34L': (470, 230, 840, 520), 'sideL': (880, 230, 1250, 520),
       'q34R': (1370, 230, 1740, 520), 'sideR': (1790, 230, 2160, 520)}
g0 = M.load('geom_before.npz'); F = json.load(open(fj))
field = fit.Field(g0, F['params']); field.c = np.array(F['centres_head_m']); field.mirror = field.c[:, 0] > 1e-6
g1 = fit.apply(g0, field, np.array(F['D_head_m']))
sheet = np.asarray(Image.open(C.SHEET).convert('RGB')); rc = C.ref_contours()
font = ImageFont.load_default()


def outline(g, cam, x0, y0):
    uv, dep = M.project(cam, M.to_local(g['HEAD_face']['v']), F['dist'])
    _, (mask, lo, ss) = C.model_silhouette(uv, dep, g['HEAD_face']['f'])
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return [((c[:, 0, :] / ss + lo - [x0, y0]) * k).astype(np.int32) for c in cnts]


rows = []
for v, (x0, y0, x1, y1) in BOX.items():
    W, H = int((x1 - x0) * k), int((y1 - y0) * k)
    ref = cv2.resize(sheet[y0:y1, x0:x1], (W, H), interpolation=cv2.INTER_CUBIC)
    tiles = [ref]
    for name in ('before_beauty', 'after_beauty', 'before_clay', 'after_clay'):
        tiles.append(np.asarray(Image.open(f'{rd}/{v}_{name}.png').convert('RGB').resize((W, H))))
    cam = F['cams'][v]
    ov = (ref * 0.55).astype(np.uint8).copy()
    for pts in outline(g0, cam, x0, y0):
        cv2.polylines(ov, [pts], True, (255, 150, 0), 2, cv2.LINE_AA)
    for pts in outline(g1, cam, x0, y0):
        cv2.polylines(ov, [pts], True, (255, 40, 40), 2, cv2.LINE_AA)
    for u, vv, _, _ in rc[v]:
        cv2.circle(ov, (int((u - x0) * k), int((vv - y0) * k)), 2, (60, 255, 60), -1)
    # alignment check: the after outline drawn on the Blender after-clay render too (thin)
    chk = tiles[4].copy()
    for pts in outline(g1, cam, x0, y0):
        cv2.polylines(chk, [pts], True, (255, 40, 40), 1, cv2.LINE_AA)
    tiles[4] = chk
    tiles.append(ov)
    rows.append(np.concatenate([np.pad(t, ((2, 2), (2, 2), (0, 0)), constant_values=255) for t in tiles], 1))
img = Image.fromarray(np.concatenate(rows, 0))
hdr = Image.new('RGB', (img.width, 30), 'white'); d = ImageDraw.Draw(hdr)
labels = ['reference', 'before', 'after', 'clay before', 'clay after (+after outline)', 'outline: orange before / red after / green ref']
for i, t in enumerate(labels):
    d.text((i * (img.width // 6) + 8, 8), t, fill=(0, 0, 0), font=font)
full = Image.new('RGB', (img.width, img.height + 30), 'white'); full.paste(hdr, (0, 0)); full.paste(img, (0, 30))
full.save(out, quality=90)
print(full.size)
