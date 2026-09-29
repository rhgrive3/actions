"""髪以外（体・服・顔・靴・頭の装備）だけを、検証済みの参照カメラで 448x560 のマスクとして描く。
blender -b <candidate.blend> --python render_body_mask.py -- <out_dir>
"""
import math, sys
from pathlib import Path
import bpy
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--') + 1]); out.mkdir(parents=True, exist_ok=True)
sc = bpy.context.scene


def set_camera(view):
    px = {'front': (566, 1334, 842), 'back': (561, 1338, 847), 'left': (575, 1329, 838)}
    cam = bpy.data.objects['INKWAVE_VALIDATION_CAMERA']
    if view in px:
        cx, gy, s = px[view]
        hc = (1122 / 2 - cx) / s; vc = (gy - 1402 / 2) / s
        cam.location = {'front': (hc, -10, vc), 'back': (-hc, 10, vc), 'left': (-10, -hc, vc)}[view]
        t = Vector((cam.location.x if view in ('front', 'back') else 0, cam.location.y if view == 'left' else 0, vc))
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1402 / s
    else:
        az, el, dist = -0.55, 0.08, 3.3
        t = Vector((0, 0, 0.8))
        cam.location = (math.sin(az) * math.cos(el) * dist, -math.cos(az) * math.cos(el) * dist, t.z + math.sin(el) * dist)
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.sensor_fit = 'VERTICAL'
        cam.data.sensor_height = 2 * 50 * math.tan(math.radians(30) / 2)
    sc.camera = cam


sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (1, 1, 1)
sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
sc.render.resolution_x = 448; sc.render.resolution_y = 560; sc.render.resolution_percentage = 100
keep = {'HEAD', 'BODY', 'CLOTHES', 'SHOES', 'LEGWEAR', 'HEADGEAR'}
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = not ({c.name for c in o.users_collection} & keep)
for label, names in [('all', None), ('head', {'HEAD'})]:
    if names:
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.hide_render = not ({c.name for c in o.users_collection} & names)
    for view in ('front', 'back', 'left', 'persp'):
        set_camera(view)
        sc.render.filepath = str(out / f'body_{label}_{view}.png')
        bpy.ops.render.render(write_still=True)
print('BODY_MASK_DONE')
