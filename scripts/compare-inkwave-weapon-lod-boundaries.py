#!/usr/bin/env python3
import json,sys,pathlib
from PIL import Image,ImageDraw
root=pathlib.Path(sys.argv[1]); before=json.loads((root/'before/measurements.json').read_text()); after=json.loads((root/'after/measurements.json').read_text());rows={r['id']:r for r in before['rows']}
assert len(rows)==len(after['rows'])==65
summary={'beforeRevision':before['revision'],'afterRevision':after['revision'],'models':65,'viewsPerModel':8,'beforeCachedBytes':0,'afterCachedBytes':0,'triangles':0,'alphaMatches':0,'rows':[]}
for b in after['rows']:
 a=rows[b['id']];assert a['alpha']==b['alpha'],b['id']+' alpha/silhouette';summary['alphaMatches']+=len(b['alpha'])
 for part in ['body','ink']:
  for key in ['triangles','positionHash','otherAttributeHash']:assert a[part][key]==b[part][key],(b['id'],part,key)
  assert a['source'+part.title()]==b['source'+part.title()],b['id']+' source changed'
  assert b[part]['mixedMat']<=b['source'+part.title()]['mixedMat']
  assert b[part]['mixedColor']<=b['source'+part.title()]['mixedColor']
  summary['beforeCachedBytes']+=a[part]['bytes'];summary['afterCachedBytes']+=b[part]['bytes'];summary['triangles']+=b[part]['triangles']
 summary['rows'].append({'id':b['id'],'beforeBytes':a['body']['bytes']+a['ink']['bytes'],'afterBytes':b['body']['bytes']+b['ink']['bytes'],'beforeColdMs':a['coldBuildMs'],'afterColdMs':b['coldBuildMs']})
# Ten contact sheets include every model, team and view; per-model sheets retain the full 320px render.
for batch in range(5):
 ids=list(rows)[batch*13:(batch+1)*13];sheet=Image.new('RGB',(1024,len(ids)*284+32),'#e3e6eb');draw=ImageDraw.Draw(sheet);draw.text((8,8),'OLD / ATTRIBUTE-PRESERVING FAR LOD | front / side / rear / oblique | orange then blue',fill='black')
 for j,id in enumerate(ids):
  draw.text((8,32+j*284),id,fill='black')
  detail=Image.new('RGB',(1280,4*342),'#e3e6eb');dd=ImageDraw.Draw(detail)
  for team in range(2):
   for v,view in enumerate(['front','side','rear','oblique']):
    for k,version in enumerate(['before','after']):
     im=Image.open(root/version/(id+f'.{team}-{view}.png')).convert('RGBA');bg=Image.new('RGBA',im.size,'#e3e6eb');bg.alpha_composite(im);rgb=bg.convert('RGB')
     detail.paste(rgb,((team*2+k)*320,v*342+22));dd.text(((team*2+k)*320+4,v*342+4),f'{version} team {team} {view}',fill='black')
     rgb.thumbnail((128,128));sheet.paste(rgb,((v*2+k)*128,52+j*284+team*128))
  detail.save(root/(id+'.jpg'),quality=91)
 sheet.save(root/f'catalog-{batch+1}.jpg',quality=91)
crowd={}
for name in ['before-A','after-B','after-B2','before-A2']:
 p=root/'crowd'/name/'measurements.json'
 if p.exists():crowd[name]=json.loads(p.read_text())
if len(crowd)==4:
 for tier in ['game','far']:
  base=crowd['before-A']['crowd'][tier]
  for name,c in crowd.items():
   r=c['crowd'][tier];assert r['actors']==8 and len(set(r['ids']))==4
   assert r['triangles']==base['triangles'] and r['drawCalls']==base['drawCalls'],(tier,name,'geometry/draw regression')
   if tier=='game':assert r['visibleGeometryBytes']==base['visibleGeometryBytes'],(name,'near bytes')
 summary['crowd']=crowd
(root/'comparison.json').write_text(json.dumps(summary,indent=2));print('WEAPON_LOD_COMPARISON',json.dumps({k:v for k,v in summary.items() if k not in ['rows','crowd']}))
