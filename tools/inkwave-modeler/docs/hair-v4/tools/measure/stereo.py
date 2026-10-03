# 横のビューの帯中心線の光線上で、もう一つのビューの帯マスクに一番近い点を取る（ステレオ）。
import numpy as np, sys
from scipy.ndimage import distance_transform_edt
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import *
def stereo(side, other, xsign):
    cs=CAMS[side]; cl=centerline(side)
    co=CAMS[other]; dt=distance_transform_edt(~mask(other)); HD=np.load(A+f'hdepth_{other}.npy')
    D=ray(cs,cl[:,0],cl[:,1]); s=np.linspace(2.6,3.1,1000)
    out=[]
    for i in range(len(cl)):
        P=cs.t+D[i]*s[:,None]
        R=P-C; r=np.linalg.norm(R,axis=1); outside=r>rhead(R/r[:,None])+0.003
        good=outside&(np.sign(P[:,0]-0.004)==xsign)
        if not good.any(): continue
        uv=co.proj(P); ui=np.clip(uv[:,0].astype(int),0,co.rx-1); vi=np.clip(uv[:,1].astype(int),0,co.ry-1)
        vis=(-co.cam(P)[:,2])<HD[vi,ui]+0.002
        cost=np.where(good&vis,dt[vi,ui],1e9)
        z0=np.nonzero(cost<=1.0)[0]
        if len(z0): out.append(P[z0].mean(0))
    return np.array(out)
if __name__=='__main__':
    for side,other,xs in [('sideR','front',-1),('sideR','q34R',-1),('sideL','q34L',1),('sideL','front',1)]:
        P=stereo(side,other,xs)
        if len(P)==0: print(side,other,'none'); continue
        np.save(A+f'st_{side}_{other}.npy',P)
        Rm=P-C; rm=np.linalg.norm(Rm,axis=1); h=rm-rhead(Rm/rm[:,None])
        print(side,other,len(P))
        for zc in np.arange(1.38,1.58,0.02):
            m=np.abs(P[:,2]-zc)<0.01
            if m.sum(): print('   z',round(zc,2),int(m.sum()),'x',np.median(P[m,0]).round(3),'y',np.median(P[m,1]).round(3),'h',np.median(h[m]).round(3))
