// QA only. Source-bound .45s orbit/follow transition, not adaptive frame alignment.
// LOCAL sequencing candidate: scheduled portrait completion after frame 1, then 27 frames.
// Existing application callbacks remain active. No native clock/pose/job writes.
export async function conditionMaterialEntry({g,G,frame,observe,clocks,requireSettled,yieldTask,now,checkpoint=()=>{}}) {
 const dt=1/60, duration=.45, frames=Math.floor(duration/dt)+1;
 const actor=G.local,character=actor?.character,rig=g.rig,renderer=G.renderer,showcase=g.showcase,portraitCharacter=showcase?._portraitCharacter;
 if(!portraitCharacter||typeof portraitCharacter!=='object')throw Error('Entry retained portrait owner missing');
 let retainedJob=null;
 let actualFrames=0,callbackWaitMs=0,polls=0;const callbackPhases=[];
 const identity=()=>{if(G.game!==g||G.local!==actor||actor?.character!==character||g.rig!==rig||G.renderer!==renderer||g.showcase!==showcase||showcase._portraitCharacter!==portraitCharacter||!g.frozen)throw Error('Entry native owner/freeze changed');if(retainedJob){const {job,cbs,callbacks,key,req,epoch}=retainedJob;if((showcase._portraitJob&&showcase._portraitJob!==job)||job.cbs!==cbs||cbs.length!==callbacks.length||cbs.some((cb,i)=>cb!==callbacks[i])||job.key!==key||job.req!==req||job._portraitCacheEpoch!==epoch)throw Error('Existing portrait job/callback lifetime changed');}};
 identity();const before=observe();
 if(before.rig.mode!=='follow'||before.rig.previousMode!=='orbit'||before.rig.blend!==null)throw Error('Unexpected source-bound entry transition');
 const fixedState=()=>{const s=observe();return{clock:JSON.stringify(clocks()),pose:JSON.stringify({rig:s.rig,camera:s.camera,input:s.input})};};
 const assertFixedState=fixed=>{identity();const current=fixedState();if(current.clock!==fixed.clock)throw Error('Native simulation advanced across callback await');if(current.pose!==fixed.pose)throw Error('Native entry pose/input changed across callback await');};
 const waitWithoutNativeStep=async()=>{
  const fixed=JSON.stringify(clocks()),pose=observe(),poseKey=JSON.stringify({rig:pose.rig,camera:pose.camera,input:pose.input});await yieldTask();identity();
  if(JSON.stringify(clocks())!==fixed)throw Error('Native simulation advanced during callback wait');
  const after=observe();if(JSON.stringify({rig:after.rig,camera:after.camera,input:after.input})!==poseKey)throw Error('Native entry pose/input changed during callback wait');
 };
 const portraitComplete=state=>{
  const p=state.jobs?.portrait;
  if(!p||p.warmState!=='done'||!Number.isInteger(p.queued)||p.queued<0||!Number.isInteger(p.inFlight)||p.inFlight<0||['hasJob','hasTask','hasActiveCharacter','hasPreparedCharacter'].some(k=>typeof p[k]!=='boolean'))throw Error('Existing portrait evidence invalid');
  // A queued, not-yet-serviced job may need another _portraitStep. Never service it ourselves.
  if(p.queued!==0)throw Error('Existing portrait queued work cannot be drained without native servicing');
  const active=['hasJob','hasTask','hasActiveCharacter','hasPreparedCharacter'].some(k=>p[k]);
  if(active&&!p.hasJob&&p.inFlight===0)throw Error('Existing portrait continuation has no active owner');
  return !active&&p.inFlight===0;
 };
 const waitCallbacks=async(label,ready)=>{
  const before=observe(),start=now();let previousElapsed=0;
  if(!Number.isFinite(start))throw Error('Existing callback clock invalid');
  checkpoint('callback-phase-start',{label,ordinal:actualFrames,before,remainingMs:20000-callbackWaitMs});
  while(true){
   identity();const state=observe(),settled=ready(state),elapsed=now()-start;
   if(!Number.isFinite(elapsed)||elapsed<previousElapsed||callbackWaitMs+elapsed>20000||polls>2000)throw Error('Existing callback readiness deadline');
   previousElapsed=elapsed;
   if(settled){
    callbackWaitMs+=elapsed;const phase={label,ordinal:actualFrames,elapsedMs:elapsed,before,after:state};callbackPhases.push(phase);
    checkpoint('callback-phase-ready',{...phase,totalCallbackWaitMs:callbackWaitMs});return;
   }
   polls++;await waitWithoutNativeStep();
  }
 };
 checkpoint('settled-entry-start',{frames,duration,dt});
 for(let i=0;i<frames;i++){
  identity();frame(i);actualFrames++;const state=observe();
  if(!state.rig.blend||state.rig.blend.dur!==duration)throw Error('Native blend topology/duration changed');
  if(i===0){
   if(state.jobs?.portrait?.hasJob){
    const job=showcase._portraitJob;
    if(!job||!Array.isArray(job.cbs)||job.cbs.length===0||job.cbs.some(cb=>typeof cb!=='function')||typeof job.key!=='string'||!job.req||typeof job.req!=='object')throw Error('Existing portrait job/callback evidence invalid');
    retainedJob={job,cbs:job.cbs,callbacks:job.cbs.slice(),key:job.key,req:job.req,epoch:job._portraitCacheEpoch};
   }
   const fixed=fixedState();
   await waitCallbacks('scheduled-portrait-after-first-frame',portraitComplete);
   assertFixedState(fixed);
  }
  await waitWithoutNativeStep();
 }
 const afterFrames=observe();
 if(afterFrames.rig.blend.active)throw Error('Fixed native frames did not settle blend');
 const fixedFinal=fixedState();
 await waitCallbacks('final-entry-after-28-frames',state=>{
  try{requireSettled(state,actualFrames,frames);}catch(error){
   if(!String(error.message).startsWith('Existing native '))throw error;
   return false;
  }
  return true;
 });
 assertFixedState(fixedFinal);
 const result={diagnosticOnly:true,performanceAccepted:false,sequence:'first-frame-existing-portrait-then-27',frames,actualFrames,dt,duration,before,afterFrames,after:observe(),callbackWaitMs,polls,callbackPhases};
 checkpoint('settled-entry-ready',{frames,callbackWaitMs,polls,sequence:result.sequence});return result;
}
