import json,sys,pathlib
from PIL import Image,ImageChops
root=pathlib.Path(sys.argv[1]);results={v:json.loads((root/v/'result.json').read_text()) for v in ['A','B','B2','A2']}
rows=[];failures=[]
for left,right in [('A','A2'),('B','B2'),('A','B'),('A2','B2')]:
 for p in sorted((root/left).glob('*.png')):
  a=Image.open(p).convert('RGBA');b=Image.open(root/right/p.name).convert('RGBA');diff=ImageChops.difference(a,b);changed=sum(any(px) for px in diff.getdata());maximum=max(max(px)for px in diff.getdata());row={'left':left,'right':right,'image':p.name,'changedPixels':changed,'maxChannel':maximum};rows.append(row)
  if changed:failures.append(row)
for variant in results:
 for scope in ['full','weapons']:
  for tier in ['game','far']:
   for x,y in [(4,6),(5,7)]:
    a=Image.open(root/variant/f'{scope}-{tier}-frame{x}.png').convert('RGBA');b=Image.open(root/variant/f'{scope}-{tier}-frame{y}.png').convert('RGBA');diff=ImageChops.difference(a,b);changed=sum(any(px) for px in diff.getdata());row={'variant':variant,'repeat':f'{scope}-{tier}-{x}-{y}','changedPixels':changed};rows.append(row)
    if changed:failures.append(row)
for v in ['B','B2','A2']:
 if results[v]['geometryHashes']!=results['A']['geometryHashes']:failures.append({'geometryMismatch':v})
counts={v:{k:{'raw':q['preparation']['zero']+q['preparation']['nonzero'],'zero':q['preparation']['zero'],'nonzero':q['preparation']['nonzero'],'triangles':q['preparation']['triangles'],'memory':q['memory'],'additional':q['additional']}for k,q in r['tiers'].items()}for v,r in results.items()}
for tier in results['A']['tiers']:
 for v in ['B','B2']:
  a=counts['A'][tier];b=counts[v][tier]
  if results['A']['tiers'][tier]['retainedGeometryHashes']!=results[v]['tiers'][tier]['retainedGeometryHashes']:failures.append({'retainedGeometryMismatch':tier,'variant':v})
  if tier.endswith('game') and b['raw']>=a['raw']:failures.append({'noDrawReduction':tier,'variant':v})
  if tier.endswith('far') and b['raw']!=a['raw']:failures.append({'farDrawChanged':tier,'variant':v})
output={'images':rows,'counts':counts,'failures':failures,'accepted':not failures,'limits':'SwiftShader completed-output wall time is not physical-device or full-game FPS. A/A and B/B repeat drift must pass exact pixels.'}
(root/'comparison.json').write_text(json.dumps(output,indent=2));print(json.dumps(output,indent=2));sys.exit(bool(failures))
