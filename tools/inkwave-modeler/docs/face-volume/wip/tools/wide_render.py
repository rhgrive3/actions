"""wide_render.py -- <out_dir> [k=2.2] : the fitted cameras widened k times about their centre (same sheet-pixel scale),
env VIEWS, LOOKS (beauty, clay, mask_all, mask_head), SAMPLES. Output <view>_<look>.png of size (370k, 290k);
env JAWCROP=1: Cycles renders only the jaw / neck box of the view (render border, same image size, black outside);
env CROP=face: the same for the whole face box;
sheet pixel (x, y) of the camera box maps to render pixel (x - box_x0 + 185(k-1), y - box_y0 + 145(k-1))."""
import os, sys, bpy
from pathlib import Path
a = sys.argv[sys.argv.index('--') + 1:]
out = Path(a[0]); out.mkdir(parents=True, exist_ok=True)
k = float(a[1]) if len(a) > 1 else 2.2
VIEWS = os.environ.get('VIEWS', 'sideL,sideR').split(',')
LOOKS = os.environ.get('LOOKS', 'beauty,mask_all,mask_head').split(',')
sc = bpy.context.scene
VB = {'front': (60, 230), 'q34L': (470, 230), 'sideL': (880, 230), 'q34R': (1370, 230), 'sideR': (1790, 230)}   # = prof_cmp.VB
JAW = {'front': (150, 375, 330, 476), 'sideR': (1925, 375, 2112, 476), 'sideL': (850, 375, 1040, 476),
       'q34R': (1455, 370, 1635, 472), 'q34L': (440, 370, 620, 472)}      # sheet px
FACE = {'front': (110, 250, 360, 476), 'sideR': (1890, 250, 2125, 476), 'sideL': (835, 250, 1075, 476),
        'q34R': (1420, 250, 1660, 476), 'q34L': (410, 250, 650, 476)}      # env CROP=face
for o in bpy.data.collections['FACE_FIT_ORIGINAL'].objects:
    o.hide_render = True
hair = [o for o in bpy.data.objects if o.type == 'MESH' and any(c.name in ('HAIR', 'HEADGEAR') for c in o.users_collection)]
cloth = [o for o in bpy.data.objects if o.type == 'MESH' and any(c.name in ('CLOTHES',) for c in o.users_collection)]
keep_all = {o.name for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render}
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False; sc.render.use_border = False
for cam in bpy.data.collections['FACE_FIT_CAMERAS'].objects:
    view = cam['inkwave_view']
    if view not in VIEWS:
        continue
    W, H = cam['inkwave_resolution']
    d = cam.data
    d.sensor_width *= k; d.shift_x /= k; d.shift_y /= k
    m = float(os.environ.get('SCALE', '1'))
    sc.camera = cam; sc.render.resolution_x = round(W * k * m); sc.render.resolution_y = round(H * k * m); sc.render.resolution_percentage = 100
    for look in LOOKS:
        only = os.environ.get('ONLY_' + look.upper())
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.name in keep_all:
                o.hide_render = bool(only) and o.name not in only.split(',')
        for o in hair:
            o.hide_render = look == 'mask_head' or (bool(only) and o.name not in only.split(','))
        for o in cloth:
            o.hide_render = look == 'mask_head' or (bool(only) and o.name not in only.split(','))
        if look == 'beauty':
            sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('SAMPLES', '24')); sc.cycles.use_denoising = True
        else:
            sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
            if look == 'clay':
                sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.62, 0.62, 0.62)
            else:
                sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (1, 1, 1)
            sc.display.render_aa = '8'
            sc.world.color = (0, 0, 0)
        sc.render.use_border = False
        BOX = FACE if os.environ.get('CROP') == 'face' else JAW
        if (os.environ.get('JAWCROP') or os.environ.get('CROP')) and look == 'beauty' and view in BOX:
            ox, oy = VB[view]
            x0, y0, x1, y1 = BOX[view]
            fx = lambda x: (x - ox + 185 * (k - 1)) / (W * k)
            fy = lambda y: (y - oy + 145 * (k - 1)) / (H * k)
            sc.render.use_border, sc.render.use_crop_to_border = True, False
            sc.render.border_min_x, sc.render.border_max_x = max(fx(x0), 0), min(fx(x1), 1)
            sc.render.border_min_y, sc.render.border_max_y = max(1 - fy(y1), 0), min(1 - fy(y0), 1)
        sc.render.filepath = str(out / f'{view}_{look}.png')
        bpy.ops.render.render(write_still=True)
    d.sensor_width /= k; d.shift_x *= k; d.shift_y *= k
print('WIDE', out)
