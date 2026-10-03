# skinmap.py DIR.. : mean Lab per face region (front, q34R, sideR) vs reference
import sys, numpy as np
from PIL import Image
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
def lab(c):
    c=np.asarray(c,float)/255; l=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=l@M.T/np.array([0.95047,1,1.08883])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116); return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
k=1.6; sheet=np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
R={'front':{'forehead':(222,258,305,318),'cheek R':(170,195,380,398),'cheek L':(282,305,380,398),'nose':(232,248,370,388),'upper lip skin':(222,258,400,407),'chin':(225,255,432,442),'jaw R':(178,195,415,428),'jaw L':(285,300,415,428),'neck':(215,260,452,458)},
   'q34R':{'cheek':(1530,1560,385,405),'jaw':(1520,1560,415,430),'chin':(1595,1615,432,442),'neck':(1500,1530,440,450),'upper lip skin':(1605,1620,400,407)},
   'sideR':{'cheek':(2010,2040,385,405),'jaw':(2000,2040,415,430),'chin':(2050,2070,435,445),'neck':(1960,1990,440,452),'upper lip skin':(2075,2088,398,406)}}
crops={}
for d in sys.argv[1:]:
    for v in R:
        m=Image.open(f'{d}/{v}_beauty.png').convert('RGB'); s=m.size[0]/round(370*k); ox,oy=P.VB[v]; X0=ox-185*(k-1); Y0=oy-145*(k-1)
        crops[(d,v)]=(m,s,X0,Y0)
def mcrop(d,v,x0,x1,y0,y1):
    m,s,X0,Y0=crops[(d,v)]
    return np.asarray(m.crop((int((x0-X0)*s),int((y0-Y0)*s),int((x1-X0)*s),int((y1-Y0)*s))).resize((x1-x0,y1-y0),Image.BOX)).astype(float)
print('%-22s %-17s'%('view region','reference')+''.join('%-20s'%d.split('/')[-1] for d in sys.argv[1:]))
for v,regs in R.items():
    for name,(x0,x1,y0,y1) in regs.items():
        r=lab(sheet[y0:y1,x0:x1]).reshape(-1,3).mean(0); row='%-22s %-17s'%(v+' '+name,' '.join('%5.1f'%x for x in r))
        for d in sys.argv[1:]:
            dd=lab(mcrop(d,v,x0,x1,y0,y1)).reshape(-1,3).mean(0)-r; row+='%-20s'%(' '.join('%+5.1f'%x for x in dd))
        print(row)
