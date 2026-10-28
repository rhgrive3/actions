// Read-only presentation observations. All game navigation and firing use
// trusted native controls; no actor, HUD/cache, DOM, or clock writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {hash,verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu,rangeMenuControlReady} from './lib/inkwave-range-menu-entry.mjs';

export const CASES=Object.freeze([
 {name:'normal',source:'charger',target:'s3-charger-quick',scope:false},
 {name:'scoped',source:'s3-charger-normalscope',target:'s3-charger-longscope',scope:true},
]);
export function harnessIdentity(root=fileURLToPath(new URL('../',import.meta.url))){
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.match(head,/^[0-9a-f]{40}$/);
 const paths=['scripts/check-inkwave-charger-reticle-native.mjs','scripts/lib/inkwave-runtime-evidence.mjs','scripts/lib/inkwave-range-menu-entry.mjs'];
 const files={};for(const rel of paths){const file=path.join(root,rel),bytes=fs.readFileSync(file),committed=execFileSync('git',['rev-parse',`HEAD:${rel}`],{cwd:root,encoding:'utf8'}).trim(),actual=execFileSync('git',['hash-object',file],{cwd:root,encoding:'utf8'}).trim();assert.equal(actual,committed,'Harness file differs from diagnostic HEAD: '+rel);files[rel]=hash(bytes);}
 return {diagnosticHead:head,scriptSha256:files[paths[0]],helperSha256:{runtimeEvidence:files[paths[1]],rangeMenuEntry:files[paths[2]]}};
}
export function orderedFrames(samples){
 if(!Array.isArray(samples)||samples.some(s=>!Number.isFinite(s?.time)))return null;
 return samples.map((s,index)=>({s,index})).sort((a,b)=>a.s.time-b.s.time||a.index-b.index).map(x=>x.s);
}
export function secureBrowserOptions(){return {headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']};}
export function assertInputHash(manifest){assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'Build input manifest hash mismatch');}
export async function withTimeout(action,ms,label){let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Deadline exceeded: '+label)),ms);})]);}finally{clearTimeout(timer);}}
export async function boundedAction(action,remaining,onTimeout,label){
 const ms=remaining();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>{remaining();return action();}),new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout();}catch{}reject(Error('Native Charger diagnostic deadline: '+label));},ms);})]);}
 finally{clearTimeout(timer);}
}
export async function closeDiagnosticOwners({browser,server},errors,timeout=10000){
 const result={browserClosed:false,serverClosed:false};
 try{if(browser){await withTimeout(()=>browser.close(),timeout,'browser cleanup');result.browserClosed=true;}}catch(e){errors.push('browser cleanup: '+String(e));}
 try{if(server?.listening){await withTimeout(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),timeout,'server cleanup');result.serverClosed=true;}}catch(e){errors.push('server cleanup: '+String(e));}
 return result;
}
export async function finalizeDiagnostic(result,cleanup,primary,save){
 let failure=primary;
 try{result.cleanup=await cleanup();}catch(e){result.errors.push('diagnostic cleanup: '+String(e));}
 if(result.errors.length){result.status='failed';if(!failure)failure=Error('Diagnostic cleanup or page errors: '+result.errors.join('; '));if(!result.error)result.error=String(failure.stack||failure);}
 save();return failure;
}
export function classifyTransition(samples,{source,target,scope},frameCount=samples?.length) {
 const validCount=Number.isSafeInteger(frameCount)&&frameCount>=0&&Array.isArray(samples)&&frameCount>=samples.length;
 const dropped=validCount?frameCount-samples.length:null;
 const finish=result=>({...result,observation:(!validCount||dropped>0)&&result.observation==='class-present'?'insufficient':result.observation,
  rawHistoryStatus:!validCount?'invalid-frame-count':dropped>0?'raw-history-truncated':'complete',droppedFrames:dropped});
 // Qualify only a full-charge sample following an earlier full-charge sample
 // with advancing game time. This reduces transient false alarms but does not
 // prove a particular HUD update or which update first rebuilt the ring.
 const ordered=orderedFrames(samples),reason='RAF samples cannot prove the first HUD rebuild or exclude intervening synchronous updates';
 if(!ordered)return finish({status:'inconclusive',reason:'non-finite frame timestamp',observation:'insufficient'});
 const eligible=s=>!!s&&[source,target].includes(s.weapon)&&s.hudWeapon===s.weapon&&s.runnerCharging&&s.charge>=.99&&Number.isFinite(s.gameTime)&&!s.paused&&!s.menu&&s.matchState==='playing'&&(!scope||(s.scopeSemanticFamily==='charger'&&s.scopeSemanticConfigured===true&&Number.isFinite(s.scopeExpectedFactor)&&s.scopeExpectedFactor>.85));
 let previous=null;const qualified=[],rawMissing=[];
 for(const s of ordered){
  const admitted=!!(eligible(s)&&eligible(previous)&&previous.weapon===s.weapon&&s.gameTime>previous.gameTime);
  if(admitted)qualified.push(s);
  if([source,target].includes(s.weapon)&&s.charge>=.99&&(!s.chargingClass||(scope&&!s.scoped))){
   const reasons=[];
   if(!eligible(s))reasons.push('sample-not-active-playing-full-hud-owner');
   if(scope&&!(s.scopeSemanticFamily==='charger'&&s.scopeSemanticConfigured===true&&Number.isFinite(s.scopeExpectedFactor)&&s.scopeExpectedFactor>.85))reasons.push('scope-semantic-expectation-not-established');
   if(!eligible(previous))reasons.push('no-consecutive-eligible-predecessor');
   else if(previous.weapon!==s.weapon)reasons.push('weapon-changed');
   else if(!(s.gameTime>previous.gameTime))reasons.push('game-time-not-advanced');
   rawMissing.push({sample:s,qualified:admitted,reasons});
  }
  previous=s; // Every intervening sample breaks continuity unless also eligible.
 }
 const targetIndex=qualified.findLastIndex(s=>s.weapon===target),after=targetIndex<0?null:qualified[targetIndex];
 const before=targetIndex<0?null:qualified.slice(0,targetIndex).findLast(s=>s.weapon===source)??null;
 const missing=rawMissing.filter(x=>x.qualified).map(x=>x.sample);
 if(missing.length)return finish({status:'inconclusive',reason,observation:'class-missing',before,after,missing,rawMissing});
 if(!before||!after)return finish({status:'inconclusive',reason,observation:'insufficient',before,after,missing,rawMissing});
 return finish({status:'inconclusive',reason,observation:'class-present',before,after,missing,rawMissing});
}
export function validateGestures(events,{source,target}){
 const trusted=events.filter(e=>e.trusted),sourceClick=trusted.find(e=>e.type==='click'&&e.id==='w-'+source);
 const targetClick=trusted.find(e=>e.type==='click'&&e.id==='w-'+target&&e.time>(sourceClick?.time??Infinity));
 if(!sourceClick||!targetClick)return false;
 const srcFire=trusted.find(e=>e.type==='mousedown'&&e.button===0&&e.tag==='CANVAS'&&e.time>sourceClick.time&&e.time<targetClick.time);
 const targetFire=trusted.find(e=>e.type==='mousedown'&&e.button===0&&e.tag==='CANVAS'&&e.time>targetClick.time);
 const pause=trusted.find(e=>e.type==='keydown'&&e.key==='KeyP'&&e.time>(srcFire?.time??Infinity)&&e.time<targetClick.time);
 return !!(srcFire&&targetFire&&pause&&trusted.some(e=>e.type==='mouseup'&&e.button===0&&e.tag==='CANVAS'&&e.time>targetFire.time));
}
export function installTrace(){
 const out={events:[],eventCount:0,frames:[],frameCount:0,stopped:false,scopeModuleError:null},ids=new WeakMap();let serial=0,scopeFormula=null,scopeRequested=false;
 const ident=e=>{if(!e)return null;if(!ids.has(e))ids.set(e,++serial);return ids.get(e);};
 for(const type of ['keydown','keyup','mousedown','mouseup','click'])document.addEventListener(type,e=>{
  out.eventCount++;if(out.events.length<1000)out.events.push({type,trusted:e.isTrusted,key:e.code||null,button:e.button??null,id:e.target?.closest?.('[data-id]')?.dataset.id??null,tag:e.target?.tagName??null,time:performance.now()});
 },true);
 function sample(){
  if(out.stopped)return;
  const G=window.__G,g=window.__inkwave,a=G?.local,h=g?.hud,L=h?._L,r=h?.ret;
  if(!scopeRequested&&document.readyState!=='loading'){scopeRequested=true;import(new URL('src/game/chargerTuning.js',document.baseURI)).then(m=>{if(typeof m.chargerScopeFactor!=='function')throw Error('Missing Charger scope semantic export');scopeFormula=m.chargerScopeFactor;}).catch(e=>{out.scopeModuleError=String(e);});}
  const w=a?.weapon,family=w?.behaviorKind||w?.kind,configured=!!(w?.scoped||w?.scopedCharge||w?.catalogRecord?.parameters?.WeaponScopeParam!=null);
  let expected=null;try{if(typeof scopeFormula==='function')expected=scopeFormula(w,a?.weaponRunner?.charge,!!a?.weaponRunner?.charging);}catch(e){out.scopeModuleError=String(e);}
  const frame={time:performance.now(),weapon:a?.weaponId??null,charge:a?.weaponRunner?.charge??null,charging:!!a?.weaponRunner?.charging,
   hudWeapon:L?.weapon??null,chargingCache:L?.charging??null,scopeCache:L?.scope??null,ring:ident(r),chargeElement:ident(h?._chargeEl),
   chargingClass:!!r?.classList.contains('is-charging'),runnerCharging:!!a?.weaponRunner?.charging,scoped:!!r?.classList.contains('is-scoped'),
   scopeSemanticFamily:family??null,scopeSemanticConfigured:configured,scopeExpectedFactor:expected,scopeOpacity:h?.scopeMask?.style.opacity??null,scopeComputedOpacity:h?.scopeMask?.isConnected?Number(getComputedStyle(h.scopeMask).opacity):null,menu:g?.menus?.current??null,gameTime:G?.time??null,paused:!!G?.match?.paused,matchState:G?.match?.state??null};
  if(out.frames.length<6000)out.frames.push(frame);else out.frames[out.frameCount%6000]=frame;out.frameCount++;
  requestAnimationFrame(sample);
 }
 window.__chargerDiagnosticTrace=out;requestAnimationFrame(sample);
}
function flags(argv){const r={};for(let i=0;i<argv.length;i+=2){assert.match(argv[i]||'',/^--(?:site|root|sha|out)$/);assert.ok(argv[i+1]);r[argv[i].slice(2)]=argv[i+1];}for(const k of ['site','root','sha','out'])assert.ok(r[k],`missing --${k}`);assert.match(r.sha,/^[0-9a-f]{40}$/);return r;}
export async function run({site,root,sha,out}){
 site=path.resolve(site);root=path.resolve(root);out=path.resolve(out);fs.mkdirSync(out);
 const result={schema:1,sourceSha:sha,harness:null,status:'running',cases:[],errors:[],buildTrustBoundary:'Same-run clean checkout build; verifier binds listed manifest inputs and checks inputHash, not an independent complete input inventory.'};let server,browser,failure;
 const save=()=>fs.writeFileSync(path.join(out,'charger-reticle-result.json'),JSON.stringify(result,null,2)+'\n');save();
 try{
  result.harness=harnessIdentity();save();
  const manifest=verifyRuntimeBuild(site,root,sha);assertInputHash(manifest);Object.assign(result,{contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision});
  const scopeKey=`_versions/${manifest.build.revision}/src/game/chargerTuning.js`,scopeDigest=manifest.artifacts[scopeKey];assert.match(scopeDigest||'',/^[0-9a-f]{64}$/,'Missing versioned Charger semantic source');result.scopeModule={path:scopeKey,sha256:scopeDigest,served:false};
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wasm':'application/wasm'};
  server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('unknown artifact');const key=path.relative(site,file).split(path.sep).join('/'),bytes=fs.readFileSync(file);if(hash(bytes)!==manifest.artifacts[key])throw Error('artifact mismatch');if(key===scopeKey)result.scopeModule.served=true;res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const {chromium}=await import('playwright');const browserOptions=secureBrowserOptions();result.browserLaunch=browserOptions;save();browser=await chromium.launch(browserOptions);result.browser=browser.version();
  for(const c of CASES){
   const row={...c,status:'running',contextClosed:false};result.cases.push(row);save();const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});let primary,page;
   try{
    page=await context.newPage();const deadline=Date.now()+180000;const remaining=()=>{const n=deadline-Date.now();if(n<=0)throw Error('Native Charger diagnostic deadline exceeded');return n;};
    const bounded=(fn,label)=>boundedAction(fn,remaining,()=>{page.close({runBeforeUnload:false}).catch(()=>{});},label);
    await page.addInitScript(installTrace);page.on('pageerror',e=>result.errors.push('page: '+e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push('console: '+m.text());});
    row.entry=await bounded(()=>enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:remaining()}),'range entry');
    // Start the bounded observation window only after trusted range entry.
    // This resets our own trace buffers, never game/DOM/input state.
    await bounded(()=>page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;t.events=[];t.eventCount=0;t.frames=[];t.frameCount=0;}),'begin trace window');row.traceWindow='after trusted range entry through target release';save();
    const select=async id=>{
     await bounded(()=>page.keyboard.press('KeyP'),'pause');const tab='.iwr-pausescr:not(.is-leaving) [data-id="r-tab-weapon"]';
     await bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector:tab,menu:'pause'},{timeout:remaining()}),'weapon tab readiness');await bounded(()=>page.locator(tab).click({timeout:remaining()}),'weapon tab');
     const selector=`.iwr-pausescr:not(.is-leaving) [data-id="w-${id}"]`;
     await bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector,menu:'pause'},{timeout:remaining()}),'weapon readiness');await bounded(()=>page.locator(selector).click({timeout:remaining()}),'select '+id);
     await bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&window.__G?.match?.state==='playing'&&!window.__G?.match?.paused&&!window.__inkwave?.menus?.current,id,{timeout:remaining()}),'weapon resume');
    };
    const fire=async()=>{await bounded(()=>page.locator('canvas').first().click({timeout:remaining()}),'canvas click');await bounded(()=>page.mouse.down(),'hold fire');await bounded(()=>page.waitForFunction(()=>window.__G?.local?.weaponRunner?.charging&&window.__G.local.weaponRunner.charge>=.99,null,{timeout:remaining()}),'full charge');const t=await bounded(()=>page.evaluate(()=>window.__G?.time),'read full-charge clock');await bounded(()=>page.waitForFunction(t=>Number.isFinite(window.__G?.time)&&window.__G.time>t,t,{timeout:remaining()}),'one natural full-charge frame');};
    await select(c.source);await fire();row.before=await page.evaluate(()=>{const g=window.__inkwave,a=window.__G?.local;return{weapon:a?.weaponId,charge:a?.weaponRunner?.charge,charging:a?.weaponRunner?.charging,hudWeapon:g?.hud?._L?.weapon,cache:g?.hud?._L?.charging,scope:g?.hud?._L?.scope,className:g?.hud?.ret?.className};});
    const beforeImage=await bounded(()=>page.screenshot({path:path.join(out,c.name+'-before.png'),timeout:remaining()}),'before screenshot');row.images=[{file:c.name+'-before.png',sha256:hash(beforeImage),bytes:beforeImage.length}];
    // Pause while the real fire button is held. Release for the native menu
    // click, then use real fire input again after the selected weapon resumes.
    await bounded(()=>page.keyboard.press('KeyP'),'pause from charge');await bounded(()=>page.mouse.up(),'release for selection');
    const tab='.iwr-pausescr:not(.is-leaving) [data-id="r-tab-weapon"]';await bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector:tab,menu:'pause'},{timeout:remaining()}),'target tab readiness');await bounded(()=>page.locator(tab).click({timeout:remaining()}),'target tab');
    const selector=`.iwr-pausescr:not(.is-leaving) [data-id="w-${c.target}"]`;await bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector,menu:'pause'},{timeout:remaining()}),'target readiness');await bounded(()=>page.locator(selector).click({timeout:remaining()}),'target select');
    await bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&!window.__G?.match?.paused&&!window.__inkwave?.menus?.current,c.target,{timeout:remaining()}),'target resume');await fire();
    await bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&window.__inkwave?.hud?._L?.weapon===id,c.target,{timeout:remaining()}),'target HUD owner');
    const observedTime=await bounded(()=>page.evaluate(()=>window.__G?.time),'read observation clock');
    await bounded(()=>page.waitForFunction(t=>Number.isFinite(window.__G?.time)&&window.__G.time>t,observedTime,{timeout:remaining()}),'next natural observation frame');
    row.visualEvidence=await bounded(()=>page.evaluate(()=>{const h=window.__inkwave?.hud;const inspect=e=>{if(!e||!e.isConnected)return null;const rect=e.getBoundingClientRect();let opacity=1,shown=true;for(let n=e;n;n=n.parentElement){const cs=getComputedStyle(n);opacity*=Number(cs.opacity);if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse')shown=false;}return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,opacity,shown,intersectsViewport:rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight};};return {ring:inspect(h?._chargeEl),reticle:inspect(h?.ret),scope:inspect(h?.scopeMask),note:'Layout/style evidence only; occlusion and rendered pixels are not established.'};}),'read visual evidence');
    const afterImage=await bounded(()=>page.screenshot({path:path.join(out,c.name+'-after.png'),timeout:remaining()}),'after screenshot');row.images.push({file:c.name+'-after.png',sha256:hash(afterImage),bytes:afterImage.length});await bounded(()=>page.mouse.up(),'release fire');
    const trace=await page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;t.stopped=true;if(t.frameCount>t.frames.length){const i=t.frameCount%t.frames.length;t.frames=t.frames.slice(i).concat(t.frames.slice(0,i));}return t;});
    row.scopeModuleError=trace.scopeModuleError;row.frameCount=trace.frameCount;row.eventCount=trace.eventCount;row.eventHistoryStatus=trace.eventCount>trace.events.length?'raw-history-truncated':'complete';row.trusted=trace.events.filter(e=>e.trusted);row.gesturesValid=row.eventHistoryStatus==='complete'&&validateGestures(trace.events,c);
    // Preserve real frame timing. Classify only a transition actually observed
    // in the same uninterrupted trace; no synthetic cache or render timing.
    row.classification=classifyTransition(trace.frames,{...c},trace.frameCount);row.classification.firstObservedTarget=orderedFrames(trace.frames)?.find(s=>s.hudWeapon===c.target&&s.weapon===c.target)??null;
    if(!row.gesturesValid)throw Error('Native input trust evidence incomplete');row.status=row.classification.status;row.frames=trace.frames;row.events=trace.events;
   }catch(e){primary=e;row.error=String(e.stack||e);if(page)try{row.failureTrace=await withTimeout(()=>page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;if(!t)return null;t.stopped=true;return t;}),2000,'failure trace');}catch(traceError){row.failureTraceError=String(traceError);}throw e;}finally{try{await withTimeout(()=>context.close(),10000,'context cleanup');row.contextClosed=true;}catch(e){result.errors.push('context cleanup: '+String(e));if(!primary)throw e;}finally{save();}}
  }
  if(result.errors.length)throw Error('Native diagnostic emitted errors: '+result.errors.join('; '));
  result.uiStatus=result.cases.every(c=>c.classification?.observation==='class-present')?'classes-present':result.cases.some(c=>c.classification?.observation==='class-missing')?'classes-missing':'inconclusive';
  result.reproductionStatus='inconclusive'; // RAF cannot prove the first rebuild
  if(result.uiStatus==='classes-missing')throw Error('Charged reticle expected class missing');
  result.status='completed';
 }catch(e){failure=e;result.status='failed';result.error=String(e.stack||e);}finally{failure=await finalizeDiagnostic(result,()=>closeDiagnosticOwners({browser,server},result.errors),failure,save);}
 if(failure)throw failure;return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)run(flags(process.argv.slice(2))).then(r=>console.log(JSON.stringify({status:r.status,cases:r.cases.map(x=>({name:x.name,status:x.status}))}))).catch(e=>{console.error(e);process.exitCode=1;});
