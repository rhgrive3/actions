# シートの一部を拡大して目盛り（シート画素）を描く。python3 zgrid.py x0 y0 x1 y1 k out
import sys
from PIL import Image, ImageDraw
x0,y0,x1,y1=map(int,sys.argv[1:5]); k=float(sys.argv[5]); out=sys.argv[6]
im=Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')
c=im.crop((x0,y0,x1,y1)).resize((int((x1-x0)*k),int((y1-y0)*k)),Image.LANCZOS); d=ImageDraw.Draw(c)
for x in range((x0//10+1)*10,x1,10):
    X=(x-x0)*k; d.line([(X,0),(X,c.height)],fill=(255,255,255) if x%50 else (255,40,40),width=1)
    if x%50==0: d.text((X+2,2),str(x),fill=(255,0,0))
for y in range((y0//10+1)*10,y1,10):
    Y=(y-y0)*k; d.line([(0,Y),(c.width,Y)],fill=(255,255,255) if y%50 else (255,40,40),width=1)
    if y%50==0: d.text((2,Y+2),str(y),fill=(255,0,0))
c.save(out); print(c.size)
