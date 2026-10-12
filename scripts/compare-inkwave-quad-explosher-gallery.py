#!/usr/bin/env python3
"""Review sheet; it makes no pixel-parity claim for unmatched reference cameras."""
import base64,hashlib,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);refs=Path(sys.argv[2]);ids=sys.argv[3:];S=210
# Fail before emitting any visual evidence if requested models are missing, duplicated or unexpected.
a=json.loads((root/'before'/'gallery.json').read_text());b=json.loads((root/'after'/'gallery.json').read_text())
assert ids and len(set(ids))==len(ids),'empty or duplicate requested model IDs'
expected=set(ids)
beforeById={r['id']:r for r in a['rows']};afterById={r['id']:r for r in b['rows']}
assert len(beforeById)==len(a['rows']) and len(afterById)==len(b['rows']),'duplicate model rows'
for version,rows in [('before',beforeById),('after',afterById)]:
 assert set(rows)==expected,('model ID set mismatch',version,'missing',sorted(expected-set(rows)),'unexpected',sorted(set(rows)-expected))
metadata=b['references']
# Bind each displayed source to its variant and verified Git blob, not only an ambiguous weapon-ID filename.
for wid in ids:
 for key,base in [('official',refs),('turntable',refs.parent/'rotsheets')]:
  source=metadata[wid][key];p=base/Path(source['path']).name;b=p.read_bytes()
  assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==source['gitBlob'],p
sheet=Image.new('RGB',(S*6,(S+22)*len(ids)*2),'#f2f4f5');draw=ImageDraw.Draw(sheet)
def paste(p,x,y):
 if not p.exists():return
 im=Image.open(p).convert('RGBA');im.thumbnail((S,S));bg=Image.new('RGBA',(S,S),'white');bg.alpha_composite(im,((S-im.width)//2,(S-im.height)//2));sheet.paste(bg.convert('RGB'),(x,y))
for i,wid in enumerate(ids):
 for j,version in enumerate(['before','after']):
  y=(i*2+j)*(S+22);draw.text((5,y+4),metadata[wid]['target']+' / '+version+' / left: target render',fill='#101923')
  paste(refs/(wid+'.3d.png'),0,y+22)
  for n,k in enumerate(['side','persp','front','rear','fireSide']):paste(root/version/(wid+'.'+k+'.png'),(n+1)*S,y+22)
sheet.save(root/'comparison.jpg',quality=83)
for n,chunk in enumerate([base64.b64encode((root/'comparison.jpg').read_bytes()).decode()[i:i+5000] for i in range(0,len(base64.b64encode((root/'comparison.jpg').read_bytes())),5000)]):print('QUAD_EXPLOSHER_IMAGE_%04d '%n+chunk)
for wid in ids:
 x,y=beforeById[wid],afterById[wid]
 assert x['muzzle']==y['muzzle'];assert not y['nonFinite'];assert y['maxGrip']<.008
 assert x['drawCalls']==y['drawCalls'],(x['id'],'draw-call regression',x['drawCalls'],y['drawCalls'])
 print('QUAD_EXPLOSHER_AB '+json.dumps({'id':x['id'],'before':{k:x[k] for k in ['tris','geometryKB','buildMs','renderMs','drawCalls','renderTriangles']},'after':{k:y[k] for k in ['tris','geometryKB','buildMs','renderMs','drawCalls','renderTriangles']}}))

# Each source view has its own paired current/baseline camera, recorded in gallery.json.
# Crops are inspection windows on the stored turntable, not silhouette warps or geometry inputs.
rot=refs.parent/'rotsheets'
crops={
 's3-maneuver-stepper':{'refFront':(1090,676,1235,914),'refSide':(1006,44,1279,249),'refRear':(682,48,788,245)},
 's3-slosher-washtub':{'refFront':(1020,676,1260,941),'refSide':(984,48,1278,253),'refRear':(686,48,877,250)}
}
for wid in ids:
 tile=400;header=78;paired=Image.new('RGB',(tile*3,(tile+header)*4),'#f0f2f4');label=ImageDraw.Draw(paired)
 reference=Image.open(rot/(wid+'.rot.jpg')).convert('RGBA')
 for row,view in enumerate(['refFront','refSide','refRear','refOblique']):
  y=row*(tile+header);sourceMeta=metadata[wid]['official' if view=='refOblique' else 'turntable']
  label.text((8,y+6),view+' reference: '+sourceMeta['variant'],fill='#182027')
  label.text((8,y+25),'TARGET shape + colour' if view=='refOblique' or wid!='s3-maneuver-stepper' else 'GEOMETRY ONLY - colours are NOT the target',fill='#a02020' if wid=='s3-maneuver-stepper' and view!='refOblique' else '#182027')
  label.text((8,y+45),'Source blob: '+sourceMeta['gitBlob'][:12],fill='#46515d')
  label.text((tile+8,y+6),'BASELINE: '+metadata[wid]['target'],fill='#182027')
  label.text((tile*2+8,y+6),'CANDIDATE: '+metadata[wid]['target'],fill='#182027')
  label.text((tile+8,y+25),'Same camera as candidate; source pose approximate',fill='#46515d')
  label.text((tile*2+8,y+25),'Approx. camera fit; +/-4 deg sensitivity, not error bound',fill='#46515d')
  label.text((tile+8,y+45),'No 2D angle is treated as a measured 3D angle',fill='#46515d')
  source=Image.open(refs/(wid+'.3d.png')).convert('RGBA') if view=='refOblique' else reference.crop(crops[wid][view])
  for col,im in enumerate([source,Image.open(root/'before'/(wid+'.'+view+'.png')).convert('RGBA'),Image.open(root/'after'/(wid+'.'+view+'.png')).convert('RGBA')]):
   scale=min((tile-16)/im.width,(tile-16)/im.height);im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS);bg=Image.new('RGBA',(tile,tile),'white');bg.alpha_composite(im,((tile-im.width)//2,(tile-im.height)//2));paired.paste(bg.convert('RGB'),(col*tile,y+header))
 paired.save(root/(wid+'.reference-pairs.jpg'),quality=90)

# Camera pose sensitivity is displayed separately, never used to warp a reference silhouette.
wid='s3-slosher-washtub'
if wid in ids and (root/'after'/(wid+'.refSideyawMinus4.png')).exists():
 views=['refSideyawMinus4','refSide','refSideyawPlus4','refSidepitchMinus4','refSidepitchPlus4']
 tile=280;header=40;canvas=Image.new('RGB',(tile*5,(tile+header)*3),'#f0f2f4');d=ImageDraw.Draw(canvas)
 d.text((8,8),'Explosher base kit: manual reference camera fit; actual error is unknown.',fill='#182027')
 d.text((tile+8,40),'Yaw and pitch sensitivity: +/-4 degrees about the nominal camera.',fill='#182027')
 d.text((tile+8,60),'This is a sensitivity range, not a calibrated confidence interval.',fill='#182027')
 d.text((tile+8,80),'Mouth centre fixed to fe242; burner angle alone changes in the candidate.',fill='#182027')
 ref=Image.open(rot/(wid+'.rot.jpg')).crop(crops[wid]['refSide']);ref.thumbnail((tile-16,tile-16));canvas.paste(ref,(8,header))
 for row,version in enumerate(['before','after'],1):
  for col,view in enumerate(views):
   imagePath=root/version/(wid+'.'+view+'.png');assert imagePath.exists(),imagePath
   im=Image.open(imagePath).convert('RGBA');im.thumbnail((tile,tile));bg=Image.new('RGBA',(tile,tile),'white');bg.alpha_composite(im,((tile-im.width)//2,(tile-im.height)//2));y=row*(tile+header)
   d.text((col*tile+8,y+8),version+' / '+view,fill='#182027');canvas.paste(bg.convert('RGB'),(col*tile,y+header))
 canvas.save(root/(wid+'.camera-sensitivity.jpg'),quality=92)
