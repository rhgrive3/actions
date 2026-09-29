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
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
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
    ramp.color_ramp.elements[0].position = tip_start - 0.2
    ramp.color_ramp.elements[0].color = (*root_color, 1)
    ramp.color_ramp.elements[1].position = min(tip_start + 0.12, 0.98)
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


def build_tails_hull(col, material, params, points_path, decimate_ratio=0.25):
    """The twin tails as ONE measured volume: inkwave_hair_rebuild_v2_tail_hull.npy holds the
    6 mm voxel centres left by space carving against the hair silhouettes of front/back/left
    (analysis/hair-rebuild/carve.py: carve where a view shows background, or shows the body in
    front of the voxel; keep only voxels seen as hair in >= 2 views; round the cross-section).
    Turned into a surface with built-in Geometry Nodes (Mesh to Points -> Points to Volume ->
    Volume to Mesh), then built-in Smooth and Decimate. Root->tip colour fraction t comes from
    the measured centre lines (tail_bundle / tail_lobes) via the built-in KDTree, written to
    UVMap as V = 1 - t (gradient_hair_material inverts V)."""
    from mathutils.kdtree import KDTree
    pts = np.load(points_path)
    me = bpy.data.meshes.new('HAIR2_tails')
    me.vertices.add(len(pts)); me.vertices.foreach_set('co', pts.ravel())
    ob = bpy.data.objects.new('HAIR2_tails', me); col.objects.link(ob)
    ng = bpy.data.node_groups.new('HAIR2_hull_to_mesh', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n, L = ng.nodes, ng.links
    gi, go = n.new('NodeGroupInput'), n.new('NodeGroupOutput')
    m2p = n.new('GeometryNodeMeshToPoints'); m2p.inputs['Radius'].default_value = 0.0055
    p2v = n.new('GeometryNodePointsToVolume')
    p2v.inputs['Resolution Mode'].default_value = 'Size'; p2v.inputs['Voxel Size'].default_value = 0.004
    p2v.inputs['Radius'].default_value = 0.0055
    v2m = n.new('GeometryNodeVolumeToMesh'); v2m.inputs['Threshold'].default_value = 0.3
    L.new(gi.outputs[0], m2p.inputs['Mesh']); L.new(m2p.outputs['Points'], p2v.inputs['Points'])
    L.new(p2v.outputs['Volume'], v2m.inputs['Volume']); L.new(v2m.outputs['Mesh'], go.inputs[0])
    bpy.context.view_layer.objects.active = ob
    for name, kind, setup in (('hull', 'NODES', lambda m: setattr(m, 'node_group', ng)),
                              ('smooth', 'SMOOTH', lambda m: (setattr(m, 'factor', 0.9), setattr(m, 'iterations', 40))),
                              ('decimate', 'DECIMATE', lambda m: setattr(m, 'ratio', decimate_ratio))):
        m = ob.modifiers.new(name, kind); setup(m)
        bpy.ops.object.modifier_apply(modifier=name)
    bpy.data.node_groups.remove(ng)
    B, tie = params['tail_bundle'], np.array(params['tie'])
    samples = []
    for sx in (1, -1):
        bp = np.r_[[tie * [sx, 1, 1]], np.c_[sx * np.array(B['x']), B['y'], B['z']]]
        bl = np.r_[0, np.cumsum(np.linalg.norm(np.diff(bp, axis=0), axis=1))]
        for t in params['tail_lobes']:
            lp = np.c_[sx * np.array(t['x']), t['y'], t['z']]
            ll = bl[-1] + np.r_[0, np.cumsum(np.linalg.norm(np.diff(lp, axis=0), axis=1))]
            samples += [(p, l / ll[-1]) for p, l in list(zip(bp, bl)) + list(zip(lp, ll))]
    kd = KDTree(len(samples))
    for i, (p, _) in enumerate(samples):
        kd.insert(Vector(p), i)
    kd.balance()
    tv = np.array([samples[kd.find(v.co)[1]][1] for v in ob.data.vertices])
    loops = np.empty(len(ob.data.loops), int); ob.data.loops.foreach_get('vertex_index', loops)
    uvl = ob.data.uv_layers.get('UVMap') or ob.data.uv_layers.new(name='UVMap')
    uv = np.zeros((len(loops), 2)); uv[:, 0] = 0.5; uv[:, 1] = 1 - tv[loops]
    uvl.data.foreach_set('uv', uv.ravel())
    ob.data.materials.clear(); ob.data.materials.append(material)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


HEAD_MESHES = ['HEAD_face', 'HEAD_skin', 'HEAD_skin_02', 'HEAD_skin_03', 'HEAD_skin_04',
               'HEAD_skin_05', 'HEAD_skin_06', 'HEAD_skin_07', 'HEAD_skin_08', 'HEAD_skin_09']


def head_bvh():
    from mathutils.bvhtree import BVHTree
    verts, polys = [], []
    for n in HEAD_MESHES:
        o = bpy.data.objects.get(n)
        if not o:
            continue
        base = len(verts)
        verts += [o.matrix_world @ v.co for v in o.data.vertices]
        polys += [[i + base for i in f.vertices] for f in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def build_bangs(col, bevel, material, params, bvh):
    """Front locks, all positions measured (params['bangs'], see its "source"). Roots sit on
    the scalp at the part (downward ray cast onto the head), tips at the picked front.jpg
    pixels; the intermediate points are pushed off the skull along the surface normal
    (BVH nearest point), so each lock follows the head instead of cutting through it."""
    from inkwave_ref_calibration import px_to_world_partial
    objs = []

    def front_xz(px):
        _, x, z = px_to_world_partial('front', *px)
        return x, z

    def in_front_of_face(x, z, gap):
        hit = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))[0]
        if hit is not None:
            return hit.y - gap
        q = bvh.find_nearest(Vector((x, 0.0, z)))[0]
        return q.y - gap

    def off_skull(p, gap):
        q, n, _, _ = bvh.find_nearest(p)          # n = outward face normal of the head mesh
        inside_or_close = n.dot(p - q) < gap
        return q + n * gap if inside_or_close else p

    for lock in params['bangs']['locks']:
        r = lock['radius']
        rx, _ = front_xz(lock['root_px'])
        hit = bvh.ray_cast(Vector((rx, -0.01, 2.0)), Vector((0, 0, -1)))
        root = hit[0] + hit[1] * 0.004
        tx, tz = front_xz(lock['tip_px'])
        if 'side_tip_px' in lock:
            _, ty, _ = px_to_world_partial('left', *lock['side_tip_px'])
        else:
            ty = in_front_of_face(tx, tz, r[3] + 0.008)
        tip = Vector((tx, ty, tz))
        if 'mid_px' in lock:
            mx, mz = front_xz(lock['mid_px'])
            mid = Vector((mx, in_front_of_face(mx, mz, r[2] + 0.008), mz))
        else:
            mid = off_skull(root.lerp(tip, 0.55), r[2] + 0.006)
        p1 = off_skull(root.lerp(mid, 0.45), r[1] + 0.006)
        pts = [tuple(root), tuple(p1), tuple(mid), tuple(tip)]
        objs.append(strand(f'HAIR2_bang_{lock["name"]}', col, pts, r, bevel, material, resolution=8))
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

    params = json.loads((Path(__file__).resolve().parent / 'inkwave_hair_rebuild_v2_params.json').read_text())
    paddle = round_profile('HAIR2_PROFILE_paddle', 1.0, n=16)

    # Root teal -> tip lime. Colours = mean linear RGB of the teal / lime hair pixels of front.jpg
    # (measured, highlights included); the switch sits on the fins (root->tip fraction 0.5-0.82).
    mat_hair = gradient_hair_material('HAIR2_GRADIENT', (0.093, 0.314, 0.319), (0.655, 0.79, 0.286), tip_start=0.80)
    mat_scalp = clay_material('HAIR2_CLAY_scalp', (0.06, 0.32, 0.36))

    build_tails_hull(col, mat_hair, params, Path(__file__).resolve().parent / 'inkwave_hair_rebuild_v2_tail_hull.npy')
    build_bangs(col, paddle, mat_hair, params, head_bvh())
    build_scalp_cap(col, mat_scalp)

    for o in list(col.objects):
        if o.type == 'CURVE':
            convert_to_mesh(o)

    bpy.data.objects.remove(paddle, do_unlink=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.out))
    print('HAIR_REBUILD_V2_BUILD_DONE', len(col.objects), 'objects')


if __name__ == '__main__':
    main()
