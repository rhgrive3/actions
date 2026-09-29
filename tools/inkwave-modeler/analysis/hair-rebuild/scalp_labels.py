"""頭の表面（HEAD_face の頂点）を、5 方向の参照シートの色で分類する。
各頂点を顔合わせのカメラ（analysis/multiview/field.json）でシートに写し、その方向から見えている頂点
（カメラの方を向き、手前の面に隠れていない）だけが、その画素の色で投票する。
分類: 0 不明 / 1 肌 / 2 刈り上げ（彩度の低い灰〜灰青）/ 3 長い髪（青緑かライム、彩度が高い）/ 4 バンド（暗い）
python3 scalp_labels.py <geom.npz> <out_dir>"""
import os, sys, json
import numpy as np, cv2
from PIL import Image
import matplotlib.colors as mc
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../multiview'))
import mvcore as M  # noqa: E402

geom, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
SHEET = os.path.join(HERE, '../../docs/face-multiview-fit/refs/sheet_5view.png')
spec = json.load(open(os.path.join(HERE, '../multiview/field.json')))
dist = spec['dist']
g = np.load(geom)
V = g['HEAD_face|v'].astype(float); N = g['HEAD_face|n'].astype(float); F = g['HEAD_face|f']
Vl = M.to_local(V); Nl = M.to_local(V + N * 0.01) - Vl; Nl /= np.linalg.norm(Nl, axis=1, keepdims=True)
sheet = np.asarray(Image.open(SHEET).convert('RGB')).astype(float) / 255
sheet = cv2.medianBlur((sheet * 255).astype(np.uint8), 3).astype(float) / 255
hsv = mc.rgb_to_hsv(sheet); H, S, Vv = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
cls = np.zeros(H.shape, np.int8)
cls[(Vv < 0.28)] = 4
cls[(cls == 0) & (((H > 160) & (H < 205)) | ((H > 50) & (H < 110))) & (S > 0.33) & (Vv > 0.3)] = 3
cls[(cls == 0) & (H > 5) & (H < 40) & (S > 0.28) & (Vv > 0.35)] = 1
cls[(cls == 0) & (S < 0.28) & (Vv > 0.3)] = 2
votes = np.zeros((len(V), 5), float)
for view, cam in spec['cams'].items():
    uv, depth = M.project(cam, Vl, dist)
    B = M.cam_basis(cam['az'], cam['el'], cam['roll'])
    facing = Nl @ B[2]                     # >0: the normal points toward the camera
    # z-buffer on a coarse pixel grid: a vertex is visible if it is within 4 mm of the front-most one
    px = np.round(uv).astype(int)
    ok = (px[:, 0] >= 0) & (px[:, 0] < sheet.shape[1]) & (px[:, 1] >= 0) & (px[:, 1] < sheet.shape[0])
    zb = np.full(sheet.shape[:2], -np.inf)
    np.maximum.at(zb, (px[ok, 1], px[ok, 0]), depth[ok])
    zb = cv2.dilate(zb.astype(np.float32), np.ones((3, 3), np.uint8))
    vis = ok & (facing > 0.25)
    vis[ok] &= depth[ok] >= zb[px[ok, 1], px[ok, 0]] - 0.004
    c = cls[px[vis, 1], px[vis, 0]]
    w = facing[vis]                        # a face seen head-on counts more than one seen at a grazing angle
    np.add.at(votes, (np.nonzero(vis)[0], c), w)
    print(view, 'visible', int(vis.sum()))
votes[:, 0] = 0
label = np.where(votes.sum(1) > 0, votes.argmax(1), 0)
np.save(os.path.join(out, 'scalp_label.npy'), label)
for k, name in enumerate(['unknown', 'skin', 'shaved', 'hair', 'band']):
    print(name, int((label == k).sum()))
# check image: labelled vertices drawn over each view
col = np.array([[128, 128, 128], [255, 170, 120], [180, 180, 255], [0, 220, 200], [30, 30, 30]], np.uint8)
tiles = []
BOX = {'front': (48, 100, 428, 470), 'q34L': (400, 100, 780, 470), 'sideL': (850, 100, 1230, 470),
       'q34R': (1350, 100, 1730, 470), 'sideR': (1790, 100, 2170, 470)}
for view, cam in spec['cams'].items():
    x0, y0, x1, y1 = BOX[view]
    img = (sheet[y0:y1, x0:x1] * 255 * 0.35).astype(np.uint8).copy()
    uv, depth = M.project(cam, Vl, dist)
    B = M.cam_basis(cam['az'], cam['el'], cam['roll'])
    sel = (Nl @ B[2]) > 0.1
    order = np.argsort(depth[sel])
    for (u, v), l in zip(uv[sel][order], label[sel][order]):
        if x0 <= u < x1 and y0 <= v < y1:
            img[int(v - y0), int(u - x0)] = col[l]
    tiles.append(np.concatenate([(sheet[y0:y1, x0:x1] * 255).astype(np.uint8), img], axis=0))
Image.fromarray(np.concatenate(tiles, axis=1)).save(os.path.join(out, 'scalp_label_check.png'))
