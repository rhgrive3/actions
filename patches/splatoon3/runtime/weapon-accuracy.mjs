import { ShooterAccuracy } from './shooter-accuracy.mjs';

const INSTALLED = Symbol.for('inkwave.s3.weapon-accuracy.v2');
const finite = (x, otherwise) => Number.isFinite(x) ? x : otherwise;
const clamp01 = x => Math.max(0, Math.min(1, x));

/**
 * Sourced jump hold/recovery endpoints. The interpolation between the endpoints
 * is explicitly the retained linear calibration, not a recovered Nintendo PDF.
 */
export function accuracyEnvelope(weapon, grounded, jumpAge, param = {}, hz = 60) {
  const ground = Math.max(0, finite(weapon.spreadGround, 0));
  const air = Math.max(0, finite(weapon.spreadAir, ground));
  if (!Number.isFinite(jumpAge)) return grounded ? ground : air;
  const start = finite(param.Jump_DegBiasDecreaseStartFrame, 25);
  const end = Math.max(start, finite(param.Jump_DegBiasEndFrame, 70));
  const frames = Math.max(0, jumpAge * hz);
  if (frames <= start) return air;
  if (frames >= end) return ground;
  return air + (ground - air) * (frames - start) / (end - start);
}

/**
 * Community-supported angular gamma calibration, NOT Nintendo executable code.
 * y = s * u ** (log(b)/log(0.5)); b is a median ANGLE FRACTION, not
 * Bernoulli outer-ring odds. Independently analysed for Splatoon 3 in 2024:
 * https://note.com/kanamoji_1027/n/nfd4a961652a6
 * https://note.com/kanamoji_1027/n/na3307fdc69e7
 * Earlier S2 derivation: https://parumemo.hatenablog.com/entry/2022/08/26/144547
 * The CDF is P(angle <= s*r) = r ** (log(0.5)/log(b)).
 * The joint horizontal/vertical 2-D PDF and production game PRNG call path
 * remain unverified; we retain the existing per-axis launcher semantics.
 */
export function biasQuantile(u, bias) {
  const x = clamp01(finite(u, 0));
  const b = clamp01(finite(bias, .5));
  if (b <= 0 || x <= 0) return 0;
  if (x >= 1) return 1;
  if (b >= 1) return 1;
  return Math.pow(x, Math.log(b) / Math.log(.5));
}

// Ephemeral, synchronous launch context: no extra random draw, no actor-wide
// permanent override, and cleanup even when a launch hook throws/re-enters.
export function withShotBias(actor, bias, pitchBias, launch) {
  const r = actor?.weaponRunner;
  if (!r) return launch();
  const previous = r.s3ShotBias;
  r.s3ShotBias = { horizontal: bias, pitch: pitchBias };
  try { return launch(); } finally { r.s3ShotBias = previous; }
}

export function installWeaponAccuracy({ WeaponRunner, Projectiles }, profile) {
  if (WeaponRunner.prototype[INSTALLED]) return;
  Object.defineProperty(WeaponRunner.prototype, INSTALLED, { value: true });
  const completion = profile.weaponsFidelityCompletion;
  const hz = finite(completion?.hz, 60);
  const dualiesParam = completion?.weapons?.dualies?.WeaponParam ?? {};
  const spinParam = completion?.weapons?.splatling?.WeaponParam ?? {};

  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3DualiesAccuracy = new ShooterAccuracy(dualiesParam, hz);
    this.s3DualiesJumpAge = null;
    this.s3DualiesWasGrounded = !!this.a?.grounded;
    return result;
  };
  const update = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    if (this.a.weapon.kind === 'dualies') {
      const grounded = !!this.a.grounded;
      // Age belongs to elapsed simulation time, not the number of rendered
      // frames or how long ZR has been released. Empty held fire also recovers.
      this.s3DualiesAccuracy?.advance(dt);
      if (this.s3DualiesWasGrounded && !grounded) this.s3DualiesJumpAge = 0;
      else if (this.s3DualiesJumpAge != null && Number.isFinite(dt) && dt > 0)
        this.s3DualiesJumpAge += dt;
      if (grounded && this.s3DualiesJumpAge != null && this.s3DualiesJumpAge * hz >= finite(dualiesParam.Jump_DegBiasEndFrame, 70))
        this.s3DualiesJumpAge = null;
      this.s3DualiesWasGrounded = grounded;
    }
    return update.call(this, dt, input);
  };
  const spread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._spreadDeg = function (weapon) {
    if (weapon.kind !== 'dualies') return spread.call(this, weapon);
    if (this.s3Turret || this.lockT > 0) return weapon.spreadLock;
    return accuracyEnvelope(weapon, !!this.a.grounded, this.s3DualiesJumpAge, dualiesParam, hz);
  };
  const fireDualies = Projectiles.prototype.fireDualies;
  Projectiles.prototype.fireDualies = function (actor, weapon, spreadDeg, hand) {
    const runner = actor.weaponRunner;
    const locked = runner?.s3Turret || runner?.lockT > 0;
    let envelope = Number.isFinite(spreadDeg) ? spreadDeg
      : accuracyEnvelope(weapon, !!actor.grounded, runner?.s3DualiesJumpAge, dualiesParam, hz);
    if (locked) envelope = weapon.spreadLock;
    else if (runner?.s3DualiesAccuracy) {
      const bias = runner.s3DualiesAccuracy.shot(!!actor.grounded, runner.s3DualiesJumpAge);
      return withShotBias(actor, bias, bias,
        () => fireDualies.call(this, actor, weapon, envelope, hand));
    }
    return fireDualies.call(this, actor, weapon, envelope, hand);
  };
  const fireSplatling = Projectiles.prototype.fireSplatling;
  Projectiles.prototype.fireSplatling = function (actor, weapon, spreadDeg) {
    const age = Number.isFinite(actor.s3SplatlingJumpAgeFrames)
      ? actor.s3SplatlingJumpAgeFrames / hz : null;
    const full = Number.isFinite(spreadDeg) ? spreadDeg
      : accuracyEnvelope(weapon, !!actor.grounded, age, spinParam, hz);
    const bias = actor.grounded ? spinParam.Stand_DegBiasMax : spinParam.Jump_DegBiasMax;
    return withShotBias(actor, bias, spinParam.PitchDegBias,
      () => fireSplatling.call(this, actor, weapon, full));
  };
}
