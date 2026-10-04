#!/usr/bin/env python3
"""Native Chromium startup / HTTP cache / SW / offline / deployment benchmark.
Run outside restricted browser-policy environments; this tool NEVER alters policy.
Requires Python Playwright, Chromium with WebGL, and openssl for a local TLS cert.
Example:
  python scripts/benchmark-inkwave-startup.py --before /path/baseline --after /path/candidate --runs 3 --profiles desktop,4g,slow --battle --out reports/loading-cache/native
No request interception, storage mocking, skipWaiting injection, or automatic reload is used.
The local server is HTTP/1.1 with explicitly recorded cache headers, not GitHub Pages.
"""
import argparse
import asyncio
import gzip
import hashlib
import json
import mimetypes
import os
import re
import ssl
import statistics
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PROFILES = {
    'desktop': dict(latency=0, downloadThroughput=-1, uploadThroughput=-1, cpu=1),
    '4g': dict(latency=100, downloadThroughput=4_000_000/8, uploadThroughput=1_000_000/8, cpu=4),
    'slow': dict(latency=180, downloadThroughput=1_600_000/8, uploadThroughput=750_000/8, cpu=6),
}
INIT = r"""(() => {
 const p=window.__iwProbe={marks:{},longTasks:[],errors:[]};
 const mark=n=>{if(!(n in p.marks))p.marks[n]=performance.now()};
 try{const o=new PerformanceObserver(l=>{for(const e of l.getEntries())if(p.longTasks.length<512)p.longTasks.push({startTime:e.startTime,duration:e.duration})});o.observe({type:'longtask',buffered:true});}catch{}
 document.addEventListener('DOMContentLoaded',()=>mark('DOMContentLoaded'));
 addEventListener('error',e=>p.errors.push(e.message));addEventListener('unhandledrejection',e=>p.errors.push(String(e.reason)));
 const observer=new MutationObserver(()=>{const ui=document.querySelector('.iw-ui');if(!ui?.dataset.screen)return;mark('loadingDOM');if(['title','main'].includes(ui.dataset.screen)){mark('menuDOM');requestAnimationFrame(()=>mark('menuFrameProxy'));}});
 observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-screen']});
 let game;Object.defineProperty(window,'__inkwave',{configurable:true,get:()=>game,set:v=>{game=v;mark('engineReady');}});
})();"""
SNAPSHOT = r"""async () => {
 const memoryBefore=performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null;
 const resourcesBefore=performance.getEntriesByType('resource').map(e=>e.toJSON());
 performance.mark('benchmark:storage-diagnostic-start');
 const cache=[];try{for(const name of await caches.keys()){let bytes=0,count=0;const c=await caches.open(name);for(const req of await c.keys()){const r=await c.match(req);bytes+=(await r.arrayBuffer()).byteLength;count++;}cache.push({name,count,bodyBytes:bytes});}}catch(error){cache.push({error:String(error)});}
 let storage=null;try{storage=await navigator.storage?.estimate();}catch{}
 performance.mark('benchmark:storage-diagnostic-end');
 return {probe:window.__iwProbe,profile:window.__inkwaveStartup?.snapshot?.()||null,
 resources:resourcesBefore,navigation:performance.getEntriesByType('navigation')[0]?.toJSON()||null,
 paints:performance.getEntriesByType('paint').map(e=>e.toJSON()),bootMs:window.__inkwave?.bootMs??null,bootMarks:window.__inkwave?.bootMarks||null,
 texlib:window.__inkwave?.texlib?.stats||null,mode:window.__G?.mode??null,menu:document.querySelector('.iw-ui')?.dataset.screen||null,
 baseURI:document.baseURI,cache,storage,controller:!!navigator.serviceWorker?.controller,
 memory:memoryBefore,
 displayModeStandalone:matchMedia('(display-mode: standalone)').matches};
}"""


def atomic_json(file: Path, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_suffix(file.suffix + '.writing')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(file)


def verify_site(root: Path):
    identity = json.loads((root/'inkwave-build.json').read_text())
    # Use the same compact JSON serialization as the builder for artifact contentHash.
    serialized = json.dumps(identity['artifacts'], separators=(',', ':'), ensure_ascii=False).encode()
    if hashlib.sha256(serialized).hexdigest() != identity['contentHash']:
        raise ValueError('Artifact identity mismatch: '+str(root))
    for name, expected in identity['artifacts'].items():
        file = (root/name).resolve()
        if root not in file.parents or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise ValueError('Artifact mismatch: '+name)
    return identity


class Host:
    def __init__(self, root: Path, age: int):
        self.root = root; self.age = age; self.receipts = []
    def payload(self, url: str, accepts_gzip: bool):
        pathname = unquote(urlsplit(url).path)
        if pathname=='/__benchmark__/blank.html':
            return 200, {'Content-Type':'text/html','Cache-Control':'no-store'}, b'<!doctype html><title>Benchmark activation observer</title>'
        if not pathname.startswith('/actions/'):
            return 404, {}, b'Not found'
        rel = pathname[len('/actions/'):] or 'index.html'
        base = self.root
        file = (base/rel).resolve()
        if base not in file.parents or not file.is_file():
            return 404, {}, b'Not found'
        data = file.read_bytes()
        etag = '"'+hashlib.sha256(data).hexdigest()+'"'
        mime = {'.mjs':'text/javascript','.js':'text/javascript','.webmanifest':'application/manifest+json'}.get(file.suffix) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        headers = {'Content-Type': mime, 'ETag': etag, 'Cache-Control': f'public,max-age={self.age}' if rel.startswith('_versions/') else 'no-cache', 'Vary':'Accept-Encoding'}
        if accepts_gzip and (mime.startswith('text/') or mime in ['application/json','application/javascript','application/manifest+json','image/svg+xml']):
            data = gzip.compress(data, compresslevel=6, mtime=0); headers['Content-Encoding']='gzip'
        return 200, headers, data
    def handler(self):
        host = self
        class Handler(BaseHTTPRequestHandler):
            protocol_version='HTTP/1.1'
            def do_GET(self):
                status, headers, body = host.payload(self.path, 'gzip' in self.headers.get('Accept-Encoding',''))
                if status == 200 and self.headers.get('If-None-Match') == headers.get('ETag'):
                    status=304; body=b''
                host.receipts.append({'time':time.monotonic(),'path':self.path,'status':status,'encodedBodyBytes':len(body)})
                self.send_response(status)
                for key,value in headers.items():self.send_header(key,value)
                self.send_header('Content-Length',str(len(body)));self.end_headers()
                try:self.wfile.write(body)
                except (BrokenPipeError,ConnectionResetError):pass
            def log_message(self,*_):pass
        return Handler


async def wait_menu(page, timeout):
    await page.wait_for_function("['title','main'].includes(document.querySelector('.iw-ui')?.dataset.screen) || !!document.getElementById('boot-error')?.textContent", timeout=timeout)
    if await page.evaluate("!!document.getElementById('boot-error')?.textContent"):
        raise RuntimeError(await page.locator('#boot-error').inner_text())
    await page.wait_for_function('!!window.__inkwave',timeout=timeout)
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


async def install_worker(page, address, timeout):
    # Explicitly trigger registration for comparable installed-worker scenarios.
    # This is documented harness setup, not an alteration of the worker lifecycle.
    await page.evaluate("async address=>{await navigator.serviceWorker.register(new URL('sw.js',address),{scope:new URL(address).pathname,updateViaCache:'none'});await navigator.serviceWorker.ready;}",address)
    await page.wait_for_function('!!navigator.serviceWorker.controller',timeout=timeout)
    # Prime one controlled load on BOTH implementations; old install caches only HTML.
    await page.reload(wait_until='domcontentloaded',timeout=timeout)
    await wait_menu(page,timeout)
    await page.wait_for_timeout(250)  # setup only; not a measured startup delay


async def capture(page, context, host, address, mode, settings, args, label):
    cdp = await context.new_cdp_session(page)
    await cdp.send('Network.enable'); await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate',{'rate':settings['cpu']})
    await cdp.send('Network.emulateNetworkConditions',{'offline':mode=='offline',**{k:v for k,v in settings.items() if k!='cpu'}})
    net = {}; errors = []
    def requested(e):
        net[e['requestId']]={'url':e['request']['url'],'method':e['request']['method'],'start':e['timestamp'],'initiator':e.get('initiator'),'type':e.get('type')}
    def response(e):
        row=net.setdefault(e['requestId'],{}); r=e['response'];row.update(status=r['status'],fromDiskCache=r.get('fromDiskCache',False),fromServiceWorker=r.get('fromServiceWorker',False),responseTime=e['timestamp'],mimeType=r.get('mimeType'))
    def finished(e):net.setdefault(e['requestId'],{}).update(end=e['timestamp'],encodedDataLength=e['encodedDataLength'])
    cdp.on('Network.requestWillBeSent',requested);cdp.on('Network.responseReceived',response);cdp.on('Network.loadingFinished',finished)
    cdp.on('Network.requestServedFromCache',lambda e:net.setdefault(e['requestId'],{}).update(servedFromCache=True))
    cdp.on('Network.loadingFailed',lambda e:net.setdefault(e['requestId'],{}).update(error=e.get('errorText'),canceled=e.get('canceled',False)))
    page.on('pageerror',lambda e:errors.append(str(e)))
    receipts_start=len(host.receipts);result={'scenario':mode,'label':label,'status':'failed'};trace_events=[]
    trace_started=False
    try:
        if args.trace:
            cdp.on('Tracing.dataCollected',lambda e:trace_events.extend(e['value']))
            await cdp.send('Tracing.start',{'categories':'devtools.timeline,v8,v8.execute,disabled-by-default-v8.compile,blink.user_timing','transferMode':'ReportEvents'})
            trace_started=True
        if mode in ('reload','sw-warm','offline'):
            await page.reload(wait_until='domcontentloaded',timeout=args.timeout)
        elif mode=='hard-reload':
            async with page.expect_navigation(wait_until='domcontentloaded',timeout=args.timeout):
                await cdp.send('Page.reload',{'ignoreCache':True})
        else:
            await page.goto(address+('?startupProfile' if args.startup_profile else ''),wait_until='domcontentloaded',timeout=args.timeout)
        await wait_menu(page,args.timeout)
        result['performanceAtMenu']=(await cdp.send('Performance.getMetrics'))['metrics']
        result['menuNetworkRequestCountBeforeDiagnostics']=len(net)
        result['menuCapture']=await page.evaluate(SNAPSHOT)
        if args.battle:
            await page.evaluate("async()=>{await __inkwave.startMatch({mapId:__inkwave.mapDef?.id||'tidewater',difficulty:'easy',duration:180,mode:'turf'});}")
            await page.wait_for_function("__G?.mode==='match' && __inkwave?.match && !__inkwave.match.attract",timeout=args.timeout)
            result['performanceAtBattle']=(await cdp.send('Performance.getMetrics'))['metrics']
            result['battleCapture']=await page.evaluate(SNAPSHOT)
        result['status']='passed'
    except Exception as error:
        result['error']=str(error)
        if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error): result['status']='blocked-policy'
        try:result['failureCapture']=await page.evaluate(SNAPSHOT)
        except Exception:pass
    finally:
        if trace_started:
            done=asyncio.get_running_loop().create_future()
            cdp.on('Tracing.tracingComplete',lambda _:done.set_result(True) if not done.done() else None)
            await cdp.send('Tracing.end')
            try:await asyncio.wait_for(done,10)
            except asyncio.TimeoutError:result['traceIncomplete']=True
            atomic_json(Path(args.out)/(label+'-trace.json'),{'traceEvents':trace_events})
        # Body-reading Cache Storage diagnostics above happen AFTER readiness metrics.
        result['requests']=list(net.values());result['serverReceipts']=host.receipts[receipts_start:];result['pageErrors']=errors
        result['networkSummary']={'pageRequestCount':len(net),'httpCacheResponses':sum(bool(v.get('fromDiskCache') or v.get('servedFromCache')) for v in net.values()),'swResponses':sum(bool(v.get('fromServiceWorker')) for v in net.values()),'pageCDPEncodedDataLength':sum(v.get('encodedDataLength',0) for v in net.values()),'serverEncodedBodyBytes':sum(v['encodedBodyBytes'] for v in result['serverReceipts'])}
        result['networkCaveat']='Page CDP excludes worker-internal fetches; server receipts include them. Server body bytes exclude HTTP/TLS overhead. CDP throttle may not cover SW-internal fetches; use OS shaping for worker-wide 4G comparisons.'
        await cdp.detach()
    return result


async def execute(args):
    from playwright.async_api import async_playwright
    before=Path(args.before).resolve();after=Path(args.after).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    identities={'before':verify_site(before),'after':verify_site(after)}
    result={'schema':1,'status':'running','metadata':{'runs':args.runs,'profiles':args.profiles,'server':'local HTTPS HTTP/1.1, gzip6; not production Pages','assetMaxAgeSeconds':args.asset_max_age,'rootPolicy':'no-cache','browserChannel':args.chromium,'standalone':'not emulated; physical installed PWA requires separate device validation','cpu':'CDP slowdown, not a real mobile device','quality':args.quality,'startupProfileEnabled':args.startup_profile,'beforeContentHash':identities['before']['contentHash'],'afterContentHash':identities['after']['contentHash']},'samples':[]}
    with tempfile.TemporaryDirectory(prefix='inkwave-native-',dir=out) as temp:
        temp=Path(temp);cert=temp/'cert.pem';key=temp/'key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        host=Host(before,args.asset_max_age);server=ThreadingHTTPServer(('127.0.0.1',0),host.handler());tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(cert,key);server.socket=tls.wrap_socket(server.socket,server_side=True)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();address=f'https://localhost:{server.server_address[1]}/actions/'
        try:
            async with async_playwright() as p:
                browser=await p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
                result['metadata']['browserVersion']=browser.version
                async def context(block=False):
                    ctx=await browser.new_context(ignore_https_errors=True,viewport={'width':1024,'height':768},service_workers='block' if block else 'allow')
                    await ctx.add_init_script(INIT)
                    await ctx.add_init_script("localStorage.setItem('inkwave.settings',JSON.stringify({quality:"+json.dumps(args.quality)+",shadows:false,bloom:false}));")
                    return ctx
                try:
                    for profile in args.profiles.split(','):
                        settings=PROFILES[profile]
                        for i in range(args.runs):
                            for name,root in [('before',before),('after',after)]:
                                host.root=root
                                # Cold/reload/hard-reload share a context but have no Service Worker.
                                ctx=await context(True)
                                try:
                                    page=await ctx.new_page()
                                    for mode in ['cold','reload','hard-reload']:
                                        label=f'{name}-{profile}-{i+1}-{mode}';sample=await capture(page,ctx,host,address,mode,settings,args,label);result['samples'].append(sample);atomic_json(out/'results.json',result)
                                        if sample['status']=='blocked-policy':raise RuntimeError('ERR_BLOCKED_BY_ADMINISTRATOR: benchmark stopped; no policy modified')
                                        if sample['status']!='passed':break
                                finally:await ctx.close()
                                ctx=await context()
                                try:
                                    page=await ctx.new_page();await page.goto(address,wait_until='domcontentloaded',timeout=args.timeout);await wait_menu(page,args.timeout);await install_worker(page,address,args.timeout)
                                    label=f'{name}-{profile}-{i+1}-sw-warm';result['samples'].append(await capture(page,ctx,host,address,'sw-warm',settings,args,label))
                                    await ctx.set_offline(True)
                                    label=f'{name}-{profile}-{i+1}-offline';result['samples'].append(await capture(page,ctx,host,address,'offline',settings,args,label))
                                    await ctx.set_offline(False)
                                except Exception as error:result['samples'].append({'label':f'{name}-{profile}-{i+1}-install','status':'failed','error':str(error)})
                                finally:await ctx.close()
                            # Old worker + new root, then natural activation after closing controlled pages.
                            host.root=before;ctx=await context()
                            try:
                                page=await ctx.new_page();await page.goto(address,wait_until='domcontentloaded',timeout=args.timeout);await wait_menu(page,args.timeout);await install_worker(page,address,args.timeout)
                                host.root=after
                                result['samples'].append(await capture(page,ctx,host,address,'new-version-old-controller',settings,args,f'update-{profile}-{i+1}-old-controller'))
                                await page.evaluate("async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}")
                                # Waiting is permitted only while the old page remains. No skipWaiting.
                                await page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)",timeout=args.timeout)
                                observer=await ctx.new_page()
                                await observer.goto(address.replace('/actions/','/__benchmark__/blank.html'),wait_until='domcontentloaded',timeout=args.timeout)
                                await page.close()
                                # The observer is OUTSIDE the app's scope and cannot keep the old worker alive.
                                await observer.wait_for_function("""async expected => {
                                  const r=await navigator.serviceWorker.getRegistration('/actions/');if(r?.active?.state!=='activated')return false;
                                  return new Promise(resolve=>{const c=new MessageChannel();const done=value=>{clearTimeout(t);c.port1.close();c.port2.close();resolve(value)};const t=setTimeout(()=>done(false),1500);c.port1.onmessage=e=>done(e.data?.revision===expected&&e.data?.offlineReady===true);r.active.postMessage({type:'INKWAVE_CACHE_STATUS'},[c.port2]);});
                                }""",arg=identities['after']['build']['revision'],timeout=args.timeout)
                                await observer.close()
                                page=await ctx.new_page()
                                result['samples'].append(await capture(page,ctx,host,address,'new-version-after-clients-close',settings,args,f'update-{profile}-{i+1}-new-controller'))
                            except Exception as error:result['samples'].append({'label':f'update-{profile}-{i+1}','status':'failed','error':str(error)})
                            finally:await ctx.close()
                            atomic_json(out/'results.json',result)
                finally:await browser.close()
        except Exception as error:
            result['error']=str(error);result['status']='blocked-policy' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error) else 'failed'
        finally:
            server.shutdown();server.server_close();thread.join(timeout=5)
    if result['status']=='running':result['status']='passed' if all(s['status']=='passed' for s in result['samples']) else 'failed'
    # Never turn a blocked/failed sample into a numeric zero.
    groups={}
    for sample in result['samples']:
        if sample['status']!='passed':continue
        cap=sample.get('menuCapture',{});m=cap.get('profile',{});m=m.get('marks',{}) if m else {}
        value=m.get('menu-interactive') or cap.get('probe',{}).get('marks',{}).get('menuFrameProxy')
        if value is not None:groups.setdefault(re.sub(r'-\d+-','-N-',sample['label']),[]).append(value)
    result['menuMediansMs']={k:statistics.median(v) for k,v in groups.items()}
    atomic_json(out/'results.json',result);print(json.dumps({'status':result['status'],'samples':len(result['samples']),'error':result.get('error'),'output':str(out/'results.json')},indent=2))
    return 0 if result['status']=='passed' else 2


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--before',required=True);p.add_argument('--after',required=True);p.add_argument('--out',default='reports/loading-cache/native')
    p.add_argument('--runs',type=int,default=3);p.add_argument('--profiles',default='desktop');p.add_argument('--chromium',default='/usr/bin/chromium')
    p.add_argument('--timeout',type=int,default=180000);p.add_argument('--asset-max-age',type=int,default=600);p.add_argument('--quality',choices=['low','medium','high'],default='low')
    p.add_argument('--battle',action='store_true');p.add_argument('--trace',action='store_true');p.add_argument('--startup-profile',action='store_true',help='Enable extra candidate phase profiler (diagnostic, not default timing run)')
    args=p.parse_args()
    if args.runs<3 or args.runs>20:p.error('--runs must be 3..20')
    if any(x not in PROFILES for x in args.profiles.split(',')):p.error('unknown profile')
    raise SystemExit(asyncio.run(execute(args)))
