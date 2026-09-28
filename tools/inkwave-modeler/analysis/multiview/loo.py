"""Leave-one-view-out check: fit the field without view V (rigid cameras fixed), measure V before/after."""
import json, sys
import numpy as np
import mvcore as M, fit, camfit
v = sys.argv[1]
fit.P_FIT.update(lam_disp=15.0, nn_px=10.0, lam_bend=20000.0, sigma=0.015, spacing=0.015)
g = M.load('geom_before.npz'); x = np.array(json.load(open('cams_rigid.json'))['x'])
field, D, _, _ = fit.fit(g, (v,), verbose=False, x_cam=x)
after = fit.apply(g, field, D)
b, a = fit.evaluate(g, x, (v,))[v], fit.evaluate(after, x, (v,))[v]
print(json.dumps({'held_out': v, 'before': b, 'after': a}))
