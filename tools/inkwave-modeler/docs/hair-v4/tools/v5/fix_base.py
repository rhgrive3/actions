import bpy
b=bpy.data.objects['V5_base']; g=b.modifiers['hull'].node_group
for n in g.nodes:
    if n.bl_idname=='GeometryNodeMeshToPoints': n.inputs['Radius'].default_value=0.0038
    if n.bl_idname=='GeometryNodePointsToVolume':
        n.inputs['Radius'].default_value=0.0038
        if 'Voxel Size' in n.inputs: n.inputs['Voxel Size'].default_value=0.0015
    if n.bl_idname=='GeometryNodeVolumeToMesh': n.inputs['Threshold'].default_value=0.5
b.modifiers['Smooth'].iterations=60; b.modifiers['Smooth'].factor=0.9
if 'Sub' not in b.modifiers:
    cs=b.modifiers.new('Relax','CORRECTIVE_SMOOTH'); cs.iterations=20; cs.use_only_smooth=True
__result__=[m.name for m in b.modifiers]
