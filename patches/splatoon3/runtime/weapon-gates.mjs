// Per-weapon action clocks. The native runner still owns shots/ink/projectiles.
const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.s3.weapon-gates.v1');
const elapsed = (value, dt) => value - dt <= EPS ? 0 : value - dt;
export const projectilePlayerRadius = p => p.s3PlayerRadius ?? p.size;
export function installWeaponGates({ Actor, WeaponRunner, Projectiles }) {
  const wr = WeaponRunner.prototype;
  if (wr[INSTALLED]) return;
  Object.defineProperty(wr, INSTALLED, { value: true });
  const advance = (r, dt) => {
    r.s3PostShotRemaining = elapsed(r.s3PostShotRemaining || 0, dt);
    r.s3DodgeInkRemaining = elapsed(r.s3DodgeInkRemaining || 0, dt);
    r.s3DodgeShotRemaining = elapsed(r.s3DodgeShotRemaining || 0, dt);
  };
  // Before Actor's form/resource admission, once per gameplay tick. Direct
  // runner tests/late-descent updates use the fallback below, never twice.
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    const r = this.weaponRunner, nested = r.s3GateInActor;
    if (!nested) advance(r, dt);
    r.s3GateInActor = true;
    try { return actorUpdate.call(this, dt, ...args); }
    finally { r.s3GateInActor = nested; }
  };
  const reset = wr.reset, busy = wr.busy, update = wr.update;
  wr.reset = function (...args) {
    this.s3PostShotRemaining = this.s3DodgeInkRemaining = this.s3DodgeShotRemaining = 0;
    this.s3GateInActor = false; this.s3DodgeShotPending = false;
    return reset.apply(this, args);
  };
  wr.busy = function () { return this.s3PostShotRemaining > EPS || busy.call(this); };
  wr.update = function (dt, input) {
    if (!this.s3GateInActor) advance(this, dt);
    const r = this;
    // Read dynamically: a main release within update() starts the lock BEFORE
    // the subsequent native sub block reads sub/subReleased. No queued throw.
    const admitted = { ...input,
      get sub() { return r.s3PostShotRemaining > EPS ? false : input.sub; },
      get subReleased() { return r.s3PostShotRemaining > EPS ? false : input.subReleased; },
    };
    return update.call(this, dt, admitted);
  };
  const charger = wr._charger;
  wr._charger = function (dt, input, w) {
    if (Math.abs(this.cooldown) <= EPS) this.cooldown = 0;
    const before = this.cooldown, releasing = this.charging && !input.fire;
    const result = charger.call(this, dt, input, w);
    // The native release creates a new cooldown. A storage/minimum-charge
    // cancellation does not; do not confuse that with an emitted shot.
    if (releasing && !this.charging && this.cooldown > before + EPS) this.cooldown = w.rechargeDelay;
    return result;
  };
  const dodge = wr.tryDodge, dualies = wr._dualies;
  wr.tryDodge = function (...args) {
    const accepted = dodge.apply(this, args);
    if (accepted) {
      this.s3DodgeInkRemaining = this.a.weapon.rollInkRecoverStop;
      this.s3DodgeShotRemaining = 0; this.s3DodgeShotPending = true;
      this.cooldown = 0; // forbidden travel never accrues a shot debt
    }
    return accepted;
  };
  wr._dualies = function (dt, input, w) {
    const travelling = !!this.dodge;
    if (travelling) this.cooldown = 0;
    if (!travelling && this.s3DodgeShotRemaining > EPS) {
      // Let the native movement lock age while withholding only the shot.
      this.cooldown = Math.max(dt, EPS * 2);
      const result = dualies.call(this, dt, input, w);
      this.cooldown = 0; return result;
    }
    if (!travelling && this.s3DodgeShotPending && input.fire) {
      this.cooldown = 0; this.s3DodgeShotPending = false;
    }
    if (Math.abs(this.cooldown) <= EPS) this.cooldown = 0;
    const result = dualies.call(this, dt, input, w);
    if (travelling && !this.dodge) {
      this.s3DodgeShotRemaining = w.rollShotDelay; this.s3DodgeShotPending = true;
      this.cooldown = 0;
    }
    return result;
  };
  const fresh = Projectiles.prototype._new, push = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = fresh.apply(this, args); p.s3PlayerRadius = null; return p;
  };
  Projectiles.prototype._push = function (p) {
    const a = p.owner, w = a?.weapon;
    if (!p.ghost && w?.kind === 'dualies') {
      // Preserve the uncalibrated native normal radius; apply only the sourced
      // mode ratio. Field/paint/visual/boss radii retain their native values.
      p.s3PlayerRadius = p.size * (a.weaponRunner.s3Turret ? w.playerRadiusAfterRoll / w.playerRadiusNormal : 1);
    }
    return push.call(this, p);
  };
}
