import bpy
out=[]
for g in bpy.data.node_groups:
    for n in g.nodes:
        if n.bl_idname=='GeometryNodeSetCurveNormal' and 'Mode' in n.inputs:
            n.inputs['Mode'].default_value='Free'; out.append(g.name)
__result__=out
