// Issue #834 residual root (distinct from #314 retained-canvas budget covered
// by open PR 868/849 Refs): Showcase portrait jobs each allocate/retain two
// owned GPU render targets (this._prt MSAA HDR + this._prt8 resolve, resized
// per requested tile size S in _renderPortraitSetup) plus a per-job
// Uint8Array(S*S*4) readback staging buffer in _renderPortraitRun. The native
// _clear()/hide()/dispose() lifecycle retires stage Characters and the main
// _rt target but never disposes _prt/_prt8, so leaving the Locker pins the
// last portrait size's GPU targets indefinitely; _renderPortraitSetup only
// disposes them when the next tile requests a *different* size.
// Native inkwave-public/ owns tile identity, cache keys, cancellation, the
// Character settle, and the render itself; this build-only adapter only
// retires portrait-owned GPU targets on Showcase lifecycle transitions and
// counts per-frame portrait generation for budget observation. It never
// touches live/shared battle resources (scene Characters, lights, lobby set,
// main _rt, cached canvases), never invents a Nintendo quota, and preserves
// tile identity/invalidation (keys, callbacks, cancel handles stay native).
// Parent wires adaptPortraitSchedule into patches/local-quality/adapter.mjs.
export const PORTRAIT_SCHEDULE = Object.freeze({
  // Observation only: native _portraitStep already dequeues at most one job
  // per render() call; the counter below records per-frame generation for
  // tests/traces without changing cadence.
  maxUncachedPerFrame: 1,
});

function replaceOncePortrait(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE portrait schedule patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Retire only portrait-owned GPU targets. Called on Showcase lifecycle
// transitions (mode leave / dispose). Guards on the _prt field so shared or
// already-released targets are never touched; nulls the owner fields after
// dispose so a later tile lazily recreates them at its own size.
export function releasePortraitTargets(owner) {
  if (!owner) return false;
  if (!owner._prt && !owner._prt8) return false;
  try { owner._prt?.dispose?.(); } catch (e) { /* owned target teardown must not break navigation */ }
  try { owner._prt8?.dispose?.(); } catch (e) { /* owned target teardown must not break navigation */ }
  owner._prt = null; owner._prt8 = null;
  return true;
}

export function adaptPortraitSchedule(rel, code) {
  if (rel !== 'src/game/showcase.js') return code;
  // Observe per-frame portrait generation without changing native cadence:
  // stamp a frame id in render() (the single production _portraitStep caller)
  // and count jobs that reach the GPU render path. Cache hits, cancelled, and
  // warmup-gated jobs return before _renderPortrait and never spend.
  code = replaceOncePortrait(code,
    '  render() {\n    if (this._pq.length) this._portraitStep();',
    '  render() {\n    this._qualityFrameId = (this._qualityFrameId || 0) + 1;\n    if (this._pq.length) this._portraitStep();',
    'portrait frame clock');
  code = replaceOncePortrait(code,
    '    try { read = this._renderPortrait(job.req); } catch (e) { console.error(\'[showcase] portrait\', e); }',
    '    if (this._qualityPortraitFrame !== this._qualityFrameId) { this._qualityPortraitFrame = this._qualityFrameId; this._qualityPortraitSpent = 0; }\n' +
    '    let qualitySpend = false;\n' +
    '    try { read = this._renderPortrait(job.req); qualitySpend = !!read; } catch (e) { console.error(\'[showcase] portrait\', e); }\n' +
    '    if (qualitySpend) this._qualityPortraitSpent = (this._qualityPortraitSpent || 0) + 1;',
    'portrait generation counter');
  // Retire owned portrait GPU targets when leaving a studio overlay mode.
  // hide() runs on every Locker/loadout/results exit; _clear() runs on mode
  // transitions and dispose(). Either path releases _prt/_prt8 so the last
  // portrait size does not pin GPU memory after the UI is left. The cached
  // Canvas2D map (_pcache) and live scene contents are untouched here.
  code = replaceOncePortrait(code,
    '  hide() {\n    if (!this.mode) return;',
    '  hide() {\n    releasePortraitTargets(this);\n    if (!this.mode) return;',
    'portrait targets on hide');
  code = replaceOncePortrait(code,
    '  _clear() {\n    for (const c of this.chars) { this.scene.remove(c.root); c.dispose?.(); }',
    '  _clear() {\n    releasePortraitTargets(this);\n    for (const c of this.chars) { this.scene.remove(c.root); c.dispose?.(); }',
    'portrait targets on clear');
  return "import { releasePortraitTargets } from '../../patches/local-quality/portrait-schedule.mjs';\n" + code;
}
