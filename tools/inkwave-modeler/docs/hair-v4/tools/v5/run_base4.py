SHRINK=0.0
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/run_base3.py').read())
exec(open('/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/v5/fix_base.py').read())
b=bpy.data.objects['V5_base']
d=b.modifiers.new('Shrink','DISPLACE'); d.strength=-SHRINK; d.mid_level=0.0
__result__=[m.name for m in b.modifiers]
