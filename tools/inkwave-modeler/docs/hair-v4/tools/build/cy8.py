import bpy, sys
OUT=sys.argv[sys.argv.index('--')+1]
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read()); exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/hicams.py').read())
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=24; sc.cycles.use_denoising=True
sc.view_settings.view_transform='AgX'
render5(OUT, cols=('HEAD','BODY','CLOTHES','HAIR_V4','HEADGEAR'), engine='CYCLES')
for o in bpy.data.objects:
    if o.type in ('MESH','CURVE'):
        names={c.name for c in o.users_collection}; p=o.parent; on=bool(names&{'HAIR_V4','HEADGEAR'})
        while p is not None and not on: on=p.name in ('HEAD','BODY','CLOTHES','LEGWEAR','SHOES','HEADGEAR'); p=p.parent
        o.hide_render=not on
for v in ('front','back','left'):
    use_hi(v); sc.render.filepath=OUT+f'/hi_{v}.png'; bpy.ops.render.render(write_still=True)
