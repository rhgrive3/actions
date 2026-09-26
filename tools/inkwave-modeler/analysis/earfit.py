import numpy as np, json
from scipy.optimize import least_squares
from lm import run
from review import VIEWS, KEY, sim, OUT
from proj import to_world, to_front_px
# camera projection used by renderPersp
def persp_px(Pw, az, el, dist=3.3, W=700, H=700, target=(0,1.365,0), fov=5.5):
    T = np.array(target); C = T + dist*np.array([np.sin(az)*np.cos(el), np.sin(el), np.cos(az)*np.cos(el)])
    f = (T - C); f /= np.linalg.norm(f); r = np.cross(f, [0,1,0]); r /= np.linalg.norm(r); u = np.cross(r, f)
    q = Pw - C; x, y, z = q@r, q@u, q@f
    t = np.tan(np.radians(fov)/2); return np.array([W/2 + x/(z*t)*H/2, H/2 - y/(z*t)*H/2])
cams = {'q34': (-0.35,-0.28), 'side': (-0.95,-0.15)}
Ms = {}
for v in ('q34','side'):
    c = VIEWS[v]; box = c['box']; k = OUT/(box[2]-box[0])
    RL = (run(c['ref'], box, 3)[0][:, :2] - box[:2]) * k
    ML = run(f'rv0_{v}_b.png')[0][:, :2]
    M, e = sim(ML[KEY], RL[KEY]); Ms[v] = (M, k, box)
refs = {'front': (421.3,186.5), 'q34': (414.3,145.75), 'side': (492.75,173.0)}
def model_to_ref(v, Pw):
    if v == 'front':
        return np.array([566 + Pw[0]*842, 1334 - Pw[1]*842])
    M, k, box = Ms[v]; p = persp_px(Pw, *cams[v]); q = M[:, :2]@p + M[:, 2]; return q/k + box[:2]
root = np.array([-0.0930, -0.0290, -0.0120])
def tip_local(o): return root + np.array([-o[0], o[1], o[2]])
def res(o):
    P = to_world(tip_local(o))[0] if to_world(tip_local(o)).ndim > 1 else to_world(tip_local(o))
    return np.concatenate([model_to_ref(v, P) - np.array(refs[v]) for v in refs])
o0 = np.array([0.078, -0.016, -0.070])
print('current', res(o0).round(1))
o1 = np.array([0.078, 0.006, -0.070]); print('previous', res(o1).round(1))
sol = least_squares(res, o0); print('fit', sol.x.round(4), res(sol.x).round(1), 'len', np.linalg.norm(sol.x).round(4))
w = np.array([2,2,1,1,1,1.0])
sol = least_squares(lambda o: res(o)*w, o0); print('fit front x2', sol.x.round(4), res(sol.x).round(1), 'len', np.linalg.norm(sol.x).round(4))
for o in ([0.080,-0.012,-0.050],[0.082,-0.010,-0.055],[0.078,-0.012,-0.058]):
    print(o, res(np.array(o)).round(1), np.linalg.norm(o).round(4))
