// Build-only connections. No Character, input admission, network or upstream edits.
export function adaptMovementPhysics(rel, code, replaceOnce) {
  const replace = (before, after, name) => {
    code = replaceOnce(code, before, after, 'movement physics: ' + name);
  };
  if (rel === 'src/game/actor.js') {
    replace('const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3();',
      'const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3(), _fitGround = new THREE.Vector3();',
      '#1160 raised-ground fit scratch');
    replace("    this.form = 'kid';           // desired form",
      "    this.form = 'kid';           // desired form\n    this._stepClearanceBlocked = false;",
      '#1160 reset blocked-step latch');
    replace('    const wasGrounded = this.grounded;\n    let grounded = false;',
      '    const wasGrounded = this.grounded;\n' +
      '    if (!stick || this._stepClearanceForm !== isSquid) {\n' +
      '      this._stepClearanceBlocked = false;\n' +
      '      this._stepClearanceForm = isSquid;\n' +
      '    }\n' +
      '    let grounded = false;',
      '#1160 reset clearance latch on airtime/form change');
    replace('    if (this.weaponRunner.dodgeVel?.(this.vel)) return;',
      '    if (this.weaponRunner.dodge) return; // integrated once, after admission', 'single dodge velocity owner');
    replace('  _integrate(dt, isSquid, jumped) {',
      '  _integrate(dt, isSquid, jumped) {\n    return integrateMovement(this, dt, isSquid, jumped, PLAYER.radius);\n  }\n\n  _integrateMovementStep(dt, isSquid, jumped) {', 'bounded native collision integration');
    replace('    this._resolve(isSquid, prevY, wasGrounded);',
      '    this._resolve(isSquid, prevY, wasGrounded, dt);', 'resolver timestep');
    replace('  _resolve(isSquid, prevY, stick) {', '  _resolve(isSquid, prevY, stick, dt = 1 / 60) {', 'resolver timestep compatibility');
    replace('this.airTime + 1 / 60', 'this.airTime + dt', 'airtime in seconds');
    replace('      if (!isSquid) this._railFeet(gh, this.pos.y - P.stepDown, this.pos.y + up);\n      if (gh.hit) {',
      '      if (!isSquid) this._railFeet(gh, this.pos.y - P.stepDown, this.pos.y + up);\n' +
      '      const raisedSupport = gh.hit && gh.y > this.pos.y + 1e-4;\n' +
      '      const raisedBodyFits = !raisedSupport || !G.physics.bodyFits ||\n' +
      '        G.physics.bodyFits(_fitGround.set(this.pos.x, gh.y, this.pos.z), terrainRadius, lift, height, isSquid);\n' +
      '      if (raisedSupport && !raisedBodyFits) this._stepClearanceBlocked = true;\n' +
      '      else if (raisedSupport) this._stepClearanceBlocked = false;\n' +
      '      if (this._stepClearanceBlocked) {\n' +
      '        // Feet may reach a step whose raised body would hit a ceiling. Keep the\n' +
      '        // current height and resolve the curb side with the same capsule lowered\n' +
      '        // to the feet. Keep doing so until the capsule clears the side.\n' +
      '        G.physics.collideBody(this.pos, terrainRadius, 0, height, this.contacts, true, isSquid);\n' +
      '        const sideBlocked = this.contacts.wall;\n' +
      '        if (sideBlocked) {\n' +
      '          const n = this.contacts.wallNormal;\n' +
      '          const vn = this.vel.x * n.x + this.vel.z * n.z;\n' +
      '          if (vn < 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }\n' +
      '        }\n' +
      '        this._stepClearanceBlocked = sideBlocked;\n' +
      '        if (!raisedBodyFits || sideBlocked) {\n' +
      '          G.physics.groundProbe(this.pos.x, this.pos.y, this.pos.z, 0, P.stepDown, P.footRadius, gh, isSquid);\n' +
      '          if (!isSquid) this._railFeet(gh, this.pos.y - P.stepDown, this.pos.y);\n' +
      '        }\n' +
      '      }\n' +
      '      if (gh.hit) {',
      '#1160 head clearance and curb-side collision');
    replace('      if (gh.hit && gh.y >= this.pos.y - 0.02 && (this.vel.y <= 0 || gh.y - this.pos.y < 0.02)) {',
      '      const raisedLanding = gh.hit && gh.y > this.pos.y + 1e-4;\n' +
      '      let landingFits = !raisedLanding || !G.physics.bodyFits ||\n' +
      '        G.physics.bodyFits(_fitGround.set(this.pos.x, gh.y, this.pos.z), terrainRadius, lift, height, isSquid);\n' +
      '      if (raisedLanding && !landingFits) {\n' +
      '        // A jump can reach the same raised support as a step. Test its body fit,\n' +
      '        // then resolve from below the support so the curb side remains solid.\n' +
      '        const landingY = this.pos.y;\n' +
      '        this.pos.y = Math.min(landingY, gh.y - up);\n' +
      '        G.physics.collideBody(this.pos, terrainRadius, 0, height, this.contacts, true, isSquid);\n' +
      '        if (this.contacts.wall) {\n' +
      '          const n = this.contacts.wallNormal;\n' +
      '          const vn = this.vel.x * n.x + this.vel.z * n.z;\n' +
      '          if (vn < 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }\n' +
      '        }\n' +
      '        this.pos.y = landingY;\n' +
      '        G.physics.groundProbe(this.pos.x, this.pos.y, this.pos.z, 0, P.stepDown, P.footRadius, gh, isSquid);\n' +
      '        if (!isSquid) this._railFeet(gh, this.pos.y - P.stepDown, this.pos.y);\n' +
      '        const lowerSupport = gh.hit && gh.y > this.pos.y + 1e-4;\n' +
      '        landingFits = !lowerSupport || !G.physics.bodyFits ||\n' +
      '          G.physics.bodyFits(_fitGround.set(this.pos.x, gh.y, this.pos.z), terrainRadius, lift, height, isSquid);\n' +
      '      }\n' +
      '      if (landingFits && gh.hit && gh.y >= this.pos.y - 0.02 && (this.vel.y <= 0 || gh.y - this.pos.y < 0.02)) {',
      '#1160 airborne landing fit and curb-side collision');
    replace('    const side = _v2.set(mv.x, 0, mv.z);',
      '    const side = _v2.set(mv.x, 0, mv.z);\n    if (mh > 1) side.multiplyScalar(1 / mh);', 'wall lateral magnitude');
    replace('    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {',
      '    } else if (rollingMovementActive(this) && !this.intent.sub) {\n      if (hs > 0.1) target = Math.atan2(this.vel.x, this.vel.z);\n    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {', 'roller authoritative heading');
    const airStart = code.indexOf('    // ---- airborne: vector steering with light air control (momentum is kept)');
    const airEnd = code.indexOf('\n    // ---- grounded: speed + heading model', airStart);
    if (airStart < 0 || airEnd < airStart) throw new Error('Movement physics: missing airborne movement block');
    replace(code.slice(airStart, airEnd),
`    // ---- airborne: vector steering with form-independent ordinary acceleration/braking
    if (!this.grounded) {
      // Retain each form's target speed. The shared humanoid air calibration
      // owns ordinary acceleration and neutral/reverse braking in both forms.
      const target = isSquid ? Math.max(P.squidDrySpeed, sp) : Math.max(this.weaponRunner.moveSpeed(), P.airMinSpeed);
      const tvx = mh > 0.01 ? (mv.x / mh) * target * mag : 0, tvz = mh > 0.01 ? (mv.z / mh) * target * mag : 0;
      const dvx = tvx - vx, dvz = tvz - vz, dl = Math.hypot(dvx, dvz);
      const rate = P.airAccel * attackAirRateScale(this, P) * dt;
      if (dl <= rate) { this.vel.x = tvx; this.vel.z = tvz; } else { this.vel.x += (dvx / dl) * rate; this.vel.z += (dvz / dl) * rate; }
      return;
    }`, 'S3 ordinary airborne acceleration/braking');
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
    let accel = (this.weaponRunner.firingPose?.() || this.intent.sub || this.weaponRunner.aimingSub || this.specialActive)
      ? (P.s3AttackGroundAccel ?? 72) : (P.s3GroundAccel ?? 36);
    if (onEnemy) vt = Math.min(vt, P.enemyInkSpeed); // enemy ink limits target speed, not the selected S3 acceleration
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
