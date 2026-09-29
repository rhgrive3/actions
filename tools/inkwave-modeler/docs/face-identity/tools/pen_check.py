"""penetration / gap check. blender -b x.blend --python pen_check.py -- out.json"""
import sys, json, bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out = sys.argv[sys.argv.index('--') + 1]
dg = bpy.context.evaluated_depsgraph_get()
def wco(o):
    me = o.data; co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
    mw = np.array(o.matrix_world); return co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
def bvh(o):
    me = o.data; me.calc_loop_triangles(); lt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', lt)
    return BVHTree.FromPolygons([Vector(v) for v in wco(o)], [tuple(t) for t in lt.reshape(-1, 3)])
face = bpy.data.objects['HEAD_face']; bf = bvh(face); fco = wco(face)
res = {}
def signed(bv, pts):
    d = []
    for p in pts:
        loc, n, _, dist = bv.find_nearest(Vector(p))
        d.append(dist if (Vector(p) - loc).dot(n) >= 0 else -dist)
    return np.array(d) * 1000
for name in ['HEAD_skin', 'HEAD_skin_04', 'HEAD_eyes_03', 'HEAD_eyes_20', 'HEAD_eyes_12', 'HEAD_eyes_29']:
    o = bpy.data.objects[name]; p = wco(o); d = signed(bf, p)
    res[name + ' offset over HEAD_face (mm)'] = dict(min=round(float(d.min()), 3), p5=round(float(np.percentile(d, 5)), 3), median=round(float(np.median(d)), 3), under_face_below_0p35mm=int((d < -0.35).sum()), n=len(d))
for s, ball, iris in (('L', 'HEAD_eyes', 'HEAD_eyes_02'), ('R', 'HEAD_eyes_18', 'HEAD_eyes_19')):
    bb = bvh(bpy.data.objects[ball]); C = np.array([38.3, -17.0, 54.7]) if s == 'L' else np.array([-38.0, -16.9, 52.8])
    # face verts near the eye that lie inside the cap (nearest point on the cap is farther from the centre than the vertex)
    sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/multiview')
    import mvcore as M
    loc = M.to_local(fco) * 1000
    Cw = np.array(M.to_world((C / 1000)[None]))[0]
    idx = np.nonzero(np.linalg.norm(loc - C, axis=1) < 60)[0]; cnt = 0; worst = 0.0
    for i in idx:
        l, n, _, dist = bb.find_nearest(Vector(fco[i]))
        if l is None or dist > 0.0015: continue
        n = Vector(n)
        if n.dot(l - Vector(Cw)) < 0: n = -n
        sd = (Vector(fco[i]) - l).dot(n)
        if sd < -0.0002: cnt += 1; worst = min(worst, sd * 1000)
    res[f'face verts within 1.5mm of {ball}: below cap surface >0.2mm'] = dict(count=int(cnt), worst_mm=round(worst, 3))
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps(res, indent=1))
