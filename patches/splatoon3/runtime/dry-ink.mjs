// #241: distinguish a real insufficient-use attempt from the empty sound throttle.
// Splatoon 3 applies the weapon's normal ink-recovery lock even when the shot
// fails for insufficient ink, so dry attempts reuse the same per-weapon value.
const INSTALLED = Symbol.for('inkwave.s3.shooter-dry-ink.v1');
export function installDryInk({ Actor, WeaponRunner, G, emit }) {
  const R = WeaponRunner.prototype;
  if (Object.hasOwn(R, INSTALLED)) return;
  Object.defineProperty(R, INSTALLED, { value: true });
  const auto = R._auto, empty = R._empty, reset = Actor.prototype.reset;
  let attempt = null;
  R._auto = function (dt, input, weapon) {
    const previous = attempt;
    // In the installed shooter _auto, _empty is called only at the actual
    // insufficient-ink branch, after shot cadence/admission has been evaluated.
    attempt = weapon.kind === 'shooter' ? this : null;
    try { return auto.call(this, dt, input, weapon); } finally { attempt = previous; }
  };
  R._empty = function (...args) {
    if (attempt === this && this.a?.alive) {
      const a = this.a, delay = a.weapon.inkRecoverStop;
      if (Number.isFinite(delay) && delay > 0) {
        a.s3 ||= {};
        a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining || 0, delay);
        a.s3.lastDryInkUse = { weapon: a.weaponId, at: G.time, delay, calibrated: true, source: 'normal-ink-lock' };
        emit('ink:dry-use', { actor: a, ...a.s3.lastDryInkUse });
      }
    }
    return empty.apply(this, args);
  };
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args); if (this.s3) delete this.s3.lastDryInkUse; return result;
  };
}
