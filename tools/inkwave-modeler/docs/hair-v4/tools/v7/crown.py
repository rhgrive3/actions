import bpy, json
V4='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v4/'
exec(open(V4+'clumps.py').read().replace("exec(open(V4+'gn.py').read())","exec(open(V4+'gn_lens.py').read())"))
for n in ('V6_crown',):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
J=json.load(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v6/plan.json'))
make('V6_crown',[dict(p=c['p'],r=c['r']) for c in J['crown']],0.9,bpy.data.materials['V4_hair_crown'],flatx=1.0,res=16)
__result__='ok'
