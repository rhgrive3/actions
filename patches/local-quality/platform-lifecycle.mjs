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
    // Visibility and focus are independent at construction (for example, iframes).
    // Keep legacy hosts without hasFocus usable; a failed query cannot grant input.
    try { this.focused = typeof env.document?.hasFocus === 'function' ? !!env.document.hasFocus() : true; }
    catch { this.focused = false; }
    this._listen(env.document, 'visibilitychange', () => {
      this.reconcile('visibilitychange');
      // Visibility may change while a separate blocker keeps us suspended.
      // Consumers with visibility-scoped work still need that boundary.
      this._notify('visibility');
    });
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
  constructor(owner, frame, rebase = () => {}, frameRate = () => 0) {
    this.owner = owner; this.env = owner.env; this.frame = frame; this.rebase = rebase;
    this.frameRate = frameRate;
    this.raf = null; this.timer = null; this.running = false; this.disposed = false;
    this.generation = 0; this.frameInterval = 0; this.nextDeadline = null;
    this.timerOvershoot = 0; this.timerExpectedAt = null;
    this.last = null; this.lastWall = null;
    this.metrics = { frames: 0, gaps: 0, maxDelta: 0, schedules: 0, cancels: 0, timerSchedules: 0, timerCancels: 0, timerWakes: 0 };
    this._callback = (now, generation) => {
      if (generation !== this.generation) return;
      this.raf = null;
      if (!this.running || !this.owner.active || this.disposed) return;
      const time = Number.isFinite(now) ? now : this._now();
      const wall = this.env.Date?.now?.() ?? Date.now();
      let dt = this.last === null ? 0 : (time - this.last) / 1000;
      let elapsed = Number.isFinite(dt) && dt >= 0 ? dt : 0;
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
        if (!foregroundStall) elapsed = 0;
      }
      this.metrics.frames++; this.metrics.maxDelta = Math.max(this.metrics.maxDelta, dt);
      try { this.frame(dt, elapsed, time); }
      finally { if (generation === this.generation) this._scheduleNext(time); }
    };
    this.unsubscribe = owner.subscribe({
      suspend: () => this.reset('suspend'),
      prepareResume: () => this.reset('resume'),
      resume: () => this.schedule(),
    });
  }
  _now() {
    const now = this.env.performance?.now?.();
    return Number.isFinite(now) ? now : (this.env.Date?.now?.() ?? Date.now());
  }
  _queueRAF() {
    if (!this.running || !this.owner.active || this.disposed || this.raf !== null || this.timer !== null) return;
    const generation = this.generation;
    if (this._rafGeneration !== generation) {
      this._rafGeneration = generation;
      this._rafCallback = now => this._callback(now, generation);
    }
    this.raf = this.env.requestAnimationFrame(this._rafCallback);
    this.metrics.schedules++;
  }
  _queueTimer(delay) {
    if (!this.running || !this.owner.active || this.disposed || this.raf !== null || this.timer !== null) return;
    if (typeof this.env.setTimeout !== 'function') { this._queueRAF(); return; }
    const generation = this.generation;
    if (this._timerGeneration !== generation) {
      this._timerGeneration = generation;
      this._timerCallback = () => {
        if (generation !== this.generation) return;
        this.timer = null; this.metrics.timerWakes++;
        const late = this._now() - this.timerExpectedAt;
        if (Number.isFinite(late) && late >= 0) this.timerOvershoot = Math.max(late, this.timerOvershoot * .995);
        this.timerExpectedAt = null;
        if (this.running && this.owner.active && !this.disposed) this._queueRAF();
      };
    }
    const wait = Math.max(0, delay); this.timerExpectedAt = this._now() + wait;
    this.timer = this.env.setTimeout(this._timerCallback, wait);
    this.metrics.timerSchedules++;
  }
  _scheduleNext(frameTime) {
    if (!this.running || !this.owner.active || this.disposed) return;
    const fps = Number(this.frameRate());
    if (!Number.isFinite(fps) || fps <= 0) {
      this.frameInterval = 0; this.nextDeadline = null;
      this._queueRAF();
      return;
    }
    const interval = 1000 / fps, now = this._now();
    if (this.frameInterval !== interval || this.nextDeadline === null) {
      this.frameInterval = interval;
      this.nextDeadline = frameTime + interval;
    } else this.nextDeadline += interval; // one delivered callback consumes one target slot
    // Learn actual timeout overshoot. Advancing the absolute target must depend
    // on the presented frame, never the early wake lead: a larger lead may put
    // RAF on the preceding 90/144 Hz slot without consuming another deadline.
    const lead = Math.min(8, interval * .5, 1 + this.timerOvershoot);
    const limit = frameTime;
    while (this.nextDeadline <= limit) {
      const current = this.nextDeadline, next = current + interval;
      if (next > limit) { this.nextDeadline = next; break; }
      // Within one floating-point exponent bin, repeated additions advance
      // by the same representable increment. Skip whole runs of that exact
      // increment, leaving the exponent boundary to ordinary addition. This
      // retains legacy rounding even when the lead lands exactly on a slot.
      const increment = next - current;
      if (current > 0 && increment > 0 && Number.isFinite(limit) &&
          next + interval - next === increment) {
        const edge = 2 ** (Math.floor(Math.log2(current)) + 1);
        const room = Math.floor((edge - current) / increment) - 1;
        const wanted = Math.floor((limit - current) / increment) + 1;
        const count = Math.min(room, wanted);
        if (count > 1) { this.nextDeadline = current + count * increment; continue; }
      }
      this.nextDeadline = next;
    }
    const wait = this.nextDeadline - now - lead;
    // Long frame work has already used the sleep budget. Queue RAF directly;
    // a zero-delay timer would only add another opportunity to miss VSync.
    if (wait <= 0) this._queueRAF(); else this._queueTimer(wait);
  }
  reset(reason) {
    this.generation++;
    if (this.timer !== null) { this.env.clearTimeout?.(this.timer); this.timer = null; this.metrics.timerCancels++; }
    if (this.raf !== null) { this.env.cancelAnimationFrame(this.raf); this.metrics.cancels++; }
    this.raf = null; this.last = this.lastWall = null;
    this.frameInterval = 0; this.nextDeadline = null; this.timerExpectedAt = null; this.timerOvershoot = 0;
    this.rebase(reason);
  }
  schedule() {
    this._queueRAF();
  }
  start() { if (this.disposed) return; this.running = true; this.schedule(); }
  stop() { this.running = false; this.reset('stop'); }
  dispose() { if (this.disposed) return; this.stop(); this.disposed = true; this.unsubscribe(); }
  snapshot() { return { running: this.running, pendingRAF: this.raf === null ? 0 : 1, pendingTimer: this.timer === null ? 0 : 1, ...this.metrics }; }
}
