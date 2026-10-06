import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validateIdleResult, captureColdDiagnostics } from '../check-inkwave-idle-resources.mjs';
const sample=()=>({
  coldBoot:{quality:'high',touch:true,gamePublishedAtAllocation:false,marina:true,cloud:[1024,320],farSize:256,sameTargetsAfterBoot:true},
  clouds:['day','sunset','golden'].map(theme=>({theme,highBytes:10485760,lowBytes:2621440,meanByteError:1,largeErrorFraction:.001,highRepeatChanged:0,nonzero:1000})),
  far:Array.from({length:4},()=>({size:256,disposes:1,deleted:true,cleared:true,sameEnvironment:true})),
  pause:{renders:1,environment:0,paint:0,shadowMarks:0,menuTicks:120,matchUnchanged:true,resizeRenders:1,resumedRenders:1,onlineRenders:3},
  audio:{running:true,initialPlayers:0,initialScheduler:false,mutedTicks:0,mutedNodes:0,mutedPlayers:0,mutedScheduler:false,sfxPlayed:true,resumedTrack:'battle',toggleMaxPlayers:1},
  resultsWork:{frames:120,playing:{actorUpdates:480,projectileUpdates:120,paintFlushes:120,fxUpdates:120,worldRenders:120,gpuDrawSubmissions:1200,cpuSubmissionMs:25},results:{actorUpdates:0,projectileUpdates:0,paintFlushes:0,fxUpdates:0,worldRenders:120,gpuDrawSubmissions:1200,cpuSubmissionMs:20}},
  errors:[],gpu:{webgl:'WebGL 2.0 fixture',renderer:'schema-only'}
});
test('acceptance schema can represent all required observations, not a GPU claim',()=>assert.equal(validateIdleResult(sample()).farTransitions,4));
for(const [name,mutate] of [
 ['missing RESULT evidence',r=>delete r.resultsWork],['RESULT simulation continues',r=>r.resultsWork.results.actorUpdates=1],['RESULT paint keeps flushing',r=>r.resultsWork.results.paintFlushes=120],['RESULT presentation freezes',r=>r.resultsWork.results.worldRenders=0],['missing GPU submission counts',r=>r.resultsWork.results.gpuDrawSubmissions=0],['invalid CPU comparison',r=>r.resultsWork.playing.cpuSubmissionMs=NaN],
 ['late mobile budget',r=>r.coldBoot.gamePublishedAtAllocation=true],['oversized cold cloud',r=>r.coldBoot.cloud=[2048,640]],['oversized cold cube',r=>r.coldBoot.farSize=512],['late replacement hides cold budget',r=>r.coldBoot.sameTargetsAfterBoot=false],
 ['missing cloud theme',r=>r.clouds.pop()],['NaN appearance',r=>r.clouds[0].meanByteError=NaN],['banding outlier',r=>r.clouds[1].largeErrorFraction=.2],['blank clouds',r=>r.clouds[0].nonzero=0],
 ['unallocated cube',r=>r.far[0].deleted=false],['stale sampler',r=>r.far[2].cleared=false],['duplicate dispose',r=>r.far[1].disposes=2],
 ['paused CPU work',r=>r.pause.environment=1],['paused rendering',r=>r.pause.renders=120],['frozen online',r=>r.pause.onlineRenders=0],['music wakeup',r=>r.audio.mutedTicks=1],['muted voices',r=>r.audio.mutedNodes=1],['silent SFX',r=>r.audio.sfxPlayed=false]
])test('rejects '+name,()=>{const r=sample();mutate(r);assert.throws(()=>validateIdleResult(r));});
test('active suite invokes exact-source probe and binds its successful evidence, preserving other families',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 assert.match(w,/node scripts\/check-inkwave-idle-resources\.mjs[^\n]+--exact-source/);
 assert.match(w,/'active':\[[^\n]+'idle-resources\/idle-resources-result.json'/);
 for(const name of ['motion-detail','wall','flow','responsive','identity-touch'])assert.ok(w.includes(name));
});
test('closes the warm page after its evidence and preserves a real independent cold identity check',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
 const close=source.indexOf('await page.close();page=null;');
 assert.notEqual(close,-1,'warm page must be disposed');
 for(const marker of [
  'for(const row of cloudEvidence)', 'result.clouds=cloudEvidence;', 'result.far=await page.evaluate',
  'result.pause=await page.evaluate', "path.join(output,'offline-paused.png')",
  'result.resultsWork=await page.evaluate', 'result.gpu=await page.evaluate',
  'Runtime module not actually loaded: '
 ]){
  const at=source.indexOf(marker);
  assert.ok(at>=0&&at<close,`${marker} must be captured before warm page disposal`);
 }
 const phase=source.indexOf("phase='cold-boot-mobile';",close);
 const context=source.indexOf('browser.browser().newContext',close);
 assert.ok(close<phase&&phase<context,'cold context must start only after warm page disposal');
 const coldMarkers=[
  'hasTouch:true,isMobile:true', 'coldPage=await coldContext.newPage();', "quality:'high'",
  "if(manifest.artifacts[key]&&sha(body)!==manifest.artifacts[key])throw Error('Cold loaded byte mismatch '+key)",
  "if(!hooked&&key.endsWith('/src/main.js'))", "if(G.game||G.env)throw Error('Cold observer installed too late')",
  'gamePublishedAtAllocation:!!G.game',
  'await coldPage.waitForFunction(()=>!!window.__G?.game&&!!window.__coldEnvironment,null,',
  'sameTargetsAfterBoot:c.cloudId===G.env._cloudRT?.texture.uuid&&c.farId===G.env._farRT?.texture.uuid',
  "[...coldLoaded].some(p=>p.endsWith('/src/world/environment.js'))"
 ];
 const coldPositions=coldMarkers.map(marker=>{
  const at=source.indexOf(marker,context);
  assert.ok(at>context,`cold identity/byte proof must remain after new context: ${marker}`);
  return at;
 });
 assert.deepEqual(coldPositions,[...coldPositions].sort((a,b)=>a-b),'cold context must retain actual loaded bytes, pre-allocation observation and target identity order');
 assert.ok(source.includes('result.coldBootDiagnostics=await captureColdDiagnostics('),
  'failed cold startup must preserve the actual loaded-stage evidence');
 assert.ok(source.includes('gamePublished')&&source.includes('coldEnvironmentPublished')&&source.includes('documentReadyState'),
  'failure diagnostics must separate game, env, and document ready state');
});
test('cold failure diagnostics separate game vs env publication and bound hanging renderer',async()=>{
 const mockPageMissingEnv={
  evaluate:async()=>({
   documentReadyState:'complete',
   runtimeUrl:'http://127.0.0.1:1234/?devstage&skipTitle&map=halyard',
   observerInstalled:true,
   envSetCalls:0,
   hasG:true,
   gamePublished:true,
   envPublished:false,
   coldEnvironmentPublished:false,
   coldEnvironment:null
  }),
  screenshot:async()=>{}
 };
 const diagA=await captureColdDiagnostics({
  coldPage:mockPageMissingEnv,
  hooked:true,
  coldLoaded:new Set(['index.html','src/main.js']),
  coldPendingUrls:new Set(),
  evalTimeoutMs:50,
  screenshotTimeoutMs:50
 });
 assert.equal(diagA.hooked,true);
 assert.equal(diagA.gamePublished,true);
 assert.equal(diagA.envPublished,false);
 assert.equal(diagA.coldEnvironmentPublished,false);
 assert.equal(diagA.documentReadyState,'complete');
 assert.notEqual(diagA.gamePublished,diagA.coldEnvironmentPublished,'distinguishes missing env from missing game');

 const mockHangingPage={
  evaluate:()=>new Promise(()=>{}),
  screenshot:()=>new Promise(()=>{})
 };
 const start=performance.now();
 const diagB=await captureColdDiagnostics({
  coldPage:mockHangingPage,
  hooked:true,
  coldLoaded:new Set(['index.html','src/main.js','src/world/environment.js']),
  coldPendingUrls:new Set(['src/world/stage.js']),
  coldPageErrors:['Uncaught test error'],
  output:'/nonexistent-test-dir',
  evalTimeoutMs:50,
  screenshotTimeoutMs:50
 });
 const elapsed=performance.now()-start;
 assert.ok(elapsed<1000,`bounded timeout must return quickly, took ${elapsed}ms`);
 assert.equal(diagB.hooked,true);
 assert.deepEqual(diagB.coldLoaded,['index.html','src/main.js','src/world/environment.js']);
 assert.deepEqual(diagB.pendingUrls,['src/world/stage.js']);
 assert.deepEqual(diagB.pageErrors,['Uncaught test error']);
 assert.equal(diagB.documentReadyState,null);
 for(const field of ['observerInstalled','envSetCalls','hasG','gamePublished','envPublished','coldEnvironmentPublished'])assert.equal(diagB[field],null,`${field} must stay unknown when evaluation hangs`);
 assert.ok(diagB.evaluateError.includes('timed out after 50ms'),'eval error honestly recorded');
 assert.ok(diagB.screenshot.error.includes('timed out after 50ms'),'screenshot error honestly recorded');

 const diagC=await captureColdDiagnostics({
  coldPage:mockHangingPage,
  coldCrashed:true,
  hooked:true,
  coldLoaded:new Set(['index.html']),
  evalTimeoutMs:50,
  screenshotTimeoutMs:50
 });
 assert.equal(diagC.crashed,true);
 for(const field of ['observerInstalled','envSetCalls','hasG','gamePublished','envPublished','coldEnvironmentPublished'])assert.equal(diagC[field],null,`${field} must stay unknown after a crash`);
 assert.equal(diagC.evaluateError,'page crashed');
 assert.equal(diagC.screenshot.error,'page crashed');
});
test('cold diagnostics finish their watchdogs with no other referenced process handles',()=>{
 const moduleUrl=new URL('../check-inkwave-idle-resources.mjs',import.meta.url).href;
 const script=`import {captureColdDiagnostics} from ${JSON.stringify(moduleUrl)};
 const result=await captureColdDiagnostics({coldPage:{evaluate:()=>new Promise(()=>{}),screenshot:()=>new Promise(()=>{})},output:${JSON.stringify(new URL('.',import.meta.url).pathname)},evalTimeoutMs:15,screenshotTimeoutMs:15});
 if(!result.evaluateError?.includes('timed out')||!result.screenshot.error?.includes('timed out')||result.gamePublished!==null)process.exit(1);
 console.log('bounded diagnostics completed');`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000});
 assert.ifError(child.error);
 assert.equal(child.status,0,child.stderr);
 assert.match(child.stdout,/bounded diagnostics completed/);
});
