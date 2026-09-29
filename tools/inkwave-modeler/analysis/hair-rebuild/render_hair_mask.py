"""新しい髪（HAIR_REBUILD_V2）だけを、検証済みカメラで 448x560 のマスクとして描く。"""
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
from refcam import set_camera
argv = sys.argv[sys.argv.index('--') + 1:]
out = Path(argv[0]); out.mkdir(parents=True, exist_ok=True)
colname = argv[1] if len(argv) > 1 else 'HAIR_REBUILD_V2'
bpy.data.collections[colname].hide_render = False
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (1, 1, 1)
sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
sc.render.resolution_x = 448; sc.render.resolution_y = 560; sc.render.resolution_percentage = 100
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = colname not in {c.name for c in o.users_collection}
for view in ('front', 'back', 'left', 'persp'):
    set_camera(view)
    sc.render.filepath = str(out / f'hair_{view}.png')
    bpy.ops.render.render(write_still=True)
print('HAIR_MASK_DONE')
