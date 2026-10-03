import numpy as np, cv2, sys
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
sys.path.insert(0,S); from cam import CAMS
from PIL import Image
c=CAMS['front']; img=np.asarray(Image.open(S+'an/zf_clean.png').convert('RGB')).copy()
def to_zf(uv): sx=48+uv[:,0]/2; sy=100+uv[:,1]/2; return np.stack([(sx-150)*3.4,(sy-140)*3.4],1)
auto=np.load(S+'sam/auto_front.npz')['masks']
ref=np.zeros(img.shape[:2],np.uint8)
for m in (np.load(S+'sam/pB.npz')['A'],np.load(S+'sam/pB2.npz')['B_s1'],auto[22],auto[13]): ref|=m.astype(np.uint8)
mask=np.zeros(img.shape[:2],np.uint8); d=np.load(S+'v7/mesh_V7_bangs.npz'); P=to_zf(c.proj(d['V'])).astype(np.int32)
for t in d['T']: cv2.fillConvexPoly(mask,P[t],1)
cs,_=cv2.findContours(ref,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); cv2.drawContours(img,cs,-1,(0,255,0),3)
cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); cv2.drawContours(img,cs,-1,(255,0,255),3)
print('IoU',round((ref&mask).sum()/(ref|mask).sum(),3)); Image.fromarray(img).save(S+'v7/proj_now.png')
