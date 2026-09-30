"""zoom_cmp.py out.png view cx0,cy0,cx1,cy1 Z label=dir/sub ... : reference | models, big zoom of a camera-pixel box, 5 px grid (GRID=0 off)."""
import sys, os, numpy as np, cv2
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
import prof_cmp as P
from PIL import Image
out,v=sys.argv[1],sys.argv[2]; cx0,cy0,cx1,cy1=[float(t) for t in sys.argv[3].split(',')]; Z=int(sys.argv[4]); st=[a.split('=',1) for a in sys.argv[5:]]
a,b,c,d=P.BX[v]; K=P.K; G=os.environ.get('GRID','1')=='1'
def crop(img,lab):
    t=img[int((cy0-b)*K):int((cy1-b)*K),int((cx0-a)*K):int((cx1-a)*K)]
    t=cv2.resize(t,(int((cx1-cx0)*Z),int((cy1-cy0)*Z)),interpolation=cv2.INTER_CUBIC).copy()
    if G:
        for x in range(int(np.ceil(cx0)),int(cx1)+1):
            if x%5==0:
                cv2.line(t,(int((x-cx0)*Z),0),(int((x-cx0)*Z),t.shape[0]),(255,255,255),1); cv2.putText(t,str(x),(int((x-cx0)*Z)+2,26),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,0),1)
        for y in range(int(np.ceil(cy0)),int(cy1)+1):
            if y%5==0:
                cv2.line(t,(0,int((y-cy0)*Z)),(t.shape[1],int((y-cy0)*Z)),(255,255,255),1); cv2.putText(t,str(y),(2,int((y-cy0)*Z)-2),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,0),1)
    cv2.putText(t,lab,(60,14),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,255,255),1)
    return np.pad(t,((0,0),(0,6),(0,0)))
tiles=[crop(P.ref_tile(v),'reference')]+[crop(np.asarray(Image.open(f'{d}/{v}_beauty.png').convert('RGB')),l) for l,d in st]
Image.fromarray(np.concatenate(tiles,1)).save(out)
