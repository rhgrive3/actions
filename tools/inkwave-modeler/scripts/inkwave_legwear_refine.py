"""Pack the reference-length teal sock stripe into the editable Blender master and Web GLBs.

Run from tools/inkwave-modeler:
  blender --background blender/INKWAVE_CHARACTER_MASTER.blend \
    --python scripts/inkwave_legwear_refine.py -- \
    --master blender/INKWAVE_CHARACTER_MASTER.blend \
    --export blender/INKWAVE_CHARACTER_MASTER.glb --game blender/INKWAVE_GAME.glb

The authored PNG stays in blender/textures/ for repeatability; the .blend and GLBs embed it.
"""
import argparse
import shutil
import sys
from pathlib import Path

import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--export', type=Path, required=True)
    parser.add_argument('--game', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    texture = Path(__file__).resolve().parent.parent / 'blender/textures/legwear_teal_refined.png'
    assert texture.is_file(), texture

    material = bpy.data.materials['legwear_texture']
    base = material.node_tree.nodes['Image Texture']
    assert base.type == 'TEX_IMAGE' and base.image
    image_name = 'INKWAVE_legwear_teal_refined'
    prior = base.image
    base.image = None
    if prior.name == image_name and prior.users == 0:
        bpy.data.images.remove(prior)
    image = bpy.data.images.load(str(texture), check_existing=False)
    image.name = image_name
    image.pack()
    base.image = image

    root = bpy.data.objects['INKWAVE_CHARACTER']
    objects = [root] + list(root.children_recursive)
    meshes = [obj for obj in objects if obj.type == 'MESH']
    triangles = sum(len(obj.data.polygons) for obj in meshes)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.master.resolve()))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(args.export.resolve()), export_format='GLB',
        use_selection=True, export_yup=True, export_apply=False,
        export_normals=True, export_texcoords=True,
        export_materials='EXPORT', export_extras=True,
        export_cameras=False, export_lights=False)
    shutil.copyfile(args.export, args.game)
    print(f'LEGWEAR_REFINE_DONE meshes={len(meshes)} triangles={triangles} texture={image.name}')


if __name__ == '__main__':
    main()
