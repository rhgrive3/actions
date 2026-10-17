from pathlib import Path
import sys,json,hashlib
E=Path(sys.argv[1]);engine=sys.argv[2];execution=Path(sys.argv[3]);site=Path(sys.argv[4]);H=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads((site/'inkwave-build.json').read_text());assert H((site/'inkwave-build.json').read_bytes())==H((E/'inkwave-build.json').read_bytes())
for key,digest in manifest['artifacts'].items():assert H((site/key).read_bytes())==digest,key
p=json.loads((execution/'preparation.json').read_text())
for key,digest in p['files'].items():assert H((execution/key).read_bytes())==digest,key
r=json.loads((E/'reliability-browser-result.json').read_text());t=json.loads((E/(engine+'-issue1430-trace.json')).read_text());assert r['status']=='passed' and not r['errors'];assert len(r['cases'])==1 and r['cases'][0]['engine']==engine;assert t['sourceSha']==p['head'] and t['contentHash']==r['contentHash']==manifest['contentHash'];assert t['count']==2 and 1<len(t['rows'])<=2048
assert any(x['kind']=='before-advance' for x in t['rows']);assert any(x['kind']=='after-advance' and x['count']==2 for x in t['rows']);assert any(x['event'].get('id')==503 for x in t['rows'] if x.get('event'));assert 'native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once' in r['cases'][0]['checks']
for key in ['src/core/mobile.js','src/core/input.js','src/game/player.js','src/game/actor.js','src/game/weapons.js','patches/splatoon3/runtime/install.mjs']:assert r['receipts'].get(key)==manifest['artifacts'][key],key
(E/'issue1430-acceptance.json').write_text(json.dumps({'status':'passed','head':p['head'],'engine':engine,'contentHash':r['contentHash'],'traceSHA256':H((E/(engine+'-issue1430-trace.json')).read_bytes()),'rows':len(t['rows']),'count':2,'scope':'Existing bounded emitted reliability fixture; no full-game/device or intermittent-resolution claim'},indent=2)+'\n')
