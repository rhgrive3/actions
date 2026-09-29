"""尻尾の visual hull（シルエットからの形状復元、space carving）。
各ボクセル中心を front/back/left の検証済み正射影カメラへ投影する。
- どれかのビューで「背景（髪でも体でもない）」に落ちたら削る。
- 体・頭の画素では、ボクセルが体の表面より手前（カメラ側）なら見えるはずなので削る。
  体より奥なら「不明」（削らない、髪の証拠にもしない）。体の奥行きは render_body_depth.py。
- 残すには、少なくとも 2 ビューで髪の画素に落ちること（頭の中身だけが残るのを防ぐ）。
left.jpg はキャラの右側（-X）だけ見えるので、+X 側のボクセルは X を反転して left に投影する（左右対称）。
対象は尻尾の範囲（頭の上半分より上の前髪は曲線で作るので、顔の前の範囲は除く）。"""
import os
import sys
import numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts'))
from inkwave_ref_calibration import world_to_px
D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')
sys.path.insert(0, D)
from tailfit import clean

V = 0.006
xs = np.arange(-0.70, 0.70, V); ys = np.arange(-0.30, 0.60, V); zs = np.arange(0.86, 1.64, V)
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
X, Y, Z = X.ravel(), Y.ravel(), Z.ravel()
keep = np.ones(X.shape, bool)
evidence = np.zeros(X.shape, np.int8)

for view in ('front', 'back', 'left'):
    hair = clean(np.load(f'{D}/hair_{view}.npy'))
    body = cv2.imread(f'{D}/bodymask/body_all_{view}.png', cv2.IMREAD_UNCHANGED)[..., 3] > 127
    body = cv2.dilate(body.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    xv = -np.abs(X) if view == 'left' else X
    px, py = world_to_px(view, xv, Y, Z)
    px = np.round(px).astype(int); py = np.round(py).astype(int)
    inside = (px >= 0) & (px < 448) & (py >= 0) & (py < 300)
    h = np.zeros(X.shape, bool); b = np.zeros(X.shape, bool)
    h[inside] = hair[py[inside], px[inside]]
    b[inside] = body[py[inside], px[inside]]
    dep = np.load(f'{D}/bodydepth/depth_{view}.npy')
    bd = np.full(X.shape, np.inf, np.float32); bd[inside] = dep[py[inside], px[inside]]
    vd = {'front': Y + 10, 'back': 10 - Y, 'left': xv + 10}[view]
    in_front_of_body = b & (vd < bd - 0.012)
    background = (~h & ~b) | (~h & in_front_of_body)   # 画像の外（py>=300 の脚など）も背景扱い
    keep &= ~background
    evidence += h.astype(np.int8)
    print(view, 'kept', int(keep.sum()))

keep &= evidence >= 2

# 角を丸める: 3 方向の正射影だけで削ると断面が四角になる。各ビューで、髪の帯の中心からの
# 正規化距離 e = 1 - DT/W（DT: 境界までの距離、W: 近くの DT の最大 = 帯の半幅）を出し、
# 髪が見えている 2 ビューで e1^2 + e2^2 <= 1（断面が楕円）の所だけ残す。
from scipy.ndimage import maximum_filter
E = []
for view in ('front', 'left'):
    hair = clean(np.load(f'{D}/hair_{view}.npy')).astype(np.uint8)
    dt = cv2.distanceTransform(hair, cv2.DIST_L2, 5)
    W = maximum_filter(dt, size=41)
    e_img = np.where(hair > 0, 1 - dt / np.maximum(W, 1), 2.0)
    xv = -np.abs(X) if view == 'left' else X
    px, py = world_to_px(view, xv, Y, Z)
    px = np.clip(np.round(px).astype(int), 0, 447); py = np.clip(np.round(py).astype(int), 0, 299)
    e = e_img[py, px]
    E.append(np.where(e > 1.5, 0.0, e))      # そのビューで隠れている（髪でない）所は制約しない
round_ok = E[0] ** 2 + E[1] ** 2 <= 1.0
print('rounding removes', int((keep & ~round_ok).sum()), 'of', int(keep.sum()))
keep &= round_ok
# 顔の前（前髪の範囲）は曲線の前髪で作るので除く: 頭の幅の中で、額より前
face_zone = (np.abs(X) < 0.07) & (Y < -0.02) & (Z > 1.30)
keep &= ~face_zone
pts = np.c_[X[keep], Y[keep], Z[keep]].astype(np.float32)
print('voxels', len(pts))
np.save(f'{D}/hull_points.npy', pts)
