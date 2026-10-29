// Receiver-owned correlation of native special-use receipts with catalogue FX.
// A native source event is still owner-authored; this is presentation admission,
// not server verification of the remote player's gauge or damage authority.
const states=new WeakMap();
// Legacy rows have no wire sequence. Keep their admitted native FIFO frame and
// playback order private; fields attached by a sender cannot create a receipt.
const legacyFrames=new WeakMap(),nativePlayback=new WeakMap();
const clock=()=>performance.now()/1000;
const life=a=>Math.max(a?.net?.lastLife||0,a?.netLife||0);
const TTL=40, WAIT=1, MAX_PENDING=48, MAX_ACTIVATIONS=16;
const actions={
 tentaMissiles:'activate target launch impact end',inkjet:'activate shot impact return end',
 booyahBomb:'activate throw deploy active pulse impact destroy expire end',
 ultraStamp:'activate swing jumpSwing swingEnd throw block impact end',
 killerWail:'activate target laser end',zipcaster:'activate zip hookImpact return end',
 crabTank:'activate shot cannon impact end',reefslider:'activate impact end',
 tripleInkstrike:'activate marker deploy active pulse impact destroy expire end',
 superChump:'activate balloon deploy active impact destroy expire end',
 krakenRoyale:'activate jump end',splattercolorScreen:'activate deploy screen land move cross expire end',
 waveBreaker:'activate deploy device land pulse destroy expire end',
 tripleSplashdown:'activate fistGone impact',
};
for(const id of Object.keys(actions))actions[id]=new Set(actions[id].split(' '));
for(const id of ['booyahBomb','tripleInkstrike','superChump','splattercolorScreen','waveBreaker'])actions[id].add('hit');
function state(nm){let s=states.get(nm);if(!s||s.match!==nm.match||s.session!==nm.s){s={match:nm.match,session:nm.s,actors:new WeakMap(),pending:[],order:0};states.set(nm,s);}return s;}
function actorState(nm,actor){const s=state(nm),peer=nm.peers?.get(actor.owner);let a=s.actors.get(actor);if(!a||a.owner!==actor.owner||a.net!==actor.net||a.peer!==peer){a={owner:actor.owner,net:actor.net,peer,tickets:[],activations:new Map(),legacyUseTime:-Infinity};s.actors.set(actor,a);}return a;}
function prune(a,t){a.tickets=a.tickets.filter(r=>t-r.at<TTL);}
export function captureLegacySpecialFrames(nm,from,packet,previousTimestamp){
 const peer=nm.peers?.get(from);
 if(packet?.r===2||!Number.isFinite(packet?.ts)||packet.ts<=previousTimestamp||peer?.lastTs!==packet.ts||!Array.isArray(packet.e))return;
 for(const event of packet.e){
  if(!Array.isArray(event)||!peer.events.includes(event))continue;
  const nid=event[1]==='ev'&&event[2]==='special:use'?event[3]?.actor?.n
   :event[1]==='ac'&&event[2]==='special'?event[3]:null;
  const actor=nm.byNid?.get(nid),sample=actor?.net?.buf?.findLast(s=>s.t===packet.ts);
  if(!actor?.remote||actor.owner!==from||!sample||sample.life!==life(actor))continue;
  legacyFrames.set(event,{receiver:nm,session:nm.s,match:nm.match,from,peer,actor,net:actor.net,life:sample.life,order:null});
 }
}
function legacyFrame(nm,actor,event){
 const frame=legacyFrames.get(event);
 return frame?.receiver===nm&&frame.session===nm.s&&frame.match===nm.match&&frame.actor===actor
  &&frame.net===actor.net&&frame.from===actor.owner&&frame.peer===nm.peers?.get(frame.from)&&actor.remote&&frame.life===life(actor)?frame:null;
}
export function withNativeSpecialPlayback(nm,from,event,run){
 const previous=nativePlayback.get(nm),frame={from,event,accepted:false};nativePlayback.set(nm,frame);
 try{return run();}finally{if(previous)nativePlayback.set(nm,previous);else nativePlayback.delete(nm);}
}
export function noteNativeSpecialPlayback(nm,name,payload,from){
 const frame=nativePlayback.get(nm);
 if(frame&&frame.from===from&&frame.event[1]==='ev'&&frame.event[2]===name&&frame.event[3]===payload)frame.accepted=true;
}
export function observeNativeSpecialUse(nm,from,event,previousSequence){
 if(event?.[1]!=='ev'||event[2]!=='special:use')return false;
 const actor=nm.byNid?.get(event[3]?.actor?.n),id=event[3]?.id;
 if(!actor?.remote||actor.owner!==from||!actions[id])return false;
 const legacy=legacyFrame(nm,actor,event);
 if(legacy){
  const played=nativePlayback.get(nm);
  if(!played?.accepted||played.event!==event||played.from!==from||!Number.isFinite(event[0]))return false;
 }else if(!Number.isSafeInteger(event._netSeq)||event._netSeq<=previousSequence
   ||nm.peers?.get(from)?._lastEventSeq!==event._netSeq)return false;
 const a=actorState(nm,actor),t=clock();prune(a,t);
 if(legacy&&event[0]<=a.legacyUseTime)return false;
 if(legacy){a.legacyUseTime=event[0];legacy.order=++state(nm).order;}
 a.tickets.push({id,life:life(actor),at:t,ts:event[0],seq:event._netSeq,tick:event._netTick,
  legacy:!!legacy,order:legacy?.order,authorized:actor.weapon?.special===id,used:false});
 if(a.tickets.length>8)a.tickets.shift();return true;
}
function admission(nm,actor,event,payload,api,t){
 if(nm._disposed)return false;
 if(payload.action==='objectHit'||payload.action==='cheer')return true;
 if(!Number.isSafeInteger(payload.seed)||payload.seed<0||payload.seed>0xffffffff||!Array.isArray(payload.pos)
   ||payload.pos.length!==3||!payload.pos.every(Number.isFinite))return false;
 if(!actions[payload.id]?.has(payload.action)||!Number.isSafeInteger(payload.activation)||payload.activation<1)return false;
 const legacy=legacyFrame(nm,actor,event),sequence=event._netSeq??event[7];
 if(!legacy&&!Number.isSafeInteger(sequence))return false;
 if(legacy&&legacy.order===null)legacy.order=++state(nm).order;
 const a=actorState(nm,actor);prune(a,t);
 const key=payload.id+':'+payload.activation;let activation=a.activations.get(key);
 const persistent=Number.isSafeInteger(payload.object)&&payload.object>0&&(api.G.projectiles?._s3AllSpecialObjects||[]).some(o=>!o.dead&&o.owner===actor&&o.id===payload.id&&o.activation===payload.activation&&o.serial===payload.object);
 if(activation&&(activation.life===life(actor)||persistent)){
  if(payload.action==='activate'&&activation.activated)return false;
  if(payload.action==='activate')activation.activated=true;
  return true;
 }
 const receipt=a.tickets.find(r=>!r.used&&r.id===payload.id&&r.life===life(actor)
   &&(legacy?r.legacy&&r.order<legacy.order:!r.legacy&&r.seq<sequence)
   &&Number.isFinite(event[0])&&event[0]>=r.ts&&event[0]-r.ts<=TTL
   &&(r.authorized||actor.weapon?.special===r.id));
 if(!receipt)return null;
 receipt.used=true;receipt.authorized=true;
 activation={life:life(actor),at:receipt.at,activated:payload.action==='activate'};a.activations.set(key,activation);
 while(a.activations.size>MAX_ACTIVATIONS)a.activations.delete(a.activations.keys().next().value);
 return true;
}
export function admitCatalogueSpecial(nm,from,actor,event,payload,api,replay){
 const s=state(nm),t=clock();s.pending=s.pending.filter(p=>t-p.at<WAIT&&p.actor.owner===p.from&&p.actor.remote&&life(p.actor)===p.life);
 const result=admission(nm,actor,event,payload,api,t);
 if(result===true)return true;
 if(result===null&&s.pending.length<MAX_PENDING&&(Number.isSafeInteger(event._netSeq??event[7])||legacyFrame(nm,actor,event)))
  s.pending.push({from,actor,life:life(actor),event,payload,at:t,replay});
 return false;
}
export function flushCatalogueSpecials(nm,api){
 const s=state(nm),pending=s.pending;s.pending=[];const t=clock();
 for(const p of pending){
  if(t-p.at>=WAIT||p.actor.owner!==p.from||!p.actor.remote||life(p.actor)!==p.life)continue;
  const admitted=admission(nm,p.actor,p.event,p.payload,api,t);
  if(admitted===true)p.replay(p.payload);
  else if(admitted===null&&s.pending.length<MAX_PENDING)s.pending.push(p);
 }
}
