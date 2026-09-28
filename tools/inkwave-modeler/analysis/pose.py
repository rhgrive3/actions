import sys, numpy as np
from lm import run
from scipy.spatial.transform import Rotation as Rot
def pose(p, crop=None, up=1):
    r = run(p, crop, up)
    if r is None: return None
    M = r[1]; R = M[:3,:3]
    e = Rot.from_matrix(R).as_euler('YXZ', degrees=True)  # yaw, pitch, roll
    return e, r[0]
if __name__ == '__main__':
    for p, c, up in [('ref_front_hi.png',(440,80,700,300),3), ('ref_side_hi.png',(500,70,740,290),3), ('ref_34_hi.png',(430,60,720,320),3), ('basef_front.png',None,1), ('basef_side.png',None,1), ('base_p34.png',None,1)]:
        e = pose(p, c, up); print(p, None if e is None else np.round(e[0],1))
