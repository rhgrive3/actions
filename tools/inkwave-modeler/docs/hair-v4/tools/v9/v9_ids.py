import bpy
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
PAL={'V4_scalp':(0.1,0.3,0.9,1),'V8_shell':(0.2,0.9,0.9,1),'V8_crown':(1,0.5,0,1),'V7_bangs':(1,0,0,1),'V7_bangs_teal':(0.6,0,1,1),'V7_fill':(1,1,0,1),'V7_silver':(1,1,1,1),'V9_silver':(1,1,1,1),'V9_E':(0.6,0,1,1),'V9_silver':(1,1,1,1),'V4_fins':(0,0.3,0,1),'V4_buckle_R0':(1,1,1,1),'V4_tail_R':(0,0.6,0,1),'V4_tailcore_L':(0,0.4,0,1),'V4_tailcore_R':(0,0.4,0,1),'V4_tail_L':(0,0.6,0,1),'V4_cuff_R':(0,0,0,1),'V4_cuff_L':(0,0,0,1),'V4_stubble':(0.5,0.5,0.5,1)}
for o in bpy.data.objects: o.color=PAL.get(o.name,(0.85,0.7,0.6,1))
render5('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/r/ids', cols=('HEAD','HAIR_V4'), views=['sideL'], color='OBJECT', light='FLAT')
cols={}
for o in bpy.data.collections['HAIR_V4'].objects: cols[o.name]=[round(c,2) for c in o.color[:3]]
__result__=cols
