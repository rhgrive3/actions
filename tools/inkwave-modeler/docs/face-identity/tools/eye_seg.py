"""Eye aperture segmentation + measurement, reference (colour) vs model (object-colour render).
python3 eye_seg.py ref  <view> <out.png>            -> classify the reference crop, write the label overlay
python3 eye_seg.py model <mask.png> <view>
Common: MB = face box widened by 30 px each side, scale 6 (1 sheet px = 6 px)."""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/multiview')
import contours as C
BOX = {'front': (60, 230), 'q34L': (470, 230), 'sideL': (880, 230), 'q34R': (1370, 230), 'sideR': (1790, 230)}
FACE = {'front': (115, 60, 265, 210), 'q34L': (80, 60, 230, 210), 'sideL': (40, 70, 190, 220), 'q34R': (140, 60, 290, 210), 'sideR': (180, 70, 330, 220)}
PAD = 30; K = 6
def mbox(v):
    a, b, c, d = FACE[v]; return (a - PAD, b, c + PAD, d)
def ref_crop(v):
    sheet = np.asarray(Image.open('/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')); x0, y0 = BOX[v]; a, b, c, d = mbox(v)
    return cv2.resize(sheet[y0 + b:y0 + d, x0 + a:x0 + c], ((c - a) * K, (d - b) * K), interpolation=cv2.INTER_CUBIC)
def classify_ref(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(float); H, S, V = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
    iris = (H > 78) & (H < 108) & (S > 0.40) & (V > 0.30)
    sclera = (S < 0.22) & (V > 0.62)
    dark = V < 0.24
    return iris, sclera, dark
def clean(m, minarea):
    lab, n = ndi.label(m)
    if n == 0: return m
    sz = ndi.sum(m, lab, range(1, n + 1)); keep = np.zeros(n + 1, bool); keep[1:] = sz >= minarea
    return keep[lab]
ROI_FRONT = [(100, 260, 470, 540), (700, 300, 1080, 540)]   # eye zones in the 1260x900 front crop (hair excluded)
def ref_masks(rgb, rois=ROI_FRONT):
    iris, sclera, dark = classify_ref(rgb)
    zone = np.zeros(iris.shape, bool)
    for x0, y0, x1, y1 in rois: zone[y0:y1, x0:x1] = True
    iris = clean(iris & zone, 1500); sclera = clean(sclera & zone, 800)
    ap = np.zeros(iris.shape, bool)
    for x0, y0, x1, y1 in rois:
        z = np.zeros(iris.shape, bool); z[y0:y1, x0:x1] = True
        ir = iris & z
        if ir.sum() < 100: continue
        hull = cv2.fillConvexPoly(np.zeros(iris.shape, np.uint8), cv2.convexHull(np.argwhere(ir)[:, ::-1].astype(np.int32)), 1).astype(bool)
        core = ndi.binary_closing((hull | (sclera & z)), iterations=6)
        ap |= ndi.binary_fill_holes(core)
    return iris, sclera, ap
def eyes_from(ap):
    lab, n = ndi.label(ap)
    sz = ndi.sum(ap, lab, range(1, n + 1)); order = np.argsort(sz)[::-1][:2]
    return [lab == (i + 1) for i in order]
def measure(m, iris_m=None):
    ys, xs = np.nonzero(m); d = {}
    d['area'] = int(m.sum()) / K / K
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    d['bbox_w'] = (x1 - x0 + 1) / K; d['bbox_h'] = (y1 - y0 + 1) / K
    cols = m.sum(0); d['max_col_h'] = cols.max() / K
    xc = int(np.median(xs)); d['x_left'] = x0 / K; d['x_right'] = x1 / K
    yl = ys[xs == x0].mean(); yr = ys[xs == x1].mean()
    d['y_at_left'] = yl / K; d['y_at_right'] = yr / K
    d['top'] = y0 / K; d['bottom'] = y1 / K
    if iris_m is not None and iris_m.sum() > 50:
        iy, ix = np.nonzero(iris_m); d['iris_w'] = (ix.max() - ix.min() + 1) / K; d['iris_h'] = (iy.max() - iy.min() + 1) / K
        d['iris_cx'] = ix.mean() / K; d['iris_cy'] = iy.mean() / K; d['iris_area'] = int(iris_m.sum()) / K / K
    return d
if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'ref':
        v = sys.argv[2]; rgb = ref_crop(v); iris, sclera, ap = ref_masks(rgb)
        ov = rgb.copy(); ov[iris] = (0.5 * ov[iris] + 0.5 * np.array([0, 255, 0])).astype(np.uint8)
        ov[sclera] = (0.5 * ov[sclera] + 0.5 * np.array([255, 0, 0])).astype(np.uint8)
        cnt, _ = cv2.findContours(ap.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(ov, cnt, -1, (255, 255, 0), 2)
        Image.fromarray(ov).save(sys.argv[3]); print(json.dumps([measure(e, iris & ndi.binary_dilation(e, iterations=8)) for e in eyes_from(ap)], indent=1))
