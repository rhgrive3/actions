"""Soft eyebrow masks and unmixed colours from the 5-view reference sheet.

Writes brow_reference_multiview.npz for scripts/inkwave_eye_refine.py (brow mode
'multiview_decal'). Coordinates are sheet-box pixels of each fitted camera.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SHEET = HERE.parent.parent / 'docs/face-multiview-fit/refs/sheet_5view.png'
BOX = {'front': (60, 230), 'q34R': (1370, 230), 'sideR': (1790, 230)}
# name: (camera view, ROI x0 y0 x1 y1 in box px, expected brow centre)
ROI = {'front_minus': ('front', (85, 70, 190, 125), (135, 97)),
       'q34R_minus': ('q34R', (160, 70, 290, 125), (220, 97)),
       'sideR_minus': ('sideR', (225, 70, 345, 125), (275, 97))}


def soft_mask(image, view, roi, centre):
    bx, by = BOX[view]
    crop = image[by + roi[1]:by + roi[3], bx + roi[0]:bx + roi[2]]
    hsv = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(float)
    teal = ((hsv[..., 0] > 78) & (hsv[..., 0] < 108) & (hsv[..., 1] > 70)
            & (hsv[..., 2] < 190)).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(teal, 8)
    comps = [i for i in range(1, n) if stats[i, 4] >= 30]
    best = min(comps, key=lambda i: np.hypot(cent[i, 0] + roi[0] - centre[0],
                                             cent[i, 1] + roi[1] - centre[1]))
    comp = (lab == best).astype(np.uint8)
    core = cv2.erode(comp, np.ones((3, 3), np.uint8))
    region = cv2.dilate(comp, np.ones((5, 5), np.uint8))
    ring = (cv2.dilate(comp, np.ones((9, 9), np.uint8)) > 0) & (region == 0) & (hsv[..., 0] < 30)
    skin = np.median(crop[ring], 0)
    brow = np.median(crop[core > 0], 0)
    axis = brow - skin
    t = ((crop - skin) @ axis) / (axis @ axis)
    alpha = np.clip(t / 0.85, 0, 1) * (region > 0)
    # Undo the skin mix at the antialiased edge; fill unreliable pixels from the nearest core.
    valid = (t > 0.45) & (region > 0)
    rgb = skin + (crop - skin) / np.maximum(t, 0.45)[..., None]
    _, labels = cv2.distanceTransformWithLabels((~valid).astype(np.uint8), cv2.DIST_L2, 5,
                                                labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(valid)
    lookup = np.zeros(labels.max() + 1, int)
    lookup[labels[ys, xs]] = np.arange(len(ys))
    idx = lookup[labels]
    rgb = np.clip(rgb[ys[idx], xs[idx]], 0, 255)
    return alpha.astype(np.float32), rgb.astype(np.float32), skin, brow


def main():
    image = np.asarray(Image.open(SHEET).convert('RGB')).astype(np.float64)
    out = {}
    for name, (view, roi, centre) in ROI.items():
        alpha, rgb, skin, brow = soft_mask(image, view, roi, centre)
        out[name + '_alpha'] = alpha
        out[name + '_rgb'] = rgb
        out[name + '_roi'] = np.array(roi, np.int32)
        print(name, view, 'area', round(float(alpha.sum()), 1), 'skin', skin.round(), 'brow', brow.round())
    out['names'] = np.array(list(ROI))
    out['views'] = np.array([ROI[n][0] for n in ROI])
    np.savez_compressed(HERE / 'brow_reference_multiview.npz', **out)


if __name__ == '__main__':
    main()
