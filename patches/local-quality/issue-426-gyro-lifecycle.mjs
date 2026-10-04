// Build-only gyro sensor-lifecycle correction for issue #426.
// Stop actual deviceorientation/devicemotion listeners when leaving live play
// for menus (G.mode !== 'match'), while preserving saved preference/permission
// (settings.gyro / _gyroWanted / s.gyro / granted) and restarting exactly one
// listener pair on the next live match via the existing _startGyro(). Pause,
// settings, results and any overlay inside a live match (G.mode === 'match')
// only discard deltas, so native resume() which only does menus.show(null) needs
// no restart. The first menus.show(null) in quitToMenu/netMatchEnd still has
// G.mode === 'match' (async fade pending) and correctly preserves; the final
// show('main' / 'lobby') after G.mode = 'menu' detaches. Covers offline
// quitToMenu, online netMatchEnd and netMatchAborted (delegates to quitToMenu)
// through the one composed _onScreen path. Composed after reliability, so the
// real Mobile.setGyro(on, canStart) intent owner is what gets integrated: a
// menu suspension bumps _gyroIntent so a pending permission continuation can
// never reattach listeners in menus, and _startGyro restarts only while the
// mode is actually 'match'.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error("Quality gyro-lifecycle anchor mismatch: " + rel);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptGyroLifecycle(rel, code) {
  // Fail closed on double application: any of the three hooks already present
  // means this adapter ran before (duplicate methods must never ship).
  for (const marker of ['suspendForMenu', 'suspendGyro', '_suspendGyroForMenu']) {
    if (code.includes(marker)) {
      throw new Error("Quality gyro-lifecycle anchor mismatch: " + rel + " (already adapted: " + marker + ")");
    }
  }
  if (rel === 'src/core/gyro.js') {
    const before = "  /** Take the look delta gathered since the last call (radians). */";
    const insert = "  /** Stop sensor listening for menus without clearing preference/permission. Idempotent. */\n" +
      "  suspendForMenu() {\n" +
      "    if (!this.enabled) { this.discard(); this.resync(); return false; }\n" +
      "    this.stop();\n" +
      "    return true;\n" +
      "  }\n";
    return replaceOnce(code, before, insert + before, rel);
  }
  if (rel === 'src/core/mobile.js') {
    // Anchored on the composed setGyro tail (reliability's canStart/finish path),
    // so this can only be built after the reliability adapter ran.
    const before = "    if (canStart) return Promise.resolve(this.gyro.supported).then(finish);\n" +
      "    return Promise.resolve(finish(this.gyro.supported));\n" +
      "  }\n";
    const insert = "  /** Menu exit: invalidate any pending setGyro continuation, detach the sensor\n" +
      "   * listeners and keep the saved preference/permission intact (never setGyro(false)). */\n" +
      "  suspendGyro() {\n" +
      "    ++this._gyroIntent;   // a grant that lands after this must not reattach in menus\n" +
      "    return this.gyro.suspendForMenu();\n" +
      "  }\n";
    return replaceOnce(code, before, before + insert, rel);
  }
  if (rel === 'src/main.js') {
    // 1) The native Game method, defined and actually used by _onScreen below
    // (no unused helper): only a real mode exit to menus detaches sensors.
    const beforeMethod = "  _onScreen(s) {";
    const method = "  /** Leaving live play for menus: detach sensors once. settings.gyro, Mobile's\n" +
      "   * _gyroWanted/s.gyro and Gyro's granted flag are preserved untouched. */\n" +
      "  _suspendGyroForMenu() {\n" +
      "    this.input?.mobile?.suspendGyro?.();\n" +
      "  }\n";
    code = replaceOnce(code, beforeMethod, method + beforeMethod, rel);
    // 2) Gate the stop on the actual mode: pause/settings/results inside a live
    // match keep the listeners (they only discard deltas), so resume() needs no
    // restart; any menu after mode 'menu' stops them for real.
    const beforeScreen = "      if (!playTouch) mob.gyro?.discard?.();";
    const afterScreen = "      if (G.mode !== 'match') this._suspendGyroForMenu(); else if (!playTouch) mob.gyro?.discard?.();";
    code = replaceOnce(code, beforeScreen, afterScreen, rel);
    // 3) Restart gate: resume listening for the next live match only, using the
    // real canStart hook so a completion delivered in a menu can never start.
    const beforeStart = "    if (mob.gyro.needsPermission) { mob.toast(t('Tap GYRO to turn on gyro aim'), 2.4); return; }\n" +
      "    mob.setGyro(true);";
    const afterStart = "    if (mob.gyro.needsPermission) { mob.toast(t('Tap GYRO to turn on gyro aim'), 2.4); return; }\n" +
      "    mob.setGyro(true, () => G.mode === 'match');";
    return replaceOnce(code, beforeStart, afterStart, rel);
  }
  return code;
}
