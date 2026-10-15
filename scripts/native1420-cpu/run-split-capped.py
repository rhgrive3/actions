import pathlib,urllib.request,hashlib,json,subprocess,threading,time,gc
r=pathlib.Path('native1420-current-private');url='https://media.githubusercontent.com/media/kirakira-dev/KiTrix/0611f51b35c9736ee986fb2218461e2585b7875e/stages/Vss_Twist00/Vss_Twist00.obj';expected=49575330;sourcehash='8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9';CAP=3145728;FLOOR=2097152;TRANSFER=256*1024*1024
receipt={'executionEnvironment':'Hosted CPU-only Ubuntu runner; separate reviewed budget, not a local cap retry','sourceURL':url,'sourceBytes':expected,'sourceSHA256':sourcehash,'rssCapKiB':CAP,'minimumAvailableKiB':FLOOR,'heapMiB':2048,'transferCapBytes':TRANSFER,'status':'starting','phases':[]}
def save():(r/'split-memory-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
def avail():return next(int(x.split()[1]) for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
def phase(script,data,binary=False):
 assert avail()>=3072*1024,'insufficient initial reserve'
 result={'phase':script,'status':'running'};receipt['phases'].append(result);save();output=bytearray();errors=[];start=time.monotonic()
 with open(r/(script+'.stderr.log'),'wb') as err,open(r/(script+'.stdout.log'),'wb') as log:
  p=subprocess.Popen(['node','--max-old-space-size=2048','--max-semi-space-size=8','--experimental-vm-modules','--expose-gc',str(r/script)],stdin=subprocess.PIPE,stdout=subprocess.PIPE if binary else log,stderr=err)
  def feed():
   try:p.stdin.write(data);p.stdin.close()
   except Exception as e:errors.append(str(e))
  def read():
   try:
    while True:
     b=p.stdout.read(1024*1024)
     if not b:break
     if len(output)+len(b)>TRANSFER:errors.append('derived-transfer-cap');p.terminate();break
     output.extend(b)
   except Exception as e:errors.append(str(e))
  t=threading.Thread(target=feed);t.start();u=threading.Thread(target=read) if binary else None
  if u:u.start()
  peak=0;minimum=avail();aborted=None
  while p.poll() is None:
   try:rss=next(int(x.split()[1]) for x in pathlib.Path(f'/proc/{p.pid}/status').read_text().splitlines() if x.startswith('VmRSS:'))
   except (FileNotFoundError,StopIteration):rss=0
   free=avail();peak=max(peak,rss);minimum=min(minimum,free)
   if rss>CAP or free<FLOOR or time.monotonic()-start>600:
    aborted='rss-cap' if rss>CAP else 'system-reserve' if free<FLOOR else 'wall-cap';p.terminate()
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:p.kill();p.wait()
    break
   time.sleep(.05)
  t.join(5)
  if u:u.join(5)
  code=p.wait();result.update(status='aborted-'+aborted if aborted else 'completed' if code==0 and not errors else 'failed',exitCode=code,peakRSSKiB=peak,minimumAvailableKiB=minimum,elapsedSeconds=time.monotonic()-start,errors=errors,transferBytes=len(output));save()
  if result['status']!='completed':raise RuntimeError('phase failed: '+script)
 return output
try:
 assert avail()>=3072*1024
 data=bytearray();h=hashlib.sha256()
 with urllib.request.urlopen(url,timeout=30) as response:
  assert response.status==200 and int(response.headers['Content-Length'])==expected
  while True:
   b=response.read(1024*1024)
   if not b:break
   assert len(data)+len(b)<=expected and avail()>=FLOOR
   h.update(b);data.extend(b)
 assert len(data)==expected and h.hexdigest()==sourcehash;receipt['sourceVerified']=True;save()
 transfer=phase('convert-authentic-stream.mjs',data,True);del data;gc.collect();receipt['transferSHA256']=hashlib.sha256(transfer).hexdigest();save();phase('test-authentic-stream.mjs',transfer);receipt['status']='completed';save()
except Exception as e:receipt['status']='blocked';receipt['error']=repr(e);save();raise
