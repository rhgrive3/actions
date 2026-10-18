// Final production composition pass. Keep upstream bytes/lock intact and fail
// closed when a prior adapter changes a required integration point.
export function adaptCameraAimControls(rel, input) {
  let code = input;
  function replace(before, after, label) {
    if (!code.includes(before)) throw new Error(`camera-aim-controls: ${rel}: missing ${label}`);
    if (code.indexOf(before) !== code.lastIndexOf(before)) throw new Error(`camera-aim-controls: ${rel}: ambiguous ${label}`);
    code = code.replace(before, after);
  }
  if (rel === 'src/game/cameraRig.js') {
    code = `import { updateScopeZoom, enforceBoomClearance, constrainCameraLens, recordAimPose } from '../../patches/splatoon3/runtime/camera-aim-controls.mjs';\n` + code;
    if (code.includes('this.scopeK = damp(this.scopeK, chargerScopeFactor(')) {
      // Native and previous passes may have normalized charge source syntax.
      // Accept one real follow-camera charging owner; never mask duplicates.
      const candidates = [...code.matchAll(/^    const charging = [^\n;]+;$/gm)];
      if (candidates.length === 1) {
        replace(candidates[0][0], '    const charging = updateScopeZoom(this, a, dt);',
          'true scope FOV source charge');
      } else if (!code.includes('    const charging = updateScopeZoom(this, a, dt);')) {
        throw new Error('camera-aim-controls: unexpected charging owner count ' + candidates.length);
      }
    } else {
      replace("const charging = a.weapon?.kind === 'charger' && a.weaponRunner?.charging ? a.weaponRunner.charge : 0;\n    this.zoom = damp(this.zoom, charging > 0.99 ? 14 : charging * 6, 8, dt);",
        'const charging = updateScopeZoom(this, a, dt);', 'scope capability after reliability pass');
    }
    replace('    _back.copy(fwd).negate();',
      '    // Super-jump yaw/pitch may have changed since the pivot calculation.\n    this.forward(fwd);\n    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));\n    _back.copy(fwd).negate();', 'same-frame automated aim');
    replace('    if (this.boom.x > _probe.hard + 1.6) { this.boom.x = _probe.hard + 1.6; this.boom.v = Math.min(this.boom.v, 0); }\n    if (_probe.floor && this.boom.x > _probe.hard) { this.boom.x = _probe.hard; this.boom.v = Math.min(this.boom.v, 0); }\n    if (this.boom.x < 0.45) { this.boom.x = 0.45; this.boom.v = Math.max(0, this.boom.v); }',
      '    enforceBoomClearance(this.boom, _probe.hard);', 'hard boom clearance');
    replace('    fov = frameBattleCamera(this, fov);',
      '    constrainCameraLens(this, G.physics, fov);\n    fov = frameBattleCamera(this, fov);', 'final lens sweep');
    replace('    gc.fov = fov; gc.aspect = cam.aspect; gc.near = cam.near; gc.far = cam.far;',
      '    const projectionDirty = gc.fov !== fov || gc.aspect !== cam.aspect || gc.near !== cam.near || gc.far !== cam.far;\n' +
      '    gc.fov = fov; gc.aspect = cam.aspect; gc.near = cam.near; gc.far = cam.far;\n' +
      '    if (projectionDirty) gc.updateProjectionMatrix();',
      'scope gameplay camera projection follows rendered vertical FOV');
    replace('    gc.updateMatrixWorld();', '    gc.updateMatrixWorld();\n    recordAimPose(this);', 'simulation pose snapshot');
    replace('if (Math.abs(cam.fov - fov) > 0.01)', 'if (cam.fov !== fov)', 'optical/HUD projection parity');
  }
  if (rel === 'src/game/player.js') {
    code = `import { integrateLookAxis, simulationAimCamera } from '../../patches/splatoon3/runtime/camera-aim-controls.mjs';\n` + code;
    replace("const gyroActive = inp.lastDevice === 'touch' && !!touch?.gyro?.enabled;",
      "const gyroActive = (inp.lastDevice === 'touch' && !!touch?.gyro?.enabled) || !!this._s3ControllerMotionOwnsPitch;", 'motion-mode ownership');
    replace('      const k = 1 - Math.exp(-60 * dt);\n      this.padLook.x += (_stick.x * c - this.padLook.x) * k; if (!gyroActive) this.padLook.y += (_stick.y * c - this.padLook.y) * k;',
      '      const lookX = integrateLookAxis(this.padLook, \'x\', _stick.x * c, dt);\n      const lookY = gyroActive ? 0 : integrateLookAxis(this.padLook, \'y\', _stick.y * c, dt);', 'exact look integration');
    replace('this.padLook.x * yawRate * friction * dt', 'lookX * yawRate * friction', 'yaw displacement');
    replace('this.padLook.y * 2.4 * ps * friction * dt', 'lookY * 2.4 * ps * friction', 'pitch displacement');
    replace('  computeAim() {', '  computeAim(simulation = false) {', 'explicit simulation aim');
    replace('const a = this.a, cam = G.rig?.gameCam || G.camera;',
      'const a = this.a, cam = (simulation && simulationAimCamera(this, G.physics)) || this.rig?.gameCam || G.camera;', 'same-tick aim camera');
  }
  if (rel === 'src/game/weapons.js') {
    code = `import { constrainMuzzle } from '../../patches/splatoon3/runtime/camera-aim-controls.mjs';\n` + code;
    replace('if (!isFinite(out.x) || out.distanceToSquared(_v3) > 2.5 || !G.physics.los(_v3, out)) out.copy(_v3).addScaledVector(a.aimDir, 0.3);\n    return out;',
      'if (!Number.isFinite(out.x + out.y + out.z) || out.distanceToSquared(_v3) > 2.5 || !G.physics.los(_v3, out)) out.copy(_v3).addScaledVector(a.aimDir, 0.3);\n    return constrainMuzzle(G.physics, _v3, out);', 'blocked fallback muzzle');
    replace('if (d < 2.0 || out.dot(a.aimDir) < 0) out.copy(a.aimDir);',
      'if (!Number.isFinite(d) || d < 1e-6 || out.dot(a.aimDir) <= 0) out.copy(a.aimDir);', 'near-distance parallax');
  }
  return code;
}
