#!/bin/bash
# usage: earsheet.sh prefix
node render.mjs work.html $1 jobs_ear.json 2>&1 | head -3
python3 - $1 <<'PY'
import sys
from PIL import Image
pre=sys.argv[1]
refs=[('ref_front_hi.png',(395,120,535,260)),('ref_34_hi.png',(395,95,535,235)),('ref_34_hi.png',(395,95,535,235)),('ref_side_hi.png',(470,110,610,250))]
W=Image.new('RGB',(4*400,800))
for i,(n,(f,b)) in enumerate(zip(['ear_front','ear_q34','ear_q34c','ear_side'],refs)):
    W.paste(Image.open(f).convert('RGB').crop(b).resize((400,400)),(i*400,0))
    W.paste(Image.open(f'{pre}_{n}.png').convert('RGB').resize((400,400)),(i*400,400))
W.save(f'{pre}_sheet.png')
PY
