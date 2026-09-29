"""Validated INKWAVE reference-image camera calibration (constants copied from
scripts/inkwave_blender_import.py:set_camera/reference_environment - proven to match the
Three.js runtime render at silhouette IoU ~0.98, see blender/README.md section 5.2).
Pure numpy/py, no bpy: lets us pick/verify 3D points against the 448x560 reference jpgs
before ever opening Blender, using the SAME camera Blender will render with.

Derivation of the look_at frame (`to_track_quat('-Z','Y')` pointed along +/-X or +/-Y,
world-up +Z): local Y always ~= world +Z (perpendicular already since the look axis is
horizontal); local X = local Y x local Z (right-handed). Worked out per view below.
"""
CAL_W, CAL_H = 1122, 1402
RES_W, RES_H = 448, 560          # reference jpgs / our render target (same aspect as 1122x1402)
ASPECT = RES_W / RES_H

PX = {   # view -> (cx, gy, scale) in the 1122x1402 calibration space
    'front': (566, 1334, 842),
    'back': (561, 1338, 847),
    'left': (575, 1329, 838),
    'right': (575, 1329, 838),   # mirrored 'left' (no separate right photo)
}
# image-right (local +X) direction in world, and which world axis is "free" (view depth axis).
IMAGE_RIGHT_WORLD = {'front': (+1, 'X'), 'back': (-1, 'X'), 'left': (-1, 'Y'), 'right': (+1, 'Y')}


def ortho_params(view):
    cx, gy, scale = PX[view]
    hc = (CAL_W / 2 - cx) / scale
    vc = (gy - CAL_H / 2) / scale
    ortho_scale = CAL_H / scale     # world metres spanned by the frame HEIGHT
    return hc, vc, ortho_scale


def free_axis_centre(view, hc):
    # front/back centre the free axis (X) at +hc / -hc; left/right centre Y at -hc / +hc.
    return {'front': hc, 'back': -hc, 'left': -hc, 'right': hc}[view]


def px_to_world_partial(view, px, py):
    """448x560 pixel -> (free_axis_name, free_value, z). The other horizontal axis is
    unconstrained by a single orthographic view."""
    hc, vc, ortho_scale = ortho_params(view)
    u = px / RES_W - 0.5
    sign, axis = IMAGE_RIGHT_WORLD[view]
    centre = free_axis_centre(view, hc)
    value = centre + sign * u * ortho_scale * ASPECT
    z = vc + (0.5 - py / RES_H) * ortho_scale
    return axis, value, z


def world_to_px(view, x, y, z):
    hc, vc, ortho_scale = ortho_params(view)
    sign, axis = IMAGE_RIGHT_WORLD[view]
    centre = free_axis_centre(view, hc)
    value = x if axis == 'X' else y
    u = (value - centre) / (sign * ortho_scale * ASPECT)
    px = (u + 0.5) * RES_W
    py = (0.5 - (z - vc) / ortho_scale) * RES_H
    return px, py


def triangulate_front_left(px_f, py_f, px_l, py_l):
    """A point picked at the same real height in front.jpg and left.jpg -> full (x,y,z).
    Uses the front pixel's z (front calibration is the more reliable of the two for
    face/crown height); the two z estimates should already agree closely if the pick was
    good."""
    axis_f, x, z_f = px_to_world_partial('front', px_f, py_f)
    axis_l, y, z_l = px_to_world_partial('left', px_l, py_l)
    assert axis_f == 'X' and axis_l == 'Y'
    return x, y, z_f, z_l


if __name__ == '__main__':
    # Sanity checks against known probe points (world_probe.json, from head_probe.py):
    # - crown_top_centre (0.004, 0.02, 1.502) must land near top-centre of front.jpg
    #   (small py, px near the middle ~224) AND near top-centre-ish of left.jpg.
    # - templeL (0.101, 0.0, 1.40), character's own left temple, BODY_arm_L is at +X =
    #   character's left -> must land on the RIGHT half of front.jpg (px > 224).
    # - hairline_centre (0.004, -0.061, 1.455) must land in the upper-middle of front.jpg,
    #   and on the FRONT (small py-ish / large px?) side of left.jpg: left's image-right
    #   is -Y i.e. more negative y = larger px, hairline y=-0.061 is quite negative (toward
    #   the face) so it should sit well into the right half of left.jpg (matching the nose
    #   pointing right in left.jpg).
    for view, pt in [('front', (0.004, 0.02, 1.502)), ('left', (0.004, 0.02, 1.502)),
                      ('front', (0.101, 0.0, 1.40)), ('left', (0.101, 0.0, 1.40)),
                      ('front', (0.004, -0.061, 1.455)), ('left', (0.004, -0.061, 1.455))]:
        print(view, pt, '-> px,py =', tuple(round(v, 1) for v in world_to_px(view, *pt)))
