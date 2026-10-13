import { BIG_BUBBLER_RAW, validateBigBubblerDeploy } from '../splatoon3/runtime/kit-big-bubbler.mjs';
import { cataloguePayload } from '../splatoon3/runtime/catalogue-payload.mjs';
import { ALL_SUB_SPECS } from '../splatoon3/runtime/all-subs.mjs';
import { SLOSHER_IMPACT_TAG, slosherPaintMetaValid, slosherPaintBirth, slosherImpactMatches } from './slosher-paint-admission.mjs';
import { KIT_SUBS, resolveSubAtCharge } from '../splatoon3/runtime/kit-subs.mjs';
import { catalogPaintRadiusLimit } from './catalog-paint-admission.mjs';
export const KIT_BIRTH_TAG = 'inkwave-kit-birth-v1';
export const KIT_PAINT_TAG = 'inkwave-kit-core-v1';
export const BUBBLER_PAINT_TAG='inkwave-bubbler-core-v1';
const bubblerBirth=e=>e?.[1]==='ev'&&e[2]==='kit:bubbler:deploy';
export const SUB_PAINT_TAG = 'inkwave-sub-core-v1';
const isCatalogueSub = id => ['burst','fizzy','inkMine'].includes(id);
const catalogueBirth = e => e?.[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn';
const states = new WeakMap();
const MAX_BIRTHS = 128, MAX_PENDING = 256, WAIT_SECONDS = 2;
const safe = n => Number.isSafeInteger(n) && n >= 0;
const epoch = nm => typeof nm.cfg?.id === 'string' ? nm.cfg.id : '';
const life = a => a?.remote ? a.net?.lastLife ?? a.netLife ?? 0 : a?.netLife ?? 0;
const key = (from, seq) => JSON.stringify([from,seq]);
const isKit = id => id === 'suction' || id === 'curling';
const clock = () => performance.now()/1000;
function state(nm) {
 let s=states.get(nm);
 if(!s || s.epoch!==epoch(nm)){s={epoch:epoch(nm),births:new Map(),pending:new Map(),expired:new Map(),retiredBirths:new Map(),retiredProjectiles:new Map(),flushing:false};states.set(nm,s);}
 for(const [k,b] of s.births){const a=nm.byNid.get(b.nid);if(!a || a.owner!==b.owner || !nm.s._members?.has(b.owner))s.births.delete(k);}
 for(const from of s.pending.keys())if(!nm.s._members?.has(from))s.pending.delete(from);
 return s;
}
function identify(e) {
 if(!Array.isArray(e))return false;
 if(e._netSeq===undefined && e.length>=3){const seq=e.at(-1),tick=e.at(-2);if(safe(seq)&&seq>0&&safe(tick)){e._netSeq=seq;e._netTick=tick;}}
 return safe(e._netSeq)&&e._netSeq>0&&safe(e._netTick);
}
function paintMeta(e){return Array.isArray(e?.[15]) ? e[15] : null;}
function validMeta(meta){return Array.isArray(meta)&&meta.length===6&&meta[0]===SUB_PAINT_TAG&&typeof meta[1]==='string'&&meta.slice(2).every(safe)&&meta[4]>0&&meta[5]<3||slosherPaintMetaValid(meta)||Array.isArray(meta)&&meta.length===5&&[KIT_PAINT_TAG,BUBBLER_PAINT_TAG].includes(meta[0])&&typeof meta[1]==='string'&&safe(meta[2])&&safe(meta[3])&&safe(meta[4])&&meta[4]>0;}
export function kitBombBirthMetadata(nm,b){
 const a=b?.owner,id=b?.s3Resolved?.spec?.id;
 return a && !a.remote && safe(a.nid)&&safe(life(a))&&isKit(id) ? [KIT_BIRTH_TAG,epoch(nm),life(a)] : null;
}
export function recordKitBombBirth(nm,b,event){
 const meta=event?.[13];
 if(Array.isArray(meta)&&meta[0]===KIT_BIRTH_TAG&&identify(event))b.s3PaintBirth=[KIT_PAINT_TAG,epoch(nm),b.owner.nid,meta[2],event._netSeq];
}
export function recordCatalogueSubBirth(nm,object,event){
 if(!object||object.ghost||!object.owner||object.owner.remote||!safe(object.owner.nid)||!safe(object.sourceLife)
   ||!isCatalogueSub(object.subId)||!catalogueBirth(event)||!identify(event))return;
 object.s3PaintBirth=[SUB_PAINT_TAG,epoch(nm),object.owner.nid,object.sourceLife,event._netSeq];
}
export function recordBubblerPaintBirth(nm,dome,event){
 if(!dome||dome.remote||!dome.owner||dome.owner.remote||!bubblerBirth(event)||!identify(event))return;
 dome.s3PaintBirth=[BUBBLER_PAINT_TAG,epoch(nm),dome.owner.nid,life(dome.owner),event._netSeq];
}
function retireProjectile(s,b){if(b?.kind==='slosher')s.retiredProjectiles.set(b.owner,Math.max(s.retiredProjectiles.get(b.owner)||0,b.projectileId));}
function register(nm,from,e,s){
 if(!identify(e)||!(['b','p'].includes(e[1])||catalogueBirth(e)||bubblerBirth(e)))return;
 const a=nm.byNid.get(bubblerBirth(e)?e[3]?.actor?.n:catalogueBirth(e)?e[3]:e[2]);
 if(!a?.remote||a.owner!==from||!nm.s._members?.has(from)||!Number.isFinite(e[0])||e[0]<0)return;
 let record;
 if(bubblerBirth(e)){
  const v=e[3];
  if(!validateBigBubblerDeploy(v).ok||v.t!==0||a.weapon?.special!=='bubbler'||v.team!==a.team||v.owner?.n!==a.nid
    ||v.paintEpoch!==epoch(nm)||v.paintLife!==life(a)||!safe(v.serial)||v.serial===0
    ||v.domeId!==`${a.team}:n${a.nid}:${v.serial}`||!Array.isArray(v.pos)||v.pos.length!==3||!v.pos.every(Number.isFinite)
    ||!safe(v.paintSeed)||v.paintSeed>0xffffffff)return;
  record={kind:'bubbler',life:v.paintLife,seed:v.paintSeed,centre:[v.pos[0],v.pos[1]+BIG_BUBBLER_RAW.paintRadius*.35,v.pos[2]],radius:BIG_BUBBLER_RAW.paintRadius};
 }else if(catalogueBirth(e)){
  const v=cataloguePayload(e[5]);if(!v)return;
  const id=v.subId,spec=ALL_SUB_SPECS[id];
  if(![6,8].includes(e.length)||!isCatalogueSub(id)||a.weapon?.sub!==id||!safe(e[4])||life(a)!==e[4]
    ||v.v!==1||!safe(v.eventSeq)||v.eventSeq===0||v.life!==e[4]||v.sourceLife!==e[4]||!safe(v.seq)||v.seq===0||!safe(v.seed)||v.seed>0xffffffff
    ||![v.x,v.y,v.z,v.vx,v.vy,v.vz,v.charge,v.hold].every(Number.isFinite)
    ||![v.x,v.y,v.z,v.vx,v.vy,v.vz].every(n=>Number.isFinite(Math.fround(n)))
    ||v.charge<0||v.charge>1||v.hold<0)return;
  const count=id==='fizzy'?(v.hold>=(spec.chargeFrames[0]+spec.chargeFrames[1])/60?3:v.hold>=spec.chargeFrames[0]/60?2:1):1;
  record={kind:'sub',life:e[4],subId:id,seed:v.seed,origin:[v.x,v.y,v.z],velocity:[v.vx,v.vy,v.vz],
    flightSeconds:id==='fizzy'?spec.burstWaitFrames[0]/60+1/60:2.2+1/60,gravity:spec.gravity,
    coreRadii:id==='fizzy'?spec.bursts.slice(0,count).map(b=>b.paintRadius):[spec.paintRadius],
    usedCores:Array(count).fill(null)};
 }else if(e[1]==='p'){
  if(e[3]!=='slosh'||e[4]!=='slosher'||a.weapon?.id!=='slosher')return;
  const birth=slosherPaintBirth(e);
  if(!birth||birth.epoch!==epoch(nm)||birth.life!==life(a)||a.weapon?.id!=='slosher'||birth.projectileId<=Math.max(s.retiredProjectiles.get(from)||0,nm.peers.get(from)?._lastProjectileId||0))return;
  for(const b of s.births.values())if(b.owner===from&&b.kind==='slosher'&&b.projectileId===birth.projectileId)return;
  record={...birth,kind:'slosher'};
 }else{
  const meta=e[13],id=e[11],charge=e[12];
  if(e[3]!=='bomb'||!Array.isArray(meta)||meta.length!==3||meta[0]!==KIT_BIRTH_TAG||meta[1]!==epoch(nm)||!safe(meta[2])
   ||life(a)!==meta[2]||!isKit(id)||a.weapon?.sub!==id
   ||!Number.isFinite(charge)||charge<0||charge>1||id==='suction'&&charge!==0
   ||!e.slice(4,10).every(Number.isFinite))return;
  record={kind:'kit',life:meta[2],radius:resolveSubAtCharge(KIT_SUBS[id],charge).paintRadius};
 }
 const k=key(from,e._netSeq),old=s.births.get(k);
 if(old)return; // Never replace a birth/capability, including its used marker.
 if(e._netSeq <= Math.max(nm.peers.get(from)?._lastEventSeq||0,s.expired.get(from)||0,s.retiredBirths.get(key(from,record.kind))||0))return;
 let count=0;for(const birth of s.births.values())if(birth.owner===from&&birth.kind===record.kind)count++;
 if(count>=MAX_BIRTHS)for(const [oldKey,birth] of s.births){if(birth.owner===from&&birth.kind===record.kind&&birth.used!==null){retireProjectile(s,birth);s.births.delete(oldKey);count--;}if(count<MAX_BIRTHS)break;}
 // A native bomb can retire in water without ever producing a core. Such
 // unspent records must not permanently close this owner's bounded window.
 // Evict only its oldest sequence; other owners and younger flights survive.
 if(count>=MAX_BIRTHS){
  let oldestKey=null,oldestSeq=Infinity;
  for(const [oldKey,birth] of s.births)if(birth.owner===from&&birth.kind===record.kind&&birth.seq<oldestSeq){oldestKey=oldKey;oldestSeq=birth.seq;}
  if(oldestKey===null)return;
  if(e._netSeq<=oldestSeq){retireProjectile(s,{...record,owner:from});s.retiredBirths.set(key(from,record.kind),Math.max(s.retiredBirths.get(key(from,record.kind))||0,e._netSeq));return;}
  retireProjectile(s,s.births.get(oldestKey));s.births.delete(oldestKey);
  // Preparation can see a whole envelope before playback advances lastSeq.
  // Prevent that same evicted birth from re-registering during playback.
  s.retiredBirths.set(key(from,record.kind),Math.max(s.retiredBirths.get(key(from,record.kind))||0,oldestSeq));
 }
 if(record.kind==='slosher'&&record.projectileId<=(s.retiredProjectiles.get(from)||0))return;
 s.births.set(k,{...record,owner:from,nid:a.nid,seq:e._netSeq,tick:e._netTick,team:a.team,used:null});
}
// Conservative swept-flight envelope, including a fixed-step boundary and
// contacted actor height. It rejects remote teleport cores without pretending
// to reproduce dynamic actor contacts or authoritative collision simulation.
function subCoreReachable(b,e,index){
 const t=b.flightSeconds, hop=b.subId==='fizzy'?index*(.62+5.5*2/60):0;
 const [x,y,z]=b.origin,[vx,vy,vz]=b.velocity;
 const pad=.1+hop;
 if(e[2]<x+Math.min(0,vx*t)-pad||e[2]>x+Math.max(0,vx*t)+pad
  ||e[4]<z+Math.min(0,vz*t)-pad||e[4]>z+Math.max(0,vz*t)+pad)return false;
 const vertical=2+index*(3.4*2/60);
 return e[3]>=y+Math.min(0,vy*t)-.5*b.gravity*t*(t+1/60)-vertical
  &&e[3]<=y+Math.max(0,vy*t)+vertical;
}
function receipt(nm,from,e,s){
 const meta=paintMeta(e);if(!validMeta(meta)||!identify(e)||meta[1]!==epoch(nm))return null;
 const a=nm.byNid.get(meta[2]);
 if(!a?.remote||a.owner!==from||!nm.s._members?.has(from)
  ||e._netSeq<=meta[4])return null;
 const b=s.births.get(key(from,meta[4]));
 if(!b||b.nid!==meta[2]||b.life!==meta[3]||b.team!==e[6]||e._netTick<b.tick
  ||b.used!==null&&b.used!==e._netSeq)return null;
 if(b.kind==='bubbler'){
  if(meta[0]!==BUBBLER_PAINT_TAG||e[5]!==b.radius||e[7]!==b.seed/0x100000000
   ||e.slice(2,5).some((v,i)=>Math.abs(v-b.centre[i])>.011)
   ||(e[8]!==0&&e[8]!==undefined)||e[9]||e[10]||e[11]||e[12]||(e[13]!==-1&&e[13]!==undefined))return null;
  return b;
 }
 if(b.kind==='sub'){
  const index=meta[5];
  if(meta[0]!==SUB_PAINT_TAG||index>=b.coreRadii.length||e[5]!==b.coreRadii[index]||!subCoreReachable(b,e,index)
    ||b.usedCores[index]!==null&&b.usedCores[index]!==e._netSeq
    ||e[7]!==((b.seed^((index+1)*0x9e3779b9))>>>0)/0x100000000
    ||(e[8]!==0&&e[8]!==undefined)||e[9]||e[10]||e[11]||e[12]||(e[13]!==-1&&e[13]!==undefined))return null;
  return b;
 }
 if(b.kind==='slosher')return meta[0]===SLOSHER_IMPACT_TAG&&slosherImpactMatches(b,e)?b:null;
 if(meta[0]!==KIT_PAINT_TAG)return null;
 if(e[5]!==b.radius || (e[8]!==0&&e[8]!==undefined) || e[9]||e[10]||e[11]||e[12]
  ||(e[13]!==-1&&e[13]!==undefined))return null;
 return b;
}
export function kitPaintRadiusAllowed(nm,from,e,cap){
 if(paintMeta(e))return !!receipt(nm,from,e,state(nm));
 // Unknown metadata cannot gain the wider core permit.
 return Math.fround(e[5])<=Math.fround(Math.max(cap,catalogPaintRadiusLimit(nm,from)));
}
export function consumeKitPaint(nm,from,e){
 if(!paintMeta(e))return true;
 const b=receipt(nm,from,e,state(nm));if(!b)return false;
 if(b.kind==='sub'){b.usedCores[e[15][5]]=e._netSeq;if(b.usedCores.every(n=>n!==null))b.used=e._netSeq;}
 else b.used=e._netSeq;return true;
}
function couldWait(nm,from,e,s){
 const m=paintMeta(e);if(!validMeta(m)||m[1]!==epoch(nm)||!identify(e)||e._netSeq<=m[4]
  ||!e.slice(2,8).every(Number.isFinite)||!Number.isFinite(e[0])||e[0]<0||e[5]<=0||e[5]>5
  ||(e[8]!==0&&e[8]!==undefined)||(m[0]===KIT_PAINT_TAG&&(e[9]||e[10]||e[11]||e[12]))||(e[13]!==-1&&e[13]!==undefined))return false;
 const a=nm.byNid.get(m[2]);
 return a?.remote&&a.owner===from&&life(a)===m[3]&&a.team===e[6]&&(m[0]===SLOSHER_IMPACT_TAG?a.weapon?.id==='slosher':m[0]===SUB_PAINT_TAG?isCatalogueSub(a.weapon?.sub):m[0]===BUBBLER_PAINT_TAG?a.weapon?.special==='bubbler':isKit(a.weapon?.sub))
  &&nm.s._members?.has(from)&&m[4]>Math.max(nm.peers.get(from)?._lastEventSeq||0,s.expired.get(from)||0,s.retiredBirths.get(key(from,m[0]===SLOSHER_IMPACT_TAG?'slosher':m[0]===SUB_PAINT_TAG?'sub':m[0]===BUBBLER_PAINT_TAG?'bubbler':'kit'))||0)&&!s.births.has(key(from,m[4]));
}
// Same-packet reordering is normalized before admission. If a core arrives before
// its birth in separate accepted packets, hold the remaining sender events too:
// later satellites must not reserve a higher sequence and discard the core.
// Existing reliable-WebSocket old-timestamp rejection remains authoritative.
export function prepareKitPaintEvents(nm,from,d){
 const rows=Array.isArray(d.e)?d.e:[];if(d.r!==2)return rows;
 const s=state(nm),now=clock();let old=s.pending.get(from);
 if(old&&now-old.since>=WAIT_SECONDS){
  const held=[];
  for(const e of old.rows){
   if(e[1]==='s'&&couldWait(nm,from,e,s))s.expired.set(from,Math.max(s.expired.get(from)||0,e[15][4]));
   else held.push(e);
  }
  old={since:now,rows:held};s.pending.delete(from);
 }
 for(const e of rows){
  if(Number.isFinite(d.ts)&&e?.[0]>d.ts)continue;
  if(Number.isSafeInteger(d.u)&&identify(e)&&e._netTick>d.u)continue;
  register(nm,from,e,s);
 }
 const all=[...(old?.rows||[]),...rows],seen=new Set();
 const ordered=all.filter(e=>{if(!Array.isArray(e))return false;if(!identify(e))return true;if(seen.has(e._netSeq))return false;seen.add(e._netSeq);return true;})
  .sort((a,b)=>(a._netSeq??Infinity)-(b._netSeq??Infinity));
 const ready=[];s.pending.delete(from);
 for(let i=0;i<ordered.length;i++){
  const e=ordered[i];
  if(e?.[1]==='s'&&couldWait(nm,from,e,s)){
   if(old&&now-old.since>=WAIT_SECONDS)continue; // missing proof expires closed, not a wider cap
   const waiting=ordered.slice(i);
   if(waiting.length<=MAX_PENDING&&!d._eventOverBudget){s.pending.set(from,{since:old?.since??now,rows:waiting});return ready;}
   // Capacity or over-budget envelope closes only the unresolved claim; unrelated later rows
   // continue through their normal admission instead of being silently dropped.
   continue;
  }
  ready.push(e);
 }
 return ready;
}
export function kitPaintPlayback(nm,from,e){
 const s=state(nm);if(s.flushing)return true;
 const birth=bubblerBirth(e)||catalogueBirth(e)||e[1]==='b'||e[1]==='p'&&e[3]==='slosh'&&e[4]==='slosher';
 if(!birth&&!paintMeta(e)&&!s.pending.has(from))return true;
 const ready=prepareKitPaintEvents(nm,from,{r:2,e:[e]});
 if(ready.length===1&&ready[0]===e)return true;
 s.flushing=true;try{for(const row of ready)nm._play(from,row);}finally{s.flushing=false;}
 return false;
}

// Transport is ordered WebSocket, but retain an explicitly awaited birth even
// if its envelope is delivered after a newer core envelope by a replay/relay.
// This cannot replay an old action: only the exact pending reference, current
// owner/life, and a still-unconsumed sender sequence can acquire a capability.
export function acceptPendingKitBirths(nm,from,d){
 const s=state(nm),pending=s.pending.get(from),peer=nm.peers.get(from);
 if(!pending||d.r!==2||!Array.isArray(d.e)||!Number.isFinite(d.ts)||!(d.ts<=peer?.lastTs))return;
 if(clock()-pending.since>=WAIT_SECONDS){
  nm._queueKitRecoveredEvents(from,prepareKitPaintEvents(nm,from,{r:2,e:[]}));
  return;
 }
 const wanted=new Set(pending.rows.filter(e=>e[1]==='s'&&validMeta(paintMeta(e))).map(e=>e[15][4]));
 const births=d.e.filter(e=>(['b','p'].includes(e?.[1])||catalogueBirth(e)||bubblerBirth(e))&&identify(e)&&wanted.has(e._netSeq));
 if(!births.length)return;
 const ready=prepareKitPaintEvents(nm,from,{r:2,e:births,ts:d.ts,u:d.u});
 nm._queueKitRecoveredEvents(from,ready);
}

// A projectile terminal event without a terrain stamp (actor hit, water, expiry)
// closes its unused permit in ordinary replay order, never during pre-registration.
export function retireSlosherPaintProjectile(nm,from,e){
 if(e?.[1]!=='pe'||!safe(e[2])||!safe(e[3])||!identify(e))return;
 const a=nm.byNid.get(e[2]);if(!a?.remote||a.owner!==from||!nm.s._members?.has(from))return;
 const s=state(nm);
 for(const b of s.births.values())if(b.kind==='slosher'&&b.owner===from&&b.nid===e[2]&&b.projectileId===e[3]
   &&e._netSeq>b.seq&&e._netTick>=b.tick&&b.used===null)b.used=-1;
}
