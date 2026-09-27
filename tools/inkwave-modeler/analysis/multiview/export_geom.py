"""Blender: write the head geometry the multi-view fit needs (world coordinates, metres) to an .npz.
blender --background <file.blend> --python export_geom.py -- <out.npz>"""
import sys
import bpy
import numpy as np

out = sys.argv[sys.argv.index('--') + 1]
data = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or not (o.name.startswith('HEAD') or o.name in ('HAIR_scalp', 'BODY_torso')):
        continue
    if o.name.endswith('__prelook') or not o.users_collection:
        continue
    me = o.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co)
    nr = np.empty(n * 3, np.float32); me.vertices.foreach_get('normal', nr)
    mw = np.array(o.matrix_world)
    data[o.name + '|v'] = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    nw = nr.reshape(-1, 3) @ np.linalg.inv(mw[:3, :3])
    data[o.name + '|n'] = nw / (np.linalg.norm(nw, axis=1, keepdims=True) + 1e-12)
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', t)
    data[o.name + '|f'] = t.reshape(-1, 3)
np.savez_compressed(out, **data)
print('EXPORTED', len(data) // 3, 'meshes')
