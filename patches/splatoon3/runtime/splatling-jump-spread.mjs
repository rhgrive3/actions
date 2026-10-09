const HOLD_FRAMES = 25;
const RECOVERY_END_FRAMES = 70;
const SIMULATION_HZ = 60;
const INSTALLED = Symbol.for('inkwave.s3.splatling-jump-spread.v1');

// The pinned 11.3.0 tables publish the hold and end frames, not the curve
// between them. This is an internal monotone linear interpolation, not a claim
// about Nintendo's unpublished intermediate curve.
//
// #887: Splat Dualies (WeaponManeuverNormal) publishes the same
// Jump_DegBiasDecreaseStartFrame=25 / Jump_DegBiasEndFrame=70 boundaries as
// WeaponSpinnerStandard, plus Jump_DegSwerve=7.5 / Stand_DegSwerve=2. The
// shared age machine drives both families; the post-roll LapOver_DegSwerve
// turret cone stays a separate Dualies state.
export function splatlingJumpRecoveryAt(ageFrames) {
  if (!Number.isFinite(ageFrames)) return null;
  return Math.max(0, Math.min(1, (ageFrames - HOLD_FRAMES) / (RECOVERY_END_FRAMES - HOLD_FRAMES)));
}

function clearJumpSpread(actor) {
  if (!actor) return;
  actor.s3SplatlingJumpAgeFrames = null;
  actor.s3SplatlingJumpSpreadPending = false;
}

function advanceJumpSpread(actor, dt) {
  if (!actor || !(Number.isFinite(dt) && dt > 0)) return;
  if (actor.s3SplatlingJumpSpreadPending) {
    actor.s3SplatlingJumpSpreadPending = false;
    return;
  }
  if (!Number.isFinite(actor.s3SplatlingJumpAgeFrames)) return;
  actor.s3SplatlingJumpAgeFrames = Math.min(
    RECOVERY_END_FRAMES,
    actor.s3SplatlingJumpAgeFrames + dt * SIMULATION_HZ,
  );
  if (actor.s3SplatlingJumpAgeFrames >= RECOVERY_END_FRAMES && actor.grounded) clearJumpSpread(actor);
}

function beginJumpSpread(actor) {
  if (!actor) return;
  actor.s3SplatlingJumpAgeFrames = 0;
  actor.s3SplatlingJumpSpreadPending = true;
}

export function installSplatlingJumpSpread({ Actor, WeaponRunner, on }) {
  if (Actor.prototype[INSTALLED]) return;
  Object.defineProperty(Actor.prototype, INSTALLED, { value: true });

  if (typeof on === 'function') on('actor:jump', ({ actor }) => beginJumpSpread(actor));

  const resetActor = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const result = resetActor.apply(this, args);
    clearJumpSpread(this);
    return result;
  };

  const onDeath = WeaponRunner.prototype.onDeath;
  WeaponRunner.prototype.onDeath = function (...args) {
    const result = onDeath.apply(this, args);
    clearJumpSpread(this.a);
    return result;
  };

  const update = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    advanceJumpSpread(this.a, dt);
    return update.call(this, dt, input);
  };

  const spread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._spreadDeg = function (weapon) {
    const jumpKind = weapon.kind === 'splatling' || weapon.kind === 'dualies';
    const recovery = jumpKind
      ? splatlingJumpRecoveryAt(this.a.s3SplatlingJumpAgeFrames)
      : null;
    // The legal post-roll Dualies turret cone (LapOver_DegSwerve) is independent
    // of the jump-accuracy recovery and must stay owned by the native turret path.
    if (recovery === null || (weapon.kind === 'dualies' && this.s3Turret) ||
        !Number.isFinite(weapon.spreadAir) || !Number.isFinite(weapon.spreadGround)) {
      return spread.call(this, weapon);
    }
    const first = weapon.spreadFirst ?? 0.45;
    const bloom = first + (1 - first) * this.bloom;
    const base = weapon.spreadAir + (weapon.spreadGround - weapon.spreadAir) * recovery;
    return base * bloom;
  };
}
