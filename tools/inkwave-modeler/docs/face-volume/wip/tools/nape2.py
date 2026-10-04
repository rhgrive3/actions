# nape2.py OUT DIR [DIR2] : back of the head + neck in the side views, traced automatically on the reference
# (per row, from inside the neck outward to the first grey background pixel; the shaved hair counts as head,
# the light green ribbons as background) vs the model's head+neck+shaved-hair mask (wide_render k=2.2 SCALE=3,
# LOOKS=mask_all ONLY_MASK_ALL=head names).  Prints per-row gaps (+ = model in front of the reference, i.e. its
# back edge is inside the reference's) and draws reference (cyan) / DIR (red) / DIR2 (blue) edges.
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
sheet = np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
VB = {'sideR': (1790, 230), 'sideL': (880, 230)}; k = 2.2; m = 3
CFG = {'sideR': (1985, -1, (1850, 340, 2010, 472)), 'sideL': (1035, 1, (990, 340, 1150, 472))}
HAIR_IN = {'sideR': 1940, 'sideL': 1092}   # start inside the shaved hair for the rows above the neck (the ear and the
                                           # earrings are grey like the background)
HAIR_ROWS = 424
def is_bg(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    grey = (np.max(c, -1) - np.min(c, -1) < 30) & (np.mean(c, -1) > 115)
    ribbon = (g > r + 8) & (np.mean(c, -1) > 120)
    return grey | ribbon
def ref_edge(v, y):
    x_in, sgn, _ = CFG[v]; x = HAIR_IN[v] if y < HAIR_ROWS else x_in
    while 0 < x < sheet.shape[1] - 1 and not is_bg(sheet[y, x]):
        x += sgn
    # sub-pixel: average of the last head pixel and the first background pixel
    return x - 0.5 * sgn
def model_edge(d, v, y):
    mk = np.asarray(Image.open(f'{d}/{v}_mask_all.png').convert('L')) > 127
    x_in, sgn, _ = CFG[v]; X0, Y0 = VB[v][0] - 185 * (k - 1), VB[v][1] - 145 * (k - 1)
    x_in = HAIR_IN[v] if y < HAIR_ROWS else x_in
    row = mk[int(round((y - Y0) * m))]; i = int(round((x_in - X0) * m))
    while 0 < i < len(row) - 1 and row[i]:
        i += sgn
    return (i - 0.5 * sgn) / m + X0
out = sys.argv[1]; dirs = sys.argv[2:]; cols = [(255, 30, 30), (40, 90, 255)]; tiles = []
for v in ('sideR', 'sideL'):
    x_in, sgn, (x0, y0, x1, y1) = CFG[v]; Z = 4
    img = Image.fromarray(sheet[y0:y1, x0:x1].astype(np.uint8)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.BICUBIC); dr = ImageDraw.Draw(img)
    rows = list(range(372, 468, 2)); R = [ref_edge(v, y) for y in rows]
    dr.line([((x - x0) * Z, (y - y0 + 0.5) * Z) for x, y in zip(R, rows)], fill=(0, 230, 255), width=3)
    for j, d in enumerate(dirs):
        M = [model_edge(d, v, y) for y in rows]
        dr.line([((x - x0) * Z, (y - y0 + 0.5) * Z) for x, y in zip(M, rows)], fill=cols[j], width=3)
        g = [round(sgn * (r - mm), 1) for r, mm in zip(R, M)]
        print(v, d.split('/')[-1], 'gap px by row (+ = model in front):', {y: gg for y, gg in zip(rows[::4], g[::4])},
              'mean abs %.1f, max abs %.1f' % (np.mean(np.abs(g)), np.max(np.abs(g))))
    dr.text((6, 6), v + '  cyan = reference, red = ' + dirs[0].split('/')[-1] + ('  blue = ' + dirs[1].split('/')[-1] if len(dirs) > 1 else ''), fill=(255, 255, 0))
    tiles.append(img)
W = sum(t.size[0] for t in tiles) + 10; o = Image.new('RGB', (W, max(t.size[1] for t in tiles)), (255, 255, 255)); x = 0
for t in tiles: o.paste(t, (x, 0)); x += t.size[0] + 10
o.save(out, quality=88)
