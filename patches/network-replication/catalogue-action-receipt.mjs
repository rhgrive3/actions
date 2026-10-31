// Link a sanitized catalogue payload to its completed native owner tick.
// JSON fields, direct _play calls and copied payloads cannot mint this receipt.
const events=new WeakMap(),payloads=new WeakMap();
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
export function captureCatalogueActionReceipts(nm,receipt){
 if(!receipt||receipt.ownerSession!==nm.s||receipt.ownerMatch!==nm.match||receipt.ownerMatchId!==nm.cfg?.id||nm._disposed)return;
 for(const event of receipt.nativeEvents){
  if(event[1]!=='ac'||!['sub','special'].includes(event[2])||
    event[2]==='sub'&&event[5]?.phase!=='objectHit'&&event[5]?.phase!=='nativeObjectHit')continue;
  const actor=nm.byNid?.get(event[3]),snap=actor?.net?.buf?.at(-1),peer=nm.peers?.get(event._netPeer);
  if(!actor?.remote||actor.owner!==event._netPeer||!peer||!snap||!receipt.poses.has(actor.nid)||snap.life!==life(actor)||event[4]!==snap.life||
    !Number.isSafeInteger(event._netSeq)||event._netSeq<1||!Number.isFinite(event[0])||event[0]>receipt.ts||receipt.ts-event[0]>1.4)continue;
  events.set(event,{nm,actor,net:actor.net,from:actor.owner,peer,session:nm.s,match:nm.match,life:snap.life,time:event[0],packetTime:receipt.ts,seq:event._netSeq,tick:event._netTick,
   signature:JSON.stringify(event),snapshot:{...snap}});
 }
}
function live(r,nm,actor){return r&&r.nm===nm&&!nm._disposed&&r.actor===actor&&actor.net===r.net&&actor.owner===r.from&&actor.remote&&
 nm.s===r.session&&nm.match===r.match&&nm.byNid?.get(actor.nid)===actor&&nm.peers?.get(r.from)===r.peer&&nm.s?._members?.has(r.from);}
export function bindCatalogueActionPayload(nm,event,payload,actor){
 const r=events.get(event);events.delete(event);
 if(!live(r,nm,actor)||r.life!==life(actor)||r.signature!==JSON.stringify(event))return false;
 payloads.set(payload,r);return true;
}
export function catalogueActionReceipt(nm,payload,actor){const r=payloads.get(payload);return live(r,nm,actor)&&r.life===life(actor)?r:null;}
