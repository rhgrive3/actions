#!/usr/bin/env python3
"""Run under the global browser flock; no CPU lock is acquired here."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
root=Path('/workspace/stage-worktrees/bluefin')
site=Path(sys.argv[1]).resolve()
out=Path(sys.argv[2]).resolve()
helper=Path('/workspace/stage-worktrees/humpback/.ci-scratch/bluefin-stage-peer/current-natural-strict-online.mjs')
expected='5216911e7ad465472754acebaf71bbf2d44a1e82fa20ab141306aebc6daea7bf'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
assert sha(helper)==expected
out.mkdir(parents=True,exist_ok=False)
identity=json.loads((site/'inkwave-build.json').read_text())
revision=identity['build']['revision']
assert (site/'_versions'/revision).is_dir()
def files(base):
 return [{'path':str(p.relative_to(base)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(base.rglob('*')) if p.is_file()]
def binding():
 return {'helper':{'path':str(helper),'sha256':sha(helper)},'build':{'contentHash':identity['contentHash'],'inputHash':identity['inputHash'],'revision':revision},'site':str(site),'allEmittedFiles':files(site),'serverSource':files(root/'server/src'),'nativeSource':files(root/'patches/native-stages/runtime'),'splatoonRuntime':files(root/'patches/splatoon3/runtime'),'stageDefinition':{'path':str(root/'patches/native-stages/definitions/bluefin.json'),'sha256':sha(root/'patches/native-stages/definitions/bluefin.json')},'rawEngine':files(root/'inkwave-public/src')}
def write(name,d): (out/name).write_text(json.dumps(d,indent=2)+'\n')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
before=binding();write('binding-before.json',before)
env=os.environ.copy();env.update(NATIVE_STAGE_IDS='bluefin',NATIVE_HOST_WEAPON='s3-blaster-short',NATIVE_ONLINE_SOURCE_ROOT=str(root),NATIVE_ONLINE_MODES='turf,zones,tower,rainmaker,clams')
with (out/'process.log').open('w') as log:
 run=subprocess.run(['node',str(helper),str(site),str(out/'browser')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
after=binding();write('binding-after.json',after)
assert before==after,'Final browser/helper/production source bytes changed during the test'
path=out/'browser/online.json';d=json.loads(path.read_text()) if path.is_file() else {}
receipt={'status':'passed' if run.returncode==0 and d.get('status')=='passed' and len(d.get('results',[]))==5 and all(r.get('supported') is not False for r in d.get('results',[])) else 'failed','processExitCode':run.returncode,'artifactSourceServerHelperStable':before==after,'stageHeadAtStart':head,'sourceHeadAtEnd':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'site':str(site),'contentHash':identity['contentHash'],'inputHash':identity['inputHash'],'revision':revision,'helperSha256':expected,'evidence':str(path),'evidenceSha256':sha(path) if path.is_file() else None,'cases':len(d.get('results',[])),'naturalSupportedModes':[r['mode'] for r in d.get('results',[]) if r.get('supported') is not False],'unsupportedModes':[{'mode':r['mode'],'status':r['status']} for r in d.get('results',[]) if r.get('supported') is False],'errors':d.get('errors'),'packets':d.get('packets'),'scope':'Exact final Bluefin private artifact; actual current production RoomDurableObject/real two-browser WS; actual initial human mouse launch and source-foot landing; actual PlayerController/Actor/WeaponRunner catalogue Luna _push admission and burst source-floor ray projection/local claimOwner3.84 paint/new positive claimed area; complete in-page grid SHA equality after actual replay watermarks/growth/replay/out queues; controlled ranked snapshot separate; no post-initial physical/source/grid writes or manual source stamp. No retail11.3/native mask/physics/placement/hardware/RNG distribution equivalence.'}
write('receipt.json',receipt)
print(json.dumps({k:v for k,v in receipt.items() if k not in ['scope']},separators=(',',':')))
if run.returncode:sys.exit(run.returncode)
assert d.get('status')=='passed' and len(d.get('results',[]))==5
assert all(r.get('supported') is not False for r in d['results']),'Bluefin five-supported-mode expected gate changed; retain genuine refusal'
