const STEP = 1 / 60, GAP = .25;
export const PLATFORM_DEBT_TICK_BUDGET = 15;
// INKWAVE recovery budget: eight yielded slices, not a Nintendo rule constant.
export const PLATFORM_ONLINE_DEBT_LIMIT = 2;
const MAX_MESSAGES = 128;

function currentMatch(game, G, r, saved) {
  return game.platform === r && !r.disposed && game.match === saved.match && G.net === saved.session &&
    (!saved.clock || game.s3Clock === saved.clock) && (!saved.session || saved.session.tr === saved.transport) &&
    G.netm === saved.net && (!saved.net || saved.session?.state === 'match' && saved.net.match === saved.match && saved.session?.match === saved.net &&
      saved.session.hostId === saved.host && saved.net.cfg?.id === saved.epoch);
}

// A stopped online owner cannot reconstruct an arbitrarily long history of
// remote hits and poses. Preserve its last completed state and use the same
// real leave/election/disconnect path as a failed connection, including solo
// rooms and Boss matches. Never turn missing history into a scored result.
export function releaseStalledMatch(game, G, r, reason = 'Connection could not keep up with the battle') {
  const match = game.match, session = G.net, net = G.netm;
  if (!match || !net || !session || session.state !== 'match' || session.match !== net || net.match !== match) return false;
  const saved = {match,session,net,host:session.hostId,epoch:net.cfg?.id,transport:session.tr};
  const owns = () => currentMatch(game,G,r,saved) && session.state === 'match';
  try {
    for(let n=0;n<3&&owns();n++)if(net._sendTick?.()!==true||!net.out?.length)break;
    if(owns()&&session.isHost) {
      if(match.ranked)net._sendNow?.({k:'rkstate',rk:{match:saved.epoch,host:saved.host,state:match.ranked.snapshot(),gains:match.rankedGains||[0,0]}});
      else net._sendNow?.({k:'st',s:match.state,t:match.time});
    }
  } catch {}
  if(!owns())return true;
  session.leave(true);
  if(game.platform===r&&!r.disposed&&G.net===session&&game.match===match&&session.state==='offline'&&!session.match)
    game.netMatchAborted?.(reason);
  return true;
}

// Receive receipts are scoped to the original transport callback. Preserve the
// value read from that trusted callback when yielding; never obtain it from peer
// JSON. The override exists only during the owned deferred native handler.
function receivedCall(net, original, from, data) {
  const transport=net.s?.tr, receiptMethod=transport?.relayReceipt;
  const at=typeof receiptMethod==='function'?receiptMethod.call(transport,from):null;
  return () => {
    if(at==null||typeof receiptMethod!=='function')return original.call(net,from,data);
    const descriptor=Object.getOwnPropertyDescriptor(transport,'relayReceipt');
    const receipt=sender=>receiptMethod.call(transport,sender)??(sender===from?at:null);
    transport.relayReceipt=receipt;
    try{return original.call(net,from,data);}
    finally{if(transport.relayReceipt===receipt){if(descriptor)Object.defineProperty(transport,'relayReceipt',descriptor);else delete transport.relayReceipt;}}
  };
}

export function createPlatformSimulationDebt(game, G, env, runtime) {
  let at=null, saved=null, timer=null, generation=0, draining=false, wrapped=null, pauseOwner=null, temporaryPause=false;
  const queue=[];
  let unstarted=0, messages=0, inputDt=null;
  const metrics={slices:0,maxTicks:0,received:0,disconnects:0};
  const ordinary={elapsed:0,budget:PLATFORM_DEBT_TICK_BUDGET},presentation={presentationOnly:true};
  const now=()=>env.performance?.now?.();
  const owns=()=>!!saved&&G.mode==='match'&&!!saved.match&&!saved.match.attract&&currentMatch(game,G,runtime,saved)&&runtime.owner.active;
  const cancelTimer=()=>{if(timer!==null){env.clearTimeout?.(timer);timer=null;}};
  function unwrap(){
    if(!wrapped)return;
    if(wrapped.net.onMessage===wrapped.callback){if(wrapped.descriptor)Object.defineProperty(wrapped.net,'onMessage',wrapped.descriptor);else delete wrapped.net.onMessage;}
    wrapped=null;
  }
  function unwatchPause(){
    if(!pauseOwner)return;
    const {match,get,set,descriptor}=pauseOwner;
    const current=Object.getOwnPropertyDescriptor(match,'paused');
    if(current?.get===get&&current.set===set)Object.defineProperty(match,'paused',{...descriptor,value:pauseOwner.value});
    pauseOwner=null;
  }
  function reset(discardClock=false){if(discardClock&&game.s3Clock===saved?.clock)game.s3Clock?.reset();generation++;cancelTimer();queue.length=0;unstarted=messages=0;inputDt=null;at=null;saved=null;unwrap();unwatchPause();}
  function watchPause(){
    const match=saved.match,descriptor=match&&Object.getOwnPropertyDescriptor(match,'paused');
    if(!match||pauseOwner?.match===match||!descriptor?.configurable||!('value'in descriptor)||!descriptor.writable)return;
    const owner={match,descriptor,value:descriptor.value,writes:0,get:null,set:null};
    owner.get=()=>owner.value;
    owner.set=value=>{
      if(value===owner.value)return;
      if(!temporaryPause)owner.writes++;
      if(!draining&&owns()){
        const time=now(),elapsed=Number.isFinite(time)?Math.max(0,(time-at)/1000):0;
        // A real pause edge has its own observed wall boundary. Finish only
        // foreground time before that edge; paused wall time is intentional.
        if(elapsed&&!owner.value)enqueue(elapsed);
        at=time;schedule();
      }
      owner.value=value;
    };
    Object.defineProperty(match,'paused',{configurable:true,enumerable:descriptor.enumerable,get:owner.get,set:owner.set});pauseOwner=owner;
  }
  function bind(time){
    if(saved&&!currentMatch(game,G,runtime,saved))reset(true);
    if(!saved)saved={match:game.match,session:G.net,net:G.netm,host:G.net?.hostId,epoch:G.netm?.cfg?.id,transport:G.net?.tr,clock:game.s3Clock};
    else saved.clock ||= game.s3Clock;
    if(at===null)at=time;
    watchPause();
    const net=saved.net;
    if(net&&wrapped?.net!==net&&typeof net.onMessage==='function'){
      const original=net.onMessage,descriptor=Object.getOwnPropertyDescriptor(net,'onMessage');
      const callback=function(from,data){
        if(!owns())return original.call(this,from,data);
        const time=now(),elapsed=Number.isFinite(time)?Math.max(0,(time-at)/1000):0;
        // A follower's completed host result supersedes local prediction. Let
        // the native receiver validate it first; only an accepted terminal or
        // no-contest state may retire old local debt. Malformed/stale packets
        // keep the existing debt and never gain an early-clock privilege.
        if(!saved.session.isHost&&from===saved.host&&
            (data?.k==='res'||data?.k==='end'||data?.k==='nc'||data?.k==='ncend'||
             data?.k==='st'&&['finish','judge','results'].includes(data.s)||data?.k==='rkstate'&&data.rk?.state?.winner!=null)){
          const scope=saved,result=original.call(this,from,data),match=scope.match;
          if(!currentMatch(game,G,runtime,scope)){reset();return result;}
          if(match.result||match.s3NoContest||match.ranked?.winner!=null||['finish','judge','results'].includes(match.state)){
            reset(true);bind(time);
          }
          return result;
        }
        if(!queue.length&&elapsed<=GAP)return original.call(this,from,data);
        if(messages>=MAX_MESSAGES||tooMuch(elapsed)){disconnect();return;}
        const resume=receivedCall(this,original,from,data);
        at=time;enqueue(elapsed,resume);metrics.received++;schedule();
      };
      net.onMessage=callback;wrapped={net,original,descriptor,callback};
    }
  }
  function tooMuch(elapsed){
    return saved?.net&&saved.session?.state==='match'&&
      unstarted+(game.s3Clock?.accumulator||0)+elapsed>PLATFORM_ONLINE_DEBT_LIMIT+1e-10;
  }
  function disconnect(){
    metrics.disconnects++;
    // Stop any queued old messages before native teardown can synchronously
    // emit a replacement match. Keep the ownership tuple for the leave guard.
    generation++;cancelTimer();queue.length=0;unstarted=messages=0;
    game.s3Clock?.reset();
    releaseStalledMatch(game,G,runtime);
    reset();
  }
  function enqueue(elapsed,resume=null){
    if(!elapsed&&!resume)return;
    queue.push({elapsed,paused:!!saved?.match?.paused,started:false,resume});unstarted+=elapsed;if(resume)messages++;
  }
  function schedule(){
    if(timer!==null||!queue.length||!owns()||typeof env.setTimeout!=='function')return;
    const epoch=generation;
    timer=env.setTimeout(()=>{if(epoch!==generation)return;timer=null;drain();},0);
  }
  function drain(){
    if(draining)return;
    if(!owns()){reset(true);return;}
    if(!game.s3Clock?.runSimulation)return;
    draining=true;let ticks=0,actions=0;
    try {
      while(queue.length&&ticks<PLATFORM_DEBT_TICK_BUDGET&&actions<32&&owns()){
        const job=queue[0],clock=game.s3Clock,start=clock.ticks;
        const elapsed=job.started?0:job.elapsed;
        if(!job.started){job.started=true;unstarted=Math.max(0,unstarted-job.elapsed);}
        const match=saved.match,paused=match?.paused,pauseWrites=pauseOwner?.writes;
        const pauseScoped=pauseOwner?.match===match&&!match.s3NoContestFinished&&match.state!=='results';
        if(pauseScoped){temporaryPause=true;match.paused=job.paused;temporaryPause=false;}
        try{clock.runSimulation(game,0,{elapsed,continuation:true,freezeInput:true,budget:PLATFORM_DEBT_TICK_BUDGET-ticks,canAdvance:owns});}
        finally{if(pauseScoped&&pauseOwner?.match===match&&pauseOwner.writes===pauseWrites){temporaryPause=true;match.paused=paused;temporaryPause=false;}}
        ticks+=clock.ticks-start;
        if(!owns())break;
        if(clock.accumulator+1e-10>=STEP)break;
        queue.shift();actions++;
        // Network playback observes the completed physical boundary. A newer
        // message is still queued and cannot rewrite the preceding interval.
        saved.session?.update?.(job.elapsed);
        if(!owns())break;
        if(job.resume){messages--;job.resume();if(owns())saved.session?.update?.(0);}
      }
    } finally {draining=false;metrics.slices++;metrics.maxTicks=Math.max(metrics.maxTicks,ticks);}
    if(!owns()){reset(true);return;}
    if(queue.length)schedule();else {
      cancelTimer();
      if(inputDt!==null){const dt=inputDt;inputDt=null;game.s3Clock.runSimulation(game,dt,{elapsed:0,budget:0,sampleOnly:true,skipNetwork:true});}
    }
  }
  return {
    beforeFrame(dt,elapsed,time){
      bind(time);
      if(!owns()){ordinary.elapsed=dt;return ordinary;}
      const delta=Number.isFinite(time)&&Number.isFinite(at)?Math.max(0,(time-at)/1000):elapsed;
      at=time;
      if(!queue.length&&delta<=GAP){ordinary.elapsed=delta;return ordinary;}
      if(tooMuch(delta)){disconnect();return presentation;}
      inputDt=dt;enqueue(delta);drain();schedule();return presentation;
    },
    afterFrame(){bind(Number.isFinite(at)?at:now());if(queue.length)schedule();},
    reset,
    releaseMatch(match){if(saved?.match===match)reset(true);},
    dispose(){reset(true);},
    snapshot(){return {seconds:unstarted+(game.s3Clock?.accumulator||0),messages,pending:queue.length,timer:timer!==null,...metrics};},
  };
}
