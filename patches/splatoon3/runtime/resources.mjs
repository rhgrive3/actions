import { stormRecoveryState } from './storm-effects.mjs';
let api, tuning;
export function installResources(context, values) { api = context; tuning = values.resources; }
export function resourceSurface(a) {
  // Integration may have crossed a paint edge, taken off, or landed this tick.
  // The pre-movement surface is only suitable for movement, not recovery.
  a._surface();
  const isSquid = a.form === 'squid';
  a.submerged = isSquid && a.grounded && a.groundTeam === 1;
  a.onEnemy = a.grounded && a.groundTeam === 2 && !a.submerged;
  return { isSquid, onEnemy: a.onEnemy };
}
export function updateResources(a, dt) {
  if (!api) throw new Error('INKWAVE resource patch not installed');
  const P = api.PLAYER, r = tuning, mods = a.s3?.modifiers || {};
  const { onEnemy, isSquid } = resourceSurface(a);
  if (onEnemy) {
    a.s3 ||= {};
    const before = a.s3.enemyInkTime || 0;
    a.s3.enemyInkTime = before + dt;
    // Only the part of this tick beyond grace can deal contact damage.
    const exposure = Math.max(0, a.s3.enemyInkTime - Math.max(before, r.enemyInkGrace || 0));
    const cap = mods.enemyDamageCap ?? r.enemyInkDamageCap;
    if (exposure > 0 && a.damageFromInk < cap && a.invuln <= 0) {
      const damage = Math.min((mods.enemyDamageRate ?? r.enemyInkDps) * exposure, cap - a.damageFromInk);
      a.damageFromInk += damage; a.hp = Math.max(1, a.hp - damage);
    }
    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);
  } else {
    if (a.s3) a.s3.enemyInkTime = 0;
    a.damageFromInk = Math.max(0, a.damageFromInk - dt * r.enemyInkRecovery);
  }
  const rain = stormRecoveryState(a, api);
  if (!onEnemy && !rain.enemy && a.lastDamage + 1e-10 >= r.regenDelay && a.hp < P.hp) {
    a.hp = Math.min(P.hp, a.hp + (a.submerged || rain.ally ? r.regenRateSwim : r.regenRate) * dt);
  }
  const wasFull = a.ink >= P.inkMax;
  const weaponDelay = a.weapon.inkRecoverStop ?? r.inkRefillDelay;
  const delay = Math.max(weaponDelay, a.s3?.inkRecoverStop || 0);
  if(a.s3) a.s3.recoverStopRemaining = Math.max(0,(a.s3.recoverStopRemaining || 0)-dt);
  const canRefill = a.lastFire + 1e-10 >= delay && (a.s3?.recoverStopRemaining || 0) <= 1e-10 && (a.weaponRunner.s3DodgeInkRemaining || 0) <= 1e-10 && !a.weaponRunner.busy() && !a.weaponRunner.s3Stored;
  if (canRefill) {
    let rate = 0;
    if (a.submerged || a.climbing) rate = r.inkRefillSwim;
    else if (!isSquid) rate = r.inkRefillKid;
    // Dry/enemy-ink squid form does not receive underwater refill.
    const multiplier = a.submerged || a.climbing ? mods.inkRecoverySwim ?? 1 : mods.inkRecoveryKid ?? 1;
    a.ink = Math.min(P.inkMax, a.ink + rate * multiplier * dt);
  }
  if (!wasFull && a.ink >= P.inkMax && a.isLocal) api.G.audio?.play('refill_full', { volume: 0.5 });
}
