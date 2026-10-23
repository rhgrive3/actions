#!/usr/bin/env python3
"""Linux-only, per-process subreaper for the known local QA workload."""
import ctypes, errno, json, os, selectors, signal, subprocess, sys, time
# PR_SET_CHILD_SUBREAPER affects this supervisor's descendants, not the host.
if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0):
    raise OSError(ctypes.get_errno(), 'child subreaper unavailable')
if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
    raise RuntimeError('Linux pidfd APIs required for PID-reuse-safe cleanup')
ms, cap = int(sys.argv[1]), int(sys.argv[2]); command = sys.argv[3:]
me = os.getpid()
def descendants():
    parents = {}; starts = {}
    for name in os.listdir('/proc'):
        if name.isdigit():
            try:
                with open('/proc/'+name+'/stat') as f: fields=f.read().rsplit(')',1)[1].split()
                parents[int(name)] = int(fields[1]); starts[int(name)] = fields[19]
            except (FileNotFoundError, ProcessLookupError, PermissionError): pass
    owned={me}
    while True:
        more={pid for pid,parent in parents.items() if parent in owned}-owned
        if not more: return {pid:starts[pid] for pid in owned-{me}}
        owned.update(more)
def cleanup():
    deadline=time.monotonic()+3
    while time.monotonic()<deadline:
        owned=descendants()
        for pid,start in owned.items():
            fd=None
            try:
                fd=os.pidfd_open(pid)
                with open('/proc/'+str(pid)+'/stat') as f: current=f.read().rsplit(')',1)[1].split()[19]
                if current==start: signal.pidfd_send_signal(fd,signal.SIGKILL)
            except (ProcessLookupError,FileNotFoundError): pass
            finally:
                if fd is not None: os.close(fd)
        while True:
            try:
                pid,_=os.waitpid(-1,os.WNOHANG)
                if not pid: break
            except ChildProcessError: break
        if not descendants(): return True
        time.sleep(.02)
    return False
result={'timedOut':False,'overflow':False,'bytes':0}; chunks=[]; child=None
try:
    child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
    result['pid']=child.pid
    sel=selectors.DefaultSelector();sel.register(child.stdout,selectors.EVENT_READ)
    deadline=time.monotonic()+ms/1000
    while True:
        if time.monotonic()>=deadline: result['timedOut']=True;break
        for key,_ in sel.select(.02):
            b=os.read(key.fd,65536)
            if not b: sel.unregister(key.fileobj)
            else:
                result['bytes']+=len(b)
                if result['bytes']<=cap: chunks.append(b)
                else: result['overflow']=True
        if result['overflow']: break
        code=child.poll()
        if code is not None: result['code']=code if code>=0 else None;result['signal']=-code if code<0 else None;break
except Exception as e:
    result['error']=str(e)
finally:
    result['cleanupComplete']=cleanup()
if child and result['cleanupComplete']:
    while True:
        b=child.stdout.read(65536)
        if not b: break
        result['bytes']+=len(b)
        if result['bytes']<=cap: chunks.append(b)
        else: result['overflow']=True
result['output']=b''.join(chunks).decode('utf8','replace')
print(json.dumps(result))
