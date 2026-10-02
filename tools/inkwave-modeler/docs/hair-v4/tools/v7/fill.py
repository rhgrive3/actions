# すき間の奥の束: となりどうしの束の道すじを長さでそろえて平均し、頭皮側へ IN だけ下げる。
import numpy as np, json, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
INS=[float(x) for x in sys.argv[1:]] or [0.008]
L=json.load(open(S+'v7/locks.json'))
def res(P,n=16):
    P=np.array(P)[4:]; d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]; t=np.linspace(0,d[-1],n)
    return np.stack([np.interp(t,d,P[:,i]) for i in range(3)],1)
def resr(R,n=16):
    R=np.array(R)[4:]; return np.interp(np.linspace(0,1,n),np.linspace(0,1,len(R)),R)
out=[]
for IN in INS:
  for a,b,f in (('A','B',0.92),('B','C',0.95),('C','D',0.92)):
    P=(res(L[a]['p'])+res(L[b]['p']))/2
    for i in range(len(P)):
        q=P[i]-C; r=np.linalg.norm(q); d=q/r; rh=rhead(d[None])[0]; h=max(r-rh,0.004)
        P[i]=C+d*(rh+max(h-IN,0.004))
    R=(resr(L[a]['r'])+resr(L[b]['r']))/2*0.95; n=int(len(P)*f); P=P[:n]; R=R[:n]; s=np.linspace(0,1,n); R=R*np.clip((1-s)/0.4,0,1)**0.8; R[-1]=0.001
    out.append(dict(p=P.tolist(),r=R.tolist()))
  for a in ():
    P=res(L[a]['p'])
    for i in range(len(P)):
        q=P[i]-C; r=np.linalg.norm(q); d=q/r; rh=rhead(d[None])[0]; h=max(r-rh,0.004)
        P[i]=C+d*(rh+max(h-IN*1.6,0.004))
    R=resr(L[a]['r'])*1.05; n=int(len(P)*0.75); P=P[:n]; R=R[:n]; R[-1]*=0.4
    out.append(dict(p=P.tolist(),r=R.tolist()))
json.dump(out,open(S+'v7/fill.json','w')); print(len(out))
