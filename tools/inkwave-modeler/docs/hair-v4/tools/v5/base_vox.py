# 土台のボクセル: hull ∩ 頭皮から HMAX 以内 ∩ (z>ZF or y>YF) ∩ y<YC ∩ z>ZC → 一番大きいかたまり
import numpy as np, sys
from scipy.ndimage import label
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
a=dict(HMAX=0.035,ZF=1.47,YF=-0.02,YC=0.03,ZC=1.40)
for kv in sys.argv[1:]: k,v=kv.split('='); a[k]=float(v)
d=np.load(S+'v5/hull_fine.npz'); vol=d['vol'].copy(); xs,ys,zs=d['xs'],d['ys'],d['zs']
X,Y,Z=np.meshgrid(xs,ys,zs,indexing='ij'); P=np.stack([X,Y,Z],-1)
q=P-C; r=np.linalg.norm(q,axis=-1); h=r-rhead((q/np.maximum(r[...,None],1e-9)).reshape(-1,3)).reshape(r.shape)
m=vol&(h<a['HMAX'])&((Z>a['ZF'])|(Y>a['YF']))&(Y<a['YC'])&(Z>a['ZC'])
lab,n=label(m); sz=np.bincount(lab.ravel()); sz[0]=0; m=lab==np.argmax(sz)
np.savez(S+'v5/base_vox.npz',vol=m,xs=xs,ys=ys,zs=zs); print('base voxels',m.sum(),'components',n)
