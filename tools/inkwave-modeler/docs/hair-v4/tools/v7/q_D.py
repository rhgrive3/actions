import bpy, numpy as np, json
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/locks.json'))
o=bpy.data.objects['V7_bangs']; sp=o.data.splines[3]
bl=[round(p.radius,4) for p in sp.bezier_points]; js=[round(x,4) for x in L['D']['r']]
dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh(); V=np.array([v.co for v in me.vertices]); e.to_mesh_clear()
P=np.array(L['D']['p']); i=10; m=P[i]; t=P[i+1]-P[i-1]; t/=np.linalg.norm(t)
sel=V[(np.abs((V-m)@t)<0.0015)&(np.linalg.norm(V-m,axis=1)<0.05)]
C=np.array([0.004,0.02,1.39]); n=m-C; n-=(n@t)*t; n/=np.linalg.norm(n); b=np.cross(t,n)
__result__=dict(blender=bl,json=js,n_sel=len(sel),ext_b=float(np.ptp((sel-m)@b)) if len(sel) else 0,ext_n=float(np.ptp((sel-m)@n)) if len(sel) else 0,r=js[i])
