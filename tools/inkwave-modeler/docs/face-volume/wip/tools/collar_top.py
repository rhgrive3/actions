# collar_top.py NAME.. : collar top edge vs the reference per view (idmap of NAME.blend: first clothes row under the
# skin per column; reference: first non-skin row under the neck).  Needs id maps idc_<NAME>_<view>.png from idmap.py
import numpy as np, json, sys
from PIL import Image
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
sheet = np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
skin = lambda c: (c[0] - c[2] > 35) and c[0] > 110 and c[0] > c[1] + 20
B = {'front': (130, 205, 100), 'q34R': (150, 205, 60), 'sideR': (190, 205, 60), 'sideL': (150, 205, 60)}
COLS = {'front': range(197, 284, 8), 'q34R': range(1525, 1552, 8), 'sideR': range(1985, 2012, 8), 'sideL': range(1035, 1080, 8)}
for name in sys.argv[1:]:
    line = name + ':'
    for v, (x0, y0, w) in B.items():
        ids = np.load(f'/tmp/inkjaw-work/idc_{name}_{v}.png.npy'); nm = json.load(open(f'/tmp/inkjaw-work/idc_{name}_{v}.png.json')); inv = {i: n for n, i in nm.items()}
        sc = ids.shape[1] / w; ox, oy = P.VB[v]; d = []
        for sx in COLS[v]:
            col = ids[:, int((sx - ox - x0) * sc)]; seen = False; my = None
            for r, i in enumerate(col):
                n = inv.get(int(i), '-')
                if n in ('HEAD_face', 'BODY_torso'): seen = True
                elif seen and n.startswith('CLOTHES'): my = oy + y0 + r / sc; break
            ry = None; s = False
            for y in range(oy + y0, oy + y0 + 40):
                if skin(sheet[y, sx]): s = True
                elif s: ry = y; break
            if ry is not None and my is not None: d.append(ry - my)
        line += '  %s %s' % (v, ' '.join('%+.1f' % x for x in d))
    print(line + '   (+ = model collar higher, px)')
