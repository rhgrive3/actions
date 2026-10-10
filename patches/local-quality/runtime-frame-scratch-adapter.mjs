// Build-time-only allocation elimination in unconditional frame work.
// Keeps frame cadence, visual output, draw ordering and control flow unchanged.
// Source anchors are protected; unknown upstream revisions fail the build.
export function adaptRuntimeFrameScratch(rel, code, replaceOnce) {
  const patch=(from,to,why)=>{code=replaceOnce(code,from,to,'runtime frame scratch: '+why);};
  if (rel === 'src/main.js') {
    // Previously, a new arrow closure was allocated on *every* rAF callback.
    // Reuse a per-Game callback while dynamically resolving this._loop() each
    // time, so hot swapping and the existing lifecycle still behave the same.
    patch('  _loop() {\n    requestAnimationFrame(() => this._loop());',
      '  _loop() {\n    requestAnimationFrame(this._iwRafCallback || (this._iwRafCallback = () => this._loop()));',
      'one requestAnimationFrame callback per Game');
  }
  if (rel === 'src/world/environment.js') {
    // Planar marina reflection draws reuse scratch lists. The list of scene
    // objects and its original visibility snapshot keep their exact order.
    // No reference is retained beyond the draw, including renderer failures.
    patch(
      '    const hide = [this.sea, this.sky, this.lhBeam, this.city, this.terrain, this.staticScenery, this.ferris, this.trees, this.sailInst, this.gullInst];',
      `    const hide = this._iwReflHide || (this._iwReflHide = []);
    hide.length = 0;
    hide.push(this.sea, this.sky, this.lhBeam, this.city, this.terrain, this.staticScenery, this.ferris, this.trees, this.sailInst, this.gullInst);`,
      'reuse per-environment reflection hide list');
    patch(
      '    const vis = hide.map((o) => o.visible);',
      `    const vis = this._iwReflVis || (this._iwReflVis = []);
    for (let i = 0; i < hide.length; i++) vis[i] = hide[i].visible;`,
      'reuse reflection visibility snapshot array');
    patch(
      '      hide.forEach((o, i) => { o.visible = vis[i]; });',
      `      for (let i = 0; i < hide.length; i++) hide[i].visible = vis[i];
      // Never retain old stage Actors, PropKit meshes or texture references.
      hide.length = 0;
      vis.length = 0;`,
      'retire scratch references immediately after reflection render');
  }
  return code;
}
