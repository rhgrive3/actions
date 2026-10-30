import {registerLimitedTorpedo,consumeLimitedContact} from './torpedo-contact-commit.mjs';
import { SPRINKLER } from '../splatoon3/runtime/kit-sprinkler.mjs';
import { registerReceiverSprinkler, consumeReceiverSprinklerContact, receiverSprinklerScope } from './sprinkler-contact-commit.mjs';
// Correlate owner-authenticated hit *claims* with independent ordered owner
// attack events before changing victim HP or host Boss HP. This is a low-cost
// plausibility gate, not a claim that an untrusted client cannot forge its own
// action stream; fully trustworthy combat needs host projectile simulation.
import { bindSubBirthCommit, closeSubBirthCommit } from './sub-birth-commit.mjs';
import { COMBAT_HIT_CEILINGS } from './combat-hit-ceilings-data.mjs';
import { damageLeafMax } from './damage-leaves.mjs';
import { observeOwnerTick } from './owner-tick-receipt.mjs';
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
  return nm._combatProvenance ||= { proofs:new Map(), pending:new Map(), contacts:new Map(), contactSnapshots:new Map(), specialSnapshots:new Map() };
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
function mainProofUses(actor) {
  const w=actor.weapon;
  if(!w)return 0;
  const family=w.catalogRecord?.family||w.behaviorKind||w.kind;
  // Both native InkFlightRuntime and catalogue collision retire these rounds
  // at their first body contact. A second victim/object is not penetration.
  // Charger and area/multi-unit owners retain their separate native policies.
  if(family==='shooter'||family==='dualies'||family==='splatling')return 1;
  return ['blaster','slosher','stringer','roller','brush'].includes(w.kind)?6:2;
}
function proofFromEvent(nm,from,e,poses,ts,t,acceptedSub=null,requirePose=false) {
  if(!Array.isArray(e) || !finite(e[0]) || e[0]>ts+.075 || ts-e[0]>1.4)return null;
  let id,source,origin,direction,cause,kind,maxUses;
  if(e[1]==='p') {
    id=e[2]; source=ownerActor(nm,from,id);
    if(!source)return null;
    const wire=e[4],main=weaponId(source);
    if(!wire || wire===main || wire===source.weapon?.id) {
      cause=main;kind='main';
      maxUses=mainProofUses(source);
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
    maxUses=mainProofUses(source);
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
  const pose=poses.get(id) || (requirePose ? null : point(source));
  if(!v3(origin) || !v3(direction) || !nearActor(origin,pose))return null;
  const length=magnitude(direction);
  if(length<.0001 || length>700)return null;
  const unit=direction.map(n=>n/length);
  const reach=Math.max(10,Math.min(100,Number(source.weapon?.range||30)+12));
  const key=acceptedSub && ((e[1]==='ac' && e[2]==='sub') || acceptedSub.sourceKind==='native-sprinkler')
    ? ['accepted-sub-birth',id,acceptedSub.life,acceptedSub.serial,cause].join(':')
    : [id,e[0],e[1],kind,cause,...origin.map(n=>Math.round(n*10))].join(':');
  return {actor:id,at:t,ts:e[0],origin,unit,reach,cause,kind,maxUses,uses:0,key,src:e[1],los:null};
}
function record(nm,from,packet,t,acceptedSub=null,acceptedPoses=null) {
  if(!Array.isArray(packet?.e) || packet.e.length>512 || !finite(packet.ts) || packet.ts<0 || packet.ts>1e9)return;
  const s=state(nm);prune(s,t);
  const poses=nm._combatPoseScratch||(nm._combatPoseScratch=new Map());poses.clear();
  // Paint cannot produce combat proof. Keep expiry and the bounded owned tail,
  // but do not copy actor poses for this common paint-only envelope.
  const eventLimit=Math.min(packet.e.length,256);
  let paintOnly=eventLimit>0;
  for(let i=0;paintOnly&&i<eventLimit;i++)if(!Array.isArray(packet.e[i])||packet.e[i][1]!=='s')paintOnly=false;
  if(paintOnly){const store=s.proofs.get(from);if(store?.length)s.proofs.set(from,store.slice(-MAX_PROOFS));return null;}
  if(acceptedPoses){
    for(const [id,pose] of acceptedPoses)if(v3(pose)&&ownerActor(nm,from,id))poses.set(id,pose);
  }else if(Array.isArray(packet.a))for(const r of packet.a) {
    if(!Array.isArray(r)||r.length<4)continue;
    if(Object.hasOwn(r,1)&&Object.hasOwn(r,2)&&Object.hasOwn(r,3)){
      const x=r[1],y=r[2],z=r[3];
      if(!finite(x)||Math.abs(x)>2000||!finite(y)||Math.abs(y)>2000||!finite(z)||Math.abs(z)>2000)continue;
      if(ownerActor(nm,from,r[0]))poses.set(r[0],r.slice(1,4));
    }else{
      // Sparse/custom rows retain slice/every semantics (holes are skipped).
      if(!v3(r.slice(1,4)))continue;
      if(ownerActor(nm,from,r[0]))poses.set(r[0],r.slice(1,4));
    }
  }
  const store=s.proofs.get(from)||[];let acceptedProof=null;
  const packetStart=store.length;
  // A burst shares one exact index; ordinary small envelopes retain the
  // allocation-free walk. Only accepted proofs extend either index.
  let proofKeys=null,recentByActor=null;
  for(let i=0;i<eventLimit;i++) {
    const candidate=proofFromEvent(nm,from,packet.e[i],poses,packet.ts,t,acceptedSub,acceptedPoses!==null);
    if(!candidate)continue;
    if(!proofKeys&&packet.e.length>=32){
      proofKeys=new Set();recentByActor=new Map();
      for(const proof of store){proofKeys.add(proof.key);if(t-proof.at<1)recentByActor.set(proof.actor,(recentByActor.get(proof.actor)||0)+1);}
    }
    let duplicate=false,recent=0;
    if(proofKeys){duplicate=proofKeys.has(candidate.key);recent=recentByActor.get(candidate.actor)||0;}
    else for(const proof of store) {
      if(proof.key===candidate.key){duplicate=true;break;}
      if(proof.actor===candidate.actor && t-proof.at<1)recent++;
    }
    if(duplicate)continue;
    // #1665: one main shot records its projectile birth ('p') and then its
    // weapon:fire presentation event in the same frame. Both used to mint a
    // proof, doubling the hits one real round could authorize. The fire event
    // still proves hitscan shots (Charger), which have no projectile birth.
    if(candidate.src==='ev'&&candidate.kind==='main'&&sameShotBirth(store,packetStart,candidate))continue;
    const actor=ownerActor(nm,from,candidate.actor);
    // These native families always publish recProj before weapon:fire. The
    // latter is presentation, so an omitted/rejected birth cannot be replaced
    // by a second self-authored row. Charger hitscan keeps its no-birth path.
    if(candidate.src==='ev'&&candidate.kind==='main'&&
       ['shooter','dualies','splatling'].includes(actor?.weapon?.catalogRecord?.family||actor?.weapon?.behaviorKind||actor?.weapon?.kind))continue;
    const interval=actor?.weapon?.fireInterval;
    const rate=finite(interval)&&interval>0 ? Math.min(75,Math.ceil(2/interval)+6):32;
    if(recent>=rate)continue;
    store.push(candidate);if(acceptedSub)acceptedProof=candidate;
    if(proofKeys){proofKeys.add(candidate.key);if(t-candidate.at<1)recentByActor.set(candidate.actor,recent+1);}
  }
  if(store.length)s.proofs.set(from,store.slice(-MAX_PROOFS));return acceptedProof;
}
// Pair a fire event with the birth it presents: same actor, same packet, the
// same muzzle point (both rows are r2 of one Vector3) and the same frame. The
// two rows are recorded microseconds to milliseconds apart depending on device
// load, so time alone is not an identity; each birth pairs with one event.
function sameShotBirth(store,start,c) {
  for(let i=store.length-1;i>=start;i--) {
    const p=store[i];
    if(p.actor===c.actor&&p.src==='p'&&p.kind==='main'&&!p.pairedFire&&
       Math.abs(p.ts-c.ts)<=SAME_SHOT_SECONDS&&dist(p.origin,c.origin)<=SAME_SHOT_MUZZLE){p.pairedFire=true;return true;}
  }
  return false;
}
// #1665/#1666: the receiver's own trusted geometry. The victim owner knows
// where its own actor really was; the host knows the Boss. A straight-fire
// main round must have had a clear line from its claimed muzzle to the
// victim at some point inside the lag window, and that muzzle must be in
// view of the attacker's own reported body. Lobbed/area families (Slosher,
// Roller and Brush flings, Blaster bursts, Stringer, Splatana, Brella) and
// subs/Specials are not straight lines, so they keep the ray-proximity gate.
const DIRECT_FIRE = new Set(['shooter','dualies','splatling','charger']);
const SAME_SHOT_SECONDS = 1/60, SAME_SHOT_MUZZLE = .05;
const HISTORY_AGE = 1.2, HISTORY_SIZE = 32, HISTORY_SPACING = 1/40, HISTORY_POSES = 8;
const SAMPLE_HEIGHTS = [.3,.9,1.5], SAMPLE_REACH = .35, ATTACKER_HEIGHTS = [.5,1.05,1.5];
function directFire(actor) {
  const w=actor?.weapon;
  return DIRECT_FIRE.has(w?.catalogRecord?.family||w?.behaviorKind||w?.kind);
}
function losTools(nm) {
  const physics=nm._combatProvenancePhysics,V=nm._combatProvenanceTHREE?.Vector3;
  if(typeof physics?.los!=='function'||typeof V!=='function')return null;
  const scratch=nm._combatLosVectors||(nm._combatLosVectors=[new V(),new V()]);
  return {physics,a:scratch[0],b:scratch[1]};
}
function clear(tools,from,x,y,z) {
  tools.a.set(from[0],from[1],from[2]);tools.b.set(x,y,z);
  try { return tools.physics.los(tools.a,tools.b)===true; }
  catch { return false; } // malformed collision world never authorizes a hit
}
// Local actors only: one bounded ring per actor, sampled on owner packets.
export function sampleLocalHistory(nm,t=now()) {
  const s=state(nm),rings=s.history||(s.history=new Map());
  for(const a of nm.byNid?.values?.()||[]) {
    if(a?.remote||!a?.alive||!a.pos||!finite(a.pos.x)||!finite(a.pos.y)||!finite(a.pos.z))continue;
    let ring=rings.get(a);
    if(!ring){ring={buf:new Float64Array(HISTORY_SIZE*4),n:0,i:0};rings.set(a,ring);}
    const last=ring.n?ring.buf[((ring.i+HISTORY_SIZE-1)%HISTORY_SIZE)*4]:-Infinity;
    if(t-last<HISTORY_SPACING&&t>=last)continue;
    const o=ring.i*4;
    ring.buf[o]=t;ring.buf[o+1]=a.pos.x;ring.buf[o+2]=a.pos.y;ring.buf[o+3]=a.pos.z;
    ring.i=(ring.i+1)%HISTORY_SIZE;ring.n=Math.min(HISTORY_SIZE,ring.n+1);
  }
}
function poseVisible(tools,origin,x,y,z) {
  let dx=origin[0]-x,dz=origin[2]-z;const h=Math.hypot(dx,dz);
  if(h>1e-6){dx/=h;dz/=h;}else{dx=0;dz=0;}
  for(const height of SAMPLE_HEIGHTS)for(let side=-1;side<=1;side++) {
    const px=x+(dx-side*dz)*SAMPLE_REACH,pz=z+(dz+side*dx)*SAMPLE_REACH;
    if(clear(tools,origin,px,y+height,pz))return true;
  }
  return false;
}
function attackerSeesMuzzle(tools,nm,p) {
  const a=nm.byNid?.get(p.actor),pose=point(a);
  if(!v3(pose))return false;
  for(const height of ATTACKER_HEIGHTS)if(clear(tools,p.origin,pose[0],pose[1]+height,pose[2]))return true;
  return false;
}
export function victimVisible(nm,p,victim,t=now()) {
  const tools=losTools(nm);
  if(!tools)return true; // offline/unit contexts without a collision world
  if(p.los?.victim===victim&&t-p.los.at<.1)return p.los.ok;
  let ok=attackerSeesMuzzle(tools,nm,p);
  if(ok) {
    ok=poseVisible(tools,p.origin,victim.pos.x,victim.pos.y,victim.pos.z);
    const ring=state(nm).history?.get(victim);
    if(!ok&&ring?.n) {
      // Newest first, at most HISTORY_POSES evenly spread inside the window.
      const step=Math.max(1,Math.ceil(ring.n/HISTORY_POSES));
      for(let k=1;k<=ring.n&&!ok;k+=step) {
        const o=((ring.i-k+HISTORY_SIZE*2)%HISTORY_SIZE)*4;
        if(t-ring.buf[o]>HISTORY_AGE)break;
        ok=poseVisible(tools,p.origin,ring.buf[o+1],ring.buf[o+2],ring.buf[o+3]);
      }
    }
  }
  p.los={victim,at:t,ok};
  return ok;
}
function bossVisible(nm,p) {
  const tools=losTools(nm),shapes=nm.match?.boss?.model?.hitShapes;
  if(!tools)return true;
  if(!attackerSeesMuzzle(tools,nm,p)||!Array.isArray(shapes))return false;
  for(const h of shapes) {
    if(!h?.active||!h.pos||!finite(h.r)||h.r<=0)continue;
    const c=[h.pos.x,h.pos.y,h.pos.z],d=difference(p.origin,c),len=magnitude(d);
    const k=len>1e-6?Math.min(len,h.r*.8)/len:0;
    if(clear(tools,p.origin,c[0]+d[0]*k,c[1]+d[1]*k,c[2]+d[2]*k))return true;
  }
  return false;
}
function crabletVisible(nm,p,crab) {
  const tools=losTools(nm);
  if(!tools)return true; // preserve offline/unit contexts without a collision world
  if(!crab || crab.dead || ![crab.x,crab.y,crab.z].every(finite) ||
    !attackerSeesMuzzle(tools,nm,p))return false;
  // Match the native _segCrabs hit sphere (center y + .35, radius .55).
  // Check the near surface rather than the center, which may be behind cover.
  const c=[crab.x,crab.y+.35,crab.z],d=difference(p.origin,c),len=magnitude(d);
  const k=len>1e-6?Math.min(len,.55*.8)/len:0;
  return clear(tools,p.origin,c[0]+d[0]*k,c[1]+d[1]*k,c[2]+d[2]*k);
}
function rayNear(p,target,margin=5) {
  const dx=target[0]-p.origin[0],dy=target[1]-p.origin[1],dz=target[2]-p.origin[2];
  const along=dx*p.unit[0]+dy*p.unit[1]+dz*p.unit[2];
  if(along< -2 || along>p.reach+8)return false;
  const sideways=Math.sqrt(Math.max(0,(dx*dx+dy*dy+dz*dz)-along*along));
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
// #1665/#1666: one remote claim can never exceed what the attacker's own
// equipped slot deals in a single hit. The receiver derives that from its own
// copy of the attacker's weapon (same build: mixed builds are refused at relay
// admission) and the generated per-sub/per-Special table, not from the claim.
// Boss body claims carry the guest-side weak-point and stunned multipliers.
// A Special without an authored damage field keeps its existing policy.
const CEILING_SLACK = .011; // r2() wire rounding of an exact ceiling value
const MAIN_DEFINITION_SKIP = new Set(['catalogRecord']);
const mainCeilings = new WeakMap();
function mainCeiling(w,table) {
  let ceiling=mainCeilings.get(w);
  if(ceiling===undefined) {
    const r=w.catalogRecord;
    ceiling=Math.max(damageLeafMax(w,1,MAIN_DEFINITION_SKIP),r?.parameters?damageLeafMax(r.parameters,10):0,
      table.main[w.id]||0,(r?.id&&table.main[r.id])||0);
    mainCeilings.set(w,ceiling);
  }
  return ceiling;
}
export function claimCeiling(actor,d,type,table=COMBAT_HIT_CEILINGS) {
  const w=actor?.weapon;
  if(!w||!table)return -1;
  let ceiling;
  if(type==='boss'&&d.c>=0&&d.w==='crab') {
    // Crablets take any slot's damage under one generic marker.
    const special=w.special?table.special[w.special]:0;
    if(special===null)return Infinity;
    ceiling=Math.max(mainCeiling(w,table),table.sub[w.sub]??0,special??0);
  } else if(w.special&&d.w===w.special) {
    ceiling=table.special[d.w];
    if(ceiling===null)return Infinity;
  } else if(d.w==='torpedo-splash'&&w.sub==='torpedo')ceiling=table.sub['torpedo-splash'];
  else if(w.sub&&(d.w===w.sub||(d.w==='bomb'&&EXPLOSIVE_SUBS.has(w.sub))))ceiling=table.sub[w.sub];
  else ceiling=mainCeiling(w,table);
  if(!finite(ceiling))return -1; // unknown slot definition never widens admission
  if(type==='boss'&&d.c<0)ceiling*=(d.weak===1?table.boss.weak:1)*table.boss.stunned;
  return ceiling;
}
function withinCeiling(nm,actor,d,type) {
  return finite(d?.d)&&d.d<=claimCeiling(actor,d,type,nm._combatHitCeilings)+CEILING_SLACK;
}
function withinProofCeiling(nm,actor,d,type,p) {
  // A crablet's wire marker omits its damage source. The broad preflight can
  // only bound it by the largest equipped slot; the matched attack narrows
  // that bound to the slot that actually supplied this proof.
  return type!=='boss'||d.c<0||d.w!=='crab'||
    d.d<=claimCeiling(actor,{c:d.c,w:p.cause},type,nm._combatHitCeilings)+CEILING_SLACK;
}
// Contact authority comes only from a row actually installed by native _tick,
// not peer arrival timestamps (which advance before row validation).
function recordContactSnapshots(nm,from,packet,t) {
  const peer=nm.peers?.get(from),points=peer?.physicsPoints;
  if(packet.u!==undefined && (!points || points.at(-2)!==packet.ts || points.at(-1)!==packet.u))return;
  const receipts=state(nm).contactSnapshots;
  if(!Array.isArray(packet.a))return;
  for(const row of packet.a) {
    const actor=ownerActor(nm,from,row?.[0]),snap=actor?.net?.buf?.at(-1);
    if(!actor || snap?.t!==packet.ts)continue;
    if(actor.weapon?.special){
      const specials=state(nm).specialSnapshots;let special=specials.get(actor);
      if(!special){special={};specials.set(actor,special);}
      const active=!!(snap.f&8192)&&!!(snap.f&1),slot=actor.weapon.special;
      special.owner=from;special.life=snap.life;special.slot=slot;special.active=active;special.at=t;special.ts=packet.ts;
    }
    if(actor.weapon?.kind!=='roller')continue;
    let receipt=receipts.get(actor);
    if(!receipt){receipt={origin:[0,0,0]};receipts.set(actor,receipt);}
    receipt.owner=from;receipt.at=t;receipt.ts=packet.ts;receipt.life=snap.life;receipt.tp=snap.tp;
    receipt.rolling=!!(snap.f&256)&&!!(snap.f&1);
    receipt.origin[0]=snap.x;receipt.origin[1]=snap.y;receipt.origin[2]=snap.z;
  }
}
function contactSnapshotFresh(nm,from,a,t) {
  const receipt=state(nm).contactSnapshots.get(a);
  return !!receipt && receipt.owner===from && receipt.life===Math.max(a?.netLife??0,a?.net?.lastLife??0) &&
    finite(t-receipt.at) && t>=receipt.at && t-receipt.at<=PROOF_AGE;
}
function specialSnapshotFresh(nm,from,a,cause,t) {
  const r=state(nm).specialSnapshots.get(a);
  return !!r && r.owner===from && r.slot===cause && r.active &&
    r.life===Math.max(a?.netLife??0,a?.net?.lastLife??0) &&
    finite(t-r.at) && t>=r.at && t-r.at<=SPECIAL_PROOF_AGE;
}
function requiresEarnedProof(nm,from,d,type,t) {
  const a=ownerActor(nm,from,d.a);
  if(a?.weapon?.special===d.w)return !specialSnapshotFresh(nm,from,a,d.w,t);
  if(a?.weapon?.kind!=='roller' || !(d.w==='roller' || (type==='boss'&&d.c>=0&&d.w==='crab')))return false;
  const receipt=state(nm).contactSnapshots.get(a),target=actualTarget(nm,type,d),here=point(a);
  return !contactSnapshotFresh(nm,from,a,t) || !receipt.rolling || !v3(target) ||
    !v3(receipt.origin) || dist(receipt.origin,target)>4.0 || !v3(here) || dist(here,target)>4.0;
}
function contactProof(nm,from,d,type,t,target) {
  const a=ownerActor(nm,from,d.a),w=a?.weapon;
  if(!a || !equippedCause(a,d,type))return false;
  const here=point(a);
  if(!v3(here)||dist(here,target)>4.0)return false;
  // Roller contact has no projectile or fire-event packet. Require the
  // owner snapshot's currently observed rolling flag and a realistic target.
  if(w.kind!=='roller' || (d.w!=='roller' && !(type==='boss' && d.c>=0 && d.w==='crab')))return false;
  if(type==='boss'&&d.w==='crab'&&
    d.d>mainCeiling(w,nm._combatHitCeilings)+CEILING_SLACK)return false;
  const receipt=state(nm).contactSnapshots.get(a);
  if(!receipt || receipt.owner!==from || !receipt.rolling || receipt.life!==Math.max(a.netLife??0,a.net?.lastLife??0) || !v3(receipt.origin) || dist(receipt.origin,target)>4.0 ||
    !finite(t-receipt.at) || t<receipt.at || t-receipt.at>PROOF_AGE)return false;
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
  if(!recent && (a.specialActive?.id!==d.w || !specialSnapshotFresh(nm,from,a,d.w,t)))return false;
  s.contacts.set(key,{at:t});
  return true;
}
// Keep the existing PvP Special fallback ceilings on every claim route.
// Boss wire multipliers and all other causes retain their existing policy.
function oversizedPvpSpecial(d,type) {
  return type==='pvp' && ((d?.w==='storm' && d.d>160) ||
    (d?.w==='krakenRoyale' && d.d>120));
}
function bossBodyBlocked(nm,d) {
  const boss=nm.match?.boss;
  return d.c<0&&(boss?.invuln||boss?.visible===false);
}
function take(nm,from,d,type,t,sprinklerScope=null,allowPoseFallback=true) {
  if(oversizedPvpSpecial(d,type))return false;
  const actor=ownerActor(nm,from,d.a),target=actualTarget(nm,type,d);
  if(!actor || !v3(target) || !equippedCause(actor,d,type) || !withinCeiling(nm,actor,d,type))return false;
  if(type==='pvp') {
    const victim=nm.byNid?.get(d.v);
    if(!victim || victim.remote || !victim.alive || victim.team===actor.team)return false;
  } else {
    if(!nm.isHost || !nm.match?.boss?.sim || !nm.match?.state ||
      nm.match.state!=='playing'||nm.match.boss.dead)return false;
    // Native Boss.remoteHit blocks body damage during these phases. Reject
    // before spending a proof or nonce. Crablets are independent. A blocked
    // body claim is also excluded from the deferred queue below.
    if(bossBodyBlocked(nm,d))return false;
    if(d.weak===1 && d.c>=0)return false;
    // Normal boss hits are strengthened by weak/stunned multipliers, but a
    // single network claim can never supply the old arbitrary 2000 HP.
    if(d.d>800)return false;
  }
  if(type==='pvp'&&d.w==='torpedo-splash'&&consumeLimitedContact(nm,from,d,t))return true;
  if(type==='pvp'&&d.w==='sprinkler')return consumeReceiverSprinklerContact(nm,from,d,t,sprinklerScope);
  // combatAdmission is take's sole entry and already prunes at this same t.
  const s=state(nm);
  const shots=s.proofs.get(from)||[];
  for(const p of shots) {
    if(p.actor!==d.a || p.uses>=p.maxUses)continue;
    // An enrolled native birth authorizes terrain damage only via its contact receipts.
    // Keep unsupported legacy births separate, including after all native contacts retire.
    if(type==='pvp'&&d.w==='torpedo-splash'&&p.nativeTorpedoContact)continue;
    if(p.kind==='main'&& ![weaponId(actor),actor.weapon.id,actor.weapon.kind,'shot','slosh','blast','drop','roller','crab'].includes(d.w))continue;
    if(p.kind==='sub' && d.w!==p.cause && d.w!=='crab' &&
      !(d.w==='bomb'&&EXPLOSIVE_SUBS.has(p.cause)) &&
      !(d.w==='torpedo-splash'&&p.cause==='torpedo'))continue;
    if(p.kind==='special' && d.w!==p.cause)continue;
    if(!withinProofCeiling(nm,actor,d,type,p))continue;
    if(!rayNear(p,target,type==='boss'?6:5.5))continue;
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
      if(p.kind==='main'&&directFire(actor)) {
        // A straight-fire round or Charger beam lands on one victim once.
        const victim=nm.byNid.get(d.v);
        if(p.victims?.has(victim)||!victimVisible(nm,p,victim,t))continue;
        (p.victims||=new Set()).add(victim);
      }
    } else {
      if(d.weak===1 && !weakPointOk(nm,p))continue;
      if(d.c<0&&p.kind==='main'&&directFire(actor)&&!bossVisible(nm,p))continue;
      if(d.c>=0&&p.kind==='main'&&directFire(actor)&&!crabletVisible(nm,p,nm.match.boss.crabs.get(d.c)))continue;
      if(p.kind==='main'&&directFire(actor)) {
        // A native straight round/beam connects with each Boss body or
        // crablet once. A fresh transport nonce is not another collision.
        // Keep separate targets for penetrating beams and existing budgets.
        const target=d.c<0?nm.match.boss:nm.match.boss.crabs.get(d.c);
        if(p.bossTargets?.has(target))continue;
        (p.bossTargets||=new Set()).add(target);
      }
    }
    p.uses++;
    return true;
  }
  if(!allowPoseFallback)return false;
  if(contactProof(nm,from,d,type,t,target))return true;
  if(specialProof(nm,from,d,type,t,target))return true;
  return false;
}
function enqueue(nm,from,d,type,t) {
  if(oversizedPvpSpecial(d,type))return;
  if(type==='boss'&&bossBodyBlocked(nm,d))return;
  if(!matchIdOk(nm,d) || !safe(d.a) || !ownerActor(nm,from,d.a) ||
    !safe(d[type==='pvp'?'h':'q']) || d[type==='pvp'?'h':'q']<1 ||
    !finite(d.d) || d.d<0 || (type==='boss'&&d.d===0) || d.d>2000 ||
    typeof d.w!=='string' || d.w.length>64 || !equippedCause(nm.byNid.get(d.a),d,type) ||
    !withinCeiling(nm,nm.byNid.get(d.a),d,type))return;
  if(d.bg!==undefined && (!Array.isArray(d.bg) || d.bg.length!==7 ||
    !d.bg.every(finite)))return;
  if(d.kb!==undefined && (!d.kb || typeof d.kb!=='object' ||
    JSON.stringify(d.kb).length>300))return;
  const s=state(nm), arr=s.pending.get(from)||[];
  if(arr.some(x=>x.type===type && x.d[type==='pvp'?'h':'q']===d[type==='pvp'?'h':'q']))return;
  if(arr.length+(s.flushing?.get(from)?.length||0)>=MAX_PENDING)return;
  // Never retain arbitrary attacker-supplied JSON baggage while a proof is
  // pending. Bound each claim independently of the relay's frame allowance.
  const claim=type==='pvp' ? {k:'hit',m:d.m,a:d.a,v:d.v,l:d.l,h:d.h,seq:d.seq,
    d:d.d,w:d.w,g:d.g,kb:d.kb,bg:d.bg}
    : {k:'bhit',m:d.m,a:d.a,d:d.d,weak:d.weak,w:d.w,c:d.c,l:d.l,q:d.q};
  // Receiver-only queue metadata: packet fields cannot grant fallback authority.
  arr.push({type,d:claim,at:t,proofOnly:requiresEarnedProof(nm,from,d,type,t),sprinklerScope:d.w==='sprinkler'?receiverSprinklerScope(nm,from,d.a):null});
  s.pending.set(from,arr);
}
export function combatAdmission(nm,from,d,type,t=now(),sprinklerScope=null,allowPoseFallback=true) {
  if(!nm || nm._disposed || !d || (type!=='boss'&&type!=='pvp'))return false;
  if(type==='boss'&&(!finite(d.d)||d.d<=0))return false;
  const s=state(nm);prune(s,t);
  const a=ownerActor(nm,from,d.a);
  if(!a || !matchIdOk(nm,d) || !safe(d[type==='pvp'?'h':'q']) || d[type==='pvp'?'h':'q']<1)return false;
  return take(nm,from,d,type,t,sprinklerScope,allowPoseFallback);
}
function flush(nm,from,t,oldHit,oldBoss,receiptAllowed,bossReceiptAllowed) {
  const s=state(nm);
  // Admission prunes pending arrays in place. Iterate a detached batch so
  // pruning and synchronous native callbacks cannot skip later live claims.
  // Reentrant flush of this sender waits for the active batch to settle.
  const flushing=s.flushing || (s.flushing=new Map());
  if(flushing.has(from))return;
  prune(s,t);
  const items=s.pending.get(from);
  if(!items?.length)return;
  s.pending.delete(from);
  flushing.set(from,items);
  const peer=nm.peers?.get(from);
  let cursor=0;
  const still=[];
  try {
  for(;cursor<items.length;cursor++) {
    const item=items[cursor];
    if(t-item.at>PENDING_AGE)continue;
    // A fresh direct retry may already have delivered this queued ID. Retire
    // it before consuming another proof; native exact-ID history is authoritative.
    if(item.type==='pvp' && nm.peers?.get(from)?.hitSequences?.has(item.d.h))continue;
    if(item.type==='boss' && item.d.q<=(nm.peers?.get(from)?.lastBossHit??0))continue;
    if(item.type==='boss'&&bossBodyBlocked(nm,item.d))continue;
    // Deferred claims can outlive their victim/attacker life or a replay-window
    // advance. Recheck the native read-only policy before consuming any proof.
    const allowed=item.type==='pvp'?receiptAllowed:bossReceiptAllowed;
    if(typeof allowed!=='function'||!allowed.call(nm,item.d,from))continue;
    if(!combatAdmission(nm,from,item.d,item.type,t,item.sprinklerScope,!item.proofOnly)) {still.push(item);continue;}
    if(item.type==='pvp')oldHit.call(nm,item.d,from);
    else if(oldBoss?.call(nm,from,item.d))nm.match.boss.remoteHit(item.d);
  }
  } finally {
    flushing.delete(from);
    // Newly enqueued claims belong after the older FIFO batch. Keep their
    // identities and do not overwrite a callback's peer/dispose reset.
    if(nm._combatProvenance===s && !nm._disposed && (!peer || nm.peers?.get(from)===peer)) {
      const added=s.pending.get(from)||[];
      const combined=still.concat(items.slice(cursor),added);
      if(combined.length)s.pending.set(from,combined);else s.pending.delete(from);
      prune(s,t);
    }
  }
}
export function installCombatProvenance(NetMatch,context={}) {
  const marker=Symbol.for('inkwave.combat-provenance.v1'),P=NetMatch.prototype;
  if(P[marker])return;
  Object.defineProperty(P,marker,{value:true});
  const oldTick=P._tick,oldHit=P._hit,oldMessage=P.onMessage;
  const oldBoss=P._acceptBossHit,oldLeave=P.onLeave,oldDispose=P.dispose;
  // One callback per installed prototype, not per owner packet.
  const notifySprinkler=function(from){flush(this,from,now(),oldHit,oldBoss,context.hitReceiptAllowed,context.bossReceiptAllowed);};
  const commitSubBirth=function(receipt,event,bomb) {
    const t=now();
    const accepted=record(this,receipt.from,{e:[event],ts:receipt.packetTime,a:[[receipt.nid,...receipt.pose]]},t,receipt);
    if(accepted&&receipt.subId==='torpedo'&&registerLimitedTorpedo(this,bomb,receipt,event,context.G,notifySprinkler))accepted.nativeTorpedoContact=true;
    if(accepted&&receipt.sourceKind==='native-sprinkler')registerReceiverSprinkler(this,bomb,receipt,context.G,notifySprinkler,PENDING_AGE,MAX_PENDING);
    // Hits may precede delayed FIFO playback; retry only when birth commits.
    flush(this,receipt.from,t,oldHit,oldBoss,context.hitReceiptAllowed,context.bossReceiptAllowed);
  };
  P._tick=function(from,d) {
    bindSubBirthCommit(this,commitSubBirth);
    const observed=observeOwnerTick(this,from,d,()=>oldTick.call(this,from,d));
    const receipt=observed.receipt;
    if(receipt && receipt.ownerSession===this.s && receipt.ownerMatch===this.match &&
      receipt.ownerMatchId===this.cfg?.id && !this._disposed) {
      const t=now();
      sampleLocalHistory(this,t);
      recordContactSnapshots(this,from,receipt,t);
      record(this,from,{...receipt,e:receipt.nativeEvents},t,null,receipt.poses);
      flush(this,from,t,oldHit,oldBoss,context.hitReceiptAllowed,context.bossReceiptAllowed);
    }
    return observed.result;
  };
  P._hit=function(d,from) {
    // Locally delivered pending receipts after host handoff are not remote
    // sender claims. Preserve their existing authenticated owner path.
    if(from===this.myId)return oldHit.call(this,d,from);
    // The exact compiled native payload policy must reject invalid claims
    // before proof consumption or pending hit-ID reservation. Missing context
    // is fail-closed, never permission to bypass that policy.
    if(typeof context.hitPayloadAllowed!=='function' || !context.hitPayloadAllowed(d))return;
    if(typeof context.hitReceiptAllowed!=='function'||!context.hitReceiptAllowed.call(this,d,from))return;
    if(d.w==='sprinkler'&&d.d!==SPRINKLER.dropletDamage)return;
    const t=now();
    sampleLocalHistory(this,t);
    // Only incoming remote owner claims are deferred; internally retried
    // local receipts still require a previously accepted attack proof.
    if(combatAdmission(this,from,d,'pvp',t))return oldHit.call(this,d,from);
    enqueue(this,from,d,'pvp',t);
  };
  P.onMessage=function(from,d) {
    if(d?.k==='bhit' && this.isHost) {
      if(typeof context.bossReceiptAllowed!=='function'||!context.bossReceiptAllowed.call(this,d,from))return;
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
    if(s?.contactSnapshots)for(const [actor,r] of s.contactSnapshots)if(r.owner===id)s.contactSnapshots.delete(actor);
    if(s?.specialSnapshots)for(const [actor,r] of s.specialSnapshots)if(r.owner===id)s.specialSnapshots.delete(actor);
    if(changed){s?.proofs.clear();s?.pending.clear();s?.contacts.clear();s?.contactSnapshots.clear();s?.specialSnapshots.clear();s?.history?.clear();}
    return oldLeave.call(this,id,changed);
  };
  P.dispose=function(...args) {
    closeSubBirthCommit(this);
    const s=this._combatProvenance;
    s?.proofs.clear();s?.pending.clear();s?.contacts.clear();s?.contactSnapshots.clear();s?.specialSnapshots.clear();s?.history?.clear();
    this._combatProvenance=null;
    return oldDispose.apply(this,args);
  };
  // No per-frame allocations: only ordered 20Hz owner ticks and sparse hits
  // touch this gate; physics is optional for offline/unit-test contexts.
  P._combatProvenancePhysics=null;
  P._combatProvenanceTHREE=context.THREE||null;
  P._combatHitCeilings=context.hitCeilings||COMBAT_HIT_CEILINGS;
  if(context.G) {
    const oldBind=P.bind;
    P.bind=function(...args){this._combatProvenancePhysics=context.G.physics;return oldBind.apply(this,args);};
  }
}
