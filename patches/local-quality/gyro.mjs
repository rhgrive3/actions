// Sensor reliability overlay. All angles in the original processing pipeline
// remain radians; motion events are only admitted while attitude agrees.
// No new aiming deadzone, sensitivity curve, permission prompt, or input API.
const INSTALL = Symbol.for('inkwave.local-quality.gyro.v1');
const RAD = Math.PI / 180;
const zeros = () => ({ n: 0, a: 0, b: 0, ra: 0, rb: 0 });
const state = g => g._qualityGyro || (g._qualityGyro = {
  orientationTime: -Infinity, rate: [0, 0, 0], screen: null,
  fallbacks: 0, reason: null,
});
const finiteEvent = (e, keys) => keys.every(k => typeof e?.[k] === 'number' && Number.isFinite(e[k]));
function fallback(g, reason) {
  const s = state(g);
  if (g._src !== 'ori') { s.fallbacks++; s.reason = reason; }
  g._src = 'ori'; g._rrScale = 1; g._cal = zeros();
  g._sm.y = g._sm.p = 0;
}
export function gyroRateTrusted(g, rate, time) {
  const s = state(g), age = time - s.orientationTime;
  // No unbounded dead reckoning through a suspended attitude stream.
  if (!(age >= 0 && age <= 75)) return false;
  const a = rate.alpha, b = rate.beta, c = rate.gamma;
  const k = g._rrScale * RAD;
  const x = (g._src === 'rrA' ? b : a) * k;
  const y = (g._src === 'rrA' ? c : b) * k;
  const z = (g._src === 'rrA' ? a : c) * k;
  const [ox, oy, oz] = s.rate, speed = Math.hypot(ox, oy, oz);
  // This is an attitude consistency check, NOT a look deadzone. Arbitrarily
  // slow real orientation changes still take the unchanged quaternion path.
  if (speed <= 1e-8) return Math.hypot(x, y, z) <= 1e-8;
  return Math.hypot(x - ox, y - oy, z - oz) <= Math.max(.025, speed * .3);
}
export function installGyroQuality(Gyro, getScreenAngle, isAndroid = () => /Android/i.test(globalThis.navigator?.userAgent || '')) {
  const P = Gyro.prototype;
  if (Object.hasOwn(P, INSTALL)) return;
  Object.defineProperty(P, INSTALL, { value: true });
  const start = P.start, stop = P.stop, resync = P.resync;
  const orientation = P._orientation, motion = P._motion, calibrate = P._calibrate;
  const screenChanged = g => {
    const s = state(g), value = Number(getScreenAngle()) || 0;
    if (s.screen === null) { s.screen = value; return false; }
    if (s.screen === value) return false;
    g.resync(); s.screen = value;
    return true;
  };
  P.resync = function () {
    resync.call(this);
    const s = state(this); s.orientationTime = -Infinity; s.rate.fill(0);
    this._tQ = this._tRR = 0; this.dYaw = this.dPitch = 0;
    fallback(this, 'resync');
  };
  P.start = function () {
    if (this.enabled || !this.supported) return start.call(this);
    this.resync(); state(this).screen = Number(getScreenAngle()) || 0;
    return start.call(this);
  };
  P.stop = function () {
    const result = stop.call(this); this.resync(); return result;
  };
  P._calibrate = function (x, y, z, time) {
    const s = state(this); s.rate[0] = x; s.rate[1] = y; s.rate[2] = z; s.orientationTime = time;
    // Android keeps the already-screen-corrected quaternion source. Raw gyro
    // bias must not become permanent camera velocity after one good turn.
    if (isAndroid()) { if (this._src !== 'ori') fallback(this, 'android-attitude'); return; }
    if (this._src !== 'ori' && this._rr) {
      const r = { alpha: this._rr[0], beta: this._rr[1], gamma: this._rr[2] };
      if (time - this._tRR > 75 || !gyroRateTrusted(this, r, time)) fallback(this, 'attitude-disagreement');
    }
    return calibrate.call(this, x, y, z, time);
  };
  P._orientation = function (e) {
    if (!this.enabled || !finiteEvent(e, ['alpha', 'beta', 'gamma'])) return;
    screenChanged(this);
    const t = e.timeStamp || performance.now();
    if (!Number.isFinite(t)) return;
    if (this._hasQ && (t < this._tQ || t - this._tQ > 500)) this.resync();
    if (isAndroid() && this._src !== 'ori') fallback(this, 'android-attitude');
    return orientation.call(this, e);
  };
  P._motion = function (e) {
    if (!this.enabled || !finiteEvent(e.rotationRate, ['alpha', 'beta', 'gamma'])) return;
    screenChanged(this);
    const t = e.timeStamp || performance.now();
    if (!Number.isFinite(t)) return;
    if (this._src !== 'ori' && (isAndroid() || !gyroRateTrusted(this, e.rotationRate, t))) fallback(this, 'untrusted-motion');
    return motion.call(this, e);
  };
}
