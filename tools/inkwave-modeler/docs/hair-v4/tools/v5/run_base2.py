import bpy
OFF=0.004
for o in list(bpy.data.objects):
    if o.name in ('V5_base','V5_hull'): bpy.data.objects.remove(o)
NAME='V5_hull'; SRC='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/hull_clean.npz'; COL='V5_WORK'; SHR=0.0
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/vox_mesh.py').read())
h=bpy.data.objects['V5_hull']; sm=h.modifiers['Smooth']; sm.iterations=40
h.hide_render=True
src=bpy.data.objects['V4_scalp']
b=src.copy(); b.data=src.data.copy(); b.name='V5_base'; bpy.data.collections['HAIR_V4'].objects.link(b)
for m in list(b.modifiers):
    if m.name in ('Offset','Smooth','Solidify','Subsurf'): b.modifiers.remove(m)
sw=b.modifiers.new('ToHull','SHRINKWRAP'); sw.target=h; sw.wrap_method='PROJECT'; sw.use_project_z=False
sw.use_negative_direction=False; sw.use_positive_direction=True
try: sw.project_limit=0.06
except Exception: pass
sw.offset=-OFF
s=b.modifiers.new('Smooth','SMOOTH'); s.iterations=60; s.factor=0.9
so=b.modifiers.new('Solidify','SOLIDIFY'); so.thickness=0.012; so.offset=-1.0
sd=b.modifiers.new('Subsurf','SUBSURF'); sd.levels=1; sd.render_levels=2
b.data.materials.clear(); b.data.materials.append(bpy.data.materials['V4_hair_crown'])
__result__=[m.name for m in b.modifiers]
