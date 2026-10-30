// Build-time refinement of the existing Game._dynRes() 4-second controller.
// A display-limited rAF and an overloaded 60 Hz GPU can both present at 30 Hz.
// Never label one as the other using callback cadence alone. Instead, ask
// whether one actual resolution reduction measurably improves delivered time.
// The original CPU simulation, network and render driver are unchanged.
export function adaptRefreshAwareDynRes(rel, code, replaceOnce) {
  if (rel !== 'src/main.js') return code;
  code = replaceOnce(code,
    '    if (dt <= 0 || dt > 0.25) return;',
    `    // Native overload admission: isolated stalls remain excluded, but a
    // continuously overloaded native stage must still reach the controller.
    // Only this diagnostic sample is bounded; simulation keeps its real dt.
    if (Number.isFinite(dt) && dt > 0.25 && G.level?.native &&
        !document.hidden && this.match?.state === 'playing' &&
        !this.match.attract && !this.match.paused && this.settings.quality !== 'ultra') {
      let slow = this._nativeSlowFrames;
      if (!slow || slow.match !== this.match || slow.level !== G.level || slow.quality !== this.settings.quality)
        slow = this._nativeSlowFrames = { match: this.match, level: G.level, quality: this.settings.quality, count: 0 };
      slow.count = Math.min(4, slow.count + 1);
      if (slow.count < 4) return;
      dt = Math.min(dt, 1);
    } else {
      this._nativeSlowFrames = null;
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) return;
    }
    // End native overload admission.`,
    'admit sustained native overload without counting isolated stalls');
  code = replaceOnce(code,
    '      d.match = match; d.quality = quality;',
    '      d.match = match; d.quality = quality;\n      d._resolutionTrial = null; d._noGainWindows = 0; d._noGainCount = 0;',
    'reset resolution causal trial on match/quality change');
  code = replaceOnce(code,
    "    const budget = dynamicResolutionBudget(this.settings.frameRate === 'auto'\n      && this.mobile?.touch ? this._iwLastCap : 60);\n    const overloaded = avg > budget.overloadFrameSeconds;\n    const headroom = avg < budget.headroomFrameSeconds;",
    `    // A stable 30 Hz panel and a 60 Hz GPU stuck at 30 fps are
    // observationally identical in rAF. Only adopt a quality reduction if
    // the next 4-second window gains meaningful presented-frame headroom.
    // If quality was not limiting, restore it rather than making a native
    // 30 Hz display progressively blurrier with no FPS gain.
    if (d._resolutionTrial) {
      const trial = d._resolutionTrial;
      d._resolutionTrial = null;
      const gain = trial.avg - avg;
      if (!Number.isFinite(gain) || gain < Math.max(0.002, trial.avg * 0.07)) {
        this.R.setDynamicScale(trial.scale);
        d._noGainCount = Math.min(3, (d._noGainCount || 0) + 1);
        d._noGainWindows = 1 << (d._noGainCount + 1);
        d.good = 0; d.probe = false;
        return;
      }
      d._noGainCount = 0;
      d._noGainWindows = 0;
    }
    if (d._noGainWindows > 0) d._noGainWindows--;
    const budget = dynamicResolutionBudget(this.settings.frameRate === 'auto'
      && this.mobile?.touch ? this._iwLastCap : 60);
    const overloaded = avg > budget.overloadFrameSeconds && !(d._noGainWindows > 0);
    const headroom = avg < budget.headroomFrameSeconds;`,
    'causal GPU-vs-vsync resolution trial');
  code = replaceOnce(code,
    '      this.R.setDynamicScale(Math.max(floor, s - 0.125));',
    `      d._resolutionTrial = { avg, scale: s };
      this.R.setDynamicScale(Math.max(floor, s - 0.125));`,
    'record the prior real rAF cadence before one quality reduction');
  return code;
}
