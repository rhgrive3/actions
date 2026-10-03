# 全身参照（1122x1402）の正投影カメラ。inkwave_ref_calibration.py の値。
import numpy as np
PX={'front':(566,1334,842),'back':(561,1338,847),'left':(575,1329,838)}
def proj(view,P):
    cx,gy,s=PX[view]; P=np.asarray(P,float)
    u={'front':cx+P[...,0]*s,'back':cx-P[...,0]*s,'left':cx-P[...,1]*s}[view]
    v=gy-P[...,2]*s
    return np.stack([u,v],-1)
def unproj(view,u,v):
    cx,gy,s=PX[view]; z=(gy-v)/s
    free={'front':(u-cx)/s,'back':(cx-u)/s,'left':(cx-u)/s}[view]   # front/back: x, left: y
    return free,z
