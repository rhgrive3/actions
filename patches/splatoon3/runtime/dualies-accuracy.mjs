// Splat Dualies normal-fire bias from the pinned Ver. 11.3.0 WeaponParam.
// Bias values are fractions (0.01 means 1%); the Wiki documents the grounded
// cap and recovery hold. The jump value is active only during an admitted jump.
export const DUALIES_GROUNDED_BIAS_MAX = 0.25;
export const DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES = 5;
const FRAME_EPSILON = 1e-10;

function sourceNumber(param, key) {
  const value = param?.[key];
  if (!Number.isFinite(value)) throw new Error('Dualies accuracy source is missing ' + key);
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
        this.jumpMaximum < this.minimum || this.jumpMaximum > 1) {
      throw new Error('Dualies accuracy source values are invalid');
    }
    this.referenceHz = referenceHz;
    this.groundedMaximum = groundedMaximum;
    this.groundedBias = this.minimum;
    this.framesSinceShot = 0;
    this.jumpActive = false;
  }

  get bias() {
    return this.jumpActive ? this.jumpMaximum : this.groundedBias;
  }

  advance(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this.bias;
    const before = this.framesSinceShot;
    const after = before + dt * this.referenceHz;
    const recovered = Math.max(0, after - this.recoveryDelayFrames) -
      Math.max(0, before - this.recoveryDelayFrames);
    this.framesSinceShot = after;
    if (recovered > 0 && this.groundedBias > this.minimum) {
      this.groundedBias = Math.max(this.minimum,
        this.groundedBias - recovered * this.recoveryPerFrame);
    }
    return this.bias;
  }

  enterJump() {
    this.jumpActive = true;
    return this.bias;
  }

  land() {
    this.jumpActive = false;
    return this.bias;
  }

  recordShot(grounded) {
    this.framesSinceShot = 0;
    if (grounded && !this.jumpActive && this.groundedBias < this.groundedMaximum - FRAME_EPSILON) {
      this.groundedBias = Math.min(this.groundedMaximum, this.groundedBias + this.increment);
    }
    return this.bias;
  }

  snapshot(turret = false) {
    return {
      bias: this.bias,
      groundedBias: this.groundedBias,
      minimum: this.minimum,
      groundedMaximum: this.groundedMaximum,
      jumpMaximum: this.jumpMaximum,
      framesSinceShot: this.framesSinceShot,
      recoveryDelayFrames: this.recoveryDelayFrames,
      jumpActive: this.jumpActive,
      inHold: this.framesSinceShot <= this.recoveryDelayFrames + FRAME_EPSILON,
      recovering: this.framesSinceShot > this.recoveryDelayFrames + FRAME_EPSILON &&
        this.groundedBias > this.minimum + FRAME_EPSILON,
      turret: !!turret,
    };
  }
}

// Inkipedia's draft/conjecture describes y = s * x^(log_0.5 b), with a
// uniform x, angular envelope s, and bias b. This is a public Wiki model, not
// a Nintendo-published or Switch-measured RNG specification.
export function dualiesBiasRadius(draw, envelopeDeg, bias) {
  if (!Number.isFinite(envelopeDeg) || envelopeDeg <= 0) return 0;
  if (!Number.isFinite(bias) || bias <= 0 || bias > 1) {
    throw new RangeError('Dualies sampling requires a sourced bias fraction');
  }
  const x = Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 0;
  if (x === 0) return 0;
  if (bias === 1) return envelopeDeg;
  return envelopeDeg * Math.pow(x, Math.log(bias) / Math.log(0.5));
}
