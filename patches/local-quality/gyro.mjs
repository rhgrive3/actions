import { getPlatformLifecycle } from './platform-lifecycle.mjs';
import { GyroPermission, gyroStatusMessage } from './gyro-permission.mjs';
// Sensor reliability overlay. All angles in the original processing pipeline
// remain radians; motion events are only admitted while attitude agrees.
// Existing Android/quaternion math is unchanged. Permission and page lifetime
// are integrated here, rather than stacking another sensor wrapper.
const INSTALL = Symbol.for('inkwave.local-quality.gyro.v1');
const RAD = Math.PI / 180;
// #187: rotationRate is in deg/s (W3C Device Orientation and Motion). A rate whose
// magnitude is at or below this value counts as "effectively zero" on Android.
// Engineering threshold shared with the #615 still definition below; it is not a
// published Nintendo or W3C constant, and real-device noise/bias is unverified.
const STILL_DEG = 0.35;
const zeros = () => ({ n: 0, a: 0, b: 0, ra: 0, rb: 0 });
const state = g => g._qualityGyro || (g._qualityGyro = {
  orientationTime: -Infinity, rate: [0, 0, 0], screen: null,
  fallbacks: 0, reason: null, motionTime: -Infinity, stationaryMotion: false,
  // #615 raw zero-rate bias; retain the current Android and handoff owners.
  bias: [0, 0, 0], still: 0, biasSrc: null,
});
const finiteGyroAxes = e => typeof e?.alpha === 'number' && Number.isFinite(e.alpha)
  && typeof e?.beta === 'number' && Number.isFinite(e.beta)
  && typeof e?.gamma === 'number' && Number.isFinite(e.gamma);
function fallback(g, reason) {
  const s = state(g);
  if (g._src !== 'ori') { s.fallbacks++; s.reason = reason; }
  g._src = 'ori'; g._rrScale = 1; g._cal = zeros(); s.rawPendingBoundary = null;
  g._sm.y = g._sm.p = 0;
}
// A committed sample owns a timestamped attitude, independent of which sensor
// supplied it. Raw intervals advance that attitude with their existing body-rate
// model; fallback consumes absolute attitude observations after that boundary.
function commitRaw(s, x, y, z, dt, time) {
  const speed=Math.hypot(x,y,z),half=speed*dt/2,k=speed>0?Math.sin(half)/speed:0;
  const [qx,qy,qz,qw]=s.boundary.q,X=x*k,Y=y*k,Z=z*k,W=Math.cos(half);
  const a=qw*X+qx*W+qy*Z-qz*Y,b=qw*Y-qx*Z+qy*W+qz*X,c=qw*Z+qx*Y-qy*X+qz*W,d=qw*W-qx*X-qy*Y-qz*Z;
  const n=Math.hypot(a,b,c,d);s.boundary.q=[a/n,b/n,c/n,d/n];
  s.boundary.time=time;
  const records = s.attitudes;
  let keep = 0;
  for (let i = 0; i < records.length; i++) { const point = records[i]; if (point.time > time) records[keep++] = point; }
  records.length = keep;
}
function consumeAttitude(g, s, point, sample) {
  if (!s.boundary) { s.boundary={time:point.time,q:point.q.slice()};return; }
  if (!(point.time>s.boundary.time)) return;
  const p=s.boundary.q,q=point.q,px=-p[0],py=-p[1],pz=-p[2],pw=p[3];
  const [X,Y,Z,W]=q;
  let x=pw*X+px*W+py*Z-pz*Y,y=pw*Y-px*Z+py*W+pz*X,z=pw*Z+px*Y-py*X+pz*W,w=pw*W-px*X-py*Y-pz*Z;
  const length=Math.hypot(x,y,z,w);x/=length;y/=length;z/=length;w/=length;
  if(w<0){x=-x;y=-y;z=-z;w=-w;}
  const dt=(point.time-s.boundary.time)/1000,n=Math.hypot(x,y,z),k=n>1e-9?2*Math.atan2(n,w)/n/dt:0;
  const down=g._down,d0=down[0],d1=down[1],d2=down[2],[qx,qy,qz,qw]=q;
  g._down[0]=-2*(qx*qz-qw*qy);g._down[1]=-2*(qy*qz+qw*qx);g._down[2]=-(1-2*(qx*qx+qy*qy));
  try { sample.call(g,x*k,y*k,z*k,dt); }
  finally { g._down[0]=d0;g._down[1]=d1;g._down[2]=d2; }
  s.boundary={time:point.time,q:q.slice()};
}
function consumeThrough(g,s,time,sample) {
  const points=s.attitudes||[];s.attitudes=[];
  for(const point of points)if(point.time<=time)consumeAttitude(g,s,point,sample);else s.attitudes.push(point);
  consumeAttitude(g,s,{time,q:g._q},sample);
}
export function gyroRateTrusted(g, rate, time) { return gyroRateComponentsTrusted(g, rate.alpha, rate.beta, rate.gamma, time); }
function gyroRateComponentsTrusted(g, a, b, c, time) {
  const s = state(g), age = time - s.orientationTime;
  if (!(age >= 0 && age <= 75)) return false;
  const k = g._rrScale * RAD;
  const x = (g._src === 'rrA' ? b : a) * k;
  const y = (g._src === 'rrA' ? c : b) * k;
  const z = (g._src === 'rrA' ? a : c) * k;
  const [ox, oy, oz] = s.rate, speed = Math.hypot(ox, oy, oz);
  // Keep the existing absolute disagreement floor continuous at zero speed.
  return Math.hypot(x - ox, y - oy, z - oz) <= Math.max(.025, speed * .3);
}
export function installGyroQuality(Gyro, getScreenAngle, isAndroid = () => /Android/i.test(globalThis.navigator?.userAgent || ''), env = globalThis) {
  const P = Gyro.prototype;
  if (Object.hasOwn(P, INSTALL)) return;
  Object.defineProperty(P, INSTALL, { value: true });
  const start = P.start, stop = P.stop, resync = P.resync, discard = P.discard;
  const orientation = P._orientation, motion = P._motion, calibrate = P._calibrate, sample = P._sample;
  const lifecycle = getPlatformLifecycle(env);
  const accessFor = g => {
    if (g._platformGyroAccess) return g._platformGyroAccess;
    const access = g._platformGyroAccess = new GyroPermission(env, lifecycle);
    g.supported = access.capability.supported;
    access.onUnavailable = () => {
      // Stop native listening without clearing the diagnostic failure reason.
      stop.call(g); g.resync(); g.working = false;
    };
    const halt = () => {
      stop.call(g); g.resync(); g.working = false;
      access.stopListening('suspend'); access.cancelRequest();
    };
    access.unsubscribeLifecycle = lifecycle.subscribe({
      suspend: halt,
      resume: () => { if (access.wanted && access.allowed) g.start(); else access.stopListening(); },
      blur: () => { g.resync(); access.stopProbe(); },
      focus: () => {
        g._platformSensorStart = env.performance.now();
        g.resync();
        if (g.enabled && lifecycle.active) access.beginListening();
      },
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
    if (g.enabled && lifecycle.active && lifecycle.focused) accessFor(g).beginListening();
    return true;
  };
  P.discard = function () {
    const result=discard.call(this),s=state(this);
    // Discarded output includes observed-but-not-yet-emitted attitude intervals.
    // Rebase only to a pose actually observed, never an interpolated frame time.
    if(this._hasQ && (!s.boundary || this._tQ>s.boundary.time))s.boundary={time:this._tQ,q:this._q.slice()};
    s.attitudes=[];s.rawPendingBoundary=null;
    return result;
  };
  P.resync = function () {
    resync.call(this);
    const s = state(this); s.orientationTime = s.motionTime = -Infinity; s.stationaryMotion = false; s.rate.fill(0);
    s.bias[0] = s.bias[1] = s.bias[2] = 0; s.still = 0; s.biasSrc = null;
    s.boundary=null;s.attitudes=[];s.event=null;
    this._tQ = this._tRR = 0; this.dYaw = this.dPitch = 0;
    fallback(this, 'resync');
  };
  P.start = function () {
    const access = accessFor(this);
    if (access.disposed) return false;
    access.wanted = true;
    if (!lifecycle.active || !access.allowed) return false;
    if (this._platformCanStart && !this._platformCanStart()) { access.stopListening(); return false; }
    if (this.enabled) {
      if (access.availability === 'stale' || access.availability === 'idle') { this.resync(); access.beginListening(); }
      return true;
    }
    this.supported = access.capability.supported;
    this.resync(); state(this).screen = Number(getScreenAngle()) || 0;
    this._platformSensorStart = env.performance.now();
    try { start.call(this); }
    catch (error) {
      stop.call(this); access.availability = 'unavailable';
      access.reason = 'sensor-start-error'; access.notify(); return false;
    }
    access.beginListening();
    // A permission response may arrive while browser chrome owns focus.
    // Preserve its session intent; the focused interval owns viability timing.
    if (!lifecycle.focused) access.stopProbe();
    return this.enabled;
  };
  P.stop = function () {
    const access = accessFor(this); access.wanted = false;
    access.cancelRequest(false); access.stopListening();
    const result = stop.call(this); this.resync(); this.working = false; return result;
  };
  P._sample = function (x,y,z,dt) {
    const s=state(this),event=s.event;
    if(!event || !s.boundary)return sample.call(this,x,y,z,dt);
    if(event.kind==='orientation') {
      if(s.boundary.time===this._tQ && !(s.attitudes?.length)){
        const result=sample.call(this,x,y,z,dt);s.boundary={time:event.time,q:this._q.slice()};return result;
      }
      consumeThrough(this,s,event.time,sample);return;
    }
    const remaining=(event.time-s.boundary.time)/1000;
    if(!(remaining>0.002)){s.rawPendingBoundary=s.boundary.time;return;} // Native burst gate; retain adoption origin.
    // Never stretch one accepted raw rate over a gap of rejected raw samples.
    // The only carried short interval is the existing first-adoption burst gate.
    if(dt+Number.EPSILON*8<remaining && s.rawPendingBoundary!==s.boundary.time){fallback(this,'unintegrated-motion');return;}
    s.rawPendingBoundary=null;
    const result=sample.call(this,x,y,z,remaining);
    commitRaw(s,x,y,z,remaining,event.time);return result;
  };
  P._calibrate = function (x, y, z, time) {
    const s = state(this); s.rate[0] = x; s.rate[1] = y; s.rate[2] = z; s.orientationTime = time;
    if (isAndroid()) { if (this._src !== 'ori') fallback(this, 'android-attitude'); return; }
    if (this._src !== 'ori' && this._rr) {
      if (time - this._tRR > 75 || s.boundary && time - s.boundary.time > 75 || !gyroRateComponentsTrusted(this, this._rr[0], this._rr[1], this._rr[2], time)) fallback(this, 'attitude-disagreement');
    }
    return calibrate.call(this, x, y, z, time);
  };
  P._orientation = function (e) {
    if (!this.enabled || !lifecycle.active || !lifecycle.focused || !finiteGyroAxes(e)) return;
    screenChanged(this);
    const t = e.timeStamp || env.performance.now();
    if (!Number.isFinite(t)) return;
    if (t < this._platformSensorStart && this._platformSensorStart - t < 3600000) return;
    if (this._hasQ && (t < this._tQ || t - this._tQ > 500)) this.resync();
    accessFor(this).sample(t);
    if (isAndroid() && this._src !== 'ori') fallback(this, 'android-attitude');
    const observed = state(this);
    // Optional motion permission can settle after orientation has started.
    // A later denial retires prior zero-rate evidence immediately; orientation
    // remains authorized and must not be suppressed by a denied sensor stream.
    if (accessFor(this).motionPermission === 'denied') {
      observed.stationaryMotion = false; observed.motionTime = -Infinity;
    }
    const age = t - observed.motionTime;
    const stationary = isAndroid() && observed.stationaryMotion && age >= 0 && age <= 75;
    const yaw = this.dYaw, pitch = this.dPitch;
    const s=observed,hadQ=this._hasQ,previousTime=this._tQ,previousEvent=s.event,depth=s.eventDepth||0;
    // Reuse internal metadata only. Never retain or replace the browser event.
    const events=s.eventSlots||(s.eventSlots=[]),event=events[depth]||(events[depth]={kind:'',time:0});
    event.kind='orientation';event.time=t;s.event=event;s.eventDepth=depth+1;
    try {
      const result=orientation.call(this,e);
      if(this._hasQ && this._tQ===t && (!hadQ || t>previousTime)){
        if(!s.boundary)s.boundary={time:t,q:this._q.slice()};
        else if(s.boundary.time===t)s.boundary.q=this._q.slice();
        else if(this._src==='ori')consumeThrough(this,s,t,sample);
        else if(t>s.boundary.time)(s.attitudes||(s.attitudes=[])).push({time:t,q:this._q.slice()});
      }
      if (stationary) {
        // #187: the rate magnitude (spec deg/s, axis-order independent) is at or
        // below STILL_DEG. Keep the updated attitude reference, but do not turn
        // its correction into camera motion.
        this.dYaw = yaw; this.dPitch = pitch; this._sm.y = this._sm.p = 0;
      }
      return result;
    } finally { s.event=previousEvent;s.eventDepth=depth; }
  };
  P._motion = function (e) {
    if (!this.enabled || !lifecycle.active || !lifecycle.focused || !finiteGyroAxes(e.rotationRate)) return;
    if (accessFor(this).motionPermission === 'denied') return;
    screenChanged(this);
    const t = e.timeStamp || env.performance.now();
    if (!Number.isFinite(t)) return;
    if (t < this._platformSensorStart && this._platformSensorStart - t < 3600000) return;
    if (this._tRR && (t < this._tRR || t - this._tRR > 500)) this.resync();
    const s=state(this); s.motionTime = t;
    // #187: use the same 0.35 deg/s stationary band as the explicit
    // Android orientation drift regression and the #615 calibration gate.
    // Any sample above this gate still takes the native orientation path.
    s.stationaryMotion = Math.hypot(e.rotationRate.alpha, e.rotationRate.beta, e.rotationRate.gamma) <= STILL_DEG;
    if (this._src !== 'ori' && (isAndroid() || !gyroRateTrusted(this, e.rotationRate, t))) fallback(this, 'untrusted-motion');
    const previousEvent=s.event,depth=s.eventDepth||0,events=s.eventSlots||(s.eventSlots=[]),event=events[depth]||(events[depth]={kind:'',time:0});
    event.kind='motion';event.time=t;s.event=event;s.eventDepth=depth+1;
    try {
      // As in #524, the initial sub-2ms burst keeps the adoption origin until
      // the first native accepted sample, rather than accumulating skipped gaps.
      if(this._src!=='ori' && s.rawPendingBoundary!=null && s.boundary?.time===s.rawPendingBoundary)this._tRR=s.rawPendingBoundary;
      return motion.call(this,e);
    }finally{s.event=previousEvent;s.eventDepth=depth;}
  };
  // #615 stationary stability calibration. Only the raw rotationRate path can
  // hold a zero-rate offset; the attitude path integrates no bias. Learn the
  // offset as a bias strictly while the attitude stream says the device is
  // still (below STILL_DEG for HOLD_S seconds), subtract it from every raw
  // sample, and time-normalize with dt so event frequency cannot change the
  // result. Thresholds are engineering values for this overlay — not
  // Nintendo's unpublished calibration constants. Raw-minus-attitude residual
  // learning preserves deliberate motion even below the stillness threshold.
  const HOLD_S = 1.2, TAU_S = 2;
  const calibratedSample = P._sample;
  P._sample = function (wx, wy, wz, dt) {
    const s = state(this);
    if (this._src === 'ori' || !(dt > 0)) return calibratedSample.call(this, wx, wy, wz, dt);
    if (s.biasSrc !== this._src) { s.biasSrc = this._src; s.bias[0] = s.bias[1] = s.bias[2] = 0; s.still = 0; }
    const att = Math.hypot(s.rate[0], s.rate[1], s.rate[2]) / RAD;
    if (att <= STILL_DEG) s.still += dt; else s.still = 0;
    if (s.still >= HOLD_S) {
      // Learn the raw-minus-attitude residual, not the measured turn itself.
      // Deliberate motion below STILL_DEG must keep its native response.
      const k = 1 - Math.exp(-dt / TAU_S);
      s.bias[0] += (wx - s.rate[0] - s.bias[0]) * k;
      s.bias[1] += (wy - s.rate[1] - s.bias[1]) * k;
      s.bias[2] += (wz - s.rate[2] - s.bias[2]) * k;
    }
    return calibratedSample.call(this, wx - s.bias[0], wy - s.bias[1], wz - s.bias[2], dt);
  };
}
