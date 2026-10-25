const INSTALLED = Symbol.for('inkwave.music.idle.v1');
// Own only music scheduling. Never suspend the shared SFX AudioContext.
export function installMusicIdle(MusicEngine, env = globalThis) {
  const P = MusicEngine.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const play = P.play, start = P._startTimer, tick = P._tick, dispose = P.dispose;
  const state = m => m._musicIdle || (m._musicIdle = { enabled: true, wanted: undefined });
  function clearRetirement(s) {
    if (s.retireTimer != null) env.clearTimeout?.(s.retireTimer);
    s.retireTimer = null;
    s.retireContext?.removeEventListener?.('statechange', s.retireListener);
    s.retireContext = null; s.retireListener = null;
  }
  function scheduleRetirement(m) {
    const s = state(m), ctx = m.ctx;
    if (s.retireTimer != null) env.clearTimeout?.(s.retireTimer);
    s.retireTimer = null;
    let deadline = Infinity;
    for (const p of m.players) {
      if (p?.element && !p.disposed && p !== m._preloadedFile?.player && p._pausedAfterFade &&
          p.element.paused && Number.isFinite(p.stopAt)) deadline = Math.min(deadline, p.stopAt);
    }
    if (!Number.isFinite(deadline) || !ctx || m.offline) { clearRetirement(s); return; }
    if (ctx.state === 'closed') {
      // A closed clock can never finish a pending deadline, and these streams
      // have already paused. Keep current live and primed players untouched.
      for (let i = m.players.length - 1; i >= 0; i--) {
        const p = m.players[i];
        if (p?.element && p !== m._preloadedFile?.player && p._pausedAfterFade && p.element.paused && Number.isFinite(p.stopAt)) {
          p.dispose(); m.players.splice(i, 1); if (m.current === p) m.current = null;
        }
      }
      clearRetirement(s); return;
    }
    if (s.retireContext !== ctx) {
      clearRetirement(s);
      s.retireContext = ctx;
      s.retireListener = () => {
        if (m._musicIdle !== s) return;
        // Check only faded/paused media, without waking the note scheduler.
        for (let i = m.players.length - 1; i >= 0; i--) m.retireStream(m.players[i]);
        scheduleRetirement(m);
      };
      ctx.addEventListener?.('statechange', s.retireListener);
    }
    if (ctx.state === 'running' && env.setTimeout) {
      const listener = s.retireListener;
      s.retireTimer = env.setTimeout(() => {
        if (m._musicIdle !== s) return;
        s.retireTimer = null; listener();
      }, Math.max(20, (deadline - m.now()) * 1000 + 10));
    }
  }
  function stopTimer(m) {
    if (m.worker) { const w = m.worker; m.worker = null; w.onmessage = w.onerror = null; w.terminate(); }
    if (m.timer != null) env.clearInterval(m.timer);
    m.timer = null; m._proceduralClock = false; m._workerFailed = false;
  }
  P.setMusicEnabled = function (enabled) {
    const s = state(this); enabled = !!enabled;
    if (s.enabled === enabled) return;
    s.enabled = enabled;
    if (!enabled) {
      clearRetirement(s);
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
  P.retireStream = function (player) {
    if (!player?.element || player === this._preloadedFile?.player || !this.players.includes(player)) return false;
    if (!player.disposed && (!player.element.paused || !Number.isFinite(player.stopAt) || this.now() < player.stopAt)) {
      if (player._pausedAfterFade) scheduleRetirement(this);
      return false;
    }
    player.dispose();
    const at = this.players.indexOf(player); if (at >= 0) this.players.splice(at, 1);
    if (this.current === player) this.current = null;
    scheduleRetirement(this);
    return true;
  };
  P._startTimer = function () {
    for (let i = this.players.length - 1; i >= 0; i--) this.retireStream(this.players[i]);
    if (!this.players.some(player => !player.element && !player.disposed)) { stopTimer(this); return; }
    if (!state(this).enabled || !this.ctx || this.offline || !this.players.length || this.worker || this.timer != null) return;
    return start.call(this);
  };
  P._tick = function () {
    if (!state(this).enabled) return;
    const result = tick.call(this);
    for (let i = this.players.length - 1; i >= 0; i--) this.retireStream(this.players[i]);
    if (!this.players.some(player => !player.element && !player.disposed)) stopTimer(this);
    return result;
  };
  P.dispose = function (...args) {
    if (this._musicIdle) clearRetirement(this._musicIdle);
    stopTimer(this); this._musicIdle = null;
    const result = dispose.apply(this, args);
    // Disconnecting stops processing but does not release the node's context
    // or the ConvolverNode's impulse. The music singleton outlives this graph.
    for (const node of this._nodes || []) {
      if (node && 'buffer' in node) {
        try { node.buffer = null; } catch { /* an already closed graph stays retired */ }
      }
    }
    if (this._nodes) this._nodes.length = 0;
    this.mix = this.out = this.dlyIn = this.revIn = this.dA = this.dB = null;
    this._preparedMusicImpulse = null;
    return result;
  };
}
