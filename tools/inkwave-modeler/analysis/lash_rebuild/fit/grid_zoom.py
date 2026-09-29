"""grid_zoom.py view x0 y0 x1 y1 Z out.png [model_dir] : reference crop (camera px box) at Z px per camera px with a 1 px grid (labels every 2)"""
import sys;sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools')
import numpy as np
from PIL import Image,ImageDraw
import eye_seg as E
MB={'front':(85,60),'q34L':(50,60),'sideL':(10,70),'q34R':(110,60),'sideR':(150,70)}
v=sys.argv[1];x0,y0,x1,y1,Z=[float(t) for t in sys.argv[2:7]];Z=int(Z);out=sys.argv[7]
def crop(img):
    a,b=MB[v];return img.crop((int((x0-a)*6),int((y0-b)*6),int((x1-a)*6),int((y1-b)*6))).resize((int((x1-x0)*Z),int((y1-y0)*Z)),Image.LANCZOS)
ims=[crop(Image.fromarray(E.ref_crop(v)))]
if len(sys.argv)>8: ims.append(crop(Image.open(f'{sys.argv[8]}/{v}_beauty.png').convert('RGB')))
W=Image.new('RGB',(sum(i.size[0] for i in ims)+10*(len(ims)-1),ims[0].size[1]),(0,0,0));xx=0
for im in ims:
    dr=ImageDraw.Draw(im)
    for gx in np.arange(np.ceil(x0),x1,1):
        X=(gx-x0)*Z;dr.line([(X,0),(X,im.size[1])],fill=(255,255,255) if gx%2==0 else (120,120,120),width=1)
        if gx%2==0: dr.text((X+2,2),str(int(gx)),fill=(255,255,0))
    for gy in np.arange(np.ceil(y0),y1,1):
        Y=(gy-y0)*Z;dr.line([(0,Y),(im.size[0],Y)],fill=(255,255,255) if gy%2==0 else (120,120,120),width=1)
        if gy%2==0: dr.text((2,Y+2),str(int(gy)),fill=(255,255,0))
    W.paste(im,(xx,0));xx+=im.size[0]+10
W.save(out)
