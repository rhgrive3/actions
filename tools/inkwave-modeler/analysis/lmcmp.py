# Compare MediaPipe landmarks of a model render crop vs. the reference crop (same calibrated framing).
import sys, numpy as np
from PIL import Image, ImageDraw
from lm import run
pre, view = sys.argv[1], sys.argv[2]
cfg = {'front': ('ref_front_hi.png', (440,80,700,300)), 'side': ('ref_side_hi.png', (500,70,740,290))}[view]
ref, box = cfg
S = 842.0  # px per metre (ref calibration)
R = run(ref, box, 3)
m = Image.open(f'{pre}_{view}.png').convert('RGB')
# model render is box at 4x; map to ref px
M = run(f'{pre}_{view}.png', None, 1)
if R is None or M is None: print('detect fail', R is None, M is None); sys.exit()
RL = R[0]; ML = M[0].copy(); ML[:, :2] = ML[:, :2] / 4 + np.array(box[:2]); ML[:, 2] /= 4
G = {
 'R eye outer 33': [33], 'R eye inner 133': [133], 'L eye inner 362': [362], 'L eye outer 263': [263],
 'R eye top 159': [159], 'R eye bot 145': [145], 'L eye top 386': [386], 'L eye bot 374': [374],
 'R iris 468': [468], 'L iris 473': [473],
 'R brow 70..105': [70,63,105,66,107], 'L brow': [300,293,334,296,336],
 'nose tip 1': [1], 'nose bottom 2': [2], 'alar R 98': [98], 'alar L 327': [327],
 'mouth L 61': [61], 'mouth R 291': [291], 'upper lip 0': [0], 'lower lip 17': [17], 'lip mid 13': [13],
 'chin 152': [152], 'jaw R 172': [172,136,150], 'jaw L 397': [397,365,379], 'cheek R 234': [234,93], 'cheek L 454': [454,323],
}
print(f'{"feature":20s} {"ref x,y (px)":>16s} {"model x,y":>16s}  d(mm) dx dy')
for k, idx in G.items():
    a = RL[idx, :2].mean(0); b = ML[idx, :2].mean(0); d = (b - a) / S * 1000
    print(f'{k:20s} {a[0]:7.1f},{a[1]:7.1f} {b[0]:7.1f},{b[1]:7.1f}  {np.hypot(*d):5.1f} {d[0]:+5.1f} {d[1]:+5.1f}')
# draw
r = Image.open(ref).convert('RGB').crop(box).resize(((box[2]-box[0])*4, (box[3]-box[1])*4), Image.LANCZOS)
for img in (r, m):
    dr = ImageDraw.Draw(img)
    for L, col in ((RL, (255,40,40)), (ML, (40,120,255))):
        for p in L[:468]:
            x, y = (p[0]-box[0])*4, (p[1]-box[1])*4; dr.ellipse([x-2,y-2,x+2,y+2], fill=col)
W = Image.new('RGB', (r.width*2, r.height)); W.paste(r, (0,0)); W.paste(m, (r.width,0)); W.save(f'{pre}_lm_{view}.png')
np.save(f'{pre}_lm_{view}_ref.npy', RL); np.save(f'{pre}_lm_{view}_model.npy', ML)
