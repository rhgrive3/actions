// Cooperatively consume the same ordered generators used by synchronous
// callers. No renderer/global-world state is held across a yield.
export function consumeNativeWork(steps){
 try{for(let next=steps.next();;next=steps.next())if(next.done)return next.value;}
 finally{steps.return();}
}
function nextTask(signal){
 return new Promise((resolve,reject)=>{
  let handle,ended=false;const frame=typeof requestAnimationFrame==='function';
  const finish=error=>{if(ended)return;ended=true;signal?.removeEventListener('abort',abort);if(error){if(frame)cancelAnimationFrame(handle);else clearTimeout(handle);reject(error);}else resolve();};
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  handle=frame?requestAnimationFrame(()=>finish()):setTimeout(()=>finish(),0);
 });
}
export async function consumeNativeWorkAsync(steps,{signal,current=()=>true,budgetMilliseconds=4,now=()=>performance.now(),yieldTask=()=>nextTask(signal)}={}){
 const budget=Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>0?budgetMilliseconds:4;
 const check=()=>{if(signal?.aborted||!current())throw new DOMException('Aborted','AbortError');};
 let started=now();
 try{
  while(true){
   check();const next=steps.next();if(next.done)return next.value;
   if(now()-started>=budget){await yieldTask();check();started=now();}
  }
 }finally{steps.return();}
}
