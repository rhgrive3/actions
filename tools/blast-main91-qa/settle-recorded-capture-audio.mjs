// QA admission only. Call after native boot/warm, before RNG reset and heavy screenshots.
export async function settleRecordedCaptureAudio({timeoutMs=90000}={}){
 const env=globalThis,G=env.__G,g=env.__inkwave,a=g?.match?.local,audio=G?.audio,loader=audio?._realS3Loader,ctx=audio?.ctx;
 const kit=a?.weaponRunner?._mainAudioState?.kitPrefetch,owner=kit?.owner,weapon=a?.weapon,mainId=weapon?.id;
 const report={schema:1,scope:'selected native weapon and kit before synchronous capture',status:'failed',timeoutMs,startedBrowserMs:env.performance.now(),before:null,after:null,waits:[],main:null,error:null};
 const snapshot=()=>({browserMonoMs:env.performance.now(),mainId:a?.weapon?.id,sub:a?.weapon?.sub,special:a?.weapon?.special,
  stats:loader?.stats?.()??null,totalErrorCount:loader?.totalErrorCount??null,errors:Array.isArray(loader?.errors)?loader.errors.slice():null,
  pendingJobs:loader?.pendingJobs?.length??null,inFlightKeys:loader?.inFlight?[...loader.inFlight.keys()]:null,draining:loader?.draining??null,
  contextState:ctx?.state??null,bankPending:loader?.bank?.authorized?.pending??null,
  kitRequests:Array.isArray(kit?.requests)?kit.requests.map(r=>({id:r.id,event:r.event,declared:loader.declares(r.id,r.event),resident:loader.isEventResident(r.id,r.event)})):null});
 let active=true;
 const invariant=()=>{
  if(!active)throw Error('QA settle observation ended');
  if(env.__G!==G||env.__inkwave!==g||g.match?.local!==a||G.audio!==audio||audio._realS3Loader!==loader||audio.ctx!==ctx||a.weapon!==weapon||a.weaponRunner?._mainAudioState?.kitPrefetch!==kit||kit.owner!==owner)throw Error('Audio/actor/kit ownership changed while settling');
 };
 let timer;
 try{
  report.before=snapshot();
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>90000)throw Error('Invalid bounded QA settle timeout');
  if(!a||!audio||!loader||!ctx||!mainId||!kit||!owner||!Array.isArray(kit.requests)||!kit.requests.length)throw Error('Native selected kit prefetch is unavailable');
  if(g._skipRender!==true||g.frozen!==true)throw Error('Native QA warm must already freeze simulation and skip rendering');
  if(!Number.isInteger(loader.totalErrorCount)||loader.totalErrorCount!==0||!Array.isArray(loader.errors)||loader.errors.length)throw Error('Audio has prior errors; no retry or error clearing is allowed');
  const work=async()=>{
   invariant();
   const main=await audio.requireRecordedMainShot(mainId);invariant();report.main=main;
   if(report.main?.ready!==true)throw Error('Selected main recording is not ready');
   for(let round=0;round<64;round++){
    invariant();
    const pending=[...loader.inFlight.entries()];
    if(pending.length){
     const settled=await Promise.allSettled(pending.map(([,promise])=>promise));
     invariant();report.waits.push({round,keys:pending.map(([key])=>key),results:settled.map(r=>r.status==='fulfilled'?{status:r.status,value:r.value}:{status:r.status,error:String(r.reason?.message||r.reason)})});
     if(settled.some(r=>r.status==='rejected'))throw Error('Active audio request rejected');
     if(settled.some(r=>r.value?.errors?.length||r.value?.rejected>0||r.value?.cancelled||r.value?.unavailable||r.value?.throttled))throw Error('Active audio request did not succeed');
    }
    await new Promise(resolve=>setTimeout(resolve,0));
    invariant();
    if(loader.totalErrorCount!==report.before.totalErrorCount||loader.errors.length!==report.before.errors.length)throw Error('Audio errors increased while settling');
    if(loader.inFlight.size===0&&loader.pendingJobs.length===0&&!loader.draining){
     if(loader.bank?.authorized?.pending!==0)throw Error('Authorized audio decode still pending');
     if(loader.status!=='ready'||ctx.state!=='running')throw Error('Audio loader/context is not ready');
     for(const request of kit.requests){
      const declared=loader.declares(request.id,request.event);
      if(declared!==true&&declared!==false)throw Error('Selected kit declaration unavailable');
      if(declared===true&&!loader.isEventResident(request.id,request.event))throw Error('Selected recorded kit event not resident: '+request.id+'/'+request.event);
     }
     return;
    }
   }
   throw Error('Audio settle round bound exceeded');
  };
  await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('QA audio settle watchdog expired; product deadlines unchanged')),timeoutMs);})]);
  report.status='ready';
 }catch(error){report.error=String(error?.stack||error);}
 finally{active=false;clearTimeout(timer);try{report.after=snapshot();}catch(error){report.after={error:String(error)};}report.finishedBrowserMs=env.performance.now();}
 return report;
}
