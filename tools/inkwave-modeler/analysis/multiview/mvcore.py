"""Shared numpy core of the multi-view face fit (no bpy): head space, cameras, model landmarks, silhouettes.

Head space is the one of scripts/inkwave_face_refine.py (x = character's left, y = up, z = forward, metres,
origin at the runtime head centre). Blender world is Z-up with the face toward -Y."""
import math
import numpy as np

HEAD_CENTRE = np.array([0.004, 1.39, -0.012])  # runtime (three) coordinates
GRID = (157, 177)                               # HEAD_face ring grid (rings bottom -> top, columns around)


def _euler_yxz(yaw, pitch, roll):
    cy, sy, cx, sx, cz, sz = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


HEAD_R = _euler_yxz(0.03, 0.0, -0.115)


def to_local(world):
    three = np.c_[world[:, 0], world[:, 2], -world[:, 1]]
    return (three - HEAD_CENTRE) @ HEAD_R


def to_world(local):
    three = local @ HEAD_R.T + HEAD_CENTRE
    return np.c_[three[:, 0], -three[:, 2], three[:, 1]]


def to_world_delta(local_delta):
    three = local_delta @ HEAD_R.T
    return np.c_[three[:, 0], -three[:, 2], three[:, 1]]


def load(path):
    z = np.load(path)
    names = sorted({k.split('|')[0] for k in z.files})
    return {n: {'v': z[n + '|v'].astype(np.float64), 'n': z[n + '|n'].astype(np.float64), 'f': z[n + '|f']} for n in names}


# ------------------------------------------------------------------ cameras
# A view camera looks at the head centre from azimuth az (0 = front, + = toward the character's left) and elevation el
# (+ = from above), rolled by roll, at distance dist; the image is s px per metre at the head centre, and the head
# centre lands on (u0, v0) (sheet pixels, v down). All angles in head space.
CAM_KEYS = ('az', 'el', 'roll', 's', 'u0', 'v0')


def cam_basis(az, el, roll):
    """Rows: image right, image up, toward the camera (head space)."""
    fwd = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])  # head -> camera
    up0 = np.array([0.0, 1.0, 0.0])
    right = np.cross(up0, fwd); right /= np.linalg.norm(right)
    up = np.cross(fwd, right)
    c, s = math.cos(roll), math.sin(roll)
    r2, u2 = c * right + s * up, -s * right + c * up
    return np.stack([r2, u2, fwd])


def project(cam, q, dist):
    """Head-space points (N x 3) -> sheet pixels (N x 2) and depth toward the camera (N)."""
    B = cam_basis(cam['az'], cam['el'], cam['roll'])
    c = q @ B.T
    k = dist / (dist - c[:, 2])
    return np.c_[cam['u0'] + cam['s'] * c[:, 0] * k, cam['v0'] - cam['s'] * c[:, 1] * k], c[:, 2]


def project_jac(cam, q, dist):
    """d(u, v)/d(q) per point: N x 2 x 3."""
    B = cam_basis(cam['az'], cam['el'], cam['roll'])
    c = q @ B.T
    k = dist / (dist - c[:, 2])
    dk = dist / (dist - c[:, 2]) ** 2
    J = np.zeros((len(q), 2, 3))
    J[:, 0] = cam['s'] * (k[:, None] * B[0] + (c[:, 0] * dk)[:, None] * B[2])
    J[:, 1] = -cam['s'] * (k[:, None] * B[1] + (c[:, 1] * dk)[:, None] * B[2])
    return J
