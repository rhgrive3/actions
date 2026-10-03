# compose.py OUT A B : reference | A | B rows (front, q34, side, eyes, mouth, jaw clay q34, jaw clay side)
import sys, subprocess
from PIL import Image, ImageDraw
K='/tmp/inkjaw-work'; S='/mnt/workspace/.dev-state/agent-work/scratch/jaw'; out,A,B=sys.argv[1:4]
rows=[('front','front 120 300 360 470 3','beauty'),('q34','q34R 1440 300 1660 470 3','beauty'),('side','sideR 1900 300 2120 470 3','beauty'),
      ('eyes','front 160 330 320 375 4','beauty'),('mouth','front 205 395 295 430 7','beauty'),('jaw','q34R 1470 380 1620 460 4','clay'),('jaws','sideR 1930 380 2090 465 4','clay')]
ims=[]
for n,args,look in rows:
    f=f'{K}/c_{n}.jpg'
    subprocess.run(['python3',f'{S}/grid.py',f]+args.split()+[f'{A}:{look}',f'{B}:{look}'],check=True,cwd=K)
    ims.append(Image.open(f))
W=1800; rs=[im.resize((W,int(im.size[1]*W/im.size[0])),Image.LANCZOS) for im in ims]
c=Image.new('RGB',(W,sum(r.size[1] for r in rs)+6*len(rs)+36),(255,255,255)); d=ImageDraw.Draw(c)
for i,t in enumerate(['reference','V91 (main now)','new V92']): d.text((10+i*W//3,6),t,fill=(0,0,0))
d.text((10,20),'last 2 rows: jaw in clay (3/4, side)',fill=(90,90,90))
y=36
for r in rs: c.paste(r,(0,y)); y+=r.size[1]+6
c.save(out,quality=82); print(c.size)
