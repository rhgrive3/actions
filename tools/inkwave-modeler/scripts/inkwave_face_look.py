"""Face look pass on the Blender master: eyelids, nose, mouth, cheeks, jaw edge, decals, eyes and skin toward the
reference sheets (docs/face-refinement/README.md, chapter 7). Runs after scripts/inkwave_face_refine.py.

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_look.py -- \
  [--save blender/INKWAVE_CHARACTER_MASTER.blend] [--export blender/INKWAVE_CHARACTER_MASTER.glb] \
  [--game blender/INKWAVE_GAME.glb] [--restore] [--only lid,nose,...]

Every object, mesh, material and image this pass changes is first kept as an unexported copy named `<name>__prelook`
(fake user, not linked to the character). A run restores those copies and applies the pass again, so re-running is
exact; `--restore` only restores (the state scripts/inkwave_face_refine.py produced). inkwave_face_refine.py refuses
to run while the copies exist: restore first, refine, then run this pass again.

Steps (head space as in inkwave_face_refine.py: x = character's left, y = up, z = forward; metres):
  lid     HEAD_face around the eyes, rebuilt from one opening outline per eye (lid_upper / lid_lower): inside it
          the skin lies behind the eyeball, the lower lid leaves the eyeball at the outline and rolls into the cheek
          over lid_roll (bending-minimised band), the upper lid keeps the runtime shape; the eyeballs are refined and
          their hidden parts that came through the skin at the outer corners are tucked behind it (docs chapter 8).
  nose    rounder tip, alae and nostril dents (Gaussian pushes along the normal).
  cheek   apple of the cheek (the flat 3/4 cheek plane of the runtime head).
  mouth   the mouth is ~1.24x wider in the front sheet: the rings through the mouth are resampled along their own
          curve (the sculpted mouth slides outward on the skin), the mouth decals are widened with them, the
          mouth line is thicker and softer, the corners get a small dimple.
  jaw     softer edge under the chin and jaw (periodic Laplacian on the ring grid, front half only).
  profile side-view fixes at a level camera: chin ball forward/down, jaw angle lifted, brows lifted (more arch),
          liner wing tilted up past the outer corner (docs chapter 8.2).
  volume  lower cheek / jaw side pulled toward the head axis at ~58 deg (3/4 width), front silhouette pushed back out
          after the gonial lift, nose tip volume, columella and upper lip forward, chin rounded (docs chapter 9).
  decals  blush and under-nose shading use the runtime radial alpha map (lost in the migration) and are subdivided
          and laid on the skin (the coarse runtime blush intersected the face: mottled cheeks); every other face
          decal follows the face edit; liner and lower-lash vertices the lid edit buried are put back on the skin.
  eyes    iris texture regraded (greener teal, dark under the upper lid, catchlights like the reference), matte
          lashes and liner, 2 interpolated lashes between neighbouring upper lashes.
  skin    skin 15 % lighter, rougher, less coat; lip decal less glossy; darker brows; stronger nostrils.
  stud    the nose stud of HEADGEAR_headgear (not in the reference) is removed.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inkwave_face_refine as fr  # noqa: E402
from inkwave_face_fold_refine import GRID, transfer  # noqa: E402

STEPS = ('lid', 'nose', 'cheek', 'mouth', 'jaw', 'profile', 'volume', 'bridge', 'decals', 'eyes', 'skin', 'stud')
PRE = '__prelook'
P = {
    # Eye opening outline of the +x eye (mirrored), head space mm, inner corner -> outer corner. Lower lid: the lid
    # line where the runtime skin met the eyeball (x < 53), the top edge of the lower lash decal (HEAD_eyes_17,
    # 54-66) and 0.3 mm above the lower lash roots (HEAD_eyes_13-16); upper lid: 0.4 mm below the lower edge of the
    # liner (HEAD_eyes_03), which covers the lid margin. The outer corner is held at x = 74 mm: further out the
    # eyeball surface turns edge-on (67 deg at 76.5 mm) and flat skin triangles cannot follow it (white teeth).
    'lid_lower': [(26.5, -23.2), (28.8, -25.5), (32.7, -26.9), (36.9, -27.6), (41.4, -27.7), (46.0, -27.3),
                  (50.6, -26.9), (54.0, -26.7), (58.0, -25.4), (62.0, -23.7), (66.0, -21.2), (68.5, -20.3),
                  (70.0, -18.8), (72.0, -15.2), (73.4, -12.6), (74.0, -11.0)],
    'lid_upper': [(26.5, -23.2), (28.0, -19.5), (30.0, -15.5), (34.0, -10.5), (38.0, -7.4), (42.0, -5.5),
                  (46.0, -4.5), (50.0, -3.9), (54.0, -3.6), (58.0, -3.9), (62.0, -4.8), (66.0, -6.1),
                  (70.0, -7.8), (72.5, -9.4), (74.0, -11.0)],
    'lid_corner_fade': 0.004, 'lid_slope': 0.45, 'lid_slope_in': 0.8, 'lid_gap_max': 0.0015, 'lid_roll': 0.014,
    'lid_cover': 0.0003, 'lid_edge_band': 0.0006, 'lid_bending_iters': 3000, 'lid_tuck_outside': 0.0008, 'lid_tuck_gap': 0.0003, 'eyeball_subdiv': 2,
    'corner_pts': [(0.024, -0.024), (0.027, -0.028), (0.031, -0.030)], 'corner_sigma': 0.003, 'corner_iters': 30,
    # (x, y, sigma_x, sigma_y, mm along the normal); x > 0 is mirrored
    'nose': [(0.0, -0.0485, 0.0058, 0.0052, 1.8), (0.009, -0.052, 0.0036, 0.0036, 1.3), (0.0055, -0.0548, 0.0022, 0.0018, -1.5)],
    'cheek': [(0.043, -0.049, 0.016, 0.013, 1.8)],
    'mouth_k': 1.2, 'mouth_sy': 0.007, 'mouth_x0': 0.022, 'mouth_x1': 0.040, 'mouth_line_thick': 1.5,
    'dimple_mm': -0.7, 'dimple_sx': 0.0022, 'dimple_sy': 0.0028,
    'jaw_pts': [(0.0, -0.100), (0.02, -0.097), (0.035, -0.090), (0.05, -0.078)], 'jaw_sigma': 0.008, 'jaw_iters': 25,
    # Profile: in the side sheet (fitted with a level camera on pupil, brow, nose, mouth corner and lower lip) the
    # front of the chin lies ~6 px (~7 mm) further forward and ~18 mm below the lower lip; the model chin slopes back
    # right under the lip. A forward chin ball, a little lower (the front sheet's chin bottom must stay).
    'chin_ball_mm': 5.5, 'chin_ball_down_mm': 2.5, 'chin_ball_y': -0.096, 'chin_ball_sx': 0.017, 'chin_ball_sy': 0.011,
    # Jaw curve: in the side sheet the jaw rises in a curve from the chin to a high jaw angle under the ear; the
    # model jaw is a long flat plane. Lift the lateral under-jaw toward the angle (the chin itself stays).
    'jaw_lift_mm': 3.5, 'jaw_lift_x0': 0.018, 'jaw_lift_x1': 0.048, 'jaw_lift_y': -0.088, 'jaw_lift_sy': 0.014,
    'jaw_lift_z0': -0.035, 'jaw_lift_z1': 0.075,
    # Brow-to-eye gap: the brows sit higher above the eyes in the side sheet, and the brow tail is ~5 px higher in the
    # front sheet as well: lift the brows, more at the tail (more arch). Each vertex keeps its height above the skin.
    'brow_lift_inner_mm': 1.5, 'brow_lift_outer_mm': 4.5, 'brow_x_inner': 0.012, 'brow_x_outer': 0.080,
    # Outer eye corner: the reference liner wing sweeps up toward the brow tail (cat-eye); tilt the liner up past the
    # outer corner of the opening (lid shape unchanged).
    'wing_x0': 0.068, 'wing_slope': 0.22,
    'lower_lash_scale': 0.55,
    # Gonial angle: the lateral jaw runs flat back to z ~ 0 at y ~ -83 mm before it turns up (too far back and too
    # low). Lift it and bring it forward behind gonion_z0 so the jaw turns up earlier; the chin (|x| < gonion_x0),
    # the ear/cheek (y > gonion_y0) and the nape (z < gonion_zb1) do not move.
    'gonion_up_mm': 4.0, 'gonion_fwd_mm': 3.5, 'gonion_out_mm': 3.0, 'gonion_z0': 0.045, 'gonion_z1': 0.010, 'gonion_zb0': -0.020,
    'gonion_zb1': -0.055, 'gonion_x0': 0.022, 'gonion_x1': 0.045, 'gonion_y0': -0.025, 'gonion_y1': -0.075, 'gonion_smooth_iters': 20,
    # Volume (3/4 sheet: the lower face reads wide and heavy). The lower cheek / jaw side is pulled toward the head's
    # vertical axis with a smooth weight in the angle around that axis: none at the front (0 deg) and at the side
    # (90 deg, the front silhouette: the front jaw is already ~3 mm narrower than the sheet), most at side_peak.
    'side_in_mm': 0.0, 'side_y0': -0.035, 'side_y1': -0.055, 'side_y2': -0.090, 'side_y3': -0.110,
    'side_a0': 25.0, 'side_peak': 58.0, 'side_a1': 88.0,
    # The lifted gonial angle narrows the front silhouette at the jaw rows (the front sheet's lower face is a round U):
    # push the pure-side surface (angle ~90 deg) back out just above the jaw line.
    'round_out_mm': 0.0, 'round_y0': -0.045, 'round_y1': -0.062, 'round_y2': -0.082, 'round_y3': -0.098,
    'round_a0': 70.0, 'round_peak': 92.0, 'round_a1': 115.0,
    # Mandible width (front sheet, left/right-averaged contour: the lower jaw sides at |x| ~45 mm, y ~ -87 mm are 3-4 px
    # inside after the gonial lift; the chin sides 1-2 px): push the mandible body out sideways, smoothly in 3-D, at
    # the height of the jaw body only (the raised gonial angle keeps its height; the chin point does not move).
    'mand_out_mm': 5.0, 'mand_y': -0.082, 'mand_sy': 0.016, 'mand_x0': 0.012, 'mand_x1': 0.042,
    'mand_z0': -0.030, 'mand_z1': 0.000,
    # Nose tip, columella and upper lip project more (head-space forward; x, y, sigma_x, sigma_y, mm).
    # Side-sheet rhythm (edge per row, relative to the nose tip): the tip projects too little over the subnasale and
    # the upper lip sits 1-2 px back; the chin already follows.
    'front_push': [(0.0, -0.0535, 0.0070, 0.0035, 0.5), (0.0, -0.0610, 0.0140, 0.0055, 2.2)],
    # the 54 deg side sheet sees the far side of the nose, not its midline: the tip also gains volume along its normal
    'nose_volume': [(0.0, -0.0475, 0.0070, 0.0060, 1.8)],
    # Forehead -> nose line (side sheet at the re-estimated camera): the brow ridge / lower forehead lies 6-9 px
    # (~8-11 mm) further forward in the reference and recedes later; the nasion stays, so the dip before the nose
    # appears. Forward push around the midline, zero at the eyes (y < fh_y0) and above the hairline (y > fh_y3).
    'fh_mm': 7.0, 'fh_y0': 0.004, 'fh_y1': 0.022, 'fh_y2': 0.028, 'fh_y3': 0.060, 'fh_sx': 0.038, 'fh_z0': -1.0, 'fh_z1': -0.9,
    # Forehead -> radix -> bridge -> tip as ONE midline curve (head-space y, z in mm): the midline is moved to a smooth
    # target through these points (linear between them, then Gaussian-smoothed along y), fading out above and below;
    # sideways the change follows the width of the form at that height (forehead wide, bridge narrow).
    'bridge_curve': [(36.0, None), (28.0, 100.3), (20.0, 103.1), (8.0, 103.2), (-4.0, 102.4), (-14.0, 101.5),
                     (-22.0, 100.9), (-27.0, 101.0), (-31.0, 102.4), (-35.0, 106.8), (-39.0, 112.8), (-42.0, 116.4),
                     (-45.0, 118.4), (-48.0, 118.2), (-53.0, None)],
    'bridge_smooth_mm': 2.0,
    'bridge_width': [(34.0, 32.0), (18.0, 24.0), (4.0, 15.0), (-20.0, 13.0), (-40.0, 11.0), (-52.0, 10.0)],
    'bridge_eye_x': 0.021,
    # Triangle brow-level forehead / radix / tip (side sheet; off by default, see docs chapter 12): the reference radix sits ~6 px behind the forehead
    # (forehead leans 9 deg forward over it). At that height the silhouette is made by the skin 7-11 mm off the
    # midline, so the radix is recessed across the space between the eyes, and the brow-level forehead comes forward.
    'radix_mm': 0.0, 'radix_y': -0.024, 'radix_sy': 0.008, 'radix_sx': 0.020,
    'browfh_mm': 0.0, 'browfh_y': 0.012, 'browfh_sy': 0.008, 'browfh_sx': 0.030,   # |x| beyond which the change fades to zero (inner eye corners, lids stay)
    # tiny chin finish: the front sheet's chin is rounder and a little wider than the tapered jaw now makes it
    'chin_round_mm': 3.5, 'chin_round_y': -0.094, 'chin_round_sy': 0.010, 'chin_round_x': 0.022, 'chin_round_sx': 0.015,
    'blush_amount': 0.32, 'blush_subdiv': 2, 'blush_off': 0.0003,
}
MOUTH_DECALS = ('HEAD_skin_08', 'HEAD_skin_09')
BLUSH = ('HEAD_skin', 'HEAD_skin_04')
UNDERNOSE = 'HEAD_skin_07'
UPPER_LASHES = ([f'HEAD_eyes_{i:02d}' for i in range(5, 12)], [f'HEAD_eyes_{i:02d}' for i in range(22, 29)])
IRIS = {'Image_0': (184.5, 134.0), 'Image_1': (198.5, 134.0)}  # iris centre (px, PNG rows top first), 384 x 273
IRIS_R = (93.5, 85.0)


def args():
    p = argparse.ArgumentParser()
    p.add_argument('--save', type=Path)
    p.add_argument('--export', type=Path)
    p.add_argument('--game', type=Path)
    p.add_argument('--restore', action='store_true')
    p.add_argument('--only', default=','.join(STEPS))
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


# ---------------------------------------------------------------- prelook copies (idempotent re-runs, --restore)
def keep_mesh(obj):
    if bpy.data.meshes.get(obj.data.name + PRE) is None:
        c = obj.data.copy(); c.name = obj.data.name + PRE; c.use_fake_user = True


def keep_material(mat):
    if bpy.data.materials.get(mat.name + PRE) is None:
        c = mat.copy(); c.name = mat.name + PRE; c.use_fake_user = True


def keep_image(img):
    if bpy.data.images.get(img.name + PRE) is None:
        w, h = img.size
        c = bpy.data.images.new(img.name + PRE, w, h, alpha=True)
        c.colorspace_settings.name = img.colorspace_settings.name  # before the pixels: it regenerates the buffer
        px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px); c.pixels.foreach_set(px)
        c.pack(); c.use_fake_user = True


def restore():
    n = 0
    for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
        keep = bpy.data.meshes.get(obj.data.name + PRE)
        if keep is not None:
            old, name = obj.data, obj.data.name
            obj.data = keep; keep.use_fake_user = False
            bpy.data.meshes.remove(old); keep.name = name; n += 1
    for keep in [m for m in bpy.data.materials if m.name.endswith(PRE)]:
        name = keep.name[:-len(PRE)]
        cur = bpy.data.materials.get(name)
        if cur is not None:
            cur.user_remap(keep); bpy.data.materials.remove(cur)
        keep.use_fake_user = False; keep.name = name; n += 1
    for keep in [i for i in bpy.data.images if i.name.endswith(PRE)]:
        cur = bpy.data.images.get(keep.name[:-len(PRE)])
        if cur is not None:
            w, h = keep.size
            px = np.empty(w * h * 4, np.float32); keep.pixels.foreach_get(px)
            if tuple(cur.size) != (w, h):
                cur.scale(w, h)
            cur.pixels.foreach_set(px); cur.pack()
        bpy.data.images.remove(keep); n += 1
    scalp = bpy.data.objects.get('HAIR_scalp')  # the followed scalp shell goes back to its own base
    if scalp is not None and SCALP_BASE in scalp.data.attributes:
        co = np.empty(len(scalp.data.vertices) * 3, np.float32)
        scalp.data.attributes[SCALP_BASE].data.foreach_get('vector', co)
        scalp.data.vertices.foreach_set('co', co); scalp.data.attributes.remove(scalp.data.attributes[SCALP_BASE])
        scalp.data.update(); n += 1
    for name in ('INKWAVE_BLUSH_ALPHA', 'INKWAVE_UNDERNOSE_ALPHA'):
        if bpy.data.images.get(name) is not None and bpy.data.images[name].users == 0:
            bpy.data.images.remove(bpy.data.images[name])
    return n


# ---------------------------------------------------------------- helpers
def get(obj):
    c = np.empty(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('co', c)
    return c.reshape(-1, 3).astype(np.float64)


def put(obj, w):
    keep_mesh(obj)
    obj.data.vertices.foreach_set('co', w.astype(np.float32).ravel()); obj.data.update()


def face():
    return bpy.data.objects['HEAD_face']


def face_grid():
    w = get(face()); q = fr.to_local(w)
    return w, q, q.reshape(GRID + (3,)).copy()


def put_grid(w, q, g):
    put(face(), w + fr.to_world_delta(g.reshape(-1, 3) - q))


def bvh_local(names):
    verts, polys = [], []
    for nm in names:
        o = bpy.data.objects[nm]; base = len(verts)
        verts += [Vector(v) for v in fr.to_local(get(o))]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def eye_depth():
    bvh = bvh_local(['HEAD_eyes', 'HEAD_eyes_18'])

    def ez(x, y):
        h = bvh.ray_cast(Vector((x, y, 0.3)), Vector((0, 0, -1)))
        return h[0].z if h[0] is not None else None
    return ez


def eye_region(g):
    return lambda r, c: 0.015 < abs(g[r, c, 0]) < 0.09 and g[r, c, 2] > 0.03


def mirrored(pts):
    return list(pts) + [(-x, y) for x, y in pts if x]


def grid_smooth(centres, sigma, iters, lam=0.5, zmin=0.05):
    """Masked Laplacian smoothing on the ring grid (columns periodic: 176 repeats 0)."""
    w, q, g = face_grid()
    m = np.zeros(GRID)
    for cx, cy in centres:
        m = np.maximum(m, np.exp(-((g[..., 0] - cx) ** 2 + (g[..., 1] - cy) ** 2) / (2 * sigma ** 2)))
    m *= g[..., 2] > zmin
    m[m < 0.02] = 0
    g0 = g.copy()
    for _ in range(iters):
        u = g[:, :-1]
        lap = np.zeros_like(u)
        lap[1:-1] = (u[:-2] + u[2:] + np.roll(u, 1, 1)[1:-1] + np.roll(u, -1, 1)[1:-1]) / 4 - u[1:-1]
        g[:, :-1] = u + lam * m[:, :-1, None] * lap
        g[:, -1] = g[:, 0]
    put_grid(w, q, g)
    return float(np.abs(g - g0).max())


def normal_bumps(bumps):
    obj = face(); w = get(obj); q = fr.to_local(w)
    n = np.empty(len(q) * 3, np.float32); obj.data.vertices.foreach_get('normal', n); n = n.reshape(-1, 3).astype(float)
    nl = np.c_[n[:, 0], n[:, 2], -n[:, 1]] @ fr.HEAD_R
    if len(q) == GRID[0] * GRID[1]:  # the ring grid's columns 0 and 176 coincide: one normal for both (no crack)
        g = nl.reshape(GRID + (3,)); avg = g[:, 0] + g[:, -1]
        avg /= np.linalg.norm(avg, axis=1, keepdims=True) + 1e-12
        g[:, 0] = g[:, -1] = avg; nl = g.reshape(-1, 3)
    d = np.zeros(len(q))
    for x, y, sx, sy, mm in bumps:
        for xs in ((x, -x) if x else (0.0,)):
            d += mm / 1000 * np.exp(-((q[:, 0] - xs) / sx) ** 2 - ((q[:, 1] - y) / sy) ** 2)
    d *= q[:, 2] > 0.04
    put(obj, w + fr.to_world_delta(nl * d[:, None]))
    return round(float(np.abs(d).max() * 1000), 3)


# ---------------------------------------------------------------- lid
def chaikin(pts, n=3):
    pts = np.asarray(pts, float)
    for _ in range(n):
        q = 0.75 * pts[:-1] + 0.25 * pts[1:]
        r = 0.25 * pts[:-1] + 0.75 * pts[1:]
        pts = np.vstack([pts[:1], np.column_stack([q, r]).reshape(-1, 2), pts[-1:]])
    return pts


def eye_outline():
    """Closed outline of the +x eye opening (head space, m) and, per outline point, 1 on the lower lid, 0 on the
    upper lid (fading over the corners)."""
    low = chaikin(np.array(P['lid_lower']) / 1000)
    up = chaikin(np.array(P['lid_upper']) / 1000)
    ring = np.vstack([low, up[::-1][1:-1]])
    lower = np.r_[np.ones(len(low)), np.zeros(len(up) - 2)]
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(low, axis=0), axis=1))]
    fade = np.clip(np.minimum(arc, arc[-1] - arc) / P['lid_corner_fade'], 0, 1)
    lower[:len(low)] = fade * fade * (3 - 2 * fade)
    return ring, lower


def signed_distance(pts, ring, lower):
    """Signed distance (m, + inside) of 2-D points to the closed outline, and the lower-lid weight of the nearest
    outline point."""
    a, b = ring, np.roll(ring, -1, 0)
    ab = b - a
    t = np.clip(((pts[:, None] - a[None]) * ab[None]).sum(2) / (ab ** 2).sum(1)[None], 0, 1)
    near = a[None] + t[..., None] * ab[None]
    dist = np.linalg.norm(pts[:, None] - near, axis=2)
    k = dist.argmin(1)
    d = dist[np.arange(len(pts)), k]
    wl = lower[k] * (1 - t[np.arange(len(pts)), k]) + np.roll(lower, -1)[k] * t[np.arange(len(pts)), k]
    x, y = pts[:, 0:1], pts[:, 1:2]
    cross = ((a[None, :, 1] > y) != (b[None, :, 1] > y)) & (x < a[None, :, 0] + (y - a[None, :, 1]) * ab[None, :, 0] / (ab[None, :, 1] + 1e-12))
    inside = cross.sum(1) % 2 == 1
    return np.where(inside, d, -d), wl


def lid():
    """Rebuild the skin around both eye openings from one outline per eye (P['lid_lower'] / P['lid_upper'], measured
    on the liner, the lower lash decal and the lower lash roots): inside the outline the skin lies behind the eyeball
    (so no skin sliver or ledge splits the white), outside it covers the eyeball (no white outside the lids); on the
    lower lid the skin leaves the eyeball at the outline with slope lid_slope and rolls into the cheek over
    lid_roll; the gap to the eyeball (not the depth) is a smooth function of the distance to the outline, so the
    lid line is the outline itself and not a stair of grid rings; last a constrained smoothing removes bumps."""
    rep = {}
    rep['corner_smooth_mm'] = round(grid_smooth(mirrored(P['corner_pts']), P['corner_sigma'], P['corner_iters']) * 1000, 3)
    w, q, g = face_grid()
    ez = eye_depth()
    ring, lower = eye_outline()
    flat = g.reshape(-1, 3)
    region = (np.abs(flat[:, 0]) > 0.012) & (np.abs(flat[:, 0]) < 0.10) & (flat[:, 1] > -0.06) & (flat[:, 1] < 0.02) & (flat[:, 2] > 0.02)
    idx = np.where(region)[0]
    pts = np.c_[np.abs(flat[idx, 0]), flat[idx, 1]]
    d, wl = signed_distance(pts, ring, lower)
    def depth(xs, ys):
        v = [ez(a, b) for a, b in zip(xs, ys)]
        return np.array([np.nan if e is None else e for e in v], float)
    h = 0.0003
    E = depth(flat[idx, 0], flat[idx, 1])
    gx = (depth(flat[idx, 0] + h, flat[idx, 1]) - depth(flat[idx, 0] - h, flat[idx, 1])) / (2 * h)
    gy = (depth(flat[idx, 0], flat[idx, 1] + h) - depth(flat[idx, 0], flat[idx, 1] - h)) / (2 * h)
    steep = np.sqrt(1 + np.nan_to_num(gx ** 2 + gy ** 2, nan=0.0))  # 1/cos of the eyeball slope
    has = ~np.isnan(E)
    z0 = flat[idx, 2].copy()
    s_out, s_in = P['lid_slope'] * steep, P['lid_slope_in'] * steep
    roll = P['lid_roll']
    u = np.maximum(-d, 0)
    inner = np.where(has, np.minimum(z0, E - np.clip(s_in * d, 0, P['lid_gap_max'])), z0)
    edge = E + s_out * u                                   # the lid leaves the eyeball at the outline
    fixed_in = d > 0
    fixed_edge = has & (d <= 0) & (u < P['lid_edge_band'])
    fixed_out = (d <= 0) & (u >= roll)  # below the eyeball's outline the band is free too (no E needed there)
    z = np.where(fixed_in, inner, np.where(fixed_edge, edge, z0))
    free = ~(fixed_in | fixed_edge | fixed_out)
    # start the free band on a smoothstep between the edge and the old surface, then minimise bending
    t = np.clip((u - P['lid_edge_band']) / np.maximum(roll - P['lid_edge_band'], 1e-6), 0, 1)
    z = np.where(free & has, (1 - t * t * (3 - 2 * t)) * (E + s_out * u) + t * t * (3 - 2 * t) * z0, z)
    zz = flat[:, 2].copy(); zz[idx] = np.nan_to_num(z, nan=0.0) + np.where(np.isnan(z), flat[idx, 2], 0)
    F = np.zeros(len(flat), bool); F[idx] = free
    LO = np.full(len(flat), -np.inf); LO[idx] = np.where(has & (d <= 0), E + P['lid_cover'], -np.inf)
    Z = zz.reshape(GRID); F = F.reshape(GRID); LO = LO.reshape(GRID)

    def lap(A):
        U = A[:, :-1]
        out = np.zeros_like(A)
        out[1:-1, :-1] = (U[:-2] + U[2:] + np.roll(U, 1, 1)[1:-1] + np.roll(U, -1, 1)[1:-1]) / 4 - U[1:-1]
        out[:, -1] = out[:, 0]
        return out
    for _ in range(P['lid_bending_iters']):
        Z = np.where(F, np.maximum(Z - 0.12 * lap(lap(Z)), LO), Z)
        Z[:, -1] = Z[:, 0]
    # upper lid: the runtime lid stays (the liner and lashes sit on it), only never behind the eyeball; the lower-lid
    # solution above is used where the nearest outline point is on the lower lid, blended over the corners
    upper = np.where(fixed_in, inner, np.where(has, np.maximum(z0, E + P['lid_cover'] * steep), z0))
    zl = Z.reshape(-1)[idx]
    Z.reshape(-1)[idx] = wl * zl + (1 - wl) * upper
    Z[:, -1] = Z[:, 0]
    new = g.copy(); new[..., 2] = Z
    put_grid(w, q, new)
    rep['eyeball_tucked'] = eyeball_tuck(ring, lower)
    moved = np.abs(Z - g[..., 2])
    rep.update({'outline_points': len(ring), 'vertices_in_region': int(len(idx)), 'inside_vertices': int((d > 0).sum()),
                'max_move_mm': round(float(moved.max() * 1000), 3)})
    return rep


def eyeball_tuck(ring, lower):
    """The eyeball ellipsoids reach past the skin at the outer corners, where their side is edge-on to the front
    (the runtime hid this behind lashes; it shows as a white strip with teeth). Every eyeball vertex outside the
    opening (lid_tuck_outside beyond the outline) that is not behind the skin is pulled toward the eyeball centre
    until it is lid_tuck_gap behind the skin. Only hidden eyeball surface moves."""
    skin = bvh_local(['HEAD_face'])
    out = {}
    for name in ('HEAD_eyes', 'HEAD_eyes_18'):  # sclera + iris; the cornea shell (alpha 0.01) is left alone
        obj = bpy.data.objects[name]
        c = fr.to_local(get(obj)).mean(0)
        subdivide(obj, P['eyeball_subdiv'], smooth=1.0)  # ~2 mm facets would cut the lid line in visible steps
        w = get(obj); q = fr.to_local(w); new = q.copy()
        d, _ = signed_distance(np.c_[np.abs(q[:, 0]), q[:, 1]], ring, lower)
        n = 0

        def behind(p, gap):
            h = skin.ray_cast(Vector((p[0], p[1], 0.3)), Vector((0, 0, -1)))
            return h[0] is None or p[2] <= h[0].z - gap
        for i in np.where(d < -P['lid_tuck_outside'])[0]:
            if behind(q[i], 0.0):  # already covered by the skin (the lid rule keeps a margin near the outline)
                continue
            lo, hi = 0.0, 1.0  # c + t (v - c): t = 0 is deep inside the head
            for _ in range(20):
                mid = (lo + hi) / 2
                if behind(c + mid * (q[i] - c), P['lid_tuck_gap']):
                    lo = mid
                else:
                    hi = mid
            new[i] = c + lo * (q[i] - c); n += 1
        if n:
            put(obj, w + fr.to_world_delta(new - q))
        out[name] = n
    return out


# ---------------------------------------------------------------- mouth
def mouth_y():
    m = fr.to_local(get(bpy.data.objects['HEAD_skin_09']))
    return float(m[np.abs(m[:, 0]) < 0.004, 1].mean()), m


def mouth_weights(x, y, ym):
    t = np.clip((np.abs(x) - P['mouth_x0']) / (P['mouth_x1'] - P['mouth_x0']), 0, 1)
    return (1 - t * t * (3 - 2 * t)) * np.exp(-((y - ym) / P['mouth_sy']) ** 2)


def mouth_face(ym):
    """Resample the rings through the mouth along their own curve: features slide outward by mouth_k."""
    w, q, g = face_grid(); new = g.copy(); k = P['mouth_k']
    for r in range(GRID[0]):
        if np.exp(-((g[r, 0, 1] - ym) / P['mouth_sy']) ** 2) < 0.01:
            continue
        for cols in (np.arange(0, 60), np.r_[0, np.arange(175, 116, -1)]):
            pts = g[r, cols]
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
            wgt = mouth_weights(pts[:, 0], pts[:, 1], ym)
            src = s - (s - s / k) * wgt
            for i in range(1, len(cols)):
                j = min(max(int(np.searchsorted(s, src[i])), 1), len(s) - 1)
                t = (src[i] - s[j - 1]) / max(s[j] - s[j - 1], 1e-9)
                new[r, cols[i]] = pts[j - 1] * (1 - t) + pts[j] * t
    new[:, 176] = new[:, 0]
    put_grid(w, q, new)
    return round(float(np.abs(new - g).max() * 1000), 3)


def mouth_decals(ym, face_before_local):
    """Widen the mouth decals like the face (forward map), thicken the mouth line, lay them back on the face with
    their original height above the skin."""
    before = BVHTree.FromPolygons([Vector(v) for v in face_before_local], [list(p.vertices) for p in face().data.polygons])
    after = bvh_local(['HEAD_face'])
    k, rep = P['mouth_k'], {}
    for name in MOUTH_DECALS:
        obj = bpy.data.objects[name]; w = get(obj); q = fr.to_local(w); new = q.copy()
        off = np.array([(Vector(v) - before.find_nearest(Vector(v))[0]).dot(before.find_nearest(Vector(v))[1]) for v in q])
        if name == 'HEAD_skin_09':
            coef = np.polyfit(q[:, 0], q[:, 1], 4)
            yc = np.polyval(coef, q[:, 0])
            new[:, 1] = yc + (q[:, 1] - yc) * P['mouth_line_thick']
        new[:, 0] = q[:, 0] * (1 + (k - 1) * mouth_weights(q[:, 0] * k, q[:, 1], ym))
        for i, v in enumerate(new):
            hit = after.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
            if hit[0] is not None:
                new[i] = np.array(hit[0]) + np.array(hit[1]) * max(off[i], 0.0002)
        put(obj, w + fr.to_world_delta(new - q))
        rep[name] = round(float(np.abs(new - q).max() * 1000), 3)
    return rep


# ---------------------------------------------------------------- decals
def radial_image(name, rgb, stops, size=256):
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.new(name, size, size, alpha=True)
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(xx + 0.5 - size / 2, yy + 0.5 - size / 2) / (size / 2)
    px = np.empty((size, size, 4), np.float32)
    px[..., :3] = rgb
    px[..., 3] = np.interp(r, *zip(*stops))
    img.colorspace_settings.name = 'sRGB'  # before the pixels: it regenerates a generated image's buffer
    img.pixels.foreach_set(px.ravel()); img.pack()
    return img


def textured_alpha(mat, img, rough):
    keep_material(mat)
    t = mat.node_tree
    bsdf = next(n for n in t.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next((n for n in t.nodes if n.type == 'TEX_IMAGE'), None) or t.nodes.new('ShaderNodeTexImage')
    tex.image, tex.extension = img, 'CLIP'
    t.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    t.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Alpha'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = rough
    mat.surface_render_method = 'BLENDED'


def subdivide(obj, levels, smooth=0.0):
    keep_mesh(obj)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    for _ in range(levels):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=smooth)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data); bm.free()
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.update()


def conform(names, offset, only_below=None):
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(face(), dg)
    out = {}
    for nm in names:
        obj = bpy.data.objects[nm]; keep_mesh(obj); n = 0
        for v in obj.data.vertices:
            loc, nrm, _, _ = bvh.find_nearest(v.co)
            if loc is not None and (only_below is None or (v.co - loc).dot(nrm) < only_below):
                v.co = loc + nrm * offset; n += 1
        obj.data.update(); out[nm] = n
    return out


def bridge_curve():
    """Rework the midline profile from forehead to nose tip toward one smooth target curve (P['bridge_curve'])."""
    obj = face(); w = get(obj); q = fr.to_local(w); G = q.reshape(GRID + (3,))
    mid = G[:, 0]                                     # column 0 = the front midline, rings bottom -> top
    order = np.argsort(mid[:, 1]); my, mz = mid[order, 1] * 1000, mid[order, 2] * 1000
    front = mz > 60; my, mz = my[front], mz[front]
    ys = np.arange(-60.0, 45.0, 0.25)
    z_now = np.interp(ys, my, mz)
    pts = P['bridge_curve']
    ctrl_y = [y for y, z in pts]; ctrl_d = [0.0 if z is None else z - np.interp(y, my, mz) for y, z in pts]
    order2 = np.argsort(ctrl_y)
    dz = np.interp(ys, np.array(ctrl_y)[order2], np.array(ctrl_d)[order2], left=0.0, right=0.0)
    sig = P['bridge_smooth_mm'] / 0.25; k = np.arange(-int(4 * sig), int(4 * sig) + 1)
    ker = np.exp(-0.5 * (k / sig) ** 2); ker /= ker.sum()
    dz = np.convolve(dz, ker, mode='same')
    wy, wv = zip(*sorted(P['bridge_width']))
    yv = q[:, 1] * 1000
    d = np.interp(yv, ys, dz, left=0.0, right=0.0) / 1000
    width = np.interp(yv, wy, wv) / 1000
    t = np.clip((P['bridge_eye_x'] - np.abs(q[:, 0])) / 0.006, 0, 1)
    eyes_w = np.where(yv > 14, 1.0, t * t * (3 - 2 * t))   # the forehead may be wide; near the eyes stay inside
    wgt = np.exp(-(q[:, 0] / width) ** 2) * eyes_w * (q[:, 2] > 0.05)
    dl = np.zeros_like(q); dl[:, 2] = d * wgt
    t2 = np.clip((P['bridge_eye_x'] - np.abs(q[:, 0])) / 0.006, 0, 1)
    dl[:, 2] += (P['radix_mm'] / 1000 * np.exp(-((q[:, 1] - P['radix_y']) / P['radix_sy']) ** 2 - (q[:, 0] / P['radix_sx']) ** 2)
                 * t2 * t2 * (3 - 2 * t2) * (q[:, 2] > 0.05))
    dl[:, 2] += (P['browfh_mm'] / 1000 * np.exp(-((q[:, 1] - P['browfh_y']) / P['browfh_sy']) ** 2 - (q[:, 0] / P['browfh_sx']) ** 2)
                 * (q[:, 2] > 0.05))
    skin_before = bvh_local(['HEAD_face'])
    put(obj, w + fr.to_world_delta(dl)); skin_after = bvh_local(['HEAD_face'])
    for nm in ('HEAD_brows', 'HEAD_brows_02', 'HEAD_eyes_12', 'HEAD_eyes_29', 'HEAD_eyes_03', 'HEAD_eyes_20',
               'HEAD_skin_03', 'HEAD_skin_06', 'HEAD_skin_07'):
        o2 = bpy.data.objects[nm]; w2 = get(o2); q2 = fr.to_local(w2); new = q2.copy()
        for i, v in enumerate(q2):
            h0 = skin_before.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
            h1 = skin_after.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
            if h0[0] is not None and h1[0] is not None:
                new[i, 2] = v[2] + (h1[0].z - h0[0].z)
        if np.abs(new - q2).max() > 1e-9:
            put(o2, w2 + fr.to_world_delta(new - q2))
    return {'max_in_mm': round(float(dl[:, 2].min() * 1000), 3), 'max_out_mm': round(float(dl[:, 2].max() * 1000), 3)}


def weld_seam_normals():
    """HEAD_face is a ring grid whose columns 0 and 176 are separate vertices on the front midline; their shading
    normals are computed on each side and differ once the midline is reshaped (a thin light line down the nose).
    Set the face's custom normals to the smooth vertex normals with each seam pair averaged."""
    me = face().data; keep_mesh(face())
    n = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('normal', n)
    g = n.reshape(GRID + (3,)).astype(np.float64)
    before = float(np.degrees(np.arccos(np.clip((g[:, 0] * g[:, -1]).sum(1), -1, 1))).max())
    avg = g[:, 0] + g[:, -1]; avg /= np.linalg.norm(avg, axis=1, keepdims=True) + 1e-12
    g[:, 0] = g[:, -1] = avg
    me.normals_split_custom_set_from_vertices([tuple(v) for v in g.reshape(-1, 3)]); me.update()
    return round(before, 2)


SCALP_BASE = 'inkwave_face_look_base'


def scalp_follow(face_before, face_delta):
    """The shaved-scalp shell of the hair (HAIR_scalp) follows the forehead edit like a shrinkwrap layer: each vertex
    moves with the nearest skin (inverse-distance transfer), so the shell keeps its height above the skin. Its
    un-followed position is kept in the point attribute SCALP_BASE and restored first, so re-runs do not accumulate;
    when the hair is re-applied (scripts/inkwave_hair_apply.py) the new mesh has no attribute and becomes the base."""
    obj = bpy.data.objects.get('HAIR_scalp')
    if obj is None:
        return None
    me = obj.data; n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    if SCALP_BASE in me.attributes:
        me.attributes[SCALP_BASE].data.foreach_get('vector', co)
    else:
        me.vertices.foreach_get('co', co)
        me.attributes.new(SCALP_BASE, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', co)
    base = co.reshape(-1, 3).astype(np.float64)
    mw = np.array(obj.matrix_world); wpts = base @ mw[:3, :3].T + mw[:3, 3]
    d = transfer(face_before, face_delta, wpts, k=6)
    local = (wpts + d - mw[:3, 3]) @ np.linalg.inv(mw[:3, :3]).T
    me.vertices.foreach_set('co', local.astype(np.float32).ravel()); me.update()
    return round(float(np.linalg.norm(d, axis=1).max() * 1000), 3)


def _scalp_bvh():
    obj = bpy.data.objects.get('HAIR_scalp')
    if obj is None:
        return None, None
    dg = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(obj, dg), obj.matrix_world.copy()


def _face_normals_world():
    me = face().data
    n = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3).astype(np.float64) @ np.array(face().matrix_world)[:3, :3].T


def skin_under_scalp(reach=0.004):
    """{face vertex: its depth under the scalp shell along the skin normal} for the skin the shell covers."""
    bvh, mw = _scalp_bvh()
    if bvh is None:
        return {}
    inv = mw.inverted(); w = get(face()); nrm = _face_normals_world(); out = {}
    for i, (p, n) in enumerate(zip(w, nrm)):
        o = inv @ Vector(p); d = (inv.to_3x3() @ Vector(n)).normalized()
        hit = bvh.ray_cast(o, d, reach)
        if hit[0] is not None:
            out[i] = max(((mw @ hit[0]) - Vector(p)).length, 0.0003)
    return out


def keep_under_scalp(under):
    """Skin that was under the (sparser) scalp shell stays under it by its old depth: a bulged skin must not poke
    through the shell's large triangles (a jagged hairline). Only hidden skin moves."""
    bvh, mw = _scalp_bvh()
    if bvh is None or not under:
        return 0
    inv = mw.inverted(); w = get(face()); nrm = _face_normals_world(); new = w.copy(); n_moved = 0
    for i, depth in under.items():
        p = Vector(w[i]); nv = Vector(nrm[i]).normalized()
        start = p - nv * 0.01  # search the shell from 10 mm inside the skin outward
        hit = bvh.ray_cast(inv @ start, (inv.to_3x3() @ nv).normalized(), 0.03)
        if hit[0] is None:
            continue
        shell = mw @ hit[0]; target = shell - nv * depth
        if (p - shell).dot(nv) > -depth:  # closer to (or through) the shell than before
            new[i] = np.array(target); n_moved += 1
    if n_moved:
        put(face(), new)
    return n_moved


def lift_on_skin(names, mm_of_abs_x):
    """Move decal vertices up (head y) by mm_of_abs_x(|x|) millimetres, keeping each vertex's height above the skin
    (head-space front rays on the skin before and after)."""
    skin = bvh_local(['HEAD_face'])
    out = {}
    for nm in names:
        obj = bpy.data.objects[nm]; w = get(obj); q = fr.to_local(w); new = q.copy()
        dy = mm_of_abs_x(np.abs(q[:, 0])) / 1000
        for i, v in enumerate(q):
            h0 = skin.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
            h1 = skin.ray_cast(Vector((v[0], v[1] + dy[i], 0.3)), Vector((0, 0, -1)))
            if h0[0] is None or h1[0] is None:
                continue
            new[i] = (v[0], v[1] + dy[i], h1[0].z + (v[2] - h0[0].z))
        put(obj, w + fr.to_world_delta(new - q)); out[nm] = round(float(dy.max() * 1000), 3)
    return out


def lay_from_front(names, offset):
    """Put decal vertices on the skin straight behind them (head-space front ray), offset along the skin normal:
    a lower lash decal that reaches over the lid line then ends up behind the eyeball instead of on top of it."""
    skin = bvh_local(['HEAD_face'])
    out = {}
    for nm in names:
        obj = bpy.data.objects[nm]; w = get(obj); q = fr.to_local(w); new = q.copy()
        for i, v in enumerate(q):
            h = skin.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
            if h[0] is not None:
                new[i] = np.array(h[0]) + np.array(h[1]) * offset
        put(obj, w + fr.to_world_delta(new - q)); out[nm] = round(float(np.abs(new - q).max() * 1000), 3)
    return out


def shorten_lashes(names, k):
    """Scale each lower lash toward its root (the lower lid now rolls forward into the cheek; full-length lashes
    pierce it and show as dark ticks on the skin)."""
    out = {}
    for nm in names:
        obj = bpy.data.objects[nm]; w = get(obj); q = fr.to_local(w)
        centre = fr.to_local(get(bpy.data.objects['HEAD_eyes' if q[:, 0].mean() > 0 else 'HEAD_eyes_18'])).mean(0)
        root = q[np.linalg.norm(q[:, :2] - centre[:2], axis=1).argmin()]
        new = root + (q - root) * k
        put(obj, w + fr.to_world_delta(new - q)); out[nm] = round(float(np.linalg.norm(new - q, axis=1).max() * 1000), 3)
    return out


def seat_lashes(names, offset):
    """Move each lower lash rigidly along head z so its root (the end nearest the eye centre) sits on the skin."""
    skin = bvh_local(['HEAD_face'])
    out = {}
    for nm in names:
        obj = bpy.data.objects[nm]; w = get(obj); q = fr.to_local(w)
        centre = fr.to_local(get(bpy.data.objects['HEAD_eyes' if q[:, 0].mean() > 0 else 'HEAD_eyes_18'])).mean(0)
        root = q[np.linalg.norm(q[:, :2] - centre[:2], axis=1).argmin()]
        h = skin.ray_cast(Vector((root[0], root[1], 0.3)), Vector((0, 0, -1)))
        if h[0] is None:
            continue
        dz = h[0].z + offset - root[2]
        new = q.copy(); new[:, 2] += dz
        put(obj, w + fr.to_world_delta(new - q)); out[nm] = round(float(dz * 1000), 3)
    return out


def srgb(c):
    c = np.asarray(c, float) / 255
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)) + (1.0,)


def bsdf(name):
    mat = bpy.data.materials[name]; keep_material(mat)
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


# ---------------------------------------------------------------- eyes
def blur(a, sigma):
    r = int(3 * sigma); x = np.arange(-r, r + 1); k = np.exp(-x ** 2 / (2 * sigma ** 2)); k /= k.sum()
    pad = np.pad(a, ((r, r), (r, r), (0, 0)), mode='edge')
    tmp = sum(k[i] * pad[:, i:i + a.shape[1]] for i in range(len(k)))
    return sum(k[i] * tmp[i:i + a.shape[0]] for i in range(len(k)))


def iris_image(name):
    img = bpy.data.images[name]; keep_image(img)
    src = bpy.data.images[name + PRE]
    w, h = src.size
    px = np.empty(w * h * 4, np.float32); src.pixels.foreach_get(px)
    full = px.reshape(h, w, 4)[::-1].copy()          # PNG orientation (row 0 = top)
    a = full[..., :3] * 255
    cx, cy = IRIS[name]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = (xx - cx) / IRIS_R[0], (yy - cy) / IRIS_R[1]   # v > 0: lower in the PNG = upper on screen
    r = np.hypot(u, v)
    # 1. remove the baked catchlights (diffusion fill of the dilated highlight mask)
    hl = (a.min(2) > 120) & (a[..., 0] > 110) & (r < 0.97)
    for _ in range(4):
        hl = hl | np.roll(hl, 1, 0) | np.roll(hl, -1, 0) | np.roll(hl, 1, 1) | np.roll(hl, -1, 1)
    for _ in range(300):
        avg = (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 4
        a[hl] = avg[hl]
    pupil = (a.max(2) < 30) & (r < 0.62)
    ring = (r < 1.0) & ~pupil
    # 2. soften the radial fibres, 3. greener teal, dark under the upper lid, bright below, darker limbal ring
    b = blur(a, 1.6)
    a[ring] = 0.45 * a[ring] + 0.55 * b[ring]
    lum = a[..., 1] * 0.6 + a[..., 2] * 0.4
    grad = np.interp(np.clip(v, -1, 1), [-1, -0.2, 0.35, 1], [1.12, 1.05, 0.62, 0.42])
    target = np.stack([lum * 0.28, lum * 1.10, lum * 0.98], -1) * grad[..., None]
    k = (np.clip((1.0 - r) / 0.04, 0, 1) * ring)[..., None]
    a = a * (1 - k) + target * k
    a *= (1 - 0.45 * np.clip(1 - np.abs(r - 0.94) / 0.07, 0, 1) * (r < 1.02))[..., None]
    # 4. catchlights like the reference: small one up-left of the pupil, tiny one up-right
    for du, dv, rad, s in ((-0.34, 0.36, 0.12, 1.0), (0.40, 0.26, 0.055, 0.9)):
        m = (np.clip(1.25 - np.hypot((u - du) / rad, (v - dv) / rad), 0, 1) ** 1.2 * s)[..., None]
        a = a * (1 - m) + 250 * m
    full[..., :3] = np.clip(a, 0, 255) / 255
    img.pixels.foreach_set(full[::-1].astype(np.float32).ravel()); img.pack()


def densify(names, per_gap=2):
    added = 0
    for a, b in zip(names[:-1], names[1:]):
        oa, ob = bpy.data.objects[a], bpy.data.objects[b]
        if len(oa.data.vertices) != len(ob.data.vertices):
            continue
        keep_mesh(oa)
        ca, cb = get(oa), get(ob)
        bm = bmesh.new(); bm.from_mesh(oa.data)
        src = bmesh.new(); src.from_mesh(oa.data)
        uvl, suv = bm.loops.layers.uv.active, src.loops.layers.uv.active
        for i in range(1, per_gap + 1):
            t = i / (per_gap + 1)
            vs = [bm.verts.new(tuple(c)) for c in ca * (1 - t) + cb * t]
            for f in src.faces:
                nf = bm.faces.new([vs[x.index] for x in f.verts])
                nf.smooth, nf.material_index = f.smooth, f.material_index
                if uvl is not None:
                    for l1, l2 in zip(nf.loops, f.loops):
                        l1[uvl].uv = l2[suv].uv
            added += 1
        bm.to_mesh(oa.data); bm.free(); src.free(); oa.data.update()
    return added


# ---------------------------------------------------------------- stud
def remove_nose_stud():
    obj = bpy.data.objects['HEADGEAR_headgear']; keep_mesh(obj)
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    seen, kill = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        comp, stack = [], [v]; seen.add(v.index)
        while stack:
            a = stack.pop(); comp.append(a)
            for e in a.link_edges:
                o = e.other_vert(a)
                if o.index not in seen:
                    seen.add(o.index); stack.append(o)
        c = sum((x.co for x in comp), Vector()) / len(comp)
        if abs(c.x) < 0.03 and c.y < -0.085 and 1.33 < c.z < 1.36:  # the stud on the nose (world, Z up, -Y front)
            kill += comp
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return len(kill)


# ---------------------------------------------------------------- main
def run(steps):
    rep = {}
    head = [o for o in bpy.data.objects['HEAD'].children if o.type == 'MESH']
    follow = [o.name for o in head if o.name.startswith('HEAD_skin') and o.name not in BLUSH + MOUTH_DECALS]
    w0 = get(face())
    ym, _ = mouth_y()
    if 'lid' in steps:
        rep['lid'] = lid()
    if 'nose' in steps:
        rep['nose_mm'] = normal_bumps(P['nose'])
    if 'cheek' in steps:
        rep['cheek_mm'] = normal_bumps(P['cheek'])
    if 'mouth' in steps:
        before = fr.to_local(get(face()))
        rep['mouth_face_mm'] = mouth_face(ym - 0.001)
        rep['mouth_decals_mm'] = mouth_decals(ym - 0.001, before)
        w_mouth = get(face())  # later face steps move the mouth decals with them (decals step)
        m = fr.to_local(get(bpy.data.objects['HEAD_skin_09']))
        xe = float(np.abs(m[:, 0]).max()); ye = float(m[np.abs(m[:, 0]) > xe - 0.002, 1].mean())
        rep['dimple_mm'] = normal_bumps([(xe + 0.0015, ye + 0.0005, P['dimple_sx'], P['dimple_sy'], P['dimple_mm'])])
    if 'jaw' in steps:
        rep['jaw_mm'] = round(grid_smooth(mirrored(P['jaw_pts']), P['jaw_sigma'], P['jaw_iters'], zmin=0.0) * 1000, 3)
    if 'profile' in steps:
        obj = face(); w = get(obj); q = fr.to_local(w)
        wgt = np.exp(-(q[:, 0] / P['chin_ball_sx']) ** 2 - ((q[:, 1] - P['chin_ball_y']) / P['chin_ball_sy']) ** 2) * (q[:, 2] > 0.03)
        dl = np.zeros_like(q); dl[:, 2] = P['chin_ball_mm'] / 1000 * wgt; dl[:, 1] = -P['chin_ball_down_mm'] / 1000 * wgt
        put(obj, w + fr.to_world_delta(dl)); rep['chin_ball_mm'] = round(float(np.linalg.norm(dl, axis=1).max() * 1000), 3)
        w = get(obj); q = fr.to_local(w)
        t = np.clip((np.abs(q[:, 0]) - P['jaw_lift_x0']) / (P['jaw_lift_x1'] - P['jaw_lift_x0']), 0, 1)
        zw = np.clip((q[:, 2] - P['jaw_lift_z0']) / 0.02, 0, 1) * np.clip((P['jaw_lift_z1'] - q[:, 2]) / 0.02, 0, 1)
        wgt = t * t * (3 - 2 * t) * np.exp(-((q[:, 1] - P['jaw_lift_y']) / P['jaw_lift_sy']) ** 2) * zw
        dl = np.zeros_like(q); dl[:, 1] = P['jaw_lift_mm'] / 1000 * wgt
        put(obj, w + fr.to_world_delta(dl)); rep['jaw_lift_mm'] = round(float(dl[:, 1].max() * 1000), 3)
        w = get(obj); q = fr.to_local(w)
        ss = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
        wz = ss((P['gonion_z0'] - q[:, 2]) / (P['gonion_z0'] - P['gonion_z1'])) * ss((q[:, 2] - P['gonion_zb1']) / (P['gonion_zb0'] - P['gonion_zb1']))
        wx = ss((np.abs(q[:, 0]) - P['gonion_x0']) / (P['gonion_x1'] - P['gonion_x0']))
        wy = ss((P['gonion_y0'] - q[:, 1]) / (P['gonion_y0'] - P['gonion_y1']))
        wgt = wz * wx * wy
        dl = np.zeros_like(q); dl[:, 1] = P['gonion_up_mm'] / 1000 * wgt; dl[:, 2] = P['gonion_fwd_mm'] / 1000 * wgt
        dl[:, 0] = np.sign(q[:, 0]) * P['gonion_out_mm'] / 1000 * wgt  # keeps the front sheet's U width as it rises
        put(obj, w + fr.to_world_delta(dl)); rep['gonion_mm'] = round(float(np.linalg.norm(dl, axis=1).max() * 1000), 3)
        # relax the moved band on the ring grid (periodic Laplacian, weight = the field itself)
        w = get(obj); q = fr.to_local(w); G = q.reshape(GRID + (3,)).copy(); Wm = wgt.reshape(GRID)
        for _ in range(P['gonion_smooth_iters']):
            U = G[:, :-1]; lap = np.zeros_like(U)
            lap[1:-1] = (U[:-2] + U[2:] + np.roll(U, 1, 1)[1:-1] + np.roll(U, -1, 1)[1:-1]) / 4 - U[1:-1]
            G[:, :-1] = U + 0.5 * Wm[:, :-1, None] * lap
            G[:, -1] = G[:, 0]
        put_grid(w, q, G)
        rep['brow_lift_mm'] = lift_on_skin(['HEAD_brows', 'HEAD_brows_02'], lambda ax: P['brow_lift_inner_mm'] + (
            P['brow_lift_outer_mm'] - P['brow_lift_inner_mm']) * np.clip((ax - P['brow_x_inner']) / (P['brow_x_outer'] - P['brow_x_inner']), 0, 1))
        rep['wing_lift_mm'] = lift_on_skin(['HEAD_eyes_03', 'HEAD_eyes_20'], lambda ax: 1000 * P['wing_slope'] * np.maximum(ax - P['wing_x0'], 0) ** 2 / 0.01)
    if 'volume' in steps:
        obj = face(); w = get(obj); q = fr.to_local(w)
        def band(v, a, b, c, d):
            up = np.clip((v - a) / (b - a), 0, 1); dn = np.clip((d - v) / (d - c), 0, 1)
            return up * up * (3 - 2 * up) * dn * dn * (3 - 2 * dn)
        wy = band(-q[:, 1], -P['side_y0'], -P['side_y1'], -P['side_y2'], -P['side_y3'])
        ang = np.degrees(np.arctan2(np.abs(q[:, 0]), q[:, 2]))
        wa = np.where(ang < P['side_peak'], np.clip((ang - P['side_a0']) / (P['side_peak'] - P['side_a0']), 0, 1),
                      np.clip((P['side_a1'] - ang) / (P['side_a1'] - P['side_peak']), 0, 1))
        wa = wa * wa * (3 - 2 * wa)
        wgt = wy * wa
        radial = np.c_[q[:, 0], np.zeros(len(q)), q[:, 2]]
        radial /= np.linalg.norm(radial, axis=1, keepdims=True) + 1e-9
        put(obj, w + fr.to_world_delta(-radial * (P['side_in_mm'] / 1000 * wgt)[:, None]))
        rep['side_in_mm'] = round(float(wgt.max() * P['side_in_mm']), 3)
        w = get(obj); q = fr.to_local(w)
        wy = band(-q[:, 1], -P['round_y0'], -P['round_y1'], -P['round_y2'], -P['round_y3'])
        ang = np.degrees(np.arctan2(np.abs(q[:, 0]), q[:, 2]))
        wa = np.where(ang < P['round_peak'], np.clip((ang - P['round_a0']) / (P['round_peak'] - P['round_a0']), 0, 1),
                      np.clip((P['round_a1'] - ang) / (P['round_a1'] - P['round_peak']), 0, 1))
        wgt = wy * wa * wa * (3 - 2 * wa)
        radial = np.c_[q[:, 0], np.zeros(len(q)), q[:, 2]]; radial /= np.linalg.norm(radial, axis=1, keepdims=True) + 1e-9
        put(obj, w + fr.to_world_delta(radial * (P['round_out_mm'] / 1000 * wgt)[:, None]))
        rep['round_out_mm'] = round(float(wgt.max() * P['round_out_mm']), 3)
        w = get(obj); q = fr.to_local(w)
        ss = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
        wgt = (np.exp(-((q[:, 1] - P['mand_y']) / P['mand_sy']) ** 2)
               * ss((np.abs(q[:, 0]) - P['mand_x0']) / (P['mand_x1'] - P['mand_x0']))
               * ss((q[:, 2] - P['mand_z0']) / (P['mand_z1'] - P['mand_z0'])))
        dl = np.zeros_like(q); dl[:, 0] = np.sign(q[:, 0]) * P['mand_out_mm'] / 1000 * wgt
        put(obj, w + fr.to_world_delta(dl)); rep['mand_out_mm'] = round(float(np.abs(dl[:, 0]).max() * 1000), 3)
        w = get(obj); q = fr.to_local(w); d = np.zeros(len(q))
        for x, y, sx, sy, mm in P['front_push']:
            d += mm / 1000 * np.exp(-((q[:, 0] - x) / sx) ** 2 - ((q[:, 1] - y) / sy) ** 2)
        d *= q[:, 2] > 0.06
        dl = np.zeros_like(q); dl[:, 2] = d
        put(obj, w + fr.to_world_delta(dl)); rep['front_push_mm'] = round(float(d.max() * 1000), 3)
        rep['nose_volume_mm'] = normal_bumps(P['nose_volume'])
        w = get(obj); q = fr.to_local(w)
        up = np.clip((q[:, 1] - P['fh_y0']) / (P['fh_y1'] - P['fh_y0']), 0, 1); dn = np.clip((P['fh_y3'] - q[:, 1]) / (P['fh_y3'] - P['fh_y2']), 0, 1)
        tz = np.clip((q[:, 2] - P['fh_z0']) / (P['fh_z1'] - P['fh_z0']), 0, 1)
        wgt = up * up * (3 - 2 * up) * dn * dn * (3 - 2 * dn) * np.exp(-(q[:, 0] / P['fh_sx']) ** 2) * tz * tz * (3 - 2 * tz)
        dl = np.zeros_like(q); dl[:, 2] = P['fh_mm'] / 1000 * wgt
        under = skin_under_scalp()
        skin_before = bvh_local(['HEAD_face'])
        w_fh = w.copy(); put(obj, w + fr.to_world_delta(dl)); skin_after = bvh_local(['HEAD_face'])
        dfh = get(obj) - w_fh; rep['forehead_mm'] = round(float(dl[:, 2].max() * 1000), 3)
        # brows, lid creases and liners keep their height above the skin (front rays before / after the push)
        for nm in ('HEAD_brows', 'HEAD_brows_02', 'HEAD_eyes_12', 'HEAD_eyes_29', 'HEAD_eyes_03', 'HEAD_eyes_20'):
            o2 = bpy.data.objects[nm]; w2 = get(o2); q2 = fr.to_local(w2); new = q2.copy()
            for i, v in enumerate(q2):
                h0 = skin_before.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
                h1 = skin_after.ray_cast(Vector((v[0], v[1], 0.3)), Vector((0, 0, -1)))
                if h0[0] is not None and h1[0] is not None:
                    new[i, 2] = v[2] + (h1[0].z - h0[0].z)
            if np.abs(new - q2).max() > 1e-9:
                put(o2, w2 + fr.to_world_delta(new - q2))
        rep['scalp_follow_mm'] = scalp_follow(w_fh, dfh)
        rep['skin_kept_under_scalp'] = keep_under_scalp(under)
        w = get(obj); q = fr.to_local(w)
        wgt = np.exp(-((np.abs(q[:, 0]) - P['chin_round_x']) / P['chin_round_sx']) ** 2 - ((q[:, 1] - P['chin_round_y']) / P['chin_round_sy']) ** 2) * (q[:, 2] > 0.02)
        dl = np.zeros_like(q); dl[:, 0] = np.sign(q[:, 0]) * P['chin_round_mm'] / 1000 * wgt
        put(obj, w + fr.to_world_delta(dl)); rep['chin_round_mm'] = round(float(np.abs(dl[:, 0]).max() * 1000), 3)
    if 'bridge' in steps:
        rep['bridge'] = bridge_curve()
    if 'decals' in steps:
        delta = get(face()) - w0
        moved = {}
        for nm in follow:
            obj = bpy.data.objects[nm]; pts = get(obj)
            d = transfer(w0, delta, pts, k=6)
            if np.abs(d).max() > 1e-9:
                put(obj, pts + d); moved[nm] = round(float(np.linalg.norm(d, axis=1).max() * 1000), 3)
        if 'mouth' in steps:
            dm = get(face()) - w_mouth
            for nm in MOUTH_DECALS:
                obj = bpy.data.objects[nm]; pts = get(obj)
                d = transfer(w_mouth, dm, pts, k=6)
                if np.abs(d).max() > 1e-9:
                    put(obj, pts + d); moved[nm] = round(float(np.linalg.norm(d, axis=1).max() * 1000), 3)
        rep['decals_followed_mm'] = moved
        blush = radial_image('INKWAVE_BLUSH_ALPHA', (0xd8 / 255, 0x66 / 255, 0x4f / 255),
                             [(0, 1), (0.0625, 1), (0.35, 0.6), (0.7, 0.18), (1, 0)])
        px = np.empty(len(blush.pixels), np.float32); blush.pixels.foreach_get(px)
        px[3::4] *= P['blush_amount']; blush.pixels.foreach_set(px); blush.pack()
        textured_alpha(bpy.data.materials['skin_d8664f'], blush, 0.6)
        under = radial_image('INKWAVE_UNDERNOSE_ALPHA', (0x6a / 255, 0x33 / 255, 0x22 / 255),
                             [(0, 0.08), (0.0625, 0.08), (0.35, 0.048), (0.7, 0.0144), (1, 0)])
        textured_alpha(bpy.data.materials['skin_6a3322'], under, 0.6)
        for nm in BLUSH:
            subdivide(bpy.data.objects[nm], P['blush_subdiv'])
        subdivide(bpy.data.objects[UNDERNOSE], 1)
        rep['decals_conformed'] = conform(list(BLUSH), P['blush_off'])
        rep['decals_conformed'].update(conform([UNDERNOSE], 0.00028))
        # liner (runtime offset 0.35 mm), lid crease and lower lash line lie on the new lids; lash roots sit on them
        rep['lid_decals_lifted'] = conform(['HEAD_eyes_03', 'HEAD_eyes_20'], 0.00035, only_below=0.00035)
        rep['lid_decals_lifted'].update(conform(['HEAD_eyes_12', 'HEAD_eyes_29'], 0.0003, only_below=0.0003))
        rep['lower_lash_line'] = lay_from_front(['HEAD_eyes_17', 'HEAD_eyes_34'], 0.0003)
        rep['lower_lash_roots_mm'] = seat_lashes([f'HEAD_eyes_{i}' for i in (13, 14, 15, 16, 30, 31, 32, 33)], 0.0002)
        rep['lower_lash_tips_mm'] = shorten_lashes([f'HEAD_eyes_{i}' for i in (13, 14, 15, 16, 30, 31, 32, 33)], P['lower_lash_scale'])
        nos = bsdf('skin_6a3526'); nos.inputs['Alpha'].default_value = 0.5; nos.inputs['Base Color'].default_value = srgb((0x4a, 0x22, 0x18))
        line = bsdf('skin_5b2922'); line.inputs['Alpha'].default_value = 0.8; line.inputs['Base Color'].default_value = srgb((0x6a, 0x30, 0x27))
    if 'eyes' in steps:
        for name in IRIS:
            iris_image(name)
        for mn in ('eyes_texture', 'eyes_texture_02'):
            bsdf(mn).inputs['Coat Weight'].default_value = 0.12
        lash = bsdf('eyes_100d10'); lash.inputs['Roughness'].default_value = 0.75; lash.inputs['Specular IOR Level'].default_value = 0.2
        liner = bsdf('eyes_0c0b0e'); liner.inputs['Roughness'].default_value = 0.55; liner.inputs['Specular IOR Level'].default_value = 0.3
        rep['lashes_added'] = sum(densify(names) for names in UPPER_LASHES)
    if 'skin' in steps:
        s = bsdf('skin_b27050')
        s.inputs['Base Color'].default_value = tuple(v * 1.15 for v in s.inputs['Base Color'].default_value[:3]) + (1.0,)
        s.inputs['Roughness'].default_value = 0.6
        s.inputs['Coat Weight'].default_value = 0.03
        lip = bsdf('skin_b0584a'); lip.inputs['Roughness'].default_value = 0.5; lip.inputs['Alpha'].default_value = 0.4
        brow = bsdf('brows_128d96'); brow.inputs['Base Color'].default_value = srgb((40, 112, 122)); brow.inputs['Roughness'].default_value = 0.75
    if 'stud' in steps:
        rep['stud_vertices_removed'] = remove_nose_stud()
    if any(k in steps for k in ('lid', 'nose', 'cheek', 'mouth', 'jaw', 'profile', 'volume', 'bridge')):
        rep['face_normals_seam_deg'] = weld_seam_normals()
    return rep


def main():
    opts = args()
    restored = restore()
    record = {'restored_datablocks': restored}
    if not opts.restore:
        steps = [s for s in opts.only.split(',') if s]
        record.update({'steps': steps, 'params': P, 'report': run(steps), 'blender': bpy.app.version_string})
    text = bpy.data.texts.get('INKWAVE_FACE_LOOK.json') or bpy.data.texts.new('INKWAVE_FACE_LOOK.json')
    text.clear(); text.write(json.dumps(record, indent=1, default=float))
    bpy.context.view_layer.update()
    if opts.save:
        bpy.ops.wm.save_as_mainfile(filepath=str(opts.save))
        backup = opts.save.with_suffix(opts.save.suffix + '1')
        if backup.exists():
            backup.unlink()
    if opts.export:
        fr.export_character(opts.export)
        if opts.game:
            shutil.copyfile(opts.export, opts.game)
    print('INKWAVE_FACE_LOOK ' + json.dumps(record.get('report', {'restored': restored}), default=float))


if __name__ == '__main__':
    main()
