# 奥の束: なめらかにした隣どうしの束の平均を頭皮側へ下げる（先は短め）
import numpy as np, json, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
L=json.load(open(S+'v12/locks_s.json')); out=[]
for IN in (0.008,0.016):
    for a,b,f in (('A','B',0.9),('B','C',0.92),('C','D',0.9)):
        P=(np.array(L[a]['p'])+np.array(L[b]['p']))/2
        for i in range(len(P)):
            q=P[i]-C; r=np.linalg.norm(q); d=q/r; rh=rhead(d[None])[0]; h=max(r-rh,0.004)
            P[i]=C+d*(rh+max(h-IN,0.004))
        R=(np.array(L[a]['r'])+np.array(L[b]['r']))/2*0.95
        n=int(len(P)*f); P=P[:n]; R=R[:n]; s=np.linspace(0,1,n); R=R*np.clip((1-s)/0.35,0,1)**0.75; R[-1]=0.0006
        out.append(dict(p=P.tolist(),r=R.tolist()))
json.dump(out,open(S+'v12/fill.json','w')); print(len(out))
