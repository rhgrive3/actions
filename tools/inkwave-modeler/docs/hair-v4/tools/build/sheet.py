# 参照 | 候補 | 50% 重ね。シート 5 方向 + 全身の正面・後ろ・横（同じ正投影カメラ）
import sys
from PIL import Image, ImageDraw
rd,out=sys.argv[1],sys.argv[2]; only=sys.argv[3].split(',') if len(sys.argv)>3 else None
sheet=Image.open('/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')
BOX={'front':(48,100,428,470),'q34L':(400,100,780,470),'sideL':(850,100,1230,470),'q34R':(1350,100,1730,470),'sideR':(1790,100,2170,470)}
HI={'hi_front':'ref_front_hi','hi_back':'ref_back_hi','hi_left':'ref_side_hi'}
def flat(p):
    r=Image.open(p).convert('RGBA'); bg=Image.new('RGBA',r.size,(150,153,160,255)); return Image.alpha_composite(bg,r).convert('RGB')
rows=[]
for v,(x0,y0,x1,y1) in BOX.items():
    if only and v not in only: continue
    ref=sheet.crop((x0,y0,x1,y1)).resize((760,740),Image.LANCZOS); rows.append((v,ref,flat(f'{rd}/{v}.png')))
for v,f in HI.items():
    if only and v not in only: continue
    ref=Image.open(f'/mnt/workspace/hex-ida/ink/tools/inkwave-modeler/analysis/{f}.png').convert('RGB').resize((561,701)).crop((75,0,485,400)).resize((779,760))
    cand=flat(f'{rd}/{v}.png').crop((75,0,485,400)).resize((779,760)); rows.append((v,ref,cand))
sc=0.42; W=int(780*sc); H=int(760*sc)
img=Image.new('RGB',(W*3,H*len(rows)),(110,110,110)); d=ImageDraw.Draw(img)
for i,(lab,ref,cand) in enumerate(rows):
    ov=Image.blend(ref,cand.resize(ref.size),0.5)
    for j,t in enumerate([ref,cand.resize(ref.size),ov]): img.paste(t.resize((W,H)),(j*W,i*H))
    d.text((4,i*H+2),lab,fill=(255,255,0))
img.save(out,quality=88); print(out,img.size)
