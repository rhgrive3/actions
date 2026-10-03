"""尻尾 第6版: 1本の束（分かれる前）+ 2本の触手（分かれた後）。
生の測定 fit3.npy から作る。断面は楕円: 正面方向の半幅 rx（back の幅）、奥行き方向の半厚 ry（left の厚み）。
どちらも弧長の多項式でなめらかにし、X のずれ c0、先端の外への広がり c2、rx 倍率 kx、ry 倍率 ky を
front/back/left の髪シルエット IoU 平均が最大になるよう探す。"""
import os
import json, sys
import numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts'))
from inkwave_ref_calibration import world_to_px, ortho_params, ASPECT, RES_W
D = os.environ.get('HAIR_WORK', '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-hair-rebuild-20260929')
sys.path.insert(0, D)
from tailfit import clean
PJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts/inkwave_hair_rebuild_v2_params.json')
views = ('front', 'back', 'left')
ref = {v: clean(np.load(f'{D}/hair_{v}.npy')) for v in views}
body = {v: cv2.imread(f'{D}/bodymask/body_all_{v}.png', cv2.IMREAD_UNCHANGED)[..., 3] > 127 for v in views}
head = {v: cv2.imread(f'{D}/bodymask/body_head_{v}.png', cv2.IMREAD_UNCHANGED)[..., 3] > 127 for v in views}
raw = np.load(f'{D}/fit3.npy', allow_pickle=True).item()
P = json.load(open(PJ))
TIE = P['tie']


def sm(v, k=5):
    k = np.ones(k) / k
    return np.convolve(np.pad(v, (len(k) // 2,), mode='edge'), k, mode='valid')


def poly(v, deg):
    s = np.linspace(0, 1, len(v))
    return np.polyval(np.polyfit(s, v, deg), s)


n = raw['back_lobe']['n_shared']
b = raw['back_lobe']
bundle = dict(x=sm(b['x'][:n]), y=sm(b['y'][:n]), z=sm(b['z'][:n]),
              rx=np.clip(poly(b['r_front'][:n], 2), 0.02, None), ry=np.clip(poly(b['r_side'][:n], 2), 0.02, None))
lobes = []
for name in ('back_lobe', 'front_lobe'):
    t = raw[name]
    sl = slice(n - 2, None)
    lobes.append(dict(name=name, x=sm(t['x'][sl]), y=sm(t['y'][sl]), z=sm(t['z'][sl]),
                      rx=np.clip(poly(t['r_front'][sl], 3), 0.012, None), ry=np.clip(poly(t['r_side'][sl], 3), 0.012, None)))


def parts(c0, c2, kx, ky):
    out = [dict(x=bundle['x'] + c0, y=bundle['y'], z=bundle['z'], rx=bundle['rx'] * kx, ry=bundle['ry'] * ky, first=True)]
    for L in lobes:
        s = np.linspace(0, 1, len(L['x']))
        out.append(dict(name=L['name'], x=L['x'] + c0 + c2 * s ** 2, y=L['y'], z=L['z'], rx=L['rx'] * kx, ry=L['ry'] * ky, first=False))
    return out


def draw(view, ps):
    img = np.zeros((560, 448), np.uint8)
    mpp = ortho_params(view)[2] * ASPECT / RES_W
    for sgn in ((1,) if view == 'left' else (1, -1)):
        for p in ps:
            pts = [world_to_px(view, sgn * a, bb, c) for a, bb, c in zip(p['x'], p['y'], p['z'])]
            rr = (p['ry'] if view == 'left' else p['rx']) / mpp
            if p['first']:
                pts = [world_to_px(view, sgn * TIE[0], TIE[1], TIE[2])] + pts; rr = np.r_[0.02 / mpp, rr]
            for i in range(len(pts)):
                cv2.circle(img, (int(pts[i][0]), int(pts[i][1])), max(1, int(rr[i])), 1, -1)
                if i:
                    cv2.line(img, tuple(int(v) for v in pts[i - 1]), tuple(int(v) for v in pts[i]), 1, max(1, int(rr[i - 1] + rr[i])))
    m = img.astype(bool) & ~body[view] & ~head[view]; m[300:] = False
    return m


def score(*a):
    ps = parts(*a); ious = []
    for v in views:
        new = draw(v, ps); r = ref[v] & ~head[v]
        ious.append((r & new).sum() / max((r | new).sum(), 1))
    return np.mean(ious), ious


if __name__ == '__main__':
    print('補正なし:', [round(x, 3) for x in score(0, 0, 1, 1)[1]])
    best = (-1,)
    for c0 in np.linspace(-0.04, 0.02, 7):
        for c2 in np.linspace(-0.02, 0.10, 7):
            for kx in np.linspace(0.7, 1.2, 6):
                for ky in np.linspace(0.6, 1.1, 6):
                    m, ious = score(c0, c2, kx, ky)
                    if m > best[0]:
                        best = (m, c0, c2, kx, ky, ious)
    m, c0, c2, kx, ky, ious = best
    print('best %.3f c0=%.3f c2=%.3f kx=%.2f ky=%.2f  front/back/left' % (m, c0, c2, kx, ky), [round(x, 3) for x in ious])
    ps = parts(c0, c2, kx, ky)
    P.pop('tentacles', None)
    P['tail_bundle'] = {k: np.round(ps[0][k], 4).tolist() for k in ('x', 'y', 'z', 'rx', 'ry')}
    P['tail_lobes'] = [{'name': p['name'], **{k: np.round(p[k], 4).tolist() for k in ('x', 'y', 'z', 'rx', 'ry')}} for p in ps[1:]]
    P['source'] = ('measured: hairmask.py (reference silhouette minus our body rendered through the validated camera) -> '
                   'fit3.py (left.jpg rows: Y, Z, thickness ry of the shared bundle and of each of the two tentacles below '
                   'the split; back.jpg rows at the same Z: X and front half-width rx) -> fit6.py (rx/ry smoothed by '
                   'polynomials in arc length; X offset c0, lobe outward flare c2*s^2 and scales kx, ky chosen to maximise '
                   f'the mean hair-silhouette IoU over front/back/left: c0={c0:.3f} c2={c2:.3f} kx={kx:.2f} ky={ky:.2f}).')
    json.dump(P, open(PJ, 'w'), indent=1)
