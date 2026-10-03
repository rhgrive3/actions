import bpy, json
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
RESU=16
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
for n in ('V7_bangs','V7_bangs_teal','V7_fill'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v12/locks_s.json')); F=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v12/fill.json'))
TH=globals().get('THK',0.34)
make('V7_bangs',[L[k] for k in ('A','B','C','D')],TH,bpy.data.materials['V4_hair_bangs'],flatx=1.0,res=20)
make('V7_fill',F,TH,bpy.data.materials['V4_hair_bangs'],flatx=1.0,res=20)
__result__='ok'
