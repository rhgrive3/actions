import json,pathlib,hashlib,shutil,os,datetime
import numpy as np
old=pathlib.Path('/workspace/actions/.codex-stage-sources/generated')
new=pathlib.Path('/workspace/stage-paint-coverage/.codex-stage-sources/generated')
backup=pathlib.Path('/workspace/actions/.ci-scratch/original-five-v3-mask-backup');backup.mkdir(exist_ok=True)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while data:=f.read(1<<20):h.update(data)
 return h.hexdigest()
new_files={p.relative_to(new) for p in new.rglob('*') if p.is_file()}
old_files={p.relative_to(old) for p in old.rglob('*') if p.is_file()}
assert old_files==new_files,{'onlyOld':[str(x) for x in old_files-new_files],'onlyNew':[str(x) for x in new_files-old_files]}
changed=[]
for rel in sorted(new_files):
 a,b=old/rel,new/rel
 if digest(a)==digest(b):continue
 assert rel.name in {'mask.bin','manifest.json','catalog.json','integrity.json'},str(rel)
 if rel.name=='mask.bin':
  av=np.fromfile(a,dtype=np.uint8);bv=np.fromfile(b,dtype=np.uint8);assert len(av)==len(bv) and not np.any((av!=0)&(bv==0))
 changed.append({'path':str(rel),'before':digest(a),'after':digest(b),'bytes':b.stat().st_size})
for row in changed:
 rel=pathlib.Path(row['path']);a,b=old/rel,new/rel;prior=backup/rel;prior.parent.mkdir(parents=True,exist_ok=True)
 if not prior.exists():shutil.copy2(a,prior)
 temp=a.with_name(a.name+'.v4-next');shutil.copy2(b,temp);os.replace(temp,a)
receipt={'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedFoundation':'18626f65c0b1bcf8341bb5fd17b2eecd70903167','changed':changed,'allOtherOriginalBuffersAndPngFilesExact':True,'oldChangedFilesPreserved':str(backup),'runtimeSourceRecipe':'v4'}
(backup/'migration.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
