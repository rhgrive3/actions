import sys, numpy as np, cv2
from PIL import Image
pre = sys.argv[1]
for name, ref, box in [('front','ref_front_hi.png',(440,80,700,300)), ('side','ref_side_hi.png',(500,70,740,290))]:
    r = Image.open(ref).convert('RGB').crop(box); r = r.resize((r.width*4, r.height*4), Image.LANCZOS)
    m = Image.open(f'{pre}_{name}.png').convert('RGB')
    ra = np.asarray(r); ma = np.asarray(m).copy()
    e = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(ra, cv2.COLOR_RGB2GRAY),(5,5),0), 40, 90)
    ov = ma.copy(); ov[e>0] = [255,0,0]
    W = np.concatenate([ra, ma, ov], 1)
    Image.fromarray(W).save(f'{pre}_cmp2_{name}.png')
