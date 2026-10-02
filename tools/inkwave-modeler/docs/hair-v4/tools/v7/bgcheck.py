import bpy, numpy as np
o=bpy.data.objects['V7_bangs']; m=o.modifiers[0]
g=m.node_group
print('GROUP',g.name,[(it.name,getattr(it,'default_value',None) if not hasattr(getattr(it,'default_value',None),'__len__') else tuple(it.default_value)) for it in g.interface.items_tree if getattr(it,'in_out','')=='INPUT'])
dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh(); V=np.array([v.co for v in me.vertices]); print('EXT',V.min(0).round(3),V.max(0).round(3),len(V))
