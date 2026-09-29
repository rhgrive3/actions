"""Eye-opening contours, reference vs model (object-colour mask render), all in sheet pixels of the 5 fixed views.
  python3 eye_contours.py ref   out.json           reference opening polygons (both eyes, every view where visible)
  python3 eye_contours.py model <mask_dir> out.json model opening polygons from <view>_eyemask.png
  python3 eye_contours.py plot  <view> out.jpg label=json[:colour] ...   3-colour contour overlay on the reference
Crops: 6 px per sheet px, box = eye_seg.mbox(view)."""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools')
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/multiview')
import eye_seg as E
import mvcore as M

K = E.K
FIELD = json.load(open('/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/analysis/multiview/field.json'))
CAMS, DIST = FIELD['cams'], FIELD['dist']
VIEWS = ['front', 'q34L', 'sideL', 'q34R', 'sideR']
IRIS_L = np.array([46.37, -15.97, 85.74]) / 1000
EYE_C = {'L': IRIS_L, 'R': IRIS_L * np.array([-1, 1, 1])}
NEAR = {'front': ('L', 'R'), 'q34L': ('L',), 'sideL': ('L',), 'q34R': ('R',), 'sideR': ('R',)}


def eye_centre_px(v, s):
    uv, _ = M.project(CAMS[v], EYE_C[s][None], DIST)
    return uv[0]


def to_sheet(v, px):
    a, b, c, d = E.mbox(v); x0, y0 = E.BOX[v]
    px = np.asarray(px, float)
    return np.c_[x0 + a + px[:, 0] / K, y0 + b + px[:, 1] / K]


def to_crop(v, uv):
    a, b, c, d = E.mbox(v); x0, y0 = E.BOX[v]
    uv = np.asarray(uv, float)
    return np.c_[(uv[:, 0] - x0 - a) * K, (uv[:, 1] - y0 - b) * K]


def window(v, s, hw=40, hh=30):
    u, w = eye_centre_px(v, s)
    a, b, c, d = E.mbox(v); x0, y0 = E.BOX[v]
    x = (u - x0 - a) * K; y = (w - y0 - b) * K
    return int(x - hw * K), int(y - hh * K), int(x + hw * K), int(y + hh * K)


def polygon(mask):
    cnt, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnt:
        return None
    c = max(cnt, key=cv2.contourArea)[:, 0, :].astype(float)
    return c


def biggest(m):
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sz = ndi.sum(m, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sz)))


def hull(m):
    pts = np.argwhere(m)[:, ::-1].astype(np.int32)
    return cv2.fillConvexPoly(np.zeros(m.shape, np.uint8), cv2.convexHull(pts), 1).astype(bool)


def ref_eye(rgb, win):
    x0, y0, x1, y1 = win
    iris, sclera, dark = E.classify_ref(rgb)
    z = np.zeros(iris.shape, bool); z[max(y0, 0):y1, max(x0, 0):x1] = True
    ir = E.clean(iris & z, 600); sc = E.clean(sclera & z, 400)
    if ir.sum() < 300:
        return None, ir, sc
    near = ndi.binary_dilation(ir, iterations=int(7 * K))
    sc = sc & near
    core = ndi.binary_closing(ir | sc, iterations=8)
    core = ndi.binary_fill_holes(core)
    core = ndi.binary_opening(core, iterations=3)
    core = hull(biggest(core))
    return core, ir, sc


def model_eye(mask_rgb, win):
    x0, y0, x1, y1 = win
    r, g, b = mask_rgb[..., 0] > 128, mask_rgb[..., 1] > 128, mask_rgb[..., 2] > 128
    z = np.zeros(r.shape, bool); z[max(y0, 0):y1, max(x0, 0):x1] = True
    m = ((r | g) & ~b) & z
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=3))
    m = biggest(m)
    return hull(m) if m.sum() > 300 else None


def contour_record(v, m):
    poly = polygon(m)
    return {'poly_sheet': to_sheet(v, poly).round(3).tolist(), 'area_px': float(m.sum()) / K / K}


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'ref':
        out = {}
        for v in VIEWS:
            rgb = E.ref_crop(v); out[v] = {}
            for s in ('L', 'R'):
                m, ir, sc = ref_eye(rgb, window(v, s))
                if m is None or m.sum() < 800:
                    continue
                out[v][s] = contour_record(v, m)
        json.dump(out, open(sys.argv[2], 'w'))
        print({v: {s: round(r['area_px'], 1) for s, r in d.items()} for v, d in out.items()})
    elif mode == 'model':
        md = sys.argv[2]; out = {}
        for v in VIEWS:
            rgb = np.asarray(Image.open(f'{md}/{v}_eyemask.png').convert('RGB')); out[v] = {}
            for s in ('L', 'R'):
                m = model_eye(rgb, window(v, s))
                if m is None:
                    continue
                out[v][s] = contour_record(v, m)
        json.dump(out, open(sys.argv[3], 'w'))
        print({v: {s: round(r['area_px'], 1) for s, r in d.items()} for v, d in out.items()})
    elif mode == 'plot':
        v = sys.argv[2]; outp = sys.argv[3]; rgb = E.ref_crop(v).copy()
        cols = [(255, 255, 0), (255, 0, 0), (0, 255, 255), (0, 255, 0)]
        for i, spec in enumerate(sys.argv[4:]):
            lab, path = spec.split('=', 1); d = json.load(open(path))
            for s, rec in d.get(v, {}).items():
                pts = to_crop(v, np.array(rec['poly_sheet'])).astype(np.int32)
                cv2.polylines(rgb, [pts.reshape(-1, 1, 2)], True, cols[i % 4], 2)
            cv2.putText(rgb, lab, (10, 30 + 26 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.9, cols[i % 4], 2)
        # crop to the eyes
        xs = [window(v, s) for s in NEAR[v] if True]
        x0 = max(min(w[0] for w in xs), 0); y0 = max(min(w[1] for w in xs), 0)
        x1 = min(max(w[2] for w in xs), rgb.shape[1]); y1 = min(max(w[3] for w in xs), rgb.shape[0])
        Image.fromarray(rgb[y0:y1, x0:x1]).save(outp)
