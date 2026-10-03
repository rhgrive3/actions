# E: 分け目から前へ出て、銀白のアーチを包むように前へ巻く束（右横で同心の弧、正面で巻きの端）
import bpy, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
RESU=24
for n in ('V7_bangs_teal','V9_E'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
cx,cy,cz=-0.026,-0.083,1.466
P=[[0.02,0.03,1.515],[0.006,-0.015,1.524]]
for th,r in zip(np.radians([150,125,100,75,50,30,15]),[0.040,0.041,0.041,0.040,0.038,0.035,0.031]):
    u=np.array([0.3,0.954,0.0]); P.append(list(np.array([cx,cy,cz])-r*np.cos(th)*u+np.array([0,0,r*np.sin(th)])))
P=np.array(P)
R=[0.016,0.022,0.025,0.026,0.026,0.025,0.022,0.016,0.006]
m=bpy.data.materials['V4_hair_crown']
CLS=[dict(p=P.tolist(),r=R)]
# 巻きの内側の層（青緑）: 銀白の 2 本の間と中心
u=np.array([0.3,0.954,0.0])
for r,w in ((0.0225,0.0065),(0.011,0.006)):
    Q=[list(np.array([cx,cy,cz])-r*np.cos(th)*u+np.array([0,0,r*np.sin(th)])) for th in np.radians(np.linspace(-5,195,13))]
    CLS.append(dict(p=Q,r=list(np.interp(np.linspace(0,1,13),[0,0.1,0.9,1],[0.003,w,w,0.003]))))
make('V9_E',CLS,0.4,m,center=(cx,cy+0.01,cz-0.02),flatx=1.0,res=16)
__result__=P.round(3).tolist()
