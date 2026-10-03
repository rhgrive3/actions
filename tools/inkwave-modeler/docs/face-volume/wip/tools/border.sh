#!/bin/bash
# border.sh NAME BLEND : face/torso border in q34R and sideR -> border_NAME.json (sheet px), jaggedness numbers
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; I=/mnt/workspace/.claude-homes/2/.claude/skills/inkwave-face-edit/tools/idmap.py
blender -b $2 --python $I -- q34R 100 160 245 225 3 $K/bq_$1.png > /dev/null 2>&1 &
blender -b $2 --python $I -- sideR 160 165 300 230 3 $K/bs_$1.png > /dev/null 2>&1 &
wait
python3 - $1 <<'PY'
import sys, json, numpy as np
n=sys.argv[1]; K='/tmp/inkjaw-work'; out={}
for v,f,(cx,cy),(ox,oy) in (('q34R','bq',(100,160),(1370,230)),('sideR','bs',(160,165),(1790,230))):
    ids=np.load(f'{K}/{f}_{n}.png.npy'); nm=json.load(open(f'{K}/{f}_{n}.png.json'))
    face=ids==nm['HEAD_face']; torso=ids==nm.get('BODY_torso',-9)
    pts=[]
    for c in range(ids.shape[1]):
        col=np.nonzero(face[:-1,c]&torso[1:,c])[0]          # face above, torso just below
        if len(col): pts.append((cx+c/3+ox, cy+col[0]/3+oy))
    p=np.array(pts)
    if len(p)<10: out[v]=None; continue
    # smooth reference: running median over 9 px; jaggedness = residual
    xs=p[:,0]; ys=p[:,1]; sm=np.array([np.median(ys[max(0,i-13):i+14]) for i in range(len(ys))])
    fit=np.polyval(np.polyfit(xs,ys,3),xs)
    out[v]={'pts':p.tolist(),'x':[float(xs.min()),float(xs.max())],'jag_rms':float(np.sqrt(((ys-sm)**2).mean())),'jag_max':float(np.abs(ys-sm).max()),'fit_max':float(np.abs(ys-fit).max())}
    print(n,v,'cols',len(p),'x %.0f..%.0f'%(xs.min(),xs.max()),'jag rms %.2f max %.2f'%(out[v]['jag_rms'],out[v]['jag_max']),'dev from cubic max %.1f px'%out[v]['fit_max'])
json.dump(out,open(f'{K}/border_{n}.json','w'))
PY
