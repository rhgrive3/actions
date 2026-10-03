# 正面の 2D の縁 → 3D。正面カメラの光線と、外形（hull）の表面の交点。表面は hull の占有を少しぼかして 0.5 の等値面。
import numpy as np, sys, json
from scipy.ndimage import gaussian_filter, map_coordinates
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); sys.path.insert(0,S+'v5')
from band3 import CAMS, ray, rhead, C
from locks2d import LOCKS, to_sheet
d=np.load(S+'v5/hull_clean.npz'); vol=gaussian_filter(d['vol'].astype(float),1.2); xs,ys,zs=d['xs'],d['ys'],d['zs']; st=xs[1]-xs[0]
def occ(P):
    i=(P[:,0]-xs[0])/st; j=(P[:,1]-ys[0])/st; k=(P[:,2]-zs[0])/st
    return map_coordinates(vol,[i,j,k],order=1,mode='constant',cval=0)
cF=CAMS['front']
def lift(sx,sy,off=0.0):
    u=np.array([(sx-48)*2.0]); v=np.array([(sy-100)*2.0]); D=ray(cF,u,v)[0]
    s=np.linspace(2.5,3.1,1200); P=cF.t+D*s[:,None]; o=occ(P)
    q=P-C; r=np.linalg.norm(q,axis=1); head=r<rhead(q/r[:,None])+0.004
    hit=(o>0.5)|head; k=np.argmax(hit) if hit.any() else len(s)-1
    return (P[k]-D*off), bool(hit.any()), bool(head[k] and not o[k]>0.5)
LAYER={'A':0.005,'D':0.004,'B':0.003,'C':0.002,'F':0.002,'E':0.002}
out={}
for k,(e1,e2) in LOCKS.items():
    n=max(len(e1),len(e2)); t=np.linspace(0,1,12)
    def rs(e):
        e=np.array(e,float); dd=np.r_[0,np.cumsum(np.linalg.norm(np.diff(e,axis=0),axis=1))]; return np.stack([np.interp(t*dd[-1],dd,e[:,i]) for i in range(2)],1)
    a=rs(e1); b=rs(e2); m=(a+b)/2
    P=[];W=[];flags=[]; zprev=None
    for i in range(len(t)):
        sa=np.array(to_sheet(a[i])); sb=np.array(to_sheet(b[i])); sm=to_sheet(m[i])
        pm,h1,onhead=lift(*sm,LAYER[k])
        z=-cF.cam(pm)[2]
        if zprev is not None and (not h1 or abs(z-zprev)>0.012):
            z=zprev+np.clip(z-zprev,-0.012,0.012) if h1 else zprev
            D=ray(cF,np.array([(sm[0]-48)*2.0]),np.array([(sm[1]-100)*2.0]))[0]; dz=-cF.cam(cF.t+D)[2]; pm=cF.t+D*(z/dz)
        zprev=z
        wpx=np.linalg.norm(sa-sb)*2.0; W.append(float(wpx*z/cF.f))
        P.append(pm.tolist()); flags.append(onhead)
    out[k]=dict(p=P,w=W,onhead=flags)
    print(k,'z',round(P[0][2],3),'->',round(P[-1][2],3),'y',round(P[0][1],3),'->',round(P[-1][1],3),'w max',round(max(W),3),'onhead',sum(flags))
json.dump(out,open(S+'v5/locks3d.json','w'))
