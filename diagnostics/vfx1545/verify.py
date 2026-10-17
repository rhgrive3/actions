import hashlib,json,os,pathlib,subprocess,sys
HEAD='5b876cb239412e2cf8f67323f2523d93ff5fd642'
TREE='fb68251f33ced4e97fab14b5bd663c6c9e9ff334'
CONTENT='6f27dbba23c7a5b29b2c0a0886391db4507f24f3c9bdad6082c6d91eb231c8de'
PINS={'scripts/check-inkwave-special-presentation.mjs':'fb5ceb3ef5d802d5e79b7abe8388b79a90f5873329e1b0fa3d894cd458513d47','scripts/lib/inkwave-vfx-frame-evidence.mjs':'9fb3820f88d4e1e332a25eb6388c6be0d7b0b63bbebc6bdc9a4cf267d0836154','scripts/tests/inkwave-vfx-frame-evidence.test.mjs':'fdcfa8aa6185f091a7ae077467ff67925671b0947d8396e23fc9e89a77c5f45e'}
def sha(b):return hashlib.sha256(b).hexdigest()
def git(root,*args):return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
def pairs(r):
 assert r['status']=='passed' and r['errors']==[]
 frames=r['vfxFrames'];assert len(frames)==32
 by={f['name']:f for f in frames};assert len(by)==32
 expected={(q,k) for q in [.35,1] for k in ['sparks','puffs']}
 assert {(x['quality'],x['key']) for x in r['vfxResources']['pool']}==expected and len(r['vfxResources']['pool'])==4
 expected={(q,m,c) for q in [.35,1] for m in ['clear','dispose','normal'] for c in [0,1]}
 assert {(x['quality'],x['mode'],x['cycle']) for x in r['vfxResources']['fists']}==expected and len(r['vfxResources']['fists'])==12
 seen=set()
 for kind,rows in [('pool',r['vfxResources']['pool']),('fist',r['vfxResources']['fists'])]:
  for row in rows:
   b,t=by[row['baselineFrame']],by[row['targetFrame']]
   assert b['phase']=='baseline' and t['phase']=='target' and t['baselineFrame']==b['name']
   assert b['renderSerial']<t['renderSerial'] and b['kind']==t['kind']==kind
   for k in ['quality']+(['key'] if kind=='pool' else ['mode','cycle']):assert b[k]==t[k]==row[k]
   assert t['draws']>0 if kind=='fist' else t['live']==t['cap'] and t['changedPixels']>20
   seen.update([b['name'],t['name']])
 assert seen==set(by)
 return frames
if __name__=='__main__':
 mode=sys.argv[1];candidate=pathlib.Path(sys.argv[2]);site=pathlib.Path(sys.argv[3]);evidence=pathlib.Path(sys.argv[4]);diagnostic=pathlib.Path(__file__).resolve().parents[2]
 assert git(candidate,'rev-parse','HEAD')==HEAD and git(candidate,'rev-parse','HEAD^{tree}')==TREE
 assert git(candidate,'status','--porcelain','--untracked-files=all')==''
 for p,h in PINS.items():assert sha((diagnostic/p).read_bytes())==h,p
 manifestBytes=(site/'inkwave-build.json').read_bytes();manifest=json.loads(manifestBytes)
 assert manifest['contentHash']==CONTENT
 assert sha(json.dumps(manifest['artifacts'],ensure_ascii=False,separators=(',',':')).encode())==CONTENT
 for p,h in manifest['artifacts'].items():assert sha((site/p).read_bytes())==h,p
 binding=dict(sourceHead=HEAD,sourceTree=TREE,diagnosticHead=git(diagnostic,'rev-parse','HEAD'),runId=os.environ['GITHUB_RUN_ID'],runAttempt=os.environ['GITHUB_RUN_ATTEMPT'],contentHash=CONTENT,revision=manifest['build']['revision'],manifestSHA256=sha(manifestBytes),artifactCount=len(manifest['artifacts']),verifierPins=PINS)
 if mode=='prepare':
  evidence.mkdir(exist_ok=True);(evidence/'binding.json').write_text(json.dumps(binding,indent=2));(evidence/'candidate-build.json').write_bytes(manifestBytes)
 elif mode=='finish':
  assert json.loads((evidence/'binding.json').read_text())==binding
  r=json.loads((evidence/'special-presentation/special-presentation-result.json').read_text());assert r['sourceHead']==HEAD and r['contentHash']==CONTENT and r['revision']==binding['revision']
  frames=pairs(r)
  for f in frames:
   assert f['head']==HEAD and f['contentHash']==CONTENT and f['revision']==binding['revision']
   assert f['file']==f['name']+'.png' and pathlib.Path(f['file']).name==f['file']
   b=(evidence/'special-presentation'/f['file']).read_bytes();assert sha(b)==f['sha256'] and len(b)==f['bytes']
   assert b[:8]==b'\x89PNG\r\n\x1a\n' and int.from_bytes(b[16:20],'big')==f['width']==960 and int.from_bytes(b[20:24],'big')==f['height']==720
  (evidence/'verified-frame-index.json').write_text(json.dumps(dict(**binding,frames=frames,scope='Injected emitted-production fixture; same-scene baselines; no full-gameplay, retail appearance or FPS claim'),indent=2))
 else:raise ValueError(mode)
 print(json.dumps(binding))
