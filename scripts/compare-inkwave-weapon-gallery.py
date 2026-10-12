#!/usr/bin/env python3
"""Compare INKWAVE weapon gallery renders with official side renders.

usage: compare-inkwave-weapon-gallery.py <gallery dir> <reference dir> [ids...]

Reference images are the Inkipedia copies of Nintendo's per-weapon 3D renders
(`<id>.3d.png`, transparent background, muzzle to the right). They are not
committed. For each weapon this writes `<id>.compare.jpg` (reference | INKWAVE
side | 3/4 | held) and `silhouette.json` with the alpha-silhouette IoU after
normalising both masks to the same bounding box. The render angle of the
reference is not exactly orthographic, so IoU is a regression indicator,
not a parity score.
"""
import json, os, sys
from PIL import Image, ImageDraw

gal, refs = sys.argv[1], sys.argv[2]
ids = sys.argv[3:] or [r['id'] for r in json.load(open(os.path.join(gal, 'gallery.json')))['rows']]
N = 256


def mask(path, thr=24):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > thr else 0)
    box = a.getbbox()
    if not box:
        return None, 0
    a = a.crop(box)
    w, h = a.size
    s = N / max(w, h)
    a = a.resize((max(1, round(w * s)), max(1, round(h * s))), Image.NEAREST)
    c = Image.new('L', (N, N), 0)
    c.paste(a, ((N - a.size[0]) // 2, (N - a.size[1]) // 2))
    return c, w / h


def iou(a, b):
    pa, pb = a.load(), b.load()
    inter = union = 0
    for y in range(N):
        for x in range(N):
            u, v = pa[x, y] > 0, pb[x, y] > 0
            inter += u and v
            union += u or v
    return inter / union if union else 0


def tile(path, w):
    if not os.path.exists(path):
        return Image.new('RGB', (w, w), (240, 240, 240))
    im = Image.open(path).convert('RGBA').resize((w, w))
    bg = Image.new('RGBA', (w, w), (255, 255, 255, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')


result = {}
for wid in ids:
    ref = os.path.join(refs, f'{wid}.3d.png')
    side = os.path.join(gal, f'{wid}.side.png')
    if not (os.path.exists(ref) and os.path.exists(side)):
        continue
    ra, rasp = mask(ref)
    sa, sasp = mask(side)
    score = iou(ra, sa) if ra and sa else 0
    result[wid] = {'iou': round(score, 4), 'refAspect': round(rasp, 3), 'oursAspect': round(sasp, 3)}
    W = 300
    keys = ['side', 'persp', 'above', 'front', 'idle', 'fire', 'fireSide', 'fireLeft']
    sheet = Image.new('RGB', (W * 5, W * 2 + 24), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    sheet.paste(tile(ref, W), (0, 24))
    for i, k in enumerate(keys):
        x, y = (i + 1) % 5, (i + 1) // 5
        sheet.paste(tile(os.path.join(gal, f'{wid}.{k}.png'), W), (x * W, 24 + y * W))
    d.text((4, 4), f'{wid}  ref | ' + ' | '.join(keys) + f'   silhouette IoU {score:.3f}  aspect ref {rasp:.2f} ours {sasp:.2f}', fill=(0, 0, 0))
    sheet.save(os.path.join(gal, f'{wid}.compare.jpg'), quality=86)
    print(wid, result[wid])
prev = {}
p = os.path.join(gal, 'silhouette.json')
if os.path.exists(p):
    prev = json.load(open(p))
prev.update(result)
json.dump(prev, open(p, 'w'), indent=1, sort_keys=True)
