# シート全体（2172x724）で: 背景 / 髪（青緑・ライム）/ 帯の黒 のマスク
import numpy as np, cv2
from PIL import Image
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
im=np.asarray(Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB'))
a=im.astype(float)
bgc=np.median(np.concatenate([a[:20].reshape(-1,3),a[:,:10].reshape(-1,3),a[:,-10:].reshape(-1,3)]),0); print('bg',bgc)
hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV).astype(float); H,Sa,V=hsv[...,0]*2,hsv[...,1]/255,hsv[...,2]/255
# 背景はなだらかなグラデーション: 行ごとの中央値との差で判定
d=np.abs(a-bgc).max(2)
bg=(d<16)&(Sa<0.14)
bg=cv2.morphologyEx(bg.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8)).astype(bool)
hair=(Sa>0.28)&(H>55)&(H<215)&(V>0.28)
hair=cv2.morphologyEx(hair.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
# 水玉（明るい丸）を埋める: 髪で囲まれた穴で背景でない所
from scipy.ndimage import binary_fill_holes
filled=binary_fill_holes(cv2.morphologyEx(hair,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)))
hair=(hair.astype(bool)|(filled&~bg))
np.save(S+'an/sheet_bg.npy',bg); np.save(S+'an/sheet_hair.npy',hair)
ov=im.copy(); ov[bg]=(ov[bg]*0.3+np.array([0,0,0])*0.7).astype(np.uint8); ov[hair]=(ov[hair]*0.4+np.array([255,0,255])*0.6).astype(np.uint8)
Image.fromarray(ov).resize((1086,362)).save(S+'an/sheetmask.png')
