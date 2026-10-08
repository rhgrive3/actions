"""Body shape: a fuller belly, a navel, a soft ab line, a visible waist, knees, gloves that wrap the hands and
finger nails (analysis/body_shape/params.json).

Measured on the full-body reference sheets (docs/face-refinement/refs, the REFERENCE_FRONT / REFERENCE_LEFT
empties of the master): seen from the side the belly is about 2 cm further forward than the model's (the chin and the
neck line up within 0.5 cm, so it is not a calibration offset); the waist itself is as narrow as the reference's, but
the open jacket's front edges hang about 2 cm further in on each side, so they hide the waist curve; the model has
no navel (the torso's edges there are ~1 cm long).

Every step is a Blender built-in: Warp modifiers limited to a vertex group whose weights are smooth functions of
the world position (the same field for the skin and for every garment lying on it, so the layers keep their
spacing), edit-mode Subdivide of the faces round the navel, and a weighted Smooth.  The meshes it changes are
backed up (`__pre_body_shape`) on the first run and restored at the start of every run, so runs never stack.

  blender -b M.blend --python scripts/inkwave_body_shape.py -- --save M.blend
  blender -b M.blend --python scripts/inkwave_body_shape.py -- --restore --save M.blend    # undo
"""
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inkwave_eye_refine as er  # noqa: E402

PARAMS = er.ROOT / 'analysis/body_shape/params.json'
SUFFIX = '__pre_body_shape'


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def band(v, a, b, fade_lo, fade_hi):
    """1 on [a, b], fading to 0 over fade_lo below a and fade_hi above b."""
    return smoothstep((v - (a - fade_lo)) / fade_lo) * smoothstep(((b + fade_hi) - v) / fade_hi)


def restore(names, drop=False):
    count = 0
    for name in names:
        backup = bpy.data.meshes.get(name + SUFFIX)
        obj = bpy.data.objects.get(name)
        if backup is None or obj is None:
            continue
        current = obj.data
        obj.data = backup.copy()
        if current.users == 0:
            old = current.name
            bpy.data.meshes.remove(current)
            obj.data.name = old
        if drop:
            bpy.data.meshes.remove(backup)
        count += 1
    return count


def back_up(names):
    for name in names:
        if bpy.data.meshes.get(name + SUFFIX) is None:
            backup = bpy.data.objects[name].data.copy()
            backup.name = name + SUFFIX
            backup.use_fake_user = True


def warp(obj, weights, vec_m):
    """Blender's Warp modifier with no falloff: every vertex moves by weight x vec (world metres)."""
    if not np.any(weights > 1e-4):
        return
    a = bpy.data.objects.new('INKWAVE_body_from', None)
    b = bpy.data.objects.new('INKWAVE_body_to', None)
    for e in (a, b):
        bpy.context.scene.collection.objects.link(e)
    b.location = Vector(vec_m)
    bpy.context.view_layer.update()
    er.apply_weighted_modifier(obj, weights, 'WARP', object_from=a, object_to=b, falloff_type='NONE',
                               use_volume_preserve=False)
    for e in (a, b):
        bpy.data.objects.remove(e)


def belly_field(W, cfg):
    """Forward (-y) move of the front of the lower torso: full over the midriff heights, fading to the bust and
    the hips; full near the midline, fading toward the sides (the jacket edges stay); front half only."""
    x, y, z = W[:, 0], W[:, 1], W[:, 2]
    (za, zb), (fl, fh) = cfg['z'], cfg['z_fade']
    w = band(z, za, zb, fl, fh)
    w *= smoothstep((cfg['x_out'] - np.abs(x)) / (cfg['x_out'] - cfg['x_full']))
    w *= smoothstep((cfg['y_front'] - y) / 0.02)
    return w


def nape_field(obj, cfg):
    """Back (-z, head frame) move that fills the corner where the back of the head meets the neck: in the side
    views the source head ends in a round ball over a thin neck, the reference's back of head runs smoothly down
    into the neck.  Amount (mm) by head-frame height (cfg['profile'] = [y_mm, mm] pairs), full near the midline
    fading to the sides (cfg['x'] = [full, out] |x| mm) and on the back half only (cfg['z_back'] = [from, full])."""
    L = er.M.to_local(er.world(obj)) * 1000
    prof = np.array(cfg['profile'], float)
    order = np.argsort(prof[:, 0])
    d = np.interp(L[:, 1], prof[order, 0], prof[order, 1], left=0.0, right=0.0)
    if cfg.get('profile_left'):
        # the left (+x) back of the neck stood 10-14 px behind the reference in the left side view while the right
        # one matched: the left half takes its own profile (negative = forward), blended across the midline
        pl = np.array(cfg['profile_left'], float)
        ol = np.argsort(pl[:, 0])
        dl = np.interp(L[:, 1], pl[ol, 0], pl[ol, 1], left=0.0, right=0.0)
        m0, m1 = cfg.get('x_mix', [-8.0, 8.0])
        t = smoothstep((L[:, 0] - m0) / (m1 - m0))
        d = d * (1 - t) + dl * t
    else:
        t = np.zeros(len(L))
    x_full, x_out = cfg['x']
    z0, z1 = cfg['z_back']
    fade = smoothstep((x_out - np.abs(L[:, 0])) / (x_out - x_full))
    if cfg.get('profile_left') and cfg.get('x_left'):
        # the left side view's back edge is on the side of the neck (|x| 17-35 mm), where the right profile has
        # faded: the left half fades over its own, wider range
        xl_full, xl_out = cfg['x_left']
        fade = fade * (1 - t) + smoothstep((xl_out - np.abs(L[:, 0])) / (xl_out - xl_full)) * t
    return d * fade * smoothstep((z0 - L[:, 2]) / (z0 - z1))


def nape(cfg):
    """The same field on the head, the neck and everything that lies on them there (collar, temple shell), so
    nothing opens or pokes through.  Blender's Warp, one vector, per-vertex weights."""
    back = er.M.to_world_delta(np.array([[0.0, 0.0, -1.0]]))[0]
    back /= np.linalg.norm(back)
    peak = max(m for _, m in cfg['profile'])
    for name in cfg['meshes']:
        obj = bpy.data.objects[name]
        f = nape_field(obj, cfg)
        before = er.world(obj)
        for sign in (1, -1):        # back (profile > 0) and forward (profile_left < 0) as two Warps
            w = np.maximum(sign * f, 0) / peak
            if w.max() > 0:
                warp(obj, w, tuple(sign * back * peak / 1000))
        print('BODY_SHAPE nape', name, 'vertices', int((w > 1e-3).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def collar_lower(cfg):
    """The collar (turtleneck) top stood higher than the reference in the side and back views (left side view
    14-16 px, back right 10-12, right 4-8; the front matched): its top part goes down (head-frame -y, Blender's
    Warp) by an amount that depends on the direction round the neck (cfg['angles'] = [deg, mm]: 0 = front,
    90 = left (+x), 180 = back), full from cfg['y'][1] up, nothing from cfg['y'][0] down (the collar is squeezed,
    not moved), only within cfg['r_max'] mm of the neck axis (cfg['centre_xz'])."""
    down = er.M.to_world_delta(np.array([[0.0, -1.0, 0.0]]))[0]
    down /= np.linalg.norm(down)
    ang = np.array(cfg['angles'], float)
    ang = np.r_[ang[-1:] - [360, 0], ang, ang[:1] + [360, 0]]
    peak = float(ang[:, 1].max())
    cx, cz = cfg['centre_xz']
    y0, y1 = cfg['y']
    for name in cfg['meshes']:
        obj = bpy.data.objects[name]
        L = er.M.to_local(er.world(obj)) * 1000
        phi = np.degrees(np.arctan2(L[:, 0] - cx, L[:, 2] - cz)) % 360
        amount = np.interp(phi, ang[:, 0], ang[:, 1])
        r = np.hypot(L[:, 0] - cx, L[:, 2] - cz)
        w = amount / peak * smoothstep((L[:, 1] - y0) / (y1 - y0)) * smoothstep((cfg['r_max'] - r) / 10.0)
        before = er.world(obj)
        warp(obj, w, tuple(down * peak / 1000))
        print('BODY_SHAPE collar_lower', name, 'vertices', int((w > 1e-3).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def head_side_field(obj, cfg):
    """Inward move (mm, head-frame |x|) of the sides of the head round the ear root: in the front view the head
    behind the cheek (|x| 92-95 mm at z -10..20) stood 3-9 px outside the reference's cheek outline, so the cheek
    and the jaw angle read wide and square.  Amount by height per side (cfg['profile_right'] for x < 0,
    cfg['profile_left'] for x > 0, [y_mm, mm] pairs), full over cfg['z'][1]..cfg['z'][2] and none beyond
    cfg['z'][0] / cfg['z'][3] (the cheek front and the back of the head stay), none inside |x| cfg['x'][0]."""
    L = er.M.to_local(er.world(obj)) * 1000
    out = np.zeros(len(L))
    for key, side in (('profile_right', -1), ('profile_left', 1)):
        pr = np.array(cfg[key], float)
        o = np.argsort(pr[:, 0])
        d = np.interp(L[:, 1], pr[o, 0], pr[o, 1], left=0.0, right=0.0)
        out = np.where(np.sign(L[:, 0]) == side, d, out)
    z0, z1, z2, z3 = cfg['z']
    out *= smoothstep((L[:, 2] - z0) / (z1 - z0)) * smoothstep((z3 - L[:, 2]) / (z3 - z2))
    x0, x1 = cfg['x']
    return out * smoothstep((np.abs(L[:, 0]) - x0) / (x1 - x0)), L


def head_side_in(cfg):
    """The same field on the head and the shaved-temple shell over it (Blender's Warp, one vector per side)."""
    for name in cfg['meshes']:
        obj = bpy.data.objects[name]
        f, L = head_side_field(obj, cfg)
        peak = float(f.max())
        if peak <= 0:
            continue
        before = er.world(obj)
        for side in (-1, 1):
            vec = er.M.to_world_delta(np.array([[-side * 1.0, 0.0, 0.0]]))[0]
            vec = vec / np.linalg.norm(vec) * peak / 1000
            warp(obj, f * (np.sign(L[:, 0]) == side) / peak, tuple(vec))
        print('BODY_SHAPE head_side_in', name, 'vertices', int((f > 1e-3).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def skull_back(cfg):
    """The back of the skull bulged out behind the reference's line in the left side view (10-12 px over rows
    300-345): forward move (head z, Blender's Warp) by height (cfg['profile'] = [y_mm, mm]), on the back only
    (cfg['z'] = [none, full], head z mm), on the left half (cfg['x_side'] = [none, full], head x mm) and fading to the
    sides (cfg['x_out'] = [full, none], |x| mm); the same field on the head and on the shells that lie on it."""
    fwd = er.M.to_world_delta(np.array([[0.0, 0.0, 1.0]]))[0]
    fwd /= np.linalg.norm(fwd)
    pr = np.array(cfg['profile'], float)
    o = np.argsort(pr[:, 0])
    peak = float(pr[:, 1].max())
    for name in cfg['meshes']:
        obj = bpy.data.objects[name]
        L = er.M.to_local(er.world(obj)) * 1000
        d = np.interp(L[:, 1], pr[o, 0], pr[o, 1], left=0.0, right=0.0)
        (z0, z1), (s0, s1), (x0, x1) = cfg['z'], cfg['x_side'], cfg['x_out']
        w = d / peak * smoothstep((z0 - L[:, 2]) / (z0 - z1)) * smoothstep((L[:, 0] - s0) / (s1 - s0))
        w *= smoothstep((x1 - np.abs(L[:, 0])) / (x1 - x0))
        before = er.world(obj)
        warp(obj, w, tuple(fwd * peak / 1000))
        print('BODY_SHAPE skull_back', name, 'vertices', int((w > 1e-3).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def smooth_regions(steps):
    """Bumps left on the bald head and the neck after the shape steps (2026-10-08, user: 後頭部の凸凹を滑らかに):
    the back of the skull had a flat band with horizontal ridges (skull_back moved y -25..28 forward 12 mm, the
    source bulge above stayed) and the head-to-neck join at the back had a ledge and a groove.  Each step is
    Blender's Smooth on cfg['mesh'] limited to an ellipsoid (head-frame mm, cfg['centre'], cfg['r']; weight
    cos^2 of the scaled distance).  HEAD_face is two halves not joined at the midline: the step runs in chunks
    and puts each midline pair back on its mean after each (as face_volume does).  Meshes lying on it
    (cfg['follow']) follow by Surface Deform bound before."""
    import inkwave_face_volume as fv
    for cfg in steps:
        obj = bpy.data.objects[cfg['mesh']]
        pairs = fv.seam_pairs(obj)
        mods = []
        for r in cfg.get('follow', []):
            f = bpy.data.objects[r]
            mod = f.modifiers.new('INKWAVE_smooth_follow', 'SURFACE_DEFORM')
            mod.target = obj
            er.with_object(f, lambda: bpy.ops.object.surfacedeform_bind(modifier=mod.name))
            if not mod.is_bound:
                raise RuntimeError(f'Surface Deform could not bind {r}')
            mods.append((f, mod))
        L = er.M.to_local(er.world(obj)) * 1000
        d = np.linalg.norm((L - np.array(cfg['centre'], float)) / np.array(cfg['r'], float), axis=1)
        w = np.where(d < 1, np.cos(np.clip(d, 0, 1) * np.pi / 2) ** 2, 0.0)
        if cfg.get('y_min') is not None:
            w *= smoothstep((L[:, 1] - cfg['y_min'][0]) / (cfg['y_min'][1] - cfg['y_min'][0]))
        if cfg.get('keep_near'):
            # the head's lower edge lies on the neck: smoothing it lifts the edge off the neck and its teeth show,
            # so nothing moves within keep_near['mm'][0] of keep_near['mesh'], full beyond mm[1]
            from mathutils.bvhtree import BVHTree
            kn = cfg['keep_near']
            other = bpy.data.objects[kn['mesh']]
            tree = BVHTree.FromObject(other, bpy.context.evaluated_depsgraph_get())
            inv = other.matrix_world.inverted()
            idx = np.flatnonzero(w > 1e-4)
            dist = np.full(len(w), 1e9)
            Wd = er.world(obj)
            dist[idx] = [tree.find_nearest(inv @ Vector(Wd[i]))[3] * 1000 for i in idx]
            d0, d1 = kn['mm']
            w *= smoothstep((dist - d0) / (d1 - d0))
        before = er.world(obj)
        chunks = int(cfg.get('chunks', 1))
        for _ in range(chunks):
            er.apply_weighted_modifier(obj, w, 'SMOOTH', factor=cfg['factor'], iterations=max(1, cfg['iters'] // chunks))
            if len(pairs):
                fv.join_seam(obj, pairs)
        for f, mod in mods:
            er.apply_modifier(f, mod)
        print('BODY_SHAPE smooth', cfg['name'], 'vertices', int((w > 1e-3).sum()), 'midline pairs', len(pairs),
              'max move mm', round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def nape_fillet(cfg):
    """The head's lower edge rode over the back of the neck as a thin lip (seen from behind and the back 3/4).
    Near the neck the head is laid onto it: Blender's Shrinkwrap (nearest surface point, outside, cfg['offset_mm'])
    on the head, full where it is within cfg['mm'][0] of the neck, none beyond cfg['mm'][1]; back only
    (head z < cfg['z'][0], full behind cfg['z'][1]) and below head y cfg['y_max']."""
    from mathutils.bvhtree import BVHTree
    face, neck = bpy.data.objects[cfg['mesh']], bpy.data.objects[cfg['target']]
    tree = BVHTree.FromObject(neck, bpy.context.evaluated_depsgraph_get())
    inv = neck.matrix_world.inverted()
    W = er.world(face)
    L = er.M.to_local(W) * 1000
    w = smoothstep((cfg['z'][0] - L[:, 2]) / (cfg['z'][0] - cfg['z'][1])) * (L[:, 1] < cfg['y_max'])
    idx = np.flatnonzero(w > 1e-4)
    dist = np.full(len(w), 1e9)
    dist[idx] = [tree.find_nearest(inv @ Vector(W[i]))[3] * 1000 for i in idx]
    d0, d1 = cfg['mm']
    w *= 1 - smoothstep((dist - d0) / (d1 - d0))
    before = er.world(face)
    er.apply_weighted_modifier(face, w, 'SHRINKWRAP', target=neck, wrap_method='NEAREST_SURFACEPOINT',
                               wrap_mode='OUTSIDE_SURFACE', offset=cfg['offset_mm'] / 1000)
    print('BODY_SHAPE nape_fillet vertices', int((w > 1e-3).sum()), 'max move mm',
          round(float(np.linalg.norm(er.world(face) - before, axis=1).max() * 1000), 2))


def back_profile(cfg):
    """Moves added one after the other (nape, skull_back, ...) left the back of the head with a flat stretch at ear
    height and a dent where it meets the neck (2026-10-08, user circled both on a side view).  One smooth target
    line instead: the back midline (head x 0, the furthest-back point of the head and the neck at each height) is
    moved onto cfg['target'] ([y_mm, z_mm], one smooth curve from the neck to the crown).  Move = target - now at
    each height (smoothed, sigma cfg['sigma_mm']), the same for the whole slice at that height, back part only
    (head z < cfg['z'][0], full behind cfg['z'][1]), fading to the sides (cfg['x_out'] = [full, none] |x| mm).
    Blender's Warp, forward and backward as two passes, on cfg['meshes']."""
    fwd = er.M.to_world_delta(np.array([[0.0, 0.0, 1.0]]))[0]
    fwd /= np.linalg.norm(fwd)
    Ls = [er.M.to_local(er.world(bpy.data.objects[n])) * 1000 for n in cfg['measure']]
    A = np.concatenate(Ls)
    A = A[(np.abs(A[:, 0]) < 4) & (A[:, 2] < 0)]
    tg = np.array(cfg['target'], float)
    tg = tg[np.argsort(tg[:, 0])]
    ys = np.arange(tg[0, 0], tg[-1, 0] + 0.1, 1.0)
    now = np.array([A[np.abs(A[:, 1] - y) < 2.0, 2].min() if np.any(np.abs(A[:, 1] - y) < 2.0) else np.nan for y in ys])
    ok = ~np.isnan(now)
    now = np.interp(ys, ys[ok], now[ok])
    move = np.interp(ys, tg[:, 0], tg[:, 1]) - now
    sig = cfg.get('sigma_mm', 5.0)
    k = np.exp(-0.5 * (np.arange(-3 * sig, 3 * sig + 1) / sig) ** 2)
    move = np.convolve(np.pad(move, len(k) // 2, mode='edge'), k / k.sum(), mode='valid')
    ramp = cfg.get('end_ramp_mm', 10.0)        # nothing at the two ends of the target line
    move *= np.clip((ys - ys[0]) / ramp, 0, 1) * np.clip((ys[-1] - ys) / ramp, 0, 1)
    print('BODY_SHAPE back_profile move mm by y', [(int(y), round(float(m), 1)) for y, m in zip(ys[::10], move[::10])])
    (z0, z1), (x0, x1) = cfg['z'], cfg['x_out']
    peak = float(np.abs(move).max())
    if peak < 1e-3:
        return
    for name in cfg['meshes']:
        obj = bpy.data.objects[name]
        L = er.M.to_local(er.world(obj)) * 1000
        d = np.interp(L[:, 1], ys, move, left=0.0, right=0.0)
        w = d / peak * smoothstep((z0 - L[:, 2]) / (z0 - z1)) * smoothstep((x1 - np.abs(L[:, 0])) / (x1 - x0))
        before = er.world(obj)
        for sign in (1, -1):
            ws = np.maximum(sign * w, 0)
            if ws.max() > 0:
                warp(obj, ws, tuple(sign * fwd * peak / 1000))
        print('BODY_SHAPE back_profile', name, 'max move mm',
              round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def seam_normals(cfg):
    """A line ran from under the ear to under the jaw in the side and 3/4 views where the face (laid on the neck by
    face_volume jaw_tuck) meets the neck: the shading jumped there (clay +5 brighter on the neck side).  The face
    near the neck takes the neck's normals (Blender's Data Transfer, custom normals): full within cfg['mm'][0] of
    the neck surface, none beyond cfg['mm'][1], below head y cfg['y_max'].  Last of all, after every step that moves
    the neck or the face (nape, collar, ...), so the copied normals match the final neck."""
    from mathutils.bvhtree import BVHTree
    face, neck = bpy.data.objects[cfg['face']], bpy.data.objects[cfg['neck']]
    tree = BVHTree.FromObject(neck, bpy.context.evaluated_depsgraph_get())
    inv = neck.matrix_world.inverted()
    W = er.world(face)
    dist = np.array([tree.find_nearest(inv @ Vector(q))[3] for q in W]) * 1000
    d0, d1 = cfg['mm']
    w = smoothstep((d1 - dist) / (d1 - d0)) * (er.M.to_local(W)[:, 1] * 1000 < cfg['y_max'])
    er.apply_weighted_modifier(face, w, 'DATA_TRANSFER', object=neck, use_loop_data=True,
                               data_types_loops={'CUSTOM_NORMAL'}, loop_mapping='POLYINTERP_NEAREST')
    print('BODY_SHAPE seam_normals vertices', int((w > 1e-3).sum()), 'full', int((w > 0.999).sum()))


def jacket_field(W, cfg):
    """Outward move of the jacket's open front edges at the waist (front parts only)."""
    x, y, z = W[:, 0], W[:, 1], W[:, 2]
    (za, zb), (fl, fh) = cfg['z'], cfg['z_fade']
    w = band(z, za, zb, fl, fh)
    w *= smoothstep((cfg['y_front'] - y) / cfg['y_fade'])
    w *= smoothstep((cfg['x_out'] - np.abs(x)) / 0.03)
    return w


def subdivide_round(obj, centre, radius, levels):
    """Edit-mode Subdivide (built-in) of the faces whose centre is within radius of a world point."""
    me = obj.data
    mw = obj.matrix_world
    for _ in range(levels):
        bm = bmesh.new()
        bm.from_mesh(me)
        c = Vector(centre)
        faces = [f for f in bm.faces if ((mw @ f.calc_center_median()) - c).length < radius]
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True, smooth=0.0)
        bm.to_mesh(me)
        bm.free()
        me.update()
    return len(me.vertices)


def navel(obj, cfg):
    """Navel: a small soft pit straight into the belly (world +y) with a rounded rim, plus a faint vertical ab
    line above it.  Moves along a fixed direction, so the two halves of the midline seam move alike."""
    W = er.world(obj)
    cx, cz = cfg['centre_xz']
    dx, dz = (W[:, 0] - cx) / cfg['rx'], (W[:, 2] - cz) / cfg['rz']
    r = np.hypot(dx, dz)
    front = smoothstep((cfg['y_front'] - W[:, 1]) / 0.02)
    pit = np.exp(-(r / 0.55) ** 2) * front
    warp(obj, pit, (0.0, cfg['depth'], 0.0))
    W = er.world(obj)
    r = np.hypot((W[:, 0] - cx) / cfg['rx'], (W[:, 2] - cz) / cfg['rz'])
    rim = np.exp(-((r - 1.15) / 0.35) ** 2) * front * smoothstep((W[:, 2] - (cz - cfg['rz'] * 0.2)) / 0.004)
    warp(obj, rim, (0.0, -cfg['rim'], 0.0))
    W = er.world(obj)
    lc = cfg['ab_line']
    line = np.exp(-(W[:, 0] / lc['half_width']) ** 2) * band(W[:, 2], lc['z'][0], lc['z'][1], 0.012, 0.015)
    line *= smoothstep((cfg['y_front'] - W[:, 1]) / 0.02)
    line *= smoothstep((np.hypot((W[:, 0] - cx) / cfg['rx'], (W[:, 2] - cz) / cfg['rz']) - 1.6) / 0.8)
    warp(obj, line, (0.0, lc['depth'], 0.0))


def knees(names, cfg):
    """Knee: a kneecap (forward), a soft hollow above it and two small hollows beside its lower edge, for both
    legs (x mirrored).  The same field moves the skin and the socks lying on it."""
    for name in names:
        obj = bpy.data.objects[name]
        for part in cfg['parts']:
            W = er.world(obj)
            for side in (-1, 1):
                cx, cz = part['centre_xz']
                d = np.hypot((W[:, 0] - side * cx) / part['rx'], (W[:, 2] - cz) / part['rz'])
                w = np.where(d < 1, np.cos(np.clip(d, 0, 1) * np.pi / 2) ** 2, 0.0)
                w *= smoothstep((cfg['y_front'] - W[:, 1]) / 0.02) * (np.sign(W[:, 0]) == side)
                warp(obj, w, (0.0, -part['forward_m'], 0.0))


SHELL, NAIL, NAIL_MAT, NAIL_IMG = 'INKWAVE_glove_shell_', 'INKWAVE_nail_', 'INKWAVE_nail', 'INKWAVE_NAIL_ALPHA'


def orientation(obj):
    """+1 when the mesh's faces point outward, -1 when it is inside out (the source hands are: their signed
    volume is negative; they render the same, but their face normals point into the hand)."""
    me = obj.data
    me.calc_loop_triangles()
    co = np.array([v.co for v in me.vertices])
    t = np.array([lt.vertices[:] for lt in me.loop_triangles])
    vol = np.einsum('ij,ij->i', co[t[:, 0]], np.cross(co[t[:, 1]], co[t[:, 2]])).sum()
    return 1.0 if vol >= 0 else -1.0


def hand_frame(hand):
    co = er.world(hand)
    top = co[co[:, 2] > co[:, 2].max() - 0.01].mean(0)
    tip = co[co[:, 2] < co[:, 2].min() + 0.01].mean(0)
    ax = tip - top
    length = float(np.linalg.norm(ax))
    return co, top, ax / length, length


def glove_shell(hand, cfg, material):
    """A glove that wraps the whole hand from under the wrist strap to the middle of the first finger bones: a
    copy of the hand skin and of the wrist part of the arm skin (joined with Merge by Distance), cut with Blender's
    Bisect across the hand axis at both ends, pushed out along the normals (Displace) and given a thickness
    (Solidify, so the openings show a rim)."""
    co, top, ax, length = hand_frame(hand)
    bm = bmesh.new()
    bm.from_mesh(hand.data)
    bm.transform(hand.matrix_world)
    arm = bpy.data.objects[hand.name.replace('hand', 'arm')]
    tmp = arm.data.copy()
    tmp.transform(arm.matrix_world)
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])         # one outward winding (the hand is inside out)
    cut = top + ax * length * cfg['t_cut']
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(cut), plane_no=Vector(ax), clear_outer=True)
    upper = top - ax * cfg['wrist_m']
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(upper), plane_no=Vector(-ax), clear_outer=True)
    me = bpy.data.meshes.new(SHELL + hand.name[-1])
    if cfg.get('thumb_keep_m'):
        # the reference glove covers only the base of the thumb: drop the shell over the rest of it (the thumb is
        # the smallest of the five pieces that reach past finger_t; distance measured from its tip)
        thumb, tip = thumb_part(hand, cfg)
        from mathutils.kdtree import KDTree
        kd = KDTree(len(co))
        for i, c in enumerate(co):
            kd.insert(Vector(c), i)
        kd.balance()
        cut_faces = []
        for f in bm.faces:
            c = f.calc_center_median()
            _, i, _ = kd.find(c)
            if thumb[i] and (Vector(tip) - c).length < cfg['thumb_tip_m'] - cfg['thumb_keep_m']:
                cut_faces.append(f)
        bmesh.ops.delete(bm, geom=cut_faces, context='FACES')
        print('BODY_SHAPE glove: thumb faces removed', len(cut_faces), 'thumb vertices', int(thumb.sum()), 'tip', np.round(tip, 3).tolist())
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(material)
    obj = bpy.data.objects.new(me.name, me)
    if orientation(obj) < 0:                                       # open at both ends: make sure it points out
        me.flip_normals()
    like = bpy.data.objects[cfg['collection_like']]
    for col in like.users_collection:
        col.objects.link(obj)
    adopt(obj, like)
    mod = obj.modifiers.new('offset', 'DISPLACE')
    mod.direction, mod.mid_level, mod.strength = 'NORMAL', 0.0, cfg['offset_m']
    er.apply_modifier(obj, mod)
    mod = obj.modifiers.new('thickness', 'SOLIDIFY')
    mod.thickness, mod.offset, mod.use_rim = cfg['thickness_m'], 1.0, True
    er.apply_modifier(obj, mod)
    print('BODY_SHAPE glove shell', obj.name, 'vertices', len(me.vertices))
    return obj


def finger_parts(hand, finger_t):
    """Connected pieces of the hand past finger_t of its length (fingers), largest first."""
    co, top, ax, length = hand_frame(hand)
    t = (co - top) @ ax / length
    nb = [[] for _ in co]
    for e in hand.data.edges:
        i, j = e.vertices
        nb[i].append(j)
        nb[j].append(i)
    sel = t > finger_t
    comp = -np.ones(len(co), int)
    k = 0
    for s0 in np.nonzero(sel)[0]:
        if comp[s0] >= 0:
            continue
        stack, comp[s0] = [s0], k
        while stack:
            u = stack.pop()
            for w in nb[u]:
                if sel[w] and comp[w] < 0:
                    comp[w] = k
                    stack.append(w)
        k += 1
    sizes = sorted(((int((comp == c).sum()), c) for c in range(k)), reverse=True)
    return co, comp, [c for _, c in sizes]


def hand_pieces(hand, cfg):
    """(four fingers, thumb) as piece ids: the fingers are the pieces that reach past 0.8 of the hand length;
    the thumb is, of the other pieces with enough vertices, the one whose far end lies most to the front (-y).
    (A piece of the palm's edge behind the fingers also sticks out past finger_t.)"""
    co, comp, order = finger_parts(hand, cfg['finger_t'])
    _, top, ax, length = hand_frame(hand)
    t = (co - top) @ ax / length
    fingers, rest = [], []
    for c in order:
        idx = np.nonzero(comp == c)[0]
        if len(idx) < cfg['min_vertices']:
            continue
        far = idx[np.argmax(np.linalg.norm(co[idx] - top, axis=1))]
        (fingers if t[idx].max() > 0.8 else rest).append((c, co[far][1]))
    thumb = min(rest, key=lambda r: r[1])[0]
    return co, comp, [c for c, _ in fingers], thumb


def thumb_part(hand, cfg):
    """Thumb vertices (the whole thumb, grown back from its tip piece along the mesh) and its tip point."""
    co, comp, _, piece = hand_pieces(hand, cfg)
    idx = np.nonzero(comp == piece)[0]
    _, top, ax, length = hand_frame(hand)
    far = idx[np.argmax(np.linalg.norm(co[idx] - top, axis=1))]
    tip = co[far]
    thumb = np.linalg.norm(co - tip, axis=1) < cfg['thumb_tip_m'] + 0.01
    thumb &= np.isin(comp, [piece, -1]) & (np.linalg.norm(co - co[idx].mean(0), axis=1) < cfg['thumb_tip_m'])
    return thumb, tip


def nail_image(cfg):
    img = bpy.data.images.get(NAIL_IMG)
    size = 128
    if img is None:
        img = bpy.data.images.new(NAIL_IMG, size, size, alpha=True)
    yy, xx = (np.mgrid[0:size, 0:size] + 0.5) / size * 2 - 1        # u across, v along the finger (+v = tip)
    # rounded nail: a superellipse; the free edge (v > 0.55) is lighter
    r = (np.abs(xx) ** 2.6 + np.abs(yy) ** 2.6) ** (1 / 2.6)
    a = np.clip((1 - r) / 0.06, 0, 1)
    px = np.empty((size, size, 4), np.float32)
    base, tip = np.array(cfg['colour'], np.float32), np.array(cfg['tip_colour'], np.float32)
    f = np.clip((yy - 0.45) / 0.3, 0, 1)[..., None]
    px[..., :3] = base * (1 - f) + tip * f
    px[..., 3] = a * a * (3 - 2 * a)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def nail_material(cfg):
    mat = bpy.data.materials.get(NAIL_MAT) or bpy.data.materials.new(NAIL_MAT)
    mat.use_nodes = True
    t = mat.node_tree
    bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next((n for n in t.nodes if n.type == 'TEX_IMAGE'), None) or t.nodes.new('ShaderNodeTexImage')
    tex.image, tex.extension = nail_image(cfg), 'CLIP'
    t.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    t.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = cfg['roughness']
    bsdf.inputs['Coat Weight'].default_value = cfg['coat']
    bsdf.inputs['Specular IOR Level'].default_value = cfg.get('specular', 0.4)
    mat.surface_render_method = 'BLENDED'
    mat['inkwave_role'] = 'skin'
    return mat


def nails(hand, cfg, material):
    """A nail on each finger tip: the skin of the tip's back (away from the palm), copied, subdivided once and laid
    0.3 mm over the skin, with a UV map along / across the finger and a rounded alpha image, so its outline is
    smooth whatever the mesh."""
    me = hand.data
    co, top, ax, length = hand_frame(hand)
    sgn = orientation(hand)
    nw = sgn * np.array([(hand.matrix_world.to_3x3() @ v.normal).normalized() for v in me.vertices])
    t = (co - top) @ ax / length
    nb = [[] for _ in co]
    for e in me.edges:
        i, j = e.vertices
        nb[i].append(j)
        nb[j].append(i)
    sel = t > cfg['finger_t']
    comp = -np.ones(len(co), int)
    k = 0
    for s in np.nonzero(sel)[0]:
        if comp[s] >= 0:
            continue
        stack, comp[s] = [s], k
        while stack:
            u = stack.pop()
            for w in nb[u]:
                if sel[w] and comp[w] < 0:
                    comp[w] = k
                    stack.append(w)
        k += 1
    side = 1.0 if co[:, 0].mean() > 0 else -1.0
    back = np.array([side, 0.0, 0.0])
    made = 0
    # the five largest pieces past finger_t are the fingers (a small piece of the palm's edge can also stick out)
    _, _, four, thumb = hand_pieces(hand, cfg)
    for c in four + [thumb]:
        idx = np.nonzero(comp == c)[0]
        far = idx[np.argmax(np.linalg.norm(co[idx] - top, axis=1))]
        near_tip = idx[np.linalg.norm(co[idx] - co[far], axis=1) < 0.03]
        fa = co[far] - co[near_tip].mean(0)
        fa /= np.linalg.norm(fa)                                   # finger direction near the tip
        guess = back if t[far] > cfg['thumb_t'] else back + np.array([0.0, -1.0, 0.0])
        cand = near_tip[(nw[near_tip] @ guess) > 0]
        dorsal = nw[cand].sum(0)
        dorsal -= fa * (dorsal @ fa)
        dorsal /= np.linalg.norm(dorsal)
        across = np.cross(fa, dorsal)
        rel = co - co[far]
        along = rel @ fa                                          # 0 at the tip, negative toward the hand
        lat = rel @ across
        L, Wd = cfg['length_m'], cfg['width_m']
        region = set(int(i) for i in idx if (nw[i] @ dorsal) > 0.15 and -L * 1.25 < along[i] < 0.002 and abs(lat[i]) < Wd * 0.75)
        faces = [p for p in me.polygons if all(v in region for v in p.vertices)]
        if not faces:
            continue
        bm = bmesh.new()
        vmap = {}
        for p in faces:
            for v in p.vertices:
                if v not in vmap:
                    vmap[v] = bm.verts.new(Vector(co[v]))
            bm.faces.new([vmap[v] for v in p.vertices])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
        if sgn < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        nme = bpy.data.meshes.new(f'{NAIL}{hand.name[-1]}_{made}')
        bm.to_mesh(nme)
        bm.free()
        for poly in nme.polygons:
            poly.use_smooth = True
        nme.materials.append(material)
        obj = bpy.data.objects.new(nme.name, nme)
        for col in hand.users_collection:
            col.objects.link(obj)
        adopt(obj, hand)
        sm = obj.modifiers.new('round', 'SMOOTH')                   # round off the finger mesh's facets
        sm.factor, sm.iterations = 0.5, cfg.get('smooth_iters', 8)
        er.apply_modifier(obj, sm)
        sw = obj.modifiers.new('seat', 'SHRINKWRAP')
        # the offset is along the target's normals, which point into the hand when it is inside out
        sw.target, sw.wrap_method, sw.wrap_mode, sw.offset = hand, 'NEAREST_SURFACEPOINT', 'ON_SURFACE', sgn * cfg['offset_m']
        er.apply_modifier(obj, sw)
        P = er.world(obj)
        rel = P - co[far]
        # the nail runs from L back from the tip (cfg) to just short of it; u across, v along (+ toward the tip)
        u = 0.5 + 0.5 * (rel @ across) / (Wd / 2)
        v = 0.5 + 0.5 * ((rel @ fa) + cfg['tip_gap_m'] + L / 2) / (L / 2)
        nme.uv_layers.new(name='UVMap')
        lv = np.empty(len(nme.loops), np.int32)
        nme.loops.foreach_get('vertex_index', lv)
        nme.uv_layers.active.data.foreach_set('uv', np.c_[u[lv], v[lv]].astype(np.float32).ravel())
        obj.visible_shadow = False
        made += 1
    print('BODY_SHAPE nails', hand.name, made)


def squash(names, cfg):
    """Pull the far part of a garment toward a plane along one world axis (Warp with a weight that grows with the
    distance past the plane, so the distances shrink by cfg['keep']), only over a height band:
      axis, side (+1: the part past `at` toward +axis), at (m), keep (0..1), z = [z_full_from, z_full_to] with
      z_fade [below, above], and optional mirror_x (x < 0 moves with the mirrored field: same for both sides).
    Every listed mesh gets the same field, so layers lying on each other keep their spacing."""
    ax = 'xyz'.index(cfg['axis'])
    for name in names:
        obj = bpy.data.objects[name]
        W = er.world(obj)
        sides = (-1.0, 1.0) if cfg.get('mirror_x') else (None,)
        before = W.copy()
        for sx in sides:
            v = W[:, ax] * (sx if (sx is not None and ax == 0) else 1.0)
            d = cfg['side'] * (v - cfg['at'])
            span = cfg['span']
            w = np.clip(d / span, 0, None)
            (za, zb), (fl, fh) = cfg['z'], cfg['z_fade']
            w = w * band(W[:, 2], za, zb, fl, fh)
            if sx is not None:
                w = w * (np.sign(W[:, 0]) == sx)
            vec = [0.0, 0.0, 0.0]
            vec[ax] = -cfg['side'] * (1 - cfg['keep']) * span * (sx if (sx is not None and ax == 0) else 1.0)
            warp(obj, w, tuple(vec))
        print('BODY_SHAPE squash', cfg.get('name', ''), name, 'max move mm', round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))


def slim_sleeves(cfg):
    """Puffy sleeves pulled toward the arm: Blender's Shrinkwrap (nearest surface point of the arm, offset
    cfg['offset_m']) on a vertex group whose weight is cfg['amount'] over the upper arm and fades out toward
    the shoulder seam and the cuff, so the sleeve keeps part of its puff.  Everything riding on the sleeve
    (the upper-arm strap and its buckle) follows with Surface Deform bound before."""
    for sleeve_name, arm_name, riders in cfg['pairs']:
        sleeve, arm = bpy.data.objects[sleeve_name], bpy.data.objects[arm_name]
        mods = []
        for r in riders:
            obj = bpy.data.objects[r]
            mod = obj.modifiers.new('INKWAVE_sleeve_follow', 'SURFACE_DEFORM')
            mod.target = sleeve
            er.with_object(obj, lambda: bpy.ops.object.surfacedeform_bind(modifier=mod.name))
            if not mod.is_bound:
                raise RuntimeError(f'Surface Deform could not bind {r}')
            mods.append((obj, mod))
        W = er.world(sleeve)
        (za, zb), (fl, fh) = cfg['z'], cfg['z_fade']
        w = cfg['amount'] * band(W[:, 2], za, zb, fl, fh)
        before = W.copy()
        # the sleeve's seams are split edges (two vertices at one point): they must move together or the seam
        # opens (Shrinkwrap finds a different nearest point for each)
        from mathutils.kdtree import KDTree
        kd = KDTree(len(W))
        for i, c in enumerate(W):
            kd.insert(Vector(c), i)
        kd.balance()
        groups = {}
        for i, c in enumerate(W):
            near = sorted(j for _, j, _ in kd.find_range(Vector(c), 1e-6))
            if len(near) > 1:
                groups[near[0]] = near
        er.apply_weighted_modifier(sleeve, w, 'SHRINKWRAP', target=arm, wrap_method='NEAREST_SURFACEPOINT',
                                   wrap_mode='OUTSIDE_SURFACE', offset=cfg['offset_m'])
        if cfg.get('smooth_iters'):
            er.apply_weighted_modifier(sleeve, np.clip(w / max(cfg['amount'], 1e-6), 0, 1), 'SMOOTH', factor=0.5,
                                       iterations=cfg['smooth_iters'])
        if groups:
            me = sleeve.data
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3)
            for g in groups.values():
                co[g] = co[g].mean(0)
            me.vertices.foreach_set('co', co.ravel())
            me.update()
        for obj, mod in mods:
            er.apply_modifier(obj, mod)
        print('BODY_SHAPE sleeve', sleeve_name, 'max move mm', round(float(np.linalg.norm(er.world(sleeve) - before, axis=1).max() * 1000), 2))


def adopt(obj, like):
    """Same parent as `like` (the character root's hierarchy is what the GLB export takes), world position kept."""
    obj.parent = like.parent
    obj.matrix_parent_inverse = like.parent.matrix_world.inverted() if like.parent else obj.matrix_parent_inverse


def legwear_tone(cfg):
    """The socks render light grey with white streaks where the reference is near-black knit: the knit's sheen
    (1.0) lights every rib edge.  Less sheen and a softer rib normal; old values kept on the material."""
    for name in cfg['materials']:
        mat = bpy.data.materials[name]
        n = next(x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        nm = next((x for x in mat.node_tree.nodes if x.type == 'NORMAL_MAP'), None)
        if SUFFIX not in mat:
            mat[SUFFIX] = json.dumps({'sheen': n.inputs['Sheen Weight'].default_value,
                                      'normal': nm.inputs['Strength'].default_value if nm else None})
        n.inputs['Sheen Weight'].default_value = cfg['sheen']
        if nm is not None:
            nm.inputs['Strength'].default_value = cfg['normal_strength']


def restore_legwear():
    for mat in bpy.data.materials:
        if SUFFIX not in mat or not mat.use_nodes:
            continue
        old = json.loads(mat[SUFFIX])
        n = next(x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        n.inputs['Sheen Weight'].default_value = old['sheen']
        nm = next((x for x in mat.node_tree.nodes if x.type == 'NORMAL_MAP'), None)
        if nm is not None and old['normal'] is not None:
            nm.inputs['Strength'].default_value = old['normal']
        del mat[SUFFIX]


def remove_made():
    for o in [o for o in bpy.data.objects if o.name.startswith((SHELL, NAIL))]:
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for name in (NAIL_MAT,):
        if bpy.data.materials.get(name) is not None and bpy.data.materials[name].users == 0:
            bpy.data.materials.remove(bpy.data.materials[name])
    img = bpy.data.images.get(NAIL_IMG)
    if img is not None and img.users == 0:
        bpy.data.images.remove(img)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--params', default=str(PARAMS))
    ap.add_argument('--save')
    ap.add_argument('--restore', action='store_true')
    args = ap.parse_args(argv)
    p = json.loads(Path(args.params).read_text())
    names = [p['torso']] + p['belly']['garments'] + p['jacket']['garments']
    names += p.get('knees', {}).get('meshes', []) + p.get('gloves', {}).get('plates', [])
    for sq in p.get('squash', []):
        names += [n for n in sq['meshes'] if n not in names]
    for sl, _, riders in p.get('sleeves', {}).get('pairs', []):
        names += [n for n in [sl] + riders if n not in names]
    names += [n for n in p.get('nape', {}).get('meshes', []) if n not in names]
    names += [n for n in p.get('collar_lower', {}).get('meshes', []) if n not in names]
    names += [n for n in p.get('hood_lower', {}).get('meshes', []) if n not in names]
    names += [n for n in p.get('head_side_in', {}).get('meshes', []) if n not in names]
    names += [n for n in p.get('skull_back', {}).get('meshes', []) if n not in names]
    names += [n for n in p.get('occiput_in', {}).get('meshes', []) if n not in names]
    names += [n for n in [p.get('nape_fillet', {}).get('mesh')] if n and n not in names]
    names += [n for n in p.get('back_profile', {}).get('meshes', []) if n not in names]
    for sm in p.get('smooth_regions', []):
        names += [n for n in [sm['mesh']] + sm.get('follow', []) if n not in names]
    names += [n for n in [p.get('seam_normals', {}).get('face')] if n and n not in names]
    remove_made()
    restore_legwear()
    print('BODY_SHAPE restored', restore(names, drop=args.restore), 'meshes')
    if not args.restore:
        back_up(names)
        torso = bpy.data.objects[p['torso']]
        if p.get('navel'):
            n = p['navel']
            front_y = float(er.world(torso)[:, 1].min())
            count = subdivide_round(torso, (n['centre_xz'][0], front_y, n['centre_xz'][1]), n['subdivide_radius'],
                                    n['subdivide_levels'])
            print('BODY_SHAPE torso subdivided round the navel: vertices', count)
        bc = p['belly']
        for name in [p['torso']] + bc['garments']:
            obj = bpy.data.objects[name]
            w = belly_field(er.world(obj), bc)
            before = er.world(obj)
            warp(obj, w, (0.0, -bc['forward_m'], 0.0))
            print('BODY_SHAPE belly', name, 'max move mm', round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))
        jc = p['jacket']
        for name in jc['garments']:
            obj = bpy.data.objects[name]
            W = er.world(obj)
            w = jacket_field(W, jc)
            before = W.copy()
            for side in (-1, 1):
                warp(obj, w * (np.sign(W[:, 0]) == side), (side * jc['outward_m'], 0.0, 0.0))
            print('BODY_SHAPE jacket', name, 'max move mm', round(float(np.linalg.norm(er.world(obj) - before, axis=1).max() * 1000), 2))
        if p.get('navel'):
            sm = p['navel'].get('smooth')
            if sm:
                # even out the moved belly before the navel goes in (the midline seam stays: its two open
                # edges would be pulled apart)
                W = er.world(torso)
                cx, cz = p['navel']['centre_xz']
                r = np.hypot((W[:, 0] - cx) / sm['radius'], (W[:, 2] - cz) / sm['radius'])
                w = smoothstep(1 - r) * smoothstep((p['navel']['y_front'] - W[:, 1]) / 0.02)
                w *= smoothstep((np.abs(W[:, 0]) - 0.002) / 0.006)
                er.apply_weighted_modifier(torso, w, 'SMOOTH', factor=0.5, iterations=sm['iters'])
            navel(torso, p['navel'])
            print('BODY_SHAPE navel done')
        if p.get('knees'):
            knees(p['knees']['meshes'], p['knees'])
            print('BODY_SHAPE knees done')
        if p.get('gloves'):
            g = p['gloves']
            mat = bpy.data.materials[g['material']]
            for hand in g['hands']:
                glove_shell(bpy.data.objects[hand], g, mat)
            for name in g['plates']:
                # the plates on the back of the hand sit on the old glove: out by the new shell's extra height
                obj = bpy.data.objects[name]
                W = er.world(obj)
                for side in (-1.0, 1.0):
                    warp(obj, (np.sign(W[:, 0]) == side).astype(float), (side * g['plate_out_m'], 0.0, 0.0))
        if p.get('legwear'):
            legwear_tone(p['legwear'])
        for sq in p.get('squash', []):
            squash(sq['meshes'], sq)
        if p.get('sleeves'):
            slim_sleeves(p['sleeves'])
        if p.get('nape'):
            nape(p['nape'])
        if p.get('collar_lower'):
            collar_lower(p['collar_lower'])
        if p.get('hood_lower'):
            # the hood lying on the shoulders stood 15-30 px higher than the reference behind the neck in both
            # side views (2026-10-08, user: 横から見た首の生え方が全然違う): it hid the back of the neck and
            # the collar, so the neck read as growing out of the hood.  Same per-direction lowering as the collar.
            collar_lower(p['hood_lower'])
        if p.get('head_side_in'):
            head_side_in(p['head_side_in'])
        if p.get('skull_back'):
            skull_back(p['skull_back'])
        if p.get('occiput_in'):
            # the lower back of the skull stood out behind the neck like a shelf (head y -70..-50: z -56 -> -90 mm
            # in 20 mm of height) and the whole back of the head sat far behind the neck (2026-10-08, user:
            # 首に対して後頭部が滑らかに繋がってなくて、後ろに出すぎ): the same forward move as skull_back,
            # with its own height profile (most at y -50, nothing at the neck and the crown)
            skull_back(p['occiput_in'])
        if p.get('back_profile'):
            back_profile(p['back_profile'])
        if p.get('nape_fillet'):
            nape_fillet(p['nape_fillet'])
        if p.get('smooth_regions'):
            smooth_regions(p['smooth_regions'])
        if p.get('nails'):
            mat = nail_material(p['nails'])
            for hand in p['nails']['hands']:
                nails(bpy.data.objects[hand], p['nails'], mat)
        if p.get('seam_normals'):
            seam_normals(p['seam_normals'])
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save, compress=True)


if __name__ == '__main__':
    main()
