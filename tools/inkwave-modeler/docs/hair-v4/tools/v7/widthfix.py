# 各束の SAM 部分の点で、正面に写した幅（2r の binormal を投影）と SAM の幅を比べ、半径を直す。
import numpy as np, json, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from cam import CAMS
C=np.array([0.004,0.02,1.39]); c=CAMS['front']
L=json.load(open(S+'v7/locks.json')); CL=json.load(open(S+'sam/centerlines.json'))
for k in ('A','B','C','D'):
    P=np.array(L[k]['p']); R=np.array(L[k]['r']); n0=3
    pts=np.array(CL[k]); w_ref=pts[:,2]/3.4*2.0          # カメラ画素
    T=np.gradient(P,axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)
    N=P-C; N-= (N*T).sum(1,keepdims=True)*T; N/=np.linalg.norm(N,axis=1,keepdims=True); B=np.cross(T,N)
    wp=np.linalg.norm(c.proj(P+B*R[:,None])-c.proj(P-B*R[:,None]),axis=1)
    ratio=w_ref/np.maximum(wp[n0:],1e-6)
    print(k,'proj/ref',np.round(wp[n0:]/np.maximum(w_ref,1e-6),2).tolist())
