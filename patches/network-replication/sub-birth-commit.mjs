import { abilityPoints } from '../splatoon3/runtime/gear.mjs';
import { closeReceiverSprinklers } from './sprinkler-contact-commit.mjs';
// Receiver-private admission metadata. Never read authority from packet fields.
// Geometry, damage policy and proof expiry remain owned by combat-provenance.
const states = new WeakMap();
const finite = Number.isFinite, safe = Number.isSafeInteger;
const signature = event => { try { const s=JSON.stringify([event,event._netPeer,event._netSeq,event._netTick]); return s.length<=16384?s:null; } catch { return null; } };
function live(nm,s) { return !!s && states.get(nm)===s && !nm._disposed && nm.match===s.match && nm.cfg?.id===s.epoch; }
export function bindSubBirthCommit(nm,commit) {
  let s=states.get(nm);
  if (!live(nm,s)) { s={match:nm.match,epoch:nm.cfg?.id,events:new WeakMap(),commit};states.set(nm,s); }
  else s.commit=commit;
}
export function closeSubBirthCommit(nm) { states.delete(nm);closeReceiverSprinklers(nm); }
// Additional Torpedo eligibility metadata must not change legacy birth admission.
// Other sub types never touch the movement getter; failures only disable the new subset.
function captureTorpedoMotion(actor,snap) {
  try {
    const normalMoveTarget=actor.weaponRunner?.moveSpeed?.();
    if(!Number.isFinite(normalMoveTarget)||!(normalMoveTarget>0))return {};
    const gear=snap.adoption?.gear;
    const gearAP=gear?abilityPoints(gear.loadout).subPower||0:null;
    return {...(gear?{torpedoGear:Object.freeze({key:gear.key,ap:gearAP})}:{}),motion:Object.freeze({t:snap.t,life:snap.life,vx:snap.vx,vy:snap.vy,vz:snap.vz}),normalMoveTarget};
  } catch { return {}; }
}
export function stageAcceptedSubBirth(nm,from,event,packetTime,ownerTick) {
  const s=states.get(nm);
  if(!live(nm,s)||!Array.isArray(event)||event.length!==8||event[1]!=='ac'||event[2]!=='sub'||event[5]?.phase!=='spawn')return false;
  const actor=nm.byNid?.get(event[3]),peer=nm.peers?.get(from),snap=actor?.net?.buf?.at(-1),p=event[5];
  if(!peer||!nm.s?._members?.has(from)||!actor?.remote||actor.owner!==from||
    !safe(event[4])||event[4]<0||!safe(p.seq)||p.seq<1||p.life!==event[4]||p.sourceLife!==event[4]||
    !safe(event._netSeq)||event._netSeq<1||event._netSeq!==event[7]||event._netPeer!==from||
    !safe(event._netTick)||event._netTick<0||event._netTick!==event[6]||!safe(ownerTick)||event._netTick>ownerTick||
    !finite(packetTime)||!finite(event[0])||event[0]>packetTime||
    snap?.t!==packetTime||snap.life!==event[4]||![snap.x,snap.y,snap.z].every(finite))return false;
  const sig=signature(event);if(sig===null)return false;
  s.events.set(event,{actor,actorNet:actor.net,peer,sig,receipt:Object.freeze({from,nid:actor.nid,life:event[4],serial:p.seq,subId:p.subId,eventTime:event[0],packetTime,ownerTick,eventTick:event[6],transportSequence:event[7],...(p.subId==='torpedo'?captureTorpedoMotion(actor,snap):{}),pose:Object.freeze([snap.x,snap.y,snap.z])})});
  return true;
}
function valid(nm,s,t,from,event) {
  return live(nm,s)&&nm.s?._members?.has(from)&&nm.peers?.get(from)===t.peer&&
    nm.byNid?.get(t.receipt.nid)===t.actor&&t.actor.net===t.actorNet&&t.actor.owner===from&&signature(event)===t.sig;
}
export function hasPendingSubBirthCommit(nm,event) { return states.get(nm)?.events.has(event)===true; }
export function replayWithSubBirthCommit(nm,from,event,replay) {
  const s=states.get(nm),t=s?.events.get(event);
  if(!t)return replay(undefined);
  s.events.delete(event); // one shot even when native replay rejects or throws
  if(!valid(nm,s,t,from,event))return replay(undefined);
  let created=null;
  const report=(status,object)=>{if(status==='created')created=object;};
  const result=replay(report); // exceptions retain native semantics; no commit
  if(result===true&&created&&valid(nm,s,t,from,event)&&created.owner===t.actor&&
    created.seq===t.receipt.serial&&created.sourceLife===t.receipt.life&&created.subId===t.receipt.subId) {
    // Commit only after completed native creation. Never replay to mint proof.
    s.commit.call(nm,t.receipt,event,created);
  }
  return result;
}

// This is only the current native sprinkler kit envelope, not generic bomb
// authority and not an alternate ac/sub route. Native payload guards remain.
export function stageAcceptedSprinklerBirth(nm,from,event,packetTime,ownerTick) {
  const s=states.get(nm);
  if(!live(nm,s)||!Array.isArray(event)||event.length!==16||event[1]!=='b'||event[3]!=='bomb'||event[11]!=='sprinkler')return false;
  const actor=nm.byNid?.get(event[2]),peer=nm.peers?.get(from),meta=event[13],snap=actor?.net?.buf?.at(-1);
  if(!peer||!nm.s?._members?.has(from)||!actor?.remote||actor.owner!==from||actor.weapon?.sub!=='sprinkler'||
    !Array.isArray(meta)||meta.length!==3||meta[0]!=='inkwave-kit-birth-v1'||meta[1]!==nm.cfg?.id||!safe(meta[2])||meta[2]<0||
    meta[2]!==Math.max(actor.netLife||0,actor.net?.lastLife||0)||
    event[10]!==null||!finite(event[12])||event[12]<0||event[12]>1||!event.slice(4,10).every(finite)||
    event._netPeer!==from||!safe(event._netSeq)||event._netSeq<1||event._netSeq!==event[15]||
    !safe(event._netTick)||event._netTick<0||event._netTick!==event[14]||!safe(ownerTick)||event._netTick>ownerTick||
    !finite(packetTime)||!finite(event[0])||event[0]>packetTime||snap?.t!==packetTime||snap.life!==meta[2]||![snap.x,snap.y,snap.z].every(finite))return false;
  const sig=signature(event);if(sig===null)return false;
  s.events.set(event,{actor,actorNet:actor.net,peer,sig,receipt:Object.freeze({sourceKind:'native-sprinkler',from,nid:actor.nid,life:meta[2],serial:event[15],subId:'sprinkler',eventTime:event[0],packetTime,ownerTick,eventTick:event[14],transportSequence:event[15],pose:Object.freeze([snap.x,snap.y,snap.z])})});
  return true;
}
export function commitCreatedSprinklerBirth(nm,from,event,bomb) {
  const s=states.get(nm),t=s?.events.get(event);
  if(!t||t.receipt.sourceKind!=='native-sprinkler')return false;
  s.events.delete(event);
  if(!valid(nm,s,t,from,event)||!bomb||bomb.owner!==t.actor||bomb.ghost!==true||bomb.kind!=='bomb'||
    bomb.s3GhostResolved?.spec?.id!=='sprinkler'||bomb._netBorn!==event[0]||bomb._netBornTick!==event._netTick||bomb._netPeer!==t.peer)return false;
  // ghostBomb returns the newly appended native record, never a reused bomb.
  // Duplicate calls for the same event are refused by consumed WeakMap entry.
  s.commit.call(nm,t.receipt,event,bomb);
  return true;
}
