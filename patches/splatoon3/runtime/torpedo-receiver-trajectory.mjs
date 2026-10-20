// Receiver-native trajectory opt-in. Enrollment alone is not hit authorization.
// A separate private accepted-birth/contact registry owns claim admission.
const records=new WeakMap();
function contextValid(api,world,object,r){
 const G=api?.G,nm=G?.netm;
 return G===r.G&&world===r.world&&G.projectiles===world&&G.level===r.level&&G.physics===r.physics&&
   nm===r.nm&&G.match===r.match&&nm?.match===r.netMatch&&nm?.peers?.get(r.peerId)===r.peer&&
   nm?.byNid?.get(r.nid)===r.owner&&object.owner===r.owner&&r.owner.remote&&
   r.owner.netLife===r.life&&object.sourceLife===r.life&&object.seq===r.seq&&
   !object.dead&&world._s3SubObjects?.includes(object);
}
export function beginReceiverTorpedoObservation(api,world,object){
 if(!object?.ghost||object.subId!=='torpedo'||object.dead||object.phase!=='flight'||object.chasedTarget||records.has(object))return false;
 const G=api?.G,nm=G?.netm,owner=object.owner,peerId=owner?.owner;
 const r={G,world,level:G?.level,physics:G?.physics,nm,match:G?.match,netMatch:nm?.match,
  owner,nid:owner?.nid,life:object.sourceLife,seq:object.seq,peerId,peer:nm?.peers?.get(peerId),retired:false};
 if(!r.peer||!contextValid(api,world,object,r))return false;
 records.set(object,r);return true;
}
export function receiverTorpedoObservationState(api,world,object){
 const r=records.get(object);if(!r)return null;
 if(!r.retired&&!contextValid(api,world,object,r))r.retired=true;
 return r.retired?'retired':'active';
}
export function retireReceiverTorpedoObservation(object){const r=records.get(object);if(r)r.retired=true;}
export function hasReceiverTorpedoObservation(object){return records.has(object);}
