"""参照の髪マスクと新しい髪マスクを重ねる。赤 = 参照だけ、青 = 新しい髪だけ、白 = 両方。IoU を出す。"""
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tailfit import clean
from PIL import Image
D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')
rd = sys.argv[1]
tiles = []
for view in ('front', 'back', 'left', 'persp'):
    ref = clean(np.load(f'{D}/hair_{view}.npy'))
    new = np.asarray(Image.open(f'{rd}/hair_{view}.png'))[..., 3] > 127
    new[300:] = False
    body = np.asarray(Image.open(f'{D}/bodymask/body_all_{view}.png'))[..., 3] > 127
    head = np.asarray(Image.open(f'{D}/bodymask/body_head_{view}.png'))[..., 3] > 127
    r2, n2 = ref & ~head & ~body, new & ~head & ~body
    iou = (r2 & n2).sum() / max((r2 | n2).sum(), 1)
    print(f'{view}: IoU {iou:.2f}  ref {ref.sum()}  new {new.sum()}')
    vis = np.zeros(ref.shape + (3,), np.uint8)
    vis[body] = (45, 45, 60)
    vis[ref & ~new] = (230, 60, 50)
    vis[new & ~ref] = (60, 140, 255)
    vis[ref & new] = (235, 235, 235)
    tiles.append(vis[:300])
Image.fromarray(np.concatenate(tiles, axis=1)).save(f'{rd}/compare.png')
