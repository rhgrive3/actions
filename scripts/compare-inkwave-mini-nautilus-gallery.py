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
for n,chunk in enumerate([base64.b64encode((root/'comparison.jpg').read_bytes()).decode()[i:i+5000] for i in range(0,len(base64.b64encode((root/'comparison.jpg').read_bytes())),5000)]):print('CIRCLED_IMAGE_%04d '%n+chunk)
a=json.loads((root/'before'/'gallery.json').read_text());b=json.loads((root/'after'/'gallery.json').read_text())
for x,y in zip(a['rows'],b['rows']):
 assert x['id']==y['id'];assert x['muzzle']==y['muzzle'];assert not y['nonFinite'];assert y['maxGrip']<.008
 assert x['drawCalls']==y['drawCalls'],(x['id'],'draw-call regression',x['drawCalls'],y['drawCalls'])
 print('CIRCLED_AB '+json.dumps({'id':x['id'],'before':{k:x[k] for k in ['tris','geometryKB','buildMs','renderMs','drawCalls','renderTriangles']},'after':{k:y[k] for k in ['tris','geometryKB','buildMs','renderMs','drawCalls','renderTriangles']}}))

# Pair each distinct source turntable direction with a nearest fixed heading. The source sheets use
# alternate finishes (Nautilus 79 / Zink Mini), so they guide shape, never the base-kit material palette.
# Before and after share a crop from the union of their alpha bounds; this never fits each version alone.
pairs={
 's3-spinner-serein':[(0,60,'black disc, muzzle right, neck at right rim'),(1,0,'front; exact source yaw unresolved'),(2,270,'silver hub, muzzle left, neck left/below hub'),(3,240,'silver hub rear oblique, neck projects left'),(4,150,'black disc rear oblique, rim and coupling left'),(5,90,'black disc side, muzzle right, neck right')],
 's3-spinner-quick':[(0,60,'tank side/front, muzzle right'),(1,0,'six-port front, tank on left'),(2,300,'opposite-side/front, muzzle left'),(3,240,'opposite-side/rear, rear lever on right'),(4,180,'rear motor cap and tank feed'),(5,120,'tank-side/rear, muzzle beyond the tank')],
}
for wid in ids:
 src=refs.parent/'rotsheets'/(wid+'.rot.jpg')
 if not src.exists() or wid not in pairs:continue
 source=Image.open(src);tw,th=source.width//4,source.height//3;S,H=320,390
 paired=Image.new('RGB',(S*3,H*6),'#ededed');pd=ImageDraw.Draw(paired)
 for row,(cell,angle,landmarks) in enumerate(pairs[wid]):
  y=row*H;ref=source.crop((cell%4*tw,cell//4*th,cell%4*tw+tw,cell//4*th+th));ref.thumbnail((S,S));paired.paste(ref,((S-ref.width)//2,y+30+(S-ref.height)//2));pd.text((5,y+5),f'Alt-kit shape reference cell {cell+1}',fill='black')
  ims=[Image.open(root/v/f'{wid}.turntable-{angle:03d}.png').convert('RGBA') for v in ['before','after']]
  boxes=[im.getchannel('A').getbbox() for im in ims];crop=(min(b[0] for b in boxes)-12,min(b[1] for b in boxes)-12,max(b[2] for b in boxes)+12,max(b[3] for b in boxes)+12)
  for col,(v,im) in enumerate(zip(['before','after'],ims),1):
   im=im.crop(crop);im.thumbnail((S,S));bg=Image.new('RGBA',(S,S),'#ededed');bg.alpha_composite(im,((S-im.width)//2,(S-im.height)//2));paired.paste(bg.convert('RGB'),(col*S,y+30));pd.text((col*S+5,y+5),f'{v}: {angle} deg / pitch 10.2 deg',fill='black')
  pd.text((5,y+352),landmarks,fill='black');pd.text((5,y+368),'Nearest orientation only. Shared before/after crop. Retail camera and exact yaw are unknown.',fill='#555555')
 paired.save(root/(wid+'.reference-pairs.jpg'),quality=89)
 (root/(wid+'.reference-pairs.json')).write_text(json.dumps({'source':str(src),'sourceUse':'alternate-kit shape only; base-kit still controls material','retailCamera':'unknown','candidateCamera':next(row for row in b['rows'] if row['id']==wid).get('turntableCamera'),'pairs':[{'cell':i+1,'heading':a,'landmarks':l} for i,a,l in pairs[wid]]},indent=2))
