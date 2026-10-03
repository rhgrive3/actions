import numpy as np, sys, json
from scipy.ndimage import gaussian_filter, map_coordinates
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); sys.path.insert(0,S+'v5')
from band3 import CAMS, ray, rhead, C
from locks_side import SIDE
BOX={'front':(48,100),'q34L':(400,100),'sideL':(850,100),'q34R':(1350,100),'sideR':(1790,100)}
d=np.load(S+'v5/base_vox.npz'); vol=gaussian_filter(d['vol'].astype(float),1.2); xs,ys,zs=d['xs'],d['ys'],d['zs']; st=xs[1]-xs[0]
def occ(P): return map_coordinates(vol,[(P[:,0]-xs[0])/st,(P[:,1]-ys[0])/st,(P[:,2]-zs[0])/st],order=1,mode='constant',cval=0)
OFF=0.004
out={}
for view,x0,y0,k,locks in SIDE:
    c=CAMS[view]; bx,by=BOX[view]
    def lift(sx,sy):
        u=np.array([(sx-bx)*2.0]); v=np.array([(sy-by)*2.0]); D=ray(c,u,v)[0]
        s=np.linspace(2.5,3.2,1400); P=c.t+D*s[:,None]; o=occ(P)
        q=P-C; r=np.linalg.norm(q,axis=1); head=r<rhead(q/r[:,None])+0.004
        hit=(o>0.5)|head; kk=np.argmax(hit) if hit.any() else None
        return (P[kk]-D*OFF if kk is not None else None), D
    for name,(e1,e2,mat) in locks.items():
        t=np.linspace(0,1,12)
        def rs(e):
            e=np.array(e,float); dd=np.r_[0,np.cumsum(np.linalg.norm(np.diff(e,axis=0),axis=1))]; return np.stack([np.interp(t*dd[-1],dd,e[:,i]) for i in range(2)],1)
        a=rs(e1); b=rs(e2); m=(a+b)/2
        P=[];W=[];zprev=None
        for i in range(len(t)):
            sm=(x0+m[i,0]/k, y0+m[i,1]/k); p,D=lift(*sm)
            z=-c.cam(p)[2] if p is not None else None
            if zprev is not None and (z is None or abs(z-zprev)>0.012):
                z=zprev+np.clip(z-zprev,-0.012,0.012) if z is not None else zprev
                dz=-c.cam(c.t+D)[2]; p=c.t+D*(z/dz)
            zprev=z
            wpx=np.linalg.norm(a[i]-b[i])/k*2.0; W.append(float(wpx*z/c.f)); P.append(p.tolist())
        out[name]=dict(p=P,w=W,mat=mat)
        print(name,view,'z',round(P[0][2],3),'->',round(P[-1][2],3),'x',round(P[0][0],3),'->',round(P[-1][0],3),'y',round(P[0][1],3),'->',round(P[-1][1],3),'w max',round(max(W)*100,1))
json.dump(out,open(S+'v5/locks_side3d.json','w'))
