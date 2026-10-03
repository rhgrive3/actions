# 画面なし: 引数のスクリプトを順に実行 → 保存 → 4 方向 Cycles
import bpy, sys
args=sys.argv[sys.argv.index('--')+1:]; OUTD=args[0]; scripts=args[1:]
for sc_ in scripts:
    g={'__name__':'__main__'}
    exec(open(sc_).read(),g)
    print('RAN',sc_,g.get('__result__'))
bpy.ops.wm.save_as_mainfile(filepath='/mnt/workspace/.dev-state/agent-work/checkpoints/inkwave-hair-v4-20260929/HAIR_V4_CANDIDATE.blend')
if OUTD!='none':
    exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=20; sc.cycles.use_denoising=True; sc.view_settings.view_transform='AgX'
    render5(OUTD, cols=('HEAD','BODY','CLOTHES','HAIR_V4','HEADGEAR'), engine='CYCLES', views=['front','sideL','sideR','q34R'])
