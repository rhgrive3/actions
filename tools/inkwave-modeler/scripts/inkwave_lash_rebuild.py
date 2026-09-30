"""Rebuild the upper liner / wing / upper lashes / lower lashes / lower line as separate 3D parts (from the reference).

The eye opening is not touched, except the inner corner (the lid skin slides toward the nose so the white ends in
a sharp point, then Blender's Smooth; the skin layers follow with Surface Deform).  The design
(analysis/lash_rebuild/design_3d.json) is measured on the reference front, 3/4 and side views of the right eye;
the left eye is built with mirrored rays on its own skin.  Runs never stack: the meshes it changes are backed up
(`__pre_lash_rebuild`) on the first run and restored at the start of every run.  Run after inkwave_eye_refine.py:

  blender -b blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_lash_rebuild.py -- \
    --save blender/INKWAVE_CHARACTER_MASTER.blend \
    --export blender/INKWAVE_CHARACTER_MASTER.glb --game blender/INKWAVE_GAME.glb
  ... -- --restore --save <out.blend>      # undo (drops the backups)
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
DESIGN = er.ROOT / 'analysis/lash_rebuild/design_3d.json'
SURFACES = ['HEAD_face', 'HEAD_skin', 'HEAD_skin_04', 'HEAD_eyes', 'HEAD_eyes_18', 'HEAD_eyes_02', 'HEAD_eyes_19']
R = {'rim': 'HEAD_eyes_30', 'liner': 'HEAD_eyes_20', 'lashes': [f'HEAD_eyes_{i:02d}' for i in range(22, 29)]}
L = {'rim': 'HEAD_eyes_13', 'liner': 'HEAD_eyes_03', 'lashes': [f'HEAD_eyes_{i:02d}' for i in range(5, 12)]}
LINER_LIFT_MM = 0.8
MIN_CLEAR_MM = 0.5
MAX_FLOAT_MM = 1.2
LINER_ROWS = 14
SMOOTH_ITERS = 40
LINER_THICK_MM = 0.12
LASH_ROOT_LIFT_MM = 0.85
UPPER_R_SCALE = 5.5
LOWER_LEN_MM = 2.2
LOWER_ROOT_MM = 0.7
LOWER_LIFT_MM = 0.3
LOWER_LEAN = 0.45
MM_PER_PX = 1.1
LINER_DECIMATE = 0.2
SIDE_STEP_PX = 0.2
SIDE_LIFT_MM = 0.7
SIDE_STANDOFF_MM = 10.0
SIDE_FILL_UP_PX = 8.0
SIDE_NOTCH_PX = 3.0
SIDE_REF_OUTER_MM = 72.5
SIDE_MAX_EDGE_MM = 3.0
SIDE_MAX_FRONT_COS = 0.35
COVER_STEP_PX = 0.2
COVER_LIFT_MM = 0.3
COVER_OVERLAP_PX = 0.0
MARGIN_STEP_MM = 0.25
MARGIN_STEPS = 16
MARGIN_LIFT_MM = 0.08
MARGIN_STOP_MM = 0.25
RIM_BELOW_PX = 0.35
RIM_ABOVE_PX = 0.3
CORNER_UPPER_X = 116.0
CORNER_LOWER_X = 116.0


EYEBALLS = {'HEAD_eyes', 'HEAD_eyes_02', 'HEAD_eyes_18', 'HEAD_eyes_19'}
EYE_POLYS = set()


def surface_tree():
    """Every visible head part near the eyes except the parts this script rebuilds."""
    own = set(R['lashes'] + L['lashes'] + [R['liner'], L['liner'], R['rim'], L['rim']])
    skip = {'FACE_FIT_ORIGINAL', 'HAIR', 'HEADGEAR', 'CLOTHES'}
    verts, polys = [], []
    EYE_POLYS.clear()
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.name in own or obj.hide_render or not obj.data.polygons:
            continue
        if not obj.name.startswith('HEAD_') or any(c.name in skip for c in obj.users_collection):
            continue
        base = sum(len(v) for v in verts)
        verts.append(er.world(obj))
        if obj.name in EYEBALLS:
            EYE_POLYS.update(range(len(polys), len(polys) + len(obj.data.polygons)))
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    return BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)


def mesh_tree(names):
    verts, polys = [], []
    for name in names:
        obj = bpy.data.objects[name]
        base = sum(len(v) for v in verts)
        verts.append(er.world(obj))
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    return BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)


def shell_tree():
    """The scalp shell lies just over the skin at the temple; the liner must stay in front of it."""
    obj = bpy.data.objects['HAIR_hair']
    return BVHTree.FromPolygons([Vector(v) for v in er.world(obj)], [list(p.vertices) for p in obj.data.polygons])


class FrontRays:
    def __init__(self, tree, shell=None):
        self.tree = tree
        self.shell = shell
        self.skin_tree = mesh_tree(['HEAD_face'])
        self.eye_tree = mesh_tree(sorted(EYEBALLS))
        mat, self.w, self.h = er.camera_matrix('front')
        self.inv = np.linalg.inv(mat)

    def cast(self, u, v):
        ndc = [np.array([2 * u / self.w - 1, 1 - 2 * v / self.h, z, 1]) @ self.inv.T for z in (-1, 1)]
        a, b = [p[:3] / p[3] for p in ndc]
        d = (b - a) / np.linalg.norm(b - a)
        hit = self.tree.ray_cast(Vector(a), Vector(d), 50)
        if hit[0] is None:
            raise ValueError(f'ray misses the skin at {u:.2f},{v:.2f}')
        return np.array(hit[0]), d, hit[3]

    def on_eye(self, u, v):
        p, d, t = self.cast(u, v)
        hit = self.tree.ray_cast(Vector(p - d * t), Vector(d), 50)
        return hit[2] in EYE_POLYS

    def near(self, u, v, reach_mm=5.0):
        """Distance to the skin, or to the scalp shell where it lies within reach_mm in front of the skin."""
        p, d, t = self.cast(u, v)
        if self.shell is not None:
            origin = p - d * t
            hit = self.shell.ray_cast(Vector(origin), Vector(d), 50)
            if hit[0] is not None and t - reach_mm / 1000 < hit[3] < t:
                return hit[3]
        return t

    def lifted(self, uv, lift_mm):
        p, d, _ = self.cast(*uv)
        return M.to_local(p[None] - d[None] * lift_mm / 1000)[0] * 1000

    def ray(self, uv):
        """World origin and direction of the camera ray through a front-view pixel, and the hit distance."""
        p, d, t = self.cast(*uv)
        return p - d * t, d, t


class MirrorRays(FrontRays):
    """Rays for the left eye, addressed in right-eye design pixels: a design pixel is mapped to the pixel of the
    mirror image of its right-side surface point, so every part is built on the left eye's own skin and eyeball
    (the face is not exactly symmetric; mirroring finished geometry left skin gaps and skin poking through)."""

    def cast(self, u, v):
        p, _, _ = FrontRays.cast(self, u, v)
        q = M.to_local(p[None])[0]
        q[0] = -q[0]
        ux, uy = er.camera_pixels('front', M.to_world(q[None]))
        return FrontRays.cast(self, float(ux[0]), float(uy[0]))


def bezier(root, mid, tip, n):
    t = np.linspace(0, 1, n)[:, None]
    root, mid, tip = (np.asarray(x, float) for x in (root, mid, tip))
    ctrl = 2 * mid - 0.5 * (root + tip)
    return (1 - t) ** 2 * root + 2 * (1 - t) * t * ctrl + t ** 2 * tip


def rim_pixels():
    cfg = json.loads(json.dumps(er.LASH_VARIANTS['lp40']['lower_paint']))
    U, curve = er.lower_lid_curve(cfg)
    ux, uy = er.camera_pixels('front', M.to_world(curve / 1000))
    return np.c_[ux, uy][::3]


def corner_join(rim_px):
    """Outer eye corner where the wing's lower edge turns into the lower lid line (slightly past the rim start)."""
    d = rim_px[0] - rim_px[3]
    return rim_px[0] + 0.4 * d / np.linalg.norm(d)


def corner_bottom(bot, join, design):
    """The wing's lower edge follows the reference wedge edge down to the outer end of the white, then runs up
    along the white to the old chain.  The skin below the wedge stays skin (the lower lashes sit there)."""
    cn = design['corner']
    bot = bot.copy()
    k1 = int(np.argmax(bot[:, 1] > join[1] - 14.0))
    k2 = int(np.argmax(bot[:, 0] > cn['c'][0] + 2.0))
    path = np.vstack([bot[k1], cn['edge'], cn['c'], cn['up'], bot[k2]])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    t = np.linspace(0, seg[-1], k2 - k1 + 1)
    bot[k1:k2 + 1] = np.c_[np.interp(t, seg, path[:, 0]), np.interp(t, seg, path[:, 1])]
    return bot


def off_eye(rays, top, bot, margin=-0.5):
    """The liner ends on the lid margin: it must never lie on the eyeball (seen from the side, a liner painted
    on the eyeball becomes a big black cap over the eye).  Each bottom point that lands on the eyeball is moved
    straight up until its front ray just misses the eyeball."""
    bot = bot.copy()
    order = np.argsort(top[:, 0])
    for i in range(len(bot)):
        if not rays.on_eye(*bot[i]):
            continue
        x = bot[i, 0]
        hi_y = bot[i, 1]
        lo_y = min(float(np.interp(x, top[order, 0], top[order, 1])), hi_y - 0.05)
        if rays.on_eye(x, lo_y):
            bot[i, 1] = lo_y
            continue
        for _ in range(14):
            mid = 0.5 * (lo_y + hi_y)
            if rays.on_eye(x, mid):
                hi_y = mid
            else:
                lo_y = mid
        bot[i, 1] = lo_y - margin
    return bot


def build_margin(rays, edge_mm, thick_mm=None):
    """Tightline: from a lid-edge line (liner lower edge, or the lower line), a thin strip wraps round the lid
    margin over the skin, step by step toward the eyeball, until it touches the eyeball.  From the front it
    lies behind the lid edge, so the front view does not change; from the 3/4 and side views it covers the lid
    margin, so the white is framed in black like the reference (instead of a skin band or a gap)."""
    skin, eye = rays.skin_tree, rays.eye_tree
    rows = [M.to_world(np.asarray(edge_mm) / 1000)]
    step = MARGIN_STEP_MM / 1000
    done = np.zeros(len(edge_mm), bool)
    for _ in range(MARGIN_STEPS):
        nxt = []
        for k, p in enumerate(rows[-1]):
            if done[k]:
                nxt.append(p)
                continue
            e = np.array(eye.find_nearest(Vector(p))[0])
            h = skin.find_nearest(Vector(p))
            nrm = np.array(h[1])
            d = e - p
            d = d - nrm * np.dot(d, nrm)
            d /= max(np.linalg.norm(d), 1e-9)
            h = skin.find_nearest(Vector(p + d * step))
            q = np.array(h[0]) + np.array(h[1]) * MARGIN_LIFT_MM / 1000
            if eye.find_nearest(Vector(q))[3] < MARGIN_STOP_MM / 1000:
                done[k] = True
            nxt.append(q)
        rows.append(np.array(nxt))
    grid = np.stack(rows, 1)
    n, m = grid.shape[:2]
    verts = M.to_local(grid.reshape(-1, 3)) * 1000
    faces = [(i * m + j, (i + 1) * m + j, (i + 1) * m + j + 1, i * m + j + 1) for i in range(n - 1) for j in range(m - 1)]
    print('MARGIN', n, 'columns,', int(done.sum()), 'reach the eyeball')
    return er.solid_sheet(verts, faces, thick_mm or LINER_THICK_MM * 0.6)


def inside(poly, pts):
    """Even-odd test of points against a polygon (pixel coordinates)."""
    x, y = pts[:, 0], pts[:, 1]
    res = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        res ^= ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        j = i
    return res


def build_side_corner(design, tree, views, side, black):
    """The outer eye corner seen from the side: the reference fills the triangle from the wing down to the
    white's outer corner with black.  That skin (the outer corner fold) faces sideways, so it hardly shows from
    the front.  The reference's black outline in the side and 3/4 views is cast onto the skin with those
    cameras and covered with a thin black sheet (eyeball hits skipped).  Right eye, local mm."""
    verts, faces = [], []
    cam = bpy.data.objects['FACE_FIT_CAM_front']
    front_dir = np.array(cam.matrix_world.to_3x3() @ Vector((0, 0, -1)))
    front_pos = np.array(cam.matrix_world.translation)
    fi = np.load(er.ROOT / 'analysis/lash_rebuild/fit/front_ink.npz')
    ink, ink_o, ink_k = fi['mask'], fi['origin'], float(fi['scale'])

    def front_black(p, use_ref=True):
        """Seen from the front, this pixel already shows the liner / lower line (black), or (use_ref) lies inside
        the solid liner black of the front reference (its thin lower-lash strokes are not included)."""
        fx, fy = er.camera_pixels('front', p[None])
        c = int(round((fx[0] - ink_o[0]) * ink_k))
        r = int(round((fy[0] - ink_o[1]) * ink_k))
        if use_ref and 0 <= r < ink.shape[0] and 0 <= c < ink.shape[1] and ink[r, c]:
            return True
        fd = p - front_pos
        fd /= np.linalg.norm(fd)
        h_skin = tree.ray_cast(Vector(front_pos), Vector(fd), 50)
        h_ink = black.ray_cast(Vector(front_pos), Vector(fd), 50)
        return h_ink[0] is not None and (h_skin[0] is None or h_ink[3] < h_skin[3] + 0.0003)

    def front_hidden(p):
        fd = p - front_pos
        fl = np.linalg.norm(fd)
        fh = tree.ray_cast(Vector(front_pos), Vector(fd / fl), fl + 0.01)
        return fh[0] is not None and fh[3] < fl - 0.0003
    for view, poly in design.get('side_corner', {}).items():
        if view not in views:
            continue
        poly = np.array(poly)
        mat, w, h = er.camera_matrix(view)
        inv = np.linalg.inv(mat)
        us = np.arange(poly[:, 0].min(), poly[:, 0].max() + 0.01, SIDE_STEP_PX)
        vs = np.arange(poly[:, 1].min() - SIDE_FILL_UP_PX, poly[:, 1].max() + 0.01, SIDE_STEP_PX)
        grid = np.full((len(vs), len(us), 3), np.nan)

        def view_ray(u, v):
            nd = [np.array([2 * u / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
            a, b = [q[:3] / q[3] for q in nd]
            return a, (b - a) / np.linalg.norm(b - a)

        def liner_above(u, v):
            """This view already shows the liner a little above (u, v): the pixel lies under the liner."""
            for k in np.arange(0.5, SIDE_FILL_UP_PX + 1e-6, 0.5):
                a, d = view_ray(u, v - k)
                hs = tree.ray_cast(Vector(a), Vector(d), 50)
                hb = black.ray_cast(Vector(a), Vector(d), 50)
                if hb[0] is not None and (hs[0] is None or hb[3] < hs[3] + 0.0003):
                    return True
            return False

        # where the reference is hidden by its hair, the reference outline stops at the hair: the band between
        # the model's liner and that outline is filled too (never above the liner)
        below = np.zeros((len(vs), len(us)), bool)
        inside_grid = np.array([inside(poly, np.c_[us, np.full(len(us), v)]) for v in vs])
        for i in range(len(us)):
            col = np.nonzero(inside_grid[:, i])[0]
            if len(col):
                below[:col[0], i] = True
                below[:max(col[0] - int(SIDE_FILL_UP_PX / SIDE_STEP_PX), 0), i] = False
        def dark(u, v):
            """This view shows black (liner / lower line / corner cover) or the eyeball at (u, v)."""
            a, d = view_ray(u, v)
            hs = tree.ray_cast(Vector(a), Vector(d), 50)
            if hs[0] is not None and hs[2] in EYE_POLYS:
                return True
            hb = black.ray_cast(Vector(a), Vector(d), 50)
            return hb[0] is not None and (hs[0] is None or hb[3] < hs[3] + 0.0003)

        def enclosed(u, v):
            """A small skin notch: black or the eyeball within SIDE_NOTCH_PX in at least three directions."""
            steps = np.arange(0.5, SIDE_NOTCH_PX + 1e-6, 0.5)
            hits = sum(any(dark(u + du * k, v + dv * k) for k in steps)
                       for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            return hits >= 3

        near = np.zeros_like(inside_grid)
        r = int(SIDE_NOTCH_PX / SIDE_STEP_PX)
        for j, i in zip(*np.nonzero(inside_grid)):
            near[max(j - r, 0):j + r + 1, max(i - r, 0):i + r + 1] = True
        near &= ~inside_grid
        fill = np.zeros_like(inside_grid)
        for j, v in enumerate(vs):
            for i in range(len(us)):
                if inside_grid[j, i]:
                    fill[j, i] = True
                elif below[j, i] and liner_above(us[i], v):
                    fill[j, i] = True
                elif near[j, i] and not dark(us[i], v) and enclosed(us[i], v):
                    # a notch may be a single sample wide: take its neighbours too so the sheet has faces
                    fill[max(j - 1, 0):j + 2, max(i - 1, 0):i + 2] = True
        for j, v in enumerate(vs):
            ok = fill[j]
            for i in np.nonzero(ok)[0]:
                a, d = view_ray(us[i], v)
                hit = tree.ray_cast(Vector(a), Vector(d), 50)
                if hit[0] is None or hit[2] in EYE_POLYS:
                    continue
                # the front view is final: a point seen from the front must fall on black there; otherwise the
                # black stands off the skin toward this view's camera until it does or is hidden (a 3D part)
                hp = np.array(hit[0]) + np.array(hit[1]) * SIDE_LIFT_MM / 1000
                # extra fills (under the liner, notches) use the front reference only near the outer corner;
                # further in, the liner stands off the skin and they would peek over its top edge in front
                ref = bool(inside_grid[j, i]) or abs(M.to_local(hp[None])[0, 0] * 1000) > SIDE_REF_OUTER_MM
                if not (front_hidden(hp) or front_black(hp, ref)):
                    for t in np.arange(0.25, SIDE_STANDOFF_MM + 1e-6, 0.25):
                        q = hp - d * t / 1000
                        if front_black(q, ref) or front_hidden(q):
                            grid[j, i] = q
                            break
                    continue
                grid[j, i] = hp
        base = len(verts)
        idx = -np.ones(grid.shape[:2], int)
        for (j, i) in zip(*np.nonzero(~np.isnan(grid[..., 0]))):
            idx[j, i] = len(verts)
            verts.append(grid[j, i])
        for j in range(len(vs) - 1):
            for i in range(len(us) - 1):
                q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]
                q = [k for k in q if k >= 0]
                if len(q) < 3:
                    continue
                pts = np.array([verts[k] for k in q])
                if np.linalg.norm(pts - np.roll(pts, 1, 0), axis=1).max() > SIDE_MAX_EDGE_MM / 1000:
                    continue
                faces.append(tuple(q))
        print('SIDE_CORNER', view, len(verts) - base, 'verts')
    verts = M.to_local(np.array(verts)) * 1000
    used = sorted({k for f in faces for k in f})
    remap = {k: i for i, k in enumerate(used)}
    verts = verts[used]
    faces = [tuple(remap[k] for k in f) for f in faces]
    tot = sum(np.cross(verts[f[1]] - verts[f[0]], verts[f[2]] - verts[f[0]]) for f in faces)
    if tot[0] * side > 0:      # face away from the head (the right eye's outside is -x)
        faces = [f[::-1] for f in faces]
    return verts, faces


def build_corner_cover(rays, design):
    """The model's white reaches 3-4 px further out at the outer corner than the reference's; the reference
    closes that corner with black.  Every eyeball pixel near the outer corner that lies outside the reference
    white (front view) gets a thin black sheet just in front of the eyeball.  Built with this side's rays."""
    cc = design['corner_cover']
    wl = np.array(cc['white_left'])
    x0, y0, x1, y1 = cc['box']
    us = np.arange(x0, x1 + 1e-6, COVER_STEP_PX)
    vs = np.arange(y0, y1 + 1e-6, COVER_STEP_PX)
    grid = np.full((len(vs), len(us), 3), np.nan)
    for j, v in enumerate(vs):
        inside_rows = wl[0, 0] <= v <= wl[-1, 0]
        xl = np.interp(v, wl[:, 0], wl[:, 1])
        for i, u in enumerate(us):
            if inside_rows and u >= xl - COVER_OVERLAP_PX:
                continue
            if u > cc['x_max'] or not rays.on_eye(u, v):
                continue
            p, d, t = rays.cast(u, v)
            grid[j, i] = p - d * COVER_LIFT_MM / 1000
    # grow one cell so the sheet reaches under the lid edges
    valid = ~np.isnan(grid[..., 0])
    verts, faces, idx = [], [], -np.ones(valid.shape, int)
    for (j, i) in zip(*np.nonzero(valid)):
        idx[j, i] = len(verts)
        verts.append(grid[j, i])
    for j in range(len(vs) - 1):
        for i in range(len(us) - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]
            if min(q) >= 0:
                faces.append(tuple(q))
            elif sum(k >= 0 for k in q) == 3:
                faces.append(tuple(k for k in q if k >= 0))
    print('CORNER_COVER', len(verts), 'verts', len(faces), 'faces')
    if not faces:
        return np.zeros((0, 3)), []
    verts = M.to_local(np.array(verts)) * 1000
    tot = sum(np.cross(verts[f[1]] - verts[f[0]], verts[f[2]] - verts[f[0]]) for f in faces)
    if tot[2] < 0:
        faces = [f[::-1] for f in faces]
    return er.solid_sheet(verts, faces, 0.05)


def build_liner(rays, design, bot, join):
    """Lofted ribbon between the reference top and bottom chains, lifted onto the skin with front rays."""
    top = np.array(design['liner_top'])
    bot = off_eye(rays, top, bot)
    k = np.ones(9) / 9
    sm = lambda c: np.c_[[np.convolve(np.pad(c[:, i], 4, mode='edge'), k, mode='valid') for i in (0, 1)]].T
    top = np.vstack([top[:1], sm(top)[1:-1], top[-1:]])
    n, rows = len(top), LINER_ROWS
    f = np.linspace(0, 1, rows)
    px = top[:, None, :] * (1 - f[None, :, None]) + bot[:, None, :] * f[None, :, None]
    cast = [[rays.ray(p) for p in col] for col in px]
    origin = np.array([[c[0] for c in col] for col in cast])
    direction = np.array([[c[1] for c in col] for col in cast])
    hit = np.array([[rays.near(*p) for p in col] for col in px])
    # the skin can bulge forward between samples: a few sub-pixel rays around each sample (skin, or the scalp
    # shell where it lies just over the skin) limit how deep the ribbon may lie, and a maximum gap keeps it from
    # floating off steep skin (a floating wing looks far too big in the 3/4 and side views).  The depth is
    # smoothed and pushed back between the two limits after every pass, so it stays clear without lumps.
    local = hit.copy()
    for i in range(n):
        for j in range(rows):
            u, v = px[i, j]
            local[i, j] = min(rays.near(u + du, v + dv) for du in (-0.5, 0.0, 0.5) for dv in (-0.5, 0.0, 0.5))
    limit = local - MIN_CLEAR_MM / 1000
    floor = np.minimum(hit - MAX_FLOAT_MM / 1000, limit)
    depth = np.minimum(hit - LINER_LIFT_MM / 1000, limit)
    for _ in range(SMOOTH_ITERS):
        p = np.pad(depth, 1, mode='edge')
        depth = 0.4 * depth + 0.15 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
        depth = np.clip(depth, floor, limit)
    print('LINER gap mm: median %.2f  max %.2f' % (np.median(hit - depth) * 1000, (hit - depth).max() * 1000))
    if 'float_top' in design:
        # the wing and the lash line stand off the face (3D, not a decal): the stand-off fitted to the 3/4 and side
        # views is added along the front ray, so the front view does not change
        ft = np.array(design['float_top'])
        fb = np.zeros(n)
        fb[:design['float_k1'] + 1] = design['float_wing']
        depth = depth - (ft[:, None] * (1 - f[None]) + fb[:, None] * f[None]) / 1000
    pts = (origin + direction * depth[..., None]).reshape(-1, 3)
    verts = M.to_local(pts) * 1000
    faces = []
    for i in range(n - 1):
        for j in range(rows - 1):
            a, b, c, d = i * rows + j, (i + 1) * rows + j, (i + 1) * rows + j + 1, i * rows + j + 1
            faces.append((a, b, c, d))
    tot = np.zeros(3)
    for fc in faces:
        q = verts[list(fc)]
        tot += np.cross(q[1] - q[0], q[2] - q[0])
    if tot[2] < 0:
        faces = [fc[::-1] for fc in faces]
    v, f = er.solid_sheet(verts, faces, LINER_THICK_MM)
    col = px[:, -1, 0] > design['corner']['c'][0] + 0.5
    mv, mf = build_margin(rays, verts.reshape(n, rows, 3)[col, -1])
    return np.r_[v, mv], list(f) + [tuple(i + len(v) for i in fc) for fc in mf]


def corner_contour(rays):
    """This side's eye-opening edge round the outer corner, in design pixels: the upper edge from under the liner
    (x = CORNER_UPPER_X) out to the corner, then the lower edge back to x = CORNER_LOWER_X."""
    xs = np.arange(CORNER_UPPER_X, 95.0, -0.25)
    ys = np.arange(108.0, 140.0, 0.1)
    up, low = [], []
    for x in xs:
        seen = np.array([rays.on_eye(x, y) for y in ys])
        if not seen.any():
            break
        k = np.nonzero(seen)[0]
        up.append((x, ys[k[0]] - RIM_ABOVE_PX))
        low.append((x, ys[k[-1]] + RIM_BELOW_PX))
    up, low = np.array(up), np.array(low)
    tip = np.array([up[-1, 0] - 0.4, 0.5 * (up[-1, 1] + low[-1, 1])])
    low = low[low[:, 0] <= CORNER_LOWER_X]
    path = np.vstack([up, tip, low[::-1]])
    k = np.ones(5) / 5
    sm = np.c_[[np.convolve(np.pad(path[:, i], 2, mode='edge'), k, mode='valid') for i in (0, 1)]].T
    sm[0], sm[-1] = path[0], path[-1]
    return sm, len(up)


def build_rim(rays, design):
    """One black line round the outer corner of the eye, resting on the lid edge: from under the liner it
    follows this side's eye-opening edge round the corner and along the lower lid to the inner end, so seen
    from the 3/4 and side views the white's outer end is framed like the reference."""
    corner, n_up = corner_contour(rays)
    lid = rim_pixels()
    lid = lid[lid[:, 0] > CORNER_LOWER_X + 0.3].copy()
    for i, (u, v) in enumerate(lid):
        ys = np.arange(v - 3.0, v + 3.01, 0.1)
        seen = [rays.on_eye(u, y) for y in ys]
        if any(seen):
            lid[i, 1] = ys[max(k for k, e in enumerate(seen) if e)] + RIM_BELOW_PX
    px = np.vstack([corner, lid])
    cast = [rays.ray(p) for p in px]
    origin = np.array([c[0] for c in cast])
    direction = np.array([c[1] for c in cast])
    hit = np.array([c[2] for c in cast])
    depth = er.smooth_rows(hit, 2.0)
    r0 = design.get('rim_r_mm', 0.36)
    # upper part: grows from a hair under the liner to full width at the corner; then the lower lid taper
    t_up = np.linspace(0, 1, n_up + 1) ** 0.6
    s = np.linspace(0, 1, len(px) - n_up - 1)
    low = r0 * (1 - s) ** design.get('rim_taper', 1.2) + design.get('rim_end_mm', 0.07)
    low *= np.clip((1 - s) / 0.10, 0.25, 1.0)
    r = np.r_[np.maximum(r0 * t_up, 0.08), low]
    depth = np.minimum(depth - (0.15 + 0.5 * r) / 1000, hit - 0.10 / 1000)
    pts = M.to_local(origin + direction * depth[:, None]) * 1000
    tv, tf = er.tube(pts, r, sides=8)
    skin_pts = M.to_local(origin + direction * (hit - MARGIN_LIFT_MM / 1000)[:, None]) * 1000
    mv, mf = build_margin(rays, skin_pts)
    return (np.r_[tv, mv], list(tf) + [tuple(i + len(tv) for i in fc) for fc in mf]), px


def top_float(design, x):
    """Stand-off (mm) of the liner top edge at front-view column x (0 when the design has none)."""
    if 'float_top' not in design:
        return 0.0 * np.asarray(x, float)
    top = np.array(design['liner_top'])
    order = np.argsort(top[:, 0])
    return np.interp(x, top[order, 0], np.array(design['float_top'])[order])


def lash_points(rays, design, spec, standoff=None):
    """Upper lash centre line.  The root sits on the (standing-off) liner top edge.  When the design gives the
    tip in 3D (triangulated from the front, 3/4 and side references), the lash runs to it with a slight upward
    curl: lashes stand off the face.  Otherwise the front-view path is used, its stand-off growing to the tip."""
    n = 14
    t = np.linspace(0, 1, n)
    if 'tip3d_mm' in spec:
        root = rays.lifted(spec['root'], LASH_ROOT_LIFT_MM + float(top_float(design, spec['root'][0])))
        tip = np.array(spec['tip3d_mm'], float)
        ctrl = 0.5 * (root + tip) + np.array([0.0, 0.12 * np.linalg.norm(tip - root), 0.0])
        pts = (1 - t)[:, None] ** 2 * root + 2 * ((1 - t) * t)[:, None] * ctrl + t[:, None] ** 2 * tip
        return pts, t
    path_px = bezier(spec['root'], spec['mid'], spec['tip'], n)
    lift = LASH_ROOT_LIFT_MM + (spec['lift_mm'] - LASH_ROOT_LIFT_MM) * t ** 1.5
    s = spec.get('standoff_mm', 0.0) if standoff is None else standoff
    lift = lift + top_float(design, path_px[:, 0]) + s * t ** 1.5
    return np.array([rays.lifted(p, l) for p, l in zip(path_px, lift)]), t


def build_lash(rays, design, spec):
    pts, t = lash_points(rays, design, spec)
    radius = np.maximum(UPPER_R_SCALE * spec['r_mm'] * (1 - t) ** 0.6, 0.04)
    return er.tube(pts, radius, sides=6)


def build_lower(rays, design):
    """Short thick lower lashes at the reference dots (outer lower lid, the first ones on the skin under the
    wedge).  Each points away from the eye, leaning to the outer corner, and its tip stands off the lid (3D)."""
    eye = np.array(design['corner']['eye_centre'])
    verts, faces = [], []
    for st in design['lower']:
        c = np.array(st['centre'])
        out = (c - eye) / np.linalg.norm(c - eye)
        tng = np.array([out[1], -out[0]])
        if tng[0] > 0:
            tng = -tng
        d = out * np.cos(LOWER_LEAN) + tng * np.sin(LOWER_LEAN)
        length = LOWER_LEN_MM / MM_PER_PX
        root, tip = c - d * length * 0.45, c + d * length * 0.55
        n = 8
        t = np.linspace(0, 1, n)
        radius = np.maximum(LOWER_ROOT_MM * (1 - t) ** 0.6, 0.05)
        # fixed 3D length: the front-view direction gives the way, the lash does not follow steep skin
        r3 = rays.lifted(root, LOWER_LIFT_MM + radius[0])
        way = rays.lifted(tip, LOWER_LIFT_MM + radius[0]) - r3
        way = way / np.linalg.norm(way) * LOWER_LEN_MM
        p0, d0, _ = rays.cast(*root)
        toward_cam = M.to_local(np.array([p0 - d0 * 0.01]))[0] - M.to_local(np.array([p0]))[0]
        toward_cam /= np.linalg.norm(toward_cam)
        s = design.get('lower_standoff_mm', 0.0) * t ** 1.2
        pts = r3[None] + t[:, None] * way[None] + s[:, None] * toward_cam[None]
        v, f = er.tube(pts, radius, sides=6)
        faces += [tuple(i + len(verts) for i in fc) for fc in f]
        verts += list(v)
    return np.array(verts), faces


def set_side(objs, liner, rim, lashes, lower, mat, brown):
    obj = bpy.data.objects[objs['rim']]
    er.back_up(obj)
    er.set_mesh(obj, *rim, mat, '_lr_rim')
    er.back_up(bpy.data.objects[objs['liner']])
    er.set_mesh(bpy.data.objects[objs['liner']], *liner, mat, '_lr_liner')
    for k, name in enumerate(objs['lashes']):
        obj = bpy.data.objects[name]
        er.back_up(obj)
        if k < len(lashes):
            er.set_mesh(obj, *lashes[k], mat, '_lr_lash')
        elif k == len(lashes) and lower is not None:
            er.set_mesh(obj, *lower, brown, '_lr_lower')
        else:
            er.replace_mesh(obj, np.zeros((0, 3)), [], '_lr_cleared')


def brown_material():
    mat = bpy.data.materials.get('INKWAVE_lash_brown') or bpy.data.materials.new('INKWAVE_lash_brown')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.045, 0.014, 0.016, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    return mat


def open_inner_corner(face, ic):
    """Show as much white at the inner corner as the reference: the lid skin round the inner corner slides
    toward the nose (Blender's Warp modifier, one per eye, weighted by a smooth pixel falloff).  The eyeball
    reaches further in under the skin, so the white follows the new lid edge."""
    mm = ic.get('open_mm', 0.0)
    if not mm:
        return
    loc = M.to_local(er.world(face)) * 1000
    mir = loc.copy()
    mir[:, 0] = -np.abs(mir[:, 0])
    ux, uy = er.camera_pixels('front', M.to_world(mir / 1000))
    c = np.array(ic['open_centre'])
    d = np.hypot((ux - c[0]) / ic['open_rx'], (uy - c[1]) / ic['open_ry'])
    wgt = np.clip(1 - d, 0, 1)
    wgt = wgt * wgt * (3 - 2 * wgt)
    origin = M.to_world(np.zeros((1, 3)))[0]
    for side in (-1, 1):
        w = wgt * (np.sign(loc[:, 0]) == side)
        step = M.to_world(np.array([[-side * mm / 1000, -ic.get('open_down_mm', 0.0) / 1000, 0.0]]))[0] - origin
        a = bpy.data.objects.new('INKWAVE_open_from', None)
        b = bpy.data.objects.new('INKWAVE_open_to', None)
        for e in (a, b):
            bpy.context.scene.collection.objects.link(e)
        b.location = Vector(step)
        bpy.context.view_layer.update()
        before = er.world(face)
        er.apply_weighted_modifier(face, w, 'WARP', object_from=a, object_to=b, falloff_type='NONE',
                                   use_volume_preserve=False)
        print('INNER_OPEN side', side, 'vertices', int((w > 0).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(face) - before, axis=1).max() * 1000), 3))
        for e in (a, b):
            bpy.data.objects.remove(e)


def smooth_inner_corner(design):
    """Inner eye corner: the lid edge of HEAD_face there is stepped (a jagged white edge).  Blender's Smooth
    modifier on a weighted vertex group round the inner corner (both eyes, lid skin near the eyeball only);
    the skin layers follow with Surface Deform bound before the smoothing."""
    ic = design['inner_corner']
    face = bpy.data.objects['HEAD_face']
    layers = [bpy.data.objects[n] for n in list(er.FACE_LAYER_NAMES) + CANTHUS_FOLLOWERS]
    for obj in [face] + layers:
        er.back_up(obj)
    binds = []
    for obj in layers:
        mod = obj.modifiers.new('INKWAVE_inner_follow', 'SURFACE_DEFORM')
        mod.target = face
        while obj.modifiers[0] != mod:
            er.with_object(obj, lambda: bpy.ops.object.modifier_move_up(modifier=mod.name))
        er.with_object(obj, lambda: bpy.ops.object.surfacedeform_bind(modifier=mod.name))
        if not mod.is_bound:
            raise RuntimeError(f'Surface Deform could not bind {obj.name} to the face')
        binds.append((obj, mod))
    open_inner_corner(face, ic)
    eye = mesh_tree(sorted(EYEBALLS))
    w_pts = er.world(face)
    loc = M.to_local(w_pts)
    loc[:, 0] = -np.abs(loc[:, 0])                      # both eyes measured in the right eye's front pixels
    ux, uy = er.camera_pixels('front', M.to_world(loc))
    d = np.hypot(ux - ic['centre'][0], uy - ic['centre'][1])
    f = np.clip((ic['radius_px'] - d) / (ic['radius_px'] - ic['full_px']), 0, 1)
    near = np.array([eye.find_nearest(Vector(p))[3] for p in w_pts]) * 1000
    f *= np.clip((ic['eye_mm'] - near) / 1.0, 0, 1)
    f = f * f * (3 - 2 * f)
    before = er.world(face)
    er.apply_weighted_modifier(face, f, 'SMOOTH', factor=ic['factor'], iterations=ic['iters'])
    print('INNER_CORNER face vertices', int((f > 0).sum()), 'max move mm',
          round(float(np.linalg.norm(er.world(face) - before, axis=1).max() * 1000), 3))
    cs = ic.get('canthus_smooth')
    if cs:
        # the pull toward the nose presses the skin between the inner corner and the nose together (lumps and
        # wrinkles, worse than the source).  Smooth that whole slope; the lid edge (within eye_min_mm of the
        # eyeball) stays, so the white keeps its shape
        w_pts = er.world(face)
        loc = M.to_local(w_pts)
        loc[:, 0] = -np.abs(loc[:, 0])
        ux, uy = er.camera_pixels('front', M.to_world(loc))
        d = np.hypot((ux - cs['centre'][0]) / cs['rx_px'], (uy - cs['centre'][1]) / cs['ry_px'])
        g = np.clip((1 - d) / (1 - cs['full']), 0, 1)
        g = g * g * (3 - 2 * g)
        if cs.get('pin_rings') is not None:
            # keep only the eye-opening edge (and pin_rings rings round it) in place, so the white keeps its
            # shape and the skin right next to the corner is smoothed too
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(face.data)
            bm.verts.ensure_lookup_table()
            near_b = np.array([eye.find_nearest(Vector(p))[3] for p in w_pts]) * 1000
            pinned = {v.index for v in bm.verts if v.is_boundary and near_b[v.index] < cs.get('pin_eye_mm', 1e9)}
            front = set(pinned)
            for _ in range(cs['pin_rings']):
                front = {e.other_vert(bm.verts[i]).index for i in front for e in bm.verts[i].link_edges} - pinned
                pinned |= front
            bm.free()
            g[list(pinned)] = 0
        else:
            near = np.array([eye.find_nearest(Vector(p))[3] for p in w_pts]) * 1000
            g *= np.clip((near - cs['eye_min_mm']) / (cs['eye_full_mm'] - cs['eye_min_mm']), 0, 1)
        before = er.world(face)
        er.apply_weighted_modifier(face, g, 'SMOOTH', factor=cs['factor'], iterations=cs['iters'])
        print('CANTHUS face vertices', int((g > 0).sum()), 'max move mm',
              round(float(np.linalg.norm(er.world(face) - before, axis=1).max() * 1000), 3))
    for obj, mod in binds:
        er.apply_modifier(obj, mod)


def remove_lower_paint():
    """The lower line is a real part now: give the face its plain skin material back (geometry unchanged)."""
    face = bpy.data.objects['HEAD_face']
    skin = bpy.data.materials['skin_b27050']
    for i, slot in enumerate(face.data.materials):
        if slot is not None and slot.name == er.FACE_PAINT_MATERIAL:
            face.data.materials[i] = skin


LR_SUFFIX = '__pre_lash_rebuild'
CANTHUS_FOLLOWERS = ['HEAD_eyes_12', 'HEAD_eyes_29']


def touched_names():
    names = ['HEAD_face'] + list(er.FACE_LAYER_NAMES) + CANTHUS_FOLLOWERS
    for objs in (R, L):
        names += [objs['rim'], objs['liner']] + objs['lashes']
    return names


def lr_restore(drop=False):
    """Bring back every mesh this script changes, as it was before the first run (so runs never stack)."""
    count = 0
    for name in touched_names():
        backup = bpy.data.meshes.get(name + LR_SUFFIX)
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
    if drop:
        mat = bpy.data.materials.get('INKWAVE_lash_brown')
        if mat is not None and mat.users == 0:
            bpy.data.materials.remove(mat)
    return count


def lr_back_up():
    for name in touched_names():
        if bpy.data.meshes.get(name + LR_SUFFIX) is None:
            backup = bpy.data.objects[name].data.copy()
            backup.name = name + LR_SUFFIX
            backup.use_fake_user = True


def decimate(obj):
    """The liner is a fine grid (the corner sheets are sampled at 0.2 px): Blender's Decimate (collapse) keeps
    its outline and cuts the triangles for the game."""
    before = len(obj.data.polygons)
    mod = obj.modifiers.new('INKWAVE_liner_decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = LINER_DECIMATE
    mod.use_collapse_triangulate = True
    er.apply_modifier(obj, mod)
    print('DECIMATE', obj.name, before, '->', len(obj.data.polygons), 'faces')


def save_and_export(args):
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save, compress=True)
    if args.export:
        import shutil
        import inkwave_face_refine as fr
        fr.export_character(args.export)
        if args.game:
            shutil.copyfile(args.export, args.game)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--save')
    ap.add_argument('--design', default=str(DESIGN))
    ap.add_argument('--shape-only', action='store_true', help='liner, wing and lower line only: no upper lashes, no lower strokes')
    ap.add_argument('--restore', action='store_true', help='undo this script (drops its backups) and stop')
    ap.add_argument('--export')
    ap.add_argument('--game')
    args = ap.parse_args(argv)
    restored = lr_restore(drop=args.restore)
    print('LASH_REBUILD restored', restored, 'meshes')
    if args.restore:
        save_and_export(args)
        return
    lr_back_up()
    design = json.loads(Path(args.design).read_text())
    if 'inner_corner' in design:
        smooth_inner_corner(design)
    tree, shell = surface_tree(), shell_tree()
    mat = er.lash_material()
    mat.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.0
    brown = brown_material()
    left = json.loads(json.dumps(design))
    for spec in left['lashes']:
        if 'tip3d_mm' in spec:
            spec['tip3d_mm'][0] = -spec['tip3d_mm'][0]
    left['rim_r_mm'] = design.get('rim_r_mm_left', design.get('rim_r_mm'))
    join = corner_join(rim_pixels())
    bot = corner_bottom(np.array(design['liner_bottom']), join, design)
    right_rays = FrontRays(tree, shell)
    built = []
    for objs, rays, d in ((R, right_rays, design), (L, MirrorRays(tree, shell), left)):
        liner = build_liner(rays, d, bot, join)
        cv, cf = build_corner_cover(rays, d)
        liner = (np.r_[liner[0], cv], list(liner[1]) + [tuple(i + len(liner[0]) for i in fc) for fc in cf])
        rim, _ = build_rim(rays, d)
        lashes = [] if args.shape_only else [build_lash(rays, d, spec) for spec in d['lashes']]
        lower = None if args.shape_only else build_lower(rays, d)
        built.append([objs, liner, rim, lashes, lower])
    verts, polys = [], []
    for _, liner, rim, _, _ in built:
        for v, f in (liner, rim):
            polys += [[i + sum(len(x) for x in verts) for i in fc] for fc in f]
            verts.append(M.to_world(np.asarray(v) / 1000))
    black = BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)
    for part, views, side in zip(built, (('sideR', 'q34R'), ('q34L', 'sideL')), (-1, 1)):
        sv, sf = er.solid_sheet(*build_side_corner(design, tree, views, side, black), LINER_THICK_MM * 0.6)
        v, f = part[1]
        part[1] = (np.r_[v, sv], list(f) + [tuple(i + len(v) for i in fc) for fc in sf])
    for objs, liner, rim, lashes, lower in built:
        set_side(objs, liner, rim, lashes, lower, mat, brown)
    remove_lower_paint()
    for objs in (R, L):
        decimate(bpy.data.objects[objs['liner']])
    save_and_export(args)
    print('LASH_REBUILD done', len(liner[0]), 'liner verts,', len(rim[0]), 'rim verts,', len(lashes), 'lashes')


if __name__ == '__main__':
    main()
