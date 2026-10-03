import bpy, numpy as np, json
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/locks3d.json'))
dg=bpy.context.evaluated_depsgraph_get(); e=bpy.data.objects['V5_bangs'].evaluated_get(dg); me=e.to_mesh()
V=np.array([v.co for v in me.vertices]); e.to_mesh_clear()
out={}
C=np.array([0.004,0.02,1.39])
for k in ('D','B'):
    P=np.array(L[k]['p']); m=P[5]; t=P[6]-P[4]; t/=np.linalg.norm(t)
    sel=V[(np.abs((V-m)@t)<0.002)&(np.linalg.norm(V-m,axis=1)<0.05)]
    X=sel-sel.mean(0); U,S_,Vt=np.linalg.svd(X,full_matrices=False)
    rad=(m-C)/np.linalg.norm(m-C)
    out[k]=dict(n=len(sel),wide_axis=Vt[0].round(2).tolist(),extent=[float(np.ptp(X@Vt[0])),float(np.ptp(X@Vt[1]))],radial=rad.round(2).tolist(),thin_axis=Vt[1].round(2).tolist())
__result__=out
