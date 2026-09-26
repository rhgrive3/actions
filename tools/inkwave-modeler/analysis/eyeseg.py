import numpy as np, cv2, sys
from PIL import Image
from scipy import ndimage as ndi
def seg(img, box, up=8):
    """eye-opening mask (sclera+iris+pupil) inside box of an RGB image (ref px), returned at up x."""
    im = Image.open(img).convert('RGB') if isinstance(img, str) else img
    c = np.asarray(im.crop(box).resize(((box[2]-box[0])*up, (box[3]-box[1])*up), Image.BICUBIC), np.float32)
    R, G, B = c[...,0], c[...,1], c[...,2]
    mx, mn = c.max(2), c.min(2); sat = (mx-mn)/(mx+1e-3)
    white = (mx > 150) & (sat < 0.28)
    teal = (B > R + 12) & (G > R + 12)
    m = white | teal
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    if n == 0: return m
    sizes = ndi.sum(m, lab, range(1, n+1)); keep = 1 + np.argmax(sizes)
    m = lab == keep
    m = ndi.binary_closing(m, iterations=up*2)
    m = ndi.binary_fill_holes(m)
    return m
def outline(m, box, up=8):
    ys, xs = np.nonzero(m)
    cols = np.unique(xs)
    top = []; bot = []
    for x in cols[::2]:
        yy = ys[xs == x]; top.append((box[0] + x/up, box[1] + yy.min()/up)); bot.append((box[0] + x/up, box[1] + yy.max()/up))
    return np.array(top), np.array(bot)
if __name__ == '__main__':
    for name, box in (('R', (500,150,565,195)), ('L', (583,158,650,203))):
        m = seg('ref_front_hi.png', box)
        t, b = outline(m, box)
        print(name, 'x-range', t[0,0].round(1), t[-1,0].round(1))
        for q in np.linspace(0, len(t)-1, 9).astype(int): print('   x %.1f top %.1f bot %.1f' % (t[q,0], t[q,1], b[q,1]))
        Image.fromarray((m*255).astype(np.uint8)).save(f'eyemask_ref_{name}.png')

def clean_top(t, win=5.0):
    y = t[:,1].copy(); x = t[:,0]
    out = y.copy()
    for i in range(len(x)):
        sel = np.abs(x - x[i]) <= win
        out[i] = min(y[i], np.percentile(y[sel], 20))
    # smooth
    k = np.ones(5)/5; out2 = np.convolve(np.pad(out,2,mode='edge'), k, 'valid')
    return np.c_[x, out2]
