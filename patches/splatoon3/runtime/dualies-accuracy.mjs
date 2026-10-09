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
    this.jumpDecreaseStartFrame = sourceNumber(param, 'Jump_DegBiasDecreaseStartFrame');
    this.jumpEndFrame = sourceNumber(param, 'Jump_DegBiasEndFrame');
    this.groundedEnvelope = sourceNumber(param, 'Stand_DegSwerve');
    this.jumpEnvelope = sourceNumber(param, 'Jump_DegSwerve');
    this.recoveryDelayFrames = DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES;
    if (!Number.isFinite(referenceHz) || referenceHz <= 0 ||
        !Number.isFinite(groundedMaximum) || groundedMaximum < this.minimum ||
        this.increment <= 0 || this.recoveryPerFrame <= 0 ||
        this.jumpMaximum < this.minimum || this.jumpDecreaseStartFrame < 0 ||
        this.jumpEndFrame <= this.jumpDecreaseStartFrame ||
        this.groundedEnvelope < 0 || this.jumpEnvelope < this.groundedEnvelope) {
      throw new Error('Dualies accuracy source values are invalid');
    }
    this.referenceHz = referenceHz;
    this.groundedMaximum = groundedMaximum;
    this.groundedBias = this.minimum;
    this.framesSinceShot = 0;
    this.jumpAgeFrames = null;
  }

  // While a native jump clock is active, expose one continuously sampled
  // bias. Its only jump transition is the sourced maximum at 25F back toward
  // the live grounded bias at 70F; no second inner/outer distribution is used.
  get bias() {
    if (this.jumpAgeFrames == null) return this.groundedBias;
    const progress = this.jumpProgress();
    // The table pins the 25F/70F bounds, not the intervening curve. This
    // linear return toward the live grounded bias is an explicit INKWAVE
    // approximation; it is not a measured Nintendo transition.
    return this.jumpMaximum + (this.groundedBias - this.jumpMaximum) * progress;
  }

  set bias(value) {
    this.groundedBias = value;
  }

  jumpProgress() {
    if (this.jumpAgeFrames == null) return null;
    return Math.min(1, Math.max(0,
      (this.jumpAgeFrames - this.jumpDecreaseStartFrame) /
        (this.jumpEndFrame - this.jumpDecreaseStartFrame)));
  }

  envelopeForJump(grounded = this.groundedEnvelope, airborne = this.jumpEnvelope) {
    if (this.jumpAgeFrames == null) return null;
    const progress = this.jumpProgress();
    // Share that same provisional progress for the angle envelope so landing
    // cannot clamp the jump bias and envelope on separate clocks.
    return airborne + (grounded - airborne) * progress;
  }

  advance(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this.bias;
    const elapsedFrames = dt * this.referenceHz;
    const before = this.framesSinceShot;
    const after = before + elapsedFrames;
    const recoveredBefore = before <= this.recoveryDelayFrames + FRAME_EPSILON
      ? 0 : before - this.recoveryDelayFrames;
    const recoveredAfter = after <= this.recoveryDelayFrames + FRAME_EPSILON
      ? 0 : after - this.recoveryDelayFrames;
    const recoveredFrames = Math.max(0, recoveredAfter - recoveredBefore);
    this.framesSinceShot = after;
    if (this.jumpAgeFrames != null) this.jumpAgeFrames += elapsedFrames;
    if (recoveredFrames > 0 && this.groundedBias > this.minimum)
      this.groundedBias = Math.max(this.minimum,
        this.groundedBias - recoveredFrames * this.recoveryPerFrame);
    return this.bias;
  }

  jump() {
    this.jumpAgeFrames = 0;
    return this.jumpMaximum;
  }

  finishJumpIfLanded(grounded) {
    if (grounded && this.jumpAgeFrames != null &&
        this.jumpAgeFrames + FRAME_EPSILON >= this.jumpEndFrame) {
      this.jumpAgeFrames = null;
    }
    return this.jumpAgeFrames != null;
  }

  applyGroundedCap() {
    if (this.groundedBias > this.groundedMaximum) this.groundedBias = this.groundedMaximum;
    return this.bias;
  }

  recordShot(grounded) {
    this.framesSinceShot = 0;
    if (grounded && this.groundedBias < this.groundedMaximum - FRAME_EPSILON)
      this.groundedBias = Math.min(this.groundedMaximum, this.groundedBias + this.increment);
    return this.bias;
  }

  snapshot() {
    const inHold = this.framesSinceShot <= this.recoveryDelayFrames + FRAME_EPSILON;
    const jumpActive = this.jumpAgeFrames != null;
    const jumpProgress = this.jumpProgress();
    const jumpPhase = !jumpActive ? 'idle'
      : this.jumpAgeFrames <= this.jumpDecreaseStartFrame ? 'held'
        : this.jumpAgeFrames < this.jumpEndFrame ? 'recovering' : 'recovered';
    return {
      bias: this.bias,
      groundedBias: this.groundedBias,
      minimum: this.minimum,
      groundedMaximum: this.groundedMaximum,
      jumpMaximum: this.jumpMaximum,
      framesSinceShot: this.framesSinceShot,
      recoveryDelayFrames: this.recoveryDelayFrames,
      jumpActive,
      jumpAgeFrames: jumpActive ? this.jumpAgeFrames : null,
      jumpDecreaseStartFrame: this.jumpDecreaseStartFrame,
      jumpEndFrame: this.jumpEndFrame,
      jumpProgress,
      jumpPhase,
      envelope: jumpActive ? this.envelopeForJump() : null,
      inHold,
      recovering: !inHold && this.groundedBias > this.minimum + FRAME_EPSILON,
      jumpRecovering: jumpPhase === 'recovering',
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
