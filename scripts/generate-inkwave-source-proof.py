#!/usr/bin/env python3
"""Anchor every browser build input to the final composed tree or verified HEAD.

No fixed branch, tree, file count, runtime body, or standalone patch is assumed.
The parent owns the final combined manifest. Planned composition is explicitly
not a committed HEAD, and cannot silently be reported as one.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess
p=argparse.ArgumentParser()
p.add_argument('--source-root',required=True)
p.add_argument('--output',required=True)
p.add_argument('--official-tree')
p.add_argument('--official-commit')
p.add_argument('--composition-manifest')
p.add_argument('--git-head',action='store_true')
p.add_argument('--expected-head')
a=p.parse_args();root=Path(a.source_root).resolve();output=Path(a.output).resolve()
def digest(data):return hashlib.sha256(data).hexdigest()
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def safe_path(path):
 assert isinstance(path,str) and path and not path.startswith('/') and '..' not in path.split('/') and '\\' not in path,path
 return path

def tree_hash(leaves,prefix=''):
 direct={}
 for name,row in leaves.items():
  if not name.startswith(prefix):continue
  sub=name[len(prefix):]
  if '/' in sub:direct[sub.split('/')[0]]={'mode':'40000','sha':None}
  else:direct[sub]=row
 packed=[]
 for name,row in direct.items():
  sha=row['sha'] or tree_hash(leaves,prefix+name+'/')
  packed.append((name+('/' if row['mode']=='40000' else ''),row['mode'].encode()+b' '+name.encode()+b'\0'+bytes.fromhex(sha)))
 data=b''.join(row[1] for row in sorted(packed));return hashlib.sha1(b'tree '+str(len(data)).encode()+b'\0'+data).hexdigest()

if a.git_head:
 assert not a.official_tree and not a.official_commit and not a.composition_manifest,'choose one provenance mode'
 def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
 head=git('rev-parse','HEAD').decode().strip();expected_tree=git('rev-parse','HEAD^{tree}').decode().strip()
 if a.expected_head:assert head==a.expected_head,'HEAD moved'
 leaves={}
 for row in git('ls-tree','-r','-z','HEAD').split(b'\0'):
  if not row:continue
  meta,name=row.split(b'\t',1);mode,kind,sha=meta.decode().split();assert kind=='blob','non-blob source entry'
  leaves[safe_path(name.decode())]={'mode':mode,'sha':sha}
 assert tree_hash(leaves)==expected_tree
 origin={'mode':'verified-HEAD','candidateHead':head,'candidateTree':expected_tree,'baseCommit':None,'baseTree':None}
else:
 assert a.official_tree and bool(a.official_commit)!=bool(a.composition_manifest),'provide official tree and either official commit or final composition manifest'
 raw=Path(a.official_tree).read_bytes();official=json.loads(raw);assert not official.get('truncated'),'truncated Git tree'
 leaves={safe_path(row['path']):{'mode':row['mode'],'sha':row['sha']} for row in official['tree'] if row['type']!='tree'}
 base_tree=tree_hash(leaves)
 if a.official_commit:
  receipt_raw=Path(a.official_commit).read_bytes();receipt=json.loads(receipt_raw);commit=receipt.get('commit',receipt)
  assert commit['tree']['sha']==base_tree,'official commit/tree mismatch'
  if a.expected_head:assert commit['sha']==a.expected_head,'unexpected official HEAD'
  origin={'mode':'verified-official-HEAD','candidateHead':commit['sha'],'candidateTree':base_tree,'baseCommit':None,'baseTree':None,'officialCommitReceiptSHA256':digest(receipt_raw)}
 else:
  manifest_raw=Path(a.composition_manifest).read_bytes();manifest=json.loads(manifest_raw)
  assert manifest['baseTree']==base_tree,'composition baseline tree mismatch'
  base_commit=manifest.get('baseCommit',manifest.get('base'));assert isinstance(base_commit,str) and len(base_commit)==40
  seen=set()
  for row in manifest['files']:
   path=safe_path(row['path']);assert path not in seen,'duplicate composition path';seen.add(path)
   if 'oldGitBlob' in row:assert row['oldGitBlob']==leaves.get(path,{}).get('sha'),'old source mismatch: '+path
   sha=row.get('gitBlob',row.get('sha'))
   if sha is None:
    assert row.get('delete') is True,'missing Git blob is not an implicit deletion'
    assert path in leaves,'delete missing file';del leaves[path]
   else:
    assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha),'invalid Git blob'
    leaves[path]={'mode':row.get('mode',leaves.get(path,{}).get('mode','100644')),'sha':sha}
  final_tree=tree_hash(leaves)
  if 'expectedTree' in manifest:assert final_tree==manifest['expectedTree'],'final composed tree mismatch'
  assert not a.expected_head,'planned composition has no verified HEAD; use official-commit or git-head after committing'
  origin={'mode':'prepared-composition-not-HEAD','candidateHead':None,'candidateTree':final_tree,'baseCommit':base_commit,'baseTree':base_tree,'compositionManifestSHA256':digest(manifest_raw),'compositionPaths':sorted(seen)}
 origin['officialTreeReceiptSHA256']=digest(raw)
# A COW projection may intentionally omit unused reports/binary assets. Every
# materialized tracked file must still be exact. Browser preflight additionally
# requires every manifest.files input to exist and match these anchored blobs.
verified=[];missing=[]
for path,row in sorted(leaves.items()):
 file=root/path
 if not file.is_file():missing.append(path);continue
 data=file.read_bytes();assert blob(data)==row['sha'],'source does not match final tree: '+path
 verified.append({'path':path,'gitBlob':row['sha'],'sha256':digest(data),'bytes':len(data)})
proof={**origin,'sourceRootAtGeneration':str(root),'verifiedMaterializedFiles':len(verified),'unmaterializedTrackedFiles':len(missing),'files':{path:row['sha'] for path,row in sorted(leaves.items())},'materialized':verified,'fullBrowserInputVerificationRequired':True}
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'proof':str(output),'sha256':digest(output.read_bytes()),'mode':proof['mode'],'candidateHead':proof['candidateHead'],'candidateTree':proof['candidateTree'],'verifiedMaterializedFiles':len(verified),'unmaterializedTrackedFiles':len(missing)},indent=2))
