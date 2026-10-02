ROT=40.0
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'cuff.py').read())
for n in ('V4_cuff_L','V4_cuff_R'):
    o=bpy.data.objects[n]; o.data.materials.clear(); o.data.materials.append(bpy.data.materials['V4_cuff_black'])
for n in [o.name for o in bpy.data.objects if o.name.startswith('V4_buckle')]:
    o=bpy.data.objects[n]; o.data.materials.clear(); o.data.materials.append(bpy.data.materials['V4_buckle_metal'])
