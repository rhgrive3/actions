"""prof_board.py out.png view x0,y0,x1,y1 label=dir ... : crop (6x px of the prof box) of reference | each state's beauty | each
state's clay, no outlines; optional OUTLINE=1 draws the reference outline (green)."""
import sys, os, numpy as np, cv2
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
import prof_cmp as P
from PIL import Image
out,v=sys.argv[1],sys.argv[2]; x0,y0,x1,y1=[int(t) for t in sys.argv[3].split(',')]; st=[a.split('=',1) for a in sys.argv[4:]]
rt=P.ref_tile(v); rc=P.outline(P.ref_mask(rt)); tiles=[]
def put(img,lab):
    img=img.copy()
    if os.environ.get('OUTLINE'): cv2.drawContours(img,rc,-1,(0,255,0),1,cv2.LINE_AA)
    img=img[y0:y1,x0:x1].copy(); cv2.putText(img,lab,(6,20),cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,255,0),2); tiles.append(np.pad(img,((0,0),(0,4),(0,0))))
put(rt,'reference')
for look in os.environ.get('LOOKS','beauty,clay').split(','):
    for lab,d in st: put(np.asarray(Image.open(f'{d}/{v}_{look}.png').convert('RGB')),f'{lab} {look}')
Image.fromarray(np.concatenate(tiles,1)).save(out)
