const EPS = 1e-10;
const FRAME = 1 / 60;
const DUALIES_ROLL_SUB = 20 * FRAME;
const INSTALLED = Symbol.for('inkwave.s3.issue-eight-followup.v1');

export function rollerDashClockEligible(runner) {
  const a = runner?.a, w = a?.weapon;
  if (!a || w?.kind !== 'roller' || !runner.rolling || !a.grounded || a.form === 'squid') return false;
  const move = a.intent?.move;
  const input = Math.hypot(move?.x || 0, move?.z || 0);
  const speed = Math.hypot(a.vel?.x || 0, a.vel?.z || 0);
  const base = Number.isFinite(w.rollBaseSpeed) ? w.rollBaseSpeed : w.rollSpeed;
  // #1127: the published S3 rule says the dash clock is earned at maximum
  // normal rolling speed. Use that already-profiled speed as the threshold;
  // stationary/partial-input/obstacle-stalled ticks therefore never precharge.
  return input + EPS >= 1 && Number.isFinite(base) && speed + 1e-6 >= base;
}

export function blasterLifetimeStep(projectiles, nativeStep, p, dt) {
  if (p?.type !== 'blast' || !(p.life >= 0) || !(dt > 0)) return nativeStep.call(projectiles, p, dt);
  const remaining = p.life - (p.age || 0);
  if (remaining <= EPS) {
    projectiles._blastBurst(p, p.pos, null);
    return true;
  }
  // #1115: truncate a large step to the exact lifetime crossing. Native collision
  // still owns every valid segment up to the 13F endpoint; no 14th segment exists.
  const span = Math.min(dt, remaining);
  const dead = nativeStep.call(projectiles, p, span);
  if (dead) return true;
  if ((p.age || 0) + EPS >= p.life) {
    projectiles._blastBurst(p, p.pos, null);
    return true;
  }
  return false;
}

export function installIssueEightFollowup({ Actor, WeaponRunner, Projectiles }) {
  if (!Actor?.prototype || !WeaponRunner?.prototype || !Projectiles?.prototype || WeaponRunner.prototype[INSTALLED]) return;
  Object.defineProperty(WeaponRunner.prototype, INSTALLED, { value: true });

  // #1127 — rollT is a continuous maximum-speed rolling clock, not "ZR held".
  const roller = WeaponRunner.prototype._roller;
  WeaponRunner.prototype._roller = function (dt, input, w) {
    if (w?.kind !== 'roller') return roller.call(this, dt, input, w);
    const before = this.rollT || 0;
    const eligible = rollerDashClockEligible(this);
    const result = roller.call(this, dt, input, w);
    if (!this.rolling || !eligible) this.rollT = 0;
    else this.rollT = Math.min(w.rollDashTime ?? Infinity, before + Math.max(0, dt));
    return result;
  };

  // #1104 — the Splat Dualies roll owns a 20F sub-weapon admission clock.
  const tryDodge = WeaponRunner.prototype.tryDodge;
  WeaponRunner.prototype.tryDodge = function (...args) {
    const started = tryDodge.apply(this, args);
    if (started && this.a?.weapon?.kind === 'dualies')
      this.s3DualiesRollSubRemaining = DUALIES_ROLL_SUB;
    return started;
  };

  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    this.s3DualiesRollSubRemaining = 0;
    return reset.apply(this, args);
  };

  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    const r = this.weaponRunner;
    if (r?.s3DualiesRollSubRemaining > 0) {
      if (!this.alive || this.weapon?.kind !== 'dualies' || this.specialActive || this.superJumpState)
        r.s3DualiesRollSubRemaining = 0;
      else {
        const remaining = Math.max(0, r.s3DualiesRollSubRemaining - Math.max(0, dt));
        r.s3DualiesRollSubRemaining = remaining <= EPS ? 0 : remaining;
      }
    }
    return actorUpdate.call(this, dt, ...args);
  };

  const weaponUpdate = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input = {}) {
    if (this.a?.weapon?.kind === 'dualies' && (this.s3DualiesRollSubRemaining || 0) > EPS) {
      return weaponUpdate.call(this, dt, { ...input, sub: false, subReleased: false });
    }
    return weaponUpdate.call(this, dt, input);
  };

  // #1115 — inclusive source-backed Blaster lifetime, installed after the
  // fidelity wrapper so the final gameplay step cannot create a 14th segment.
  const projectileStep = Projectiles.prototype._step;
  Projectiles.prototype._step = function (p, dt) {
    return blasterLifetimeStep(this, projectileStep, p, dt);
  };
}

export { DUALIES_ROLL_SUB };
