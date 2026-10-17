#!/usr/bin/env node
// Diagnostic only. Production builds are unmodified and verified against exact Git SHAs.
// Synchronous 1-pixel readback completes every full Game._frame transaction. This
// serializes CPU/GPU work and is NOT native display FPS or photon/input latency.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { collectResourceInventory } from './resource-inventory-1565-page.mjs';
const arg=(name,def)=>{const i=process.argv.indexOf(name);return i<0?def:process.argv[i+1];};
const harnessRoot=path.resolve(arg('--harness-root',process.cwd()));
const evidenceLib=path.join(harnessRoot,'scripts/lib/inkwave-runtime-evidence.mjs');
const {verifyRuntimeBuild,hash,persistentDirectory,persistentBrowserTemp}=await import(pathToFileURL(evidenceLib).href);
const output=persistentDirectory(arg('--out',path.join(harnessRoot,'.ci-scratch/1565/evidence/whole-game')));
if(fs.existsSync(path.join(output,'resource-inventory.json')))throw Error('Fresh evidence output directory required');
const harnessSource=fs.readFileSync(new URL(import.meta.url)),evidenceLibSource=fs.readFileSync(evidenceLib);
fs.writeFileSync(path.join(output,'measure-inkwave-resource-inventory.mjs'),harnessSource);
const inventoryLibPath=new URL('./resource-inventory-1565-page.mjs',import.meta.url),inventoryLibSource=fs.readFileSync(inventoryLibPath);
fs.writeFileSync(path.join(output,'resource-inventory-1565-page.mjs'),inventoryLibSource);
const frozenParentSource=fs.readFileSync(new URL('./measure-inkwave-quality-359ed88a.mjs',import.meta.url));
if(hash(frozenParentSource)!=='359ed88ab17f84f16986f1668c30a4e86d0aca9d23cbab18bdc07f6d4f11c011')throw Error('Frozen parent harness mismatch');
fs.writeFileSync(path.join(output,'measure-inkwave-quality-359ed88a.mjs'),frozenParentSource);
fs.writeFileSync(path.join(output,'inkwave-runtime-evidence.mjs'),evidenceLibSource);
fs.writeFileSync(path.join(output,'invocation.json'),JSON.stringify({argv:process.argv,cwd:process.cwd(),harnessRoot,node:process.version,harnessSha256:hash(harnessSource),runtimeEvidenceLibSha256:hash(evidenceLibSource),resourceInventoryLibSha256:hash(inventoryLibSource),frozenParentHarnessSha256:'359ed88ab17f84f16986f1668c30a4e86d0aca9d23cbab18bdc07f6d4f11c011'},null,2));
const browserTemp=persistentBrowserTemp(arg('--browser-temp',path.join(harnessRoot,'.ci-scratch/1565/cache/browser')));
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp;
const input=arg('--input','outward-fire');
if(!['outward-fire','forward-fire'].includes(input))throw Error('Invalid input');
const gpuTiming=process.argv.includes('--gpu-timing');
const timeouts={navigationMs:Number(arg('--navigation-timeout-ms','120000')),bootMs:Number(arg('--boot-timeout-ms','180000')),pwaMs:Number(arg('--pwa-timeout-ms','120000')),setupMs:Number(arg('--setup-timeout-ms','180000')),measurementMs:Number(arg('--measurement-timeout-ms','180000'))};
for(const [name,value]of Object.entries(timeouts))if(!Number.isSafeInteger(value)||value<1)throw Error('Positive timeout required: '+name);
const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label+' timeout after '+ms+'ms')),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const mode=arg('--mode','calibrate');
if(mode!=='calibrate')throw Error('Resource diagnostic permits only four-context calibration-shaped runs, not timing measurement');
const stage=arg('--stage','scorch');
const scenario=arg('--scenario','crowd');
if(!['crowd','normal'].includes(scenario))throw Error('Invalid scenario');
const samples=Number(arg('--samples','60'));
const width=Number(arg('--width','480')),height=Number(arg('--height','300'));
const calibrationFile=arg('--calibration');
const warmup=Number(arg('--warmup','12'));
for(const [name,value]of Object.entries({samples,width,height,warmup}))if(!Number.isSafeInteger(value)||value<1)throw Error('Positive integer required: '+name);
if(input==='forward-fire'&&scenario!=='normal')throw Error('forward-fire requires --scenario normal');
const order=mode==='calibrate'?['A','B','B','A']:['A','B','B','A','B','A','A','B'];
const variants=Object.fromEntries([['A','before'],['B','after']].map(([name,label])=>{
 const root=path.resolve(arg('--'+label+'-root',harnessRoot)),site=path.resolve(arg('--'+label+'-site')),sha=arg('--'+label+'-sha');
 if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Full --'+label+'-sha required');
 const manifest=verifyRuntimeBuild(site,root,sha),logical=Object.entries(manifest.artifacts).filter(([p])=>!p.startsWith('_versions/'));
 const sizes=logical.map(([p])=>({path:p,bytes:fs.statSync(path.join(site,p)).size}));
 const byExtension={};for(const row of sizes){const ext=path.extname(row.path)||'(none)',v=byExtension[ext]??={files:0,bytes:0};v.files++;v.bytes+=row.bytes;}
 return [name,{root,site,sha,manifest,receipts:new Set(),assets:{logicalFiles:sizes.length,logicalBytes:sizes.reduce((n,x)=>n+x.bytes,0),byExtension,largest:sizes.sort((a,b)=>b.bytes-a.bytes).slice(0,20)}}];
}));
// Exact production Three source binds the registration-listener classifier.
// The parser is read from the existing repository; no dependency is installed.
const {parse}=await import(pathToFileURL(path.join(harnessRoot,'patches/loading-cache/vendor/acorn.mjs')).href);
const inventorySpecs={};
for(const[name,v]of Object.entries(variants)){
 const artifact='vendor/three/build/three.module.js',source=fs.readFileSync(path.join(v.site,artifact),'utf8');
 if(hash(source)!==v.manifest.artifacts[artifact])throw Error('Three classifier artifact hash mismatch');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),functions=[];
 const walk=(node,parentFunction=null)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const x of node)walk(x,parentFunction);return;}const isFunction=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type);if(isFunction)functions.push({node,parentFunction,text:source.slice(node.start,node.end)});for(const[k,x]of Object.entries(node))if(k!=='start'&&k!=='end')if(x&&typeof x==='object')walk(x,isFunction?node:parentFunction);};
 walk(ast);
 const nearest=predicate=>functions.filter(predicate).sort((a,b)=>a.text.length-b.text.length)[0];
 const geometry=nearest(f=>/\.memory\.geometries\s*--/.test(f.text)&&f.text.includes('releaseStatesOfGeometry')&&f.text.includes('removeEventListener'));
 if(!geometry||!geometry.node.id?.name)throw Error('Cannot bind exact WebGLGeometries dispose source');
 const enclosing=functions.find(f=>f.node===geometry.parentFunction);
 if(!enclosing||!/\.memory\.geometries\s*\+\+/.test(enclosing.text))throw Error('Geometry registration counter source not found');
 let matchingAttach=false;
 const checkAttach=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(checkAttach);return;}if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&node.callee.property?.name==='addEventListener'&&node.arguments[1]?.type==='Identifier'&&node.arguments[1].name===geometry.node.id.name)matchingAttach=true;for(const value of Object.values(node))if(value&&typeof value==='object')checkAttach(value);};
 checkAttach(enclosing.node);if(!matchingAttach)throw Error('Exact geometry disposer is not attached by enclosing implementation');
 const texture=nearest(f=>f.text.includes('isVideoTexture')&&f.text.includes('isHTMLTexture')&&f.text.includes('removeEventListener')&&f.text.includes('.target'));
 if(!texture)throw Error('Cannot bind exact WebGLTextures dispose source');
 inventorySpecs[name]={path:artifact,threeSha256:hash(source),geometryDispose:{source:geometry.text,sha256:hash(geometry.text)},textureDispose:{source:texture.text,sha256:hash(texture.text)},method:'AST identifies smallest disposal function with memory.geometries-- and releaseStatesOfGeometry; enclosing implementation must attach that exact identifier and increment memory.geometries. Texture callback is the smallest function containing both HTML/video cleanup and listener removal.'};
}
fs.writeFileSync(path.join(output,'resource-inventory-classifiers.json'),JSON.stringify(inventorySpecs,null,2));
const quality=arg('--quality','medium');if(!['low','medium','high','ultra'].includes(quality))throw Error('Invalid quality');
const settings={quality,shadows:quality!=='low',bloom:quality!=='low',frameRate:'display',music:.6,sfx:.85,master:.8};
const result={schema:2,resourceDiagnosticOnly:true,timingEvidenceEligible:false,frozenParentHarnessSha256:'359ed88ab17f84f16986f1668c30a4e86d0aca9d23cbab18bdc07f6d4f11c011',resourceInventoryLibSha256:hash(inventoryLibSource),resourceInventoryClassifiersSha256:hash(JSON.stringify(inventorySpecs,null,2)),timingInterpretation:'All timings in this derivative are inadmissible as isolated performance evidence. Extra out-of-loop inventories allocate and can alter GC/scheduling chronology. Original workload/pixel guards are preserved only to classify resource observations.',status:'running',mode,comparison:'exact production before A versus after B',diagnosticSourceSha:'2c57cb3c6dee7791ed26d08a845ba51388131993',harnessSha256:hash(harnessSource),runtimeEvidenceLibSha256:hash(evidenceLibSource),timeouts,stage,scenario,input,gpuTiming,guardCoverage:{selectedGameplayState:true,endpointPixelIdentity:true,controllerAndAliveCounts:true,pwaAndAudio:true,drawCallEquality:false,rendererResourceEquality:false,privateOwnerEquality:false,timingNondegradationThreshold:false},order,settings,samples:mode==='calibrate'?6:samples,warmup,viewport:[width,height],deviceScaleFactor:1,hardwareClaim:false,
 scope:'Full production Game._frame with input polling, BotBrain, actors, collision, projectiles, paint, FX, environment, decor, props, camera, audio owners, HUD, menus and all render/post passes. Primary timing is successive rAF starts, including intervening browser/UI/audio scheduling contention. Secondary completedMs is only synchronous Game._frame JavaScript plus GPU readback; it excludes deferred DOM/compositing/audio completion. Fixed 60 Hz simulation and explicit diagnostic input/camera; readback serializes CPU/GPU.',
 limitations:['Chromium SwiftShader is software-rendered; no physical-PC, mobile, Nintendo Switch, thermal or power measurement.',
 'Exact supplied Git SHAs are verified against every production build input and served artifact; no production bytes are rewritten.',
 'Both variants must naturally install and activate their service worker and report a complete offline snapshot before setup/warmup; this is steady-state enabled PWA, not a cold-start timing test.',
 'Completed-frame throughput includes synchronous 1-pixel readback, serializes CPU/GPU work, excludes display scanout and deferred DOM/audio completion, and is not ordinary game FPS or input-to-photon latency.',
 scenario==='crowd'?'Eight unchanged BotBrains execute; there is no PlayerController.':'One unchanged PlayerController and seven unchanged BotBrains execute.',
 input==='outward-fire'?'The inherited eight-live-actor stress fixture replaces controller/brain output intents with stationary outward fire. This is not ordinary human movement input coverage.':'The local PlayerController receives debug KeyW and fire held; bot intents are unchanged after all eight actors are placed at deterministic nearby nodes. Deaths remain possible; the preserved eight-alive/parity guards may reject this workload.',
 'The native scheduler is frozen; one complete fixed-60Hz simulation frame runs per diagnostic rAF. Dynamic resolution is held at 1.',
 'Eight ABBA/BAAB trials must pass the original strict workload, endpoint pixel, controller, PWA and audio guards. Mismatch is unresolved; no acceptance guard is relaxed.',
 'Endpoint full image parity is checked, not every measured image. Console page errors fail the trial.',
 'Passed means only the explicitly selected gameplay/pixel/PWA/audio guards. Draw/resource/private-owner equality and performance nondegradation are separately recorded and require review.',
 'Heap/CDP and renderer resource snapshots bracket the transaction without forced GC; the ending CDP snapshot also includes endpoint capture/serialization. Their deltas are observations, not pure-loop allocation, a lifetime leak or GPU-memory proof.',
 gpuTiming?'Optional disjoint WebGL2 elapsed queries add identical observation work to both variants. Only valid recovered queries are summarized; incomplete subsets are not whole-run GPU percentiles. SwiftShader timer durations are not hardware GPU evidence.':'GPU elapsed timer queries are disabled; GPU time remains unmeasured. completedMs includes both CPU and GPU wait and must not be called GPU time.' ],
 environment:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memBytes:os.totalmem(),node:process.version,os:os.release(),platform:os.platform()},
 provenance:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,{sourceSha:v.sha,contentHash:v.manifest.contentHash,revision:v.manifest.build.revision,assets:v.assets}])),trials:[]};
const calibrationScope={harnessSha256:result.harnessSha256,runtimeEvidenceLibSha256:result.runtimeEvidenceLibSha256,sourceA:variants.A.sha,sourceB:variants.B.sha,contentA:variants.A.manifest.contentHash,contentB:variants.B.manifest.contentHash,baseline:'A',candidate:'B',stage,scenario,input,gpuTiming,settings,viewport:[width,height],warmup};
result.calibrationScope=calibrationScope;
let acceptedCalibration=null;
if(mode==='measure'){if(!calibrationFile)throw Error('Verified calibration required');acceptedCalibration=JSON.parse(fs.readFileSync(calibrationFile));if(acceptedCalibration.status!=='passed'||JSON.stringify(acceptedCalibration.calibrationScope)!==JSON.stringify(calibrationScope))throw Error('Calibration scope mismatch');result.calibrationEvidenceSha256=hash(fs.readFileSync(calibrationFile));}
const save=()=>fs.writeFileSync(path.join(output,'resource-inventory.json'),JSON.stringify(result,null,2));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),m=url.pathname.match(/^\/(A|B)\/(.*)$/);if(!m)throw Error('No variant');const v=variants[m[1]],rel=decodeURIComponent(m[2]||'index.html'),file=path.resolve(v.site,rel);if(!file.startsWith(v.site+'/'))throw Error('Traversal');let bytes=fs.readFileSync(file);if(rel!=='inkwave-build.json'&&(!v.manifest.artifacts[rel]||hash(bytes)!==v.manifest.artifacts[rel]))throw Error('Unverified served bytes');v.receipts.add(rel);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(path.resolve(arg('--playwright'))).href);
let browser;
const stats=values=>{const a=[...values].sort((a,b)=>a-b),n=a.length;if(!n)return{n};const q=p=>a[Math.max(0,Math.min(n-1,Math.ceil(n*p)-1))];const mean=a.reduce((s,x)=>s+x,0)/n;return{n,mean,p50:q(.5),p95:q(.95),p99:q(.99),min:a[0],max:a.at(-1),fps:1000/mean,over16_67:a.filter(x=>x>1000/60).length,over33_33:a.filter(x=>x>1000/30).length,over50:a.filter(x=>x>50).length,over100:a.filter(x=>x>100).length};};
try{
 const launch={executablePath:arg('--chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info']};
 result.environment.launch=launch;browser=await chromium.launch(launch);result.environment.browser=browser.version();save();
 for(const [ordinal,variant]of order.entries()){
  const setupStart=Date.now();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:false,isMobile:false});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  const system=()=>{const read=p=>{try{return fs.readFileSync(p,'utf8').trim();}catch{return null;}};return{utc:new Date().toISOString(),loadAverage:os.loadavg(),cpuStat:read('/sys/fs/cgroup/cpu.stat'),cpuPressure:read('/sys/fs/cgroup/cpu.pressure')};};
  const trial={ordinal,variant,status:'booting',errors,resourceInventories:{}};result.trials.push(trial);save();
  const inventory=async phase=>{const snapshot=await bounded(page.evaluate(collectResourceInventory,inventorySpecs[variant]),timeouts.setupMs,'Read-only resource inventory '+phase);const filename=`trial-${ordinal}-${variant}-inventory-${phase}.json`,bytes=JSON.stringify(snapshot,null,2);fs.writeFileSync(path.join(output,filename),bytes);trial.resourceInventories[phase]={filename,sha256:hash(bytes),renderer:snapshot.renderer,coverage:snapshot.coverage};save();};
  // Bootstrap RNG streams are separated by source file so async audio startup
  // cannot consume world/character RNG. Measured frames use a cheap fixed-step
  // stream, and audio keeps a separate cheap seeded stream. No features removed.
  await page.addInitScript(settings=>{
   const streams=new Map();let state=20261013,calls=0,fixed=false;
   const next=s=>(Math.imul(s,1664525)+1013904223)>>>0;
   const seedFor=key=>{let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);return h>>>0;};
   Math.random=()=>{calls++;if(fixed){state=next(state);return state/4294967296;}const stack=new Error().stack||'';const file=(stack.split('\n').slice(2).find(x=>x.includes('/src/')||x.includes('/patches/'))||'other').replace(/^.*?\/(src|patches)\//,'$1/').replace(/:\d+:\d+\)?$/,'');const s=next(streams.get(file)??seedFor(file));streams.set(file,s);return s/4294967296;};
   window.benchSeed=(frame)=>{fixed=true;state=(20261013+Math.imul(frame,2654435761))>>>0;calls=0;};
   window.benchRandomState=()=>({state,calls});
   window.benchAudioRng=(()=>{let s=8172361;return()=>{s=next(s);return s/4294967296;};})();
   localStorage.setItem('inkwave.settings',JSON.stringify(settings));
  },settings);
  await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/?map=${stage}${scenario==='crowd'?'&autopilot':''}`,{waitUntil:'domcontentloaded',timeout:timeouts.navigationMs});
  await page.evaluate(async()=>{window.BG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
  // Read-only owner snapshots run outside every timed frame. They do not
  // wait for, cancel, warm, dispose or otherwise change a private owner.
  await page.evaluate(()=>{
   window.benchPrivateState=()=>{
    const G=BG,g=G.game,s=g?.showcase,e=G.env,composer=g?.R?.composer;
    const target=t=>t?{width:t.width??null,height:t.height??null,samples:t.samples??null,type:t.texture?.type??null,depthBuffer:t.depthBuffer??null,depthTexture:!!t.depthTexture}:null;
    const scene=root=>{if(!root)return null;let nodes=0,meshes=0;const geometries=new Set(),materials=new Set();root.traverse(o=>{nodes++;if(o.isMesh)meshes++;if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))materials.add(m);});return{nodes,meshes,geometries:geometries.size,materials:materials.size};};
    const character=c=>c?{visible:c.root?.visible??null,sourceStatus:c.sourceMotion?.status??null,warmPromisePresent:!!c._warmed,rootParent:c.root?.parent===s?.scene?'showcase-scene':c.root?.parent?'other':'detached',objects:scene(c.root)}:null;
    return{stage:{requested:location.search,mapId:g?.mapDef?.id??null,layoutId:g?.layoutId??null,native:!!G.level?.native,manifestId:G.level?.manifest?.id??null,sourceSha256:G.level?.manifest?.sourceSha256??null,sourceMode:G.level?.manifest?.sourceMode??null},
     showcase:s?{mode:s.mode??null,fullFrame:!!s.fullFrame,warmState:s._warmState??null,warmCharacter:character(s._warmChar),portraitCharacter:character(s._portraitCharacter),portraitTask:!!s._portraitTask,portraitJob:!!s._portraitJob,portraitPrepared:!!s._portraitPreparedCharacter,portraitActive:!!s._portraitActiveCharacter,portraitQueue:s._pq?.length??null,portraitInFlight:s._pflight??0,portraitCache:s._pcache?.size??null,characters:s.chars?.length??null,scene:scene(s.scene),compositeScene:scene(s.compScene),portraitResolveScene:scene(s._presScene),targets:{overlay:target(s._rt),portrait:target(s._prt),portraitResolve:target(s._prt8)},lobby:{exists:!!s.lob,ready:!!s.lob?.ready,members:s.lob?.members?.size??null}}:null,
     environment:{cloud:target(e?._cloudRT),environment:target(e?._envRT),reflection:target(e?._reflRT),farReflection:target(e?._farRT)},
     post:{read:target(composer?.readBuffer),write:target(composer?.writeBuffer),passes:composer?.passes?.map(p=>({type:p.constructor?.name??null,enabled:p.enabled??null,needsSwap:p.needsSwap??null}))??null},mainWarmMeshes:g?._warmMeshes?.length??0};
   };
  });
  await page.waitForFunction(()=>{const g=BG.game;if(g)g.frozen=true;return !!(g?.debug&&BG.s3?.installed&&BG.mode!=='boot')||!!document.querySelector('#boot-error')?.textContent;},null,{timeout:timeouts.bootMs});
  const bootError=await page.locator('#boot-error').textContent();if(bootError)throw Error(bootError);
  trial.privateAfterBoot=await page.evaluate(()=>window.benchPrivateState());save();await inventory('after-boot');
  // Let the unchanged production menu initiate registration and finish its
  // integrity-checked install. Never register, bypass, block or disable the SW.
  await page.waitForFunction(()=>globalThis.__inkwaveStartup?.report?.cache?.offlineReady===true&&navigator.serviceWorker?.controller?.state==='activated',null,{timeout:timeouts.pwaMs});
  await page.evaluate(()=>{
   window.benchPwaStatus=async()=>{
    const registrations=await navigator.serviceWorker.getRegistrations();
    const controller=navigator.serviceWorker.controller;
    const status=await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();channel.port2.close();reject(Error('PWA cache status timed out'));},10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(e.data);};if(!controller){clearTimeout(timer);reject(Error('PWA not controlled'));return;}controller.postMessage({type:'INKWAVE_CACHE_STATUS'},[channel.port2]);});
    return {controller:controller?.scriptURL||null,controllerState:controller?.state||null,registrations:registrations.map(r=>({scope:r.scope,active:r.active?.state||null,waiting:r.waiting?.state||null,installing:r.installing?.state||null})),status};
   };
  });
  trial.pwaReady=await page.evaluate(()=>window.benchPwaStatus());
  trial.privateAfterPwa=await page.evaluate(()=>window.benchPrivateState());save();await inventory('after-pwa');
  if(trial.pwaReady.status?.revision!==variants[variant].manifest.build.revision||!trial.pwaReady.status?.offlineReady)throw Error('Wrong or incomplete PWA revision');
  // A real keyboard gesture enables audio through the unchanged production path.
  await page.keyboard.press('Shift');
  trial.setup=await bounded(page.evaluate(async({stage,warmup,scenario,input,gpuTiming})=>{
   const G=BG,g=G.game;g.debug.freeze();g.menus.wipe.cancel();
   G.audio.rng=window.benchAudioRng;
   // Music already exposes an explicit seed option. Preserve real music/timer
   // work while ensuring track creation cannot perturb the gameplay RNG stream.
   const musicPlay=G.music.play;G.music.play=function(track,opts={}){return musicPlay.call(this,track,{...opts,seed:883122});};
   window.benchSeed(0);G.time=0;g.rig.time=0;g.rig.shakeSeed=.25;
   await g.startMatch({mapId:stage,mode:'turf',difficulty:'normal',duration:180});g.debug.freeze();
   await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));
   await Promise.all(G.actors.map(a=>a.character.warmAll()));
   g.R.setDynamicScale(1);g._skipRender=true;g.s3Clock?.reset();
   for(let i=0;i<330;i++){window.benchSeed(i);g._frame(1/60);}
   if(g.match.state!=='playing')throw Error('Countdown not complete');
   const nodes=G.nav.nodes.filter(n=>Number.isFinite(n.y)).sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)||a.id-b.id),anchor=nodes[0];
   const near=nodes.filter(n=>Math.abs(n.y-anchor.y)<.5&&Math.hypot(n.x-anchor.x,n.z-anchor.z)<5).slice(0,8);
   if(near.length!==8||G.actors.length!==8)throw Error('Eight-actor fixture not available');
   const center={x:near.reduce((s,n)=>s+n.x,0)/8,y:near.reduce((s,n)=>s+n.y,0)/8,z:near.reduce((s,n)=>s+n.z,0)/8};
   window.benchCamera=()=>{G.camera.position.set(center.x,center.y+12,center.z-12);G.camera.lookAt(center.x,center.y+1,center.z);G.camera.updateMatrixWorld();};
   const render=g.R.render.bind(g.R);g.R.render=function(...args){window.benchCamera();return render(...args);};
   window.benchBotCalls=0;window.benchPlayerCalls=0;
   const outward=a=>{a.intent.move.set(0,0,0);a.intent.fire=true;a.intent.squid=false;a.intent.jump=false;a.intent.sub=false;a.intent.special=false;a.aimYaw=Math.atan2(a.pos.x-center.x,a.pos.z-center.z);a.aimPitch=-.6;a.aimPoint.set(a.pos.x+Math.sin(a.aimYaw)*4,center.y,a.pos.z+Math.cos(a.aimYaw)*4);};
   if(scenario==='normal'){
    const c=g.match.controller;if(!c)throw Error('Normal PlayerController missing');
    const update=c.update;c.update=function(dt){window.benchPlayerCalls++;const out=update.call(this,dt);if(input==='outward-fire')outward(g.match.local);return out;};
    const aim=c.computeAim;c.computeAim=function(...args){const out=aim.apply(this,args);if(input==='outward-fire')outward(g.match.local);return out;};
   }
   for(let i=0;i<8;i++){
    const a=G.actors[i],n=near[i];a.setWeapon('shooter');a.spawnAt(a.pos.clone().set(n.x,n.y+.05,n.z),0);
    if(!a.bot){if(scenario==='normal'&&a.isLocal)continue;throw Error('Required bot missing');}
    const update=a.bot.update;a.bot.update=function(dt){window.benchBotCalls++;const out=update.call(this,dt);if(input==='forward-fire')return out;a.intent.move.set(0,0,0);a.intent.fire=true;a.intent.squid=false;a.intent.jump=false;a.intent.sub=false;a.intent.special=false;a.aimYaw=Math.atan2(a.pos.x-center.x,a.pos.z-center.z);a.aimPitch=-.6;a.aimPoint.set(a.pos.x+Math.sin(a.aimYaw)*4,center.y,a.pos.z+Math.cos(a.aimYaw)*4);return out;};
   }
   if(input==='forward-fire'){g.debug.key('KeyW',true);g.debug.fire(true);}
   g.s3Clock.reset();g._skipRender=false;
   const gl=G.renderer.getContext(),pixel=new Uint8Array(4),ext=gl.getExtension('WEBGL_debug_renderer_info');
   const timer=gpuTiming?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null,queries=[];
   window.benchGpuBegin=frame=>{if(!timer)return null;const query=gl.createQuery(),entry={frame,query,disjoint:!!gl.getParameter(timer.GPU_DISJOINT_EXT)};gl.beginQuery(timer.TIME_ELAPSED_EXT,query);queries.push(entry);return entry;};
   window.benchGpuEnd=entry=>{if(entry){gl.endQuery(timer.TIME_ELAPSED_EXT);entry.disjoint||=!!gl.getParameter(timer.GPU_DISJOINT_EXT);}};
   window.benchGpuResults=async()=>{if(!timer)return{supported:false,requested:queries.length,valid:0,missing:0,disjoint:0,rows:[]};let pending=queries.slice(),rows=[],deadline=performance.now()+10000,anyDisjoint=queries.some(q=>q.disjoint)||!!gl.getParameter(timer.GPU_DISJOINT_EXT);while(pending.length&&performance.now()<deadline){anyDisjoint||=!!gl.getParameter(timer.GPU_DISJOINT_EXT);const next=[];for(const entry of pending){if(gl.getQueryParameter(entry.query,gl.QUERY_RESULT_AVAILABLE)){const disjoint=entry.disjoint||!!gl.getParameter(timer.GPU_DISJOINT_EXT),nanoseconds=gl.getQueryParameter(entry.query,gl.QUERY_RESULT);rows.push({frame:entry.frame,disjoint,milliseconds:disjoint?null:nanoseconds/1e6});gl.deleteQuery(entry.query);}else next.push(entry);}pending=next;if(pending.length)await new Promise(r=>setTimeout(r,2));}for(const entry of pending)gl.deleteQuery(entry.query);if(anyDisjoint)for(const row of rows){row.disjoint=true;row.milliseconds=null;}queries.length=0;return{supported:true,requested:rows.length+pending.length,valid:rows.filter(x=>!x.disjoint&&Number.isFinite(x.milliseconds)).length,missing:pending.length,disjoint:rows.filter(x=>x.disjoint).length,rows};};
   window.benchResources=()=>{let sceneNodes=0,meshes=0,materialRefs=0;const geometries=new Set(),materials=new Set(),buffers=new Set();G.scene.traverse(o=>{sceneNodes++;if(o.isMesh)meshes++;if(o.geometry){geometries.add(o.geometry);for(const a of [...Object.values(o.geometry.attributes||{}),o.geometry.index].filter(Boolean)){const array=a.array||a.data?.array;if(array?.buffer)buffers.add(array.buffer);}}for(const m of(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materialRefs++;materials.add(m);}});return{renderer:{geometries:G.renderer.info.memory.geometries,textures:G.renderer.info.memory.textures,programs:G.renderer.info.programs.length},sceneNodes,meshes,uniqueGeometries:geometries.size,uniqueMaterials:materials.size,materialRefs,uniqueAttributeBackingBytes:[...buffers].reduce((n,b)=>n+b.byteLength,0),privateOwners:window.benchPrivateState(),heap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null};};
   window.benchRead=()=>{gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(gl.getError()||gl.isContextLost()||pixel[3]!==255)throw Error('Invalid GPU-completed output');return [...pixel];};
   const scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v===null||['number','boolean','string'].includes(typeof v)&&!['uuid','id','_extTick'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
   const hash32=a=>{let h=2166136261;const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(let i=0;i<b.length;i++)h=Math.imul(h^b[i],16777619);return(h>>>0).toString(16);};
   window.benchState=()=>({time:G.time,frame:g._frameN,match:{state:g.match.state,time:g.match.time},random:window.benchRandomState(),camera:{p:G.camera.position.toArray(),q:G.camera.quaternion.toArray()},paint:{counts:[...G.paint.counts],grid:hash32(G.paint.grid)},fx:{stats:G.fx.stats?.(),dN:G.fx.dN},actors:G.actors.map(a=>({alive:a.alive,hp:a.hp,ink:a.ink,form:a.form,pos:a.pos.toArray(),vel:a.vel.toArray(),weapon:a.weaponId,aim:{yaw:a.aimYaw,pitch:a.aimPitch,point:a.aimPoint.toArray()},intent:{fire:a.intent.fire,squid:a.intent.squid,jump:a.intent.jump,move:a.intent.move.toArray()},worldPose:a.character.boneList.map(b=>b.matrixWorld.elements.slice()),gpuBoneMatrices:Array.from(a.character.skeleton.boneMatrices),motion:scalar(a.character.sourceMotion)}))});
   window.benchFrame=frame=>{window.benchSeed(frame);const beforeBots=window.benchBotCalls,beforePlayer=window.benchPlayerCalls,query=window.benchGpuBegin(frame),t=performance.now();g._frame(1/60);const submit=performance.now();window.benchGpuEnd(query);const pixel=window.benchRead(),complete=performance.now();return{frame,submitMs:submit-t,readbackMs:complete-submit,completedMs:complete-t,pixel,botCalls:window.benchBotCalls-beforeBots,playerCalls:window.benchPlayerCalls-beforePlayer,alive:G.actors.filter(a=>a.alive).length,calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,scale:g.R.dynScale,gameTime:G.time,fxDrops:G.fx.dN,projectiles:G.projectiles.list.length,rng:window.benchRandomState()};};
   window.benchCapture=()=>{const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return{rgba:Array.from(bytes),png:G.renderer.domElement.toDataURL('image/png').split(',')[1]};};
   return{native:!!G.level.native,atlas:G.paint.size,actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,playerController:!!g.match.controller,settings:g.settings,mobile:g.mobile,audio:{on:g._audioOn,state:G.audio.ctx?.state,music:G.music.track,worker:!!G.music.worker},width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimerQuery:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),near:near.map(n=>({id:n.id,x:n.x,y:n.y,z:n.z})),prewarmState:window.benchState()};
  },{stage,warmup,scenario,input,gpuTiming}),timeouts.setupMs,'Fixture setup');
  if(trial.setup.bots!==(scenario==='crowd'?8:7)||trial.setup.playerController!==(scenario==='normal')||trial.setup.mobile.touch||trial.setup.native!==(stage==='scorch'))throw Error('Incorrect desktop-profile scenario');
  trial.privateAfterSetup=await page.evaluate(()=>window.benchPrivateState());await inventory('after-setup');
  trial.setupElapsedMs=Date.now()-setupStart;
  result.environment.renderer=trial.setup.renderer;
  if(!/SwiftShader/i.test(trial.setup.renderer))throw Error('Expected explicitly labeled software renderer');
  trial.status='warming';save();console.log(JSON.stringify({phase:'setup',ordinal,variant,renderer:trial.setup.renderer,resolution:[trial.setup.width,trial.setup.height],audio:trial.setup.audio}));
  for(let i=0;i<warmup;i++)await bounded(page.evaluate(i=>window.benchFrame(1000+i),i),timeouts.measurementMs,'Rendered warmup frame');
  const warmupGpu=await page.evaluate(()=>window.benchGpuResults());
  trial.warmupGpu=warmupGpu;
  trial.startState=await page.evaluate(()=>window.benchState());
  await inventory('before-window');
  trial.resourcesBefore=await page.evaluate(()=>window.benchResources());trial.metricsBefore=await metrics();trial.systemBefore=system();
  trial.frames=[];trial.status='measuring';save();
  // One in-browser transaction per trial; no CDP round-trip is included in frame
  // intervals. All blocking work, GPU completion, and rAF waits remain observable.
  const measured=await bounded(page.evaluate(async({samples,warmup})=>{
   const rows=[];let prevStart=null;
   for(let i=0;i<samples;i++){
    await new Promise(requestAnimationFrame);const start=performance.now(),row=window.benchFrame(1000+warmup+i);
    row.startIntervalMs=prevStart===null?null:start-prevStart;prevStart=start;rows.push(row);
   }return {rows,endState:window.benchState(),capture:window.benchCapture()};
  },{samples:result.samples,warmup}),timeouts.measurementMs,'Measured frame window');
  trial.frames=measured.rows;trial.endState=measured.endState;
  trial.systemAfter=system();trial.metricsAfter=await metrics();trial.resourcesAfter=await page.evaluate(()=>window.benchResources());
  await inventory('after-window');
  trial.gpu=await page.evaluate(()=>window.benchGpuResults());
  trial.gpu.complete=trial.gpu.supported&&trial.gpu.requested===result.samples&&trial.gpu.valid===result.samples&&trial.gpu.missing===0&&trial.gpu.disjoint===0;
  trial.gpu.validSubset=stats(trial.gpu.rows.filter(x=>Number.isFinite(x.milliseconds)).map(x=>x.milliseconds));
  trial.gpu.wholeRun=trial.gpu.complete?trial.gpu.validSubset:null;
  trial.background=await page.evaluate(async()=>({pwa:await window.benchPwaStatus(),audioState:BG.audio.ctx?.state,musicWorker:!!BG.music.worker}));
  const capture=measured.capture;
  const pixels=Buffer.from(capture.rgba);trial.pixelSha256=hash(pixels);trial.pixelBytes=pixels.length;
  const colors=new Set();let opaque=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===255)opaque++;colors.add(pixels.readUInt32LE(i));}
  trial.imageValidation={opaque,pixels:pixels.length/4,colors:colors.size};
  fs.writeFileSync(path.join(output,`trial-${ordinal}-${variant}.rgba`),pixels);
  fs.writeFileSync(path.join(output,`trial-${ordinal}-${variant}.png`),Buffer.from(capture.png,'base64'));
  trial.completed=stats(trial.frames.map(f=>f.completedMs));trial.pacing=stats(trial.frames.slice(1).map(f=>f.startIntervalMs));trial.submit=stats(trial.frames.map(f=>f.submitMs));trial.readback=stats(trial.frames.map(f=>f.readbackMs));
  trial.draws={calls:stats(trial.frames.map(f=>f.calls)),triangles:stats(trial.frames.map(f=>f.triangles))};
  trial.metricsDelta=Object.fromEntries(['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners','LayoutCount','RecalcStyleCount','ScriptDuration','TaskDuration'].map(k=>[k,(trial.metricsAfter[k]??0)-(trial.metricsBefore[k]??0)]));
  trial.status=errors.length?'failed':'complete';
  trial.invariants={allEightAlive:trial.frames.every(f=>f.alive===8),allControllersUpdated:trial.frames.every(f=>f.botCalls===(scenario==='crowd'?8:7)&&f.playerCalls===(scenario==='normal'?1:0)),fixedScale:trial.frames.every(f=>f.scale===1),nonemptyRender:trial.frames.every(f=>f.calls>0&&f.triangles>1000),audioOn:trial.setup.audio.on&&trial.setup.audio.state==='running',stableDrawingBuffer:trial.pixelBytes===trial.setup.width*trial.setup.height*4,nonblankImage:opaque===pixels.length/4&&colors.size>=32};
  save();console.log(JSON.stringify({phase:'trial-complete',ordinal,variant,completed:trial.completed,pacing:trial.pacing,invariants:trial.invariants,errors}));
  await context.close();
  if(errors.length||Object.values(trial.invariants).some(v=>!v))throw Error('Whole-game trial invariant failed');
 }
 const first=result.trials[0];
 result.comparability=result.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,startStateEqual:JSON.stringify(t.startState)===JSON.stringify(first.startState),endStateEqual:JSON.stringify(t.endState)===JSON.stringify(first.endState),pixelEqual:t.pixelSha256===first.pixelSha256,inputNodesEqual:JSON.stringify(t.setup.near)===JSON.stringify(first.setup.near),frameWorkEqual:JSON.stringify(t.frames.map(f=>({alive:f.alive,botCalls:f.botCalls,playerCalls:f.playerCalls,triangles:f.triangles,scale:f.scale,gameTime:f.gameTime,fxDrops:f.fxDrops,projectiles:f.projectiles,rng:f.rng})))===JSON.stringify(first.frames.map(f=>({alive:f.alive,botCalls:f.botCalls,playerCalls:f.playerCalls,triangles:f.triangles,scale:f.scale,gameTime:f.gameTime,fxDrops:f.fxDrops,projectiles:f.projectiles,rng:f.rng})))}));
 const differences=(a,b,p='',out=[])=>{if(out.length>=30||JSON.stringify(a)===JSON.stringify(b))return out;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){differences(a[k],b[k],p+'/'+k,out);if(out.length>=30)break;}}else out.push({path:p,a,b});return out;};
 result.stateDifferences=result.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,start:differences(first.startState,t.startState),end:differences(first.endState,t.endState)}));
 result.drawCallComparability=result.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,equalToFirst:JSON.stringify(t.frames.map(f=>f.calls))===JSON.stringify(first.frames.map(f=>f.calls))}));
 result.drawCallsComparable=result.drawCallComparability.every(t=>t.equalToFirst);
 const mainScene=r=>Object.fromEntries(['sceneNodes','meshes','uniqueGeometries','uniqueMaterials','materialRefs','uniqueAttributeBackingBytes'].map(k=>[k,r[k]]));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 result.resourceValidation={scope:'Read-only observations outside timed frames; these equalities are recorded, not included in the original workload acceptance guard',rendererAllTrialsEqual:result.trials.every(t=>equal(t.resourcesBefore.renderer,first.resourcesBefore.renderer)),rendererStableWithinWindows:result.trials.every(t=>equal(t.resourcesBefore.renderer,t.resourcesAfter.renderer)),mainSceneAllTrialsEqual:result.trials.every(t=>equal(mainScene(t.resourcesBefore),mainScene(first.resourcesBefore))),privateOwnersAllTrialsEqual:result.trials.every(t=>equal(t.resourcesBefore.privateOwners,first.resourcesBefore.privateOwners)),sameVariant:Object.fromEntries(['A','B'].map(v=>{const ts=result.trials.filter(t=>t.variant===v);return[v,{rendererRepeatEqual:ts.every(t=>equal(t.resourcesBefore.renderer,ts[0].resourcesBefore.renderer)),privateOwnerRepeatEqual:ts.every(t=>equal(t.resourcesBefore.privateOwners,ts[0].resourcesBefore.privateOwners))}];}))};
 result.performanceNondegradationEstablished=false;
 result.improvementClaimScope='The existing paired-effect flag concerns only rAF pacing; it is not overall CPU/GPU/resource nondegradation or hardware acceptance.';
 result.gameplayComparable=result.comparability.every(t=>t.startStateEqual&&t.endStateEqual&&t.inputNodesEqual&&t.frameWorkEqual);
 const byVariant=Object.fromEntries(['A','B'].map(v=>[v,result.trials.filter(t=>t.variant===v)]));
 const stable=v=>byVariant[v].length>=2&&byVariant[v].every(t=>t.pixelSha256===byVariant[v][0].pixelSha256);
 result.visualValidation={ARepeatExact:stable('A'),BRepeatExact:stable('B'),ABExact:byVariant.A[0].pixelSha256===byVariant.B[0].pixelSha256};
 result.visualValidation.accepted=result.visualValidation.ARepeatExact&&result.visualValidation.BRepeatExact&&result.visualValidation.ABExact;
 result.visualValidation.allowedChange='none; exact endpoint pixels required across both exact production SHAs';
 if(mode==='measure'){result.visualValidation.calibrationProof=acceptedCalibration.visualValidation;result.visualValidation.accepted&&=acceptedCalibration.visualValidation.accepted;}
 const readyPwa=(p,variant)=>p?.controllerState==='activated'&&p.controller===`http://127.0.0.1:${server.address().port}/${variant}/sw.js`&&p.registrations.length===1&&p.registrations.every(r=>r.active==='activated'&&!r.waiting&&!r.installing)&&p.status?.type==='INKWAVE_CACHE_STATUS'&&p.status.offlineReady===true&&p.status.revision===variants[variant].manifest.build.revision;
 result.backgroundComparable=result.trials.every(t=>readyPwa(t.pwaReady,t.variant)&&readyPwa(t.background.pwa,t.variant)&&t.background.audioState==='running'&&t.background.musicWorker===true);
 result.comparable=result.gameplayComparable&&result.visualValidation.accepted&&result.backgroundComparable;
 result.gpuComparable=gpuTiming&&result.trials.every(t=>t.gpu.complete);
 result.gpuUnresolved=gpuTiming&&!result.gpuComparable?'No whole-run GPU comparison: unsupported, missing or disjoint timer queries':!gpuTiming?'GPU time not measured':null;
 result.summary=Object.fromEntries(['A','B'].map(v=>[v,{submit:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.submitMs))),readback:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.readbackMs))),drawCalls:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.calls))),triangles:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.triangles))),gpuWholeRun:result.gpuComparable?stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.gpu.rows.map(f=>f.milliseconds))):null,completed:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.map(f=>f.completedMs))),pacing:stats(result.trials.filter(t=>t.variant===v).flatMap(t=>t.frames.slice(1).map(f=>f.startIntervalMs))),trialPacingFps:result.trials.filter(t=>t.variant===v).map(t=>t.pacing.fps),trialSynchronousFps:result.trials.filter(t=>t.variant===v).map(t=>t.completed.fps)}]));
 result.comparisonValid=result.comparable;
 result.rawObservedPacingChangePercent=100*(result.summary.A.pacing.mean-result.summary.B.pacing.mean)/result.summary.A.pacing.mean;
 result.rawObservedSynchronousChangePercent=100*(result.summary.A.completed.mean-result.summary.B.completed.mean)/result.summary.A.completed.mean;
 if(mode==='measure'){
  const pairs=[[0,1],[3,2],[5,4],[6,7]].map(([a,b])=>({A:a,B:b,improvementPercent:100*(1-result.trials[b].pacing.mean/result.trials[a].pacing.mean)}));
  const values=pairs.map(p=>p.improvementPercent),mean=values.reduce((a,b)=>a+b,0)/values.length;
  const sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)),margin=3.182446305*sd/Math.sqrt(values.length);
  result.pairedEffect={metric:'rAF start-to-start pacing',pairs,meanImprovementPercent:mean,ci95:[mean-margin,mean+margin],method:'Paired-trial mean relative effect, two-sided Student t interval, df=3; four adjacent A/B pairs; interval assumes independent, approximately normal pair effects. Small sample; not a hardware-PC inference.'};
 }
 result.improvementClaimAllowed=false; // Resource classification is never performance acceptance.
 result.resourceDiagnosticConclusion='Classification only; inspect inventory files and counter reconciliation. No resource/nondegradation adoption is established by workload or pixel parity.';
 result.acceptanceBlockers=[...(!result.gameplayComparable?['Gameplay/controller/scene workload differs; inspect comparability and stateDifferences']:[]),...(!result.visualValidation.ARepeatExact?['A endpoint pixels are not repeatable']:[]),...(!result.visualValidation.BRepeatExact?['B endpoint pixels are not repeatable']:[]),...(!result.visualValidation.ABExact?['A/B endpoint pixels differ; expected quality changes need a separate independently validated region-specific visual review']:[]),...(!result.backgroundComparable?['PWA/audio background state is not comparable']:[])];
 result.workloadGuardStatus=result.comparable?'passed':'inconclusive-workload-mismatch';
 result.status=result.comparable?'resource-diagnostic-complete':'inconclusive-workload-mismatch';
 if(mode==='calibrate'){result.projectedMeasurementMs=8*(Math.max(...result.trials.map(t=>t.completed.p50))*(warmup+samples)+Math.max(...result.trials.map(t=>t.setupElapsedMs)));result.withinFrameBudget=result.projectedMeasurementMs<45*60*1000;}
 if(!result.comparable)process.exitCode=2;
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}finally{
 result.receipts=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,[...v.receipts].sort()]));
 result.loadedArtifactBytes=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,{uniquePaths:v.receipts.size,uniqueServedBytes:[...v.receipts].reduce((n,p)=>n+fs.statSync(path.join(v.site,p)).size,0),scope:'Unique verified served URL paths across all trials, including natural PWA cache fills; root and immutable version mirrors are distinct paths, not cold-start transfer/compressed bytes.'}]));save();
 console.log(JSON.stringify({status:result.status,error:result.error,comparable:result.comparable,withinFrameBudget:result.withinFrameBudget,projectedMeasurementMs:result.projectedMeasurementMs,visualValidation:result.visualValidation,backgroundComparable:result.backgroundComparable,resourceDiagnosticOnly:result.resourceDiagnosticOnly,timingEvidenceEligible:result.timingEvidenceEligible,resourceInventories:result.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,snapshots:t.resourceInventories})),comparability:result.comparability}));
 await browser?.close();await new Promise(r=>server.close(r));
}
