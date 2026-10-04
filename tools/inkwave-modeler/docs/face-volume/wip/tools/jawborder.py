# jawborder.py OUT DIR:look .. : sideR crop (reference + models) with the reference jaw border (the mandible's back
# edge under the ear lobe, the angle, the lower edge; traced by the user, sheet px) drawn on every tile in cyan
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
REF = [(1998, 404), (1999, 412), (2000, 419), (2003, 424), (2007, 428), (2013, 433), (2019, 438), (2030, 445), (2040, 450)]
k = 1.6; v = 'sideR'; x0, y0, x1, y1, Z = 1940, 385, 2070, 465, 6
sheet = Image.open(P.SHEET).convert('RGB'); ox, oy = P.VB[v]; X0 = ox - 185 * (k - 1); Y0 = oy - 145 * (k - 1)
tiles = [('reference', sheet.crop((x0, y0, x1, y1)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.BICUBIC))]
for a in sys.argv[2:]:
    d, look = a.split(':'); im = Image.open(f'{d}/{v}_{look}.png').convert('RGB'); s = im.size[0] / round(370 * k)
    tiles.append((d.rstrip('/').split('/')[-1], im.crop((round((x0 - X0) * s), round((y0 - Y0) * s), round((x1 - X0) * s), round((y1 - Y0) * s))).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.BICUBIC)))
W = sum(t.size[0] for _, t in tiles) + 6 * (len(tiles) - 1); out = Image.new('RGB', (W, tiles[0][1].size[1]), (255, 255, 255)); x = 0
for lab, t in tiles:
    dr = ImageDraw.Draw(t)
    dr.line([((a - x0) * Z, (b - y0) * Z) for a, b in REF], fill=(0, 230, 255), width=3)
    dr.text((8, 8), lab, fill=(255, 255, 0)); out.paste(t, (x, 0)); x += t.size[0] + 6
out.save(sys.argv[1], quality=88)
