// Build-only permission lifetime correction. Sensor math and permission timing are unchanged.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Reliability gyro anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptGyro(rel, code) {
  if (rel === 'src/core/gyro.js') {
    code = replaceOnce(code, '    this.granted = false;       // iOS permission obtained this session',
      '    this.granted = false;       // iOS permission obtained this session\n    this._permissionRequest = 0;', rel);
    code = replaceOnce(code, `  request() {
    const DOE = window.DeviceOrientationEvent, DME = window.DeviceMotionEvent;`, `  request() {
    const request = ++this._permissionRequest;
    const DOE = window.DeviceOrientationEvent, DME = window.DeviceMotionEvent;`, rel);
    return replaceOnce(code, `      this.granted = r.some((x) => x.status === 'fulfilled' && x.value === 'granted');
      return this.granted;`, `      const granted = r.some((x) => x.status === 'fulfilled' && x.value === 'granted');
      if (request === this._permissionRequest) this.granted = granted;
      return granted;`, rel);
  }
  if (rel === 'src/core/mobile.js') {
    code = replaceOnce(code, '    this.onGyroToggle = null;', `    this.onGyroToggle = null;
    this._gyroIntent = 0;
    this._gyroWanted = false;
    this._destroyed = false;`, rel);
    code = replaceOnce(code, `  setGyro(on) {
    if (!on) { this.gyro.stop(); this.s.gyro = false; this._gyroBtn(); return Promise.resolve(false); }
    const go = () => { this.gyro.start(); this.s.gyro = true; this._gyroBtn(); return true; };
    if (this.gyro.needsPermission) return this.gyro.request().then((ok) => (ok ? go() : (this._gyroBtn(), false)));
    if (!this.gyro.supported) return Promise.resolve(false);
    return Promise.resolve(go());
  }`, `  setGyro(on, canStart = null) {
    const intent = ++this._gyroIntent;
    clearTimeout(this._gyroNoticeT);
    if (this._destroyed) return Promise.resolve(false);
    this._gyroWanted = !!on;
    if (!on) { this.gyro.stop(); this.s.gyro = false; this._gyroBtn(); return Promise.resolve(false); }
    const finish = (ok) => {
      if (this._destroyed || intent !== this._gyroIntent) return false;
      this._gyroWanted = !!ok; this.s.gyro = !!ok;
      if (ok && (!canStart || canStart())) this.gyro.start();
      this._gyroBtn();
      return !!ok;
    };
    // Keep the native request in this call stack, before any promise continuation.
    if (this.gyro.needsPermission) return this.gyro.request().then(finish);
    // Settings historically finish on a microtask, even without a permission prompt.
    if (canStart) return Promise.resolve(this.gyro.supported).then(finish);
    return Promise.resolve(finish(this.gyro.supported));
  }`, rel);
    code = replaceOnce(code, `  destroy() { this._abort.abort(); this.gyro.stop(); this.root?.remove(); document.documentElement.classList.remove('iw-mobile'); }`, `  destroy() {
    this._destroyed = true; ++this._gyroIntent;
    this._gyroWanted = false; this.s.gyro = false;
    clearTimeout(this._gyroNoticeT); clearTimeout(this._toastT);
    this._abort.abort(); this.gyro.stop(); this.root?.remove(); document.documentElement.classList.remove('iw-mobile');
  }`, rel);
    return replaceOnce(code, `  _toggleGyroFromTap() {
    const want = !this.gyro.enabled;
    const p = this.setGyro(want);
    p.then((on) => {
      if (want && !on) this.toast(t(this.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
      else this.toast(t(on ? 'Gyro ON' : 'Gyro OFF'), 1.1);
      this.onGyroToggle?.(on);
      if (on) setTimeout(() => { if (this.gyro.enabled && !this.gyro.working) this.toast(t('Gyro is not available on this device.'), 2.6); }, 1500);
    });
  }`, `  _toggleGyroFromTap() {
    if (this._destroyed) return;
    const want = !this._gyroWanted;
    const p = this.setGyro(want);
    const intent = this._gyroIntent;
    p.then((on) => {
      if (this._destroyed || intent !== this._gyroIntent) return;
      if (want && !on) this.toast(t(this.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
      else this.toast(t(on ? 'Gyro ON' : 'Gyro OFF'), 1.1);
      this.onGyroToggle?.(on);
      if (on && !this._destroyed && intent === this._gyroIntent) this._gyroNoticeT = setTimeout(() => {
        if (!this._destroyed && intent === this._gyroIntent && this.gyro.enabled && !this.gyro.working) this.toast(t('Gyro is not available on this device.'), 2.6);
      }, 1500);
    });
  }`, rel);
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code, `      mob.onGyroToggle = (on) => {
        this.settings.gyro = !!on;`, `      mob.onGyroToggle = (on) => {
        if (this.input?.mobile !== mob || mob._destroyed) return;
        this.settings.gyro = !!on;`, rel);
    code = replaceOnce(code, `          const ask = mob.gyro.needsPermission ? mob.gyro.request() : Promise.resolve(mob.gyro.supported);
          ask.then((ok) => {
            if (!ok) {
              this.settings.gyro = false; saveJSON('inkwave.settings', this.settings);
              this.menus?.refreshSetting?.('gyro');
              mob.toast(t(mob.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
            } else if (G.mode === 'match' && this.match?.state === 'playing') mob.setGyro(true);
          });`, `          const ask = mob.setGyro(true, () => this.input?.mobile === mob && G.mode === 'match' && this.match?.state === 'playing');
          const intent = mob._gyroIntent;
          ask.then((ok) => {
            if (this.input?.mobile !== mob || mob._destroyed || intent !== mob._gyroIntent || !this.settings.gyro) return;
            if (!ok) {
              this.settings.gyro = false; saveJSON('inkwave.settings', this.settings);
              this.menus?.refreshSetting?.('gyro');
              mob.toast(t(mob.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
            }
          });`, rel);
    code = replaceOnce(code, `    if (mob && this.settings.gyro && mob.gyro.needsPermission) mob.gyro.request();`,
      `    if (mob && !mob._destroyed && this.settings.gyro && mob.gyro.needsPermission) mob.gyro.request();`, rel);
    return replaceOnce(code, '    if (!mob || !this.settings.gyro) return;',
      '    if (!mob || mob._destroyed || !this.settings.gyro) return;', rel);
  }
  return code;
}
