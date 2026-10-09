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

// #891 conditional inner/outer reticle distribution.
//
// Sourced: the pinned Ver.11.3.0 bias chance (`Stand_DegBiasMin`,
// `Stand_DegBiasKf`, `Stand_DegBiasDecrease`, `Jump_DegBiasMax`), the maximum
// deviation envelopes (`Stand_DegSwerve`, `Jump_DegSwerve`), and Inkipedia's
// wording that the chance selects the outer rather than the inner reticle.
// Not sourced: either reticle's angular kernel, the retail selection rule, and
// the retail random seed. The #891 entry in
// reports/inkwave-splatoon3-behavior-2026-10-02.md records that sampling
// audit and keeps these limits unverified.
//
// Documented local approximation — INKWAVE behavior, not a retail PDF claim:
// the existing radial draw doubles as the sourced selection chance. A draw
// above `1 - bias` selects the outer-reticle kernel, drawn area-uniform over
// the full sourced envelope; otherwise the inner-reticle kernel is drawn
// area-uniform over `innerFraction * envelope`. The outer share of the draw
// stream therefore equals the sourced chance exactly, while the other shots
// keep a real scatter band instead of the perfect 0° center that an earlier
// draft invented. Each kernel keeps the established `r = band * sqrt(u)`
// radial law with its own conditional uniform, so one radial draw does both
// jobs: the composed Dualies path keeps its two spread draws plus the
// projectile-seed draw, in their existing order and count, and no extra bias
// coin flip is consumed.
export const DUALIES_INNER_ENVELOPE_FALLBACK = 0.45;

function innerScale(innerFraction) {
  if (!Number.isFinite(innerFraction) || innerFraction <= 0)
    return DUALIES_INNER_ENVELOPE_FALLBACK;
  return Math.min(1, innerFraction);
}

function biasFraction(bias) {
  // A runner without the composed state (for example a stub network fixture
  // actor) falls back to bias 1, which reproduces the legacy full-envelope
  // radial law exactly.
  if (!Number.isFinite(bias)) return 1;
  return Math.min(1, Math.max(0, bias));
}

// Radial draw above this boundary selects the outer reticle, so exactly
// clamp01(bias) of the draw stream takes the outer kernel.
export function dualiesOuterThreshold(bias) {
  return 1 - biasFraction(bias);
}

// One-draw sample of the conditional mixture, in degrees.
export function dualiesBiasRadius(draw, envelopeDeg, bias, innerFraction = DUALIES_INNER_ENVELOPE_FALLBACK) {
  if (!(envelopeDeg > 0)) return 0;
  const p = biasFraction(bias), k = innerScale(innerFraction);
  const u = Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 0;
  if (p >= 1 || u > 1 - p) {
    // Outer kernel: area-uniform over the full sourced envelope.
    return envelopeDeg * Math.sqrt(p >= 1 ? u : (u - (1 - p)) / p);
  }
  // Inner kernel: area-uniform over the inner band, never a 0° center.
  return envelopeDeg * k * Math.sqrt(u / (1 - p));
}
