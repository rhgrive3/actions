from pathlib import Path
import json,sys,hashlib
p=Path(sys.argv[1]);j=json.loads((p/'paired.json').read_text());assert j['physicalVerification']['status']=='pass',j['physicalVerification'];pairs=j['pairedCaptureVerification'];assert pairs['matchedPairCount']==pairs['expectedPairs']==11
for side in ['before','after']:
 r=json.loads((p/side/'projectile-visuals-result.json').read_text());assert r['status']=='passed' and len(r['screenshots'])==11 and len(r['visualScenarios'])==1 and r['visualScenarios'][0]['name']=='roller-horizontal';assert r.get('diagnosticScope','').startswith('horizontal-only11')

a=json.loads((p/'before/projectile-visuals-result.json').read_text())['visualScenarios'][0]['colliderFixture'];b=json.loads((p/'after/projectile-visuals-result.json').read_text())['visualScenarios'][0]['colliderFixture'];assert a['slots']==b['slots'] and a['corridor']==b['corridor'];assert len(a['slots'])==len(b['slots'])==7 and a['actorArrayPreserved'] and b['actorArrayPreserved'];assert len(a['segments'])>0 and len(b['segments'])>0 and not a['actorHits'] and not b['actorHits']
(p/'focused-result.json').write_text(json.dumps({'status':'passed','matchedPairs':11,'scope':'Focused horizontal Roller capture parity only. Full48/performance mandatoryCI still required.','physicalVerification':j['physicalVerification']},indent=2))
