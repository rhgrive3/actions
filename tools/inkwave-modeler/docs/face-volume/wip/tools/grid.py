# grid.py out view x0 y0 x1 y1 Z dir:look ... ; box in SHEET pixels; grid every 10 sheet px
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929/tools')
import prof_cmp as P
k=float(__import__('os').environ.get('K','1.6'))
sheet=Image.open(P.SHEET).convert('RGB')
out,v=sys.argv[1],sys.argv[2]; x0,y0,x1,y1,Z=map(int,sys.argv[3:8])
ox,oy=P.VB[v]; X0=ox-185*(k-1); Y0=oy-145*(k-1)
W,H=(x1-x0)*Z,(y1-y0)*Z
tiles=[sheet.crop((x0,y0,x1,y1)).resize((W,H),Image.BICUBIC)]
for a in sys.argv[8:]:
    d,look=a.split(':')
    im=Image.open(f'{d}/{v}_{look}.png').convert('RGB'); s=im.size[0]/round(370*k)
    tiles.append(im.crop((round((x0-X0)*s),round((y0-Y0)*s),round((x1-X0)*s),round((y1-Y0)*s))).resize((W,H),Image.BICUBIC))
for t in tiles:
    d=ImageDraw.Draw(t)
    for x in range((x0//10+1)*10,x1,10):
        d.line([((x-x0)*Z,0),((x-x0)*Z,H)],fill=(255,255,255) if x%50 else (255,0,0),width=1)
        if x%20==0: d.text(((x-x0)*Z+2,2),str(x),fill=(255,255,0))
    for y in range((y0//10+1)*10,y1,10):
        d.line([(0,(y-y0)*Z),(W,(y-y0)*Z)],fill=(255,255,255) if y%50 else (255,0,0),width=1)
        if y%20==0: d.text((2,(y-y0)*Z+2),str(y),fill=(255,255,0))
c=Image.new('RGB',(W*len(tiles)+6*(len(tiles)-1),H),(255,255,255))
for i,t in enumerate(tiles): c.paste(t,(i*(W+6),0))
c.save(out,quality=90)
