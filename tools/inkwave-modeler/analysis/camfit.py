import numpy as np, glob, sys
from lm import run
KEY = [33,133,362,263,1,61,291,152,168,70,300,4,13,14,159,145,386,374]
def procrustes(A, B):  # align A->B with similarity, return rms
    ma, mb = A.mean(0), B.mean(0); A0, B0 = A-ma, B-mb
    U,S,Vt = np.linalg.svd(A0.T@B0); d = np.sign(np.linalg.det(U@Vt)); D=np.diag([1,d])
    R = U@D@Vt; s = (S*np.diag(D)).sum()/ (A0**2).sum()
    P = s*A0@R + mb; return np.sqrt(((P-B)**2).sum(1).mean()), s, R, ma, mb
def fit(refimg, box, pat):
    R = run(refimg, box, 3)[0][KEY,:2]
    iod = np.linalg.norm(R[0]-R[3])
    res = []
    for f in sorted(glob.glob(pat)):
        r = run(f)
        if r is None: continue
        e = procrustes(r[0][KEY,:2], R)[0] / iod * 100
        res.append((e, f))
    for e, f in sorted(res)[:6]: print(f'{e:6.2f}% iod  {f}')
print('--- 3/4'); fit('ref_34_hi.png', (420,40,720,440), 'cam_a_*.png')
print('--- side'); fit('ref_side_hi.png', (470,40,770,440), 'cam_s_*.png')
