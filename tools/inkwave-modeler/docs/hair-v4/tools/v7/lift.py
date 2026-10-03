# SAM の中心線（zf 画素）→ 3D。正面カメラの光線 × 外形の表面（少し内側 OFF）。根元は頭皮へつなぐ。
import numpy as np, sys, json
from scipy.ndimage import gaussian_filter, map_coordinates
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import CAMS, ray, rhead, C
a=dict(OFF=0.004,RB=0.035,RH=0.003,WK=1.0)
for kv in sys.argv[1:]: k,v=kv.split('='); a[k]=float(v)
CL=json.load(open(S+'sam/centerlines.json'))
d=np.load(S+'v5/hull_clean.npz'); vol=gaussian_filter(d['vol'].astype(float),1.2); xs,ys,zs=d['xs'],d['ys'],d['zs']; st=xs[1]-xs[0]
def occ(P): return map_coordinates(vol,[(P[:,0]-xs[0])/st,(P[:,1]-ys[0])/st,(P[:,2]-zs[0])/st],order=1,mode='constant',cval=0)
cF=CAMS['front']
def to_cam(x,y): sx=150+x/3.4; sy=140+y/3.4; return (sx-48)*2.0,(sy-100)*2.0
def surf(p,h): q=np.array(p)-C; dd=q/np.linalg.norm(q); return C+dd*(rhead(dd[None])[0]+h)
def hgt(p): q=np.array(p)-C; r=np.linalg.norm(q); return r-rhead((q/r)[None])[0]
out={}
for k,pts in CL.items():
    pts=np.array(pts)
    if k=='E': pts=pts[4:]
    P=[];W=[];zprev=None
    for x,y,w in pts:
        u,v=to_cam(x,y); D=ray(cF,np.array([u]),np.array([v]))[0]
        s=np.linspace(2.5,3.1,1200); Q=cF.t+D*s[:,None]; o=occ(Q)
        qq=Q-C; r=np.linalg.norm(qq,axis=1); head=r<rhead(qq/r[:,None])+0.004
        hh=r-rhead(qq/r[:,None]); hit=(o>0.5)|head|((hh<0.035)&(o>0.2))
        hit&=Q[:,1]<0.015
        if not hit.any(): hit=np.abs(Q[:,1]-0.015)<0.002
        z=-cF.cam(Q[np.argmax(hit)])[2]+a['OFF'] if hit.any() else None
        if zprev is not None and (z is None or abs(z-zprev)>0.012): z=zprev+np.clip((z if z is not None else zprev)-zprev,-0.012,0.012)
        zprev=z; dz=-cF.cam(cF.t+D)[2]; p=cF.t+D*(z/dz)
        P.append(p); W.append(w/3.4*2.0*z/cF.f*a['WK'])
    P=np.array(P); W=np.array(W)
    # 幅: 端の細い測定を除いて、なめらかに（最大の 35% 未満は次の点の値）
    mx=W.max()
    for i in range(len(W)//2):
        if W[i]<0.35*mx: W[i]=max(W[i+1],0.35*mx)
    W=np.convolve(np.pad(W,1,mode='edge'),[0.25,0.5,0.25],mode='valid')
    # 根元: 最初の点の真下の頭皮を RB だけ後ろへ → 頭皮の上 RH
    if k=='E':   # 頭皮に沿わせる
        P=np.array([surf(p,0.012+0.006*np.sin(np.pi*i/(len(P)-1))) for i,p in enumerate(P)])
    r0=surf(P[0]+np.array([0,a['RB'],0.015]),a['RH'])
    h0=hgt(P[0]); steps=[]
    for t in (0.35,0.7):
        m=r0*(1-t)+P[0]*t; steps.append(surf(m,a['RH']+(h0-a['RH'])*t**2.2))
    n=len(W); s=np.linspace(0,1,n); tap=np.clip((1-s)/0.4,0,1)**0.8; W=np.maximum(W,0)*np.where(s>0.6,tap,1)
    Q=np.vstack([r0,steps,P]); R=np.r_[W[2]*0.40,W[2]*0.45,W[2]*0.5,W[:]/2]; R[-1]=0.0008
    out[k]=dict(p=Q.tolist(),r=R.tolist())
    print(k,'root',r0.round(3),'first',P[0].round(3),'tip',P[-1].round(3),'w cm',np.round(W*100,1).tolist())
# E: 頭の左上をおおう束。頭皮に沿って、分け目 → 左のこめかみ（正面の参照の E の範囲）
EP=[(0.025,0.03,1.55),(0.0,-0.005,1.55),(-0.025,-0.03,1.53),(-0.05,-0.045,1.50),(-0.07,-0.045,1.47),(-0.085,-0.035,1.445),(-0.092,-0.02,1.425)]
EH=[0.004,0.012,0.016,0.016,0.014,0.010,0.006]
P=np.array([surf(p,h) for p,h in zip(EP,EH)])
out['E']=dict(p=P.tolist(),r=[0.012,0.018,0.02,0.02,0.018,0.012,0.002])
json.dump(out,open(S+'v7/locks.json','w'))
