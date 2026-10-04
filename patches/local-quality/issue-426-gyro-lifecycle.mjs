// Build-only gyro sensor-lifecycle correction for issue #426.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error("Quality gyro-lifecycle anchor mismatch: " + rel);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptGyroLifecycle(rel, code) {
  if (rel === "src/core/gyro.js") {
    const before = "  /** Take the look delta gathered since the last call (radians). */";
    const insert = "  /** Stop sensor listening for menus without clearing preference/permission. Idempotent. */\n" +
      "  suspendForMenu() {\n" +
      "    if (!this.enabled) { this.discard(); this.resync(); return false; }\n" +
      "    this.stop();\n" +
      "    return true;\n" +
      "  }\n";
    return replaceOnce(code, before, insert + before, rel);
  }
  if (rel === "src/main.js") {
    const beforeScreen = "      if (!playTouch) mob.gyro?.discard?.();";
    const afterScreen = "      if (!playTouch) mob.gyro?.suspendForMenu?.(); else mob.gyro?.discard?.();";
    code = replaceOnce(code, beforeScreen, afterScreen, rel);
    const beforeStart = "  _startGyro() {";
    const afterStart = "  _suspendGyroForMenu() {\n    try { this.input?.mobile?.gyro?.suspendForMenu?.(); } catch (e) { void e; }\n  }\n  _startGyro() {";
    return replaceOnce(code, beforeStart, afterStart, rel);
  }
  return code;
}
