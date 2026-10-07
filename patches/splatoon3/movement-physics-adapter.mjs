// Build-only connections. No Character, input admission, network or upstream edits.
export function adaptMovementPhysics(rel, code, replaceOnce) {
  const replace = (before, after, name) => {
    code = replaceOnce(code, before, after, 'movement physics: ' + name);
  };
  if (rel === 'src/game/actor.js') {
    replace('    if (this.weaponRunner.dodgeVel?.(this.vel)) return;',
      '    if (this.weaponRunner.dodge) return; // integrated once, after admission', 'single dodge velocity owner');
    replace('  _integrate(dt, isSquid, jumped) {',
      '  _integrate(dt, isSquid, jumped) {\n    return integrateMovement(this, dt, isSquid, jumped, PLAYER.radius);\n  }\n\n  _integrateMovementStep(dt, isSquid, jumped) {', 'bounded native collision integration');
    replace('    this._resolve(isSquid, prevY, wasGrounded);',
      '    this._resolve(isSquid, prevY, wasGrounded, dt);', 'resolver timestep');
    replace('  _resolve(isSquid, prevY, stick) {', '  _resolve(isSquid, prevY, stick, dt = 1 / 60) {', 'resolver timestep compatibility');
    replace('this.airTime + 1 / 60', 'this.airTime + dt', 'airtime in seconds');
    replace('    const side = _v2.set(mv.x, 0, mv.z);',
      '    const side = _v2.set(mv.x, 0, mv.z);\n    if (mh > 1) side.multiplyScalar(1 / mh);', 'wall lateral magnitude');
    replace('    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {',
      '    } else if (rollingMovementActive(this) && !this.intent.sub) {\n      if (hs > 0.1) target = Math.atan2(this.vel.x, this.vel.z);\n    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {', 'roller authoritative heading');
    replace('      const rate = (mh > 0.01 ? accel : decel) * dt;',
      '      const rate = (mh > 0.01 ? accel : decel) * attackAirRateScale(this, P) * dt;', 'S3 attack/ready airborne rate ratio');
    const groundStart = code.indexOf('    // ---- grounded: speed + heading model');
    const groundEnd = code.indexOf('\n  }\n\n  // ------------------------------------------------------------------ character controller', groundStart);
    if (groundStart < 0 || groundEnd < groundStart) throw new Error('Movement physics: missing grounded movement block');
    replace(code.slice(groundStart, groundEnd),
`    // ---- grounded: Splatoon 3 constant vector acceleration model
    let vt;
    if (isSquid && this.submerged) vt = P.swimSpeed;
    else if (isSquid) vt = P.squidDrySpeed;
    else vt = this.weaponRunner.moveSpeed();
    if (!isSquid && this.hardLand > 0) vt *= 1 - (1 - P.hardLandSlow) * this.hardLand;
    let accel = (this.weaponRunner.firingPose?.() || this.intent.sub || this.specialActive)
      ? (P.s3AttackGroundAccel ?? 72) : (P.s3GroundAccel ?? 36);
    if (onEnemy) { vt = Math.min(vt, P.enemyInkSpeed); accel = Math.min(accel, P.enemyInkAccel); }
    stepGroundVelocity(this.vel, mv.x, mv.z, vt, accel, dt);`, 'S3 grounded vector acceleration');
    return "import { attackAirRateScale, integrateMovement, rollingMovementActive, stepGroundVelocity } from '../../patches/splatoon3/runtime/movement-physics.mjs';\n" + code;
  }
  if (rel === 'src/game/weapons.js') {
    replace('    if (this.rolling) return lerp(w.rollSpeed * 0.5, w.rollSpeed, smoothstep(0, 0.45, this.rollT));',
      '    if (rollingMovementActive(this.a)) return rollingMovementSpeed(this);', 'sole rolling speed profile');
    replace('      if (d.t >= d.dur) { this.dodge = null; this.lockT = w.lockTime; }',
      '      if (d.t + MOVEMENT_EPSILON >= d.dur) { this.dodge = null; this.lockT = Math.max(0, w.lockTime - Math.max(0, d.t - d.dur)); }', 'exact dodge end and recovery carry');
    replace('this.lockT = Math.max(0, this.lockT - dt);',
      'this.lockT = this.lockT - dt <= MOVEMENT_EPSILON ? 0 : this.lockT - dt;', 'exact recovery end');
    const start = code.indexOf('  dodgeVel(vel) {'), end = code.indexOf('\n  // ---- slosher:', start);
    if (start < 0 || end < start) throw new Error('Movement physics: missing dodge velocity method');
    replace(code.slice(start, end),
      '  dodgeVel(vel, dt = 1 / 60) {\n    return writeDodgeVelocity(this, vel, dt);\n  }\n', 'distance integral');
    return "import { MOVEMENT_EPSILON, writeDodgeVelocity, rollingMovementActive, rollingMovementSpeed } from '../../patches/splatoon3/runtime/movement-physics.mjs';\n" + code;
  }
  return code;
}
