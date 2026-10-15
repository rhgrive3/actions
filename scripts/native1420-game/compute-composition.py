import hashlib,json,pathlib,sys
p=pathlib.Path(__file__).resolve().parent
raw=json.loads(pathlib.Path(sys.argv[1]).read_text())
assert raw.get('truncated') is False
rows=raw['tree']; leaves={r['path']:(r['mode'],r['sha']) for r in rows if r['type']!='tree'}
assert len(leaves)==sum(r['type']!='tree' for r in rows)
def digest(leaves):
 root={}
 for path,(mode,sha) in leaves.items():
  node=root
  parts=path.split('/')
  for part in parts[:-1]:node=node.setdefault(part,{})
  node[parts[-1]]=(mode,sha)
 def tree(node):
  out=b''
  for name,value in sorted(node.items(),key=lambda v:(v[0]+('/' if isinstance(v[1],dict) else '')).encode()):
   mode,sha=('40000',tree(value)) if isinstance(value,dict) else value
   out+=mode.encode()+b' '+name.encode()+b'\0'+bytes.fromhex(sha)
  return hashlib.sha1(b'tree '+str(len(out)).encode()+b'\0'+out).hexdigest()
 return tree(root)
source=digest(leaves);assert source=='0db88d4cafcee36f67bd88b4c9f541997c520ca1'
path='patches/native-stages/definitions/shipshape.json';assert path not in leaves
b=(p/'shipshape-definition.json').read_bytes();blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();assert blob=='342ee65fe024f68313e68d60c2fb0af9463c8b03'
overlay={**leaves,path:('100644',blob)}
runtime={k:v[1] for k,v in leaves.items() if '/runtime/' in k}
assert all(overlay[k]==v for k,v in leaves.items())
print(json.dumps({'sourceHead':'c99d1310a6cfb1ba65e9fb3394799c6fdbc42778','sourceTree':source,'compositionTree':digest(overlay),'soleAddedPath':path,'definitionGitBlob':blob,'preservedExistingLeaves':len(leaves),'preservedRuntimeBlobs':len(runtime),'runtimeMapSHA256':hashlib.sha256(json.dumps(runtime,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'scope':'Computed diagnostic tree only; no commit/publication/execution'},indent=2))
