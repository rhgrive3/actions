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

// Keep the lease through the caller's profile stop and atomic capture.
export async function waitForNativeCombatWindow(page,{mapId,minimumMs,extraTimeoutMs=120000},onReady) {
 if(!Number.isFinite(extraTimeoutMs)||extraTimeoutMs<=0)throw Error('Positive native combat timeout required');
 const leaseId=randomUUID();let handle,value,failure,failed=false;
 try{
  await page.evaluate(beginNativeCombatWindow,{mapId,minimumMs,leaseId});
  handle=await page.waitForFunction(inspectNativeCombatWindow,{leaseId},{polling:100,timeout:minimumMs+extraTimeoutMs});
  value=await handle.jsonValue();
  if(onReady)await onReady(value);
 }catch(error){failure=error;failed=true;}
 finally{
  try{await handle?.dispose();}catch(error){if(!failed){failure=error;failed=true;}}
  try{await page.evaluate(id=>{const p=globalThis.__gameplayProbe;if(p?.combatWindow?.leaseId===id)delete p.combatWindow;},leaseId);}catch(error){if(!failed){failure=error;failed=true;}}
 }
 if(failed)throw failure;
 return value;
}
