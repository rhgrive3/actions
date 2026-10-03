# バックグラウンド Blender: 前髪を作り直して保存 → Cycles で 4 方向
import bpy, sys
__result__=None
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/build.py').read())
bpy.ops.wm.save_as_mainfile(filepath='/mnt/workspace/.dev-state/agent-work/checkpoints/inkwave-hair-v4-20260929/HAIR_V4_CANDIDATE.blend')
OUTD=sys.argv[sys.argv.index('--')+1]
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=20; sc.cycles.use_denoising=True; sc.view_settings.view_transform='AgX'
render5(OUTD, cols=('HEAD','BODY','CLOTHES','HAIR_V4','HEADGEAR'), engine='CYCLES', views=['front','sideL','sideR','q34R'])
