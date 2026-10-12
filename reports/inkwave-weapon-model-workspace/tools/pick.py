import sys
from PIL import Image
# usage: pick.py image.png x,y [x,y ...]  -> median colour (hex) in a 5x5 window at reference pixel coords (400 frame)
im=Image.open(sys.argv[1]).convert('RGBA')
for a in sys.argv[2:]:
    x,y=map(int,a.split(','))
    px=[im.getpixel((i,j)) for i in range(x-2,x+3) for j in range(y-2,y+3) if 0<=i<im.width and 0<=j<im.height]
    px=[p for p in px if p[3]>200]
    if not px: print(a,'transparent'); continue
    med=[sorted(c)[len(c)//2] for c in zip(*px)]
    print(a,'#%02x%02x%02x'%tuple(med[:3]))
