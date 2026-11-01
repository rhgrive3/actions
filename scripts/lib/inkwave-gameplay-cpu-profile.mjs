import {performance} from 'node:perf_hooks';

// Own one already-started CDP profile. Success keeps the existing stop/save
// sequence; failure cleanup is diagnostic only and cannot replace its cause.
export function createGameplayCpuProfileCapture({cdp,save,fileName,failureBudgetMs=2000}) {
 if(!cdp||typeof cdp.send!=='function'||typeof save!=='function')throw TypeError('CDP and profile writer required');
 if(!Number.isFinite(failureBudgetMs)||failureBudgetMs<=0)throw RangeError('Positive profile cleanup budget required');
 let stopPromise,savePromise,disablePromise,cleanupPromise,received=false,saved=false;
 // Reserve each cached promise before invoking an external adapter: send()
 // and a diagnostic callback may synchronously reenter failure cleanup.
 const send=method=>Promise.resolve().then(()=>cdp.send(method));
 const read=()=>{
  if(!stopPromise)stopPromise=send('Profiler.stop').then(result=>{const {profile}=result;received=true;return profile;});
  return stopPromise;
 };
 const expired=Symbol('profile cleanup deadline');
 const persist=(profile,deadline=Infinity)=>Promise.resolve().then(()=>{
  if(savePromise)return savePromise;
  // Timer tasks can be delayed behind a settled CDP promise. Check the real
  // monotonic deadline at the dispatch boundary, before starting a new write.
  if(performance.now()>=deadline)return expired;
  let resolve,reject;
  savePromise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  // Reserve the writer promise before an injected writer can reenter.
  try{Promise.resolve(save(profile)).then(()=>{saved=true;resolve();},reject);}catch(error){reject(error);}
  return savePromise;
 });
 const stopAndSave=()=>read().then(persist);
 const bounded=async(promise,deadline)=>{
  const observed=Promise.resolve(promise).then(
   value=>performance.now()>=deadline?{ok:false,timeout:true}:{ok:true,value},
   ()=>performance.now()>=deadline?{ok:false,timeout:true}:{ok:false,failed:true});
  const remaining=Math.max(0,deadline-performance.now());
  if(!remaining)return {ok:false,timeout:true};
  let timer;
  try{return await Promise.race([observed,new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,timeout:true}),remaining);})]);}
  finally{clearTimeout(timer);}
 };
 const cleanupFailure=()=>{
  if(cleanupPromise)return cleanupPromise;
  cleanupPromise=(async()=>{
   const deadline=performance.now()+failureBudgetMs;let status='cleanup-unavailable',disableStatus='not-attempted';
   try{
    const stopped=await bounded(read(),deadline);
    if(!stopped.ok)status=stopped.timeout?'profile-timeout':'profile-stop-failed';
    else {
     const result=await bounded(persist(stopped.value,deadline),deadline);
     status=result.ok&&result.value!==expired?'saved':result.timeout||result.value===expired?'profile-timeout':'profile-save-failed';
    }
   }catch{status='cleanup-unavailable';}
   // Never detach the shared Performance/Heap CDP session. Disable only this
   // profiler on failure; browser.close in the original finally owns disposal.
   try{
    disablePromise??=send('Profiler.disable');
    const result=await bounded(disablePromise,deadline);
    disableStatus=result.ok?'disabled':result.timeout?'budget-exhausted':'failed';
   }catch{disableStatus='failed';}
   return {status,fileName,profileReceived:received,saved,stopAttempted:!!stopPromise,disableAttempted:!!disablePromise,disableStatus,failureBudgetMs};
  })().catch(()=>({status:'cleanup-unavailable',fileName,saved,profileReceived:received,failureBudgetMs}));
  return cleanupPromise;
 };
 return {stopAndSave,cleanupFailure};
}
