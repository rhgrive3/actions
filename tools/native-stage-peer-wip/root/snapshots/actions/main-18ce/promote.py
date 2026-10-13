import pathlib,subprocess,json
head='155ff53e';report='reports/inkwave-splatoon3-behavior-2026-10-02.md';receipts=[]
def run(root,args):return subprocess.run(['git',*args],cwd=root,text=True,capture_output=True)
for root,branch in [('/workspace/actions','codex/native-stage-expansion'),('/workspace/stage-review','codex/native-stage-reviewed')]:
 st=run(root,['status','--porcelain']);assert not st.stdout,st.stdout
 before=run(root,['rev-parse','HEAD']).stdout.strip();merge=run(root,['merge','--no-ff','-m','Integrate independently accepted main 18ce source compatibility',head])
 if merge.returncode:
  conflicts=run(root,['diff','--name-only','--diff-filter=U']).stdout.splitlines();assert conflicts==[report],(conflicts,merge.stdout,merge.stderr)
  p=pathlib.Path(root)/report;s=p.read_text()
  while '<<<<<<< HEAD\n' in s:
   a=s.index('<<<<<<< HEAD\n');m=s.index('=======\n',a);e=s.index('>>>>>>> ',m);end=s.index('\n',e)+1
   s=s[:a]+s[a+len('<<<<<<< HEAD\n'):m]+'\n'+s[m+len('=======\n'):e]+s[end:]
  p.write_text(s);assert run(root,['add',report]).returncode==0;assert run(root,['commit','--no-edit']).returncode==0
 assert run(root,['diff','--check']).returncode==0
 push=run(root,['-c','credential.helper=!gh auth git-credential','push','origin',branch]);assert push.returncode==0,push.stderr
 after=run(root,['rev-parse','HEAD']).stdout.strip();assert not run(root,['status','--porcelain']).stdout
 receipts.append({'root':root,'branch':branch,'before':before,'after':after,'consumedMain':'18ce7b6c8b4c612f289787332b6be65862f34bea','candidate':'155ff53e','mergeOutput':merge.stdout.strip()[:1000],'mainIntoMerge':False});print(json.dumps(receipts[-1]))
pathlib.Path('/workspace/actions/.ci-scratch/main-18ce/promotion.json').write_text(json.dumps(receipts,indent=2)+'\n')
