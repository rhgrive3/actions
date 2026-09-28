"""Displacement map of a field on HEAD_face: front and side orthographic views, colour = displacement along the
surface normal (red outward, blue inward, mm), arrows = the in-plane part. python3 heatmap.py field.json out.png"""
import json, sys
import numpy as np
import cv2
import mvcore as M, fit

g0 = M.load('geom_before.npz'); F = json.load(open(sys.argv[1]))
field = fit.Field(g0, F['params']); field.c = np.array(F['centres_head_m']); field.mirror = field.c[:, 0] > 1e-6
q = M.to_local(g0['HEAD_face']['v']); f = g0['HEAD_face']['f']
d = field.displace(q, np.array(F['D_head_m'])) * 1000
n = M.to_local(g0['HEAD_face']['v'] + g0['HEAD_face']['n'] * 1e-3) - q; n /= np.linalg.norm(n, axis=1, keepdims=True)
dn = (d * n).sum(1)
K, LIM = 5.0, 4.0            # px per mm, colour limit (mm)


def colour(v):
    t = np.clip(v / LIM, -1, 1)
    return np.stack([np.where(t < 0, 255 * (1 + t), 255), 255 * (1 - np.abs(t)), np.where(t > 0, 255 * (1 - t), 255)], 1)


def view(axis_u, axis_v, sign_u, depth, box):
    x0, x1, y0, y1 = box
    W, H = int((x1 - x0) * K), int((y1 - y0) * K)
    img = np.full((H, W, 3), 245, np.uint8)
    uv = np.c_[(sign_u * q[:, axis_u] * 1000 - x0) * K, (y1 - q[:, axis_v] * 1000) * K]
    order = np.argsort(q[f].mean(1)[:, depth])   # painter's order, far to near
    col = colour(dn[f].mean(1))
    front = q[f].mean(1)[:, 2] > -0.03
    for i in order:
        if front[i]:
            cv2.fillConvexPoly(img, uv[f[i]].astype(np.int32), tuple(int(c) for c in col[i]), cv2.LINE_AA)
    sel = np.where((np.linalg.norm(d, axis=1) > 0.4) & (q[:, 2] > 0.02))[0][::60]
    for i in sel:
        p = uv[i]; dv = np.array([sign_u * d[i, axis_u], -d[i, axis_v]]) * K * 2
        cv2.arrowedLine(img, tuple(p.astype(int)), tuple((p + dv).astype(int)), (30, 30, 30), 1, cv2.LINE_AA, tipLength=0.3)
    return img


front = view(0, 1, -1, 2, (-95, 95, -120, 60))          # viewer's left = character's right
side = view(2, 1, 1, 0, (-40, 135, -120, 60))            # character's left side, face to the right
bar = np.full((60, front.shape[1] + side.shape[1] + 10, 3), 255, np.uint8)
for i in range(300):
    c = colour(np.array([(i / 299 * 2 - 1) * LIM]))[0]
    cv2.line(bar, (20 + i, 10), (20 + i, 30), tuple(int(x) for x in c), 1)
cv2.putText(bar, f'-{LIM:.0f} mm (in)', (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
cv2.putText(bar, f'+{LIM:.0f} mm (out)', (250, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
cv2.putText(bar, 'arrows: in-plane move x2 (front: left/right/up/down, side: forward/back/up/down)', (360, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
row = np.concatenate([front, np.full((front.shape[0], 10, 3), 255, np.uint8), side], 1)
cv2.imwrite(sys.argv[2], cv2.cvtColor(np.concatenate([row, bar], 0), cv2.COLOR_RGB2BGR))
print('normal displacement mm: min %.2f max %.2f' % (dn.min(), dn.max()))
