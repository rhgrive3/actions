// Per-weapon action clocks. The native runner still owns shots/ink/projectiles.
const EPS = 1e-10;
export const BLASTER_INTERRUPT_SUB = 3 / 60;
export const BLASTER_INTERRUPT_SQUID = 4 / 60;
const INSTALLED = Symbol.for('inkwave.s3.weapon-gates.v1');
const elapsed = (value, dt) => value - dt <= EPS ? 0 : value - dt;
// The existing actual-shot clock is16F for squid admission. Sub preparation
// becomes legal at15F, when only its final1F remains. No second clock is advanced.
export function chargerPostShotBlocksSub(runner) {
  return runner.a?.weapon?.kind === 'charger' && (runner.s3ChargerPostShot || 0) > 1 / 60 + EPS;
}
export const projectilePlayerRadius = p => p.s3PlayerRadius ?? p.size;
export function installWeaponGates({ Actor, WeaponRunner, Projectiles }) {
  const wr = WeaponRunner.prototype;
  if (wr[INSTALLED]) return;
  Object.defineProperty(wr, INSTALLED, { value: true });
  const advance = (r, dt) => {
    r.s3PostShotRemaining = elapsed(r.s3PostShotRemaining || 0, dt);
    r.s3BlasterInterruptSub = elapsed(r.s3BlasterInterruptSub || 0, dt);
    r.s3BlasterInterruptSquid = elapsed(r.s3BlasterInterruptSquid || 0, dt);
    r.s3DodgeInkRemaining = elapsed(r.s3DodgeInkRemaining || 0, dt);
    r.s3DodgeShotRemaining = elapsed(r.s3DodgeShotRemaining || 0, dt);
  };
  // Before Actor's form/resource admission, once per gameplay tick. Direct
  // runner tests/late-descent updates use the fallback below, never twice.
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    const r = this.weaponRunner, nested = r.s3GateInActor;
    if (!nested) {
      advance(r, dt);
      const intent = this.intent || {}, prev = this._prevIntent || {};
      if (this.weapon?.kind === 'blaster' && r.s3BlasterHeldRepeat) {
        const released = !!prev.fire && !intent.fire;
        const subEdge = !!intent.sub && !prev.sub;
        const squidEdge = !!intent.squid && !prev.squid;
        if (released || subEdge || squidEdge) {
          r.s3BlasterInterruptSub = Math.max(r.s3BlasterInterruptSub || 0, BLASTER_INTERRUPT_SUB);
          r.s3BlasterInterruptSquid = Math.max(r.s3BlasterInterruptSquid || 0, BLASTER_INTERRUPT_SQUID);
          r.s3BlasterCancelLatch = !!intent.fire && (subEdge || squidEdge);
          r.s3BlasterHeldRepeat = false;
        }
      }
    }
    r.s3GateInActor = true;
    try { return actorUpdate.call(this, dt, ...args); }
    finally { r.s3GateInActor = nested; }
  };
  const reset = wr.reset, busy = wr.busy, update = wr.update;
  wr.reset = function (...args) {
    this.s3PostShotRemaining = this.s3DodgeInkRemaining = this.s3DodgeShotRemaining = 0;
    this.s3BlasterInterruptSub = this.s3BlasterInterruptSquid = 0;
    this.s3BlasterHeldRepeat = false; this.s3BlasterCancelLatch = false;
    this.s3GateInActor = false; this.s3GateDodgeShotPending = false;
    return reset.apply(this, args);
  };
  wr.busy = function () { return this.s3PostShotRemaining > EPS || this.s3BlasterInterruptSquid > EPS || busy.call(this); };
  wr.update = function (dt, input) {
    if (!this.s3GateInActor) advance(this, dt);
    const r = this;
    if (!this.a?.intent?.fire) r.s3BlasterCancelLatch = false;
    // The 22F actual-shot lock and the cancellation-edge lock advance in
    // parallel. Sub has the verified 3F boundary; squid uses busy()'s 4F clock.
    const subBlocked = r.s3PostShotRemaining > EPS || r.s3BlasterInterruptSub > EPS;
    const admitted = { ...input,
      get fire() { return r.s3BlasterCancelLatch ? false : input.fire; },
      get firePressed() { return r.s3BlasterCancelLatch ? false : input.firePressed; },
      get sub() { return subBlocked ? false : input.sub; },
      get subReleased() { return subBlocked ? false : input.subReleased; },
    };
    return update.call(this, dt, admitted);
  };
  const charger = wr._charger;
  wr._charger = function (dt, input, w) {
    if (Math.abs(this.cooldown) <= EPS) this.cooldown = 0;
    const before = this.cooldown, releasing = this.s3ReleaseHold || (this.charging && !input.fire);
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
      this.s3DodgeShotRemaining = 0; this.s3GateDodgeShotPending = true;
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
    if (!travelling && this.s3GateDodgeShotPending && input.fire) {
      this.cooldown = 0; this.s3GateDodgeShotPending = false;
    }
    if (Math.abs(this.cooldown) <= EPS) this.cooldown = 0;
    const result = dualies.call(this, dt, input, w);
    if (travelling && !this.dodge) {
      this.s3DodgeShotRemaining = w.rollShotDelay; this.s3GateDodgeShotPending = true;
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
      // The later-installed fidelity owner has already selected the sourced
      // normal/turret collision record. Only legacy non-fidelity shots need
      // this relative-radius fallback; multiplying canonical radii applies it twice.
      p.s3PlayerRadius = p.fidelityPlayerCollision ? null
        : p.size * (a.weaponRunner.s3Turret ? w.playerRadiusAfterRoll / w.playerRadiusNormal : 1);
    }
    return push.call(this, p);
  };
}

