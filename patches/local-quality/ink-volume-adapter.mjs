// Compose after existing presentation fixes. Upstream sources and gameplay
// remain intact; exact anchors fail closed when the native contract changes.
export function adaptInkVolumes(rel, code, replaceOnce) {
  const patch = (a, b, why) => { code = replaceOnce(code, a, b, 'ink volume: ' + why); };
  if (rel === 'src/fx/fx.js') {
    code = "import { InkVolumes } from '../../patches/local-quality/ink-volume/runtime.mjs';\nimport { loadVolumePack, DEFAULT_INK_VOLUME_URLS } from '../../patches/local-quality/ink-volume/pack.mjs';\n" + code;
    patch('    this._sq = new Float32Array(96 * 14); this._sqN = 0;\n  }', `    this._sq = new Float32Array(96 * 14); this._sqN = 0;
    // Original source-derived packs are included and enabled on ordinary boot.
    // Optional overrides remain available to the asset registration API/tests.
    const volumeURL = globalThis.INKWAVE_INK_VOLUME_URL;
    const volumeURLs = globalThis.INKWAVE_INK_VOLUME_URLS;
    const entries = Object.entries({ ...DEFAULT_INK_VOLUME_URLS, ...(volumeURLs && typeof volumeURLs === 'object' ? volumeURLs : {}) });
    if (typeof volumeURL === 'string' && volumeURL) entries.find(([name]) => name === 'roller')[1] = volumeURL;
    this._inkVolumeAbort = typeof AbortController === 'function' ? new AbortController() : null;
    this.inkVolumeReady = Promise.all(entries.map(([name,url]) => this.loadInkVolume(name,url,{ signal: this._inkVolumeAbort?.signal }).then(() => true))).then(() => true).catch(error => { this.inkVolumeError = String(error); return null; });
  }`, 'automatic bundled source packs');
    patch('  setCollider(fn) { this.collider = fn; }', `  setCollider(fn) { this.collider = fn; }
  async loadInkVolume(name, url, options) {
    const pack = await loadVolumePack(url, options);
    return this.registerInkVolume(name, pack);
  }
  registerInkVolume(name, pack) {
    if (this._inkVolumeDisposed) throw Error('FX disposed');
    this.inkVolumes ||= new InkVolumes(this.root, this._light, { capacity: Math.round(128 * Math.min(1, this.q)), triangleBudget: Math.round(600000 * Math.min(1, this.q)) });
    return this.inkVolumes.register(name, pack);
  }`, 'shared renderer registration');
    patch('    this.dN = 0; this.dGeo.instanceCount = 0;', '    this.inkVolumes?.clear();\n    this.dN = 0; this.dGeo.instanceCount = 0;', 'match reset');
    patch('  dispose() {\n    this.scene.remove(this.root);', '  dispose() {\n    this._inkVolumeDisposed = true;\n    this._inkVolumeAbort?.abort();\n    this._inkVolumeAbort = null;\n    this.inkVolumeReady = null;\n    this.inkVolumes?.dispose();\n    this.scene.remove(this.root);', 'owned resources released before FX traversal');
    patch('return { drops: this.dN,', 'return { inkVolumes: this.inkVolumes?.metrics || null, drops: this.dN,', 'telemetry');
  }
  if (rel === 'src/main.js') {
    patch("    await progress(0.85, t('Warming up…'));", "    // Complete the default pack load in the existing warmup phase, before\n    // shader compilation and the first shot.\n    await Promise.all([G.fx.inkVolumeReady, progress(0.85, t('Warming up…'))]);", 'default packs ready before gameplay');
  }
  if (rel === 'src/game/weapons.js') {
    code = "import { captureInkVolume, submitInkVolume } from '../../patches/local-quality/ink-volume/recipes.mjs';\n" + code;
    patch('  _push(p) {', '  _push(p) {\n    captureInkVolume(p, WEAPONS[p.wid] || p.owner?.weapon);', 'snapshot local projectile presentation');
    // Network composition finalizes immutable mode/identity after velocity.
    // Observe the completed native birth instead of classifying midway through
    // its metadata restore. Preserve its result and rejected-packet behavior.
    code += `\nconst _inkVolumeGhostBirth = Projectiles.prototype.ghostProjectile;
Projectiles.prototype.ghostProjectile = function(a, e) {
  const before = this.list.length, result = _inkVolumeGhostBirth.call(this, a, e);
  if (this.list.length > before) {
    const p = this.list[this.list.length - 1];
    captureInkVolume(p, WEAPONS[p.wid] || p.owner?.weapon, e);
  }
  return result;
};\n`;
    patch('  _draw() {\n    let n = 0;', '  _draw() {\n    const volumes = G.fx?.inkVolumes?.isInkVolumes === true ? G.fx.inkVolumes : null;\n    volumes?.begin(G.camera);\n    let n = 0;', 'begin existing projectile render pass');
    patch('      if (p.delay > 0) continue;\n      const sp = p.vel.length();', '      if (p.delay > 0) continue;\n      if (submitInkVolume(volumes, p)) continue;\n      const sp = p.vel.length();', 'replace only registered projectile recipes');
    // Charger flight reserves bounded pooled ink instances ahead of this pass;
    // preserve the same single shared volume flush for either build shape.
    const dropAnchor = code.includes('    n = this.inkFlight.draw(B, shp, n, MAX_BLOBS - reserve);')
      ? '    n = this.inkFlight.draw(B, shp, n, MAX_BLOBS - reserve);'
      : '    n = this.inkFlight.draw(B, shp, n, MAX_BLOBS);';
    patch(dropAnchor, '    volumes?.end();\n' + dropAnchor, 'flush shared frame batches');
  }
  return code;
}
