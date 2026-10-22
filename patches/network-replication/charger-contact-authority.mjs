// Native Splat Charger receiver authority. Wire rows are input requests, never
// evidence of damage: only the installed source flight's actual contact can
// mint a capability. State is receiver-private and bound to actor/life/world.
import { chargerChargeSeconds, chargerKeepRecord, chargerKeepHidden, chargerKeepResurface, chargerKeepReady, chargerSubCancels, CHARGER_CANCEL_SUB_SECONDS, mainSubOwns, chargerProgressiveInk as progressiveInk, chargerFundedProgress as fundedProgress, chargerLowInkRecovery, CHARGER_INTERRUPT_RECOVERY_SECONDS, CHARGER_KEEP_CANCEL_RECOVERY_SECONDS } from '../splatoon3/runtime/charger-charge-clock.mjs';
import { ACTOR_LANDING_CONTACT_DOWN, actorLandingContact } from '../splatoon3/runtime/player-ground-contact.mjs';
const states=new WeakMap(), scopes=new WeakMap(), flights=new WeakMap(), worlds=new WeakMap();
const finite=Number.isFinite, safe=Number.isSafeInteger;
const CAPTURE=1/20+.002, MAX_AGE=1.4, CONTACT_AGE=.95, MAX_CYCLES=12, MAX_CONTACTS=48;
const life=a=>Math.max(a?.netLife??0,a?.net?.lastLife??0);
const vector=a=>Array.isArray(a)&&a.length===3&&a.every(finite);
const length=a=>Math.hypot(...a);
const near=(a,b,r)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<=r;
export function receiverChargerRequired(actor){
 const w=actor?.weapon;
 return !!actor?.remote&&w?.id==='charger'&&w.kind==='charger'&&!w.catalogRecord;
}
function worldLive(s){return !!s&&!s.nm._disposed&&s.G.projectiles===s.world&&s.G.physics===s.physics&&s.G.level===s.level&&s.nm.match===s.match&&s.G.match===s.match&&s.nm.cfg?.id===s.epoch&&worlds.get(s.world)?.generation===s.generation;}
function actorLive(s,r){return worldLive(s)&&s.nm.byNid?.get(r.actor.nid)===r.actor&&r.actor.net===r.net&&r.actor.owner===r.from&&r.actor.alive!==false&&r.actor.remote&&life(r.actor)===r.life&&r.actor.weapon===r.weapon&&s.nm.peers?.get(r.from)===r.peer&&s.nm.s?._members?.has(r.from);}
function ensure(nm,G,player){
 if(!nm||!G?.projectiles||!G?.physics||!nm.match||typeof G.physics.raycast!=='function')return null;
 let epoch=worlds.get(G.projectiles);
 if(!epoch){epoch={generation:0,states:new Set()};worlds.set(G.projectiles,epoch);const original=G.projectiles.clear;
  G.projectiles.clear=function(...args){epoch.generation++;for(const old of epoch.states){old.actors.clear();old.contacts.length=0;states.delete(old.nm);}epoch.states.clear();return original.apply(this,args);};}
 let s=states.get(nm);
 if(!s&&!player)return null;
 if(!worldLive(s)){if(s)worlds.get(s.world)?.states.delete(s);s={nm,G,world:G.projectiles,physics:G.physics,level:G.level,match:nm.match,epoch:nm.cfg?.id,player:player||s?.player,actors:new Map(),contacts:[],notify:null,generation:epoch.generation};states.set(nm,s);epoch.states.add(s);}
 return s;
}
function chargeAt(c,ts,at,w){
 const seconds=Math.max(0,Math.min(ts-c.startTs,at-c.startAt)+c.grace);
 return Math.min(1,seconds/Math.max(1e-8,w.chargeTime||1));
}
function support(s,r,snap){
 const V=s.nm._combatProvenanceTHREE?.Vector3;
 if(typeof V!=='function'||typeof s.physics.groundProbe!=='function')return false;
 r.ground ||= {normal:new V()};
 try{s.physics.groundProbe(snap.x,snap.physicalY,snap.z,s.player.ledgeAssist,ACTOR_LANDING_CONTACT_DOWN,s.player.footRadius,r.ground,!!(snap.f&2));}catch{return false;}
 return snap.vy<=.5&&actorLandingContact(r.ground,snap.physicalY,snap.vy);
}
function ownSupport(s,r,snap){return support(s,r,snap)&&r.ground.face>=0&&s.G.paint?.sample?.(r.ground.face,r.ground.u,r.ground.v)===r.actor.team+1;}
function refill(s,r,snap,elapsed,at,blocked={}){
 const low=chargerLowInkRecovery({weapon:r.weapon,ink:r.ink},{charging:!!r.active,charge:r.active?.progress},r.cancelRecover||0,r.keepRecover||0);
 if(!(elapsed>0)||r.kept||!low&&r.active)return;
 const lock=low?Math.max(blocked.cancel||0,blocked.keep||0):Math.max(blocked.recover||0,blocked.cancel||0,blocked.sub||0,blocked.keep||0);
 elapsed=Math.max(0,elapsed-lock);if(!(elapsed>0))return;
 // Humanoid refill is legal without a floor. Squid refill needs the receiver's
 // actual painted support, not the owner's grounded/groundTeam/ink scalars.
 let rate=s.player.inkRefillKid*(r.actor.s3?.modifiers?.inkRecoveryKid??1);
 if(snap.f&2){
  const V=s.nm._combatProvenanceTHREE?.Vector3;
  if(typeof V!=='function'||typeof s.G.paint?.sample!=='function')return;
  const from=new V(snap.x,snap.physicalY+.2,snap.z),down=new V(0,-1,0);
  let h;try{h=s.physics.raycast(from,down,.6);}catch{return;}
  if(!h?.hit||h.face<0||s.G.paint.sample(h.face,h.u,h.v)!==r.actor.team+1)return;
  rate=s.player.inkRefillSwim*(r.actor.s3?.modifiers?.inkRecoverySwim??1);
 }
 if(finite(rate)&&rate>=0)r.ink=Math.min(s.player.inkMax,r.ink+rate*elapsed/(r.weapon.inkTankScale||1));
}
export function observeReceiverChargers(nm,from,packet,G,at,notify,player){
 const s=ensure(nm,G,player);if(!s||!finite(at)||!Array.isArray(packet?.a))return;
 s.notify=notify;
 for(const [id,r] of s.actors)if(!actorLive(s,r)||!receiverChargerRequired(r.actor))s.actors.delete(id);
 s.contacts=s.contacts.filter(c=>at>=c.at&&at-c.at<=CONTACT_AGE&&actorLive(s,c.r));
 const peer=nm.peers?.get(from),points=peer?.physicsPoints;
 if(packet.u!==undefined&&(!points||points.at(-2)!==packet.ts||points.at(-1)!==packet.u))return;
 for(const row of packet.a){
  const a=nm.byNid?.get(row?.[0]),snap=a?.net?.buf?.at(-1);
  if(!receiverChargerRequired(a)||a.owner!==from||snap?.t!==packet.ts||!finite(snap.physicalY)||!safe(snap.rawInput)||!(snap.f&1))continue;
  let r=s.actors.get(a.nid);
  if(!r||!actorLive(s,r)){
   r={actor:a,net:a.net,weapon:a.weapon,from,peer,life:life(a),ink:s.player.inkMax,lastSpend:-Infinity,cycles:[],active:null,kept:null,lastTs:snap.t,lastAt:at,lastTick:packet.u,lastFlags:0,pose:snap};s.actors.set(a.nid,r);
  }
  const simElapsed=safe(packet.u)&&safe(r.lastTick)?(packet.u-r.lastTick)/60:Infinity;
  const elapsed=Math.max(0,Math.min(snap.t-r.lastTs,at-r.lastAt,simElapsed));
  const blocked={recover:r.recoverStop||0,cancel:r.cancelRecover||0,sub:r.subBusy||0,keep:r.keepRecover||0};
  r.recoverStop=Math.max(0,blocked.recover-elapsed);r.cancelRecover=Math.max(0,blocked.cancel-elapsed);r.subBusy=Math.max(0,blocked.sub-elapsed);r.keepRecover=Math.max(0,blocked.keep-elapsed);
  refill(s,r,snap,elapsed,at,blocked);
  const charging=!!(snap.f&128),squid=!!(snap.f&2);
  const subOwns=mainSubOwns({}, {sub:!!(snap.rawInput&4)});
  if(chargerSubCancels(r.actor,{charging:!!r.active,s3Stored:r.kept?.keep},{sub:!!(snap.rawInput&4)},elapsed)){
   const c=r.active;c.cancelTs=snap.t;c.endTs=snap.t;c.endAt=at;r.active=null;r.nextChargeAt=at+CHARGER_CANCEL_SUB_SECONDS;r.subBusy=CHARGER_CANCEL_SUB_SECONDS;
  }
  // Stored charge bypasses the fresh-charge5F interruption gate, but native
  // mainSubOwns still calls cancelMainForSub and clears s3Stored. Preserve only
  // a historically ready release from before this cancellation for late FIFO.
  if(r.kept&&subOwns&&!squid){
   const c=r.kept;c.cancelTs=snap.t;c.endTs=snap.t;c.endAt=at;
   c.keepReadyTs=r.lastFlags&2?Infinity:r.lastTs+Math.max(0,c.keep.fireDelay);
   c.keepReadyAt=r.lastFlags&2?Infinity:r.lastAt+Math.max(0,c.keep.fireDelay);
   r.kept=null;
  }
  if(r.kept){
   const c=r.kept,held=safe(snap.rawInput)&&!!(snap.rawInput&1);
   const hiddenLive=!(r.lastFlags&2)||chargerKeepHidden(c.keep,elapsed);
   if(!hiddenLive){c.spent=true;r.kept=null;}
   else if(squid){if(!held||(!(r.lastFlags&2)&&!chargerKeepHidden(c.keep,elapsed))){if(!held)r.keepRecover=CHARGER_KEEP_CANCEL_RECOVERY_SECONDS;c.spent=true;r.kept=null;}}
   else {
    if(r.lastFlags&2)chargerKeepResurface(c.keep,r.weapon);
    if(!held&&((r.lastFlags&2)||c.keep.fireDelay>elapsed+1e-10)){r.keepRecover=CHARGER_KEEP_CANCEL_RECOVERY_SECONDS;c.spent=true;r.kept=null;}
    else chargerKeepReady(c.keep,elapsed);
   }
  }
  if(charging&&(snap.rawInput&1)&&!subOwns&&!r.active&&!r.kept&&!squid&&at+CAPTURE>=r.nextChargeAt){
   const c={startTs:snap.t,startAt:at,grace:Math.min(CAPTURE,Math.max(0,elapsed||CAPTURE)),endTs:null,endAt:null,paid:0,progress:0,spent:false};r.active=c;r.cycles.push(c);
  }
  if(charging&&(snap.rawInput&1)&&!subOwns&&!r.active&&!r.kept&&!squid&&!finite(r.nextChargeAt)){
   const c={startTs:snap.t,startAt:at,grace:CAPTURE,endTs:null,endAt:null,paid:0,progress:0,spent:false};r.active=c;r.cycles.push(c);
  }
  if(r.active){
   const c=r.active,w=r.weapon;
   const first=c.clockTs===undefined,seconds=first?c.grace:Math.max(0,Math.min(snap.t-c.clockTs,at-c.clockAt,simElapsed));
   c.clockTs=snap.t;c.clockAt=at;
   let q=Math.min(1,c.progress+chargerChargeSeconds(w,c.progress,seconds,c.paid+r.ink,support(s,r,snap),r.actor.weaponRunner?.s3ChargerFullInkBudget)/(w.chargeTime||1));
   // Receiver-held ink bounds charge even if the owner advertises a full tank.
   q=Math.min(q,fundedProgress(w,c.paid+r.ink));
   // A sender's charge scalar cannot erase progressive payment. The capture
   // interval has an unknown leading/trailing partial frame; debit the source
   // clock's independently earned lower bound, then commit the exact native
   // shot cost at playback. This preserves ordinary quantized tap releases.
   const low=c.lowerProgress||0,lowerSeconds=!first&&charging?seconds:0;
   c.lowerProgress=Math.min(q,fundedProgress(w,c.paid+r.ink),low+chargerChargeSeconds(w,low,lowerSeconds,c.paid+r.ink,support(s,r,snap),r.actor.weaponRunner?.s3ChargerFullInkBudget)/(w.chargeTime||1));
   const paid=progressiveInk(w,c.lowerProgress),debit=Math.max(0,paid-c.paid);
   r.ink=Math.max(0,r.ink-debit);c.paid=Math.max(c.paid,paid);c.progress=Math.max(c.progress,q);
   if(debit>0)r.lastSpend=at;
   if(!charging){
    c.endTs=snap.t;c.endAt=at;r.active=null;
    if(squid){
     if(c.progress>=1&&safe(snap.rawInput)&&(snap.rawInput&1)&&ownSupport(s,r,snap)){r.kept=c;c.keep=chargerKeepRecord(w,c.paid);chargerKeepHidden(c.keep,elapsed);}
     else {c.spent=true;r.cancelRecover=CHARGER_INTERRUPT_RECOVERY_SECONDS;}
    }
   }
  }
  r.cycles=r.cycles.filter(c=>c===r.active||c===r.kept||!c.spent&&finite(c.endAt)&&at-c.endAt<=MAX_AGE).slice(-MAX_CYCLES);
  r.lastTs=snap.t;r.lastAt=at;r.lastTick=packet.u;r.lastFlags=snap.f;r.pose=snap;
 }
}
function request(s,from,e,at){
 const d=e?.[3],a=s.nm.byNid?.get(d?.actor?.n),r=s.actors.get(a?.nid);
 if(!r||!actorLive(s,r)||r.from!==from||(d.full!==undefined&&typeof d.full!=='boolean')||(d.full===true&&d.charge!==1)||d.charge+.0005<(r.weapon.minimumChargeTime??8/60)/(r.weapon.chargeTime||1)||!safe(e._netTick)||!safe(e._netSeq)||e._netTick<0||e._netSeq<1||d?.weapon!==r.weapon.id||!finite(e[0])||e[0]>r.lastTs+.002||r.lastTs-e[0]>MAX_AGE||!finite(d.charge)||d.charge<0||d.charge>1||!vector(d.muzzle)||!vector(d.dir)||length(d.dir)<.98||length(d.dir)>1.02)return null;
 if(r.lastFlags&2)return null;
 if(!near(d.muzzle,[r.pose.x,r.pose.physicalY+1.05,r.pose.z],1.7))return null;
 const V=s.nm._combatProvenanceTHREE?.Vector3;
 // Physics.los deliberately omits the final 5cm for presentation. That
 // tolerance would let a requested muzzle cross a thin wall near its endpoint.
 if(typeof V!=='function'||typeof s.physics.segment!=='function'||s.physics.segment(new V(r.pose.x,r.pose.physicalY+1.05,r.pose.z),new V(...d.muzzle),undefined,true).hit)return null;
 const c=r.cycles.find(c=>!c.spent&&e[0]+CAPTURE>=c.startTs&&
  (!finite(c.cancelTs)||e[0]<c.cancelTs)&&
  (!c.keep||c===r.kept||e[0]>=c.keepReadyTs&&at>=c.keepReadyAt)&&
  (c===r.kept?c.keep?.fireDelay<=1e-10:c.endTs===null||e[0]<=c.endTs+CAPTURE)&&
  d.charge<=Math.min(c.progress,chargeAt(c,Math.min(e[0],c.endTs??e[0]),Math.min(at,c.endAt??at),r.weapon))+1e-6);
 if(!c||at+CAPTURE<(r.nextShotAt??-Infinity))return null;
 return {s,r,c,charge:d.charge,event:e,muzzle:d.muzzle.slice(),direction:d.dir.slice(),full:d.full,used:false,at};
}
export function withReceiverChargerPlayback(nm,from,e,G,at,fn){
 const a=nm.byNid?.get(e?.[3]?.actor?.n);
 if(e?.[1]!=='ev'||e?.[2]!=='weapon:fire'||!receiverChargerRequired(a))return fn();
 const s=ensure(nm,G),q=s&&request(s,from,e,at);
 if(!q)return;
 const previous=scopes.get(s.world);scopes.set(s.world,q);
 try{return fn();}finally{if(previous)scopes.set(s.world,previous);else scopes.delete(s.world);}
}
export function attachReceiverChargerFlight(system,job,damage,cost,reach,damageMin=damage,damageMax=damage){
 if(!receiverChargerRequired(job.owner))return true;
 const q=scopes.get(system),r=q?.r,s=q?.s;
 if(!q)return true; // direct cosmetic replay mints no contact capability
 if(q.used||!actorLive(s,r)||job.owner!==r.actor||job.weapon!==r.weapon||!job.ghost||job.charge!==q.charge||!finite(damage)||damage<=0||!finite(cost)||cost<0||!finite(reach)||reach<=0||job.range>reach+.011||!near([job.origin.x,job.origin.y,job.origin.z],q.muzzle,.011))return false;
 if(q.full!==undefined&&job.full!==q.full)return false;
 if(cost>q.c.paid+r.ink+.011)return false;
 const delta=Math.max(0,cost-q.c.paid);r.ink=Math.max(0,r.ink-delta);r.lastSpend=q.at;r.recoverStop=r.weapon.inkRecoverStop;
 q.used=true;q.c.spent=true;r.active=null;if(r.kept===q.c)r.kept=null;
 r.nextShotAt=q.at+(r.weapon.rechargeDelay??.1);r.nextChargeAt=r.nextShotAt;
 flights.set(job,{s,r,job,damage,damageMin,damageMax,contacts:new Set(),bornAt:q.at,alive:true});return true;
}
function liveFlight(f){return !!f&&f.alive&&actorLive(f.s,f.r)&&f.s.world._fidelityChargerFlights?.includes(f.job);}
function contact(f,target,type,damage,weak,at,scale=1){
 if(!liveFlight(f)||!finite(at)||at<f.bornAt||at-f.bornAt>MAX_AGE||f.contacts.has(target)||!finite(damage)||damage<=0)return false;
 const {s,r}=f;
 s.contacts=s.contacts.filter(c=>at-c.at>=0&&at-c.at<=CONTACT_AGE&&actorLive(s,c.r));
 if(s.contacts.length>=MAX_CONTACTS)return false;
 f.contacts.add(target);s.contacts.push({r,target,type,damage,damageMin:f.damageMin*scale,damageMax:f.damageMax*scale,weak,at,victimLife:type==='pvp'?life(target):null,boss:s.nm.match?.boss});
 s.notify?.call(s.nm,r.from);return true;
}
export function recordReceiverChargerActor(system,job,victim,at){
 const f=flights.get(job);
 if(!f||system!==f.s.world||victim?.remote||victim?.owner!==f.s.nm.myId||!victim?.alive||victim.team===f.r.actor.team||victim.invuln>0||f.s.nm.byNid?.get(victim.nid)!==victim)return false;
 return contact(f,victim,'pvp',f.damage,false,at);
}
export function recordReceiverChargerBoss(system,job,target,at){
 const f=flights.get(job),boss=f?.s.nm.match?.boss;
 if(!f||system!==f.s.world||!f.s.nm.isHost||!boss?.sim||boss.dead||f.s.nm.match.state!=='playing')return false;
 const crab=target&&safe(target.id)&&boss.crabs?.get(target.id)===target;
 if(crab){if(target.dead)return false;return contact(f,target,'boss',f.damage,false,at);}
 if(boss.invuln||boss.visible===false||!Array.isArray(boss.model?.hitShapes)||!boss.model.hitShapes.includes(target)||!target.active)return false;
 const rates=f.s.nm._combatHitCeilings?.boss;if(!rates)return false;
 const weak=!!target.weak,scale=(weak?rates.weak:1)*(boss.stunned?rates.stunned:1);
 return contact(f,target,'boss',f.damage*scale,weak,at,scale);
}
export function consumeReceiverChargerContact(nm,from,d,type,at){
 const s=states.get(nm),a=nm.byNid?.get(d?.a),r=s?.actors.get(d?.a);
 if(!worldLive(s)||!r||!actorLive(s,r)||r.from!==from||d.m!==s.epoch||!finite(at)||!(d.d>0)||!['charger','shot',r.weapon.id,...(type==='boss'&&d.c>=0?['crab']:[])].includes(d.w))return false;
 const target=type==='pvp'?nm.byNid?.get(d.v):d.c>=0?nm.match?.boss?.crabs?.get(d.c):null;
 const index=s.contacts.findIndex(c=>c.r===r&&c.type===type&&at>=c.at&&at-c.at<=CONTACT_AGE&&
  d.d>=c.damageMin-.011&&d.d<=c.damageMax+.011&&(type==='pvp'?c.target===target&&c.victimLife===d.l&&life(target)===d.l&&target.alive&&!target.remote:
  c.boss===nm.match?.boss&&(d.c>=0?c.target===target&&!target.dead:nm.match?.boss?.model?.hitShapes?.includes(c.target)&&Number(d.weak)===Number(c.weak))));
 if(index<0)return false;s.contacts.splice(index,1);return true;
}
export function retireReceiverChargerPeer(nm,from){const s=states.get(nm);if(!s)return;for(const [id,r] of s.actors)if(r.from===from)s.actors.delete(id);s.contacts=s.contacts.filter(c=>c.r.from!==from);}
export function closeReceiverChargers(nm){const s=states.get(nm);if(s){s.actors.clear();s.contacts.length=0;worlds.get(s.world)?.states.delete(s);}states.delete(nm);}
