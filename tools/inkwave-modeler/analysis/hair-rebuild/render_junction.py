"""付け根の確認用に、5 方向の頭まわりを描く。
blender -b <blend> --python render_junction.py -- <out_dir> [engine] [what]
what: 'hair' = 頭 + HAIR_REBUILD_V2（尻尾と前髪を除く付け根だけ）/ 'head' = 頭だけ / 'legacy' = 頭 + 旧髪"""
import os, sys
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheetcam  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; os.makedirs(out, exist_ok=True)
engine = argv[1] if len(argv) > 1 else 'CYCLES'
what = argv[2] if len(argv) > 2 else 'hair'
sc = bpy.context.scene
if engine == 'CYCLES':
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
else:
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'SINGLE'
    sc.display.shading.single_color = (0.62, 0.64, 0.66)
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
show = {'HEAD', 'HEADGEAR'}
if what == 'legacy':
    bpy.data.collections['HAIR_LEGACY_REFERENCE'].hide_render = False
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    cats = {c.name for c in o.users_collection}
    on = bool(cats & show)
    if what == 'hair' and 'HAIR_REBUILD_V2' in cats:
        on = not (o.name.startswith('HAIR2_tail') or o.name.startswith('HAIR2_bang'))
    if what == 'legacy' and ('HAIR_LEGACY_REFERENCE' in cats or o.name.startswith('HAIR_hair')):
        on = True
    o.hide_render = not on
for view in sheetcam.BOX:
    sheetcam.use(view, 2)
    sc.render.filepath = os.path.join(out, f'{view}.png')
    bpy.ops.render.render(write_still=True)
print('JUNCTION_DONE', out)
