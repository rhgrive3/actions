import { turfCombatAllowed } from './turf-combat.mjs';
import { stormRecoveryState } from './storm-effects.mjs';
let api, tuning, profile;
export function installResources(context, values) { api = context; tuning = values.resources; profile = values; }
export const RESPAWN_CAUSES = Object.freeze({ normal: 8.5, water: 7.0, outOfBounds: 5.5 });
export function respawnSeconds(cause, values = profile) {
  const table = values?.respawn || RESPAWN_CAUSES;
  if (cause === 'water' || cause === 'drown') return table.water ?? table.normal;
  if (cause === 'outOfBounds' || cause === 'fall' || cause === 'oob') return table.outOfBounds ?? table.normal;
  return table.normal ?? RESPAWN_CAUSES.normal;
}
export function setRespawnTimer(a, cause = 'weapon') { a.respawnTimer = respawnSeconds(cause); return a.respawnTimer; }
export function resourceSurface(a) {
  // Integration may have crossed a paint edge, taken off, or landed this tick.
  // The pre-movement surface is only suitable for movement, not recovery.
  a._surface();
  const isSquid = a.form === 'squid';
  a.submerged = isSquid && a.grounded && a.groundTeam === 1;
  a.onEnemy = a.grounded && a.groundTeam === 2 && !a.submerged;
  return isSquid;
}
export function enemyInkDamageRate(rate, referenceHz = 60, quantum = 0.1) {
  return Math.max(0, Math.floor(rate / referenceHz / quantum + 1e-10)) * quantum * referenceHz;
}
// State-owned airborne actions share HP recovery without running ground contact
// damage, surface sampling, ink refill, or resource recovery clocks.
export function updateHealthRecovery(a, dt, onEnemy = false, submerged = false) {
  if (!turfCombatAllowed(api.G)) return;
  const P = api.PLAYER, r = tuning, rain = stormRecoveryState(a, api);
  if (!onEnemy && !rain.enemy && a.lastDamage + 1e-10 >= r.regenDelay && a.hp < P.hp) {
    a.hp = Math.min(P.hp, a.hp + (submerged || rain.ally ? r.regenRateSwim : r.regenRate) * dt);
  }
}
export function updateResources(a, dt) {
  if (!api) throw new Error('INKWAVE resource patch not installed');
  if (!turfCombatAllowed(api.G)) return;
  const P = api.PLAYER, r = tuning, mods = a.s3?.modifiers || {};
  const { onEnemy, isSquid } = resourceSurface(a);
  if (onEnemy) {
    a.s3 ||= {};
    const before = a.s3.enemyInkTime || 0;
    a.s3.enemyInkTime = before + dt;
    a.s3.enemyInkAwayTime = 0;
    // Only the part of this tick beyond the equipped grace can deal contact damage.
    const exposure = Math.max(0, a.s3.enemyInkTime - Math.max(before, mods.enemyInkGrace ?? r.enemyInkGrace ?? 0));
    const cap = mods.enemyDamageCap ?? r.enemyInkDamageCap;
    const allowance = Math.max(0, cap - (P.hp - a.hp));
    if (exposure > 0 && allowance > 0 && a.invuln <= 0) {
      const rate = enemyInkDamageRate(mods.enemyDamageRate ?? r.enemyInkDps, r.enemyInkReferenceHz, r.enemyInkDamageQuantum);
      const damage = Math.min(rate * exposure, allowance, Math.max(0, a.hp - 1));
      a.damageFromInk += damage; a.hp -= damage;
    }
    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);
  } else {
    if (a.s3) {
      const resetAfter = r.enemyInkGraceReset ?? 0;
      a.s3.enemyInkAwayTime = Math.min(resetAfter, (a.s3.enemyInkAwayTime || 0) + dt);
      if (a.s3.enemyInkAwayTime + 1e-10 >= resetAfter) a.s3.enemyInkTime = 0;
    }
    a.damageFromInk = Math.max(0, a.damageFromInk - dt * r.enemyInkRecovery);
  }
  const swimmingForRecovery = a.submerged || (isSquid && a.climbing);
  updateHealthRecovery(a, dt, onEnemy, swimmingForRecovery);
  const wasFull = a.ink >= P.inkMax;
  const rollingRecovery = a.weapon.kind === 'roller' && a.s3?.rollerRefillMode;
  const weaponDelay = rollingRecovery ? 0 : a.weapon.inkRecoverStop ?? r.inkRefillDelay;
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
  if (a.s3) {
    a.s3.chargerInterruptRecover = Math.max(0, (a.s3.chargerInterruptRecover || 0) - dt);
    a.s3.chargerKeepRecover = Math.max(0, (a.s3.chargerKeepRecover || 0) - dt);
  }
  const runner = a.weaponRunner;
  if (runner?.charging && isSquid && a.weapon.kind === 'charger' && runner.charge < .999) {
    a.s3 ||= {};
    a.s3.chargerInterruptRecover = 19 / 60;
  }
  const chargerInterruptRecover = a.weapon.kind === 'charger' ? (a.s3?.chargerInterruptRecover || 0) : 0;
  const chargerKeepRecover = a.weapon.kind === 'charger' ? (a.s3?.chargerKeepRecover || 0) : 0;
  const chargerLowRecovery = a.weapon?.kind === 'charger' && runner?.charging &&
    a.ink + 1e-10 < (a.weapon.inkMin ?? 0) && chargerInterruptRecover <= 1e-10 && chargerKeepRecover <= 1e-10;
  const canRefill = chargerLowRecovery ||
    ((rollingRecovery ? !a.weaponRunner.rolling && a.lastFire + 1e-10 >= (a.s3?.inkRecoverStop || 0) : a.lastFire + 1e-10 >= delay)
      && (a.s3?.recoverStopRemaining || 0) <= 1e-10
      && (a.weaponRunner.s3DodgeInkRemaining || 0) <= 1e-10
      && chargerInterruptRecover <= 1e-10
      && chargerKeepRecover <= 1e-10
      && !a.weaponRunner.busy() && !a.weaponRunner.s3Stored);
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
