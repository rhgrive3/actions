// Read-only presentation observations. All game navigation and firing use
// trusted native controls; no actor, HUD/cache, DOM, or clock writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {hash,verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
import {rangeMenuControlReady} from './lib/inkwave-range-menu-entry.mjs';

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
// A failed action must leave time within the shared case deadline to preserve evidence.
export function actionBudget(remaining){const budget=remaining()-15000;if(budget<=0)throw Error('Insufficient time: preserve failure evidence reserve');return budget;}
export function clickTimeout(remaining){return Math.min(20000,actionBudget(remaining));}
// Read-only and bounded: identify the actual control, its ancestors and hit stack.
export function checkpointSnapshot(selector){
 const g=window.__inkwave,G=window.__G,root=g?.menus?._scr?.el,nodes=[...document.querySelectorAll(selector)],el=nodes[0],trace=window.__chargerDiagnosticTrace;
 const describe=e=>e?{tag:e.tagName,id:e.id||null,dataId:e.getAttribute?.('data-id')||null,className:typeof e.className==='string'?e.className:null}:null;
 const rect=el?.getBoundingClientRect(),box=rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom}:null;
 const x=rect?.left+rect?.width/2,y=rect?.top+rect?.height/2,inside=Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight;
 const ancestors=[];for(let n=el;n&&ancestors.length<12;n=n.parentElement){const cs=getComputedStyle(n);ancestors.push({...describe(n),display:cs.display,visibility:cs.visibility,opacity:cs.opacity,pointerEvents:cs.pointerEvents,inert:!!n.inert,hidden:!!n.hidden,scrollTop:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight});}
 const ids=[...(root||document).querySelectorAll('[data-id]')];
 return {selector,count:nodes.length,target:describe(el),connected:!!el?.isConnected,disabled:!!el?.disabled,hidden:!!el?.hidden,box,viewport:{width:innerWidth,height:innerHeight},center:inside?{x,y}:null,hitStack:inside?document.elementsFromPoint(x,y).slice(0,12).map(describe):[],ancestors,
  menu:g?.menus?.current??null,screen:g?.menus?._scr?.name??null,screenConnected:!!root?.isConnected,screenInert:!!root?.inert,weapon:G?.local?.weaponId??null,paused:!!G?.match?.paused,matchState:G?.match?.state??null,tab:document.querySelector('.iwr-tab.is-on')?.dataset.tab??null,filter:document.querySelector('.iwr-filter.is-on')?.dataset.cat??null,availableIdCount:ids.length,availableIds:ids.slice(0,200).map(e=>e.dataset.id),
  trace:trace?{eventCount:trace.eventCount,frameCount:trace.frameCount,recentEvents:trace.events.slice(-20),recentFrames:trace.frames.slice(-5),scopeModuleError:trace.scopeModuleError}:null};
}
// Recheck the live DOM immediately before each ordinary native mouse action.
// Never move focus, synthesize an event or write game state.
export function freshCanvasHit(expected=null){
 const nodes=[...document.querySelectorAll('#game-canvas')],canvas=nodes[0];if(nodes.length!==1||!canvas?.isConnected)return {valid:false,reason:'canvas-not-unique-connected'};
 const box=canvas.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
 if(!(box.width>0&&box.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight))return {valid:false,reason:'center-outside-viewport'};
 if(expected&&(Math.abs(expected.x-x)>.01||Math.abs(expected.y-y)>.01))return {valid:false,reason:'canvas-moved'};
 for(let e=canvas;e;e=e.parentElement){const cs=getComputedStyle(e);if(e.hidden||e.inert||cs.display==='none'||cs.visibility!=='visible'||Number(cs.opacity)<=0||cs.pointerEvents==='none')return {valid:false,reason:'canvas-not-interactable'};}
 const top=document.elementFromPoint(x,y);if(top!==canvas)return {valid:false,reason:'canvas-not-top-hit',topTag:top?.tagName??null,topId:top?.id??null};
 if(window.__inkwave?.menus?.current||window.__G?.match?.paused||window.__G?.match?.state!=='playing')return {valid:false,reason:'game-not-playing'};
 const trace=window.__chargerDiagnosticTrace;if(!trace||trace.eventCount>trace.events.length)return {valid:false,reason:'trace-unavailable-or-truncated'};
 return {valid:true,x,y,weapon:window.__G?.local?.weaponId??null,locked:document.pointerLockElement===canvas,eventCount:trace.eventCount,checkedAt:performance.now()};
}
export function readPointerTrace({before,type}){
 const t=window.__chargerDiagnosticTrace;if(!t||t.eventCount>t.events.length||before>t.eventCount)return {valid:false,reason:'trace-unavailable-or-truncated'};
 const events=t.events.slice(before).filter(e=>e.type===type);const event=events.at(-1);
 return {valid:events.length===1&&event.trusted&&event.tag==='CANVAS'&&event.elementId==='game-canvas'&&event.button===0,event:event??null};
}
export async function nativeCanvasPointer({page,bounded,native,closeUnsafe,row,label,expectedWeapon}){
 row.pointerActions??=[];const receipt={label};row.pointerActions.push(receipt);let held=false;
 try{
 const check=async(expected)=>{const hit=await bounded(()=>page.evaluate(freshCanvasHit,expected),'canvas fresh hit');if(!hit.valid||hit.weapon!==expectedWeapon)throw Error('Canvas hit check failed: '+JSON.stringify(hit));return hit;};
 const first=await check(null);receipt.beforeMove=first;await native(()=>page.mouse.move(first.x,first.y),'canvas pointer move');
 const hit=await check(first);receipt.beforeDown=hit;
 held=true;row.fireHeld=true;await native(()=>page.mouse.down(),'canvas pointer down');
 const down=await bounded(()=>page.evaluate(readPointerTrace,{before:hit.eventCount,type:'mousedown'}),'trusted canvas down');receipt.down=down;
 if(!down.valid)throw Error('Trusted canvas mousedown not observed: '+JSON.stringify(down));
 const upHit=await check(first);receipt.beforeUp=upHit;
 await native(()=>page.mouse.up(),'canvas pointer up');held=false;row.fireHeld=false;
 const up=await bounded(()=>page.evaluate(readPointerTrace,{before:upHit.eventCount,type:'mouseup'}),'trusted canvas up');receipt.up=up;
 if(!up.valid)throw Error('Trusted canvas mouseup not observed: '+JSON.stringify(up));
 // Re-check again immediately before the genuine held-fire press.
 const hold=await check(first);receipt.beforeHold=hold;
 held=true;row.fireHeld=true;await native(()=>page.mouse.down(),'canvas hold down');
 const holdEvent=await bounded(()=>page.evaluate(readPointerTrace,{before:hold.eventCount,type:'mousedown'}),'trusted canvas hold');receipt.hold=holdEvent;
 if(!holdEvent.valid)throw Error('Trusted canvas held-fire mousedown not observed: '+JSON.stringify(holdEvent));
 return receipt;
 }catch(e){if(held){try{await closeUnsafe();row.fireHeld=false;receipt.unsafeHeldContextClosed=true;}catch(closeError){receipt.unsafeHeldCloseError=String(closeError);}}throw e;}
}
export function secureBrowserOptions(){return {headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']};}
export function assertInputHash(manifest){assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'Build input manifest hash mismatch');}
export async function withTimeout(action,ms,label){let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Deadline exceeded: '+label)),ms);})]);}finally{clearTimeout(timer);}}
export async function boundedAction(action,remaining,onTimeout,label){
 const ms=remaining();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>{remaining();return action();}),new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout();}catch{}reject(Error('Native Charger diagnostic deadline: '+label));},ms);})]);}
 finally{clearTimeout(timer);}
}
// Best-effort readback does not replace the primary action failure. No new input.
export async function saveFailureEvidence({page,row,deadline,out,save,limit=5000}){
 const observe=async(label,fn)=>{const left=deadline-Date.now();if(left<=0){page.close({runBeforeUnload:false}).catch(()=>{});throw Error('case deadline elapsed before '+label);}return withTimeout(fn,Math.min(limit,left),label);};
 if(row.currentAction?.selector)try{row.failureSnapshot=await observe('failure snapshot',()=>page.evaluate(checkpointSnapshot,row.currentAction.selector));}catch(e){row.failureSnapshotError=String(e);}save();
 try{row.failureTrace=await observe('failure trace',()=>page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;if(!t)return null;t.stopped=true;return t;}));}catch(e){row.failureTraceError=String(e);}save();
 try{const file=row.name+'-failure.png',bytes=await observe('failure screenshot',()=>page.screenshot({path:path.join(out,file),timeout:Math.min(limit,Math.max(1,deadline-Date.now()))}));row.failureImage={file,sha256:hash(bytes),bytes:bytes.length};}catch(e){row.failureImageError=String(e);}save();
}
export async function closeHeldCase({row,context,errors,timeout=5000}){
 if(!row.fireHeld)return;
 try{await withTimeout(()=>context.close(),timeout,'held-fire context cleanup');row.contextClosed=true;row.fireHeld=false;row.heldFailureCleanup='context-closed';}
 catch(e){row.heldFailureCleanup='context-close-failed';row.heldFailureCleanupError=String(e);errors.push('held-fire context cleanup: '+String(e));}
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
  out.eventCount++;if(out.events.length<1000)out.events.push({type,trusted:e.isTrusted,key:e.code||null,button:e.button??null,id:e.target?.closest?.('[data-id]')?.dataset.id??null,tag:e.target?.tagName??null,elementId:e.target?.id??null,clientX:e.clientX??null,clientY:e.clientY??null,time:performance.now()});
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
   const row={...c,status:'running',contextClosed:false};result.cases.push(row);save();const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});let primary,page,deadline=0;
   try{
    page=await context.newPage();const caseStart=Date.now();let stage='startup';deadline=caseStart+120000;row.budgets={startupMs:120000,activeMs:180000,evidenceReserveMs:15000,reason:'Prior exact-build runs spent 92-94s entering range before weapon actions.'};const remaining=()=>{const n=deadline-Date.now();if(n<=0)throw Error('Native Charger diagnostic deadline exceeded');return n;};
    const closePage=()=>{page.close({runBeforeUnload:false}).catch(()=>{});};
    const bounded=(fn,label)=>boundedAction(fn,remaining,closePage,label);
    const native=(fn,label)=>boundedAction(fn,()=>clickTimeout(remaining),closePage,label);
    await page.addInitScript(installTrace);page.on('pageerror',e=>result.errors.push('page: '+e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push('console: '+m.text());});
    row.checkpoints=[];row.phases=[];
    const timed=async(label,fn)=>{const phase={label,stage,startedMs:Date.now()-caseStart};row.phases.push(phase);save();try{return await fn();}catch(e){phase.error=String(e);throw e;}finally{phase.endedMs=Date.now()-caseStart;save();}};
    const checkpoint=async(label,selector)=>timed('checkpoint '+label,async()=>{
     const item={label,...await bounded(()=>page.evaluate(checkpointSnapshot,selector),'snapshot '+label)};row.checkpoints.push(item);save();
     const file=c.name+'-'+label+'.png',bytes=await bounded(()=>page.screenshot({path:path.join(out,file),timeout:clickTimeout(remaining)}),'screenshot '+label);
     item.image={file,sha256:hash(bytes),bytes:bytes.length};save();
    });
    const click=async(label,selector,menu)=>{
     row.currentAction={label,selector,menu};save();
     if(menu)await timed(label+' readiness',()=>bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector,menu},{timeout:clickTimeout(remaining)}),label+' readiness'));
     await checkpoint(label,selector);
     await timed(label+' click',()=>bounded(()=>page.locator(selector).click({timeout:clickTimeout(remaining)}),label+' click'));
     row.currentAction=null;save();
    };
    // Same native entry and readiness guard as enterRangeFromMenu, with evidence
    // before each click and a capped action deadline. No forced or synthetic input.
    row.entry={route:['main'],gestures:[]};
    await timed('load',()=>bounded(()=>page.goto('http://127.0.0.1:'+server.address().port+'/?skipTitle',{timeout:actionBudget(remaining)}),'load'));
    await timed('main readiness',()=>bounded(()=>page.waitForFunction(()=>window.__inkwave?.menus?.current==='main',null,{timeout:actionBudget(remaining)}),'main readiness'));
    for(const [id,menu,next] of [['play','main','mode'],['mode-range','mode',null]]){
     const selector=`.iw-ui [data-id="${id}"]`,before=await bounded(()=>page.evaluate(()=>window.__chargerDiagnosticTrace?.eventCount??0),'entry event count');
     await click('entry-'+id,selector,menu);
     const observed=await bounded(()=>page.evaluate(({before,id})=>{const t=window.__chargerDiagnosticTrace;return {eventCount:t.eventCount,retained:t.events.length,gesture:t.events.slice(before).find(e=>e.type==='click'&&e.id===id&&e.trusted)||null};},{before,id}),'entry trusted event');
     if(observed.eventCount>observed.retained||!observed.gesture)throw Error('Range entry requires trusted menu input: '+id);
     row.entry.gestures.push(observed.gesture);save();
     if(next){await timed('mode readiness',()=>bounded(()=>page.waitForFunction(expected=>window.__inkwave?.menus?.current===expected,next,{timeout:actionBudget(remaining)}),'mode readiness'));row.entry.route.push(next);save();}
    }
    await timed('range readiness',()=>bounded(()=>page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:actionBudget(remaining)}),'range readiness'));row.entry.route.push('range');row.backend=await bounded(()=>page.evaluate(()=>{try{const r=window.__inkwave?.R?.renderer,gl=r?.getContext?.();return gl?{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),webgl2:!!r.capabilities?.isWebGL2,contextLost:gl.isContextLost(),source:'existing WebGL context; no extensions enabled'}:{unavailable:true};}catch(e){return {unavailable:true,error:String(e)};}}),'renderer backend');row.startupElapsedMs=Date.now()-caseStart;stage='active';deadline=Date.now()+180000;save();
    // Start the bounded observation window only after trusted range entry.
    // This resets our own trace buffers, never game/DOM/input state.
    await bounded(()=>page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;t.events=[];t.eventCount=0;t.frames=[];t.frameCount=0;}),'begin trace window');row.traceWindow='after trusted range entry through target release';save();
    const select=async id=>{
     await bounded(()=>page.keyboard.press('KeyP'),'pause');const tab='.iwr-pausescr:not(.is-leaving) [data-id="r-tab-weapon"]';
     await click('source-tab',tab,'pause');
     const selector=`.iwr-pausescr:not(.is-leaving) [data-id="w-${id}"]`;
     await click('source-weapon',selector,'pause');
     await timed('source weapon resume',()=>bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&window.__G?.match?.state==='playing'&&!window.__G?.match?.paused&&!window.__inkwave?.menus?.current,id,{timeout:actionBudget(remaining)}),'weapon resume'));
    };
    const fire=async(label,weapon)=>{row.currentAction={label:label+'-canvas',selector:'#game-canvas'};await checkpoint(label+'-canvas','#game-canvas');await timed(label+' native pointer',()=>nativeCanvasPointer({page,bounded,native,closeUnsafe:async()=>{try{await withTimeout(()=>context.close(),5000,'unsafe held-input cleanup');row.contextClosed=true;}catch(e){result.errors.push('unsafe held-input cleanup: '+String(e));throw e;}},row,label,expectedWeapon:weapon}));row.currentAction=null;row.fireHeld=true;save();await timed(label+' full charge',()=>bounded(()=>page.waitForFunction(()=>window.__G?.local?.weaponRunner?.charging&&window.__G.local.weaponRunner.charge>=.99,null,{timeout:actionBudget(remaining)}),'full charge'));const t=await bounded(()=>page.evaluate(()=>window.__G?.time),'read full-charge clock');await bounded(()=>page.waitForFunction(t=>Number.isFinite(window.__G?.time)&&window.__G.time>t,t,{timeout:actionBudget(remaining)}),'one natural full-charge frame');};
    await select(c.source);await fire('source',c.source);row.before=await page.evaluate(()=>{const g=window.__inkwave,a=window.__G?.local;return{weapon:a?.weaponId,charge:a?.weaponRunner?.charge,charging:a?.weaponRunner?.charging,hudWeapon:g?.hud?._L?.weapon,cache:g?.hud?._L?.charging,scope:g?.hud?._L?.scope,className:g?.hud?.ret?.className};});
    const beforeImage=await bounded(()=>page.screenshot({path:path.join(out,c.name+'-before.png'),timeout:clickTimeout(remaining)}),'before screenshot');row.images=[{file:c.name+'-before.png',sha256:hash(beforeImage),bytes:beforeImage.length}];
    // Pause while the real fire button is held. Release for the native menu
    // click, then use real fire input again after the selected weapon resumes.
    await bounded(()=>page.keyboard.press('KeyP'),'pause from charge');await bounded(()=>page.mouse.up(),'release for selection');row.fireHeld=false;save();
    const tab='.iwr-pausescr:not(.is-leaving) [data-id="r-tab-weapon"]';await click('target-tab',tab,'pause');
    const selector=`.iwr-pausescr:not(.is-leaving) [data-id="w-${c.target}"]`;await click('target-weapon',selector,'pause');
    await timed('target resume',()=>bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&!window.__G?.match?.paused&&!window.__inkwave?.menus?.current,c.target,{timeout:actionBudget(remaining)}),'target resume'));await fire('target',c.target);
    await bounded(()=>page.waitForFunction(id=>window.__G?.local?.weaponId===id&&window.__inkwave?.hud?._L?.weapon===id,c.target,{timeout:actionBudget(remaining)}),'target HUD owner');
    const observedTime=await bounded(()=>page.evaluate(()=>window.__G?.time),'read observation clock');
    await bounded(()=>page.waitForFunction(t=>Number.isFinite(window.__G?.time)&&window.__G.time>t,observedTime,{timeout:actionBudget(remaining)}),'next natural observation frame');
    row.visualEvidence=await bounded(()=>page.evaluate(()=>{const h=window.__inkwave?.hud;const inspect=e=>{if(!e||!e.isConnected)return null;const rect=e.getBoundingClientRect();let opacity=1,shown=true;for(let n=e;n;n=n.parentElement){const cs=getComputedStyle(n);opacity*=Number(cs.opacity);if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse')shown=false;}return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,opacity,shown,intersectsViewport:rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight};};return {ring:inspect(h?._chargeEl),reticle:inspect(h?.ret),scope:inspect(h?.scopeMask),note:'Layout/style evidence only; occlusion and rendered pixels are not established.'};}),'read visual evidence');
    const afterImage=await bounded(()=>page.screenshot({path:path.join(out,c.name+'-after.png'),timeout:clickTimeout(remaining)}),'after screenshot');row.images.push({file:c.name+'-after.png',sha256:hash(afterImage),bytes:afterImage.length});await bounded(()=>page.mouse.up(),'release fire');row.fireHeld=false;save();
    const trace=await page.evaluate(()=>{const t=window.__chargerDiagnosticTrace;t.stopped=true;if(t.frameCount>t.frames.length){const i=t.frameCount%t.frames.length;t.frames=t.frames.slice(i).concat(t.frames.slice(0,i));}return t;});
    row.scopeModuleError=trace.scopeModuleError;row.frameCount=trace.frameCount;row.eventCount=trace.eventCount;row.eventHistoryStatus=trace.eventCount>trace.events.length?'raw-history-truncated':'complete';row.trusted=trace.events.filter(e=>e.trusted);row.gesturesValid=row.eventHistoryStatus==='complete'&&validateGestures(trace.events,c);
    // Preserve real frame timing. Classify only a transition actually observed
    // in the same uninterrupted trace; no synthetic cache or render timing.
    row.classification=classifyTransition(trace.frames,{...c},trace.frameCount);row.classification.firstObservedTarget=orderedFrames(trace.frames)?.find(s=>s.hudWeapon===c.target&&s.weapon===c.target)??null;
    if(!row.gesturesValid)throw Error('Native input trust evidence incomplete');row.status=row.classification.status;row.frames=trace.frames;row.events=trace.events;
    }catch(e){primary=e;row.error=String(e.stack||e);
    await closeHeldCase({row,context,errors:result.errors});save();
    if(page)await saveFailureEvidence({page,row,deadline,out,save});throw e;}finally{try{await withTimeout(()=>context.close(),10000,'context cleanup');row.contextClosed=true;}catch(e){result.errors.push('context cleanup: '+String(e));if(!primary)throw e;}finally{save();}}
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
