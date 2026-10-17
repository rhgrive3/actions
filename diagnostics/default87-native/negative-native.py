# One explicit mutation control. Canonical tests remain untouched.
from pathlib import Path
import sys,json,hashlib,subprocess,os,re,time
D=Path(__file__).resolve().parent;root=Path(sys.argv[1]).resolve();site=Path(sys.argv[2]).resolve();evidence=Path(sys.argv[3]).resolve();binding=json.loads((evidence/'binding.json').read_text());out=evidence/'negative-no-native-update';assert not out.exists();out.mkdir()
H=lambda b:hashlib.sha256(b).hexdigest()
def verify():
 for section in ['source','artifacts','harness']:
  for path,want in binding[section].items():assert H(Path(path).read_bytes())==want,path
verify()
original=(D/'blasters.test.mjs').read_bytes();assert H(original)==binding['harness'][str(D/'blasters.test.mjs')]
needle=b'if(!process.env.NO_NATIVE_UPDATE)a.update(1/60);';assert original.count(needle)==1;mutated=original.replace(needle,b'/* Explicit negative: actual Actor.update omitted. */');p=out/'mutated.test.mjs';p.write_bytes(mutated)
rm=out/'read-map.json';rm.write_text(json.dumps({'lane':'source','sourceRoot':str(root),'siteRoot':str(site),'signature':None,'hashes':{**binding['source'],**binding['artifacts']}}));receipt=out/'actual-reads.json'
env={k:v for k,v in os.environ.items()if k not in ['NODE_OPTIONS','NODE_PATH','INKWAVE_BUILT_SITE','NO_NATIVE_UPDATE','SHOOTER_REGISTRY_EMITTED_PATH']};env.update(QUAL_LANE='source',QUAL_OUT=str(out),QUAL_FIXTURE=(root/'patches/splatoon3/tests/source-fixture.mjs').as_uri(),BLASTER_ROW='Blaster_Long_01',BLASTER_TEAM='0',QUAL_READ_MAP=str(rm),QUAL_READ_MAP_SHA=H(rm.read_bytes()),QUAL_READ_RECEIPT=str(receipt))
cmd=['timeout','-k','5s','180s','node','--jitless','--max-old-space-size=96','--max-semi-space-size=1','--experimental-vm-modules','--test-reporter=tap','--import',str(D/'read-guard.mjs'),str(p)];start=time.monotonic()
with (out/'tap.log').open('wb')as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
tap=(out/'tap.log').read_text();proof={'exitCode':r.returncode,'wallSeconds':time.monotonic()-start,'originalSHA256':H(original),'mutationSHA256':H(mutated),'command':cmd};(out/'process.json').write_text(json.dumps(proof,indent=2));assert r.returncode==1 and re.search(r"^  error: ['\"]?native clock advances['\"]?$",tap,re.M) and re.search(r"^  code: ['\"]?ERR_ASSERTION['\"]?$",tap,re.M) and re.search(r'^# fail 1$',tap,re.M) and re.search(r'^# tests 1$',tap,re.M);assert H((D/'blasters.test.mjs').read_bytes())==H(original);assert not (out/'source-signatures.json').exists();reads=json.loads(receipt.read_text());assert reads['exitCode']==1 and reads['readMapSHA256']==H(rm.read_bytes());actual={r['path']for r in reads['reads']};assert str(root/'inkwave-public/src/game/actor.js')in actual and str(root/'inkwave-public/src/game/character.js')in actual;verify();proof['status']='passed_expected_assertion_failure';(out/'proof.json').write_text(json.dumps(proof,indent=2))

core=evidence/'acceptance.json';(evidence/'full-acceptance.json').write_text(json.dumps({'status':'passed','coreAcceptanceSHA256':H(core.read_bytes()),'negativeNativeControlSHA256':H((out/'proof.json').read_bytes()),'scope':'16 source/fullsite matrix processes plus one separately generated native-update negative process; exact candidate9de6db only; no browser or final PR CI claim'},indent=2))
(evidence/'final-manifest.json').write_text(json.dumps({'files':{str(p.relative_to(evidence)):H(p.read_bytes())for p in evidence.rglob('*')if p.is_file() and p.name!='final-manifest.json'}},indent=2))
