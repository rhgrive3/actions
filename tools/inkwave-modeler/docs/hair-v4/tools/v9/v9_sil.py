# 参照の髪マスク（緑）と候補の髪だけのシルエット（紫）を重ねる
import numpy as np, cv2, sys
from PIL import Image
S='/mnt/workspace/.dev-state/agent-work/scratch/claude-0/-mnt-workspace-hex-ida/470df221-29c3-4560-9f2b-7776a4460e3e/scratchpad/'
rd=sys.argv[1]; out=sys.argv[2]
sheet=np.asarray(Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB'))
hair=np.load(S+'an/sheet_hair.npy')
BOX={'front':(48,100,428,470),'sideR':(1790,100,2170,470),'sideL':(850,100,1230,470),'q34R':(1350,100,1730,470)}
tiles=[]
for v,(x0,y0,x1,y1) in BOX.items():
    img=cv2.resize(sheet[y0:y1,x0:x1],(760,740)).copy(); hm=cv2.resize(hair[y0:y1,x0:x1].astype(np.uint8),(760,740),interpolation=cv2.INTER_NEAREST)
    a=(np.asarray(Image.open(f'{rd}/{v}.png'))[...,3]>100).astype(np.uint8)
    for m,col in ((hm,(0,255,0)),(a,(255,0,255))):
        cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); cv2.drawContours(img,cs,-1,col,2)
    tiles.append(img[40:520,80:720])
Image.fromarray(np.concatenate([np.concatenate(tiles[:2],1),np.concatenate(tiles[2:],1)],0)).resize((960,720)).save(out)
