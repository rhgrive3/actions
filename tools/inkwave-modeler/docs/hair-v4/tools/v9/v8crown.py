# 頭頂: 額の生え際と分け目から後ろへなでつけて、左右の留め具（前の口）に入る広く平たい束。
import numpy as np, sys, json
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from band3 import rhead, C
CF=json.load(open(S+'v4/cuff.json'))
def surf(p,h): q=np.array(p,float)-C; d=q/np.linalg.norm(q); return C+d*(rhead(d[None])[0]+h)
def cuffpt(side,f,back):
    o=np.array(CF[side]['outer']); i=np.array(CF[side]['inner']); B=np.array(CF[side]['B'])
    k=int(round(f*(len(o)-1))); return (o[k]+i[k])/2+B[k]*back
def over(a,b,hs,n):
    a=np.array(a)-C; b=np.array(b)-C; out=[]
    for t in np.linspace(0,1,n):
        d=a*(1-t)+b*t; d/=np.linalg.norm(d); out.append(C+d*(rhead(d[None])[0]+np.interp(t,np.linspace(0,1,len(hs)),hs)))
    return np.array(out)
out=[]
for side,sg in (('L',1),('R',-1)):
    X=lambda x: 0.004+sg*(x-0.004)
    # 根元: 生え際に沿って（中央の分け目 → こめかみ）。高い所ほど頭頂を通り、留め具の上の方へ入る
    roots=[(0.025,-0.062,1.485),(0.06,-0.045,1.47)]
    fs=[0.85,0.6]
    hmax=[None,None]
    for (x,y,z),f,hm in zip(roots,fs,hmax):
        r0=surf((X(x),y,z),0.002); end=cuffpt(side,f,-0.012)
        P=over(r0,end,[0.0]*5,9)
        # 殻の高さ（v8shell.py と同じ重み）+ 5mm
        for i in range(len(P)):
            x,y,z=P[i][0]-0.004,P[i][1],P[i][2]
            w=np.clip((z-1.43)/0.08,0,1)**0.8*np.clip((0.085-abs(x))/0.035,0,1)*np.clip((0.075-y)/0.04,0,1)*np.clip((y+0.075)/0.03,0,1)**0.5
            P[i]=surf(P[i],0.035*w+0.003)
        P[-1]=end
        out.append(dict(p=P.tolist(),r=[0.014,0.02,0.024,0.024,0.022,0.018,0.014,0.011,0.009]))
json.dump(out,open(S+'v8_crown.json','w')); print(len(out))
