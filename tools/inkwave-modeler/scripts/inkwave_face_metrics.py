"""Reference-vs-Blender face metrics for the renders of scripts/inkwave_face_views.py.

python scripts/inkwave_face_metrics.py --renders <dir> --out <dir> --align <align.json> [--sheet <jpg>]

Needs numpy, pillow, opencv and mediapipe (analysis/README.md Setup); run it from tools/inkwave-modeler.
Everything is measured in reference-sheet pixels (the front sheet is calibrated at 842 px/m, so 1 px = 1.19 mm):

* front: the orthographic render is already in the calibrated reference frame (box 465,95-665,295 at 3.5x).
* q34 / side: model render pixels are mapped into the sheet with one similarity per view, fitted once on MediaPipe
  landmarks of the *baseline* renders and frozen in --align (created on first use). Later geometry edits therefore
  move the model against a fixed frame instead of re-fitting the frame to the edit.

Contours: rays from a per-view centre, per region. Reference edge = first sustained skin -> non-skin crossing of
`skinness` (skin against the grey background or the teal/lime hair), or the hand-traced polyline in MANUAL where the
jaw overlaps the neck (skin on skin). Model edge = last covered pixel of the bare head (index pass classes face, eyes,
brows, decals) along the same ray. Signed radial error model - reference (+ = model outside), per region. Regions
where hair hides the reference edge (front `cheek_img_right`, side `bridge`, side `nose` above the tip) are reported
but not meaningful. Landmarks: MediaPipe 478-point mesh on the reference crop (3x upsampled) and on the
ACES-tone-mapped beauty render; unreliable on the side sheet (the far half of the face is hallucinated).
"""
import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault('OPENCV_IO_ENABLE_OPENEXR', '1')
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from inkwave_view_compare import aces_filmic, srgb_encode  # noqa: E402

REFS = ROOT / 'docs/face-refinement/refs'
MODEL = ROOT / 'analysis/face_landmarker.task'
PX_PER_M = 842.0
KEY = [33, 133, 362, 263, 1, 61, 291, 152, 168, 70, 300, 4, 13, 14, 159, 145, 386, 374]
VIEWS = {
    # sheet, landmark crop, review crop (x0,y0,x1,y1), ray centre and angles (deg, image coords: 0 = +x, 90 = down).
    # `regions`: angle ranges where the reference face edge is measured. `auto` regions use the skin/non-skin edge
    # (skinness, below) of the sheet; `manual` regions use the hand-traced polyline in MANUAL (skin-on-skin edges,
    # i.e. the jaw over the neck, which no colour rule separates).
    'front': dict(sheet='ref_front.jpg', crop=(440, 80, 700, 300), view=(465, 95, 665, 295), centre=(567.0, 200.0),
                  window=(20, 80), regions={'cheek_img_right': ('auto', -5, 16), 'jaw_img_right': ('auto', 25, 76),
                                            'chin': ('manual', 80, 121), 'jaw_img_left': ('auto', 140, 171)}),
    'q34': dict(sheet='ref_three_quarter.jpg', crop=(430, 60, 720, 320), view=(440, 60, 700, 320),
                centre=(566.0, 185.0), window=(20, 90),
                regions={'far_jaw': ('auto', 50, 76), 'chin': ('auto', 80, 91), 'near_jaw': ('manual', 95, 131)}),
    'side': dict(sheet='ref_side.jpg', crop=(470, 40, 770, 440), view=(490, 60, 750, 320), centre=(612.0, 205.0),
                 model_crop=(100, 50, 600, 550), window=(15, 75),
                 regions={'bridge': ('auto', -24, -11), 'nose': ('auto', -11, 13), 'lips': ('auto', 13, 41),
                          'chin': ('auto', 41, 61), 'under_chin': ('auto', 61, 101)}),
}
# Hand-traced reference edges (sheet px, read on 10-12x zooms with a 5 px grid; about +-1.5 px): the lit jaw/chin
# against the shadowed neck.
MANUAL = {
    'front': [(580.5, 252.0), (575.0, 255.8), (570.0, 256.7), (565.0, 257.0), (560.0, 256.2), (550.0, 252.5),
              (540.0, 248.3), (530.0, 243.3), (526.0, 240.5)],
    'q34': [(576.0, 242.4), (570.0, 240.5), (560.0, 236.0), (550.0, 231.0), (540.0, 226.0), (530.0, 221.0),
            (520.0, 216.0)],
}
RAY_STEP = {'front': 2.5, 'q34': 2.5, 'side': 2.0}
FACE_CLASSES = (1, 4, 5, 6)


def detector():
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision
    opts = vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=str(MODEL)), num_faces=1,
                                        min_face_detection_confidence=0.2, min_face_presence_confidence=0.2)
    det = vision.FaceLandmarker.create_from_options(opts)

    def run(rgb, up=1):
        # The face detector is scale sensitive: try the requested scale first, then a few smaller ones.
        for scale in (up, up * 0.5, up * 0.75, up * 0.35):
            img = Image.fromarray(rgb)
            if scale != 1:
                img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
            res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.asarray(img))))
            if res.face_landmarks:
                sx, sy = img.width / rgb.shape[1], img.height / rgb.shape[0]
                return np.array([[p.x * img.width / sx, p.y * img.height / sy] for p in res.face_landmarks[0]])
        return None
    return mp, run


def load_ref(view):
    return np.asarray(Image.open(REFS / VIEWS[view]['sheet']).convert('RGB'))


def load_linear(path):
    """RGBA float array of a render EXR, from its .npy sidecar (scripts/inkwave_face_views.py writes both)."""
    return np.load(path.with_suffix('.npy')).astype(np.float64)


def tone(path):
    return (srgb_encode(aces_filmic(load_linear(path)[..., :3])) * 255 + 0.5).astype(np.uint8)


def similarity(a, b):
    """Least-squares similarity mapping points a -> b, as a 2x3 matrix."""
    ma, mb = a.mean(0), b.mean(0)
    a0, b0 = a - ma, b - mb
    u, s, vt = np.linalg.svd(a0.T @ b0)
    d = np.sign(np.linalg.det(u @ vt))
    dm = np.diag([1, d])
    r = u @ dm @ vt
    k = (s * np.diag(dm)).sum() / (a0 ** 2).sum()
    m = np.zeros((2, 3))
    m[:, :2] = (k * r).T
    m[:, 2] = mb - (k * r).T @ ma
    return m


def apply(m, pts):
    return pts @ m[:, :2].T + m[:, 2]


def front_matrix():
    x0, y0 = VIEWS['front']['view'][:2]
    return np.array([[1 / 3.5, 0, x0], [0, 1 / 3.5, y0]])


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) +
            img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def skinness(rgb):
    """1 on skin (red clearly above green and blue), 0 on the grey background and the teal/lime hair."""
    f = rgb.astype(np.float64)
    return np.clip((f[..., 0] - np.maximum(f[..., 1], f[..., 2]) - 10.0) / 40.0, 0.0, 1.0)


def ray_angles(view):
    cfg = VIEWS[view]
    out = []
    for name, (_, a0, a1) in cfg['regions'].items():
        out += [(float(a), name) for a in np.arange(a0, a1, RAY_STEP[view])]
    return out


def polyline_hit(centre, angle, poly):
    """Radius where the ray from `centre` at `angle` crosses the polyline (None if it misses)."""
    cx, cy = centre
    d = np.array([np.cos(np.radians(angle)), np.sin(np.radians(angle))])
    best = None
    for (x0, y0), (x1, y1) in zip(poly[:-1], poly[1:]):
        e = np.array([x1 - x0, y1 - y0])
        m = np.array([[d[0], -e[0]], [d[1], -e[1]]])
        if abs(np.linalg.det(m)) < 1e-9:
            continue
        t, u = np.linalg.solve(m, [x0 - cx, y0 - cy])
        if t > 0 and -1e-6 <= u <= 1 + 1e-6:
            best = t if best is None else min(best, t)
    return None if best is None else float(best)


def ref_contour(view, ref, step=0.25, run_px=3.0):
    """Reference face edge per ray: first sustained skin -> non-skin crossing (auto) or the traced polyline."""
    cfg = VIEWS[view]
    skin = cv2.GaussianBlur(skinness(ref), (0, 0), 0.6)
    cx, cy = cfg['centre']
    r = np.arange(cfg['window'][0], cfg['window'][1], step)
    need = int(run_px / step)
    out = {}
    for ang, region in ray_angles(view):
        kind = cfg['regions'][region][0]
        if kind == 'manual':
            out[ang] = polyline_hit(cfg['centre'], ang, MANUAL[view])
            continue
        t = np.radians(ang)
        prof = bilinear(skin, cx + r * np.cos(t), cy + r * np.sin(t))
        hit = None
        for i in range(1, len(r) - need):
            if prof[i] < 0.5 <= prof[i - 1] and (prof[i:i + need] < 0.5).all():
                hit = float(r[i - 1] + step * (prof[i - 1] - 0.5) / (prof[i - 1] - prof[i]))
                break
        out[ang] = hit
    return out


def decode_index(png):
    """Class index from the index pass (raw PNG values, see scripts/inkwave_face_views.py)."""
    if png.max() > 7:
        raise ValueError('index pass is not raw: re-render it with the current scripts/inkwave_face_views.py')
    return png


def model_contour(view, face_mask, m_inv):
    """Last covered pixel along each ray (sheet coordinates), sampling the model mask through the inverse map."""
    cfg = VIEWS[view]
    cx, cy = cfg['centre']
    r = np.arange(cfg['window'][0] - 10, cfg['window'][1] + 20, 0.25)
    out = {}
    for ang, _ in ray_angles(view):
        t = np.radians(ang)
        pts = np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], 1)
        mp_ = apply(m_inv, pts)
        vals = bilinear(face_mask.astype(np.float64), mp_[:, 0], mp_[:, 1]) > 0.5
        if not vals[0]:
            out[float(ang)] = None
            continue
        idx = np.where(~vals)[0]
        out[float(ang)] = float(r[idx[0]]) if len(idx) else None
    return out


def invert(m):
    a = np.vstack([m, [0, 0, 1]])
    return np.linalg.inv(a)[:2]


GROUPS = {
    'eye_R': [33, 133, 159, 145], 'eye_L': [362, 263, 386, 374], 'iris_R': [468], 'iris_L': [473],
    'brow_R': [70, 63, 105, 66, 107], 'brow_L': [300, 293, 334, 296, 336],
    'nose_tip': [1], 'nose_base': [2], 'alar_R': [98], 'alar_L': [327],
    'mouth_R': [61], 'mouth_L': [291], 'upper_lip': [0], 'lower_lip': [17], 'lip_mid': [13, 14],
    'chin': [152], 'jaw_R': [172, 136, 150], 'jaw_L': [397, 365, 379], 'cheek_R': [234, 93], 'cheek_L': [454, 323],
}


def analyse(renders, out, align_path, sheet_path=None):
    out.mkdir(parents=True, exist_ok=True)
    _, run = detector()
    align = json.loads(align_path.read_text()) if align_path.exists() else {}
    report = {'renders': str(renders), 'align': str(align_path), 'views': {}}
    tiles = []
    for view, cfg in VIEWS.items():
        ref = load_ref(view)
        beauty = tone(renders / f'{view}_beauty.exr') if (renders / f'{view}_beauty.npy').exists() else None
        if beauty is not None:
            Image.fromarray(beauty).save(out / f'{view}_beauty.png')
        index = decode_index(np.asarray(Image.open(renders / f'{view}_index.png').convert('L')))
        face_mask = np.isin(index, FACE_CLASSES)
        x0, y0, x1, y1 = cfg['crop']
        ref_lm = run(ref[y0:y1, x0:x1], 3)
        ref_lm = ref_lm + [x0, y0] if ref_lm is not None else None
        model_lm = None
        if beauty is not None:
            mx0, my0, mx1, my1 = cfg.get('model_crop', (0, 0, beauty.shape[1], beauty.shape[0]))
            model_lm = run(np.ascontiguousarray(beauty[my0:my1, mx0:mx1]))
            model_lm = model_lm + [mx0, my0] if model_lm is not None else None
        if view == 'front':
            m = front_matrix()
        elif view in align:
            m = np.array(align[view])
        else:
            if model_lm is None or ref_lm is None:
                raise RuntimeError(f'{view}: landmarks missing, cannot fit the frozen alignment')
            m = similarity(model_lm[KEY], ref_lm[KEY])
            align[view] = m.tolist()
        m_inv = invert(m)
        rep = {}
        if ref_lm is not None and model_lm is not None:
            iod = float(np.linalg.norm(ref_lm[33] - ref_lm[263]))
            mapped = apply(m, model_lm)
            feats = {}
            for name, idx in GROUPS.items():
                d = mapped[idx].mean(0) - ref_lm[idx].mean(0)
                feats[name] = {'dx_px': round(float(d[0]), 2), 'dy_px': round(float(d[1]), 2),
                               'dist_px': round(float(np.hypot(*d)), 2),
                               'dist_mm_nominal': round(float(np.hypot(*d)) / PX_PER_M * 1000, 2)}
            rms = float(np.sqrt(((mapped[KEY] - ref_lm[KEY]) ** 2).sum(1).mean()))
            rep['landmarks'] = {'iod_px': round(iod, 2), 'key_rms_px': round(rms, 2),
                                'key_rms_pct_iod': round(rms / iod * 100, 2), 'features': feats}
        rc = ref_contour(view, ref)
        mc = model_contour(view, face_mask, m_inv)
        regions = {}
        for name, (_, a0, a1) in cfg['regions'].items():
            diffs = [mc[a] - rc[a] for a in rc if a0 <= a < a1 and rc[a] is not None and mc.get(a) is not None]
            if diffs:
                regions[name] = {'mean_px': round(float(np.mean(diffs)), 2), 'mean_abs_px': round(float(np.mean(np.abs(diffs))), 2),
                                 'n': len(diffs)}
        allv = [mc[a] - rc[a] for a in rc if rc[a] is not None and mc.get(a) is not None]
        rep['contour'] = {'regions': regions, 'mean_abs_px': round(float(np.mean(np.abs(allv))), 2) if allv else None,
                          'rms_px': round(float(np.sqrt(np.mean(np.square(allv)))), 2) if allv else None,
                          'rays': {str(a): [rc[a], mc.get(a)] for a in rc}}
        report['views'][view] = rep
        if sheet_path:
            tiles.append(tile(view, ref, beauty, renders, m, rc, mc, ref_lm, model_lm))
    if not align_path.exists():
        align_path.write_text(json.dumps(align, indent=1))
    (out / 'metrics.json').write_text(json.dumps(report, indent=1))
    if sheet_path:
        sheet = np.concatenate(tiles, 0)
        Image.fromarray(sheet).save(sheet_path, quality=92)
    return report


def warp(img, m, box, size):
    """Model render -> reference view crop (box, output size)."""
    x0, y0, x1, y1 = box
    k = size / (x1 - x0)
    full = np.vstack([m, [0, 0, 1]])
    to_crop = np.array([[k, 0, -x0 * k], [0, k, -y0 * k], [0, 0, 1]])
    return cv2.warpAffine(img, (to_crop @ full)[:2], (size, size), flags=cv2.INTER_AREA, borderValue=(180, 182, 189))


def shade(normal_rgba):
    n = normal_rgba[..., :3] * 2 - 1
    n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-8
    light = np.array([-0.45, 0.55, 0.7])
    light /= np.linalg.norm(light)
    s = np.clip((n * light).sum(2), 0, 1)
    img = (40 + 200 * s).astype(np.uint8)
    img[normal_rgba[..., 3] < 0.5] = 60
    return np.stack([img] * 3, 2)


def tile(view, ref, beauty, renders, m, rc, mc, ref_lm, model_lm, size=460):
    cfg = VIEWS[view]
    box = cfg['view']
    k = size / (box[2] - box[0])
    rimg = Image.fromarray(ref).crop(box).resize((size, size), Image.LANCZOS)
    cells = [rimg]
    if beauty is not None:
        cells.append(Image.fromarray(warp(beauty, m, box, size)))
    normal = load_linear(renders / f'{view}_normal.exr')
    cells.append(Image.fromarray(warp(shade(normal), m, box, size)))
    clay = np.asarray(Image.open(renders / f'{view}_clay.png').convert('RGB'))
    cells.append(Image.fromarray(warp(clay, m, box, size)))
    # contour overlay on the reference and on the model clay
    cx, cy = cfg['centre']
    for ci in (0, len(cells) - 2):
        d = ImageDraw.Draw(cells[ci])
        for a, rr in rc.items():
            t = np.radians(a)
            for val, col in ((rr, (255, 40, 40)), (mc.get(a), (40, 140, 255))):
                if val is None:
                    continue
                x, y = (cx + val * np.cos(t) - box[0]) * k, (cy + val * np.sin(t) - box[1]) * k
                d.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=col)
    row = np.concatenate([np.asarray(c.convert('RGB')) for c in cells], 1)
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--renders', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--align', type=Path, required=True)
    parser.add_argument('--sheet', type=Path)
    opts = parser.parse_args()
    report = analyse(opts.renders, opts.out, opts.align, opts.sheet)
    summary = {v: {'contour_mean_abs_px': r['contour']['mean_abs_px'],
                   'regions': {k: x['mean_px'] for k, x in r['contour']['regions'].items()},
                   'lm_rms_pct_iod': r.get('landmarks', {}).get('key_rms_pct_iod')} for v, r in report['views'].items()}
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
