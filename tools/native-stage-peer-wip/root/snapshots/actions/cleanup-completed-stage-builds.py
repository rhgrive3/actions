import os,json,pathlib,subprocess,shutil,datetime
base=pathlib.Path('/workspace/actions/.ci-scratch/completed-build-receipts');base.mkdir(exist_ok=True)
anc=set();pid=os.getpid()
while pid and pid not in anc:
 anc.add(pid)
 try:pid=int(pathlib.Path(f'/proc/{pid}/stat').read_text().split(') ')[1].split()[1])
 except (FileNotFoundError,IndexError):break
removed=[]
for stage in ['sturgeon','umami']:
 owner=pathlib.Path('/workspace/stage-worktrees')/stage
 for p in owner.iterdir():
  if not p.name.startswith('_site') or not (p/'inkwave-build.json').is_file():continue
  assert p.is_dir() and not p.is_symlink() and p.resolve().parent==owner.resolve()
  assert subprocess.run(['git','-C',str(owner),'check-ignore','--quiet',p.name]).returncode==0
  assert not subprocess.check_output(['git','-C',str(owner),'ls-files','--',p.name])
  live=[]
  for process in pathlib.Path('/proc').iterdir():
   if not process.name.isdigit() or int(process.name) in anc:continue
   try:
    cwd=os.readlink(process/'cwd');cmd=(process/'cmdline').read_bytes().decode(errors='replace')
    if cwd==str(p) or cwd.startswith(str(p)+'/') or str(p) in cmd or cwd.startswith(str(owner)) and p.name in cmd:live.append(process.name)
   except (FileNotFoundError,PermissionError,ProcessLookupError):pass
  if live:
   print(json.dumps({'skippedLive':str(p),'pids':live}));continue
  receipt={'path':str(p),'removedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rebuildableCompletedOwner':True,'files':{}}
  for rel in ['inkwave-build.json','patches/native-stages/runtime/build-config.mjs','native-stages/catalog.json']:
   f=p/rel
   if f.is_file():receipt['files'][rel]=f.read_text()
  (base/(stage+'___'+p.name+'.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
  shutil.rmtree(p);removed.append(str(p))
(base/'cleanup-2026-10-13-completed-sturgeon-umami.json').write_text(json.dumps({'removed':removed,'sourceAndEvidencePreserved':True},indent=2)+'\n')
print(json.dumps({'removedCompletedBuilds':removed,'sourceAndEvidencePreserved':True}))
