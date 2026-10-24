#!/usr/bin/env node
// Real published-game WebGL/Web Audio checks. Counts are work/allocation evidence,
// not estimates of mobile watts, frame rate, driver memory or Nintendo budgets.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyWallBuild } from './check-inkwave-wall-render.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const BROWSER_ARGS=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const IDLE_OPERATION_TIMEOUT_MS=120000;
// Both 120-frame states execute real WebGL calls under per-producer console
// instrumentation. On heavily shared CI runners the original 240s deadline
// expired after 171/240 frames, not because a measured acceptance threshold
// was violated. Permit 480s for complete evidence; still fail-closed on hangs.
// No CPU/FPS/GPU acceptance threshold changes; all other evaluates remain 120s.
export const RESULTS_WORK_TIMEOUT_MS=480000;
export const CLOUD_SEQUENCE_TIMEOUT_MS=360000;
export const CLOUD_THEMES=Object.freeze(['day','sunset','golden']);
// Three sequential theme operations. This increases aggregate supervision from
// 120 to 360 seconds; it is not a runtime/performance improvement. Cleanup may
// outlive a failed deadline and can never turn that failure into success.
export async function runCloudThemeSequence(measure,retain,{timers=globalThis,now=()=>performance.now(),phase=()=>{},checkpoint=()=>{},trace={}}={}){
 const started=now();let aggregateTimer,activeTheme=null,activeStarted=null,activeEvaluationElapsed=null;
 Object.assign(trace,{state:'running',themeLimitMs:IDLE_OPERATION_TIMEOUT_MS,sequenceLimitMs:CLOUD_SEQUENCE_TIMEOUT_MS,themes:[],elapsedMs:0});
 const aggregateError=()=>Object.assign(Error('Cloud sequence exceeded 360000 ms'),{name:'IdleCloudSequenceTimeoutError',code:'INKWAVE_CLOUD_SEQUENCE_TIMEOUT',phase:'clouds:aggregate',timeoutMs:CLOUD_SEQUENCE_TIMEOUT_MS,elapsedMs:now()-started,scope:'cloud-sequence',theme:activeTheme});
 const checkOverall=()=>{if(now()-started>=CLOUD_SEQUENCE_TIMEOUT_MS)throw aggregateError();};
 const aggregate=new Promise((_,reject)=>{aggregateTimer=timers.setTimeout(()=>reject(aggregateError()),CLOUD_SEQUENCE_TIMEOUT_MS);});
 try{
  for(let index=0;index<CLOUD_THEMES.length;index++){
   checkOverall();const theme=activeTheme=CLOUD_THEMES[index];activeStarted=activeEvaluationElapsed=null;phase('clouds:'+theme);checkOverall();
   const themeStarted=activeStarted=now();let themeTimer;
   const themeError=()=>Object.assign(Error(`Idle evaluate exceeded 120000 ms (clouds:${theme})`),{name:'IdleEvaluationTimeoutError',code:'INKWAVE_IDLE_EVALUATION_TIMEOUT',phase:'clouds:'+theme,timeoutMs:IDLE_OPERATION_TIMEOUT_MS,elapsedMs:now()-themeStarted,scope:'cloud-theme'});
   let row;
   try{
    row=await Promise.race([
     Promise.resolve().then(()=>measure({theme,index})),
     new Promise((_,reject)=>{themeTimer=timers.setTimeout(()=>reject(themeError()),IDLE_OPERATION_TIMEOUT_MS);}),aggregate
    ]);
    checkOverall();if(now()-themeStarted>=IDLE_OPERATION_TIMEOUT_MS)throw themeError();
   }finally{timers.clearTimeout(themeTimer);}
   if(row?.theme!==theme)throw Error('Cloud theme result is missing or out of order: '+theme);
   const elapsedMs=activeEvaluationElapsed=now()-themeStarted;
   // Retention is synchronous: a late evaluate result cannot run this branch
   // after the race has failed, or overwrite a failed receipt with running.
   const retained=retain(row,index,checkOverall);
   if(retained&&typeof retained.then==='function'){Promise.resolve(retained).catch(()=>{});throw TypeError('Cloud artifact retention must be synchronous');}
   checkOverall();trace.themes.push({theme,elapsedMs});trace.elapsedMs=now()-started;checkpoint(trace);checkOverall();
  }
  checkOverall();trace.state='complete';checkpoint(trace);checkOverall();return trace;
 }catch(error){trace.state='failed';trace.failurePhase=error?.phase||'clouds:'+activeTheme;trace.error=String(error);if(activeStarted!==null)trace.failedTheme={theme:activeTheme,evaluationElapsedMs:activeEvaluationElapsed??now()-activeStarted,wallElapsedMs:now()-activeStarted};throw error;}
 finally{trace.elapsedMs=now()-started;timers.clearTimeout(aggregateTimer);}
}
// Diagnostic memory is bounded independently of a pending browser evaluate.
export function createResultsProgress(token,{capacity=256,detailCapacity=32,maxMessages=32769,maxDetailMessages=129,maxChars=4096}={}){
 if(typeof token!=='string'||!token||token.length>64||!Number.isInteger(capacity)||capacity<1||capacity>512||!Number.isInteger(detailCapacity)||detailCapacity<1||detailCapacity>64||!Number.isInteger(maxMessages)||maxMessages<1||maxMessages>32769||!Number.isInteger(maxDetailMessages)||maxDetailMessages<1||maxDetailMessages>129||!Number.isInteger(maxChars)||maxChars<1||maxChars>4096)throw TypeError('Invalid results progress bounds');
 const channel=(capacity,maxMessages)=>({ring:new Array(capacity),capacity,maxMessages,cursor:0,size:0,received:0,rejected:0,last:0,truncated:false});
 const prefix='INKWAVE_RESULTS_WORK '+token+' ',channels={critical:channel(capacity,maxMessages),detail:channel(detailCapacity,maxDetailMessages)};let rejected=0,sealed=false;
 const snapshot=c=>({received:c.received,rejected:c.rejected,truncated:c.truncated,capacity:c.capacity,maxMessages:c.maxMessages,events:Array.from({length:c.size},(_,i)=>c.ring[(c.cursor-c.size+i+c.capacity)%c.capacity])});
 return {token,accept(text){
  if(sealed)return false;if(typeof text!=='string'||!text.startsWith(prefix))return false;
  if(text.length>maxChars){rejected++;return false;}
  let p;try{p=JSON.parse(text.slice(prefix.length));}catch{rejected++;return false;}
  if(!p||!['critical','detail'].includes(p.channel)||!Number.isSafeInteger(p.seq)||typeof p.producer!=='string'||p.producer.length>96||!['enter','exit','throw','limit'].includes(p.edge)||!['setup','playing','results','restoring'].includes(p.state)){rejected++;return false;}
  const c=channels[p.channel];if(p.seq<=c.last||c.received>=c.maxMessages){c.rejected++;c.truncated||=c.received>=c.maxMessages;return false;}
  c.last=p.seq;c.received++;c.truncated||=p.edge==='limit';c.ring[c.cursor]=p;c.cursor=(c.cursor+1)%c.capacity;c.size=Math.min(c.size+1,c.capacity);return true;
 },seal(){sealed=true;},snapshot(){return {diagnosticOnly:true,timingScope:'observer CPU/console overhead; not FPS or GPU execution',...snapshot(channels.critical),invalidMessages:rejected,sealed,maxChars,criticalMode:'reserved frame/sample/cleanup; first128 coarse-callee edges per frame, then limit marker',detailMode:'bounded actor-edge sample; GL counters aggregated, no per-draw events',detail:snapshot(channels.detail)};}};
}
// One synchronous browser task: no added yield, RAF await, GPU fence or clock reset.
export function measureResultsWork({token,maxDetailEvents=128}){
 if(typeof token!=='string'||!token||token.length>64||!Number.isInteger(maxDetailEvents)||maxDetailEvents<1||maxDetailEvents>128)throw TypeError('Invalid results progress token/budget');
 const G=__G,g=G.game,match=g.match,gl=G.renderer.getContext(),restore=[];
 const beforeState=match.state,beforePaused=match.paused,started=performance.now();let counts,state='setup',frame=0,completed=0,totalCompleted=0,stateStarted=started,failed=false,failure,watchedClock,criticalInFrame=0,criticalSuppressed=0,detailSuppressed=0;
 const sequences={critical:0,detail:0};let timing=null,rendererDepth=0,drawDepth=0,rendererOrdinal=0;
 // Diagnostic wall time only. Other renderer work includes JS, other native
 // APIs, scheduling and the timing observer itself; none is GPU execution/FPS.
 const methodTiming=()=>({calls:0,outerCalls:0,wallMs:0,maxWallMs:0});
 const createTiming=()=>({diagnosticOnly:true,emitWallMs:0,clockErrors:0,renderer:{calls:0,outerCalls:0,wallMs:0,nestedEmitWallMs:0,drawCallWallMs:0,otherWallMs:0,maxWallMs:0,maxFrame:0,maxOrdinal:0},draws:{calls:0,outerCalls:0,wallMs:0,maxWallMs:0,maxMethod:null,maxFrame:0,maxRendererOrdinal:0,methods:{drawArrays:methodTiming(),drawElements:methodTiming(),drawArraysInstanced:methodTiming(),drawElementsInstanced:methodTiming()}}});
 const timingNow=()=>{try{const value=performance.now();if(Number.isFinite(value))return value;}catch{}if(timing)timing.clockErrors++;return null;};
 const timingElapsed=start=>{const end=timingNow();if(start!==null&&end!==null&&Number.isFinite(end-start)&&end>=start)return end-start;if(timing&&start!==null&&end!==null)timing.clockErrors++;return null;};
 const timingSnapshot=()=>timing?{...timing,renderer:{...timing.renderer},draws:{...timing.draws,methods:Object.fromEntries(Object.entries(timing.draws.methods).map(([key,value])=>[key,{...value}]))}}:undefined;
 // Frame/sample/cleanup are reserved. Coarse callees get128 edges per frame,
 // plus one explicit limit; actor detail cannot consume either budget or ring.
 const emit=(producer,edge,channel='critical')=>{const owner=timing,start=timingNow();try{let limit=false;
  if(channel==='detail'){const n=sequences.detail;if(n>maxDetailEvents){detailSuppressed++;return;}limit=n===maxDetailEvents;}
  else if(!['frame','sample','cleanup'].includes(producer)){if(criticalInFrame>128){criticalSuppressed++;return;}limit=criticalInFrame++===128;}
  if(limit){if(channel==='detail')detailSuppressed++;else criticalSuppressed++;}
  const seq=++sequences[channel];
  try{const c=g.s3Clock;console.info('INKWAVE_RESULTS_WORK '+token+' '+JSON.stringify({channel,seq,producer:limit?'observer':producer,edge:limit?'limit':edge,state,actualState:match.state,frame,completed,totalCompleted,dt:1/60,criticalSuppressed,detailSuppressed,elapsedMs:performance.now()-started,stateElapsedMs:performance.now()-stateStarted,clock:c?{ticks:c.ticks,accumulator:c.accumulator,advancing:c.advancing,finalTick:c.finalTick,ticked:g._s3Ticked}:null,counts:counts?{...counts}:null,presentation:{frozen:g.frozen,hidden:document.hidden,quality:G.settings?.quality,showcase:!!g.showcase?.fullFrame,skipRender:!!g._skipRender},gameTime:G.time,timing:channel==='critical'&&(['frame','sample','cleanup'].includes(producer)||producer==='renderer'&&edge!=='enter')?timingSnapshot():undefined}));}catch{/* Observation failure never replaces a native return/throw. */}
 }finally{const elapsed=timingElapsed(start);if(owner&&elapsed!==null)owner.emitWallMs+=elapsed;}
 };
 const invoke=(old,receiver,args,label,channel='critical')=>{
  emit(label,'enter',channel);const measured=label==='renderer',outer=measured&&rendererDepth++===0,owner=timing;
  if(measured&&owner)owner.renderer.calls++;
  const ordinal=outer?++rendererOrdinal:rendererOrdinal,start=outer?timingNow():null,emitBefore=owner?.emitWallMs??0,drawBefore=owner?.draws.wallMs??0;let returned=false;
  try{const value=old.apply(receiver,args);returned=true;return value;}
  finally{
   if(measured)rendererDepth--;
   if(outer&&owner){const elapsed=timingElapsed(start),r=owner.renderer;r.outerCalls++;if(elapsed!==null){
    const observer=owner.emitWallMs-emitBefore,draws=owner.draws.wallMs-drawBefore;
    r.wallMs+=elapsed;r.nestedEmitWallMs+=observer;r.drawCallWallMs+=draws;r.otherWallMs+=Math.max(0,elapsed-observer-draws);
    if(r.outerCalls===1||elapsed>r.maxWallMs){r.maxWallMs=elapsed;r.maxFrame=frame;r.maxOrdinal=ordinal;}
   }}
   emit(label,returned?'exit':'throw',channel);
  }
 };
 const hook=(obj,key,label,producer=label,channel='critical')=>{const old=obj[key];if(typeof old!=='function')throw Error('Missing native work producer '+key);obj[key]=function(...args){
  counts[label]++;if(channel!=='aggregate')return invoke(old,this,args,producer,channel);
  // Reuse the existing draw wrapper. No per-draw event, callback or allocation.
  const owner=timing,d=owner?.draws,m=d?.methods[key],outer=drawDepth++===0,start=outer?timingNow():null,emitBefore=owner?.emitWallMs??0;
  if(d){d.calls++;m.calls++;}
  try{return old.apply(this,args);}
  finally{
   drawDepth--;
   if(outer&&d){const elapsed=timingElapsed(start);d.outerCalls++;m.outerCalls++;if(elapsed!==null){
    // A test double may nest observed work. Exclude those emit intervals once,
    // and time only the outer draw call so recursive wrappers never double count.
    const wall=Math.max(0,elapsed-(owner.emitWallMs-emitBefore));d.wallMs+=wall;m.wallMs+=wall;
    if(wall>m.maxWallMs)m.maxWallMs=wall;
    if(d.outerCalls===1||wall>d.maxWallMs){d.maxWallMs=wall;d.maxMethod=key;d.maxFrame=frame;d.maxRendererOrdinal=rendererDepth?rendererOrdinal:0;}
   }}
  }
 };restore.push(()=>{obj[key]=old;});};
 const observe=(obj,key,label)=>{const old=obj?.[key];if(typeof old!=='function')return;const descriptor=Object.getOwnPropertyDescriptor(obj,key);obj[key]=function(...args){return invoke(old,this,args,label);};restore.push(()=>{if(descriptor)Object.defineProperty(obj,key,descriptor);else delete obj[key];});};
 try{
  for(let i=0;i<G.actors.length;i++)hook(G.actors[i],'update','actorUpdates','actor['+i+'].update','detail');
  for(const [obj,key,label]of [[G.projectiles,'update','projectileUpdates'],[G.paint,'flush','paintFlushes'],[G.fx,'update','fxUpdates'],[g.R,'render','worldRenders']])hook(obj,key,label,key==='render'?'R.render':label);
  for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'])hook(gl,key,'gpuDrawSubmissions','gl.'+key,'aggregate');
  for(const [obj,key,label]of [[match,'update','match.update'],[match,'updateController','controller'],[g.input,'pollPad','input.pollPad'],[g.input,'endFrame','input.endFrame'],[g,'_padMenus','padMenus'],[G.net,'update','network'],[G.paint,'advanceSimulation','paint.clock'],[G.env,'update','environment'],[g.decor,'update','decor'],[g.props,'update','props'],[g.rig,'update','camera'],[g.diorama,'update','diorama'],[g.screenfx,'update','screenfx'],[g.fxHooks,'update','fxHooks'],[G.projectiles,'syncSights','projectile.sights'],[G.projectiles,'syncVisuals','projectile.visuals'],[G.projectiles,'updateArc','projectile.arc'],[g.showcase,'update','showcase.update'],[g.showcase,'render','showcase.render'],[g,'_updateLocalLoops','audio.loops'],[g,'_updateAmbience','audio.ambience'],[G.audio,'setListener','audio.listener'],[g,'_updateHud','hud'],[g.menus,'update','menus'],[g.R.composer,'render','composer'],[G.renderer,'render','renderer']])observe(obj,key,label);
  const sample=next=>{counts={actorUpdates:0,projectileUpdates:0,paintFlushes:0,fxUpdates:0,worldRenders:0,gpuDrawSubmissions:0};state=next;frame=completed=0;timing=createTiming();match.state=next;match.paused=false;const start=stateStarted=performance.now();emit('sample','enter');
   for(let i=0;i<120;i++){frame=i+1;criticalInFrame=0;rendererOrdinal=0;if(g.s3Clock&&g.s3Clock!==watchedClock){observe(g.s3Clock,'advance','clock.advance');watchedClock=g.s3Clock;}emit('frame','enter');let returned=false;try{g._frame(1/60);returned=true;completed++;totalCompleted++;}finally{emit('frame',returned?'exit':'throw');}}
   emit('sample','exit');return {...counts,cpuSubmissionMs:performance.now()-start};
  };
  return {frames:120,playing:sample('playing'),results:sample('results'),measurement:'native published Game._frame producers and real WebGL submission counts; not GPU execution time or device power'};
 }catch(error){failed=true;failure=error;throw error;}
 finally{
  state='restoring';emit('cleanup','enter');const errors=[];for(const close of restore.reverse())try{close();}catch(error){errors.push(error);}
  try{match.state=beforeState;match.paused=beforePaused;}catch(error){errors.push(error);}emit('cleanup','exit');
  if(errors.length)throw new AggregateError(failed?[failure,...errors]:errors,'Results diagnostic cleanup failed',failed?{cause:failure}:undefined);
 }
}
export async function runResultsWorkDiagnostic(page,progress){
 const listener=message=>progress.accept(message.text());let attached=false,failed=false,failure;
 try{page.on('console',listener);attached=true;return await page.evaluate(measureResultsWork,{token:progress.token});}
 catch(error){failed=true;failure=error;throw error;}
 finally{progress.seal();if(attached)try{page.off('console',listener);}catch(error){if(failed)throw new AggregateError([failure,error],'Results diagnostic listener cleanup failed',{cause:failure});throw error;}}
}
const boundedPages=new WeakSet();
// Playwright evaluate uses kNoTimeout, independently of setDefaultTimeout.
// This is a host-side failure deadline, not cancellation or GPU completion proof.
export function boundIdleEvaluations(page,phase=()=> 'evaluate',timers=globalThis){
 if(boundedPages.has(page))return page;
 const evaluate=page.evaluate;
 if(typeof evaluate!=='function')throw TypeError('Idle page has no evaluate method');
 page.evaluate=async function(...args){
   const operationPhase=phase(),timeoutMs=operationPhase==='results-work'&&args[0]===measureResultsWork?RESULTS_WORK_TIMEOUT_MS:IDLE_OPERATION_TIMEOUT_MS;let timer;
  try{return await Promise.race([
   Promise.resolve().then(()=>evaluate.apply(this,args)),
   new Promise((_,reject)=>{timer=timers.setTimeout(()=>{
     const error=Error(`Idle evaluate exceeded ${timeoutMs} ms (${operationPhase})`);
     Object.assign(error,{name:'IdleEvaluationTimeoutError',code:'INKWAVE_IDLE_EVALUATION_TIMEOUT',phase:operationPhase,timeoutMs});
    reject(error);
    },timeoutMs);})
  ]);}finally{timers.clearTimeout(timer);}
 };
 boundedPages.add(page);
 return page;
}
export function primaryIdleFailure(error){
 const seen=new Set();
 for(let i=0;i<16&&error instanceof AggregateError&&Object.hasOwn(error,'cause')&&!seen.has(error);i++){seen.add(error);error=error.cause;}
 return error;
}
const combineFailure=(primary,secondary,message)=>secondary instanceof AggregateError&&secondary.cause===primary
 ? secondary : new AggregateError([primary,secondary],message,{cause:primary});
// Failure diagnostics precede cleanup; no success receipt is committed until
// both the task and cleanup finish. Diagnostic/cleanup errors retain the cause.
export async function runIdleProbe(task,{diagnose,cleanup}){
 let value,failure,failed=false;
 const record=async error=>{try{await diagnose(error);return error;}catch(diagnosticError){return combineFailure(error,diagnosticError,'Idle failure diagnostics failed');}};
 try{value=await task();}catch(error){failed=true;failure=await record(error);}
 try{await cleanup(failure);}catch(cleanupError){failure=await record(failed?combineFailure(failure,cleanupError,'Idle probe cleanup failed'):cleanupError);failed=true;}
 if(failed)throw failure;
 return value;
}
// Fixed vocabulary and numeric bounds: never echo arbitrary error/event text.
export function formatIdleFailureProgress(error,data){
 const primary=primaryIdleFailure(error),phase=primary?.phase??data?.phase;
 const phases=['identity','boot','audio','clouds','clouds:day','clouds:sunset','clouds:golden','clouds:aggregate','far-stage-transitions','pause','results-work','gpu-identity','cold-boot-mobile'];
 const p=phase==='results-work'?data?.resultsWorkProgress:null,events=Array.isArray(p?.events)?p.events:[];
 let latest,region;
 for(let i=events.length-1;i>=Math.max(0,events.length-512);i--){const e=events[i];if(!e||typeof e!=='object'||e.producer==='cleanup')continue;latest??=e;if(e.state===latest.state&&e.frame===latest.frame&&!['frame','sample','cleanup','observer'].includes(e.producer)){region=e;break;}}
 region??=latest;
 const labels=['frame','sample','cleanup','observer','clock.advance','actorUpdates','projectileUpdates','paintFlushes','fxUpdates','R.render','match.update','controller','input.pollPad','input.endFrame','padMenus','network','paint.clock','environment','decor','props','camera','diorama','screenfx','fxHooks','projectile.sights','projectile.visuals','projectile.arc','showcase.update','showcase.render','audio.loops','audio.ambience','audio.listener','hud','menus','composer','renderer'];
 const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:null;
 const elapsed=v=>Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER?v:undefined;
 const observation=(c,capacity,messages)=>({retained:Array.isArray(c?.events)?integer(c.events.length,capacity):0,capacity:integer(c?.capacity,capacity),received:integer(c?.received,messages),limit:integer(c?.maxMessages,messages),truncated:c?.truncated===true});
 return 'INKWAVE_IDLE_FAILURE_PROGRESS '+JSON.stringify({phase:phases.includes(phase)?phase:'unknown',state:['setup','playing','results','restoring'].includes(latest?.state)?latest.state:'unknown',frame:integer(latest?.frame,120),completed:integer(latest?.completed,120),totalCompleted:integer(latest?.totalCompleted,240),elapsedMs:elapsed(latest?.elapsedMs),stateElapsedMs:elapsed(latest?.stateElapsedMs),gpuDrawSubmissions:integer(latest?.counts?.gpuDrawSubmissions,Number.MAX_SAFE_INTEGER)??undefined,worldRenders:integer(latest?.counts?.worldRenders,Number.MAX_SAFE_INTEGER)??undefined,sampledRegion:labels.includes(region?.producer)?region.producer:'unknown',regionEdge:['enter','exit','throw','limit'].includes(region?.edge)?region.edge:'unknown',observations:{critical:observation(p,512,32769),detail:observation(p?.detail,64,129),coarseEdgesPerFrame:128,criticalOmitted:integer(latest?.criticalSuppressed,Number.MAX_SAFE_INTEGER),detailOmitted:integer(latest?.detailSuppressed,Number.MAX_SAFE_INTEGER),gl:'counters-only'},scope:'sampled diagnostic; not GPU/FPS evidence'});
}
export function idleFailureReporter({publish,snapshot,page,screenshotPath,stderr=line=>console.error(line)}){
 let screenshotAttempted=false,summaryAttempted=false;
 return async error=>{
  const primary=primaryIdleFailure(error),timedOut=primary?.code==='INKWAVE_IDLE_EVALUATION_TIMEOUT'||primary?.code==='INKWAVE_CLOUD_SEQUENCE_TIMEOUT';
  let available;
  try{available=snapshot();}finally{if(!summaryAttempted){summaryAttempted=true;try{stderr(formatIdleFailureProgress(primary,available));}catch{/* Stderr observation must not replace the original failure. */}}}
  publish({...available,status:'failed',error:error?.stack||String(error),primaryError:primary?.stack||String(primary),relatedErrors:error instanceof AggregateError?error.errors.slice(0,8).map(e=>e?.stack||String(e)):undefined,operation:timedOut?{phase:primary.phase,timeoutMs:primary.timeoutMs,code:primary.code,...(Number.isFinite(primary.elapsedMs)?{elapsedMs:primary.elapsedMs,scope:primary.scope}:{})}:undefined});
  const activePage=page();
  if(!timedOut&&activePage&&!screenshotAttempted){screenshotAttempted=true;await activePage.screenshot({path:screenshotPath}).catch(()=>{});}
 };
}
export async function closeIdleResources(owner,server,primaryError){
 const errors=[];
 try{await owner?.close();}catch(error){errors.push(error);}
 try{if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){errors.push(error);}
 if(errors.length){
  if(primaryError)throw new AggregateError([primaryError,...errors],'Idle probe and cleanup failed',{cause:primaryError});
  if(errors.length===1)throw errors[0];
  throw new AggregateError(errors,'Idle cleanup failed');
 }
}
export function validateIdleResult(r) {
  const c=r.coldBoot;
  if(c?.quality!=='high'||c?.touch!==true||c?.gamePublishedAtAllocation!==false||c?.marina!==true||c?.cloud?.[0]!==1024||c?.cloud?.[1]!==320||c?.farSize!==256||c?.sameTargetsAfterBoot!==true)throw Error('Cold-boot mobile allocation gate');
  if(r.clouds?.length!==3||r.clouds.some((v,i)=>v.theme!==['day','sunset','golden'][i]||v.highBytes!==10485760||v.lowBytes!==2621440||!Number.isFinite(v.meanByteError)||v.meanByteError<0||v.meanByteError>8||!Number.isFinite(v.largeErrorFraction)||v.largeErrorFraction<0||v.largeErrorFraction>.1||v.highRepeatChanged!==0||!Number.isInteger(v.nonzero)||v.nonzero<100))throw Error('Cloud appearance/budget gate');
  if(r.far?.length!==4||r.far.some(v=>v.size!==256||v.disposes!==1||!v.deleted||!v.cleared||!v.sameEnvironment))throw Error('Far reflection disposal gate');
  if(r.pause?.renders!==1||r.pause.environment!==0||r.pause.paint!==0||r.pause.shadowMarks!==0||r.pause.menuTicks!==120||!r.pause.matchUnchanged||r.pause.resizeRenders!==1||r.pause.resumedRenders!==1||r.pause.onlineRenders!==3)throw Error('Offline pause work gate');
  if(!r.audio?.running||r.audio.initialPlayers!==0||r.audio.initialScheduler||r.audio.mutedTicks!==0||r.audio.mutedNodes!==0||r.audio.mutedPlayers!==0||r.audio.mutedScheduler||!r.audio.sfxPlayed||r.audio.resumedTrack!=='battle'||r.audio.toggleMaxPlayers!==1)throw Error('Muted music/SFX gate');
  const work=r.resultsWork;
  if(!work||work.frames!==120||work.playing.actorUpdates<=0||work.playing.projectileUpdates!==120||work.playing.paintFlushes!==120||work.playing.fxUpdates!==120||work.results.actorUpdates!==0||work.results.projectileUpdates!==0||work.results.paintFlushes!==0||work.results.fxUpdates!==0||work.playing.worldRenders!==120||work.results.worldRenders!==120||[work.playing,work.results].some(v=>!Number.isFinite(v.cpuSubmissionMs)||v.cpuSubmissionMs<0||!Number.isSafeInteger(v.gpuDrawSubmissions)||v.gpuDrawSubmissions<=0))throw Error('RESULT native work comparison gate');
  if(r.errors?.length||!r.gpu?.webgl?.startsWith('WebGL 2.0')||!r.gpu.renderer)throw Error('Browser/GPU errors');
  return {cloudMiB:[10,2.5],farTransitions:4,pausedWorldRenders:'1/120',mutedSchedulerTicks:0};
}
// Serialized into the same page exactly three times. One QA sample target and
// the same Game/Environment/renderer/cloud target survive between themes.
export async function measureCloudTheme({token,theme,index}){
 const themes=['day','sunset','golden'],key='__inkwaveIdleCloudSequence';
 if(!token||themes[index]!==theme)throw Error('Invalid cloud theme operation');
 let p=window[key],owned=p?.token===token,failed=false,failure,row;
 try{
  if(index===0){
   if(p)throw Error('Cloud sequence already owns resources');
   const G=__G;
   p={token,G,game:G.game,env:G.env,renderer:G.renderer,cloudRT:G.env._cloudRT,old:G.renderer.getRenderTarget(),next:0,samples:0,bakes:0};
   window[key]=p;owned=true;
   const THREE=await import('three'),{refreshEnvironmentBudget}=await import(new URL('patches/local-quality/idle-resources.mjs',document.baseURI).href);
   p.refresh=refreshEnvironmentBudget;p.scene=new THREE.Scene();p.cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);p.mat=new THREE.MeshBasicMaterial({toneMapped:false});p.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),p.mat);p.scene.add(p.quad);
   p.rt=new THREE.WebGLRenderTarget(256,80,{depthBuffer:false,stencilBuffer:false});
  }
  if(!owned||p.next!==index)throw Error('Cloud sequence owner or resource identity changed');
  const assertOwner=()=>{if(__G!==p.G||p.G.game!==p.game||p.G.env!==p.env||p.G.renderer!==p.renderer||p.env._cloudRT!==p.cloudRT)throw Error('Cloud sequence owner or resource identity changed');};
  assertOwner();const G=p.G,g=G.game,env=p.env,{scene,cam,mat,quad,rt,renderer,old}=p,refreshEnvironmentBudget=p.refresh;
  const beforeSamples=p.samples,beforeBakes=p.bakes,nativeTheme=env.setTheme,descriptor=Object.getOwnPropertyDescriptor(env,'setTheme');
  env.setTheme=function(...args){const value=nativeTheme.apply(this,args);p.bakes++;return value;};
  try{
   function sample(){mat.map=G.env._cloudRT.texture;mat.needsUpdate=true;renderer.setRenderTarget(rt);renderer.render(scene,cam);const a=new Uint8Array(256*80*4);renderer.readRenderTargetPixels(rt,0,0,256,80,a);renderer.setRenderTarget(old);return a;}
   function png(a){const c=document.createElement('canvas');c.width=256;c.height=80;const x=c.getContext('2d'),im=x.createImageData(256,80);for(let y=0;y<80;y++)im.data.set(a.subarray(y*1024,(y+1)*1024),(79-y)*1024);x.putImageData(im,0,0);return c.toDataURL('image/png').split(',')[1];}
   function setCloudTheme(theme){
    // Redirect only the resize-triggered native bake; the independent high
    // repeat and low refresh still execute their own complete native paths.
    const original=env.setTheme,descriptor=Object.getOwnPropertyDescriptor(env,'setTheme');let applied=false;
    try{env.setTheme=()=>{applied=true;return original.call(env,theme);};refreshEnvironmentBudget(env,G.settings,{touch:false});assertOwner();}
    finally{if(descriptor)Object.defineProperty(env,'setTheme',descriptor);else delete env.setTheme;}
    if(!applied)env.setTheme(theme);
   }
   G.settings.quality='high';setCloudTheme(theme);assertOwner();if(G.env.theme!==theme)throw Error("Unknown theme "+theme);const hi=sample();p.samples++;assertOwner();env.setTheme(theme);assertOwner();const repeat=sample();p.samples++;assertOwner();
   const highBytes=G.env._cloudRT.width*G.env._cloudRT.height*8;
   G.settings.quality='low';refreshEnvironmentBudget(env,G.settings,{touch:false});assertOwner();const lo=sample();p.samples++;assertOwner();let total=0,large=0,nonzero=0,highRepeatChanged=0;
   for(let i=0;i<hi.length;i++){const d=Math.abs(hi[i]-lo[i]);total+=d;if(d>32)large++;if(i%4!==3&&hi[i]>0)nonzero++;if(hi[i]!==repeat[i])highRepeatChanged++;}
   if(__G!==p.G||G.game!==p.game||G.env!==p.env||G.renderer!==p.renderer||G.env._cloudRT!==p.cloudRT)throw Error('Cloud sequence changed owners during measurement');
   if(p.samples-beforeSamples!==3||G.settings.quality!=='low'||G.env.theme!==theme)throw Error('Cloud theme did not finish all samples in low state');
   p.next++;
   if(index===2&&(p.next!==3||p.samples!==9))throw Error('Incomplete cloud sequence');
   row={theme,highBytes,lowBytes:G.env._cloudRT.width*G.env._cloudRT.height*8,meanByteError:total/hi.length,largeErrorFraction:large/hi.length,highRepeatChanged,nonzero,high:png(hi),low:png(lo),sampleCount:p.samples-beforeSamples,bakeCalls:p.bakes-beforeBakes,sequenceSamples:p.samples,sequenceBakeCalls:p.bakes,finalQuality:G.settings.quality,finalTheme:G.env.theme,identity:{sameGame:true,sameEnvironment:true,sameRenderer:true,sameCloudTarget:true,cloudTexture:p.cloudRT.texture.uuid,sampleTexture:rt.texture.uuid}};
  }finally{if(descriptor)Object.defineProperty(env,'setTheme',descriptor);else delete env.setTheme;}
  return row;
 }catch(error){failed=true;failure=error;throw error;}
 finally{
  if(owned&&(failed||index===2)){
   const cleanupErrors=[];
   for(const close of [()=>p.renderer.setRenderTarget(p.old),()=>p.quad?.geometry.dispose(),()=>p.mat?.dispose(),()=>p.rt?.dispose()])try{close();}catch(error){cleanupErrors.push(error);}
   if(!failed&&(__G!==p.G||p.G.game!==p.game||p.G.env!==p.env||p.G.renderer!==p.renderer||p.env._cloudRT!==p.cloudRT||p.G.settings.quality!=='low'||p.env.theme!=='golden'))cleanupErrors.push(Error('Cloud final state changed during cleanup'));
   if(window[key]===p)delete window[key];
   if(cleanupErrors.length){if(failed)throw new AggregateError([failure,...cleanupErrors],'Cloud theme failed: '+(failure?.message??String(failure))+'; cleanup also failed',{cause:failure});throw new AggregateError(cleanupErrors,'Cloud sample resource cleanup failed');}
  }
 }
}
// Serialized into the cold page. Preserve the allocation observer contract while
// retaining its stage for failures before the public Game/debug hook exists.
export async function observeColdEnvironment(url) {
 const trace=window.__coldResourceProbe={phase:'importing-context'};
 const {G}=await import(url);
 trace.phase='observing-environment';
 trace.snapshot=()=>({hasEnvironment:!!G.env,hasGame:!!G.game,hasRenderer:!!G.renderer,hasMenus:!!G.menus,hasLevel:!!G.level,hasPaint:!!G.paint,hasNav:!!G.nav,sceneChildren:G.scene?.children?.length??null,programs:G.renderer?.info?.programs?.length??null,menu:G.menus?.current||null,quality:G.settings?.quality||null,touch:G.mobile?.touch===true,mode:G.mode||null});
 const capture=env=>{if(env){trace.phase='captured';window.__coldEnvironment={quality:G.settings?.quality,touch:G.mobile?.touch===true,gamePublishedAtAllocation:!!G.game,marina:env._marina===true,cloud:[env._cloudRT?.width,env._cloudRT?.height],farSize:env._farRT?.width,cloudId:env._cloudRT?.texture.uuid,farId:env._farRT?.texture.uuid};}};
 // Module ordering may publish Environment before the main.js response is
 // observed. That is still a valid cold-allocation observation iff Game
 // has not been published yet; capture it immediately instead of waiting
 // forever for a setter that already fired.
 if(G.env){if(G.game)throw Error('Cold observer installed after Game publication');capture(G.env);return;}
 if(G.game)throw Error('Cold Game published before Environment observation');
 const original=Object.getOwnPropertyDescriptor(G,'env')||{configurable:true,enumerable:true,writable:true,value:undefined};let value=G.env;
 Object.defineProperty(G,'env',{configurable:true,enumerable:original.enumerable,get:()=>value,set:env=>{
  value=env;capture(env);
  Object.defineProperty(G,'env',{...original,value:env});
 }});
}
export function inspectColdBoot() {
 const p=window.__coldResourceProbe,report=window.__inkwaveStartup?.snapshot?.();
 const startup=report?{marks:Object.fromEntries(Object.entries(report.marks||{}).slice(-64)),phases:(report.phases||[]).slice(-64),longTasks:(report.longTasks||[]).slice(-32),errors:(report.errors||[]).slice(-20),dropped:report.dropped,memory:report.memory}:null;
 return {startup,observerPhase:p?.phase||null,context:p?.snapshot?.()||null,hasPublicContext:!!window.__G,hasPublicGame:!!window.__G?.game,hasColdEnvironment:!!window.__coldEnvironment,coldEnvironment:window.__coldEnvironment||null,readyState:document.readyState,visibility:document.visibilityState,focused:document.hasFocus(),screen:document.querySelector('.iw-ui')?.dataset.screen||null,loadingText:document.querySelector('.iw-loading')?.textContent?.slice(0,600)||null};
}

export async function retireDesktopForCold(page,browser){await page.close();await browser?.close();return null;}
export async function closeProbeOwner(owner,primaryError=null){
 try{await owner?.close();}catch(error){
  if(primaryError)throw new AggregateError([primaryError,error],'Probe failed and browser cleanup failed',{cause:primaryError});
  throw error;
 }
}
export async function launchColdMobileBrowser(chromium,profile){
 // A fresh process owns the cold compositor/RAF, as well as its storage. No
 // completed desktop renderer or persistent-context lifetime is reused here.
 const context=await chromium.launchPersistentContext(path.join(profile,'cold-mobile'),{headless:true,viewport:{width:844,height:390},hasTouch:true,isMobile:true,args:BROWSER_ARGS});
 try{return {context,page:context.pages()[0]??await context.newPage()};}
 catch(error){await closeProbeOwner(context,error);throw error;}
}

async function main(){
 const option=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required '+n);return path.resolve(process.argv[i+1]);};
 const site=fs.realpathSync(option('--site')),output=option('--evidence-dir'),profile=option('--profile-dir');
 for(const d of [output,profile]){if(['/tmp','/var/tmp','/dev/shm'].some(p=>d===p||d.startsWith(p+'/')))throw Error('Persistent evidence required');fs.mkdirSync(d,{recursive:true});}
 const publish=r=>fs.writeFileSync(path.join(output,'idle-resources-result.json'),JSON.stringify(r,null,2)+'\n');
 let browser,server,page,identity,result,resultsProgress;const errors=[],loaded=new Set();let phase='identity';
 publish({status:'running',phase});
  const diagnose=idleFailureReporter({publish,snapshot:()=>({phase,errors,result,resultsWorkProgress:resultsProgress?.snapshot(),loaded:[...loaded].slice(0,4096),loadedDropped:Math.max(0,loaded.size-4096),sourceSha:identity?.source.sourceSha,contentHash:identity?.manifest.contentHash}),page:()=>page,screenshotPath:path.join(output,'failure.png')});
 const receipt=await runIdleProbe(async()=>{
  identity=verifyWallBuild(site,process.argv.includes('--exact-source'));
  if(process.argv.includes('--exact-source')){
   const p='scripts/check-inkwave-idle-resources.mjs';
   if(execFileSync('git',['rev-parse','HEAD:'+p],{cwd:ROOT,encoding:'utf8'}).trim()!==execFileSync('git',['hash-object',p],{cwd:ROOT,encoding:'utf8'}).trim())throw Error('Idle verifier differs from commit');
  }
  const {manifest}=identity;
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!p.startsWith(site+path.sep)||!fs.statSync(p).isFile())throw Error('missing');res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='http://127.0.0.1:'+server.address().port+'/';
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:800,height:600},args:BROWSER_ARGS});
  page=boundIdleEvaluations(await browser.newPage(),()=>phase);page.setDefaultTimeout(IDLE_OPERATION_TIMEOUT_MS);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1500));});
  await page.route(address+'**',async route=>{try{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';if(manifest.artifacts[key]&&sha(body)!==manifest.artifacts[key])throw Error('Loaded byte mismatch '+key);loaded.add(key);await route.fulfill({response,body});}catch(e){errors.push(e.message);await route.abort();}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,music:0,sfx:1})));
  phase='boot';await page.goto(address+'?devstage&skipTitle',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__inkwave?.debug&&window.__G?.s3?.installed,null,{timeout:180000});
  await page.evaluate(()=>{__inkwave.debug.freeze();__inkwave.menus.wipe.cancel();});
  await page.keyboard.press('Shift');
  phase='audio';result=await page.evaluate(async()=>{
   const G=window.__G,g=G.game,m=G.music,a=G.audio;
   const initialPlayers=m.players.length,initialScheduler=!!(m.worker||m.timer);let ticks=0,nodes=0;
   const tick=m._tick,osc=a.ctx.createOscillator.bind(a.ctx);m._tick=function(...args){ticks++;return tick.apply(this,args);};a.ctx.createOscillator=(...args)=>{nodes++;return osc(...args);};
   try{
    const before=a.counts.played;a.play('jump');const sfxPlayed=a.counts.played>before;
    g._setSettings({music:.5});m.play('battle',{fade:0});await new Promise(r=>setTimeout(r,200));
    g._setSettings({music:0});ticks=nodes=0;await new Promise(r=>setTimeout(r,400));
    const mutedTicks=ticks,mutedNodes=nodes,mutedPlayers=m.players.length,mutedScheduler=!!(m.worker||m.timer);
    let toggleMaxPlayers=0;for(let i=0;i<10;i++){g._setSettings({music:.5});toggleMaxPlayers=Math.max(toggleMaxPlayers,m.players.length);g._setSettings({music:0});}
    m.play('battle');g._setSettings({music:.5});const resumedTrack=m.track;g._setSettings({music:0});
    return {audio:{initialPlayers,initialScheduler,mutedTicks,mutedNodes,mutedPlayers,mutedScheduler,sfxPlayed,resumedTrack,toggleMaxPlayers,running:a.ctx.state==='running'}};
   }finally{m._tick=tick;a.ctx.createOscillator=osc;}
  });
  phase='clouds';result.clouds=[];const cloudTrace=result.cloudSequence={},cloudToken=crypto.randomUUID();
  const cloudCheckpoint=()=>publish({status:'running',phase,result,sourceSha:identity.source.sourceSha,contentHash:manifest.contentHash});
  await runCloudThemeSequence(
   ({theme,index})=>page.evaluate(measureCloudTheme,{token:cloudToken,theme,index}),
   (row,index,checkOverall)=>{
    const {high,low,...metrics}=row,saved={...metrics,artifacts:{high:null,low:null}};
    if(index!==result.clouds.length)throw Error('Cloud artifact order changed');
    result.clouds.push(saved);
    for(const [name,encoded]of [['high',high],['low',low]]){
     checkOverall();const file=`cloud-${row.theme}-${name}.png`;
     fs.writeFileSync(path.join(output,file),Buffer.from(encoded,'base64'));saved.artifacts[name]=file;
    }
   },
   {phase:value=>{phase=value;cloudCheckpoint();},checkpoint:cloudCheckpoint,trace:cloudTrace}
  );
  phase='far-stage-transitions';result.far=await page.evaluate(async()=>{
   const G=__G,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI).href),env=G.env,gl=G.renderer.getContext(),deleted=new Set(),del=gl.deleteTexture.bind(gl);
   gl.deleteTexture=t=>{deleted.add(t);return del(t);};const rows=[];
   try{for(let i=0;i<4;i++){
    await g._buildWorld(MAPS.find(m=>m.id==='halyard'));const rt=env._farRT;if(!rt)throw Error('Halyard cube absent');let disposes=0;rt.addEventListener('dispose',()=>disposes++);
    const handle=G.renderer.properties.get(rt.texture).__webglTexture;if(!handle)throw Error('Cube never reached GPU');
    await g._buildWorld(MAPS.find(m=>m.id==='tidewater'));
    rows.push({size:rt.width,disposes,deleted:deleted.has(handle),cleared:env._farRT===null&&env._farCam===null&&env.U.uFarCube.value===null&&env.U.uFarOn.value===0,sameEnvironment:G.env===env});
   }}finally{gl.deleteTexture=del;}return rows;
  });
  phase='pause';await page.evaluate(async()=>{await __inkwave.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});__inkwave.debug.freeze();__inkwave.debug.freezeBots();__inkwave._skipRender=true;for(let i=0;i<270;i++)__inkwave._frame(1/60);__inkwave._skipRender=false;__inkwave.menus.wipe.cancel();__inkwave.pause();});
  result.pause=await page.evaluate(()=>{
   const G=__G,g=G.game,c={renders:0,environment:0,paint:0,shadowMarks:0,menuTicks:0};const restore=[];
   for(const [obj,key,label] of [[g.R,'render','renders'],[G.env,'update','environment'],[G.paint,'flush','paint'],[g.menus,'update','menuTicks']]){const old=obj[key];obj[key]=function(...a){c[label]++;return old.apply(this,a);};restore.push(()=>obj[key]=old);}
   const snapshot=()=>JSON.stringify({time:g.match.time,actors:G.actors.map(a=>[a.pos.x,a.pos.y,a.pos.z,a.hp,a.alive])}),before=snapshot();
   try{for(let i=0;i<120;i++){G.renderer.shadowMap.needsUpdate=false;g._frame(1/60);if(G.renderer.shadowMap.needsUpdate)c.shadowMarks++;}c.matchUnchanged=before===snapshot();window.__idlePause=c;}
   finally{restore.forEach(f=>f());}return c;
  });
  await page.screenshot({path:path.join(output,'offline-paused.png'),animations:'disabled'});
  await page.setViewportSize({width:810,height:610});
  const extra=await page.evaluate(()=>{
   const G=__G,g=G.game,old=g.R.render;let draws=0;g.R.render=function(...a){draws++;return old.apply(this,a);};
   try{g._frame(1/60);g._frame(1/60);const resizeRenders=draws;draws=0;g.resume();g._frame(1/60);const resumedRenders=draws;
    // Network presence is a control-plane fixture only: actual rendering and Game._frame stay production.
    // Do not pretend this is a two-peer network timing validation.
    const net=G.netm;G.netm={};g.match.paused=true;draws=0;try{for(let i=0;i<3;i++)g._frame(1/60);}finally{G.netm=net;g.match.paused=false;}return {resizeRenders,resumedRenders,onlineRenders:draws};
   }finally{g.R.render=old;}
  });Object.assign(result.pause,extra);
  // #53 compares actual published-frame CPU producers and WebGL draw submissions.
  // CPU submission time includes JS/driver submission, not asynchronous GPU time.
  // Results still need backdrop/presentation draws, so no FPS/draw-reduction target
  // is invented. The existing browser/GL and exact-source identities remain gates.
  phase='results-work';resultsProgress=createResultsProgress(crypto.randomUUID());result.resultsWork=await runResultsWorkDiagnostic(page,resultsProgress);
  phase='gpu-identity';result.gpu=await page.evaluate(()=>{const gl=__G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {webgl:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  for(const f of ['patches/local-quality/idle-resources.mjs','patches/local-quality/music-idle.mjs'])if(![...loaded].some(p=>p.endsWith('/'+f)))throw Error('Runtime module not actually loaded: '+f);
  phase='cold-boot-mobile';
  // The preceding desktop measurements are complete. Retire its live renderer
  // before measuring an isolated cold mobile allocation in a fresh context.
  page=await retireDesktopForCold(page,browser);browser=null;
  const {context:coldContext,page:coldPage}=await launchColdMobileBrowser(chromium,profile);const coldBrowserVersion=coldContext.browser()?.version();let hooked=false,mainReleased=false,coldError=null,coldEvaluationError=null;const coldLoaded=new Set(),coldPending=new Map();let pendingDropped=0,pendingSerial=0;
  try {
   boundIdleEvaluations(coldPage,()=>phase);
   coldPage.on('pageerror',e=>errors.push('cold boot: '+e.message));
   coldPage.on('console',m=>{if(m.type()==='error')errors.push('cold boot console: '+m.text().slice(0,1500));});
   await coldPage.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:false,bloom:false,music:0,sfx:0})));
   await coldPage.route(address+'**',async route=>{
    const pendingKey=++pendingSerial,pendingPath=new URL(route.request().url()).pathname;
    if(coldPending.size<256)coldPending.set(pendingKey,{path:pendingPath,started:Date.now(),type:route.request().resourceType()});else pendingDropped++;
    try {
     const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';
     if(manifest.artifacts[key]&&sha(body)!==manifest.artifacts[key])throw Error('Cold loaded byte mismatch '+key);
     coldLoaded.add(key);
     if(!hooked&&key.endsWith('/src/main.js')){
      hooked=true;
      // Observe the real G.env publication before the unmodified main module
      // executes. No constructor, target factory, budget, or served bytes change.
      try{await coldPage.evaluate(observeColdEnvironment,new URL('./core/ctx.js',response.url()).href);}
      catch(error){coldEvaluationError??=error;throw error;}
     }
     await route.fulfill({response,body});
     if(key.endsWith('/src/main.js'))mainReleased=true;
    }catch(error){errors.push('cold boot route: '+error.message);await route.abort();}
    finally{coldPending.delete(pendingKey);}
   });
   await coldPage.goto(address+'?devstage&skipTitle&map=halyard&startupProfile',{waitUntil:'domcontentloaded'});
   await coldPage.bringToFront();
   await coldPage.waitForFunction(()=>!!window.__G?.game&&!!window.__coldEnvironment,null,{timeout:180000});
   result.coldBoot=await coldPage.evaluate(()=>{const G=window.__G,c=window.__coldEnvironment;G.game.debug.freeze();return {...c,sameTargetsAfterBoot:c.cloudId===G.env._cloudRT?.texture.uuid&&c.farId===G.env._farRT?.texture.uuid};});
   if(!hooked||![...coldLoaded].some(p=>p.endsWith('/src/world/environment.js')))throw Error('Cold native Environment bytes not observed');
   await coldPage.screenshot({path:path.join(output,'cold-boot-mobile-halyard.png'),animations:'disabled'});
  } catch(error) {
   coldError=coldEvaluationError??error;
   const diagnostic=result.coldDiagnostic={error:String(coldError),hooked,mainReleased,desktopRetired:page===null,loaded:[...coldLoaded].sort(),pendingDropped,pending:[...coldPending].slice(0,256).map(([,r])=>({path:r.path,type:r.type,elapsedMs:Math.max(0,Date.now()-r.started)}))};
   if(primaryIdleFailure(coldError)?.code==='INKWAVE_IDLE_EVALUATION_TIMEOUT'){
    diagnostic.inspectionUnavailable='Evaluation deadline expired; available Node-side observations retained without another browser call';
   }else{
   let timer;
   try {diagnostic.page=await Promise.race([coldPage.evaluate(inspectColdBoot),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cold diagnostic evaluation timed out')),10000);})]);}
   catch(inspectError){diagnostic.inspectionError=String(inspectError);}finally{clearTimeout(timer);}
   try{await coldPage.screenshot({path:path.join(output,'cold-boot-failure.png'),timeout:15000});}catch(captureError){diagnostic.screenshotError=String(captureError);}
   }
   // Persist the available cold observations before a potentially stalled close.
   try{await diagnose(coldError);}catch(diagnosticError){coldError=combineFailure(coldError,diagnosticError,'Idle failure diagnostics failed');}
   throw coldError;
  } finally {try{await closeProbeOwner(coldContext,coldError);}catch(closeError){if(coldError)result.coldDiagnostic.closeError=String(closeError.errors?.at(-1)||closeError);throw closeError;}}
  result.errors=errors;const summary=validateIdleResult(result);
  return {status:'passed',...result,summary,resultsWorkProgress:resultsProgress?.snapshot(),sourceSha:identity.source.sourceSha,contentHash:manifest.contentHash,verifierSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),browser:coldBrowserVersion};
 },{
  diagnose,
  cleanup:error=>closeIdleResources(browser,server,error)
 });
 publish(receipt);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
