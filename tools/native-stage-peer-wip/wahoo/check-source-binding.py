# Previously executed independent source-binding reader; paths come from ENV.
from pathlib import Path
import os,json,hashlib
site=Path(os.environ['NATIVE_PEER_SITE'])
x=json.loads(Path(os.environ['NATIVE_PEER_BASELINE_BINDING']).read_text())
checks=[]
for q in x['checks']:
 p=site/q['path'];b=p.read_bytes();digest=hashlib.sha256(b).hexdigest();checks.append({'path':q['path'],'bytes':len(b),'sha256':digest,'matchesArchivedBaseline':len(b)==q['bytes'] and digest==q['sha256']})
meta=json.loads((site/'inkwave-build.json').read_text())
y={'candidateContentHash':meta['contentHash'],'candidateInputHash':meta['inputHash'],'matchesOwnerCandidateBinding':meta['contentHash']==x['candidateContentHash'] and meta['inputHash']==x['candidateInputHash'],'sourceFiles':len(checks),'bytes':sum(c['bytes'] for c in checks),'allCurrentFilesMatchArchivedBaseline':all(c['matchesArchivedBaseline'] for c in checks),'scope':'Independent current emitted-source check against owner archived matched baseline hashes. No source rebuild or browser execution.','checks':checks}
out=Path(os.environ['NATIVE_PEER_BINDING_OUTPUT']);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(y,indent=2)+'\n');print(json.dumps({k:v for k,v in y.items() if k!='checks'}))
