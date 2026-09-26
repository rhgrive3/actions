import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as sla
from PIL import Image, ImageDraw
OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
def oval_mask(L, shape, ymin=None, scale=1.0, off=(0,0)):
    pts = [((L[i,0]-off[0])*scale, (L[i,1]-off[1])*scale) for i in OVAL]
    im = Image.new('L', (shape[1], shape[0]), 0); ImageDraw.Draw(im).polygon(pts, fill=255)
    m = np.asarray(im) > 0
    if ymin is not None: m[:int(ymin)] = False
    return m
def integrate(N, mask, lam=1e-4):
    """N: HxWx3 normals (x right, y up, z to camera). Returns depth (pixel units, toward camera +) in mask."""
    H, W = mask.shape
    nz = np.clip(N[..., 2], 0.15, None)
    gx = -N[..., 0] / nz            # dz/dcol
    gr = N[..., 1] / nz             # dz/drow  (row down = -y)
    idx = -np.ones((H, W), int); idx[mask] = np.arange(mask.sum())
    rows, cols, vals, b = [], [], [], []
    r = 0
    ii, jj = np.nonzero(mask)
    for (di, dj, g) in ((0, 1, gx), (1, 0, gr)):
        i2, j2 = ii + di, jj + dj
        ok = (i2 < H) & (j2 < W)
        ok[ok] &= mask[i2[ok], j2[ok]]
        a = idx[ii[ok], jj[ok]]; c = idx[i2[ok], j2[ok]]
        gg = 0.5 * (g[ii[ok], jj[ok]] + g[i2[ok], j2[ok]])
        n = len(a); rr = np.arange(r, r + n)
        rows += [rr, rr]; cols += [a, c]; vals += [-np.ones(n), np.ones(n)]; b.append(gg); r += n
    n0 = mask.sum()
    rows.append(np.arange(r, r + n0)); cols.append(np.arange(n0)); vals.append(np.full(n0, lam)); b.append(np.zeros(n0)); r += n0
    A = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(r, n0))
    z = sla.lsqr(A, np.concatenate(b), atol=1e-8, btol=1e-8, iter_lim=4000)[0]
    D = np.full((H, W), np.nan); D[mask] = z
    return D
