import bpy, json
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read())
RESU=20
for n in ('V6_crown','V8_crown'):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
make('V8_crown',json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v8_crown.json')),0.28,bpy.data.materials['V4_hair_crown'],flatx=1.0,res=16)
__result__='ok'
