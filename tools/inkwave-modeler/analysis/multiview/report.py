"""Before/after numbers and overlay for a field: python3 report.py geom_before.npz field.json out_prefix"""
import json, sys
import numpy as np
import mvcore as M
import model_lm, camfit, fit, overlay

geom = M.load(sys.argv[1]); F = json.load(open(sys.argv[2])); out = sys.argv[3]
field = fit.Field(geom, F['params']); field.c = np.array(F['centres_head_m'])
field.mirror = field.c[:, 0] > 1e-6
D = np.array(F['D_head_m'])
after = fit.apply(geom, field, D)
lm = json.load(open('model_lm.json')); ref = json.load(open('ref_landmarks.json'))
res = {}
x_fixed = np.array([c for v in camfit.VIEWS for c in (F['cams'][v][k] for k in M.CAM_KEYS)] + [F['dist']])
for name, g in (('before', geom), ('after', after)):
    x = x_fixed          # the same cameras for both: the change is the shape
    res[name] = fit.evaluate(g, x)
    cams, dist = camfit.unpack(x)
    overlay.draw(g, cams, dist, f'{out}_{name}.png', title=f'{name}: red = model silhouette, green = reference contour, yellow = reference landmark, cyan = model landmark',
                 extra=geom if name == 'after' else None)
    res[name + '_cams'] = {v: {k: round(float(c[k]), 4) for k in c} for v, c in cams.items()}
# displacement summary per region (head space, mm), HEAD_face vertices
q = M.to_local(geom['HEAD_face']['v']); d = field.displace(q, D) * 1000
regions = {'forehead': (q[:, 1] > 0.02) & (q[:, 1] < 0.06), 'radix_bridge': (q[:, 1] > -0.035) & (q[:, 1] <= 0.0) & (np.abs(q[:, 0]) < 0.015),
           'nose_tip': (q[:, 1] > -0.056) & (q[:, 1] <= -0.035) & (np.abs(q[:, 0]) < 0.015),
           'cheek': (q[:, 1] > -0.060) & (q[:, 1] <= -0.025) & (np.abs(q[:, 0]) > 0.030) & (np.abs(q[:, 0]) < 0.075),
           'mouth': (q[:, 1] > -0.078) & (q[:, 1] <= -0.056) & (np.abs(q[:, 0]) < 0.032),
           'chin': (q[:, 1] <= -0.085) & (np.abs(q[:, 0]) < 0.020), 'jaw_angle': (q[:, 1] <= -0.060) & (np.abs(q[:, 0]) > 0.040),
           'jawline': (q[:, 1] <= -0.075) & (np.abs(q[:, 0]) > 0.020) & (np.abs(q[:, 0]) <= 0.040)}
summ = {}
for k, sel in regions.items():
    sel = sel & (q[:, 2] > 0)
    dd = d[sel]; mag = np.linalg.norm(dd, axis=1); i = np.argmax(mag)
    summ[k] = {'max_mm': round(float(mag.max()), 2), 'mean_mm': round(float(mag.mean()), 2),
               'at_max_xyz_mm(x=out for |x|,y=up,z=forward)': [round(float(np.sign(q[sel][i, 0]) * dd[i, 0]), 2) if abs(q[sel][i, 0]) > 0.003 else round(float(dd[i, 0]), 2), round(float(dd[i, 1]), 2), round(float(dd[i, 2]), 2)],
               'mean_xyz_mm': [round(float((np.sign(q[sel][:, 0]) * dd[:, 0]).mean()), 2), round(float(dd[:, 1].mean()), 2), round(float(dd[:, 2].mean()), 2)]}
res['regions'] = summ
res['face_max_mm'] = round(float(np.linalg.norm(d, axis=1).max()), 2)
json.dump(res, open(f'{out}_report.json', 'w'), indent=1)
for v in camfit.VIEWS:
    b, a = res['before'][v], res['after'][v]
    print(f"{v:6s} landmarks {b['landmark_rms_px']:5.2f} -> {a['landmark_rms_px']:5.2f}   contour {b['contour_rms_px']:5.2f} -> {a['contour_rms_px']:5.2f}  p90 {b['contour_p90_px']:5.2f} -> {a['contour_p90_px']:5.2f}")
for k, s in summ.items():
    print(f'{k:13s}', s)
print('face max', res['face_max_mm'])
