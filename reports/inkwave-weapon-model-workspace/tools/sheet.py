import sys
from PIL import Image, ImageDraw
# usage: sheet.py refsdir out.jpg tag id1 id2 ...
d,out,tag=sys.argv[1:4]; ids=sys.argv[4:]
W=360; cols=4; rows=(len(ids)+cols-1)//cols
im=Image.new('RGB',(W*cols,(W+20)*rows),(255,255,255)); dr=ImageDraw.Draw(im)
for i,k in enumerate(ids):
  a=Image.open(f'{d}/{k}.{tag}.png').convert('RGBA').resize((W,W))
  x,y=(i%cols)*W,(i//cols)*(W+20)
  im.paste(a,(x,y+20),a); dr.text((x+4,y+4),k,fill=(0,0,0))
im.save(out,quality=88)
