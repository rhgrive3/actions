// One HP quantization owner: called inside native Actor.damage AFTER its
// defensive multiplier and the outer movement-armor wrapper. Transport and
// projectile falloff keep full precision until this boundary.
const EPS = 1e-9;
const IDS = new WeakMap(), CREDIT = new WeakMap();
let nextGroup = 0;
export function damageGroupId(group) {
  if (!group) return null;
  if (!IDS.has(group)) IDS.set(group, ++nextGroup);
  return IDS.get(group);
}
export function damageTenths(amount) {
  const scaled = Math.max(0, amount) * 10, nearest = Math.round(scaled);
  return (Math.abs(scaled - nearest) <= EPS ? nearest : Math.floor(scaled)) / 10;
}
export function finalWeaponDamage(victim, amount, attacker, source) {
  if (source === 'ink') return amount; // enemy-ink ticks are a separate owner
  const group = victim.s3PendingHitGroup;
  if (!attacker || !Number.isSafeInteger(group) || group <= 0) return damageTenths(amount);
  let attackers = CREDIT.get(victim);
  if (!attackers) { attackers = new WeakMap(); CREDIT.set(victim, attackers); }
  let groups = attackers.get(attacker);
  if (!groups) { groups = new Map(); attackers.set(attacker, groups); }
  // Actor handoff can reuse its object while changing the sender's sequence.
  const key = `${attacker.owner ?? 'local'}:${group}`;
  let credit = groups.get(key);
  if (!credit) {
    // Bound long-match bookkeeping. Ordinary projectile lifetime is <3 s;
    // 256 concurrent attack groups per attacker is well beyond that window.
    if (groups.size >= 256) groups.delete(groups.keys().next().value);
    credit = { raw: 0, applied: 0 }; groups.set(key, credit);
  }
  // groupDamage upstream emits max-damage increments. Quantize the cumulative
  // POST-defense damage, not each increment: 30.39 then +3.92 must total 34.3.
  credit.raw += Math.max(0, amount);
  const total = damageTenths(credit.raw);
  const delta = Math.max(0, Math.round((total - credit.applied) * 10) / 10);
  credit.applied = total; return delta;
}
export function installFinalDamage({Actor, Projectiles}) {
  const tag = Symbol.for('inkwave.s3.final-damage.v1');
  if (Actor.prototype[tag]) return;
  Object.defineProperty(Actor.prototype,tag,{value:true});
  const reset=Actor.prototype.reset,hit=Projectiles.prototype.applyHit;
  Actor.prototype.reset=function(...args){CREDIT.delete(this);this.s3PendingHitGroup=null;return reset.apply(this,args);};
  Projectiles.prototype.applyHit=function(attacker,victim,amount,weaponId,group=null){
    const previous=victim.s3PendingHitGroup;
    victim.s3PendingHitGroup=Number.isSafeInteger(group)&&group>0?group:null;
    try{return hit.call(this,attacker,victim,amount,weaponId);}
    finally{victim.s3PendingHitGroup=previous;}
  };
}
