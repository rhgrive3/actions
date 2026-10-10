// Build-only main-loop fix: 90 Hz touch Auto no longer alternates 11/22ms
// presentation gaps to approximate 60Hz. Explicit 60/Display modes unchanged.
// Opt-in ?profileRange=1 exposes an on-screen and console-accessible
// frame-time recorder, never changing gameplay or uploading measurements.
const once = (code, before, after, label) => {
  const i=code.indexOf(before);
  if(i<0 || code.indexOf(before,i+before.length)>=0)
    throw new Error('range-frame-pacing source anchor mismatch: '+label);
  return code.slice(0,i)+after+code.slice(i+before.length);
};
export function adaptRangeFramePacing(rel, code) {
  if(rel!=='src/main.js') return code;
  code = once(code,
    '  _loop() {\n    requestAnimationFrame(() => this._loop());\n    this.timer.update();\n    const rawDt = this.timer.getDelta();\n    if (this.frozen) return;',
    `  _loop() {
    requestAnimationFrame(() => this._loop());
    this.timer.update();
    const rawDt = this.timer.getDelta();
    if (this._rangeFrameProbe === undefined) {
      const enabled = typeof location !== 'undefined' &&
        new URLSearchParams(location.search).get('profileRange') === '1';
      this._rangeFrameProbe = enabled ? createFrameTimingProbe({ env: globalThis }) : null;
    }
    this._rangeFrameProbe?.callback(rawDt);
    if (this.frozen) return;`,
    'frame loop diagnostic input');
  code = once(code,
    "    const capHz = fr === 'display' ? 0 : fr === 60 ? 60 : (this.mobile?.touch ? 60 : 0);",
    `    let capHz = fr === 'display' ? 0 : fr === 60 ? 60 : (this.mobile?.touch ? 60 : 0);
    // Probe raw requestAnimationFrame timing once, without a second RAF loop.
    // Stable high-refresh touch panels use an even presentation divisor.
    if (fr === 'auto' && this.mobile?.touch) {
      this._iwRefreshProbe ||= createRefreshProbe();
      if (document.hidden) {
        if (!this._iwPacerHidden) this._iwRefreshProbe.reset();
        this._iwPacerHidden = true;
      } else {
        this._iwPacerHidden = false;
        capHz = evenTouchAutoHz(this._iwRefreshProbe.sample(rawDt));
      }
    }
    if (capHz !== this._iwLastCap) {
      this._frameCapAcc = 0;
      this._frameCapElapsed = 0;
      this._iwLastCap = capHz;
    }`,
    'touch frame cap rate');
  code = once(code,
    '      if (this._frameCapAcc + 1e-6 < step) return;',
    '      if (this._frameCapAcc + 1e-6 < step) { this._rangeFrameProbe?.skipped(); return; }',
    'frame cap skipped callback');
  code = once(code,
    '    dt = Math.min(dt, 1 / 24);\n    this._frame(dt);\n  }',
    `    dt = Math.min(dt, 1 / 24);
    const frameStart = this._rangeFrameProbe ? performance.now() : 0;
    this._frame(dt);
    if (this._rangeFrameProbe) this._rangeFrameProbe.record(frameStart, performance.now()-frameStart, {
      frameRateHz: capHz || this._iwRefreshProbe?.rate || 60,
      refreshHz: this._iwRefreshProbe?.rate || 0,
      scale: this.R?.dynScale || 1,
      phase: this.match?.range || this.match?.opts?.range ? 'practice' :
        this.match?.attract ? 'attract' : this.match ? 'battle' : 'menu',
      stages: this.perf,
    });
  }`,
    'frame CPU recorder');
  return "import { createRefreshProbe, evenTouchAutoHz, createFrameTimingProbe } from '../patches/local-quality/range-frame-pacing.mjs';\n"+code;
}
