export function adaptShowcaseIdlePools(rel,code,replaceOnce){
  if(rel!=='src/game/showcase.js')return code;
    // Each flag describes a fully empty pool after its existing final-count
    // pass. Spawns invalidate it; clear and final expiry establish it. InkFX
    // also checks deferred newborn drops that _land may place behind the scan.
    const rangeUpload = (m) =>
      `    ${m}.visible = ${m}.count > 0;\n` +
      `    if (${m}.count > 0) { const _a = ${m}.instanceMatrix; _a.updateRanges.length = 0; ${m}._iwRange.count = ${m}.count * 16; _a.updateRanges.push(${m}._iwRange); _a.needsUpdate = true; }`;
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
        p('      m.frustumCulled = false; m.count = 0;',
          '      m.frustumCulled = false; m.count = 0; m.visible = false; m._iwRange = { start: 0, count: 0 };', 'hide empty meshes and init ranges');
        p('m.setMatrixAt(i, ZERO_M); m.count = 0; }',
          'm.setMatrixAt(i, ZERO_M); m.count = 0; m.visible = false; }', 'clear hides meshes');
        p('    const i = this._slot(); if (i < 0) return -1;', '    const i = this._slot(); if (i < 0) return -1;\n    this._iwFxIdle = false;', 'drop wakes only after acquiring a slot');
        p('  splat(x, y, z, size, life) {', '  splat(x, y, z, size, life) { this._iwFxIdle = false;', 'splat wakes');
        p('  ripple(x, y, z, r0, r1, life) {', '  ripple(x, y, z, r0, r1, life) { this._iwFxIdle = false;', 'ripple wakes');
        p('    if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.mesh'), 'mesh visibility and range upload');
        p('    if (this.splats.count > 0) this.splats.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.splats'), 'splats visibility and range upload');
        p('    if (this.rings.count > 0) this.rings.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.rings') + `\n    if (!this.mesh.count && !this.splats.count && !this.rings.count) {
      this._iwFxIdle = true;
      for (let i = 0; i < this.N; i++) if (this.K[i]) { this._iwFxIdle = false; break; }
    }`, 'final expiry checks deferred landing spawns');
      } else if (name === 'Confetti') {
        p('      m.frustumCulled = false; m.count = 0; m.renderOrder = 2;',
          '      m.frustumCulled = false; m.count = 0; m.visible = false; m._iwRange = { start: 0, count: 0 }; m.renderOrder = 2;', 'hide empty meshes and init ranges');
        p('m.setMatrixAt(i, ZERO_M); m.count = 0; }',
          'm.setMatrixAt(i, ZERO_M); m.count = 0; m.visible = false; }', 'clear hides meshes');
        p('    const i = this._slot(foil); if (i < 0) return;', '    const i = this._slot(foil); if (i < 0) return;\n    this._iwFxIdle = false;', 'paper or foil spawn wakes');
        p('    if (this.paper.count > 0) this.paper.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.paper'), 'paper visibility and range upload');
        p('    if (this.foil.count > 0) this.foil.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.foil') + '\n    this._iwFxIdle = !this.paper.count && !this.foil.count;', 'both subpools exhausted');
      } else if (name === 'Sparkles') {
        p('    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 20;',
          '    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false; this.mesh._iwRange = { start: 0, count: 0 }; this.mesh.renderOrder = 20;', 'hide empty mesh and init range');
        p('this.mesh.count = 0; }', 'this.mesh.count = 0; this.mesh.visible = false; }', 'clear hides mesh');
        p('  spawn(x, y, z, size, color, life) {', '  spawn(x, y, z, size, color, life) { this._iwFxIdle = false;', 'cyclic write wakes');
        p('    if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.mesh') + '\n    this._iwFxIdle = this.mesh.count === 0;', 'all slots exhausted');
      } else {
        p('    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.receiveShadow = true;',
          '    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false; this.mesh._iwRange = { start: 0, count: 0 }; this.mesh.receiveShadow = true;', 'hide empty mesh and init range');
        p('this.mesh.count = 0; }', 'this.mesh.count = 0; this.mesh.visible = false; }', 'clear hides mesh');
        p('  add(x, y, z, yaw, w, len, color, life) {', '  add(x, y, z, yaw, w, len, color, life) { this._iwFxIdle = false;', 'cyclic write wakes');
        p('    if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;',
          rangeUpload('this.mesh') + '\n    this._iwFxIdle = this.mesh.count === 0;', 'all slots exhausted');
      }
      code = code.slice(0, start) + pool + code.slice(end);
    }
  return code;
}
