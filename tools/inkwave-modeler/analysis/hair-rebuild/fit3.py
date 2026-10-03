"""尻尾の測定 第3版: 横 (left) と後ろ (back) の2面から、高さ Z で対応させて 3D にする。
left : 行ごとの髪の帯 -> 奥行き Y と太さ。y<=SPLIT は1本の束、それより下は後ろ側/前側の2本の触手。
back : 同じ高さ Z の行で、体の外にある尻尾の帯 -> 左右位置 X と幅（前と同じポーズ、左右2本とも取れる）。
"""
import os
import json, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts'))
from inkwave_ref_calibration import px_to_world_partial, world_to_px, ortho_params, ASPECT, RES_W
D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')
sys.path.insert(0, D)
from tailfit import clean

SPLIT = 125


def runs(row, lo, hi):
    out, x = [], lo
    while x < hi:
        if row[x]:
            s = x
            while x < hi and row[x]:
                x += 1
            if x - s >= 3:
                out.append((s, x - 1))
        x += 1
    return out


def mpp(view):
    return ortho_params(view)[2] * ASPECT / RES_W


left = clean(np.load(f'{D}/hair_left.npy'))
back = clean(np.load(f'{D}/hair_back.npy'))
import cv2
bodyb = cv2.imread(f'{D}/bodymask/body_all_back.png', cv2.IMREAD_UNCHANGED)[..., 3] > 127

# 横: 行ごとの帯
shared, lobe_back, lobe_front = [], [], []
for y in range(8, 215, 3):
    r = runs(left[y], 0, 222)
    if not r:
        continue
    if y <= SPLIT:
        s, e = r[0]            # 一番左の帯（頭の後ろ側）が尻尾
        shared.append((y, (s + e) / 2, (e - s + 1) / 2))
    else:
        if len(r) >= 2:
            lobe_back.append((y, (r[0][0] + r[0][1]) / 2, (r[0][1] - r[0][0] + 1) / 2))
            lobe_front.append((y, (r[1][0] + r[1][1]) / 2, (r[1][1] - r[1][0] + 1) / 2))
        elif r:
            (s, e) = r[-1]
            lobe_front.append((y, (s + e) / 2, (e - s + 1) / 2))


def side_to_world(rows):
    out = []
    for y, cx, hw in rows:
        _, Y, Z = px_to_world_partial('left', cx, y)
        out.append((Y, Z, hw * mpp('left')))
    return out


def back_x_at(Z, side):
    """back の、その高さの行で、体の外にある帯の中心と半幅。side=+1 キャラ左 = 画像左。"""
    px, py = world_to_px('back', 0.0, 0, Z)
    y = int(round(py))
    if not (0 <= y < back.shape[0]):
        return None
    row = back[y] & ~bodyb[y]
    rr = runs(row, 0, 224) if side > 0 else runs(row, 224, 448)
    if not rr:
        return None
    s, e = (rr[0] if side > 0 else rr[-1])   # 一番外側の帯
    cx = (s + e) / 2
    _, X, _ = px_to_world_partial('back', cx, y)
    return X, (e - s + 1) / 2 * mpp('back')


result = {}
for name, lobe in (('back_lobe', lobe_back), ('front_lobe', lobe_front)):
    pts = side_to_world(shared + lobe)
    X, Y, Z, Rs, Rx = [], [], [], [], []
    for Yv, Zv, rs in pts:
        b = back_x_at(Zv, +1)
        X.append(b[0] if b else np.nan); Rx.append(b[1] if b else np.nan)
        Y.append(Yv); Z.append(Zv); Rs.append(rs)
    X = np.array(X); Rx = np.array(Rx)
    ok = ~np.isnan(X)
    idx = np.arange(len(X))
    X = np.interp(idx, idx[ok], X[ok]); Rx = np.interp(idx, idx[ok], Rx[ok])
    result[name] = {'x': X, 'y': np.array(Y), 'z': np.array(Z), 'r_side': np.array(Rs), 'r_front': Rx, 'n_shared': len(shared)}
    print(name, 'n', len(X), 'X %.3f..%.3f Y %.3f..%.3f Z %.3f..%.3f' % (X.min(), X.max(), min(Y), max(Y), min(Z), max(Z)))
    print('   r_side', np.round(Rs, 3)[::3].tolist())
    print('   r_front', np.round(Rx, 3)[::3].tolist())
    print('   back missing rows', int((~ok).sum()))
np.save(f'{D}/fit3.npy', result, allow_pickle=True)
