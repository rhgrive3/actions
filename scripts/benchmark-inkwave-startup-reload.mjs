#!/usr/bin/env node
// Counterbalanced same-context HTTP-cache reload versus closing the old page
// before a cached new-page navigation. Captures renderer/GPU-process CPU and
// native CDP trace; never tunes runtime based on an unproved cache hypothesis.
// --scenario sw traces two naturally controlled persistent-profile reloads.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import crypto from 'node:crypto';import {pathToFileURL}from'node:url';
import {verifyRuntimeBuild,persistentDirectory}from'./lib/inkwave-runtime-evidence.mjs';
import {summarizeStartupTrace}from'./lib/inkwave-startup-trace-summary.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(new URL('../',import.meta.url).pathname),site=path.resolve(option('--site',''));
const sourceSha=option('--source-sha',''),out=persistentDirectory(option('--evidence-dir',''));
const scenario=option('--scenario','http');
if(!['http','sw'].includes(scenario))throw Error('Use --scenario http or sw');
const orders=scenario==='sw'?['AA']:['ABBA','BAAB'];
const manifest=verifyRuntimeBuild(site,root,sourceSha),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const served=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html',file=path.resolve(site,rel);
  if(!file.startsWith(site+path.sep))throw Error('outside site');
  const body=fs.readFileSync(file),etag='"'+hash(body)+'"';
  if(hash(body)!==manifest.artifacts[rel])throw Error('unbound artifact');
  const immutable=rel.startsWith('_versions/'+manifest.build.revision+'/');
  const headers={'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':immutable?'public,max-age=600,immutable':'no-cache','etag':etag};
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();served.push({rel,status:304,bodyBytes:0});}
  else{res.writeHead(200,{...headers,'content-length':body.length});res.end(body);served.push({rel,status:200,bodyBytes:body.length});}
 }catch(error){res.writeHead(404);res.end(error.message);served.push({path:req.url,status:404,bodyBytes:0});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let browser;
const result={status:'running',sourceSha,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,
  conditions:{scenario,orders,A:'same-page reload',B:'close old page, open cached new page',quality:'low',viewport:[1024,768],serviceWorkers:scenario==='sw'?'allow':'block',physicalDevice:false},samples:[],errors:[]};
const recordsFile=path.join(out,'startup-reload-result.json');
const store=()=>fs.writeFileSync(recordsFile,JSON.stringify(result,null,2)+'\n');
try{
 const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 let persistentContext;
 if(scenario==='sw'){
  const profile=persistentDirectory(option('--profile-dir',path.join(out,'profile')));
  if(fs.readdirSync(profile).length)throw Error('SW diagnostic requires a fresh owned profile directory');
  persistentContext=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:1024,height:768},serviceWorkers:'allow'});
  browser=persistentContext.browser();
 }else browser=await chromium.launch(launch);
 result.browserVersion=browser.version();
 const browserCDP=await browser.newBrowserCDPSession();
 const processCPU=async()=>{try{return(await browserCDP.send('SystemInfo.getProcessInfo')).processInfo;}catch(error){return{unsupported:String(error.message)}};};
 for(const order of orders){
  const context=persistentContext||await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
  const traceStops=new WeakMap();
  await context.exposeBinding('__inkwaveStartupTraceInteractive',({page,frame})=>{
   if(frame===page.mainFrame())traceStops.get(page)?.();
  });
  await context.addInitScript(()=>document.addEventListener('readystatechange',()=>{
   if(document.readyState==='interactive')void globalThis.__inkwaveStartupTraceInteractive().catch(()=>{});
  }));
  await context.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,frameRate:60})));
  let page=persistentContext?.pages()[0]||await context.newPage();
  try{
   for(const [index,condition]of ['cold',...order].entries()){
    const processesBeforeReplacement=await processCPU(),preNavigation={pageCloseMs:0,newPageMs:0};
    if(condition==='B'){
     let began=performance.now();await page.close();preNavigation.pageCloseMs=performance.now()-began;
     began=performance.now();page=await context.newPage();preNavigation.newPageMs=performance.now()-began;
    }
    const label=order+'-'+index+'-'+condition,row={label,condition,order,index,status:'running',preNavigation,processesBeforeReplacement,processesBefore:await processCPU()};
    result.samples.push(row);store();
    const errors=[],network=[],session=await context.newCDPSession(page);const receiptStart=served.length;
    const onError=error=>errors.push(error.message);page.on('pageerror',onError);
    await session.send('Performance.enable');await session.send('Network.enable');
    const mainFrameId=scenario==='sw'?(await session.send('Page.getFrameTree')).frameTree.frame.id:null;
    session.on('Network.responseReceived',e=>network.push({url:e.response.url,status:e.response.status,resourceType:e.type,frameId:e.frameId,fromDiskCache:!!e.response.fromDiskCache,fromServiceWorker:!!e.response.fromServiceWorker}));
    await session.send('Tracing.start',{categories:'devtools.timeline,v8,v8.execute,blink.user_timing,loading,cc,gpu,viz,toplevel,disabled-by-default-v8.compile',transferMode:'ReturnAsStream'});
    const traceComplete=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));
    let traceEnded=false;
    const stopTrace=()=>{if(traceEnded)return Promise.resolve();traceEnded=true;return session.send('Tracing.end');};
    traceStops.set(page,()=>void stopTrace().catch(error=>errors.push('trace stop: '+error.message)));
    try{
     if(condition==='A')await page.reload({waitUntil:'domcontentloaded',timeout:180000});
     else await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});
     await page.waitForFunction(()=>Number.isFinite(globalThis.__inkwaveStartup?.snapshot?.()?.marks?.['menu-interactive'])&&['title','main'].includes(document.querySelector('.iw-ui')?.dataset.screen),null,{timeout:180000,polling:250});
     const metrics=(await session.send('Performance.getMetrics')).metrics;
     row.performance=Object.fromEntries(metrics.map(m=>[m.name,m.value]));
     row.capture=await page.evaluate(()=>({startup:globalThis.__inkwaveStartup.snapshot(),navigation:performance.getEntriesByType('navigation')[0].toJSON(),screen:document.querySelector('.iw-ui')?.dataset.screen||null,renderer:!!globalThis.__G?.renderer,controller:navigator.serviceWorker?.controller?.scriptURL||null}));
     row.menuIncludingPageReplacementMs=preNavigation.pageCloseMs+preNavigation.newPageMs+row.capture.startup.marks['menu-interactive'];
     row.processesAfter=await processCPU();row.network=network;
     row.server={requests:served.length-receiptStart,bodyBytes:served.slice(receiptStart).reduce((s,r)=>s+r.bodyBytes,0),status304:served.slice(receiptStart).filter(r=>r.status===304).length};
     if(errors.length||row.capture.startup.errors?.length)throw Error('Startup errors: '+JSON.stringify(errors));
     if(scenario==='sw'&&condition!=='cold'&&(!row.capture.controller||!network.some(response=>response.resourceType==='Document'&&response.frameId===mainFrameId&&response.fromServiceWorker)))throw Error('SW reload was not naturally controlled');
     row.status='passed';
    }catch(error){row.status='failed';row.error=String(error.stack||error);throw error;}
    finally{
     await stopTrace();traceStops.delete(page);const complete=await traceComplete,{stream}=complete;
     const traceFile=path.join(out,label+'.trace.json');const fd=fs.openSync(traceFile,'w');let size=0;
     try{for(;;){const chunk=await session.send('IO.read',{handle:stream,size:1024*1024});const body=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');size+=body.length;if(size>64*1024*1024)throw Error('Trace exceeds 64 MiB bound');fs.writeSync(fd,body);if(chunk.eof)break;}}
     finally{fs.closeSync(fd);await session.send('IO.close',{handle:stream});}
     row.trace={path:traceFile,bytes:size,sha256:hash(fs.readFileSync(traceFile)),dataLossOccurred:complete.dataLossOccurred};
     if(complete.dataLossOccurred){row.status='failed';row.trace.error='Native trace reported data loss; no complete phase coverage claim';}
     else if(row.capture)row.phaseTrace=summarizeStartupTrace(JSON.parse(fs.readFileSync(traceFile)),row.performance.NavigationStart,row.capture.navigation);
     page.off('pageerror',onError);await session.detach();store();
    }
    console.log(JSON.stringify({label,status:row.status,menuMs:row.capture?.startup?.marks?.['menu-interactive'],responseEnd:row.capture?.navigation.responseEnd,domInteractive:row.capture?.navigation.domInteractive,bodyBytes:row.server?.bodyBytes}));
    if(scenario==='sw'&&condition==='cold'){
     const began=performance.now();
     await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:180000,polling:250});
     result.naturalServiceWorker=await page.evaluate(async revision=>{
      const name='inkwave-startup-v2:/:'+revision,names=await caches.keys();
      if(!names.includes(name))throw Error('Naturally installed current-revision cache is missing');
      const count=(await(await caches.open(name)).keys()).length;
      if(count<=1)throw Error('Naturally installed cache has no boot graph');
      return{controller:navigator.serviceWorker.controller.scriptURL,cache:name,entries:count};
     },manifest.build.revision);
     result.naturalServiceWorker.controlWaitMs=performance.now()-began;store();
    }
   }
  }finally{await context.close();}
 }
 result.status=result.samples.length===(scenario==='sw'?3:10)&&result.samples.every(row=>row.status==='passed')?'passed':'failed';
}catch(error){result.status='failed';result.error=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));store();console.log(JSON.stringify({status:result.status,samples:result.samples.length,error:result.error||null}));}
