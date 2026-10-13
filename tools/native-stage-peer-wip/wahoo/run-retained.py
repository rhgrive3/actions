# Historical executed runner; only local-path configuration is externalized.
from pathlib import Path
import os,json,hashlib,subprocess,time,sys
ROOT=Path(os.environ['NATIVE_PEER_CODE_ROOT'])
ASSETS=Path(os.environ['INKWAVE_NATIVE_STAGE_ASSETS'])
OUT=Path(os.environ['NATIVE_PEER_EVIDENCE_DIR'])
OUT.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def binding():
 files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
 selected=[p for p in files if p and p.endswith(('.js','.mjs','.json')) and (p.startswith(('inkwave-public/','patches/','scripts/')))]
 stages=json.loads((ASSETS/'catalog.json').read_text())['stages']
 sourcefiles=[ASSETS/'catalog.json']
 for s in stages:sourcefiles.extend(p for p in (ASSETS/s['id']).rglob('*') if p.is_file())
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'code':{p:sha(ROOT/p) for p in selected},'fixtures':{str(p.relative_to(ASSETS)):sha(p) for p in sorted(sourcefiles)},'stages':[{'id':s['id'],'sourceNavigation':json.loads((ASSETS/s['id']/'manifest.json').read_text()).get('sourceNavigation')} for s in stages]}
before=binding();(OUT/'start-binding.json').write_text(json.dumps(before,indent=2)+'\n')
assert before['head']=='10e6a95ecca3a76b8eba5451e2e8b219ab50e5f0',before['head']
assert before['code']['patches/native-stages/runtime/native-climb.mjs']=='4cb34f74838596bfe3bad1ff9c15a86a7029b40ae40d13ea73d82c4b5b5dd136'
env=os.environ.copy();env['INKWAVE_NATIVE_STAGE_ASSETS']=str(ASSETS);env['INKWAVE_NATIVE_STAGE_SOURCE']=os.environ['INKWAVE_NATIVE_STAGE_SOURCE']
cmd=['node','--experimental-vm-modules','--test-reporter=tap','--test-concurrency=1','--test','patches/native-stages/tests/native-integration.test.mjs']
start=time.time();print(json.dumps({'started':start,'head':before['head'],'log':str(OUT/'test.log'),'codeFiles':len(before['code']),'fixtureFiles':len(before['fixtures'])}),flush=True)
with (OUT/'test.log').open('w') as log:p=subprocess.run(cmd,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
(OUT/'test.exit').write_text(str(p.returncode)+'\n')
after=binding();(OUT/'end-binding.json').write_text(json.dumps(after,indent=2)+'\n')
lines=(OUT/'test.log').read_text().splitlines();totals=[s for s in lines if s.startswith(('# tests','# pass','# fail','# skipped','# cancelled','# duration'))]
receipt={'head':before['head'],'helperSha256':before['code']['patches/native-stages/runtime/native-climb.mjs'],'command':cmd,'exit':p.returncode,'elapsedSeconds':time.time()-start,'bindingsEqual':before==after,'codeFiles':len(before['code']),'fixtureFiles':len(before['fixtures']),'stages':before['stages'],'totals':totals,'scope':'Independent retained original-five source paint/physics/climb/movement/navigation integration. These wallClimb flags are OFF; this does not exercise or qualify the new dry refill branch. Actor raw 30/60/120 fixture update is distinct from owner actual fixed-Game proof.','log':str(OUT/'test.log')}
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
sys.exit(p.returncode if p.returncode else (0 if before==after else 2))
