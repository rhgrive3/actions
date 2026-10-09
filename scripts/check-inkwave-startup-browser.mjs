#!/usr/bin/env node
// Real-browser startup/cache acceptance for the built INKWAVE site.
// Measures browser wall-clock startup marks and native Cache Storage behavior.
// It does NOT emulate installed standalone display mode or physical-device GPU/flash latency.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const arg=(name,fallback=null)=>{
  const i=process.argv.indexOf(name);
  return i>=0 ? process.argv[i+1] : fallback;
};
const site=fs.realpathSync(path.resolve(arg('--site')));
const evidence=path.resolve(arg('--evidence-dir'));
const profileRoot=path.resolve(arg('--profile-dir'));
const sourceSha=arg('--source-sha',process.env.SOURCE_SHA||'');
const runs=Number(arg('--runs','3'));
const timeout=Number(arg('--timeout','420000'));
if(!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Full --source-sha is required');
if(!Number.isInteger(runs)||runs<3||runs>10) throw new Error('--runs must be 3..10');

const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
for(const dir of [evidence,profileRoot]){
  const p=physical(dir);
  if(['/tmp','/var/tmp','/dev/shm'].some(root=>p===root||p.startsWith(root+'/'))) throw new Error('Use workspace-owned persistent storage: '+p);
  fs.mkdirSync(dir,{recursive:true});
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash) throw new Error('Build identity mismatch');
for(const [file,expected] of Object.entries(manifest.artifacts)){
  const full=fs.realpathSync(path.join(site,file));
  if(!full.startsWith(site+path.sep)||hash(fs.readFileSync(full))!==expected) throw new Error('Artifact mismatch: '+file);
}
if(!Object.keys(manifest.files||{}).some(k=>k.startsWith('loading-cache/'))) throw new Error('Build does not contain loading-cache inputs');
const revision=manifest.build?.revision;
if(!/^[a-f0-9]{64}$/.test(revision||'')) throw new Error('Missing immutable revision');

const receipts=[];
let forceNetworkFailure=false;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  if(forceNetworkFailure){
    receipts.push({path:req.url,status:'dropped',bodyBytes:0,immutable:false,time:Date.now()});
    req.socket.destroy();
    return;
  }
  try{
    const url=new URL(req.url,'http://localhost');
    const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const full=path.resolve(site,rel);
    if(!full.startsWith(site+path.sep)||!fs.statSync(full).isFile()) throw new Error('not found');
    const raw=fs.readFileSync(full),etag='"'+hash(raw)+'"';
    const immutable=rel.startsWith('_versions/'+revision+'/');
    const headers={'content-type':mime[path.extname(full)]||'application/octet-stream','cache-control':immutable?'public,max-age=600,immutable':'no-cache','etag':etag,'content-length':String(raw.length)};
    if(req.headers['if-none-match']===etag){
      receipts.push({path:url.pathname,status:304,bodyBytes:0,immutable,time:Date.now()});
      res.writeHead(304,{'cache-control':headers['cache-control'],'etag':etag});res.end();return;
    }
    receipts.push({path:url.pathname,status:200,bodyBytes:raw.length,immutable,time:Date.now()});
    res.writeHead(200,headers);res.end(raw);
  }catch{
    receipts.push({path:req.url,status:404,bodyBytes:0,immutable:false,time:Date.now()});
    res.writeHead(404,{'cache-control':'no-store'});res.end('Not found');
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/';

const pwPath=process.env.PLAYWRIGHT_MODULE;
const pw=await import(pwPath?pathToFileURL(pwPath).href:'playwright');
const launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const init=quality=>localStorage.setItem('inkwave.settings',JSON.stringify({quality,shadows:false,bloom:false,frameRate:60}));
const median=values=>{
  const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
};
const result={
  schema:1,status:'running',sourceSha,contentHash:manifest.contentHash,revision,
  measurementKind:'native headless Chromium wall-clock + Performance API + native Service Worker/Cache Storage; local HTTP cache headers approximate deployment policy, not physical-device timing',
  environment:{runs,standaloneDisplayModeEmulated:false,quality:'low',server:'localhost HTTP/1.1',assetMaxAgeSeconds:600},
  samples:[],cacheSnapshots:[],errors:[],limitations:[
    'Headless CI Chromium/SwiftShader is not an end-user phone or hardware GPU benchmark.',
    'display-mode: standalone is not emulated; installed iOS/Android PWA launch must be accepted on device.',
    'Local server byte counts exclude TLS/HTTP overhead and are not GitHub Pages transfer measurements.'
  ]
};

const attachErrors=page=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  page.on('console',m=>{if(m.type()==='error'&&/boot|uncaught|unhandled/i.test(m.text())) errors.push('console: '+m.text().slice(0,300));});
  return errors;
};
const cacheSnapshot=async(page,label)=>{
  const snap=await page.evaluate(async()=>{
    const cachesOut=[];
    for(const name of await caches.keys()){
      const cache=await caches.open(name);let bodyBytes=0;
      const keys=await cache.keys();
      for(const request of keys){
        const response=await cache.match(request);
        if(response) bodyBytes+=(await response.clone().arrayBuffer()).byteLength;
      }
      cachesOut.push({name,count:keys.length,bodyBytes});
    }
    let storage=null;try{storage=await navigator.storage?.estimate?.()||null;}catch{}
    return {caches:cachesOut,storage,controller:navigator.serviceWorker?.controller?.scriptURL||null,displayModeStandalone:matchMedia('(display-mode: standalone)').matches};
  });
  const row={label,...snap};
  result.cacheSnapshots.push(row);
  return row;
};
const waitMenu=async page=>{
  await page.waitForFunction(()=>{
    const m=window.__inkwaveStartup?.snapshot?.()?.marks?.['menu-interactive'];
    const screen=document.querySelector('.iw-ui')?.dataset.screen;
    return Number.isFinite(m)&&['title','main'].includes(screen);
  },undefined,{timeout});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
};
const measure=async(page,label,action,pageErrors)=>{
  const receiptStart=receipts.length,errorStart=pageErrors.length;
  await action();
  await waitMenu(page);
  const capture=await page.evaluate(()=>{
    const startup=window.__inkwaveStartup?.snapshot?.()||null;
    const nav=performance.getEntriesByType('navigation')[0]?.toJSON?.()||null;
    const resources=performance.getEntriesByType('resource').map(e=>e.toJSON());
    return {
      startup,nav,
      resourceSummary:{
        count:resources.length,
        transferSize:resources.reduce((n,e)=>n+(e.transferSize||0),0),
        encodedBodySize:resources.reduce((n,e)=>n+(e.encodedBodySize||0),0),
        decodedBodySize:resources.reduce((n,e)=>n+(e.decodedBodySize||0),0)
      },
      controller:!!navigator.serviceWorker?.controller,
      screen:document.querySelector('.iw-ui')?.dataset.screen||null,
      displayModeStandalone:matchMedia('(display-mode: standalone)').matches
    };
  });
  const serverRows=receipts.slice(receiptStart);
  const row={
    label,status:'passed',
    menuInteractiveMs:capture.startup?.marks?.['menu-interactive']??null,
    engineReadyMs:capture.startup?.marks?.['engine-ready']??null,
    loadingUiMountedMs:capture.startup?.marks?.['loading-ui-mounted']??null,
    bootstrapImportStartMs:capture.startup?.marks?.['bootstrap-import-start']??null,
    bootstrapImportEndMs:capture.startup?.marks?.['bootstrap-import-end']??null,
    bootMs:capture.startup?.bootMs??null,
    navigation:capture.nav,
    resourceSummary:capture.resourceSummary,
    controller:capture.controller,screen:capture.screen,displayModeStandalone:capture.displayModeStandalone,
    server:{requests:serverRows.length,bodyBytes:serverRows.reduce((n,x)=>n+x.bodyBytes,0),status200:serverRows.filter(x=>x.status===200).length,status304:serverRows.filter(x=>x.status===304).length},
    startupErrors:capture.startup?.errors||[],
    pageErrors:pageErrors.slice(errorStart)
  };
  if(!Number.isFinite(row.menuInteractiveMs)||row.menuInteractiveMs<=0||row.startupErrors.length||row.pageErrors.length) row.status='failed';
  result.samples.push(row);
  return row;
};
const naturalController=async page=>{
  await page.waitForFunction(()=>!!navigator.serviceWorker?.ready,undefined,{timeout});
  await page.evaluate(async timeoutMs=>{
    await new Promise((resolve,reject)=>{
      const sw=navigator.serviceWorker;
      let ready=false;
      const cleanup=()=>{clearTimeout(timer);sw.removeEventListener('controllerchange',check);};
      const check=()=>{if(ready&&sw.controller){cleanup();resolve();}};
      const timer=setTimeout(()=>{cleanup();reject(new Error('service worker activation/controllerchange timeout'));},timeoutMs);
      sw.addEventListener('controllerchange',check);
      // ready itself never rejects an installation failure. Bound that wait too,
      // so a broken cache produces evidence instead of consuming the entire CI job.
      sw.ready.then(()=>{ready=true;check();},error=>{cleanup();reject(error);});
      check();
    });
  },Math.min(timeout,180000));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout});
};

let browser=null,pwa=null;
try{
  browser=await pw.chromium.launch({headless:true,args:launchArgs});
  result.environment.browserVersion=browser.version();
  for(let i=1;i<=runs;i++){
    const ctx=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
    await ctx.addInitScript(init,'low');
    const page=await ctx.newPage(),errors=attachErrors(page);
    await measure(page,'cold-'+i,()=>page.goto(base,{waitUntil:'domcontentloaded',timeout}),errors);
    await measure(page,'http-warm-'+i,()=>page.reload({waitUntil:'domcontentloaded',timeout}),errors);
    await ctx.close();
  }
  await browser.close();browser=null;

  const pwaProfile=path.join(profileRoot,'pwa-profile');
  fs.rmSync(pwaProfile,{recursive:true,force:true});fs.mkdirSync(pwaProfile,{recursive:true});
  pwa=await pw.chromium.launchPersistentContext(pwaProfile,{headless:true,viewport:{width:1024,height:768},serviceWorkers:'allow',args:launchArgs});
  const pwaPage=pwa.pages()[0]||await pwa.newPage();const pwaErrors=attachErrors(pwaPage);
  await pwaPage.addInitScript(init,'low');
  await measure(pwaPage,'pwa-first-load',()=>pwaPage.goto(base,{waitUntil:'domcontentloaded',timeout}),pwaErrors);
  await naturalController(pwaPage);
  const installed=await cacheSnapshot(pwaPage,'after-natural-install');
  const expectedCache='inkwave-startup-v2:/:'+revision;
  if(!installed.caches.some(c=>c.name===expectedCache&&c.count>1&&c.bodyBytes>0)) result.errors.push('Current revision Cache Storage snapshot missing after natural install');
  for(let i=1;i<=runs;i++){
    const row=await measure(pwaPage,'sw-warm-'+i,()=>pwaPage.reload({waitUntil:'domcontentloaded',timeout}),pwaErrors);
    if(!row.controller) result.errors.push(row.label+' was not service-worker controlled');
  }
  let offline;
  forceNetworkFailure=true;
  try {
    await pwa.setOffline(true);
    offline=await measure(pwaPage,'offline-controlled',()=>pwaPage.reload({waitUntil:'domcontentloaded',timeout}),pwaErrors);
  } finally {
    forceNetworkFailure=false;
    await pwa.setOffline(false);
  }
  if(!offline.controller) result.errors.push('Offline navigation lost service-worker control');
  if(offline.server.bodyBytes!==0 || offline.server.status200!==0) result.errors.push('Offline navigation consumed an HTTP response instead of the cached snapshot');
  await cacheSnapshot(pwaPage,'after-offline');
  await pwa.close();pwa=null;

  pwa=await pw.chromium.launchPersistentContext(pwaProfile,{headless:true,viewport:{width:1024,height:768},serviceWorkers:'allow',args:launchArgs});
  const restartPage=pwa.pages()[0]||await pwa.newPage();const restartErrors=attachErrors(restartPage);
  await restartPage.addInitScript(init,'low');
  const restart=await measure(restartPage,'pwa-browser-restart-warm',()=>restartPage.goto(base,{waitUntil:'domcontentloaded',timeout}),restartErrors);
  await naturalController(restartPage);
  if(!restart.controller) result.errors.push('Persistent-profile restart was not service-worker controlled at menu');
  const restarted=await cacheSnapshot(restartPage,'after-browser-restart');
  if(!restarted.caches.some(c=>c.name===expectedCache&&c.count>1&&c.bodyBytes>0)) result.errors.push('Revision cache did not survive browser restart');

  const scenarios=['cold','http-warm','sw-warm'];
  result.mediansMs=Object.fromEntries(scenarios.map(prefix=>[prefix,median(result.samples.filter(s=>s.label.startsWith(prefix+'-')&&s.status==='passed').map(s=>s.menuInteractiveMs))]));
  for(const prefix of scenarios){
    const rows=result.samples.filter(s=>s.label.startsWith(prefix+'-'));
    if(rows.length!==runs||rows.some(s=>s.status!=='passed')) result.errors.push(prefix+' startup sample set incomplete');
  }
  if(result.samples.find(s=>s.label==='offline-controlled')?.status!=='passed') result.errors.push('Offline startup failed');
  if(result.samples.find(s=>s.label==='pwa-browser-restart-warm')?.status!=='passed') result.errors.push('PWA browser-restart warm startup failed');
  result.status=result.errors.length?'failed':'passed';
}catch(error){
  result.status='failed';result.error=error?.stack||String(error);
}finally{
  try{if(browser)await browser.close();}catch{}
  try{if(pwa)await pwa.close();}catch{}
  await new Promise(resolve=>server.close(resolve));
  fs.mkdirSync(evidence,{recursive:true});
  const out=path.join(evidence,'startup-browser-result.json'),pending=out+'.pending';
  fs.writeFileSync(pending,JSON.stringify(result,null,2)+'\n');fs.renameSync(pending,out);
  console.log(JSON.stringify({status:result.status,sourceSha,mediansMs:result.mediansMs,errors:result.errors,error:result.error||null,output:out},null,2));
}
if(result.status!=='passed') process.exitCode=1;
