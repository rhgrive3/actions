import bpy, numpy as np
dg=bpy.context.evaluated_depsgraph_get(); out={}
for o in bpy.data.objects:
    if o.name.startswith('V5_') or o.name.startswith('V4_crown') or o.name.startswith('V4_silver'):
        e=o.evaluated_get(dg)
        try: me=e.to_mesh()
        except Exception: continue
        V=np.array([e.matrix_world@v.co for v in me.vertices]) if len(me.vertices) else np.zeros((1,3)); e.to_mesh_clear()
        out[o.name]=(o.hide_render,[c.name for c in o.users_collection],V.min(0).round(3).tolist(),V.max(0).round(3).tolist())
__result__=out
