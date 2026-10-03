# 全身参照に世界座標（m）の目盛りを描く。front/back: 横=X, left: 横=Y。縦=Z。
import numpy as np, sys
from PIL import Image, ImageDraw
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad'); from hicam import PX
F={'front':'ref_front_hi','back':'ref_back_hi','left':'ref_side_hi'}
v=sys.argv[1]; x0,x1,z0,z1=map(float,sys.argv[2:6]); out=sys.argv[6]; sc=float(sys.argv[7]) if len(sys.argv)>7 else 2
im=Image.open(f'/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/analysis/{F[v]}.png').convert('RGB')
cx,gy,s=PX[v]
def U(a): return cx+a*s if v=='front' else cx-a*s
def Vv(z): return gy-z*s
ua,ub=sorted([U(x0),U(x1)]); c=im.crop((int(ua),int(Vv(z1)),int(ub),int(Vv(z0)))); c=c.resize((int(c.width*sc),int(c.height*sc)),Image.LANCZOS)
d=ImageDraw.Draw(c)
for a in np.arange(np.ceil(min(x0,x1)*50)/50, max(x0,x1)+1e-9, 0.02):
    px=(U(a)-ua)*sc; d.line([(px,0),(px,c.height)],fill=(255,255,255) if abs(a*100)%10>0.5 else (255,60,60),width=1); d.text((px+2,2),f'{a:+.2f}',fill=(255,0,0))
for z in np.arange(np.ceil(z0*50)/50, z1+1e-9, 0.02):
    py=(Vv(z)-Vv(z1))*sc; d.line([(0,py),(c.width,py)],fill=(255,255,255) if abs(z*100)%10>0.5 else (255,60,60),width=1); d.text((2,py+1),f'{z:.2f}',fill=(255,0,0))
c.save(out); print(c.size)
