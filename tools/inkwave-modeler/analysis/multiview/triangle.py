"""Forehead -> radix -> nose-tip triangle in the right side view (as docs/face-refinement chapter 12), for the
reference profile and the model silhouette before/after. Angles of each line from the image vertical (deg).
python3 triangle.py field.json out.png"""
import json, sys
import numpy as np
import cv2
from PIL import Image
import mvcore as M, fit, contours as C

V = 'sideR'; BROW_ROW = 318          # brow height in the sheet (sideR brow landmarks: rows 316-321)
g0 = M.load('geom_before.npz'); F = json.load(open(sys.argv[1]))
field = fit.Field(g0, F['params']); field.c = np.array(F['centres_head_m']); field.mirror = field.c[:, 0] > 1e-6
g1 = fit.apply(g0, field, np.array(F['D_head_m']))
cam, dist = F['cams'][V], F['dist']


def model_profile(g):
    uv, dep = M.project(cam, M.to_local(g['HEAD_face']['v']), dist)
    _, (mask, lo, ss) = C.model_silhouette(uv, dep, g['HEAD_face']['f'])
    rows = {}
    for y in range(300, 430):
        r = int((y - lo[1]) * ss)
        xs = np.where(mask[r] > 0)[0]
        if len(xs):
            rows[y] = xs[-1] / ss + lo[0]
    return rows


def ref_profile():
    rc = C.ref_contours()[V]
    return {int(v): u for u, v, _, _ in rc if 300 <= v < 430}


def triangle(prof):
    ys = np.array(sorted(prof)); us = np.array([prof[y] for y in ys])
    fh = np.array([prof[BROW_ROW], BROW_ROW])
    band = (ys > BROW_ROW) & (ys < 410)
    it = np.argmax(np.where(band, us, -1e9)); tip = np.array([us[it], ys[it]])
    seg = band & (ys < tip[1])
    ch = tip - fh; nrm = np.array([ch[1], -ch[0]]) / np.linalg.norm(ch)
    depth = ((np.c_[us, ys] - fh) @ nrm)
    ir = np.argmax(np.where(seg, -depth if nrm[0] > 0 else depth, -1e9)); rad = np.array([us[ir], ys[ir]])
    ang = lambda a, b: float(np.degrees(np.arctan2(abs(b[0] - a[0]), abs(b[1] - a[1]))))
    return {'forehead': fh.tolist(), 'radix': rad.tolist(), 'tip': tip.tolist(),
            'tip_radix_deg': round(ang(rad, tip), 1), 'tip_forehead_deg': round(ang(fh, tip), 1),
            'radix_forehead_deg': round(ang(fh, rad), 1), 'radix_depth_px': round(float(abs(depth[ir])), 2)}


res = {'reference': triangle(ref_profile()), 'before': triangle(model_profile(g0)), 'after': triangle(model_profile(g1))}
print(json.dumps(res, indent=1))
sheet = np.asarray(Image.open(C.SHEET).convert('RGB'))
x0, y0, x1, y1, k = 2030, 290, 2130, 420, 5
tiles = []
for name, t in res.items():
    tile = cv2.resize(sheet[y0:y1, x0:x1], ((x1 - x0) * k, (y1 - y0) * k), interpolation=cv2.INTER_CUBIC)
    tile = (tile * 0.6).astype(np.uint8)
    prof = ref_profile() if name == 'reference' else model_profile(g0 if name == 'before' else g1)
    pts = np.array([[(prof[y] - x0) * k, (y - y0) * k] for y in sorted(prof)], np.int32)
    cv2.polylines(tile, [pts], False, (255, 255, 255), 1, cv2.LINE_AA)
    P = {n: (int((t[n][0] - x0) * k), int((t[n][1] - y0) * k)) for n in ('forehead', 'radix', 'tip')}
    cv2.line(tile, P['tip'], P['radix'], (255, 0, 0), 2); cv2.line(tile, P['tip'], P['forehead'], (0, 90, 255), 2)
    cv2.line(tile, P['radix'], P['forehead'], (0, 200, 0), 2)
    cv2.putText(tile, name, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(tile, f"R {t['tip_radix_deg']}  B {t['tip_forehead_deg']}  G {t['radix_forehead_deg']}", (6, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    tiles.append(np.pad(tile, ((0, 0), (0, 4), (0, 0)), constant_values=255))
Image.fromarray(np.concatenate(tiles, 1)).save(sys.argv[2])
json.dump(res, open('triangle_sideR.json', 'w'), indent=1)
