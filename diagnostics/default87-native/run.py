from pathlib import Path
import sys,os,json,hashlib,subprocess,time,re,resource,fcntl
D=Path(__file__).resolve().parent;root=Path(sys.argv[1]).resolve();site=Path(sys.argv[2]).resolve();out=Path(sys.argv[3]).resolve()
assert not out.exists();out.mkdir(parents=True)
H=lambda b:hashlib.sha256(b).hexdigest();B=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def save(p,x):p.write_text(json.dumps(x,indent=2)+'\n')
def git(*args):return subprocess.check_output(['git','-C',str(root),*args]).decode().strip()
HEAD='9de6db03899d751a1dcd4fc373afe3a1147614d0';TREE='335250f0a1f81f8235da6efef304f0eaf27751bd'
assert git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE
assert not git('status','--porcelain')
freeze={str(p):H(p.read_bytes())for p in D.iterdir()if p.is_file()}
source={};sourceBlobs={}
for line in subprocess.check_output(['git','-C',str(root),'ls-tree','-r','-z','HEAD']).decode().split('\0'):
 if not line:continue
 meta,rel=line.split('\t');mode,kind,blob=meta.split();assert kind=='blob';p=root/rel;b=p.read_bytes();assert B(b)==blob;source[str(p)]=H(b);sourceBlobs[rel]=blob
manifest=json.loads((site/'inkwave-build.json').read_text());compact=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
assert H(compact(manifest['artifacts']))==manifest['contentHash'];assert H(compact(manifest['files']))==manifest['inputHash']
for key,want in manifest['files'].items():
 cat,rel=key.split('/',1);rel={'upstream':'inkwave-public','patch':'patches/splatoon3','build-script':'scripts'}.get(cat,'patches/'+cat)+'/'+rel
 assert source[str(root/rel)]==want
assert source[str(root/'scripts/build-inkwave.mjs')]==manifest['build']['script']
artifacts={str(site/k):v for k,v in manifest['artifacts'].items()};artifacts[str(site/'inkwave-build.json')]=H((site/'inkwave-build.json').read_bytes())
assert {str(p)for p in site.rglob('*')if p.is_file()}==set(artifacts)
def verify():
 for p,h in {**freeze,**source,**artifacts}.items():assert H(Path(p).read_bytes())==h,p
verify();save(out/'binding.json',{'head':HEAD,'tree':TREE,'contentHash':manifest['contentHash'],'source':source,'sourceBlobs':sourceBlobs,'artifacts':artifacts,'harness':freeze})
cases=[('shooter',r,t)for r in ['Shooter_First_01','Shooter_Normal_01','Shooter_Normal_02']for t in [0,1]]+[('blaster',r,None)for r in ['Blaster_Long_01','Blaster_Middle_02']]
receipts=[];lock=open('/tmp/inkwave-heavy-source.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
for lane in ['source','fullsite']:
 for family,row,team in cases:
  name=family+'-'+row+('-team'+str(team)if team is not None else '');case=out/lane/name;case.mkdir(parents=True);sig=out/'source'/name/'source-signatures.json'
  hashes={**source,**artifacts};sigHash=None
  if lane=='fullsite':sigHash=H(sig.read_bytes());hashes[str(sig)]=sigHash
  readmap=case/'read-map.json';save(readmap,{'lane':lane,'sourceRoot':str(root),'siteRoot':str(site),'signature':str(sig)if lane=='fullsite'else None,'hashes':hashes})
  env={k:v for k,v in os.environ.items()if k not in ['NODE_OPTIONS','NODE_PATH','INKWAVE_BUILT_SITE','SHOOTER_TEAM','BLASTER_TEAM','SHOOTER_REGISTRY_EMITTED_PATH','NO_NATIVE_UPDATE']}
  env.update(QUAL_LANE=lane,QUAL_OUT=str(case),QUAL_FIXTURE=(root/'patches/splatoon3/tests/source-fixture.mjs').as_uri(),QUAL_SOURCE_SIGNATURES=str(sig),QUAL_READ_MAP=str(readmap),QUAL_READ_MAP_SHA=H(readmap.read_bytes()),QUAL_READ_RECEIPT=str(case/'actual-reads.json'))
  env[family.upper()+'_ROW']=row
  if team is not None:env[family.upper()+'_TEAM']=str(team)
  if lane=='fullsite':env['INKWAVE_BUILT_SITE']=str(site)
  cmd=['timeout','-k','5s','180s','node','--jitless','--max-old-space-size=96','--max-semi-space-size=1','--experimental-vm-modules','--test-reporter=tap','--import',str(D/'read-guard.mjs'),str(D/(family+'s.test.mjs'))]
  verify();start=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN)
  with (case/'tap.log').open('wb')as log:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
  after=resource.getrusage(resource.RUSAGE_CHILDREN);rec={'case':name,'lane':lane,'command':cmd,'exitCode':r.returncode,'wallSeconds':time.monotonic()-start,'cpuSeconds':after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,'cumulativeChildMaxRSSKiB':after.ru_maxrss,'sourceSignatureSHA256':sigHash};save(case/'process.json',rec);receipts.append(rec);save(out/'processes.json',receipts);assert r.returncode==0,rec
  verify();tap=(case/'tap.log').read_text();tests=1 if family=='shooter'else 2
  assert re.search(r'^# tests '+str(tests)+r'$',tap,re.M) and re.search(r'^# pass '+str(tests)+r'$',tap,re.M) and re.search(r'^# fail 0$',tap,re.M) and re.search(r'^# skipped 0$',tap,re.M)
  reads=json.loads((case/'actual-reads.json').read_text());assert reads['exitCode']==0 and reads['readMapSHA256']==H(readmap.read_bytes());actual={x['path']for x in reads['reads']}
  prefix=site if lane=='fullsite'else root/'inkwave-public'
  for rel in ['src/core/ctx.js','src/game/actor.js','src/game/character.js','src/game/character-weapons.js']:assert str(prefix/rel)in actual,rel
  for rel in ['patches/splatoon3/runtime/install.mjs','patches/splatoon3/runtime/weapon-models/registry.mjs']:assert str((site if lane=='fullsite'else root)/rel)in actual,rel
  got=json.loads((case/('emitted-signatures.json'if lane=='fullsite'else 'source-signatures.json')).read_text());assert len(got)==(3 if family=='shooter'else 6)
  if lane=='fullsite':
   assert str(sig)in actual and H(sig.read_bytes())==sigHash and got==json.loads(sig.read_text())
   for kind in ['cost','cleanup']:
    files=list(case.glob('emitted-'+kind+'-*.json'));assert len(files)==(3 if family=='shooter'else 6)
    for p in files:assert json.loads(p.read_text())==json.loads((out/'source'/name/p.name.replace('emitted-','source-',1)).read_text())
  print(lane,name,'PASS',flush=True)
verify();save(out/'acceptance.json',{'status':'passed','head':HEAD,'tree':TREE,'contentHash':manifest['contentHash'],'processes':16,'testsPerLane':10,'rolesPerLane':30,'sourceFullsiteSignaturesEqual':True,'sourceFallback':False,'registryOverride':False,'scope':'Fresh local Actor qualification. Shooter360ticks; new Blaster240ticks. No old private harness or browser equivalence claim.'})
save(out/'receipt-manifest.json',{'files':{str(p.relative_to(out)):H(p.read_bytes())for p in out.rglob('*')if p.is_file()}})
