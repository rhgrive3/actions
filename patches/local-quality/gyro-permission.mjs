// Permission is document/session evidence, never a saved user preference.
// Orientation is required by INKWAVE's quaternion path; rotationRate is optional.
export function gyroCapability(env = globalThis) {
  const orientation = env.DeviceOrientationEvent;
  const motion = env.DeviceMotionEvent;
  let reason = null;
  if (env.isSecureContext === false) reason = 'insecure-context';
  else if (!orientation) reason = 'orientation-api-missing';
  const policy = env.document?.permissionsPolicy || env.document?.featurePolicy;
  try {
    const orientationAllowed = policy?.allowsFeature?.('gyroscope');
    if (orientationAllowed === false) reason = 'permissions-policy';
  } catch {}
  return { supported: !reason, reason, orientation, motion,
    orientationRequest: typeof orientation?.requestPermission === 'function',
    motionRequest: typeof motion?.requestPermission === 'function' };
}

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
    this.received = false;
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
    if (this.needsPermission) return 'supported-permission-needed';
    return 'supported-granted';
  }
  snapshot() { return { state: this.state, supported: this.capability.supported, reason: this.reason,
    permission: this.permission, motionPermission: this.motionPermission, availability: this.availability,
    pending: !!this.pending, received: this.received, wanted: this.wanted, standalone: !!this.lifecycle?.standalone }; }
  subscribe(callback) { this.listeners.add(callback); callback(this.snapshot()); return () => this.listeners.delete(callback); }
  notify() { const value = this.snapshot(); for (const callback of [...this.listeners]) try { callback(value); } catch {} }
  request() {
    if (this.disposed || !this.capability.supported) return Promise.resolve(false);
    this.wanted = true;
    if (!this.needsPermission) { this.notify(); return Promise.resolve(this.allowed); }
    if (this.pending) return this.pending.promise;
    const generation = ++this.generation, epoch = this.lifecycle?.epoch;
    let settle;
    const promise = new Promise(resolve => { settle = resolve; });
    const pending = this.pending = { generation, epoch, promise, settle, timer: null };
    const orientationPromise = (() => { try { return this.capability.orientation.requestPermission(); } catch (error) { return Promise.reject(error); } })();
    const motionPromise = this.capability.motionRequest ? (() => { try { return this.capability.motion.requestPermission(); } catch (error) { return Promise.reject(error); } })() : Promise.resolve('not-required');
    Promise.resolve(orientationPromise).then(result => {
      if (this.disposed || this.pending !== pending || generation !== this.generation || epoch !== this.lifecycle?.epoch) return;
      this.permission = result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'error';
      this.reason = this.permission === 'denied' ? 'permission-denied' : this.permission === 'error' ? 'permission-result-invalid' : null;
      this.env.clearTimeout(pending.timer); this.pending = null; settle(this.allowed); this.notify();
    }, () => {
      if (this.disposed || this.pending !== pending || generation !== this.generation || epoch !== this.lifecycle?.epoch) return;
      this.permission = 'error'; this.reason = 'permission-error';
      this.env.clearTimeout(pending.timer); this.pending = null; settle(false); this.notify();
    });
    Promise.resolve(motionPromise).then(result => {
      if (this.disposed || generation !== this.generation) return;
      this.motionPermission = result === 'granted' || result === 'not-required' ? result : result === 'denied' ? 'denied' : 'error';
      this.notify();
    }, () => { if (!this.disposed && generation === this.generation) { this.motionPermission = 'error'; this.notify(); } });
    pending.timer = this.env.setTimeout(() => {
      if (this.disposed || this.pending !== pending) return;
      this.permission = 'error'; this.reason = 'permission-timeout'; this.cancelRequest(false); this.notify();
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
      this.availability = 'unavailable'; this.reason = 'no-sensor-data'; this.notify();
    }, 2000);
    this.notify();
  }
  sample() {
    if (!this.lifecycle.active || this.disposed) return;
    if (this.received && this.availability === 'active') return;
    this.received = true; this.stopProbe(); this.availability = 'active'; this.reason = null; this.notify();
  }
  stopProbe() { if (this.probe !== null) this.env.clearTimeout(this.probe); this.probe = null; }
  stopListening(reason = 'off') {
    this.stopProbe(); this.received = false;
    this.availability = reason === 'suspend' ? 'suspended' : 'idle';
    if (this.reason === 'no-sensor-data') this.reason = null;
    this.notify();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.wanted = false; this.stopProbe(); this.cancelRequest(false); this.listeners.clear();
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
    case 'supported-permission-needed': return text('ジャイロの許可が必要です。GYROボタンをタップして許可を要求してください。', 'Motion permission is needed. Tap GYRO to request it.');
    case 'permission-pending': return text('ジャイロの許可を確認しています。', 'Waiting for the motion permission response.');
    case 'supported-denied': return text('この実行環境ではセンサーの許可が拒否されています。GYROから再試行できますが、再確認が表示されるかはブラウザ次第です。', 'Motion permission is denied in this environment. You may retry with GYRO; the browser decides whether to ask again.');
    case 'temporarily-unavailable':
      if (status.availability === 'suspended') return text('画面が非表示のためジャイロを休止しています。', 'Gyro is suspended while the page is inactive.');
      if (status.reason === 'permission-timeout') return text('許可の応答を確認できませんでした。画面に戻ってGYROから再試行してください。', 'No permission response was received. Return to the page and retry with GYRO.');
      return text('現在センサーの値を受信できていません。拒否や非対応とは断定できません。GYROから再試行するか、タッチ操作を使用してください。', 'No sensor data is arriving. This does not prove denial or lack of support. Retry with GYRO or use touch controls.');
    case 'unknown-error': return text('センサーの許可確認中にエラーが発生しました。GYROから再試行するか、タッチ操作を使用してください。', 'An error occurred while checking motion permission. Retry with GYRO or use touch controls.');
    default:
      if (status.availability === 'waiting') return text('ジャイロON：センサーの受信を待っています。', 'Gyro ON: waiting for sensor data.');
      return status.permission === 'not-required' ? text('この環境では追加の許可操作はありません。', 'No additional permission prompt is required in this environment.') : text('ジャイロの許可を取得済みです。', 'Motion permission is granted for this page session.');
  }
}
