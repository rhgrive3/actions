# setlights2.py -- OUT.blend JSON : light-only trial: {"KEY": {"energy": e, "color": [r,g,b]}, ..., "world": s}
import bpy, sys, json
out, spec = sys.argv[sys.argv.index('--') + 1:]
spec = json.loads(spec)
for name, v in spec.items():
    if name == 'world':
        next(n for n in bpy.context.scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[1].default_value = v
        continue
    l = bpy.data.objects[name].data
    if 'energy' in v: l.energy = v['energy']
    if 'color' in v: l.color = v['color']
bpy.ops.wm.save_as_mainfile(filepath=out)
