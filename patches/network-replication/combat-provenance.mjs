import {registerLimitedTorpedo,consumeLimitedContact} from './torpedo-contact-commit.mjs';
import { SPRINKLER } from '../splatoon3/runtime/kit-sprinkler.mjs';
import { registerReceiverSprinkler, consumeReceiverSprinklerContact, receiverSprinklerScope } from './sprinkler-contact-commit.mjs';
// Correlate owner-authenticated hit *claims* with independent ordered owner
// attack events before changing victim HP or host Boss HP. This is a low-cost
// plausibility gate, not a claim that an untrusted client cannot forge its own
// action stream; fully trustworthy combat needs host projectile simulation.
import { bindSubBirthCommit, closeSubBirthCommit } from './sub-birth-commit.mjs';
const MAX_PROOFS = 160, MAX_PENDING = 48;
const EXPLOSIVE_SUBS = new Set(['bomb','suction','burst','curling','autobomb','fizzy','torpedo','inkMine']);
const PROOF_AGE = 3.5, SPECIAL_PROOF_AGE = 10, PENDING_AGE = 0.95;
const finite = Number.isFinite;
const safe = Number.isSafeInteger;
const actorKey = a => a?.nid;
const v3 = v => Array.isArray(v) && v.length === 3 && v.every(n => finite(n) && Math.abs(n) <= 2000);
const point = a => a?.pos && [a.pos.x, a.pos.y, a.pos.z];
const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const difference = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const magnitude = a => Math.hypot(...a);
const now = () => performance.now() / 1000;
const matchIdOk = (nm,d) => typeof nm.cfg?.id === 'string' && d?.m === nm.cfg.id;
function state(nm) {
  return nm._combatProvenance ||= { proofs:new Map(), pending:new Map(), contacts:new Map() };
}
function prune(s,t) {
  for(const [peer,arr] of s.proofs) {
    let end=0;
    for(let i=0;i<arr.length;i++)if(t-arr[i].at>=0 && t-arr[i].at<=(arr[i].kind==='special'?SPECIAL_PROOF_AGE:PROOF_AGE))arr[end++]=arr[i];
    arr.length=end;
    if(!end)s.proofs.delete(peer);
  }
  for(const [peer,arr] of s.pending) {
    let end=0;
    for(let i=0;i<arr.length;i++)if(t-arr[i].at>=0 && t-arr[i].at<=PENDING_AGE)arr[end++]=arr[i];
    arr.length=end;
    if(!end)s.pending.delete(peer);
  }
  for(const [k,entry] of s.contacts) if(t-entry.at>1.2)s.contacts.delete(k);
}
function weaponId(actor) {
  return actor?.weapon?.catalogRecord?.id || actor?.weapon?.id;
}
function ownerActor(nm,from,id) {
  const a=nm.byNid?.get(id);
  return a && a.owner===from && a.remote && a.alive!==false ? a : null;
}
function nearActor(origin,pose) {
  return v3(origin) && v3(pose) && dist(origin,pose)<=7.5;
}
function proofFromEvent(nm,from,e,poses,ts,t,acceptedSub=null) {
  if(!Array.isArray(e) || !finite(e[0]) || e[0]>ts+.075 || ts-e[0]>1.4)return null;
  let id,source,origin,direction,cause,kind,maxUses;
  if(e[1]==='p') {
    id=e[2]; source=ownerActor(nm,from,id);
    if(!source)return null;
    const wire=e[4],main=weaponId(source);
    if(!wire || wire===main || wire===source.weapon?.id) {
      cause=main;kind='main';
      const family=source.weapon?.kind;
      maxUses=['blaster','slosher','stringer','roller','brush'].includes(family)?6:2;
    } else if(wire===source.weapon?.sub) {
      cause=wire;kind='sub';maxUses=8;
    } else if(wire===source.weapon?.special) {
      cause=wire;kind='special';maxUses=8;
    } else return null;
    origin=e.slice(5,8);direction=e.slice(8,11);
  } else if(e[1]==='ev' && e[2]==='weapon:fire') {
    const ev=e[3];id=ev?.actor?.n;
    source=ownerActor(nm,from,id);
    if(!source || ev.weapon!==weaponId(source) && ev.weapon!==source.weapon?.id)return null;
    origin=ev.muzzle;direction=ev.dir;cause=weaponId(source);kind='main';
    maxUses=['blaster','slosher','stringer','roller','brush'].includes(source.weapon?.kind)?6:2;
  } else if(e[1]==='ac' && e[2]==='sub') {
    // Raw packets never mint catalogue-sub proof. This receipt is supplied
    // only after receiver FIFO admission and successful native object creation.
    if(!acceptedSub || acceptedSub.from!==from || acceptedSub.nid!==e[3] ||
      acceptedSub.life!==e[4] || acceptedSub.serial!==e[5]?.seq)return null;
    // S3's native all:sub transport: [time,'ac','sub',nid,life,payload,tick,seq].
    // The 'spawn' phase is the independently ordered, life-bound weapon birth;
    // neither a later explosion proposal nor a cosmetic ghost mints evidence.
    id=e[3];source=ownerActor(nm,from,id);
    const payload=e[5],life=Math.max(source?.netLife??0,source?.net?.lastLife??0);
    if(!source || e[4]!==life || !payload || payload.v!==1 ||
      payload.phase!=='spawn' || payload.subId!==source.weapon?.sub ||
      !safe(payload.seq) || payload.seq<1 || !safe(payload.life) ||
      payload.life!==life)return null;
    origin=[payload.x,payload.y,payload.z];
    direction=[payload.vx,payload.vy,payload.vz];
    // A stationary mine still has an owner-authenticated placement birth.
    if(payload.subId==='inkMine' && magnitude(direction)<.001)direction=[0,1,0];
    cause=payload.subId;kind='sub';maxUses=8;
  } else if(e[1]==='b') {
    id=e[2];source=ownerActor(nm,from,id);
    if(!source)return null;
    // The actual actor's equipped sub must produce this bomb class.
    const sub=source.weapon?.sub;
    const committedSprinkler=acceptedSub?.sourceKind==='native-sprinkler' && acceptedSub.from===from &&
      acceptedSub.nid===id && acceptedSub.subId==='sprinkler' && sub==='sprinkler' && e[3]==='bomb' && e[11]==='sprinkler';
    if(sub==='sprinkler' && !committedSprinkler)return null;
    if(!committedSprinkler && e[3]!==sub && !(e[3]==='bomb' && EXPLOSIVE_SUBS.has(sub)))return null;
    origin=e.slice(4,7);direction=e.slice(7,10);
    cause=sub;kind='sub';maxUses=8;
  } else if(e[1]==='ev' && (e[2]==='special:use' || e[2]==='special:slam')) {
    const ev=e[3];id=ev?.actor?.n;
    source=ownerActor(nm,from,id);
    if(!source || !source.weapon?.special)return null;
    if(ev?.id && ev.id!==source.weapon.special)return null;
    origin=ev.pos || poses.get(id) || point(source);direction=ev.dir || [0,1,0];
    cause=source.weapon.special;kind='special';maxUses=e[2]==='special:slam'?8:24;
  } else return null;
  const pose=poses.get(id) || point(source);
  if(!v3(origin) || !v3(direction) || !nearActor(origin,pose))return null;
  const length=magnitude(direction);
  if(length<.0001 || length>700)return null;
  const unit=direction.map(n=>n/length);
  const reach=Math.max(10,Math.min(100,Number(source.weapon?.range||30)+12));
  const key=acceptedSub && ((e[1]==='ac' && e[2]==='sub') || acceptedSub.sourceKind==='native-sprinkler')
    ? ['accepted-sub-birth',id,acceptedSub.life,acceptedSub.serial,cause].join(':')
    : [id,e[0],e[1],kind,cause,...origin.map(n=>Math.round(n*10))].join(':');
  return {actor:id,at:t,ts:e[0],origin,unit,reach,cause,kind,maxUses,uses:0,key};
}
function record(nm,from,packet,t,acceptedSub=null) {
  if(!Array.isArray(packet?.e) || packet.e.length>512 || !finite(packet.ts) || packet.ts<0 || packet.ts>1e9)return;
  const s=state(nm);prune(s,t);
  const poses=nm._combatPoseScratch||(nm._combatPoseScratch=new Map());poses.clear();
  if(Array.isArray(packet.a))for(const r of packet.a) {
    if(!Array.isArray(r)||r.length<4 || !v3(r.slice(1,4)))continue;
    if(ownerActor(nm,from,r[0]))poses.set(r[0],r.slice(1,4));
  }
  const store=s.proofs.get(from)||[];let acceptedProof=null;
  for(let i=0;i<Math.min(packet.e.length,256);i++) {
    const candidate=proofFromEvent(nm,from,packet.e[i],poses,packet.ts,t,acceptedSub);
    if(!candidate || store.some(p=>p.key===candidate.key))continue;
    const actor=ownerActor(nm,from,candidate.actor);
    const interval=actor?.weapon?.fireInterval;
    const rate=finite(interval)&&interval>0 ? Math.min(75,Math.ceil(2/interval)+6):32;
    let recent=0;
    for(const shot of store)if(shot.actor===candidate.actor && t-shot.at<1)recent++;
    if(recent>=rate)continue;
    store.push(candidate);if(acceptedSub)acceptedProof=candidate;
  }
  if(store.length)s.proofs.set(from,store.slice(-MAX_PROOFS));return acceptedProof;
}
function rayNear(p,target,margin=5) {
  const d=difference(target,p.origin),along=dot(d,p.unit);
  if(along< -2 || along>p.reach+8)return false;
  const sideways=Math.sqrt(Math.max(0,dot(d,d)-along*along));
  return sideways<=margin;
}
function actualTarget(nm,type,d) {
  if(type==='pvp')return point(nm.byNid?.get(d.v));
  const boss=nm.match?.boss;
  if(!boss?.sim||boss.dead)return null;
  if(d.c>=0) {
    const crab=boss.crabs?.get(d.c);
    return crab&&!crab.dead?[crab.x,crab.y+.4,crab.z]:null;
  }
  return point(boss);
}
function hitSegmentOk(p,geometry,target) {
  if(geometry===undefined)return true;
  if(!Array.isArray(geometry)||geometry.length!==7 || !geometry.every(finite) ||
    geometry[6]<0 || geometry[6]>10)return false;
  const from=geometry.slice(0,3),to=geometry.slice(3,6);
  if(!v3(from)||!v3(to))return false;
  if(!rayNear(p,from,6) || !rayNear(p,to,6))return false;
  // The victim is permitted to move between the owner's collision and the
  // recipient's local presentation, but not across the entire arena.
  return dist(to,target)<=12+geometry[6];
}
function weakPointOk(nm,p) {
  const shapes=nm.match?.boss?.model?.hitShapes;
  if(!Array.isArray(shapes))return false;
  return shapes.some(h=>h.active && h.weak && h.pos &&
    finite(h.r) && h.r>0 && rayNear(p,[h.pos.x,h.pos.y,h.pos.z],Math.min(3,h.r+.9)));
}
function equippedCause(actor,d,type) {
  const w=actor?.weapon;
  if(!w)return false;
  if(type==='boss' && d.c>=0 && d.w==='crab')return true; // crablet-target marker
  const id=weaponId(actor);
  if(d.w!==id && d.w!==w.id && d.w!==w.kind && d.w!==w.sub && d.w!==w.special &&
     d.w!=='shot' && d.w!=='slosh' && d.w!=='blast' && d.w!=='drop' && d.w!=='roller' &&
     !(d.w==='bomb' && EXPLOSIVE_SUBS.has(w.sub)) &&
     !(d.w==='torpedo-splash' && w.sub==='torpedo'))return false;
  // Generic fallbacks cannot pretend a main-weapon shot is a Special.
  if(d.w==='roller' && w.kind!=='roller')return false;
  return true;
}
function contactProof(nm,from,d,type,t,target) {
  const a=ownerActor(nm,from,d.a),w=a?.weapon;
  if(!a || !equippedCause(a,d,type))return false;
  const here=point(a);
  if(!v3(here)||dist(here,target)>4.0)return false;
  // Roller contact has no projectile or fire-event packet. Require the
  // owner snapshot's currently observed rolling flag and a realistic target.
  if(w.kind!=='roller' || (d.w!=='roller' && !(type==='boss' && d.c>=0 && d.w==='crab')))return false;
  if(!((a.net?.cur?.f??0)&256) && !a.weaponRunner?.rolling)return false;
  const s=state(nm),key=[type,from,d.a,type==='pvp'?d.v:d.c].join(':');
  if(t-(s.contacts.get(key)?.at??-Infinity)<.45)return false;
  s.contacts.set(key,{at:t});
  return true;
}
function specialProof(nm,from,d,type,t,target) {
  const a=ownerActor(nm,from,d.a),w=a?.weapon;
  if(!a || !equippedCause(a,d,type) || d.w!==w.special)return false;
  if(type==='boss'&&d.weak===1)return false;
  if(d.w==='storm' && d.d>160)return false;
  // Close-range Kraken dash/splat, not the default 45m duration-wide reach.
  // Active/snapshotted special plus the native special-use event must be near
  // its victim; off-stage or remote-distant body hits are never legal.
  if(d.w==='krakenRoyale' && (d.d>120 || dist(point(a)||[0,0,0],target)>5.5))return false;
  const here=point(a);
  if(!v3(here)||dist(here,target)>45)return false;
  const s=state(nm),key=[type,from,d.a,d.w].join(':');
  if(t-(s.contacts.get(key)?.at??-Infinity)<.22)return false;
  const recent=(s.proofs.get(from)||[]).some(p=>p.actor===d.a&&p.kind==='special'&&p.cause===d.w&&t-p.at<SPECIAL_PROOF_AGE);
  if(!recent && a.specialActive?.id!==d.w)return false;
  s.contacts.set(key,{at:t});
  return true;
}
// Keep the existing PvP Special fallback ceilings on every claim route.
// Boss wire multipliers and all other causes retain their existing policy.
function oversizedPvpSpecial(d,type) {
  return type==='pvp' && ((d?.w==='storm' && d.d>160) ||
    (d?.w==='krakenRoyale' && d.d>120));
}
function take(nm,from,d,type,t,sprinklerScope=null) {
  if(oversizedPvpSpecial(d,type))return false;
  const actor=ownerActor(nm,from,d.a),target=actualTarget(nm,type,d);
  if(!actor || !v3(target) || !equippedCause(actor,d,type))return false;
  if(type==='pvp') {
    const victim=nm.byNid?.get(d.v);
    if(!victim || victim.remote || !victim.alive || victim.team===actor.team)return false;
  } else {
    if(!nm.isHost || !nm.match?.boss?.sim || !nm.match?.state ||
      nm.match.state!=='playing'||nm.match.boss.dead)return false;
    if(d.weak===1 && d.c>=0)return false;
    // Normal boss hits are strengthened by weak/stunned multipliers, but a
    // single network claim can never supply the old arbitrary 2000 HP.
    if(d.d>800)return false;
  }
  if(type==='pvp'&&d.w==='torpedo-splash'&&consumeLimitedContact(nm,from,d,t))return true;
  if(type==='pvp'&&d.w==='sprinkler')return consumeReceiverSprinklerContact(nm,from,d,t,sprinklerScope);
  const s=state(nm);prune(s,t);
  const shots=s.proofs.get(from)||[];
  for(const p of shots) {
    if(p.actor!==d.a || p.uses>=p.maxUses || !rayNear(p,target,type==='boss'?6:5.5))continue;
    // An enrolled native birth authorizes terrain damage only via its contact receipts.
    // Keep unsupported legacy births separate, including after all native contacts retire.
    if(type==='pvp'&&d.w==='torpedo-splash'&&p.nativeTorpedoContact)continue;
    if(p.kind==='main'&& ![weaponId(actor),actor.weapon.id,actor.weapon.kind,'shot','slosh','blast','drop','roller','crab'].includes(d.w))continue;
    if(p.kind==='sub' && d.w!==p.cause && d.w!=='crab' &&
      !(d.w==='bomb'&&EXPLOSIVE_SUBS.has(p.cause)) &&
      !(d.w==='torpedo-splash'&&p.cause==='torpedo'))continue;
    if(p.kind==='special' && d.w!==p.cause)continue;
    if(type==='pvp') {
      if(!hitSegmentOk(p,d.bg,target))continue;
      if(p.kind==='main' && d.bg && nm._combatProvenancePhysics?.los && nm._combatProvenanceTHREE?.Vector3) {
        const V=nm._combatProvenanceTHREE.Vector3;
        const scratch=nm._combatProvenanceVectors||(nm._combatProvenanceVectors=[new V(),new V()]);
        const dst=d.bg;
        scratch[0].set(...p.origin);
        scratch[1].set(dst[3],dst[4],dst[5]);
        try { if(!nm._combatProvenancePhysics.los(scratch[0],scratch[1]))continue; }
        catch { continue; } // malformed collision world never authorizes a hit
      }
    } else if(d.weak===1 && !weakPointOk(nm,p))continue;
    p.uses++;
    return true;
  }
  if(contactProof(nm,from,d,type,t,target))return true;
  if(specialProof(nm,from,d,type,t,target))return true;
  return false;
}
function enqueue(nm,from,d,type,t) {
  if(oversizedPvpSpecial(d,type))return;
  if(!matchIdOk(nm,d) || !safe(d.a) || !ownerActor(nm,from,d.a) ||
    !safe(d[type==='pvp'?'h':'q']) || d[type==='pvp'?'h':'q']<1 ||
    !finite(d.d) || d.d<0 || d.d>2000 ||
    typeof d.w!=='string' || d.w.length>64 || !equippedCause(nm.byNid.get(d.a),d,type))return;
  if(d.bg!==undefined && (!Array.isArray(d.bg) || d.bg.length!==7 ||
    !d.bg.every(finite)))return;
  if(d.kb!==undefined && (!d.kb || typeof d.kb!=='object' ||
    JSON.stringify(d.kb).length>300))return;
  const s=state(nm), arr=s.pending.get(from)||[];
  if(arr.some(x=>x.type===type && x.d[type==='pvp'?'h':'q']===d[type==='pvp'?'h':'q']))return;
  if(arr.length>=MAX_PENDING)return;
  // Never retain arbitrary attacker-supplied JSON baggage while a proof is
  // pending. Bound each claim independently of the relay's frame allowance.
  const claim=type==='pvp' ? {k:'hit',m:d.m,a:d.a,v:d.v,l:d.l,h:d.h,seq:d.seq,
    d:d.d,w:d.w,g:d.g,kb:d.kb,bg:d.bg}
    : {k:'bhit',m:d.m,a:d.a,d:d.d,weak:d.weak,w:d.w,c:d.c,l:d.l,q:d.q};
  arr.push({type,d:claim,at:t,sprinklerScope:d.w==='sprinkler'?receiverSprinklerScope(nm,from,d.a):null});
  s.pending.set(from,arr);
}
export function combatAdmission(nm,from,d,type,t=now(),sprinklerScope=null) {
  if(!nm || nm._disposed || !d || (type!=='boss'&&type!=='pvp'))return false;
  const s=state(nm);prune(s,t);
  const a=ownerActor(nm,from,d.a);
  if(!a || !matchIdOk(nm,d) || !safe(d[type==='pvp'?'h':'q']) || d[type==='pvp'?'h':'q']<1)return false;
  return take(nm,from,d,type,t,sprinklerScope);
}
function flush(nm,from,t,oldHit,oldBoss,receiptAllowed) {
  const s=state(nm),items=s.pending.get(from);
  if(!items?.length)return;
  const still=[];
  for(const item of items) {
    if(t-item.at>PENDING_AGE)continue;
    if(item.type==='pvp'&&(item.d.w==='sprinkler'||item.d.w==='torpedo-splash')&&(typeof receiptAllowed!=='function'||!receiptAllowed.call(nm,item.d,from)))continue;
    if(!combatAdmission(nm,from,item.d,item.type,t,item.sprinklerScope)) {still.push(item);continue;}
    if(item.type==='pvp')oldHit.call(nm,item.d,from);
    else if(oldBoss?.call(nm,from,item.d))nm.match.boss.remoteHit(item.d);
  }
  if(still.length)s.pending.set(from,still);else s.pending.delete(from);
}
export function installCombatProvenance(NetMatch,context={}) {
  const marker=Symbol.for('inkwave.combat-provenance.v1'),P=NetMatch.prototype;
  if(P[marker])return;
  Object.defineProperty(P,marker,{value:true});
  const oldTick=P._tick,oldHit=P._hit,oldMessage=P.onMessage;
  const oldBoss=P._acceptBossHit,oldLeave=P.onLeave,oldDispose=P.dispose;
  // One callback per installed prototype, not per owner packet.
  const notifySprinkler=function(from){flush(this,from,now(),oldHit,oldBoss,context.hitReceiptAllowed);};
  const commitSubBirth=function(receipt,event,bomb) {
    const t=now();
    const accepted=record(this,receipt.from,{e:[event],ts:receipt.packetTime,a:[[receipt.nid,...receipt.pose]]},t,receipt);
    if(accepted&&receipt.subId==='torpedo'&&registerLimitedTorpedo(this,bomb,receipt,event,context.G,notifySprinkler))accepted.nativeTorpedoContact=true;
    if(accepted&&receipt.sourceKind==='native-sprinkler')registerReceiverSprinkler(this,bomb,receipt,context.G,notifySprinkler,PENDING_AGE,MAX_PENDING);
    // Hits may precede delayed FIFO playback; retry only when birth commits.
    flush(this,receipt.from,t,oldHit,oldBoss,context.hitReceiptAllowed);
  };
  P._tick=function(from,d) {
    bindSubBirthCommit(this,commitSubBirth);
    const before=this.peers?.get(from)?.lastTs??-Infinity;
    const result=oldTick.call(this,from,d);
    if(this.peers?.get(from)?.lastTs===d?.ts && finite(d.ts) && d.ts>before) {
      const t=now();
      record(this,from,d,t);
      flush(this,from,t,oldHit,oldBoss,context.hitReceiptAllowed);
    }
    return result;
  };
  P._hit=function(d,from) {
    // Locally delivered pending receipts after host handoff are not remote
    // sender claims. Preserve their existing authenticated owner path.
    if(from===this.myId)return oldHit.call(this,d,from);
    // The exact compiled native payload policy must reject invalid claims
    // before proof consumption or pending hit-ID reservation. Missing context
    // is fail-closed, never permission to bypass that policy.
    if(typeof context.hitPayloadAllowed!=='function' || !context.hitPayloadAllowed(d))return;
    if(d.w==='torpedo-splash'&&(typeof context.hitReceiptAllowed!=='function'||!context.hitReceiptAllowed.call(this,d,from)))return;
    if(d.w==='sprinkler'&&(d.d!==SPRINKLER.dropletDamage||typeof context.hitReceiptAllowed!=='function'||!context.hitReceiptAllowed.call(this,d,from)))return;
    const t=now();
    // Only incoming remote owner claims are deferred; internally retried
    // local receipts still require a previously accepted attack proof.
    if(combatAdmission(this,from,d,'pvp',t))return oldHit.call(this,d,from);
    enqueue(this,from,d,'pvp',t);
  };
  P.onMessage=function(from,d) {
    if(d?.k==='bhit' && this.isHost) {
      const t=now();
      if(combatAdmission(this,from,d,'boss',t)) {
        if(oldBoss?.call(this,from,d))this.match.boss.remoteHit(d);
      } else enqueue(this,from,d,'boss',t);
      return;
    }
    return oldMessage.call(this,from,d);
  };
  P.onLeave=function(id,changed) {
    if(changed)closeSubBirthCommit(this);
    const s=this._combatProvenance;
    s?.proofs.delete(id);s?.pending.delete(id);
    if(changed){s?.proofs.clear();s?.pending.clear();s?.contacts.clear();}
    return oldLeave.call(this,id,changed);
  };
  P.dispose=function(...args) {
    closeSubBirthCommit(this);
    const s=this._combatProvenance;
    s?.proofs.clear();s?.pending.clear();s?.contacts.clear();
    this._combatProvenance=null;
    return oldDispose.apply(this,args);
  };
  // No per-frame allocations: only ordered 20Hz owner ticks and sparse hits
  // touch this gate; physics is optional for offline/unit-test contexts.
  P._combatProvenancePhysics=null;
  P._combatProvenanceTHREE=context.THREE||null;
  if(context.G) {
    const oldBind=P.bind;
    P.bind=function(...args){this._combatProvenancePhysics=context.G.physics;return oldBind.apply(this,args);};
  }
}
