# 頭の上の束の道すじ（頭の表面 + h に沿う）。根元 → カフの前の口（または尻尾の根元）。結果は head_clumps.json
import numpy as np, sys, json
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
CF=json.load(open(S+'v4/cuff.json'))
def surf(p,h):
    q=np.array(p,float)-C; d=q/np.linalg.norm(q); return C+d*(rhead(d[None])[0]+h)
def cuffpt(side,f,back):
    o=np.array(CF[side]['outer']); i=np.array(CF[side]['inner']); B=np.array(CF[side]['B'])
    k=int(round(f*(len(o)-1))); return (o[k]+i[k])/2+B[k]*back
def path(root,end,hs,n=7):
    a=np.array(root)-C; b=np.array(end)-C; out=[]
    for k,t in enumerate(np.linspace(0,1,n)):
        d=a*(1-t)+b*t; d/=np.linalg.norm(d); h=np.interp(t,np.linspace(0,1,len(hs)),hs)
        out.append((C+d*(rhead(d[None])[0]+h)).tolist())
    out[-1]=list(map(float,end)); return out
def taper(n,rmax,r0=0.5,r1=0.6):
    s=np.linspace(0,1,n); return list(np.maximum(rmax*np.minimum(1,r0+s*2)*np.minimum(1,(1-s)/0.25+r1),0.004))
OUT={'crown':[],'side':[],'silver':[],'back':[]}
for side,sg in (('L',1),('R',-1)):
    X=lambda x: 0.004+sg*(x-0.004)
    # 頭頂 → カフ（上ほど高く盛る）
    for (x,y),f in zip([(0.008,-0.005),(0.02,0.015),(0.03,0.035),(0.04,0.06)],[0.95,0.8,0.64,0.48]):
        root=surf((X(x),y,1.52),0.004); end=cuffpt(side,f,-0.010)
        OUT['crown'].append(dict(p=path(root,end,[0.004,0.016,0.022,0.020,0.012]),r=[0.030,0.042,0.046,0.046,0.040,0.030,0.022]))
    # こめかみ → カフ（なでつけた薄い束）
    for (x,y,z),f in zip([(0.08,-0.05,1.452),(0.086,-0.02,1.44),(0.09,0.02,1.43)],[0.38,0.22,0.08]):
        root=surf((X(x),y,z),0.004); end=cuffpt(side,f,-0.010)
        OUT['side'].append(dict(p=path(root,end,[0.004,0.007,0.008,0.008],6),r=[0.008,0.014,0.016,0.016,0.015,0.013]))
    # 銀白の筋: こめかみの上の縁 → カフの上寄り
    root=surf((X(0.074),-0.055,1.462),0.003); e0=cuffpt(side,0.5,-0.010); end=surf(np.array(root)*0.45+e0*0.55,0.006)
    OUT['silver'].append(dict(p=path(root,end,[0.003,0.004,0.004,0.004],6),r=[0.002,0.005,0.006,0.006,0.005,0.003]))
    # 後頭部 → 尻尾の根元（カフの後ろ）
    for (x,z),f in zip([(0.02,1.40),(0.045,1.395),(0.07,1.40)],[0.45,0.3,0.15]):
        root=surf((X(x),0.13,z),0.004); end=cuffpt(side,f,0.04)
        OUT['back'].append(dict(p=path(root,end,[0.004,0.008,0.012,0.02],6),r=[0.008,0.016,0.020,0.022,0.022,0.020]))
# 区画3: キャラの右（画面左）のこめかみの銀白の巻き毛（C 字）。参照の正面 シート画素 (205-225, 240-262) 付近。
curl=[(-0.078,0.03,1.44),(-0.072,-0.02,1.455),(-0.055,-0.058,1.468),(-0.036,-0.074,1.474),(-0.021,-0.08,1.466),(-0.022,-0.079,1.452),(-0.033,-0.075,1.448),(-0.040,-0.072,1.456)]
cc=np.mean(np.array(curl)[2:],0); curl=[tuple(cc+(np.array(p)-cc)*0.6+np.array([0.012,0,0.012])) for p in curl]
P=[]
for p in curl:
    q=np.array(p)-C; d=q/np.linalg.norm(q); rr=rhead(d[None])[0]
    P.append((C+d*(rr+0.004)).tolist())
OUT['silver']=[o for o in OUT['silver'] if o['p'][0][0]>0.004]+[dict(p=P,r=[0.002,0.004,0.005,0.006,0.006,0.005,0.004,0.002])]
json.dump(OUT,open(S+'v4/head_clumps.json','w')); print({k:len(v) for k,v in OUT.items()})
