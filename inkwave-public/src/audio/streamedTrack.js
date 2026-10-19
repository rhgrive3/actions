// Stream pre-encoded battle music instead of decoding the entire MP3 into an AudioBuffer.
// Connected to MusicEngine.mix, so user volume, SFX ducking and master limiting still apply.
export class StreamedTrack {
  constructor(engine, id, song, element, onFailure) {
    this.engine = engine;
    this.id = id;
    this.song = song;
    this.element = element;
    this.onFailure = onFailure;
    this.stopAt = Infinity;
    this.disposed = false;
    this.failed = false;
    element.loop = true;
    this.gain = engine.ctx.createGain();
    this.gain.gain.value = 0;
    this.source = engine.ctx.createMediaElementSource(element);
    this.source.connect(this.gain);
    this.gain.connect(engine.mix);
    this._onError = () => this._fail(this.element.error);
    element.addEventListener('error', this._onError);
  }

  // Start under the trusted START/REMATCH gesture, routed through a zero-gain node.
  // Keep playback alive until GO: iOS Safari may reject a fresh play() after the wipe.
  prime() {
    try {
      const started = this.element.play();
      if (started && typeof started.catch === 'function') started.catch(error => this._fail(error));
    } catch (error) {
      Promise.resolve().then(() => this._fail(error));
    }
  }

  fadeIn(at, duration) {
    const now = this.engine.now();
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.setValueAtTime(0, Math.max(now, at));
    g.linearRampToValueAtTime(0.7, Math.max(now, at) + Math.max(0.01, duration));
    try {
      const started = this.element.play();
      if (started && typeof started.catch === 'function') started.catch(error => this._fail(error));
    } catch (error) {
      // Wait for MusicEngine to select the player before handling rejection.
      Promise.resolve().then(() => this._fail(error));
    }
  }

  fadeOut(at, duration) {
    const now = this.engine.now();
    const begin = Math.max(now, at);
    const end = begin + Math.max(0.01, duration);
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (begin > now) g.setValueAtTime(g.value, begin);
    g.linearRampToValueAtTime(0, end);
    this.stopAt = end;
    clearTimeout(this._pauseTimer);
    this._pauseTimer = setTimeout(() => {
      if (!this.disposed) this.element.pause();
    }, Math.max(0, (end - now) * 1000) + 30);
  }

  pump() {}  // HTMLMediaElement schedules its own decoding and playback.
  setIntensity() {}  // A finished recording has no independent stem layers.

  _fail(error) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.onFailure(this, error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this._pauseTimer);
    this.element.removeEventListener('error', this._onError);
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
    this.source.disconnect();
    this.gain.disconnect();
  }
}
