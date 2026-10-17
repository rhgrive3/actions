from pathlib import Path
import json,os,sys,hashlib,subprocess,datetime,fcntl
from provenance import fresh_pr
c=json.load(open(sys.argv[1]));assert os.environ.get('INKWAVE_ROOT_LEASE'),'Explicit lease required';fresh_pr(c['currentPR']);D=Path(__file__).parent;freeze=Path(c['browserFreeze']);H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();pin=c['browserFreezeSHA256'];assert H(freeze)==pin;b=json.load(open(freeze));assert str(Path(c['browserDriver']).resolve())==b['driver'] and str(Path(c['sourceRoot']).resolve())==b['sourceRoot'];assert b['driver'] in {r['path'] for r in b['files']};evidence=Path(c['browserEvidence']);assert not evidence.exists(),'Fresh unique browser evidence directory required';binding=Path(c['binding']);assert H(binding)==c['bindingSHA256'];official=json.load(open(binding));assert official['head']==b['head'];receipt=Path(c['browserReadReceipt']);assert not receipt.exists()
def verify():
 assert H(freeze)==pin and H(binding)==c['bindingSHA256']
 for r in b['files']:assert H(r['path'])==r['sha256'],r['path']
 for a in official['artifacts']:assert H(Path(c['browserSite'])/a['path'])==a['sha256'],a['path']
 for r in official['sourceInputs']:assert H(Path(c['sourceRoot'])/r['path'])==r['sha256'],r['path']
verify();env={**os.environ,'BROWSER_FREEZE':str(freeze),'BROWSER_FREEZE_SHA256':pin,'BROWSER_READ_RECEIPT':str(receipt)};env.pop('NODE_OPTIONS',None);env.pop('NODE_PATH',None);lock=open('/tmp/inkwave-heavy-source.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
cmd=['timeout','-k','5s','600s','node','--max-old-space-size=512','--import',str(D/'browser-guard.mjs'),c['browserDriver'],'--site',c['browserSite'],'--source-root',c['sourceRoot'],'--source-map',c['sourceMap'],'--official-binding',str(binding),'--evidence-dir',c['browserEvidence'],'--profile-dir',c['browserProfile']]
r=subprocess.run(cmd,env=env);verify();assert r.returncode==0;reads=json.load(open(receipt));assert reads['status']=='passed';result=json.load(open(Path(c['browserEvidence'])/'browser-result.json'));assert result['status']=='passed' and result['savedFiveReopening']['status']=='passed' and len(result['savedFiveReopening']['phases'])==15
(Path(c['browserEvidence'])/'pending-post-run-head.json').write_text(json.dumps({'ended':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':b['head'],'status':'browser-passed-awaiting-fresh-official-PR-read'}))
