# 束の道すじに根元（頭頂の分け目）を足す → locks_full.json {k:{p,r}}
import json, numpy as np, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
a=dict(RY=0.0,RH=0.010,MH=0.012,RK=1.1)
for kv in sys.argv[1:]: k,v=kv.split('='); a[k]=float(v)
L=json.load(open(S+'v5/locks3d.json'))
def hgt(p): q=np.array(p)-C; r=np.linalg.norm(q); return r-rhead((q/r)[None])[0]
def on_scalp(p,h):
    q=np.array(p)-C; d=q/np.linalg.norm(q); return C+d*(rhead(d[None])[0]+h)
out={}
for k,v in L.items():
    P=np.array(v['p']); w=np.array(v['w'])
    root=on_scalp((P[0][0]*0.4+0.004, a['RY'], 1.52), a['RH'])
    mid=(root+P[0])/2; mid=on_scalp(mid, hgt(mid)+a['MH'])
    Q=np.vstack([root,mid,P]); r=np.r_[w[0]*0.45, w[0]*0.55, w/2*a['RK']]; r[-1]=0.002
    out[k]=dict(p=Q.tolist(),r=r.tolist())
    print(k,'root',root.round(3),'h first',round(hgt(P[0]),3))
json.dump(out,open(S+'v5/locks_full.json','w'))
