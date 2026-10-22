import { adaptGeometryBuildStorage } from './geometry-build-storage-adapter.mjs';
// Build-time-only allocation and loop-invariant elimination in unconditional frame work.
// Keeps frame cadence, visual output, draw ordering and control flow unchanged.
// Source anchors are protected; unknown upstream revisions fail the build.
export function adaptRuntimeFrameScratch(rel, code, replaceOnce) {
  const patch=(from,to,why)=>{code=replaceOnce(code,from,to,'runtime frame scratch: '+why);};
  if (rel === 'src/main.js') {
    patch("  async _loadLightmap(level, layoutId) {\n    try {\n      const meta = await (await fetch(`assets/lightmaps/${layoutId}.json`, { cache: 'no-cache' })).json();\n      level.layoutLightmap(meta.ppm, meta.size);\n      if (level.layoutHash !== meta.hash) { console.warn(`[inkwave] lightmap for ${layoutId} is stale — re-run tools/bake-ao.mjs`); level.lightSize = 0; for (const f of level.faces) f.light = null; return null; }\n      const tex = await new THREE.TextureLoader().loadAsync(`assets/lightmaps/${layoutId}.png?h=${meta.hash}`);\n      tex.colorSpace = THREE.NoColorSpace;\n      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;\n      tex.anisotropy = 4;\n      return tex;\n    } catch (e) {\n      console.warn('[inkwave] no lightmap for', layoutId, e.message);\n      for (const f of level.faces) f.light = null;\n      return null;\n    }\n  }\n",
      "  async _loadLightmap(level, layoutId) {\n    try {\n      // Retain only validated small metadata on this Game. Active worlds\n      // continue to own and dispose every GPU texture, including on touch.\n      const metadata = this._iwLightmapMetadata || (this._iwLightmapMetadata = new Map());\n      let meta = metadata.get(layoutId), cached = !!meta;\n      // One canonical fetch site also preserves the compiled cache adapter.\n      // Only a stale cached entry gets a second validation pass.\n      for (let attempt = 0; attempt < 2; attempt++) {\n        if (!meta) meta = await (await fetch(`assets/lightmaps/${layoutId}.json`, { cache: 'no-cache' })).json();\n        level.layoutLightmap(meta.ppm, meta.size);\n        if (!cached || level.layoutHash === meta.hash) break;\n        metadata.delete(layoutId); meta = null; cached = false;\n      }\n      if (level.layoutHash !== meta.hash) { console.warn(`[inkwave] lightmap for ${layoutId} is stale — re-run tools/bake-ao.mjs`); level.lightSize = 0; for (const f of level.faces) f.light = null; return null; }\n      metadata.delete(layoutId); metadata.set(layoutId, Object.freeze({ hash: meta.hash, ppm: meta.ppm, size: meta.size }));\n      while (metadata.size > 4) metadata.delete(metadata.keys().next().value);\n      const tex = await new THREE.TextureLoader().loadAsync(`assets/lightmaps/${layoutId}.png?h=${meta.hash}`);\n      tex.colorSpace = THREE.NoColorSpace;\n      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;\n      tex.anisotropy = 4;\n      return tex;\n    } catch (e) {\n      console.warn('[inkwave] no lightmap for', layoutId, e.message);\n      for (const f of level.faces) f.light = null;\n      return null;\n    }\n  }\n", 'reuse verified bounded legacy lightmap metadata with active-world GPU ownership');

    // Previously, a new arrow closure was allocated on *every* rAF callback.
    // Reuse a per-Game callback while dynamically resolving this._loop() each
    // time, so hot swapping and the existing lifecycle still behave the same.
    patch('  _loop() {\n    requestAnimationFrame(() => this._loop());',
      '  _loop() {\n    requestAnimationFrame(this._iwRafCallback || (this._iwRafCallback = () => this._loop()));',
      'one requestAnimationFrame callback per Game');
  }
  if (rel === 'src/world/environment.js') {
    patch('    if (this._envRT) this._envRT.dispose();', `    this._envScene?.traverse(o => { if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const mat of mats) mat.dispose(); } });
    this._cloudScene?.traverse(o => { o.geometry?.dispose(); });
    this._envScene?.clear(); this._cloudScene?.clear();
    if (this._envRT) this._envRT.dispose();`, 'dispose offscreen sky materials and cloud triangle geometry');
    patch('  _renderReflection(renderer, scene, camera) {',
      `  _iwSeaOutsideView(camera) {
    // SEA_VERT adds swell with |.45 sin + .35 sin + .20 sin| <= 1
    // and swellAmp <= .16. Keep .01m and angular margins at the horizon.
    if (!camera?.isPerspectiveCamera || camera.isArrayCamera || !this.sea) return false;
    const sea = this.sea.matrixWorld.elements, world = camera.matrixWorld.elements, projection = camera.projectionMatrix.elements;
    if (sea[1] !== 0 || sea[9] !== 0 || world[3] !== 0 || world[7] !== 0 || world[11] !== 0 || world[15] !== 1 ||
        projection[3] !== 0 || projection[7] !== 0 || projection[11] !== -1 || projection[15] !== 0 ||
        !(world[13] > sea[13] + .17)) return false;
    const scratch = this._iwSeaView || (this._iwSeaView = { inverse: new THREE.Matrix4(), ray: new THREE.Vector3() });
    scratch.inverse.copy(camera.projectionMatrix).invert();
    const ray = scratch.ray;
    for (let corner = 0; corner < 4; corner++) {
      ray.set(corner & 1 ? 1 : -1, corner & 2 ? 1 : -1, .5).applyMatrix4(scratch.inverse).applyMatrix4(camera.matrixWorld);
      ray.x -= world[12]; ray.y -= world[13]; ray.z -= world[14];
      const length = ray.length();
      if (!Number.isFinite(length) || !(ray.y > length * 1e-5)) return false;
    }
    return true;
  }

  _renderReflection(renderer, scene, camera) {`, 'conservative sea wave-envelope visibility predicate');
    patch('    this._reflFrame = this._frameId;',
      '    if (this._iwSeaOutsideView(camera)) return;\n    this._reflFrame = this._frameId;', 'invisible sea cannot consume a frame or trigger a reflection render');
    const seaEnvelope = "const GLSL_SWELL = /* glsl */`\n// long gentle swell; returns height (unit amplitude) and writes gradient\nfloat swell(vec2 p, float t, out vec2 g) {\n  float h = 0.0; g = vec2(0.0);\n  vec2 k; float ph;\n  k = vec2(0.110, 0.047); ph = dot(p, k) + t * 0.95;        h += 0.45 * sin(ph); g += 0.45 * k * cos(ph);\n  k = vec2(-0.052, 0.097); ph = dot(p, k) + t * 1.13 + 1.7; h += 0.35 * sin(ph); g += 0.35 * k * cos(ph);\n  k = vec2(0.173, -0.141); ph = dot(p, k) + t * 1.61 + 4.1; h += 0.20 * sin(ph); g += 0.20 * k * cos(ph);\n  return h;\n}\nfloat swellAmp(float dDeck) { return mix(0.035, 0.16, smoothstep(3.0, 70.0, dDeck)); }\n`;";
    patch(seaEnvelope, seaEnvelope, 'validate the exact swell envelope before rejecting any reflection');
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
  // The same heading angle is used twice per boat/bird (position and
  // orientation). Reuse its trig values inside the same frame and preserve
  // multiplication order, motion cadence, and every uploaded matrix.
  if (rel === 'src/world/environment.js') {
    patch(
      `      const a = s.a + s.w * t;
      const x = Math.cos(a) * s.d, z = Math.sin(a) * s.d;
      const heading = Math.atan2(-Math.sin(a) * Math.sign(s.w), Math.cos(a) * Math.sign(s.w));`,
      `      const a = s.a + s.w * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = ca * s.d, z = sa * s.d;
      const heading = Math.atan2(-sa * Math.sign(s.w), ca * Math.sign(s.w));`,
      'share sailboat heading sine and cosine');
    patch(
      `      const a = g.a0 + g.w * t;
      const x = g.cx + Math.cos(a) * g.r, z = g.cz + Math.sin(a) * g.r;
      const y = g.h + Math.sin(t * 0.4 + g.a0) * 1.5;
      const dir = Math.sign(g.w);
      const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);`,
      `      const a = g.a0 + g.w * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = g.cx + ca * g.r, z = g.cz + sa * g.r;
      const y = g.h + Math.sin(t * 0.4 + g.a0) * 1.5;
      const dir = Math.sign(g.w);
      const yaw = Math.atan2(-sa * dir, ca * dir);`,
      'share gull heading sine and cosine');
  }
  if (rel === 'src/ui/hud.js') {
    // The live minimap's two display sizes previously created a new fit()
    // closure and two temporary arrays every HUD update. Same scalars and
    // arithmetic order, no changes to the displayed box or touch layout.
    patch(
      '    const fit = (sz) => (asp >= 1 ? [sz, sz / asp] : [sz * asp, sz]);\n    const [w0, h0] = fit(14.5 * u), [w1, h1] = fit(Math.min(H * 0.78, W * 0.6));',
      `    const small = 14.5 * u, large = Math.min(H * 0.78, W * 0.6);
    const w0 = asp >= 1 ? small : small * asp, h0 = asp >= 1 ? small / asp : small;
    const w1 = asp >= 1 ? large : large * asp, h1 = asp >= 1 ? large / asp : large;`,
      'avoid per-HUD-frame fit closure and two arrays');
    // Squad fallbacks ask for team-indexed actors. Use a stable direct scan
    // for ordinary integer indices, retaining the original Array.filter
    // semantics for unusual property keys, so external/debug callers agree.
    patch(
      '    const list = this._actors().filter((a) => a.team === team);\n    return list[i] || null;',
      `    const actors = this._actors();
    if (!Number.isInteger(i) || i < 0) return actors.filter((a) => a.team === team)[i] || null;
    let seen = 0;
    for (let j = 0; j < actors.length; j++) {
      if (!(j in actors)) continue;
      const a = actors[j];
      if (a.team === team && seen++ === i) return a;
    }
    return null;`,
      'scan squad fallback without allocating a filtered actor list');
  }

  if (rel === 'src/game/character.js') {
    // The zero-force fixed point is invariant for ordinary finite time steps.
    patch(
      `function spr(S, i, target, hz, zeta, dt) {
  const w = TAU * hz, k = w * w, c = 2 * zeta * w;
  let x = S[i], v = S[i + 1];`,
      `function spr(S, i, target, hz, zeta, dt) {
  let x = S[i], v = S[i + 1];
  if (x === target && v === 0 && Number.isFinite(dt) && Number.isFinite(hz) && Number.isFinite(zeta)) return x;
  const w = TAU * hz, k = w * w, c = 2 * zeta * w;`,
      'short-circuit settled Euler spring');
    patch(
      `function sprA(S, i, target, hz, zeta, dt) {
  const w = TAU * hz, x0 = S[i] - target, v0 = S[i + 1];`,
      `function sprA(S, i, target, hz, zeta, dt) {
  const x0 = S[i] - target, v0 = S[i + 1];
  if (x0 === 0 && v0 === 0 && Number.isFinite(dt) && Number.isFinite(hz) && Number.isFinite(zeta)) return S[i];
  const w = TAU * hz;`,
      'short-circuit settled analytic spring');
    patch(
      `      const breeze = HBR * (0.03 * Math.sin(t * 1.7 + si * 1.3) + 0.012 * Math.sin(t * 4.3 + si * 2.1));
      for (let k = 0; k < HAIR_SEGS; k++) {
        const i = (si * HAIR_SEGS + k) * 3;
        const gain = k === 0 ? GAIN : k === 1 ? GAIN1 : GAIN2;
        const ine = (k === 0 ? 0.55 : k === 1 ? 0.3 : 0.15) * clamp(1.2 - m.K * 0.3, 0.3, 1) * HINE;
        hx[i] -= rx * ine; hx[i + 1] -= ry * ine * 0.5; hx[i + 2] -= rz * ine;
        const K = 170 * HK * m.K * (k === 0 ? 1 : k === 1 ? 0.75 : 0.55) / clamp(m.len / 0.22, 0.6, 1.6); const D = 2 * HZ * Math.sqrt(K);
        let gx = tx * gain + breeze * 0.3, gy = ty * gain, gz = tz * gain + breeze * 0.5;
        const j = (si * (HAIR_SEGS + 1) + k) * 3;
        if (idleL > 0.01) {
          const w = idleL * 0.03 * Math.sin(wv - 0.6 * k + this.hairPh[si]) * clamp(1.6 - m.K * 0.4, 0.3, 1);`,
      `      const breeze = HBR * (0.03 * Math.sin(t * 1.7 + si * 1.3) + 0.012 * Math.sin(t * 4.3 + si * 2.1));
      const ineClamp = clamp(1.2 - m.K * 0.3, 0.3, 1), lenRatio = clamp(m.len / 0.22, 0.6, 1.6);
      const kBase = 170 * HK * m.K, idleClamp = clamp(1.6 - m.K * 0.4, 0.3, 1), phaseSi = this.hairPh[si];
      for (let k = 0; k < HAIR_SEGS; k++) {
        const i = (si * HAIR_SEGS + k) * 3;
        const gain = k === 0 ? GAIN : k === 1 ? GAIN1 : GAIN2;
        const ine = (k === 0 ? 0.55 : k === 1 ? 0.3 : 0.15) * ineClamp * HINE;
        hx[i] -= rx * ine; hx[i + 1] -= ry * ine * 0.5; hx[i + 2] -= rz * ine;
        const K = kBase * (k === 0 ? 1 : k === 1 ? 0.75 : 0.55) / lenRatio; const D = 2 * HZ * Math.sqrt(K);
        let gx = tx * gain + breeze * 0.3, gy = ty * gain, gz = tz * gain + breeze * 0.5;
        const j = (si * (HAIR_SEGS + 1) + k) * 3;
        if (idleL > 0.01) {
          const w = idleL * 0.03 * Math.sin(wv - 0.6 * k + phaseSi) * idleClamp;`,
      'hoist hair strand invariants');
    patch(
      `        const K = 95 * 0.7 * m.K / clamp(m.len / 0.22, 0.6, 1.6), D = 2 * 0.24 * Math.sqrt(K);
        const jt = (si * (HAIR_SEGS + 1) + HAIR_SEGS) * 3, coil = idleL * 0.08 * Math.sin(wv * 0.95 + this.hairPh[si] * 1.7 - 1.8);`,
      `        const K = 95 * 0.7 * m.K / lenRatio, D = 2 * 0.24 * Math.sqrt(K);
        const jt = (si * (HAIR_SEGS + 1) + HAIR_SEGS) * 3, coil = idleL * 0.08 * Math.sin(wv * 0.95 + phaseSi * 1.7 - 1.8);`,
      'reuse tip length ratio and phase');
    patch('export class Character {', 'const IW_HAIR_COEFFS = new WeakMap(), IW_RIM_WORLD = new WeakMap(), IW_RIM_NEUTRAL = {};\nexport class Character {', 'strand metadata owns shared immutable spring coefficients');
    patch(`      const m = this.hairMeta[si];
      const ux = m.dir.x, uy = m.dir.y, uz = m.dir.z;`,
      `      const m = this.hairMeta[si];
      let coefficients = IW_HAIR_COEFFS.get(m);
      if (!coefficients || !Object.is(coefficients.rawK, m.K) || !Object.is(coefficients.rawLen, m.len) || !Object.is(coefficients.rawG, m.G)) {
        const lenRatio = clamp(m.len / 0.22, 0.6, 1.6), kBase = 170 * HK * m.K;
        const stiffness = [kBase * 1 / lenRatio, kBase * 0.75 / lenRatio, kBase * 0.55 / lenRatio];
        const tipK = 95 * 0.7 * m.K / lenRatio;
        coefficients = { rawK: m.K, rawLen: m.len, rawG: m.G, stiffness,
          damping: stiffness.map(K => 2 * HZ * Math.sqrt(K)), tipK, tipD: 2 * 0.24 * Math.sqrt(tipK),
          gk: (m.G * 0.075 * HGK) * clamp(m.len / 0.22, 0.4, 1.6),
          ineClamp: clamp(1.2 - m.K * 0.3, 0.3, 1), idleClamp: clamp(1.6 - m.K * 0.4, 0.3, 1) };
        IW_HAIR_COEFFS.set(m, coefficients);
      }
      const ux = m.dir.x, uy = m.dir.y, uz = m.dir.z;`, 'invalidate legacy hair coefficients on metadata edits');
    patch('      const gk = (m.G * 0.075 * HGK) * clamp(m.len / 0.22, 0.4, 1.6);',
      '      const gk = coefficients.gk;', 'reuse static strand gravity coefficient');
    patch(`      const ineClamp = clamp(1.2 - m.K * 0.3, 0.3, 1), lenRatio = clamp(m.len / 0.22, 0.6, 1.6);
      const kBase = 170 * HK * m.K, idleClamp = clamp(1.6 - m.K * 0.4, 0.3, 1), phaseSi = this.hairPh[si];`,
      '      const {ineClamp, idleClamp} = coefficients, phaseSi = this.hairPh[si];', 'reuse metadata clamp coefficients');
    patch('        const K = kBase * (k === 0 ? 1 : k === 1 ? 0.75 : 0.55) / lenRatio; const D = 2 * HZ * Math.sqrt(K);',
      '        const K = coefficients.stiffness[k], D = coefficients.damping[k];', 'reuse segment stiffness and damping');
    patch('        const K = 95 * 0.7 * m.K / lenRatio, D = 2 * 0.24 * Math.sqrt(K);',
      '        const K = coefficients.tipK, D = coefficients.tipD;', 'reuse curled tip stiffness and damping');
    patch('    const sky = this.inWorld ? skyColors() : null;\n    R.set(0, 0, 0, 3); Fl.setRGB(0, 0, 0);',
      `    const sky = this.inWorld ? skyColors() : null;
    const camera = sky && G.camera;
    let cache = camera ? IW_RIM_WORLD.get(camera) : IW_RIM_NEUTRAL;
    if (!cache) { cache = {}; IW_RIM_WORLD.set(camera, cache); }
    const keys = cache.keys || (cache.keys = []);
    const v0 = k, v1 = kf, v2 = sky?.sunIntensity, v3 = sky?.night, v4 = sky?.horizon?.r, v5 = sky?.horizon?.g, v6 = sky?.horizon?.b, v7 = sky?.sun?.r, v8 = sky?.sun?.g, v9 = sky?.sun?.b, v10 = sky?.sunDir?.x, v11 = sky?.sunDir?.y, v12 = sky?.sunDir?.z;
    let same = cache.valid && Object.is(keys[0], v0) && Object.is(keys[1], v1) && Object.is(keys[2], v2) && Object.is(keys[3], v3) && Object.is(keys[4], v4) && Object.is(keys[5], v5) && Object.is(keys[6], v6) && Object.is(keys[7], v7) && Object.is(keys[8], v8) && Object.is(keys[9], v9) && Object.is(keys[10], v10) && Object.is(keys[11], v11) && Object.is(keys[12], v12);
    const inverse = camera && k > 0 ? camera.matrixWorldInverse.elements : null;
    if (same && inverse) for (let i = 0; i < 16; i++) if (!Object.is(cache.matrix[i], inverse[i])) { same = false; break; }
    if (same) { R.copy(cache.rim); Fl.copy(cache.fill); if (cache.direction) Ld.copy(cache.sunDirection); return; }
    R.set(0, 0, 0, 3); Fl.setRGB(0, 0, 0);`, 'reuse derived rim inputs across characters while observing every live scalar and inverse matrix');
    patch(`    } else if (k > 0) { R.set(0.06 * k, 0.065 * k, 0.075 * k, 3.4); Ld.set(0.3, 0.6, -0.75).normalize(); }
  }

  // ---------------------------------------------------------------------------------------------
  _updateMaterials(dt, s) {`,
      `    } else if (k > 0) { R.set(0.06 * k, 0.065 * k, 0.075 * k, 3.4); Ld.set(0.3, 0.6, -0.75).normalize(); }
    keys[0] = v0; keys[1] = v1; keys[2] = v2; keys[3] = v3; keys[4] = v4; keys[5] = v5; keys[6] = v6; keys[7] = v7; keys[8] = v8; keys[9] = v9; keys[10] = v10; keys[11] = v11; keys[12] = v12;
    if (inverse) { const matrix = cache.matrix || (cache.matrix = new Float64Array(16)); matrix.set(inverse); }
    (cache.rim || (cache.rim = new THREE.Vector4())).copy(R);
    (cache.fill || (cache.fill = new THREE.Color())).copy(Fl);
    cache.direction = k > 0;
    if (cache.direction) (cache.sunDirection || (cache.sunDirection = new THREE.Vector3())).copy(Ld);
    cache.valid = true;
  }

  // ---------------------------------------------------------------------------------------------
  _updateMaterials(dt, s) {`, 'copy cached lighting into character-owned uniforms without retaining characters');
    // kid scale/quaternion/position are authored together before face and hair.
    patch(
      '    this.kid.position.y += this.kidLift;\n    // inverse kid transform (root space → kid space)',
      '    this.kid.position.y += this.kidLift;\n    this.kid.updateMatrix();\n    // inverse kid transform (root space → kid space)',
      'compose local kid matrix after pose transform');
    patch(
      '    if (A.on) {\n      this.kid.updateMatrix();',
      '    if (A.on) {',
      'reuse matrix for face');
    patch(
      '    this.model.updateWorldMatrix(true, false);\n    this.kid.updateMatrix(); this.kid.matrixWorld.multiplyMatrices(this.model.matrixWorld, this.kid.matrix);',
      '    this.model.updateWorldMatrix(true, false);\n    this.kid.matrixWorld.multiplyMatrices(this.model.matrixWorld, this.kid.matrix);',
      'reuse matrix for hair');
    patch(
      '    this._headQW.copy(B.head.quaternion); this._headSet = true;\n    // ---- remember where the feet actually are (world) for seamless replanting after air / dances\n    this.kid.updateMatrix();',
      '    this._headQW.copy(B.head.quaternion); this._headSet = true;\n    // ---- remember where the feet actually are (world) for seamless replanting after air / dances',
      'reuse matrix for foot projection');
  }
  if (rel === 'src/game/motion/source-controller.js') {
    patch("import * as THREE from 'three';", "import {initMotionDiagnostics,motionDebug,manualMotionDebug,motionDebugScalar,motionDebugBody,motionDebugSquid} from '../../../patches/local-quality/motion-diagnostics.mjs';\nimport * as THREE from 'three';", "lazy detached motion diagnostics 0");
    patch("this.fallbacks=new Set();", "this.fallbacks=initMotionDiagnostics(this);", "lazy detached motion diagnostics 1");
    patch("this.manual=null;this.debug={};this.loadToken=0;", "this.manual=null;this.loadToken=0;", "lazy detached motion diagnostics 2");
    patch("  this.debug={status:this.status,variant:this.variant,state,family,speed:this.speed,pivoting:this.pivoting,pivotTurnRate:this.turnRate,phase:this.phase,stride,stepAmplitude,cadenceHz,authoredCadenceHz:nominalCadence,run,shootBlend:this.shootBlend,sourceUpper:this.sourceUpper,clips:this.currentClips,contact:[...this.contact],fallbacks:[...this.fallbacks]};", "  motionDebug(this,state,family,stride,stepAmplitude,cadenceHz,nominalCadence,run);", "lazy detached motion diagnostics 3");
    patch("this.debug={status:this.status,state:this.state,variant:this.variant,clips:this.currentClips};", "manualMotionDebug(this);", "lazy detached motion diagnostics 4");
    patch("this.debug.fallback='native modern dodge/special action';", "motionDebugScalar(this,'fallback','native modern dodge/special action');", "lazy detached motion diagnostics 5");
    patch("this.debug.groundMode=this.pivoting?'pivot-free':this.turnGroundDisable?'turn-free':groundEnabled?'plant':'air-free';", "motionDebugScalar(this,'groundMode',this.pivoting?'pivot-free':this.turnGroundDisable?'turn-free':groundEnabled?'plant':'air-free');", "lazy detached motion diagnostics 6");
    patch("this.debug.bodyBalance={enabled:balanceActive,reachCorrection:this.bodyBalance.reachCorrection};", "motionDebugBody(this,balanceActive,this.bodyBalance.reachCorrection);", "lazy detached motion diagnostics 7");
    patch("this.debug.gripFitMeters=this.fitR.distanceTo(this.handP);", "motionDebugScalar(this,'gripFitMeters',this.fitR.distanceTo(this.handP));", "lazy detached motion diagnostics 8");
    patch("this.debug.squid={name,frame};", "motionDebugSquid(this,name,frame);", "lazy detached motion diagnostics 9");

    patch('  const timing=motionCadence({speed:this.speed,walkSpeed:this.walkSpeed,runSpeed:this.runSpeed,runWeight:run,nominalHz:nominalCadence,stride});',
      '  const cadenceArg=this._iwCadenceArg||(this._iwCadenceArg={}),cadenceOut=this._iwCadenceOut||(this._iwCadenceOut={});\n  cadenceArg.speed=this.speed;cadenceArg.walkSpeed=this.walkSpeed;cadenceArg.runSpeed=this.runSpeed;cadenceArg.runWeight=run;cadenceArg.nominalHz=nominalCadence;cadenceArg.stride=stride;\n  const timing=motionCadence(cadenceArg,cadenceOut);',
      'own cadence input and result records per motion controller');
    patch('  else if(moving){',
      '  else if(moving){\n   const contactArg=this._iwContactArg||(this._iwContactArg={speed:0,cadenceHz:0,legReach:0});\n   contactArg.speed=this.speed;contactArg.cadenceHz=cadenceHz;contactArg.legReach=this.character.limbs.legL.a+this.character.limbs.legL.b;',
      'own one read-only foot-contact argument per controller');
    patch('feasibleContact(p,i,normalizedFrame,{speed:this.speed,cadenceHz,legReach:this.character.limbs.legL.a+this.character.limbs.legL.b})',
      'feasibleContact(p,i,normalizedFrame,contactArg)', 'reuse one contact window descriptor for both feet');
    patch(
      ` directionClips(family,shooting,run){
  const mode=run?'Run':'Walk',suffix=shooting?'Shoot':'Hold';
  return SIDES.map((side,index)=>{
   const exact=\`\${mode}\${side}\${suffix}_\${family}\`;
   if(this.bank.clips.has(exact))return {name:exact,sourceDirection:side,rot:0};
   const generic=\`\${mode}\${side}\${suffix}_Nrml\`;
   // Missing directional family: use the observed full-body direction with a sourced weapon upper-body layer.
   if(this.bank.clips.has(generic)){this.fallbacks.add(exact+' -> '+generic);return{name:generic,sourceDirection:side,rot:0};}
   const walk=\`Walk\${side}\${suffix}_\${family}\`;
   if(this.bank.clips.has(walk))return{name:walk,sourceDirection:side,rot:0};
   const final=this.choose([\`Walk\${side}Hold_Nrml\`,'WalkHold_Nrml']);this.fallbacks.add(exact+' -> '+final);return{name:final,sourceDirection:side,rot:0};
  });
 }`,
      ` directionClips(family,shooting,run){
  const key=\`\${family}:\${shooting?1:0}:\${run?1:0}\`;
  let cache=this._dirClipsCache;
  if(!cache||this._dirClipsBank!==this.bank){this._dirClipsCache=cache=new Map();this._dirClipsBank=this.bank;}
  const cached=cache.get(key);if(cached)return cached;
  const mode=run?'Run':'Walk',suffix=shooting?'Shoot':'Hold';
  const resolved=SIDES.map((side,index)=>{
   const exact=\`\${mode}\${side}\${suffix}_\${family}\`;
   if(this.bank.clips.has(exact))return {name:exact,sourceDirection:side,rot:0};
   const generic=\`\${mode}\${side}\${suffix}_Nrml\`;
   // Missing directional family: use the observed full-body direction with a sourced weapon upper-body layer.
   if(this.bank.clips.has(generic)){this.fallbacks.add(exact+' -> '+generic);return{name:generic,sourceDirection:side,rot:0};}
   const walk=\`Walk\${side}\${suffix}_\${family}\`;
   if(this.bank.clips.has(walk))return{name:walk,sourceDirection:side,rot:0};
   const final=this.choose([\`Walk\${side}Hold_Nrml\`,'WalkHold_Nrml']);this.fallbacks.add(exact+' -> '+final);return{name:final,sourceDirection:side,rot:0};
  });
  cache.set(key,resolved);return resolved;
 }`,
      'cache directional motion clips by bank and family');
    patch(
      `  this.directionTarget.set(this.pivoting?
   (this.turnRate>=0?[0,0,1,0]:[0,0,0,1]):
   [Math.max(0,this.localZ),Math.max(0,-this.localZ),Math.max(0,this.localX),Math.max(0,-this.localX)]);
  let sum=this.directionTarget.reduce((a,b)=>a+b,0);if(sum<1e-10){this.directionTarget.set([1,0,0,0]);sum=1;}`,
      `  if(this.pivoting){this.directionTarget[0]=0;this.directionTarget[1]=0;this.directionTarget[2]=this.turnRate>=0?1:0;this.directionTarget[3]=this.turnRate>=0?0:1;}
  else{this.directionTarget[0]=Math.max(0,this.localZ);this.directionTarget[1]=Math.max(0,-this.localZ);this.directionTarget[2]=Math.max(0,this.localX);this.directionTarget[3]=Math.max(0,-this.localX);}
  let sum=this.directionTarget[0]+this.directionTarget[1]+this.directionTarget[2]+this.directionTarget[3];if(sum<1e-10){this.directionTarget[0]=1;this.directionTarget[1]=0;this.directionTarget[2]=0;this.directionTarget[3]=0;sum=1;}`,
      'populate directional target without arrays');
  }
  if (rel === 'src/game/player.js') {
    const mapPickLegacy = '      const pick = (i) => { const o = allies[i]; if (o && o.alive && !o.superJumpState) a.superJump(o); };';
    const chain = code.includes('if (o && o.alive && (!o.superJumpState || hasCommittedSuperJumpDestination(o)))');
    const eligible = chain ? '(!o.superJumpState || hasCommittedSuperJumpDestination(o))' : '!o.superJumpState';
    const mapPickCue = `      const pick = (i) => {
      const o = allies[i];
      if (o && o.alive && ${eligible}) {
        const ticket = a.selectSuperJumpTarget?.(o);
        a.superJump(o, ticket);
      }
    };`;
    const cue = code.includes(mapPickCue);
    patch('export class PlayerController {', `function iwPickMapAlly(controller, index) {
  const a = controller.a;
  let allies = controller._iwMapAllies;
  if (!controller._iwMapAlliesReady) {
    if (!allies) allies = controller._iwMapAllies = [];
    allies.length = 0;
    // Array.filter skips holes and captures the initial source length.
    const actors = G.actors, count = actors.length;
    for (let j = 0; j < count; j++) if (j in actors) { const o = actors[j]; if (o.team === a.team && o !== a) allies.push(o); }
    controller._iwMapAlliesReady = true;
  }
  const o = allies[index];
  if (o && o.alive && ${eligible}) { ${cue ? 'const ticket = a.selectSuperJumpTarget?.(o); a.superJump(o, ticket);' : 'a.superJump(o);'} }
}
export class PlayerController {`, 'one shared map target picker with controller-owned scratch');
    patch('      const allies = G.actors.filter((o) => o.team === a.team && o !== a);\n' + (cue ? mapPickCue : mapPickLegacy),
      `      this._iwMapAlliesReady = false;
      try {`, 'defer ally snapshot until a jump target is requested');
    for (let i=0;i<3;i++) patch('pick('+i+');','iwPickMapAlly(this, '+i+');','reuse map teammate picker '+i);
    patch('    }\n\n    // ---- aim point from the camera centre ray',
      '      } finally { if (this._iwMapAllies) this._iwMapAllies.length = 0; this._iwMapAlliesReady = false; }\n    }\n\n    // ---- aim point from the camera centre ray', 'drop teammate references even when a jump fails');
  }
  if (rel === 'src/game/motion/cadence-control.js') {
    patch('export function motionCadence({speed, walkSpeed, runSpeed, runWeight, nominalHz, stride}) {',
      'export function motionCadence({speed, walkSpeed, runSpeed, runWeight, nominalHz, stride}, out = {}) {',
      'retain cadence public API with optional caller-owned result');
    patch(' return {cadenceHz,stepAmplitude,referenceSpeed,authoredHz};',
      ' out.cadenceHz=cadenceHz;out.stepAmplitude=stepAmplitude;out.referenceSpeed=referenceSpeed;out.authoredHz=authoredHz;return out;',
      'write cadence scalars without replacing a caller-owned record');
  }

  if (rel === 'src/world/level.js') {
    // Three's setIndex(array) already selects uint16 when all indices fit.
    // Release each temporary JS vertex array as soon as its typed attribute
    // exists, avoiding retaining every JS array through the final copies.
    patch(`    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(B.puv, 2));
    g.setAttribute('lightUv', new THREE.Float32BufferAttribute(B.luv, 2));
    g.setAttribute('faceUv', new THREE.Float32BufferAttribute(B.fuv, 2));
    g.setAttribute('faceData', new THREE.Float32BufferAttribute(B.fdat, 4));
    g.setAttribute('faceFlags', new THREE.Float32BufferAttribute(B.fflag, 3));
    g.setAttribute('faceTan', new THREE.Float32BufferAttribute(B.ftan, 3));
    g.setIndex(B.idx);
    g.computeBoundingSphere();
    this.renderTris = B.idx.length / 3;
    return g;`,
      `    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); B.pos = null;
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3)); B.nor = null;
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); B.col = null;
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(B.puv, 2)); B.puv = null;
    g.setAttribute('lightUv', new THREE.Float32BufferAttribute(B.luv, 2)); B.luv = null;
    g.setAttribute('faceUv', new THREE.Float32BufferAttribute(B.fuv, 2)); B.fuv = null;
    g.setAttribute('faceData', new THREE.Float32BufferAttribute(B.fdat, 4)); B.fdat = null;
    g.setAttribute('faceFlags', new THREE.Float32BufferAttribute(B.fflag, 3)); B.fflag = null;
    g.setAttribute('faceTan', new THREE.Float32BufferAttribute(B.ftan, 3)); B.ftan = null;
    g.setIndex(B.idx);
    g.computeBoundingSphere();
    this.renderTris = B.idx.length / 3;
    B.idx = null;
    return g;`,
      'release stage-build number arrays as typed GPU attributes are created');
  }
  if (rel === 'src/world/paint.js') {
    // Only skip the 10-ray evaluation when its entire footprint is strictly
    // outside the pixel. Max body wobble <=1.588r, ray reach <=.57r,
    // lateral offset <=.0513r, bead <=max(.072r,1.35tx);
    // smooth union adds at most .06r. 2.55r+2tx is conservative.
    // Never skip satellite, spatter or wall-drip computations here.
    patch(
      `    float tsp = 1.0 - pow(1.0 - clamp(tn * 1.4, 0.0, 1.0), 3.0);
    for (int k = 0; k < 10; k++) {`,
      `    if (ks.x > 0.0 && length(p) <= r * 2.55 + tx * 2.0) {
      float tsp = 1.0 - pow(1.0 - clamp(tn * 1.4, 0.0, 1.0), 3.0);
      for (int k = 0; k < 10; k++) {`,
      'conservative ray-only GPU culling retaining far ink');
    patch(
      `      sd = smin(sd, ray, r * 0.06);
    }
    // ---- satellite droplets`,
      `      sd = smin(sd, ray, r * 0.06);
      }
    }
    // ---- satellite droplets`,
      'close ray-only culling without masking satellite or wall ink');
  }
  if (rel === 'src/game/character.js') {
    // Preserve nonfinite diagnostic time propagation and signed zero products.
    patch('    const pul = 0.5 + 0.5 * Math.sin(t * TAU * 1.6);',
      '    const pul = this.wGlow === 0 && Number.isFinite(t * TAU * 1.6) ? 0.5 : 0.5 + 0.5 * Math.sin(t * TAU * 1.6);',
      'skip special pulse only at exact zero weight');
    patch('    const blink = this.wLow * (0.5 + 0.5 * Math.sin(t * TAU * 3.2));',
      '    const blink = this.wLow * (this.wLow === 0 && Number.isFinite(t * TAU * 3.2) ? 0.5 : 0.5 + 0.5 * Math.sin(t * TAU * 3.2));',
      'skip low-ink pulse only at exact zero weight');
    patch("      const grp = new THREE.Group(); grp.name = 'warm';",
      "      const grp = new THREE.Group(); grp.name = 'warm';\n      const vis = [];\n      try {",
      'protect warm-only character meshes from synchronous failures');
    patch('      const vis = [];\n      this.root.traverse', '      this.root.traverse', 'keep warm visibility snapshot in cleanup scope');
    patch('      this.kid.remove(grp);\n      await p;\n      return q;',
      '      this.kid.remove(grp);\n      vis.length = 0; grp.clear();\n      await p;\n      return q;\n      } finally {\n        for (let i = 0; i < vis.length; i += 2) vis[i].visible = vis[i + 1];\n        this.kid.remove(grp); grp.clear();\n      }',
      'retire warm meshes and restore visibility on every failure path');
  }
  if (rel === 'src/game/motion/source-controller.js') {
    patch("   const prefix=c.dance==='victory'?'Win':'Lose';const name=this.choose([`${prefix}_${family}`,`${prefix}_Nrml`,...Array.from(this.bank.clips.keys()).filter(k=>k.startsWith(prefix))]);special={name,frame:c.danceT*HOST_MOTION.fps};state=c.dance;",
      `   const prefix=c.dance==='victory'?'Win':'Lose';
   let dances=this._iwDanceClips;
   if(!dances||this._iwDanceBank!==this.bank){this._iwDanceBank=this.bank;this._iwDanceClips=dances=new Map();}
   const danceKey=prefix+':'+family;let name=dances.get(danceKey);
   if(name===undefined){name=this.choose([\`\${prefix}_\${family}\`,\`\${prefix}_Nrml\`,...Array.from(this.bank.clips.keys()).filter(k=>k.startsWith(prefix))]);dances.set(danceKey,name);}
   special={name,frame:c.danceT*HOST_MOTION.fps};state=c.dance;`,
      'resolve result clip once per source bank and weapon family');
  }
  if (rel === 'src/game/motion/hair-targets.js') {
    patch('  this.bank=bank;this.indices=bank.bones.map((b,i)=>/^Hair/.test(b.name)?i:-1).filter(i=>i>=0);',
      '  this.bank=bank;let metadata=bank._iwHairTargetMetadata;\n  if(!metadata){const indices=bank.bones.map((b,i)=>/^Hair/.test(b.name)?i:-1).filter(i=>i>=0);\n   const entries=indices.map(i=>({i,child:bank.bones.findIndex(b=>b.parent===i&&/^Hair/.test(b.name)),restAxis:bank.rest.wp[i].clone().sub(bank.rest.wp[bank.bones[i].parent]).applyQuaternion(bank.rest.wq[i].clone().invert()).normalize()}));\n   metadata=bank._iwHairTargetMetadata={indices,entries};}\n  this.indices=metadata.indices;',
      'share bank-owned immutable hair target indices and rest axes');
    patch('  this.entries=this.indices.map(i=>({i,child:bank.bones.findIndex(b=>b.parent===i&&/^Hair/.test(b.name)),restAxis:bank.rest.wp[i].clone().sub(bank.rest.wp[bank.bones[i].parent]).applyQuaternion(bank.rest.wq[i].clone().invert()).normalize()}));',
      '  this.entries=metadata.entries;', 'retain independent poses while sharing static hair metadata');
  }
  if (rel === 'src/game/motion/squid-rig.js') {
    patch('  sq.eyes.scale.set(1,1,1);sq.eyes.position.set(0,0,0);this.root.updateWorldMatrix(true,true);this.skeleton.update();',
      '  sq.eyes.scale.set(1,1,1);sq.eyes.position.set(0,0,0);this.root.updateWorldMatrix(true,true);',
      'renderer owns source squid matrix palette upload after the final pose');
    // Structural swaps call refreshGeometry from Character._setTier. Hidden
    // remote eyes have no rendered consumer; deform before their first reveal.
    patch('  this.refreshGeometry();\n  sq.pivot.position.set(0,0.165,0);',
      "  if(!((form==='swim'||form==='climb')&&!c.isLocal))this.deformEyes();\n  sq.pivot.position.set(0,0.165,0);",
      'separate structural squid refresh from visible per-tick eye deformation');
  }
  if (rel === 'src/game/character-geo.js') {
    patch('const sqR = (y) => interpTable(SQ_PROF.map((p) => p[1]), SQ_PROF.map((p) => p[0]), y);',
      'const SQ_Y = SQ_PROF.map((p) => p[1]), SQ_R = SQ_PROF.map((p) => p[0]);\nconst sqR = (y) => interpTable(SQ_Y, SQ_R, y);',
      'retain immutable squid mantle interpolation tables');
  }
  if (rel === 'src/game/character-hair.js') {
    patch('  offset(t, th, scale = 1, sec = null) {',
      '  offset(t, th, scale = 1, sec = null) { return this.offsetInto(t, th, scale, sec, []); }\n  offsetInto(t, th, scale = 1, sec = null, out = []) {',
      'retain public offset API with caller-owned tube output');
    patch('    return [xo * ct - xb * st, xo * st + xb * ct, Math.abs(c) * s0.r * s0.flat * scale];',
      '    out[0] = xo * ct - xb * st; out[1] = xo * st + xb * ct; out[2] = Math.abs(c) * s0.r * s0.flat * scale; return out;',
      'write tube offset without a result tuple per vertex');
    patch('  const P = new V3(), T = new V3(), O = new V3(), B = new V3();\n  const ring =',
      '  const P = new V3(), T = new V3(), O = new V3(), B = new V3(), offset = [0, 0, 0];\n  const ring =',
      'own offset output within one tube build');
    patch('      const [x, y, h] = S.offset(t, a, scale, sec);',
      '      const [x, y, h] = S.offsetInto(t, a, scale, sec, offset);',
      'reuse tube vertex offset output');
    patch('  normal(t, th, out) {\n    const e = 1e-3;\n    const p0 = this.point(t, th, new V3());\n    const pt = this.point(t + e, th, new V3()).sub(this.point(t - e, th, new V3()));\n    const pa = this.point(t, th + e, new V3()).sub(this.point(t, th - e, new V3()));',
      '  normal(t, th, out, scratch = null) {\n    const e = 1e-3;\n    const v = scratch || [new V3(), new V3(), new V3(), new V3(), new V3()];\n    const p0 = this.point(t, th, v[0]);\n    const pt = this.point(t + e, th, v[1]).sub(this.point(t - e, th, v[2]));\n    const pa = this.point(t, th + e, v[3]).sub(this.point(t, th - e, v[4]));',
      'allow caller-owned finite difference vectors');
    patch('  const n = new V3(), et = new V3(), ea = new V3(), C = new V3(), q = new V3(), qn = new V3();',
      '  const n = new V3(), et = new V3(), ea = new V3(), C = new V3(), q = new V3(), qn = new V3();\n  const normalScratch = [new V3(), new V3(), new V3(), new V3(), new V3()];',
      'own normal scratch within one suction-cup build');
    patch('        const lt = S.point(t + eps, row.th, new V3()).distanceTo(S.point(t - eps, row.th, new V3())) / (2 * eps);\n        const la = S.point(t, row.th + eps, new V3()).distanceTo(S.point(t, row.th - eps, new V3())) / (2 * eps);',
      '        const lt = S.point(t + eps, row.th, et).distanceTo(S.point(t - eps, row.th, ea)) / (2 * eps);\n        const la = S.point(t, row.th + eps, et).distanceTo(S.point(t, row.th - eps, ea)) / (2 * eps);',
      'reuse independent metric sample vectors');
    patch('            S.normal(t, row.th, qn);', '            S.normal(t, row.th, qn, normalScratch);', 'reuse center normal vectors');
    patch('            S.normal(t + dt, row.th + da, qn);', '            S.normal(t + dt, row.th + da, qn, normalScratch);', 'reuse ring normal vectors');
  }
  if (rel === 'src/world/decor.js') {
    patch("  const clean = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) x.deleteAttribute(k); return x; });",
      `  const clean = list.map((g) => {
    const x = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color', 'uv']) if (g.attributes[k]) x.setAttribute(k, g.attributes[k]);
    if (g.index) x.setIndex(g.index);
    else { const n = g.attributes.position.count, indices = n > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let i = 0; i < n; i++) indices[i] = i; x.setIndex(new THREE.BufferAttribute(indices, 1)); }
    return x;
  });`,
      'merge indexed decor without expanding duplicated triangle vertices');
    patch('      for (let i = 0; i < P.count; i++) {\n        const seg = Math.floor(i / (radial + 1)), t = seg / segs;\n        const cp = curve.getPoint(t);',
      '      let ringSeg = -1, cp;\n      for (let i = 0; i < P.count; i++) {\n        const seg = Math.floor(i / (radial + 1)), t = seg / segs;\n        if (seg !== ringSeg) { ringSeg = seg; cp = curve.getPoint(t); }',
      'evaluate each palm trunk Bezier ring once');
    // Keep Math.hypot on contributing samples, retaining its exact rounding.
    patch('        const d = Math.hypot(a.pos.x - p.g.position.x, a.pos.z - p.g.position.z);',
      '        const dx = a.pos.x - p.g.position.x, dz = a.pos.z - p.g.position.z;\n        const reach = this.level.spawnBarrier + 4;\n        if (Number.isFinite(reach) && reach >= 0 && (Math.abs(dx) > reach || Math.abs(dz) > reach)) continue;\n        const d = Math.hypot(dx, dz);',
      'reject distant spawn barrier samples before hypot');
  }
  if (rel === 'src/core/renderer.js') {
    patch('    this.gtao?.setSize(w, h);',
      '    // EffectComposer owns pass sizes in effective pixels, including GTAO.',
      'remove duplicate CSS-pixel GTAO resize');
  }
  if (rel === 'src/world/environment.js') {
    // Main owns strip scissor/target restoration, including cube face/mip and
    // primary-error precedence. Extend that exact transaction only with clear colour.
    patch('    const prev = r.getRenderTarget(), ac = r.autoClear, xr = r.xr.enabled;\n    const rt = this._cloudRT;',
      '    const prev = r.getRenderTarget(), ac = r.autoClear, xr = r.xr.enabled;\n    const color = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();\n    const rt = this._cloudRT;',
      'capture cloud bake clear colour within authored transaction');
    const cloudScissorRestore = '    } catch (error) { bakeFailed = true; throw error; }\n    finally {\n      rt.scissor.copy(scissor); rt.scissorTest = wasScissored;';
    patch(cloudScissorRestore, cloudScissorRestore, 'validate authored strip-scissor and primary-error restoration');
    patch('      try { r.setRenderTarget(prev, face, mip); }\n      catch (error) { if (!bakeFailed) throw error; }\n      finally { r.autoClear = ac; r.xr.enabled = xr; }',
      `      let restoreFailed = false;
      try { r.setRenderTarget(prev, face, mip); }
      catch (error) { restoreFailed = true; if (!bakeFailed) throw error; }
      finally {
        r.autoClear = ac; r.xr.enabled = xr;
        try { r.setClearColor(color, alpha); }
        catch (error) { if (!bakeFailed && !restoreFailed) throw error; }
      }`,
      'restore clear colour without replacing the primary cloud or target failure');
    const themeBake = '    try { this._bakeClouds(T); }\n    finally { r0.setClearColor(cc, ca); }';
    patch(themeBake, themeBake, 'validate authored theme clear-colour restoration');
    patch('    this.scene.remove(this.root, this.sun, this.sun.target, this.hemi);',
      '    this.sun.shadow?.dispose();\n    this.scene.remove(this.root, this.sun, this.sun.target, this.hemi);',
      'release environment-owned sun shadow targets');
    patch('    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });',
      '    this.root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });',
      'release environment instance matrix and color GPU buffers');
  }
  if (rel === 'src/world/texlib.js') {
    patch('  // wait for the GPU so the reported time is honest (one-pixel readback)\n  renderer.readRenderTargetPixels(out, 0, 0, 1, 1, new Uint8Array(4), undefined, 2);',
      '  // Normal stats.ms measures CPU setup/command submission. Explicit diagnostics\n  // can include GPU completion; texture commands retain their original order.\n  const syncTiming = typeof location !== \'undefined\' && new URLSearchParams(location.search).has(\'texlib-sync-timing\');\n  if (syncTiming) renderer.readRenderTargetPixels(out, 0, 0, 1, 1, new Uint8Array(4), undefined, 2);',
      'make measurement-only GPU readback opt-in');
  }
  if (rel === 'src/game/showcase.js') {
    patch('  update(dt) {\n    dt = Math.min(dt || 0, 0.1);',
      '  update(dt) {\n    dt = Math.min(dt || 0, 0.1);\n    this._fdt = dt;', 'showcase framing uses the actual bounded presentation dt');
    patch('    this._fdt = 1 / 60;\n', '', 'render does not override presentation elapsed time');
    patch('Math.exp(-7 * (this._fdt || 1 / 60))', 'Math.exp(-7 * (this._fdt ?? 1 / 60))', 'zero-dt lobby framing freezes and initial render has nominal fallback');
    patch('Math.exp(-8 * (this._fdt || 0.016))', 'Math.exp(-8 * (this._fdt ?? 1 / 60))', 'zero-dt panel framing freezes and initial render has nominal fallback');

    patch("    addEventListener('resize', () => { this.ui.next = 0; });",
      "    addEventListener('resize', this._iwResize = () => { this.ui.next = 0; });",
      'own showcase resize listener');
    patch("    el.addEventListener('pointerdown', (e) => {", "    this._iwDragElement = el;\n    el.addEventListener('pointerdown', this._iwPointerDown = (e) => {", 'own showcase drag element listener');
    patch("    addEventListener('pointermove', (e) => {", "    addEventListener('pointermove', this._iwPointerMove = (e) => {", 'own showcase global pointer movement listener');
    patch("    addEventListener('pointerup', () => { this.drag = null; });", "    addEventListener('pointerup', this._iwPointerUp = () => { this.drag = null; });", 'own showcase pointer completion listener');
    patch('    this.mode = null; this._clear();',
      "    if (this._iwDisposed) return; this._iwDisposed = true;\n    globalThis.removeEventListener?.('resize', this._iwResize);\n    globalThis.removeEventListener?.('pointermove', this._iwPointerMove);\n    globalThis.removeEventListener?.('pointerup', this._iwPointerUp);\n    this._iwDragElement?.removeEventListener('pointerdown', this._iwPointerDown);\n    this._iwDragElement = null;\n    if (this._warmChar) { this.scene.remove(this._warmChar.root); this._warmChar.dispose?.(); this._warmChar = null; }\n    this.mode = null; this._clear();\n    const ownedGeometry = new Set(), ownedMaterials = new Set([this.inkMat, this.bodyMat]);\n    for (const root of [this.scene, this.compScene]) root?.traverse(o => {\n      if (o.isInstancedMesh) o.dispose();\n      if (o.geometry) ownedGeometry.add(o.geometry);\n      if (Array.isArray(o.material)) for (const m of o.material) ownedMaterials.add(m);\n      else if (o.material) ownedMaterials.add(o.material);\n    });",
      'release global showcase closures and warm character on disposal');
    patch('      st.group.traverse((o) => o.geometry?.dispose());',
      '      // Stage and pool resources are retired together by their owner.',
      'deduplicate showcase stage geometry disposal');
    patch('    this.stageL = this.stageR = null;\n    this._lobRelease();',
      '    this.stageL = this.stageR = null;\n    this._lobRelease();\n    for (const g of ownedGeometry) g.dispose();\n    for (const m of ownedMaterials) m?.dispose();\n    this.scene.clear(); this.compScene?.clear();',
      'retire all showcase-owned visual pools and composite geometry');
    patch("    const r = this.r;\n    try {\n      if (!this.stageL)",
      "    const r = this.r;\n    let stageWas = this.stageL?.group.visible;\n    try {\n      if (!this.stageL)",
      'retain warmup visibility snapshot for synchronous failure');
    patch('      const stageWas = this.stageL.group.visible;', '      stageWas = this.stageL.group.visible;', 'share showcase warm visibility snapshot');
    patch("    } catch (e) { console.warn('[showcase] warm-up', e); this._warmState = 'done'; }",
      "    } catch (e) {\n      if (this._warmChar) { this.scene.remove(this._warmChar.root); this._warmChar.dispose?.(); this._warmChar = null; }\n      if (this.stageL && !PEDESTAL.has(this.mode)) this.stageL.group.visible = !!stageWas && PEDESTAL.has(this.mode);\n      console.warn('[showcase] warm-up', e); this._warmState = 'done';\n    }",
      'retire synchronous showcase warmup failures');
    patch("        if (!PEDESTAL.has(this.mode)) this.stageL.group.visible = stageWas && PEDESTAL.has(this.mode);",
      "        if (this.stageL && !PEDESTAL.has(this.mode)) this.stageL.group.visible = stageWas && PEDESTAL.has(this.mode);",
      'permit an asynchronous warmup to finish after disposal');
  }
  if (rel === 'src/ui/news.js') {
    patch('    const finish = () => { el.remove(); if (this.el === el) this.el = null; };',
      '    const finish = () => { el.remove(); if (this.el === el) { this.el = null; this._pre = null; } };',
      'release news preloads after their dialog finishes closing');
    patch('  dispose() { clearTimeout(this._t);', '  dispose() { this._pre = null; clearTimeout(this._t);', 'release unused news preloads on teardown');
  }
  if (rel === 'src/game/minimap.js') {
    const reuse=(name,type,size,fill=null)=>{
      const init=`new ${type}(${size})${fill===null?'':'.fill('+fill+')'}`;
      const pattern=`this.${name} = ${init}`;
      const next=`this.${name} = this.${name}?.length === ${size} ? this.${name}${fill===null?'':'.fill('+fill+')'} : ${init}`;
      patch(pattern,next,'reuse legacy minimap '+name+' table across viewer flips');
    };
    reuse('hgt','Float32Array','N','-99'); reuse('topBlock','Int32Array','N','-1');
    reuse('nrm','Float32Array','N * 2'); reuse('pixCell','Int32Array','N','-1');
    reuse('pixFx','Uint8Array','N'); reuse('pixFy','Uint8Array','N');
    reuse('pixSx','Int8Array','N'); reuse('pixSy','Int32Array','N');
    patch('    this.owner = new Uint8Array(N);','    this.owner = this.owner?.length === N ? this.owner.fill(0) : new Uint8Array(N);','reuse legacy minimap owner table');
    // These tables are only written on admitted raster cells, so stale entries
    // must be reset exactly as freshly allocated typed arrays were.
    for(const name of ['nrm','pixFx','pixFy','pixSx','pixSy']) {
      const size=name==='nrm'?'N * 2':'N';
      patch(`this.${name}?.length === ${size} ? this.${name} :`, `this.${name}?.length === ${size} ? this.${name}.fill(0) :`, 'zero reused minimap '+name+' table');
    }
  }
  if (rel === 'src/fx/fx.js') {
    patch('function coneDir(n, maxAngle, out) {\n  const cosMax = Math.cos(maxAngle);',
      'function coneDir(n, maxAngle, out, cosMax = Math.cos(maxAngle)) {',
      'accept an exactly precomputed cone-angle cosine');
    patch('    const px = pos.x + _v3.x * 0.04, py = pos.y + _v3.y * 0.04, pz = pos.z + _v3.z * 0.04;\n    for (let i = 0; i < count; i++) {\n      coneDir(_v3, Math.max(0.05, spread) * Math.PI * 0.5, _v1);',
      '    const px = pos.x + _v3.x * 0.04, py = pos.y + _v3.y * 0.04, pz = pos.z + _v3.z * 0.04;\n    const coneCos = Math.cos(Math.max(0.05, spread) * Math.PI * 0.5);\n    for (let i = 0; i < count; i++) {\n      coneDir(_v3, Math.max(0.05, spread) * Math.PI * 0.5, _v1, coneCos);',
      'evaluate variable impact cone cosine once per burst');
    const calls = [...code.matchAll(/coneDir\(([^,\n]+), (\d+(?:\.\d+)?), ([^,\n)]+)\);/g)];
    if (calls.length !== 16) throw new Error('runtime frame scratch: fixed FX cone call count changed: ' + calls.length);
    const angles = [...new Set(calls.map(m=>m[2]))];
    patch('function coneDir(n, maxAngle, out, cosMax = Math.cos(maxAngle)) {',
      angles.map((angle,i)=>`const IW_CONE_COS_${i} = Math.cos(${angle});`).join('\n')+'\nfunction coneDir(n, maxAngle, out, cosMax = Math.cos(maxAngle)) {',
      'retain static cone cosines without changing random draws');
    code = code.replace(/coneDir\(([^,\n]+), (\d+(?:\.\d+)?), ([^,\n)]+)\);/g,
      (_all,n,angle,out)=>`coneDir(${n}, ${angle}, ${out}, IW_CONE_COS_${angles.indexOf(angle)});`);
  }
  if (rel === 'src/ui/menus.js') {
    patch('        for (const s of statEls) {\n          if (enterT < s.delay) continue;\n          s.cur += (s.target - s.cur) * (1 - Math.exp(-dt * 9));\n          if (Math.abs(s.target - s.cur) < 0.4) s.cur = s.target;',
      '        let statEase;\n        for (const s of statEls) {\n          if (enterT < s.delay) continue;\n          if (!Object.is(s.cur, s.target) || !Number.isFinite(s.cur) || !Number.isFinite(dt) || dt < 0) {\n            if (statEase === undefined) statEase = 1 - Math.exp(-dt * 9);\n            s.cur += (s.target - s.cur) * statEase;\n            if (Math.abs(s.target - s.cur) < 0.4) s.cur = s.target;\n          }',
      'skip only settled loadout easing and share one coefficient');
  }
  if (rel === 'src/world/levelMaterial.js') {
    patch('  float big = fbm(vWPos.xz * 0.18 + vWPos.y * 0.1);\n  float fine = vnoise(fu * 9.0);',
      '  float big, fine;\n#ifndef USE_TEXLIB\n  big = fbm(vWPos.xz * 0.18 + vWPos.y * 0.1);\n  fine = vnoise(fu * 9.0);\n#endif',
      'retain fallback noise while deferring unused texlib evaluations');
    patch('    if (pid == 21 && isTop) {', '    if (pid == 21 && isTop) {\n      fine = vnoise(fu * 9.0);', 'evaluate texlib drain noise only in its consumer');
    patch('  // murals / signage\n  if (vFaceFlags.z > -0.5) {',
      '  // murals / signage\n  if (vFaceFlags.z > -0.5) {\n#ifdef USE_TEXLIB\n    big = fbm(vWPos.xz * 0.18 + vWPos.y * 0.1);\n#endif',
      'evaluate texlib mural noise only in its consumer');
  }
  if (rel === 'src/game/physics.js') {
    patch('    const bot = lift + radius, top = Math.max(bot, height - radius);\n    for (let it = 0; it < iterations; it++) {',
      '    const bot = lift + radius, top = Math.max(bot, height - radius);\n    let axisY, axisLen2;\n    for (let it = 0; it < iterations; it++) {',
      'cache the rounded vertical capsule axis within one collision solve');
    patch('        _a.set(pos.x, pos.y + bot, pos.z);\n        _b.set(pos.x, pos.y + top, pos.z);\n        _ab.copy(_b).sub(_a);\n        const abLen2 = Math.max(1e-6, _ab.lengthSq());',
      '        _a.set(pos.x, pos.y + bot, pos.z);\n        _b.set(pos.x, pos.y + top, pos.z);\n        let abLen2;\n        if (Number.isFinite(pos.x) && Number.isFinite(pos.z)) {\n          const dy = _b.y - _a.y; _ab.set(0, dy, 0);\n          if (axisY !== dy) { axisY = dy; axisLen2 = Math.max(1e-6, dy * dy); }\n          abLen2 = axisLen2;\n        } else { _ab.copy(_b).sub(_a); abLen2 = Math.max(1e-6, _ab.lengthSq()); }',
      'reuse exact rounded axis length without changing translated endpoint arithmetic');
    patch('        const hl = Math.hypot(_n.x, _n.z);', '        const hl = horizontal ? Math.hypot(_n.x, _n.z) : 0;', 'skip unused airborne contact hypot');
    patch('    const ids = this.level.queryBlocks(pos.x - radius - 0.1, pos.z - radius - 0.1, pos.x + radius + 0.1, pos.z + radius + 0.1, this._ids);\n    for (let i = 0; i < ids.length; i++) {',
      '    const ids = this.level.queryBlocks(pos.x - radius - 0.1, pos.z - radius - 0.1, pos.x + radius + 0.1, pos.z + radius + 0.1, this._ids);\n    _a.set(pos.x, pos.y + bot, pos.z); _b.set(pos.x, pos.y + top, pos.z); _ab.copy(_b).sub(_a);\n    const abLen2 = Math.max(1e-6, _ab.lengthSq());\n    for (let i = 0; i < ids.length; i++) {',
      'hoist fixed body-fit capsule endpoints and axis');
    patch('      _a.set(pos.x, pos.y + bot, pos.z); _b.set(pos.x, pos.y + top, pos.z); _ab.copy(_b).sub(_a);\n      const abLen2 = Math.max(1e-6, _ab.lengthSq());',
      '      // Position and capsule endpoints remain fixed throughout bodyFits.',
      'avoid recomputing the unchanged body-fit axis for each block');
  }
  return adaptGeometryBuildStorage(rel,code,replaceOnce);
}
