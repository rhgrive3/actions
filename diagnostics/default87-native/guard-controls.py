from pathlib import Path
import tempfile,subprocess,os,json,hashlib
D=Path(__file__).resolve().parent;H=lambda b:hashlib.sha256(b).hexdigest();results=[]
with tempfile.TemporaryDirectory()as t:
 p=Path(t);src=p/'source';site=p/'site';(src/'inkwave-public').mkdir(parents=True);site.mkdir();a=src/'inkwave-public/native.js';b=site/'native.js';a.write_text('native');b.write_text('built')
 for name,lane,target,pinned,ok in [('source-good','source',a,True,True),('fullsite-good','fullsite',b,True,True),('fullsite-source-rejected','fullsite',a,True,False),('unbound-rejected','source',a,False,False),('drift-rejected','fullsite',b,True,False)]:
  m={'lane':lane,'sourceRoot':str(src),'siteRoot':str(site),'signature':None,'hashes':{str(target):'0'*64 if name=='drift-rejected'else H(target.read_bytes())}if pinned else {}}
  mp=p/(name+'.json');mp.write_text(json.dumps(m));rp=p/(name+'-reads.json');env={**os.environ,'QUAL_READ_MAP':str(mp),'QUAL_READ_MAP_SHA':H(mp.read_bytes()),'QUAL_READ_RECEIPT':str(rp)}
  code="import fs from 'node:fs';fs.readFileSync("+json.dumps(str(target))+",'utf8')"
  r=subprocess.run(['node','--import',str(D/'read-guard.mjs'),'--input-type=module','-e',code],env=env,capture_output=True);assert (r.returncode==0)==ok,(name,r.stderr);rec=json.loads(rp.read_text());assert len(rec['reads'])==(1 if ok else 0);results.append(name)
print(json.dumps({'passed':results,'scope':'Synthetic actual-read guard controls; no Actor execution'}))
