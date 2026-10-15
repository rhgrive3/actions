import {nativeStageBuild} from './build-config.mjs';
export function loadBrowserSource(id,signal){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./source-worker.mjs',import.meta.url),{type:'module'});
  let ended=false;
  function finish(error,data){if(ended)return;ended=true;worker.terminate();signal?.removeEventListener('abort',abort);globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:error?'failed':'ready'}}));error?reject(error):resolve(data);}
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>finish(new Error('Source conversion failed: '+e.message));
  worker.onmessage=({data})=>{
   if(data.error)finish(new Error(data.error));else if(data.result)finish(null,data.result);
   else globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress',{detail:{id,phase:data.progress,bytes:data.bytes,total:data.total}}));
  };
  worker.postMessage({id,runtimeSha256:nativeStageBuild.runtimeSha256});
 });
}
