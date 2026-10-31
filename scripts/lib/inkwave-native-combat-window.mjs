import {randomUUID} from 'node:crypto';

// Only observe the production RAF. A slow software renderer still needs three
// real frames and native paint; elapsed wall time alone is not a sufficient sample.
export function beginNativeCombatWindow({mapId,minimumMs,leaseId}) {
 const G=globalThis.__G,g=globalThis.__inkwave,p=globalThis.__gameplayProbe;
 if(!Number.isFinite(minimumMs)||minimumMs<=0)throw Error('Positive combat duration required');
 if(!G||!g||!p)throw Error('Native gameplay observer unavailable');
 // The closure retains only weak references to scene and observer objects.
 const w={leaseId:leaseId??`local-${globalThis.__nativeCombatLeaseSerial=(globalThis.__nativeCombatLeaseSerial||0)+1}`,game:new WeakRef(G),app:new WeakRef(g),observer:new WeakRef(p),match:new WeakRef(G.match),level:new WeakRef(G.level),mapId,minimumMs,startedAt:performance.now(),startTime:G.time,startFrames:p.totalFrames};
 w.inspect=function(expectedLease){
  const G=globalThis.__G,g=globalThis.__inkwave,p=globalThis.__gameplayProbe;
  if(!G||!g||!p||p.combatWindow!==w||(expectedLease!=null&&expectedLease!==w.leaseId))throw Error('Native combat window unavailable or superseded');
  if(G!==w.game.deref()||g!==w.app.deref()||p!==w.observer.deref()||G.match!==w.match.deref()||G.level!==w.level.deref()||g.mapDef?.id!==w.mapId||G.match?.state!=='playing'||G.mode!=='match'||G.actors?.length!==8||g.frozen||g._skipRender||p.contextLost)throw Error('Native combat scene changed during sampling');
  const elapsedMs=performance.now()-w.startedAt,frames=p.totalFrames-w.startFrames;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isInteger(frames)||frames<0)throw Error('Invalid native combat observation');
  if(elapsedMs<w.minimumMs||frames<3||!(G.time>w.startTime))return false;
  const coverage=G.paint?.coverage?.();
  if(!Array.isArray(coverage)||coverage.length!==2||!Number.isFinite(coverage[0])||!Number.isFinite(coverage[1])||coverage.some(v=>v<0))throw Error('Invalid native combat paint coverage');
  if(!coverage.some(v=>v>0))return false;
  return {leaseId:w.leaseId,elapsedMs,frames,startTime:w.startTime,endTime:G.time,minimumMs:w.minimumMs,coverage:coverage.slice()};
 };
 p.combatWindow=w;
 return w.leaseId;
}

export function inspectNativeCombatWindow({leaseId}={}) {
 const w=globalThis.__gameplayProbe?.combatWindow;
 if(!w||typeof w.inspect!=='function')throw Error('Native combat window unavailable');
 return w.inspect(leaseId);
}

// Failure-only, read-only primitive metadata. It is never an acceptance receipt
// and never calls inspect(), simulates a frame, queries GL, or retains owners.
export function nativeCombatWindowTimeoutState({leaseId}={}) {
 const G=globalThis.__G,g=globalThis.__inkwave,p=globalThis.__gameplayProbe,w=p?.combatWindow;
 if(!w||w.leaseId!==leaseId)return {available:false,leaseMatches:false};
 const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const label=value=>typeof value==='string'&&value.length<=64?value:null;
 const elapsedMs=number(performance.now()-w.startedAt),startTime=number(w.startTime),endTime=number(G?.time),minimumMs=number(w.minimumMs);
 const totalFrames=number(p.totalFrames),startFrames=number(w.startFrames),frames=totalFrames!==null&&startFrames!==null?number(totalFrames-startFrames):null;
 // coverage() is not a read-only query: production scoring updates versions,
 // sparse indexes and cached ratios. Read only the already stored primitives.
 const paint=G?.paint,cache=paint?._s3Coverage;
 const cacheValues=Array.isArray(cache)&&cache.length===2&&cache.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)?[cache[0],cache[1]]:null;
 const version=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const paintVersion=version(paint?.version),observedVersion=version(paint?._s3ObservedPaintVersion),turfVersion=version(paint?._s3TurfVersion),coverageVersion=version(paint?._s3CoverageVersion);
 const identity=(a,b)=>a!=null&&b!=null?a===b:null;
 const gridMatches=identity(paint?._s3CoverageGrid,paint?.grid),deadMatches=identity(paint?._s3CoverageDead,paint?.dead),facesMatch=identity(paint?._s3CoverageFaces,paint?.paintFaces);
 const checks=[paintVersion!==null&&observedVersion!==null?paintVersion===observedVersion:null,turfVersion!==null&&coverageVersion!==null?turfVersion===coverageVersion:null,gridMatches,deadMatches,facesMatch];
 const cacheFresh=checks.some(value=>value===false)?false:checks.every(value=>value===true)?true:null;
 const coverage=cacheFresh===true?cacheValues:null;
 return {available:true,leaseMatches:true,scope:'timeout-only metadata; not acceptance',elapsedMs,minimumMs,startTime,endTime,startFrames,totalFrames,frames,
  phase:label(G?.mode),matchState:label(G?.match?.state),expectedMap:label(w.mapId),map:label(g?.mapDef?.id),actorCount:number(G?.actors?.length),
  sameGame:G===w.game.deref(),sameApp:g===w.app.deref(),sameObserver:p===w.observer.deref(),sameMatch:G?.match===w.match.deref(),sameLevel:G?.level===w.level.deref(),
  frozen:typeof g?.frozen==='boolean'?g.frozen:null,skipRender:typeof g?._skipRender==='boolean'?g._skipRender:null,contextLost:typeof p.contextLost==='boolean'?p.contextLost:null,
  coverage,paintCache:{values:cacheValues,paintVersion,observedVersion,turfVersion,coverageVersion,gridMatches,deadMatches,facesMatch,fresh:cacheFresh},minimumDurationMet:elapsedMs!==null&&minimumMs!==null?elapsedMs>=minimumMs:null,
  threeFramesMet:frames!==null&&Number.isInteger(frames)?frames>=3:null,timeAdvanced:startTime!==null&&endTime!==null?endTime>startTime:null,
  paintPositive:coverage?coverage.some(v=>v>0):null};
}

// Keep the lease through the caller's profile stop and atomic capture.
export async function waitForNativeCombatWindow(page,{mapId,minimumMs,extraTimeoutMs=120000},onReady,onTimeoutDiagnostic) {
 if(!Number.isFinite(extraTimeoutMs)||extraTimeoutMs<=0)throw Error('Positive native combat timeout required');
 const leaseId=randomUUID();let handle,value,failure,failed=false,waiting=false;
 try{
  await page.evaluate(beginNativeCombatWindow,{mapId,minimumMs,leaseId});
  waiting=true;
  handle=await page.waitForFunction(inspectNativeCombatWindow,{leaseId},{polling:100,timeout:minimumMs+extraTimeoutMs});
  waiting=false;
  value=await handle.jsonValue();
  if(onReady)await onReady(value);
 }catch(error){
  failure=error;failed=true;
  let timeout=false;try{timeout=waiting&&error?.name==='TimeoutError';}catch{}
  if(timeout&&typeof onTimeoutDiagnostic==='function'){
   let timer,saveTimer;const diagnosticStarted=performance.now();
   try{
    const diagnostic=await Promise.race([
     Promise.resolve().then(()=>page.evaluate(nativeCombatWindowTimeoutState,{leaseId})).then(state=>({status:'captured',state}),()=>({status:'unavailable'})),
     new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'diagnostic-timeout'}),2000);}),
    ]);
    // A diagnostic or its persistence failure cannot replace the real failure.
    try{
     const saved=Promise.resolve(onTimeoutDiagnostic(diagnostic)).catch(()=>{});
     const remaining=Math.max(0,2000-(performance.now()-diagnosticStarted));
     if(remaining>0)await Promise.race([saved,new Promise(resolve=>{saveTimer=setTimeout(resolve,remaining);})]);
    }catch{}
   }finally{clearTimeout(timer);clearTimeout(saveTimer);}
  }
 }
 finally{
  try{await handle?.dispose();}catch(error){if(!failed){failure=error;failed=true;}}
  try{await page.evaluate(id=>{const p=globalThis.__gameplayProbe;if(p?.combatWindow?.leaseId===id)delete p.combatWindow;},leaseId);}catch(error){if(!failed){failure=error;failed=true;}}
 }
 if(failed)throw failure;
 return value;
}
