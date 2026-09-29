"""Face identity / proportion fit on the Blender master (docs/face-identity/README.md).

blender -b blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_identity.py -- \
  --params analysis/identity/params_E.json --save out.blend [--restore]

Runs AFTER inkwave_eye_refine.py (lp40 m3 d1 cr1). Deterministic: everything comes from the params file.
  * eye opening: per eye, a smooth head-space displacement field (Gaussian RBF through a few handles on the lid margin:
    inner/outer canthus, upper/lower lid) moves the skin (HEAD_face, HEAD_skin*), the liner, the upper lashes and the
    lash bridge as ONE assembly (same field, so the lash roots, liner and skin never slide against each other);
    the eyeball (sclera cap + iris) only translates rigidly, so its textures and topology are untouched;
  * liner: extra handles that move only the liner ribbon and the lashes (band thickness, wing);
  * brows: their own handles, then every brow vertex is re-seated on the moved skin (its offset from the skin stays);
  * hair (HAIR*, HAIR_scalp) is never read or written.
Non-destructive: the pre-identity positions of every changed mesh are kept in the point attribute
`inkwave_preid_position` (and the raw custom normals in `inkwave_preid_custom_normal`); a run restores them first, so
re-runs do not accumulate, and `--restore` goes back exactly.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'analysis' / 'multiview'))
import mvcore as M  # noqa: E402

ATTR = 'inkwave_preid_position'
NATTR = 'inkwave_preid_custom_normal'
SKIN = {'L': ('HEAD_face', 'HEAD_skin'), 'R': ('HEAD_face', 'HEAD_skin_04')}
LINER = {'L': ['HEAD_eyes_03', 'HEAD_eyes_12'] + [f'HEAD_eyes_{i:02d}' for i in range(5, 12)],
         'R': ['HEAD_eyes_20', 'HEAD_eyes_29'] + [f'HEAD_eyes_{i:02d}' for i in range(22, 29)]}
BROW = {'L': 'HEAD_brows', 'R': 'HEAD_brows_02'}
BALL = {'L': ('HEAD_eyes', 'HEAD_eyes_02'), 'R': ('HEAD_eyes_18', 'HEAD_eyes_19')}
TEXT = 'INKWAVE_FACE_IDENTITY.json'


def world(obj):
    me = obj.data
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
    mw = np.array(obj.matrix_world)
    return co.reshape(-1, 3).astype(np.float64) @ mw[:3, :3].T + mw[:3, 3]


def set_world(obj, w):
    mw = np.array(obj.matrix_world)
    local = (w - mw[:3, 3]) @ np.linalg.inv(mw[:3, :3]).T
    obj.data.vertices.foreach_set('co', local.astype(np.float32).ravel()); obj.data.update()


def head_mm(obj):
    return M.to_local(world(obj)) * 1000.0


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Rbf:
    """Gaussian RBF through handles (positions p, displacements d, head-space mm); exact at the handles up to `lam`."""

    def __init__(self, handles, sigma, lam=1e-3):
        self.P = np.array([h['p'] for h in handles], float); D = np.array([h['d'] for h in handles], float)
        self.s2 = 2.0 * sigma ** 2
        K = np.exp(-((self.P[:, None] - self.P[None]) ** 2).sum(2) / self.s2) + lam * np.eye(len(self.P))
        self.W = np.linalg.solve(K, D)

    def __call__(self, q):
        return np.exp(-((q[:, None] - self.P[None]) ** 2).sum(2) / self.s2) @ self.W


class EyeField:
    """Displacement field of one eye. Handles with `slide: [d_elevation_deg, d_azimuth_deg(, dr_mm)]` are interpolated in
    spherical coordinates about the eyeball centre (elevation up = +, azimuth toward the outer corner = +), so the skin
    slides over the eyeball at a constant radius and never dips into it; handles with `d` are plain head-space vectors."""

    def __init__(self, spec, s, sigma):
        self.s = s; self.sgn = 1 if s == 'L' else -1; self.C = spec.get('centre_mm')
        hs = spec['handles']
        self.sph = [h for h in hs if 'slide' in h]; self.cart = [h for h in hs if 'slide' not in h]
        self.fs = self.fc = None
        if self.sph:
            self.fs = Rbf([{'p': h['p'], 'd': list(h['slide']) + [0.0] * (3 - len(h['slide']))} for h in self.sph], sigma)
        if self.cart:
            self.fc = Rbf(self.cart, sigma)

    def __call__(self, q):
        d = np.zeros((len(q), 3))
        if self.fs is not None:
            g = self.fs(q); R, a, b = to_sph(q, self.C, self.sgn)
            d += from_sph(R + g[:, 2], a + g[:, 0], b + g[:, 1], self.C, self.sgn) - q
        if self.fc is not None:
            d += self.fc(q)
        return d


def to_sph(q, centre, sgn):
    r = (q - np.array(centre, float)) * np.array([sgn, 1.0, 1.0])
    R = np.linalg.norm(r, axis=1)
    return R, np.degrees(np.arcsin(np.clip(r[:, 1] / R, -1, 1))), np.degrees(np.arctan2(r[:, 0], r[:, 2]))


def from_sph(R, a, b, centre, sgn):
    a = np.radians(a); b = np.radians(b)
    r = R[:, None] * np.stack([np.cos(a) * np.sin(b), np.sin(a), np.cos(a) * np.cos(b)], 1)
    return r * np.array([sgn, 1.0, 1.0]) + np.array(centre, float)


def thin_field(spec, eye_spec, s):
    """Liner band thinning: elevation above the upper lid margin is multiplied by a scale that varies along the lid.
    Returns f(q) -> displacement (mm) for the liner ribbon; teeth use the value at their root."""
    sgn = 1 if s == 'L' else -1; C = eye_spec['centre_mm']
    H = {h['name']: h for h in eye_spec['handles']}
    names = [n for n in ('inner', 'up25', 'up50', 'up75', 'outer') if n in H]
    P = np.array([H[n]['p'] for n in names], float)
    _, am, bm = to_sph(P, C, sgn)
    order = np.argsort(bm); am, bm = am[order], bm[order]
    sc = np.array([spec['scales'][n] for n in names])[order]

    def f(q):
        R, a, b = to_sph(q, C, sgn)
        m = np.interp(b, bm, am); k = np.interp(b, bm, sc)
        t = np.maximum(a - m, 0.0)
        a2 = np.where(a > m, m + t * k, a)
        return (from_sph(R, a2, b, C, sgn) - q)
    return f


def upper_margin(spec, s):
    """Elevation of the (moved) upper lid margin as a function of azimuth, from the slid handles."""
    sgn = 1 if s == 'L' else -1; C = spec['centre_mm']
    H = [h for h in spec['handles'] if h['name'] in ('inner', 'up25', 'up50', 'up75', 'outer')]
    _, a, b = to_sph(np.array([h['p'] for h in H], float), C, sgn)
    sl = np.array([h.get('slide', [0, 0])[:2] for h in H], float)
    a = a + sl[:, 0]; b = b + sl[:, 1]; o = np.argsort(b)
    return lambda beta: np.interp(beta, b[o], a[o])


def clear_of_ball(spec, s, ball_obj, q_new, edges, shift=(0, 0, 0), gap_deg=1.0, ramp_deg=2.0, clearance_mm=0.25, dilate=2, smooth=6, reach_mm=1.5):
    """Push skin above the upper lid margin out of the eyeball cap (a baseline defect the thick liner used to hide)."""
    sgn = 1 if s == 'L' else -1; C = spec['centre_mm']
    me = ball_obj.data; co = head_mm(ball_obj) + np.array(shift, float)
    me.calc_loop_triangles(); lt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', lt)
    bvh = BVHTree.FromPolygons([Vector(v) for v in co], [tuple(t) for t in lt.reshape(-1, 3)])
    R, a, b = to_sph(q_new, C, sgn)
    m = upper_margin(spec, s)(b)
    w = smoothstep(gap_deg, gap_deg + ramp_deg, a - m) * smoothstep(-20.0, -5.0, b) * (1 - smoothstep(85.0, 100.0, b))
    push = np.zeros_like(q_new)
    for i in np.nonzero(w > 1e-3)[0]:
        loc, n, _, _ = bvh.find_nearest(Vector(q_new[i]))
        if loc is None:
            continue
        n = np.array(n); loc = np.array(loc)
        if n @ (loc - np.array(C)) < 0:
            n = -n
        if np.linalg.norm(q_new[i] - loc) > reach_mm:
            continue
        sd = (q_new[i] - loc) @ n
        if sd < clearance_mm:
            push[i] = n * (clearance_mm - sd) * w[i]
    # dilate (keeps the ball covered) then smooth (no bumps)
    e0, e1 = edges[:, 0], edges[:, 1]; deg = np.bincount(np.r_[e0, e1], minlength=len(push)).astype(float)[:, None]
    for _ in range(dilate):
        mag = np.linalg.norm(push, axis=1); nm = mag.copy()
        np.maximum.at(nm, e0, mag[e1]); np.maximum.at(nm, e1, mag[e0])
        src = np.zeros_like(push); np.add.at(src, e0, push[e1]); np.add.at(src, e1, push[e0])
        grow = (mag == 0) & (nm > 0)
        cnt = np.zeros(len(push)); np.add.at(cnt, e0, (mag[e1] > 0).astype(float)); np.add.at(cnt, e1, (mag[e0] > 0).astype(float))
        push[grow] = src[grow] / np.maximum(cnt[grow], 1)[:, None]
    for _ in range(smooth):
        acc = np.zeros_like(push); np.add.at(acc, e0, push[e1]); np.add.at(acc, e1, push[e0])
        push = 0.5 * push + 0.5 * acc / np.maximum(deg, 1)
    return push


def side_window(q, s):
    return smoothstep(2.0, 12.0, q[:, 0] * (1 if s == 'L' else -1))


def restore():
    n = 0
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or ATTR not in obj.data.attributes:
            continue
        me = obj.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.attributes[ATTR].data.foreach_get('vector', co)
        me.vertices.foreach_set('co', co)
        me.attributes.remove(me.attributes[ATTR]); n += 1
        if NATTR in me.attributes:
            a = me.attributes[NATTR]
            buf = np.empty(len(a.data) * 2, np.int16); a.data.foreach_get('value', buf)
            b = me.attributes['custom_normal']; b.data.foreach_set('value', buf)
            me.attributes.remove(a)
        me.update()
    t = bpy.data.texts.get(TEXT)
    if t is not None:
        bpy.data.texts.remove(t)
    return n


def vertex_normals(me):
    n = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3).astype(np.float64)


def rotate_between(a, b, v):
    k = np.cross(a, b); s = np.linalg.norm(k, axis=1, keepdims=True); c = (a * b).sum(1, keepdims=True)
    k = np.where(s > 1e-9, k / np.maximum(s, 1e-12), 0.0)
    return v * c + np.cross(k, v) * s + k * (k * v).sum(1, keepdims=True) * (1 - c)


def skin_offsets(bvh, face, pts):
    """Signed distance of world points from the skin surface and the world-space skin normal there."""
    mw = np.array(face.matrix_world); inv = np.linalg.inv(mw)
    off = np.zeros(len(pts)); nrm = np.zeros_like(pts)
    for i, p in enumerate(pts):
        pl = inv[:3, :3] @ p + inv[:3, 3]
        loc, n, _, _ = bvh.find_nearest(Vector(pl))
        nw = mw[:3, :3] @ np.array(n); nw /= np.linalg.norm(nw)
        off[i] = (pl - np.array(loc)) @ np.array(n); nrm[i] = nw
    return off, nrm


class Edit:
    """Collects displacements per object, then writes them once (backup, positions, custom normals)."""

    def __init__(self):
        self.delta = {}   # name -> world-space delta (N,3), metres

    def add(self, obj, d_mm):
        d = M.to_world_delta(d_mm / 1000.0)
        self.delta[obj.name] = self.delta.get(obj.name, 0) + d

    def commit(self):
        stats = {}
        for name, d in self.delta.items():
            obj = bpy.data.objects[name]; me = obj.data
            if np.abs(d).max() < 1e-9:
                continue
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
            me.attributes.new(ATTR, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', co)
            has_cn = 'custom_normal' in me.attributes
            if has_cn:
                a = me.attributes['custom_normal']
                buf = np.empty(len(a.data) * 2, np.int16); a.data.foreach_get('value', buf)
                me.attributes.new(NATTR, a.data_type, a.domain).data.foreach_set('value', buf)
                cn = np.empty(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn)
                cn = cn.reshape(-1, 3).astype(np.float64); nb = vertex_normals(me)
                lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
            set_world(obj, world(obj) + d)
            if has_cn:
                na = vertex_normals(me)
                new = rotate_between(nb[lv], na[lv], cn)
                me.normals_split_custom_set([tuple(v) for v in new]); me.update()
            stats[name] = round(float(np.linalg.norm(d, axis=1).max() * 1000), 3)
        return stats


def apply(params):
    edit = Edit()
    face = bpy.data.objects['HEAD_face']
    # skin offset of the brows before anything moves (for the re-seat)
    bvh0 = BVHTree.FromObject(face, bpy.context.evaluated_depsgraph_get())
    RESEAT = [BROW['L'], BROW['R'], LINER['L'][1], LINER['R'][1]]
    brow_before = {n: skin_offsets(bvh0, face, world(bpy.data.objects[n]))[0] for n in RESEAT}
    sig = params.get('sigma_mm', 7.0)
    eye = params.get('eye', {}); liner = params.get('liner', {}); brow = params.get('brow', {})
    for s in ('L', 'R'):
        if s in eye and eye[s].get('handles'):
            f = EyeField(eye[s], s, eye[s].get('sigma_mm', sig))
            for name in list(SKIN[s]) + LINER[s]:
                o = bpy.data.objects[name]; q = head_mm(o)
                d = f(q) * side_window(q, s)[:, None]
                if name in SKIN[s] and 'centre_mm' in eye[s] and params.get('clear_ball', True):
                    ball = bpy.data.objects[BALL[s][0]]
                    tb = np.array(eye[s].get('ball_mm', [0, 0, 0]), float)
                    ed = np.empty(len(o.data.edges) * 2, np.int32); o.data.edges.foreach_get('vertices', ed)
                    d = d + clear_of_ball(eye[s], s, ball, q + d, ed.reshape(-1, 2), shift=tb)
                edit.add(o, d)
        if s in eye and 'ball_mm' in eye[s]:
            t = np.array(eye[s]['ball_mm'], float)
            for name in BALL[s]:
                o = bpy.data.objects[name]
                edit.add(o, np.tile(t, (len(o.data.vertices), 1)))
        if s in liner and liner[s].get('handles'):
            f = Rbf(liner[s]['handles'], liner[s].get('sigma_mm', 4.0))
            for name in LINER[s]:
                o = bpy.data.objects[name]; q = head_mm(o)
                edit.add(o, f(q) * side_window(q, s)[:, None])
        if s in params.get('liner_thin', {}) and s in eye:
            f = thin_field(params['liner_thin'][s], eye[s], s)
            for name in LINER[s]:
                o = bpy.data.objects[name]; q = head_mm(o)
                if name == LINER[s][0]:
                    edit.add(o, f(q))
                elif name == LINER[s][1]:
                    continue   # crease ribbon: follows the skin (re-seated below)
                else:   # lash teeth: rigid, moved by the value at their root (lowest vertex)
                    root = q[np.argmin(q[:, 1])][None]
                    edit.add(o, np.tile(f(root), (len(q), 1)))
        # brows follow the eye field a little (they are on the skin) plus their own handles
        o = bpy.data.objects[BROW[s]]; q = head_mm(o); d = np.zeros((len(q), 3))
        if s in eye and eye[s].get('handles'):
            d += EyeField(eye[s], s, eye[s].get('sigma_mm', sig))(q) * side_window(q, s)[:, None]
        if s in brow and brow[s].get('handles'):
            d += Rbf(brow[s]['handles'], brow[s].get('sigma_mm', 8.0))(q) * side_window(q, s)[:, None]
        edit.add(o, d)
    stats = edit.commit()
    # re-seat the brows on the moved skin: keep each vertex's original offset from the skin surface
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); bvh1 = BVHTree.FromObject(face, dg)
    fix = Edit()
    for name in RESEAT:
        o = bpy.data.objects[name]
        off, nrm = skin_offsets(bvh1, face, world(o))
        fix.delta[name] = (brow_before[name] - off)[:, None] * nrm
    for name, d in fix.delta.items():
        o = bpy.data.objects[name]; me = o.data
        if ATTR not in me.attributes:
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
            me.attributes.new(ATTR, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', co)
        set_world(o, world(o) + d)
        stats[name] = max(stats.get(name, 0.0), round(float(np.linalg.norm(d, axis=1).max() * 1000), 3))
    return stats


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--params', type=Path)
    p.add_argument('--save', type=Path)
    p.add_argument('--restore', action='store_true')
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    n = restore()
    if a.restore or a.params is None:
        print('IDENTITY restored', n)
    else:
        params = json.loads(a.params.read_text())
        stats = apply(params)
        t = bpy.data.texts.new(TEXT)
        t.write(json.dumps({'params': params, 'max_displacement_mm': stats}, indent=1))
        print('IDENTITY applied', json.dumps(stats))
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=str(a.save))


if __name__ == '__main__':
    main()
