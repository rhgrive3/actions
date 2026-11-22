// Build-only audit bugfixes, security guards, and GPU resource leak fixes
// applied at the end of source composition. Never edit inkwave-public/ directly.
export function adaptAuditFixes20261122(rel, code, replaceOnce) {
  if (rel === 'src/main.js') {
    code = replaceOnce(
      code,
      'function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v } : { ...def }; } catch { return { ...def }; } }',
      'function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === \'object\' && !Array.isArray(v) ? { ...def, ...v } : { ...def }; } catch { return { ...def }; } }',
      'main loadJSON plain-object guard',
    );
    code = replaceOnce(
      code,
      '    if (this.decor?.bulbMat) this.decor.bulbMat.emissiveIntensity *= 1 + 3.2 * k;',
      '    if (this.decor?.bulbMat) {\n      const bm = this.decor.bulbMat;\n      if (bm.userData._iwBaseEmissive === undefined) bm.userData._iwBaseEmissive = bm.emissiveIntensity;\n      bm.emissiveIntensity = bm.userData._iwBaseEmissive * (1 + 3.2 * k);\n    }',
      'main _applyNight prevent bulbMat emissiveIntensity compounding',
    );
  }

  if (rel === 'src/core/shadowcache.js') {
    code = replaceOnce(
      code,
      '    this.cache?.dispose();',
      '    this.cache?.depthTexture?.dispose();\n    this.cache?.dispose();',
      'shadowcache dispose depthTexture before render target',
    );
  }

  if (rel === 'src/core/gyro.js') {
    code = replaceOnce(
      code,
      '  get needsPermission() {\n    const DOE = window.DeviceOrientationEvent;\n    return !this.granted && !!(DOE && typeof DOE.requestPermission === \'function\');\n  }',
      '  get needsPermission() {\n    const DOE = window.DeviceOrientationEvent, DME = window.DeviceMotionEvent;\n    return !this.granted && !!((DOE && typeof DOE.requestPermission === \'function\') || (DME && typeof DME.requestPermission === \'function\'));\n  }',
      'gyro needsPermission check DeviceMotionEvent too',
    );
    code = replaceOnce(
      code,
      '  resync() { this._hasQ = false; this._rr = null; this._sm.y = this._sm.p = 0; }',
      '  resync() { this._hasQ = false; this._rr = null; this._sm.y = this._sm.p = 0; this.dYaw = this.dPitch = 0; }',
      'gyro resync clear accumulated deltas',
    );
    code = replaceOnce(
      code,
      '    if (this._hasQ) {\n      // the attitude difference is an exact rotation whatever the interval, so a frame hitch never loses aim\n      // (pause / app switch / rotation call resync() explicitly)\n      const dt = dt0;',
      '    if (this._hasQ && dt0 <= 0.25) {\n      // the attitude difference is an exact rotation whatever the interval, so a frame hitch never loses aim\n      // (pause / app switch / rotation call resync() explicitly)\n      const dt = dt0;',
      'gyro _orientation cap dt0 against background resume spikes',
    );
  }

  if (rel === 'src/game/actor.js') {
    code = replaceOnce(
      code,
      `      const d = Math.sqrt(d2);
      const k = (R - d) / Math.max(d, 0.01);
      this.pos.x += dx * k; this.pos.z += dz * k;
      const vn = (this.vel.x * dx + this.vel.z * dz) / Math.max(d, 0.01);
      if (vn < 0) { this.vel.x -= (dx / d) * vn * 1.6; this.vel.z -= (dz / d) * vn * 1.6; }`,
      `      const d = Math.sqrt(d2);
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      const push = R - d;
      this.pos.x += nx * push; this.pos.z += nz * push;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) { this.vel.x -= nx * vn * 1.6; this.vel.z -= nz * vn * 1.6; }`,
      'actor _spawnBarrier avoid NaN when d === 0',
    );
  }

  if (rel === 'src/game/physics.js') {
    code = replaceOnce(
      code,
      `    const bot = lift + radius, top = Math.max(bot, height - radius);
    let axisY, axisLen2;
    for (let it = 0; it < iterations; it++) {
      const ids = this.level.queryBlocks(pos.x - radius - 0.2, pos.z - radius - 0.2, pos.x + radius + 0.2, pos.z + radius + 0.2, this._ids);
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        const b = blocks[ids[i]];
        if (!b.solid || (skipGrates && b.grate)) continue;
        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y + lift > b.aabbMax.y + 0.05 || pos.x + radius < b.aabbMin.x - 0.05 || pos.x - radius > b.aabbMax.x + 0.05 || pos.z + radius < b.aabbMin.z - 0.05 || pos.z - radius > b.aabbMax.z + 0.05) continue;`,
      `    const bot = lift + radius, top = Math.max(bot, height - radius), capTop = Math.max(height, top + radius);
    let axisY, axisLen2;
    for (let it = 0; it < iterations; it++) {
      const ids = this.level.queryBlocks(pos.x - radius - 0.2, pos.z - radius - 0.2, pos.x + radius + 0.2, pos.z + radius + 0.2, this._ids);
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        const b = blocks[ids[i]];
        if (!b.solid || (skipGrates && b.grate)) continue;
        if (pos.y + capTop < b.aabbMin.y - 0.05 || pos.y + lift > b.aabbMax.y + 0.05 || pos.x + radius < b.aabbMin.x - 0.05 || pos.x - radius > b.aabbMax.x + 0.05 || pos.z + radius < b.aabbMin.z - 0.05 || pos.z - radius > b.aabbMax.z + 0.05) continue;`,
      'physics collideBody capTop AABB culling',
    );
    code = replaceOnce(
      code,
      `    const bot = lift + radius, top = Math.max(bot, height - radius);
    const ids = this.level.queryBlocks(pos.x - radius - 0.1, pos.z - radius - 0.1, pos.x + radius + 0.1, pos.z + radius + 0.1, this._ids);
    _a.set(pos.x, pos.y + bot, pos.z); _b.set(pos.x, pos.y + top, pos.z); _ab.copy(_b).sub(_a);
    const abLen2 = Math.max(1e-6, _ab.lengthSq());
    for (let i = 0; i < ids.length; i++) {
      const b = blocks[ids[i]];
      if (!b.solid || (skipGrates && b.grate)) continue;
      if (pos.y + height < b.aabbMin.y || pos.y + lift > b.aabbMax.y || pos.x + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.x || pos.x - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.x || pos.z + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.z || pos.z - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.z) continue;`,
      `    const bot = lift + radius, top = Math.max(bot, height - radius), capTop = Math.max(height, top + radius);
    const ids = this.level.queryBlocks(pos.x - radius - 0.1, pos.z - radius - 0.1, pos.x + radius + 0.1, pos.z + radius + 0.1, this._ids);
    _a.set(pos.x, pos.y + bot, pos.z); _b.set(pos.x, pos.y + top, pos.z); _ab.copy(_b).sub(_a);
    const abLen2 = Math.max(1e-6, _ab.lengthSq());
    for (let i = 0; i < ids.length; i++) {
      const b = blocks[ids[i]];
      if (!b.solid || (skipGrates && b.grate)) continue;
      if (pos.y + capTop < b.aabbMin.y || pos.y + lift > b.aabbMax.y || pos.x + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.x || pos.x - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.x || pos.z + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.z || pos.z - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.z) continue;`,
      'physics bodyFits capTop AABB culling',
    );
  }

  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(
      code,
      '    _v2.copy(this.pivot).addScaledVector(fwd, 10);\n    _v2.y += 0.15;',
      '    _v2.copy(this.pivot).addScaledVector(fwd, 10);\n    _v2.y += 0.15 + this.lensLift.x;',
      'cameraRig _follow keep aim parallel when lensLift raises camera',
    );
  }

  if (rel === 'src/game/weapons.js') {
    code = replaceOnce(
      code,
      '    if (G.boss && direct !== \'boss\' && !(p.vol && p.vol.hits.includes(G.boss))) { p.vol?.hits.push(G.boss); G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || \'slosher\'); }',
      '    if (!p.ghost && G.boss && direct !== \'boss\' && !(p.vol && p.vol.hits.includes(G.boss))) { p.vol?.hits.push(G.boss); G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || \'slosher\'); }',
      'weapons _sloshSplash guard boss splash against ghost projectiles',
    );
  }

  if (rel === 'src/world/paint.js') {
    code = replaceOnce(
      code,
      `    } else if (kind > 6.5) {
      sd = length(p) - r * grow * (1.0 + 0.12 * sin(3.0 * atan(p.y, p.x) + seed * 20.0));
    } else {
      sd = length(p) - r * grow * wob(atan(p.y, p.x), seed);
    }`,
      `    } else if (kind > 6.5) {
      float pAng = abs(p.x) + abs(p.y) > 1e-5 ? atan(p.y, p.x) : 0.0;
      sd = length(p) - r * grow * (1.0 + 0.12 * sin(3.0 * pAng + seed * 20.0));
    } else {
      float pAng = abs(p.x) + abs(p.y) > 1e-5 ? atan(p.y, p.x) : 0.0;
      sd = length(p) - r * grow * wob(pAng, seed);
    }`,
      'paint shader guard atan(0,0)',
    );
    code = replaceOnce(
      code,
      `  sampleWorld(faceId, p) {
    if (faceId < 0) return 0;
    const f = this.level.faces[faceId];
    _rel.copy(p).sub(f.origin);`,
      `  sampleWorld(faceId, p) {
    if (faceId < 0) return 0;
    const f = this.level.faces[faceId];
    if (!f || !f.atlas) return 0;
    _rel.copy(p).sub(f.origin);`,
      'paint sampleWorld guard missing face or atlas',
    );
    code = replaceOnce(
      code,
      '  coverage() {\n    return [this.counts[0] / this.turfTotal, this.counts[1] / this.turfTotal];\n  }',
      '  coverage() {\n    const t = this.turfTotal;\n    return t > 0 ? [this.counts[0] / t, this.counts[1] / t] : [0, 0];\n  }',
      'paint coverage guard zero turfTotal',
    );
  }

  if (rel === 'src/world/environment.js') {
    const rtTypeExpr = '(this.renderer?.capabilities?.isWebGL2 && (this.renderer.extensions?.has?.(\'EXT_color_buffer_half_float\') || this.renderer.extensions?.has?.(\'EXT_color_buffer_float\')) ? THREE.HalfFloatType : THREE.UnsignedByteType)';
    code = replaceOnce(
      code,
      `    this._cloudRT = new THREE.WebGLRenderTarget(CLOUD_W, CLOUD_H, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,`,
      `    this._cloudRT = new THREE.WebGLRenderTarget(CLOUD_W, CLOUD_H, {
      type: ${rtTypeExpr}, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,`,
      'environment _cloudRT half-float fallback',
    );
    code = replaceOnce(
      code,
      `      this._reflRT = new THREE.WebGLRenderTarget(64, 64, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false,`,
      `      this._reflRT = new THREE.WebGLRenderTarget(64, 64, {
        type: ${rtTypeExpr}, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false,`,
      'environment _reflRT half-float fallback',
    );
    code = replaceOnce(
      code,
      `      this._farRT = new THREE.WebGLCubeRenderTarget(farSize, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,`,
      `      this._farRT = new THREE.WebGLCubeRenderTarget(farSize, {
        type: ${rtTypeExpr}, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,`,
      'environment _farRT half-float fallback',
    );
    code = replaceOnce(
      code,
      `  dispose() {
    this.sun.shadow?.dispose();
    this.scene.remove(this.root, this.sun, this.sun.target, this.hemi);`,
      `  dispose() {
    this.sun.shadow?.dispose();
    this.sun.dispose?.();
    this.hemi?.dispose?.();
    this.scene.remove(this.root, this.sun, this.sun.target, this.hemi);`,
      'environment dispose sun and hemi lights',
    );
  }

  if (rel === 'src/world/levelMaterial.js') {
    code = replaceOnce(
      code,
      `    int pid = int(pattern + 0.5);
    bool vertical = abs(vWNorm.y) < 0.5;
    // per-slot remaps: ramp / asphalt / yard sides → concrete, car-deck edge → plating, gelcoat tops → planks
    if (vertical) pid = int(uTLt[pid].z + 0.5); else if (vWNorm.y > 0.5) pid = int(uTLt[pid].w + 0.5);
    vec4 tl = uTL[pid]; vec4 tt = uTLt[pid];`,
      `    int pid = clamp(int(pattern + 0.5), 0, TL_SLOTS - 1);
    bool vertical = abs(vWNorm.y) < 0.5;
    // per-slot remaps: ramp / asphalt / yard sides → concrete, car-deck edge → plating, gelcoat tops → planks
    if (vertical) pid = clamp(int(uTLt[pid].z + 0.5), 0, TL_SLOTS - 1); else if (vWNorm.y > 0.5) pid = clamp(int(uTLt[pid].w + 0.5), 0, TL_SLOTS - 1);
    vec4 tl = uTL[pid]; vec4 tt = uTLt[pid];`,
      'levelMaterial clamp uTL index',
    );
    code = replaceOnce(
      code,
      '    int mi = int(vFaceFlags.z + 0.5);\n    vec4 mA = uMurA[mi], mB = uMurB[mi];',
      '    int mi = clamp(int(vFaceFlags.z + 0.5), 0, 11);\n    vec4 mA = uMurA[mi], mB = uMurB[mi];',
      'levelMaterial clamp uMurA index',
    );
  }

  if (rel === 'src/audio/streamedTrack.js') {
    code = replaceOnce(
      code,
      '  _fail(error) {\n    if (this.failed || this.disposed) return;',
      '  _fail(error) {\n    if (error?.name === \'AbortError\' || this.failed || this.disposed) return;',
      'streamedTrack ignore AbortError in _fail',
    );
  }

  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(
      code,
      '    const t = now();\n    const o = t - d.ts;',
      '    if (!Number.isFinite(d.ts)) return;\n    const t = now();\n    const o = t - d.ts;',
      'netmatch _tick guard finite d.ts',
    );
    code = replaceOnce(
      code,
      `      case 'bm': this.match?.boss?.onMove(e[2]); break;
      case 'bc': { const b = this.match?.boss; if (b && !b.sim) b._crabBurst(e[2], e[3], e[4], e[5], !!e[6]); break; }`,
      `      case 'bm': if (from === this.s.hostId) this.match?.boss?.onMove(e[2]); break;
      case 'bc': { const b = this.match?.boss; if (from === this.s.hostId && b && !b.sim) b._crabBurst(e[2], e[3], e[4], e[5], !!e[6]); break; }`,
      'netmatch require host sender for boss move and crablet burst',
    );
  }

  return code;
}
