"""Review sheet: for front / 3-4 / side, reference vs model warped into the reference frame by
landmark Procrustes, plus clay shading (Sapiens normals for the reference, true normals for the model)."""
import numpy as np, sys, json, cv2
from PIL import Image, ImageDraw
from lm import run
KEY = [33,133,362,263,1,61,291,152,168,70,300,4,13,14,159,145,386,374]
VIEWS = {
  'front': dict(ref='ref_front_hi.png', box=(465,95,665,295), sn=('sn_ref_f.npy',(460,70,680,363))),
  'q34':   dict(ref='ref_34_hi.png',   box=(440,60,700,320), sn=('sn_ref_34.npy',(420,40,720,440))),
  'side':  dict(ref='ref_side_hi.png', box=(490,60,750,320), sn=('sn_ref_side.npy',(470,40,770,440))),
}
OUT = 520
def sim(A, B):
    ma, mb = A.mean(0), B.mean(0); A0, B0 = A-ma, B-mb
    U,S,Vt = np.linalg.svd(A0.T@B0); d = np.sign(np.linalg.det(U@Vt)); D = np.diag([1,d]); R = U@D@Vt
    s = (S*np.diag(D)).sum()/(A0**2).sum()
    M = np.zeros((2,3)); M[:,:2] = (s*R).T; M[:,2] = mb - (s*R).T@ma
    P = A0@(s*R)+mb; return M, np.sqrt(((P-B)**2).sum(1).mean())
def shade(n, L=(-0.45,0.55,0.7)):
    L = np.array(L)/np.linalg.norm(L); s = np.clip((n*L).sum(2),0,1)
    return (40+200*s).astype(np.uint8)
def ref_clay(v):
    f, sbox = VIEWS[v]['sn']; n = np.load(f).astype(np.float32); img = shade(n)
    box = VIEWS[v]['box']; sx = n.shape[1]/(sbox[2]-sbox[0]); sy = n.shape[0]/(sbox[3]-sbox[1])
    c = img[int((box[1]-sbox[1])*sy):int((box[3]-sbox[1])*sy), int((box[0]-sbox[0])*sx):int((box[2]-sbox[0])*sx)]
    return Image.fromarray(c).convert('RGB').resize((OUT,OUT), Image.LANCZOS)
def sheet(pre, out):
    rows = []; info = {}
    for v, c in VIEWS.items():
        box = c['box']; k = OUT/(box[2]-box[0])
        ref = Image.open(c['ref']).convert('RGB').crop(box).resize((OUT,OUT), Image.LANCZOS)
        RL = run(c['ref'], box, 3)[0][:, :2]; RL = (RL - box[:2]) * k
        mb = Image.open(f'{pre}_{v}_b.png').convert('RGB')
        r = run(f'{pre}_{v}_b.png')
        cells = [ref]
        if r is None:
            cells += [mb.resize((OUT,OUT))]*3; info[v] = None
        else:
            M, err = sim(r[0][KEY,:2], RL[KEY]); info[v] = round(float(err/np.linalg.norm(RL[33]-RL[263])*100),2)
            wb = cv2.warpAffine(np.asarray(mb), M, (OUT,OUT), flags=cv2.INTER_AREA, borderValue=(180,182,189))
            nimg = np.asarray(Image.open(f'{pre}_{v}_n.png').convert('RGB'), np.float32)/255*2-1
            bg = np.abs(nimg).sum(2) < 1e-3
            nimg /= np.linalg.norm(nimg,axis=2,keepdims=True)+1e-8
            cl = shade(nimg); cl[bg] = 60
            wc = cv2.warpAffine(np.stack([cl]*3,2), M, (OUT,OUT), flags=cv2.INTER_AREA, borderValue=(60,60,60))
            cells += [Image.fromarray(wb), ref_clay(v), Image.fromarray(wc)]
            # landmark overlay on blend
        rows.append(cells)
    W = Image.new('RGB', (OUT*4, OUT*3))
    for i, rr in enumerate(rows):
        for j, im in enumerate(rr): W.paste(im, (j*OUT, i*OUT))
    W.save(out); print('landmark residual % IOD:', json.dumps(info))
if __name__ == '__main__': sheet(sys.argv[1], sys.argv[2])
