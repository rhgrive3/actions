"""髪マスクから尻尾の中心線と幅を測る。
根元（尻尾側の一番上の点）からのマスク内の最短距離（geodesic）で帯を区切り、
帯ごとの重心 = 中心線、帯の画素数 / 帯の厚み = 幅。
"""
import os
import json
from collections import deque
import numpy as np, cv2

D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')


def clean(m):
    # 上部（y<120）に繋がる成分だけ残す = 髪の本体。腕・脚の縁のノイズを除く。
    n, lab = cv2.connectedComponents(m.astype(np.uint8))
    top = set(np.unique(lab[:120][m[:120]])) - {0}
    return np.isin(lab, list(top))


def geodesic(m, seed):
    dist = np.full(m.shape, -1, int)
    q = deque([seed]); dist[seed] = 0
    H, W = m.shape
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and dist[yy, xx] < 0:
                dist[yy, xx] = dist[y, x] + 1; q.append((yy, xx))
    return dist


def centreline(m, side_sel, bin_px=6):
    sub = m & side_sel
    ys, xs = np.nonzero(sub)
    i = np.argmin(ys); seed = (ys[i], xs[i])
    dist = geodesic(sub, seed)
    L = dist.max()
    pts = []
    for d0 in range(0, L + 1, bin_px):
        sel = (dist >= d0) & (dist < d0 + bin_px)
        if sel.sum() < 3:
            continue
        yy, xx = np.nonzero(sel)
        pts.append({'s': float(d0 / L), 'x': float(xx.mean()), 'y': float(yy.mean()), 'w': float(sel.sum() / bin_px)})
    return pts


if __name__ == '__main__':
    out = {}
    vis_all = []
    for view in ('front', 'back', 'left'):
        m = clean(np.load(f'{D}/hair_{view}.npy'))
        H, W = m.shape
        X = np.arange(W)[None, :].repeat(H, 0)
        halves = {'left': {'imgL': X < 224}, 'front': {'imgL': X < 224, 'imgR': X >= 224}, 'back': {'imgL': X < 224, 'imgR': X >= 224}}[view]
        vis = cv2.cvtColor((m * 120).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        for name, sel in halves.items():
            pts = centreline(m, sel)
            out[f'{view}_{name}'] = pts
            for p in pts:
                cv2.circle(vis, (int(p['x']), int(p['y'])), max(1, int(p['w'] / 2)), (0, 200, 255), 1)
                cv2.circle(vis, (int(p['x']), int(p['y'])), 1, (0, 0, 255), -1)
        vis_all.append(vis[:300])
    json.dump(out, open(f'{D}/tailfit.json', 'w'), indent=1)
    cv2.imwrite(f'{D}/tailfit_check.png', np.concatenate(vis_all, axis=1))
    for k, v in out.items():
        print(k, len(v), 'max w %.0f' % max(p['w'] for p in v))
