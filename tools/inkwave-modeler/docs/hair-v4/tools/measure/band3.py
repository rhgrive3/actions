# 右のバンド: sideR の黒バンドの中心線（行ごとの中点）を光線に戻し、頭の表面 + h の面と交わる点を取る。
# h は front と q34R の黒マスクに合うように選ぶ。
import numpy as np, cv2, sys
from scipy.ndimage import map_coordinates, distance_transform_edt
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from cam import CAMS
A=S+'an/'
RAD=np.load(A+'head_radial.npy'); RAD=np.where(np.isnan(RAD),np.nanmean(RAD),RAD)
C=np.array([0.004,0.02,1.39])
def rhead(D):
    th=np.degrees(np.arccos(np.clip(D[...,2],-1,1))); ph=np.degrees(np.arctan2(D[...,1],D[...,0]))+180
    return map_coordinates(RAD,[th.ravel(),ph.ravel()],order=1,mode='nearest').reshape(th.shape)
def ray(c,u,v):
    m=c.m; f=c.f; d=c.d
    dc=np.stack([(u-c.rx/2+d['sx']*m)/f,(c.ry/2+d['sy']*m-v)/f,-np.ones_like(u)],-1)
    w=dc@c.R.T; return w/np.linalg.norm(w,axis=-1,keepdims=True)
def hit(c,u,v,h):
    D=ray(c,u,v); s=np.linspace(2.5,3.2,1400)
    P=c.t+D[:,None,:]*s[None,:,None]
    Q=P-C; r=np.linalg.norm(Q,axis=-1); dirs=Q/r[...,None]
    inside=r<rhead(dirs)+h
    first=np.argmax(inside,axis=1); ok=inside.any(1)
    return P[np.arange(len(u)),first],ok
def mask(v):
    m=np.load(A+f'band_{v}.npy').astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m); k=np.zeros_like(m)
    for i in range(1,n):
        if st[i,4]>150: k[lab==i]=1
    return k.astype(bool)
def centerline(v, x_range=None):
    m=mask(v); pts=[]
    for y in range(m.shape[0]):
        xs=np.nonzero(m[y])[0]
        if x_range is not None: xs=xs[(xs>=x_range[0])&(xs<x_range[1])]
        if len(xs)>=6: pts.append((xs.mean(),y,xs.max()-xs.min()+1))
    return np.array(pts)
if __name__=='__main__':
    cR=CAMS['sideR']; cl=centerline('sideR')
    print('sideR rows',len(cl),'y',cl[:,1].min(),cl[:,1].max(),'median width px',np.median(cl[:,2]))
    for h in [0.0,0.004,0.008,0.012,0.016,0.02,0.025,0.03]:
        P,ok=hit(cR,cl[:,0],cl[:,1],h); P=P[ok]
        sc=[]
        for v in ['front','q34R']:
            c=CAMS[v]; uv=c.proj(P); dt=distance_transform_edt(~mask(v))
            ui=np.clip(uv[:,0].astype(int),0,c.rx-1); vi=np.clip(uv[:,1].astype(int),0,c.ry-1)
            HD=np.load(A+f'hdepth_{v}.npy'); z=-c.cam(P)[:,2]; vis=z<HD[vi,ui]+0.002
            sc.append((round(float(np.median(dt[vi,ui][vis])),1), int(vis.sum())))
        print(h, ok.sum(), sc, 'x', P[:,0].min().round(3), P[:,0].max().round(3))
