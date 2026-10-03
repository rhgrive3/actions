import bpy, numpy as np
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read())
o=make('V5_test',[dict(p=[[0.0,-0.13,1.46],[0.0,-0.13,1.43],[0.0,-0.13,1.40]],r=[0.02,0.02,0.02])],1.0,bpy.data.materials['V4_hair_bangs'],flatx=0.3,res=16)
dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh(); V=np.array([v.co for v in me.vertices]); e.to_mesh_clear()
mid=V[np.abs(V[:,2]-1.43)<0.004]
bpy.data.objects.remove(o)
__result__=dict(x_extent=float(np.ptp(mid[:,0])),y_extent=float(np.ptp(mid[:,1])))
