const INSTALLED_SPLATLING = Symbol.for('inkwave.s3.weapon-accuracy.splatling.v3');
const finite = (x, otherwise) => Number.isFinite(x) ? x : otherwise;
const clamp01 = x => Math.max(0, Math.min(1, x));

/**
 * Sourced jump hold/recovery endpoints, shared by every angular family.
 * Only an admitted jump owns a penalty; an absent clock means normal accuracy
 * even during a ledge fall. Landing does not change the recovery trajectory.
 * The interior remains INKWAVE's linear calibration: the pinned 11.3.0 tables
 * and Kanamoji #6 publish endpoints, not Nintendo's interpolation routine.
 */
export function jumpRecoveryAt(ageFrames, param = {}) {
  if (!Number.isFinite(ageFrames)) return null;
  const start = Math.max(0, finite(param.Jump_DegBiasDecreaseStartFrame, 25));
  const end = Math.max(start, finite(param.Jump_DegBiasEndFrame, 70));
  const frames = Math.max(0, ageFrames);
  if (frames >= end) return 1;
  if (frames <= start) return 0;
  return (frames - start) / (end - start);
}

export function accuracyEnvelope(weapon, _grounded, jumpAge, param = {}, hz = 60) {
  const ground = Math.max(0, finite(weapon.spreadGround, 0));
  const air = Math.max(0, finite(weapon.spreadAir, ground));
  const recovery = jumpRecoveryAt(Number.isFinite(jumpAge) ? jumpAge * hz : null, param);
  return recovery === null || recovery === 1 ? ground : recovery === 0 ? air : air + (ground - air) * recovery;
}

// Keep the standing process independent while a jump recovers. This retains
// the existing Shooter interpolation model; its precise composition with the
// standing bias remains unverified against the Nintendo executable.
export function recoveringJumpBias(standing, jumping, ageFrames, param = {}) {
  const stand = clamp01(finite(standing, .5));
  const jump = clamp01(finite(jumping, stand));
  const recovery = jumpRecoveryAt(ageFrames, param);
  return recovery === null || recovery === 1 ? stand : recovery === 0 ? jump : jump + (stand - jump) * recovery;
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
    const bias = recoveringJumpBias(param.Stand_DegBiasMax, param.Jump_DegBiasMax,
      actor.s3SplatlingJumpAgeFrames, param);
    const maximum = Number.isFinite(spreadDeg) ? spreadDeg : accuracyEnvelope(weapon,
      actor.grounded, Number.isFinite(actor.s3SplatlingJumpAgeFrames) ? actor.s3SplatlingJumpAgeFrames / 60 : null, param);
    return withShotBias(actor, bias, param.PitchDegBias,
      () => fireSplatling.call(this, actor, weapon, maximum));
  };
}
