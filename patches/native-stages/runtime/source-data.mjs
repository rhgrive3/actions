import {nativeStageBuild} from './build-config.mjs';
import {SOURCE_RECIPE,SOURCE_STAGES} from './source-catalog.mjs';
// Private, bounded metadata from successful instances of our pinned worker.
// No caller-supplied option or returned geometry exposes these cache entries.
const verifiedInventories=new Map();
export async function loadBrowserSource(id,signal,options={}){
 // Prebuilt records are the same conversion; a failed fetch falls back to it.
 if(nativeStageBuild?.prebuilt?.stages?.[id]){
  try{const {loadPrebuiltSource}=await import('./prebuilt-load.mjs');return await loadPrebuiltSource(id,signal);}
  catch(error){if(error?.name==='AbortError'||signal?.aborted)throw error;console.warn('[native] prebuilt stage unavailable, converting source: '+error.message);}
 }
 return convertBrowserSource(id,signal,options);
}
function convertBrowserSource(id,signal,{constrained=false}={}){
 return new Promise((resolve,reject)=>{
  const stage=SOURCE_STAGES.find(s=>s.id===id),runtimeSha256=nativeStageBuild.runtimeSha256;
  const key=stage?JSON.stringify([SOURCE_RECIPE,runtimeSha256,id,stage.tree]):null;
  let pendingInventory=null;
  const worker=new Worker(new URL('./source-worker.mjs',import.meta.url),{type:'module'});
  let ended=false;
  function finish(error,data){if(ended)return;ended=true;worker.terminate();signal?.removeEventListener('abort',abort);globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:error?'failed':'ready'}}));error?reject(error):resolve(data);}
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>finish(new Error('Source conversion failed: '+e.message));
  worker.onmessage=({data})=>{
   if(ended)return;
   if(data.error)finish(new Error(data.error));else if(data.result){
    if(key&&pendingInventory){verifiedInventories.delete(key);verifiedInventories.set(key,pendingInventory);while(verifiedInventories.size>24)verifiedInventories.delete(verifiedInventories.keys().next().value);}
    finish(null,data.result);
   }
   else if(data.sourceInventory){
    const p=data.sourceInventory;
    if(key&&p.id===id&&p.runtimeSha256===runtimeSha256&&p.recipe===SOURCE_RECIPE&&p.tree===stage.tree&&p.inventory?.sha===stage.tree&&p.inventory.truncated===false&&Array.isArray(p.inventory.tree))pendingInventory=p;
   }
   else globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:data.progress,bytes:data.bytes,total:data.total}}));
  };
  worker.postMessage({id,runtimeSha256,constrainedClient:constrained===true,verifiedInventory:key?verifiedInventories.get(key):undefined});
 });
}
