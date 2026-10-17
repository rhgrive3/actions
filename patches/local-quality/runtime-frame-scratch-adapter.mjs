// Build-time-only allocation and loop-invariant elimination in unconditional frame work.
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

  if (rel === 'src/game/motion/source-bank.js') {
    // BFRES kind is masked with &7; use a branch instead of allocating a new
    // four-element array on every curve sample.
    patch('else if ([4, 5, 6, 7].includes(kind)) v = data[ko + i];',
      'else if (kind >= 4 && kind <= 7) v = data[ko + i];',
      'BFRES integer step curve without hot-path array');
  }
  if (rel === 'src/game/motion/source-controller.js') {
    // Values and addition order match the original Float64Array .set/reduce.
    // Avoid allocating per-frame directional blend arrays in 8-actor scenes.
    patch(`  this.directionTarget.set(this.pivoting?
   (this.turnRate>=0?[0,0,1,0]:[0,0,0,1]):
   [Math.max(0,this.localZ),Math.max(0,-this.localZ),Math.max(0,this.localX),Math.max(0,-this.localX)]);
  let sum=this.directionTarget.reduce((a,b)=>a+b,0);if(sum<1e-10){this.directionTarget.set([1,0,0,0]);sum=1;}`,
      `  if(this.pivoting){
   this.directionTarget[0]=0;this.directionTarget[1]=0;
   this.directionTarget[2]=this.turnRate>=0?1:0;
   this.directionTarget[3]=this.turnRate>=0?0:1;
  }else{
   this.directionTarget[0]=Math.max(0,this.localZ);
   this.directionTarget[1]=Math.max(0,-this.localZ);
   this.directionTarget[2]=Math.max(0,this.localX);
   this.directionTarget[3]=Math.max(0,-this.localX);
  }
  let sum=this.directionTarget[0]+this.directionTarget[1]+this.directionTarget[2]+this.directionTarget[3];
  if(sum<1e-10){this.directionTarget[0]=1;this.directionTarget[1]=0;this.directionTarget[2]=0;this.directionTarget[3]=0;sum=1;}`,
      'reuse typed directional target without hot-path arrays');
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
  return code;
}
