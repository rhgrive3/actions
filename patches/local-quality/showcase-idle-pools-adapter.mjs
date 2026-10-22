export function adaptShowcaseIdlePools(rel,code,replaceOnce){
  if(rel!=='src/game/showcase.js')return code;
    // Each flag describes a fully empty pool after its existing final-count
    // pass. Spawns invalidate it; clear and final expiry establish it. InkFX
    // also checks deferred newborn drops that _land may place behind the scan.
    for (const name of ['InkFX', 'Confetti', 'Sparkles', 'InkTrail']) {
      const start = code.indexOf('class ' + name + ' {'), end = code.indexOf('\n}\n', start) + 2;
      if (start < 0 || end < start) throw new Error('INKWAVE showcase pool boundary conflict: ' + name);
      let pool = code.slice(start, end);
      const p = (from, to, why) => { pool = replaceOnce(pool, from, to, 'showcase idle ' + name + ': ' + why); };
      const constructor = pool.match(/  constructor\([^\n]+\) \{/)[0];
      p(constructor, constructor + '\n    this._iwFxIdle = true;', 'start empty');
      p('  clear() {', '  clear() { this._iwFxIdle = true;', 'clear empties pool');
      const update = name === 'InkFX' || name === 'Confetti' ? '  update(dt, decks) {' : '  update(dt) {';
      p(update, update + '\n    if (this._iwFxIdle) return;', 'empty update is O(1)');
      if (name === 'InkFX') {
        p('    const i = this._slot(); if (i < 0) return -1;', '    const i = this._slot(); if (i < 0) return -1;\n    this._iwFxIdle = false;', 'drop wakes only after acquiring a slot');
        p('  splat(x, y, z, size, life) {', '  splat(x, y, z, size, life) { this._iwFxIdle = false;', 'splat wakes');
        p('  ripple(x, y, z, r0, r1, life) {', '  ripple(x, y, z, r0, r1, life) { this._iwFxIdle = false;', 'ripple wakes');
        p('    if (this.rings.count > 0) this.rings.instanceMatrix.needsUpdate = true;',
          `    if (this.rings.count > 0) this.rings.instanceMatrix.needsUpdate = true;
    if (!this.mesh.count && !this.splats.count && !this.rings.count) {
      this._iwFxIdle = true;
      for (let i = 0; i < this.N; i++) if (this.K[i]) { this._iwFxIdle = false; break; }
    }`, 'final expiry checks deferred landing spawns');
      } else if (name === 'Confetti') {
        p('    const i = this._slot(foil); if (i < 0) return;', '    const i = this._slot(foil); if (i < 0) return;\n    this._iwFxIdle = false;', 'paper or foil spawn wakes');
        p('    if (this.foil.count > 0) this.foil.instanceMatrix.needsUpdate = true;', '    if (this.foil.count > 0) this.foil.instanceMatrix.needsUpdate = true;\n    this._iwFxIdle = !this.paper.count && !this.foil.count;', 'both subpools exhausted');
      } else {
        const spawn = name === 'Sparkles' ? '  spawn(x, y, z, size, color, life) {' : '  add(x, y, z, yaw, w, len, color, life) {';
        p(spawn, spawn + ' this._iwFxIdle = false;', 'cyclic write wakes');
        p('    if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;', '    if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;\n    this._iwFxIdle = this.mesh.count === 0;', 'all slots exhausted');
      }
      code = code.slice(0, start) + pool + code.slice(end);
    }
  return code;
}
