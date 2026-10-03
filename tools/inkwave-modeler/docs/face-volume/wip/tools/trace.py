# trace.py OUT DIR [DIR..] : outlines vs the reference, drawn on each image
#   front: left/right edge of the figure per row (jaw sides -> neck), rows 395..470
#   sideR: front-most edge per row (chin -> neck front), rows 380..470
# reference = cyan, model = red (model from its clay render: black background)
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools'); import prof_cmp as P
k = 1.6; S = 5
sheet = np.asarray(Image.open(P.SHEET).convert('RGB')).astype(float)
BOX = {'front': (150, 390, 330, 472), 'sideR': (1950, 375, 2110, 472)}


def ref_fig(v):
    x0, y0, x1, y1 = BOX[v]
    if True:
        # skin only (the front mask holds the hair too): warm, not the grey background or the green hair
        a = sheet[y0:y1, x0:x1]
        return ((a[..., 0] - a[..., 2]) > 38) & (a[..., 0] > 120) & (a[..., 0] > a[..., 1] + 25)
    m = np.load(f'/mnt/workspace/.dev-state/agent-work/scratch/jaw/cmp_{v}_refsil.npy') > 0
    ox, oy = P.VB[v]; X0 = int(round(ox - 185 * (k - 1))); Y0 = int(round(oy - 145 * (k - 1)))   # mask frame = render frame at scale 1
    return m[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0]


def model(d, v, look):
    m = Image.open(f'{d}/{v}_{look}.png').convert('RGB'); s = m.size[0] / round(370 * k)
    ox, oy = P.VB[v]; X0 = ox - 185 * (k - 1); Y0 = oy - 145 * (k - 1); x0, y0, x1, y1 = BOX[v]
    return m.crop((int((x0 - X0) * s), int((y0 - Y0) * s), int((x1 - X0) * s), int((y1 - Y0) * s))).resize((x1 - x0, y1 - y0), Image.BOX)


def edges(fig, v):
    out = []
    for r in range(fig.shape[0]):
        row = fig[r]
        if v == 'front':
            c = fig.shape[1] // 2
            if not row[c]:
                out.append((np.nan, np.nan)); continue
            idx = np.nonzero(~row)[0]; l = idx[idx < c]; rr = idx[idx > c]
            out.append((l.max() + 1 if len(l) else 0, rr.min() - 1 if len(rr) else len(row) - 1))
        else:
            idx = np.nonzero(row)[0]
            out.append((np.nan, idx.max() if len(idx) else np.nan))
    return np.array(out, float)


def underside(fig, top=40):
    """sideR: per column, the first background pixel going down from row `top` (below the mouth) = the lower
    outline of the jaw / chin; columns where the figure goes on to the bottom (the neck) are left out"""
    ys = []
    for c in range(fig.shape[1]):
        col = fig[top:, c]
        if not col[0]:
            ys.append(np.nan); continue
        idx = np.nonzero(~col)[0]
        ys.append(top + idx[0] if len(idx) else np.nan)
    return np.array(ys, float)


out_rows = []
for v in ('front', 'sideR'):
    x0, y0, x1, y1 = BOX[v]
    R = edges(ref_fig(v), v)
    RU = underside(ref_fig(v)) if v == 'sideR' else None
    MUs = []
    tiles = [Image.fromarray(sheet[y0:y1, x0:x1].astype(np.uint8))]
    Ms = []
    for d in sys.argv[2:]:
        clay = np.asarray(model(d, v, 'clay')).astype(float)
        Ms.append(edges(clay.max(2) > 14, v))
        if v == 'sideR': MUs.append(underside(clay.max(2) > 14))
        tiles.append(model(d, v, 'beauty'))
    big = []
    for i, t in enumerate(tiles):
        t = t.resize(((x1 - x0) * S, (y1 - y0) * S), Image.LANCZOS); dr = ImageDraw.Draw(t)
        if v == 'front':
            for col in (0, 1):
                pts = [((R[r, col] + 0.5) * S, (r + 0.5) * S) for r in range(len(R)) if not np.isnan(R[r, col])]
                if len(pts) > 1: dr.line(pts, fill=(0, 230, 255), width=3)
                if i > 0:
                    M = Ms[i - 1]
                    pts = [((M[r, col] + 0.5) * S, (r + 0.5) * S) for r in range(len(M)) if not np.isnan(M[r, col])]
                    if len(pts) > 1: dr.line(pts, fill=(255, 40, 40), width=3)
        else:
            for U, colr in ((RU, (0, 230, 255)),) + (((MUs[i - 1], (255, 40, 40)),) if i > 0 else ()):
                seg = []
                for c in range(len(U)):
                    if np.isnan(U[c]):
                        if len(seg) > 1: dr.line(seg, fill=colr, width=3)
                        seg = []
                    else:
                        seg.append(((c + 0.5) * S, (U[c] + 0.5) * S))
                if len(seg) > 1: dr.line(seg, fill=colr, width=3)
        dr.text((8, 8), 'reference' if i == 0 else sys.argv[1 + i].rstrip('/').split('/')[-1], fill=(255, 255, 0))
        big.append(t)
    row = Image.new('RGB', (sum(t.size[0] for t in big) + 6 * (len(big) - 1), big[0].size[1]), (255, 255, 255)); x = 0
    for t in big: row.paste(t, (x, 0)); x += t.size[0] + 6
    out_rows.append(row)
    for j, M in enumerate(Ms):
        for col, nm in ((0, 'left'), (1, 'right')):
            dd = M[:, col] - R[:, col]; ok = ~np.isnan(dd)
            if ok.sum(): print(v, sys.argv[2 + j].split('/')[-1], nm, 'mean %+.1f max |%.1f| px' % (np.nanmean(dd), np.nanmax(np.abs(dd))))
W = max(r.size[0] for r in out_rows); c = Image.new('RGB', (W, sum(r.size[1] for r in out_rows) + 8), (255, 255, 255)); y = 0
for r in out_rows: c.paste(r, (0, y)); y += r.size[1] + 8
c.save(sys.argv[1], quality=86)
