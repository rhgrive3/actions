import numpy as np, sys
from PIL import Image
def load(p): return np.load(p).astype(np.float32)
def vis(n): return Image.fromarray(((n+1)/2*255).clip(0,255).astype(np.uint8))
def shade(n, L=(-0.45,0.55,0.7)):
    L=np.array(L)/np.linalg.norm(L); s=np.clip((n*L).sum(2),0,1)
    return Image.fromarray((40+200*s).astype(np.uint8)).convert('RGB')
refn, modn, pre = sys.argv[1], sys.argv[2], sys.argv[3]
R = load(refn); Mn = load(modn)
if R.shape != Mn.shape: R = np.asarray(Image.fromarray(((R+1)*127.5).astype(np.uint8)).resize((Mn.shape[1],Mn.shape[0])),np.float32)/127.5-1
d = np.degrees(np.arccos(np.clip((R*Mn).sum(2),-1,1)))
dimg = Image.fromarray((np.clip(d/40,0,1)*255).astype(np.uint8)).convert('RGB')
ims = [vis(R), vis(Mn), shade(R), shade(Mn), dimg]
W = Image.new('RGB', (Mn.shape[1]*5, Mn.shape[0]))
for i, im in enumerate(ims): W.paste(im, (i*Mn.shape[1], 0))
W = W.resize((W.width//2, W.height//2)); W.save(pre+'.png')
