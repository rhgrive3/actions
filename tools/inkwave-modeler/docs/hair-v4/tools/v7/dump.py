import bpy, numpy as np
dg=bpy.context.evaluated_depsgraph_get(); out={}
for n in ('V7_bangs','V7_bangs_teal'):
    e=bpy.data.objects[n].evaluated_get(dg); me=e.to_mesh()
    V=np.array([e.matrix_world@v.co for v in me.vertices]); F=np.array([list(p.vertices)[:3] for p in me.loop_triangles]) if False else None
    me.calc_loop_triangles(); T=np.array([list(t.vertices) for t in me.loop_triangles])
    np.savez('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/mesh_'+n+'.npz',V=V,T=T); e.to_mesh_clear()
__result__='ok'
