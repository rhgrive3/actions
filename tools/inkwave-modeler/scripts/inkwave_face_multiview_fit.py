"""Multi-view face fit on the Blender master (docs/face-multiview-fit/README.md).

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_multiview_fit.py -- \
  --field analysis/multiview/field.json --save blender/INKWAVE_FACE_FIT.blend [--amount 1.0] [--restore]

The field (analysis/multiview/fit.py) is a smooth, left/right-symmetric displacement field in head space: Gaussian
handles on the face surface, times a protection mask that is 0 at the eyes (every HEAD_eyes* part), the brows, the
ears, the shaved-scalp shell (HAIR_scalp), the back of the head and above the hairline. It moves HEAD_face and every
decal on it (HEAD_skin*) together; eyes, brows, ears, hair and clothes are never written.

Non-destructive:
  * every mesh the field changes keeps its pre-fit positions in the point attribute `inkwave_prefit_position`
    (not exported to glTF); a run first restores them, so re-runs do not accumulate and `--restore` goes back exactly;
  * collection FACE_FIT / FACE_FIT_ORIGINAL holds an untouched copy of every changed object (hidden, excluded from
    render and export) for side-by-side checks: toggle it against the live head in the viewport;
  * collection FACE_FIT / FACE_FIT_CAMERAS holds the five fitted reference cameras, each with its reference image as
    camera background (Numpad 0 on a camera shows the overlay);
  * `--amount` scales the field (0.5 = half way) for a softer result;
  * the master file is only read: `--save` should name a new file (default blender/INKWAVE_FACE_FIT.blend).
Order with the other face passes: inkwave_face_refine.py -> inkwave_face_look.py -> this script. face_look restores
its own copies on a re-run, so run this script again after it.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import bmesh

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'analysis' / 'multiview'))
import mvcore as M  # noqa: E402  (pure numpy: head space and cameras shared with the fit)

ATTR = 'inkwave_prefit_position'
NATTR = 'inkwave_prefit_custom_normal'   # raw copy of the encoded custom normals (exact restore)
SKIP = ('HEAD_eyes', 'HEAD_brows', 'HEAD_face_02', 'HEAD_face_03')
# Inner eye corner -> cheek smoothing (Blender Corrective Smooth modifier, 'Only Smooth', length weighted, on a
# weighted vertex group of HEAD_face; the Laplacian Smooth modifier does not move this metre-scale mesh).
# Region: within `near` of the segment p0 -> p1 (head space |x|, y), fading out by `far`; 0 at the eye parts (within
# `eye0`, full from `eye1`) so the lid rim and the eyeball stay; front of the face only.
SMOOTH = {'p0': (0.026, -0.026), 'p1': (0.044, -0.050), 'near': 0.007, 'far': 0.016, 'eye0': 0.0015, 'eye1': 0.005,
          'iterations': 30, 'factor': 0.5}
# Blush decals are re-laid on the skin (Shrinkwrap, nearest surface point) and take the skin's shading normals
# (Data Transfer, custom normals): their own normals were up to 90 deg off the skin (a scaly pattern under the eyes).
BLUSH = ('HEAD_skin', 'HEAD_skin_04'); BLUSH_OFFSET = 0.0003
# Parts that gain geometry (an upper lip in the lower-lip decal, lower lashes in the lower-lash meshes): their whole
# mesh is kept as `<object>__prefit_topo` (fake user) before anything changes, and --restore swaps it back.
TOPO = ('HEAD_skin_08', 'HEAD_eyes_13', 'HEAD_eyes_30')
TOPO_SUFFIX = '__prefit_topo'
# Upper lip (head space mm): a vermilion band above the mouth line (top edge of HEAD_skin_09), H0 tall at the midline,
# thinning to the corners at |x| = LIP_XC, with a cupid's-bow dip; the skin under it rolls forward by LIP_BULGE along
# its normal (0 at the mouth line, so the lip turns into the line). The band is added to HEAD_skin_08 (the lower lip
# decal: same material), LIP_OFFSET above the skin (under the mouth line decal, which sits ~0.37 mm up).
LIP = {'H0': 3.0, 'XC': 23.5, 'BOW': 0.6, 'BULGE': 0.5, 'OFFSET': 0.22, 'TUCK': 0.4}
# Lower lashes (head space mm, +x eye mirrored): N short tapered strands rooted ROOT_BELOW under the lower lid line
# (inkwave_face_look.P['lid_lower']) from X0 to X1, turning from straight down (inner) to ANG1 deg outward (outer),
# along the skin (the shelf under the eye faces up) lifted off it by LIFT and curling away by CURL,
# LEN0 -> LEN1 long, root radius R0; added to HEAD_eyes_13
# (+x) and HEAD_eyes_30 (-x), the lower-lash meshes (same black material).
# Reference: 5-6 short, bold, dark strands on the outer third of the lower lid, pointing down and outward.
LASH = {'N': 6, 'X0': 56.0, 'X1': 72.5, 'ROOT_BELOW': 0.45, 'ANG0': 15.0, 'ANG1': 45.0, 'LIFT': 0.12, 'CURL': 0.1,
        'LEN0': 4.0, 'LEN1': 5.5, 'R0': 0.4, 'SIDES': 6, 'RINGS': 8}
BLUSH_RELAX = (0.004, 0.007, 10)   # full within 4 mm of the eye parts, none from 7 mm; iterations
VIEW_BOX = {'front': (60, 230, 430, 520), 'q34L': (470, 230, 840, 520), 'sideL': (880, 230, 1250, 520),
            'q34R': (1370, 230, 1740, 520), 'sideR': (1790, 230, 2160, 520)}
SHEET = ROOT / 'docs' / 'face-multiview-fit' / 'refs' / 'sheet_5view.png'


def args():
    p = argparse.ArgumentParser()
    p.add_argument('--field', type=Path, default=ROOT / 'analysis' / 'multiview' / 'field.json')
    p.add_argument('--save', type=Path, default=ROOT / 'blender' / 'INKWAVE_FACE_FIT.blend')
    p.add_argument('--amount', type=float, default=1.0)
    p.add_argument('--restore', action='store_true')
    p.add_argument('--no-cameras', action='store_true')
    p.add_argument('--no-smooth', action='store_true', help='skip the inner-eye-corner -> cheek smoothing step')
    p.add_argument('--no-lip', action='store_true', help='skip the upper lip')
    p.add_argument('--no-lashes', action='store_true', help='skip the lower lashes')
    p.add_argument('--export', type=Path, help='also write the character GLB (same settings as the migration)')
    p.add_argument('--game', type=Path, help='copy the exported GLB here too')
    p.add_argument('--smooth-iters', type=int, default=SMOOTH['iterations'])
    p.add_argument('--smooth-factor', type=float, default=SMOOTH['factor'])
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def live_meshes():
    root = bpy.data.objects['INKWAVE_CHARACTER']
    return [o for o in root.children_recursive if o.type == 'MESH']


def world(obj):
    me = obj.data
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
    mw = np.array(obj.matrix_world)
    return co.reshape(-1, 3).astype(np.float64) @ mw[:3, :3].T + mw[:3, 3]


def set_world(obj, w):
    mw = np.array(obj.matrix_world)
    local = (w - mw[:3, 3]) @ np.linalg.inv(mw[:3, :3]).T
    obj.data.vertices.foreach_set('co', local.astype(np.float32).ravel()); obj.data.update()


def restore():
    n = 0
    for name in TOPO:
        keep, obj = bpy.data.meshes.get(name + TOPO_SUFFIX), bpy.data.objects.get(name)
        if keep is not None and obj is not None:
            old = obj.data; old_name = old.name
            obj.data = keep; keep.use_fake_user = False
            bpy.data.meshes.remove(old); keep.name = old_name; n += 1
    for obj in live_meshes():
        me = obj.data
        if ATTR in me.attributes:
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.attributes[ATTR].data.foreach_get('vector', co)
            me.vertices.foreach_set('co', co)
            me.attributes.remove(me.attributes[ATTR]); n += 1
            if NATTR in me.attributes:
                copy_attr(me, NATTR, 'custom_normal'); me.attributes.remove(me.attributes[NATTR])
            me.update()
    coll = bpy.data.collections.get('FACE_FIT')
    if coll is not None:
        for c in list(coll.children_recursive) + [coll]:
            for o in list(c.objects):
                data = o.data
                bpy.data.objects.remove(o)
                if data is not None and data.users == 0:
                    (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.cameras).remove(data)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)
    for img in [i for i in bpy.data.images if i.name.startswith('FACE_FIT_REF_')]:
        bpy.data.images.remove(img)
    return n


def copy_attr(me, src, dst):
    a = me.attributes[src]
    buf = np.empty(len(a.data) * 2, np.int16); a.data.foreach_get('value', buf)
    b = me.attributes.get(dst) or me.attributes.new(dst, a.data_type, a.domain)
    b.data.foreach_set('value', buf)


def kd(points):
    t = KDTree(len(points))
    for i, p in enumerate(points):
        t.insert(Vector(p), i)
    t.balance()
    return t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Field:
    """Same field as analysis/multiview/fit.py (Field.mask / Field.displace), evaluated with mathutils KD-trees."""

    def __init__(self, spec, amount):
        self.c = np.array(spec['centres_head_m']); self.D = np.array(spec['D_head_m']) * amount
        self.sigma = spec['params']['sigma']; self.mirror = self.c[:, 0] > 1e-6
        objs = {o.name: o for o in live_meshes()}
        loc = lambda names: np.concatenate([M.to_local(world(objs[n])) for n in names])
        self.t_eye = kd(loc([n for n in objs if n.startswith('HEAD_eyes')]))
        self.t_brow = kd(loc([n for n in objs if n.startswith('HEAD_brows')]))
        self.t_ear = kd(loc(['HEAD_face_02', 'HEAD_face_03']))
        self.t_scalp = kd(loc(['HAIR_scalp'])) if 'HAIR_scalp' in objs else None

    @staticmethod
    def _dist(t, q):
        return np.array([t.find(Vector(p))[2] for p in q])

    def mask(self, q):
        m = smoothstep(0.003, 0.015, self._dist(self.t_eye, q))
        m *= smoothstep(0.003, 0.012, self._dist(self.t_brow, q))
        m *= smoothstep(0.005, 0.020, self._dist(self.t_ear, q))
        if self.t_scalp is not None:
            m *= smoothstep(0.003, 0.015, self._dist(self.t_scalp, q))
        return m * smoothstep(-0.020, 0.020, q[:, 2]) * (1 - smoothstep(0.040, 0.070, q[:, 1]))

    def displace(self, q):
        s2 = 2 * self.sigma ** 2
        phi = np.exp(-((q[:, None, :] - self.c[None]) ** 2).sum(2) / s2)
        phim = np.exp(-((q[:, None, :] - self.c[None] * np.array([-1, 1, 1])) ** 2).sum(2) / s2) * self.mirror[None]
        m = self.mask(q)
        bx = m[:, None] * (phi - phim) * self.mirror[None]; bp = m[:, None] * (phi + phim)
        return np.c_[bx @ self.D[:, 0], bp @ self.D[:, 1], bp @ self.D[:, 2]]


def corner_normals(me):
    n = np.empty(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', n)
    return n.reshape(-1, 3)


def vertex_normals(me):
    n = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3).astype(np.float64)


def rotate_between(a, b, v):
    """Rotate vectors v by the per-row rotation that takes unit a onto unit b (Rodrigues)."""
    k = np.cross(a, b); s = np.linalg.norm(k, axis=1, keepdims=True); c = (a * b).sum(1, keepdims=True)
    k = np.where(s > 1e-9, k / np.maximum(s, 1e-12), 0.0)
    return v * c + np.cross(k, v) * s + k * (k * v).sum(1, keepdims=True) * (1 - c)


def apply_field(field):
    face = bpy.data.objects['HEAD_face']
    face_n_before = vertex_normals(face.data) @ np.linalg.inv(np.array(face.matrix_world)[:3, :3])
    face_w_before = world(face)
    changed, old_normals = {}, {}
    for obj in live_meshes():
        if not obj.name.startswith('HEAD_') or obj.name.startswith(SKIP):
            continue
        w = world(obj); q = M.to_local(w)
        d = field.displace(q)
        if np.abs(d).max() < 1e-7:
            continue
        me = obj.data
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
        me.attributes.new(ATTR, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', co)
        old_normals[obj.name] = corner_normals(me).astype(np.float64)
        if 'custom_normal' in me.attributes:
            copy_attr(me, 'custom_normal', NATTR)
        set_world(obj, w + M.to_world_delta(d))
        changed[obj.name] = round(float(np.linalg.norm(d, axis=1).max() * 1000), 3)
    # shading normals: the face gets smooth vertex normals with the midline seam pair averaged (as
    # inkwave_face_look.weld_seam_normals); decals turn their own normals with the skin under them.
    me = face.data
    n = vertex_normals(me); g = n.reshape(M.GRID + (3,))
    avg = g[:, 0] + g[:, -1]; avg /= np.linalg.norm(avg, axis=1, keepdims=True) + 1e-12
    g[:, 0] = g[:, -1] = avg
    me.normals_split_custom_set_from_vertices([tuple(v) for v in g.reshape(-1, 3)]); me.update()
    face_n_after = vertex_normals(me) @ np.linalg.inv(np.array(face.matrix_world)[:3, :3])
    t = kd(face_w_before)
    for name in changed:
        if name == 'HEAD_face':
            continue
        obj = bpy.data.objects[name]; me = obj.data
        cn = old_normals[name]
        lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
        prev = np.empty(len(me.vertices) * 3, np.float32); me.attributes[ATTR].data.foreach_get('vector', prev)
        mw = np.array(obj.matrix_world)
        pw = prev.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
        near = np.array([t.find(Vector(p))[1] for p in pw])[lv]
        a = face_n_before[near]; b = face_n_after[near]
        a /= np.linalg.norm(a, axis=1, keepdims=True); b /= np.linalg.norm(b, axis=1, keepdims=True)
        new = rotate_between(a, b, cn)
        me.normals_split_custom_set([tuple(v) for v in new]); me.update()
    return changed


def smooth_weights(field, q):
    ax, y = np.abs(q[:, 0]), q[:, 1]
    p0, p1 = np.array(SMOOTH['p0']), np.array(SMOOTH['p1'])
    d = p1 - p0; t = np.clip(((np.c_[ax, y] - p0) @ d) / (d @ d), 0, 1)
    dseg = np.linalg.norm(np.c_[ax, y] - (p0 + t[:, None] * d), axis=1)
    w = 1 - smoothstep(SMOOTH['near'], SMOOTH['far'], dseg)
    w *= smoothstep(SMOOTH['eye0'], SMOOTH['eye1'], field._dist(field.t_eye, q))
    return w * (q[:, 2] > 0.03)


def evaluated_copy(obj):
    obj.data.update(); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = obj.evaluated_get(dg).data
    co = np.empty(len(ev.vertices) * 3, np.float32); ev.vertices.foreach_get('co', co)
    return co.reshape(-1, 3), corner_normals(ev)


def smooth_eye_cheek(field, iters, factor):
    """Corrective Smooth ('Only Smooth', length weighted) on the weighted inner-corner -> cheek region of HEAD_face;
    the decals on it follow the skin (nearest skin vertices, inverse-distance)."""
    face = bpy.data.objects['HEAD_face']; me = face.data
    w0 = world(face); q = M.to_local(w0)
    wt = smooth_weights(field, q)
    vg = face.vertex_groups.get('FACE_FIT_SMOOTH') or face.vertex_groups.new(name='FACE_FIT_SMOOTH')
    vg.remove(list(range(len(me.vertices))))
    for i in np.where(wt > 1e-4)[0]:
        vg.add([int(i)], float(wt[i]), 'REPLACE')
    mod = face.modifiers.new('FACE_FIT_SMOOTH', 'CORRECTIVE_SMOOTH')
    mod.vertex_group = vg.name; mod.use_only_smooth = True; mod.smooth_type = 'LENGTH_WEIGHTED'
    mod.iterations = iters; mod.factor = factor
    co, _ = evaluated_copy(face)
    face.modifiers.remove(mod); face.vertex_groups.remove(vg)
    mw = np.array(face.matrix_world); w1 = co.astype(np.float64) @ mw[:3, :3].T + mw[:3, 3]
    me.vertices.foreach_set('co', co.ravel()); me.update()
    delta = w1 - w0
    moved = np.where(np.linalg.norm(delta, axis=1) > 1e-7)[0]
    out = {'HEAD_face_max_mm': round(float(np.linalg.norm(delta, axis=1).max() * 1000), 3), 'vertices': int(len(moved))}
    if len(moved):
        t = kd(w0[moved])
        for obj in live_meshes():
            if not obj.name.startswith('HEAD_skin') or ATTR not in obj.data.attributes:
                continue
            wd = world(obj); dd = np.zeros_like(wd)
            for i, p in enumerate(wd):
                hits = t.find_n(Vector(p), 6)
                ws = np.array([1.0 / max(h[2], 1e-5) for h in hits]); ws *= np.array([h[2] < 0.004 for h in hits])
                if ws.sum() > 0:
                    dd[i] = (ws[:, None] * delta[moved[[h[1] for h in hits]]]).sum(0) / ws.sum()
            if np.abs(dd).max() > 0:
                set_world(obj, wd + dd); out[obj.name + '_max_mm'] = round(float(np.linalg.norm(dd, axis=1).max() * 1000), 3)
    return out


def relay_blush(field):
    """Relax the blush decal next to the eye (Corrective Smooth, only smooth, on a vertex group that is 1 within
    BLUSH_RELAX[0] of the eye parts and 0 from BLUSH_RELAX[1]: its small triangles folded where it crosses the steep
    lid), Shrinkwrap it onto the skin at BLUSH_OFFSET and give it the skin's normals (Data Transfer). Relaxing the
    whole decal was tried and tore holes into it."""
    face = bpy.data.objects['HEAD_face']; out = {}
    for name in BLUSH:
        obj = bpy.data.objects.get(name)
        if obj is None or ATTR not in obj.data.attributes:
            continue
        q = M.to_local(world(obj))
        wr = 1 - smoothstep(BLUSH_RELAX[0], BLUSH_RELAX[1], field._dist(field.t_eye, q))
        vg = obj.vertex_groups.new(name='FACE_FIT_RELAX')
        for i in np.where(wr > 1e-4)[0]:
            vg.add([int(i)], float(wr[i]), 'REPLACE')
        rx = obj.modifiers.new('FACE_FIT_RELAX', 'CORRECTIVE_SMOOTH')
        rx.use_only_smooth = True; rx.smooth_type = 'LENGTH_WEIGHTED'; rx.use_pin_boundary = True
        rx.vertex_group = vg.name; rx.iterations = BLUSH_RELAX[2]; rx.factor = 0.5
        sw = obj.modifiers.new('FACE_FIT_SHRINKWRAP', 'SHRINKWRAP')
        sw.target = face; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.wrap_mode = 'ON_SURFACE'; sw.offset = BLUSH_OFFSET
        dt = obj.modifiers.new('FACE_FIT_NORMALS', 'DATA_TRANSFER')
        dt.object = face; dt.use_loop_data = True; dt.data_types_loops = {'CUSTOM_NORMAL'}
        dt.loop_mapping = 'POLYINTERP_NEAREST'
        before = world(obj)
        co, cn = evaluated_copy(obj)
        obj.modifiers.remove(dt); obj.modifiers.remove(sw); obj.modifiers.remove(rx); obj.vertex_groups.remove(vg)
        me = obj.data
        me.vertices.foreach_set('co', co.ravel()); me.update()
        me.normals_split_custom_set([tuple(v) for v in cn]); me.update()
        out[name] = round(float(np.linalg.norm(world(obj) - before, axis=1).max() * 1000), 3)
    return out


def face_normals():
    """Smooth vertex normals on HEAD_face with the midline seam pair averaged (as inkwave_face_look.weld_seam_normals)."""
    me = bpy.data.objects['HEAD_face'].data
    g = vertex_normals(me).reshape(M.GRID + (3,))
    avg = g[:, 0] + g[:, -1]; avg /= np.linalg.norm(avg, axis=1, keepdims=True) + 1e-12
    g[:, 0] = g[:, -1] = avg
    me.normals_split_custom_set_from_vertices([tuple(v) for v in g.reshape(-1, 3)]); me.update()


def topo_backup():
    for name in TOPO:
        obj = bpy.data.objects.get(name)
        if obj is not None and bpy.data.meshes.get(name + TOPO_SUFFIX) is None:
            c = obj.data.copy(); c.name = name + TOPO_SUFFIX; c.use_fake_user = True


def skin_bvh():
    """HEAD_face as a BVH in world space."""
    face = bpy.data.objects['HEAD_face']
    w = world(face)
    me = face.data; me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', tri)
    return BVHTree.FromPolygons([Vector(p) for p in w], tri.reshape(-1, 3).tolist())


def on_skin(bvh, q_local_m):
    """Head-space points -> (world point on the skin straight behind them along head -z, world skin normal)."""
    dz = Vector(M.to_world_delta(np.array([[0.0, 0.0, -1.0]]))[0]).normalized()
    pts, nrm = [], []
    for p in M.to_world(q_local_m):
        hit = bvh.ray_cast(Vector(p), dz, 0.5)
        if hit[0] is None:
            pts.append(None); nrm.append(None); continue
        n = hit[1] if hit[1].dot(dz) < 0 else -hit[1]
        pts.append(np.array(hit[0])); nrm.append(np.array(n))
    return pts, nrm


def append_geometry(obj, verts_world, faces, uvs=None):
    """Add vertices (world) and faces to obj's mesh with bmesh; existing corners keep their normals, new corners take
    the smooth normals of the new geometry."""
    me = obj.data
    old_n = corner_normals(me).copy(); n_old_loops = len(me.loops)
    inv = np.linalg.inv(np.array(obj.matrix_world))
    local = np.c_[verts_world, np.ones(len(verts_world))] @ inv.T
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    new_v = [bm.verts.new(tuple(p[:3])) for p in local]
    slot = {v: i for i, v in enumerate(new_v)}
    for f in faces:
        face = bm.faces.new([new_v[i] for i in f])
        face.smooth = True
        if uvs is not None:
            for loop in face.loops:
                loop[uv].uv = uvs[slot[loop.vert]]
    bm.to_mesh(me); bm.free(); me.update()
    cn = corner_normals(me).copy()
    cn[:n_old_loops] = old_n
    me.normals_split_custom_set([tuple(v) for v in cn]); me.update()
    return len(new_v)


def mouth_line_top():
    """Top edge of the mouth line decal (HEAD_skin_09): head-space x (mm) -> y (mm), smoothed."""
    q = M.to_local(world(bpy.data.objects['HEAD_skin_09'])) * 1000
    xs = np.arange(-LIP['XC'] - 3, LIP['XC'] + 3.01, 0.5)
    top = np.array([q[np.abs(q[:, 0] - x) < 0.8, 1].max() if (np.abs(q[:, 0] - x) < 0.8).any() else np.nan for x in xs])
    ok = ~np.isnan(top)
    coef = np.polyfit(xs[ok], top[ok], 4)              # a smooth curve: the decal's vertex edge is ragged
    coef[[1, 3]] = 0.0                                  # left/right symmetric (odd terms off)
    return lambda x: np.polyval(coef, x)


def lip_shape(x):
    xc = LIP['XC']
    h = LIP['H0'] * np.clip(1 - (x / xc) ** 2, 0, 1) ** 0.7
    bow = LIP['BOW'] * (np.exp(-(x / 2.0) ** 2) - 0.35 * np.exp(-((np.abs(x) - 4.5) / 2.0) ** 2))
    return h - bow * np.clip(1 - (x / xc) ** 2, 0, 1)


def upper_lip():
    """Roll the upper-lip skin forward and add the vermilion band to HEAD_skin_08."""
    ytop = mouth_line_top(); xc = LIP['XC']
    face = bpy.data.objects['HEAD_face']

    def weight(q):
        x, y = q[:, 0] * 1000, q[:, 1] * 1000
        t = (y - ytop(x)) / (lip_shape(x) + 1.5)
        w = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.5
        return w * np.clip(1 - (x / (xc + 2)) ** 2, 0, 1) ** 1.2 * (q[:, 2] > 0.06)
    fw = world(face); fq = M.to_local(fw)
    fn = vertex_normals(face.data) @ np.linalg.inv(np.array(face.matrix_world)[:3, :3])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True)
    wf = weight(fq)
    set_world(face, fw + fn * (LIP['BULGE'] / 1000 * wf)[:, None])
    t = kd(fw); moved = {'HEAD_face': round(float(wf.max() * LIP['BULGE']), 3)}
    for obj in live_meshes():
        if not obj.name.startswith('HEAD_skin') or obj.name in BLUSH:
            continue
        w = world(obj); wd = weight(M.to_local(w))
        if wd.max() <= 0:
            continue
        near = np.array([t.find(Vector(p))[1] for p in w])
        set_world(obj, w + fn[near] * (LIP['BULGE'] / 1000 * wd)[:, None]); moved[obj.name] = round(float(wd.max() * LIP['BULGE']), 3)
    face_normals()
    # the band: a (x, s) grid between the tucked line edge and the lip outline, laid on the skin
    bvh = skin_bvh()
    xs = np.linspace(-xc + 0.4, xc - 0.4, 95); ss = np.linspace(0, 1, 7)
    lo = ytop(xs) - LIP['TUCK']; hi = ytop(xs) + lip_shape(xs)
    grid = np.array([[x, lo[i] + s * (hi[i] - lo[i])] for i, x in enumerate(xs) for s in ss]) / 1000
    pts, nrm = on_skin(bvh, np.c_[grid, np.full(len(grid), 0.2)])
    if any(p is None for p in pts):
        raise RuntimeError('upper lip: a band point missed the skin')
    verts = np.array([p + n * LIP['OFFSET'] / 1000 for p, n in zip(pts, nrm)])
    ns = len(ss); faces = []
    for i in range(len(xs) - 1):
        for j in range(ns - 1):
            a = i * ns + j; faces.append([a, a + ns, a + ns + 1, a + 1])
    uvs = [((x + xc) / (2 * xc), s) for x in xs for s in ss]
    added = append_geometry(bpy.data.objects['HEAD_skin_08'], verts, faces, uvs)
    return {'bulge_max_mm': moved, 'band_vertices': added, 'height_mid_mm': round(float(lip_shape(np.array([0.0]))[0]), 2)}


def lower_lashes():
    """Short tapered strands along the outer lower lid of each eye, added to HEAD_eyes_13 (+x) / HEAD_eyes_30 (-x)."""
    sys.path.insert(0, str(HERE))
    import inkwave_face_look as FL
    lid = np.array(FL.P['lid_lower']); lx, ly = lid[:, 0], lid[:, 1]
    bvh = skin_bvh(); out = {}
    for sx, name in ((1, 'HEAD_eyes_13'), (-1, 'HEAD_eyes_30')):
        verts, faces = [], []
        for k, x in enumerate(np.linspace(LASH['X0'], LASH['X1'], LASH['N'])):
            u = k / (LASH['N'] - 1)
            y = np.interp(x, lx, ly) - LASH['ROOT_BELOW']
            (root,), (n,) = on_skin(bvh, np.array([[sx * x, y, 200.0]]) / 1000)
            if root is None:
                continue
            th = math.radians(LASH['ANG0'] + (LASH['ANG1'] - LASH['ANG0']) * u)
            v = M.to_world_delta(np.array([[sx * math.sin(th), -math.cos(th), 0.0]]))[0]
            # down / outward along the skin (the skin under the eye is a shelf facing up and forward, so a strand
            # pointing straight down would enter it), lifted off it by LIFT; curls away from the skin by CURL
            L = (LASH['LEN0'] + (LASH['LEN1'] - LASH['LEN0']) * u) / 1000
            vt = v - (v @ n) * n; vt /= np.linalg.norm(vt)
            d = vt + LASH['LIFT'] * n; d /= np.linalg.norm(d)
            a = np.cross(d, n); a /= np.linalg.norm(a); b = np.cross(a, d)
            base = len(verts)
            for r in range(LASH['RINGS']):
                s = r / LASH['RINGS']
                c = root - n * 0.0001 + L * (s * d + LASH['CURL'] * s * s * n)
                rad = (LASH['R0'] * (1 - s) ** 0.8 + 0.008) / 1000
                for j in range(LASH['SIDES']):
                    ang = 2 * math.pi * j / LASH['SIDES']
                    verts.append(c + rad * (math.cos(ang) * a + math.sin(ang) * b))
            verts.append(root - n * 0.0001 + L * (d + LASH['CURL'] * n))
            S_ = LASH['SIDES']
            for r in range(LASH['RINGS'] - 1):
                for j in range(S_):
                    p0 = base + r * S_ + j; p1 = base + r * S_ + (j + 1) % S_
                    faces.append([p0, p1, p1 + S_, p0 + S_])
            tip = len(verts) - 1; last = base + (LASH['RINGS'] - 1) * S_
            for j in range(S_):
                faces.append([last + j, last + (j + 1) % S_, tip])
        out[name] = append_geometry(bpy.data.objects[name], np.array(verts), faces)
    return out


def keep_originals(changed):
    coll = bpy.data.collections.new('FACE_FIT'); bpy.context.scene.collection.children.link(coll)
    orig = bpy.data.collections.new('FACE_FIT_ORIGINAL'); coll.children.link(orig)
    for name in list(dict.fromkeys(list(changed) + [t for t in TOPO if bpy.data.meshes.get(t + TOPO_SUFFIX)])):
        src = bpy.data.objects[name]
        topo = bpy.data.meshes.get(name + TOPO_SUFFIX)
        if topo is not None:
            me = topo.copy(); me.use_fake_user = False; me.name = name + '__prefit'
        else:
            me = src.data.copy(); me.name = name + '__prefit'
            prev = np.empty(len(me.vertices) * 3, np.float32); me.attributes[ATTR].data.foreach_get('vector', prev)
            me.vertices.foreach_set('co', prev); me.attributes.remove(me.attributes[ATTR])
            if NATTR in me.attributes:
                copy_attr(me, NATTR, 'custom_normal'); me.attributes.remove(me.attributes[NATTR])
        me.update()
        o = bpy.data.objects.new(name + '__prefit', me)
        o.matrix_world = src.matrix_world.copy()
        for mat_slot, src_slot in zip(o.material_slots, src.material_slots):
            mat_slot.material = src_slot.material
        orig.objects.link(o)
        o.hide_render = True; o.hide_set(True)
    return coll


def reference_crop(view):
    x0, y0, x1, y1 = VIEW_BOX[view]
    name = 'FACE_FIT_REF_' + view
    src = bpy.data.images.load(str(SHEET), check_existing=True)
    W, H = src.size
    px = np.empty(W * H * 4, np.float32); src.pixels.foreach_get(px); px = px.reshape(H, W, 4)[::-1]
    crop = px[y0:y1, x0:x1][::-1].copy()
    img = bpy.data.images.new(name, x1 - x0, y1 - y0, alpha=True)
    img.pixels.foreach_set(crop.ravel()); img.pack()
    bpy.data.images.remove(src)
    return img


def make_cameras(spec, parent):
    coll = bpy.data.collections.new('FACE_FIT_CAMERAS'); parent.children.link(coll)
    dist = spec['dist']
    for view, cam in spec['cams'].items():
        B = M.cam_basis(cam['az'], cam['el'], cam['roll'])
        R = np.stack([M.to_world_delta(B[i][None])[0] for i in range(3)], 1)   # columns: right, up, back
        loc = M.to_world((B[2] * dist)[None])[0]
        x0, y0, x1, y1 = VIEW_BOX[view]; W, Hh = x1 - x0, y1 - y0
        data = bpy.data.cameras.new('FACE_FIT_CAM_' + view)
        data.type = 'PERSP'; data.sensor_fit = 'HORIZONTAL'; data.sensor_width = 36.0
        data.lens = cam['s'] * dist * data.sensor_width / W        # s px per metre at the head centre
        # the head centre lands on (u0, v0): the frustum shifts opposite to that offset from the image centre
        data.shift_x = -(cam['u0'] - x0 - W / 2) / max(W, Hh)
        data.shift_y = (cam['v0'] - y0 - Hh / 2) / max(W, Hh)
        data.clip_start, data.clip_end = 0.05, 50.0
        data.show_background_images = True
        bg = data.background_images.new(); bg.image = reference_crop(view); bg.alpha = 0.5; bg.display_depth = 'FRONT'
        o = bpy.data.objects.new('FACE_FIT_CAM_' + view, data)
        mw = Matrix.Identity(4)
        for i in range(3):
            for j in range(3):
                mw[i][j] = R[i, j]
            mw[i][3] = loc[i]
        o.matrix_world = mw
        o['inkwave_view'] = view; o['inkwave_resolution'] = [W, Hh]; o['inkwave_sheet_box'] = list(VIEW_BOX[view])
        coll.objects.link(o)


def main():
    a = args()
    n = restore()
    print('FACE_FIT restored', n)
    if a.restore:
        if a.save:
            bpy.ops.wm.save_as_mainfile(filepath=str(a.save), compress=True)
        return
    spec = json.loads(a.field.read_text())
    topo_backup()
    field = Field(spec, a.amount)
    changed = apply_field(field)
    smooth = None
    if not a.no_smooth:
        smooth = smooth_eye_cheek(field, a.smooth_iters, a.smooth_factor)
        face_normals()
        smooth['blush_relaid_max_mm'] = relay_blush(field)
    features = {}
    if not a.no_lip:
        features['upper_lip'] = upper_lip()
    if not a.no_lashes:
        features['lower_lashes_vertices'] = lower_lashes()
    coll = keep_originals(changed)
    if not a.no_cameras:
        make_cameras(spec, coll)
    rec = {'field': str(a.field), 'amount': a.amount, 'changed_max_mm': changed, 'smooth': smooth,
           'smooth_params': None if a.no_smooth else dict(SMOOTH, iterations=a.smooth_iters, factor=a.smooth_factor),
           'params': spec['params'], 'handles': len(spec['centres_head_m']), 'features': features,
           'lip_params': None if a.no_lip else LIP, 'lash_params': None if a.no_lashes else LASH}
    txt = bpy.data.texts.get('INKWAVE_FACE_MULTIVIEW_FIT.json') or bpy.data.texts.new('INKWAVE_FACE_MULTIVIEW_FIT.json')
    txt.from_string(json.dumps(rec, indent=1))
    print('FACE_FIT ' + json.dumps(changed))
    print('FACE_FIT_SMOOTH ' + json.dumps(smooth))
    print('FACE_FIT_FEATURES ' + json.dumps(features))
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=str(a.save), compress=True)
        print('FACE_FIT saved', a.save)
    if a.export:
        import shutil
        sys.path.insert(0, str(HERE))
        import inkwave_face_refine as fr
        fr.export_character(a.export)
        print('FACE_FIT exported', a.export)
        if a.game:
            shutil.copyfile(a.export, a.game); print('FACE_FIT game', a.game)


if __name__ == '__main__':
    main()
