// Splat Dualies' outer-reticle bias state from the pinned Ver.11.3.0
// WeaponParam plus the current Inkipedia-documented grounded cap.
// Values are bias fractions (for example 0.01 = 1%), and elapsed time is
// converted to the source's 60 Hz frame units.
export const DUALIES_GROUNDED_BIAS_MAX = 0.25;
// Inkipedia documents this hold after the last fired shot.
export const DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES = 5;
const FRAME_EPSILON = 1e-10;

function sourceNumber(param, key) {
  const value = param?.[key];
  if (!Number.isFinite(value)) throw new Error(`Dualies accuracy source is missing ${key}`);
  return value;
}

export class DualiesAccuracy {
  constructor(param, referenceHz, groundedMaximum = DUALIES_GROUNDED_BIAS_MAX) {
    this.minimum = sourceNumber(param, 'Stand_DegBiasMin');
    this.increment = sourceNumber(param, 'Stand_DegBiasKf');
    this.recoveryPerFrame = sourceNumber(param, 'Stand_DegBiasDecrease');
    this.jumpMaximum = sourceNumber(param, 'Jump_DegBiasMax');
    this.recoveryDelayFrames = DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES;
    if (!Number.isFinite(referenceHz) || referenceHz <= 0 ||
        !Number.isFinite(groundedMaximum) || groundedMaximum < this.minimum ||
        this.increment <= 0 || this.recoveryPerFrame <= 0 ||
        this.jumpMaximum < this.minimum) {
      throw new Error('Dualies accuracy source values are invalid');
    }
    this.referenceHz = referenceHz;
    this.groundedMaximum = groundedMaximum;
    this.bias = this.minimum;
    this.framesSinceShot = 0;
  }

  advance(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this.bias;
    const before = this.framesSinceShot;
    const after = before + dt * this.referenceHz;
    const recoveredBefore = before <= this.recoveryDelayFrames + FRAME_EPSILON
      ? 0 : before - this.recoveryDelayFrames;
    const recoveredAfter = after <= this.recoveryDelayFrames + FRAME_EPSILON
      ? 0 : after - this.recoveryDelayFrames;
    const recoveredFrames = Math.max(0, recoveredAfter - recoveredBefore);
    this.framesSinceShot = after;
    if (recoveredFrames > 0 && this.bias > this.minimum)
      this.bias = Math.max(this.minimum, this.bias - recoveredFrames * this.recoveryPerFrame);
    return this.bias;
  }

  jump() {
    this.bias = this.jumpMaximum;
    return this.bias;
  }

  applyGroundedCap() {
    if (this.bias > this.groundedMaximum) this.bias = this.groundedMaximum;
    return this.bias;
  }

  recordShot(grounded) {
    this.framesSinceShot = 0;
    if (grounded && this.bias < this.groundedMaximum - FRAME_EPSILON)
      this.bias = Math.min(this.groundedMaximum, this.bias + this.increment);
    return this.bias;
  }

  snapshot() {
    const inHold = this.framesSinceShot <= this.recoveryDelayFrames + FRAME_EPSILON;
    return {
      bias: this.bias,
      minimum: this.minimum,
      groundedMaximum: this.groundedMaximum,
      jumpMaximum: this.jumpMaximum,
      framesSinceShot: this.framesSinceShot,
      recoveryDelayFrames: this.recoveryDelayFrames,
      inHold,
      recovering: !inHold && this.bias > this.minimum + FRAME_EPSILON,
    };
  }
}

// #891 source-backed bias transform. The pinned Leanny table supplies the
// per-weapon bias states and maximum angle; the Inkipedia draft
// User:XarrotD/Data Explanation documents y = s * x^(log_0.5 b), where x is
// one uniform draw, s is the maximum deviation angle, and b is bias. That
// write-up is marked draft/conjecture, so this is a documented model, not a
// claim that Nintendo has published its runtime RNG implementation.
//
// Values remain fractions (0.01 = 1%), envelopes remain degrees, and x uses
// Math.random's [0, 1) range. The separate azimuth draw in spreadWeaponRound
// supplies the radial direction without adding or reordering random draws.
// A missing runner state uses the wiki model's b=0.5 flat-angle case as an
// explicit neutral fallback for source-less fixtures only.
export const DUALIES_BIAS_UNAVAILABLE_FALLBACK = 0.5;

export function dualiesBiasRadius(draw, envelopeDeg, bias = DUALIES_BIAS_UNAVAILABLE_FALLBACK) {
  if (!Number.isFinite(envelopeDeg) || envelopeDeg <= 0) return 0;
  const b = Number.isFinite(bias) ? Math.min(1, Math.max(0, bias)) : DUALIES_BIAS_UNAVAILABLE_FALLBACK;
  if (b === 0) return 0;
  if (b === 1) return envelopeDeg;
  const x = Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 0;
  if (x === 0) return 0;
  return envelopeDeg * Math.pow(x, Math.log(b) / Math.log(0.5));
}
