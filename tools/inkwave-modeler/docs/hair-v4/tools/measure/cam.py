import numpy as np, json
J=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/an/cams.json'))
class Cam:
    def __init__(s,d):
        M=np.array(d['mw']); s.R=M[:3,:3]; s.t=M[:3,3]; s.d=d
        s.f=d['lens']/d['sw']*d['rx']; s.rx=d['rx']; s.ry=d['ry']; s.m=max(d['rx'],d['ry'])
    def cam(s,X): return (np.asarray(X)-s.t)@s.R
    def proj(s,X):
        p=s.cam(X); z=-p[...,2]
        u=s.rx/2+s.f*p[...,0]/z-s.d['sx']*s.m
        v=s.ry/2-s.f*p[...,1]/z+s.d['sy']*s.m
        return np.stack([u,v],-1)
    def viewdir(s,X):  # unit vector camera->X
        d=np.asarray(X)-s.t; return d/np.linalg.norm(d,axis=-1,keepdims=True)
CAMS={k:Cam(v) for k,v in J.items()}
if __name__=='__main__':
    for k,c in CAMS.items():
        e=[np.abs(c.proj(np.array(p))-np.array(q)).max() for p,q in c.d['test']]; print(k,max(e))
