import sys
from PIL import Image
pre=sys.argv[1]
f=Image.open(f'{pre}_front.png').convert('RGB'); r=Image.open('ref_front_hi.png').convert('RGB').crop((495,140,655,210)).resize(f.size, Image.LANCZOS)
q=Image.open(f'{pre}_q34.png').convert('RGB'); sd=Image.open(f'{pre}_side.png').convert('RGB')
qc=Image.open(f'{pre}_q34c.png').convert('RGB'); sc=Image.open(f'{pre}_sidec.png').convert('RGB')
rq=Image.open('ref_34_hi.png').convert('RGB').crop((470,110,660,237)).resize((900,600), Image.LANCZOS)
W=Image.new('RGB',(1920,420+600*2+10),(40,40,40))
W.paste(r.resize((960,420)),(0,0)); W.paste(f.resize((960,420)),(960,0))
for i,im in enumerate([rq,q]): W.paste(im.resize((960,640)).crop((0,0,960,600)),(i*960,430))
for i,im in enumerate([qc,sd]): W.paste(im.resize((960,640)).crop((0,0,960,600)),(i*960,1030))
W.resize((1440,int(W.height*0.75))).save(f'{pre}_sheet.png')
