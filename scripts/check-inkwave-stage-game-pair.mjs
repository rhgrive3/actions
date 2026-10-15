#!/usr/bin/env node
// Four-case private verification; never an adoption or physical-iPad verdict.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {probeProjectileVisibility} from './lib/inkwave-projectile-visibility-probe.mjs';
import {collectFrozenLighting} from './lib/inkwave-lighting-controls.mjs';
import {installCanvasCapture} from './lib/inkwave-canvas-capture.mjs';
export function initializePair(){
 localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));
 globalThis.__resetPairRandom=()=>{let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};globalThis.__resetPairRandom();
}
export async function connectPair(){globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;globalThis.T=await import(new URL('vendor/three/build/three.module.js',document.baseURI));}
export function pairBooted(){return !!(NG.game?.menus&&NG.mode!=='boot');}
export async function preparePair({mapId,quality='low',shadows=false}){
 const G=NG,g=G.game;g.debug.freeze();globalThis.__resetPairRandom();g._skipRender=true;g.menus.wipe.cancel();
 if(g.settings.quality!==quality)throw Error('Expected requested quality before preparation');
 g._setSettings({shadows,bloom:false});
 const picker=g._pickPalette;let picks=0;
 g._pickPalette=function(...args){const random=Math.random;Math.random=()=>.7;try{picks++;return picker.apply(this,args);}finally{Math.random=random;}};
 try{await g.startMatch({mapId,mode:'turf',difficulty:'normal',time:'day'});}finally{g._pickPalette=picker;}
 if(picks!==1||g.palette.id!=='aqua-cherry')throw Error('Native controlled palette selection did not match pinned config');
 g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.debug.fire(false);
 for(let i=0;i<240;i++)g._frame(1/60);G.paint.flush(1/60);
 const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {baseURI:document.baseURI,mapId,actualMap:G.level.layout.id,native:!!G.level.native,source:G.level.manifest?.sourceSha256??null,teamHex:[...(G.teamHex||[])],quality:g.settings.quality,shadows:G.renderer.shadowMap.enabled,theme:g.theme,mobile:g.mobile,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight,devicePixelRatio],canvas:[G.renderer.domElement.width,G.renderer.domElement.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),actor:G.local.pos.toArray(),camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray(),near:G.camera.near,far:G.camera.far},rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},time:G.time};
}
export function validatePairInputs(baseline,fixed){
 const changed=[...new Set([...Object.keys(baseline.files),...Object.keys(fixed.files)])].filter(k=>baseline.files[k]!==fixed.files[k]);
 assert.ok(changed.length>0,'Candidate must differ from baseline');return changed;
}
// Verify the exact bytes BEFORE fulfilling the browser request. This avoids
// Chromium's finite inspector response cache without substituting a later fetch.
export async function verifyAndDeliverArtifact(route,baseURL,manifest,row){
 const requestURL=new URL(route.request().url()),base=new URL(baseURL);
 if(requestURL.origin!==base.origin||!requestURL.pathname.startsWith(base.pathname))return route.continue();
 const relative=requestURL.pathname.slice(base.pathname.length)||'index.html',expected=manifest.artifacts[relative];
 if(!expected){if(/\.(?:m?js|css)$/.test(relative)){row.errors.push('Unmanifested module '+relative);await route.abort('failed');return;}return route.continue();}
 try{
  const response=await route.fetch({timeout:90000});assert.ok(response.ok(),'Loaded artifact HTTP failure '+relative);
  const headers={...response.headers()},declared=Number(headers['content-length']);assert.ok(!Number.isFinite(declared)||declared<=32*1024*1024,'Artifact size exceeds bound '+relative);
  const bytes=await response.body();assert.ok(bytes.length<=32*1024*1024,'Decoded artifact size exceeds bound '+relative);
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');row.loadedArtifacts.push({path:relative,bytes:bytes.length,sha256:actual,expected,match:actual===expected,method:'intercept-fetch-hash-fulfill'});
  assert.equal(actual,expected,'Loaded artifact hash mismatch '+relative);
  // APIResponse.body is decoded; do not deliver stale compression/length headers.
  delete headers['content-encoding'];delete headers['transfer-encoding'];headers['content-length']=String(bytes.length);
  await route.fulfill({status:response.status(),headers,body:bytes});
 }catch(error){row.errors.push(relative+': '+String(error));await route.abort('failed').catch(()=>{});}
}
export async function verifyPairRequest(route,url,manifest,row){
 const u=new URL(route.request().url());
 if(u.pathname.endsWith('/Vss_Upland03.obj')){
  const pin='0611f51b35c9736ee986fb2218461e2585b7875e';
  assert.equal(u.hostname,'media.githubusercontent.com');assert.equal(u.pathname,`/media/kirakira-dev/KiTrix/${pin}/stages/Vss_Upland03/Vss_Upland03.obj`);
  const response=await route.fetch({timeout:180000});assert.ok(response.ok());const bytes=await response.body();assert.ok(bytes.length<64*1024*1024);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,'bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3');row.sourceDownloads.push({url:u.href,bytes:bytes.length,sha256});
  const headers={...response.headers()};delete headers['content-encoding'];delete headers['transfer-encoding'];headers['content-length']=String(bytes.length);return route.fulfill({status:response.status(),headers,body:bytes});
 }
 return verifyAndDeliverArtifact(route,url,manifest,row);
}
export function finalizePairCase(row){if(row.errors.length||row.loadedArtifacts.some(r=>!r.match))row.complete=false;return row.complete;}
export function describePairEvidence(report){
 const shot=(variant,mapId)=>report.cases.find(c=>c.variant===variant&&c.mapId===mapId)?.projectiles?.cases[0];
 const old=shot('baseline','inkblot'),fixed=shot('fixed','inkblot');
 const immediate=old?.trace?.[0];
 return {scope:'Historical controlled behavior comparison; collection and matched conditions are separate gates',baselineImmediateCollisionReproduced:!!(immediate?.dead&&immediate.world?.some(h=>h.hit&&h.distance===0&&h.nativeObject!=null)),candidateFirstStepSurvived:fixed?.firstNativeStep?.survived>0,candidateFrames:(fixed?.temporal?.frames||[]).map(f=>({frame:f.frame,survives:f.survives,nativeVisible:f.nativeVisibilityEstablished})),matchedPair:report.matchedConditions.every(r=>r.matched)&&report.matchedLaunch.every(r=>r.matched)};
}
export function validatePairOutcome(report){return {matched:report.outcomes.matchedPair,oldFalseContact:report.outcomes.baselineImmediateCollisionReproduced,newFirstStepSurvival:report.outcomes.candidateFirstStepSurvived,newNativeFrames:report.outcomes.candidateFrames.length===4&&report.outcomes.candidateFrames.every(f=>f.survives>0&&f.nativeVisible),realAdmission:report.cases.length===4&&report.cases.every(r=>r.projectiles?.cases[0]?.admissions?.some(a=>a.controllerActor&&a.mouseFire&&a.intentFire&&a.runnerFire&&a.runnerDt===1/60&&a.alive)),proceduralPreserved:JSON.stringify(report.cases.find(c=>c.variant==='baseline'&&c.mapId==='tidewater')?.projectiles?.cases[0]?.trace)===JSON.stringify(report.cases.find(c=>c.variant==='fixed'&&c.mapId==='tidewater')?.projectiles?.cases[0]?.trace)};}
export async function runPair(candidateSite,out,baselineSite){
 const {chromium}=await import('playwright');fs.mkdirSync(out,{recursive:true});
 const report={status:'running',scope:'Exact immutable main/candidate controlled actual-Game input and renderer comparison; controlled seeded original spawn, no replacement muzzle/pose/collision. Broad aggregate differs, so this is not collision-only attribution. Chromium emulation is not physical iPad or the user photograph. No FPS or Nintendo hardware equivalence.',sourceBaseline:process.env.BASELINE_SHA,sourceCandidate:process.env.CANDIDATE_SHA,cases:[],errors:[],visibilityEstablished:false};
 const save=()=>fs.writeFileSync(path.join(out,'projectile-pair.json'),JSON.stringify(report,null,2));save();
 const baselineBytes=fs.readFileSync(path.join(baselineSite,'inkwave-build.json')),baseline=JSON.parse(baselineBytes),fixed=JSON.parse(fs.readFileSync(path.join(candidateSite,'inkwave-build.json')));
 const bindings=JSON.parse(fs.readFileSync(process.env.STAGE_PAIR_BINDINGS));
 for(const [name,manifest,site,expected]of [['baseline',baseline,baselineSite,process.env.BASELINE_SHA],['candidate',fixed,candidateSite,process.env.CANDIDATE_SHA]]){
  assert.match(expected||'',/^[0-9a-f]{40}$/);assert.equal(bindings[name].head,expected);assert.equal(bindings[name].manifestSHA256,crypto.createHash('sha256').update(fs.readFileSync(path.join(site,'inkwave-build.json'))).digest('hex'));assert.equal(bindings[name].dirty,false,'Build checkout must be clean');
 }
 report.bindings=bindings;

 report.changedInputs=validatePairInputs(baseline,fixed);report.baseline={contentHash:baseline.contentHash,inputHash:baseline.inputHash,assetRevision:baseline.build.revision};report.fixed={contentHash:fixed.contentHash,inputHash:fixed.inputHash,assetRevision:fixed.build.revision};
 fs.writeFileSync(path.join(out,'baseline-build.json'),JSON.stringify(baseline,null,2));fs.writeFileSync(path.join(out,'fixed-build.json'),JSON.stringify(fixed,null,2));
 for(const[site,manifest]of [[baselineSite,baseline],[candidateSite,fixed]])for(const[p,expected]of Object.entries(manifest.artifacts))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,p))).digest('hex'),expected,'Emitted artifact mismatch '+p);
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
 const makeServer=root=>http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
 const servers={baseline:makeServer(baselineSite),fixed:makeServer(candidateSite)};await Promise.all(Object.values(servers).map(server=>new Promise(r=>server.listen(0,'127.0.0.1',r))));let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const variant of ['baseline','fixed'])for(const mapId of ['inkblot','tidewater']){
   const row={variant,mapId,errors:[],loadedArtifacts:[],sourceDownloads:[]};report.cases.push(row);save();let context;const pendingResponses=[];
   try{
    const manifest=variant==='baseline'?baseline:fixed,url='http://127.0.0.1:'+servers[variant].address().port+'/';
    context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
    await context.routeWebSocket('**/*',socket=>{row.errors.push('Unexpected WebSocket blocked by offline-only gate');socket.close();});
    const page=await context.newPage();await page.route('**/*',route=>{const task=verifyPairRequest(route,url,manifest,row).catch(async error=>{row.errors.push(String(error));await route.abort('failed').catch(()=>{});});pendingResponses.push(task);return task;});page.on('pageerror',e=>row.errors.push(String(e)));page.setDefaultTimeout(30000);
    await page.addInitScript(initializePair);await page.goto(url+'?map='+mapId,{waitUntil:'domcontentloaded',timeout:90000});
    const served=await page.request.get(new URL('inkwave-build.json',url).href);assert.ok(served.ok());assert.deepEqual(await served.json(),manifest,'Served target changed');
    await page.evaluate(connectPair);await page.waitForFunction(pairBooted,null,{timeout:180000});await page.evaluate(installCanvasCapture);
    row.conditions=await page.evaluate(preparePair,{mapId});assert.equal(row.conditions.actualMap,mapId,'Requested stage was not installed');assert.equal(row.conditions.native,mapId==='inkblot');if(mapId==='inkblot')assert.equal(row.conditions.source,manifest.build.nativeStages.stages.find(s=>s.id===mapId).sourceSha256,'Native source identity changed');if(mapId==='inkblot')assert.ok(row.sourceDownloads.length>0,'Fresh pinned OBJ request must be observed');assert.ok(row.conditions.baseURI.endsWith('/_versions/'+manifest.build.revision+'/'),'HTML asset revision changed');
    row.projectiles=await probeProjectileVisibility(page,path.join(out,variant+'-'+mapId),{casePlan:[{scenario:'original-stance',weapon:'shooter',frames:[1,2,3,6],resetFiringRandom:true}]});
    assert.equal(row.projectiles.complete,true,'Native temporal collection incomplete');await Promise.all(pendingResponses);assert.ok(row.loadedArtifacts.some(r=>r.path.endsWith('/src/game/inkCollision.js')),'Actual collision module response not verified');assert.equal(row.errors.length,0,'Browser runtime or artifact error');row.complete=true;
   }catch(e){row.error=String(e?.stack||e);row.complete=false;}finally{await Promise.all(pendingResponses);try{await context?.close();}catch(error){row.errors.push('Context close: '+String(error));}await Promise.all(pendingResponses);finalizePairCase(row);save();}
  }
  // Separate high/day diagnostic contexts. Never modify the paired low/day shot conditions.
  report.lightingCases=[];
  for(const variant of ['baseline','fixed']){
   const row={variant,mapId:'inkblot',scope:'high/day lighting only; not dusk/photo/iPad equivalence',errors:[],loadedArtifacts:[],sourceDownloads:[]};report.lightingCases.push(row);let context;const pending=[];
   try{
    const manifest=variant==='baseline'?baseline:fixed,url='http://127.0.0.1:'+servers[variant].address().port+'/';
    context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block'});
    await context.routeWebSocket('**/*',socket=>{row.errors.push('Unexpected WebSocket blocked by offline-only gate');socket.close();});
    const page=await context.newPage();await page.route('**/*',route=>{const task=verifyPairRequest(route,url,manifest,row).catch(async error=>{row.errors.push(String(error));await route.abort('failed').catch(()=>{});});pending.push(task);return task;});page.on('pageerror',e=>row.errors.push(String(e)));
    await page.addInitScript(initializePair);await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:false,minimap:false,musicVolume:0})));
    await page.goto(url+'?map=inkblot',{waitUntil:'domcontentloaded',timeout:90000});await page.evaluate(connectPair);await page.waitForFunction(pairBooted,null,{timeout:180000});await page.evaluate(installCanvasCapture);
    row.conditions=await page.evaluate(preparePair,{mapId:'inkblot',quality:'high',shadows:true});assert.equal(row.conditions.native,true);assert.equal(row.conditions.quality,'high');assert.equal(row.conditions.shadows,true);assert.ok(row.sourceDownloads.length>0);
    row.lighting=await collectFrozenLighting(page,path.join(out,variant+'-high-day-lighting'),{expectedSourceSha:row.conditions.source,manifest});assert.equal(row.lighting.status,'collected','High/day lighting capture/restore/applicability failed');await Promise.all(pending);assert.equal(row.errors.length,0);row.complete=true;
   }catch(e){row.error=String(e?.stack||e);row.complete=false;}finally{await Promise.allSettled(pending);await context?.close();finalizePairCase(row);save();}
  }
  const lightingFields=['actualMap','native','source','teamHex','actor','camera','rig','time','quality','shadows','theme','canvas'];
  report.lightingMatched={fields:lightingFields,matched:report.lightingCases.length===2&&report.lightingCases.every(r=>r.complete)&&lightingFields.every(k=>JSON.stringify(report.lightingCases[0].conditions[k])===JSON.stringify(report.lightingCases[1].conditions[k]))};
  report.matchedConditions=['inkblot','tidewater'].map(mapId=>{const a=report.cases.find(r=>r.mapId===mapId&&r.variant==='baseline'),b=report.cases.find(r=>r.mapId===mapId&&r.variant==='fixed');const fields=['actualMap','native','source','teamHex','actor','camera','rig','time','quality','canvas'];return {mapId,matched:!!a?.conditions&&!!b?.conditions&&fields.every(k=>JSON.stringify(a.conditions[k])===JSON.stringify(b.conditions[k])),fields};});
  report.matchedLaunch=['inkblot','tidewater'].map(mapId=>{const cases=report.cases.filter(r=>r.mapId===mapId),launch=cases.map(r=>r.projectiles?.cases[0]?.trace?.[0]);const fields=['ageBefore','positionBefore','velocityBefore','actorPosition','aimDir','aimPoint'];return {mapId,matched:launch.length===2&&launch.every(Boolean)&&fields.every(k=>JSON.stringify(launch[0][k])===JSON.stringify(launch[1][k])),fields};});
  report.outcomes=describePairEvidence(report);
  report.acceptance=validatePairOutcome(report);
  report.status=report.lightingMatched.matched&&Object.values(report.acceptance).every(Boolean)&&report.cases.length===4&&report.cases.every(r=>r.complete)&&report.matchedConditions.every(r=>r.matched)&&report.matchedLaunch.every(r=>r.matched)?'collected':'incomplete';
 }finally{await browser?.close();await Promise.all(Object.values(servers).map(server=>new Promise(r=>server.close(r))));save();}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const report=await runPair(path.resolve(process.argv[2]),path.resolve(process.argv[3]),path.resolve(process.argv[4]));if(report.status!=='collected')process.exitCode=1;}
