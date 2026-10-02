"""Face volume: fuller cheeks round the mouth, a longer eye-to-cheek curve, a rounded nose bridge, a rounder jaw
outline from the front, the chin and its underside on the side reference, a nose with a tip ball, wings and
nostril dents, and the nose shading / lips / mouth line of the front reference painted on two decals
(analysis/face_volume/params.json).

Every edit is Blender's Displace modifier (along the normal) limited to a vertex group whose weights are smooth
bumps in the head frame (mvcore.to_local, mm; both sides, |x|), then a weighted Smooth.  The eye region (near the
eyeballs) and the lips are protected.  Everything that lies on the face (skin layers, decals, brows, lid crease
ribbons) follows with Surface Deform bound before the edit.  The meshes it changes are backed up
(`__pre_face_volume`) on the first run and restored at the start of every run, so runs never stack.

The lash rebuild places its parts on this skin, so it runs after this script:

  blender -b M.blend --python scripts/inkwave_lash_rebuild.py -- --restore --save M.blend
  blender -b M.blend --python scripts/inkwave_face_volume.py -- --save M.blend
  blender -b M.blend --python scripts/inkwave_lash_rebuild.py -- --save M.blend --export ... --game ...
  ... inkwave_face_volume.py -- --restore --save M.blend      # undo (drops the backups)

The paint of the nose and mouth uses analysis/face_volume/bare_front.png: the front render of the bare skin of
this same shape (analysis/face_volume/tools/bake_front.py on a build without `paint_nose` / `paint_mouth`), so
the paint adds only what the shape does not already show.  Make it again when a step that shapes the nose or
the mouth changes.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inkwave_eye_refine as er  # noqa: E402

M = er.M
NORMALS = None   # head-frame vertex normals of HEAD_face, set per step
PARAMS = er.ROOT / 'analysis/face_volume/params.json'
SUFFIX = '__pre_face_volume'
FACE = 'HEAD_face'
FOLLOWERS = ['HEAD_skin', 'HEAD_skin_04', 'HEAD_skin_02', 'HEAD_skin_03', 'HEAD_skin_05', 'HEAD_skin_06',
             'HEAD_skin_07', 'HEAD_skin_08', 'HEAD_skin_09', 'HEAD_brows', 'HEAD_brows_02', 'HEAD_eyes_12',
             'HEAD_eyes_29']
EYEBALLS = ['HEAD_eyes', 'HEAD_eyes_02', 'HEAD_eyes_18', 'HEAD_eyes_19']
IRIS_BALLS = {'HEAD_eyes_18': -1, 'HEAD_eyes': 1}
CHANGED = list(dict.fromkeys([FACE] + FOLLOWERS + list(IRIS_BALLS) + EYEBALLS))   # backed up / restored


def restore(drop=False):
    count = 0
    for name in CHANGED:
        backup = bpy.data.meshes.get(name + SUFFIX)
        if backup is None:
            continue
        obj = bpy.data.objects[name]
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


def back_up():
    for name in CHANGED:
        if bpy.data.meshes.get(name + SUFFIX) is None:
            backup = bpy.data.objects[name].data.copy()
            backup.name = name + SUFFIX
            backup.use_fake_user = True


def bump(loc, b):
    """Smooth bump (cos^2 of the normalised elliptic distance) round (|x|, y[, z]) = b['centre'] in the head frame;
    optional fade-in away from the midline (x_fade = [from, to] in |x|, mm) so the profile stays."""
    cx, cy = b['centre'][:2]
    d2 = ((np.abs(loc[:, 0]) - cx) / b['rx']) ** 2 + ((loc[:, 1] - cy) / b['ry']) ** 2
    if len(b['centre']) > 2:
        d2 += ((loc[:, 2] - b['centre'][2]) / b['rz']) ** 2
    d = np.sqrt(d2)
    w = np.where(d < 1, np.cos(np.clip(d, 0, 1) * np.pi / 2) ** 2, 0.0)
    if b.get('front_only', True):
        w *= np.clip((loc[:, 2] - 40) / 20, 0, 1)      # never the back of the head
    if 'x_out' in b:
        a, c = b['x_out']
        t = np.clip((c - np.abs(loc[:, 0])) / (c - a), 0, 1)
        w *= t * t * (3 - 2 * t)
    if 'y_band' in b:
        a, c, f = b['y_band']
        t = np.clip(np.minimum(loc[:, 1] - (a - f), (c + f) - loc[:, 1]) / f, 0, 1)
        w *= t * t * (3 - 2 * t)
    if 'ridge_sigma' in b:
        w *= 1 - np.exp(-(np.abs(loc[:, 0]) / b['ridge_sigma']) ** 2)
    if 'facing' in b:
        # only the parts that face the front: the move rounds the cheek without pushing the outline out
        a, c = b['facing']
        t = np.clip((NORMALS[:, 2] - a) / (c - a), 0, 1)
        w *= t * t * (3 - 2 * t)
    if 'lateral' in b:
        a, c = b['lateral']
        t = np.clip((np.abs(NORMALS[:, 0]) - a) / (c - a), 0, 1)
        w *= t * t * (3 - 2 * t)
    if 'x_fade' in b:
        a, c = b['x_fade']
        t = np.clip((np.abs(loc[:, 0]) - a) / (c - a), 0, 1)
        w *= t * t * (3 - 2 * t)
    return w


def ridge(loc, xq, y, band=1.0):
    """Front-most z (mm) of the face at |x| = xq for each height y (front half only)."""
    sel = (np.abs(np.abs(loc[:, 0]) - xq) < band) & (loc[:, 2] > 40)
    ys, zs = loc[sel, 1], loc[sel, 2]
    grid = np.arange(-120, 40.5, 0.5)
    zmax = np.full(len(grid), np.nan)
    for i, g in enumerate(grid):
        m = np.abs(ys - g) < 0.75
        if m.any():
            zmax[i] = zs[m].max()
    ok = ~np.isnan(zmax)
    zmax = np.interp(grid, grid[ok], zmax[ok])
    zmax = np.convolve(np.pad(zmax, 4, mode='edge'), np.ones(9) / 9, mode='valid')
    return np.interp(y, grid, zmax)


def fade(v, a, b, f):
    """1 inside [a, b], smooth 0 beyond f mm outside."""
    t = np.clip(np.minimum(v - (a - f), (b + f) - v) / f, 0, 1)
    return t * t * (3 - 2 * t)


def arc_offsets(loc, st):
    """Needed forward (+) or backward (-) move (mm, head z) so a section follows a smooth arc between two kept
    anchors.  kind arc_h: horizontal sections, anchors at |x| = xa and xb (per height), z_t = za - (za-zb) t^p.
    kind arc_v: vertical sections (per |x|), anchors at heights ya (top) and yb (bottom)."""
    ax = np.abs(loc[:, 0])
    off = np.zeros(len(loc))
    if st['kind'] == 'arc_h':
        y0, y1 = st['y']
        rows = (loc[:, 1] > y0 - st['fade']) & (loc[:, 1] < y1 + st['fade']) & (loc[:, 2] > 40)
        xa = np.interp(loc[:, 1], *np.array(st['xa']).T) if isinstance(st['xa'], list) else np.full(len(loc), st['xa'])
        xb = st['xb']
        for xv in np.unique(np.round(xa[rows] * 2) / 2):
            m = rows & (np.abs(xa - xv) < 0.26)
            za = ridge(loc, xv, loc[m, 1])
            zb = ridge(loc, xb, loc[m, 1])
            t = np.clip((ax[m] - xv) / (xb - xv), 0, 1)
            if st.get('profile') == 'gauss':
                sg = st['sigma']
                g = (np.exp(-(t / sg) ** 2) - np.exp(-(1 / sg) ** 2)) / (1 - np.exp(-(1 / sg) ** 2))
                zt = zb + (za - zb) * g
            else:
                zt = za - (za - zb) * t ** st['p']
            o = zt - loc[m, 2]
            o *= (ax[m] > xv) * fade(ax[m], xv, xb - st['fade'], st['fade'])
            o *= fade(loc[m, 1], y0, y1, st['fade'])
            off[m] = o
    else:
        x0, x1 = st['x']
        cols = (ax > x0 - st['fade']) & (ax < x1 + st['fade']) & (loc[:, 2] > 40)
        ya, yb = st['ya'], st['yb']
        for xv in np.arange(x0 - st['fade'], x1 + st['fade'] + 0.01, 0.5):
            m = cols & (np.abs(ax - xv) < 0.25)
            if not m.any():
                continue
            za = ridge_v(loc, xv, ya)
            zb = ridge_v(loc, xv, yb)
            if za is None or zb is None:
                continue
            t = np.clip((loc[m, 1] - yb) / (ya - yb), 0, 1)
            zt = zb - (zb - za) * t ** st['p']
            o = (zt - loc[m, 2]) * ((loc[m, 1] > yb) & (loc[m, 1] < ya + st['fade']))
            o *= fade(ax[m], x0, x1, st['fade']) * fade(loc[m, 1], yb, ya, st['fade'])
            off[m] = o
    off *= st.get('scale', 1.0)
    return np.maximum(off, 0) if st['mm_sign'] > 0 else np.minimum(off, 0)


def ceiling_offsets(loc, st):
    """Upward move (mm, head y) that lifts the underside of the jaw behind the chin to a straight line in the
    side view.  st['line'] = [[z0, y0], [z1, y1]]: the line starts at the chin's lowest point (z0, y0) and rises
    toward the neck through (z1, y1).  Every vertex under the line goes up to it (soft over st['soft'] mm, so no
    crease where the lifted part meets the jaw); nothing moves in front of z0 (fade over st['z_fade'] mm)."""
    (z0, y0), (z1, y1) = st['line']
    yc = y0 + (y1 - y0) * (z0 - loc[:, 2]) / (z0 - z1)
    d = yc - loc[:, 1]
    s = st['soft']
    off = np.where(d > s, d, np.where(d > -s, (d + s) ** 2 / (4 * s), 0.0))
    t = np.clip((z0 - loc[:, 2]) / st['z_fade'], 0, 1)
    off *= t * t * (3 - 2 * t)
    zb0, zb1 = st['z_back']
    t = np.clip((loc[:, 2] - zb0) / (zb1 - zb0), 0, 1)
    return off * t * t * (3 - 2 * t) * (loc[:, 1] < y0 + 25)


def ridge_v(loc, xq, yq):
    for r in (1.0, 2.0, 3.0):
        sel = (np.abs(np.abs(loc[:, 0]) - xq) < 1.0) & (np.abs(loc[:, 1] - yq) < r) & (loc[:, 2] > 40)
        if sel.any():
            return loc[sel, 2].max()
    return None


def clamp_to_silhouette(world, loc, off, margin_px):
    """Scale the forward moves so no vertex crosses the current 3/4 silhouette (q34R for +x, q34L for -x): the
    reference 3/4 contours were fitted and must stay.  Each vertex keeps the largest tested fraction that stays
    inside the silhouette row it lands on."""
    fwd = M.to_world(np.array([[0, 0, 1.0]]))[0] - M.to_world(np.zeros((1, 3)))[0]
    fwd /= np.linalg.norm(fwd)
    scale = np.ones(len(off))
    for view, side in (('q34R', 1), ('q34L', -1)):
        u, v = er.camera_pixels(view, world)
        ok = loc[:, 2] > 30
        rows = np.round(v).astype(int)
        sil = {r: (u[ok & (rows == r)].max() if side > 0 else u[ok & (rows == r)].min()) for r in np.unique(rows[ok])}
        idx = np.nonzero((np.sign(loc[:, 0]) == side) & (off > 0))[0]
        best = np.zeros(len(idx))
        for f in (0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0):
            p2 = world[idx] + fwd[None] * (off[idx] * f / 1000)[:, None]
            u2, v2 = er.camera_pixels(view, p2)
            lim = np.array([sil.get(int(round(vv)), np.inf if side > 0 else -np.inf) for vv in v2])
            good = (u2 <= lim - margin_px) if side > 0 else (u2 >= lim + margin_px)
            best = np.where(good, f, best)
        scale[idx] = best
    # the face must stay symmetric: each vertex keeps the smaller factor of itself and its mirror partner
    from mathutils.kdtree import KDTree
    kd = KDTree(len(loc))
    for i, q in enumerate(loc):
        kd.insert(Vector(q), i)
    kd.balance()
    j = np.array([kd.find(Vector((-q[0], q[1], q[2])))[1] for q in loc])
    scale = np.minimum(scale, scale[j])
    print('FACE_VOLUME q34 clamp: mean kept', round(float(scale[off > 0].mean()), 2))
    return off * scale


def smooth_weights(obj, w, repeat, factor=0.5):
    """Blender's own vertex-group smoothing (Weight > Smooth) on a temporary group: no creases where a move
    starts or where the 3/4 clamp cut it."""
    if repeat <= 0:
        return w
    vg = obj.vertex_groups.new(name='INKWAVE_vol_w')
    for val in np.unique(np.round(w[w > 0], 4)):
        vg.add([int(i) for i in np.nonzero(np.abs(np.round(w, 4) - val) < 1e-9)[0]], float(val), 'REPLACE')
    obj.vertex_groups.active_index = vg.index

    def run():
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        bpy.ops.object.vertex_group_smooth(group_select_mode='ACTIVE', factor=factor, repeat=repeat, expand=0.0)
        bpy.ops.object.mode_set(mode='OBJECT')
    er.with_object(obj, run)
    out = np.zeros(len(w))
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == vg.index:
                out[v.index] = g.weight
    obj.vertex_groups.remove(obj.vertex_groups['INKWAVE_vol_w'])
    return out


def warp(face, w, vec_mm, loc):
    """Blender's Warp modifier with no falloff: every vertex moves by weight x vec (head frame, mm; x mirrored)."""
    origin = M.to_world(np.zeros((1, 3)))[0]
    for side in (-1, 1):
        ws = w * (np.where(loc[:, 0] >= 0, 1, -1) == side)
        if not ws.any():
            continue
        v = np.array(vec_mm, float) / 1000
        v[0] *= side
        step = M.to_world(v[None])[0] - origin
        a = bpy.data.objects.new('INKWAVE_vol_from', None)
        b = bpy.data.objects.new('INKWAVE_vol_to', None)
        for e in (a, b):
            bpy.context.scene.collection.objects.link(e)
        b.location = Vector(step)
        bpy.context.view_layer.update()
        er.apply_weighted_modifier(face, ws, 'WARP', object_from=a, object_to=b, falloff_type='NONE',
                                   use_volume_preserve=False)
        for e in (a, b):
            bpy.data.objects.remove(e)


def move_eyes(face, loc, d_eye, st):
    """Set the eyes deeper: the eyeballs (sclera caps and irises) move by vec_mm as one piece (Warp, weight 1), and
    the face moves with them by a weight that is 1 on the skin touching the eyeballs (eye distance < eye_mm[0])
    and falls smoothly to 0 at eye_mm[1], so the lids stay on the eyeballs and the slope from the eye to the
    cheek, brow and nose stays smooth.  x_in = [from, to] (|x|, mm) keeps the nose bridge where it is."""
    a, b = st['eye_mm']
    t = np.clip((b - d_eye) / (b - a), 0, 1)
    w = t * t * (3 - 2 * t)
    if 'x_in' in st:
        c0, c1 = st['x_in']
        t = np.clip((np.abs(loc[:, 0]) - c0) / (c1 - c0), 0, 1)
        w *= t * t * (3 - 2 * t)
    if st.get('weight_smooth', 0):
        near = w >= 0.999
        w = np.clip(smooth_weights(face, w, st['weight_smooth']), 0, 1)
        w[near] = 1.0                       # the lid margins stay on the eyeballs
    before = er.world(face)
    warp(face, w, st['vec_mm'], loc)
    for name in EYEBALLS:
        obj = bpy.data.objects[name]
        warp(obj, np.ones(len(obj.data.vertices)), st['vec_mm'], M.to_local(er.world(obj)) * 1000)
    sm = st.get('smooth')
    if sm:
        # the socket wall gets steeper where the move fades out: Blender's Smooth over a ring round the eye
        # (0 on the lid margin that rests on the eyeball, full from ring[1] to ring[2] mm, 0 beyond ring[3])
        d = eye_distance(er.world(face))
        r0, r1, r2, r3 = sm['ring']
        t0 = np.clip((d - r0) / (r1 - r0), 0, 1)
        t1 = np.clip((r3 - d) / (r3 - r2), 0, 1)
        ws = t0 * t0 * (3 - 2 * t0) * t1 * t1 * (3 - 2 * t1)
        if 'x_in' in st:
            c0, c1 = st['x_in']
            t = np.clip((np.abs(loc[:, 0]) - c0) / (c1 - c0), 0, 1)
            ws *= t * t * (3 - 2 * t)
        ws *= np.clip((loc[:, 2] - 40) / 20, 0, 1)
        er.apply_weighted_modifier(face, ws, 'SMOOTH', factor=sm['factor'], iterations=sm['iters'])
    move = np.linalg.norm(er.world(face) - before, axis=1) * 1000
    print('FACE_VOLUME', st['name'], 'face vertices', int((w > 0.001).sum()), 'max move mm', round(float(move.max()), 2))


def eye_distance(world):
    eye = BVHTree.FromPolygons(
        [Vector(v) for v in np.vstack([er.world(bpy.data.objects[n]) for n in EYEBALLS])],
        [[i + off for i in poly.vertices] for n, off in zip(EYEBALLS, np.cumsum([0] + [
            len(bpy.data.objects[n].data.vertices) for n in EYEBALLS])[:-1]) for poly in bpy.data.objects[n].data.polygons])
    return np.array([eye.find_nearest(Vector(q))[3] for q in world]) * 1000


def protection(loc, world, p):
    """0 near the eyeballs and on the lips, 1 elsewhere (smooth)."""
    d = eye_distance(world)
    e0, e1 = p['eye_keep_mm']
    keep = np.clip((d - e0) / (e1 - e0), 0, 1)
    lip = p['lips']
    dl = np.hypot(loc[:, 0] / lip['rx'], (loc[:, 1] - lip['cy']) / lip['ry'])
    t = np.clip((dl - 1) / lip['fade'], 0, 1)
    return keep, t * t * (3 - 2 * t)


def seam_pairs(face):
    """HEAD_face is two halves that meet at the midline without being joined: each midline vertex is
    duplicated.  Returns the index pairs (found once, on the untouched mesh)."""
    from mathutils.kdtree import KDTree
    me = face.data
    kd = KDTree(len(me.vertices))
    for v in me.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    pairs = set()
    for v in me.vertices:
        group = sorted(j for _, j, _ in kd.find_range(v.co, 1e-7))
        if len(group) == 2:
            pairs.add(tuple(group))
    return np.array(sorted(pairs), int).reshape(-1, 2)


def join_seam(face, pairs):
    """Every step moves the two halves on their own (Smooth pulls each open edge inward): put each midline
    pair back on its common mean, so no crack opens."""
    me = face.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    gap = np.linalg.norm(co[pairs[:, 0]] - co[pairs[:, 1]], axis=1).max() * 1000 if len(pairs) else 0.0
    m = 0.5 * (co[pairs[:, 0]] + co[pairs[:, 1]])
    co[pairs[:, 0]] = m
    co[pairs[:, 1]] = m
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    return gap


def seam_normals(face, pairs):
    """Each half shades with its own normal along the joint once the midline is no longer flat: the custom
    normals of both corners of each pair are set to their average; all other corners keep theirs."""
    me = face.data
    vn = np.array([v.normal[:] for v in me.vertices])
    avg = {}
    for i, j in pairs:
        n = vn[i] + vn[j]
        n /= np.linalg.norm(n)
        avg[i] = avg[j] = n
    loops = np.array([l.vector[:] for l in me.corner_normals])
    for li, l in enumerate(me.loops):
        if l.vertex_index in avg:
            loops[li] = avg[l.vertex_index]
    me.normals_split_custom_set([tuple(n) for n in loops])
    print('FACE_VOLUME seam normals averaged on', len(avg), 'vertices')


def delta_smooth_bind(face):
    """Blender's Corrective Smooth, bound to the face as it is before the edits: at the end it smooths only
    the edit (the difference to this rest shape), so the added volume has no lumps or facets, while the
    face's own detail stays."""
    mod = face.modifiers.new('INKWAVE_volume_delta_smooth', 'CORRECTIVE_SMOOTH')
    mod.rest_source = 'BIND'
    mod.smooth_type = 'LENGTH_WEIGHTED'
    er.with_object(face, lambda: bpy.ops.object.correctivesmooth_bind(modifier=mod.name))
    return mod


def delta_smooth_apply(face, mod, weights, cfg):
    vg = face.vertex_groups.new(name='INKWAVE_volume_delta')
    for val in np.unique(np.round(weights[weights > 0], 3)):
        vg.add([int(i) for i in np.nonzero(np.abs(np.round(weights, 3) - val) < 1e-9)[0]], float(val), 'REPLACE')
    mod.vertex_group = vg.name
    mod.factor = cfg['factor']
    mod.iterations = cfg['iters']
    mod.use_only_smooth = False
    mod.use_pin_boundary = True     # eye openings and the open midline stay
    before = er.world(face)
    er.apply_modifier(face, mod)
    face.vertex_groups.remove(face.vertex_groups['INKWAVE_volume_delta'])
    print('FACE_VOLUME delta smooth max move mm', round(float(np.linalg.norm(er.world(face) - before, axis=1).max() * 1000), 2))


def tuck_clear_edges(face, names, cfg):
    """The blush layers (HEAD_skin / HEAD_skin_04, 0.3 mm over the face) are folded like crumpled paper along
    their top edge under the lower eyelids (from the source model): those faces point into the head and render
    as dark flakes.  The blush there is clear (alpha < 0.05), so it adds no colour.  The folded faces and a few
    rings round them, where the blush is clear, go just under the skin (hidden); a ring more goes onto the
    skin; everything else stays 0.3 mm over the face, so the blush colour does not change.  Blender's
    Shrinkwrap on those vertices only."""
    import bmesh
    tree = BVHTree.FromPolygons([Vector(v) for v in er.world(face)], [list(p.vertices) for p in face.data.polygons])
    for name in names:
        obj = bpy.data.objects[name]
        me = obj.data
        img = [n.image for n in me.materials[0].node_tree.nodes if getattr(n, 'image', None)][0]
        w, h = img.size
        px = np.array(img.pixels[:]).reshape(h, w, 4)
        uvl = me.uv_layers.active.data
        amax = np.zeros(len(me.vertices))
        for p in me.polygons:
            for li, vi in zip(p.loop_indices, p.vertices):
                u, v = uvl[li].uv
                amax[vi] = max(amax[vi], px[int(np.clip(v, 0, 1) * (h - 1)), int(np.clip(u, 0, 1) * (w - 1)), 3])
        W = er.world(obj)
        mw = obj.matrix_world.to_3x3()
        folded = set()
        for p in me.polygons:
            hh = tree.find_nearest(Vector(W[list(p.vertices)].mean(0)))
            if np.dot(np.array(mw @ p.normal), np.array(hh[1])) < 0:
                folded.update(p.vertices)
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        ring = {i: 0 for i in folded}
        front = set(folded)
        for r in range(1, cfg['rings'] + 1):
            nxt = {e.other_vert(bm.verts[i]).index for i in front for e in bm.verts[i].link_edges} - set(ring)
            for i in nxt:
                ring[i] = r
            front = nxt
        bm.free()
        clear = amax < cfg['alpha']
        # the clear inner edge (toward the nose): its step shows as a line down the side of the nose
        L = M.to_local(W) * 1000
        for i in np.nonzero(clear & (np.abs(L[:, 0]) < cfg.get('inner_x_mm', 0)))[0]:
            ring.setdefault(int(i), 0)
        # target height over the skin: hidden where clear and folded / inner, 0.3 mm where the blush has colour;
        # everything between is relaxed over the mesh (no steps, no slivers poking out)
        target = np.full(len(me.vertices), np.nan)
        hidden = [i for i, r in ring.items() if r <= cfg['rings'] and clear[i]]
        target[hidden] = cfg['under_mm']
        target[amax >= cfg['colour_alpha']] = cfg['over_mm']
        free = np.isnan(target)
        off = np.where(free, cfg['over_mm'], target)
        nb = [[] for _ in range(len(me.vertices))]
        for e in me.edges:
            a, b = e.vertices
            nb[a].append(b)
            nb[b].append(a)
        idx = np.nonzero(free)[0]
        for _ in range(cfg['relax']):
            off[idx] = [np.mean(off[nb[i]]) if nb[i] else off[i] for i in idx]
        steps = np.round(off / cfg['step_mm']) * cfg['step_mm']
        moved = 0
        for val in np.unique(steps):
            if val >= cfg['over_mm'] - 1e-6:
                continue
            wt = (np.abs(steps - val) < 1e-6).astype(float)
            er.apply_weighted_modifier(obj, wt, 'SHRINKWRAP', target=face, wrap_method='NEAREST_SURFACEPOINT',
                                       wrap_mode='ON_SURFACE', offset=val / 1000)
            moved += int(wt.sum())
        under, onto = np.array(hidden), np.nonzero(steps < cfg['over_mm'] - 1e-6)[0]
        if cfg.get('fade_mm'):
            # where the layer dips under the skin its crossing zigzags with the mesh, and the little blush colour
            # still there draws a jagged line: the layer's colour fades out before it reaches the skin
            a, b = cfg['fade_mm']
            t = np.clip((off - a) / (b - a), 0, 1)
            attr = me.color_attributes.get(BLUSH_FADE) or me.color_attributes.new(BLUSH_FADE, 'FLOAT_COLOR', 'POINT')
            f = t * t * (3 - 2 * t)
            attr.data.foreach_set('color', np.repeat(f, 4).astype(np.float32))
            me.update()
        print('FACE_VOLUME tuck', name, 'folded', len(folded), 'hidden', len(under), 'blend ring', len(onto))
    if cfg.get('fade_mm'):
        blush_fade_node(bpy.data.objects[names[0]].data.materials[0])


BLUSH_FADE = 'INKWAVE_blush_fade'


def sheet_view(view):
    """Reference sheet crop of one fitted camera (camera pixels, rows top -> bottom, sRGB 0..1)."""
    img = bpy.data.images.load(str(SHEET), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    x0, y0, x1, y1 = VIEW_BOXES[view]
    return px.reshape(h, w, 4)[::-1, :, :3][y0:y1, x0:x1].astype(np.float64)


VIEW_BOXES = {'front': (60, 230, 430, 520), 'q34L': (470, 230, 840, 520), 'sideL': (880, 230, 1250, 520),
              'q34R': (1370, 230, 1740, 520), 'sideR': (1790, 230, 2160, 520)}


def redness_map(rgb, sigma):
    """CIELAB a* (redness) of an sRGB image minus the median a* of its skin, blurred; NaN off the skin."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    X = c @ np.array([0.4124, 0.2126, 0.0193]) / 0.9505
    Y = c @ np.array([0.3576, 0.7152, 0.1192])
    f = lambda t: np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    a = 500 * (f(X) - f(Y))
    hsv_max, hsv_min = rgb.max(-1), rgb.min(-1)
    sat = (hsv_max - hsv_min) / np.maximum(hsv_max, 1e-6)
    hue_ok = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 1] >= rgb[..., 2] - 0.02)     # orange-red skin hues only
    skin = hue_ok & (sat > 0.25) & (hsv_max > 0.3)
    base = np.median(a[skin])
    w = _blur(skin.astype(float), sigma)
    out = _blur(np.where(skin, a - base, 0.0), sigma) / np.maximum(w, 1e-6)
    return np.where(w > 0.5, out, np.nan)


def paint_blush(face, names, cfg):
    """Blush from the reference: every blush-layer vertex is seen by the fitted cameras; the reference's redness
    there (a* over the skin's median, the view that faces the vertex most) sets the blush opacity:
    alpha = gain x (redness - floor).  The layer keeps its colour image; its per-vertex factor (the same
    attribute that fades the layer edge) becomes alpha / image alpha, so the blush ends up where and as strong
    as the reference shows it."""
    maps = {v: redness_map(sheet_view(v), cfg['sigma_px']) for v in cfg['views']}
    for name in names:
        obj = bpy.data.objects[name]
        me = obj.data
        W = er.world(obj)
        nw = np.array([obj.matrix_world.to_3x3() @ v.normal for v in me.vertices])
        acc, wsum, best = np.zeros(len(W)), np.zeros(len(W)), np.full(len(W), -np.inf)
        for view, red in maps.items():
            cam = np.array(bpy.data.objects['FACE_FIT_CAM_' + view].matrix_world.translation)
            to_cam = cam[None] - W
            to_cam /= np.linalg.norm(to_cam, axis=1, keepdims=True)
            facing = np.clip((nw * to_cam).sum(1), 0, 1)
            u, v = er.camera_pixels(view, W)
            iu, iv = np.clip(u.astype(int), 0, red.shape[1] - 1), np.clip(v.astype(int), 0, red.shape[0] - 1)
            val = red[iv, iu]
            wt = np.where(np.isnan(val) | (facing < cfg['min_facing']), 0.0, facing ** 4)
            acc += wt * np.nan_to_num(val)
            wsum += wt
            best = np.where(wt > 0, np.maximum(best, np.nan_to_num(val)), best)
        e = np.where(wsum > 0, acc / np.maximum(wsum, 1e-9), 0.0)
        if cfg.get('combine') == 'max':
            # the blush the reference shows in any view that sees the skin squarely (the painted sheet is not
            # perfectly consistent between views; the union gives the wide soft blush of the front view)
            e = np.where(np.isfinite(best), best, 0.0)
        target = np.clip(cfg['gain'] * (e - cfg['floor']), 0, cfg['max'])
        nb = [[] for _ in me.vertices]
        for ed in me.edges:
            i, j = ed.vertices
            nb[i].append(j)
            nb[j].append(i)
        for _ in range(cfg.get('relax', 6)):
            target = np.array([0.5 * target[i] + 0.5 * np.mean(target[nb[i]]) if nb[i] else target[i] for i in range(len(target))])
        img = [n.image for n in me.materials[0].node_tree.nodes if getattr(n, 'image', None)][0]
        w, h = img.size
        px = np.array(img.pixels[:]).reshape(h, w, 4)
        uvl = me.uv_layers.active.data
        amax = np.zeros(len(me.vertices))
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uu, vv = uvl[li].uv
                amax[vi] = max(amax[vi], px[int(np.clip(vv, 0, 1) * (h - 1)), int(np.clip(uu, 0, 1) * (w - 1)), 3])
        attr = me.color_attributes.get(BLUSH_FADE)
        fade = np.ones(len(W))
        if attr is not None:
            col = np.empty(len(W) * 4, np.float32)
            attr.data.foreach_get('color', col)
            fade = col[0::4].astype(np.float64)
        else:
            attr = me.color_attributes.new(BLUSH_FADE, 'FLOAT_COLOR', 'POINT')
        factor = fade * np.clip(target / np.maximum(amax, 1e-3), 0, cfg['max_factor'])
        attr.data.foreach_set('color', np.repeat(factor, 4).astype(np.float32))
        me.update()
        if cfg.get('lift_alpha'):
            lift_coloured(obj, face, amax * factor, cfg)
        print('FACE_VOLUME blush from the reference', name, 'alpha max %.2f mean on layer %.3f' % (target.max(), target.mean()))
    blush_fade_node(bpy.data.objects[names[0]].data.materials[0])
    if cfg.get('colour'):
        # the reference blush is lighter and pinker than the old colour (CIELAB measured over the skin):
        # the blush image keeps its alpha, its colour becomes cfg['colour'] (sRGB); kept for --restore
        img = bpy.data.images[BLUSH_IMAGE]
        if bpy.data.images.get(BLUSH_IMAGE + SUFFIX) is None:
            bak = img.copy()
            bak.name = BLUSH_IMAGE + SUFFIX
            bak.use_fake_user = True
            bak.pack()
        px = np.empty(len(img.pixels), np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        px[:, :3] = np.array(cfg['colour'], np.float32)
        img.pixels.foreach_set(px.ravel())
        img.pack()


BLUSH_IMAGE = 'INKWAVE_BLUSH_ALPHA'


def lift_coloured(obj, face, alpha, cfg):
    """Where a blush face with colour (alpha over lift_alpha at a corner) dips under the skin, the skin cuts the
    blush along a ragged line (a pale patch under the eye in the 3/4 views).  Its corners under the skin go to
    the layer height over the skin (Blender's Shrinkwrap), so the blush fades out over the skin instead."""
    me = obj.data
    tree = BVHTree.FromPolygons([Vector(v) for v in er.world(face)], [list(p.vertices) for p in face.data.polygons])
    meas = np.zeros(len(me.vertices))
    for i, q in enumerate(er.world(obj)):
        hh = tree.find_nearest(Vector(q))
        meas[i] = np.sign(np.dot(np.array(q) - np.array(hh[0]), np.array(hh[1]))) * hh[3] * 1000
    over = cfg.get('lift_mm', 0.3)
    low = np.zeros(len(me.vertices), bool)
    for poly in me.polygons:
        vs = list(poly.vertices)
        if alpha[vs].max() > cfg['lift_alpha']:
            low[vs] = True
    low &= meas < over - 0.05
    if low.any():
        # Above Surface: the offset goes along the skin normal (On Surface keeps the side the vertex is on)
        er.apply_weighted_modifier(obj, low.astype(float), 'SHRINKWRAP', target=face, wrap_method='NEAREST_SURFACEPOINT',
                                   wrap_mode='ABOVE_SURFACE', offset=over / 1000)
    print('FACE_VOLUME blush lift', obj.name, int(low.sum()), 'vertices')


def restore_blush_image():
    img, bak = bpy.data.images.get(BLUSH_IMAGE), bpy.data.images.get(BLUSH_IMAGE + SUFFIX)
    if img is None or bak is None:
        return
    px = np.empty(len(bak.pixels), np.float32)
    bak.pixels.foreach_get(px)
    img.pixels.foreach_set(px)
    img.pack()
    bpy.data.images.remove(bak)


def blush_fade_node(mat):
    """Alpha of the blush = image alpha x the per-vertex fade (Attribute node x Math multiply)."""
    t = mat.node_tree
    if t.nodes.get(BLUSH_FADE) is not None:
        return
    bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
    link = bsdf.inputs['Alpha'].links[0]
    src = link.from_socket
    attr = t.nodes.new('ShaderNodeAttribute')
    attr.name = attr.label = BLUSH_FADE
    attr.attribute_name = BLUSH_FADE
    mul = t.nodes.new('ShaderNodeMath')
    mul.name = mul.label = BLUSH_FADE + '_mul'
    mul.operation = 'MULTIPLY'
    t.links.new(src, mul.inputs[0])
    t.links.new(attr.outputs['Fac'], mul.inputs[1])
    t.links.new(mul.outputs['Value'], bsdf.inputs['Alpha'])


def remove_blush_fade_node():
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree.nodes.get(BLUSH_FADE) is None:
            continue
        t = mat.node_tree
        mul = t.nodes[BLUSH_FADE + '_mul']
        src = mul.inputs[0].links[0].from_socket
        bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
        t.nodes.remove(mul)
        t.nodes.remove(t.nodes[BLUSH_FADE])
        t.links.new(src, bsdf.inputs['Alpha'])


def thin_ribbon(name, cfg, face=None):
    """The mouth line (HEAD_skin_09) is a flat band on the skin: about 1.2 mm wide and flaring into 4.6 mm
    triangle hooks at both corners, where the reference has a thin soft line that fades out at the corners.
    The band's middle path (height over |x| in the head frame, from the middle of its upper and lower edge) is
    kept; every vertex moves toward (or away from) that path so the band is cfg['width_mm'] wide in the middle,
    cfg['mid_width_mm'] at cfg['mid_at'] of each half, and narrows to cfg['end_width_mm'] over the outer
    cfg['taper'] part (the hooks fold into the line).
    cfg['widen'] stretches the line sideways along its own (extended) path; then Blender's Shrinkwrap lays it
    back on the skin at its old height."""
    obj = bpy.data.objects[name]
    W = er.world(obj)
    L = M.to_local(W) * 1000
    height = None
    if face is not None:
        tree = BVHTree.FromPolygons([Vector(v) for v in er.world(face)], [list(p.vertices) for p in face.data.polygons])
        height = float(np.median([tree.find_nearest(Vector(q))[3] for q in W]))
    xmax = float(np.abs(L[:, 0]).max())
    edges = np.linspace(-xmax, xmax, 61)
    mid = 0.5 * (edges[:-1] + edges[1:])
    lo = np.array([L[(L[:, 0] >= a) & (L[:, 0] <= b), 1].min() for a, b in zip(edges[:-1], edges[1:])])
    hi = np.array([L[(L[:, 0] >= a) & (L[:, 0] <= b), 1].max() for a, b in zip(edges[:-1], edges[1:])])
    inner = np.abs(mid) < 0.85 * xmax                     # the hooks do not steer the path
    path = np.polyfit(mid[inner], 0.5 * (lo + hi)[inner], 4)
    width = np.interp(L[:, 0], mid, np.maximum(hi - lo, 1e-3))
    def ss(t):
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)
    t = np.abs(L[:, 0]) / xmax
    mid_w, mid_at = cfg.get('mid_width_mm', cfg['width_mm']), cfg.get('mid_at', 0.4)
    start = 1 - cfg['taper']
    want = cfg['width_mm'] + (mid_w - cfg['width_mm']) * ss(t / mid_at)
    want = want + (cfg['end_width_mm'] - want) * ss((t - start) / cfg['taper'])
    keep = np.minimum(cfg.get('max_scale', 1.0), want / width)
    new = L.copy()
    k = cfg.get('widen', 1.0)
    new[:, 0] = L[:, 0] * k
    new[:, 1] = np.polyval(path, new[:, 0]) + (L[:, 1] - np.polyval(path, L[:, 0])) * keep
    world = M.to_world(new / 1000)
    mw_inv = np.array(obj.matrix_world.inverted())
    co = (np.c_[world, np.ones(len(world))] @ mw_inv.T)[:, :3]
    obj.data.vertices.foreach_set('co', co.ravel())
    obj.data.update()
    if cfg.get('ref_path') and face is not None:
        follow_reference_line(obj, cfg['ref_path'])
        obj.visible_shadow = False      # a thin soft line: its own shadow on the skin made it twice as dark
    if face is not None:
        mod = obj.modifiers.new('INKWAVE_line_seat', 'SHRINKWRAP')
        mod.target = face
        mod.wrap_method = 'NEAREST_SURFACEPOINT'
        mod.wrap_mode = 'ABOVE_SURFACE'
        mod.offset = height
        er.apply_modifier(obj, mod)
    print('FACE_VOLUME thin', name, 'max move mm', round(float(np.linalg.norm(er.world(obj) - W, axis=1).max() * 1000), 2),
          'half width mm', round(xmax * k, 1))


def follow_reference_line(obj, rp):
    """Put the mouth-line band on the mouth line of the front reference: per image column the darkest row of
    the reference inside rp['rows'] is the line; the band's own middle path (front camera pixels) is moved onto
    it, and its ends onto the reference's mouth corners rp['corners'].  The moves are made in the head frame
    (pixels -> mm measured with the camera); Shrinkwrap lays the band back on the skin afterwards."""
    L = _blur(lum(front_reference()), 0.8)
    (xa, xb), (ra, rb) = rp['corners'], rp['rows']
    cols = np.arange(int(np.ceil(xa)), int(np.floor(xb)) + 1)
    rows = []
    for c in cols:
        seg = L[ra:rb + 1, c]
        i = int(np.clip(np.argmin(seg), 1, len(seg) - 2))
        d = seg[i - 1] - 2 * seg[i] + seg[i + 1]
        rows.append(ra + i + 0.5 + (0.5 * (seg[i - 1] - seg[i + 1]) / d if abs(d) > 1e-9 else 0.0))
    ref_path = np.polyfit(cols + 0.5, rows, rp.get('degree', 6))
    mw_inv = np.array(obj.matrix_world.inverted())
    for _ in range(3):
        W = er.world(obj)
        Lh = M.to_local(W)
        u, v = er.camera_pixels('front', W)
        mid = np.abs(Lh[:, 0]) < 0.0015
        shift = rp['centre'] - float(np.median(u[mid]))
        # pixels per mm at the mouth (head x -> u, head y -> v)
        probe = M.to_world(Lh[mid][:1] + np.array([[0.001, 0.0, 0.0], [0.0, 0.001, 0.0]]))
        pu, pv = er.camera_pixels('front', np.vstack([M.to_world(Lh[mid][:1]), probe]))
        du_dx, dv_dy = pu[1] - pu[0], pv[2] - pv[0]
        own = np.polyfit(u, v, 4)
        ua, ub = u.min(), u.max()
        target_u = (xa - shift) + (u - ua) / (ub - ua) * (xb - xa)
        target_v = np.polyval(ref_path, np.clip(target_u + shift, xa, xb)) - rp.get('shift_y', 0.0) + (v - np.polyval(own, u))
        Lh = Lh + np.c_[(target_u - u) / du_dx, (target_v - v) / dv_dy, np.zeros(len(u))] / 1000
        world = M.to_world(Lh)
        obj.data.vertices.foreach_set('co', ((np.c_[world, np.ones(len(world))] @ mw_inv.T)[:, :3]).ravel())
        obj.data.update()
    print('FACE_VOLUME mouth line on the reference path: last move px', round(float(np.abs(target_v - v).max()), 2),
          'corners px', round(float(ua + shift), 1), round(float(ub + shift), 1))


DECAL_MATERIALS = {'lips': 'skin_b0584a', 'mouth_line': 'skin_5b2922', 'nostrils': 'skin_6a3526'}
LIP_PATCH, MOUTH_LINE = 'HEAD_skin_08', 'HEAD_skin_09'
NOSE_PATCH = 'HEAD_skin_07'
PAINT_IMAGES = ('INKWAVE_NOSE_SHADE', 'INKWAVE_LIP_PAINT')


def keep_material(mat):
    """Remember a decal material's colour, alpha and roughness once (for --restore)."""
    if SUFFIX not in mat:
        n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        mat[SUFFIX] = list(n.inputs['Base Color'].default_value) + [
            n.inputs['Alpha'].default_value, n.inputs['Roughness'].default_value,
            n.inputs['Specular IOR Level'].default_value]


def restore_materials():
    for name in DECAL_MATERIALS.values():
        mat = bpy.data.materials.get(name)
        if mat is None or SUFFIX not in mat:
            continue
        vals = list(mat[SUFFIX])
        n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        for tex in [t for t in mat.node_tree.nodes
                    if t.type == 'TEX_IMAGE' and t.image and t.image.name in PAINT_IMAGES]:
            mat.node_tree.nodes.remove(tex)
        n.inputs['Base Color'].default_value = vals[:4]
        n.inputs['Alpha'].default_value = vals[4]
        n.inputs['Roughness'].default_value = vals[5]
        n.inputs['Specular IOR Level'].default_value = vals[6]
        del mat[SUFFIX]
    mat = bpy.data.materials.get('skin_6a3322')
    if mat is not None:
        if SUFFIX + '_image' in mat:
            tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
            tex.image = bpy.data.images[mat[SUFFIX + '_image']]
            tex.image.use_fake_user = False
            del mat[SUFFIX + '_image']
        if SUFFIX in mat:
            n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            n.inputs['Specular IOR Level'].default_value = list(mat[SUFFIX])[6]
            del mat[SUFFIX]
    for name in (NOSE_PATCH, LIP_PATCH, MOUTH_LINE):
        if bpy.data.objects.get(name) is not None:
            bpy.data.objects[name].visible_shadow = True
    for image in PAINT_IMAGES:
        img = bpy.data.images.get(image)
        if img is not None and img.users == 0:
            bpy.data.images.remove(img)


def alpha_image_material(mat, bsdf, img, roughness):
    """Colour and alpha of a decal from an image (as the blush and the under-nose shadow)."""
    t = mat.node_tree
    tex = next((n for n in t.nodes if n.type == 'TEX_IMAGE'), None) or t.nodes.new('ShaderNodeTexImage')
    tex.image, tex.extension = img, 'CLIP'
    t.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    t.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Alpha'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = roughness
    mat.surface_render_method = 'BLENDED'


def decal_look(key, cfg):
    mat = bpy.data.materials[DECAL_MATERIALS[key]]
    keep_material(mat)
    n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if 'alpha' in cfg:
        n.inputs['Alpha'].default_value = cfg['alpha']
    if 'colour' in cfg:
        n.inputs['Base Color'].default_value = list(cfg['colour']) + [1.0]
    if 'specular' in cfg:
        n.inputs['Specular IOR Level'].default_value = cfg['specular']
    return mat, n


# ------------------------------------------------------------------ reference paint (front view)
# The nose and the mouth of the front reference are painted onto two decals that lie on the skin: what the
# front camera sees there (shading of the nose, lip colour, mouth line) is taken from the reference sheet and
# projected through the fitted front camera (projection painting).  Pure numpy below (Blender has no cv2).
SHEET = er.ROOT / 'docs/face-multiview-fit/refs/sheet_5view.png'
FRONT_BOX = (60, 230, 430, 520)


def _blur(a, sigma):
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = a.astype(np.float64)
    for ax in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[ax] = (r, r)
        p = np.pad(out, pad, mode='edge')
        out = np.apply_along_axis(lambda m: np.convolve(m, k, mode='valid'), ax, p)
    return out


def upsample(a, k):
    """Bilinear upsample by an integer factor (pixel centres)."""
    h, w = a.shape[:2]
    ys = (np.arange(h * k) + 0.5) / k - 0.5
    xs = (np.arange(w * k) + 0.5) / k - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 2); fy = np.clip(ys - y0, 0, 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 2); fx = np.clip(xs - x0, 0, 1)
    a = a.reshape(h, w, -1)
    top = a[y0][:, x0] * (1 - fx)[None, :, None] + a[y0][:, x0 + 1] * fx[None, :, None]
    bot = a[y0 + 1][:, x0] * (1 - fx)[None, :, None] + a[y0 + 1][:, x0 + 1] * fx[None, :, None]
    return (top * (1 - fy)[:, None, None] + bot * fy[:, None, None]).squeeze()


def mirror_mean(a, centre, x0):
    """Mean of a map and its left-right mirror about the camera column `centre` (map column 0 = camera x0 + 0.5)."""
    h, w = a.shape[:2]
    cols = x0 + 0.5 + np.arange(w)
    src = 2 * centre - cols                       # camera x of the mirrored sample
    idx = src - x0 - 0.5
    i0 = np.clip(np.floor(idx).astype(int), 0, w - 2); f = np.clip(idx - i0, 0, 1)
    f = f.reshape((1, w) + (1,) * (a.ndim - 2))
    mir = a[:, i0] * (1 - f) + a[:, i0 + 1] * f
    return 0.5 * (a + mir)


def lum(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def skin_base(img, box, m, mask, sigma):
    """Smooth skin tone under a feature: the image outside the feature's ellipse (mask = centre x, y, rx, ry in camera
    px), blurred across it (normalised convolution)."""
    x0, y0, x1, y1 = box
    yy, xx = np.mgrid[y0 - m:y1 + m, x0 - m:x1 + m] + 0.5
    cx, cy, rx, ry = mask
    keep = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 > 1).astype(np.float64)
    den = np.maximum(_blur(keep, sigma), 1e-6)
    if img.ndim == 3:
        return np.stack([_blur(img[..., c] * keep, sigma) / den for c in range(img.shape[2])], -1)
    return _blur(img * keep, sigma) / den


def rim_fade(shape, rim):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    e = np.clip(np.minimum(np.minimum(xx + 0.5, shape[1] - xx - 0.5), np.minimum(yy + 0.5, shape[0] - yy - 0.5)) / rim, 0, 1)
    return e * e * (3 - 2 * e)


def tint_map(ref, box, centre, cfg, skin_model, bare=None):
    """Colour and alpha of a decal that turns the model's skin into the reference's nose shading / lips / mouth
    line: the ratio of the reference to its own smooth skin tone, applied to the model's skin colour (linear).
    bare: the model's own front render of the same box (+ margin) without the decals; its own shading (ratio
    to its smooth tone) is divided out, so the decal adds only what the shape does not already show."""
    x0, y0, x1, y1 = box
    m = cfg.get('margin', 16)
    big = ref[y0 - m:y1 + m, x0 - m:x1 + m]
    ratio = big / np.maximum(skin_base(big, box, m, cfg['mask'], cfg['base_sigma']), 1e-6)
    if bare is not None:
        # brightness only: the model's render has its own colour cast (sky light), which must not tint the paint
        own = lum(bare)
        own = _blur(own / np.maximum(skin_base(own, box, m, cfg['mask'], cfg['base_sigma']), 1e-6), cfg.get('own_blur', 0.6))
        # only where the shape is already dark: there the paint adds just the rest (never lighter than the
        # reference itself).  Where the shape is brighter than its surroundings (a lit bulge) nothing is taken
        # off: darkening a highlight gives a grey band.
        own = np.clip(own, 0.5, 1.0) ** cfg.get('own', 1.0)
        ratio = np.minimum(ratio / own[..., None], np.maximum(ratio, 1.0))
    if cfg.get('desaturate'):
        # the reference's shading is warmer than its skin; on this skin that reads as a red nose: keep mostly
        # the brightness of the shading
        grey = lum(ratio)[..., None]
        ratio = grey + (ratio - grey) * (1 - cfg['desaturate'])
    if centre is not None:
        ratio = mirror_mean(ratio, centre, x0 - m)
    ratio = np.clip(ratio[m:-m, m:-m], 0.0, cfg.get('max_ratio', 1.1))
    diff = np.abs(ratio - 1).max(-1)
    alpha = np.clip((diff - cfg.get('floor', 0.02)) / cfg['full'], 0, 1) * rim_fade((y1 - y0, x1 - x0), cfg.get('rim', 4.0))
    if cfg.get('below_lip'):
        # nothing under the lower lip: the reference's soft shadow there is the shape's own; painted, it shows
        # as a dark patch beside the chin in the side view
        bl = cfg['below_lip']
        yy, xx = np.mgrid[y0:y1, x0:x1] + 0.5
        limit = bl['y'] - bl['rise'] * np.clip(((xx - bl['centre']) / bl['half_width']) ** 2, 0, 1)
        t = np.clip((yy - limit) / bl['fade'], 0, 1)
        alpha = alpha * (1 - t * t * (3 - 2 * t))
    if cfg.get('spots'):
        # only round these places (camera px: centre x, y, radius x, y; full inside, gone at 1.6 radii): the
        # rest of the reference's shading there is left to the shape and the light
        yy, xx = np.mgrid[y0:y1, x0:x1] + 0.5
        keep = np.zeros(alpha.shape)
        for cx, cy, rx, ry in cfg['spots']:
            t = np.clip((1.6 - np.hypot((xx - cx) / rx, (yy - cy) / ry)) / 0.6, 0, 1)
            keep = np.maximum(keep, t * t * (3 - 2 * t))
        alpha = alpha * keep
    a = np.maximum(alpha, 0.2)[..., None]
    colour = np.clip(skin_model * (1 + (ratio - 1) * cfg.get('strength', 1.0) / a), 0, 1)
    k = cfg['up']
    return upsample(colour, k), np.clip(upsample(alpha, k), 0, 1)


def to_linear(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(np.asarray(c, np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def front_reference():
    """Front reference crop (camera pixels, rows top -> bottom), linear light."""
    img = bpy.data.images.load(str(SHEET), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = px.reshape(h, w, 4)[::-1, :, :3].astype(np.float64)
    x0, y0, x1, y1 = FRONT_BOX
    return to_linear(px[y0:y1, x0:x1])


def skin_patch(face, obj, region, offset_mm):
    """Replace obj's mesh by a copy of the face's own faces inside region (head frame mm: |x| max, y min, y max,
    z min), welded at the midline and lifted offset_mm along the normals (Blender's Displace), so the decal lies
    exactly on the skin."""
    import bmesh
    W = er.world(face)
    L = M.to_local(W) * 1000
    xm, ya, yb, zm = region
    inside = (np.abs(L[:, 0]) <= xm) & (L[:, 1] >= ya) & (L[:, 1] <= yb) & (L[:, 2] >= zm)
    polys = [list(p.vertices) for p in face.data.polygons if all(inside[v] for v in p.vertices)]
    used = sorted({v for p in polys for v in p})
    remap = {v: i for i, v in enumerate(used)}
    mw_inv = np.array(obj.matrix_world.inverted())
    co = (np.c_[W[used], np.ones(len(used))] @ mw_inv.T)[:, :3]
    me = bpy.data.meshes.new(obj.data.name + '_paint')
    me.from_pydata([tuple(c) for c in co], [], [[remap[v] for v in p] for p in polys])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    me.uv_layers.new(name='UVMap')
    for mat in obj.data.materials:
        me.materials.append(mat)
    old = obj.data
    name = old.name
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    me.name = name
    mod = obj.modifiers.new('INKWAVE_paint_lift', 'DISPLACE')
    mod.direction = 'NORMAL'
    mod.mid_level = 0.0
    mod.strength = offset_mm / 1000
    er.apply_modifier(obj, mod)
    return obj.data


def camera_uv(obj, box, centre, shift_y=0.0):
    """UV map = what the front camera sees, in the pixel box of the reference (x0, y0, x1, y1).  The model's
    midline is put on the reference feature's own middle column `centre` (the sheet's front view is not
    perfectly centred on the fitted camera)."""
    me = obj.data
    W = er.world(obj)
    u, v = er.camera_pixels('front', W)
    mid = np.abs(M.to_local(W)[:, 0]) < 0.0012
    shift = centre - float(np.median(u[mid]))
    x0, y0, x1, y1 = box
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', lv)
    uv = np.empty((len(me.loops), 2), np.float32)
    uv[:, 0] = (u[lv] + shift - x0) / (x1 - x0)
    uv[:, 1] = 1 - (v[lv] + shift_y - y0) / (y1 - y0)
    me.uv_layers.active.data.foreach_set('uv', uv.ravel())
    me.update()
    return shift


def facing_weights(obj, face, f0, f1):
    """Per vertex: 1 where the front camera sees the patch squarely, 0 where the surface turns away from it
    (facing < f0) or is hidden behind another part of the face.  A picture projected from the front smears into
    a long streak on such surfaces (seen from the side: a dark line up the side of the nose)."""
    me = obj.data
    W = er.world(obj)
    cam = np.array(bpy.data.objects['FACE_FIT_CAM_front'].matrix_world.translation)
    nw = np.array([obj.matrix_world.to_3x3() @ v.normal for v in me.vertices])
    nw /= np.linalg.norm(nw, axis=1, keepdims=True) + 1e-12
    to_cam = cam[None] - W
    dist = np.linalg.norm(to_cam, axis=1)
    to_cam /= dist[:, None]
    t = np.clip(((nw * to_cam).sum(1) - f0) / (f1 - f0), 0, 1)
    w = t * t * (3 - 2 * t)
    tree = BVHTree.FromPolygons([Vector(v) for v in er.world(face)], [list(p.vertices) for p in face.data.polygons])
    for i in np.nonzero(w > 0)[0]:
        if tree.ray_cast(Vector(W[i] + to_cam[i] * 0.0015), Vector(to_cam[i]), float(dist[i]))[0] is not None:
            w[i] = 0.0
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        i, j = e.vertices
        nb[i].append(j)
        nb[j].append(i)
    for _ in range(2):                      # no hard step where a vertex is hidden
        w = np.minimum(w, np.array([0.5 * w[i] + 0.5 * np.mean(w[nb[i]]) if nb[i] else w[i] for i in range(len(w))]))
    return w


def bake_projection(obj, face, colour, alpha, box, up, shift, shift_y, cfg):
    """Bake the front projection into a texture of the patch's own UV map (round the vertical axis through
    cfg['axis_z'] mm: angle, height), multiplied by the facing weights.  Returns colour, alpha (rows top -> bottom)."""
    me = obj.data
    W = er.world(obj)
    L = M.to_local(W) * 1000
    cu, cv = er.camera_pixels('front', W)
    sx = (cu + shift - box[0]) * up - 0.5                 # source texel of every vertex
    sy = (cv + shift_y - box[1]) * up - 0.5
    wf = facing_weights(obj, face, *cfg['facing'])
    th = np.arctan2(L[:, 0], L[:, 2] - cfg['axis_z'])
    tm = np.abs(th).max() * 1.04
    ya, yb = L[:, 1].min() - 1.0, L[:, 1].max() + 1.0
    uv = np.c_[0.5 + 0.5 * th / tm, (L[:, 1] - ya) / (yb - ya)]
    T = cfg.get('size', 512)
    px, py = uv[:, 0] * T - 0.5, (1 - uv[:, 1]) * T - 0.5     # texel position, rows top -> bottom
    out_c = np.zeros((T, T, 3))
    out_a = np.zeros((T, T))
    done = np.zeros((T, T), bool)
    hs, ws = alpha.shape
    me.calc_loop_triangles()
    for tri in me.loop_triangles:
        i, j, k = tri.vertices
        x0, x1 = int(max(np.floor(min(px[i], px[j], px[k])), 0)), int(min(np.ceil(max(px[i], px[j], px[k])), T - 1))
        y0, y1 = int(max(np.floor(min(py[i], py[j], py[k])), 0)), int(min(np.ceil(max(py[i], py[j], py[k])), T - 1))
        if x1 < x0 or y1 < y0:
            continue
        xx, yy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (py[j] - py[k]) * (px[i] - px[k]) + (px[k] - px[j]) * (py[i] - py[k])
        if abs(d) < 1e-12:
            continue
        a = ((py[j] - py[k]) * (xx - px[k]) + (px[k] - px[j]) * (yy - py[k])) / d
        b = ((py[k] - py[i]) * (xx - px[k]) + (px[i] - px[k]) * (yy - py[k])) / d
        c = 1 - a - b
        ins = (a >= -0.02) & (b >= -0.02) & (c >= -0.02)
        if not ins.any():
            continue
        a, b, c = a[ins], b[ins], c[ins]
        qx = np.clip(a * sx[i] + b * sx[j] + c * sx[k], 0, ws - 1.001)
        qy = np.clip(a * sy[i] + b * sy[j] + c * sy[k], 0, hs - 1.001)
        inside = (a * sx[i] + b * sx[j] + c * sx[k] >= 0) & (a * sx[i] + b * sx[j] + c * sx[k] <= ws - 1) & \
                 (a * sy[i] + b * sy[j] + c * sy[k] >= 0) & (a * sy[i] + b * sy[j] + c * sy[k] <= hs - 1)
        ix, iy = np.floor(qx).astype(int), np.floor(qy).astype(int)
        fx, fy = qx - ix, qy - iy
        def tap(src):
            return (src[iy, ix].T * (1 - fx) * (1 - fy) + src[iy, ix + 1].T * fx * (1 - fy) +
                    src[iy + 1, ix].T * (1 - fx) * fy + src[iy + 1, ix + 1].T * fx * fy).T
        out_c[yy[ins], xx[ins]] = tap(colour)
        out_a[yy[ins], xx[ins]] = tap(alpha) * (a * wf[i] + b * wf[j] + c * wf[k]) * inside
        done[yy[ins], xx[ins]] = True
    out_c[~done] = out_c[done].mean(0)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', lv)
    me.uv_layers.active.data.foreach_set('uv', uv[lv].astype(np.float32).ravel())
    me.update()
    print('FACE_VOLUME bake', obj.name, 'texels used', int(done.sum()), 'vertices turned away or hidden',
          int((wf < 0.5).sum()), 'of', len(wf))
    return out_c, out_a


def paint_image(name, colour, alpha):
    """RGBA image from maps given rows top -> bottom."""
    h, w = alpha.shape
    px = np.empty((h, w, 4), np.float32)
    px[..., :3] = colour
    px[..., 3] = alpha
    img = bpy.data.images.get(name)
    if img is not None and tuple(img.size) != (w, h):
        bpy.data.images.remove(img)
        img = None
    img = img or bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(px[::-1].ravel())
    img.pack()
    return img


BARE_BOX, BARE_SCALE = (120, 125, 245, 225), 4


def bare_crop(path, box, m, shift, shift_y):
    """The model's bare front render (tools/bake_front.py: camera box BARE_BOX at BARE_SCALE) for the reference
    box + margin: the model pixel that shows the reference pixel r is r - shift."""
    img = bpy.data.images.load(str(er.ROOT / path), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = to_linear(px.reshape(h, w, 4)[::-1, :, :3].astype(np.float64))
    k = BARE_SCALE
    x0, y0, x1, y1 = box
    c0 = int(round((x0 - m - shift - BARE_BOX[0]) * k))
    r0 = int(round((y0 - m - shift_y - BARE_BOX[1]) * k))
    hh, ww = (y1 - y0 + 2 * m), (x1 - x0 + 2 * m)
    crop = px[r0:r0 + hh * k, c0:c0 + ww * k]
    return crop.reshape(hh, k, ww, k, 3).mean((1, 3))


def paint_front(face, obj, image_name, cfg):
    skin_patch(face, obj, cfg['region'], cfg['offset_mm'])
    # a see-through decal also shades the skin under it (the light passes it twice): the paint would come out
    # about twice as dark as painted.  The patch casts no shadow (restored by --restore).
    obj.visible_shadow = False
    shift = camera_uv(obj, cfg['box'], cfg['centre'], cfg.get('shift_y', 0.0))
    skin = next(n for n in face.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    skin = np.array(skin.inputs['Base Color'].default_value[:3], np.float64)           # linear
    bare = bare_crop(cfg['bare'], cfg['box'], cfg.get('margin', 16), shift, cfg.get('shift_y', 0.0)) if cfg.get('bare') else None
    colour, alpha = tint_map(front_reference(), cfg['box'], cfg['centre'] if cfg.get('mirror') else None, cfg, skin, bare)
    if cfg.get('facing'):
        colour, alpha = bake_projection(obj, face, colour, alpha, cfg['box'], cfg['up'], shift, cfg.get('shift_y', 0.0), cfg)
    img = paint_image(image_name, to_srgb(colour).astype(np.float32), alpha * cfg.get('alpha', 1.0))
    print('FACE_VOLUME paint', obj.name, 'faces', len(obj.data.polygons), 'camera shift px', round(shift, 2),
          'max alpha', round(float(alpha.max()), 2), 'residual' if bare is not None else 'reference only')
    return img


def paint_nose(face, cfg):
    """Nose from the front reference (nostrils, the rim of the wings, the V under the tip) on the under-nose
    decal, which becomes a patch of the skin itself."""
    obj = bpy.data.objects[NOSE_PATCH]
    img = paint_front(face, obj, 'INKWAVE_NOSE_SHADE', cfg)
    mat = obj.data.materials[0]
    keep_material(mat)
    tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
    if SUFFIX + '_image' not in mat:
        mat[SUFFIX + '_image'] = tex.image.name
        tex.image.use_fake_user = True      # the old image has no user now: keep it in the file for --restore
    tex.image, tex.extension = img, 'CLIP'
    # no gloss of its own (the skin under it keeps its gloss; the nostrils are holes, not shiny)
    next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Specular IOR Level'].default_value = 0.0


def paint_mouth(face, cfg):
    """Lips and mouth line from the front reference on the lip decal (a patch of the skin itself)."""
    obj = bpy.data.objects[LIP_PATCH]
    img = paint_front(face, obj, 'INKWAVE_LIP_PAINT', cfg)
    mat, bsdf = decal_look('lips', {})
    alpha_image_material(mat, bsdf, img, cfg.get('roughness', 0.55))
    bsdf.inputs['Specular IOR Level'].default_value = cfg.get('specular', 0.15)


def hide_decal(key):
    """A decal the paint replaces stays in the file but shows nothing."""
    decal_look(key, {'alpha': 0.0})


SKIN_MATERIAL = 'skin_b27050'


def set_skin(cfg):
    """Skin (face, ears, body share one material).  base_colour: the reference skin is a warmer tan (the old tone
    renders too pink).  bsdf: the look of soft, plump skin - more subsurface light (the shadow side glows warm
    instead of turning grey), a rougher, weaker specular (no plastic glints) and a light, pale sheen instead of
    the strong orange one that drew a hard rim along the jaw.  The same surface settings go to the see-through
    layers lying on the skin (cfg['layers'], the blush): otherwise they shade differently from the skin under them
    and their edges show as lines.  Old values are kept on each material for --restore."""
    for name in [SKIN_MATERIAL] + cfg.get('layers', []):
        mat = bpy.data.materials[name]
        n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        sockets = dict(cfg.get('bsdf', {}))
        if name == SKIN_MATERIAL:
            sockets['Base Color'] = list(cfg['base_colour']) + [1.0]
        if SUFFIX + '_skin' not in mat:
            mat[SUFFIX + '_skin'] = json.dumps({k: (list(n.inputs[k].default_value)
                                                    if hasattr(n.inputs[k].default_value, '__len__')
                                                    else n.inputs[k].default_value) for k in sockets})
        for k, v in sockets.items():
            n.inputs[k].default_value = v
    paint = bpy.data.materials.get(er.FACE_PAINT_MATERIAL)
    if paint is not None:                  # its default value is what the reference paint reads as the skin tone
        next(n for n in paint.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = \
            list(cfg['base_colour']) + [1.0]


def restore_skin():
    for mat in bpy.data.materials:
        if SUFFIX + '_skin' not in mat:
            continue
        old = mat[SUFFIX + '_skin']
        old = json.loads(old) if isinstance(old, str) else {'Base Color': list(old)}
        n = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        for k, v in old.items():
            n.inputs[k].default_value = v
        if mat.name == SKIN_MATERIAL:
            paint = bpy.data.materials.get(er.FACE_PAINT_MATERIAL)
            if paint is not None:
                next(n for n in paint.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = \
                    old['Base Color']
        del mat[SUFFIX + '_skin']


def soften_lights(cfg):
    """The scene's sun lights have a tiny angle (0.04 rad): hard shadow edges (a sharp shadow under the nose, a hard
    light/shadow line on the cheeks).  The reference is lit softly.  Wider suns give soft edges; strength and
    direction stay.  Old angles are kept on each light for --restore."""
    for name in cfg['names']:
        light = bpy.data.objects[name].data
        if SUFFIX not in light:
            light[SUFFIX] = light.angle
        light.angle = cfg['angle']


EYE_LOOK = 'INKWAVE_eye_look'
CORNEAS = ('HEAD_eyes_02', 'HEAD_eyes_19')
EYE_BALLS = {'HEAD_eyes': 'eyes_texture', 'HEAD_eyes_18': 'eyes_texture_02'}


def eye_look(cfg):
    """Eyes that sit in the face like the reference:
    - the soft suns drew a big blurred disc on the glossy cornea: the suns no longer light the corneas (Blender's
      light linking); one small sharp sun lights only them, for the small white catch lights of the reference;
    - the upper lid shades the eye: the eyeball colour is darkened from cfg['shade_from_m'] above the eyeball's
      centre to cfg['shade_to_m'] (to cfg['shade_min']), measured along the head's up axis (Geometry > Position,
      Vector Math dot, Map Range, Mix multiply).  The eyeballs are not moved."""
    up = M.to_world(np.array([[0, 1.0, 0]]))[0] - M.to_world(np.zeros((1, 3)))[0]
    up /= np.linalg.norm(up)
    corneas = [bpy.data.objects[n] for n in CORNEAS]
    off = bpy.data.collections.new(EYE_LOOK + '_corneas')
    for o in corneas:
        off.objects.link(o)
    for item in off.collection_objects:
        item.light_linking.link_state = 'EXCLUDE'
    for name in cfg['suns']:
        bpy.data.objects[name].light_linking.receiver_collection = off
    only = bpy.data.collections.new(EYE_LOOK + '_catch')
    for o in corneas:
        only.objects.link(o)
    light = bpy.data.lights.new(EYE_LOOK, 'SUN')
    light.energy, light.angle = cfg['catch_energy'], cfg['catch_angle']
    sun = bpy.data.objects.new(EYE_LOOK, light)
    bpy.data.objects[cfg['suns'][0]].users_collection[0].objects.link(sun)
    d = M.to_world(np.array([cfg['catch_dir']]))[0] - M.to_world(np.zeros((1, 3)))[0]
    sun.rotation_euler = Vector(d / np.linalg.norm(d)).to_track_quat('Z', 'Y').to_euler()
    sun.light_linking.receiver_collection = only
    for obj_name, mat_name in EYE_BALLS.items():
        W = er.world(bpy.data.objects[obj_name])
        sol = np.linalg.lstsq(np.c_[2 * W, np.ones(len(W))], (W ** 2).sum(1), rcond=None)[0]
        h0 = float(sol[:3] @ up)
        t = bpy.data.materials[mat_name].node_tree
        bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
        src = bsdf.inputs['Base Color'].links[0].from_socket
        geo = t.nodes.new('ShaderNodeNewGeometry')
        dot = t.nodes.new('ShaderNodeVectorMath')
        dot.operation = 'DOT_PRODUCT'
        dot.inputs[1].default_value = tuple(up)
        rng = t.nodes.new('ShaderNodeMapRange')
        rng.clamp = True
        rng.inputs['From Min'].default_value = h0 + cfg['shade_from_m']
        rng.inputs['From Max'].default_value = h0 + cfg['shade_to_m']
        rng.inputs['To Min'].default_value = 1.0
        rng.inputs['To Max'].default_value = cfg['shade_min']
        mul = t.nodes.new('ShaderNodeMix')
        mul.data_type, mul.blend_type = 'RGBA', 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        for n in (geo, dot, rng, mul):
            n.name = n.label = EYE_LOOK + '_' + n.bl_idname
        t.links.new(geo.outputs['Position'], dot.inputs[0])
        t.links.new(dot.outputs['Value'], rng.inputs['Value'])
        t.links.new(src, mul.inputs[6])
        t.links.new(rng.outputs['Result'], mul.inputs[7])
        t.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
        if cfg.get('emission'):
            # the white behind the iris lies in the socket's shadow and went black in the side view, where the
            # reference shows it white: a little of the eye's own colour as emission (old value kept)
            if SUFFIX + '_emit' not in bpy.data.materials[mat_name]:
                bpy.data.materials[mat_name][SUFFIX + '_emit'] = bsdf.inputs['Emission Strength'].default_value
            t.links.new(mul.outputs[2], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = cfg['emission']


def restore_eye_look():
    for mat_name in EYE_BALLS.values():
        mat = bpy.data.materials.get(mat_name)
        if mat is None:
            continue
        t = mat.node_tree
        mine = [n for n in t.nodes if n.name.startswith(EYE_LOOK)]
        if not mine:
            continue
        mul = next(n for n in mine if n.bl_idname == 'ShaderNodeMix')
        src = mul.inputs[6].links[0].from_socket
        bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
        if SUFFIX + '_emit' in mat:
            bsdf.inputs['Emission Strength'].default_value = mat[SUFFIX + '_emit']
            del mat[SUFFIX + '_emit']
        for n in mine:
            t.nodes.remove(n)
        t.links.new(src, bsdf.inputs['Base Color'])
    obj = bpy.data.objects.get(EYE_LOOK)
    if obj is not None:
        light = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.lights.remove(light)
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.light_linking.receiver_collection is not None and \
                o.light_linking.receiver_collection.name.startswith(EYE_LOOK):
            o.light_linking.receiver_collection = None
    for c in [c for c in bpy.data.collections if c.name.startswith(EYE_LOOK)]:
        bpy.data.collections.remove(c)


def restore_lights():
    for light in bpy.data.lights:
        if SUFFIX in light:
            light.angle = light[SUFFIX]
            del light[SUFFIX]


CORNEA_MATERIAL = 'eyes_000000'


def set_cornea(cfg):
    """The cornea shell mirrors the sky: a grey haze with a sharp horizon line over the upper iris and pupil,
    where the reference has a black pupil and a clear teal iris.  Its coat and specular go down (a small
    sharp glint stays).  The old values are kept on the material for --restore."""
    mat = bpy.data.materials[CORNEA_MATERIAL]
    if SUFFIX not in mat:
        mat[SUFFIX] = {n.name: [n.inputs['Coat Weight'].default_value, n.inputs['Specular IOR Level'].default_value]
                       for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'}
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Coat Weight'].default_value = cfg['coat']
            n.inputs['Specular IOR Level'].default_value = cfg['specular']


def restore_cornea():
    mat = bpy.data.materials.get(CORNEA_MATERIAL)
    if mat is None or SUFFIX not in mat:
        return
    for name, (coat, spec) in mat[SUFFIX].to_dict().items():
        n = mat.node_tree.nodes[name]
        n.inputs['Coat Weight'].default_value = coat
        n.inputs['Specular IOR Level'].default_value = spec
    del mat[SUFFIX]


def raise_iris(cfg):
    """The iris sits lower in the eye opening than in the reference (front view: its top edge is under the
    liner's shadow, its centre about 5 px lower).  The eyeballs are not moved (they rest against the lids);
    their UV map slides so the painted iris moves up on the ball, like the eye looking a little up.  The UV
    step per front pixel is measured with a front-camera ray at the iris centre."""
    mat, w, h = er.camera_matrix('front')
    inv = np.linalg.inv(mat)
    for name, side in IRIS_BALLS.items():
        obj = bpy.data.objects[name]
        me = obj.data
        W = er.world(obj)
        tree = BVHTree.FromPolygons([Vector(v) for v in W], [list(p.vertices) for p in me.polygons])
        uvl = me.uv_layers.active.data
        u0, v0 = cfg['centre_px'] if side < 0 else (cfg['centre_px_left'])

        def uv_at(u, v):
            nd = [np.array([2 * u / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
            a, b = [q[:3] / q[3] for q in nd]
            hit = tree.ray_cast(Vector(a), Vector((b - a) / np.linalg.norm(b - a)), 50)
            p = me.polygons[hit[2]]
            P = W[list(p.vertices)]
            wts = 1 / (np.linalg.norm(P - np.array(hit[0]), axis=1) + 1e-9)
            return (np.array([uvl[li].uv[:] for li in p.loop_indices]) * wts[:, None]).sum(0) / wts.sum()
        duv = uv_at(u0, v0 + cfg['px']) - uv_at(u0, v0)      # the texel now shown px lower comes to the centre
        uv = np.empty(len(uvl) * 2)
        uvl.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2) + duv
        uvl.foreach_set('uv', uv.ravel())
        me.update()
        print('FACE_VOLUME iris', name, 'up px', cfg['px'], 'uv shift', np.round(duv, 4).tolist())


IRIS_IMAGES = {'Image_0': (184.5, 134.0), 'Image_1': (198.5, 134.0)}


def restore_images():
    for name in IRIS_IMAGES:
        img, bak = bpy.data.images.get(name), bpy.data.images.get(name + SUFFIX)
        if img is None or bak is None:
            continue
        px = np.empty(len(bak.pixels), np.float32)
        bak.pixels.foreach_get(px)
        img.pixels.foreach_set(px)
        img.pack()
        bpy.data.images.remove(bak)


def thin_limbal_ring(cfg):
    """The dark ring round the iris (limbus) is painted about 8-10 texels wide; the reference ring is about half
    as wide and teal-black.  Polar remap of the eye texture: the iris from t0 of its radius outward is
    stretched to fill the inner part of the old ring, and the ring is squeezed into its outer part (pupil and
    white untouched).  The iris edge radius per angle is found where the texture turns to the white."""
    for name, (cx, cyb) in IRIS_IMAGES.items():
        img = bpy.data.images[name]
        if bpy.data.images.get(name + SUFFIX) is None:
            bak = img.copy()
            bak.name = name + SUFFIX
            bak.use_fake_user = True
            bak.pack()
        w, h = img.size
        src = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(src)
        src = src.reshape(h, w, 4)
        lum = src[..., :3].mean(2)
        # iris edge on the upper half (white above is bright): first radius past the ring where lum jumps
        angs = np.radians(np.arange(10, 171, 5))
        edge = []
        for a in angs:
            rs = np.arange(80, 115, 0.5)
            xs = cx + rs * np.cos(a)
            ys = cyb + rs * np.sin(a)
            l = lum[np.clip(ys.round().astype(int), 0, h - 1), np.clip(xs.round().astype(int), 0, w - 1)]
            k = np.argmax(l > cfg['white_lum'])
            edge.append(rs[k])
        R = float(np.median(edge))
        yy, xx = np.mgrid[0:h, 0:w].astype(float)
        dx, dy = xx - cx, yy - cyb
        r = np.hypot(dx, dy) / R
        t0, tin, k = cfg['t0'], cfg['ring_in'], cfg['keep']
        tnew = 1 - (1 - tin) * k                       # new inner edge of the ring
        rs = r.copy()
        m1 = (r >= t0) & (r < tnew)
        rs[m1] = t0 + (r[m1] - t0) * (tin - t0) / (tnew - t0)
        m2 = (r >= tnew) & (r < 1)
        rs[m2] = tin + (r[m2] - tnew) * (1 - tin) / (1 - tnew)
        scale = np.where(r > 1e-6, rs / np.maximum(r, 1e-6), 1)
        sx, sy = cx + dx * scale, cyb + dy * scale
        x0, y0 = np.clip(np.floor(sx).astype(int), 0, w - 2), np.clip(np.floor(sy).astype(int), 0, h - 2)
        fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
        out = (src[y0, x0] * (1 - fx) * (1 - fy) + src[y0, x0 + 1] * fx * (1 - fy) +
               src[y0 + 1, x0] * (1 - fx) * fy + src[y0 + 1, x0 + 1] * fx * fy)
        ring = (r >= tnew) & (r < 1)
        if cfg.get('edge_lift'):
            # the iris darkens toward the ring over a wide band; the reference stays bright teal up to the ring
            tl = cfg['edge_lift_from']
            band = (r >= tl) & (r < tnew)
            f = ((r[band] - tl) / (tnew - tl))[:, None]
            out[band, :3] = np.clip(out[band, :3] * (1 + cfg['edge_lift'] * f), 0, 1)
        if cfg.get('ring_tint'):
            tint = np.array(cfg['ring_tint'] + [1.0], np.float32)
            out[ring] = out[ring] * (1 - cfg['ring_tint_amount']) + tint * cfg['ring_tint_amount']
        change = r < 1
        res = src.copy()
        res[change] = out[change]
        img.pixels.foreach_set(res.ravel())
        img.pack()
        img.update()
        print('FACE_VOLUME limbal ring', name, 'iris radius texels', round(R, 1), 'ring', round((1 - tin) * R, 1), '->', round((1 - tnew) * R, 1))


def bind(objs, face):
    mods = []
    for obj in objs:
        mod = obj.modifiers.new('INKWAVE_volume_follow', 'SURFACE_DEFORM')
        mod.target = face
        while obj.modifiers[0] != mod:
            er.with_object(obj, lambda: bpy.ops.object.modifier_move_up(modifier=mod.name))
        er.with_object(obj, lambda: bpy.ops.object.surfacedeform_bind(modifier=mod.name))
        if not mod.is_bound:
            raise RuntimeError(f'Surface Deform could not bind {obj.name}')
        mods.append((obj, mod))
    return mods


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--params', default=str(PARAMS))
    ap.add_argument('--save')
    ap.add_argument('--restore', action='store_true')
    ap.add_argument('--no-paint', action='store_true', help='skip the reference paint (to render bare_front.png)')
    args = ap.parse_args(argv)
    if any(m.name.endswith('__pre_lash_rebuild') for m in bpy.data.meshes):
        raise SystemExit('run inkwave_lash_rebuild.py --restore first (the lashes are rebuilt on the new skin)')
    print('FACE_VOLUME restored', restore(drop=args.restore), 'meshes')
    restore_cornea()
    restore_images()
    restore_materials()
    restore_skin()
    remove_blush_fade_node()
    restore_blush_image()
    restore_lights()
    restore_eye_look()
    if not args.restore:
        back_up()
        p = json.loads(Path(args.params).read_text())
        face = bpy.data.objects[FACE]
        world = er.world(face)
        loc = M.to_local(world) * 1000
        keep_eye, keep_lip = protection(loc, world, p)
        d_eye = eye_distance(world)
        mods = bind([bpy.data.objects[n] for n in FOLLOWERS], face)
        global NORMALS
        pairs = seam_pairs(face)
        ds = p.get('delta_smooth')
        ds_mod = delta_smooth_bind(face) if ds else None
        print('FACE_VOLUME midline pairs', len(pairs))
        for step in p['steps']:
            loc = M.to_local(er.world(face)) * 1000
            nw = np.array([face.matrix_world.to_3x3() @ v.normal for v in face.data.vertices])
            NORMALS = M.to_local(nw) - M.to_local(np.zeros((1, 3)))
            if step['kind'] == 'move_eyes':
                move_eyes(face, loc, d_eye, step)
                print('FACE_VOLUME', step['name'], 'seam gap closed mm', round(float(join_seam(face, pairs)), 3))
                continue
            if step['kind'] in ('arc_h', 'arc_v'):
                off = arc_offsets(loc, step)
                if step.get('keep_q34', False) and step['mm_sign'] > 0:
                    off = clamp_to_silhouette(er.world(face), loc, off, step.get('margin_px', 0.3))
                peak = float(np.abs(off).max())
                w, step = np.abs(off) / max(peak, 1e-9), dict(step, kind='warp', vec_mm=[0, 0, np.sign(step['mm_sign']) * peak])
                print('FACE_VOLUME', step['name'], 'arc peak mm', round(peak, 2))
            elif step['kind'] == 'ceiling':
                off = ceiling_offsets(loc, step)
                peak = float(off.max())
                w, step = off / max(peak, 1e-9), dict(step, kind='warp', vec_mm=[0, peak, 0])
                print('FACE_VOLUME', step['name'], 'ceiling peak mm', round(peak, 2))
            else:
                w = sum(bump(loc, b) * b.get('scale', 1.0) for b in step['bumps'])
                if step.get('keep_q34') and step['kind'] == 'warp':
                    w = np.clip(w, 0, 1) * keep_eye * (keep_lip if step.get('protect_lips', True) else 1)
                    off = clamp_to_silhouette(er.world(face), loc, w * step['vec_mm'][2], step.get('margin_px', 0.3))
                    w = off / step['vec_mm'][2]
            if 'pin_xz' in step:
                # the ring grid of HEAD_face ends in a tiny open ring under the chin (its pole); smoothing would
                # spread those crowded rings into a flat disc, so they stay
                (px, pz), (r0, r1) = step['pin_xz']['centre'], step['pin_xz']['r']
                t = np.clip((np.hypot(loc[:, 0] - px, loc[:, 2] - pz) - r0) / (r1 - r0), 0, 1)
                w = w * t * t * (3 - 2 * t)
            if 'eye_keep_mm' in step:
                e0, e1 = step['eye_keep_mm']
                w = np.clip(w, 0, 1) * np.clip((d_eye - e0) / (e1 - e0), 0, 1)
            else:
                w = np.clip(w, 0, 1) * keep_eye
            if step.get('protect_lips', True):
                w *= keep_lip + (1 - keep_lip) * step.get('lip_share', 0.0)
            before = er.world(face)
            if step.get('weight_smooth', 0) and w.max() > 0:
                peak_w = w.max()
                w = smooth_weights(face, w, step['weight_smooth'])
                w = np.clip(w * peak_w / max(w.max(), 1e-9), 0, 1)
            if step['kind'] == 'warp':
                warp(face, w, step['vec_mm'], loc)
            elif step['kind'] == 'displace':
                er.apply_weighted_modifier(face, w, 'DISPLACE', direction='NORMAL', strength=step['mm'] / 1000,
                                           mid_level=0.0)
            else:
                # seam_chunks > 1: smooth across the open midline too.  Each half is smoothed on its own for a few
                # iterations, then the midline pairs are joined again, so the joint never drifts far and no fold
                # forms there (one long run pulls both open edges inward and leaves a crease).
                chunks = step.get('seam_chunks', 1)
                for _ in range(chunks):
                    er.apply_weighted_modifier(face, w, 'SMOOTH', factor=step['factor'],
                                               iterations=max(1, step['iters'] // chunks))
                    if chunks > 1:
                        join_seam(face, pairs)
            gap = join_seam(face, pairs)
            move = np.linalg.norm(er.world(face) - before, axis=1) * 1000
            print('FACE_VOLUME', step['name'], 'vertices', int((w > 0.001).sum()), 'max move mm', round(float(move.max()), 2), 'seam gap closed mm', round(float(gap), 3))
        if ds_mod is not None:
            loc = M.to_local(er.world(face)) * 1000
            w = np.clip((loc[:, 2] - 40) / 20, 0, 1) * np.clip((loc[:, 1] + 115) / 10, 0, 1) * np.clip((5 - loc[:, 1]) / 10, 0, 1)
            e0, e1 = ds['eye_keep_mm']
            w *= np.clip((eye_distance(er.world(face)) - e0) / (e1 - e0), 0, 1)
            # the halves are not joined at the midline: smoothing there sees one side only and folds the crest,
            # so the midline keeps the (already smooth) edit
            t = np.clip((np.abs(loc[:, 0]) - 1.0) / 5.0, 0, 1)
            w *= t * t * (3 - 2 * t)
            for b in ds.get('exclude', []):
                w *= 1 - bump(loc, dict(b, front_only=False))
            delta_smooth_apply(face, ds_mod, w, ds)
            print('FACE_VOLUME delta smooth seam gap closed mm', round(float(join_seam(face, pairs)), 3))
        for obj, mod in mods:
            er.apply_modifier(obj, mod)
        if p.get('skin'):
            set_skin(p['skin'])
        if p.get('lights'):
            soften_lights(p['lights'])
        if p.get('eye_look'):
            eye_look(p['eye_look'])
        if p.get('mouth_line'):
            thin_ribbon(MOUTH_LINE, p['mouth_line'], face if 'width_mm' in p['mouth_line'] else None)
            decal_look('mouth_line', p['mouth_line'])
        if p.get('paint_nose') and not args.no_paint:
            paint_nose(face, p['paint_nose'])
            hide_decal('nostrils')
        if p.get('paint_mouth') and not args.no_paint:
            paint_mouth(face, p['paint_mouth'])
            if not p.get('mouth_line'):
                hide_decal('mouth_line')
        if p.get('limbal_ring'):
            thin_limbal_ring(p['limbal_ring'])
        if p.get('iris_up'):
            raise_iris(p['iris_up'])
        if p.get('cornea'):
            set_cornea(p['cornea'])
        if p.get('tuck'):
            tuck_clear_edges(face, ['HEAD_skin_04', 'HEAD_skin'], p['tuck'])
        if p.get('blush'):
            paint_blush(face, ['HEAD_skin_04', 'HEAD_skin'], p['blush'])
        seam_normals(face, pairs)
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save, compress=True)


if __name__ == '__main__':
    main()
