// Splat Dualies normal-fire angular-median bias state, in fixed 60 Hz frame units (#891).
// Pinned Ver.11.3.0 values (profile.json weaponsFidelityCompletion.weapons.dualies.WeaponParam,
// Leanny/splat3 7280ff9c WeaponManeuverNormal): Stand_DegBiasMin=.01, Stand_DegBiasKf=.01,
// Stand_DegBiasDecrease=.005 per frame, RepeatFrame=5 (recovery hold after the last
// successful shot), Jump_DegBiasMax=.4.
// The 25% cap is an Inkipedia value, not in the pinned primary table.
// The chance()/shot() API supplies a median ANGLE FRACTION to biasQuantile,
// not Bernoulli outer-ring odds. The exact Nintendo PDF and RNG are 未確認.
// The 25F->70F maximum-angle recovery has its own owner but shares this jump
// clock. Its precise interior and composition with stand bias are 未確認.
// Angular envelope (2 deg grounded / 7.5 deg air) and post-roll spreadLock are not owned here.

import { recoveringJumpBias } from './weapon-accuracy.mjs';
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
    this.jumpParam = {
      Jump_DegBiasDecreaseStartFrame: finiteOr(param.Jump_DegBiasDecreaseStartFrame, 25),
      Jump_DegBiasEndFrame: finiteOr(param.Jump_DegBiasEndFrame, 70),
    };
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
  chance(_grounded, jumpAgeSeconds) {
    return recoveringJumpBias(this.stand, this.jumpBias,
      Number.isFinite(jumpAgeSeconds) ? jumpAgeSeconds * this.hz : null, this.jumpParam);
  }
  // Call once per admitted normal shot. Returns the angular median fraction for that shot.
  shot(grounded, jumpAgeSeconds) {
    const p = this.chance(grounded, jumpAgeSeconds);
    this.stand = Math.min(this.maximum, this.stand + this.step);
    this.sinceShotFrames = 0;
    return p;
  }
}
