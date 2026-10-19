// Audio-only scoped metadata for admitted Charger hits.
// Keep Projectiles.applyHit's fifth parameter strictly owned by damage groups;
// the actor, HP, packets, charged ink and gameplay state are not modified.
const scope=new WeakMap();
export function withChargedHitAudio(victim,fullyCharged,perform){
  if(!victim||typeof victim!=='object')return perform();
  const was=scope.get(victim);
  scope.set(victim,fullyCharged===true);
  try{return perform();}
  finally{if(was===undefined)scope.delete(victim);else scope.set(victim,was);}
}
export function isFullyChargedAudioHit(victim){
  return !!victim&&scope.get(victim)===true;
}
