"""Build an editable Blender master from the current Three.js runtime GLB.

blender --background --python scripts/inkwave_blender_import.py -- \
  --source blender/inkwave_character_source.glb \
  --output blender/INKWAVE_CHARACTER_MASTER.blend \
  --export blender/INKWAVE_CHARACTER_MASTER.glb \
  --game blender/INKWAVE_GAME.glb \
  --render-dir <evidence-dir>

The GLB must come from the modeler itself (scripts/inkwave_export_source.mjs), never from a rebuild here:
the runtime buffers already carry the sculpt, the hair splines and every detail transform. This script only
re-homes them, restores the material intent the glTF round trip cannot carry, and rebuilds the reference and
studio environment. --no-render skips the validation frames; --samples and --world-strength tune them.
"""
import argparse
import base64
import json
import math
import os
import re
import shutil
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_NAMES = ('INKWAVE_CHARACTER', 'INKWAVE_WEAPON')
# Three's bump mapping (r159 perturbNormalArb) normalises the screen-space position derivatives, so bumpScale is a
# height step *per screen pixel*, not per metre. It is calibrated at the modeler's full-body framing (the validation
# cameras resolve ~420-500 px per metre); the tangent normal maps below bake that relief at 500 px/m.
BUMP_PIXELS_PER_METRE = 500.0
CORNEA_EXPORT_ALPHA = 0.01
ENV_SCALE = 1000.0  # runtime environment panels, pushed out until parallax vanishes (see add_studio)
# The glTF exporter omits clearcoatRoughnessFactor when it equals Blender's own default (0.03), and glTF's default is
# 0, so a runtime coat roughness of exactly 0.03 (the cornea) would silently become 0. Nudge it past the check.
BLENDER_DEFAULT_COAT_ROUGHNESS = 0.03


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'blender/inkwave_character_source.glb')
    parser.add_argument('--html', type=Path, default=ROOT / 'INKWAVE_AI_MODELER_FINAL.html')
    parser.add_argument('--output', type=Path, default=ROOT / 'blender/INKWAVE_CHARACTER_MASTER.blend')
    parser.add_argument('--export', type=Path, default=ROOT / 'blender/INKWAVE_CHARACTER_MASTER.glb')
    parser.add_argument('--game', type=Path, default=ROOT / 'blender/INKWAVE_GAME.glb')
    parser.add_argument('--render-dir', type=Path, default=ROOT / 'blender/validation')
    parser.add_argument('--no-render', action='store_true', help='skip the validation renders')
    parser.add_argument('--samples', type=int, default=64, help='Cycles samples for the beauty renders')
    parser.add_argument('--world-strength', type=float, default=1.0,
                        help='multiplier on the ambient/environment term derived from the runtime studio')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def srgb_to_linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear_rgb(hex_color):
    return tuple(srgb_to_linear(int(hex_color.lstrip('#')[i:i + 2], 16) / 255) for i in (0, 2, 4))


def three_to_blender(x, y, z):
    """Runtime space is Y-up with the character facing +Z; Blender is Z-up facing -Y (glTF Y-up import)."""
    return (x, -z, y)


def source_extras(path):
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b'glTF':
        raise ValueError('Expected binary glTF 2.0')
    gltf, binary, offset = None, b'', 12
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if gltf is None:
        raise ValueError('GLB JSON chunk missing')
    roots = [node for node in gltf['nodes'] if node.get('name') in ROOT_NAMES]
    if len(roots) != 1:
        raise ValueError(f'Expected one semantic model root ({" or ".join(ROOT_NAMES)}), found {len(roots)}')
    gltf['_bin'] = binary
    return gltf, roots[0]['name'], roots[0].get('extras', {})


def find_principled(material):
    if not material or not material.use_nodes:
        return None
    return next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)


def socket(node, *names):
    for name in names:
        if name in node.inputs:
            return node.inputs[name]
    return None


def set_socket(node, value, *names):
    found = socket(node, *names)
    if found is not None:
        found.default_value = value


def cycles_branch(material, principled):
    """Second, Cycles-only material output for runtime terms glTF cannot hold.

    The glTF exporter reads the *active* output (target ALL), so the Principled BSDF stays the exact Web-PBR
    material that goes into the GLB, while Cycles renders the INKWAVE_CYCLES output with the extra term added.
    """
    tree = material.node_tree
    exported = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    exported.target = 'ALL'
    exported.label = 'glTF / EEVEE (exported)'
    cycles = tree.nodes.new('ShaderNodeOutputMaterial')
    cycles.name = cycles.label = 'INKWAVE_CYCLES_OUTPUT'
    cycles.target = 'CYCLES'
    cycles.location = exported.location + Vector((0, -260))
    exported.is_active_output = True
    return tree, cycles


def hair_rim(material, principled, translucency):
    """Runtime inkwave-hair-v2 emissive term `albedo * translucency * 0.16 * (1 - |N.V|)^2` (Cycles only).

    The view-independent parts (0.04 floor, lime tip glow, ink glow) are baked into the exported emissive map."""
    tree, cycles = cycles_branch(material, principled)
    facing = tree.nodes.new('ShaderNodeLayerWeight')
    facing.name = 'INKWAVE_HAIR_FACING'
    facing.inputs['Blend'].default_value = 0.5  # Facing output at blend 0.5 is exactly 1 - |N.V|
    square = tree.nodes.new('ShaderNodeMath')
    square.operation = 'POWER'
    square.inputs[1].default_value = 2.0
    tree.links.new(facing.outputs['Facing'], square.inputs[0])
    tint = tree.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    base = principled.inputs['Base Color']
    if base.is_linked:
        tree.links.new(base.links[0].from_socket, tint.inputs['A'])
    else:
        tint.inputs['A'].default_value = base.default_value
    tint.inputs['B'].default_value = (0.16 * translucency,) * 3 + (1.0,)
    emission = tree.nodes.new('ShaderNodeEmission')
    emission.name = 'INKWAVE_HAIR_FRESNEL'
    tree.links.new(tint.outputs['Result'], emission.inputs['Color'])
    tree.links.new(square.outputs[0], emission.inputs['Strength'])
    add = tree.nodes.new('ShaderNodeAddShader')
    tree.links.new(principled.outputs['BSDF'], add.inputs[0])
    tree.links.new(emission.outputs['Emission'], add.inputs[1])
    tree.links.new(add.outputs['Shader'], cycles.inputs['Surface'])


def additive_cornea(material, principled):
    """Three renders the cornea with AdditiveBlending: only its reflections are added over the iris.

    Cycles gets that exactly (transparent + glossy shell). glTF has no additive mode, so the exported branch is a
    BLEND layer with alpha 0.01 that keeps the coat/specular: engines that preserve specular under alpha (Filament,
    Unity HDRP, Unreal translucent) keep the highlight, plain alpha blending shows the bare iris - never the opaque
    black cap the importer produced from BLEND + alpha 1. (Alpha exactly 0 would be exported as MASK and culled.)
    """
    tree, cycles = cycles_branch(material, principled)
    shell = tree.nodes.new('ShaderNodeBsdfPrincipled')
    shell.name = 'INKWAVE_CORNEA_SHELL'
    for field, copy in zip(principled.inputs, shell.inputs):  # same node type: same socket order
        if hasattr(field, 'default_value') and not field.is_linked:
            copy.default_value = field.default_value
    shell.inputs['Alpha'].default_value = 1.0
    through = tree.nodes.new('ShaderNodeBsdfTransparent')
    add = tree.nodes.new('ShaderNodeAddShader')
    tree.links.new(through.outputs['BSDF'], add.inputs[0])
    tree.links.new(shell.outputs['BSDF'], add.inputs[1])
    tree.links.new(add.outputs['Shader'], cycles.inputs['Surface'])
    principled.inputs['Alpha'].default_value = CORNEA_EXPORT_ALPHA
    material.surface_render_method = 'BLENDED'


def glb_image_bytes(gltf, texture_index):
    image = gltf['images'][gltf['textures'][texture_index]['source']]
    if 'bufferView' not in image:
        raise ValueError('bump image is not embedded')
    view = gltf['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    return gltf['_bin'][start:start + view['byteLength']], image.get('mimeType', 'image/png')


def metres_per_uv(material):
    """World metres per UV unit over every triangle carrying `material` (sqrt of world area / UV area)."""
    world_area = uv_area = 0.0
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or not obj.data.uv_layers:
            continue
        slots = [i for i, slot in enumerate(obj.material_slots) if slot.material == material]
        if not slots:
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        tris = mesh.loop_triangles
        count = len(tris)
        verts = np.empty(count * 3, np.int32)
        loops = np.empty(count * 3, np.int32)
        mats = np.empty(count, np.int32)
        tris.foreach_get('vertices', verts)
        tris.foreach_get('loops', loops)
        tris.foreach_get('material_index', mats)
        co = np.empty(len(mesh.vertices) * 3)
        mesh.vertices.foreach_get('co', co)
        matrix = np.array(obj.matrix_world)
        co = co.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
        uv = np.empty(len(mesh.loops) * 2)
        mesh.uv_layers.active.data.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2)
        keep = np.isin(mats, slots)
        p = co[verts.reshape(-1, 3)[keep]]
        t = uv[loops.reshape(-1, 3)[keep]]
        world_area += 0.5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1).sum()
        e1, e2 = t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]
        uv_area += 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum()
    return math.sqrt(world_area / uv_area) if uv_area > 0 else 0.0


def box_filter(values, size):
    """Separable box filter of `size` texels (a mip level's footprint), clamped at the edges like the sampler."""
    radius = int(round(size / 2))
    if radius < 1:
        return values
    for axis in (0, 1):
        padded = np.pad(values, [(radius, radius) if a == axis else (0, 0) for a in (0, 1)], mode='edge')
        total = np.cumsum(padded, axis=axis, dtype=np.float64)
        total = np.insert(total, 0, 0.0, axis=axis)
        span = 2 * radius + 1
        values = (np.take(total, np.arange(span, total.shape[axis]), axis=axis)
                  - np.take(total, np.arange(0, total.shape[axis] - span), axis=axis)) / span
    return values


def restore_bump(gltf, scratch):
    """EXT_materials_bump (runtime bumpMap) -> packed tangent-space normal map, i.e. glTF core normalTexture.

    Blender's importer drops the extension. A tangent normal map is the one representation both Cycles and every
    glTF engine read, so the relief goes in as a Normal Map node; the original height image stays packed in the
    material (unlinked, INKWAVE_BUMP_HEIGHT) as the editable source."""
    restored = {}
    scratch.mkdir(parents=True, exist_ok=True)
    for index, entry in enumerate(gltf.get('materials', [])):
        bump = entry.get('extensions', {}).get('EXT_materials_bump')
        material = bpy.data.materials.get(entry.get('name', ''))
        if not bump or material is None or 'bumpTexture' not in bump:
            continue
        principled = find_principled(material)
        raw, mime = glb_image_bytes(gltf, bump['bumpTexture']['index'])
        path = scratch / f'{material.name}_height.{"png" if mime.endswith("png") else "jpg"}'
        path.write_bytes(raw)
        height_image = bpy.data.images.load(str(path))
        height_image.name = material.name + '_height'
        height_image.colorspace_settings.name = 'Non-Color'
        height_image.pack()
        width, rows = height_image.size
        pixels = np.empty(width * rows * height_image.channels, np.float32)
        height_image.pixels.foreach_get(pixels)
        height = pixels.reshape(rows, width, height_image.channels)[:, :, 0].astype(np.float64)  # Three reads .x
        scale = metres_per_uv(material)
        factor = bump.get('bumpFactor', 1.0)
        distance = factor / BUMP_PIXELS_PER_METRE  # metres of relief per unit height
        # Three differentiates the mip-filtered height across one screen pixel. Where a pixel of the calibration
        # framing covers several texels, pre-filter the height the same way so knit-scale detail averages out
        # exactly as it does in the modeler instead of turning into steep per-texel normals.
        texels = width / (scale * BUMP_PIXELS_PER_METRE) if scale > 0 else 1.0
        height = box_filter(height, texels)
        # Blender image rows run bottom-up, i.e. along +V, which is the tangent-space +Y of glTF and Blender.
        dh_dv, dh_du = np.gradient(height)
        nx = -distance * dh_du * width / scale
        ny = -distance * dh_dv * rows / scale
        length = np.sqrt(nx * nx + ny * ny + 1.0)
        normal = np.stack([nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, 1.0 / length * 0.5 + 0.5,
                           np.ones_like(nx)], axis=-1).astype(np.float32)
        image = bpy.data.images.new(material.name + '_normal', width, rows, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        image.pixels.foreach_set(normal.ravel())
        image.file_format = 'PNG'
        image.pack()
        tree = material.node_tree
        texture = tree.nodes.new('ShaderNodeTexImage')
        texture.name = 'INKWAVE_BUMP_NORMAL'
        texture.image = image
        texture.extension = 'EXTEND'  # the runtime samplers clamp to edge
        mapping = tree.nodes.new('ShaderNodeNormalMap')
        mapping.space = 'TANGENT'
        tree.links.new(texture.outputs['Color'], mapping.inputs['Color'])
        tree.links.new(mapping.outputs['Normal'], principled.inputs['Normal'])
        source = tree.nodes.new('ShaderNodeTexImage')
        source.name = source.label = 'INKWAVE_BUMP_HEIGHT'
        source.image = height_image
        material['inkwave_bump_factor'] = factor
        material['inkwave_bump_metres_per_uv'] = scale
        tilt = float(np.degrees(np.arccos(1.0 / length)).mean())
        restored[material.name] = {'bump_factor': factor, 'metres_per_uv': round(scale, 5), 'size': [width, rows],
                                   'texels_per_pixel': round(texels, 2),
                                   'relief_mm': round(distance * 1000, 3), 'mean_tilt_deg': round(tilt, 2)}
    return restored


def restore_materials(gltf, profile, scratch):
    """Keep every exported Web-PBR factor exactly as the runtime wrote it; only add what glTF could not carry.

    The per-material roughness/coat/sheen values in the source GLB are the runtime's own, so nothing here
    overwrites them. Runtime-only shading is tagged by the modeler in material extras (imported as custom
    properties): `inkwaveShader` = skin | hair-strand | hair-scalp and `inkwaveBlend` = additive.
    """
    category_counts, augmented = {}, {'skin_subsurface': 0, 'hair_fresnel': 0, 'additive_cornea': 0}
    coat_roughness_003 = {entry.get('name') for entry in gltf.get('materials', [])
                          if abs(entry.get('extensions', {}).get('KHR_materials_clearcoat', {}).get('clearcoatRoughnessFactor', -1)
                                 - BLENDER_DEFAULT_COAT_ROUGHNESS) < 1e-6}
    for material in bpy.data.materials:
        bsdf = find_principled(material)
        if bsdf is None or material.name.startswith('INKWAVE_'):
            continue
        name, shader = material.name.lower(), material.get('inkwaveShader', '')
        coat = socket(bsdf, 'Coat Roughness')
        if material.name in coat_roughness_003 and coat is not None and not coat.is_linked:
            coat.default_value = BLENDER_DEFAULT_COAT_ROUGHNESS + 2e-5
        if shader == 'skin':
            # The runtime skin shader warms the light/shadow terminator; a thin subsurface layer is the Cycles
            # equivalent. Subsurface is not part of glTF, so the exported PBR values are unchanged.
            set_socket(bsdf, 0.07, 'Subsurface Weight', 'Subsurface')
            set_socket(bsdf, (1.0, 0.42, 0.25), 'Subsurface Radius')
            set_socket(bsdf, 0.01, 'Subsurface Scale')
            augmented['skin_subsurface'] += 1
        if shader in ('hair-strand', 'hair-scalp'):
            hair_rim(material, bsdf, float(material.get('translucency', 0.35)))
            augmented['hair_fresnel'] += 1
        if material.get('inkwaveBlend') == 'additive':
            additive_cornea(material, bsdf)
            augmented['additive_cornea'] += 1
        category = ('hair' if name.startswith('hair_') else 'skin' if name.startswith('skin_') else
                    'eye' if name.startswith('eyes') else 'brow' if name.startswith('brows') else
                    'cloth' if name.startswith(('clothes', 'legwear', 'headgear')) else
                    'shoe' if name.startswith('shoes') else 'other')
        material['inkwave_role'] = category
        category_counts[category] = category_counts.get(category, 0) + 1
    bump = restore_bump(gltf, scratch)
    return category_counts, augmented, bump


def extract_reference_images(html, target):
    text = html.read_text()
    match = re.search(r'<script type="application/json" id="inkwaveRefImages">(.*?)</script>', text, re.S)
    if not match:
        raise ValueError('Embedded reference image JSON missing')
    data = json.loads(match.group(1))
    target.mkdir(parents=True, exist_ok=True)
    paths = {}
    for key, url in data.items():
        match = re.fullmatch(r'data:image/(jpeg|png);base64,(.*)', url, re.S)
        if not match:
            raise ValueError(f'Unsupported embedded image: {key}')
        path = target / f'{key}.{ "jpg" if match.group(1) == "jpeg" else "png" }'
        raw = base64.b64decode(match.group(2))
        if not path.exists() or path.read_bytes() != raw:
            path.write_bytes(raw)
        paths[key] = path
    return paths


def reference_environment(html, profile, output_dir):
    paths = extract_reference_images(html, output_dir / 'references')
    collection = bpy.data.collections.new('INKWAVE_REFERENCES')
    bpy.context.scene.collection.children.link(collection)
    collection.hide_render = True
    cal = {
        'front': ('front', 566, 1334, 842, -1.1),
        'back': ('back', 561, 1338, 847, 1.1),
        'left': ('left', 575, 1329, 838, 1.1),
        'right': ('left', 575, 1329, 838, -1.1),
    }
    profile_cal = profile.get('view', {}).get('refCalib', {})
    overall = profile.get('shape', {}).get('overallScale', 1)
    for view, (image_key, cx, gy, px_per_m, distance) in cal.items():
        setting = profile_cal.get(view, {})
        scale = setting.get('s', 1) * overall
        hc = (1122 / 2 - cx) / px_per_m * (-1 if view == 'right' else 1)
        vc = (gy - 1402 / 2) / px_per_m
        h = hc * scale + setting.get('x', 0)
        v = vc * scale + setting.get('y', 0)
        bpy.ops.object.empty_add(type='IMAGE')
        obj = bpy.context.object
        obj.name = 'REFERENCE_' + view.upper()
        obj.data = bpy.data.images.load(str(paths[image_key]), check_existing=True)
        obj.data.pack()
        obj.empty_display_type = 'IMAGE'
        obj.empty_display_size = 1122 / px_per_m * scale
        obj.empty_image_offset = (-0.5, -0.5)
        obj.color[3] = profile.get('view', {}).get('referenceOpacity', 0.45)
        obj.hide_render = True
        obj.show_in_front = False
        if view == 'front':
            obj.location = (h, -distance, v)
            obj.rotation_euler = (math.pi / 2, 0, 0)
        elif view == 'back':
            obj.location = (-h, -distance, v)
            obj.rotation_euler = (math.pi / 2, 0, math.pi)
        elif view == 'left':
            obj.location = (distance, -h, v)
            obj.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
        else:
            obj.location = (distance, h, v)
            obj.rotation_euler = (math.pi / 2, 0, math.pi / 2)
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
        obj['inkwave_calibration_px_per_m'] = px_per_m
        obj['inkwave_reference_view'] = view
    # The perspective sheet is a camera overlay in the HTML, not a world-space plane, so it becomes an
    # optional camera background image (see attach_perspective_reference) instead of a fifth empty.
    persp = bpy.data.images.load(str(paths['persp']), check_existing=True)
    persp.pack()
    return collection, persp


def attach_perspective_reference(camera, image, profile):
    """Optional perspective overlay on the validation camera, matching the HTML's camera-space reference."""
    camera.data.show_background_images = True
    background = next((b for b in camera.data.background_images if b.image == image), None) or camera.data.background_images.new()
    background.image = image
    background.alpha = profile.get('view', {}).get('referenceOpacity', 0.45)
    background.display_depth = 'BACK'
    background.frame_method = 'FIT'
    background.show_background_image = False  # off by default: front/side/back empties are the working refs
    return background


def semantic_collections(objects, root_name):
    master = bpy.data.collections.new('INKWAVE_MASTER')
    bpy.context.scene.collection.children.link(master)
    groups = {}
    root = next((obj for obj in objects if obj.name == root_name), None)
    if root is None:
        raise ValueError(f'{root_name} root was not imported')
    for obj in objects:
        ancestor = obj
        while ancestor.parent and ancestor.parent != root:
            ancestor = ancestor.parent
        category = ancestor.name if ancestor.parent == root else 'ROOT'
        collection = master if category == 'ROOT' else groups.get(category)
        if collection is None:
            collection = bpy.data.collections.new(category)
            master.children.link(collection)
            groups[category] = collection
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
    return root, master


def add_studio():
    """Mirror of the runtime's setupStudio() + makeStudioEnv(): same directions, colours and intensities.

    Three's non-legacy DirectionalLight intensity is irradiance and Cycles' sun strength is irradiance in W/m2, so
    the numbers transfer 1:1; like the runtime, only the key light casts shadows. The PMREM environment is a room
    with four emissive panels seen from the origin, i.e. directions only. The panels are rebuilt as the same
    emissive rectangles scaled x1000 about the origin, which keeps their solid angle and radiance but removes
    parallax - exactly what an environment map is. They are hidden from the camera and the viewport.
    """
    lights = bpy.data.collections.new('INKWAVE_STUDIO')
    bpy.context.scene.collection.children.link(lights)
    made = {}
    for name, position, color, energy in [
        ('KEY', (-2.6, 3.8, 4.2), '#fff4ea', 2.7),
        ('FILL', (4.5, 1.2, 2.5), '#e8f0ff', 0.42),
        ('RIM', (1.5, 3.2, -4.8), '#dff4ff', 1.35),
        ('RIM2', (-3.5, 2.0, -3.0), '#ffffff', 0.6),
    ]:
        lamp = bpy.data.lights.new(name, 'SUN')
        lamp.energy = energy
        lamp.color = linear_rgb(color)
        lamp.angle = math.radians(2.5)
        lamp.use_shadow = name == 'KEY'
        obj = bpy.data.objects.new(name, lamp)
        lights.objects.link(obj)
        obj.location = three_to_blender(*position)
        # The runtime aims its key light at the head; every other light looks at the origin.
        target = Vector(three_to_blender(0, 0.8, 0)) if name == 'KEY' else Vector((0, 0, 0))
        obj.rotation_euler = (target - Vector(obj.location)).to_track_quat('-Z', 'Y').to_euler()
        made[name] = obj
    for name, (width, height), position, look, radiance in [
        ('ENV_PANEL_KEY', (4, 3), (2.5, 5, 4), (0, 1, 0), (5.0, 5.0, 5.0)),
        ('ENV_PANEL_SIDE', (3, 5), (-5, 2.5, 1), (0, 1, 0), (0.9 * 1.8, 0.95 * 1.8, 1.8)),
        ('ENV_PANEL_BACK', (5, 2), (0, 3, -5), (0, 1, 0), (0.85 * 3.0, 0.95 * 3.0, 3.0)),
        ('ENV_FLOOR', (8, 8), (0, -0.9, 0), (0, 5, 0), (0.55, 0.55, 0.58)),
    ]:
        mesh = bpy.data.meshes.new(name)
        w, h = width * ENV_SCALE / 2, height * ENV_SCALE / 2
        mesh.from_pydata([(-w, -h, 0), (w, -h, 0), (w, h, 0), (-w, h, 0)], [], [(0, 1, 2, 3)])
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        tree = material.node_tree
        tree.nodes.clear()
        emission = tree.nodes.new('ShaderNodeEmission')
        emission.inputs['Color'].default_value = radiance + (1.0,)
        emission.inputs['Strength'].default_value = 1.0
        output = tree.nodes.new('ShaderNodeOutputMaterial')
        tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        lights.objects.link(obj)
        obj.location = Vector(three_to_blender(*position)) * ENV_SCALE
        # Object3D.lookAt on a mesh points local +Z at the target with world-up Y (Blender Z).
        obj.rotation_euler = (Vector(three_to_blender(*look)) * ENV_SCALE - obj.location).to_track_quat('Z', 'Y').to_euler()
        obj.visible_camera = False
        obj.hide_viewport = True
        made[name] = obj
    return lights


def add_world(strength=1.0):
    """Ambient/reflection term for the runtime's HemisphereLight + PMREM room.

    Without it every glossy part - the eyes above all - reflects a black void and reads far darker than the
    modeler. A uniform background of radiance L gives irradiance pi*L, so the hemisphere light's
    `colour * intensity` irradiance becomes `colour * intensity / pi` of background radiance, added to the
    room grey the runtime environment map is built from.
    """
    hemi_intensity = 0.32 / math.pi
    room = linear_rgb('#5a5f69')
    ground = tuple(c * hemi_intensity + r for c, r in zip(linear_rgb('#3a3e46'), room))
    sky = tuple(c * hemi_intensity + r for c, r in zip(linear_rgb('#f2f6ff'), room))
    world = bpy.data.worlds.new('INKWAVE_WORLD')
    bpy.context.scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    output = tree.nodes.new('ShaderNodeOutputWorld')
    background = tree.nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = strength
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = ground + (1.0,)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = sky + (1.0,)
    height = tree.nodes.new('ShaderNodeMapRange')
    # Geometry > Incoming points back along the ray, so looking up gives -1: map it the other way round.
    height.inputs['From Min'].default_value = 1.0
    height.inputs['From Max'].default_value = -1.0
    separate = tree.nodes.new('ShaderNodeSeparateXYZ')
    geometry = tree.nodes.new('ShaderNodeNewGeometry')
    tree.links.new(geometry.outputs['Incoming'], separate.inputs['Vector'])
    tree.links.new(separate.outputs['Z'], height.inputs['Value'])
    tree.links.new(height.outputs['Result'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], background.inputs['Color'])
    tree.links.new(background.outputs['Background'], output.inputs['Surface'])
    black = bpy.data.worlds.new('INKWAVE_MASK_WORLD')
    black.use_nodes = True  # Blender 5 worlds render their node tree; its default background is 0.05 grey
    for node in black.node_tree.nodes:
        if node.type == 'BACKGROUND':
            node.inputs['Color'].default_value = (0, 0, 0, 1)
            node.inputs['Strength'].default_value = 0.0
    black.color = (0, 0, 0)
    return world, black


def set_camera(view):
    px = {'front': (566, 1334, 842), 'right': (575, 1329, 838),
          'back': (561, 1338, 847), 'left': (575, 1329, 838)}
    camera = bpy.data.objects.get('INKWAVE_VALIDATION_CAMERA')
    if camera is None:
        camera = bpy.data.objects.new('INKWAVE_VALIDATION_CAMERA', bpy.data.cameras.new('INKWAVE_VALIDATION_CAMERA'))
        bpy.context.scene.collection.objects.link(camera)
    if view in px:
        cx, gy, scale = px[view]
        hc = (1122 / 2 - cx) / scale
        vc = (gy - 1402 / 2) / scale
        if view == 'front':
            camera.location = (hc, -10, vc)
        elif view == 'back':
            camera.location = (-hc, 10, vc)
        elif view == 'right':
            camera.location = (10, hc, vc)
        else:
            camera.location = (-10, -hc, vc)
        target = Vector((camera.location.x if view in ('front', 'back') else 0,
                         camera.location.y if view in ('left', 'right') else 0, vc))
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 1402 / scale
        bpy.context.scene.render.resolution_x = 561
        bpy.context.scene.render.resolution_y = 701
    else:
        az, el, dist = -0.55, 0.08, 3.3
        target = Vector((0, 0, 0.8))
        camera.location = (math.sin(az) * math.cos(el) * dist,
                           -math.cos(az) * math.cos(el) * dist,
                           target.z + math.sin(el) * dist)
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'PERSP'
        camera.data.lens = 50
        camera.data.sensor_fit = 'VERTICAL'
        camera.data.sensor_height = 2 * camera.data.lens * math.tan(math.radians(30) / 2)
        bpy.context.scene.render.resolution_x = 700
        bpy.context.scene.render.resolution_y = 875
    bpy.context.scene.camera = camera
    return camera


def render_validation(directory, studio, black_world, samples=64):
    """Five silhouette masks + five linear-light beauty frames.

    The beauty pass is written as scene-linear OpenEXR on purpose: Blender has no ACES filmic view transform,
    so scripts/inkwave_view_compare.py applies the runtime's exact ACES fit and exposure to both sides. That
    keeps the comparison about shading instead of two different colour pipelines.
    """
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    views = ('front', 'right', 'back', 'left', 'perspective')
    scene.render.engine = 'CYCLES'
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = 0.0
    lit_world = scene.world
    mask = bpy.data.materials.new('INKWAVE_MASK_WHITE')
    mask.use_nodes = True
    nodes = mask.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1, 1, 1, 1)
    emission.inputs['Strength'].default_value = 1
    output = nodes.new('ShaderNodeOutputMaterial')
    mask.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    view_layer = bpy.context.view_layer
    for obj in studio.objects:
        obj.hide_render = True
    scene.world = black_world
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    view_layer.material_override = mask
    for view in views:
        set_camera(view)
        scene.render.filepath = str(directory / f'blender_{view}_mask.png')
        bpy.ops.render.render(write_still=True)
    view_layer.material_override = None
    scene.world = lit_world
    for obj in studio.objects:
        obj.hide_render = False
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.image_settings.exr_codec = 'ZIP'
    for view in views:
        set_camera(view)
        scene.render.filepath = str(directory / f'blender_{view}_beauty.exr')
        bpy.ops.render.render(write_still=True)
    scene.render.image_settings.file_format = 'PNG'
    bpy.data.materials.remove(mask)


def relative(path):
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def main():
    opts = args()
    for path in (opts.source, opts.html):
        if not path.exists():
            raise FileNotFoundError(path)
    opts.output.parent.mkdir(parents=True, exist_ok=True)
    opts.export.parent.mkdir(parents=True, exist_ok=True)
    gltf, root_name, extras = source_extras(opts.source)
    profile = extras.get('profile', {})
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(opts.source), merge_vertices=False)
    imported = list(bpy.context.selected_objects)
    root, master = semantic_collections(imported, root_name)
    scratch = Path(os.environ.get('TMPDIR') or opts.output.parent / '.scratch') / 'inkwave_bump'
    categories, augmented, bump = restore_materials(gltf, profile, scratch)
    refs, persp = reference_environment(opts.html, profile, opts.output.parent)
    studio = add_studio()
    lit_world, black_world = add_world(opts.world_strength)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.film_transparent = False
    source_text = bpy.data.texts.new('INKWAVE_SOURCE_PROFILE.json')
    source_text.write(json.dumps(profile, indent=2, ensure_ascii=False))
    meshes = [obj for obj in imported if obj.type == 'MESH']
    root['source_glb'] = opts.source.name
    root['source_tris'] = sum(len(obj.data.polygons) for obj in meshes)
    root['source_object_count'] = len(meshes)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 2.4
            area.spaces.active.clip_start = 0.001
            area.spaces.active.clip_end = 100
            area.spaces.active.shading.type = 'MATERIAL'
    camera = set_camera('perspective')
    attach_perspective_reference(camera, persp, profile)
    bpy.ops.wm.save_as_mainfile(filepath=str(opts.output))
    if not opts.no_render:
        render_validation(opts.render_dir, studio, black_world, opts.samples)
    # Export only the character hierarchy; references, lights and camera stay behind in the .blend.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(opts.export), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_normals=True,
                              export_texcoords=True, export_materials='EXPORT', export_extras=True,
                              export_cameras=False, export_lights=False)
    opts.game.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(opts.export, opts.game)
    # Hand the file over in the state a human wants to open it in: lit world, AgX view, perspective camera.
    scene.world = lit_world
    scene.render.engine = 'CYCLES'
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    set_camera('perspective')
    bpy.ops.wm.save_as_mainfile(filepath=str(opts.output))
    backup = opts.output.with_suffix(opts.output.suffix + '1')
    if backup.exists() and opts.output.exists():
        backup.unlink()  # Blender's own .blend1 rollback copy: regenerable, never committed
    report = {
        'blender_version': bpy.app.version_string,
        'source_meshes': len(meshes),
        'source_triangles': sum(len(obj.data.polygons) for obj in meshes),
        'source_materials': len({mat.name for obj in meshes for mat in obj.data.materials}),
        'material_roles': categories,
        'blender_only_shading': augmented,
        'bump_to_normal_maps': bump,
        'reference_empties': len(refs.objects),
        'perspective_reference': persp.name,
        'collections': sorted(child.name for child in master.children),
        'studio_lights': sorted(obj.name for obj in studio.objects),
        'world_strength': opts.world_strength,
        'beauty_samples': opts.samples,
        'output_blend': relative(opts.output),
        'output_glb': relative(opts.export),
        'output_game_glb': relative(opts.game),
    }
    (opts.output.parent / 'migration_counts.json').write_text(json.dumps(report, indent=2))
    print('INKWAVE_MIGRATION_REPORT ' + json.dumps(report))


if __name__ == '__main__':
    main()
