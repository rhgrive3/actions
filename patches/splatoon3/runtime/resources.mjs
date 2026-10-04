let api, tuning, profile;
export function installResources(context, values) {
  api = context; tuning = values.resources; profile = values;
  const { Actor } = context;
  // Resource-step unit callers install only updateResources; they have no Actor.
  if (!Actor) return;
  // A successful special activation refills the tank exactly once (Splatoon 3).
  // Wrapping the native method keeps the refill on the activation tick, skips
  // failed/not-ready input, and cannot repeat while the special stays active.
  const startSpecial = Actor.prototype._startSpecial;
  Actor.prototype._startSpecial = function (...args) {
    const ready = this.specialReady(), used = this.stats.specials;
    const result = startSpecial.apply(this, args);
    // A deployable special can return control immediately, so a live animation
    // token is not the activation authority. Native successful use increments
    // the same specials counter for every kit.
    if (ready && this.stats.specials === used + 1) { this.ink = api.PLAYER.inkMax; api.emit?.('special:refill', { actor: this }); }
    return result;
  };
}
// Death-cause respawn bases. The profile owns the values; this is the fallback
// used only when a reduced unit caller installs the resource step alone.
export const RESPAWN_CAUSES = Object.freeze({ normal: 8.5, water: 7.0, outOfBounds: 5.5 });
export function respawnSeconds(cause, values = profile) {
  const table = values?.respawn || RESPAWN_CAUSES;
  if (cause === 'water' || cause === 'drown') return table.water ?? table.normal;
  if (cause === 'outOfBounds' || cause === 'fall' || cause === 'oob') return table.outOfBounds ?? table.normal;
  return table.normal ?? 8.5;
}
export function setRespawnTimer(a, cause = 'weapon') { a.respawnTimer = respawnSeconds(cause); return a.respawnTimer; }
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
    // _updateClimb already validates own wall ink before resources run.
    // Floor submersion remains floor-only for movement and presentation.
    const swimmingInInk = a.submerged || (isSquid && a.climbing);
    a.hp = Math.min(P.hp, a.hp + (swimmingInInk ? r.regenRateSwim : r.regenRate) * dt);
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
