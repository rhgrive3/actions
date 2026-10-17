from pathlib import Path
import sys,json,hashlib,subprocess
D=Path(__file__).parent;root=Path(sys.argv[1]).resolve();site=Path(sys.argv[2]).resolve();e=Path(sys.argv[3]).resolve();e.mkdir(exist_ok=True);git=lambda *a:subprocess.check_output(['git','-C',str(root),*a]).decode().strip();H=lambda b:hashlib.sha256(b).hexdigest()
assert git('rev-parse','HEAD')=='1d7355253f80dce82f17292690ddaab85e342492';assert not git('status','--porcelain')
m=json.loads((site/'inkwave-build.json').read_bytes()); tree={}
for row in subprocess.check_output(['git','-C',str(root),'ls-tree','-r','-z','HEAD']).decode().split('\0'):
 if row:
  meta,p=row.split('\t');tree[p]=meta.split()[2]
for key,want in m['files'].items():
 cat,p=key.split('/',1);p={'upstream':'inkwave-public','patch':'patches/splatoon3','build-script':'scripts'}.get(cat,'patches/'+cat)+'/'+p;b=(root/p).read_bytes();assert H(b)==want;assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==tree[p]
for p,want in m['artifacts'].items():assert H((site/p).read_bytes())==want,p
(D/'driver.mjs').write_text((D/'driver.template.mjs').read_text().replace('__SOURCE_ROOT__',str(root)))
(e/'build-binding.json').write_text(json.dumps({'head':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),'contentHash':m['contentHash'],'inputs':len(m['files']),'artifacts':len(m['artifacts']),'sourceClean':True},indent=2))
