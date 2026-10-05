import { getPlatformLifecycle } from './platform-lifecycle.mjs';
import { GyroPermission, gyroStatusMessage } from './gyro-permission.mjs';
// Sensor reliability overlay. All angles in the original processing pipeline
// remain radians; motion events are only admitted while attitude agrees.
// Existing Android/quaternion math is unchanged. Permission and page lifetime
// are integrated here, rather than stacking another sensor wrapper.
const INSTALL = Symbol.for('inkwave.local-quality.gyro.v1');
const RAD = Math.PI / 180;
const zeros = () => ({ n: 0, a: 0, b: 0, ra: 0, rb: 0 });
const state = g => g._qualityGyro || (g._qualityGyro = {
  orientationTime: -Infinity, rate: [0, 0, 0], screen: null,
  fallbacks: 0, reason: null,
  // #615 stationary zero-rate calibration: learned bias in the raw device
  // frame (rad/s), accumulated still time, and the source it belongs to.
  bias: [0, 0, 0], still: 0, biasSrc: null,
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
  if (!(age >= 0 && age <= 75)) return false;
  const a = rate.alpha, b = rate.beta, c = rate.gamma;
  const k = g._rrScale * RAD;
  const x = (g._src === 'rrA' ? b : a) * k;
  const y = (g._src === 'rrA' ? c : b) * k;
  const z = (g._src === 'rrA' ? a : c) * k;
  const [ox, oy, oz] = s.rate, speed = Math.hypot(ox, oy, oz);
  if (speed <= 1e-8) return Math.hypot(x, y, z) <= 1e-8;
  return Math.hypot(x - ox, y - oy, z - oz) <= Math.max(.025, speed * .3);
}
export function installGyroQuality(Gyro, getScreenAngle, isAndroid = () => /Android/i.test(globalThis.navigator?.userAgent || ''), env = globalThis) {
  const P = Gyro.prototype;
  if (Object.hasOwn(P, INSTALL)) return;
  Object.defineProperty(P, INSTALL, { value: true });
  const start = P.start, stop = P.stop, resync = P.resync;
  const orientation = P._orientation, motion = P._motion, calibrate = P._calibrate;
  const lifecycle = getPlatformLifecycle(env);
  const accessFor = g => {
    if (g._platformGyroAccess) return g._platformGyroAccess;
    const access = g._platformGyroAccess = new GyroPermission(env, lifecycle);
    g.supported = access.capability.supported;
    const halt = () => {
      stop.call(g); g.resync(); g.working = false;
      access.stopListening('suspend'); access.cancelRequest();
    };
    access.unsubscribeLifecycle = lifecycle.subscribe({
      suspend: halt,
      resume: () => { if (access.wanted && access.allowed) g.start(); else access.stopListening(); },
      blur: () => g.resync(),
      screen: () => screenChanged(g),
    });
    return access;
  };
  P.request = function () {
    const access = accessFor(this);
    const promise = access.request();
    return promise.then(ok => { this.granted = access.allowed; return ok; });
  };
  Object.defineProperty(P, 'needsPermission', { configurable: true,
    get() { return accessFor(this).needsPermission; } });
  Object.defineProperty(P, 'platformStatus', { configurable: true,
    get() { return accessFor(this).snapshot(); } });
  P.statusMessage = function () {
    return gyroStatusMessage(accessFor(this).snapshot(), env.document?.documentElement?.lang || 'en');
  };
  P.onPlatformStatus = function (callback) { return accessFor(this).subscribe(callback); };
  P.disposePlatform = function () {
    const access = this._platformGyroAccess;
    stop.call(this); this.resync(); this.working = false;
    access?.unsubscribeLifecycle?.(); access?.dispose();
  };

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
    s.bias[0] = s.bias[1] = s.bias[2] = 0; s.still = 0; s.biasSrc = null;
    this._tQ = this._tRR = 0; this.dYaw = this.dPitch = 0;
    fallback(this, 'resync');
  };
  P.start = function () {
    const access = accessFor(this);
    if (access.disposed) return false;
    access.wanted = true;
    if (!lifecycle.active || !access.allowed) return false;
    if (this._platformCanStart && !this._platformCanStart()) { access.stopListening(); return false; }
    if (this.enabled) return true;
    this.supported = access.capability.supported;
    this.resync(); state(this).screen = Number(getScreenAngle()) || 0;
    this._platformSensorStart = env.performance.now();
    try { start.call(this); }
    catch (error) {
      stop.call(this); access.availability = 'unavailable';
      access.reason = 'sensor-start-error'; access.notify(); return false;
    }
    access.beginListening(); return this.enabled;
  };
  P.stop = function () {
    const access = accessFor(this); access.wanted = false;
    access.cancelRequest(false); access.stopListening();
    const result = stop.call(this); this.resync(); this.working = false; return result;
  };
  P._calibrate = function (x, y, z, time) {
    const s = state(this); s.rate[0] = x; s.rate[1] = y; s.rate[2] = z; s.orientationTime = time;
    if (isAndroid()) { if (this._src !== 'ori') fallback(this, 'android-attitude'); return; }
    if (this._src !== 'ori' && this._rr) {
      const r = { alpha: this._rr[0], beta: this._rr[1], gamma: this._rr[2] };
      if (time - this._tRR > 75 || !gyroRateTrusted(this, r, time)) fallback(this, 'attitude-disagreement');
    }
    return calibrate.call(this, x, y, z, time);
  };
  P._orientation = function (e) {
    if (!this.enabled || !lifecycle.active || !finiteEvent(e, ['alpha', 'beta', 'gamma'])) return;
    screenChanged(this);
    const t = e.timeStamp || env.performance.now();
    if (!Number.isFinite(t)) return;
    if (t < this._platformSensorStart && this._platformSensorStart - t < 3600000) return;
    if (this._hasQ && (t < this._tQ || t - this._tQ > 500)) this.resync();
    accessFor(this).sample(t);
    if (isAndroid() && this._src !== 'ori') fallback(this, 'android-attitude');
    return orientation.call(this, e);
  };
  P._motion = function (e) {
    if (!this.enabled || !lifecycle.active || !finiteEvent(e.rotationRate, ['alpha', 'beta', 'gamma'])) return;
    if (accessFor(this).motionPermission === 'denied') return;
    screenChanged(this);
    const t = e.timeStamp || env.performance.now();
    if (!Number.isFinite(t)) return;
    if (t < this._platformSensorStart && this._platformSensorStart - t < 3600000) return;
    if (this._tRR && (t < this._tRR || t - this._tRR > 500)) this.resync();
    if (this._src !== 'ori' && (isAndroid() || !gyroRateTrusted(this, e.rotationRate, t))) fallback(this, 'untrusted-motion');
    return motion.call(this, e);
  };

  // #615 stationary stability calibration. Only the raw rotationRate path can
  // hold a zero-rate offset; the attitude path integrates no bias. Learn the
  // offset as a bias strictly while the attitude stream says the device is
  // still (below STILL_DEG for HOLD_S seconds), subtract it from every raw
  // sample, and time-normalize with dt so event frequency cannot change the
  // result. Thresholds are engineering values for this overlay — not
  // Nintendo's unpublished calibration constants. Slow deliberate aiming
  // keeps the attitude above STILL_DEG, so it is never learned as bias.
  const STILL_DEG = 0.35, HOLD_S = 1.2, TAU_S = 2;
  const sample = P._sample;
  P._sample = function (wx, wy, wz, dt) {
    const s = state(this);
    if (this._src === 'ori' || !(dt > 0)) return sample.call(this, wx, wy, wz, dt);
    if (s.biasSrc !== this._src) { s.biasSrc = this._src; s.bias[0] = s.bias[1] = s.bias[2] = 0; s.still = 0; }
    const att = Math.hypot(s.rate[0], s.rate[1], s.rate[2]) / RAD;
    if (att <= STILL_DEG) s.still += dt; else s.still = 0;
    if (s.still >= HOLD_S) {
      const k = 1 - Math.exp(-dt / TAU_S);
      s.bias[0] += (wx - s.bias[0]) * k;
      s.bias[1] += (wy - s.bias[1]) * k;
      s.bias[2] += (wz - s.bias[2]) * k;
    }
    return sample.call(this, wx - s.bias[0], wy - s.bias[1], wz - s.bias[2], dt);
  };
}
