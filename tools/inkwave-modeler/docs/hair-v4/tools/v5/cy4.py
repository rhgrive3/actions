import bpy, sys
OUT=sys.argv[sys.argv.index('--')+1]
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=20; sc.cycles.use_denoising=True; sc.view_settings.view_transform='AgX'
render5(OUT, cols=('HEAD','BODY','CLOTHES','HAIR_V4','HEADGEAR'), engine='CYCLES', views=['front','sideL','sideR','q34R'])
