#!/usr/bin/env python3
"""Review sheet; it makes no pixel-parity claim for unmatched reference cameras."""
import base64,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);refs=Path(sys.argv[2]);ids=sys.argv[3:];S=210
sheet=Image.new('RGB',(S*6,(S+22)*len(ids)*2),'#f2f4f5');draw=ImageDraw.Draw(sheet)
def paste(p,x,y):
 if not p.exists():return
 im=Image.open(p).convert('RGBA');im.thumbnail((S,S));bg=Image.new('RGBA',(S,S),'white');bg.alpha_composite(im,((S-im.width)//2,(S-im.height)//2));sheet.paste(bg.convert('RGB'),(x,y))
for i,wid in enumerate(ids):
 for j,version in enumerate(['before','after']):
  y=(i*2+j)*(S+22);draw.text((5,y+4),wid+' '+version,fill='#101923')
  paste(refs/(wid+'.3d.png'),0,y+22)
  for n,k in enumerate(['side','persp','front','rear','fireSide']):paste(root/version/(wid+'.'+k+'.png'),(n+1)*S,y+22)
sheet.save(root/'comparison.jpg',quality=83)
for n,chunk in enumerate([base64.b64encode((root/'comparison.jpg').read_bytes()).decode()[i:i+5000] for i in range(0,len(base64.b64encode((root/'comparison.jpg').read_bytes())),5000)]):print('QUAD_EXPLOSHER_IMAGE_%04d '%n+chunk)
a=json.loads((root/'before'/'gallery.json').read_text());b=json.loads((root/'after'/'gallery.json').read_text())
for x,y in zip(a['rows'],b['rows']):
 assert x['id']==y['id'];assert x['muzzle']==y['muzzle'];assert not y['nonFinite'];assert y['maxGrip']<.008
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
 tile=400;paired=Image.new('RGB',(tile*3,(tile+30)*4),'#f0f2f4');label=ImageDraw.Draw(paired)
 reference=Image.open(rot/(wid+'.rot.jpg')).convert('RGBA')
 for row,view in enumerate(['refFront','refSide','refRear','refOblique']):
  y=row*(tile+30);label.text((8,y+8),wid+' '+view+' | reference / baseline / current',fill='#182027')
  source=Image.open(refs/(wid+'.3d.png')).convert('RGBA') if view=='refOblique' else reference.crop(crops[wid][view])
  for col,im in enumerate([source,Image.open(root/'before'/(wid+'.'+view+'.png')).convert('RGBA'),Image.open(root/'after'/(wid+'.'+view+'.png')).convert('RGBA')]):
   scale=min((tile-16)/im.width,(tile-16)/im.height);im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS);bg=Image.new('RGBA',(tile,tile),'white');bg.alpha_composite(im,((tile-im.width)//2,(tile-im.height)//2));paired.paste(bg.convert('RGB'),(col*tile,y+30))
 paired.save(root/(wid+'.reference-pairs.jpg'),quality=90)
