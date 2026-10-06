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
  if (!onEnemy && a.lastDamage + 1e-10 >= r.regenDelay && a.hp < P.hp) {
    a.hp = Math.min(P.hp, a.hp + (a.submerged ? r.regenRateSwim : r.regenRate) * dt);
  }
  const wasFull = a.ink >= P.inkMax;
  const weaponDelay = a.weapon.inkRecoverStop ?? r.inkRefillDelay;
  const delay = Math.max(weaponDelay, a.s3?.inkRecoverStop || 0);
  if(a.s3) a.s3.recoverStopRemaining = Math.max(0,(a.s3.recoverStopRemaining || 0)-dt);
  // #737: an active partial/fresh Splat Charger charge cleared by this update's
  // form change is a charge interruption. The S3 verification table gives
  // charge-interruption → ink recovery = 19F for the Splat Charger, separate
  // from #416's 6F cancel→squid form recovery and from the ordinary post-shot
  // delay above. The resource pass runs before the weapon wrapper clears
  // `charging`, so detection here locks the cancellation update itself; after
  // this tick's decrement the lock is rewritten to exactly 19F, which blocks
  // 19 fixed ticks (cancel tick .. cancel+18F) and reopens eligibility at
  // cancel+19F. Full-charge keeps (charge >= .999 → s3Stored) never take this
  // path. Community-verified S3 table, no Switch re-measurement is claimed.
  if (a.s3) a.s3.chargerInterruptRecover = Math.max(0, (a.s3.chargerInterruptRecover || 0) - dt);
  const runner = a.weaponRunner;
  if (runner?.charging && isSquid && a.weapon.kind === 'charger' && runner.charge < .999) {
    a.s3 ||= {};
    a.s3.chargerInterruptRecover = 19 / 60;
  }
  const chargerInterruptRecover = a.weapon.kind === 'charger' ? (a.s3?.chargerInterruptRecover || 0) : 0;
  const canRefill = a.lastFire + 1e-10 >= delay && (a.s3?.recoverStopRemaining || 0) <= 1e-10
    && chargerInterruptRecover <= 1e-10
    && !a.weaponRunner.busy() && !a.weaponRunner.s3Stored;
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
