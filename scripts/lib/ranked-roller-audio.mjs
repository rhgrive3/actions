// QA-only: bound movement by native simulation time while the real relay runs.
// Wall-clock input timers can expire between two receiver frames on slow CI.
let nextProof=0;
export function readRankedRollAudio({nid,owner,life,sequence}) {
  const s=__rankedReplication.read(nid);
  return s?.ready&&s.remote&&s.alive&&s.owner===owner&&s.sampledOwner===owner&&s.life===life&&s.sampledLife===life
    &&s.acceptedSequence>=sequence&&s.proof?.sequence===s.acceptedSequence
    &&s.held&&s.grounded&&!s.suspended&&!(s.f&(1<<28))&&s.near&&s.rollLoop&&s.audioState==='running'
    &&s.realRollLoops.some(h=>h.playing&&h.registered&&h.volume>0)?s:false;
}
export async function proveRankedRollAudio(host,guest,nid,setInput,save=()=>{},movementKey='KeyS') {
  if(movementKey!=='KeyS'&&movementKey!=='KeyW')throw Error('Unsupported ranked native pulse key');
  const token='ranked-roll-'+ ++nextProof,pages=[host,guest],receipt={status:'running',frames:0,batches:[]};
  let originalError;
  try {
    const installs=await Promise.allSettled(pages.map((p,index)=>p.evaluate(({token,nid,owner})=>{
      if(globalThis.__rankedRollClock)throw Error('Ranked roller clock already installed');
      const G=RG,a=owner?G.match.local:G.netm.byNid.get(nid);
      if(!a||a.nid!==nid||a.remote===owner||!a.alive)throw Error('Ranked roller actor unavailable');
      globalThis.__rankedRollClock={token,owner,actor:a,match:G.match,net:G.netm,session:G.netm.s,
        life:a.netLife,actorOwner:a.owner,frozen:G.game.frozen};
      G.game.debug.freeze();
      return {owner:a.owner,life:a.netLife};
    },{token,nid,owner:index===0})));
    const failed=installs.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    const identity=installs[0].value;
    if(JSON.stringify(identity)!==JSON.stringify(installs[1].value))throw Error('Ranked roller owner/life mismatch');
    while(receipt.frames<15) {
      await setInput(host,true,[movementKey]);
      let sent;
      try { sent=await host.evaluate(({token,budget})=>{
        const p=__rankedRollClock,G=RG,a=p.actor;
        if(p.token!==token||!p.owner||G.match!==p.match||G.netm!==p.net||G.netm.s!==p.session
          ||G.match.local!==a||a.owner!==p.actorOwner||a.netLife!==p.life||!a.alive||!G.game.frozen)
          throw Error('Ranked roller owner clock changed');
        const previous=a._adoptionSequence;
        let frames=0;
        do { G.game._frame(1/60);frames++; } while(!(a._adoptionSequence>previous)&&frames<budget);
        if(!(a._adoptionSequence>previous))throw Error('Ranked roller produced no ordinary snapshot');
        return {frames,sequence:a._adoptionSequence,position:a.pos.toArray(),time:G.time};
      },{token,budget:Math.min(5,15-receipt.frames)}); }
      finally { await setInput(host,true); }
      receipt.frames+=sent.frames;
      const args={nid,...identity,sequence:sent.sequence,token};
      // Reception is asynchronous and keeps the native simulation frozen.
      const accepted=await guest.waitForFunction(({nid,owner,life,sequence,token})=>{
        const p=__rankedRollClock,a=RG.netm.byNid.get(nid);
        if(p.token!==token||p.owner||a!==p.actor||RG.match!==p.match||RG.netm!==p.net||RG.netm.s!==p.session
          ||a.owner!==owner||a.netLife!==life||!a.alive||!RG.game.frozen)throw Error('Ranked roller receiver clock changed');
        return a.net?._adoptionSeq>=sequence;
      },args,{timeout:30000,polling:20});
      await accepted.dispose();
      const remote=await guest.evaluate(({token,read,args})=>{
        if(__rankedRollClock.token!==token||!RG.game.frozen)throw Error('Ranked roller receiver clock changed');
        const observe=(0,eval)('('+read+')');
        for(let i=0;i<30;i++){RG.game._frame(1/60);const s=observe(args);if(s)return s;}
        return false;
      },{token,read:readRankedRollAudio.toString(),args});
      receipt.batches.push({sent,remote});save(receipt);
      if(remote){receipt.status='passed';save(receipt);return remote;}
    }
    throw Error('No live positive remote roller audio within 250ms of native movement');
  } catch(error) { originalError=error;receipt.status='failed';receipt.error=error?.stack||String(error);save(receipt);throw error; }
  finally {
    const cleanup=[];
    try { await setInput(host,true); } catch(reason) { cleanup.push({status:'rejected',reason}); }
    cleanup.push(...await Promise.allSettled(pages.map(p=>p.evaluate(token=>{
      const s=globalThis.__rankedRollClock;if(s?.token!==token)return;
      if(s.frozen)RG.game.debug.freeze();else RG.game.debug.unfreeze();delete globalThis.__rankedRollClock;
    },token))));
    const failed=cleanup.find(r=>r.status==='rejected');
    if(failed){receipt.status='failed';receipt.cleanupError=String(failed.reason);save(receipt);if(!originalError)throw failed.reason;}
  }
}
