from pathlib import Path
import json,sys,hashlib,subprocess
root=Path(sys.argv[1]).resolve();site=Path(sys.argv[2]).resolve();expected=sys.argv[3];out=Path(sys.argv[4]);H=lambda b:hashlib.sha256(b).hexdigest();git=lambda *a:subprocess.check_output(['git','-C',str(root),*a]).decode().strip();assert git('rev-parse','HEAD')==expected;assert not git('status','--porcelain');m=json.loads((site/'inkwave-build.json').read_bytes());tree={}
for row in subprocess.check_output(['git','-C',str(root),'ls-tree','-r','-z','HEAD']).decode().split('\0'):
 if row:
  meta,p=row.split('\t');tree[p]=meta.split()[2]
for k,want in m['files'].items():
 cat,p=k.split('/',1);p={'upstream':'inkwave-public','patch':'patches/splatoon3','build-script':'scripts'}.get(cat,'patches/'+cat)+'/'+p;b=(root/p).read_bytes();assert H(b)==want and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==tree[p],p
for p,want in m['artifacts'].items():assert H((site/p).read_bytes())==want,p
out.write_text(json.dumps({'head':expected,'tree':git('rev-parse','HEAD^{tree}'),'contentHash':m['contentHash'],'inputs':len(m['files']),'artifacts':len(m['artifacts']),'sourceClean':True},indent=2))
