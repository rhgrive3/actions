let api, tuning;
export function installResources(context, values) { api = context; tuning = values.resources; }
export function updateResources(a, dt, onEnemy, isSquid) {
  if (!api) throw new Error('INKWAVE resource patch not installed');
  const P = api.PLAYER, r = tuning, mods = a.s3?.modifiers || {};
  if (onEnemy) {
    a.s3 ||= {};
    a.s3.enemyInkTime = (a.s3.enemyInkTime || 0) + dt;
    const cap = mods.enemyDamageCap ?? r.enemyInkDamageCap;
    if (a.s3.enemyInkTime > (r.enemyInkGrace || 0) && a.damageFromInk < cap && a.invuln <= 0) {
      const damage = Math.min((mods.enemyDamageRate ?? r.enemyInkDps) * dt, cap - a.damageFromInk);
      a.damageFromInk += damage; a.hp = Math.max(1, a.hp - damage);
    }
    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);
  } else {
    if (a.s3) a.s3.enemyInkTime = 0;
    a.damageFromInk = Math.max(0, a.damageFromInk - dt * r.enemyInkRecovery);
  }
  if (a.lastDamage + 1e-10 >= r.regenDelay && a.hp < P.hp) {
    a.hp = Math.min(P.hp, a.hp + (a.submerged ? r.regenRateSwim : r.regenRate) * dt);
  }
  const wasFull = a.ink >= P.inkMax;
  const weaponDelay = a.weapon.inkRecoverStop ?? r.inkRefillDelay;
  const delay = Math.max(weaponDelay, a.s3?.inkRecoverStop || 0);
  if(a.s3) a.s3.recoverStopRemaining = Math.max(0,(a.s3.recoverStopRemaining || 0)-dt);
  const canRefill = a.lastFire + 1e-10 >= delay && (a.s3?.recoverStopRemaining || 0) <= 1e-10 && !a.weaponRunner.busy() && !a.weaponRunner.s3Stored;
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
