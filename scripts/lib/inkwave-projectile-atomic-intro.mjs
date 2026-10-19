// Test-only composition: no change to either supplied native helper/predicate.
// A second browser task can be starved by SwiftShader after intro unfreezes.
export function atomicIntroFunction(completeIntro,playingPredicate){
  return new Function(`return function(){
    const intro=(${completeIntro.toString()})();
    const playingReady=(${playingPredicate.toString()})();
    const g=window.__inkwave,G=window.__G,m=g?.match;
    return {intro,playingReady,readiness:{mode:G?.mode,state:m?.state,matchIdentity:m===G?.match,
      attract:!!m?.attract,local:!!m?.local?.isLocal,controller:!!m?.controller,
      projectiles:!!G?.projectiles,renderer:!!G?.renderer}};
  }`)();
}

export async function requireAtomicIntro(page,callback,deadline,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const remaining=deadline-now();
  if(remaining<=0)throw new Error('Native intro/readiness deadline expired before evaluation');
  let timer;
  try{
    const result=await Promise.race([
      page.evaluate(callback),
      new Promise((_,reject)=>{timer=setTimer(()=>reject(new Error('Native intro/readiness evaluation budget exceeded')),remaining);}),
    ]);
    if(now()>deadline)throw new Error('Native intro/readiness receipt arrived after deadline');
    if(result?.playingReady!==true)throw new Error('Native intro did not satisfy the full playing predicate');
    return result;
  }finally{clearTimer(timer);}
}
