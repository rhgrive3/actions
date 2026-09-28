"""Face review renders of the Blender master in the reference-sheet framings.

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_views.py -- \
  --out <dir> [--views front,q34,side,profile] [--passes beauty,clay,normal,index] [--samples 64] \
  [--clay-only '^HEAD_face$']

The .blend is only read, never saved. Framings are the ones the face analysis fitted to the reference sheets
(`analysis/README.md`, `analysis/jobs_review.json`):

  front    orthographic, front calibration (566, 1334, 842 px/m), reference box 465,95 - 665,295 at 3.5x (700x700)
  q34      orbit camera az -0.35, el -0.28, distance 3.3, target (0, 1.365, 0) runtime, vertical FOV 5.5 deg
  side     orbit camera az -0.95, el -0.15 (the side sheet is not a true profile; the face turns ~40 deg to camera)
  profile  orthographic true right profile of the head (model-only checks; no reference sheet exists for it)

Per view it writes `<view>_beauty.exr` (scene-linear, full character, studio of the master), `<view>_clay.png`
(no hair/headgear/clothes, grey clay under the same studio), `<view>_normal.exr` (bare head, camera-space shading
normals as n*0.5+0.5, alpha = coverage; both EXRs get a float16 `.npy` sidecar) and `<view>_index.png` (bare head, object classes, no anti-aliasing:
1 face, 2 ears, 3 neck/torso, 4 eyes, 5 brows, 6 skin decals, 7 other body). `views.json` records every camera.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

FRONT = dict(cx=566.0, gy=1334.0, s=842.0, box=(465, 95, 665, 295), scale=3.5)
ORBIT = {'q34': (-0.35, -0.28), 'side': (-0.95, -0.15)}
ORBIT_DIST, ORBIT_FOV, ORBIT_TARGET, ORBIT_PX = 3.3, 5.5, Vector((0.0, 0.0, 1.365)), 700
BARE_HIDE = ('HAIR', 'HEADGEAR', 'CLOTHES', 'LEGWEAR', 'SHOES')


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--views', default='front,q34,side,profile')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--passes', default='beauty,clay,normal,index')
    parser.add_argument('--clay-only', help='regex: the clay pass shows only the model meshes whose name matches')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def model_objects():
    root = bpy.data.objects['INKWAVE_CHARACTER']
    return [obj for obj in root.children_recursive if obj.type == 'MESH']


def object_class(obj):
    name = obj.name
    if name == 'HEAD_face':
        return 1
    if name in ('HEAD_face_02', 'HEAD_face_03'):
        return 2
    if name == 'BODY_torso':
        return 3
    for index, prefix in ((4, 'HEAD_eyes'), (5, 'HEAD_brows'), (6, 'HEAD_skin')):
        if name.startswith(prefix):
            return index
    return 7 if name.startswith('BODY') else 0


def camera(view):
    cam = bpy.data.objects.get('INKWAVE_FACE_CAMERA')
    if cam is None:
        cam = bpy.data.objects.new('INKWAVE_FACE_CAMERA', bpy.data.cameras.new('INKWAVE_FACE_CAMERA'))
        bpy.context.scene.collection.objects.link(cam)
    scene = bpy.context.scene
    cam.data.clip_start, cam.data.clip_end = 0.01, 50.0
    cam.data.shift_x = cam.data.shift_y = 0.0
    if view == 'front':
        x0, y0, x1, y1 = FRONT['box']
        width = (x1 - x0) / FRONT['s']
        cx = ((x0 + x1) / 2 - FRONT['cx']) / FRONT['s']
        cz = (FRONT['gy'] - (y0 + y1) / 2) / FRONT['s']
        cam.location = (cx, -10.0, cz)
        cam.rotation_euler = (Vector((cx, 0.0, cz)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = width
        scene.render.resolution_x = round((x1 - x0) * FRONT['scale'])
        scene.render.resolution_y = round((y1 - y0) * FRONT['scale'])
    elif view == 'profile':
        # True right profile (camera on the character's right, -X), head framing 0.26 m.
        cam.location = (-10.0, -0.02, 1.36)
        cam.rotation_euler = (Vector((0.0, -0.02, 1.36)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = 0.26
        scene.render.resolution_x = scene.render.resolution_y = 700
    else:
        az, el = ORBIT[view]
        cam.location = ORBIT_TARGET + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * ORBIT_DIST
        cam.rotation_euler = (ORBIT_TARGET - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'PERSP'
        cam.data.lens = 50
        cam.data.sensor_fit = 'VERTICAL'
        cam.data.sensor_height = 2 * cam.data.lens * math.tan(math.radians(ORBIT_FOV) / 2)
        scene.render.resolution_x = scene.render.resolution_y = ORBIT_PX
    scene.camera = cam
    bpy.context.view_layer.update()
    return cam


def emission_material(name, build):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    emit = tree.nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = 1.0
    tree.links.new(emit.outputs[0], out.inputs['Surface'])
    build(tree, emit)
    return mat


def normal_build(tree, emit):
    geo = tree.nodes.new('ShaderNodeNewGeometry')
    to_cam = tree.nodes.new('ShaderNodeVectorTransform')
    to_cam.vector_type = 'NORMAL'
    to_cam.convert_from, to_cam.convert_to = 'WORLD', 'CAMERA'
    # Blender camera space looks down +Z; flip Z so the encoding matches three's view space (Z toward the viewer).
    flip = tree.nodes.new('ShaderNodeVectorMath')
    flip.operation = 'MULTIPLY'
    flip.inputs[1].default_value = (0.5, 0.5, -0.5)
    add = tree.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    add.inputs[1].default_value = (0.5, 0.5, 0.5)
    tree.links.new(geo.outputs['Normal'], to_cam.inputs['Vector'])
    tree.links.new(to_cam.outputs['Vector'], flip.inputs[0])
    tree.links.new(flip.outputs[0], add.inputs[0])
    tree.links.new(add.outputs[0], emit.inputs['Color'])


def index_build(tree, emit):
    info = tree.nodes.new('ShaderNodeObjectInfo')
    scale = tree.nodes.new('ShaderNodeMath')
    scale.operation = 'DIVIDE'
    scale.inputs[1].default_value = 255.0
    tree.links.new(info.outputs['Object Index'], scale.inputs[0])
    tree.links.new(scale.outputs[0], emit.inputs['Color'])


def clay_material():
    mat = bpy.data.materials.get('INKWAVE_FACE_CLAY') or bpy.data.materials.new('INKWAVE_FACE_CLAY')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.55, 0.55, 0.55, 1)
    bsdf.inputs['Roughness'].default_value = 0.6
    return mat


def to_npy(path):
    """Sidecar float16 RGBA array (top row first): pip OpenCV builds often cannot read OpenEXR."""
    import numpy as np
    image = bpy.data.images.load(str(path), check_existing=False)
    w, h = image.size
    data = np.empty(w * h * 4, np.float32)
    image.pixels.foreach_get(data)
    np.save(path.with_suffix('.npy'), data.reshape(h, w, 4)[::-1].astype(np.float16))
    bpy.data.images.remove(image)


def main():
    opts = args()
    opts.out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    layer = bpy.context.view_layer
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    objs = model_objects()
    for obj in objs:
        obj.pass_index = object_class(obj)
    bare_hidden = [o for o in objs if any(c.name in BARE_HIDE for c in o.users_collection)]
    if opts.clay_only:
        import re
        bare_hidden = [o for o in objs if not re.search(opts.clay_only, o.name)]
    lit_world = scene.world
    black = bpy.data.worlds.get('INKWAVE_MASK_WORLD')
    studio = bpy.data.collections['INKWAVE_STUDIO']
    normal_mat = emission_material('INKWAVE_FACE_NORMAL', normal_build)
    index_mat = emission_material('INKWAVE_FACE_INDEX', index_build)
    clay = clay_material()
    record = {'blend': bpy.data.filepath, 'blender': bpy.app.version_string, 'views': {}}

    def render(path, fmt, samples, denoise, transparent=False, filt=1.5):
        scene.cycles.samples = samples
        scene.cycles.use_denoising = denoise
        scene.cycles.pixel_filter_type = 'BLACKMAN_HARRIS'
        scene.cycles.filter_width = filt
        scene.render.film_transparent = transparent
        s = scene.render.image_settings
        if fmt == 'EXR':
            s.file_format, s.color_depth, s.exr_codec, s.color_mode = 'OPEN_EXR', '32', 'ZIP', 'RGBA'
        else:
            s.file_format, s.color_depth, s.color_mode = 'PNG', '8', 'RGBA' if transparent else 'RGB'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        if fmt == 'EXR':
            to_npy(path)

    for view in [v for v in opts.views.split(',') if v]:
        cam = camera(view)
        mw = cam.matrix_world
        record['views'][view] = {
            'type': cam.data.type, 'location': list(cam.location), 'matrix_world': [list(r) for r in mw],
            'ortho_scale': cam.data.ortho_scale, 'lens': cam.data.lens, 'sensor_height': cam.data.sensor_height,
            'resolution': [scene.render.resolution_x, scene.render.resolution_y]}
        # Beauty: the master exactly as saved (studio, world, every part).
        scene.world = lit_world
        for obj in studio.objects:
            obj.hide_render = False
        for obj in objs:
            obj.hide_render = False
        layer.material_override = None
        passes = opts.passes.split(',')
        if 'beauty' in passes:
            render(opts.out / f'{view}_beauty.exr', 'EXR', opts.samples, True)
        # Clay: bare head and body under the same studio.
        for obj in bare_hidden:
            obj.hide_render = True
        layer.material_override = clay
        if 'clay' in passes:
            render(opts.out / f'{view}_clay.png', 'PNG', max(16, opts.samples // 2), True)
        # Normals and object classes: emission only, no lights, transparent film for coverage.
        for obj in studio.objects:
            obj.hide_render = True
        scene.world = black
        layer.material_override = normal_mat
        if 'normal' in passes:
            render(opts.out / f'{view}_normal.exr', 'EXR', 4, False, transparent=True)
        layer.material_override = index_mat
        scene.view_settings.view_transform = 'Raw'  # PNG value = class index: no view transform, no dither
        scene.render.dither_intensity = 0.0
        if 'index' in passes:
            render(opts.out / f'{view}_index.png', 'PNG', 1, False, transparent=False, filt=0.01)
        scene.view_settings.view_transform = 'Standard'
        for obj in bare_hidden:
            obj.hide_render = False
        layer.material_override = None
        scene.world = lit_world
        for obj in studio.objects:
            obj.hide_render = False
    (opts.out / 'views.json').write_text(json.dumps(record, indent=1))
    print('INKWAVE_FACE_VIEWS ' + json.dumps({k: v['resolution'] for k, v in record['views'].items()}))


if __name__ == '__main__':
    main()
