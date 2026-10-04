const INSTALLED = Symbol.for('inkwave.music.idle.v1');
// Own only music scheduling. Never suspend the shared SFX AudioContext.
export function installMusicIdle(MusicEngine, env = globalThis) {
  const P = MusicEngine.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const play = P.play, start = P._startTimer, tick = P._tick, dispose = P.dispose;
  const state = m => m._musicIdle || (m._musicIdle = { enabled: true, wanted: undefined });
  function stopTimer(m) {
    if (m.worker) { const w = m.worker; m.worker = null; w.onmessage = w.onerror = null; w.terminate(); }
    if (m.timer != null) env.clearInterval(m.timer);
    m.timer = null;
  }
  P.setMusicEnabled = function (enabled) {
    const s = state(this); enabled = !!enabled;
    if (s.enabled === enabled) return;
    s.enabled = enabled;
    if (!enabled) {
      if (s.wanted === undefined && this.current) s.wanted = { track: this.current.id, opts: { fade: 0.05 } };
      for (const p of this.players) p.dispose();
      this.players.length = 0; this.current = null;
      stopTimer(this);
    } else if (s.wanted !== undefined) this.play(s.wanted.track, s.wanted.opts);
  };
  P.play = function (track, opts = {}) {
    const s = state(this); s.wanted = { track, opts: { ...opts } };
    if (!s.enabled) return;
    const result = play.call(this, track, opts);
    if (this.players.length && !this.offline) this._startTimer();
    return result;
  };
  P._startTimer = function () {
    if (!state(this).enabled || !this.ctx || this.offline || !this.players.length || this.worker || this.timer != null) return;
    return start.call(this);
  };
  P._tick = function () {
    if (!state(this).enabled) return;
    const result = tick.call(this);
    if (!this.players.length) stopTimer(this);
    return result;
  };
  P.dispose = function (...args) {
    stopTimer(this); this._musicIdle = null;
    return dispose.apply(this, args);
  };
}
