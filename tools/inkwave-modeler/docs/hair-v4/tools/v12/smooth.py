# 前髪の道すじと太さをなめらかにする。
#  道すじ: 根元の 3 点（頭皮 → 立ち上がり）を捨て、測った点だけに平滑化スプラインを当てる。
#          根元は、最初の点から「頭の後ろ上」へ、同じ向きのまま頭皮へ下りる短い接線で足す（折れ目なし）。
#  太さ:   根元 0.55 → 最大（測った最大値）→ 先へ単調に細くしてとがらせる。単峰（こぶなし）。
import json, numpy as np, sys
from scipy.interpolate import splprep, splev
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
a=dict(SM=0.006,N=24,WK=1.0,ROOTLEN=0.05)
for kv in sys.argv[1:]: k,v=kv.split('='); a[k]=float(v)
L=json.load(open(S+'v7/locks.json'))
def hgt(p): q=p-C; r=np.linalg.norm(q); return r-rhead((q/r)[None])[0]
def lift_to(p,hmin):
    q=p-C; r=np.linalg.norm(q); d=q/r; rh=rhead(d[None])[0]
    return C+d*max(r,rh+hmin)
out={}
for k,v in L.items():
    P=np.array(v['p']); R=np.array(v['r'])
    if k!='E': P=P[3:]; R=R[3:]
    # 根元側へ延ばす: 最初の 2 点の向きを逆にたどり、頭皮へ近づける
    t0=P[0]-P[2]; t0/=np.linalg.norm(t0)
    ext=[]
    for s in np.linspace(a['ROOTLEN'],0,5)[:-1]:
        q=P[0]+t0*s
        h=hgt(q); ext.append(lift_to(q,0.003) if h<0.003 else q)
    # 延長分を頭皮側へ寄せる（根元ほど低く）
    ext=np.array(ext); H=len(ext)
    for i in range(H):
        f=1-i/H                    # 1 = いちばん根元
        q=ext[i]-C; r=np.linalg.norm(q); d=q/r; rh=rhead(d[None])[0]
        ext[i]=C+d*(rh+0.003+(r-rh-0.003)*(1-f)**1.5)
    Q=np.vstack([ext,P])
    w=np.ones(len(Q)); w[0]=6; w[-1]=4
    tck,u=splprep(Q.T,w=w,s=len(Q)*a['SM']**2,k=3)
    uu=np.linspace(0,1,int(a['N'])); X=np.array(splev(uu,tck)).T
    X=np.array([lift_to(x,0.003) for x in X])
    # 太さ
    rmax=R.max()*a['WK']; imax=np.argmax(R)/max(len(R)-1,1)
    smax=(len(ext)+imax*(len(P)-1))/(len(Q)-1)
    s=uu
    rise=0.55+0.45*np.sin(np.clip(s/smax,0,1)*np.pi/2)
    fall=np.clip((1-s)/(1-smax),0,1)**0.75
    r=rmax*np.where(s<smax,rise,fall); r[-1]=0.0006
    out[k]=dict(p=X.tolist(),r=r.tolist())
    T=np.diff(X,axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)
    print(k,'max turn deg',round(float(np.degrees(np.arccos(np.clip((T[1:]*T[:-1]).sum(1),-1,1))).max()),1),'rmax mm',round(rmax*1000,1),'root h',round(float(hgt(X[0])),3))
json.dump(out,open(S+'v12/locks_s.json','w'))
