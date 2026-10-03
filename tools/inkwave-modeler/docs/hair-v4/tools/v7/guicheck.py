import bpy, numpy as np
o=bpy.data.objects['V7_bangs']; m=o.modifiers[0]
dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh(); V=np.array([v.co for v in me.vertices])
__result__=dict(ext=[V.min(0).round(3).tolist(),V.max(0).round(3).tolist(),len(V)])
