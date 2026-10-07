import { getPlatformLifecycle } from './platform-lifecycle.mjs';
import { GyroPermission, gyroStatusMessage } from './gyro-permission.mjs';
// Sensor reliability overlay. All angles in the original processing pipeline
// remain radians; motion events are only admitted while attitude agrees.
// Existing Android/quaternion math is unchanged. Permission and page lifetime
// are integrated here, rather than stacking another sensor wrapper.
const INSTALL = Symbol.for('inkwave.local-quality.gyro.v1');
const RAD = Math.PI / 180;
const zeros = () => ({ n: 0, a: 0, b: 0, ra: 0, rb: 0 });
// Issue 921 stationary zero-rate calibration. Only REST_MIN_S reuses the
// Nintendo-documented minimum (5s on a stable flat surface); the rate gates
// and time constant below are internal implementation tuning, not Nintendo
// estimator coefficients.
const REST_MIN_S = 5, REST_ATT_DPS = 2, REST_RAW_DPS = 4, REST_TAU_S = 1;
const restFresh = () => ({ bias: [0, 0, 0], still: 0, last: -Infinity, ok: false });
const state = g => g._qualityGyro || (g._qualityGyro = {
  orientationTime: -Infinity, rate: [0, 0, 0], screen: null,
  fallbacks: 0, reason: null, rest: restFresh(),
});
const finiteEvent = (e, keys) => keys.every(k => typeof e?.[k] === 'number' && Number.isFinite(e[k]));
function fallback(g, reason) {
  const s = state(g);
  if (g._src !== 'ori') { s.fallbacks++; s.reason = reason; }
  g._src = 'ori'; g._rrScale = 1; g._cal = zeros(); s.rawPendingBoundary = null;
  g._sm.y = g._sm.p = 0; s.rest = restFresh();
}
function restObserve(g, s, x, y, z, time) {
  const r = s.rest || (s.rest = restFresh());
  const prev = r.last; r.last = time;
  let dt = Number.isFinite(prev) ? (time - prev) / 1000 : 0;
  if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.25);
  const attDps = Math.hypot(x, y, z) / RAD;
  let rawDps = null, rawVec = null;
  if (g._rr && (time - g._tRR) <= 75) {
    const k = g._rrScale * RAD, a = g._rr[0], b = g._rr[1], c = g._rr[2];
    if (g._src === 'rrA') rawVec = [b * k, c * k, a * k];
    else if (g._src === 'rrB') rawVec = [a * k, b * k, c * k];
    rawDps = rawVec ? Math.hypot(rawVec[0], rawVec[1], rawVec[2]) / RAD : Math.hypot(a, b, c) * g._rrScale;
  }
  if (attDps <= REST_ATT_DPS && (rawDps == null || rawDps <= REST_RAW_DPS)) {
    r.still += dt;
    let ox = x, oy = y, oz = z;
    if (rawVec && g._src !== 'ori') { ox = rawVec[0]; oy = rawVec[1]; oz = rawVec[2]; }
    if (r.still <= dt + 1e-9) { r.bias = [ox, oy, oz]; }
    else {
      const al = 1 - Math.exp(-dt / REST_TAU_S);
      r.bias[0] += (ox - r.bias[0]) * al; r.bias[1] += (oy - r.bias[1]) * al; r.bias[2] += (oz - r.bias[2]) * al;
    }
    if (r.still >= REST_MIN_S) r.ok = true;
  } else { r.still = 0; }
}
// A committed sample owns a timestamped attitude, independent of which sensor
// supplied it. Raw intervals advance that attitude with their existing body-rate
// model; fallback consumes absolute attitude observations after that boundary.
function multiplyQuat(a, b) {
  const [x,y,z,w]=a,[X,Y,Z,W]=b;
  const q=[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
  const n=Math.hypot(...q);return q.map(v=>v/n);
}
function commitRaw(s, x, y, z, dt, time) {
  const speed=Math.hypot(x,y,z),half=speed*dt/2,k=speed>0?Math.sin(half)/speed:0;
  s.boundary.q=multiplyQuat(s.boundary.q,[x*k,y*k,z*k,Math.cos(half)]);
  s.boundary.time=time;
  s.attitudes=s.attitudes.filter(p=>p.time>time);
}
function consumeAttitude(g, s, point, sample) {
  if (!s.boundary) { s.boundary={time:point.time,q:point.q.slice()};return; }
  if (!(point.time>s.boundary.time)) return;
  const p=s.boundary.q,q=point.q,delta=multiplyQuat([-p[0],-p[1],-p[2],p[3]],q);
  let [x,y,z,w]=delta;if(w<0){x=-x;y=-y;z=-z;w=-w;}
  const dt=(point.time-s.boundary.time)/1000,n=Math.hypot(x,y,z),k=n>1e-9?2*Math.atan2(n,w)/n/dt:0;
  const down=g._down.slice(),[qx,qy,qz,qw]=q;
  g._down[0]=-2*(qx*qz-qw*qy);g._down[1]=-2*(qy*qz+qw*qx);g._down[2]=-(1-2*(qx*qx+qy*qy));
  try { sample.call(g,x*k,y*k,z*k,dt); }
  finally { for(let i=0;i<3;i++)g._down[i]=down[i]; }
  s.boundary={time:point.time,q:q.slice()};
}
function consumeThrough(g,s,time,sample) {
  const points=s.attitudes||[];s.attitudes=[];
  for(const point of points)if(point.time<=time)consumeAttitude(g,s,point,sample);else s.attitudes.push(point);
  consumeAttitude(g,s,{time,q:g._q},sample);
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
  const start = P.start, stop = P.stop, resync = P.resync, discard = P.discard;
  const orientation = P._orientation, motion = P._motion, calibrate = P._calibrate, sample = P._sample;
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
    const s = state(this); s.orientationTime = -Infinity; s.rate.fill(0);
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
  P._sample = function (x,y,z,dt) {
    const s=state(this),event=s.event;
    const biased=function(bx,by,bz,bdt){const r=s.rest;if(r&&r.ok){bx-=r.bias[0];by-=r.bias[1];bz-=r.bias[2];}return sample.call(this,bx,by,bz,bdt);};
    if(!event || !s.boundary)return biased.call(this,x,y,z,dt);
    if(event.kind==='orientation') {
      if(s.boundary.time===this._tQ && !(s.attitudes?.length)){
        const result=biased.call(this,x,y,z,dt);s.boundary={time:event.time,q:this._q.slice()};return result;
      }
      consumeThrough(this,s,event.time,biased);return;
    }
    const remaining=(event.time-s.boundary.time)/1000;
    if(!(remaining>0.002)){s.rawPendingBoundary=s.boundary.time;return;} // Native burst gate; retain adoption origin.
    // Never stretch one accepted raw rate over a gap of rejected raw samples.
    // The only carried short interval is the existing first-adoption burst gate.
    if(dt+Number.EPSILON*8<remaining && s.rawPendingBoundary!==s.boundary.time){fallback(this,'unintegrated-motion');return;}
    s.rawPendingBoundary=null;
    const result=biased.call(this,x,y,z,remaining);
    commitRaw(s,x,y,z,remaining,event.time);return result;
  };
  P._calibrate = function (x, y, z, time) {
    const s = state(this); s.rate[0] = x; s.rate[1] = y; s.rate[2] = z; s.orientationTime = time;
    if (isAndroid()) { if (this._src !== 'ori') fallback(this, 'android-attitude'); return; }
    if (this._src !== 'ori' && this._rr) {
      const r = { alpha: this._rr[0], beta: this._rr[1], gamma: this._rr[2] };
      if (time - this._tRR > 75 || s.boundary && time - s.boundary.time > 75 || !gyroRateTrusted(this, r, time)) fallback(this, 'attitude-disagreement');
    }
    restObserve(this, s, x, y, z, time);
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
    const s=state(this),hadQ=this._hasQ,previousTime=this._tQ;s.event={kind:'orientation',time:t};
    try {
      const result=orientation.call(this,e);
      if(this._hasQ && this._tQ===t && (!hadQ || t>previousTime)){
        if(!s.boundary)s.boundary={time:t,q:this._q.slice()};
        else if(s.boundary.time===t)s.boundary.q=this._q.slice();
        else if(this._src==='ori'){const gz=this,ss=s;consumeThrough(this,s,t,function(bx,by,bz,bdt){const r=ss.rest;if(r&&r.ok){bx-=r.bias[0];by-=r.bias[1];bz-=r.bias[2];}return sample.call(gz,bx,by,bz,bdt);});}
        else if(t>s.boundary.time)(s.attitudes||(s.attitudes=[])).push({time:t,q:this._q.slice()});
      }
      return result;
    } finally { s.event=null; }
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
    const s=state(this);s.event={kind:'motion',time:t};
    try {
      // As in #524, the initial sub-2ms burst keeps the adoption origin until
      // the first native accepted sample, rather than accumulating skipped gaps.
      if(this._src!=='ori' && s.rawPendingBoundary!=null && s.boundary?.time===s.rawPendingBoundary)this._tRR=s.rawPendingBoundary;
      return motion.call(this,e);
    }finally{s.event=null;}
  };
}
