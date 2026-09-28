import numpy as np, sys
from PIL import Image
from lm import run
from integ import oval_mask, integrate
k = 2  # downsample from 4x render grid to 2x ref px
def ld(p):
    N = np.load(p).astype(np.float32)
    N = N[::k, ::k]; N /= np.linalg.norm(N, axis=2, keepdims=True) + 1e-8; return N
Rn = ld('sn_ref_f_up.npy'); Mn = ld('sn_m0_f.npy')
T = np.asarray(Image.open('m0_normals.png').convert('RGB'), np.float32)[::k, ::k] / 255 * 2 - 1; T /= np.linalg.norm(T, axis=2, keepdims=True) + 1e-8
LR = run('ref_front_hi.png', (460,70,680,363), 3)[0]; LM = run('m0_beauty.png')[0]
# landmarks to grid (ref px -> grid: (x-460)*2)
LRg = LR.copy(); LRg[:, :2] = (LR[:, :2] - [460, 70]) * 2
LMg = LM.copy(); LMg[:, :2] = LM[:, :2] / 2
yb = max(LRg[[105, 334], 1].max(), LMg[[105, 334], 1].max()) + 6   # below brows
mR = oval_mask(LRg, Rn.shape[:2], yb); mM = oval_mask(LMg, Mn.shape[:2], yb)
m = mR & mM
print('mask px', mR.sum(), mM.sum(), m.sum())
px_mm = 1000 / 842 / 2
DR = integrate(Rn, m) * px_mm; DM = integrate(Mn, m) * px_mm; DT = integrate(T, m) * px_mm
# remove best-fit plane difference relative to model-true for R and M (bias)
ii, jj = np.nonzero(m)
def plane_align(D, ref):
    A = np.c_[ii, jj, np.ones(len(ii))]; c, *_ = np.linalg.lstsq(A, ref[m] - D[m], rcond=None)
    out = D.copy(); out[m] += A @ c; return out
DRa = plane_align(DR, DT); DMa = plane_align(DM, DT)
print('model sapiens vs true: rms mm', np.sqrt(np.nanmean((DMa[m] - DT[m])**2)))
print('ref vs model(sapiens) rms mm', np.sqrt(np.nanmean((DRa[m] - DMa[m])**2)))
np.savez('depth_front.npz', DR=DRa, DM=DMa, DT=DT, m=m, LR=LRg, LM=LMg)
# diff image: ref - model (sapiens both): + means ref more forward
d = DRa - DMa
img = np.zeros(m.shape + (3,), np.uint8)
v = np.clip(d / 6, -1, 1)
img[..., 0] = (np.clip(v, 0, 1) * 255).astype(np.uint8); img[..., 2] = (np.clip(-v, 0, 1) * 255).astype(np.uint8)
img[~m] = 60
base = np.asarray(Image.open('ref_front_hi.png').convert('RGB').crop((460,70,680,363)).resize(m.shape[::-1]))
Image.fromarray(np.concatenate([base, img], 1)).resize((m.shape[1]*4, m.shape[0]*2)).save('depthdiff_front.png')
