// Authoritative Splattershot outer-shot probability, in fixed 60 Hz frame units.
// Referenced parameters: Stand_DegBiasMin=.01, Kf=.01, max=.25,
// Decrease=.015, stop/recovery gate=6f; Jump_DegBiasMax=.4,
// Jump decrease start=25f, end=70f. Inner-shot angular kernel remains
// explicitly provisional until verified independently.
export class ShooterAccuracy {
  constructor(param = {}, hz = 60) {
    this.hz = hz;
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
    const frames = Math.max(0, dt) * this.hz;
    const previous = this.sinceShotFrames;
    this.sinceShotFrames += frames;
    const after = Math.max(0, this.sinceShotFrames - 6);
    const before = Math.max(0, previous - 6);
    if (after > before) this.stand = Math.max(this.minimum, this.stand - (after - before) * this.recovery);
  }
  chance(grounded, jumpAgeSeconds) {
    if (!grounded) return this.jumpBias;
    if (Number.isFinite(jumpAgeSeconds)) {
      const f = jumpAgeSeconds * this.hz;
      if (f <= this.jumpStart) return this.jumpBias;
      if (f < this.jumpEnd) return this.jumpBias + (this.stand - this.jumpBias) * (f - this.jumpStart) / (this.jumpEnd - this.jumpStart);
    }
    return this.stand;
  }
  shot(grounded, jumpAgeSeconds) {
    const p = this.chance(grounded, jumpAgeSeconds);
    this.stand = Math.min(.25, this.stand + this.step);
    this.sinceShotFrames = 0;
    return p;
  }
}
