# setlights.py -- OUT.blend world_strength sun_scale : light-only trial on a built blend (no rebuild)
import bpy, sys
out, ws, ss = sys.argv[sys.argv.index('--') + 1:]
for o in bpy.data.objects:
    if o.type == 'LIGHT' and o.name != 'INKWAVE_eye_look':
        o.data.energy *= float(ss)
bg = next(n for n in bpy.context.scene.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[1].default_value = float(ws)
bpy.ops.wm.save_as_mainfile(filepath=out)
