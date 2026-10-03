"""体・服・頭（髪以外）の奥行きマップを、検証済み正射影カメラの画素ごとに BVH の光線で求める。
出力: depth_{view}.npy（カメラ面からの距離 m、当たらない画素は inf）。上 300 行だけ（髪の範囲）。
blender -b <blend> --python render_body_depth.py -- <out_dir>"""
import os
import sys
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../scripts'))
from inkwave_ref_calibration import px_to_world_partial
out = Path(sys.argv[sys.argv.index('--') + 1]); out.mkdir(parents=True, exist_ok=True)
keep = {'HEAD', 'BODY', 'CLOTHES', 'SHOES', 'LEGWEAR', 'HEADGEAR'}
dg = bpy.context.evaluated_depsgraph_get()
verts, polys = [], []
for o in bpy.data.objects:
    if o.type == 'MESH' and ({c.name for c in o.users_collection} & keep) and not o.hide_render:
        e = o.evaluated_get(dg); m = e.to_mesh(); base = len(verts)
        verts += [o.matrix_world @ v.co for v in m.vertices]
        polys += [[i + base for i in p.vertices] for p in m.polygons]
        e.to_mesh_clear()
bvh = BVHTree.FromPolygons(verts, polys)
cams = {'front': (lambda a, z: Vector((a, -10, z)), Vector((0, 1, 0))),
        'back': (lambda a, z: Vector((a, 10, z)), Vector((0, -1, 0))),
        'left': (lambda a, z: Vector((-10, a, z)), Vector((1, 0, 0)))}
for view, (origin, d) in cams.items():
    dep = np.full((300, 448), np.inf, np.float32)
    for py in range(300):
        for px in range(448):
            _, a, z = px_to_world_partial(view, px + 0.5, py + 0.5)
            hit = bvh.ray_cast(origin(a, z), d)
            if hit[0] is not None:
                dep[py, px] = hit[3]
    np.save(out / f'depth_{view}.npy', dep)
    print(view, 'hits', int(np.isfinite(dep).sum()))
print('DEPTH_DONE')
