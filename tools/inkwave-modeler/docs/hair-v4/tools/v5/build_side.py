import bpy, json, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read())
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/locks_side3d.json'))
MAT={'bangs':'V4_hair_bangs','crown':'V4_hair_crown','silver':'V4_hair_silver'}
for mk,mn in MAT.items():
    cl=[]
    for v in L.values():
        if v['mat']!=mk: continue
        w=np.array(v['w']); r=w/2*1.3; r[0]=r[1]*0.8; r[-1]=0.002 if mk!='crown' else r[-2]*0.6
        cl.append(dict(p=v['p'],r=r.tolist()))
    if cl: make('V5_side_'+mk,cl,0.45,bpy.data.materials[mn],flatx=1.0,res=16)
__result__='ok'
