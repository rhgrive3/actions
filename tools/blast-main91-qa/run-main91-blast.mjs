#!/usr/bin/env node
// Private standalone QA driver; NOT installed in a workflow. Only standard sandbox.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {pathToFileURL,fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createAudioRequestTrace,installAudioAbortTrace} from './audio-request-trace.mjs';
import {settleRecordedCaptureAudio} from './settle-recorded-capture-audio.mjs';
import {installStableScenarioRandom} from './stable-scenario-random.mjs';
import {installPairedBlastDiagnostics} from './paired-blast-diagnostics.mjs';
import {captureBlastPair,HEAD,VARIANT,SHELL_ALPHA} from './capture-main91-blast.mjs';
// QA-driver-only predicate; no product state mutation or helper navigation.
function mainPlayReady(){
 const g=window.__inkwave,G=window.__G,m=g?.menus,root=m?._scr?.el;
 if(!g?.debug||!Number.isFinite(g.bootMs)||G?.mode!=='menu'||!g.match?.attract||m?.current!=='main'||m?._scr?.name!=='main'||!root||root.inert)return false;
 const controls=[...document.querySelectorAll('.iw-main [data-id="play"]')];
 if(controls.length!==1)return false;
 const control=controls[0];
 if(!control.isConnected||control.disabled||!root.contains(control)||control.closest('.is-leaving')||m._modal&&!m._modal.contains(control))return false;
 let opacity=1,reachedRoot=false;
 for(let e=control.closest('[data-nav]')||control;e&&e!==root.parentNode;e=e.parentElement){
  const v=Number(getComputedStyle(e).opacity);if(!Number.isFinite(v))return false;
  opacity*=v;if(e===root){reachedRoot=true;break;}
 }
 return reachedRoot&&opacity>0.6;
}

// QA driver only. Await input admission; never change game/menu state.
function setupButtonsReady(){
 const g=window.__inkwave,G=window.__G,m=g?.menus,root=m?._scr?.el;
 if(G?.mode!=='menu'||!g?.match?.attract||m?.current!=='setup'||m?._scr?.name!=='setup'||!root||root.inert||m._starting)return false;
 for(const selector of ['.iw-setup [data-id="map-tidewater"]','.iw-setup [data-id="start"].iw-btn--start']){
  const controls=[...document.querySelectorAll(selector)];if(controls.length!==1)return false;
  const control=controls[0];if(!control.isConnected||control.disabled||!root.contains(control)||control.closest('.is-leaving')||m._modal&&!m._modal.contains(control))return false;
  let opacity=1,reached=false;
  for(let e=control.closest('[data-nav]')||control;e&&e!==root.parentNode;e=e.parentElement){
   const value=Number(getComputedStyle(e).opacity);if(!Number.isFinite(value))return false;
   opacity*=value;if(e===root){reached=true;break;}
  }
  if(!reached||opacity<=.6)return false;
 }
 return true;
}

const [rootArg,siteArg,outArg]=process.argv.slice(2);assert.ok(rootArg&&siteArg&&outArg,'usage: node run-main91-blast.mjs EXACT_CHECKOUT BUILT_SITE PRIVATE_OUTPUT');
const root=path.resolve(rootArg),site=path.resolve(siteArg),out=path.resolve(outArg);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),HEAD);
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','tracked source must be clean');
assert.equal(fs.existsSync(site),false,'fresh nonexisting build output required; never overwrite an existing build');
const buildEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('INKWAVE_')&&!['NODE_OPTIONS','NODE_PATH'].includes(k)));
execFileSync(process.execPath,['scripts/build-inkwave.mjs','inkwave-public',site],{cwd:root,env:buildEnv,stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(sha(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [f,h] of Object.entries(manifest.artifacts)){const file=path.resolve(site,f);assert.ok(file.startsWith(site+path.sep));assert.equal(sha(fs.readFileSync(file)),h,f);}
fs.mkdirSync(out,{recursive:true});
const qaRegressionTests=['verify-blast-clocks.test.mjs','audio-request-trace.test.mjs','stable-scenario-random.test.mjs','paired-blast-diagnostics.test.mjs','settle-recorded-capture-audio.test.mjs'];
for(const name of qaRegressionTests){
 const file=new URL('./'+name,import.meta.url);
 try{const log=execFileSync(process.execPath,['--test',fileURLToPath(file)],{cwd:root,env:buildEnv,encoding:'utf8',maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,name+'.tap'),log);}
 catch(e){fs.writeFileSync(path.join(out,name+'.tap'),String(e.stdout||'')+'\n'+String(e.stderr||''));throw e;}
}
const regressionTests=["patches/splatoon3/tests/blaster-direct-impact-burst.test.mjs","patches/splatoon3/tests/issue-729-blast-impact-delay.test.mjs","patches/splatoon3/tests/issue-574-blaster-knockback.test.mjs","patches/splatoon3/tests/kit-big-bubbler-blaster-contact.test.mjs","patches/network-replication/tests/blaster-knockback-authority.test.mjs"];
// Reviewed QA repair of the same four authority cases: real fire/proof delivery, not relaxed expectations.
// Immutable source checkout remains untouched; both lanes execute this exact QA fixture.
const authorityFixture='test-blaster-knockback-authority.mjs';
const regressionExecutables=regressionTests.map(f=>f==='patches/network-replication/tests/blaster-knockback-authority.test.mjs'?fileURLToPath(new URL('./'+authorityFixture,import.meta.url)):f);
for(const mode of ['source','emitted']){
 const env={...buildEnv,BLAST_SOURCE_ROOT:root,...(mode==='emitted'?{INKWAVE_BUILT_SITE:site,INKWAVE_EDGECASE_SITE:site}:{})};
 try{const log=execFileSync(process.execPath,['--experimental-vm-modules','--test',...regressionExecutables],{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,mode+'-regression.tap'),log);}
 catch(e){fs.writeFileSync(path.join(out,mode+'-regression.tap'),String(e.stdout||'')+'\n'+String(e.stderr||''));throw e;}
 try{const log=execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(new URL('./test-blast-alpha-routing.mjs',import.meta.url))],{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,mode+'-routing.tap'),log);}
 catch(e){fs.writeFileSync(path.join(out,mode+'-routing.tap'),String(e.stdout||'')+'\n'+String(e.stderr||''));throw e;}
}
fs.writeFileSync(path.join(out,'regression-receipt.json'),JSON.stringify({sourceHead:HEAD,variant:VARIANT,tests:regressionTests,source:'passed',emitted:'passed',routing:{source:'passed',emitted:'passed'},authorityFixture:{reason:"original authority cases preserved; real fire and authenticated owner tick provide required proof in final composition; immutable source tests untouched",file:authorityFixture,sha256:sha(fs.readFileSync(new URL('./'+authorityFixture,import.meta.url))),source:'passed',emitted:'passed'},qaContracts:qaRegressionTests},null,2));
// CI must build site from this exact clean checkout in the preceding step.
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','tracked source must be clean');
const lib=n=>import(pathToFileURL(path.join(root,'scripts/lib',n)).href);
const {startProjectileThroughMenu}=await lib('inkwave-projectile-menu-start.mjs');
const {completeNativeTurfIntro}=await lib('inkwave-projectile-ci-intro.mjs');
const {serveProjectileCaptureFile}=await lib('inkwave-projectile-http-file.mjs');
const {launchSandboxBrowser}=await lib('inkwave-sandbox-browser.mjs');
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),f=path.resolve(site,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));assert.ok(f.startsWith(site+path.sep));serveProjectileCaptureFile(req,res,f,mime);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page;
const driver={head:HEAD,variant:VARIANT,shellAlpha:SHELL_ALPHA,manifestHash:manifest.contentHash,buildRevision:manifest.build.revision,launch:'existing launchSandboxBrowser; chromiumSandbox:true; no local --no-sandbox fallback',cases:[],status:'incomplete'};
fs.mkdirSync(out,{recursive:true});const save=()=>fs.writeFileSync(path.join(out,'driver-receipt.json'),JSON.stringify(driver,null,2));save();
const audioTrace=createAudioRequestTrace();driver.audioRequestTrace=audioTrace.data;
 async function audioSnapshot(label){
  if(!page||page.isClosed()){audioTrace.snapshot(label,{unavailable:'page absent or closed'});save();return;}
  let timer;try{const state=await Promise.race([page.evaluate(()=>{const loader=globalThis.__G?.audio?._realS3Loader;return{browserMonoMs:performance.now(),abortTrace:globalThis.__blastAudioAbortTrace??null,loader:loader?{stats:loader.stats(),errors:loader.errors.slice(),totalErrorCount:loader.totalErrorCount}:null};}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('audio snapshot timeout')),2000);})]);audioTrace.snapshot(label,state);}catch(e){audioTrace.snapshot(label,{unavailable:String(e).slice(0,1000)});}finally{clearTimeout(timer);}save();
 }
try{
 browser=await launchSandboxBrowser(chromium);driver.browser=browser.version();driver.browserLaunched=true;save();const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,serviceWorkers:'block'});page=await context.newPage();
 const errors=driver.pageErrors=[];driver.requestFailures=[];driver.httpErrors=[];driver.menuAttempts=[];driver.consoleErrors=[];
 page.on('pageerror',e=>{driver.pageErrorCount=(driver.pageErrorCount||0)+1;if(errors.length<100)errors.push(String(e).slice(0,2000));save();});
 page.on('console',m=>{if(['error','warning'].includes(m.type())&&driver.consoleErrors.length<50){driver.consoleErrors.push({type:m.type(),text:m.text().slice(0,1000)});save();}});
 page.on('request',r=>audioTrace.started(r));page.on('requestfinished',r=>audioTrace.finished(r));
 page.on('requestfailed',r=>{audioTrace.failed(r);if(driver.requestFailures.length<100)driver.requestFailures.push({url:r.url().slice(0,2000),failure:r.failure()});save();});
 page.on('response',r=>{audioTrace.headers(r);if(r.status()>=400&&driver.httpErrors.length<100){driver.httpErrors.push({url:r.url().slice(0,2000),status:r.status()});save();}});
 await page.addInitScript(installAudioAbortTrace);
 await page.addInitScript(installStableScenarioRandom);
 await page.addInitScript(installPairedBlastDiagnostics);
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,minimap:false,cameraShake:0,colorblind:true,difficulty:'normal',matchLength:180,lastStage:'tidewater',lastMode:'turf',stageTimes:{tidewater:'day'}}));
 });
 async function bootAndWarm(){
  const events=[];const attempt={events,observations:[],startedAt:Date.now()};driver.menuAttempts.push(attempt);events.push=(...items)=>{const n=Array.prototype.push.apply(events,items);save();return n;};save();const navigation=audioTrace.beginNavigation();try{await page.goto(`http://127.0.0.1:${server.address().port}/?map=tidewater&difficulty=normal&skipTitle`,{waitUntil:'domcontentloaded',timeout:60000});audioTrace.endNavigation(navigation);}catch(e){audioTrace.endNavigation(navigation,'failed');throw e;}
  const deadline=Date.now()+180000;
  let lastObservation=0,lastLabel='';
  const waitForPhase=async(fn,label)=>{while(Date.now()<deadline){
   if((label!==lastLabel||Date.now()-lastObservation>=10000)&&attempt.observations.length<24){
    lastLabel=label;lastObservation=Date.now();
    try{const state=await page.evaluate(()=>{const g=window.__inkwave,G=window.__G,m=g?.menus;return {mode:G?.mode??null,current:m?.current??null,screen:m?._scr?.name??null,screenInert:m?._scr?.el?.inert??null,starting:m?._starting??null,isLaunch:!!m?._scr?.el?.classList.contains('is-launch'),wipe:m?.wipe?{busy:m.wipe.busy,running:m.wipe.running,mode:m.wipe.r?.mode,t:m.wipe.r?.t,midDone:m.wipe.r?.midDone,midAt:m.wipe.r?.midAt,dur:m.wipe.r?.dur}:null,setupControls:[...document.querySelectorAll('.iw-setup [data-id="map-tidewater"],.iw-setup [data-id="start"].iw-btn--start')].slice(0,4).map(control=>{let opacity=1;const root=m?._scr?.el;for(let e=control.closest('[data-nav]')||control;e&&e!==root?.parentNode;e=e.parentElement){const v=Number(getComputedStyle(e).opacity);opacity*=v;if(e===root)break;}return{id:control.dataset.id,opacity,disabled:!!control.disabled,connected:control.isConnected,contained:!!root?.contains(control),leaving:!!control.closest('.is-leaving'),modalBlocked:!!m?._modal&&!m._modal.contains(control)};}),bootMs:g?.bootMs??null,matchState:g?.match?.state??null,attract:g?.match?.attract??null,visibility:document.visibilityState,readyState:document.readyState,stage:g?.match?.mapId??null,setup:m?._setup?{mode:m._setup.mode,mapId:m._setup.mapId}:null,screenText:m?._scr?.el?.textContent?.slice(0,1200)??null,visibleDialogs:[...document.querySelectorAll('[role=dialog]')].filter(e=>e.getBoundingClientRect().width>0).slice(0,8).map(e=>e.textContent?.slice(0,400)),play:[...document.querySelectorAll('.iw-main [data-id="play"]')].slice(0,8).map(e=>({disabled:e.disabled,connected:e.isConnected,leaving:!!e.closest('.is-leaving')}))};});attempt.observations.push({label,at:new Date().toISOString(),state});save();}catch(e){attempt.observations.push({label,error:String(e)});save();}
   }
   if(await page.evaluate(fn)&&(label!=='native main menu readiness'||await page.evaluate(mainPlayReady))&&(label!=='native setup menu'||await page.evaluate(setupButtonsReady)))return;await page.waitForTimeout(250);
  }throw Error(label+' timeout');};
  await startProjectileThroughMenu(page,{waitForPhase,remainingMs:()=>deadline-Date.now(),receipt:events});
  await waitForPhase(()=>{const g=window.__inkwave,G=window.__G;return G?.mode==='match'&&g?.match===G.match&&!g.match.attract&&g.match.local?.isLocal&&g.match.controller&&['intro','playing'].includes(g.match.state);},'native admission');
  const intro=await page.evaluate(completeNativeTurfIntro);
  const warm=await page.evaluate(()=>{
   const G=__G,g=__inkwave,a=g.match.local;g.debug.freeze();g.debug.freezeBots();g._skipRender=true;
   for(let i=0;a.s3?.squidSpawn&&i<180;i++)g._frame(1/60);
   if(a.s3?.squidSpawn||!a.alive||!a.grounded)throw Error('native spawn lifecycle not settled');
   a.setWeapon('blaster');const origin=a.pos.toArray();
   // Actual stage paint fixture via native public paint API, no sample()/flags spoof.
   G.paint.splat(a.pos,12,a.team);G.paint.flush(1/60);
   g.debug.key('ShiftLeft',true);g.debug.key('KeyW',true);g.debug.key('Space',false);
   let frames=0;for(;frames<120;frames++){g._frame(1/60);if(a.form==='squid'&&a.submerged&&a.grounded&&Math.hypot(a.vel.x,a.vel.z)>=8.7&&!a.weaponRunner.busy()&&!(a.fireBuffer>0))break;}
   if(frames>=120)throw Error('native own-ink swim admission failed');
   return {origin,actor:a.pos.toArray(),velocity:a.vel.toArray(),frames,form:a.form,submerged:a.submerged,grounded:a.grounded,weapon:a.weaponId,paintFixture:'native splat radius12 at native settled spawn'};
  });
  audioTrace.setPhase('settle-native-recorded-audio');
  const audioSettlement=await page.evaluate(settleRecordedCaptureAudio,{timeoutMs:90000});
  (driver.audioSettlements??=[]).push(audioSettlement);save();
  assert.equal(audioSettlement.status,'ready','native selected kit audio must settle without errors before capture');
  events.push({intro,warm,audioSettlement});return {events,warm};
 }
 // First prepare computes native scene coordinates; subsequent cases fresh reload.
 let first=await bootAndWarm();const origin=first.warm.origin;
 const blastPosition=[origin[0],origin[1]+1.8,origin[2]+5];
 const camera={position:[origin[0],origin[1]+2,origin[2]-4],target:blastPosition};
 let previousAudioCase=null;
 const prepareCase=async(_page,{withRoll})=>{if(previousAudioCase)await audioSnapshot(previousAudioCase+'-end');const setup=first||await bootAndWarm();first=null;previousAudioCase=withRoll?'blast-roll':'blast-only';audioTrace.setPhase('capture-'+previousAudioCase);await audioSnapshot(previousAudioCase+'-start');driver.cases.push({withRoll,...setup});save();return {nativeMatch:true,verifiedHead:HEAD,contentHash:manifest.contentHash,allArtifactHashesVerified:true,...setup};};
 const admitRoll=async()=>page.evaluate(()=>{
  const g=__inkwave,G=__G,a=g.match.local,before={time:G.time,velocity:a.vel.toArray(),form:a.form,submerged:a.submerged,grounded:a.grounded,jump:a.intent.jump,busy:a.weaponRunner.busy(),fireBuffer:a.fireBuffer};
  if(a.intent.jump||a.weaponRunner.busy()||a.fireBuffer>0||a.s3?.actions?.roll)throw Error('roll requires clean rising jump edge');
  g.debug.key('KeyW',false);g.debug.key('KeyS',true);g.debug.key('Space',true);
  // Exact native controller->match order, deliberately stop BEFORE FX.update.
  G.time+=1/60;g.match.updateController(1/60);g.match.update(1/60);g.input.endFrame();
  const r=a.s3?.actions?.roll;if(!(r?.time>0)||a.grounded||a.form!=='squid')throw Error('native reverse+jump input did not admit airborne roll');
  g.debug.key('Space',false);g.debug.key('KeyS',false);
  return {realInputRollAdmission:true,before,after:{time:G.time,intentMove:a.intent.move.toArray(),reverseAngleDegrees:(()=>{const v=before.velocity,m=a.intent.move;return Math.acos(Math.max(-1,Math.min(1,(v[0]*m.x+v[2]*m.z)/(Math.hypot(v[0],v[2])*Math.hypot(m.x,m.z)))))*180/Math.PI;})(),remaining:r.time,armorTime:r.armorTime,armorHP:r.armorHP,velocity:a.vel.toArray(),grounded:a.grounded},input:['ShiftLeft held','KeyW up','KeyS down','Space rising','native updateController','native match.update','stop before FX.update']};
 });
 await captureBlastPair({page,out,expectedContentHash:manifest.contentHash,prepareCase,admitRoll,camera,blastPosition});
 await audioSnapshot('blast-roll-end');
 assert.deepEqual(errors,[]);driver.status='captured-not-reviewed';driver.browser=browser.version();save();
} catch(e){driver.error=String(e.stack||e);save();
 driver.failureDiagnosticImage={scope:'post-failure QA navigation diagnostic, not blast comparison frame',status:'not-captured'};
 if(page&&!page.isClosed())try{const dir=path.join(out,'diagnostics');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'menu-failure.png');await page.screenshot({path:file,timeout:10000});Object.assign(driver.failureDiagnosticImage,{status:'captured',file:'diagnostics/menu-failure.png',sha256:sha(fs.readFileSync(file))});}catch(imageError){driver.failureDiagnosticImage.error=String(imageError);}else driver.failureDiagnosticImage.error='owned page absent or already closed';
 save();throw e;}finally{await audioSnapshot('before-close');audioTrace.beginClose();save();try{await browser?.close();}finally{audioTrace.endClose();save();await new Promise(r=>server.close(r));}}
