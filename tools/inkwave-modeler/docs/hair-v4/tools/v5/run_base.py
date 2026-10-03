import bpy
for o in list(bpy.data.objects):
    if o.name in ('V5_base','V5_hull'): bpy.data.objects.remove(o)
NAME='V5_base'; SRC='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/base_vox.npz'; COL='HAIR_V4'; MAT='V4_hair_crown'; SHR=0.003
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/vox_mesh.py').read())
for p in bpy.data.objects['V5_base'].data.polygons: p.use_smooth=True
__result__='ok'
