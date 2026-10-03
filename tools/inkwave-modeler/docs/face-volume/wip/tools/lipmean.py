# lipmean.py DIR.. : mean Lab of upper lip / lower lip / below-lip / skin beside, front view, vs reference
import sys, numpy as np
from PIL import Image
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
def lab(c):
    c=np.asarray(c,float)/255; l=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=l@M.T/np.array([0.95047,1,1.08883])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116); return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
k=1.6; sheet=np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
R={'upper lip':(228,253,408,414),'lower lip':(226,256,419,425),'under lip':(228,254,426,430),'skin beside':(200,212,415,425),'skin chin':(232,250,433,440)}
def crop(d):
    m=Image.open(f'{d}/front_beauty.png').convert('RGB'); s=m.size[0]/round(370*k); ox,oy=P.VB['front']; X0=ox-185*(k-1); Y0=oy-145*(k-1)
    x0,y0,x1,y1=190,395,290,445
    return np.asarray(m.crop((int((x0-X0)*s),int((y0-Y0)*s),int((x1-X0)*s),int((y1-Y0)*s))).resize((x1-x0,y1-y0),Image.BOX)).astype(float), (x0,y0)
out={}
print('%-12s %-18s'%('region','reference')+''.join('%-22s'%d.split('/')[-1] for d in sys.argv[1:]))
crops=[crop(d) for d in sys.argv[1:]]
for name,(x0,x1,y0,y1) in R.items():
    r=lab(sheet[y0:y1,x0:x1]).reshape(-1,3).mean(0); row='%-12s %-18s'%(name,' '.join('%5.1f'%v for v in r))
    for a,(ox,oy) in crops:
        v=lab(a[y0-oy:y1-oy,x0-ox:x1-ox]).reshape(-1,3).mean(0); d=v-r
        row+='%-22s'%(' '.join('%+5.1f'%x for x in d))
    print(row)
