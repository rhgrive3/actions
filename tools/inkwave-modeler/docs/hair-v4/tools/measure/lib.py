# GUI 内の共通関数: 5 方向カメラで描く。show に入るコレクション/名前前方一致だけ描く。
import sys, os, bpy
sys.path.insert(0, '/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/analysis/hair-rebuild')
import importlib, sheetcam; importlib.reload(sheetcam)
def render5(out, cols=('HEAD','BODY','CLOTHES'), extra=(), engine='BLENDER_WORKBENCH', views=None, scale=2, color='MATERIAL', light='STUDIO'):
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    old = {o.name: o.hide_render for o in bpy.data.objects}
    for o in bpy.data.objects:
        if o.type not in ('MESH','CURVE'): continue
        names = {c.name for c in o.users_collection}
        on = bool(names & set(cols)) or any(o.name.startswith(p) for p in extra)
        if 'INKWAVE_MASTER' in names and not on:
            # master は他のコレクションとも重なる。parent 名で判定
            p = o.parent
            while p is not None and not on:
                on = p.name in cols; p = p.parent
        o.hide_render = not on
    sc.render.engine = engine
    if engine == 'BLENDER_WORKBENCH':
        sc.display.shading.light = light; sc.display.shading.color_type = color
        sc.display.shading.single_color = (0.62, 0.64, 0.66)
    sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    for v in (views or sheetcam.BOX):
        sheetcam.use(v, scale)
        sc.render.filepath = os.path.join(out, f'{v}.png')
        bpy.ops.render.render(write_still=True)
    for n, h in old.items():
        bpy.data.objects[n].hide_render = h
