"""Body shape: a fuller belly, a navel, a soft ab line and a visible waist (analysis/body_shape/params.json).

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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--params', default=str(PARAMS))
    ap.add_argument('--save')
    ap.add_argument('--restore', action='store_true')
    args = ap.parse_args(argv)
    p = json.loads(Path(args.params).read_text())
    names = [p['torso']] + p['belly']['garments'] + p['jacket']['garments']
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
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save, compress=True)


if __name__ == '__main__':
    main()
