"""Face volume: fuller cheeks round the mouth, a longer eye-to-cheek curve, a rounded nose bridge, a rounder jaw
outline from the front and more nose volume (analysis/face_volume/params.json).

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


def restore(drop=False):
    count = 0
    for name in [FACE] + FOLLOWERS:
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
    for name in [FACE] + FOLLOWERS:
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
    return np.maximum(off, 0) if st['mm_sign'] > 0 else np.minimum(off, 0)


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
        print('FACE_VOLUME tuck', name, 'folded', len(folded), 'hidden', len(under), 'blend ring', len(onto))


def thin_ribbon(name, cfg):
    """The mouth line (HEAD_skin_09) is a flat band on the skin: about 1.2 mm wide and flaring into 4.6 mm
    triangle hooks at both corners, where the reference has a thin line with thin upturned ends.  Its outer
    loop is split at the two corner tips into an upper and a lower edge; every vertex moves toward the middle
    of the two edges (scaled by cfg['keep']), so the band keeps its path and ends but gets thin."""
    import bmesh
    obj = bpy.data.objects[name]
    W = er.world(obj)
    L = M.to_local(W) * 1000
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    adj = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts[0].index, e.verts[1].index
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    bm.free()
    start = next(iter(adj))
    loop, prev = [start], None
    while True:
        nxt = [n for n in adj[loop[-1]] if n != prev][0]
        if nxt == start:
            break
        prev = loop[-1]
        loop.append(nxt)
    loop = np.array(loop)
    tips = [int(np.argmin(L[loop, 0])), int(np.argmax(L[loop, 0]))]
    i0, i1 = sorted(tips)
    a_side, b_side = loop[i0:i1 + 1], np.r_[loop[i1:], loop[:i0 + 1]]

    def nearest_on(chain, q):
        P = W[chain]
        best, bd = None, 1e9
        for k in range(len(P) - 1):
            seg = P[k + 1] - P[k]
            t = np.clip(np.dot(q - P[k], seg) / max(np.dot(seg, seg), 1e-18), 0, 1)
            c = P[k] + seg * t
            d = np.linalg.norm(q - c)
            if d < bd:
                best, bd = c, d
        return best
    new = W.copy()
    keep = cfg['keep']
    for i, q in enumerate(W):
        c = 0.5 * (nearest_on(a_side, q) + nearest_on(b_side, q))
        new[i] = c + (q - c) * keep
    mw_inv = np.array(obj.matrix_world.inverted())
    co = (np.c_[new, np.ones(len(new))] @ mw_inv.T)[:, :3]
    obj.data.vertices.foreach_set('co', co.ravel())
    obj.data.update()
    print('FACE_VOLUME thin', name, 'keep', keep, 'max move mm', round(float(np.linalg.norm(new - W, axis=1).max() * 1000), 2))


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
    args = ap.parse_args(argv)
    if any(m.name.endswith('__pre_lash_rebuild') for m in bpy.data.meshes):
        raise SystemExit('run inkwave_lash_rebuild.py --restore first (the lashes are rebuilt on the new skin)')
    print('FACE_VOLUME restored', restore(drop=args.restore), 'meshes')
    restore_cornea()
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
            if step['kind'] in ('arc_h', 'arc_v'):
                off = arc_offsets(loc, step)
                if step.get('keep_q34', False) and step['mm_sign'] > 0:
                    off = clamp_to_silhouette(er.world(face), loc, off, step.get('margin_px', 0.3))
                peak = float(np.abs(off).max())
                w, step = np.abs(off) / max(peak, 1e-9), dict(step, kind='warp', vec_mm=[0, 0, np.sign(step['mm_sign']) * peak])
                print('FACE_VOLUME', step['name'], 'arc peak mm', round(peak, 2))
            else:
                w = sum(bump(loc, b) * b.get('scale', 1.0) for b in step['bumps'])
                if step.get('keep_q34') and step['kind'] == 'warp':
                    w = np.clip(w, 0, 1) * keep_eye * (keep_lip if step.get('protect_lips', True) else 1)
                    off = clamp_to_silhouette(er.world(face), loc, w * step['vec_mm'][2], step.get('margin_px', 0.3))
                    w = off / step['vec_mm'][2]
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
                er.apply_weighted_modifier(face, w, 'SMOOTH', factor=step['factor'], iterations=step['iters'])
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
        if p.get('mouth_line'):
            thin_ribbon('HEAD_skin_09', p['mouth_line'])
        if p.get('cornea'):
            set_cornea(p['cornea'])
        if p.get('tuck'):
            tuck_clear_edges(face, ['HEAD_skin_04', 'HEAD_skin'], p['tuck'])
        seam_normals(face, pairs)
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save, compress=True)


if __name__ == '__main__':
    main()
