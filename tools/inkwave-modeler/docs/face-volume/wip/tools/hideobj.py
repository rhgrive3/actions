# hideobj.py -- OUT.blend NAME.. : hide objects from the render (diagnosis)
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
for n in a[1:]:
    bpy.data.objects[n].hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=a[0])
