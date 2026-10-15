#!/usr/bin/env python3
"""Same-camera before/after evidence. The reference camera is not calibrated; no IoU/parity score."""
import base64,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);refs=Path(sys.argv[2]);ids=sys.argv[3:];S=230

def sheet(name,columns):
 out=Image.new('RGB',(S*len(columns),(S+25)*len(ids)*2),'#f0f2f4');d=ImageDraw.Draw(out)
 for i,wid in enumerate(ids):
  for j,version in enumerate(['before','after']):
   y=(i*2+j)*(S+25);d.text((6,y+5),wid+' | '+version,fill='#17202b')
   for n,k in enumerate(columns):
    p=refs/(wid+'.3d.png') if k=='reference' else root/version/(wid+'.'+k+'.png')
    if not p.exists():continue
    im=Image.open(p).convert('RGBA');im.thumbnail((S,S));bg=Image.new('RGBA',(S,S),'white');bg.alpha_composite(im,((S-im.width)//2,(S-im.height)//2));out.paste(bg.convert('RGB'),(n*S,y+25));d.text((n*S+5,y+25),k,fill='#526074')
 p=root/(name+'.jpg');out.save(p,quality=83)
 b64=base64.b64encode(p.read_bytes()).decode()
 for n,i in enumerate(range(0,len(b64),6000)):print('BRELLA_IMAGE '+name+' %04d '%n+b64[i:i+6000])
sheet('open-comparison',['reference','openFront','openPersp','openBack','openSide'])
sheet('held-comparison',['idleSide','heldOpen','heldOpenRear','heldOpenSide','launched','folded'])
sheet('material-guard-comparison',['reference','openReferenceInk','openReferenceBackInk','guardLeft','guardRight'])
sheet('reverse-diagnostic',['reverseLeft','reverseRight'])
a=json.loads((root/'before'/'gallery.json').read_text());b=json.loads((root/'after'/'gallery.json').read_text())
assert not a['errors'] and not b['errors']
rows=[]
for x,y in zip(a['rows'],b['rows']):
 assert x['id']==y['id'];assert x['muzzle']==y['muzzle'];assert not y['nonFinite'];assert y['maxGrip']<.008
 for k in ['sawOpen','sawLaunched','sawHidden','sawFolded']:assert x[k] and y[k],(y['id'],k)
 # Moving paper reuses the existing native ink draw; no new draw channel.
 # Batch consolidation is permitted; existing mesh and lifecycle guards remain strict.
 for state in ['closedRender','openRender']:
  assert x[state]['lod']==y[state]['lod']=='game' and x[state]['weaponNear'] and y[state]['weaponNear'],(y['id'],'uncontrolled LOD',state,x[state],y[state])
  assert 0<y[state]['drawCalls']<=x[state]['drawCalls'],(y['id'],state,'draw-call increase/empty render',x[state],y[state])
  assert y[state]['triangles']>0,(y['id'],state,'empty rendered geometry')
 for case in y.get('guardCases',[]):assert case['angleDeg']<6 and case['centreOffset']<.05,(y['id'],'guard alignment',case)
 row={'id':x['id'],'guardCases':y.get('guardCases'),'reverseBefore':x.get('reverseCases'),'reverseAfter':y.get('reverseCases'),'before':{k:x[k]for k in ['tris','geometryKB','buildMs','closedRender','openRender']},'after':{k:y[k]for k in ['tris','geometryKB','buildMs','closedRender','openRender']},'maxGrip':y['maxGrip'],'lifecycle':{k:y[k]for k in ['sawOpen','sawLaunched','sawHidden','sawFolded']}}
 rows.append(row);print('BRELLA_AB '+json.dumps(row))
(root/'comparison.json').write_text(json.dumps(rows,indent=2))
