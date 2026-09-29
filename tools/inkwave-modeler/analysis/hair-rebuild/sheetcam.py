"""頭の付け根を見るための 5 方向カメラ。顔合わせで求めたシートのカメラ値（analysis/multiview/field.json）
から、scripts/inkwave_face_multiview_fit.py:make_cameras と同じ式で作る。枠だけ頭の上まで広げる。
bpy の中で import して使う。"""
import json, os, sys
import numpy as np
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../multiview'))
import mvcore as M  # noqa: E402

SHEET = os.path.join(HERE, '../../docs/face-multiview-fit/refs/sheet_5view.png')
# 各ビューの枠（シート画素）。顔合わせの枠（y 230-520）より上に広げ、髪の付け根とふくらみを入れる。
BOX = {'front': (48, 100, 428, 470), 'q34L': (400, 100, 780, 470), 'sideL': (850, 100, 1230, 470),
       'q34R': (1350, 100, 1730, 470), 'sideR': (1790, 100, 2170, 470)}


def make_cameras():
    spec = json.load(open(os.path.join(HERE, '../multiview/field.json')))
    dist = spec['dist']
    cams = {}
    for view, cam in spec['cams'].items():
        name = 'HAIRFIT_CAM_' + view
        if name in bpy.data.objects:
            cams[view] = bpy.data.objects[name]; continue
        B = M.cam_basis(cam['az'], cam['el'], cam['roll'])
        R = np.stack([M.to_world_delta(B[i][None])[0] for i in range(3)], 1)
        loc = M.to_world((B[2] * dist)[None])[0]
        x0, y0, x1, y1 = BOX[view]; W, Hh = x1 - x0, y1 - y0
        data = bpy.data.cameras.new(name)
        data.type = 'PERSP'; data.sensor_fit = 'HORIZONTAL'; data.sensor_width = 36.0
        data.lens = cam['s'] * dist * data.sensor_width / W
        data.shift_x = -(cam['u0'] - x0 - W / 2) / max(W, Hh)
        data.shift_y = (cam['v0'] - y0 - Hh / 2) / max(W, Hh)
        data.clip_start, data.clip_end = 0.05, 50.0
        o = bpy.data.objects.new(name, data)
        mw = Matrix.Identity(4)
        for i in range(3):
            for j in range(3):
                mw[i][j] = R[i, j]
            mw[i][3] = loc[i]
        o.matrix_world = mw
        o['box'] = list(BOX[view])
        bpy.context.scene.collection.objects.link(o)
        cams[view] = o
    return cams


def use(view, scale=2):
    cams = make_cameras()
    sc = bpy.context.scene
    x0, y0, x1, y1 = BOX[view]
    sc.camera = cams[view]
    sc.render.resolution_x = (x1 - x0) * scale; sc.render.resolution_y = (y1 - y0) * scale
    sc.render.resolution_percentage = 100
