# 前髪の比較: 参照 | 候補 を 4 方向、頭の上半分だけ。python3 bcmp.py <render_dir> <out>
import sys
from PIL import Image, ImageDraw
rd,out=sys.argv[1],sys.argv[2]
sheet=Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')
BOX={'front':(48,100,428,470),'sideL':(850,100,1230,470),'sideR':(1790,100,2170,470),'q34R':(1350,100,1730,470)}
def flat(p):
    r=Image.open(p).convert('RGBA'); bg=Image.new('RGBA',r.size,(150,153,160,255)); return Image.alpha_composite(bg,r).convert('RGB')
W=Image.new('RGB',(560*3,420*4)); d=ImageDraw.Draw(W)
for i,(v,(x0,y0,x1,y1)) in enumerate(BOX.items()):
    ref=sheet.crop((x0,y0,x1,y1)).resize((760,740)).crop((100,60,660,480)); c=flat(f'{rd}/{v}.png').crop((100,60,660,480))
    W.paste(ref,(0,420*i)); W.paste(c,(560,420*i)); W.paste(Image.blend(ref,c,0.5),(1120,420*i)); d.text((4,420*i+4),v,fill=(255,255,0))
W.resize((1260,1260)).save(out); print(out)
