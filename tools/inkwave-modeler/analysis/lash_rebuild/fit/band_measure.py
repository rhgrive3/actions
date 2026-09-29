"""band_measure.py dirA [dirB..] : per view, liner band (lashes removed) top edge and ink area vs the reference, measured on the renders.
Prints mean / rms of (model - ref) top-edge height in camera px (+ = model lower) and ink areas."""
import sys;sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools')
import numpy as np, cv2
from PIL import Image
import eye_seg as E, eye_contours as EC
K=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9))
def band(rgb,thr):
    ink=(rgb.astype(float).mean(2)<thr).astype(np.uint8);L=cv2.morphologyEx(ink,cv2.MORPH_OPEN,K)
    n,lab,st,_=cv2.connectedComponentsWithStats(L);i=1+np.argmax(st[1:,cv2.CC_STAT_AREA]);return (lab==i),ink
for v,s in [('front','R'),('front','L'),('q34L','L'),('q34R','R'),('sideR','R')]:
    x0,y0,x1,y1=[max(int(t),0) for t in EC.window(v,s)];x0=max(x0-60,0);y1=y0+260
    rb,ri=band(E.ref_crop(v)[y0:y1,x0:x1],75)
    out=[]
    for d in sys.argv[1:]:
        m=np.asarray(Image.open(f'{d}/{v}_beauty.png').convert('RGB'))[y0:y1,x0:x1];mb,mi=band(m,45)
        cols=np.nonzero(rb.any(0)&mb.any(0))[0]
        dt=np.array([np.argmax(mb[:,c])-np.argmax(rb[:,c]) for c in cols])/6
        out.append(f'{d.split("/")[-1]}: top {dt.mean():+.2f}/{np.sqrt(np.mean(dt**2)):.2f} area {mi.sum()/36:.0f}')
    print(f'{v:5s} {s} ref area {ri.sum()/36:.0f} |','  '.join(out))
