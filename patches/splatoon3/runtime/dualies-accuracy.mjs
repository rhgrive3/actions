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
