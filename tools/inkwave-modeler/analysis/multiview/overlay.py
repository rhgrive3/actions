"""Overlay of the current fit on the reference sheet: ref contour (green), model outer silhouette (red),
ref landmarks (yellow) and model landmarks (cyan) joined by a line. python3 overlay.py geom.npz cams.json out.png"""
import json, sys
import numpy as np
import cv2
from PIL import Image
import mvcore as M
import model_lm
import contours as C

BOX = {'front': (130, 290, 360, 470), 'q34L': (480, 310, 700, 480), 'sideL': (880, 300, 1150, 470),
       'q34R': (1390, 290, 1680, 470), 'sideR': (1880, 280, 2150, 470)}
FACE_ONLY = 'HEAD_face'


def draw(geom, cams, dist, out, k=3, title=None, extra=None):
    sheet = np.asarray(Image.open(C.SHEET).convert('RGB'))
    lm = json.load(open('model_lm.json'))
    P = model_lm.positions(geom, lm)
    ref = json.load(open('ref_landmarks.json'))
    rc = C.ref_contours()
    face = geom[FACE_ONLY]; q = M.to_local(face['v'])
    tiles = []
    for v, (x0, y0, x1, y1) in BOX.items():
        cam = cams[v]
        tile = cv2.resize(sheet[y0:y1, x0:x1], ((x1 - x0) * k, (y1 - y0) * k), interpolation=cv2.INTER_CUBIC)
        tile = (tile * 0.75).astype(np.uint8).copy()
        T = lambda p: (int(round((p[0] - x0) * k)), int(round((p[1] - y0) * k)))
        uv, dep = M.project(cam, q, dist)
        _, (mask, lo, ss) = C.model_silhouette(uv, dep, face['f'])
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for c in cnts:
            pts = c[:, 0, :] / ss + lo
            cv2.polylines(tile, [np.array([T(p) for p in pts], np.int32)], True, (255, 60, 60), 1, cv2.LINE_AA)
        if extra is not None:
            uv2, _ = M.project(cam, M.to_local(extra['HEAD_face']['v']), dist)
            _, (m2, lo2, ss2) = C.model_silhouette(uv2, None, extra['HEAD_face']['f'])
            cnts, _ = cv2.findContours(m2, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            for c in cnts:
                pts = c[:, 0, :] / ss2 + lo2
                cv2.polylines(tile, [np.array([T(p) for p in pts], np.int32)], True, (255, 170, 0), 1, cv2.LINE_AA)
        for u, vv, nu, nv in rc.get(v, []):
            cv2.circle(tile, T((u, vv)), 1, (60, 255, 60), -1)
        for n, p in ref[v].items():
            if n not in P:
                continue
            m, _ = M.project(cam, P[n][None], dist)
            cv2.line(tile, T(p), T(m[0]), (255, 255, 255), 1, cv2.LINE_AA)
            cv2.circle(tile, T(p), 3, (255, 230, 0), -1)
            cv2.circle(tile, T(m[0]), 3, (0, 220, 255), 1)
        cv2.putText(tile, v, (5, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        tiles.append(tile)
    H = max(t.shape[0] for t in tiles)
    row = np.concatenate([np.pad(t, ((0, H - t.shape[0]), (0, 4), (0, 0)), constant_values=255) for t in tiles], 1)
    if title:
        bar = np.full((28, row.shape[1], 3), 255, np.uint8)
        cv2.putText(bar, title, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        row = np.concatenate([bar, row], 0)
    Image.fromarray(row).save(out)


if __name__ == '__main__':
    g = M.load(sys.argv[1]); cj = json.load(open(sys.argv[2]))
    draw(g, cj['cams'], cj['dist'], sys.argv[3])
