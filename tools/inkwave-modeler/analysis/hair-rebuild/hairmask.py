"""参照画像の髪マスク = (人物の前景 − 同じカメラで描いた体・服のマスク) + (顔の上の髪色)。"""
import os
import numpy as np, cv2
from PIL import Image
import matplotlib.colors as mc

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../blender/references')
D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')


def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(float) / 255


def hair_mask(view, ref):
    im = np.asarray(Image.open(f'{REF}/{ref}.jpg').convert('RGB')).astype(float) / 255
    bg = np.median(np.concatenate([im[:, :12], im[:, -12:]], axis=1), axis=1, keepdims=True)
    fg = np.abs(im - bg).max(axis=2) > 0.10
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    body = load(f'{D}/bodymask/body_all_{view}.png')[..., 3] > 0.5
    head = load(f'{D}/bodymask/body_head_{view}.png')[..., 3] > 0.5
    body_d = cv2.dilate(body.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    hsv = mc.rgb_to_hsv(im); h, s, v = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    haircol = (((h > 160) & (h < 205)) | ((h > 50) & (h < 110))) & (s > 0.3) & (v > 0.3)
    m = (fg & ~body_d) | (haircol & head)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m[300:] = 0  # 髪は上半分だけ（脚・靴の誤検出を除く）
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 150:
            keep[lab == i] = 1
    return keep.astype(bool), im, body


if __name__ == '__main__':
    tiles = []
    for view, ref in [('front', 'front'), ('back', 'back'), ('left', 'left'), ('persp', 'persp')]:
        m, im, body = hair_mask(view, ref)
        np.save(f'{D}/hair_{view}.npy', m)
        vis = im * 0.45
        vis[body] = vis[body] * 0.5 + np.array([0.2, 0.2, 0.5]) * 0.5
        vis[m] = np.array([1.0, 0.3, 0.1])
        tiles.append((vis[:300] * 255).astype(np.uint8))
        print(view, int(m.sum()))
    Image.fromarray(np.concatenate(tiles, axis=1)).save(f'{D}/hairmask_check.png')
