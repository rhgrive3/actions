"""sec_cmp.py base.npz new.npz out.png : before (dashed grey) vs after (colour) cross-sections of HEAD_face (head frame, mm)"""
import sys;sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-volume/tools/inkwave-modeler/analysis/multiview')
import numpy as np
import matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
import mvcore as M
def load(p):
    g=M.load(p);return M.to_local(g['HEAD_face']['v'])*1000,g['HEAD_face']['f']
def section(V,F,axis,c):
    T=V[F];s=T[:,:,axis]-c;out=[]
    for tri,ss in zip(T,s):
        if (ss>0).all() or (ss<0).all(): continue
        pts=[tri[i]+(tri[j]-tri[i])*ss[i]/(ss[i]-ss[j]) for i,j in((0,1),(1,2),(2,0)) if (ss[i]>0)!=(ss[j]>0)]
        if len(pts)==2: out.append(pts)
    return np.array(out)
A=load(sys.argv[1]);B=load(sys.argv[2])
fig,ax=plt.subplots(1,3,figsize=(21,8))
for y,c in zip([-12,-20,-28],['tab:blue','tab:orange','tab:green']):
    for (V,F),st in ((A,dict(color='grey',ls='--',lw=1)),(B,dict(color=c,lw=1.4))):
        for s in section(V,F,1,y): ax[0].plot(s[:,0],s[:,2],**st)
    ax[0].plot([],[],color=c,label=f'y={y}')
ax[0].set_title('bridge between the eyes (top view)');ax[0].set_xlim(-35,35);ax[0].set_ylim(80,106)
for y,c in zip([-50,-60,-70,-80],['tab:blue','tab:orange','tab:green','tab:red']):
    for (V,F),st in ((A,dict(color='grey',ls='--',lw=1)),(B,dict(color=c,lw=1.4))):
        for s in section(V,F,1,y): ax[1].plot(s[:,0],s[:,2],**st)
    ax[1].plot([],[],color=c,label=f'y={y}')
ax[1].set_title('mouth / cheeks (top view)');ax[1].set_xlim(-75,75);ax[1].set_ylim(40,120)
for x,c in zip([30,38,46],['tab:blue','tab:orange','tab:green']):
    for (V,F),st in ((A,dict(color='grey',ls='--',lw=1)),(B,dict(color=c,lw=1.4))):
        for s in section(V,F,0,x+0.01): ax[2].plot(s[:,2],s[:,1],**st)
    ax[2].plot([],[],color=c,label=f'x={x}')
ax[2].set_title('eye -> cheek (side view, front = right)');ax[2].set_xlim(60,110);ax[2].set_ylim(-80,0)
for a in ax: a.set_aspect('equal');a.grid(alpha=.3);a.legend(loc='lower left')
plt.tight_layout();plt.savefig(sys.argv[3],dpi=80)
