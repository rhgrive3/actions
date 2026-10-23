// Late build-only owners: main and paint retain their existing source-snapshot contract.
export function adaptWorldQueueBuild(rel, code, once) {
  if (rel === 'src/world/paint.js') code = once(code,
    "    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3));\n", '', 'indexed splats need only their shader inputs');
  if (rel === 'src/world/environment.js') {
    // Keep the public two-argument call compatible; the third argument is transaction-local.
    code = once(code, '  rebuildForArena(bounds, rects) {', '  rebuildForArena(bounds, rects, theme = null) {', 'optional final arena theme');
    code = once(code, '    this._rebuildDock();\n    this._applyMarina();\n    this._fitShadow();\n    this._bakeFarReflection();\n  }',
      '    this._rebuildDock();\n    if (theme && theme !== this.theme) {\n      // The first cube update may initialize the shadow map under the old light.\n      // Preserve that observable order on cold/context-restored renderers.\n      if (!this.sun.shadow.map) { this._applyMarina(); this._fitShadow(); this._bakeFarReflection(); }\n      this.setTheme(theme);\n    }\n    else { this._applyMarina(); this._fitShadow(); this._bakeFarReflection(); }\n  }', 'one final marina generation and reflection');
  }
  if (rel === 'src/main.js') {
    code = once(code, '  async _buildWorld(map, flow = null) {', '  async _buildWorld(map, flow = null, theme = null) {', 'world build carries its final theme');
    code = once(code, 'try { await this._buildWorld(map, flow); }', 'try { await this._buildWorld(map, flow, mapTheme(map, opts.time)); }', 'offline stage theme transaction');
    code = once(code, 'this._builtQuality !== this.settings?.quality) await this._buildWorld(map, flow);', 'this._builtQuality !== this.settings?.quality) await this._buildWorld(map, flow, mapTheme(map, cfg.time));', 'online stage theme transaction');
    code = once(code, 'G.env.rebuildForArena(level.bounds, this._footprint(level));', 'G.env.rebuildForArena(level.bounds, this._footprint(level), theme);', 'publish level before final themed resources');
    const block = `    this.grateMat = createLevelMaterial(G.paint.texture, G.paint.size, this.murals, { grate: true, lightmap, texlib: this.texlib });
    const gg = level.buildGeometry(G.paint.size, (b) => b.grate);
    this.grateMesh = new THREE.Mesh(gg, this.grateMat);
    this.grateMesh.receiveShadow = true; this.grateMesh.visible = gg.index.count > 0;
    scene.add(this.grateMesh);`;
    code = once(code, block, `    this.grateMesh = this.grateMat = null;
    level.renderTris = 0;
    if (level.faces.some(f => level.blocks[f.block]?.grate)) {
${block}
    }`, 'only visible grate faces require a second pass');
    // Main still publishes the final env-map and updates FX after the world commit.
    const target='      G.env.setTheme?.(theme);';
    if(code.split(target).length!==3)throw Error('world theme owner changed');
    code=code.split(target).join('      if (G.env.theme !== theme) G.env.setTheme?.(theme);');
  }
  return code;
}
