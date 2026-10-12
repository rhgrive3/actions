#!/usr/bin/env python3
"""Same immutable model/cameras under changed lighting. References are uncalibrated."""
import json,sys,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root,refs=map(Path,sys.argv[1:3])
manifest=json.loads((root/'diagnostic-manifest.json').read_text())
groups={
 'saber':['s3-saber-normal','s3-saber-lite','s3-saber-heavy'],
 'stringer':['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion'],
 'brella':['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'],
}
cols=[('Reference','reference'),('Old studio32 (invalid IBL)','studio32'),('Valid studio1024','studio1024'),('Production day / orange','productionDay-orange'),('Production day / purple','productionDay-purple')]
S=250
def paste(sheet,p,x,y):
 if not p.exists():raise FileNotFoundError(p)
 im=Image.open(p).convert('RGBA');im.thumbnail((S,S));bg=Image.new('RGBA',(S,S),'white');bg.alpha_composite(im,((S-im.width)//2,(S-im.height)//2));sheet.paste(bg.convert('RGB'),(x,y))
for family,ids in groups.items():
 source='brella' if family=='brella' else 'six'
 views=['openPersp','heldOpenSide'] if family=='brella' else ['persp','fireSide']
 sheet=Image.new('RGB',(S*len(cols),70+(S+32)*len(ids)*len(views)),'#edf0f3');d=ImageDraw.Draw(sheet)
 d.text((10,8),'PR1271 exact 7630 | '+family+' | unchanged geometry and native materials',fill='#152536')
 d.text((10,26),'Production: native day IBL + sun/hemi + Neutral tone mapping. Pre-compositor; no world shadows.',fill='#415367')
 for col,(label,_) in enumerate(cols):d.text((col*S+8,49),label,fill='#152536')
 for row,(wid,view) in enumerate((w,v) for w in ids for v in views):
  y=70+row*(S+32)
  for col,(_,mode) in enumerate(cols):
   file=refs/(wid+'.3d.png') if mode=='reference' else root/mode/source/(wid+'.'+view+'.png')
   paste(sheet,file,col*S,y+25)
   d.text((col*S+5,y+6),(wid if col==0 else view),fill='#152536')
 sheet.save(root/(family+'-production-materials.jpg'),quality=87)

# Geometry/camera evidence is numerical, not a brightness score. The studio
# resolution-only comparison must retain every actual camera matrix and outline.
out=[]
for family in ['six','brella']:
 a=json.loads((root/'studio32'/family/'gallery.json').read_text());b=json.loads((root/'studio1024'/family/'gallery.json').read_text())
 assert a['revision']==b['revision']
 assert a['lighting']['cameras']==b['lighting']['cameras'],'Resolution-only cameras changed'
 for mode in ['productionDay-orange','productionDay-purple']:
  other=json.loads((root/mode/family/'gallery.json').read_text())
  assert other['revision']==a['revision']
  assert other['lighting']['cameras']==a['lighting']['cameras'],('Production camera mismatch',family,mode)
 assert not a['lighting']['validCubeUV'] and b['lighting']['validCubeUV']
 for x,y in zip(a['rows'],b['rows']):
  assert x['id']==y['id'] and x['tris']==y['tris'] and x['muzzle']==y['muzzle'] and x['size']==y['size']
  wid=x['id'];views=['side','above','front','persp']
  for view in views:
   pa=root/'studio32'/family/(wid+'.'+view+'.png');pb=root/'studio1024'/family/(wid+'.'+view+'.png')
   ia=Image.open(pa).convert('RGBA');ib=Image.open(pb).convert('RGBA')
   assert ia.size==ib.size
   alphaA=ia.getchannel('A').tobytes();alphaB=ib.getchannel('A').tobytes()
   assert alphaA==alphaB,(wid,view,'Lighting changed silhouette')
   out.append({'id':wid,'view':view,'alphaSha256':hashlib.sha256(alphaA).hexdigest(),'rgbaEqual':ia.tobytes()==ib.tobytes()})
(root/'studio-resolution-outline-check.json').write_text(json.dumps(out,indent=2))
print('NINE_MATERIAL_COVERAGE',len(out),'static alpha outlines identical; all nine Actors in four conditions.')
