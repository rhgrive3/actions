// Build-only presentation adapter for Issue #190:
// Paint atlas regenerates the full mip chain after every paint or dry draw.
//
// Decouples and bounds full-chain mipmap regeneration from per-draw quad flushes
// and 20 Hz drying steps, maintaining LinearMipmapLinearFilter anti-aliasing
// quality on presentation without raw inkwave-public mutation or turf/timing alterations.

export const MIP_POLICY = {
  ACTIVE_INTERVAL: 0.10, // ~10 Hz bounded cadence during active splat growth
  DRYING_INTERVAL: 0.25, // ~4 Hz bounded cadence during wetness drying passes
  SETTLE_INTERVAL: 0.05, // settling threshold for stationary ink sync
};

export function shouldRebuildMipmaps({
  dirty = false,
  activeGrowth = false,
  activeDrying = false,
  growthJustEnded = false,
  clock = 0,
  lastMipClock = -999,
  policy = MIP_POLICY,
} = {}) {
  if (!dirty) return false;
  const elapsed = clock - lastMipClock;
  const interval = activeGrowth
    ? (policy.ACTIVE_INTERVAL ?? 0.10)
    : (activeDrying ? (policy.DRYING_INTERVAL ?? 0.25) : (policy.SETTLE_INTERVAL ?? 0.05));
  return elapsed >= interval || growthJustEnded || (!activeGrowth && !activeDrying);
}

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE paint mipmap patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptPaintMipmaps(rel, code) {
  if (rel !== 'src/world/paint.js') return code;

  // 1. In _initGPU: do not set generateMipmaps: true on the render target texture.
  // Instead, start false and track bounded presentation state.
  code = replaceOnce(
    code,
    `    this.rt = new THREE.WebGLRenderTarget(S, S, {\n` +
    `      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,\n` +
    `      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,\n` +
    `      generateMipmaps: true, depthBuffer: false, stencilBuffer: false,\n` +
    `    });`,
    `    this.rt = new THREE.WebGLRenderTarget(S, S, {\n` +
    `      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,\n` +
    `      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,\n` +
    `      generateMipmaps: false, depthBuffer: false, stencilBuffer: false,\n` +
    `    });\n` +
    `    this._lastMipClock = -999;\n` +
    `    this._mipsDirty = false;\n` +
    `    this._mipRequested = false;\n` +
    `    this._wasGrowing = false;\n` +
    `    this._mipRebuildCount = 0;`,
    'render target generateMipmaps false and state initialization'
  );

  // 2. In clear: reset mipmap tracking and sync clear to mips.
  code = replaceOnce(
    code,
    `    this._dryAcc = 0;\n` +
    `    this._wetUntil = this.clock;\n` +
    `    this.version++;`,
    `    this._dryAcc = 0;\n` +
    `    this._wetUntil = this.clock;\n` +
    `    this._lastMipClock = -999;\n` +
    `    this._mipsDirty = false;\n` +
    `    this._mipRequested = false;\n` +
    `    this._wasGrowing = false;\n` +
    `    this._regenerateMipmaps?.();\n` +
    `    this.version++;`,
    'clear mip tracking and sync'
  );

  // 3. In _drawQuads: only trigger Three.js mip generation when _mipRequested is set.
  code = replaceOnce(
    code,
    `    r.autoClear = false;\n` +
    `    r.setRenderTarget(this.rt);\n` +
    `    r.render(this.scene, this.cam);\n` +
    `    r.setRenderTarget(prev);\n` +
    `    r.autoClear = ac;`,
    `    const needMip = !!this._mipRequested;\n` +
    `    if (needMip) {\n` +
    `      this.rt.texture.generateMipmaps = true;\n` +
    `    }\n` +
    `    try {\n` +
    `      r.autoClear = false;\n` +
    `      r.setRenderTarget(this.rt);\n` +
    `      r.render(this.scene, this.cam);\n` +
    `    } finally {\n` +
    `      if (needMip) {\n` +
    `        this.rt.texture.generateMipmaps = false;\n` +
    `        this._mipRequested = false;\n` +
    `        this._lastMipClock = this.clock;\n` +
    `        this._mipsDirty = false;\n` +
    `        this._mipRebuildCount = (this._mipRebuildCount || 0) + 1;\n` +
    `      }\n` +
    `      r.setRenderTarget(prev);\n` +
    `      r.autoClear = ac;\n` +
    `    }`,
    'bounded mip regeneration on render target draw'
  );

  // 4. In flush: evaluate presentation policy and add _regenerateMipmaps helper.
  code = replaceOnce(
    code,
    `    this._drawQuads();\n` +
    `    this.dryMesh.visible = false;\n` +
    `  }\n\n` +
    `  _drawQuads() {`,
    `    const hasDraw = this.quads > 0 || this.dryMesh.visible;\n` +
    `    if (hasDraw) this._mipsDirty = true;\n` +
    `    const activeGrowth = this.growing.length > 0;\n` +
    `    const activeDrying = this.clock < this._wetUntil;\n` +
    `    const elapsed = this.clock - (this._lastMipClock ?? -999);\n` +
    `    const growthJustEnded = !!(this._wasGrowing && !activeGrowth);\n` +
    `    this._wasGrowing = activeGrowth;\n` +
    `    const interval = activeGrowth ? (this.mipPolicy?.activeInterval ?? 0.10) : (activeDrying ? (this.mipPolicy?.dryingInterval ?? 0.25) : 0.05);\n` +
    `    const shouldRebuild = this._mipsDirty && (elapsed >= interval || growthJustEnded || (!activeGrowth && !activeDrying));\n` +
    `    if (shouldRebuild) {\n` +
    `      if (hasDraw) this._mipRequested = true;\n` +
    `    }\n` +
    `    this._drawQuads();\n` +
    `    this.dryMesh.visible = false;\n` +
    `    if (shouldRebuild && !this._mipRequested && this._mipsDirty) {\n` +
    `      this._regenerateMipmaps();\n` +
    `    }\n` +
    `  }\n\n` +
    `  _regenerateMipmaps() {\n` +
    `    const r = this.renderer;\n` +
    `    if (!r || !this.rt) return;\n` +
    `    const tex = this.rt.texture;\n` +
    `    if (!tex) return;\n` +
    `    if (!this._emptyScene) this._emptyScene = new THREE.Scene();\n` +
    `    const prev = r.getRenderTarget();\n` +
    `    const ac = r.autoClear;\n` +
    `    tex.generateMipmaps = true;\n` +
    `    try {\n` +
    `      r.autoClear = false;\n` +
    `      r.setRenderTarget(this.rt);\n` +
    `      r.render(this._emptyScene, this.cam);\n` +
    `    } finally {\n` +
    `      tex.generateMipmaps = false;\n` +
    `      r.setRenderTarget(prev);\n` +
    `      r.autoClear = ac;\n` +
    `    }\n` +
    `    this._lastMipClock = this.clock;\n` +
    `    this._mipsDirty = false;\n` +
    `    this._mipRebuildCount = (this._mipRebuildCount || 0) + 1;\n` +
    `  }\n\n` +
    `  _drawQuads() {`,
    'flush mip policy evaluation and _regenerateMipmaps helper'
  );

  return code;
}

