import bpy, json
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
for n in ('V6_bangs','V6_bangs_teal','V6_under','V7_bangs','V7_bangs_teal'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
L=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/locks.json'))
TH=0.42
RESU=24
make('V7_bangs',[L[k] for k in ('A','B','C','D')],TH,bpy.data.materials['V4_hair_bangs'],flatx=1.0,res=16)
make('V7_bangs_teal',[L['E']],TH,bpy.data.materials['V4_hair_crown'],flatx=1.0,res=16)
__result__='ok'
F=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v7/fill.json'))
for n in ('V7_fill',):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
make('V7_fill',F,0.42,bpy.data.materials['V4_hair_bangs'],flatx=1.0,res=16)
o=bpy.data.objects.get('V7_fill')
