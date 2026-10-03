# 前髪・頭頂の束: 正面シート（シート画素）の中心線 × 各点の前後位置 y → 3D（光線と y 平面の交点）。
# 頭に近すぎる点は頭の表面 + HMIN まで外へ押す。結果は bangs.json。
import numpy as np, sys, json
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import CAMS, ray, rhead, C
cF=CAMS['front']; HMIN=0.014
def pt(x,y,yw):
    d=ray(cF,np.array([(x-48)*2.0]),np.array([(y-100)*2.0]))[0]; t=(yw-cF.t[1])/d[1]; p=cF.t+d*t
    q=p-C; r=np.linalg.norm(q); rh=rhead((q/r)[None])[0]
    if r<rh+HMIN: p=C+q/r*(rh+HMIN)
    return p
C2S=lambda x,y:(48+(x+200)/2.0,100+(y+120)/2.0)      # 拡大図（front_big の左）の座標 → シート画素
def cp(pts): return [C2S(x,y) for x,y in pts]
BANGS=[
 # 区画2: 参照の正面の拡大図から読んだ弓なりの束。つむじ（画面の中央より少し左）から扇形に右へ。
 ('L1',cp([(150,150),(170,112),(215,86),(280,90),(350,120),(420,160),(468,200),(492,236)]),[0.01,0.005,-0.01,-0.03,-0.045,-0.055,-0.06,-0.06],[0.018,0.026,0.030,0.032,0.032,0.028,0.020,0.005]),
 ('L2',cp([(175,146),(230,132),(300,152),(360,192),(408,250),(436,318)]),[0.0,-0.02,-0.06,-0.085,-0.098,-0.10],[0.020,0.034,0.040,0.040,0.030,0.006]),
 ('L3',cp([(180,160),(240,172),(290,212),(328,262),(348,330)]),[-0.01,-0.05,-0.095,-0.118,-0.124],[0.020,0.036,0.040,0.034,0.006]),
 ('L34',cp([(186,168),(246,220),(278,280),(276,344)]),[-0.02,-0.09,-0.12,-0.128],[0.020,0.034,0.030,0.006]),
 ('L4',cp([(165,166),(198,202),(214,252),(210,302),(192,352)]),[-0.02,-0.08,-0.115,-0.127,-0.13],[0.018,0.030,0.034,0.028,0.006]),
]
out={}
for name,pts,ys,r in BANGS:
    Q=[pt(x,y,yw).tolist() for (x,y),yw in zip(pts,ys)]
    out[name]=dict(p=Q,r=r); print(name,np.round(np.array(Q),3).tolist())
# 太さを 1.5 倍（根元と先は細いまま）

# すき間埋め: となりの束の中間を、少し後ろ（頭側）に
def res(P,n=8):
    P=np.array(P); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]; t=np.linspace(0,d[-1],n)
    return np.stack([np.interp(t,d,P[:,i]) for i in range(3)],1)
def resr(R,n=8): return np.interp(np.linspace(0,1,n),np.linspace(0,1,len(R)),R)
keys=[]
for a,b in zip(keys,keys[1:]):
    P=(res(out[a]['p'])+res(out[b]['p']))/2; P[:,1]+=0.007
    R=(resr(out[a]['r'])+resr(out[b]['r']))/2*0.95
    out[a+b]=dict(p=P.tolist(),r=R.tolist())
# 区画4: 先端。L2〜L4 の最後の点を少し前へ・上へ（下向きのカギ爪をやめる）、先を丸く太めに。
for k in ('L2','L3','L34','L4'):
    P=np.array(out[k]['p']); P[-1,1]-=0.012; P[-1,2]+=0.006; out[k]['p']=P.tolist()
    r=list(out[k]['r']); r[-1]=0.011; out[k]['r']=r
json.dump(out,open(S+'v4/bangs.json','w'))
