// Local Batch 01: exact, fail-closed hooks on the immutable upstream snapshot.
export function adaptLocalBatch01(rel, code, replaceOnce) {
  if (rel === 'src/config.js') {
    code = replaceOnce(code, 'aimAssist: 1.0,', 'aimAssist: 0.0,', '#271 assist-free default');
  }
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '(usingPad || usingTouch) ? (s.aimAssist ?? 1) : (s.aimAssistMouse ? 0.5 : 0)',
      '(usingPad || usingTouch) ? 0 : (s.aimAssistMouse ? 0.5 : 0)', '#271 S3 pad/touch has no tracking or friction');
    code = replaceOnce(code,
      "Physics.segmentCapsuleDist(start, end, _c, PLAYER.radius, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);",
      'Physics.segmentCapsuleDist(start, end, _c, hurtboxRadius(e, PLAYER), hurtboxHeight(e, PLAYER), _res);', '#430 targeting hurtbox');
    code = replaceOnce(code, 'if (_res.dist < PLAYER.radius + 0.2)',
      'if (_res.dist < hurtboxRadius(e, PLAYER) + 0.2)', '#430 separate targeting tolerance');
    code = "import { hurtboxRadius, hurtboxHeight } from '../../patches/splatoon3/runtime/player-hurtbox.mjs';\n" + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      '      if (mh > 0.2) target = Math.atan2(mv.x, mv.z);\n      else if (hs > 0.6) target = Math.atan2(this.vel.x, this.vel.z);',
      `      if (!isSquid && this.grounded && !this.weaponRunner.rolling) {
        // #973: input is already deadzone-filtered. Ramp ordinary body turning
        // with locomotion instead of switching to full strength at magnitude .2.
        if (mh > 1e-6) target = Math.atan2(mv.x, mv.z);
        else if (hs > 0.6) target = Math.atan2(this.vel.x, this.vel.z);
        if (target !== null) {
          const locomotion = clamp(mh > 1e-6 ? mh : hs / Math.max(P.runSpeed, 1e-6), 0, 1);
          omega *= locomotion; maxRate *= locomotion; maxAcc *= locomotion;
        }
      } else {
        if (mh > 0.2) target = Math.atan2(mv.x, mv.z);
        else if (hs > 0.6) target = Math.atan2(this.vel.x, this.vel.z);
      }`, '#973 speed-dependent ordinary facing');
    code = replaceOnce(code,
      'G.physics.collideBody(this.pos, P.radius, P.squidBodyLift, P.squidHeight, this.contacts, false, true);',
      'G.physics.collideBody(this.pos, P.s3SwimTerrainRadiusRaw * P.s3TerrainDistanceScale, P.squidBodyLift, P.squidHeight, this.contacts, false, true);', '#525 wall-climb swim radius');
    code = replaceOnce(code,
      'const c = G.physics.collideBody(this.pos, P.radius, lift, height, this.contacts, stick, isSquid);',
      'const terrainRadius = (isSquid ? P.s3SwimTerrainRadiusRaw : P.s3HumanoidTerrainRadiusRaw) * P.s3TerrainDistanceScale;\n    const c = G.physics.collideBody(this.pos, terrainRadius, lift, height, this.contacts, stick, isSquid);', '#525 form-dependent terrain radius');
  }
  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(code, 'this.baseFov = s?.fov ?? 82;',
      'this.baseFov = battleHorizontalFov(this.mode, this.target, this.spectate);', '#380 ignore legacy user FOV');
    code = replaceOnce(code, '    // gameplay view, captured before the diorama touches the rendered camera',
      '    fov = frameBattleCamera(this, fov);\n    // gameplay view, captured before the diorama touches the rendered camera', '#981 battle framing');
    code = replaceOnce(code, 'this.blend.fov = cam.fov;',
      "this.blend.fov = (this.mode === 'follow' || this.mode === 'spectate') && cam.userData.s3BattleFrame ? cam.userData.s3ReferenceVerticalFov : cam.fov;", '#981 avoid applying narrow-frame compensation twice during battle blend');
    code = replaceOnce(code, '    gc.updateMatrixWorld();', '    gc.updateProjectionMatrix();\n    gc.updateMatrixWorld();', '#981 gameplay projection refresh');
    return "import { frameBattleCamera, battleHorizontalFov } from '../../patches/splatoon3/runtime/battle-framing.mjs';\n" + code;
  }
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code, "    { key: 'aimAssist', label: 'Aim assist (controller)', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Gently slows and steers your aim onto nearby rivals when you play with a controller.' },\n", '', '#271 remove non-reference pad assist control');
    code = replaceOnce(code, "    { key: 'fov', label: 'Field of view', type: 'slider', min: 65, max: 100, step: 1, fmt: (v) => Math.round(v) + '\u00b0', help: 'Wider shows more of the turf around you.' },\n", '', '#380 remove ordinary FOV slider');
  }
  if (rel === 'src/core/renderer.js') {
    code = replaceOnce(code, '    this.container = container;',
      "    this.container = container;\n    container.style.backgroundColor = '#000';", '#981 black safe-frame exterior');
    code = replaceOnce(code, '    this.composer.render();',
      '    cropBattleCanvas(this.renderer.domElement, this._w, this._h, !!this.camera?.userData.s3BattleFrame);\n    this.composer.render();', '#981 world-only crop');
    code = replaceOnce(code, '    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }',
      '    resizeBattleCamera(this.camera, w / h);\n    resizeBattleCamera(G.rig?.gameCam, w / h);', '#981 resize frame without a stretched tick');
    return "import { cropBattleCanvas, resizeBattleCamera } from '../../patches/splatoon3/runtime/battle-framing.mjs';\n" + code;
  }
  return code;
}
