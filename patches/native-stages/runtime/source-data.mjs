import {nativeStageBuild} from './build-config.mjs';
// Only inventories returned by our pinned conversion worker enter this map.
// Workers are short-lived; keeping their verified scalar metadata here avoids
// rebuilding the same Git tree proof when a stage is revisited in this page.
const verifiedInventories=new Map();
export function loadBrowserSource(id,signal,{constrained=false}={}){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./source-worker.mjs',import.meta.url),{type:'module'});
  let ended=false;
  function finish(error,data){if(ended)return;ended=true;worker.terminate();signal?.removeEventListener('abort',abort);globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:error?'failed':'ready'}}));error?reject(error):resolve(data);}
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>finish(new Error('Source conversion failed: '+e.message));
  worker.onmessage=({data})=>{
   if(ended)return;
   if(data.error)finish(new Error(data.error));else if(data.result)finish(null,data.result);
   else if(data.sourceInventory){const key=nativeStageBuild.runtimeSha256+'/'+id;verifiedInventories.delete(key);verifiedInventories.set(key,data.sourceInventory);while(verifiedInventories.size>24)verifiedInventories.delete(verifiedInventories.keys().next().value);}
   else globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:data.progress,bytes:data.bytes,total:data.total}}));
  };
  worker.postMessage({id,runtimeSha256:nativeStageBuild.runtimeSha256,constrainedClient:constrained===true,verifiedInventory:verifiedInventories.get(nativeStageBuild.runtimeSha256+'/'+id)});
 });
}
