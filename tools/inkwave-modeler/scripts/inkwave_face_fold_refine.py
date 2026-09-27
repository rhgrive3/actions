"""Remove the cheek-to-jaw fold and the ring seam under the eye of HEAD_face (measured, local, on the ring grid).

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_fold_refine.py -- \
  [--save blender/INKWAVE_CHARACTER_MASTER.blend] [--export blender/INKWAVE_CHARACTER_MASTER.glb] \
  [--game blender/INKWAVE_GAME.glb] [--set fold_ring_b=70 ...] [--off] [--force]

HEAD_face is the runtime loft: 157 rings (ring 0 = the pole under the chin, rising to the crown) x 177 columns
(column 0 = the front midline; column 176 repeats it). Across both cheeks the runtime surface turns down abruptly
between rings ~57 and ~63 (53-62 mm below the head centre, between the nose and the mouth): a concave crease at ring
57 and a convex one at 62-64 (normal curvature 70-95 1/m against 12-30 around it), which renders as a dark line from
beside the mouth to under the ear in every view. Higher up, ring 78 (36 mm below the head centre) is a loft seam:
a one-ring convex kink (-114 to -146 1/m against +-25) from the cheek behind the eye round to behind the ear, a long
line in the side view. Both are in the runtime shape, not in the later refinements.

The fix replaces, column by column, the rings of a band by a cubic Hermite curve through the two end rings with the
slopes just outside the band (P[a-1] -> P[a] and P[b] -> P[b+1]); ends and everything outside stay. The two bands
only read rings that neither of them changes, so the result does not depend on their order and a re-run is exact.
  fold: rings fold_ring_a..fold_ring_b; no change for head-space |x| < fold_x0 (lips, mouth corner, smile line),
        full from fold_x1; fades out toward the back (head-space z < fold_z1).
  seam: rings seam_ring_a..seam_ring_b, only outside the eye centre (head-space |x| >= seam_x1, none below
        seam_x0: there the lower lid starts at ring 81) and in front of seam_z_back1 (the kink fades out at the
        back of the head), up to seam_z_front0 (under the outer eye the lid starts only at ring 84-86).
The cheek decals on the face move with it (inverse-distance transfer from the 4 nearest face vertices).

This file is also the fold step of scripts/inkwave_face_refine.py (field name `fold`). Run on its own, it re-applies
the refinement recorded on HEAD_face (same parameters and fields) plus the fold, so every non-fold change stays
exactly as it is; like inkwave_face_refine.py it stops if the face carries edits that the record does not explain.
"""
import sys
from pathlib import Path

import numpy as np

GRID = (157, 177)
FOLD_PARAMS = {
    'fold_ring_a': 50,     # first replaced ring (kept as the lower end of the curve)
    'fold_ring_b': 72,     # last replaced ring (kept as the upper end)
    'fold_x0': 0.026,      # head-space |x| (m) below which nothing changes: lips, mouth corner, smile line
    'fold_x1': 0.034,      # full weight from here outward
    'fold_z0': -0.020,     # head-space z (m): no change behind this (toward the ear and the nape) ...
    'fold_z1': 0.010,      # ... full weight in front of this
    'seam_ring_a': 73,     # ring-78 seam band (ring 73 is also the fold band's outer neighbour: never changed)
    'seam_ring_b': 81,     # reads ring 82: still below the lower lid wherever the band is active
    'seam_x0': 0.056,      # head-space |x| (m): none inside this (eye centre columns, lid from ring 81) ...
    'seam_x1': 0.061,      # ... full outside this
    'seam_z_front0': 0.085,  # head-space z (m): full weight behind this ...
    'seam_z_front1': 0.095,  # ... none in front of this
    'seam_z_back1': -0.070,  # full weight in front of this ...
    'seam_z_back0': -0.090,  # ... none behind this (the kink fades out at the back of the head)
}


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def hermite_band(grid, a, b):
    """Rings a..b of every column as the cubic Hermite curve from ring a to ring b with the outside slopes."""
    n = b - a
    t = ((np.arange(a, b + 1) - a) / n)[:, None, None]
    h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
    return h00 * grid[a] + h10 * (grid[a] - grid[a - 1]) * n + h01 * grid[b] + h11 * (grid[b + 1] - grid[b]) * n


def fold_delta(world, local, p):
    """World-space displacement (N x 3) of the HEAD_face vertices; `local` = the same points in head space."""
    rings, cols = GRID
    if len(world) != rings * cols:
        raise ValueError(f'HEAD_face has {len(world)} vertices, expected the {rings} x {cols} runtime ring grid')
    grid = world.reshape(rings, cols, 3).astype(np.float64)
    if np.abs(grid[:, 0] - grid[:, -1]).max() > 1e-6:
        raise ValueError('HEAD_face columns 0 and 176 should coincide (ring seam); not the runtime ring grid')
    head = local.reshape(rings, cols, 3)
    delta = np.zeros_like(grid)
    a, b = int(p['fold_ring_a']), int(p['fold_ring_b'])
    band = head[a:b + 1]
    w = smoothstep(p['fold_x0'], p['fold_x1'], np.abs(band[..., 0])) * smoothstep(p['fold_z0'], p['fold_z1'], band[..., 2])
    delta[a:b + 1] = w[..., None] * (hermite_band(grid, a, b) - grid[a:b + 1])
    a2, b2 = int(p['seam_ring_a']), int(p['seam_ring_b'])
    if a2 < b + 1:  # each band reads one ring outside itself: the seam must start above the fold's end ring
        raise ValueError('the seam band must start at least one ring above the fold band (seam_ring_a > fold_ring_b)')
    band = head[a2:b2 + 1]
    w = (smoothstep(p['seam_x0'], p['seam_x1'], np.abs(band[..., 0]))
         * (1 - smoothstep(p['seam_z_front0'], p['seam_z_front1'], band[..., 2]))
         * smoothstep(p['seam_z_back0'], p['seam_z_back1'], band[..., 2]))
    delta[a2:b2 + 1] = w[..., None] * (hermite_band(grid, a2, b2) - grid[a2:b2 + 1])
    return delta.reshape(-1, 3)


def transfer(face_world, face_delta, points, k=4):
    """Displacement of decal points from the nearest face vertices (inverse distance weights)."""
    from mathutils import kdtree
    moving = np.linalg.norm(face_delta, axis=1) > 1e-9
    tree = kdtree.KDTree(len(face_world))
    for i, co in enumerate(face_world):
        tree.insert(co, i)
    tree.balance()
    out = np.zeros_like(points)
    for n, co in enumerate(points):
        near = tree.find_n(co, k)
        if not any(moving[i] for _, i, _ in near):
            continue
        w = np.array([1.0 / max(d, 1e-5) for _, _, d in near])
        out[n] = (w[:, None] * face_delta[[i for _, i, _ in near]]).sum(0) / w.sum()
    return out


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import inkwave_face_refine as refine
    refine.main(fold_only=True)


if __name__ == '__main__':
    main()
