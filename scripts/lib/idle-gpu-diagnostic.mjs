// QA-only bounded observability. No GPU performance or CDP-dispatch proof.
const PREFIX='INKWAVE_IDLE_GPU_CONTEXT ';
const STAGES=new Set(['enter','probe-read','context-read','loss-read','cleanup-enter','cleanup-exit','exit']);
const HOST=new Set(['evaluate-requested','evaluate-resolved','evaluate-rejected','page-close','page-crash','main-frame-navigation']);
export function createIdleGpuTrace(token,{now=()=>Date.now(),emit=()=>{}}={}){
 if(typeof token!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(token))throw TypeError('Invalid GPU diagnostic token');
 const started=now(),events=[];let sealed=false,dropped=0;
 const record=(origin,stage)=>{if(sealed)return;if(events.length>=16){dropped++;return;}const event={origin,stage,elapsedMs:Math.max(0,now()-started)};events.push(event);try{emit('INKWAVE_IDLE_GPU_TRACE '+JSON.stringify(event));}catch{/* Diagnostics cannot change probe outcome. */}};
 return {token,host(stage){if(HOST.has(stage))record('host',stage);},accept(text){const prefix=PREFIX+token+' ';if(typeof text!=='string'||!text.startsWith(prefix)||text.length>prefix.length+32)return false;const stage=text.slice(prefix.length);if(!STAGES.has(stage))return false;record('browser-console',stage);return true;},seal(){sealed=true;},snapshot(){return {diagnosticOnly:true,dispatchScope:'host requested is not proof of CDP dispatch; absent browser console markers are inconclusive',events:events.map(e=>({...e})),dropped,sealed};}};
}
export async function runIdleGpuContextDiagnostic(page,trace,verifyIdleGpuContext){
 const listeners=[['console',m=>trace.accept(m.text())],['close',()=>trace.host('page-close')],['crash',()=>trace.host('page-crash')],['framenavigated',frame=>{if(frame===page.mainFrame())trace.host('main-frame-navigation');}]],attached=[];
 let failure,failed=false;
 try{
  for(const [type,listener]of listeners){page.on(type,listener);attached.push([type,listener]);}
  trace.host('evaluate-requested');
  const value=await page.evaluate(verifyIdleGpuContext,{token:trace.token});
  trace.host('evaluate-resolved');return value;
 }catch(error){failed=true;failure=error;trace.host('evaluate-rejected');throw error;}
 finally{
  const errors=[];for(const [type,listener]of attached)try{page.off(type,listener);}catch(error){errors.push(error);}
  trace.seal();
  if(errors.length)throw new AggregateError(failed?[failure,...errors]:errors,'GPU diagnostic listener cleanup failed',failed?{cause:failure}:undefined);
 }
}
// Failure path only: a stalled owner.close must not suppress original error,
// final stderr, server cleanup or the workflow's subsequent artifact step.
// It does NOT kill the browser or guarantee upload after runner termination.
export async function closeIdleFailureResources(owner,server,primary,{timers=globalThis,cleanupMs=5000}={}){
 const errors=[];
 const bounded=async(task,label)=>{let timer;try{await Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Object.assign(Error('Idle cleanup exceeded '+cleanupMs+' ms ('+label+')'),{code:'INKWAVE_IDLE_CLEANUP_TIMEOUT',phase:label,timeoutMs:cleanupMs})),cleanupMs);})]);}finally{timers.clearTimeout(timer);}};
 try{await bounded(()=>owner?.close(),'browser-close');}catch(error){errors.push(error);}
 try{if(server)await bounded(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'server-close');}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError([primary,...errors],'Idle probe and cleanup failed',{cause:primary});
}
