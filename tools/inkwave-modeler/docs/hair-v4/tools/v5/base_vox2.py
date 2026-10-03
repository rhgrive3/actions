# 土台 = (外形 ∪ 頭の中を 4mm 縮めたもの) ∩ 範囲。範囲: y<YC, z>ZC, 前（y<YF）は z>ZF だけ。一番大きいかたまり。
import numpy as np, sys
from scipy.ndimage import label, binary_fill_holes, binary_opening
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
a=dict(ZF=1.465,YF=-0.045,YC=0.045,ZC=1.43,SH=0.004)
for kv in sys.argv[1:]: k,v=kv.split('='); a[k]=float(v)
d=np.load(S+'v5/hull_clean.npz'); hull=d['vol']; xs,ys,zs=d['xs'],d['ys'],d['zs']
X,Y,Z=np.meshgrid(xs,ys,zs,indexing='ij'); P=np.stack([X,Y,Z],-1)
q=P-C; r=np.linalg.norm(q,axis=-1); h=r-rhead((q/np.maximum(r[...,None],1e-9)).reshape(-1,3)).reshape(r.shape)
inside=h<-a['SH']
reg=(Y<a['YC'])&(Z>a['ZC'])&((Y>a['YF'])|(Z>a['ZF']))
m=(hull|inside)&reg
m=binary_opening(m,iterations=1)
lab,n=label(m); sz=np.bincount(lab.ravel()); sz[0]=0; m=lab==np.argmax(sz)
for k in range(m.shape[2]): m[:,:,k]=binary_fill_holes(m[:,:,k])
np.savez(S+'v5/base_vox.npz',vol=m,xs=xs,ys=ys,zs=zs); print('base',m.sum())
