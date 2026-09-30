"""High-resolution face-only renders with the five fitted cameras (FACE_FIT_CAM_*): border render of the face box.
blender -b x.blend --python render_face.py -- <out_dir> [scale=6] ; env LOOKS=beauty,clay,normal,mask VIEWS=front,... ENGINE=CYCLES
Writes <view>_<look>.png of size (150*scale)^2.  Hair is only hidden for non-beauty looks (render visibility only)."""
import os, sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
scale = float(argv[1]) if len(argv) > 1 else 6.0
LOOKS = os.environ.get('LOOKS', 'beauty,clay,normal,mask').split(',')
VIEWS = os.environ.get('VIEWS', 'front,q34L,sideL,q34R,sideR').split(',')
SAMPLES = int(os.environ.get('SAMPLES', '48'))
FACE = {'front': (115, 60, 265, 210), 'q34L': (80, 60, 230, 210), 'sideL': (40, 70, 190, 220),
        'q34R': (140, 60, 290, 210), 'sideR': (180, 70, 330, 220)}
if os.environ.get('BOX'):  # custom box: view=a,b,c,d;...
    for part in os.environ['BOX'].split(';'):
        v, vals = part.split('='); FACE[v] = tuple(float(x) for x in vals.split(','))

sc = bpy.context.scene
for o in bpy.data.collections['FACE_FIT_ORIGINAL'].objects:
    o.hide_render = True
bare_hide = [o for o in bpy.data.objects if o.type == 'MESH' and any(c.name in ('HAIR', 'HEADGEAR', 'CLOTHES') for c in o.users_collection)]
clay = bpy.data.materials.get('FACE_FIT_CLAY') or bpy.data.materials.new('FACE_FIT_CLAY')
clay.diffuse_color = (0.6, 0.6, 0.6, 1)
sh = sc.display.shading
sc.display.render_aa = '16'
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
sc.render.use_border = True; sc.render.use_crop_to_border = True
CYC = os.environ.get('ENGINE', 'CYCLES') == 'CYCLES'
for cam in bpy.data.collections['FACE_FIT_CAMERAS'].objects:
    view = cam['inkwave_view']
    if view not in VIEWS:
        continue
    W, H = cam['inkwave_resolution']; a, b, c, d = FACE[view]
    sc.camera = cam; sc.render.resolution_x = round(W * scale); sc.render.resolution_y = round(H * scale)
    sc.render.resolution_percentage = 100
    sc.render.border_min_x = a / W; sc.render.border_max_x = c / W
    sc.render.border_min_y = 1 - d / H; sc.render.border_max_y = 1 - b / H
    for look in LOOKS:
        for o in bare_hide:
            o.hide_render = look != 'beauty'
        if look == 'beauty' and CYC:
            sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
            bpy.context.view_layer.material_override = None
        else:
            sc.render.engine = 'BLENDER_WORKBENCH'; bpy.context.view_layer.material_override = None
            if look == 'beauty':
                sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
            elif look == 'clay':
                sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.62, 0.62, 0.62); sh.show_specular_highlight = True
            elif look == 'normal':
                sh.light = 'MATCAP'; sh.studio_light = 'check_normal+y.exr'; sh.color_type = 'SINGLE'
            else:
                sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (1, 1, 1)
        sc.render.filepath = str(out / f'{view}_{look}.png')
        bpy.ops.render.render(write_still=True)
print('RENDERED', out)
