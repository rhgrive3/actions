# 5 方向（シート）+ 全身の正面・後ろ・横（正投影）を Workbench で描く。OUT は呼ぶ側で設定。
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/hicams.py').read())
L=LIGHT if 'LIGHT' in dir() else 'STUDIO'
render5(OUT, cols=('HEAD','BODY','CLOTHES','HAIR_V4'), light=L)
sc=bpy.context.scene
old={o.name:o.hide_render for o in bpy.data.objects}
for o in bpy.data.objects:
    if o.type in ('MESH','CURVE'):
        names={c.name for c in o.users_collection}; p=o.parent; on='HAIR_V4' in names
        while p is not None and not on: on=p.name in ('HEAD','BODY','CLOTHES','LEGWEAR','SHOES'); p=p.parent
        o.hide_render=not on
for v in ('front','back','left'):
    use_hi(v); sc.render.filepath=OUT+f'/hi_{v}.png'; bpy.ops.render.render(write_still=True)
for n,h in old.items(): bpy.data.objects[n].hide_render=h
