// Test-only composition: no change to either supplied native helper/predicate.
// Admission, intro and playing validation share one browser task when ready.
// Incomplete admission returns without advancing frames; the host polls within
// the same original deadline rather than queuing a separate intro task.
export function atomicIntroFunction(completeIntro,playingPredicate,admissionPredicate=null){
  return new Function(`return function(){
    const timing={schema:1,clock:'browser-Date.now-unix-epoch-ms'};
    const mark=(phase)=>{try{timing[phase+'AtMs']=Date.now();timing.phase=phase;}catch{}};
    // Persist diagnostic evidence even when the host rejects a late receipt.
    try{window.__iwProjectileAtomicIntroReceipt=timing;}catch{}
    mark('entered');
    try{
      ${admissionPredicate ? `const admissionReady=(${admissionPredicate.toString()})();
      mark('admissionReturned');
      if(admissionReady!==true){
        try{timing.outcome='admission-pending';}catch{}
        return {admissionReady:false,timing};
      }` : ''}
      const intro=(${completeIntro.toString()})();
      mark('introReturned');
      const playingReady=(${playingPredicate.toString()})();
      mark('predicateReturned');
      try{timing.outcome=playingReady===true?'ready':'predicate-failed';
        timing.intro={method:intro?.method,frames:intro?.frames,before:intro?.before,after:intro?.after};}catch{}
      const g=window.__inkwave,G=window.__G,m=g?.match;
      return {intro,playingReady,timing,readiness:{mode:G?.mode,state:m?.state,matchIdentity:m===G?.match,
        attract:!!m?.attract,local:!!m?.local?.isLocal,controller:!!m?.controller,
        projectiles:!!G?.projectiles,renderer:!!G?.renderer}};
    }catch(error){
      mark('failed');
      try{timing.outcome='threw';timing.error=String(error?.message||error).slice(0,500);}catch{}
      throw error;
    }
  }`)();
}

export async function requireAtomicIntro(page,callback,deadline,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,receipt=null,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const requestedAtMs=now(),remaining=deadline-requestedAtMs;
  const note=fields=>{try{if(receipt)Object.assign(receipt,fields);}catch{}};
  note({clock:'host-Date.now-unix-epoch-ms',requestedAtMs,deadlineAtMs:deadline,outcome:'pending'});
  if(remaining<=0){note({outcome:'expired-before-evaluation'});throw new Error('Native intro/readiness deadline expired before evaluation');}
  let timer,attempt=0;
  try{
    while(true){
      const evaluationRequestedAtMs=now(),attemptRemaining=deadline-evaluationRequestedAtMs;
      if(attemptRemaining<=0)throw new Error('Native intro/readiness deadline expired before evaluation');
      note({evaluationRequestedAtMs,evaluationAttempt:++attempt,outcome:'pending'});
      const evaluation=page.evaluate(callback).then(result=>{
        note({evaluationReturnedAtMs:now(),browserTiming:result?.timing??null});
        return result;
      },error=>{
        note({evaluationRejectedAtMs:now()});throw error;
      });
      const result=await Promise.race([
        evaluation,
        new Promise((_,reject)=>{timer=setTimer(()=>{note({deadlineObservedAtMs:now()});reject(new Error('Native intro/readiness evaluation budget exceeded'));},attemptRemaining);}),
      ]);
      if(now()>deadline)throw new Error('Native intro/readiness receipt arrived after deadline');
      clearTimer(timer);timer=undefined;
      if(result?.admissionReady===false){
        note({outcome:'admission-pending'});
        const pollRemaining=deadline-now();
        if(pollRemaining<=0)throw new Error('Native intro/readiness deadline expired before evaluation');
        await sleep(Math.min(250,pollRemaining));
        continue;
      }
      if(result?.playingReady!==true)throw new Error('Native intro did not satisfy the full playing predicate');
      note({outcome:'accepted'});
      return result;
    }
  }catch(error){note({outcome:'failed'});throw error;}
  finally{clearTimer(timer);}
}
