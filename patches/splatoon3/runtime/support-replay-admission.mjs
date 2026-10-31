// Capabilities come from completed native owner ticks, not fields on JSON rows.
// The owner still supplies its input stream; this gate binds effects to an
// admitted life/launch and receiver-owned flight instead of a placement claim.
import { observeOwnerTick } from '../../network-replication/owner-tick-receipt.mjs';
import { POINT_SENSOR } from './support-recon.mjs';
const states=new WeakMap(),finite=Number.isFinite,safe=Number.isSafeInteger;
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const signature=e=>{try{return JSON.stringify(e);}catch{return null;}};
function state(nm){let s=states.get(nm);if(!s||s.session!==nm.s||s.match!==nm.match||s.id!==nm.cfg?.id){s={session:nm.s,match:nm.match,id:nm.cfg?.id,events:new WeakMap(),uses:new WeakMap(),resources:new WeakMap()};states.set(nm,s);}return s;}
export function observeSupportTick(nm,from,packet,run){
  if(!Array.isArray(packet?.a)||!packet.a.some(row=>{const a=nm.byNid?.get(row?.[0]);return a?.remote&&a.owner===from&&(a.weapon?.sub==='pointSensor'||a.weapon?.special);}))return run();
  const prior=new Map();
  for(const actor of nm.byNid?.values?.()||[])if(actor.remote&&actor.owner===from){const snap=actor.net?.buf?.at(-1);prior.set(actor,{ink:snap?.ink??actor.ink,sp:snap?.sp??actor.special,t:snap?.t??packet.ts-1/60,life:snap?.life??life(actor),count:actor.stats?.specials||0,snapshot:snap?{...snap}:null});}
  const observed=observeOwnerTick(nm,from,packet,run),receipt=observed.receipt;
  if(!receipt||receipt.ownerSession!==nm.s||receipt.ownerMatch!==nm.match||receipt.ownerMatchId!==nm.cfg?.id||nm._disposed)return observed.result;
  const s=state(nm),peer=nm.peers?.get(from);
  if(packet.r!==2||!peer)return observed.result;
  // Preserve bounded native debit/use receipts when their action row arrives
  // in a later packet. A newer unchanged resource sample cannot erase proof.
  for(const id of receipt.poses.keys()){
    const actor=nm.byNid?.get(id),snap=actor?.net?.buf?.at(-1),before=prior.get(actor);
    if(!actor||actor.owner!==from||!snap||snap.t!==packet.ts||snap.life!==life(actor))continue;
    let r=s.resources.get(actor);
    if(!r||r.net!==actor.net||r.life!==snap.life||r.owner!==from){r={net:actor.net,life:snap.life,owner:from,time:-Infinity,last:before,ink:[],special:[]};s.resources.set(actor,r);}
    const last=r.last,row=packet.a.find(row=>row?.[0]===id),count=Number.isSafeInteger(row?.[22])?row[22]:null;
    r.ink=r.ink.filter(c=>packet.ts-c.at<=1.4&&c.amount>0);r.special=r.special.filter(c=>packet.ts-c.at<=1.4&&!c.used);
    if(last?.life===snap.life&&Number.isFinite(last.t)&&snap.t>last.t){
      const dt=Math.min(1.4,snap.t-last.t),debit=last.ink-snap.ink;
      if(finite(debit)&&debit>0)r.ink.push({start:last.t,at:snap.t,amount:Math.min(100,debit+Math.min(12,dt*60)+1)});
      const cost=actor.specialCost?.()??actor.weapon?.specialCost??190;
      const paid=finite(last.sp)&&last.sp>=cost-1&&finite(snap.sp)&&snap.sp<=1;
      const counted=count!==null&&Number.isSafeInteger(last.count)&&count>last.count&&finite(snap.sp)&&snap.sp>=0&&snap.sp<=cost+1;
      if(paid||counted)r.special.push({start:last.t,at:snap.t,used:false});
    }
    r.last={ink:snap.ink,sp:snap.sp,t:snap.t,life:snap.life,count:count??last?.count??0};
    if(r.ink.length>32)r.ink.splice(0,r.ink.length-32);if(r.special.length>4)r.special.splice(0,r.special.length-4);
  }
  for(const event of receipt.nativeEvents){
    if(event[1]!=='ks'&&!(event[1]==='ev'&&event[2]==='special:use'))continue;
    const id=event[1]==='ks'?event[3]:event[3]?.actor?.n,actor=nm.byNid?.get(id),snap=actor?.net?.buf?.at(-1);
    if(!actor?.remote||actor.owner!==from||!snap||snap.life!==life(actor)||!receipt.poses.has(id)||
      !safe(event._netSeq)||event._netSeq<1||!safe(event._netTick)||event._netTick<0||event._netPeer!==from||
      !finite(event[0])||event[0]>packet.ts||packet.ts-event[0]>1.4||
      ![snap.x,snap.y,snap.z,snap.vx,snap.vy,snap.vz,snap.aimYaw,snap.aimPitch].every(finite))continue;
    const record={specialId:event[1]==='ev'?event[3]?.id:null,actor,net:actor.net,peer,from,life:snap.life,seq:event._netSeq,tick:event._netTick,time:event[0],packetTime:packet.ts,
      snapshot:{...snap},...(event[1]==='ev'&&event[3]?.id==='storm'?{stormPower:Object.freeze({duration:actor.s3?.modifiers?.stormDuration??8,throwScale:actor.s3?.modifiers?.stormThrowScale??1})}:{}),previousSnapshot:prior.get(actor)?.snapshot,specialPowerAP:actor.s3?.abilityPoints?.specialPower||0,specialPower:actor.s3?.modifiers?.specialPower||0,sourceWeapon:Object.freeze({...actor.weapon}),signature:signature(event),session:nm.s,match:nm.match};
    if(record.signature===null)continue;
    const resource=s.resources.get(actor),eligible=c=>event[0]>=c.start-.075&&event[0]<=c.at+.075;
    if(event[1]==='ks'&&event[2]==='p'){
      const cost=POINT_SENSOR.inkCost*(actor.s3?.modifiers?.inkSaverSub??1);
      const credits=resource?.ink.filter(eligible)||[],available=credits.reduce((n,c)=>n+c.amount,0);
      if(!finite(cost)||cost<=0||available<cost||event[0]-resource.time<5/60-1e-6)continue;
      let debit=cost;for(const c of credits){const used=Math.min(debit,c.amount);c.amount-=used;debit-=used;if(debit<=0)break;}
      resource.time=event[0];
    }
    if(event[1]==='ev'){
      if(actor.weapon?.special!==event[3]?.id)continue;
      // A native gauge debit or monotonic native use-counter increment is a
      // one-use capability. Counter continuity recovers a missed full-gauge
      // snapshot or a native held-gauge reservation; neither raw use nor
      // deploy rows create a resource credit.
      const paid=resource?.special.find(c=>!c.used&&eligible(c));if(!paid)continue;paid.used=true;
    }
    s.events.set(event,record);
    if(event[1]==='ev'){
      let uses=s.uses.get(actor);if(!uses){uses=[];s.uses.set(actor,uses);}
      uses.push(record);while(uses.length>8)uses.shift();
    }
  }
  return observed.result;
}
export function consumeSupportEvent(nm,from,event,actor){
  const s=states.get(nm),r=s?.events.get(event);
  if(!r)return null;s.events.delete(event);
  if(nm._disposed||s.session!==nm.s||s.match!==nm.match||s.id!==nm.cfg?.id||r.actor!==actor||r.net!==actor.net||
    r.peer!==nm.peers?.get(from)||r.from!==from||actor.owner!==from||r.life!==life(actor)||r.signature!==signature(event)||
    r.seq!==event._netSeq||r.tick!==event._netTick||event._netPeer!==from)return null;
  return r;
}
export function consumeCoolerUse(nm,actor,throwReceipt){
  const s=states.get(nm),uses=s?.uses.get(actor);if(!uses)return false;
  const i=uses.findIndex(r=>r.specialId==='tacticooler'&&r.session===nm.s&&r.match===nm.match&&r.net===actor.net&&r.peer===nm.peers?.get(actor.owner)&&
    r.from===actor.owner&&r.life===throwReceipt.life&&r.seq<throwReceipt.seq&&r.time<=throwReceipt.time&&throwReceipt.time-r.time<=40);
  if(i<0)return false;uses.splice(i,1);return true;
}
export function nativeSpecialUseReceipt(nm,actor,eventTime,id=actor?.weapon?.special,expectedLife=life(actor)){
  const s=states.get(nm);if(!s||s.session!==nm.s||s.match!==nm.match||s.id!==nm.cfg?.id||nm._disposed)return null;
  const uses=s.uses.get(actor);if(!uses)return null;
  return uses.findLast(r=>r.specialId===id&&r.session===nm.s&&r.match===nm.match&&r.net===actor.net&&r.peer===nm.peers?.get(actor.owner)&&
    r.from===actor.owner&&r.life===expectedLife&&r.time<=eventTime+.002&&eventTime-r.time<=(id==='storm'?Infinity:40))||null;
}
export function clearSupportAdmission(nm){states.delete(nm);}
