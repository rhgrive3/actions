"""Reopen check for the saved Blender master, run in a fresh Blender process.

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_blender_reopen_check.py -- \
  --out <dir> [--samples 16]

Proves the .blend stands on its own: every image is packed (nothing points at a scratch or evidence path), the
semantic collections, reference empties and studio survive a save/load, one frame renders, and the file exports a
GLB again. <dir> receives reopen_perspective.png, reopen_export.glb and reopen_check.json; run
scripts/inkwave_roundtrip_qa.mjs on reopen_export.glb to prove the re-export is still the runtime surface.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--samples', type=int, default=16)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def main():
    opts = args()
    opts.out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    roots = [obj for obj in bpy.data.objects if obj.name in ('INKWAVE_CHARACTER', 'INKWAVE_WEAPON')]
    if len(roots) != 1:
        raise RuntimeError(f'expected one model root, found {[o.name for o in roots]}')
    root = roots[0]
    model = [root] + list(root.children_recursive)
    meshes = [obj for obj in model if obj.type == 'MESH']
    images = [image for image in bpy.data.images if image.source == 'FILE']
    unpacked = [image.name for image in images if image.packed_file is None]
    references = [obj for obj in bpy.data.objects if obj.name.startswith('REFERENCE_')]
    report = {
        'blend': bpy.data.filepath,
        'blender_version': bpy.app.version_string,
        'root': root.name,
        'root_extras': sorted(key for key in root.keys() if not key.startswith('_')),
        'meshes': len(meshes),
        'triangles': sum(len(obj.data.polygons) for obj in meshes),
        'materials': len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
        'collections': sorted(child.name for child in bpy.data.collections['INKWAVE_MASTER'].children),
        'reference_empties': sorted(obj.name for obj in references),
        'reference_images_packed': all(obj.data is not None and obj.data.packed_file is not None for obj in references),
        'file_images': len(images),
        'unpacked_images': unpacked,
        'camera': scene.camera.name if scene.camera else None,
        'studio': sorted(obj.name for obj in bpy.data.collections['INKWAVE_STUDIO'].objects),
    }
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = opts.samples
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(opts.out / 'reopen_perspective.png')
    bpy.ops.render.render(write_still=True)
    report['render'] = scene.render.filepath
    bpy.ops.object.select_all(action='DESELECT')
    for obj in model:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    export = opts.out / 'reopen_export.glb'
    bpy.ops.export_scene.gltf(filepath=str(export), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_normals=True, export_texcoords=True,
                              export_materials='EXPORT', export_extras=True, export_cameras=False, export_lights=False)
    report['export'] = str(export)
    report['export_bytes'] = export.stat().st_size
    problems = []
    if unpacked:
        problems.append(f'{len(unpacked)} images are not packed')
    if len(references) != 4 or not report['reference_images_packed']:
        problems.append('reference empties missing or unpacked')
    report['pass'] = not problems
    report['problems'] = problems
    (opts.out / 'reopen_check.json').write_text(json.dumps(report, indent=2))
    print('INKWAVE_REOPEN_CHECK ' + json.dumps(report))


if __name__ == '__main__':
    main()
