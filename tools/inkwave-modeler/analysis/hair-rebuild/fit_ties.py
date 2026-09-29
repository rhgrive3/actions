"""黒い帯を 3D の輪として、5 方向の参照シートから同時に合わせる。
参照をよく見ると、帯は尻尾ごとのゴムではなく、耳から耳へ頭の上を越える 1 本のヘアバンド（両側にバックル）。
左右の点を全部まとめて 1 本の輪（楕円）に合わせる。
帯の中心線を各ビューで手で拾った点（シート画素、目盛り付き拡大 gridcrop.py で読んだ）と、
輪を顔合わせのカメラ（analysis/multiview/field.json）で写した曲線との距離を最小にする。
輪: 中心 c（頭ローカル m）、法線（2 角）、半径 a, b（楕円）、楕円の回転 -> 8 パラメータ。
python3 fit_ties.py <out.json>"""
import json, os, sys
import numpy as np
from scipy.optimize import least_squares
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../multiview'))
import mvcore as M  # noqa: E402

spec = json.load(open(os.path.join(HERE, '../multiview/field.json'))); dist = spec['dist']
# 帯の中心線（シート画素）。+X = キャラの左。
PICKS = {
    'L': {'front': [(257, 180), (275, 183), (293, 188), (310, 195), (322, 202), (333, 213)],
          'q34L': [(653, 192), (673, 197), (693, 210), (710, 227), (720, 247), (727, 267), (732, 287), (737, 307), (740, 327)],
          'sideL': [(1078, 200), (1093, 233), (1107, 267), (1123, 300), (1135, 333), (1142, 360)]},
    'R': {'front': [(123, 280), (125, 260), (132, 240), (143, 220), (160, 205), (180, 193), (200, 187), (213, 183)],
          'q34L': [(515, 285), (517, 265), (522, 248), (548, 205), (570, 193)],
          'q34R': [(1465, 185), (1460, 200), (1450, 220), (1440, 240), (1427, 260), (1417, 280), (1407, 300), (1402, 320), (1400, 340)],
          'sideR': [(1942, 183), (1942, 200), (1930, 250), (1903, 300), (1885, 350)]},
}
T = np.linspace(0, 2 * np.pi, 360, endpoint=False)


def ring(p):
    c = p[0:3]; th, ph = p[3], p[4]; a, b, rot = p[5], p[6], p[7]
    n = np.array([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)])
    u = np.cross(n, [0, 0, 1.0]); u /= np.linalg.norm(u); v = np.cross(n, u)
    u, v = np.cos(rot) * u + np.sin(rot) * v, -np.sin(rot) * u + np.cos(rot) * v
    return c + np.outer(a * np.cos(T), u) + np.outer(b * np.sin(T), v), n


def residuals(p, picks):
    pts, _ = ring(p)
    r = []
    for view, obs in picks.items():
        uv, _ = M.project(spec['cams'][view], pts, dist)
        for o in obs:
            r.append(np.min(np.linalg.norm(uv - np.array(o), axis=1)))
    return np.array(r)


ALL = {}
for side in PICKS:
    for view, obs in PICKS[side].items():
        ALL.setdefault(view, []).extend(obs)
PICKS = {'band': ALL}
out = {}
for side, sgn in (('band', 1),):
    best = None
    for th0 in (0.4, 0.8, 1.2):
        for ph0 in (-1.2, -0.6, 0.0, 0.6):
            x0 = np.array([0.0, 0.03, -0.03, th0, ph0, 0.11, 0.10, 0.0])
            res = least_squares(residuals, x0, args=(PICKS[side],), loss='soft_l1', f_scale=3.0,
                                bounds=([-0.2, -0.1, -0.2, 0, -2 * np.pi, 0.02, 0.02, -np.pi], [0.2, 0.2, 0.2, np.pi, 2 * np.pi, 0.15, 0.15, np.pi]))
            if best is None or res.cost < best.cost:
                best = res
    r = residuals(best.x, PICKS[side])
    pts, n = ring(best.x)
    out[side] = {'centre_local_m': best.x[:3].tolist(), 'normal_local': n.tolist(), 'a_m': best.x[5], 'b_m': best.x[6],
                 'rot': best.x[7], 'rms_px': float(np.sqrt((r ** 2).mean())), 'max_px': float(r.max()),
                 'ring_world': M.to_world(pts).tolist()}
    print(side, 'rms %.1f px  max %.1f px  centre mm %s  normal %s  a %.0f b %.0f mm' % (
        out[side]['rms_px'], out[side]['max_px'], np.round(best.x[:3] * 1000).astype(int), np.round(n, 2), best.x[5] * 1000, best.x[6] * 1000))
json.dump(out, open(sys.argv[1], 'w'), indent=1)
