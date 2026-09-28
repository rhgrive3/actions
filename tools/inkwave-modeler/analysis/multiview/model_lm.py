"""Model landmarks: each one is a vertex (object, index) of the current mesh, found from the geometry, so it follows
the deformation. python3 model_lm.py geom.npz -> model_lm.json"""
import json, sys
import numpy as np
import mvcore as M

LID_IN, LID_OUT = (0.0265, -0.0232), (0.0740, -0.0110)   # eye opening corners (inkwave_face_look.py P['lid_*'])


def nearest(q, pts, x, y, zmin=0.05):
    ok = np.where(q[:, 2] > zmin)[0]
    d = (q[ok, 0] - x) ** 2 + (q[ok, 1] - y) ** 2
    return int(ok[np.argmin(d)])


def centroid_vertex(q, sel):
    c = q[sel].mean(0)
    return int(sel[np.argmin(((q[sel] - c) ** 2).sum(1))])


def compute(g):
    out = {}
    face = g['HEAD_face']; q = M.to_local(face['v']); G = q.reshape(M.GRID + (3,))
    col0 = np.arange(M.GRID[0]) * M.GRID[1]          # midline vertices (column 0), rings bottom -> top
    my, mz = q[col0, 1], q[col0, 2]

    def mid(kind, y0, y1):
        r = np.where((my > y0) & (my < y1))[0]
        i = r[np.argmax(mz[r])] if kind == 'max' else r[np.argmin(mz[r])]
        return ['HEAD_face', int(col0[i])]
    out['nose_tip'] = mid('max', -0.056, -0.036)
    tip_y = my[out['nose_tip'][1] // M.GRID[1]]
    out['upper_lip'] = mid('max', -0.066, -0.056)
    out['subnasale'] = mid('min', q[out['upper_lip'][1], 1], tip_y - 0.002)
    out['stomion'] = mid('min', -0.070, q[out['upper_lip'][1], 1])
    out['lower_lip'] = mid('max', -0.078, q[out['stomion'][1], 1])
    out['sulcus'] = mid('min', -0.094, q[out['lower_lip'][1], 1])
    out['pogonion'] = mid('max', -0.106, q[out['sulcus'][1], 1])
    r = np.where((my < -0.090) & (mz > 0.05))[0]      # menton: chin extreme 45 deg down-forward
    out['menton'] = ['HEAD_face', int(col0[r[np.argmax(-my[r] + mz[r])]])]
    out['nasion'] = mid('min', -0.032, 0.0)
    out['glabella'] = mid('max', 0.0, 0.025)
    for s, sx in (('L', 1), ('R', -1)):
        out['eye_in_' + s] = ['HEAD_face', nearest(q, None, sx * LID_IN[0], LID_IN[1])]
        out['eye_out_' + s] = ['HEAD_face', nearest(q, None, sx * LID_OUT[0], LID_OUT[1])]
        iris = 'HEAD_eyes_02' if s == 'L' else 'HEAD_eyes_19'
        qi = M.to_local(g[iris]['v'])
        c = qi.mean(0); front = np.where(qi[:, 2] > np.percentile(qi[:, 2], 50))[0]
        out['pupil_' + s] = [iris, int(front[np.argmin(((qi[front, :2] - c[:2]) ** 2).sum(1))])]  # iris centre
        brow = 'HEAD_brows' if s == 'L' else 'HEAD_brows_02'
        qb = M.to_local(g[brow]['v']); ax = np.abs(qb[:, 0])
        out['brow_in_' + s] = [brow, centroid_vertex(qb, np.where(ax < np.percentile(ax, 4))[0])]
        out['brow_tail_' + s] = [brow, centroid_vertex(qb, np.where(ax > np.percentile(ax, 97))[0])]
        out['brow_peak_' + s] = [brow, centroid_vertex(qb, np.where(qb[:, 1] > np.percentile(qb[:, 1], 96))[0])]
        ear = 'HEAD_face_02' if s == 'L' else 'HEAD_face_03'
        qe = M.to_local(g[ear]['v'])
        out['ear_tip_' + s] = [ear, int(np.argmax(np.abs(qe[:, 0])))]
        out['ear_low_' + s] = [ear, int(np.argmin(qe[:, 1]))]
        nos = 'HEAD_skin_03' if s == 'L' else 'HEAD_skin_06'
        qn = M.to_local(g[nos]['v'])
        out['nostril_' + s] = [nos, centroid_vertex(qn, np.arange(len(qn)))]
    # mouth corners: the lateral ends of the mouth line decal
    for nm in ('HEAD_skin_07', 'HEAD_skin_08', 'HEAD_skin_09'):
        qm = M.to_local(g[nm]['v']); print(nm, (qm.min(0) * 1000).round(1), (qm.max(0) * 1000).round(1))
    qm = M.to_local(g['HEAD_skin_09']['v'])
    out['mouth_L'] = ['HEAD_skin_09', int(np.argmax(qm[:, 0]))]
    out['mouth_R'] = ['HEAD_skin_09', int(np.argmin(qm[:, 0]))]
    return out


def positions(g, lm):
    return {k: M.to_local(g[o]['v'][[i]])[0] for k, (o, i) in lm.items()}


if __name__ == '__main__':
    g = M.load(sys.argv[1])
    lm = compute(g)
    json.dump(lm, open('model_lm.json', 'w'), indent=0)
    for k, p in positions(g, lm).items():
        print(f'{k:12s}', (p * 1000).round(1))
