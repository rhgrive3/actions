# frontjaw.py DIR.. : front jaw outline (left/right x per row) vs reference, rows 413..449
import sys, numpy as np
from PIL import Image
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
k=1.6; sheet=np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float); x0,y0,x1,y1=140,395,340,465
def outline(a, sc=4):
    r,g,b=a[...,0],a[...,1],a[...,2]; sk=(r-b>45)&(r>130)&(r>g+20); L=[];R=[]
    for row in sk:
        c=len(row)//2; idx=np.nonzero(~row)[0]; lft=idx[idx<c]; rgt=idx[idx>c]
        L.append((lft.max()+1 if len(lft) else 0)/sc+x0); R.append((rgt.min()-1 if len(rgt) else len(row)-1)/sc+x0)
    return np.array(L),np.array(R)
def model(d):
    m=Image.open(f'{d}/front_beauty.png').convert('RGB'); s=m.size[0]/round(370*k); ox,oy=P.VB['front']; X0=ox-185*(k-1); Y0=oy-145*(k-1)
    return np.asarray(m.crop((int((x0-X0)*s),int((y0-Y0)*s),int((x1-X0)*s),int((y1-Y0)*s))).resize(((x1-x0)*4,(y1-y0)*4),Image.BOX)).astype(float)
ref=outline(np.asarray(Image.fromarray(sheet[y0:y1,x0:x1].astype(np.uint8)).resize(((x1-x0)*4,(y1-y0)*4),Image.BICUBIC)).astype(float))
rows=np.arange((422-y0)*4,(447-y0)*4)
for d in sys.argv[1:]:
    L,R=outline(model(d)); dl=L[rows]-ref[0][rows]; dr=R[rows]-ref[1][rows]
    print('%-26s left (char. right) mean %+5.2f max %5.2f | right mean %+5.2f max %5.2f  (+ = model further right)'%(d.split('/')[-1],dl.mean(),np.abs(dl).max(),dr.mean(),np.abs(dr).max()))
