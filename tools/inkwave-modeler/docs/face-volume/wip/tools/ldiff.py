# ldiff.py OUT DIR [channel 0=L 1=a 2=b] : L* (or a*, b*) (model - reference) map per view over the face box, red = model darker, blue = brighter
# (|d| 10 = full colour), the reference crop drawn faint underneath; non-skin (eyes, hair, background) greyed
import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
src = open('/tmp/jawtools/lipmean.py').read(); exec(src[src.index('def lab'):src.index('k=1.6')])
k = 1.6; sheet = np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
BOX = {'front': (130, 270, 340, 470), 'q34R': (1440, 270, 1650, 470), 'sideR': (1900, 270, 2120, 470)}
out, d = sys.argv[1], sys.argv[2]; CH = int(sys.argv[3]) if len(sys.argv) > 3 else 0; Z = 3; tiles = []
for v, (x0, y0, x1, y1) in BOX.items():
    im = Image.open(f'{d}/{v}_beauty.png').convert('RGB'); s = im.size[0] / round(370 * k); ox, oy = P.VB[v]
    X0, Y0 = ox - 185 * (k - 1), oy - 145 * (k - 1)
    m = np.asarray(im.crop((round((x0 - X0) * s), round((y0 - Y0) * s), round((x1 - X0) * s), round((y1 - Y0) * s))).resize((x1 - x0, y1 - y0), Image.BOX)).astype(float)
    r = sheet[y0:y1, x0:x1]
    skin = lambda a: ((a[..., 0] - a[..., 2]) > 40) & (a[..., 0] > 120) & (a[..., 0] > a[..., 1] + 25)
    ok = skin(r) & skin(m)
    dl = lab(m)[..., CH] - lab(r)[..., CH]
    from scipy.ndimage import gaussian_filter
    dl = gaussian_filter(np.where(ok, dl, 0), 1.5) / np.maximum(gaussian_filter(ok.astype(float), 1.5), 1e-3)
    t = np.clip(dl / 10, -1, 1)
    base = r.mean(-1, keepdims=True) * 0.5 + 64
    col = np.where(t[..., None] < 0, base * (1 + t[..., None]) + np.array([255, 0, 0]) * -t[..., None],
                   base * (1 - t[..., None]) + np.array([0, 80, 255]) * t[..., None])
    col = np.where(ok[..., None], col, base * 0.6)
    tiles.append(Image.fromarray(col.clip(0, 255).astype(np.uint8)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST))
    print('%-6s %-6s ch%d mean d %+5.1f  mean |d| %4.1f  p10 %+5.1f p90 %+5.1f' % (d.split('/')[-1], v, CH, dl[ok].mean(), np.abs(dl[ok]).mean(), *np.percentile(dl[ok], [10, 90])))
W = sum(t.size[0] for t in tiles) + 12; o = Image.new('RGB', (W, tiles[0].size[1]), (255, 255, 255)); x = 0
for t in tiles: o.paste(t, (x, 0)); x += t.size[0] + 6
o.save(out, quality=88)
