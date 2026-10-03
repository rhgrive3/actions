import bpy
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/lib.py').read())
o=bpy.data.objects['V7_bangs']
# 束ごとに別の物体へ分けて色を付ける: 一時的に曲線を複製
import numpy as np
made=[]
cols=[(1,0,0,1),(0,0.8,0,1),(0,0,1,1),(1,0.8,0,1)]
for i,sp in enumerate(o.data.splines):
    cu=o.data.copy(); ob=bpy.data.objects.new('TMP_b%d'%i,cu); bpy.data.collections['V5_WORK'].objects.link(ob)
    for j in range(len(cu.splines)-1,-1,-1):
        if j!=i: cu.splines.remove(cu.splines[j])
    for m in o.modifiers:
        mm=ob.modifiers.new(m.name,m.type); mm.node_group=m.node_group
    ob.color=cols[i]; made.append(ob)
render5('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/r/one', cols=('HEAD',), extra=('TMP_b',), views=['sideL','front'], color='OBJECT', light='FLAT')
for ob in made: bpy.data.objects.remove(ob)
