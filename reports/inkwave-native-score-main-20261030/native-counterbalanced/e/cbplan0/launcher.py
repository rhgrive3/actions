#!/usr/bin/env python3
"""One detached, locked benchmark session; every attempt has a fresh folder."""
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import traceback

P = pathlib.Path(__file__).resolve().parent
plan = json.loads((P/'plan.json').read_text())
name = sys.argv[1]
run = next(run for run in plan['runs'] if run['name'] == name)
evidence = pathlib.Path(run['evidence'])
evidence.mkdir(parents=True, exist_ok=True)
assert not (evidence/'process.json').exists(), 'retain previous attempt; use a fresh evidence directory'
assert not (evidence/'result.json').exists(), 'retain previous result'
lock = (P/'benchmark.lock').open('a')

def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(name, data):
    target = evidence/name
    tmp = target.with_suffix(target.suffix+'.tmp')
    tmp.write_text(json.dumps(data, indent=2)+'\n')
    tmp.replace(target)

state = dict(startedAt=stamp(), wrapperPid=os.getpid(), sessionId=os.getsid(0), cwd=plan['cwd'],
             name=name, args=run['args'], environment=plan['environment'], status='prelaunch',
             planSha256=hashlib.sha256((P/'plan.json').read_bytes()).hexdigest(),
             detachment='subprocess start_new_session=True; child inherits detached launcher session')
write('process.json',state)
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    for pid_dir in pathlib.Path('/proc').iterdir():
        if not pid_dir.name.isdigit(): continue
        try: args = (pid_dir/'cmdline').read_bytes().split(b'\0')
        except (OSError, PermissionError): continue
        if any(arg.decode(errors='replace').endswith('/'+entry) or arg.decode(errors='replace') == entry
               for arg in args for entry in plan['exclusiveEntrypoints']):
            raise RuntimeError('Another benchmark is running: PID '+pid_dir.name)
    for prerequisite in run['requires']:
        prior = next(item for item in plan['runs'] if item['name'] == prerequisite)
        prior_dir = pathlib.Path(prior['evidence'])
        exit_record = json.loads((prior_dir/'exit.json').read_text())
        result = (prior_dir/'result.json').read_bytes()
        assert exit_record['exitCode'] == 0 and exit_record['resultStatus'] == 'passed', prerequisite
        assert hashlib.sha256(result).hexdigest() == exit_record['resultSha256'], prerequisite
        assert json.loads(result)['status'] == 'passed', prerequisite
    for relative, expected in plan['harness'].items():
        actual = hashlib.sha256((pathlib.Path(plan['cwd'])/'scripts'/relative).read_bytes()).hexdigest()
        assert actual == expected, 'Harness changed after plan: '+relative
    env = os.environ.copy()
    env.update(plan['environment'])
    child = subprocess.Popen(run['args'], cwd=plan['cwd'], env=env, stdin=subprocess.DEVNULL)
    state.update(nodePid=child.pid, status='running')
    write('process.json',state)
    code = child.wait()
    state.update(status='exited', exitCode=code, completedAt=stamp())
    result = evidence/'result.json'
    if result.exists():
        data = result.read_bytes()
        parsed = json.loads(data)
        state.update(resultSha256=hashlib.sha256(data).hexdigest(), resultStatus=parsed.get('status'),
                     savedWindows={key:len(parsed[key]) for key in ('warmups','preflight','measurements','parityPairs','rejectedWindowAttempts')})
    write('exit.json',state)
    write('process.json',state)
    sys.exit(code if code >= 0 else 128-code)
except BaseException as error:
    if isinstance(error,SystemExit): raise
    state.update(status='launcher-error', completedAt=stamp(), error=traceback.format_exc())
    write('exit.json',state)
    write('process.json',state)
    raise
