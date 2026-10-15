import json,os,pathlib,signal,subprocess,time
# Synthetic IndexedDB envelope: 2GiB summed RSS; require 4GiB available at start.
# Shared pages can be counted repeatedly. This is not a gameplay/performance gate.
# A single 120s supervised qualification budget; the job has a 30min hard timeout.
cap=2*1024**3;reserve=2*1024**3;deadline=120;peak=0;minimum=None;reason=None;peakProcesses=[]
def available():
    return int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
assert available()>=cap+reserve,'Insufficient starting memory and reserve'
p=subprocess.Popen(['bash',os.environ['PACKAGE']+'/run-hosted.sh'],start_new_session=True);start=time.monotonic()
while p.poll() is None:
    rss=0;processes={}
    for d in pathlib.Path('/proc').iterdir():
        if not d.name.isdigit():continue
        try:
            fields=(d/'stat').read_text().rsplit(')',1)[1].split()
            processes[int(d.name)]=(int(fields[1]),int(fields[21])*os.sysconf('SC_PAGE_SIZE'),int(fields[19]))
        except (OSError,ValueError,IndexError):pass
    descendants={p.pid}
    while True:
        expanded=descendants|{pid for pid,(parent,_,_) in processes.items() if parent in descendants}
        if expanded==descendants:break
        descendants=expanded
    rss=sum(processes[pid][1] for pid in descendants if pid in processes)
    if rss>peak:
        peak=rss;peakProcesses=[]
        for pid in sorted(descendants,key=lambda pid:processes.get(pid,(0,0))[1],reverse=True)[:20]:
            try:name=pathlib.Path('/proc',str(pid),'comm').read_text().strip()
            except OSError:name='exited'
            peakProcesses.append({'pid':pid,'name':name,'rssBytes':processes.get(pid,(0,0))[1]})
    free=available();minimum=free if minimum is None else min(minimum,free)
    if rss>cap:reason='process-tree RSS cap exceeded'
    elif free<reserve:reason='system memory reserve reached'
    elif time.monotonic()-start>deadline:reason='120s qualification timeout'
    if reason:
        identities={pid:processes[pid][2] for pid in descendants if pid in processes}
        def signal_same(pid,starttime,sig):
            try:
                current=(pathlib.Path('/proc')/str(pid)/'stat').read_text().rsplit(')',1)[1].split()
                if int(current[19])==starttime:os.kill(pid,sig)
            except (OSError,ValueError,IndexError):pass
        for pid,starttime in identities.items():signal_same(pid,starttime,signal.SIGTERM)
        try:p.wait(timeout=10)
        except subprocess.TimeoutExpired:pass
        finally:
            for pid,starttime in identities.items():signal_same(pid,starttime,signal.SIGKILL)
        p.wait()
        break
    time.sleep(.25)
e=pathlib.Path(os.environ['IDB_EVIDENCE']);e.mkdir(exist_ok=True)
(e/'resource-receipt.json').write_text(json.dumps({'exitCode':p.returncode,'reason':reason,'peakProcessTreeRSSBytes':peak,'peakProcesses':peakProcesses,'accounting':'Sum of descendant RSS; shared physical pages may be counted more than once','minimumSystemAvailableBytes':minimum,'rssCapBytes':cap,'reserveBytes':reserve,'deadlineSeconds':deadline,'elapsedSeconds':time.monotonic()-start,'scope':'Synthetic real IndexedDB; no hardware/RSS reduction or crash-cause claim'},indent=2)+'\n')
assert p.returncode==0 and reason is None,'IDB qualification failed; preserve compact evidence'
