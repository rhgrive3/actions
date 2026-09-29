"""sections.py geom.npz out_prefix : HEAD_face cross-sections in the head frame (mm).
 horizontal (y = const): x-z curves (top view);  sagittal / parasagittal (x = const): z-y curves (side view)."""
import sys;sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-volume/tools/inkwave-modeler/analysis/multiview')
import numpy as np, json
import matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
import mvcore as M
g=M.load(sys.argv[1]);out=sys.argv[2]
V=M.to_local(g['HEAD_face']['v'])*1000;F=g['HEAD_face']['f']
def section(axis,c):
    a=V[F][:,:,axis]-c;segs=[]
    for tri,s in zip(V[F],a):
        pts=[]
        for i,j in((0,1),(1,2),(2,0)):
            if (s[i]>0)!=(s[j]>0):
                t=s[i]/(s[i]-s[j]);pts.append(tri[i]+(tri[j]-tri[i])*t)
        if len(pts)==2: segs.append(pts)
    return np.array(segs)
json_out={}
# landmarks: find y of mouth corner/eye by simple heights
fig,ax=plt.subplots(1,2,figsize=(16,8))
levels=[-10,-25,-35,-45,-55,-65,-75]
cols=plt.cm.viridis(np.linspace(0,1,len(levels)))
for y,c in zip(levels,cols):
    S=section(1,y)
    if len(S)==0: continue
    for s in S: ax[0].plot(s[:,0],s[:,2],color=c,lw=1)
    ax[0].plot([],[],color=c,label=f'y={y}')
    m=np.abs(S[:,:,0]).mean(1)<60; zz=S[m][:,:,2]; json_out[f'h{y}']={'z_front_max':float(zz.max())}
ax[0].set_aspect('equal');ax[0].legend();ax[0].set_title('horizontal sections (top view), x vs z (mm), front = up');ax[0].set_xlim(-80,80);ax[0].set_ylim(0,110);ax[0].grid(alpha=.3)
xs=[0,10,20,30,40,50]
cols=plt.cm.plasma(np.linspace(0,.9,len(xs)))
for x,c in zip(xs,cols):
    S=section(0,x+0.01)
    for s in S: ax[1].plot(s[:,2],s[:,1],color=c,lw=1)
    ax[1].plot([],[],color=c,label=f'x={x}')
ax[1].set_aspect('equal');ax[1].legend();ax[1].set_title('vertical sections (side view), z vs y (mm), front = right');ax[1].set_xlim(0,110);ax[1].set_ylim(-100,40);ax[1].grid(alpha=.3)
plt.tight_layout();plt.savefig(out+'_sections.png',dpi=90)
# per level: forward depth of the face at x = 0,10,...,60 (max z of the section near that x)
for y in levels:
    S=section(1,y);pts=S.reshape(-1,3);row=[]
    for x in range(0,65,10):
        sel=pts[np.abs(np.abs(pts[:,0])-x)<1.5]
        row.append(round(float(sel[:,2].max()),1) if len(sel) else None)
    print('y',y,'z at |x|=0..60 step 10:',row)
