# 銀白の巻き毛: キャラの右のこめかみの生え際から上へ → 前へ回って下り → 小さく巻き込む（右横と正面の参照から）
import bpy, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
for n in ('V4_silver','V7_silver'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
# 生え際 → 上へ → 前へ（右横の弧）
P=[np.array([-0.075,-0.02,1.452]),np.array([-0.066,-0.045,1.46]),np.array([-0.056,-0.065,1.47]),np.array([-0.047,-0.078,1.478])]
# 先: 正面を向く小さな輪（XZ 面）。中心 c、半径 r、上から画面の左回りに 1.6 周
c=np.array([-0.038,-0.082,1.478])
for i,th in enumerate(np.linspace(np.pi/2+0.5,np.pi/2+0.5+2*np.pi*0.85,12)):
    r=0.0105*(1-0.25*i/11)
    u=np.array([0.72,-0.69,0.0]); P.append(c+u*r*np.cos(th)+np.array([0,0,1.0])*r*np.sin(th)+np.array([0,-0.002*i/11,0]))
R=[0.004,0.006,0.007,0.007]+list(np.interp(np.linspace(0,1,12),[0,0.6,1],[0.0065,0.006,0.002]))
m=bpy.data.materials.get('V4_hair_silver')
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.55,0.62,0.66,1)
make('V7_silver',[dict(p=[list(map(float,p)) for p in P],r=[float(x) for x in R])],0.8,m,flatx=1.0,res=12)
__result__=len(P)
