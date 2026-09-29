"""trio.py out.png dirA dirB ... : rows = (view,eye); columns = reference | dirA beauty | dirB beauty ... (eye windows)"""
import sys; sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools')
import numpy as np
from PIL import Image
import eye_seg as E, eye_contours as EC
cases=[('front','R'),('front','L'),('q34L','L'),('q34R','R'),('sideR','R')]
import os
if os.environ.get('CASES'): cases=[tuple(c.split(':')) for c in os.environ['CASES'].split(',')]
rows=[]
for v,s in cases:
    x0,y0,x1,y1=[max(int(t),0) for t in EC.window(v,s)]
    cols=[E.ref_crop(v)[y0:y1,x0:x1]]
    for d in sys.argv[2:]:
        cols.append(np.asarray(Image.open(f'{d}/{v}_beauty.png').convert('RGB'))[y0:y1,x0:x1])
    rows.append(np.concatenate(cols,1))
Image.fromarray(np.concatenate(rows,0)).save(sys.argv[1])
