"""Fit the five reference cameras to the landmarks (model landmarks fixed). python3 camfit.py geom.npz [out.json]"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
import mvcore as M
import model_lm

VIEWS = ('front', 'q34L', 'sideL', 'q34R', 'sideR')
INIT = {'front': (0.05, 0.0, 0.0, 1000, 245, 375), 'q34L': (0.8, 0.0, 0.0, 1000, 640, 380),
        'sideL': (1.5, 0.0, 0.0, 1000, 1040, 375), 'q34R': (-1.0, 0.0, 0.0, 1000, 1530, 370),
        'sideR': (-1.5, 0.0, 0.0, 1000, 1990, 370)}
# anchor landmarks (parts the fit keeps: eyes, brows, ears) weigh more when the cameras are fitted
WEIGHT = {'pupil': 1.0, 'brow': 0.6, 'ear_tip': 0.6, 'eye_in': 0.4, 'eye_out': 0.4}


def weight(name):
    for k, w in WEIGHT.items():
        if name.startswith(k):
            return w
    return 0.5


def unpack(x):
    cams = {v: dict(zip(M.CAM_KEYS, x[6 * i:6 * i + 6])) for i, v in enumerate(VIEWS)}
    return cams, x[-1]


def residuals(x, P, ref):
    cams, dist = unpack(x)
    r = []
    for v in VIEWS:
        names = [n for n in ref[v] if n in P]
        uv, _ = M.project(cams[v], np.array([P[n] for n in names]), dist)
        w = np.array([weight(n) for n in names])[:, None]
        r.append(((uv - np.array([ref[v][n] for n in names])) * w).ravel())
    r.append([(x[-1] - 3.0) * 2.0])      # weak prior on the camera distance (m)
    return np.concatenate(r)


def fit(P, ref, x0=None):
    if x0 is None:
        x0 = np.array([c for v in VIEWS for c in INIT[v]] + [3.0], float)
    lo = np.full_like(x0, -np.inf); hi = np.full_like(x0, np.inf); lo[-1], hi[-1] = 0.4, 50.0
    res = least_squares(residuals, x0, args=(P, ref), loss='soft_l1', f_scale=3.0, bounds=(lo, hi), x_scale='jac')
    return res.x


def report(x, P, ref):
    cams, dist = unpack(x)
    out = {}
    for v in VIEWS:
        names = [n for n in ref[v] if n in P]
        uv, _ = M.project(cams[v], np.array([P[n] for n in names]), dist)
        d = uv - np.array([ref[v][n] for n in names])
        out[v] = {n: [round(float(a), 1), round(float(b), 1)] for n, (a, b) in zip(names, d)}
    return out


if __name__ == '__main__':
    g = M.load(sys.argv[1])
    P = model_lm.positions(g, json.load(open('model_lm.json')))
    ref = json.load(open('ref_landmarks.json'))
    x = fit(P, ref)
    cams, dist = unpack(x)
    for v in VIEWS:
        c = cams[v]
        print(v, 'az %.1f el %.1f roll %.1f deg  s %.0f px/m  (%.1f, %.1f)' % (np.degrees(c['az']), np.degrees(c['el']), np.degrees(c['roll']), c['s'], c['u0'], c['v0']))
    print('dist', round(dist, 3))
    rep = report(x, P, ref)
    for v, d in rep.items():
        print(v, ' '.join(f'{n}:{a:+.1f},{b:+.1f}' for n, (a, b) in d.items()))
    json.dump({'cams': cams, 'dist': dist, 'residual_px': rep}, open(sys.argv[2] if len(sys.argv) > 2 else 'cams.json', 'w'), indent=1)
