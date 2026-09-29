"""dispmap.py base.npz new.npz out.png : HEAD_face z-move (head frame, mm) per vertex, front view scatter"""
import sys;sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-volume/tools/inkwave-modeler/analysis/multiview')
import numpy as np, mvcore as M
import matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
A=M.to_local(M.load(sys.argv[1])['HEAD_face']['v'])*1000;B=M.to_local(M.load(sys.argv[2])['HEAD_face']['v'])*1000
d=B-A;m=(A[:,2]>60)&(A[:,1]>-110)&(A[:,1]<20)
fig,ax=plt.subplots(1,2,figsize=(16,8))
for a,k,t in ((ax[0],2,'z move (fwd +)'),(ax[1],0,'x move')):
    s=a.scatter(A[m,0],A[m,1],c=d[m,k],s=3,cmap='RdBu_r',vmin=-5,vmax=5);a.set_aspect('equal');a.set_title(t);plt.colorbar(s,ax=a);a.grid(alpha=.3)
plt.tight_layout();plt.savefig(sys.argv[3],dpi=70)
