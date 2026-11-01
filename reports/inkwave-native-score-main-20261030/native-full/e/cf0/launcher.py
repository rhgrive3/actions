import datetime, hashlib, json, os, pathlib, subprocess, sys, traceback
root=pathlib.Path('/workspace/actions-battle-benchmark')
evidence=pathlib.Path(__file__).resolve().parent
plan=json.loads((evidence/'full-plan.json').read_text())
run=plan['runs'][0]
def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(name,data):
    target=evidence/name
    tmp=target.with_suffix(target.suffix+'.tmp')
    tmp.write_text(json.dumps(data,indent=2)+'\n')
    tmp.replace(target)
state={'startedAt':stamp(),'wrapperPid':os.getpid(),'sessionId':os.getsid(0),'cwd':str(root),'args':run['args'],'environment':plan['environment'],'status':'launching','detachment':'Python subprocess start_new_session=True; benchmark child inherits detached session.'}
write('process.json',state)
try:
    env=os.environ.copy(); env.update(plan['environment'])
    child=subprocess.Popen(run['args'],cwd=root,env=env,stdin=subprocess.DEVNULL)
    state.update({'nodePid':child.pid,'status':'running'}); write('process.json',state)
    code=child.wait()
    state.update({'status':'exited','exitCode':code,'completedAt':stamp()})
    result=evidence/'result.json'
    if result.exists():
        data=result.read_bytes(); parsed=json.loads(data)
        state.update({'resultSha256':hashlib.sha256(data).hexdigest(),'resultStatus':parsed.get('status'),'savedWindows':{k:len(parsed[k]) for k in ['warmups','preflight','measurements','parityPairs','rejectedWindowAttempts']}})
    write('exit.json',state); write('process.json',state)
    sys.exit(code if code>=0 else 128-code)
except BaseException as error:
    if isinstance(error,SystemExit): raise
    state.update({'status':'launcher-error','completedAt':stamp(),'error':traceback.format_exc()})
    write('exit.json',state); write('process.json',state); raise
