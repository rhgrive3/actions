import { getPlatformLifecycle } from './platform-lifecycle.mjs';
const AUDIO = Symbol.for('inkwave.platform.audio.v1');
const MUSIC = Symbol.for('inkwave.platform.music.v1');

export function installAudioPlatform(AudioEngine, env = globalThis) {
  const P = AudioEngine.prototype;
  if (Object.hasOwn(P, AUDIO)) return;
  Object.defineProperty(P, AUDIO, { value: true });
  const lifecycle = getPlatformLifecycle(env);
  function ensure(a) {
    if (a._platformAudio) return a._platformAudio;
    const r = a._platformAudio = { pending: null, wanted: lifecycle.active, needsGesture: false, off: null, unlock: null, disposed: false };
    const reconcile = () => {
      const ctx = a.ctx;
      if (r.disposed || a._platformAudio !== r) return;
      if (!ctx || a.offline || ctx.state === 'closed') return;
      r.wanted = lifecycle.active;
      if (r.pending) {
        if (r.wanted && ctx.state !== 'running' && env.navigator?.userActivation?.isActive === true) {
          try { Promise.resolve(ctx.resume?.()).catch(() => { r.needsGesture = true; }); } catch {}
        }
        return;
      }
      const operation = r.wanted ? 'resume' : 'suspend';
      if (ctx.state === (r.wanted ? 'running' : 'suspended') || !ctx[operation]) return;
      let promise;
      try { promise = ctx[operation](); } catch { r.needsGesture = r.wanted; return; }
      r.pending = Promise.resolve(promise);
      r.pending.then(() => {
        if (r.disposed || a._platformAudio !== r) return;
        r.pending = null; r.needsGesture = lifecycle.active && ctx.state !== 'running';
        if (a.ctx === ctx && lifecycle.active !== (operation === 'resume')) reconcile();
      }, () => { r.pending = null; r.needsGesture = lifecycle.active; });
    };
    r.reconcile = reconcile;
    r.off = lifecycle.subscribe({ suspend: reconcile, resume: reconcile });
    r.unlock = () => { if (lifecycle.active) reconcile(); };
    for (const type of ['pointerdown', 'keydown', 'touchend', 'mousedown']) env.addEventListener?.(type, r.unlock, { capture: true, passive: true });
    return r;
  }
  P._installUnlock = function () { ensure(this); };
  P.resume = function () { if (!this.offline) ensure(this).reconcile(); };
  P.disposePlatform = function () {
    const r = this._platformAudio; if (!r) return;
    r.disposed = true; r.off?.();
    for (const type of ['pointerdown', 'keydown', 'touchend', 'mousedown']) env.removeEventListener?.(type, r.unlock, true);
    this._platformAudio = null;
  };
}

export function installMusicPlatform(MusicEngine, env = globalThis) {
  const P = MusicEngine.prototype;
  if (Object.hasOwn(P, MUSIC)) return;
  Object.defineProperty(P, MUSIC, { value: true });
  const lifecycle = getPlatformLifecycle(env), start = P._startTimer, tick = P._tick, dispose = P.dispose;
  function stop(m) {
    if (m.worker) { const worker = m.worker; m.worker = null; worker.onmessage = worker.onerror = null; worker.terminate(); }
    if (m.timer != null) env.clearInterval(m.timer);
    m.timer = null;
  }
  function rebase(m, r) {
    const now = m.ctx?.currentTime;
    if (!Number.isFinite(now)) return;
    if (r.time !== null && (now - r.time > .25 || now < r.time)) {
      const id = m.current?.id;
      for (const player of m.players) player.dispose();
      m.players.length = 0; m.current = null; r.restarts++;
      r.time = now;
      if (id) m.play(id, { fade: .05 });
    }
    r.time = now;
  }
  function ensure(m) {
    if (m._platformMusic) return m._platformMusic;
    const r = m._platformMusic = { off: null, time: null, restarts: 0 };
    r.off = lifecycle.subscribe({
      suspend() { r.time = m.ctx?.currentTime ?? null; stop(m); },
      resume() { rebase(m, r); if (m.ctx && !m.offline) m._startTimer(); },
    });
    return r;
  }
  P._startTimer = function () {
    if (this.offline || !this.ctx) return;
    ensure(this);
    if (!lifecycle.active || this.worker || this.timer != null) return;
    return start.call(this);
  };
  P._tick = function () {
    if (!this.ctx) return;
    if (this.offline) return tick.call(this);
    const r = ensure(this);
    if (!lifecycle.active || !this.ctx) return;
    rebase(this, r);
    return tick.call(this);
  };
  P.dispose = function (...args) {
    this._platformMusic?.off?.(); this._platformMusic = null;
    stop(this); return dispose.apply(this, args);
  };
}
