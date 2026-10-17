from pathlib import Path
import json,sys
root=Path(sys.argv[1]);out={}
for side in ['before','after']:
 r=json.loads((root/side/'projectile-visuals-result.json').read_text())
 assert r['status']=='passed'
 proof=r['poseResetProof'];assert len(proof)==4
 assert {p['name'] for p in proof}=={'shooter','slosher9','roller-horizontal','roller-vertical'}
 for p in proof:
  assert p['exact'] and [c['history']['frames'] for c in p['cases']]==[0,133,208]
  first=p['cases'][0]['physical']
  for c in p['cases']:
   q=c['physical'];assert q==first
   assert q['births']
   assert q['sourceMotion']['status']=='ready'
   assert q['sourceMotion']['active']==(not p['name'].startswith('roller'))
   assert all(v is True for k,v in q['reset'].items() if k!='sourceMotionStatus')
  assert len(r['screenshots'])==48
 out[side]=proof
out['crossBuildExact']=all(a['cases'][0]['physical']==b['cases'][0]['physical'] for a,b in zip(out['before'],out['after']))
assert out['crossBuildExact']
out['status']='pass'
(root/'pose-reset-proof.json').write_text(json.dumps(out,indent=2)+'\n')
print('Native active source motion: 24 histories across two builds exact; native Roller owner preserved.')
