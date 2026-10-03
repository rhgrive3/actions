# skinwide.py DIR.. : skin-only Lab statistics over the face per view (front/q34R/sideR) vs reference
import sys, numpy as np
from PIL import Image
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
def lab(c):
    c=np.asarray(c,float)/255; l=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=l@M.T/np.array([0.95047,1,1.08883])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116); return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
k=1.6; sheet=np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
B={'front':(160,330,320,450),'q34R':(1490,330,1630,450),'sideR':(1990,330,2090,450)}
bands={'upper':(330,385),'mid':(385,415),'low':(415,450)}
def skin(L): return (L[...,0]>40)&(L[...,0]<85)&(L[...,1]>8)&(L[...,1]<35)&(L[...,2]>18)&(L[...,2]<42)
print('%-14s %-17s'%('view band','reference')+''.join('%-20s'%d.split('/')[-1] for d in sys.argv[1:]))
for v,(x0,y0,x1,y1) in B.items():
    ms=[]
    for d in sys.argv[1:]:
        m=Image.open(f'{d}/{v}_beauty.png').convert('RGB'); s=m.size[0]/round(370*k); ox,oy=P.VB[v]; X0=ox-185*(k-1); Y0=oy-145*(k-1)
        ms.append(lab(np.asarray(m.crop((int((x0-X0)*s),int((y0-Y0)*s),int((x1-X0)*s),int((y1-Y0)*s))).resize((x1-x0,y1-y0),Image.BOX)).astype(float)))
    R=lab(sheet[y0:y1,x0:x1])
    for b,(a,c) in bands.items():
        rr=R[a-y0:c-y0]; rs=skin(rr); r=np.median(rr[rs],0); row='%-14s %-17s'%(v+' '+b,' '.join('%5.1f'%x for x in r))
        for M_ in ms:
            mm=M_[a-y0:c-y0]; sk=skin(mm)&rs; row+='%-20s'%(' '.join('%+5.1f'%x for x in np.median(mm[sk],0)-r))
        print(row)
