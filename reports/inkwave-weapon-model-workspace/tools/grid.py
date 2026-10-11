import sys
from PIL import Image, ImageDraw
# usage: grid.py in.png out.png [scale] — overlays a labelled pixel grid (every 20 px, labels every 40) on a reference
src,out=sys.argv[1],sys.argv[2]; k=int(sys.argv[3]) if len(sys.argv)>3 else 2
im=Image.open(src).convert('RGBA'); W,H=im.size
bg=Image.new('RGBA',(W,H),(255,255,255,255)); bg.alpha_composite(im); im=bg.resize((W*k,H*k))
d=ImageDraw.Draw(im)
for v in range(0,max(W,H)+1,20):
    c=(255,0,0,255) if v%40==0 else (255,170,170,255)
    if v<=W: d.line([(v*k,0),(v*k,H*k)],fill=c,width=1)
    if v<=H: d.line([(0,v*k),(W*k,v*k)],fill=c,width=1)
    if v%40==0:
        d.text((v*k+2,2),str(v),fill=(0,0,200)); d.text((2,v*k+2),str(v),fill=(0,0,200))
im.convert('RGB').save(out)
