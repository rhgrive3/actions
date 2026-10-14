// Build-time-only, opt-in device diagnosis for the HUD FPS counter.
//
// Opening the game with `?perf` shows the FPS counter (even with the setting
// off) and appends the main-thread cost the game already measures every frame
// (main.js `this.perf`: simulation + render-submission ms, draw calls) plus the
// dynamic-resolution scale. On a slow phone or tablet this tells CPU-bound
// (CPU ms close to the frame interval) from GPU-bound (low FPS with small CPU
// ms; the resolution scale then steps down). Without `?perf` the counter is
// byte-for-byte the native one. Fail closed when an anchor changes.
export function adaptPerfReadout(rel, code, replaceOnce) {
  if (rel !== 'src/ui/hud.js') return code;
  code = replaceOnce(code,
    '  _updFps(fps, dt) {\n    const L = this._L;\n',
    '  _updFps(fps, dt) {\n    if (IW_PERF_READOUT && fps == null) fps = G.game?.fps;\n    const L = this._L;\n',
    'perf readout: ?perf shows the counter');
  code = replaceOnce(code,
    '    const txt = `${Math.round(fps)} FPS`;\n',
    '    const txt = `${Math.round(fps)} FPS` + iwPerfReadout();\n',
    'perf readout: append measured frame cost');
  return code + `
const IW_PERF_READOUT = typeof location !== 'undefined' && /[?&]perf(?:[=&]|$)/.test(location.search || '');
function iwPerfReadout() {
  if (!IW_PERF_READOUT) return '';
  const g = G.game, p = g && g.perf;
  if (!p) return '';
  const scale = (g.R && g.R.dynScale) || 1;
  return \` · CPU \${(p.sim + p.render).toFixed(1)}ms (sim \${p.sim.toFixed(1)} / draw \${p.render.toFixed(1)}) · res \${Math.round(scale * 100)}% · \${p.calls} calls\`;
}
`;
}
