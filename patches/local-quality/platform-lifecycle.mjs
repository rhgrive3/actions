// One page owner. No browser/OS sniffing, permission requests, or game protocol here.
const owners = new WeakMap();
export const PLATFORM_STATES = Object.freeze({
  ACTIVE: 'ACTIVE', SUSPENDING: 'SUSPENDING', SUSPENDED: 'SUSPENDED', RESUMING: 'RESUMING',
});
export const MAX_PLATFORM_GAP = 0.25;

export class PlatformLifecycle {
  constructor(env = globalThis) {
    this.env = env;
    this.state = env.document?.hidden ? 'SUSPENDED' : 'ACTIVE';
    this.epoch = 0;
    this.disposed = false;
    this.blockers = new Set(env.document?.hidden ? ['hidden'] : []);
    this.clients = new Set();
    this.listeners = [];
    this.metrics = { suspends: 0, resumes: 0, blurs: 0, errors: 0 };
    this.lastEvent = 'initial';
    this.persisted = false;
    this.focused = true;
    this._listen(env.document, 'visibilitychange', () => this.reconcile('visibilitychange'));
    this._listen(env, 'pagehide', e => { this.persisted = !!e.persisted; this.block('pagehide', true, 'pagehide'); });
    this._listen(env, 'pageshow', e => {
      this.persisted = !!e.persisted;
      this.blockers.delete('pagehide'); this.blockers.delete('freeze'); this.reconcile('pageshow');
    });
    this._listen(env.document, 'freeze', () => this.block('freeze', true, 'freeze'));
    this._listen(env.document, 'resume', () => this.block('freeze', false, 'resume'));
    this._listen(env, 'blur', () => {
      this.focused = false; this.metrics.blurs++; this._notify('blur'); this.reconcile('blur');
    });
    this._listen(env, 'focus', () => {
      const wasFocused = this.focused; this.focused = true;
      if (!wasFocused) this._notify('focus');
      this.reconcile('focus');
    });
    const screen = () => this._notify('screen');
    this._listen(env.screen?.orientation, 'change', screen);
    this._listen(env, 'orientationchange', screen);
    this._listen(env.document, 'fullscreenchange', screen);
  }
  get active() { return !this.disposed && this.state === 'ACTIVE'; }
  get standalone() {
    return this.env.navigator?.standalone === true ||
      !!this.env.matchMedia?.('(display-mode: standalone)')?.matches;
  }
  _listen(target, type, callback) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, callback);
    this.listeners.push(() => target.removeEventListener(type, callback));
  }
  _call(client, method) {
    try { client[method]?.(this); }
    catch (error) { this.metrics.errors++; this.env.console?.error?.('[platform] ' + method, error); }
  }
  _notify(method) { for (const client of [...this.clients]) if (this.clients.has(client)) this._call(client, method); }
  subscribe(client) {
    if (this.disposed) return () => {};
    this.clients.add(client); if (!this.active) this._call(client, 'suspend');
    return () => this.clients.delete(client);
  }
  block(key, value, reason = key) {
    if (value) this.blockers.add(key); else this.blockers.delete(key);
    this.reconcile(reason);
  }
  reconcile(reason = 'check') {
    if (this.disposed) return;
    this.lastEvent = reason;
    if (this._transitioning) { this._reconcileAgain = true; return; }
    this._transitioning = true;
    try {
      if (this.env.document?.hidden) this.blockers.add('hidden'); else this.blockers.delete('hidden');
      if (this.blockers.size) {
        if (this.state === 'SUSPENDED' || this.state === 'SUSPENDING') return;
        this.state = 'SUSPENDING'; this.epoch++; this.metrics.suspends++;
        this._notify('suspend'); this.state = 'SUSPENDED';
      } else {
        if (this.state === 'ACTIVE' || this.state === 'RESUMING') return;
        this.state = 'RESUMING'; this.epoch++; this.metrics.resumes++;
        this._notify('prepareResume');
        if (this.blockers.size || this.env.document?.hidden) { this.state = 'SUSPENDED'; return; }
        this.state = 'ACTIVE'; this._notify('resume');
      }
    } finally {
      this._transitioning = false;
      if (this._reconcileAgain) { this._reconcileAgain = false; this.reconcile(this.lastEvent); }
    }
  }
  snapshot() {
    return { state: this.state, epoch: this.epoch, standalone: this.standalone,
      blockers: [...this.blockers], subscribers: this.clients.size,
      listeners: this.listeners.length, persisted: this.persisted,
      lastEvent: this.lastEvent, focused: this.focused, ...this.metrics };
  }
  dispose() {
    if (this.disposed) return;
    this.block('dispose', true); this.disposed = true;
    for (const remove of this.listeners.splice(0)) remove();
    this.clients.clear();
  }
}

export function getPlatformLifecycle(env = globalThis) {
  let owner = owners.get(env);
  if (!owner || owner.disposed) { owner = new PlatformLifecycle(env); owners.set(env, owner); }
  return owner;
}

export class PlatformFrameDriver {
  constructor(owner, frame, rebase = () => {}) {
    this.owner = owner; this.env = owner.env; this.frame = frame; this.rebase = rebase;
    this.raf = null; this.running = false; this.disposed = false;
    this.last = null; this.lastWall = null;
    this.metrics = { frames: 0, gaps: 0, maxDelta: 0, schedules: 0, cancels: 0 };
    this._callback = now => {
      this.raf = null;
      if (!this.running || !this.owner.active || this.disposed) return;
      this.schedule();
      const time = Number.isFinite(now) ? now : this.env.performance.now();
      const wall = this.env.Date?.now?.() ?? Date.now();
      let dt = this.last === null ? 0 : (time - this.last) / 1000;
      const wallGap = this.lastWall === null ? 0 : (wall - this.lastWall) / 1000;
      const gap = !Number.isFinite(dt) || dt < 0 || dt > MAX_PLATFORM_GAP || wallGap > MAX_PLATFORM_GAP;
      this.last = time; this.lastWall = wall;
      if (gap) {
        this.metrics.gaps++;
        const foregroundStall = Number.isFinite(dt) && dt >= 0 &&
          Number.isFinite(wallGap) && wallGap >= 0 && this.owner.focused && !this.env.document?.hidden;
        this.rebase('timer-gap');
        // A visible/focused stall is not a lifecycle resume, regardless of how
        // long the main thread was blocked. Advance at most one bounded slice so
        // low-FPS devices cannot starve fixed simulation. Real hide/suspend
        // transitions stop/reset the driver separately and still resume at zero.
        dt = foregroundStall ? Math.min(dt, MAX_PLATFORM_GAP) : 0;
      }
      this.metrics.frames++; this.metrics.maxDelta = Math.max(this.metrics.maxDelta, dt);
      this.frame(dt);
    };
    this.unsubscribe = owner.subscribe({
      suspend: () => this.reset('suspend'),
      prepareResume: () => this.reset('resume'),
      resume: () => this.schedule(),
    });
  }
  reset(reason) {
    if (this.raf !== null) { this.env.cancelAnimationFrame(this.raf); this.metrics.cancels++; }
    this.raf = null; this.last = this.lastWall = null;
    this.rebase(reason);
  }
  schedule() {
    if (!this.running || !this.owner.active || this.disposed || this.raf !== null) return;
    this.raf = this.env.requestAnimationFrame(this._callback); this.metrics.schedules++;
  }
  start() { if (this.disposed) return; this.running = true; this.schedule(); }
  stop() { this.running = false; this.reset('stop'); }
  dispose() { if (this.disposed) return; this.stop(); this.disposed = true; this.unsubscribe(); }
  snapshot() { return { running: this.running, pendingRAF: this.raf === null ? 0 : 1, ...this.metrics }; }
}
