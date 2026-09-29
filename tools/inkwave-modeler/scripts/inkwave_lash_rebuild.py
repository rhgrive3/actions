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
DESIGN = er.ROOT / 'analysis/lash_rebuild/design.json'
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
UPPER_R_SCALE = 3.6
LOWER_LEN_MM = 2.6
LOWER_ROOT_MM = 0.6
LOWER_LIFT_MM = 0.3
LOWER_START_PX = 1.0
LOWER_LEAN = 0.45
MM_PER_PX = 1.1


def surface_tree():
    """Every visible head part near the eyes except the parts this script rebuilds."""
    own = set(R['lashes'] + L['lashes'] + [R['liner'], L['liner'], R['rim'], L['rim']])
    skip = {'FACE_FIT_ORIGINAL', 'HAIR', 'HEADGEAR', 'CLOTHES'}
    verts, polys = [], []
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.name in own or obj.hide_render or not obj.data.polygons:
            continue
        if not obj.name.startswith('HEAD_') or any(c.name in skip for c in obj.users_collection):
            continue
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


def mirror(points_mm):
    out = np.array(points_mm, float).copy()
    out[..., 0] *= -1
    return out


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


def corner_bottom(bot, join, rim_px):
    """The wing's lower edge runs straight down to the lower lid line, follows it a little way (over the skin
    wedge in the eye corner) and goes back up along the white of the eye to the old chain, so no skin shows
    between the wing, the lower line and the eyeball."""
    bot = bot.copy()
    k1 = int(np.argmax(bot[:, 1] > join[1] - 14.0))
    k2 = int(np.argmax(bot[:, 0] > join[0] + 6.0))
    along = rim_px[rim_px[:, 0] <= join[0] + 4.2]
    path = np.vstack([bot[k1], join, along, bot[k2] + [-1.9, 1.5], bot[k2]])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    t = np.linspace(0, seg[-1], k2 - k1 + 1)
    new = np.c_[np.interp(t, seg, path[:, 0]), np.interp(t, seg, path[:, 1])]
    bot[k1:k2 + 1] = new
    return bot


def build_liner(rays, design, bot, join):
    """Lofted ribbon between the reference top and bottom chains, lifted onto the skin with front rays."""
    top = np.array(design['liner_top'])
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
    # the skin can bulge forward between samples.  Away from the eye corner the nearest skin in a small pixel
    # neighbourhood limits how deep the ribbon may lie (this also keeps the wing over the scalp shell at the
    # temple).  In the steep eye corner that would float the ribbon off the skin, so there only a few sub-pixel
    # rays around each sample are used, plus a maximum gap.  The depth is smoothed and pushed back between the
    # limits after every pass, so it stays clear of the skin without lumps.
    pad = np.pad(hit, ((2, 2), (1, 1)), mode='edge')
    wide = np.min([pad[a:a + n, b:b + rows] for a in range(5) for b in range(3)], axis=0)
    x, y = px[:, :, 0] - join[0], px[:, :, 1] - join[1]
    corner = (x > -2.5) & (x < 7.0) & (y > -9.0)
    local = hit.copy()
    for i, j in zip(*np.nonzero(corner)):
        u, v = px[i, j]
        local[i, j] = min(rays.near(u + du, v + dv) for du in (-0.5, 0.0, 0.5) for dv in (-0.5, 0.0, 0.5))
    limit = np.where(corner, local, wide) - MIN_CLEAR_MM / 1000
    floor = np.where(corner, np.minimum(hit - MAX_FLOAT_MM / 1000, limit), -np.inf)
    depth = np.minimum(hit - LINER_LIFT_MM / 1000, limit)
    for _ in range(SMOOTH_ITERS):
        p = np.pad(depth, 1, mode='edge')
        depth = 0.4 * depth + 0.15 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
        depth = np.clip(depth, floor, limit)
    print('LINER gap mm: median %.2f  max %.2f' % (np.median(hit - depth) * 1000, (hit - depth).max() * 1000))
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
    return er.solid_sheet(verts, faces, LINER_THICK_MM)


def build_rim(rays, design, join, tip):
    """Lower lid line as a thin tapered round part resting on the skin (minus eye = right eye).  It starts
    under the wing, so the wing and the lower line are one connected line at the outer corner."""
    px = rim_pixels()
    d = (tip - join) / np.linalg.norm(tip - join)
    px = np.vstack([join + d * 2.5, join + d * 1.2, join, px])
    cast = [rays.ray(p) for p in px]
    origin = np.array([c[0] for c in cast])
    direction = np.array([c[1] for c in cast])
    hit = np.array([c[2] for c in cast])
    depth = er.smooth_rows(hit, 2.0)
    s = np.linspace(0, 1, len(px))
    r = design.get('rim_r_mm', 0.36) * (1 - s) ** 1.2 + design.get('rim_end_mm', 0.07)
    r *= np.clip((1 - s) / 0.10, 0.25, 1.0)
    depth = np.minimum(depth - (0.15 + 0.5 * r) / 1000, hit - 0.10 / 1000)
    pts = M.to_local(origin + direction * depth[:, None]) * 1000
    return er.tube(pts, r, sides=6), px


def build_lash(rays, spec):
    n = 14
    path_px = bezier(spec['root'], spec['mid'], spec['tip'], n)
    t = np.linspace(0, 1, n)
    lift = LASH_ROOT_LIFT_MM + (spec['lift_mm'] - LASH_ROOT_LIFT_MM) * t ** 1.5
    pts = np.array([rays.lifted(p, l) for p, l in zip(path_px, lift)])
    radius = np.maximum(UPPER_R_SCALE * spec['r_mm'] * (1 - t) ** 0.6, 0.04)
    return er.tube(pts, radius, sides=6)


def build_lower(rays, design, rim_px, join):
    """Short thick lower lashes along the lower lid line, starting at the wing corner: the reference spacing
    (measured along its lower line) is laid along the model's line from the corner; each lash leaves the line
    away from the eye and leans to the outer corner."""
    c = np.array([st['centre'] for st in design['lower']])
    gaps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))] + LOWER_START_PX
    line = rim_px[np.argmin(np.linalg.norm(rim_px - join, axis=1)):]
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))]
    verts, faces = [], []
    for g in gaps:
        root = np.array([np.interp(g, arc, line[:, 0]), np.interp(g, arc, line[:, 1])])
        k = min(int(np.searchsorted(arc, g)), len(line) - 1)
        tng = line[min(k + 1, len(line) - 1)] - line[max(k - 1, 0)]
        tng /= np.linalg.norm(tng)
        out = np.array([tng[1], -tng[0]])
        if out[1] < 0:
            out = -out
        d = out * np.cos(LOWER_LEAN) - tng * np.sin(LOWER_LEAN)
        length = LOWER_LEN_MM / MM_PER_PX
        tip = root + d * length
        mid = root + d * length * 0.5 - tng * length * 0.06
        n = 8
        path_px = bezier(root, mid, tip, n)
        t = np.linspace(0, 1, n)
        radius = np.maximum(LOWER_ROOT_MM * (1 - t) ** 0.6, 0.05)
        pts = np.array([rays.lifted(q, LOWER_LIFT_MM + r) for q, r in zip(path_px, radius)])
        v, f = er.tube(pts, radius, sides=6)
        faces += [tuple(i + len(verts) for i in fc) for fc in f]
        verts += list(v)
    return np.array(verts), faces


def set_side(objs, liner, rim, lashes, lower, mat, brown, flip):
    obj = bpy.data.objects[objs['rim']]
    er.back_up(obj)
    v, f = rim
    er.set_mesh(obj, mirror(v) if flip else v, f, mat, '_lr_rim')
    er.back_up(bpy.data.objects[objs['liner']])
    v, f = liner
    if flip:
        v = mirror(v)
    er.set_mesh(bpy.data.objects[objs['liner']], v, f, mat, '_lr_liner')
    for k, name in enumerate(objs['lashes']):
        obj = bpy.data.objects[name]
        er.back_up(obj)
        if k < len(lashes):
            v, f = lashes[k]
            if flip:
                v = mirror(v)
            er.set_mesh(obj, v, f, mat, '_lr_lash')
        elif k == len(lashes) and lower is not None:
            v, f = lower
            if flip:
                v = mirror(v)
            er.set_mesh(obj, v, f, brown, '_lr_lower')
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
    rays = FrontRays(surface_tree(), shell_tree())
    mat = er.lash_material()
    mat.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.0
    join = corner_join(rim_pixels())
    bot = corner_bottom(np.array(design['liner_bottom']), join, rim_pixels())
    up = bot[np.argmin(np.linalg.norm(bot - (join - [0.0, 4.0]), axis=1))]
    liner = build_liner(rays, design, bot, join)
    rim, rim_px = build_rim(rays, design, join, up)
    lashes = [] if args.shape_only else [build_lash(rays, spec) for spec in design['lashes']]
    lower = None if args.shape_only else build_lower(rays, design, rim_px, join)
    brown = brown_material()
    set_side(R, liner, rim, lashes, lower, mat, brown, False)
    set_side(L, liner, rim, lashes, lower, mat, brown, True)
    remove_lower_paint()
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save)
    print('LASH_REBUILD done', len(liner[0]), 'liner verts,', len(rim[0]), 'rim verts,', len(lashes), 'lashes')


if __name__ == '__main__':
    main()
