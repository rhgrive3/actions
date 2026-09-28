"""Cycles eye renders matching prior iteration beauty (1480x1160 at scale 4).
Usage: blender --background <blend> --python scripts/render_eye_cycles.py -- <out_dir> [scale] [views_csv] [samples]
Writes <view>_after_beauty.png (CYCLES, studio world, all parts).
"""
import sys
from pathlib import Path
import bpy
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
scale = float(argv[1]) if len(argv) > 1 else 4.0
views = (argv[2].split(',') if len(argv) > 2 else ['front', 'q34R', 'sideR'])
samples = int(argv[3]) if len(argv) > 3 else 48
sc = bpy.context.scene
orig = bpy.data.collections['FACE_FIT_ORIGINAL'].objects
live = {o.name[:-len('__prefit')]: bpy.data.objects[o.name[:-len('__prefit')]] for o in orig}
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
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
    sc.render.filepath = str(out / f'{view}_after_beauty.png')
    bpy.ops.render.render(write_still=True)
print('RENDER_EYE_CYCLES', out, views, scale, samples)
