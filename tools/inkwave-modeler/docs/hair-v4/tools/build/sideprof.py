# 区画1: 横から見た前髪の前の輪郭。参照（sideL/sideR の髪マスク）と候補（V4_bangs+V4_crown の頂点）を y(z) で比べる。
import numpy as np, sys, json
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import CAMS, ray
hair=np.load(S+'an/sheet_hair.npy')
BOX={'sideL':(850,100),'sideR':(1790,100)}; PAN={'sideL':(880,1292),'sideR':(1716,2172)}
def ref_profile(v,xplane):
    c=CAMS[v]; x0,y0=BOX[v]; out=[]
    for sy in range(140,330,4):
        row=hair[sy,PAN[v][0]:PAN[v][1]]; xs=np.nonzero(row)[0]
        if len(xs)==0: continue
        sx=PAN[v][0]+(xs.min() if v=='sideL' else xs.max())        # 顔側（前）の端
        d=ray(c,np.array([(sx-x0)*2.0]),np.array([(sy-y0)*2.0]))[0]; t=(xplane-c.t[0])/d[0]; p=c.t+d*t
        out.append((round(float(p[2]),3),round(float(p[1]),3)))
    return out
R={'sideL':ref_profile('sideL',0.04),'sideR':ref_profile('sideR',-0.03)}
json.dump(R,open(S+'v4/ref_front_profile.json','w'))
for v in R:
    print(v,' '.join(f'{z:.2f}:{y:+.3f}' for z,y in R[v][::2]))
