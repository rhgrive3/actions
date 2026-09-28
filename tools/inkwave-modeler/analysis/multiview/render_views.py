"""Blender: render the five fitted reference views of INKWAVE_FACE_FIT.blend, before (FACE_FIT_ORIGINAL) and after.
blender --background blender/INKWAVE_FACE_FIT.blend --python analysis/multiview/render_views.py -- <out_dir> [scale] [engine]
Writes <view>_<state>_<look>.png, state = before|after, look = beauty (all parts) | clay (bare head, grey)."""
import sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
scale = float(argv[1]) if len(argv) > 1 else 2.0
engine = argv[2] if len(argv) > 2 else 'WORKBENCH'
sc = bpy.context.scene
orig = bpy.data.collections['FACE_FIT_ORIGINAL'].objects
live = {o.name[:-len('__prefit')]: bpy.data.objects[o.name[:-len('__prefit')]] for o in orig}
bare_hide = [o for o in bpy.data.objects if o.type == 'MESH' and any(c.name in ('HAIR', 'HEADGEAR', 'CLOTHES') for c in o.users_collection)]
clay = bpy.data.materials.get('FACE_FIT_CLAY') or bpy.data.materials.new('FACE_FIT_CLAY')
clay.diffuse_color = (0.6, 0.6, 0.6, 1)
if engine == 'WORKBENCH':
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.show_specular_highlight = True; sh.show_cavity = False
    sc.display.render_aa = '16'
else:
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
for o in orig:
    o.hide_set(False)
for cam in bpy.data.collections['FACE_FIT_CAMERAS'].objects:
    view = cam['inkwave_view']; W, H = cam['inkwave_resolution']
    sc.camera = cam; sc.render.resolution_x = round(W * scale); sc.render.resolution_y = round(H * scale)
    sc.render.resolution_percentage = 100
    for state in ('before', 'after'):
        for o in orig:
            o.hide_render = state != 'before'
        for o in live.values():
            o.hide_render = state == 'before'
        for look in ('beauty', 'clay'):
            for o in bare_hide:
                o.hide_render = look == 'clay'
            if engine == 'WORKBENCH':
                sc.display.shading.color_type = 'TEXTURE' if look == 'beauty' else 'SINGLE'
                sc.display.shading.single_color = (0.62, 0.62, 0.62)
            else:
                bpy.context.view_layer.material_override = clay if look == 'clay' else None
            sc.render.filepath = str(out / f'{view}_{state}_{look}.png')
            bpy.ops.render.render(write_still=True)
print('RENDERED', out)
