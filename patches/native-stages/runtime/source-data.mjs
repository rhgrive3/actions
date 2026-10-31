import {nativeStageBuild} from './build-config.mjs';
import {SOURCE_RECIPE,SOURCE_STAGES} from './source-catalog.mjs';
// Private, bounded metadata from successful instances of our pinned worker.
// No caller-supplied option or returned geometry exposes these cache entries.
const verifiedInventories=new Map();
export async function loadBrowserSource(id,signal,options={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 // Prebuilt records are the same conversion; a failed fetch falls back to it.
 if(nativeStageBuild?.prebuilt?.stages?.[id]){
  try{const {loadPrebuiltSource}=await import('./prebuilt-load.mjs');if(signal?.aborted)throw new DOMException('Aborted','AbortError');return await loadPrebuiltSource(id,signal);}
  catch(error){if(error?.name==='AbortError'||signal?.aborted)throw error;console.warn('[native] prebuilt stage unavailable, converting source: '+error.message);}
 }
 return convertBrowserSource(id,signal,options);
}
function convertBrowserSource(id,signal,{constrained=false}={}){
 // On touch/low-memory clients the authenticated inventory remains in the
 // worker only. Retaining 24 parsed trees on the main thread competes with GPU
 // resources, while packaged inventories are already a durable reread path.
 const nav=globalThis.navigator,gb=Number(nav?.deviceMemory)||0;
 const small=constrained===true||(gb>0&&gb<=4)||/Android|iPhone|iPad|iPod/i.test(nav?.userAgent||'')||
  (/Macintosh/i.test(nav?.userAgent||'')&&Number(nav?.maxTouchPoints)>1);
 if(small)verifiedInventories.clear();
 return new Promise((resolve,reject)=>{
  const stage=SOURCE_STAGES.find(s=>s.id===id),runtimeSha256=nativeStageBuild.runtimeSha256;
  const key=stage?JSON.stringify([SOURCE_RECIPE,runtimeSha256,id,stage.tree]):null;
  let pendingInventory=null;
  const worker=new Worker(new URL('./source-worker.mjs',import.meta.url),{type:'module'});
  let ended=false,retired=false,retireTimer=null;
  function retire(){if(retired)return;retired=true;if(retireTimer!==null)clearTimeout(retireTimer);retireTimer=null;worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();signal?.removeEventListener('abort',abort);}
  function finish(error,data,cachePending=false){
   if(ended)return;ended=true;pendingInventory=null;
   if(!error&&cachePending){
    // The caller can publish the stage immediately. This worker owns only the
    // already-cloned optional IDB transaction until commit or bounded cleanup.
    worker.onmessage=({data:message})=>{if(message?.cacheComplete)retire();};
    worker.onerror=worker.onmessageerror=retire;
    retireTimer=setTimeout(retire,30000);
   }else retire();
   globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:error?'failed':'ready'}}));error?reject(error):resolve(data);
  }
  const abort=()=>{if(ended)retire();else finish(new DOMException('Aborted','AbortError'));};
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>finish(new Error('Source conversion failed: '+e.message));
  worker.onmessageerror=()=>finish(new Error('Source conversion response could not be decoded'));
  worker.onmessage=({data})=>{
   if(ended)return;
   if(data.error)finish(new Error(data.error));else if(data.result){
    if(!small&&key&&pendingInventory){verifiedInventories.delete(key);verifiedInventories.set(key,pendingInventory);while(verifiedInventories.size>24)verifiedInventories.delete(verifiedInventories.keys().next().value);}
    finish(null,data.result,data.cachePending===true);
   }
   else if(data.sourceInventory){
    const p=data.sourceInventory;
    if(!small&&key&&p.id===id&&p.runtimeSha256===runtimeSha256&&p.recipe===SOURCE_RECIPE&&p.tree===stage.tree&&p.inventory?.sha===stage.tree&&p.inventory.truncated===false&&Array.isArray(p.inventory.tree))pendingInventory=p;
   }
   else globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:data.progress,bytes:data.bytes,total:data.total}}));
  };
  try{worker.postMessage({id,runtimeSha256,constrainedClient:small,verifiedInventory:!small&&key?verifiedInventories.get(key):undefined});}
  catch(error){finish(error);}
 });
}
