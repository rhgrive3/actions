"""Measured face refinements on the Blender master (no remesh, no topology change, UVs untouched).

blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_face_refine.py -- \
  [--save blender/INKWAVE_CHARACTER_MASTER.blend] [--export blender/INKWAVE_CHARACTER_MASTER.glb] \
  [--game blender/INKWAVE_GAME.glb] [--set chin_mm=3 ...] [--only chin,jaw]      # --only '' restores the runtime face

Every refinement is a smooth displacement field in head space (the runtime head frame: centre (0.004, 1.39, -0.012),
yaw 0.03, tilt 0.115; x = character's left, y = up, z = forward), evaluated on the runtime surface and applied to
every HEAD mesh it reaches (skin and its decals), so the face and the paint on it move together. The ears are kept.

The refined surface is the plain mesh: it can be sculpted or edited like any other mesh, and every exporter (also a
plain bpy.ops.export_scene.gltf) writes it. The runtime surface is kept per vertex in the point attribute
`inkwave_runtime_position` (not exported to glTF), so re-running the script rebuilds the fields from the runtime
shape with the current parameters (idempotent) and `--only ''` restores it exactly. Parameters and the moved
vertices are recorded in the text block INKWAVE_FACE_REFINE.json and on HEAD_face['inkwave_face_refine'].
The last step, `fold`, removes the runtime cheek-to-jaw fold and the ring-78 seam of HEAD_face on the surface the
other fields produce (scripts/inkwave_face_fold_refine.py, which also re-applies just that step on its own).
Before writing, the script rebuilds the stored record and stops if the meshes differ from it by more than 5 um
(manual sculpting since the last run); --force overwrites such edits.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inkwave_face_fold_refine import FOLD_PARAMS, fold_delta, transfer  # noqa: E402

HEAD_CENTRE = np.array([0.004, 1.39, -0.012])  # runtime (three) coordinates
HEAD_YAW, HEAD_PITCH, HEAD_TILT = 0.03, 0.0, 0.115

# Millimetres unless named otherwise. Values are the measured increments (see docs/face-refinement/README.md).
PARAMS = {
    # Chin/lower face: the chin sits ~4 px (~4.4 mm) high in the calibrated front sheet and the chin/lower-lip
    # landmarks are 2.4-4.4 px high in the front, 3/4 and side sheets.
    'chin_mm': 2.5,          # downward shift at the chin bottom
    'chin_top_y': -0.058,    # head-space y where the lengthening starts (below the nostrils)
    'chin_full_y': -0.100,   # head-space y where it reaches chin_mm
    'chin_sigma_x': 0.025,   # lateral falloff (m): the chin point drops, the jaw corners do not (3/4 sheet)
    # The side sheet puts the front of the chin ~2.4 px further forward; the 3/4 sheet (seen from below) does
    # not want the chin any lower, which a forward chin satisfies.
    'chin_fwd_mm': 2.0,      # forward shift of the chin point (same weights as chin_mm)
    # Jaw line: the lateral lower jaw hangs low (front rows 240-250 and the 3/4 lower contour are outside the
    # reference); lifting it while the chin point drops gives the round U bottom of the reference.
    'jawline_mm': 2.0,       # upward lift of the lateral under-jaw
    'jawline_x0': 0.012,     # |x| where the lift starts ...
    'jawline_x1': 0.035,     # ... and where it is full
    'jawline_top_y': -0.070,
    'jawline_full_y': -0.095,
    # Lower lip: in the side sheet the lower lip is ~1 px behind the nose/chin line of the reference, and the
    # reference-depth study (README 2.2) wants the lips ~3 mm forward; a soft forward bulge of the lower lip.
    'lip_fwd_mm': 2.5,       # forward push at the lower-lip centre
    'lip_y': -0.0705,        # head-space y of the lower-lip centre
    'lip_z0': 0.085,         # only the front of the face
    'lip_sigma_x': 0.016,
    'lip_sigma_y': 0.0055,
    # Lower jaw: 7-8 px (8-9 mm) too wide at the jaw rows of the front sheet once the head turn matches the nose.
    'jaw_mm': 3.5,           # inward pull of each jaw side at the reference half width jaw_ref_x
    'jaw_ref_x': 0.0474,     # head-space half width of the jaw at y = -0.092
    'jaw_top_y': -0.050,     # no change above
    'jaw_full_y': -0.088,    # full change below
    'back_z0': -0.020,       # fields fade out behind the jaw angle (head-space z) ...
    'back_z1': 0.030,        # ... and are full in front of this
}
PARAMS.update(FOLD_PARAMS)  # the cheek-to-jaw fold fix, see scripts/inkwave_face_fold_refine.py
FIELDS = ('chin', 'jaw', 'jawline', 'lip', 'fold')  # fold runs last, on the surface the other fields produce
KEEP = ('HEAD_face_02', 'HEAD_face_03')  # the rebuilt ears stay exactly as they are


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--save', type=Path)
    parser.add_argument('--export', type=Path)
    parser.add_argument('--game', type=Path)
    parser.add_argument('--set', nargs='*', default=[], help='name=value overrides of PARAMS')
    parser.add_argument('--only', default=','.join(FIELDS))
    parser.add_argument('--off', action='store_true', help='fold script only: remove the fold fix again')
    parser.add_argument('--force', action='store_true', help='overwrite edits the stored record does not explain')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def euler_yxz(yaw, pitch, roll):
    cy, sy, cx, sx, cz, sz = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


HEAD_R = euler_yxz(HEAD_YAW, HEAD_PITCH, -HEAD_TILT)


def to_local(world):
    """Blender world (Z-up, -Y forward) -> head space (three axes)."""
    three = np.c_[world[:, 0], world[:, 2], -world[:, 1]]
    return (three - HEAD_CENTRE) @ HEAD_R


def to_world_delta(local_delta):
    three = local_delta @ HEAD_R.T
    return np.c_[three[:, 0], -three[:, 2], three[:, 1]]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def field(name, p, q):
    """Head-space displacement (N x 3, metres) of field `name` at head-space points q."""
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    d = np.zeros_like(q)
    front = smoothstep(p['back_z0'], p['back_z1'], z)
    if name == 'chin':
        w = smoothstep(p['chin_top_y'], p['chin_full_y'], y) * front * np.exp(-(x / p['chin_sigma_x']) ** 2)
        d[:, 1] = -p['chin_mm'] / 1000 * w
        d[:, 2] = p['chin_fwd_mm'] / 1000 * w
    elif name == 'lip':
        w = np.exp(-(x / p['lip_sigma_x']) ** 2 - ((y - p['lip_y']) / p['lip_sigma_y']) ** 2) * smoothstep(p['lip_z0'] - 0.01, p['lip_z0'], z)
        d[:, 2] = p['lip_fwd_mm'] / 1000 * w
    elif name == 'jawline':
        w = smoothstep(p['jawline_x0'], p['jawline_x1'], np.abs(x)) * smoothstep(p['jawline_top_y'], p['jawline_full_y'], y)
        d[:, 1] = p['jawline_mm'] / 1000 * w * front
    elif name == 'jaw':
        k = p['jaw_mm'] / 1000 / p['jaw_ref_x']
        d[:, 0] = -x * k * smoothstep(p['jaw_top_y'], p['jaw_full_y'], y) * front
    return d


def head_meshes():
    return sorted((o for o in bpy.data.objects['HEAD'].children if o.type == 'MESH' and o.name not in KEEP),
                  key=lambda o: o.name)


RUNTIME = 'inkwave_runtime_position'


def runtime_coords(obj):
    """Runtime positions: the stored attribute, else the mesh as it is (first run)."""
    mesh = obj.data
    n = len(mesh.vertices)
    co = np.empty(n * 3, np.float32)
    if RUNTIME in mesh.attributes:
        mesh.attributes[RUNTIME].data.foreach_get('vector', co)
    else:
        mesh.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def compute(p, names):
    """New positions {object name: (N, 3)} and a report; nothing is written. HEAD_face first: the fold step works on
    its ring grid and the decals take the fold from it."""
    face = bpy.data.objects['HEAD_face']
    meshes = [face] + [o for o in head_meshes() if o is not face]
    coords, report, face_pre, face_fold = {}, {}, None, None
    for obj in meshes:
        if obj.modifiers:
            raise RuntimeError(f'{obj.name} has modifiers; the fields are written to the mesh itself')
        if obj.matrix_world != face.matrix_world:
            raise RuntimeError(f'{obj.name}: expected baked world transforms (identity)')
        if obj.data.shape_keys:
            raise RuntimeError(f'{obj.name} has shape keys; the fields are written to the mesh itself')
        base = runtime_coords(obj).astype(np.float64)
        local = to_local(base)
        total = np.zeros_like(local)
        for name in names:
            if name == 'fold':
                continue
            delta = to_world_delta(field(name, p, local))
            moved = np.linalg.norm(delta, axis=1)
            if moved.max() >= 1e-7:
                total += delta
                report.setdefault(name, {})[obj.name] = {'verts_moved': int((moved > 1e-6).sum()),
                                                         'max_mm': round(float(moved.max() * 1000), 3)}
        new = base + total
        if 'fold' in names:
            if obj is face:
                face_pre = new.copy()
                face_fold = fold_delta(new, to_local(new), p)
                delta = face_fold
            else:
                delta = transfer(face_pre, face_fold, new)
            moved = np.linalg.norm(delta, axis=1)
            if moved.max() >= 1e-7:
                new = new + delta
                report.setdefault('fold', {})[obj.name] = {'verts_moved': int((moved > 1e-6).sum()),
                                                           'max_mm': round(float(moved.max() * 1000), 3)}
        coords[obj.name] = (base, new)
    return coords, report


def current_coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def check_record(force):
    """The meshes must be exactly what the stored record produces, or a re-run would erase unrecorded edits."""
    stored = bpy.data.objects['HEAD_face'].get('inkwave_face_refine')
    record = json.loads(stored) if stored else {'params': {}, 'fields': []}
    p = dict(PARAMS)
    p.update(record['params'])
    expected, _ = compute(p, record['fields'])
    worst = max(float(np.abs(current_coords(bpy.data.objects[name]) - new).max()) for name, (_, new) in expected.items())
    if worst > 5e-6 and not force:
        raise RuntimeError(f'HEAD meshes differ from the stored refinement record by {worst * 1000:.3f} mm '
                           '(manual edits?); re-run with --force to overwrite them')
    return record, worst


def write(coords):
    for name, (base, new) in coords.items():
        mesh = bpy.data.objects[name].data
        if np.abs(new - base).max() < 1e-9:
            mesh.vertices.foreach_set('co', base.astype(np.float32).ravel())
            if RUNTIME in mesh.attributes:
                mesh.attributes.remove(mesh.attributes[RUNTIME])
        else:
            if RUNTIME not in mesh.attributes:
                mesh.attributes.new(RUNTIME, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', base.astype(np.float32).ravel())
            mesh.vertices.foreach_set('co', new.astype(np.float32).ravel())
        mesh.update()


def export_character(path):
    """Same export settings as the migration (scripts/inkwave_blender_import.py)."""
    root = bpy.data.objects['INKWAVE_CHARACTER']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root] + list(root.children_recursive):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_normals=True, export_texcoords=True,
                              export_materials='EXPORT', export_extras=True, export_cameras=False,
                              export_lights=False)


def main(fold_only=False):
    opts = args()
    record, drift = check_record(opts.force)
    p = dict(PARAMS)
    if fold_only:  # scripts/inkwave_face_fold_refine.py: keep the recorded refinement, switch only the fold
        p.update(record['params'])
        names = [n for n in record['fields'] if n != 'fold'] + ([] if opts.off else ['fold'])
    else:
        names = [n for n in opts.only.split(',') if n]
    for item in opts.set:
        k, v = item.split('=')
        if k not in p:
            raise KeyError(k)
        p[k] = float(v)
    coords, report = compute(p, names)
    write(coords)
    bpy.context.view_layer.update()
    record = {'params': p, 'fields': names, 'moved': report, 'blender': bpy.app.version_string,
              'previous_state_drift_mm': round(drift * 1000, 4)}
    text = bpy.data.texts.get('INKWAVE_FACE_REFINE.json') or bpy.data.texts.new('INKWAVE_FACE_REFINE.json')
    text.clear()
    text.write(json.dumps(record, indent=1))
    bpy.data.objects['HEAD_face']['inkwave_face_refine'] = json.dumps({'params': p, 'fields': names})
    if opts.save:
        bpy.ops.wm.save_as_mainfile(filepath=str(opts.save))
        backup = opts.save.with_suffix(opts.save.suffix + '1')
        if backup.exists():
            backup.unlink()
    if opts.export:
        export_character(opts.export)
        if opts.game:
            shutil.copyfile(opts.export, opts.game)
    print('INKWAVE_FACE_REFINE ' + json.dumps({k: {o: v['max_mm'] for o, v in r.items()} for k, r in report.items()}))


if __name__ == '__main__':
    main()
