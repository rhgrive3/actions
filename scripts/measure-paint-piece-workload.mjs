#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return process.argv[i+1];};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const beforeSha=arg('--baseline-sha'),afterSha=arg('--candidate-sha');for(const s of[beforeSha,afterSha])if(!/^[a-f0-9]{40}$/.test(s))throw Error('Immutable full SHA required');if(beforeSha===afterSha)throw Error('Different revisions required');
const profile=process.argv.includes('--profile')?arg('--profile'):'aggregate';
const profiles={aggregate:{actors:8,pattern:'continuous'},single_idle:{actors:1,pattern:'idle'},single_continuous:{actors:1,pattern:'continuous'},single_mixed:{actors:1,pattern:'mixed'},single_legacy:{actors:1,pattern:'continuous',legacyPeer:true}};if(!profiles[profile])throw Error('Unknown fixed workload profile');
const here=path.dirname(fileURLToPath(import.meta.url)),fixture=fs.readFileSync(path.join(here,'fixtures/paint-piece-workload.mjs'),'utf8');
const evidence=path.resolve(arg('--evidence-dir'));fs.mkdirSync(evidence,{recursive:true});
const variants={before:{root:path.resolve(arg('--baseline-root')),site:path.resolve(arg('--baseline-site')),sourceSha:beforeSha},after:{root:path.resolve(arg('--candidate-root')),site:path.resolve(arg('--candidate-site')),sourceSha:afterSha}};
for(const v of Object.values(variants)){
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:v.root,encoding:'utf8'}).trim()!==v.sourceSha)throw Error('Checkout SHA mismatch');
 v.manifest=JSON.parse(fs.readFileSync(path.join(v.site,'inkwave-build.json')));v.received=new Set();
 for(const [rel,digest]of Object.entries(v.manifest.artifacts)){if(sha(fs.readFileSync(path.join(v.site,rel)))!==digest)throw Error('Artifact mismatch '+rel);}
}
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost');const m=u.pathname.match(/^\/(before|after)\/(.*)$/);if(u.pathname==='/workload.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}if(!m)throw Error('Unknown asset');const mode=m[1],rel=decodeURIComponent(m[2]),v=variants[mode];if(rel==='probe'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#18202b}</style><script type="importmap">{"imports":{"three":"/${mode}/vendor/three/build/three.module.js","three/addons/":"/${mode}/vendor/three/jsm/"}}</script><script type="module">import {runWallWorkload} from '/workload.mjs';globalThis.workloadPromise=runWallWorkload('/${mode}',${JSON.stringify(profiles[profile])}).then(r=>globalThis.workloadResult=r).catch(e=>{globalThis.workloadError=e.stack;throw e;});</script>`);return;}
 const f=path.resolve(v.site,rel);if(!f.startsWith(v.site+path.sep)||!v.manifest.artifacts[rel])throw Error('Unlisted artifact');const bytes=fs.readFileSync(f);if(sha(bytes)!==v.manifest.artifacts[rel])throw Error('Changed active artifact');v.received.add(rel);res.setHeader('Content-Type',rel.endsWith('.json')?'application/json':rel.endsWith('.js')||rel.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(bytes);}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const {chromium}=await import(pathToFileURL(arg('--playwright')).href);
const quant=(a,q)=>{const s=a.filter(Number.isFinite).sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor((s.length-1)*q))]??null;};
const stats=a=>({n:a.length,p50:quant(a,.5),p95:quant(a,.95),p99:quant(a,.99),max:Math.max(...a)});
const result={schema:1,profile,status:'running',fixtureSha256:sha(fixture),probeSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),baselineSha:beforeSha,candidateSha:afterSha,environment:{cpu:os.cpus()[0]?.model,cores:os.cpus().length,node:process.version,platform:os.platform(),renderer:'SwiftShader software WebGL'},order:['before','after','after','before','before','after'],runs:[],limitations:['Paint-workload transaction, not whole-game frame or hardware-GPU FPS.','Dedicated controlled native level geometry; characters/UI/full-game postprocessing excluded equally.','gl.finish wait is separate from JavaScript/submission timings; nested probe timings must not be added.']};
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.environment.browser=browser.version();
 for(let i=0;i<result.order.length;i++){
  const mode=result.order[i],page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const cdp=await page.context().newCDPSession(page);await page.exposeFunction('__probeHeap',async()=>{await cdp.send('HeapProfiler.collectGarbage');return cdp.send('Runtime.getHeapUsage');});await page.goto(`http://127.0.0.1:${server.address().port}/${mode}/probe`);
  await page.waitForFunction(()=>globalThis.workloadResult||globalThis.workloadError,null,{timeout:600000});
  const row=await page.evaluate(()=>({value:globalThis.workloadResult,error:globalThis.workloadError}));if(row.error||errors.length)throw Error(row.error||errors.join('\n'));
  const run={mode,ordinal:i,sourceSha:variants[mode].sourceSha,contentHash:variants[mode].manifest.contentHash,...row.value};
  if(run.wireNegotiation?.compressedMessages!==0||run.wireNegotiation?.initialHandshake?.messages!==0)throw Error('Paint-only diagnostic changed wire protocol');
  if(profile==='single_legacy'&&run.wireNegotiation?.compressedMessages!==0)throw Error('Mixed legacy peer unexpectedly received compressed paint');
  if(mode==='before'&&run.wireNegotiation?.compressedMessages!==0)throw Error('Baseline unexpectedly compressed');
  const metrics=['stepSubmit','stepWithDrain','finishWait','cpuBody','cpuGrowth','splatInclusive','paintAdvanceInclusive','flushInclusive','atlasSubmit','wireSerialize','receiveDecode','sendTickInclusive','stepAndWire'];
  if([...run.frames,...run.coldFrames].some(f=>metrics.some(k=>!Number.isFinite(f[k])||f[k]<0)))throw Error('Missing or invalid timing sample '+mode);
  for(const k of (profile==='single_idle'?['sendTickInclusive']:['cpuBody','cpuGrowth','atlasSubmit','sendTickInclusive']))if(!run.frames.some(f=>f[k]>0))throw Error('Inactive timing probe '+mode+' '+k);
  if(profile==='single_idle'){if(run.counts.totalQuads!==0||run.counts.totalRows!==0)throw Error('Idle workload painted');}
  else if(!(run.counts.totalQuads>0&&run.counts.totalAtlasDraws>0))throw Error('Inactive GPU workload '+mode);
  if(run.counts.totalMessages!==80)throw Error('Missing measured wire transactions');
  run.timings=Object.fromEntries(metrics.map(k=>[k,stats(run.frames.map(f=>f[k]))]));
  run.coldTimings=Object.fromEntries(metrics.map(k=>[k,stats(run.coldFrames.map(f=>f[k]))]));
  for(const phase of ['beforeWarmup','afterWarmup','afterWorkload']){
    const h=run.heap[phase];if(!Number.isFinite(h?.usedSize)||h.usedSize<=0||!Number.isFinite(h.backingStorageSize)||h.backingStorageSize<0)throw Error('Missing heap evidence');
    // CDP backing storage includes ArrayBuffers and external strings. Retain
    // both raw values and their sum so external buffers cannot hide as a win.
    h.usedPlusBackingStorageBytes=h.usedSize+h.backingStorageSize;
  }
  fs.writeFileSync(path.join(evidence,'pending-run.json'),JSON.stringify(run,null,2));
  // This fixture is a single native WebGL canvas. Read its preserved framebuffer
  // directly rather than waiting for an idle page compositor screenshot.
  const png=await page.evaluate(()=>{const c=document.querySelector('canvas');if(!c||c.width!==960||c.height!==600)throw Error('Missing native paint canvas');return c.toDataURL('image/png');});
  if(!png.startsWith('data:image/png;base64,'))throw Error('Missing native canvas PNG');
  const imageBytes=Buffer.from(png.slice('data:image/png;base64,'.length),'base64');if(imageBytes.length<100)throw Error('Empty native canvas PNG');
  fs.writeFileSync(path.join(evidence,mode+'-'+i+'.png'),imageBytes);run.imageCapture='preserved native WebGL canvas';run.imageSha256=sha(imageBytes);result.runs.push(run);console.log(JSON.stringify({completedMode:mode,ordinal:i,counts:run.counts,heap:run.heap}));fs.writeFileSync(path.join(evidence,'progress.json'),JSON.stringify(result,null,2));await page.close();
 }
 for(const mode of ['before','after']){const rows=result.runs.filter(r=>r.mode===mode);if(rows.length!==3||rows.some(r=>r.frames.length!==240))throw Error('Missing repeated workload');if(rows.some(r=>{const stable=c=>{const {tickJsonBytes,eventArrayBytes,...rest}=c;return rest;};return JSON.stringify(stable(r.counts))!==JSON.stringify(stable(rows[0].counts));}))throw Error('Nonrepeatable work counts '+mode);}
 if(process.argv.includes('--require-equivalent-work')){const stable=c=>{const{tickJsonBytes,eventArrayBytes,...rest}=c;return rest;};const first=result.runs[0];for(const r of result.runs)if(JSON.stringify(stable(r.counts))!==JSON.stringify(stable(first.counts))||r.imageSha256!==first.imageSha256)throw Error('Optimization changed grid, events or rendered image');}
 if(process.argv.includes('--require-equivalent-paint')){const stable=c=>{const{tickJsonBytes,eventArrayBytes,totalQuads,...rest}=c;return rest;};const first=result.runs[0];for(const r of result.runs)if(JSON.stringify(stable(r.counts))!==JSON.stringify(stable(first.counts))||r.imageSha256!==first.imageSha256)throw Error('Rectangle optimization changed grid, rows or rendered image');for(const r of result.runs.filter(r=>r.mode==='after'))if(!(r.counts.totalQuads<first.counts.totalQuads))throw Error('Rectangle optimization did not reduce native quads');}
 result.summary=Object.fromEntries(['before','after'].map(mode=>{const rows=result.runs.filter(r=>r.mode===mode);return[mode,{counts:rows[0].counts,heap:rows.map(r=>r.heap),coldTimings:rows.map(r=>r.coldTimings),bandwidth:{durationSeconds:4,eventArrayBytes:rows.map(r=>r.counts.eventArrayBytes),tickJsonBytes:rows.map(r=>r.counts.tickJsonBytes),clientUplinkJsonBytesPerSecond:rows.map(r=>r.counts.tickJsonBytes/4),relayEgressThreePeerJsonBytesPerSecond:rows.map(r=>r.counts.tickJsonBytes*3/4),relayEgressSevenPeerJsonBytesPerSecond:rows.map(r=>r.counts.tickJsonBytes*7/4),perReceiverJsonBytesPerSecond:rows.map(r=>r.counts.tickJsonBytes/4),note:'One WebSocket broadcast uplink, relay duplicates for receivers. JSON only; relay prefixes and WebSocket/TLS/TCP/IP overhead excluded. Wall-clock timestamp widths may vary.'},contentHash:rows[0].contentHash,timings:Object.fromEntries(Object.keys(rows[0].timings).map(k=>[k,{runP50:rows.map(r=>r.timings[k].p50),runP95:rows.map(r=>r.timings[k].p95),runP99:rows.map(r=>r.timings[k].p99)}]))}];}));
 result.status='measured';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{result.verifiedRuntimeFiles=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.received].sort()]));fs.writeFileSync(path.join(evidence,'wall-performance.json'),JSON.stringify(result,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({status:result.status,error:result.error,summary:result.summary}));}
