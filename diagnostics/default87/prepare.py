from pathlib import Path
import sys,json,hashlib,subprocess,datetime,urllib.request,shutil,os
D=Path(__file__).parent.resolve();root=Path(sys.argv[1]).resolve();site=Path(sys.argv[2]).resolve();evidence=Path(sys.argv[3]).resolve();execution=Path(sys.argv[4]).resolve();profile=Path(sys.argv[5]).resolve();HEAD='9de6db03899d751a1dcd4fc373afe3a1147614d0';TREE='335250f0a1f81f8235da6efef304f0eaf27751bd';CONTENT=None;H=lambda b:hashlib.sha256(b).hexdigest();B=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();git=lambda *a:subprocess.check_output(['git','-C',str(root),*a]).decode().strip();assert git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE;assert not git('status','--porcelain');assert not execution.exists();execution.mkdir(parents=True);evidence.mkdir(parents=True,exist_ok=True)
PR_HEAD='e1a458e6efce96fc5f69008d1022957de8f2d300';MAIN_HEAD='4754c4ef402375f26e2d46702ed46330b401108b'
assert git('show','-s','--format=%P','HEAD').split()==[PR_HEAD,MAIN_HEAD], 'Candidate parent drift'
def readPR(target):
 with urllib.request.urlopen('https://api.github.com/repos/rhgrive3/actions/pulls/1538',timeout=30)as r:p=json.load(r)
 with urllib.request.urlopen('https://api.github.com/repos/rhgrive3/actions/git/ref/heads/main',timeout=30)as r:m=json.load(r)
 assert m['object']['sha']==MAIN_HEAD,'Main head drift'
 assert p['head']['sha']==PR_HEAD and p['state']=='open' and not p['merged'];p={'number':1538,'head':{'sha':PR_HEAD},'mainHead':MAIN_HEAD,'candidateHead':HEAD,'state':'open','merged':False,'readAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};target.write_text(json.dumps(p));return p
pr=readPR(evidence/'pr-before.json');mapping={}
for line in subprocess.check_output(['git','-C',str(root),'ls-tree','-r','-z','HEAD']).decode().split('\0'):
 if line:
  meta,rel=line.split('\t');mode,kind,sha=meta.split();mapping[rel]={'mode':mode,'type':kind,'sha':sha}
(sourceMap:=evidence/'source-map.json').write_text(json.dumps(mapping));mb=(site/'inkwave-build.json').read_bytes();m=json.loads(mb);compact=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).encode();CONTENT=m['contentHash'];assert len(CONTENT)==64 and all(c in '0123456789abcdef' for c in CONTENT) and H(compact(m['artifacts']))==CONTENT and H(compact(m['files']))==m['inputHash'];assert m['build']['esbuild']=='0.28.2' and m['build']['optimization']=='esbuild-minify';inputs=[]
for key,want in m['files'].items():
 cat,rel=key.split('/',1);rel={'upstream':'inkwave-public','patch':'patches/splatoon3','build-script':'scripts'}.get(cat,'patches/'+cat)+'/'+rel;b=(root/rel).read_bytes();assert H(b)==want and B(b)==mapping[rel]['sha'],rel;inputs.append({'path':rel,'sha256':want,'blob':mapping[rel]['sha']})
b=(root/'scripts/build-inkwave.mjs').read_bytes();assert H(b)==m['build']['script'] and B(b)==mapping['scripts/build-inkwave.mjs']['sha'];inputs.append({'path':'scripts/build-inkwave.mjs','sha256':H(b)})
artifacts=[]
for rel,want in m['artifacts'].items():
 p=site/rel;assert p.resolve().is_relative_to(site);b=p.read_bytes();assert H(b)==want;artifacts.append({'path':rel,'sha256':want,'bytes':len(b)})
assert {str(p.relative_to(site))for p in site.rglob('*')if p.is_file()}==set(m['artifacts'])|{'inkwave-build.json'};artifacts.append({'path':'inkwave-build.json','sha256':H(mb),'bytes':len(mb)})
for f in ['saved-five-reopen.mjs','png-pixels.mjs','browser-guard.mjs','run-browser.py','provenance.py','finalize.py']:shutil.copyfile(D/f,execution/f)
driver=execution/'driver.mjs';driver.write_text((D/'driver.template.mjs').read_text().replace('__SOURCE_ROOT__',str(root)));files=[]
for rel,r in mapping.items():
 if rel.endswith(('.js','.mjs')):
  p=root/rel;b=p.read_bytes();assert B(b)==r['sha'];files.append({'path':str(p),'sha256':H(b)})
for p in execution.iterdir():
 if p.is_file():files.append({'path':str(p),'sha256':H(p.read_bytes())})
freeze=execution/'freeze.json';freeze.write_text(json.dumps({'driver':str(driver),'sourceRoot':str(root),'head':HEAD,'files':files},indent=2));receipt={'head':HEAD,'tree':TREE,'status':'passed','site':str(site),'sourceRoot':str(root),'diagnosticHead':os.environ['GITHUB_SHA'],'contentHash':CONTENT,'inputHash':m['inputHash'],'sourceInputs':len(inputs),'artifactCount':len(artifacts),'kind':'separate diagnostic workflow production build; final PR CI remains independent','contentHashOrigin':'actual completed build, exact source Git blobs and all artifact bytes verified against immutable candidate tree before freezing'};rb=json.dumps(receipt).encode();(evidence/'build-receipt.json').write_bytes(rb);binding={'head':HEAD,'candidateTree':TREE,'diagnosticProductionBuildVerified':True,'allSourceInputsVerified':True,'sourceRoot':str(root),'site':str(site),'contentHash':CONTENT,'buildReceiptSHA256':H(rb),'sourceInputs':inputs,'artifacts':artifacts};bp=evidence/'binding.json';bp.write_text(json.dumps(binding,indent=2));config={'currentPR':str(evidence/'pr-before.json'),'sourceRoot':str(root),'sourceMap':str(sourceMap),'browserSite':str(site),'browserDriver':str(driver),'browserFreeze':str(freeze),'browserFreezeSHA256':H(freeze.read_bytes()),'browserEvidence':str(evidence/'browser'),'browserProfile':str(profile),'browserReadReceipt':str(evidence/'actual-helper-reads.json'),'binding':str(bp),'bindingSHA256':H(bp.read_bytes())};(execution/'config.json').write_text(json.dumps(config,indent=2));(evidence/'preflight.json').write_text(json.dumps({'head':HEAD,'tree':TREE,'contentHash':CONTENT,'helperFiles':len(files),'config':config},indent=2));print(json.dumps(receipt))
