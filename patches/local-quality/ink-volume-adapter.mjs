// Compose after existing presentation fixes. Upstream sources and gameplay
// remain intact; exact anchors fail closed when the native contract changes.
export function adaptInkVolumes(rel, code, replaceOnce) {
  const patch = (a, b, why) => { code = replaceOnce(code, a, b, 'ink volume: ' + why); };
  if (rel === 'src/fx/fx.js') {
    code = "import { InkVolumes } from '../../patches/local-quality/ink-volume/runtime.mjs';\nimport { loadVolumePack } from '../../patches/local-quality/ink-volume/pack.mjs';\n" + code;
    patch('    this._sq = new Float32Array(96 * 14); this._sqN = 0;\n  }', `    this._sq = new Float32Array(96 * 14); this._sqN = 0;
    // Deployment-owned, licensed external pack. No automatic asset request unless configured.
    const volumeURL = globalThis.INKWAVE_INK_VOLUME_URL;
    if (typeof volumeURL === 'string' && volumeURL) this.inkVolumeReady = this.loadInkVolume('roller', volumeURL).catch(error => { this.inkVolumeError = String(error); return null; });
  }`, 'optional licensed deployment pack');
    patch('  setCollider(fn) { this.collider = fn; }', `  setCollider(fn) { this.collider = fn; }
  async loadInkVolume(name, url, options) {
    const pack = await loadVolumePack(url, options);
    return this.registerInkVolume(name, pack);
  }
  registerInkVolume(name, pack) {
    if (this._inkVolumeDisposed) throw Error('FX disposed');
    this.inkVolumes ||= new InkVolumes(this.root, this._light, { capacity: Math.round(128 * Math.min(1, this.q)), triangleBudget: Math.round(400000 * Math.min(1, this.q)) });
    return this.inkVolumes.register(name, pack);
  }`, 'shared renderer registration');
    patch('    this.dN = 0; this.dGeo.instanceCount = 0;', '    this.inkVolumes?.clear();\n    this.dN = 0; this.dGeo.instanceCount = 0;', 'match reset');
    patch('  dispose() {\n    this.scene.remove(this.root);', '  dispose() {\n    this._inkVolumeDisposed = true;\n    this.inkVolumes?.dispose();\n    this.scene.remove(this.root);', 'owned resources released before FX traversal');
    patch('return { drops: this.dN,', 'return { inkVolumes: this.inkVolumes?.metrics || null, drops: this.dN,', 'telemetry');
  }
  if (rel === 'src/game/weapons.js') {
    code = "import { captureRollerVolume, submitRollerVolume } from '../../patches/local-quality/ink-volume/roller.mjs';\n" + code;
    patch('  _push(p) {', '  _push(p) {\n    captureRollerVolume(p, WEAPONS[p.wid] || p.owner?.weapon);', 'snapshot local horizontal volley');
    patch('    p.vel.set(vx, vy, vz);', '    p.vel.set(vx, vy, vz);\n    captureRollerVolume(p, WEAPONS[p.wid] || p.owner?.weapon);', 'snapshot replicated volley');
    patch('  _draw() {\n    let n = 0;', '  _draw() {\n    const volumes = G.fx?.inkVolumes?.isInkVolumes === true ? G.fx.inkVolumes : null;\n    volumes?.begin(G.camera);\n    let n = 0;', 'begin existing projectile render pass');
    patch('      if (p.delay > 0) continue;\n      const sp = p.vel.length();', '      if (p.delay > 0) continue;\n      if (submitRollerVolume(volumes, p)) continue;\n      const sp = p.vel.length();', 'replace only registered horizontal heads');
    patch('    n = this.inkFlight.draw(B, shp, n, MAX_BLOBS);', '    volumes?.end();\n    n = this.inkFlight.draw(B, shp, n, MAX_BLOBS);', 'flush shared frame batches');
  }
  return code;
}
