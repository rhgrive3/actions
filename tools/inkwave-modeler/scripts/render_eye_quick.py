"""Quick eye renders: after/beauty only for selected FACE_FIT cams.
Usage: blender --background <blend> --python scripts/render_eye_quick.py -- <out_dir> [scale] [views_csv]
Writes <view>_after_beauty.png at resolution*scale (WORKBENCH TEXTURE, STUDIO).
Blend is only read, never saved.
"""
import sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
scale = float(argv[1]) if len(argv) > 1 else 4.0
views = (argv[2].split(',') if len(argv) > 2 else ['front', 'q34R', 'sideR'])
sc = bpy.context.scene
orig = bpy.data.collections['FACE_FIT_ORIGINAL'].objects
live = {o.name[:-len('__prefit')]: bpy.data.objects[o.name[:-len('__prefit')]] for o in orig}
bare_hide = [o for o in bpy.data.objects if o.type == 'MESH' and any(c.name in ('HAIR', 'HEADGEAR', 'CLOTHES') for c in o.users_collection)]
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'; sh.show_specular_highlight = True; sh.show_cavity = False
sc.display.render_aa = '16'
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
sc.display.shading.color_type = 'TEXTURE'
for o in orig:
    o.hide_set(False)
for cam in bpy.data.collections['FACE_FIT_CAMERAS'].objects:
    view = cam['inkwave_view']
    if view not in views:
        continue
    W, H = cam['inkwave_resolution']
    sc.camera = cam; sc.render.resolution_x = round(W * scale); sc.render.resolution_y = round(H * scale)
    sc.render.resolution_percentage = 100
    for o in orig:
        o.hide_render = True
    for o in live.values():
        o.hide_render = False
    for o in bare_hide:
        o.hide_render = False
    sc.render.filepath = str(out / f'{view}_after_beauty.png')
    bpy.ops.render.render(write_still=True)
print('RENDER_EYE_QUICK', out, views, scale)
