"""検証済み参照カメラ（inkwave_blender_import.py:set_camera と同じ値、448x560）。"""
import math
import bpy
from mathutils import Vector


def set_camera(view):
    px = {'front': (566, 1334, 842), 'back': (561, 1338, 847), 'left': (575, 1329, 838)}
    cam = bpy.data.objects['INKWAVE_VALIDATION_CAMERA']
    if view in px:
        cx, gy, s = px[view]
        hc = (1122 / 2 - cx) / s; vc = (gy - 1402 / 2) / s
        cam.location = {'front': (hc, -10, vc), 'back': (-hc, 10, vc), 'left': (-10, -hc, vc)}[view]
        t = Vector((cam.location.x if view in ('front', 'back') else 0, cam.location.y if view == 'left' else 0, vc))
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1402 / s
    else:
        az, el, dist = -0.55, 0.08, 3.3
        t = Vector((0, 0, 0.8))
        cam.location = (math.sin(az) * math.cos(el) * dist, -math.cos(az) * math.cos(el) * dist, t.z + math.sin(el) * dist)
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.sensor_fit = 'VERTICAL'
        cam.data.sensor_height = 2 * 50 * math.tan(math.radians(30) / 2)
    bpy.context.scene.camera = cam


