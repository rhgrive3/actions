import { KIT_SUBS, resolveSubAtCharge } from '../splatoon3/runtime/kit-subs.mjs';
export const KIT_BIRTH_TAG = 'inkwave-kit-birth-v1';
export const KIT_PAINT_TAG = 'inkwave-kit-core-v1';
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
 if(!s || s.epoch!==epoch(nm)){s={epoch:epoch(nm),births:new Map(),pending:new Map(),expired:new Map(),flushing:false};states.set(nm,s);}
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
function validMeta(meta){return Array.isArray(meta)&&meta.length===5&&meta[0]===KIT_PAINT_TAG&&typeof meta[1]==='string'&&safe(meta[2])&&safe(meta[3])&&safe(meta[4])&&meta[4]>0;}
export function kitBombBirthMetadata(nm,b){
 const a=b?.owner,id=b?.s3Resolved?.spec?.id;
 return a && !a.remote && safe(a.nid)&&safe(life(a))&&isKit(id) ? [KIT_BIRTH_TAG,epoch(nm),life(a)] : null;
}
export function recordKitBombBirth(nm,b,event){
 const meta=event?.[13];
 if(Array.isArray(meta)&&meta[0]===KIT_BIRTH_TAG&&identify(event))b.s3PaintBirth=[KIT_PAINT_TAG,epoch(nm),b.owner.nid,meta[2],event._netSeq];
}
function register(nm,from,e,s){
 if(e?.[1]!=='b'||!identify(e)||e[3]!=='bomb')return;
 const meta=e[13],a=nm.byNid.get(e[2]),id=e[11],charge=e[12];
 if(!Array.isArray(meta)||meta.length!==3||meta[0]!==KIT_BIRTH_TAG||meta[1]!==epoch(nm)||!safe(meta[2])
  ||!a?.remote||a.owner!==from||!nm.s._members?.has(from)||life(a)!==meta[2]||!isKit(id)||a.weapon?.sub!==id
  ||!Number.isFinite(charge)||charge<0||charge>1||id==='suction'&&charge!==0
  ||!e.slice(4,10).every(Number.isFinite)||!Number.isFinite(e[0])||e[0]<0)return;
 const k=key(from,e._netSeq),old=s.births.get(k);
 if(old)return; // Never replace a birth/capability, including its used marker.
 if(e._netSeq <= Math.max(nm.peers.get(from)?._lastEventSeq||0,s.expired.get(from)||0))return;
 let count=0;for(const birth of s.births.values())if(birth.owner===from)count++;
 if(count>=MAX_BIRTHS)for(const [oldKey,birth] of s.births){if(birth.owner===from&&birth.used!==null){s.births.delete(oldKey);count--;}if(count<MAX_BIRTHS)break;}
 // A native bomb can retire in water without ever producing a core. Such
 // unspent records must not permanently close this owner's bounded window.
 // Evict only its oldest sequence; other owners and younger flights survive.
 if(count>=MAX_BIRTHS){
  let oldestKey=null,oldestSeq=Infinity;
  for(const [oldKey,birth] of s.births)if(birth.owner===from&&birth.seq<oldestSeq){oldestKey=oldKey;oldestSeq=birth.seq;}
  if(oldestKey===null)return;
  if(e._netSeq<=oldestSeq){s.expired.set(from,Math.max(s.expired.get(from)||0,e._netSeq));return;}
  s.births.delete(oldestKey);
  // Preparation can see a whole envelope before playback advances lastSeq.
  // Prevent that same evicted birth from re-registering during playback.
  s.expired.set(from,Math.max(s.expired.get(from)||0,oldestSeq));
 }
 s.births.set(k,{owner:from,nid:a.nid,life:meta[2],seq:e._netSeq,tick:e._netTick,
  team:a.team,radius:resolveSubAtCharge(KIT_SUBS[id],charge).paintRadius,used:null});
}
function receipt(nm,from,e,s){
 const meta=paintMeta(e);if(!validMeta(meta)||!identify(e)||meta[1]!==epoch(nm))return null;
 const a=nm.byNid.get(meta[2]);
 if(!a?.remote||a.owner!==from||!nm.s._members?.has(from)
  ||e._netSeq<=meta[4])return null;
 const b=s.births.get(key(from,meta[4]));
 if(!b||b.nid!==meta[2]||b.life!==meta[3]||b.team!==e[6]||e._netTick<b.tick
  ||b.used!==null&&b.used!==e._netSeq)return null;
 if(e[5]!==b.radius || (e[8]!==0&&e[8]!==undefined) || e[9]||e[10]||e[11]||e[12]
  ||(e[13]!==-1&&e[13]!==undefined))return null;
 return b;
}
export function kitPaintRadiusAllowed(nm,from,e,cap){
 if(paintMeta(e))return !!receipt(nm,from,e,state(nm));
 // Unknown metadata cannot gain the wider core permit.
 return Math.fround(e[5])<=Math.fround(cap);
}
export function consumeKitPaint(nm,from,e){
 if(!paintMeta(e))return true;
 const b=receipt(nm,from,e,state(nm));if(!b)return false;b.used=e._netSeq;return true;
}
function couldWait(nm,from,e,s){
 const m=paintMeta(e);if(!validMeta(m)||m[1]!==epoch(nm)||!identify(e)||e._netSeq<=m[4]
  ||!e.slice(2,8).every(Number.isFinite)||!Number.isFinite(e[0])||e[0]<0||e[5]<=0||e[5]>5
  ||(e[8]!==0&&e[8]!==undefined)||e[9]||e[10]||e[11]||e[12]||(e[13]!==-1&&e[13]!==undefined))return false;
 const a=nm.byNid.get(m[2]);
 return a?.remote&&a.owner===from&&life(a)===m[3]&&a.team===e[6]&&isKit(a.weapon?.sub)
  &&nm.s._members?.has(from)&&m[4]>Math.max(nm.peers.get(from)?._lastEventSeq||0,s.expired.get(from)||0)&&!s.births.has(key(from,m[4]));
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
   if(waiting.length<=MAX_PENDING){s.pending.set(from,{since:old?.since??now,rows:waiting});return ready;}
   // Capacity failure closes only the unresolved claim; unrelated later rows
   // continue through their normal admission instead of being silently dropped.
   continue;
  }
  ready.push(e);
 }
 return ready;
}
export function kitPaintPlayback(nm,from,e){
 const s=state(nm);if(s.flushing)return true;
 if(e[1]!=='b'&&!paintMeta(e)&&!s.pending.has(from))return true;
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
 const births=d.e.filter(e=>e?.[1]==='b'&&identify(e)&&wanted.has(e._netSeq));
 if(!births.length)return;
 const ready=prepareKitPaintEvents(nm,from,{r:2,e:births,ts:d.ts,u:d.u});
 nm._queueKitRecoveredEvents(from,ready);
}
