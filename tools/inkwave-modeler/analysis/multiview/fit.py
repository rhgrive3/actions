"""Multi-view fit of the face: a smooth, left/right-symmetric displacement field (Gaussian handles on the face surface,
head space) that lowers the landmark and contour errors of all five reference views at once, alternating with the
camera fit. Eyes, brows, ears, the scalp shell and the back of the head are masked out (the field is 0 there).

python3 fit.py geom_before.npz [--exclude VIEW] [--out field.json]"""
import argparse, json
import numpy as np
from scipy.spatial import cKDTree
import mvcore as M
import model_lm
import contours as C
import camfit

P_FIT = {
    'sigma': 0.011, 'spacing': 0.012, 'x_max': 0.078, 'y_min': -0.114, 'y_max': 0.056,
    'lam_disp': 15.0, 'lam_bend': 0.0, 'lam_smooth': 0.05, 'huber_px': 2.5, 'iters': 8,
    'contour_budget': 25.0,       # each view's contour counts like this many landmarks in total
    'nn_px': 10.0,                 # a reference contour sample pairs with a model silhouette vertex within this range
}
# per-landmark weights in the shape fit (side views: points along a smooth profile slide, the contour term holds them)
LM_W = {'nose_tip': 1.0, 'subnasale': 0.7, 'stomion': 0.8, 'mouth_R': 1.0, 'mouth_L': 1.0, 'upper_lip': 0.6,
        'lower_lip': 0.6, 'menton': 0.7, 'pogonion': 0.4, 'sulcus': 0.3, 'nostril_R': 0.5, 'nostril_L': 0.5}
SIDE_SLIDE = ('upper_lip', 'lower_lip', 'pogonion', 'menton', 'sulcus')
FIELD_OBJECTS_SKIP = ('HEAD_eyes', 'HEAD_brows', 'HEAD_face_02', 'HEAD_face_03')


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Field:
    """Handles (free ones at x >= 0; x > 0 ones have a mirrored twin) + the protection mask."""

    def __init__(self, geom, p=P_FIT):
        self.p = p
        fq = M.to_local(geom['HEAD_face']['v'])
        front = fq[fq[:, 2] > 0.0]
        tree = cKDTree(front[:, :2])
        cs = []
        for x in np.arange(0.0, p['x_max'] + 1e-9, p['spacing']):
            for y in np.arange(p['y_min'], p['y_max'] + 1e-9, p['spacing']):
                d, i = tree.query([x, y])
                if d < 0.006:
                    near = front[tree.query_ball_point([x, y], max(0.004, d + 1e-4))]
                    cs.append([x, y, near[:, 2].max()])
        self.c = np.array(cs)
        self.mirror = self.c[:, 0] > 1e-6
        prot = lambda pre: np.concatenate([M.to_local(geom[n]['v']) for n in geom if n.startswith(pre)])
        self.t_eye, self.t_brow = cKDTree(prot('HEAD_eyes')), cKDTree(prot('HEAD_brows'))
        self.t_ear = cKDTree(np.concatenate([M.to_local(geom[n]['v']) for n in ('HEAD_face_02', 'HEAD_face_03')]))
        self.t_scalp = cKDTree(M.to_local(geom['HAIR_scalp']['v'])) if 'HAIR_scalp' in geom else None

    def mask(self, q):
        m = smoothstep(0.003, 0.015, self.t_eye.query(q)[0])
        m *= smoothstep(0.003, 0.012, self.t_brow.query(q)[0])
        m *= smoothstep(0.005, 0.020, self.t_ear.query(q)[0])
        if self.t_scalp is not None:
            m *= smoothstep(0.003, 0.015, self.t_scalp.query(q)[0])
        m *= smoothstep(-0.020, 0.020, q[:, 2]) * (1 - smoothstep(0.040, 0.070, q[:, 1]))
        return m

    def basis(self, q, m=None):
        """(Bx, Bp): N x H matrices; displacement = (Bx @ Dx, Bp @ Dy, Bp @ Dz) in metres per metre of handle D."""
        s2 = 2 * self.p['sigma'] ** 2
        d2 = ((q[:, None, :] - self.c[None]) ** 2).sum(2)
        cm = self.c * np.array([-1, 1, 1])
        d2m = ((q[:, None, :] - cm[None]) ** 2).sum(2)
        phi, phim = np.exp(-d2 / s2), np.exp(-d2m / s2) * self.mirror[None]
        m = self.mask(q) if m is None else m
        Bx = m[:, None] * (phi - phim) * self.mirror[None]
        Bp = m[:, None] * (phi + phim)
        return Bx, Bp

    def displace(self, q, D, m=None):
        Bx, Bp = self.basis(q, m)
        return np.c_[Bx @ D[:, 0], Bp @ D[:, 1], Bp @ D[:, 2]]

    def neighbours(self):
        t = cKDTree(self.c)
        return [(i, j) for i, j in t.query_pairs(self.p['spacing'] * 1.5)]


def apply(geom, field, D):
    """New geometry dict with the field applied to every deformable HEAD mesh (world coordinates)."""
    out = {}
    for n, g in geom.items():
        g2 = dict(g)
        if n.startswith('HEAD_') and not n.startswith(FIELD_OBJECTS_SKIP):
            q = M.to_local(g['v'])
            g2['v'] = g['v'] + M.to_world_delta(field.displace(q, D))
        out[n] = g2
    return out


def contour_pairs(cam, dist, face_q, faces, smp, nn_px):
    """For each reference contour sample the nearest vertex on the model's outer silhouette (index or -1)."""
    uv, dep = M.project(cam, face_q, dist)
    on, _ = C.model_silhouette(uv, dep, faces)
    dd, ii = cKDTree(uv[on]).query(smp[:, :2])
    return np.where(dd < nn_px, on[ii], -1)


def rigid_fit(geom, ref_fit, views, p=P_FIT, rounds=4):
    """Cameras from landmarks + contours on the undeformed model (ICP rounds: re-pair, then solve)."""
    from scipy.optimize import least_squares
    lm = json.load(open('model_lm.json')); P0 = model_lm.positions(geom, lm)
    rc = C.ref_contours()
    fq = M.to_local(geom['HEAD_face']['v']); faces = geom['HEAD_face']['f']
    x = camfit.fit(P0, ref_fit)
    for _ in range(rounds):
        cams, dist = camfit.unpack(x)
        pairs = {v: contour_pairs(cams[v], dist, fq, faces, rc[v], p['nn_px'] * 1.5) for v in views}

        def res(xx):
            r = [camfit.residuals(xx, P0, ref_fit)]
            cs, d = camfit.unpack(xx)
            for v in views:
                ok = pairs[v] >= 0
                uv, _ = M.project(cs[v], fq[pairs[v][ok]], d)
                n2 = rc[v][ok, 2:4]
                w = np.sqrt(p['contour_budget'] / max(ok.sum(), 1))
                r.append(w * ((uv - rc[v][ok, :2]) * n2).sum(1))
            return np.concatenate(r)
        x = least_squares(res, x, loss='soft_l1', f_scale=3.0, x_scale='jac').x
    return x


def fit(geom, exclude=(), p=P_FIT, verbose=True, x_cam=None):
    ref = json.load(open('ref_landmarks.json'))
    lm = json.load(open('model_lm.json'))
    rc = C.ref_contours()
    views = [v for v in camfit.VIEWS if v not in exclude]
    ref_fit = {v: (ref[v] if v in views else {}) for v in camfit.VIEWS}
    field = Field(geom, p)
    H = len(field.c)
    D = np.zeros((H, 3))
    P0 = model_lm.positions(geom, lm)
    if x_cam is None:
        x_cam = rigid_fit(geom, ref_fit, views, p)
    cams, dist = camfit.unpack(x_cam)
    face_q0 = M.to_local(geom['HEAD_face']['v']); faces = geom['HEAD_face']['f']
    face_m = field.mask(face_q0)
    Bx_f, Bp_f = field.basis(face_q0, face_m)
    # regulariser: mean squared surface displacement (mm^2) over the movable face surface
    S = np.where((face_m > 0.02) & (face_q0[:, 2] > 0))[0][::2]
    Q1 = (Bx_f[S].T @ Bx_f[S]) / len(S); Q2 = (Bp_f[S].T @ Bp_f[S]) / len(S)
    Qd = np.zeros((3 * H, 3 * H)); Qd[:H, :H] = Q1; Qd[H:2 * H, H:2 * H] = Q2; Qd[2 * H:, 2 * H:] = Q2
    # bending: the grid Laplacian of the displacement (mm per grid step^2) keeps the local shape (no new bumps)
    R0, C0 = M.GRID
    idx = np.arange(R0 * C0).reshape(R0, C0)
    ctr = idx[1:-1, :].ravel()
    nbr = [np.roll(idx, 1, 1)[1:-1, :].ravel(), np.roll(idx, -1, 1)[1:-1, :].ravel(), idx[:-2, :].ravel(), idx[2:, :].ravel()]
    keep = face_m[ctr] > 0.02
    ctr = ctr[keep]; nbr = [n[keep] for n in nbr]
    LBx = sum(Bx_f[n] for n in nbr) - 4 * Bx_f[ctr]; LBp = sum(Bp_f[n] for n in nbr) - 4 * Bp_f[ctr]
    Qb = np.zeros((3 * H, 3 * H)); Qb[:H, :H] = LBx.T @ LBx / len(ctr)
    Qb[H:2 * H, H:2 * H] = Qb[2 * H:, 2 * H:] = LBp.T @ LBp / len(ctr)
    lm_B = {k: field.basis(P0[k][None]) for k in P0}
    lm_def = {k: not lm[k][0].startswith(FIELD_OBJECTS_SKIP) for k in P0}
    nb = field.neighbours()
    L = np.zeros((len(nb), H))
    for k, (i, j) in enumerate(nb):
        L[k, i], L[k, j] = 1, -1
    Lf = np.kron(np.eye(3), L)
    Qs = Lf.T @ Lf
    log = []
    for it in range(p['iters']):
        face_q = face_q0 + np.c_[Bx_f @ D[:, 0], Bp_f @ D[:, 1], Bp_f @ D[:, 2]]
        rows, rhs, wts, tags = [], [], [], []

        def add(Bx, Bp, J2, r, w, tag):
            rows.append(np.concatenate([J2[0] * Bx, J2[1] * Bp, J2[2] * Bp])); rhs.append(-r); wts.append(w); tags.append(tag)
        for v in views:
            cam = cams[v]
            for n, pref in ref[v].items():
                if n not in P0 or not lm_def[n]:
                    continue
                w = LM_W.get(n, 0.5) * (0.4 if v.startswith('side') and n in SIDE_SLIDE else 1.0)
                Bx, Bp = lm_B[n]
                q = P0[n] + np.array([Bx[0] @ D[:, 0], Bp[0] @ D[:, 1], Bp[0] @ D[:, 2]])
                uv, _ = M.project(cam, q[None], dist); J = M.project_jac(cam, q[None], dist)[0]
                for a in range(2):
                    add(Bx[0], Bp[0], J[a], uv[0, a] - pref[a], w, ('lm', v, n))
            pr = contour_pairs(cam, dist, face_q, faces, rc[v], p['nn_px'])
            ok = pr >= 0
            w = np.sqrt(p['contour_budget'] / max(ok.sum(), 1))
            uv = M.project(cam, face_q[pr[ok]], dist)[0]; J = M.project_jac(cam, face_q[pr[ok]], dist)
            for (pu, pv, nu, nv), vi, uvi, Jv in zip(rc[v][ok], pr[ok], uv, J):
                n2 = np.array([nu, nv])
                add(Bx_f[vi], Bp_f[vi], n2 @ Jv, n2 @ (uvi - [pu, pv]), w, ('ct', v, None))
        A = np.array(rows) * 1e-3; b = np.array(rhs); w = np.array(wts)   # unknowns in mm
        r_now = -b
        hub = np.where(np.abs(r_now) <= p['huber_px'], 1.0, p['huber_px'] / np.abs(r_now))
        W = w ** 2 * hub
        Dmm = D.ravel(order='F') * 1e3
        R = p['lam_disp'] * Qd + p.get('lam_bend', 0.0) * Qb + p['lam_smooth'] * Qs + 1e-3 * np.eye(3 * H)  # ridge: handles the mask hides
        AtA = A.T @ (A * W[:, None]) + R
        Atb = A.T @ (W * b) - R @ Dmm
        Dmm = Dmm + np.linalg.solve(AtA, Atb)
        D = Dmm.reshape(3, H).T * 1e-3
        e_lm = np.sqrt(np.mean([r ** 2 for r, t in zip(r_now, tags) if t[0] == 'lm']))
        e_ct = np.sqrt(np.mean([r ** 2 for r, t in zip(r_now, tags) if t[0] == 'ct']))
        disp = np.linalg.norm(np.c_[Bx_f @ D[:, 0], Bp_f @ D[:, 1], Bp_f @ D[:, 2]], axis=1) * 1e3
        log.append({'iter': it, 'lm_rms_px': round(float(e_lm), 3), 'contour_rms_px': round(float(e_ct), 3),
                    'face_max_mm': round(float(disp.max()), 2), 'face_mean_mm': round(float(disp[S].mean()), 2)})
        if verbose:
            print(log[-1])
    return field, D, x_cam, log


def evaluate(geom, x_cam, views=camfit.VIEWS, p=P_FIT):
    """Per view: landmark RMS (deformable landmarks) and contour RMS (px, nearest model silhouette point)."""
    ref = json.load(open('ref_landmarks.json')); lm = json.load(open('model_lm.json'))
    P = model_lm.positions(geom, lm); rc = C.ref_contours(); cams, dist = camfit.unpack(x_cam)
    fq = M.to_local(geom['HEAD_face']['v']); out = {}
    for v in views:
        names = [n for n in ref[v] if n in P and not lm[n][0].startswith(FIELD_OBJECTS_SKIP)]
        uv, _ = M.project(cams[v], np.array([P[n] for n in names]), dist)
        e = np.linalg.norm(uv - np.array([ref[v][n] for n in names]), axis=1)
        uvf, dep = M.project(cams[v], fq, dist)
        _, (mask, lo, ss) = C.model_silhouette(uvf, dep, geom['HEAD_face']['f'])
        import cv2
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        pts = np.concatenate([c[:, 0, :] for c in cnts]) / ss + lo
        dc, _ = cKDTree(pts).query(rc[v][:, :2])
        out[v] = {'landmark_rms_px': round(float(np.sqrt((e ** 2).mean())), 2),
                  'contour_rms_px': round(float(np.sqrt((dc ** 2).mean())), 2),
                  'contour_p90_px': round(float(np.percentile(dc, 90)), 2)}
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('geom'); ap.add_argument('--exclude', default=''); ap.add_argument('--out', default='field.json')
    ap.add_argument('--set', nargs='*', default=[])
    a = ap.parse_args()
    for kv in a.set:
        k, v = kv.split('='); P_FIT[k] = float(v)
    geom = M.load(a.geom)
    ex = tuple(v for v in a.exclude.split(',') if v)
    import os
    x0 = np.array(json.load(open('cams_rigid.json'))['x']) if not ex and os.path.exists('cams_rigid.json') else None
    field, D, x_cam, log = fit(geom, ex, x_cam=x0)
    cams, dist = camfit.unpack(x_cam)
    json.dump({'params': P_FIT, 'exclude': ex, 'centres_head_m': field.c.tolist(), 'D_head_m': D.tolist(),
               'cams': cams, 'dist': dist, 'log': log}, open(a.out, 'w'), indent=1)
    print('saved', a.out, 'handles', len(field.c))
