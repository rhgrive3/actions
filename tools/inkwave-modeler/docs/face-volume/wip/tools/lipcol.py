# lipcol.py DIR [DIR..] : front mouth columns x=228,240,254, rows 404..428, Lab vs reference
import sys, numpy as np
from PIL import Image
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
def lab(c):
    c=np.asarray(c,float)/255; l=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=l@M.T/np.array([0.95047,1,1.08883])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116); return np.array([116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])])
sheet=np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float); k=1.6
ims=[]
for d in sys.argv[1:]:
    m=np.asarray(Image.open(f'{d}/front_beauty.png').convert('RGB')).astype(float); s=m.shape[1]/round(370*k); ox,oy=P.VB['front']; X0=ox-185*(k-1); Y0=oy-145*(k-1)
    ims.append(lambda x,y,m=m,s=s,X0=X0,Y0=Y0: m[int((y-Y0)*s):int((y+1-Y0)*s), int((x-X0)*s):int((x+1-X0)*s)].reshape(-1,3).mean(0))
tot=np.zeros(len(ims))
for x in (228,240,254):
    print('x',x,'  ref L a b | '+' | '.join(sys.argv[1:]))
    for y in range(406,429,2):
        r=lab(sheet[y,x]); row=['%5.1f %5.1f %5.1f'%tuple(r)]
        for i,f in enumerate(ims):
            v=lab(f(x,y)); tot[i]+=np.linalg.norm(v-r); row.append('%5.1f %5.1f %5.1f'%tuple(v))
        print('  ',y,' | '.join(row))
print('sum dE', np.round(tot,1))
