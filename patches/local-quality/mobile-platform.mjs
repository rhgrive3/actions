import { getPlatformLifecycle } from './platform-lifecycle.mjs';
const INSTALLED = Symbol.for('inkwave.platform.mobile.v1');

export function gyroDiagnosticText(status, now = null) {
  const current = Number.isFinite(now) ? now : null;
  const age = status?.received && Number.isFinite(status.lastSampleAt) && current !== null
    ? Math.max(0, Math.round(current - status.lastSampleAt)) : null;
  const request = status?.lastRequest || {};
  return [
    'GYRO DIAG',
    'standalone=' + (status?.standalone ? 'yes' : 'no'),
    'orientationRequest=' + (status?.orientationRequestAvailable ? 'yes' : 'no'),
    'motionRequest=' + (status?.motionRequestAvailable ? 'yes' : 'no'),
    'health=' + (status?.availability ?? 'unknown'),
    'permission=' + (status?.permission ?? 'unknown'),
    'motion=' + (status?.motionPermission ?? 'unknown'),
    'request=' + (request.result ?? 'none') + '#' + (request.generation ?? 0),
    'sample=' + (status?.received ? (age === null ? 'yes' : age + 'ms') : 'no'),
    'lifecycle=' + (status?.lifecycleState ?? 'unknown') + '@' + (status?.lifecycleEpoch ?? 0),
    'last=' + (status?.lifecycleLastEvent ?? 'none'),
  ].join(' | ');
}

export function installMobilePlatform(MobileInput, env = globalThis) {
  const P = MobileInput.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const lifecycle = getPlatformLifecycle(env), records = new WeakMap();
  const press = P._press, up = P._up, install = P._install;
  const resetPointers = P.resetPointers, setVisible = P.setVisible, destroy = P.destroy;
  const runnable = m => lifecycle.active && m.visible && !m.editing && !m._destroyed &&
    (!m._platformCanRun || m._platformCanRun());
  function clearTap(m) {
    const tap = m._platformGyroTap; m._platformGyroTap = null;
    m.els?.gyro?.classList.remove('is-down');
    if (tap) try { if (m.root?.hasPointerCapture?.(tap.id)) m.root.releasePointerCapture(tap.id); } catch {}
  }
  function reset(m) {
    const ids = [...(m._ptr?.keys?.() || [])];
    if (m._stick?.id >= 0) ids.push(m._stick.id);
    clearTap(m); m.reset?.();
    for (const id of ids) try { if (m.root?.hasPointerCapture?.(id)) m.root.releasePointerCapture(id); } catch {}
  }
  function ensure(m) {
    let r = records.get(m); if (r) return r;
    r = { offStatus: null, offLifecycle: null, lastNotice: null, click: null, layoutRAF: null };
    records.set(m, r);
    m.gyro._platformCanStart = () => runnable(m);
    const layout = () => {
      // Screen resize/orientation is owned by createTouchRelayout so a same-
      // orientation resize keeps held pointers. Lifecycle resume only refreshes
      // geometry after suspend has already neutralised input.
      m.gyro.resync();
      if (!lifecycle.active || r.layoutRAF !== null) return;
      r.layoutRAF = env.requestAnimationFrame(() => { r.layoutRAF = null; if (!m._destroyed && lifecycle.active) m._layoutAll?.(); });
    };
    const cancelLayout = () => { if (r.layoutRAF !== null) env.cancelAnimationFrame(r.layoutRAF); r.layoutRAF = null; };
    r.offLifecycle = lifecycle.subscribe({
      suspend() { ++m._gyroIntent; env.clearTimeout(m._gyroNoticeT); cancelLayout(); reset(m); },
      prepareResume() { reset(m); m.gyro.resync(); },
      resume() { if (runnable(m) && m._gyroWanted && !m.gyro.needsPermission) m.gyro.start(); layout(); },
      blur() { reset(m); },
    });
    r.offStatus = m.gyro.onPlatformStatus?.(status => {
      const stoppedForMissingData = status.reason === 'no-sensor-data' && m._gyroWanted;
      if (stoppedForMissingData) {
        ++m._gyroIntent; m._gyroWanted = m.s.gyro = false;
      }
      m._gyroBtn();
      const button = m.els?.gyro;
      if (button) {
        button.dataset.gyroState = status.state;
        button.setAttribute('aria-busy', String(status.pending || status.availability === 'waiting'));
        button.setAttribute('aria-pressed', String(!!m._gyroWanted && (status.availability === 'active' || status.availability === 'stale')));
        button.title = m.gyro.statusMessage();
      }
      if ((stoppedForMissingData || status.availability === 'stale') && r.lastNotice !== status.reason && runnable(m)) {
        m.toast(m.gyro.statusMessage(), 4); r.lastNotice = status.reason;
      } else if (status.availability === 'active' || status.availability === 'waiting') r.lastNotice = null;
    });
    r.cancelLayout = cancelLayout;
    r.click = e => {
      if (m._destroyed || m.editing || !lifecycle.active || !m.visible) return;
      if (e.detail !== 0 && env.performance.now() - (m._platformGyroUp ?? -Infinity) < 750) return;
      e.preventDefault(); e.stopPropagation(); m._toggleGyroFromTap();
    };
    m.els?.gyro?.addEventListener('click', r.click);
    return r;
  }
  P._install = function (...args) { const result = install.apply(this, args); ensure(this); return result; };
  P._gyroBtn = function () {
    const status = this.gyro.platformStatus, active = this.gyro.enabled && (status.availability === 'active' || status.availability === 'stale');
    this.els?.gyro?.classList.toggle('is-on', active);
    this.els?.gyro?.setAttribute('aria-pressed', String(!!active));
  };
  P.setGyro = function (on, canStart = null) {
    ensure(this);
    const intent = ++this._gyroIntent, epoch = lifecycle.epoch;
    env.clearTimeout(this._gyroNoticeT);
    if (this._destroyed) return Promise.resolve(false);
    this._gyroWanted = !!on;
    if (!on) {
      this.gyro.stop(); this.s.gyro = false; this._gyroBtn();
      this.els?.gyro?.setAttribute('aria-pressed', 'false'); return Promise.resolve(false);
    }
    const finish = ok => {
      if (this._destroyed || intent !== this._gyroIntent || epoch !== lifecycle.epoch || !lifecycle.active) return false;
      this._gyroWanted = this.s.gyro = !!ok;
      if (ok && runnable(this) && (!canStart || canStart())) this.gyro.start();
      this._gyroBtn();
      return !!ok;
    };
    return this.gyro.request().then(finish);
  };
  P._toggleGyroFromTap = function () {
    if (this._destroyed || !lifecycle.active) return;
    const on = this.gyro.platformStatus.availability === 'stale' || !this._gyroWanted;
    const promise = this.setGyro(on), intent = this._gyroIntent, epoch = lifecycle.epoch;
    promise.then(ok => {
      if (this._destroyed || intent !== this._gyroIntent || epoch !== lifecycle.epoch) return;
      this.toast(on && (!ok || this.gyro.platformStatus.availability !== 'active') ? this.gyro.statusMessage() :
        (env.document?.documentElement?.lang?.startsWith('ja') ? (ok ? 'ジャイロ ON' : 'ジャイロ OFF') : (ok ? 'Gyro ON' : 'Gyro OFF')), on && !ok ? 4 : 1.1);
      this.onGyroToggle?.(ok);
    });
  };
  P._press = function (id, event) {
    if (id !== 'gyro') return press.call(this, id, event);
    ensure(this);
    if (!lifecycle.active || this._destroyed || this.editing) return;
    clearTap(this);
    this._platformGyroTap = { id: event.pointerId, x: event.clientX, y: event.clientY, t: env.performance.now() };
    this.els?.gyro?.classList.add('is-down');
  };
  P._up = function (event) {
    const tap = this._platformGyroTap;
    if (!tap || tap.id !== event.pointerId) return up.call(this, event);
    this._platformGyroTap = null; this.els?.gyro?.classList.remove('is-down');
    const valid = event.type === 'pointerup' && lifecycle.active && !this._destroyed && !this.editing && this.visible &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 24 && this._hitButton(event.clientX, event.clientY) === 'gyro';
    this._platformGyroUp = env.performance.now();
    if (valid && this._platformGyroUp - tap.t >= 900) {
      // Hidden production-safe device acceptance harness: a deliberate long
      // press reports sensor/lifecycle state without adding normal UI clutter.
      this.toast(gyroDiagnosticText(this.gyro.platformStatus, this._platformGyroUp), 7);
    } else if (valid) this._toggleGyroFromTap();
    try { if (this.root?.hasPointerCapture?.(tap.id)) this.root.releasePointerCapture(tap.id); } catch {}
  };
  P.resetPointers = function (...args) { clearTap(this); return resetPointers.apply(this, args); };
  P.setVisible = function (on) {
    ensure(this); const result = setVisible.call(this, on);
    if (!on) this.gyro.stop();
    else if (this._gyroWanted && runnable(this) && !this.gyro.needsPermission) this.gyro.start();
    return result;
  };
  P.destroy = function (...args) {
    if (this._destroyed) return;
    const r = records.get(this);
    if (r) {
      r.cancelLayout(); r.offLifecycle?.(); r.offStatus?.();
      this.els?.gyro?.removeEventListener('click', r.click); records.delete(this);
    }
    reset(this);
    const result = destroy.apply(this, args); this.gyro.disposePlatform?.(); return result;
  };
}
