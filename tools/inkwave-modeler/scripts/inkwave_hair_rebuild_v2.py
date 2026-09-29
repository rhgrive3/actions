"""INKWAVE hair -- full reconstruction from the reference sheets (not a nudge of the old
mesh). Builds fresh Blender Curve objects (bevel + per-point radius, all built-in curve
tools; no custom geometry math) into the HAIR_REBUILD_V2 collection created by
hair_quarantine.py, converts them to mesh for GLB export, and leaves the pre-existing
strands untouched in HAIR_LEGACY_REFERENCE (hidden).

Anchor coordinates come from two sources, never from the old HAIR mesh:
 1. Ray-casts against HEAD_face/HEAD_skin* (see head_probe.py) for every scalp attachment
    point (crown, occiput, temple, hairline, nape, ear).
 2. The validated front/back/left orthographic calibration in inkwave_ref_calibration.py,
    copied from
    scripts/inkwave_blender_import.py:set_camera (proven to match the Three.js runtime
    render at silhouette IoU ~0.98) -- reference pixel picks on blender/references/*.jpg
    are converted to world X/Z through this, exactly like a photogrammetry pin.
 Depth (Y) at each waypoint, where a single ortho view cannot supply it, is a modelled
 estimate (documented per lock below) because the 4 reference photos are not the same
 pose (front/back share a pose; left/perspective are a different, more dynamic one) --
 true multi-photo triangulation of a soft, flexible lock across different poses would be
 wrong, not more rigorous. Depth is instead checked qualitatively against the side/persp
 renders for plausible volume (no flat "paddle" from the side) per the render step below.

blender -b blender/INKWAVE_HAIR_REBUILD_CANDIDATE.blend --python-exit-code 1 \
  --python scripts/inkwave_hair_rebuild_v2.py -- --out blender/INKWAVE_HAIR_REBUILD_CANDIDATE.blend [--stage h1]
"""
import argparse, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

V2 = 'HAIR_REBUILD_V2'


def get_collection():
    return bpy.data.collections[V2]


def clear_collection(col):
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)


# --------------------------------------------------------------------------- bevel profiles

def make_profile(name, points_xy):
    """A small 2D Bezier ring used as a curve Bevel Object (built-in Blender bevel-by-object).
    points_xy: closed loop of (x, y) in profile-local space (z=0), unit scale (final size
    comes from the host curve's per-point Radius)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    spline = cu.splines.new('POLY')
    spline.points.add(len(points_xy) - 1)
    for i, (x, y) in enumerate(points_xy):
        spline.points[i].co = (x, y, 0, 1)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    return obj


def oval_profile(name, half_w, half_t, n=12):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        pts.append((half_w * math.cos(a), half_t * math.sin(a)))
    return make_profile(name, pts)


def round_profile(name, r=1.0, n=8):
    return oval_profile(name, r, r, n)


# --------------------------------------------------------------------------- curve builder

def strand(name, col, points, radii, bevel_obj, material, resolution=10, tilt=None, handle='AUTO'):
    """points: list of (x,y,z) world coords. radii: matching list, drives the bevel size
    per-point (Blender's built-in Curve.radius taper -- no custom taper math)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = resolution
    cu.bevel_mode = 'OBJECT'
    cu.bevel_object = bevel_obj
    cu.use_fill_caps = True
    spline = cu.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for i, (co, r) in enumerate(zip(points, radii)):
        bp = spline.bezier_points[i]
        bp.co = Vector(co)
        bp.radius = r
        bp.handle_left_type = handle
        bp.handle_right_type = handle
        if tilt:
            bp.tilt = math.radians(tilt[i])
    obj = bpy.data.objects.new(name, cu)
    col.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def convert_to_mesh(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# --------------------------------------------------------------------------- placeholder clay material

def clay_material(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.5
    return m


def gradient_hair_material(name, root_color, tip_color, tip_start=0.6):
    """Root-to-tip colour using the UV V coordinate Blender's curve-to-mesh conversion
    already writes (V runs along the strand length) -- a built-in Color Ramp, not a
    per-vertex-index texture bake like the old library used."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes; links = m.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (100, 0)
    bsdf.inputs['Roughness'].default_value = 0.28
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = 0.7
        bsdf.inputs['Coat Roughness'].default_value = 0.15
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    ramp = nodes.new('ShaderNodeValToRGB'); ramp.location = (-150, 0)
    ramp.color_ramp.elements[0].position = tip_start * 0.55
    ramp.color_ramp.elements[0].color = (*root_color, 1)
    ramp.color_ramp.elements[1].position = min(tip_start + 0.15, 0.98)
    ramp.color_ramp.elements[1].color = (*tip_color, 1)
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    uvnode = nodes.new('ShaderNodeUVMap'); uvnode.location = (-550, 0); uvnode.uv_map = 'UVMap'
    sep = nodes.new('ShaderNodeSeparateXYZ'); sep.location = (-350, 0)
    links.new(uvnode.outputs['UV'], sep.inputs['Vector'])
    # Blender's curve-to-mesh UV writes V=1 at the FIRST spline point (root) and V=0 at the
    # LAST (tip) -- the opposite of the "root->tip" order the strand's own point list uses.
    # Invert so root_color/tip_color land where their names say.
    invv = nodes.new('ShaderNodeMath'); invv.operation = 'SUBTRACT'; invv.location = (-250, 0)
    invv.inputs[0].default_value = 1.0
    links.new(sep.outputs['Y'], invv.inputs[1])
    links.new(invv.outputs['Value'], ramp.inputs['Fac'])
    # A soft emissive glow on the lime tip, matching the established "jelly tip" look.
    eramp = nodes.new('ShaderNodeValToRGB'); eramp.location = (-150, -220)
    eramp.color_ramp.elements[0].position = tip_start
    eramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    eramp.color_ramp.elements[1].position = 0.95
    eramp.color_ramp.elements[1].color = (*tip_color, 1)
    links.new(invv.outputs['Value'], eramp.inputs['Fac'])
    links.new(eramp.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 0.35
    # NOTE: a procedural Voronoi-dot pass (irregular pale spots on the tip, like the
    # reference's markings) was attempted here and pulled back out -- it built and linked
    # correctly (verified node-by-node) but never visibly changed the render across several
    # very different Voronoi scales, which means something about how Cycles evaluates this
    # particular chain is still wrong in a way that wasn't found in the time available. Left
    # for a follow-up pass rather than shipping a dot effect that doesn't actually show up.
    # The old library's per-strand baked-PNG dot placement (inkwave_hair_refine.py:texture())
    # is a proven fallback if the procedural route keeps fighting.
    return m


# --------------------------------------------------------------------------- anchors (see head_probe.py / inkwave_ref_calibration.py)
# World metres, Blender Z-up, character faces -Y. +X = character's own left.

HEAD = dict(
    crown_top=(0.004, 0.020, 1.502),
    crown_backL=(0.024, 0.050, 1.497), crown_backR=(-0.016, 0.050, 1.497),
    crown_frontL=(0.019, -0.020, 1.491), crown_frontR=(-0.011, -0.020, 1.491),
    occiput_upper=(0.004, 0.116, 1.460), occiput_mid=(0.004, 0.127, 1.400),
    nape=(0.004, 0.073, 1.330),
    templeL=(0.101, 0.000, 1.400), templeR=(-0.090, 0.000, 1.400),
    templeL_low=(0.085, 0.000, 1.330), templeR_low=(-0.073, 0.000, 1.330),
    hairline_c=(0.004, -0.061, 1.455), hairline_u=(0.004, -0.049, 1.470),
    earL=(0.096, 0.050, 1.375), earR=(-0.090, 0.050, 1.375),
)


def build_tail(col, side, bevel_paddle, material):
    """side: +1 = character's left (world +X), -1 = character's right.
    Centreline X/Z from front.jpg pixel picks (inkwave_ref_calibration.py); Y is a modelled
    drape: the tail leaves the scalp near the ear/occiput, swings just in front of the
    shoulder line, then the flared tip sits slightly forward of the body -- checked against
    left.jpg/persp.jpg for plausible volume, not pixel-matched (different pose, see module
    docstring)."""
    # front.jpg pixel picks -> world X,Z (side==+1 picks; mirrored for side==-1)
    pix = [(280, 60), (300, 90), (330, 118), (365, 148), (395, 172), (415, 192), (424, 207), (410, 222), (372, 226)]
    from inkwave_ref_calibration import px_to_world_partial
    xz = [px_to_world_partial('front', px, py) for px, py in pix]
    # One hand-placed point before the pixel-derived sweep: the scalp root (near
    # occiput_upper, head_probe.py). Z then comes ONLY from the root + front.jpg picks, so it
    # decreases smoothly all the way to the tip -- no separate "up and over" apex point, which
    # produced a hook that crossed the face in the side render.
    xs = [0.03] + [v for _, v, _ in xz]
    zs = [1.460] + [z for _, _, z in xz]
    # Depth: a real, single-humped S-curve, not a flat sheet in Y. It bulges BACK first (the
    # poof the reference shows just past the tie, also visible bulging in left.jpg/persp.jpg),
    # then arcs forward past the shoulder as it sweeps out and down, easing back slightly at
    # the flared tip (the reference's tip curls rather than pointing straight out). left.jpg is
    # a different pose (see module docstring) so this is a modelled compromise, not a pixel
    # fit; it is sized to give genuine side-view volume, arcing clear of the face, instead of
    # the flat "paddle" the brief warns against.
    # Stays solidly BEHIND the head plane (positive Y) all the way down to shoulder height
    # (index 4, Z~1.14) -- the earlier version crossed to the front while Z was still at
    # face height, which reads as a hook cutting across the cheek in the side render. The
    # front-ward sweep now only happens below the shoulder, clear of the face.
    ys = [0.070, 0.085, 0.090, 0.080, 0.060, 0.020, -0.020, -0.050, -0.062, -0.040]
    # The reference's tails are a fairly even tube that FLARES into a wide, blunt, bulbous
    # fin near the tip (not a point) -- radius rises almost to the end, then only rounds off
    # over the last point.
    radii = [0.010, 0.022, 0.030, 0.038, 0.046, 0.054, 0.064, 0.076, 0.082, 0.055]
    assert len(xs) == len(zs) == len(ys) == len(radii) == 10
    pts = [(side * x, y, z) for x, y, z in zip(xs, ys, zs)]
    # VECTOR handles: the path bends sharply near the root (poof back, then out and down), and
    # Blender's AUTO handle smoothing overshoots that turn into a loop that hooks across the
    # face in the side render. Straight segments between 10 close-set points avoid that.
    name = f'HAIR2_tail_{"L" if side > 0 else "R"}_main'
    obj = strand(name, col, pts, radii, bevel_paddle, material, handle='VECTOR')
    # A slimmer inner strand riding just inside the main paddle for layered depth (the old
    # library's "second_club" idea, rebuilt as its own curve, not a copy of old geometry).
    pts2 = [(side * (x - 0.006), y + 0.01, z + 0.006) for x, y, z in zip(xs, ys, zs)]
    radii2 = [r * 0.72 for r in radii]
    name2 = f'HAIR2_tail_{"L" if side > 0 else "R"}_inner'
    obj2 = strand(name2, col, pts2, radii2, bevel_paddle, material, handle='VECTOR')
    return obj, obj2


def build_bangs(col, bevel_thin, material):
    """A fan of thin fringe strands, centre-parted, matching the many-thin-spikes look of
    the reference (not the old library's 6 thick locks). Hairline anchors from head_probe;
    tip spread/length read off front.jpg's fringe silhouette (x about 165-290, y 15-105)."""
    from inkwave_ref_calibration import px_to_world_partial
    objs = []
    # (root side offset along hairline as a 0..1 fraction from centre to temple, tip pixel, length factor)
    plan = [
        (0.04, (230, 15), 1.00), (0.10, (238, 22), 0.85), (0.16, (245, 30), 0.95),
        (0.22, (250, 38), 0.80), (0.27, (256, 45), 1.10), (0.33, (262, 53), 0.85),
        (0.38, (268, 62), 0.95), (0.44, (273, 72), 1.05), (0.50, (278, 82), 0.90),
        (0.56, (282, 92), 1.10), (0.62, (285, 100), 0.85), (0.68, (289, 96), 1.00),
        (0.74, (292, 90), 0.90), (0.80, (295, 80), 1.05), (0.86, (298, 72), 0.75),
    ]
    for i, (frac, (tpx, tpy), lf) in enumerate(plan):
        for side in (1, -1):
            axis, tx, tz = px_to_world_partial('front', tpx, tpy)
            tx *= side
            root = (side * (0.006 + frac * 0.10), HEAD['hairline_c'][1] + 0.006, HEAD['hairline_u'][2] - frac * 0.012)
            mid = ((root[0] + tx) / 2, root[1] - 0.028 * lf, (root[2] + tz) / 2 - 0.01)
            tip = (tx, root[1] - 0.050 * lf, tz - 0.015 * lf)
            pts = [root, mid, tip]
            radii = [0.014, 0.011, 0.003]
            name = f'HAIR2_bang_{"L" if side > 0 else "R"}_{i:02d}'
            objs.append(strand(name, col, pts, radii, bevel_thin, material, handle='VECTOR'))
    return objs


def build_temple_locks(col, bevel_thin, material):
    objs = []
    for side, key in [(1, 'templeL'), (-1, 'templeR')]:
        root = HEAD[key]
        low = HEAD[key + '_low']
        tip = (root[0] * 1.05, root[1] - 0.04, low[2] - 0.045)
        pts = [root, ((root[0] + low[0]) / 2, root[1] - 0.02, (root[2] + low[2]) / 2), low, tip]
        radii = [0.012, 0.014, 0.012, 0.004]
        objs.append(strand(f'HAIR2_temple_{"L" if side > 0 else "R"}', col, pts, radii, bevel_thin, material))
    return objs


def build_crown_poofs(col, bevel_thin, material):
    """Short thick curls giving volume where each tail leaves the scalp (the puffed
    crown seen in front.jpg/left.jpg above each tie), independent of the tail curves."""
    objs = []
    for side in (1, -1):
        # Monotonic up-and-slightly-out path (VECTOR handles): the previous version doubled
        # back in Z after the apex, and AUTO-handle smoothing turned that reversal into a loop
        # big enough to read as a hook in the side render.
        root = (side * 0.02, 0.03, 1.495)
        mid = (side * 0.045, 0.03, 1.535)
        apex = (side * 0.065, 0.015, 1.565)
        pts = [root, mid, apex]
        radii = [0.038, 0.055, 0.032]
        objs.append(strand(f'HAIR2_poof_{"L" if side > 0 else "R"}', col, pts, radii, bevel_thin, material, handle='VECTOR'))
    return objs


def build_scalp_cap(col, material):
    """Fresh base-of-hair shell: an icosphere subset, shrinkwrapped onto HEAD_face/HEAD_skin*
    (built-in Shrinkwrap modifier, then applied) -- a new datablock, not a deformed copy of
    the old HAIR_scalp."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.128, location=(HEAD['crown_top'][0], 0.01, 1.40))
    cap = bpy.context.active_object
    cap.name = 'HAIR2_scalp'
    bm = bmesh.new(); bm.from_mesh(cap.data)
    # Keep only the upper shell that should carry hair (down past ear height at the back/sides,
    # higher at the front), matching the reference's shaved-side/undercut silhouette -- back.jpg
    # shows the shaved patch only right around/below the ear, not half the head.
    to_del = [v for v in bm.verts if (v.co.z < -0.055) or (v.co.y < -0.05 and v.co.z < 0.02)]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bm.to_mesh(cap.data); bm.free()
    for old in list(cap.users_collection):
        old.objects.unlink(cap)
    col.objects.link(cap)
    targets = [n for n in ['HEAD_face', 'HEAD_skin', 'HEAD_skin_02', 'HEAD_skin_03', 'HEAD_skin_04',
                            'HEAD_skin_05', 'HEAD_skin_06', 'HEAD_skin_07', 'HEAD_skin_08', 'HEAD_skin_09']
               if n in bpy.data.objects]
    mod = cap.modifiers.new('Shrinkwrap', 'SHRINKWRAP')
    mod.target = bpy.data.objects[targets[0]]
    mod.offset = 0.004
    mod.wrap_method = 'NEAREST_SURFACEPOINT'
    bpy.context.view_layer.objects.active = cap
    bpy.ops.object.modifier_apply(modifier=mod.name)
    cap.data.materials.append(material)
    for p in cap.data.polygons:
        p.use_smooth = True
    return cap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    args, _ = ap.parse_known_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

    sys.path.insert(0, str(Path(__file__).resolve().parent))  # for inkwave_ref_calibration.py

    col = get_collection()
    clear_collection(col)

    paddle = oval_profile('HAIR2_PROFILE_paddle', 1.0, 0.44, n=14)
    thin = round_profile('HAIR2_PROFILE_thin', 1.0, n=8)

    # Root teal -> tip lime, matching the reference's colouring (see docs/hair-rebuild-v2).
    mat_hair = gradient_hair_material('HAIR2_GRADIENT', (0.05, 0.42, 0.46), (0.72, 0.86, 0.30), tip_start=0.62)
    mat_scalp = clay_material('HAIR2_CLAY_scalp', (0.06, 0.32, 0.36))

    build_tail(col, +1, paddle, mat_hair)
    build_tail(col, -1, paddle, mat_hair)
    build_bangs(col, thin, mat_hair)
    build_temple_locks(col, thin, mat_hair)
    build_crown_poofs(col, thin, mat_hair)
    cap = build_scalp_cap(col, mat_scalp)

    for o in list(col.objects):
        if o.type == 'CURVE':
            convert_to_mesh(o)

    for p in (paddle, thin):
        bpy.data.objects.remove(p, do_unlink=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.out))
    print('HAIR_REBUILD_V2_BUILD_DONE', len(col.objects), 'objects')


if __name__ == '__main__':
    main()
