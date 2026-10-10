// Splat Dualies normal-fire outer-reticle bias state, in fixed 60 Hz frame units (#891).
// Pinned Ver.11.3.0 values (profile.json weaponsFidelityCompletion.weapons.dualies.WeaponParam,
// Leanny/splat3 7280ff9c WeaponManeuverNormal): Stand_DegBiasMin=.01, Stand_DegBiasKf=.01,
// Stand_DegBiasDecrease=.005 per frame, RepeatFrame=5 (recovery hold after the last
// successful shot), Jump_DegBiasMax=.4.
// The 25% cap is not in the pinned table; it is the Inkipedia Splat Dualies value and remains
// 未確認 against primary data. The per-shot outer-selection model mirrors shooter-accuracy.mjs
// and is 未確認 for Dualies in primary sources. The 25F->70F jump-envelope recovery is separate
// (not owned here) and the post-landing bias transition is 未確認: grounded returns the stand
// state directly, so the 40% airborne bias never persists after landing.
// Angular envelope (2 deg grounded / 7.5 deg air) and post-roll spreadLock are not owned here.

const finiteOr = (x, otherwise) => (Number.isFinite(x) ? x : otherwise);

export class DualiesAccuracy {
  constructor(param = {}, hz = 60) {
    if (!Number.isFinite(hz) || hz <= 0) throw new RangeError('Accuracy frequency must be positive');
    this.hz = hz;
    this.minimum = finiteOr(param.Stand_DegBiasMin, .01);
    this.step = finiteOr(param.Stand_DegBiasKf, .01);
    this.recovery = finiteOr(param.Stand_DegBiasDecrease, .005);
    this.holdFrames = Math.max(0, finiteOr(param.RepeatFrame, 5));
    this.jumpBias = finiteOr(param.Jump_DegBiasMax, .4);
    this.maximum = finiteOr(param.Stand_DegBiasMax, .25);
    this.stand = this.minimum;
    this.sinceShotFrames = 0;
  }
  // Recovery counts only frames after the hold window that follows the last admitted shot.
  // Elapsed simulation time is accumulated, so 30/60/120 Hz rendering with the same fixed
  // update yields the same recovery boundary.
  advance(dt) {
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    const previous = this.sinceShotFrames;
    this.sinceShotFrames += dt * this.hz;
    const after = Math.max(0, this.sinceShotFrames - this.holdFrames);
    const before = Math.max(0, previous - this.holdFrames);
    if (after > before) this.stand = Math.max(this.minimum, this.stand - (after - before) * this.recovery);
  }
  chance(grounded) {
    return grounded ? this.stand : this.jumpBias;
  }
  // Call once per admitted normal shot. Returns the outer-reticle chance for that shot.
  shot(grounded) {
    const p = this.chance(grounded);
    this.stand = Math.min(this.maximum, this.stand + this.step);
    this.sinceShotFrames = 0;
    return p;
  }
}
