from pathlib import Path
import subprocess,os,json,hashlib,sys
repo=Path(sys.argv[1]).resolve();root=Path(sys.argv[2]).resolve();root.mkdir(exist_ok=True,parents=True)
base='2e2bc38661dd49655ee3b4abc491dcc8ee65e8e1'
def extract(text):
    lines=text.splitlines(keepends=True)
    start=lines.index('      - name: Verify emitted sub and special fidelity boundaries\n')+1
    assert lines[start]=='        run: |\n'
    body=[]
    for line in lines[start+1:]:
        if line.strip() and not line.startswith('          '):break
        body.append(line[10:] if line.startswith('          ') else line)
    return ''.join(body)
before=extract(subprocess.check_output(['git','show',base+':.github/workflows/validate-inkwave-update.yml'],cwd=repo,text=True))
after=extract((repo/'.github/workflows/validate-inkwave-update.yml').read_text())
assert before==after+'  _site-launch-packets.json\nretention-days: 14\n'
assert len(after.splitlines())==28
assert len([x for x in after.splitlines() if 'patches/' in x])==27
for name,text in [('before',before),('after',after)]:
    (root/(name+'.sh')).write_text(text)
    subprocess.run(['/bin/bash','-n',str(root/(name+'.sh'))],check=True)
fake=root/'fake-bin';fake.mkdir(exist_ok=True)
node=fake/'node';node.write_text('#!/bin/bash\nprintf "%s\\n" "$@" >> "$NODE_CALL_LOG"\nexit "${NODE_STUB_STATUS:-0}"\n');node.chmod(0o755)
observed=[]
for name,status,expected in [('before',0,127),('after',0,0),('after',73,73)]:
    log=root/(name+'-'+str(status)+'.argv');log.write_text('')
    env={**os.environ,'PATH':str(fake)+':'+os.environ['PATH'],'NODE_CALL_LOG':str(log),'NODE_STUB_STATUS':str(status)}
    p=subprocess.run(['/bin/bash','--noprofile','--norc','-e','-o','pipefail',str(root/(name+'.sh'))],env=env,cwd=root,capture_output=True,text=True)
    (root/(name+'-'+str(status)+'.stderr')).write_text(p.stderr)
    assert p.returncode==expected,(name,status,p.returncode,p.stderr)
    observed.append({'workflow':name,'stubExit':status,'shellExit':p.returncode,'stderr':p.stderr})
assert (root/'before-0.argv').read_bytes()==(root/'after-0.argv').read_bytes()==(root/'after-73.argv').read_bytes()
result={'status':'passed','base':base,'oldTailOnlyRemovedFromRun':True,'unchangedFidelitySuitePaths':27,'unchangedCommandLines':28,'oldShellExit':127,'repairedShellExit':0,'testFailurePropagates':73,'observed':observed,'actualEmittedCommandSha256':hashlib.sha256(after.encode()).hexdigest(),'scope':'Node stub checks shell shape and failure propagation; actual emitted replay is separately recorded.'}
(root/'comparison.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
