// Respawn-only state ownership. Fresh match/spawnAt still clears the gauge;
// teammate Super Jump and its invulnerability keep their existing owners.
const EPS = 1e-10, KEYS = ['fire', 'jump', 'sub', 'special', 'squid'];
const INSTALL = Symbol.for('inkwave.s3.respawn-lifecycle.v1');
export const SPAWN_ARMOR_FLAG = 8388608;
export function spawnProtectionRemaining(actor) {
  if (actor?.remote && actor.s3?.spawnArmorManaged) return actor.s3.spawnArmorRemote ? .1 : 0;
  if (!actor?.s3?.spawnArmorManaged) return actor?.invuln || 0; // legacy non-respawn preview/spawnAt
  const s = actor.s3.spawnArmor;
  return s ? Math.max(0, Math.min(s.remaining, s.breakRemaining ?? Infinity)) : 0;
}
export function advanceSpawnProtection(actor, dt) {
  const s = actor.s3?.spawnArmor;
  if (!s || !actor.alive || !Number.isFinite(dt) || dt <= 0) return;
  s.remaining = Math.max(0, s.remaining - dt);
  if (s.breakRemaining !== null) s.breakRemaining = Math.max(0, s.breakRemaining - dt);
  if (s.remaining <= EPS || s.breakRemaining !== null && s.breakRemaining <= EPS) actor.s3.spawnArmor = null;
}
export function absorbSpawnDamage(actor, amount, source, tuning) {
  const s = actor.s3?.spawnArmor;
  if (!s || source === 'ink' || spawnProtectionRemaining(actor) <= EPS) return amount;
  const penetration = amount > tuning.maxAbsorb ? amount - tuning.maxAbsorb : 0;
  s.hp = Math.max(0, s.hp - amount);
  if (s.hp <= EPS && s.breakRemaining === null) s.breakRemaining = Math.min(s.remaining, tuning.breakDelay);
  return penetration;
}
export function sampleRespawnCountdown(state, fxTime) {
  if (!state.actor) return state.end - fxTime;
  const remaining = state.actor.alive ? 0 : Math.max(0, state.actor.respawnTimer || 0);
  state.total = Math.max(state.total || 0, remaining);
  if (state.ring) {
    state.ring.style.animation = 'none';
    state.ring.style.strokeDashoffset = String(state.circumference * (state.total > 0 ? remaining / state.total : 0));
  }
  return remaining;
}
function physicalHolds(input = {}) {
  const touch = input.mobile?.active && input.mobile.root ? input.mobile : null;
  const down = key => !!input.down?.(key), button = key => !!input.padButton?.(key), value = key => input.padValue?.(key) || 0;
  return {
    fire: !!input.mouse?.left || value(7) > .3 || !!touch?.down('fire'),
    jump: down('Space') || button(0) || !!touch?.down('jump'),
    sub: !!input.mouse?.right || down('KeyE') || button(5) || !!touch?.down('sub'),
    special: down('KeyF') || down('KeyQ') || button(3) || button(11) || !!touch?.down('special'),
    squid: down('ShiftLeft') || down('ShiftRight') || value(6) > .3 || !!touch?.down('squid'),
  };
}
export function installRespawnLifecycle({ Actor, PlayerController }, profile) {
  const A = Actor.prototype;
  if (Object.hasOwn(A, INSTALL)) return;
  Object.defineProperty(A, INSTALL, { value: true });
  const cfg = profile.spawnArmor, reset = A.reset, spawnAt = A.spawnAt, respawn = A.respawn, update = A.update, splat = A.splat;
  A.reset = function (...args) {
    const result = reset.apply(this, args); this.s3 ||= {};
    delete this.s3.spawnArmor; delete this.s3.spawnArmorManaged; delete this.s3.spawnArmorRemote; delete this.s3.respawnRearm;
    for (const key of KEYS) this._prevIntent[key] = false;
    this._firePressT = this._squidPressT = -1;
    return result;
  };
  A.spawnAt = function (...args) {
    const pending = this._respawnLifecycle, result = spawnAt.apply(this, args);
    if (pending) {
      if (pending.wasDead) this.special = pending.special;
      this.invuln = 0;
      this.s3.spawnArmorManaged = true;
      this.s3.spawnArmor = { hp: cfg.hp, remaining: cfg.duration, breakRemaining: null };
      if (pending.wasDead && !this.isBot && !this.remote) this.s3.respawnRearm = new Set(KEYS);
    }
    return result;
  };
  A.respawn = function (...args) {
    this._respawnLifecycle = { wasDead: !this.alive, special: this.special };
    try { return respawn.apply(this, args); }
    finally { delete this._respawnLifecycle; }
  };
  A.splat = function (...args) {
    const alive = this.alive, result = splat.apply(this, args);
    if (alive && !this.alive) { this.s3.spawnArmor = null; this.s3.spawnArmorRemote = false; }
    return result;
  };
  A.update = function (dt) {
    advanceSpawnProtection(this, dt);
    const blocked = this.s3?.respawnRearm, saved = [];
    if (this.alive && blocked) {
      for (const key of blocked) {
        const held = this.s3.physicalRespawnHeld?.[key] ?? this.intent[key];
        if (!held) { blocked.delete(key); continue; }
        saved.push([key, this.intent[key]]); this.intent[key] = false; this._prevIntent[key] = false;
      }
      if (!blocked.size) delete this.s3.respawnRearm;
    }
    try { return update.call(this, dt); }
    finally { for (const [key, value] of saved) this.intent[key] = value; }
  };
  if (PlayerController) {
    const control = PlayerController.prototype.update;
    PlayerController.prototype.update = function (...args) {
      this.a.s3 ||= {}; this.a.s3.physicalRespawnHeld = physicalHolds(this.input);
      return control.apply(this, args);
    };
  }
}
