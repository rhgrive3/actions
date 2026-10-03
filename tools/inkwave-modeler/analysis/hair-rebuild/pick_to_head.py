"""参照シートで手で拾った点（シート画素）を、顔合わせのカメラの光線で頭の表面（HEAD_face）に当て、3D にする。
blender -b <blend> --python pick_to_head.py -- <picks.json> <out.json>
picks.json: {"名前": {"view": "sideL", "px": [[u, v], ...]}, ...}"""
import json, os, sys
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../multiview'))
import mvcore as M  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
picks = json.load(open(argv[0]))
spec = json.load(open(os.path.join(HERE, '../multiview/field.json'))); dist = spec['dist']
o = bpy.data.objects['HEAD_face']
bvh = BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [list(p.vertices) for p in o.data.polygons])
out = {}
for name, p in picks.items():
    cam = spec['cams'][p['view']]
    B = M.cam_basis(cam['az'], cam['el'], cam['roll'])
    eye_local = B[2] * dist
    res = []
    for u, v in p['px']:
        # 頭中心から dist の所にあるカメラ。画素 (u,v) は頭中心の面で c = ((u-u0)/s, -(v-v0)/s)
        c_plane = np.array([(u - cam['u0']) / cam['s'], -(v - cam['v0']) / cam['s'], 0.0])
        target_local = c_plane @ B
        o_w = Vector(M.to_world(eye_local[None])[0]); t_w = Vector(M.to_world(target_local[None])[0])
        hit = bvh.ray_cast(o_w, (t_w - o_w).normalized())
        res.append(list(hit[0]) if hit[0] is not None else None)
    out[name] = res
    print(name, sum(r is not None for r in res), '/', len(res))
json.dump(out, open(argv[1], 'w'), indent=1)
