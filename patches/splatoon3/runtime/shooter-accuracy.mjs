// Shooter/Dualies angular-bias state, in fixed 60 Hz frame units.
// Bias is not an outer-reticle probability; see weapon-accuracy.mjs.
// Pinned Leanny 11.3.0 WeaponShooterNormal (sha256 dfca9f45...) WeaponParam supplies:
// Stand_DegBiasMin=.01, Stand_DegBiasKf=.01, Stand_DegBiasDecrease=.015 (per frame;
// the unit is not stated in the file, per-frame agrees with Inkipedia 1.5%/F),
// Jump_DegBiasMax=.4, Jump_DegBiasDecreaseStartFrame=25, Jump_DegBiasEndFrame=70.
// NOT in the pinned file, from Inkipedia (community) only, unverified against
// official data: the 25% outer-chance cap and the 6F stop/recovery gate.
// Unverified: the linear 25F->70F jump interpolation shape, and the inner-shot
// angular kernel (provisional spreadFirst fraction in weapons.mjs).
export const OUTER_CHANCE_CAP = .25; // 未確認 (Inkipedia only)
export const RECOVERY_GATE_FRAMES = 6; // 未確認 (Inkipedia only)
export class ShooterAccuracy {
  constructor(param = {}, hz = 60) {
    if (!Number.isFinite(hz) || hz <= 0) throw new RangeError('Accuracy frequency must be positive');
    this.hz = hz;
    this.maximum = Number.isFinite(param.Stand_DegBiasMax) ? param.Stand_DegBiasMax : .25;
    this.recoveryFrames = Number.isFinite(param.RepeatFrame) ? Math.max(0, param.RepeatFrame) : 6;
    this.minimum = Number.isFinite(param.Stand_DegBiasMin) ? param.Stand_DegBiasMin : .01;
    this.step = Number.isFinite(param.Stand_DegBiasKf) ? param.Stand_DegBiasKf : .01;
    this.recovery = Number.isFinite(param.Stand_DegBiasDecrease) ? param.Stand_DegBiasDecrease : .015;
    this.jumpBias = Number.isFinite(param.Jump_DegBiasMax) ? param.Jump_DegBiasMax : .4;
    this.jumpStart = Number.isFinite(param.Jump_DegBiasDecreaseStartFrame) ? param.Jump_DegBiasDecreaseStartFrame : 25;
    this.jumpEnd = Number.isFinite(param.Jump_DegBiasEndFrame) ? param.Jump_DegBiasEndFrame : 70;
    this.stand = this.minimum;
    this.sinceShotFrames = 0;
  }
  advance(dt) {
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    const frames = dt * this.hz;
    const previous = this.sinceShotFrames;
    this.sinceShotFrames += frames;
    const after = Math.max(0, this.sinceShotFrames - RECOVERY_GATE_FRAMES);
    const before = Math.max(0, previous - RECOVERY_GATE_FRAMES);
    if (after > before) this.stand = Math.max(this.minimum, this.stand - (after - before) * this.recovery);
  }
  chance(grounded, jumpAgeSeconds) {
    if (Number.isFinite(jumpAgeSeconds)) {
      const f = jumpAgeSeconds * this.hz;
      if (f <= this.jumpStart) return this.jumpBias;
      if (f < this.jumpEnd) return this.jumpBias + (this.stand - this.jumpBias) * (f - this.jumpStart) / (this.jumpEnd - this.jumpStart);
    }
    return Number.isFinite(jumpAgeSeconds) || grounded ? this.stand : this.jumpBias;
  }
  shot(grounded, jumpAgeSeconds) {
    const p = this.chance(grounded, jumpAgeSeconds);
    this.stand = Math.min(OUTER_CHANCE_CAP, this.stand + this.step);
    this.sinceShotFrames = 0;
    return p;
  }
}
