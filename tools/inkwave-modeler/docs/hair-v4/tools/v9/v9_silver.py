# 銀白: 額の右上の平たいリボンのアーチ（右横で幅 5cm × 高さ 3cm、正面で幅 2cm）。前の端は内へ小さく巻く。
import bpy, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
RESU=24
for n in ('V7_silver','V9_silver'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
cx,cy,cz=-0.026,-0.083,1.466
CL=[]
for r,w in ((0.027,0.007),(0.018,0.0055)):
  P=[]
  for i,th in enumerate(np.radians(np.linspace(-5,195,15))):
    u=np.array([0.3,0.954,0.0]); P.append(list(np.array([cx,cy,cz])-r*np.cos(th)*u+np.array([0,0,r*np.sin(th)])))
  P=np.array(P); R=np.interp(np.linspace(0,1,len(P)),[0,0.1,0.9,1],[0.004,w,w,0.004])
  CL.append(dict(p=P.tolist(),r=R.tolist()))
m=bpy.data.materials.get('V4_hair_silver'); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.62,0.68,0.70,1)
make('V9_silver',CL,0.35,m,center=(cx,cy+0.0,cz-0.03),flatx=1.0,res=12)
__result__=len(CL)
