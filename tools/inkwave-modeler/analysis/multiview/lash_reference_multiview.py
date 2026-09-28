"""Soft eyeliner/lash masks from the 5-view reference sheet (minus-side eye).

Writes lash_reference_multiview.npz for scripts/inkwave_eye_refine.py (lash mode
'decal'). Alpha is the pixel's position on the skin -> liner-black colour line;
pixels off that line (sclera, iris, brow, hair) and the pupil inside the iris
hull are excluded. Coordinates are sheet-box pixels of each fitted camera.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SHEET = HERE.parent.parent / 'docs/face-multiview-fit/refs/sheet_5view.png'
BOX = {'front': (60, 230), 'q34R': (1370, 230), 'sideR': (1790, 230)}
# name: (camera view, ROI x0 y0 x1 y1 in box px, skin sample box in box px)
ROI = {'front_minus': ('front', (80, 95, 180, 148), (140, 140, 160, 148)),
       'q34R_minus': ('q34R', (152, 95, 250, 150), (225, 140, 245, 150)),
       'sideR_minus': ('sideR', (222, 95, 332, 152), (284, 142, 298, 150))}
BLACK = np.array([18.0, 14.0, 15.0])
# Front view: pixels below the line through the outer and inner eye corners are lower lashes.
LOWER_LINE = ((104.0, 118.0), (170.0, 135.0))


def lash_mask(image, view, roi, skin_box):
    bx, by = BOX[view]
    crop = image[by + roi[1]:by + roi[3], bx + roi[0]:bx + roi[2]]
    skin = np.median(image[by + skin_box[1]:by + skin_box[3], bx + skin_box[0]:bx + skin_box[2]].reshape(-1, 3), 0)
    axis = skin - BLACK
    t = ((skin - crop) @ axis) / (axis @ axis)
    closest = skin - t[..., None] * axis
    residual = np.linalg.norm(crop - closest, axis=2)
    alpha = np.clip((t - 0.20) / 0.55, 0, 1) * np.clip((40 - residual) / 15, 0, 1)
    # the pupil and dark iris rim lie inside the hull of the teal iris
    hsv = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV)
    teal = ((hsv[..., 0] > 75) & (hsv[..., 0] < 100) & (hsv[..., 1] > 90) & (hsv[..., 2] > 90)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(teal, 8)
    iris = np.zeros_like(teal)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, 4]))
        hull = cv2.convexHull(np.argwhere(lab == big)[:, ::-1].astype(np.int32))
        cv2.fillConvexPoly(iris, hull, 1)
    alpha[iris > 0] = 0
    # eye opening: sclera, iris and pupil enclosed by the liner
    lum = crop @ [0.299, 0.587, 0.114]
    sclera = (lum > 150) & (hsv[..., 1] < 70)
    opening = (sclera | (teal > 0) | (iris > 0)).astype(np.uint8)
    opening = cv2.morphologyEx(opening, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    liner = np.zeros_like(opening)
    cv2.fillConvexPoly(liner, cv2.convexHull(np.argwhere(alpha > 0.5)[:, ::-1].astype(np.int32)), 1)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(opening * liner, 8)
    opening = (lab == 1 + int(np.argmax(stats[1:, 4]))).astype(np.uint8)
    contours, _ = cv2.findContours(opening, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    opening = np.zeros_like(opening)
    cv2.drawContours(opening, contours, -1, 1, -1)
    return alpha.astype(np.float32), skin, opening


def main():
    image = np.asarray(Image.open(SHEET).convert('RGB')).astype(np.float64)
    out = {}
    for name, (view, roi, skin_box) in ROI.items():
        alpha, skin, opening = lash_mask(image, view, roi, skin_box)
        out[name + '_alpha'] = alpha
        out[name + '_opening'] = opening
        if view == 'front':
            (ax, ay), (bx, by) = LOWER_LINE
            yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]] + 0.5
            u, v = xx + roi[0], yy + roi[1]
            out[name + '_lower'] = (v > ay + (u - ax) * (by - ay) / (bx - ax)).astype(np.uint8)
        out[name + '_roi'] = np.array(roi, np.int32)
        print(name, view, 'area', round(float(alpha.sum()), 1), 'skin', skin.round())
    out['names'] = np.array(list(ROI))
    out['views'] = np.array([ROI[n][0] for n in ROI])
    out['black'] = BLACK
    np.savez_compressed(HERE / 'lash_reference_multiview.npz', **out)


if __name__ == '__main__':
    main()
