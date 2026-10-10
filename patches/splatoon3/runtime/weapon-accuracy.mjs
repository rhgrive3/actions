const INSTALLED_SPLATLING = Symbol.for('inkwave.s3.weapon-accuracy.splatling.v3');
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

/**
 * The weapon runner already owns Shooter and Dualies admission, reset,
 * recovery clocks and scalar envelopes in weapons.mjs. Do not wrap these a
 * second time here: it would advance the Dualies bias twice, consume another
 * bias sample for direct shots and bypass its jump/turret admission rules.
 *
 * Splatling has a separate pitch-bias field, so this hook only supplies the
 * ephemeral per-axis launch context; movement and firing state remain owned
 * by their original adapters. The source angles are retained without the
 * previous unsourced bloom multiplier.
 */
export function installWeaponAccuracy({ Projectiles }, profile) {
  if (Projectiles.prototype[INSTALLED_SPLATLING]) return;
  Object.defineProperty(Projectiles.prototype, INSTALLED_SPLATLING, { value: true });
  const param = profile.weaponsFidelityCompletion?.weapons?.splatling?.WeaponParam ?? {};
  const fireSplatling = Projectiles.prototype.fireSplatling;
  Projectiles.prototype.fireSplatling = function (actor, weapon, spreadDeg) {
    const bias = actor.grounded ? param.Stand_DegBiasMax : param.Jump_DegBiasMax;
    return withShotBias(actor, bias, param.PitchDegBias,
      () => fireSplatling.call(this, actor, weapon, spreadDeg));
  };
}
