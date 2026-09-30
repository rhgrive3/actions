"""prof_cmp.py out.png view label=dir [label=dir ...] : reference | per state (beauty, clay) at 6x with the reference skin
outline (green) and the model outline (red) drawn on every tile. Boxes must match prof_render.sh."""
import sys, numpy as np, cv2
from PIL import Image
SHEET=str(__import__('pathlib').Path(__file__).resolve().parents[3]/'docs/face-multiview-fit/refs/sheet_5view.png')
VB={'front':(60,230),'q34L':(470,230),'sideL':(880,230),'q34R':(1370,230),'sideR':(1790,230)}
BX={'sideL':(0,100,160,270),'sideR':(210,100,370,270),'q34L':(20,100,180,270),'q34R':(170,100,330,270),'front':(95,100,255,270)}
K=6
def ref_tile(v):
    ox,oy=VB[v];a,b,c,d=BX[v];s=np.asarray(Image.open(SHEET).convert('RGB'))
    return cv2.resize(s[oy+b:oy+d,ox+a:ox+c],None,fx=K,fy=K,interpolation=cv2.INTER_CUBIC)
def ref_mask(t):
    hsv=cv2.cvtColor(t,cv2.COLOR_RGB2HSV).astype(int);h,s,vv=hsv[...,0],hsv[...,1],hsv[...,2]
    m=((h<=24)&(s>=75)&(vv>=80)).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8));return cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
def model_mask(d,v):
    m=np.asarray(Image.open(f'{d}/{v}_mask.png').convert('L'));return (m>200).astype(np.uint8)*255
def outline(m):
    c,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);return [x for x in c if len(x)>200]
if __name__=='__main__':
    out,v=sys.argv[1],sys.argv[2];st=[a.split('=',1) for a in sys.argv[3:]]
    rt=ref_tile(v);rc=outline(ref_mask(rt));tiles=[]
    def put(img,mc,lab):
        img=img.copy()
        cv2.drawContours(img,rc,-1,(0,255,0),1,cv2.LINE_AA)
        if mc is not None: cv2.drawContours(img,mc,-1,(255,0,0),1,cv2.LINE_AA)
        cv2.putText(img,lab,(8,24),cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,0),2);tiles.append(img)
    first=True
    for lab,d in st:
        mc=outline(model_mask(d,v))
        if first: put(rt,mc,'ref + '+lab+' (red)');first=False
        for look in ('beauty','clay'):
            try: im=np.asarray(Image.open(f'{d}/{v}_{look}.png').convert('RGB'))
            except Exception: continue
            put(im,mc,f'{lab} {look}')
    Image.fromarray(np.concatenate(tiles,1)).save(out)
