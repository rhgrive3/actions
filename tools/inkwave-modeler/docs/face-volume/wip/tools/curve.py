# curve.py OUT DIR [DIR..] : how smooth is the jaw -> neck outline (front left/right, sideR), at render resolution
#   rays from a centre inside the head; per ray the sub-pixel exit point of the figure (clay mask) = outline.
#   wiggle = outline minus the same outline smoothed along its length (sigma SIG sheet px); prints rms/max in sheet px
#   and the turning per 2 px (deg) so a kink shows as a spike. Draws reference (cyan) and model (red) outlines.
import sys, numpy as np, cv2
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter1d, map_coordinates, gaussian_filter
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
k = 1.6; SIG = 4.0; YMIN, YMAX = 405, 458   # below the hair ribbons, above the collar
sheet = np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
# name: view, centre (sheet px), angle range (deg, image coords: 0 = +x, 90 = down), crop box for the picture
PARTS = {
    'frontL': ('front', (238, 400), (112, 200), (165, 395, 245, 470)),
    'frontR': ('front', (242, 400), (-20, 68), (235, 395, 315, 470)),
    'sideR':  ('sideR', (1995, 410), (-8, 75), (1975, 385, 2105, 470)),
}


def ref_mask():
    a = sheet
    return (((a[..., 0] - a[..., 2]) > 38) & (a[..., 0] > 120) & (a[..., 0] > a[..., 1] + 25)).astype(float)


def model_mask(d, v):
    m = np.asarray(Image.open(f'{d}/{v}_clay.png').convert('RGB')).astype(float).max(2) > 14
    s = m.shape[1] / round(370 * k); ox, oy = P.VB[v]
    return m.astype(float), s, (ox - 185 * (k - 1), oy - 145 * (k - 1))


def outline(mask, to_img, centre, angs, rmax, step):
    """to_img(x, y sheet) -> (col, row) in mask; returns sheet-px points of the first exit along each ray"""
    f = gaussian_filter(mask, 0.7)
    pts = []
    rs = np.arange(0, rmax, step)
    for a in np.radians(angs):
        xs = centre[0] + rs * np.cos(a); ys = centre[1] + rs * np.sin(a)
        c, r = to_img(xs, ys)
        val = map_coordinates(f, [r, c], order=1, mode='constant')
        out = np.nonzero(val < 0.5)[0]
        if not len(out) or out[0] == 0: pts.append((np.nan, np.nan)); continue
        i = out[0]; t = (val[i - 1] - 0.5) / max(val[i - 1] - val[i], 1e-6)
        rr = rs[i - 1] + t * step
        pts.append((centre[0] + rr * np.cos(a), centre[1] + rr * np.sin(a)))
    return np.array(pts)


def metrics(p):
    p = p[~np.isnan(p[:, 0]) & (p[:, 1] <= YMAX) & (p[:, 1] >= YMIN)]
    seg = np.hypot(*np.diff(p, axis=0).T); s = np.r_[0, np.cumsum(seg)]
    # resample every 0.25 sheet px along the length
    u = np.arange(0, s[-1], 0.25); q = np.c_[np.interp(u, s, p[:, 0]), np.interp(u, s, p[:, 1])]
    sm = np.c_[gaussian_filter1d(q[:, 0], SIG / 0.25, mode='nearest'), gaussian_filter1d(q[:, 1], SIG / 0.25, mode='nearest')]
    keep = slice(int(2 * SIG / 0.25), len(q) - int(2 * SIG / 0.25))
    dev = np.hypot(*(q - sm).T)[keep]
    # turning over 2 px chords (lightly smoothed at 0.5 px so pixel steps do not count)
    g = np.c_[gaussian_filter1d(q[:, 0], 2, mode='nearest'), gaussian_filter1d(q[:, 1], 2, mode='nearest')]
    h = np.arctan2(*np.diff(g[::8], axis=0).T[::-1]); turn = np.degrees(np.abs(np.diff(np.unwrap(h))))
    return q, sm, dev, turn


if __name__ == '__main__':
    out, dirs = sys.argv[1], sys.argv[2:]
    R = ref_mask(); rows = []
    for name, (v, cen, (a0, a1), box) in PARTS.items():
        angs = np.linspace(a0, a1, 600)
        cols = [('reference', outline(R, lambda x, y: (x, y), cen, angs, 110, 0.25))]
        for d in dirs:
            m, s, (X0, Y0) = model_mask(d, v)
            cols.append((d.rstrip('/').split('/')[-1], outline(m, lambda x, y: ((x - X0) * s, (y - Y0) * s), cen, angs, 110, 0.25)))
        x0, y0, x1, y1 = box; Z = 8; tiles = []
        for i, (lab, p) in enumerate(cols):
            q, sm, dev, turn = metrics(p)
            print('%-7s %-10s wiggle rms %.2f max %.2f px | turn/2px max %5.1f deg, p95 %4.1f' % (name, lab, np.sqrt((dev ** 2).mean()), dev.max(), turn.max(), np.percentile(turn, 95)))
            if i == 0: img = Image.fromarray(sheet[y0:y1, x0:x1].astype(np.uint8)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.BICUBIC)
            else:
                d = dirs[i - 1]; im = Image.open(f'{d}/{v}_beauty.png').convert('RGB'); _, s, (X0, Y0) = model_mask(d, v)
                img = im.crop((round((x0 - X0) * s), round((y0 - Y0) * s), round((x1 - X0) * s), round((y1 - Y0) * s))).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.BICUBIC)
            dr = ImageDraw.Draw(img)
            dr.line([((a - x0) * Z, (b - y0) * Z) for a, b in q], fill=(0, 230, 255) if i == 0 else (255, 30, 30), width=3)
            dr.text((8, 8), lab, fill=(255, 255, 0)); tiles.append(img)
        row = Image.new('RGB', (sum(t.size[0] for t in tiles) + 6 * (len(tiles) - 1), tiles[0].size[1]), (255, 255, 255)); x = 0
        for t in tiles: row.paste(t, (x, 0)); x += t.size[0] + 6
        rows.append(row)
    for i, r in enumerate(rows): r.save(out.replace('.jpg', f'_{list(PARTS)[i]}.jpg'), quality=88)
