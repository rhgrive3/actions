import bpy
for o in list(bpy.data.objects):
    if o.name=='V5_base': bpy.data.objects.remove(o)
NAME='V5_base'; SRC='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/base_vox.npz'; COL='HAIR_V4'; MAT='V4_hair_crown'; SHR=0.0
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/vox_mesh.py').read())
b=bpy.data.objects['V5_base']; b.modifiers['Smooth'].iterations=40
d=b.modifiers.get('Shrink')
if d: b.modifiers.remove(d)
for p in b.data.polygons: p.use_smooth=True
__result__='ok'
