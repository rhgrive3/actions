import bpy, numpy as np, json
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/locks.json'))
o=bpy.data.objects['V7_bangs']; out={'radii':[[round(p.radius,4) for p in s.bezier_points] for s in o.data.splines][:2]}
dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh(); V=np.array([v.co for v in me.vertices]); e.to_mesh_clear()
P=np.array(L['B']['p']); m=P[8]; t=P[9]-P[7]; t/=np.linalg.norm(t)
sel=V[(np.abs((V-m)@t)<0.003)&(np.linalg.norm(V-m,axis=1)<0.06)]
X=sel-sel.mean(0); U,S_,Vt=np.linalg.svd(X,full_matrices=False)
out['B8']=dict(n=len(sel),ext=[float(np.ptp(X@Vt[i])) for i in range(2)],axes=Vt[:2].round(2).tolist(),t=t.round(2).tolist(),m=m.round(3).tolist())
out['B_pts']=np.round(P,3).tolist()
__result__=out
