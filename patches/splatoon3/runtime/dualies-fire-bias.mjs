// Grounded normal-fire bias for Splat Dualies. The numeric progression comes
// from the pinned Ver.11.3.0 WeaponManeuverNormal parameter row; the original
// per-shot angular distribution is not published by that row.
export function installDualiesFireBias(api, profile) {
  const { WeaponRunner, Projectiles } = api;
  const params = profile?.weaponsFidelityCompletion?.weapons?.dualies?.WeaponParam;
  const hz = profile?.referenceHz;
  const min = params?.Stand_DegBiasMin;
  const increment = params?.Stand_DegBiasKf;
  const max = 0.25;
  const holdFrames = params?.RepeatFrame;
  const recoverPerFrame = params?.Stand_DegBiasDecrease;
  if (profile?.referenceVersion !== '11.3.0' || !Number.isFinite(hz) || hz <= 0
    || !Number.isFinite(min) || !Number.isFinite(increment) || !Number.isFinite(holdFrames)
    || !Number.isFinite(recoverPerFrame) || min !== 0.01 || increment !== 0.01
    || holdFrames !== 5 || recoverPerFrame !== 0.005) {
    throw new Error('Unsupported Splat Dualies normal-fire bias reference');
  }

  const originalReset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const result = originalReset.apply(this, args);
    this.s3DualiesFireBias = min;
    this.s3DualiesFireBiasShotCount = 0;
    this.s3DualiesFireBiasReleaseFrames = 0;
    this.s3DualiesFireBiasRecoveredFrames = 0;
    this.s3DualiesFireBiasSampleOuter = null;
    this.s3DualiesFireBiasSampling = false;
    return result;
  };

  WeaponRunner.prototype.s3DualiesFireBiasState = function (weapon = this.a?.weapon) {
    const supported = weapon?.kind === 'dualies';
    const active = supported && !!this.a?.grounded && this.a?.form === 'kid'
      && !this.s3Turret && !(this.lockT > 0);
    const releaseFrames = this.s3DualiesFireBiasReleaseFrames || 0;
    const phase = !supported || this.s3DualiesFireBiasShotCount === 0 ? 'idle'
      : releaseFrames > holdFrames ? (this.s3DualiesFireBias > min ? 'recovering' : 'idle')
        : releaseFrames > 0 ? 'holding' : 'firing';
    return { supported, active, bias: this.s3DualiesFireBias ?? min, phase,
      shotCount: this.s3DualiesFireBiasShotCount || 0, releaseFrames,
      distribution: 'unknown' };
  };

  const originalUpdate = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    const shotsBefore = this.s3DualiesFireBiasShotCount || 0;
    const result = originalUpdate.call(this, dt, input);
    if (this.a?.weapon?.kind !== 'dualies') return result;
    const frames = Number.isFinite(dt) && dt > 0 ? dt * hz : 0;
    const shotsAfter = this.s3DualiesFireBiasShotCount || 0;
    if (shotsAfter !== shotsBefore) {
      this.s3DualiesFireBiasReleaseFrames = 0;
      this.s3DualiesFireBiasRecoveredFrames = 0;
      return result;
    }
    if (input?.fire) {
      this.s3DualiesFireBiasReleaseFrames = 0;
      this.s3DualiesFireBiasRecoveredFrames = 0;
      return result;
    }
    const age = (this.s3DualiesFireBiasReleaseFrames || 0) + frames;
    const recovered = Math.max(0, Math.floor(age - holdFrames + 1e-9));
    const previousRecovered = this.s3DualiesFireBiasRecoveredFrames || 0;
    const recoverySteps = Math.max(0, recovered - previousRecovered);
    this.s3DualiesFireBiasReleaseFrames = age;
    this.s3DualiesFireBiasRecoveredFrames = recovered;
    if (recoverySteps) {
      this.s3DualiesFireBias = Math.max(min,
        (this.s3DualiesFireBias ?? min) - recoverySteps * recoverPerFrame);
    }
    return result;
  };

  const originalSpread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._spreadDeg = function (weapon) {
    if (weapon?.kind === 'dualies' && this.a?.grounded && this.a?.form === 'kid'
      && !this.s3Turret && !(this.lockT > 0)) return weapon.spreadGround;
    return originalSpread.call(this, weapon);
  };

  const originalDualies = WeaponRunner.prototype._dualies;
  WeaponRunner.prototype._dualies = function (dt, input, weapon) {
    const sampling = weapon?.kind === 'dualies' && !!input?.fire
      && !!this.a?.grounded && this.a?.form === 'kid'
      && !this.s3Turret && !(this.lockT > 0) && !this.dodge;
    const previous = this.s3DualiesFireBiasSampling;
    this.s3DualiesFireBiasSampling = sampling;
    try { return originalDualies.call(this, dt, input, weapon); }
    finally { this.s3DualiesFireBiasSampling = previous; }
  };

  const originalFire = Projectiles.prototype.fireDualies;
  Projectiles.prototype.fireDualies = function (actor, weapon, spreadDeg, hand) {
    const runner = actor?.weaponRunner;
    if (!runner?.s3DualiesFireBiasSampling || actor?.weapon?.kind !== 'dualies')
      return originalFire.call(this, actor, weapon, spreadDeg, hand);
    const before = Array.isArray(this.list) ? this.list.length : null;
    const outer = Math.random() < (runner.s3DualiesFireBias ?? min);
    runner.s3DualiesFireBiasSampleOuter = outer;
    const result = originalFire.call(this, actor, weapon, outer ? weapon.spreadGround : 0, hand);
    const fired = before == null ? result !== false : this.list.length > before;
    if (fired) {
      runner.s3DualiesFireBias = Math.min(max, (runner.s3DualiesFireBias ?? min) + increment);
      runner.s3DualiesFireBiasShotCount = (runner.s3DualiesFireBiasShotCount || 0) + 1;
      runner.s3DualiesFireBiasReleaseFrames = 0;
      runner.s3DualiesFireBiasRecoveredFrames = 0;
    }
    return result;
  };
}
