// PvP 11.3.0 baseline. Community verification, not inherited defaults inferred
// from a sparse extraction or our own Switch measurements:
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー#oed967d2
// https://wikiwiki.jp/splatoon3mix/システム詳細仕様
// The pinned WeaponSpSuperHook table supplies hook action/flight parameters but
// does not expose these inherited armor constants. 20F is the delay after HP
// reaches zero, not armor after every movement ends. Unbroken armor lasts from
// movement start until floor contact, or wall contact +18F. Attacking, squid
// form or jumping after wall contact ends it; extending another hook does not.
// Broken armor never replenishes in the same movement.
import { validDamageGroup } from './final-damage.mjs';

export const ZIPCASTER_ARMOR = Object.freeze({ hp:30, threshold:100, penetrationMax:80,
  breakFrames:20, wallFrames:18, reference:'S3mix community-verified armor law, 11.3.0 baseline' });
const records=new WeakMap(), EPS=1e-10, FPS=60;
const life=a=>Math.max(Number(a?.netLife)||0,Number(a?.net?.lastLife)||0);
function current(actor){
  const r=records.get(actor),s=actor?._s3AllSpecialState;
  if(!r)return null;
  if(!actor.alive||actor.remote||s!==r.special||s?.id!=='zipcaster'||
      life(actor)!==r.life||actor.owner!==r.owner||!Number.isFinite(s.t)||
      s.t+EPS>=Math.min(r.until,r.breakUntil)){
    records.delete(actor);return null;
  }
  return r;
}
export function clearZipcasterArmor(actor){records.delete(actor);}
export function beginZipcasterArmor(actor,special){
  if(!actor?.alive||actor.remote||special?.id!=='zipcaster'||actor._s3AllSpecialState!==special||!Number.isFinite(special.t))return;
  records.set(actor,{special,life:life(actor),owner:actor.owner,hp:ZIPCASTER_ARMOR.hp,
    phase:'move',until:Infinity,breakUntil:Infinity,groups:new WeakMap()});
}
export function arriveZipcasterArmor(actor,wall){
  const r=current(actor);if(!r)return;
  if(!wall){clearZipcasterArmor(actor);return;}
  r.phase='wall';r.until=r.special.t+ZIPCASTER_ARMOR.wallFrames/FPS;
}
// These are completed/admitted actions, never raw held input. In particular a
// held trigger during hookWait cannot remove protection before a weapon fires.
export function updateZipcasterArmor(actor,actions){
  const r=current(actor);if(r?.phase==='wall'&&(actions?.fire||actions?.squid||actions?.jump))clearZipcasterArmor(actor);
}
export function zipcasterArmorSnapshot(actor){
  const r=current(actor);return r?{hp:r.hp,phase:r.phase,
    breakRemainingFrames:Number.isFinite(r.breakUntil)?Math.max(0,(r.breakUntil-r.special.t)*FPS):null,
    remainingFrames:Number.isFinite(r.until)?Math.max(0,(r.until-r.special.t)*FPS):null}:null;
}
// Called from the movement-armor boundary inside ordinary Sub Resistance and
// outside final native HP quantization. Object damage rates do not apply.
// Penetration never re-enters Sub Resistance or a second simultaneous shield.
export function absorbZipcasterDamage(actor,amount,attacker,source){
  const r=current(actor);
  if(!r||source==='ink'||!(amount>0)||!Number.isFinite(amount))return null;
  let penetration=Math.min(ZIPCASTER_ARMOR.penetrationMax,Math.max(0,amount-ZIPCASTER_ARMOR.threshold));
  const group=actor.s3PendingHitGroup;
  if(attacker&&typeof attacker==='object'&&validDamageGroup(group)){
    // Main families may deliver maximum-damage increments for one shot. Apply
    // its 100 threshold and 80 cap once, not once per incoming increment.
    let era=r.groups.get(attacker),owner=attacker.owner,attackerLife=life(attacker);
    if(!era||era.owner!==owner||era.life!==attackerLife){era={owner,life:attackerLife,groups:new Map()};r.groups.set(attacker,era);}
    const prev=era.groups.get(group)||0,next=prev+amount;
    const through=total=>Math.min(ZIPCASTER_ARMOR.penetrationMax,Math.max(0,total-ZIPCASTER_ARMOR.threshold));
    penetration=through(next)-through(prev);
    if(era.groups.size>=128&&!era.groups.has(group))era.groups.delete(era.groups.keys().next().value);
    era.groups.set(group,next);
  }
  r.hp=Math.max(0,r.hp-amount);
  if(r.hp<=0&&r.breakUntil===Infinity)r.breakUntil=r.special.t+ZIPCASTER_ARMOR.breakFrames/FPS;
  return {amount:penetration,absorbed:amount-penetration,hp:r.hp,broken:r.hp<=0,kind:'zipcaster'};
}
