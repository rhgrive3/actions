import numpy as np
from scipy.spatial.transform import Rotation as Rot
C = np.array([0.004, 1.39, -0.012])
# three.js Euler(x=pitch, y=yaw, z=-tilt, 'YXZ') -> intrinsic Y then X then Z
Rm = Rot.from_euler('YXZ', [0.03, 0.0, -0.115]).as_matrix()
def to_world(p): return (Rm @ np.asarray(p, float).T).T + C
def to_front_px(p):
    w = to_world(p); w = np.atleast_2d(w); return np.c_[566 + w[:,0]*842, 1334 - w[:,1]*842]
def from_front_px(px, py, z=0.09):
    # solve local (x,y) given z
    from scipy.optimize import least_squares
    f = lambda q: to_front_px([q[0], q[1], z])[0] - [px, py]
    return least_squares(f, [ (px-566)/842, (163.6-py)/842 ]).x
if __name__ == '__main__':
    for n, p in [('ear tip R', [-0.173,-0.033,-0.088]), ('ear tip L',[0.173,-0.033,-0.088]), ('ear root R', [-0.091,-0.031,-0.012]), ('eyeR', [-0.0475,-0.017,0.09]), ('eyeL', [0.0475,-0.017,0.09]), ('mouth', [0,-0.0648,0.105]), ('chin', [0,-0.1065,0.068])]:
        print(n, to_front_px(p).round(1))
