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
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inkwave_eye_refine as er  # noqa: E402

M = er.M
DESIGN = er.ROOT / 'analysis/lash_rebuild/design_3d.json'
SURFACES = ['HEAD_face', 'HEAD_skin', 'HEAD_skin_04', 'HEAD_eyes', 'HEAD_eyes_18', 'HEAD_eyes_02', 'HEAD_eyes_19']
R = {'rim': 'HEAD_eyes_30', 'liner': 'HEAD_eyes_20', 'lashes': [f'HEAD_eyes_{i:02d}' for i in range(22, 29)], 'eyeball': 'HEAD_eyes_18'}
L = {'rim': 'HEAD_eyes_13', 'liner': 'HEAD_eyes_03', 'lashes': [f'HEAD_eyes_{i:02d}' for i in range(5, 12)], 'eyeball': 'HEAD_eyes'}
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

    def to_px(self, world):
        """Front-view design pixels of world points (the inverse of cast)."""
        ux, uy = er.camera_pixels('front', np.asarray(world))
        return np.c_[ux, uy]

    def ray(self, uv):
        """World origin and direction of the camera ray through a front-view pixel, and the hit distance."""
        p, d, t = self.cast(*uv)
        return p - d * t, d, t


class MirrorRays(FrontRays):
    """Rays for the left eye, addressed in right-eye design pixels: a design pixel is mapped to the pixel of the
    mirror image of its right-side surface point, so every part is built on the left eye's own skin and eyeball
    (the face is not exactly symmetric; mirroring finished geometry left skin gaps and skin poking through)."""

    def to_px(self, world):
        q = M.to_local(np.asarray(world))
        q[:, 0] = -q[:, 0]
        return FrontRays.to_px(self, M.to_world(q))

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


def build_margin(rays, edge_mm, thick_mm=None, stop=None):
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
            if stop is not None and stop[0][k]:
                # on the lower lid the strip stays behind the line in the front view (not above it)
                u, v = rays.to_px(q[None])[0]
                if v < np.interp(u, stop[1][:, 0], stop[1][:, 1]) + RIM_BELOW_PX:      # behind the line's centre
                    done[k] = True
                    q = p
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


def _disk_shifts(r):
    return [(dj, di) for dj in range(-r, r + 1) for di in range(-r, r + 1) if dj * dj + di * di <= r * r]


def _shift(m, dj, di, fill):
    out = np.full_like(m, fill)
    h, w = m.shape
    out[max(dj, 0):h + min(dj, 0), max(di, 0):w + min(di, 0)] = m[max(-dj, 0):h + min(-dj, 0), max(-di, 0):w + min(-di, 0)]
    return out


def mask_open(m, r):
    """Binary opening with a disk of radius r samples (erode, then dilate): parts thinner than 2r go."""
    if r <= 0:
        return m.copy()
    sh = _disk_shifts(r)
    ero = np.ones_like(m)
    for dj, di in sh:
        ero &= _shift(m, dj, di, False)
    dil = np.zeros_like(m)
    for dj, di in sh:
        dil |= _shift(ero, dj, di, False)
    return dil & m


def small_parts(m, min_count):
    """Samples of 4-connected islands with fewer than min_count samples."""
    out = np.zeros_like(m)
    if min_count <= 0:
        return out
    seen = np.zeros_like(m)
    h, w = m.shape
    for j0, i0 in zip(*np.nonzero(m)):
        if seen[j0, i0]:
            continue
        stack, part = [(j0, i0)], []
        seen[j0, i0] = True
        while stack:
            j, i = stack.pop()
            part.append((j, i))
            for jj, ii in ((j + 1, i), (j - 1, i), (j, i + 1), (j, i - 1)):
                if 0 <= jj < h and 0 <= ii < w and m[jj, ii] and not seen[jj, ii]:
                    seen[jj, ii] = True
                    stack.append((jj, ii))
        if len(part) < min_count:
            for j, i in part:
                out[j, i] = True
    return out


def sheet_ink(shape, origin, k, cfg):
    """The front reference's black, sampled straight from the sheet with bilinear filtering at k samples per
    design px (its anti-aliased edge gives a smooth outline), instead of the old dilated, bumpy ink mask:
    dark = max channel under cfg['dark'] (0..1)."""
    img = bpy.data.images.load(str(er.ROOT / 'docs/face-multiview-fit/refs/sheet_5view.png'), check_existing=True)
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(H, W, 4)[::-1, :, :3].max(-1)            # rows top -> bottom
    ys = origin[1] + (np.arange(shape[0]) + 0.5) / k + 230.0
    xs = origin[0] + (np.arange(shape[1]) + 0.5) / k + 60.0
    x0 = np.clip(np.floor(xs - 0.5).astype(int), 0, W - 2); fx = np.clip(xs - 0.5 - x0, 0, 1)
    y0 = np.clip(np.floor(ys - 0.5).astype(int), 0, H - 2); fy = np.clip(ys - 0.5 - y0, 0, 1)
    v = (a[y0][:, x0] * (1 - fx) + a[y0][:, x0 + 1] * fx) * (1 - fy)[:, None] + \
        (a[y0 + 1][:, x0] * (1 - fx) + a[y0 + 1][:, x0 + 1] * fx) * fy[:, None]
    return v < cfg['dark']


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
    if design.get('front_ink_from_sheet'):
        ink = sheet_ink(ink.shape, ink_o, ink_k, design['front_ink_from_sheet'])

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
        if design.get('side_clean_px'):
            # samples that could not be placed (eyeball, or a point the front view would see on skin) leave
            # teeth and thin broken slivers along the sheet's edge: the placed area is opened (thin parts
            # dropped) and small islands are removed, so the black ends in a clean edge
            valid = ~np.isnan(grid[..., 0])
            keep = mask_open(valid, int(round(design['side_clean_px'] / SIDE_STEP_PX)))
            keep &= ~small_parts(keep, design.get('side_min_px2', 0.0) / SIDE_STEP_PX ** 2)
            grid[~keep] = np.nan
            print('SIDE_CORNER', view, 'clean dropped', int((valid & ~keep).sum()), 'samples')
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
    if design.get('side_trim_sigma'):
        # seen from the front, the sheet must end on the reference's black outline smoothed (one smooth edge, not
        # the per-sample teeth): faces the front camera sees outside it are dropped (faces hidden there stay)
        sg = design['side_trim_sigma'] * ink_k
        soft = er.smooth_rows(er.smooth_rows(ink.astype(float), sg), sg, axis=1) > 0.5
        V = np.array(verts)
        fx, fy = er.camera_pixels('front', V)
        cc = np.clip(np.round((fx - ink_o[0]) * ink_k).astype(int), 0, soft.shape[1] - 1)
        rr = np.clip(np.round((fy - ink_o[1]) * ink_k).astype(int), 0, soft.shape[0] - 1)
        inside_v = soft[rr, cc]
        kept = []
        for f in faces:
            c = V[list(f)].mean(0)
            if front_hidden(c):
                kept.append(f)
            elif not design.get('side_front_hidden_only') and all(inside_v[k] for k in f):
                kept.append(f)
        print('SIDE_CORNER trim', len(faces), '->', len(kept), 'faces')
        faces = kept
    verts = M.to_local(np.array(verts)) * 1000
    used = sorted({k for f in faces for k in f})
    remap = {k: i for i, k in enumerate(used)}
    verts = verts[used]
    faces = [tuple(remap[k] for k in f) for f in faces]
    if not faces:
        return np.zeros((0, 3)), []
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


def build_liner_tail(rays, design):
    """The reference liner runs on as a thin line down the upper edge of the inner-corner wedge to its tip.
    A tapered tube on the lid edge (design pixels, lifted over the first surface)."""
    lt = design['liner_tail']
    ctrl = np.array(lt['px'], float)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(ctrl, axis=0), axis=1))]
    t = np.linspace(0, seg[-1], lt.get('n', 16))
    px = np.c_[np.interp(t, seg, ctrl[:, 0]), np.interp(t, seg, ctrl[:, 1])]
    s = t / seg[-1]
    r = lt['r_mm'][0] * (1 - s) ** 0.8 + lt['r_mm'][1] * s
    pts = np.array([rays.lifted(q, lt['lift_mm'] + ri) for q, ri in zip(px, r)])
    return er.tube(pts, r, sides=6)


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
    if 'float_top' in design or 'fan' in design:
        # the wing and the lash line stand off the face (3D, not a decal): the stand-off fitted to the 3/4 and side
        # views is added along the front ray, so the front view does not change
        ft = float_top_mm(design)
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
    col = px[:, -1, 0] > design.get('liner_margin_from_x', design['corner']['c'][0] + 0.5)
    mv, mf = build_margin(rays, verts.reshape(n, rows, 3)[col, -1])
    return np.r_[v, mv], list(f) + [tuple(i + len(v) for i in fc) for fc in mf]


def corner_clip(design):
    """design['corner_clip'] = [[y, x_min], ...] (design px): the reference white's outer end per row at the outer
    lower corner.  The model's opening reaches 3-4 px further out there; the white is clipped at x_min (the rim
    follows the clipped edge, build_corner_fill covers the rest with skin).  None: no clip."""
    cc = design.get('corner_clip')
    if not cc:
        return None
    cc = np.array(cc, float)
    ys = np.arange(cc[0, 0], cc[-1, 0] + 1e-6, 0.1)
    xs = er.smooth_rows(np.interp(ys, cc[:, 0], cc[:, 1]), 6.0)          # one smooth curve through the points
    return lambda v: float(np.interp(v, ys, xs, left=-1e9, right=-1e9))


def corner_contour(rays, design=None):
    """This side's eye-opening edge round the outer corner, in design pixels: the upper edge from under the liner
    (x = CORNER_UPPER_X) out to the corner, then the lower edge back to x = CORNER_LOWER_X."""
    xs = np.arange(CORNER_UPPER_X, 95.0, -0.25)
    ys = np.arange(108.0, 140.0, 0.1)
    clip = corner_clip(design or {})
    up, low = [], []
    for x in xs:
        seen = np.array([rays.on_eye(x, y) and (clip is None or x >= clip(y)) for y in ys])
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


def lower_edge(rays, design, corner, n_up, lid):
    """The lower white edge as one smooth curve (design px), from the outer corner tip to the inner corner tip.
    The white's lower edge is where the lid skin passes behind the eyeball; the skin triangles are ~4 mm, so that
    line has small teeth, and a line snapped to it copies them.  The edge is found column by column (the lid
    curve, then past its inner end to the inner tip), resampled every 0.25 px and smoothed with a Gaussian that
    may not go below the found edge by more than cfg['tol'] px (no skin left above the curve).
    Returns the curve and the found edge y on the same samples."""
    cfg = design['lid_edge']
    low = np.vstack([corner[n_up:], lid])
    low[:, 1] -= RIM_BELOW_PX
    ext = []
    x = low[-1, 0] + 0.25
    while x < low[-1, 0] + 14.0:
        ys = np.arange(low[-1, 1] - 12.0, low[-1, 1] + 4.0, 0.05)
        seen = np.nonzero([rays.on_eye(x, y) for y in ys])[0]
        if not len(seen):
            break
        ext.append((x, ys[seen[-1]]))
        x += 0.25
    raw = np.vstack([low, np.array(ext).reshape(-1, 2)])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(raw, axis=0), axis=1))]
    t = np.arange(0, seg[-1], 0.25)
    P = np.c_[np.interp(t, seg, raw[:, 0]), np.interp(t, seg, raw[:, 1])]
    c = P[:, 1].copy()
    for _ in range(cfg['iters']):
        c = np.minimum(er.smooth_rows(c, cfg['sigma']), P[:, 1] + cfg['tol'])
    print('LOWER_EDGE', len(c), 'samples, to x %.1f; lifted px mean %.2f max %.2f' % (P[-1, 0], (P[:, 1] - c).mean(), (P[:, 1] - c).max()))
    return np.c_[P[:, 0], c], P[:, 1]


def build_lower_band(rays, design, curve):
    """The black lower line as one flat band along the smooth lower white edge (curve, design px): its top edge
    lap_px over the white, its width a smooth profile of design x (design['lower_band']['width'] = [[x, px], ...]),
    both edges smooth curves in the front view.  Each vertex lies lift_mm in front of the nearest surface round it
    (envelope over eyeball and skin, smoothed), so it never dips in and out of the skin (that made the jagged
    lumps of the round tube).  Returns verts, faces (head mm)."""
    cfg = design['lower_band']
    c = curve[curve[:, 0] <= cfg['x_end']]
    n = len(c)
    tan = np.gradient(c, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.c_[-tan[:, 1], tan[:, 0]]
    nrm[nrm[:, 1] < 0] *= -1                                  # down in the image (away from the white)
    nrm = er.smooth_rows(nrm, 4.0)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    W = np.array(cfg['width'], float)
    wid = er.smooth_rows(np.interp(c[:, 0], W[:, 0], W[:, 1]), 4.0)
    rows = cfg.get('rows', 6)
    f = np.linspace(0, 1, rows)
    off = -cfg.get('lap_px', 0.3) + f[None] * (wid[:, None] + cfg.get('lap_px', 0.3))
    px = c[:, None, :] + off[..., None] * nrm[:, None, :]
    O = np.zeros((n, rows, 3)); D = np.zeros_like(O); H = np.zeros((n, rows))
    for j in range(n):
        for i in range(rows):
            o, d, t = rays.ray(tuple(px[j, i]))
            hs = [h[3] for h in (rays.eye_tree.ray_cast(Vector(o), Vector(d), 50),
                                 rays.skin_tree.ray_cast(Vector(o), Vector(d), 50)) if h[0] is not None]
            O[j, i], D[j, i], H[j, i] = o, d, min(hs + [t])
    r = cfg.get('reach', 8)
    Hp = np.pad(H, ((r, r), (0, 0)), mode='edge')
    env = np.min([Hp[r + dj:r + dj + n] for dj in range(-r, r + 1)], axis=0)
    env = np.minimum(env, env.min(axis=1, keepdims=True))      # one depth across the band (flat ribbon)
    lift = cfg.get('lift_mm', 0.15) / 1000
    depth = env - lift
    for _ in range(30):
        depth = np.minimum(er.smooth_rows(depth, 3.0), env - lift)
    verts = M.to_local((O + D * depth[..., None]).reshape(-1, 3)) * 1000
    faces = [(j * rows + i, j * rows + i + 1, (j + 1) * rows + i + 1, (j + 1) * rows + i)
             for j in range(n - 1) for i in range(rows - 1)]
    q = verts[list(faces[len(faces) // 2])]
    if np.cross(q[1] - q[0], q[2] - q[0])[2] < 0:
        faces = [fc[::-1] for fc in faces]
    print('LOWER_BAND', n, 'columns')
    return er.solid_sheet(verts, faces, LINER_THICK_MM)


def build_corner_band(rays, design):
    """The black frame of the white at the outer corner, as one smooth band between two smooth curves measured on
    the reference front view (design['corner_band']: 'inner' = the white's outer end per row, 'outer' = the black's
    outer edge per row, [[y, x], ...] design px).  Rows every 0.1 px, ncol columns across; each vertex lies a little
    in front of the nearest surface round it (eyeball or skin, along its front ray), the depth smoothed.  It
    replaces the patchwork of pieces that drew this corner (they left a jagged, lumpy edge).
    Returns verts, faces (head mm) or None."""
    cfg = design.get('corner_band')
    if not cfg:
        return None
    I, Ou = np.array(cfg['inner'], float), np.array(cfg['outer'], float)
    y0, y1 = max(I[0, 0], Ou[0, 0]), min(I[-1, 0], Ou[-1, 0])
    ys = np.arange(y0, y1 + 1e-6, 0.1)
    xi = er.smooth_rows(np.interp(ys, I[:, 0], I[:, 1]), cfg.get('sigma', 8.0)) + cfg.get('in_px', 0.3)
    xo = er.smooth_rows(np.interp(ys, Ou[:, 0], Ou[:, 1]), cfg.get('sigma', 8.0))
    ncol = cfg.get('cols', 10)
    f = np.linspace(0, 1, ncol)
    px = np.stack([xo[:, None] + f[None] * (xi - xo)[:, None], np.repeat(ys[:, None], ncol, 1)], -1)
    O = np.zeros(px.shape[:2] + (3,)); D = np.zeros_like(O); H = np.zeros(px.shape[:2])
    for j in range(len(ys)):
        for i in range(ncol):
            o, d, t = rays.ray(tuple(px[j, i]))
            he = rays.eye_tree.ray_cast(Vector(o), Vector(d), 50)
            hs = rays.skin_tree.ray_cast(Vector(o), Vector(d), 50)
            O[j, i], D[j, i] = o, d
            H[j, i] = min([h[3] for h in (he, hs) if h[0] is not None] + [t])
    r = cfg.get('reach', 10)
    Hp = np.pad(H, ((r, r), (2, 2)), mode='edge')
    env = np.min([Hp[r + dj:r + dj + H.shape[0], 2 + di:2 + di + H.shape[1]]
                  for dj in range(-r, r + 1) for di in range(-2, 3)], axis=0)
    lift = cfg.get('lift_mm', 0.12) / 1000
    depth = env - lift
    for _ in range(40):
        depth = np.minimum(er.smooth_rows(er.smooth_rows(depth, 3.0), 1.5, axis=1), env - lift)
    verts = M.to_local((O + D * depth[..., None]).reshape(-1, 3)) * 1000
    faces = [(j * ncol + i, j * ncol + i + 1, (j + 1) * ncol + i + 1, (j + 1) * ncol + i)
             for j in range(len(ys) - 1) for i in range(ncol - 1)]
    q = verts[list(faces[len(faces) // 2])]
    if np.cross(q[1] - q[0], q[2] - q[0])[2] < 0:
        faces = [fc[::-1] for fc in faces]
    print('CORNER_BAND', len(ys), 'rows')
    return er.solid_sheet(verts, faces, LINER_THICK_MM)


def build_corner_fill(rays, design, cover=None):
    """Skin over the eyeball where the model's outer lower corner opens past the reference (corner_clip).  Rows every
    0.2 px across the clipped rows; each row runs from 0.6 px outside the opening (on the skin) to 0.3 px past the
    clip line (under the rim), in 12 even steps, so both edges are smooth lines (a cell grid made a staircase that
    showed as teeth in the 3/4 view).  Vertices over the skin stay just under it (hidden), vertices over the eyeball
    lie corner_fill_lift_mm .. corner_fill_max_mm in front of it, smoothed over the grid, so the patch is one smooth
    sheet from under the skin to the eyeball.  Returns verts, faces (head mm) or None."""
    clip = corner_clip(design)
    if clip is None:
        return None
    cc = np.array(design['corner_clip'], float)
    ys = np.arange(cc[:, 0].min() - 1.0, cc[:, 0].max() + 1.0, 0.2)

    def face_or_ball(u, v):
        """(distance to the face or eyeball, whichever is first; True if the eyeball).  The see-through skin
        layers are left out: the eyeball shows through them in the render."""
        o, d, _ = rays.ray((u, v))
        he = rays.eye_tree.ray_cast(Vector(o), Vector(d), 50)
        hf = rays.skin_tree.ray_cast(Vector(o), Vector(d), 50)
        te = he[3] if he[0] is not None else 1e9
        tf = hf[3] if hf[0] is not None else 1e9
        return min(te, tf), te < tf
    rows = []
    for y in ys:
        xr = clip(y)
        if xr < -1e8:
            continue
        xs = np.arange(xr, 95.0, -0.1)
        seen = np.array([face_or_ball(x, y)[1] for x in xs])
        if not seen[1:].any():
            continue
        xl = xs[np.nonzero(seen)[0][-1]]                     # outer end of the opening on this row
        if xl > xr - 0.2:
            continue
        rows.append((y, xl - design.get('corner_fill_out_px', 0.6), xr + design.get('corner_fill_in_px', 0.3)))
    if len(rows) < 3:
        return None
    R = np.array(rows)
    # smooth outer edge (it lies on the skin): past every tooth of the opening within 2 px, then smoothed
    k = 10
    R[:, 1] = er.smooth_rows(np.array([R[max(j - k, 0):j + k + 1, 1].min() for j in range(len(R))]), 6.0)
    ncol = design.get('corner_fill_cols', 12)
    f = np.linspace(0, 1, ncol)
    px = np.stack([R[:, 1:2] + f[None] * (R[:, 2:3] - R[:, 1:2]), np.repeat(R[:, :1], ncol, 1)], -1)
    O = np.zeros(px.shape[:2] + (3,)); D = np.zeros_like(O); H = np.zeros(px.shape[:2]); ball = np.zeros(px.shape[:2], bool)
    for j in range(len(R)):
        for i in range(ncol):
            o, d, _ = rays.ray(tuple(px[j, i]))
            O[j, i], D[j, i] = o, d
            H[j, i], ball[j, i] = face_or_ball(*px[j, i])
    lo = design.get('corner_fill_lift_mm', 0.05) / 1000
    # in front of the nearest surface round each vertex (the face lies BEHIND the eyeball's rim at the corner: a
    # patch laid on the face there dips under the eyeball and a white line shows), smoothed, never behind the
    # surface right under it
    r = design.get('corner_fill_reach', 3)
    rc = design.get('corner_fill_reach_cols', r)          # across the row: small, so the outer columns come down
    Hp = np.pad(H, ((r, r), (rc, rc)), mode='edge')         # onto the face (a skin ramp, no gap from the 3/4 view)
    env = np.min([Hp[r + dj:r + dj + H.shape[0], rc + di:rc + di + H.shape[1]]
                  for dj in range(-r, r + 1) for di in range(-rc, rc + 1)], axis=0)
    # behind the black line and the wing (cover, world BVH): where they are in front, the patch stays behind them
    behind = np.full(H.shape, -1e9)
    if cover is not None:
        for j in range(H.shape[0]):
            for i in range(H.shape[1]):
                h = cover.ray_cast(Vector(O[j, i]), Vector(D[j, i]), 50)
                he = rays.eye_tree.ray_cast(Vector(O[j, i]), Vector(D[j, i]), 50)
                # only the black parts in front of the eyeball (the wing over the skin); the tightline strips
                # lie behind the eyeball's rim and are hidden by it anyway
                if h[0] is not None and (he[0] is None or h[3] < he[3]):
                    behind[j, i] = h[3] + lo
    top = np.maximum(env - lo, behind)
    depth = top.copy()
    for _ in range(40):
        depth = np.maximum(np.minimum(er.smooth_rows(er.smooth_rows(depth, 1.5), 1.5, axis=1), top), behind)
    # the outer edge sinks just under the face, so the face (not the patch's edge) draws the boundary
    sk = max(design.get('corner_fill_sink', 0.2), 1e-6)
    w = np.clip((sk - f) / sk, 0, 1)[None] * np.ones((len(R), 1))
    # the first and last rows too, where they lie on the skin (not over the eyeball): no straight top / bottom edge
    nr = int(design.get('corner_fill_sink_rows', 5))
    if nr > 0:
        e = np.minimum(np.arange(len(R)), np.arange(len(R))[::-1])
        w = np.maximum(w, np.clip((nr - e) / nr, 0, 1)[:, None] * ~ball)
    depth = depth * (1 - w) + np.maximum(depth, H + 0.03 / 1000) * w
    verts = M.to_local((O + D * depth[..., None]).reshape(-1, 3)) * 1000
    faces = [(j * ncol + i, j * ncol + i + 1, (j + 1) * ncol + i + 1, (j + 1) * ncol + i)
             for j in range(len(R) - 1) for i in range(ncol - 1)]
    q = verts[list(faces[len(faces) // 2])]
    if np.cross(q[1] - q[0], q[2] - q[0])[2] < 0:
        faces = [fc[::-1] for fc in faces]
    print('CORNER_FILL', len(R), 'rows')
    # per vertex: 1 where the patch lies on the face (it may take the face's shading), 0 over the eyeball
    face_w = er.smooth_rows(er.smooth_rows((~ball).astype(float), 2.0), 2.0, axis=1).reshape(-1)
    return verts, faces, face_w


def build_tearline(rays, design, curve, found):
    """A thin skin strip along the lower lid margin (the tearline / lid-margin mesh of game characters): its top
    edge is the smooth curve, it lies on whatever is in front (eyeball or lid skin) just over it, and reaches
    below the found edge, so the white ends on the smooth curve.  It lies on the face or the eyeball under the
    skin layers and keeps its own smooth normals (the face's normals copied over the eyeball part came from the
    skin tucked behind the eyeball and shaded it grey)."""
    cfg = design['lid_edge']
    n, rows = len(curve), TEAR_ROWS
    width = cfg['above_px'] + np.maximum(found - curve[:, 1], 0) + cfg['below_px']
    # cover each found tooth: the widest need within 3 px, smoothed, so the lower edge (on the face) is smooth
    # too; never narrower than needed
    wide = np.array([width[max(i - 12, 0):i + 13].max() for i in range(n)])
    width = np.maximum(er.smooth_rows(wide, 6.0), width)
    s = np.linspace(0, 1, n)
    end = cfg['taper_px'] / max(n * 0.25, 1e-6)
    taper = np.clip(s / end, 0, 1) * np.clip((1 - s) / end, 0, 1)
    top = curve[:, 1] - cfg['above_px'] * taper
    f = np.linspace(0, 1, rows)
    px = np.stack([np.repeat(curve[:, :1], rows, 1), top[:, None] + f[None] * (width * taper)[:, None]], -1)
    cast = [[rays.ray(q) for q in col] for col in px]
    origin = np.array([[c[0] for c in col] for col in cast])
    direction = np.array([[c[1] for c in col] for col in cast])
    # on the face or the eyeball, whichever is in front, but under the skin layers (HEAD_skin_04 / HEAD_skin lie
    # 0.3 mm over the face and give the lid its colour): where a layer is, the layer shows as before
    hit = np.array([[min(h[3] if h[0] is not None else 1e9 for h in
                         (tr.ray_cast(Vector(o), Vector(d), 50) for tr in (rays.skin_tree, rays.eye_tree)))
                     for o, d in zip(oc, dc)] for oc, dc in zip(origin, direction)])
    hit = np.where(hit > 1e8, np.array([[c[2] for c in col] for col in cast]), hit)
    # just over the surface in front: smoothed along the curve, but kept between clear_mm and lift_max_mm in front
    # of it (the lower line lies at least 0.10 mm in front, so the strip never hides it)
    depth = hit - cfg['lift_mm'] / 1000
    for _ in range(20):
        depth = np.clip(er.smooth_rows(er.smooth_rows(depth, cfg.get('depth_sigma', 3.0)), 1.0, axis=1),
                        hit - cfg['lift_max_mm'] / 1000, hit - cfg['clear_mm'] / 1000)
    verts = M.to_local((origin + direction * depth[..., None]).reshape(-1, 3)) * 1000
    faces = [(i * rows + j, (i + 1) * rows + j, (i + 1) * rows + j + 1, i * rows + j + 1)
             for i in range(n - 1) for j in range(rows - 1)]
    tot = np.zeros(3)
    for fc in faces[::7]:
        q = verts[list(fc)]
        tot += np.cross(q[1] - q[0], q[2] - q[0])
    if tot[2] < 0:
        faces = [fc[::-1] for fc in faces]
    return verts, faces


TEAR_ROWS = 12
SHADOW_IMAGE = 'INKWAVE_lash_shadow'


def build_lash_shadow(rays, design, curve):
    """The soft brown shade under the outer lower line (the reference's lower lashes and their shadow, seen soft):
    a strip along the smooth lower edge, just over whatever is in front (skin layers included), with UVs (along,
    across) onto a small image whose alpha is cfg['alpha'] x the along profile (cfg['along'], design x -> weight)
    x (1 - across)^across_pow.  Returns verts, faces, uvs (per vertex) and the design x range the u axis spans."""
    cfg = design['lash_shadow']
    c = curve[curve[:, 0] <= cfg['x_end']]
    n, rows = len(c), cfg.get('rows', 8)
    f = np.linspace(0, 1, rows)
    px = np.stack([np.repeat(c[:, :1], rows, 1), c[:, 1:2] + cfg['start_px'] + f[None] * cfg['width_px']], -1)
    cast = [[rays.ray(q) for q in col] for col in px]
    origin = np.array([[x[0] for x in col] for col in cast])
    direction = np.array([[x[1] for x in col] for col in cast])
    # over everything in front except the lash parts (skin layers included): the first hit, but also no deeper than
    # the skin layers anywhere within 0.5 px (they lie 0.3 mm over the face, unevenly), smoothed
    hit = np.array([[min(rays.near(u + du, v + dv) for du in (-0.5, 0.0, 0.5) for dv in (-0.5, 0.0, 0.5))
                     for u, v in col] for col in px])
    depth = hit - cfg['lift_mm'] / 1000
    for _ in range(30):
        depth = np.minimum(er.smooth_rows(er.smooth_rows(depth, 2.0), 1.0, axis=1), hit - cfg['lift_mm'] / 1000)
    verts = M.to_local((origin + direction * depth[..., None]).reshape(-1, 3)) * 1000
    faces = [(i * rows + j, (i + 1) * rows + j, (i + 1) * rows + j + 1, i * rows + j + 1)
             for i in range(n - 1) for j in range(rows - 1)]
    tot = np.zeros(3)
    for fc in faces[::7]:
        q = verts[list(fc)]
        tot += np.cross(q[1] - q[0], q[2] - q[0])
    if tot[2] < 0:
        faces = [fc[::-1] for fc in faces]
    u = (c[:, 0] - c[0, 0]) / max(c[-1, 0] - c[0, 0], 1e-6)
    uvs = np.stack([np.repeat(u[:, None], rows, 1), np.repeat(1 - f[None], n, 0)], -1).reshape(-1, 2)
    return verts, faces, uvs, (float(c[0, 0]), float(c[-1, 0]))


def lash_shadow_image(design, x0, x1):
    """RGBA image of the shade: u along the edge (design x from x0 to x1), v across (1 at the line, 0 below)."""
    cfg = design['lash_shadow']
    W, H = 256, 32
    xs = x0 + (np.arange(W) + 0.5) / W * (x1 - x0)
    along = np.interp(xs, [a[0] for a in cfg['along']], [a[1] for a in cfg['along']])
    v = (np.arange(H) + 0.5) / H                                  # 0 at the bottom row of the image
    across = v ** cfg['across_pow']
    px = np.zeros((H, W, 4), np.float32)
    px[..., :3] = np.array(cfg['colour'], np.float32)
    px[..., 3] = np.clip(cfg['alpha'] * across[:, None] * along[None, :], 0, 1)
    img = bpy.data.images.get(SHADOW_IMAGE)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(SHADOW_IMAGE, W, H, alpha=True)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def lash_shadow_material(img):
    """A see-through decal (colour and alpha from the image), like the lip and nose decals; no gloss, no shadow."""
    mat = bpy.data.materials.get(SHADOW_IMAGE) or bpy.data.materials.new(SHADOW_IMAGE)
    mat.use_nodes = True
    t = mat.node_tree
    bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next((n for n in t.nodes if n.type == 'TEX_IMAGE'), None) or t.nodes.new('ShaderNodeTexImage')
    tex.image, tex.extension = img, 'EXTEND'
    t.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    t.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    mat.surface_render_method = 'BLENDED'
    return mat


def set_uvs(obj, uvs):
    me = obj.data
    uvl = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    loops = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', loops)
    uvl.data.foreach_set('uv', np.asarray(uvs, np.float32)[loops].ravel())
    me.update()


def tearline_material(tint=(1.0, 1.0, 1.0), name='INKWAVE_tearline_skin'):
    """The face's skin material without subsurface scattering (a strip this thin renders grey with it), its colour
    multiplied by tint (linear) so it renders like the face round it (without subsurface it comes out more
    orange)."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        bpy.data.materials.remove(mat)
    src = bpy.data.materials['skin_b27050']
    mat = src.copy()
    mat.name = name
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Subsurface Weight'].default_value = 0.0
    c = next(n for n in src.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value
    bsdf.inputs['Base Color'].default_value = (*[min(c[i] * tint[i], 1.0) for i in range(3)], 1.0)
    return mat


def build_rim(rays, design):
    """One black line round the outer corner of the eye, resting on the lid edge: from under the liner it
    follows this side's eye-opening edge round the corner and along the lower lid to the inner end, so seen
    from the 3/4 and side views the white's outer end is framed like the reference."""
    corner, n_up = corner_contour(rays, design)
    lid = rim_pixels()
    lid = lid[lid[:, 0] > CORNER_LOWER_X + 0.3].copy()
    for i, (u, v) in enumerate(lid):
        ys = np.arange(v - 3.0, v + 3.01, 0.1)
        seen = [rays.on_eye(u, y) for y in ys]
        if any(seen):
            lid[i, 1] = ys[max(k for k, e in enumerate(seen) if e)] + RIM_BELOW_PX
    edge = None
    if 'lid_edge' in design:
        curve, found = lower_edge(rays, design, corner, n_up, lid)
        edge = (curve, found)
        line = curve[curve[:, 0] <= min(lid[-1, 0], design['lid_edge'].get('line_end_x', 1e9))].copy()
        line[:, 1] += RIM_BELOW_PX
        if 'lower_band' in design:
            line = line[:1]                                   # the lower line is the smooth band (build_lower_band)
        px = np.vstack([corner[:n_up], line])
    else:
        px = np.vstack([corner, lid])
    cast = [rays.ray(p) for p in px]
    origin = np.array([c[0] for c in cast])
    direction = np.array([c[1] for c in cast])
    hit = np.array([c[2] for c in cast])
    # the front rays hit the lid edge at uneven depths; smoothed along the line, the rim (and the margin strip
    # wrapped from it) does not zigzag in the 3/4 and side views.  The front view does not change.
    depth = er.smooth_rows(hit, design.get('rim_depth_sigma', 2.0))
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
    if design.get('rim_tube') is False:
        # the lower line is the smooth band and the corner is drawn by the liner: no round tube (its start under
        # the wing showed as two black horns in the front view)
        tv, tf = np.zeros((0, 3)), []
    start = np.minimum(er.smooth_rows(hit, design.get('rim_depth_sigma', 2.0)), hit) if design.get('margin_smooth') else hit
    skin_pts = M.to_local(origin + direction * (start - MARGIN_LIFT_MM / 1000)[:, None]) * 1000
    stop = None
    if edge is not None:
        lower = np.zeros(len(px), bool)
        lower[n_up + 1:] = True
        stop = (lower, edge[0])
    mv, mf = build_margin(rays, skin_pts, stop=stop)
    return (np.r_[tv, mv], list(tf) + [tuple(i + len(tv) for i in fc) for fc in mf]), px, edge


def float_top_mm(design):
    """Stand-off (mm) of every liner_top point: the fitted float_top, plus the lash strip lift of the fan
    (fan.strip_mm, a profile from the wing tip to the inner end): the black band is the lash strip, its top edge
    stands off the lid while its lower edge stays on the lid margin."""
    top = np.array(design['liner_top'])
    ft = np.array(design.get('float_top', np.zeros(len(top))), float)
    if 'fan' in design and 'strip_mm' in design['fan']:
        prof = design['fan']['strip_mm']
        u = (top[:, 0] - top[:, 0].min()) / (top[:, 0].max() - top[:, 0].min())
        ft = ft + np.interp(u, np.linspace(0, 1, len(prof)), prof)
    return ft


def top_float(design, x):
    """Stand-off (mm) of the liner top edge at front-view column x (0 when the design has none)."""
    if 'float_top' not in design and 'fan' not in design:
        return 0.0 * np.asarray(x, float)
    top = np.array(design['liner_top'])
    order = np.argsort(top[:, 0])
    return np.interp(x, top[order, 0], float_top_mm(design)[order])


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


FAN_TAG = 'INKWAVE_lash_fan'


def eye_centre_mm(name):
    """Centre of an eyeball cap (least-squares sphere through its vertices), head-frame mm."""
    P = M.to_local(er.world(bpy.data.objects[name])) * 1000
    c = np.linalg.lstsq(np.c_[2 * P, np.ones(len(P))], (P ** 2).sum(1), rcond=None)[0]
    return c[:3]


def lash_clump(cfg):
    """One lash clump of unit length, the usual way: a Blender curve (a quarter arc curling toward +Y, root at the
    origin, leaving along +Z) with a round bevel whose radius tapers from the root to the tip, made a mesh."""
    cu = bpy.data.curves.new(FAN_TAG + '_clump', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_mode = 'ROUND'
    cu.bevel_depth = cfg['root_r']
    cu.bevel_resolution = 1
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    n = 9
    sp.points.add(n - 1)
    curl = np.radians(cfg['curl_deg'])
    for i in range(n):
        a = curl * i / (n - 1)
        y, z = ((1 - np.cos(a)) / curl, np.sin(a) / curl) if curl > 1e-6 else (0.0, i / (n - 1))
        sp.points[i].co = (0.0, y, z, 1.0)
        sp.points[i].radius = max((1 - i / (n - 1)) ** cfg.get('taper_pow', 0.8), 0.05)
    obj = bpy.data.objects.new(FAN_TAG + '_clump', cu)
    bpy.context.scene.collection.objects.link(obj)
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(cu)
    clump = bpy.data.objects.new(FAN_TAG + '_clump', me)
    bpy.context.scene.collection.objects.link(clump)
    return clump


def fan_nodes(clump):
    """Geometry Nodes: a lash clump on every point, turned and scaled by the points' lash_rot / lash_scale."""
    ng = bpy.data.node_groups.new(FAN_TAG, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nd = ng.nodes
    gi, go = nd.new('NodeGroupInput'), nd.new('NodeGroupOutput')
    info = nd.new('GeometryNodeObjectInfo')
    info.inputs['Object'].default_value = clump
    on_pts = nd.new('GeometryNodeInstanceOnPoints')
    rot = nd.new('GeometryNodeInputNamedAttribute')
    rot.data_type = 'FLOAT_VECTOR'
    rot.inputs['Name'].default_value = 'lash_rot'
    euler = nd.new('FunctionNodeEulerToRotation')
    scl = nd.new('GeometryNodeInputNamedAttribute')
    scl.data_type = 'FLOAT_VECTOR'
    scl.inputs['Name'].default_value = 'lash_scale'
    real = nd.new('GeometryNodeRealizeInstances')
    ln = ng.links
    ln.new(gi.outputs[0], on_pts.inputs['Points'])
    ln.new(info.outputs['Geometry'], on_pts.inputs['Instance'])
    ln.new(rot.outputs['Attribute'], euler.inputs['Euler'])
    ln.new(euler.outputs['Rotation'], on_pts.inputs['Rotation'])
    ln.new(scl.outputs['Attribute'], on_pts.inputs['Scale'])
    ln.new(on_pts.outputs['Instances'], real.inputs['Geometry'])
    ln.new(real.outputs['Geometry'], go.inputs[0])
    return ng


def fan_layout(rays, design, eye_name, cfg=None):
    """Roots, directions (head frame) and lengths of the upper lash fan.  Roots sit on the upper lid margin (the
    front-view lid edge from the outer corner to the inner end, cast onto this side's skin) and stand off it along
    the eyeball normal.  Each lash leaves the lid along the eyeball normal tilted up by elev_deg and toward the outer
    corner by splay_deg, then curls up (curl_deg): lashes grow out of the lid, they do not lie on it."""
    cfg = cfg or design['fan']
    eye = eye_centre_mm(eye_name)
    chain = np.array(design[cfg.get('chain', 'liner_bottom')], float)
    x0, x1 = cfg['margin_x']
    chain = chain[(chain[:, 0] >= x0) & (chain[:, 0] <= x1)]
    chain = chain[np.argsort(chain[:, 0])]
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(chain, axis=0), axis=1))]
    s = np.linspace(*cfg['s_range'], cfg['count'])
    px = np.c_[np.interp(s * seg[-1], seg, chain[:, 0]), np.interp(s * seg[-1], seg, chain[:, 1])]
    # the roots go root_in_px down into the black band, so the lashes grow out of the black (not the skin above it)
    px[:, 1] += cfg.get('root_in_px', 0.0)
    # on the liner top chain the roots stand off with the strip (its top edge), else they sit on the lid
    lift = (lambda p: LASH_ROOT_LIFT_MM + float(top_float(design, p[0]))) if cfg.get('chain') == 'liner_top' else (lambda p: 0.0)
    on_skin = np.array([rays.lifted(p, lift(p)) for p in px])
    ds = 0.01
    at = lambda v: np.r_[np.interp(min(max(v, 0), 1) * seg[-1], seg, chain[:, 0]), np.interp(min(max(v, 0), 1) * seg[-1], seg, chain[:, 1])]
    outer = np.array([rays.lifted(at(v - ds), lift(at(v - ds))) for v in s])    # chain sorted by x: s = 0 is the outer end
    inner = np.array([rays.lifted(at(v + ds), lift(at(v + ds))) for v in s])
    up = np.array([0.0, 1.0, 0.0])
    prof = lambda key: np.interp(s, np.linspace(0, 1, len(cfg[key])), cfg[key])
    elev, splay, length = np.radians(prof('elev_deg')), np.radians(prof('splay_deg')), prof('len_mm')
    out = []
    for i in range(len(s)):
        n = on_skin[i] - eye
        n /= np.linalg.norm(n)
        root = on_skin[i] + n * cfg['root_out_mm']
        u = up - up.dot(n) * n
        u /= np.linalg.norm(u)
        d = n * np.cos(elev[i]) + u * np.sin(elev[i])
        t = outer[i] - inner[i]                         # toward the outer corner
        t -= t.dot(d) * d
        t /= np.linalg.norm(t) + 1e-12
        d = d * np.cos(splay[i]) + t * np.sin(splay[i])
        y = up + cfg.get('curl_out', 0.0) * t           # the clump curls up (and toward the outer corner)
        y -= y.dot(d) * d
        y /= np.linalg.norm(y)
        out.append((root, d, y, length[i]))
    return out


def build_fan(rays, design, eye_name):
    """The upper lashes: the main clumps (design['fan']) and, between them, shorter thin ones (fan['fill'], keys
    that override the main ones) that thicken the fringe seen from the side.  Returns head-frame mm vertices
    and faces like the other builders."""
    groups = [design['fan']]
    if 'fill' in design['fan']:
        groups.append(dict(design['fan'], **design['fan']['fill']))
    verts, faces = np.zeros((0, 3)), []
    for cfg in groups:
        v, f = build_fan_group(rays, design, eye_name, cfg)
        faces += [tuple(i + len(verts) for i in fc) for fc in f]
        verts = np.r_[verts, v]
    return verts, faces


def build_fan_group(rays, design, eye_name, cfg):
    """One group of lash clumps placed on the strip's top edge with Geometry Nodes (Instance on Points), applied
    to a mesh."""
    layout = fan_layout(rays, design, eye_name, cfg)
    clump = lash_clump(cfg)
    pts = bpy.data.meshes.new(FAN_TAG + '_pts')
    roots_w = M.to_world(np.array([r for r, _, _, _ in layout]) / 1000)
    pts.from_pydata(roots_w.tolist(), [], [])
    rots, scales = [], []
    for root, d, y, length in layout:
        zw = M.to_world_delta(d[None])[0]
        yw = M.to_world_delta(y[None])[0]
        zw /= np.linalg.norm(zw)
        yw -= yw.dot(zw) * zw
        yw /= np.linalg.norm(yw)
        xw = np.cross(yw, zw)
        rots.append(tuple(Matrix((xw, yw, zw)).transposed().to_euler()))
        scales.append((length / 1000,) * 3)
    pts.attributes.new('lash_rot', 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', np.ravel(rots))
    pts.attributes.new('lash_scale', 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', np.ravel(scales))
    holder = bpy.data.objects.new(FAN_TAG + '_pts', pts)
    bpy.context.scene.collection.objects.link(holder)
    ng = fan_nodes(clump)
    mod = holder.modifiers.new(FAN_TAG, 'NODES')
    mod.node_group = ng
    er.apply_modifier(holder, mod)
    verts = M.to_local(er.world(holder)) * 1000
    faces = [tuple(p.vertices) for p in holder.data.polygons]
    me, cme = holder.data, clump.data
    bpy.data.objects.remove(holder)
    bpy.data.objects.remove(clump)
    for m in (me, cme):
        bpy.data.meshes.remove(m)
    bpy.data.node_groups.remove(ng)
    print('LASH_FAN', eye_name, len(layout), 'clumps,', len(verts), 'verts, lengths mm',
          np.round([l for *_, l in layout], 1).tolist())
    return verts, faces


def lower_centres(design, curve):
    """The lower lash dots: the reference dots (design['lower']), or, with design['lower_row'] and the smooth
    lower edge, an even row along the curve at a fixed distance below it (like the reference: dots in a row
    parallel to the outer lower line)."""
    row = design.get('lower_row')
    if row is None or curve is None:
        return design['lower']
    if 'x' in row:
        # along the lower lid only (from x[0] on, where the curve no longer turns up into the corner): the curve
        # is smoothed first, so the dots lie on one smooth curve parallel to the lower line
        c = curve[(curve[:, 0] >= row['x'][0] - 3) & (curve[:, 0] <= row['x'][1] + 3)].copy()
        c[:, 1] = er.smooth_rows(c[:, 1], row.get('sigma', 6.0))
        c = c[(c[:, 0] >= row['x'][0]) & (c[:, 0] <= row['x'][1])]
        curve = c
        row = dict(row, s=[0.0, 1.0])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(curve, axis=0), axis=1))]
    out = []
    for t in np.linspace(*row['s'], row['count']):
        i = int(np.clip(np.searchsorted(seg, t * seg[-1]), 1, len(curve) - 2))
        tan = curve[i + 1] - curve[i - 1]
        tan /= np.linalg.norm(tan)
        nrm = np.array([-tan[1], tan[0]])
        if nrm[1] < 0:
            nrm = -nrm                                   # away from the eye (down in the image)
        out.append({'centre': (curve[i] + nrm * row['offset_px']).tolist()})
    return out


FILL_SKIN = {'solid_mm': 0.0, 'face_normals': False}


def face_normals_onto(obj, weights):
    """The face's shading (custom normals, Blender's Data Transfer, nearest face interpolated) onto obj, limited
    by per-vertex weights (1 where obj lies on the face, 0 over the eyeball: there the nearest face is the lid
    skin tucked behind the eyeball and its normals shade grey)."""
    vg = obj.vertex_groups.new(name='INKWAVE_fill_face')
    for i, x in enumerate(weights):
        if x > 0.001:
            vg.add([i], float(min(x, 1.0)), 'REPLACE')
    mod = obj.modifiers.new('INKWAVE_fill_face', 'DATA_TRANSFER')
    mod.object = bpy.data.objects['HEAD_face']
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    mod.vertex_group = vg.name
    er.apply_modifier(obj, mod)
    obj.vertex_groups.remove(obj.vertex_groups['INKWAVE_fill_face'])


class OverRays:
    """Front rays that also hit an extra mesh (head mm verts, faces) lying over the skin."""

    def __init__(self, base, mesh):
        self.base = base
        self.extra = BVHTree.FromPolygons([Vector(v) for v in M.to_world(np.asarray(mesh[0]) / 1000)], list(mesh[1]))

    def cast(self, u, v):
        p, d, t = self.base.cast(u, v)
        o = p - d * t
        h = self.extra.ray_cast(Vector(o), Vector(d), 50)
        if h[0] is not None and h[3] < t:
            return np.array(h[0]), d, h[3]
        return p, d, t

    def lifted(self, uv, lift_mm):
        p, d, _ = self.cast(*uv)
        return M.to_local(p[None] - d[None] * lift_mm / 1000)[0] * 1000


def build_lower(rays, design, curve=None):
    """Short thick lower lashes at the reference dots (outer lower lid, the first ones on the skin under the
    wedge).  Each points away from the eye, leaning to the outer corner, and its tip stands off the lid (3D)."""
    eye = np.array(design['corner']['eye_centre'])
    verts, faces = [], []
    for st in lower_centres(design, curve):
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
        if design.get('lower_round'):
            # a soft rounded stroke (the reference's lower lashes read as small rounded dashes, not sharp spikes)
            lr = design['lower_round']
            radius = np.maximum(lr['r_mm'] * np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) ** lr.get('pow', 1.0), 0.03)
        # fixed 3D length: the front-view direction gives the way, the lash does not follow steep skin
        r3 = rays.lifted(root, LOWER_LIFT_MM + radius[0])
        way = rays.lifted(tip, LOWER_LIFT_MM + radius[0]) - r3
        way = way / np.linalg.norm(way) * design.get('lower_round', {}).get('len_mm', LOWER_LEN_MM)
        p0, d0, _ = rays.cast(*root)
        toward_cam = M.to_local(np.array([p0 - d0 * 0.01]))[0] - M.to_local(np.array([p0]))[0]
        toward_cam /= np.linalg.norm(toward_cam)
        s = design.get('lower_standoff_mm', 0.0) * t ** 1.2
        if design.get('lower_round', {}).get('flat'):
            # lying on the skin (a printed-looking dot like the reference), not standing out of it
            s = 0.0 * t
            r3 = rays.lifted(root, radius.max() * 0.35 + 0.05)
            way = rays.lifted(tip, radius.max() * 0.35 + 0.05) - r3
            way = way / np.linalg.norm(way) * design['lower_round'].get('len_mm', LOWER_LEN_MM)
        ls = design.get('lower_strands')
        if ls is None:
            pts = r3[None] + t[:, None] * way[None] + s[:, None] * toward_cam[None]
            v, f = er.tube(pts, radius, sides=6)
            if design.get('lower_round', {}).get('flat'):
                # squash the stroke toward the skin (flat, 35 % thick), so it does not stick out of the skin
                v = np.asarray(v)
                c = np.repeat(pts, 6, axis=0)                       # er.tube: 6 vertices round each point
                off = v - c
                along = off @ toward_cam
                v = v - np.outer(along * 0.65, toward_cam)
            faces += [tuple(i + len(verts) for i in fc) for fc in f]
            verts += list(v)
            continue
        # a small clump of thin hairs (the usual lash build: roots on the lid, tips fanned out, tapered strands),
        # instead of one thick cone: seen soft like the reference's short dark strokes
        w0 = way / np.linalg.norm(way)
        side = np.cross(w0, toward_cam)
        side /= np.linalg.norm(side)
        tt = np.linspace(0, 1, 7)
        rad = np.maximum(ls['root_r'] * (1 - tt) ** 0.7, 0.025)
        for k in range(ls['n']):
            a = np.radians(ls['spread_deg']) * (k - (ls['n'] - 1) / 2) / max((ls['n'] - 1) / 2, 1)
            dk = w0 * np.cos(a) + side * np.sin(a)
            L = ls['len_mm'] * (1 - ls.get('len_jitter', 0.2) * abs(k - (ls['n'] - 1) / 2) / max(ls['n'], 1))
            rk = r3 + side * ls.get('root_spread_mm', 0.15) * (k - (ls['n'] - 1) / 2)
            pts = rk[None] + (tt * L)[:, None] * dk[None] + (ls.get('lift_mm', 0.5) * tt ** 1.5)[:, None] * toward_cam[None]
            v, f = er.tube(pts, rad, sides=6)
            faces += [tuple(i + len(verts) for i in fc) for fc in f]
            verts += list(v)
    return np.array(verts), faces


def set_side(objs, liner, rim, lashes, lower, mat, brown, tear=None, tear_mat=None, shade=None, shade_mat=None,
             fill=None, fill_mat=None):
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
        elif k == len(lashes) + 1 and tear is not None:
            er.set_mesh(obj, *tear, tear_mat, '_lr_tearline')
        elif k == len(lashes) + 2 and shade is not None:
            er.set_mesh(obj, *shade[:2], shade_mat, '_lr_lash_shadow')
            set_uvs(obj, shade[2])
            if '_lr_visible_shadow' not in obj:
                obj['_lr_visible_shadow'] = obj.visible_shadow       # brought back by lr_restore
            obj.visible_shadow = False
        elif k == len(lashes) + 3 and fill is not None:
            v, f, fw = fill
            if FILL_SKIN['solid_mm']:
                v, f = er.solid_sheet(np.asarray(v), f, FILL_SKIN['solid_mm'])
                fw = np.r_[fw, fw]
            er.set_mesh(obj, v, f, fill_mat, '_lr_corner_fill')
            if FILL_SKIN['face_normals']:
                face_normals_onto(obj, fw)
            # it stands up to 1.5 mm over the face: its shadow drew a dark band under it
            if '_lr_visible_shadow' not in obj:
                obj['_lr_visible_shadow'] = obj.visible_shadow
            obj.visible_shadow = False
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


def carve_inner_tip(face, ic, eye):
    """The reference inner corner is a sharp wedge of white pointing to the nose; the model's white ends
    ~6 px earlier with a round end.  The face skin does not end at the eye (it runs on behind the eyeball),
    so the white shows where the skin passes behind the eyeball.  Every face vertex whose front pixel (right
    eye design pixels, both eyes) lies inside the reference wedge is moved back along its front-camera ray
    to just behind the eyeball; a band round the wedge slopes into it (smoothstep in pixels)."""
    ct = ic['tip_wedge']
    poly = np.array(ct['poly'])
    cam = np.array(bpy.data.objects['FACE_FIT_CAM_front'].matrix_world.translation)
    W = er.world(face)
    loc = M.to_local(W)
    loc[:, 0] = -np.abs(loc[:, 0])
    ux, uy = er.camera_pixels('front', M.to_world(loc))
    pts = np.c_[ux, uy]
    box = (ux > poly[:, 0].min() - ct['band_px']) & (ux < poly[:, 0].max() + ct['band_px']) & \
          (uy > poly[:, 1].min() - ct['band_px']) & (uy < poly[:, 1].max() + ct['band_px'])
    idx = np.nonzero(box)[0]
    ins = inside(poly, pts[idx])
    # distance (px) to the wedge for the vertices outside it
    def seg_dist(q):
        best = 1e9
        for a, b in zip(poly, np.roll(poly, -1, 0)):
            ab = b - a
            t = np.clip(np.dot(q - a, ab) / np.dot(ab, ab), 0, 1)
            best = min(best, np.linalg.norm(q - (a + ab * t)))
        return best
    moved = 0
    new = W.copy()
    for k, i in enumerate(idx):
        if ins[k]:
            w = 1.0
        else:
            dpx = seg_dist(pts[i])
            if dpx > ct['band_px']:
                continue
            t = 1 - dpx / ct['band_px']
            w = t * t * (3 - 2 * t) * ct['band_depth']
        d = W[i] - cam
        L = np.linalg.norm(d)
        d /= L
        hit = eye.ray_cast(Vector(cam), Vector(d), 50)
        if hit[0] is None:
            continue
        target = hit[3] + ct['behind_mm'] / 1000
        if L >= target:
            continue
        new[i] = cam + d * (L + (target - L) * w)
        moved += 1
    mw_inv = np.array(face.matrix_world.inverted())
    co = (np.c_[new, np.ones(len(new))] @ mw_inv.T)[:, :3]
    face.data.vertices.foreach_set('co', co.ravel())
    face.data.update()
    print('INNER_TIP vertices moved', moved, 'max move mm', round(float(np.linalg.norm(new - W, axis=1).max() * 1000), 2))


def seat_inner_tip(face, ic, eye):
    """Last pass of the inner-corner wedge.  The white shows where the skin passes behind the eyeball, so the edge
    of the white is the line where skin and eyeball cross; with a coarse mesh (2 mm edges) that line zigzags and
    the wedge tip becomes a one-vertex pit 3 mm deep.  Here the skin round the wedge edge is laid on the
    eyeball with a height that is proportional to the signed pixel distance to the edge (behind inside, in
    front outside): the crossing then lies on the reference edge whatever the mesh, and the tip is shallow.
    Outside vertices further than `exact_px` blend back to where they were (no cliff) by `band_px`."""
    ct = ic['tip_wedge']
    st = ct['seat']
    poly = np.array(ct['poly'])
    edges = [(poly[i], poly[(i + 1) % len(poly)], i) for i in range(len(poly))]
    cam = np.array(bpy.data.objects['FACE_FIT_CAM_front'].matrix_world.translation)
    W = er.world(face)
    loc = M.to_local(W)
    loc[:, 0] = -np.abs(loc[:, 0])
    ux, uy = er.camera_pixels('front', M.to_world(loc))
    pts = np.c_[ux, uy]
    band = st['band_px']
    box = (ux > poly[:, 0].min() - band) & (ux < poly[:, 0].max() + band) & \
          (uy > poly[:, 1].min() - band) & (uy < poly[:, 1].max() + band)
    idx = np.nonzero(box)[0]
    ins = inside(poly, pts[idx])

    def edge_dist(q):
        best, edge = 1e9, -1
        for a, b, i in edges:
            ab = b - a
            t = np.clip(np.dot(q - a, ab) / np.dot(ab, ab), 0, 1)
            d = np.linalg.norm(q - (a + ab * t))
            if d < best:
                best, edge = d, i
        return best, edge
    new = W.copy()
    moved = 0
    g = st['slope_mm_per_px'] / 1000
    for k, i in enumerate(idx):
        dpx, edge = edge_dist(pts[i])
        if edge in st['closing_edges']:
            continue                                   # the eye-opening side of the wedge: no edge there
        d = W[i] - cam
        length = np.linalg.norm(d)
        d /= length
        hit = eye.ray_cast(Vector(cam), Vector(d), 50)
        if hit[0] is None or abs(hit[3] - length) > st.get('reach_mm', 5.0) / 1000:
            continue                                   # no eyeball right behind / in front of this vertex
        if ins[k]:
            want = hit[3] + min(ct['behind_mm'] / 1000, max(st['min_behind_mm'] / 1000, g * dpx))
            if length >= want:
                continue                               # already behind: never pulled forward (the iris and the
                                                       # cornea bulge in front of the eyeball shell)
            target = want
        else:
            if dpx > band or (length > hit[3] and edge not in st['pull_edges']):
                continue      # far away, or behind the eyeball under the upper lid (the eye opening).  Below the
                              # wedge and past its tip the skin must be in front: holes there show the white
            exact = hit[3] - g * dpx
            t = np.clip((dpx - st['exact_px']) / (band - st['exact_px']), 0, 1)
            target = exact + (length - exact) * t * t * (3 - 2 * t)
        new[i] = cam + d * target
        moved += 1
    mw_inv = np.array(face.matrix_world.inverted())
    co = (np.c_[new, np.ones(len(new))] @ mw_inv.T)[:, :3]
    face.data.vertices.foreach_set('co', co.ravel())
    face.data.update()
    ps = st.get('post_smooth')
    if ps:
        # the skin below the wedge dips to the eyeball (the eyeball lies ~6 mm under the skin there): smooth that
        # trench outside the exact band, so its walls carry no glints; the edge itself stays where it was put
        w = np.zeros(len(W))
        for k, i in enumerate(idx):
            if ins[k]:
                continue
            dpx, edge = edge_dist(pts[i])
            if edge in st['closing_edges']:
                continue
            a = np.clip((dpx - ps['from_px']) / 1.0, 0, 1) * np.clip((ps['to_px'] - dpx) / 2.0, 0, 1)
            w[i] = a * a * (3 - 2 * a)
        er.apply_weighted_modifier(face, w, 'SMOOTH', factor=0.5, iterations=ps['iters'])
    print('INNER_TIP seat vertices', moved, 'max move mm', round(float(np.linalg.norm(new - W, axis=1).max() * 1000), 2))


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
    if ic.get('tip_wedge'):
        ct = ic['tip_wedge']
        for _ in range(ct.get('rounds', 1)):
            carve_inner_tip(face, ic, eye)
            if ct.get('smooth_iters'):
                # smooth the carved area and its band, then carve again: an even edge where the skin passes
                # behind the eyeball instead of the mesh's zigzag
                loc = M.to_local(er.world(face))
                loc[:, 0] = -np.abs(loc[:, 0])
                ux, uy = er.camera_pixels('front', M.to_world(loc))
                c = np.array(ct['poly']).mean(0)
                d = np.hypot((ux - c[0]) / ct['smooth_rx_px'], (uy - c[1]) / ct['smooth_ry_px'])
                g = np.clip((1 - d) / 0.5, 0, 1)
                g = g * g * (3 - 2 * g)
                er.apply_weighted_modifier(face, g, 'SMOOTH', factor=0.5, iterations=ct['smooth_iters'])
        if ct.get('seat'):
            seat_inner_tip(face, ic, eye)
        else:
            carve_inner_tip(face, ic, eye)
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
TUCK_BALLS = {'HEAD_eyes_18': -1, 'HEAD_eyes': 1}


def tuck_eye_corner(design):
    """The model's eye opening is wider than the reference's at the outer lower corner (the white reaches 3-4 px
    further out; the lid skin lies just behind the eyeball there).  The eyeball (a dense cap, 0.15 mm edges) is
    pushed back along the front camera's rays outside one smooth curve (design['eye_tuck']['curve'], the
    reference white's outer end per row, design px): there it goes behind the lid skin, so the white ends on that
    smooth curve and the real skin shows round it.  The left eye uses the mirror image of the curve."""
    cfg = design.get('eye_tuck')
    if not cfg:
        return
    C = np.array(cfg['curve'], float)
    ys = np.arange(C[0, 0], C[-1, 0] + 1e-6, 0.05)
    xs = er.smooth_rows(np.interp(ys, C[:, 0], C[:, 1]), cfg.get('sigma', 10.0))
    _, d, _ = FrontRays(mesh_tree(['HEAD_face'])).ray((133.0, 127.5))
    for name, side in TUCK_BALLS.items():
        obj = bpy.data.objects[name]
        W = er.world(obj)
        Lm = M.to_local(W) * 1000
        q = Lm.copy()
        if side > 0:
            q[:, 0] = -q[:, 0]                              # the left eye in right-eye design pixels
        u, v = er.camera_pixels('front', M.to_world(q / 1000))
        cx = np.interp(v, ys, xs)
        out = np.clip((cx - u) / cfg.get('fade_px', 0.4), 0, 1)
        rows = np.clip(np.minimum(v - ys[0], ys[-1] - v) / cfg.get('row_fade_px', 0.6) + 0.5, 0, 1)
        w = out * rows * ((v >= ys[0] - 1) & (v <= ys[-1] + 1))
        w = w * w * (3 - 2 * w)
        back = M.to_local(np.array([W[0] + d * 0.001]))[0] * 1000 - M.to_local(W[:1])[0] * 1000
        back = back / np.linalg.norm(back)
        if side > 0:
            back[0] = -back[0]
        Lm += w[:, None] * back[None] * cfg.get('depth_mm', 4.0)
        er.put_world(obj, M.to_world(Lm / 1000))
        print('EYE_TUCK', name, int((w > 0.01).sum()), 'vertices pushed back')
CANTHUS_FOLLOWERS = ['HEAD_eyes_12', 'HEAD_eyes_29']


def touched_names():
    names = ['HEAD_face'] + list(er.FACE_LAYER_NAMES) + CANTHUS_FOLLOWERS + list(TUCK_BALLS)
    for objs in (R, L):
        names += [objs['rim'], objs['liner']] + objs['lashes']
    return names


def lr_restore(drop=False):
    """Bring back every mesh this script changes, as it was before the first run (so runs never stack)."""
    count = 0
    for name in touched_names():
        obj = bpy.data.objects.get(name)
        if obj is not None and '_lr_visible_shadow' in obj:
            obj.visible_shadow = bool(obj['_lr_visible_shadow'])
            del obj['_lr_visible_shadow']
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
        for name in ('INKWAVE_lash_brown', 'INKWAVE_tearline_skin', 'INKWAVE_corner_fill_skin', SHADOW_IMAGE):
            mat = bpy.data.materials.get(name)
            if mat is not None and mat.users == 0:
                bpy.data.materials.remove(mat)
        img = bpy.data.images.get(SHADOW_IMAGE)
        if img is not None and img.users == 0:
            bpy.data.images.remove(img)
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
    tuck_eye_corner(design)
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
        if 'liner_tail' in d:
            tv, tf = build_liner_tail(rays, d)
            liner = (np.r_[liner[0], tv], list(liner[1]) + [tuple(i + len(liner[0]) for i in fc) for fc in tf])
        rim, _, edge = build_rim(rays, d)
        band = build_corner_band(rays, d)
        if 'lower_band' in d and edge is not None:
            lb = build_lower_band(rays, d, edge[0])
            band = lb if band is None else (np.r_[band[0], lb[0]], list(band[1]) + [tuple(i + len(band[0]) for i in fc) for fc in lb[1]])
        if band is not None:
            rim = (np.r_[rim[0], band[0]], list(rim[1]) + [tuple(i + len(rim[0]) for i in fc) for fc in band[1]])
        tear = build_tearline(rays, d, *edge) if edge is not None else None
        cw = [M.to_world(np.asarray(v) / 1000) for v, _ in (liner, rim)]
        cover = BVHTree.FromPolygons([Vector(v) for v in np.vstack(cw)],
                                     list(liner[1]) + [tuple(i + len(cw[0]) for i in f) for f in rim[1]])
        fill = build_corner_fill(rays, d, cover)
        shade = build_lash_shadow(rays, d, edge[0]) if edge is not None and 'lash_shadow' in d else None
        if args.shape_only:
            lashes = []
        elif 'fan' in d:
            lashes = [build_fan(rays, d, objs['eyeball'])]
        else:
            lashes = [build_lash(rays, d, spec) for spec in d['lashes']]
        # the lower lash dots sit on the corner fill where it is in front of the face
        lray = OverRays(rays, fill[:2]) if fill is not None else rays
        lower = None if args.shape_only else build_lower(lray, d, edge[0] if edge is not None else None)
        built.append([objs, liner, rim, lashes, lower, tear, shade, fill])
    verts, polys = [], []
    for _, liner, rim, _, _, _, _, _ in built:
        for v, f in (liner, rim):
            polys += [[i + sum(len(x) for x in verts) for i in fc] for fc in f]
            verts.append(M.to_world(np.asarray(v) / 1000))
    black = BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)
    for part, views, side in zip(built if design.get('side_corner') else [], (('sideR', 'q34R'), ('q34L', 'sideL')), (-1, 1)):
        sc_v, sc_f = build_side_corner(design, tree, views, side, black)
        if not sc_f:
            continue
        sv, sf = er.solid_sheet(sc_v, sc_f, LINER_THICK_MM * 0.6)
        v, f = part[1]
        part[1] = (np.r_[v, sv], list(f) + [tuple(i + len(v) for i in fc) for fc in sf])
    tear_mat = tearline_material(design['lid_edge'].get('tint', (1.0, 1.0, 1.0))) if 'lid_edge' in design else None
    shade_mat = None
    if 'lash_shadow' in design and 'lid_edge' in design:
        shade_mat = lash_shadow_material(lash_shadow_image(design, *built[0][6][3]))   # u -> design x (right eye)
    # the corner fill lies in the eye socket, where the face is shaded darker than the flat patch: its own tint
    fill_mat = None
    if 'corner_clip' in design and 'lid_edge' in design:
        t0 = design['lid_edge'].get('tint', (1.0, 1.0, 1.0))
        t1 = design.get('corner_fill_tint', (1.0, 1.0, 1.0))
        fill_mat = tearline_material([a * b for a, b in zip(t0, t1)], 'INKWAVE_corner_fill_skin')
        FILL_SKIN['solid_mm'] = design.get('corner_fill_solid_mm', 0.0)
        FILL_SKIN['face_normals'] = design.get('corner_fill_face_normals', False)
        if design.get('corner_fill_black'):
            # the reference frames the outer corner of the white in black: the patch is part of the black line,
            # so the white ends on the smooth clip curve and no skin patch shows
            fill_mat = mat
        if design.get('corner_fill_face_material'):
            fill_mat = bpy.data.materials['skin_b27050']        # the face's own skin (subsurface needs the solid)
    for objs, liner, rim, lashes, lower, tear, shade, fill in built:
        set_side(objs, liner, rim, lashes, lower, mat, brown, tear, tear_mat, shade, shade_mat, fill, fill_mat)
    remove_lower_paint()
    for objs in (R, L):
        decimate(bpy.data.objects[objs['liner']])
    save_and_export(args)
    print('LASH_REBUILD done', len(liner[0]), 'liner verts,', len(rim[0]), 'rim verts,', len(lashes), 'lashes')


if __name__ == '__main__':
    main()
