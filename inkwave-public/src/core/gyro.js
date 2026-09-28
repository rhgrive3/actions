// Gyro aiming for phones / tablets (the Splatoon handheld feel on a touch screen).
//
// Source of truth: the device ATTITUDE from `deviceorientation`, turned into a quaternion. The angular velocity is the
// quaternion difference between two samples, expressed in the device frame. This is consistent on iOS Safari and
// Android Chrome — unlike DeviceMotionEvent.rotationRate, whose axis labels differ between browsers. When
// rotationRate is present its axis mapping + unit are *verified* against the attitude for a moment and then used
// (it is the raw gyro, one step less filtered); if it never agrees, the attitude path simply stays in charge.
//
// Pipeline per sample:  device ω → screen space (rotation angle) → player-space yaw (gravity-aware, so turning your
// body works however the device is tilted) → soft tiered smoothing (kills hand jitter, never delays real motion) →
// Splatoon 3 sensitivity curve (−5…+5; 0 = 132° of device turn per in-game 360°) → invert → accumulated radians.
import { screenAngle } from './device.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Splatoon 3 measured: device degrees for one in-game 360° turn at gyro sensitivity −5 / −2.5 / 0 / +2.5 / +5.
const GYRO_DEG = [[-5, 278], [-2.5, 178], [0, 132], [2.5, 119], [5, 110]];
export function gyroTurnDeg(sens) {
  const s = clamp(+sens || 0, -5, 5);
  for (let i = 1; i < GYRO_DEG.length; i++) {
    const [s0, d0] = GYRO_DEG[i - 1], [s1, d1] = GYRO_DEG[i];
    if (s <= s1) return d0 + (d1 - d0) * ((s - s0) / (s1 - s0));
  }
  return GYRO_DEG[GYRO_DEG.length - 1][1];
}
/** Swipe / stick style sensitivity −5..+5 → multiplier (0 = 1×, each step ≈ ×1.16). */
export const touchSensMul = (v) => Math.pow(1.16, clamp(+v || 0, -5, 5));

// ---- tiny quaternion helpers ([x, y, z, w])
function quatFromEuler(a, b, g, out) {
  // W3C DeviceOrientation: R = Rz(alpha) · Rx(beta) · Ry(gamma)  (device → earth)
  const ha = a * D2R * 0.5, hb = b * D2R * 0.5, hg = g * D2R * 0.5;
  const ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(hb), sb = Math.sin(hb), cg = Math.cos(hg), sg = Math.sin(hg);
  // qz(α) ⊗ qx(β)
  const x1 = ca * sb, y1 = sa * sb, z1 = sa * cb, w1 = ca * cb;
  // ⊗ qy(γ) = (0, sg, 0, cg)
  out[0] = x1 * cg - z1 * sg;
  out[1] = w1 * sg + y1 * cg;
  out[2] = x1 * sg + z1 * cg;
  out[3] = w1 * cg - y1 * sg;
  return out;
}
/** conj(p) ⊗ q  → rotation from p to q in p's (device) frame. */
function relQuat(p, q, out) {
  const px = -p[0], py = -p[1], pz = -p[2], pw = p[3];
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  out[0] = pw * qx + px * qw + py * qz - pz * qy;
  out[1] = pw * qy - px * qz + py * qw + pz * qx;
  out[2] = pw * qz + px * qy - py * qx + pz * qw;
  out[3] = pw * qw - px * qx - py * qy - pz * qz;
  return out;
}
/** Earth "down" (0,0,−1) expressed in the device frame: conj(q) · v · q. */
function downInDevice(q, out) {
  const [x, y, z, w] = q;
  // third column of the rotation matrix (device z axis in earth) … we need R^T·(0,0,−1) = −(row 3 of R)
  out[0] = -(2 * (x * z - w * y));
  out[1] = -(2 * (y * z + w * x));
  out[2] = -(1 - 2 * (x * x + y * y));
  return out;
}

export class Gyro {
  constructor() {
    this.supported = typeof window !== 'undefined' && ('DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window);
    this.enabled = false;       // listening
    this.granted = false;       // iOS permission obtained this session
    this.working = false;       // real samples have arrived
    this.sens = 0; this.invX = false; this.invY = false;
    this.dYaw = 0; this.dPitch = 0;   // accumulated radians (+yaw = turn left, +pitch = look up)
    this._q = [0, 0, 0, 1]; this._qp = [0, 0, 0, 1]; this._dq = [0, 0, 0, 1]; this._down = [0, 0, -1];
    this._hasQ = false; this._tQ = 0;
    this._sm = { y: 0, p: 0 };
    this._src = 'ori';          // 'ori' | 'rrA' | 'rrB'
    this._rrScale = 1;          // deg/s (1) or rad/s (57.3) → deg/s
    this._rr = null; this._tRR = 0;
    this._cal = { n: 0, a: 0, b: 0, ra: 0, rb: 0 };
    this._onOri = (e) => this._orientation(e);
    this._onMot = (e) => this._motion(e);
  }

  configure({ sens, invX, invY } = {}) {
    if (sens != null) this.sens = +sens || 0;
    if (invX != null) this.invX = !!invX;
    if (invY != null) this.invY = !!invY;
  }

  /** Ask for motion access. MUST be called synchronously from a user gesture (click / touchend) on iOS. */
  request() {
    const DOE = window.DeviceOrientationEvent, DME = window.DeviceMotionEvent;
    const asks = [];
    try { if (DOE && typeof DOE.requestPermission === 'function') asks.push(DOE.requestPermission()); } catch (e) { asks.push(Promise.reject(e)); }
    try { if (DME && typeof DME.requestPermission === 'function') asks.push(DME.requestPermission()); } catch (e) { asks.push(Promise.reject(e)); }
    if (!asks.length) { this.granted = this.supported; return Promise.resolve(this.granted); }
    return Promise.allSettled(asks).then((r) => {
      this.granted = r.some((x) => x.status === 'fulfilled' && x.value === 'granted');
      return this.granted;
    });
  }
  /** iOS remembers nothing across reloads: the permission must be asked again from a tap. */
  get needsPermission() {
    const DOE = window.DeviceOrientationEvent;
    return !this.granted && !!(DOE && typeof DOE.requestPermission === 'function');
  }

  start() {
    if (this.enabled || !this.supported) return;
    this.enabled = true; this.working = false; this._hasQ = false; this._rr = null;
    this._src = 'ori'; this._cal = { n: 0, a: 0, b: 0, ra: 0, rb: 0 };
    addEventListener('deviceorientation', this._onOri, { passive: true });
    addEventListener('devicemotion', this._onMot, { passive: true });
  }
  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    removeEventListener('deviceorientation', this._onOri);
    removeEventListener('devicemotion', this._onMot);
    this.dYaw = this.dPitch = 0; this._sm.y = this._sm.p = 0; this._hasQ = false;
  }
  /** Take the look delta gathered since the last call (radians). */
  consume(out) { out.yaw = this.dYaw; out.pitch = this.dPitch; this.dYaw = this.dPitch = 0; return out; }
  discard() { this.dYaw = this.dPitch = 0; }
  /** Forget the previous attitude (after a pause / orientation change) so no jump is integrated. */
  resync() { this._hasQ = false; this._rr = null; this._sm.y = this._sm.p = 0; }

  // ---------------------------------------------------------------------------------------- sources
  _orientation(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const t = e.timeStamp || performance.now();
    const dt0 = this._hasQ ? (t - this._tQ) / 1000 : 0;
    if (this._hasQ && dt0 < 0.002) return;          // burst-delivered twin: fold it into the next sample
    quatFromEuler(e.alpha, e.beta, e.gamma, this._q);
    downInDevice(this._q, this._down);
    if (this._hasQ) {
      // the attitude difference is an exact rotation whatever the interval, so a frame hitch never loses aim
      // (pause / app switch / rotation call resync() explicitly)
      const dt = dt0;
      {
        relQuat(this._qp, this._q, this._dq);
        let [x, y, z, w] = this._dq;
        if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
        const s = Math.sqrt(x * x + y * y + z * z);
        const ang = 2 * Math.atan2(s, w);
        const k = s > 1e-9 ? ang / s / dt : 0;              // rad/s along the axis
        const wx = x * k, wy = y * k, wz = z * k;
        this.working = true;
        if (this._src === 'ori') this._sample(wx, wy, wz, dt);
        this._calibrate(wx, wy, wz, t);
      }
    }
    this._qp[0] = this._q[0]; this._qp[1] = this._q[1]; this._qp[2] = this._q[2]; this._qp[3] = this._q[3];
    this._tQ = t; this._hasQ = true;
  }

  _motion(e) {
    const r = e.rotationRate;
    if (!r || r.alpha == null || r.beta == null || r.gamma == null) return;
    const t = e.timeStamp || performance.now();
    const prevT = this._tRR;
    this._tRR = t;
    this._rr = [r.alpha, r.beta, r.gamma];
    if (this._src === 'ori' || !this._hasQ) return;
    const dt = (t - prevT) / 1000;
    if (!(dt > 0.002 && dt < 0.25)) return;
    const k = this._rrScale * D2R;
    // A: spec (alpha = z, beta = x, gamma = y) · B: alpha = x, beta = y, gamma = z
    const [a, b, g] = this._rr;
    if (this._src === 'rrA') this._sample(b * k, g * k, a * k, dt);
    else this._sample(a * k, b * k, g * k, dt);
  }

  /** Compare rotationRate against the attitude-derived ω during clear motion; adopt it once it provably agrees. */
  _calibrate(wx, wy, wz, t) {
    if (this._src !== 'ori' || !this._rr || t - this._tRR > 60) return;
    const wl = Math.hypot(wx, wy, wz);
    if (wl < 0.9) return;                                   // needs a real turn (> ~50°/s)
    const [a, b, g] = this._rr;
    const A = [b, g, a], B = [a, b, g];
    const la = Math.hypot(A[0], A[1], A[2]) || 1e-9, lb = Math.hypot(B[0], B[1], B[2]) || 1e-9;
    const C = this._cal;
    C.a += (A[0] * wx + A[1] * wy + A[2] * wz) / (la * wl);
    C.b += (B[0] * wx + B[1] * wy + B[2] * wz) / (lb * wl);
    C.ra += (wl / D2R) / la; C.rb += (wl / D2R) / lb;
    C.n++;
    if (C.n < 30) return;
    const ca = C.a / C.n, cb = C.b / C.n;
    const pick = ca > 0.9 && ca > cb + 0.15 ? 'rrA' : cb > 0.9 && cb > ca + 0.15 ? 'rrB' : null;
    const ratio = pick === 'rrA' ? C.ra / C.n : C.rb / C.n;
    const scale = ratio > 0.7 && ratio < 1.4 ? 1 : ratio > 40 && ratio < 80 ? 180 / Math.PI : 0;
    if (pick && scale) { this._src = pick; this._rrScale = scale; }
    else if (C.n > 120) this._cal = { n: 0, a: 0, b: 0, ra: 0, rb: 0 };   // inconclusive: keep attitude, retry later
  }

  // ---------------------------------------------------------------------------------------- processing
  _sample(wx, wy, wz, dt) {
    // device → screen space (screen rotated θ counter-clockwise from natural)
    const th = screenAngle() * D2R, c = Math.cos(th), s = Math.sin(th);
    const px = wx * c - wy * s, py = wx * s + wy * c, pz = wz;            // ω about screen-right / screen-up / out-of-screen
    const d = this._down;
    const gy = d[0] * s + d[1] * c, gz = d[2];
    const gl = Math.hypot(d[0] * c - d[1] * s, gy, gz) || 1;
    // player-space yaw: the part of the turn around real vertical, allowed to borrow from roll (±45° relax)
    const worldYaw = -(gy * py + gz * pz) / gl;
    const yawAxes = Math.hypot(py, pz);
    let yaw = Math.sign(worldYaw) * Math.min(Math.abs(worldYaw) * 1.41, yawAxes);
    let pitch = px;
    // soft tiered smoothing + tightening (deg/s thresholds)
    const sp = Math.hypot(yaw, pitch) / D2R;
    const direct = clamp((sp - 3) / 7, 0, 1);
    const k = 1 - Math.exp(-Math.min(dt, 0.1) / 0.06);
    this._sm.y += (yaw - this._sm.y) * k; this._sm.p += (pitch - this._sm.p) * k;
    yaw = yaw * direct + this._sm.y * (1 - direct);
    pitch = pitch * direct + this._sm.p * (1 - direct);
    if (sp < 0.8) { const f = sp / 0.8; yaw *= f; pitch *= f; }
    const gain = 360 / gyroTurnDeg(this.sens);
    this.dYaw += yaw * dt * gain * (this.invX ? -1 : 1);
    this.dPitch += pitch * dt * gain * (this.invY ? -1 : 1);
  }
}
