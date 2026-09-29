"""Flat object-colour render of the eye parts (no anti-aliasing): sclera R, iris/cornea G, liner+lashes B, everything else black; hair hidden.
blender -b x.blend --python render_eyemask.py -- <out_dir> [scale=6] ; env VIEWS=front,... ; writes <view>_eyemask.png"""
import os, sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
scale = float(argv[1]) if len(argv) > 1 else 6.0
VIEWS = os.environ.get('VIEWS', 'front,q34L,sideL,q34R,sideR').split(',')
FACE = {'front': (115, 60, 265, 210), 'q34L': (80, 60, 230, 210), 'sideL': (40, 70, 190, 220),
        'q34R': (140, 60, 290, 210), 'sideR': (180, 70, 330, 220)}
if os.environ.get('BOX'):
    for part in os.environ['BOX'].split(';'):
        v, vals = part.split('='); FACE[v] = tuple(float(x) for x in vals.split(','))
sc = bpy.context.scene
SCLERA = {'HEAD_eyes', 'HEAD_eyes_18'}
IRIS = {'HEAD_eyes_02', 'HEAD_eyes_19'}
LASH = {'HEAD_eyes_03', 'HEAD_eyes_20', 'HEAD_eyes_12', 'HEAD_eyes_29', 'HEAD_eyes_13', 'HEAD_eyes_30'} | {f'HEAD_eyes_{i:02d}' for i in list(range(5, 12)) + list(range(22, 29))}
for o in bpy.data.collections['FACE_FIT_ORIGINAL'].objects:
    o.hide_render = True
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_render:
        continue
    cols = {c.name for c in o.users_collection}
    if cols & {'HAIR', 'HEADGEAR', 'CLOTHES'} or o.name.startswith('HAIR'):
        o.hide_render = True; continue
    o.color = (1, 0, 0, 1) if o.name in SCLERA else (0, 1, 0, 1) if o.name in IRIS else (0, 0, 1, 1) if o.name in LASH else (0, 0, 0, 1)
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'OBJECT'
sc.display.render_aa = 'OFF'
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
sc.render.use_border = True; sc.render.use_crop_to_border = True
try:
    sc.world.color = (0, 0, 0)
except Exception:
    pass
for cam in bpy.data.collections['FACE_FIT_CAMERAS'].objects:
    view = cam['inkwave_view']
    if view not in VIEWS:
        continue
    W, H = cam['inkwave_resolution']; a, b, c, d = FACE[view]
    sc.camera = cam; sc.render.resolution_x = round(W * scale); sc.render.resolution_y = round(H * scale); sc.render.resolution_percentage = 100
    sc.render.border_min_x = a / W; sc.render.border_max_x = c / W
    sc.render.border_min_y = 1 - d / H; sc.render.border_max_y = 1 - b / H
    sc.render.filepath = str(out / f'{view}_eyemask.png')
    bpy.ops.render.render(write_still=True)
print('RENDERED', out)
