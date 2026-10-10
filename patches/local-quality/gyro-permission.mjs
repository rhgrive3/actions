// Permission is document/session evidence, never a saved user preference.
// Orientation is required by INKWAVE's quaternion path; rotationRate is optional.
export function gyroCapability(env = globalThis) {
  const orientation = env.DeviceOrientationEvent;
  const motion = env.DeviceMotionEvent;
  let reason = null;
  if (env.isSecureContext === false) reason = 'insecure-context';
  else if (!orientation) reason = 'orientation-api-missing';
  const policy = env.document?.permissionsPolicy || env.document?.featurePolicy;
  // Relative orientation/motion needs both sensors. Query independently: an
  // unknown feature throwing must not hide an explicit denial of the other.
  for (const feature of ['accelerometer', 'gyroscope']) {
    try {
      if (policy?.allowsFeature?.(feature) === false) reason = 'permissions-policy';
    } catch {}
  }
  return { supported: !reason, reason, orientation, motion,
    orientationRequest: typeof orientation?.requestPermission === 'function',
    motionRequest: typeof motion?.requestPermission === 'function' };
}

// Only a default: native settings merging still gives every saved choice priority.
export function initialGyroDefaults(defaults, profile, env = globalThis) {
  return { ...defaults, gyro: !!profile?.touch && gyroCapability(env).supported };
}

// Absence alone is ambiguous on change-only sensor streams: warn softly, never
// revoke permission, switch off user preference or remove a working listener.
export const GYRO_STALE_MS = 15000;
export class GyroPermission {
  constructor(env = globalThis, lifecycle) {
    this.env = env; this.lifecycle = lifecycle;
    this.capability = gyroCapability(env);
    this.permission = this.capability.orientationRequest ? 'prompt' : (this.capability.supported ? 'not-required' : 'unsupported');
    this.motionPermission = this.capability.motionRequest ? 'prompt' : 'not-required';
    this.availability = 'idle';
    this.reason = this.capability.reason;
    this.pending = null;
    this.probe = null;
    this.generation = 0;
    this.received = false; this.hasSample = false; this.healthProbe = null; this.healthAt = null;
    this.lastSampleAt = null;
    this.lastRequest = { generation: 0, result: null, error: null };
    this.disposed = false;
    this.wanted = false;
    this.listeners = new Set();
  }
  get allowed() { return this.capability.supported && (this.permission === 'granted' || this.permission === 'not-required'); }
  get needsPermission() { return this.capability.supported && this.capability.orientationRequest && this.permission !== 'granted'; }
  get state() {
    if (!this.capability.supported) return 'unsupported';
    if (this.pending) return 'permission-pending';
    if (this.permission === 'denied') return 'supported-denied';
    if (this.permission === 'error') return 'unknown-error';
    if (this.availability === 'unavailable' || this.availability === 'suspended') return 'temporarily-unavailable';
    if (this.availability === 'stale') return 'supported-stale';
    if (this.needsPermission) return 'supported-permission-needed';
    return 'supported-granted';
  }
  snapshot() { return { state: this.state, supported: this.capability.supported, reason: this.reason,
    permission: this.permission, motionPermission: this.motionPermission, availability: this.availability,
    pending: !!this.pending, received: this.received, wanted: this.wanted, standalone: !!this.lifecycle?.standalone,
    orientationRequestAvailable: this.capability.orientationRequest, motionRequestAvailable: this.capability.motionRequest,
    generation: this.generation, lastRequest: { ...this.lastRequest }, lastSampleAt: this.lastSampleAt,
    lifecycleState: this.lifecycle?.state ?? null, lifecycleEpoch: this.lifecycle?.epoch ?? null,
    lifecycleLastEvent: this.lifecycle?.lastEvent ?? null }; }
  subscribe(callback) { this.listeners.add(callback); callback(this.snapshot()); return () => this.listeners.delete(callback); }
  notify() { const value = this.snapshot(); for (const callback of [...this.listeners]) try { callback(value); } catch {} }
  request() {
    if (this.disposed || !this.capability.supported) return Promise.resolve(false);
    // A new explicit attempt must not replay the prior no-data notification
    // into MobileInput's current intent before its promise can finish.
    if (this.reason === 'no-sensor-data' || this.reason === 'sensor-data-stale') { this.availability = 'idle'; this.reason = null; }
    this.wanted = true;
    if (!this.needsPermission) { this.notify(); return Promise.resolve(this.allowed); }
    // A fresh user activation owns a fresh permission attempt. Never coalesce it
    // with an older unresolved browser promise: the older result is obsolete.
    if (this.pending) this.cancelRequest(false);
    const generation = ++this.generation, epoch = this.lifecycle?.epoch;
    this.lastRequest = { generation, result: 'pending', error: null };
    let settle;
    const promise = new Promise(resolve => { settle = resolve; });
    const pending = this.pending = { generation, epoch, promise, settle, timer: null };
    const orientationPromise = (() => { try { return this.capability.orientation.requestPermission(); } catch (error) { return Promise.reject(error); } })();
    const motionPromise = this.capability.motionRequest ? (() => { try { return this.capability.motion.requestPermission(); } catch (error) { return Promise.reject(error); } })() : Promise.resolve('not-required');
    Promise.resolve(orientationPromise).then(result => {
      if (this.disposed || this.pending !== pending || generation !== this.generation || epoch !== this.lifecycle?.epoch) return;
      this.permission = result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'error';
      this.reason = this.permission === 'denied' ? 'permission-denied' : this.permission === 'error' ? 'permission-result-invalid' : null;
      this.availability = this.permission === 'granted' ? 'idle' : this.availability;
      this.lastRequest = { generation, result: this.permission, error: null };
      this.env.clearTimeout(pending.timer); this.pending = null; settle(this.allowed); this.notify();
    }, () => {
      if (this.disposed || this.pending !== pending || generation !== this.generation || epoch !== this.lifecycle?.epoch) return;
      this.permission = 'error'; this.reason = 'permission-error';
      this.lastRequest = { generation, result: 'error', error: 'permission-error' };
      this.env.clearTimeout(pending.timer); this.pending = null; settle(false); this.notify();
    });
    Promise.resolve(motionPromise).then(result => {
      if (this.disposed || generation !== this.generation || epoch !== this.lifecycle?.epoch) return;
      this.motionPermission = result === 'granted' || result === 'not-required' ? result : result === 'denied' ? 'denied' : 'error';
      this.notify();
    }, () => { if (!this.disposed && generation === this.generation && epoch === this.lifecycle?.epoch) { this.motionPermission = 'error'; this.notify(); } });
    pending.timer = this.env.setTimeout(() => {
      if (this.disposed || this.pending !== pending || generation !== this.generation) return;
      // A missing browser response is not evidence of denial. Keep the request
      // retryable and report temporary unavailability rather than unknown-error.
      if (this.permission !== 'granted') this.permission = 'prompt';
      this.availability = 'unavailable'; this.reason = 'permission-timeout';
      this.lastRequest = { generation, result: 'timeout', error: null };
      this.cancelRequest(false); this.notify();
    }, 15000);
    this.notify();
    return promise;
  }
  cancelRequest(notify = true) {
    this.generation++;
    const pending = this.pending; this.pending = null;
    if (pending) { this.env.clearTimeout(pending.timer); pending.settle(false); }
    if (notify) this.notify();
  }
  beginListening() {
    this.stopProbe(); this.received = false; this.availability = 'waiting'; this.reason = null;
    const generation = this.generation;
    this.probe = this.env.setTimeout(() => {
      this.probe = null;
      if (this.disposed || !this.lifecycle.active || generation !== this.generation || this.received) return;
      if (this.hasSample) { this.availability = 'stale'; this.reason = 'sensor-data-stale'; }
      else {
        this.availability = 'unavailable'; this.reason = 'no-sensor-data'; this.wanted = false;
        this.onUnavailable?.();
      }
      this.notify();
    }, 2000);
    this.notify();
  }
  sample(time = this.env.performance?.now?.() ?? Date.now()) {
    if (!this.lifecycle.active || this.disposed) return;
    if (Number.isFinite(time)) this.lastSampleAt = time;
    this.healthAt = this.env.performance?.now?.() ?? Date.now();
    if (this.received && this.availability === 'active') return;
    this.received = this.hasSample = true; this.stopProbe(); this.availability = 'active'; this.reason = null;
    this.startHealthProbe(); this.notify();
  }
  startHealthProbe(delay = GYRO_STALE_MS) {
    if (this.healthProbe !== null) this.env.clearTimeout(this.healthProbe);
    const generation = this.generation;
    this.healthProbe = this.env.setTimeout(() => {
      this.healthProbe = null;
      if (this.disposed || generation !== this.generation || !this.lifecycle.active || this.lifecycle.focused === false || !this.wanted) return;
      const age = (this.env.performance?.now?.() ?? Date.now()) - this.healthAt;
      if (age < GYRO_STALE_MS) { this.startHealthProbe(GYRO_STALE_MS - age); return; }
      this.availability = 'stale'; this.reason = 'sensor-data-stale'; this.notify();
    }, delay);
    // A background health check must not keep a non-browser harness alive.
    this.healthProbe?.unref?.();
  }
  stopProbe() {
    if (this.probe !== null) this.env.clearTimeout(this.probe); this.probe = null;
    if (this.healthProbe !== null) this.env.clearTimeout(this.healthProbe); this.healthProbe = null;
  }
  stopListening(reason = 'off') {
    this.stopProbe(); this.received = false;
    this.availability = reason === 'suspend' ? 'suspended' : 'idle';
    if (this.reason === 'no-sensor-data' || this.reason === 'sensor-data-stale') this.reason = null;
    this.notify();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.wanted = false; this.stopProbe(); this.cancelRequest(false); this.listeners.clear(); this.onUnavailable = null;
  }
}

export function gyroStatusMessage(status, lang = 'en') {
  const ja = lang.startsWith('ja');
  const text = (j, e) => ja ? j : e;
  switch (status.state) {
    case 'unsupported':
      if (status.reason === 'insecure-context') return text('このページではジャイロを利用できません。HTTPSで開いてください。', 'Gyro is unavailable on this page. Open it over HTTPS.');
      if (status.reason === 'permissions-policy') return text('このページの権限ポリシーでセンサーが制限されています。', 'This page’s permissions policy blocks the sensors.');
      return text('この実行環境では必要な姿勢センサーAPIを利用できません。タッチ操作を使用してください。', 'The required orientation API is unavailable in this environment. Use touch controls.');
    case 'supported-stale': return text('ジャイロの値がしばらく届いていません。端末を動かすかGYROから再試行してください。設定と許可は保持しています。', 'No recent gyro samples. Move the device or retry with GYRO. Your setting and permission are retained.');
    case 'supported-permission-needed': return text('ジャイロの許可が必要です。GYROボタンをタップして許可を要求してください。', 'Motion permission is needed. Tap GYRO to request it.');
    case 'permission-pending': return text('ジャイロの許可を確認しています。', 'Waiting for the motion permission response.');
    case 'supported-denied': return text('この実行環境ではセンサーの許可が拒否されています。GYROから再試行できますが、再確認が表示されるかはブラウザ次第です。', 'Motion permission is denied in this environment. You may retry with GYRO; the browser decides whether to ask again.');
    case 'temporarily-unavailable':
      if (status.availability === 'suspended') return text('画面が非表示のためジャイロを休止しています。', 'Gyro is suspended while the page is inactive.');
      if (status.reason === 'permission-timeout') return text('許可の応答を確認できませんでした。画面に戻ってGYROから再試行してください。', 'No permission response was received. Return to the page and retry with GYRO.');
      return text('現在センサーの値を受信できていません。拒否や非対応とは断定できません。GYROから再試行するか、タッチ操作を使用してください。', 'No sensor data is arriving. This does not prove denial or lack of support. Retry with GYRO or use touch controls.');
    case 'unknown-error': return text('センサーの許可確認中にエラーが発生しました。GYROから再試行するか、タッチ操作を使用してください。', 'An error occurred while checking motion permission. Retry with GYRO or use touch controls.');
    default:
      if (status.availability === 'waiting') return text('ジャイロ：センサーの受信を待っています。', 'Gyro: waiting for sensor data.');
      return status.permission === 'not-required' ? text('この環境では追加の許可操作はありません。', 'No additional permission prompt is required in this environment.') : text('ジャイロの許可を取得済みです。', 'Motion permission is granted for this page session.');
  }
}
