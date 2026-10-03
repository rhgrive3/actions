WK=1.35
THK=0.45
import bpy, json, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read())
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/locks3d.json'))
cl=[]; clF=[]
for kk,v in L.items():
    w=np.array(v['w']); r=w/2*(WK if 'WK' in dir() else 1.05); r[0]=r[1]*0.8; r[-1]=0.002
    (clF if kk in ('F','E') else cl).append(dict(p=v['p'],r=r.tolist()))
o=make('V5_bangs',cl,THK if 'THK' in dir() else 0.4,bpy.data.materials['V4_hair_bangs'],flatx=1.0,res=16)
make('V5_bangsF',clF,0.45,bpy.data.materials['V4_hair_crown'],flatx=1.0,res=16)
__result__=len(cl)
