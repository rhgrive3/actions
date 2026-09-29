"""Rebuild the upper liner / wing / upper lashes / lower lashes from the reference (CANDIDATE only).

The eyeball aperture is not touched.  The design (analysis/lash_rebuild/design.json) is measured on the
reference front view of the right eye (image-left); it is lifted onto the skin with front-camera rays and
mirrored to the left eye.  Run on a copy of the master:

  blender -b <in.blend> --python scripts/inkwave_lash_rebuild.py -- --save <out.blend>
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
SIDE_STEP_PX = 0.2
SIDE_LIFT_MM = 0.45
SIDE_MAX_EDGE_MM = 1.2
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


def build_side_corner(design, tree, skin):
    """The outer eye corner seen from the side: the reference fills the triangle from the wing down to the
    white's outer corner with black.  That skin (the outer corner fold) faces sideways, so it hardly shows from
    the front.  The reference's black outline in the side and 3/4 views is cast onto the skin with those
    cameras and covered with a thin black sheet (eyeball hits skipped).  Right eye, local mm."""
    verts, faces = [], []
    cam = bpy.data.objects['FACE_FIT_CAM_front']
    front_dir = np.array(cam.matrix_world.to_3x3() @ Vector((0, 0, -1)))
    for view, poly in design.get('side_corner', {}).items():
        poly = np.array(poly)
        mat, w, h = er.camera_matrix(view)
        inv = np.linalg.inv(mat)
        us = np.arange(poly[:, 0].min(), poly[:, 0].max() + 0.01, SIDE_STEP_PX)
        vs = np.arange(poly[:, 1].min(), poly[:, 1].max() + 0.01, SIDE_STEP_PX)
        grid = np.full((len(vs), len(us), 3), np.nan)
        for j, v in enumerate(vs):
            ok = inside(poly, np.c_[us, np.full(len(us), v)])
            for i in np.nonzero(ok)[0]:
                nd = [np.array([2 * us[i] / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
                a, b = [q[:3] / q[3] for q in nd]
                d = (b - a) / np.linalg.norm(b - a)
                hit = tree.ray_cast(Vector(a), Vector(d), 50)
                if hit[0] is None or hit[2] in EYE_POLYS:
                    continue
                # only skin that faces sideways: it hardly shows from the front
                if abs(np.dot(np.array(hit[1]), front_dir)) > SIDE_MAX_FRONT_COS:
                    continue
                grid[j, i] = np.array(hit[0]) + np.array(hit[1]) * SIDE_LIFT_MM / 1000
        base = len(verts)
        idx = -np.ones(grid.shape[:2], int)
        for (j, i) in zip(*np.nonzero(~np.isnan(grid[..., 0]))):
            idx[j, i] = len(verts)
            verts.append(grid[j, i])
        for j in range(len(vs) - 1):
            for i in range(len(us) - 1):
                q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]
                if min(q) < 0:
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
    if tot[0] > 0:            # face away from the head (the right eye's outside is -x)
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


def to_left(verts_mm, skin):
    """Mirror right-eye corner geometry to the left eye and put it back on the left skin (the face is not
    exactly symmetric)."""
    out = np.array(verts_mm, float).copy()
    out[:, 0] *= -1
    world = M.to_world(out / 1000)
    for i, p in enumerate(world):
        h = skin.find_nearest(Vector(p))
        world[i] = np.array(h[0]) + np.array(h[1]) * SIDE_LIFT_MM / 1000
    return M.to_local(world) * 1000


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


def remove_lower_paint():
    """The lower line is a real part now: give the face its plain skin material back (geometry unchanged)."""
    face = bpy.data.objects['HEAD_face']
    skin = bpy.data.materials['skin_b27050']
    for i, slot in enumerate(face.data.materials):
        if slot is not None and slot.name == er.FACE_PAINT_MATERIAL:
            face.data.materials[i] = skin


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--save')
    ap.add_argument('--design', default=str(DESIGN))
    ap.add_argument('--shape-only', action='store_true', help='liner, wing and lower line only: no upper lashes, no lower strokes')
    args = ap.parse_args(argv)
    design = json.loads(Path(args.design).read_text())
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
    side_r = build_side_corner(design, tree, right_rays.skin_tree)
    side_l = (to_left(side_r[0], right_rays.skin_tree), [f[::-1] for f in side_r[1]])
    for objs, rays, d, side in ((R, right_rays, design, side_r), (L, MirrorRays(tree, shell), left, side_l)):
        liner = build_liner(rays, d, bot, join)
        for sv, sf in (er.solid_sheet(*side, LINER_THICK_MM * 0.6), build_corner_cover(rays, d)):
            liner = (np.r_[liner[0], sv], list(liner[1]) + [tuple(i + len(liner[0]) for i in fc) for fc in sf])
        rim, _ = build_rim(rays, d)
        lashes = [] if args.shape_only else [build_lash(rays, d, spec) for spec in d['lashes']]
        lower = None if args.shape_only else build_lower(rays, d)
        set_side(objs, liner, rim, lashes, lower, mat, brown)
    remove_lower_paint()
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save)
    print('LASH_REBUILD done', len(liner[0]), 'liner verts,', len(rim[0]), 'rim verts,', len(lashes), 'lashes')


if __name__ == '__main__':
    main()
