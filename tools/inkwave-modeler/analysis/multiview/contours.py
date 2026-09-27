"""Reference face contours from the skin mask (per image row, the outermost skin pixel on one side) and the model's
outer silhouette (rasterised HEAD_face) with the vertices on it."""
import numpy as np
import cv2
from PIL import Image

SHEET = '../../docs/face-multiview-fit/refs/sheet_5view.png'
# view: list of (side, x0, x1, y0, y1): rows y0..y1, the outermost skin pixel toward `side` inside columns x0..x1.
# Rows are where the skin edge is the face against background or hair (no ear, no neck, no bangs in front).
SPEC = {
    'front': [('left', 150, 240, 404, 433), ('right', 250, 345, 408, 440)],
    'q34L': [('left', 500, 575, 396, 457)],
    'sideL': [('left', 895, 1000, 380, 450)],
    'q34R': [('right', 1590, 1690, 386, 452)],
    'sideR': [('right', 2000, 2172, 300, 452)],
}


def skin_prob():
    im = np.asarray(Image.open(SHEET).convert('RGB'))
    hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = ((h >= 2) & (h <= 20) & (s >= 60) & (v >= 90)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return m


def ref_contours(mask=None):
    """{view: [(u, v, nu, nv), ...]} contour samples (sheet px) with the outward 2-D normal."""
    m = skin_prob() if mask is None else mask
    out = {}
    for view, spans in SPEC.items():
        pts = []
        for side, x0, x1, y0, y1 in spans:
            for y in range(y0, y1 + 1):
                row = m[y, x0:x1 + 1] > 127
                idx = np.where(row)[0]
                if len(idx) == 0:
                    continue
                if side == 'left':
                    i = idx[0]; u = x0 + i - 0.5          # edge between background and first skin pixel
                else:
                    i = idx[-1]; u = x0 + i + 0.5
                pts.append([u, float(y), side])
        # outward normals from the local tangent of each side's polyline
        res = []
        for side in ('left', 'right'):
            p = np.array([[a, b] for a, b, s in pts if s == side], float)
            if len(p) < 3:
                continue
            k = 3
            for i in range(len(p)):
                a, b = p[max(0, i - k)], p[min(len(p) - 1, i + k)]
                t = b - a; t /= np.linalg.norm(t) + 1e-9
                n = np.array([t[1], -t[0]])                  # rows go down; left side: outward = -x
                if (side == 'left' and n[0] > 0) or (side == 'right' and n[0] < 0):
                    n = -n
                res.append([p[i, 0], p[i, 1], n[0], n[1]])
        out[view] = np.array(res)
    return out


def model_silhouette(uv, depth, faces, ss=4, pad=8):
    """Rasterise projected triangles (sheet px) at ss x supersampling; return the indices of vertices on the outer
    silhouette (within ~0.75 px of the mask boundary)."""
    lo = np.floor(uv.min(0)) - pad; hi = np.ceil(uv.max(0)) + pad
    W, H = int((hi[0] - lo[0]) * ss), int((hi[1] - lo[1]) * ss)
    P = ((uv - lo) * ss).astype(np.int32)
    mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, list(P[faces]), 255)
    # outer silhouette only: fill the holes of the face mesh (eye openings) before measuring the boundary
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    mask = np.zeros_like(mask); cv2.drawContours(mask, cnts, -1, 255, -1)
    # distance of every pixel inside the mask to the background
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 3) / ss
    xi = np.clip(((uv[:, 0] - lo[0]) * ss).astype(int), 0, W - 1)
    yi = np.clip(((uv[:, 1] - lo[1]) * ss).astype(int), 0, H - 1)
    on = np.where(dist[yi, xi] < 0.75)[0]
    return on, (mask, lo, ss)
