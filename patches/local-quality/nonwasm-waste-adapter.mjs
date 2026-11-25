// Build-only adapter eliminating verified non-Wasm CPU and heap-allocation waste
// and wiring fused Wasm locomotion batching without altering observable behavior.

export function adaptNonWasmWaste(rel, code, replaceOnce) {
  if (rel === 'src/main.js') {
    code = replaceOnce(
      code,
      'return h.hit ? { point: h.point, normal: h.normal } : null;',
      'return h.hit ? h : null;',
      'nonwasm: return reused Hit directly from G.fx.setCollider'
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    // 1. LensInk.update: early return when empty, O(1) swap-pop, Math.sqrt instead of Math.hypot
    const oldLensStart =
      '  update(dt, aspect) {\n' +
      '    const P = this.parts;\n' +
      '    const trails = this._pendingTrails || (this._pendingTrails = []);';
    const newLensStart =
      '  update(dt, aspect) {\n' +
      '    const P = this.parts;\n' +
      '    if (P.length === 0) return;\n' +
      '    const trails = this._pendingTrails || (this._pendingTrails = []);';
    code = replaceOnce(code, oldLensStart, newLensStart, 'nonwasm: early return in LensInk.update when parts empty');

    code = replaceOnce(
      code,
      'if (p.I <= 0.01) { P.splice(i, 1); this.pool.push(p); continue; }',
      'if (p.I <= 0.01) { const last = P.pop(); if (i < P.length) P[i] = last; this.pool.push(p); continue; }',
      'nonwasm: O(1) swap-pop for faded LensInk part'
    );

    code = replaceOnce(
      code,
      'p.trailT += Math.hypot(dx * aspect, dy);',
      '{ const adx = dx * aspect; p.trailT += Math.sqrt(adx * adx + dy * dy); }',
      'nonwasm: replace Math.hypot with Math.sqrt in LensInk.update'
    );

    code = replaceOnce(
      code,
      'if (p.y < -0.1) { P.splice(i, 1); this.pool.push(p); continue; }',
      'if (p.y < -0.1) { const last = P.pop(); if (i < P.length) P[i] = last; this.pool.push(p); continue; }',
      'nonwasm: O(1) swap-pop for offscreen LensInk drop'
    );

    // 2. ScreenFX.update: evaluate `any` before uniform writes and skip uniform writes when inactive
    const oldScreenUniforms =
      '    // ---- uniforms\n' +
      '    const alive = !!(local && local.alive);\n' +
      '    U.uTime.value = this.time;\n' +
      '    U.uSpeed.value = s.speed * I;\n' +
      '    U.uStretch.value = s.stretch * I;\n' +
      '    U.uPunch.value = clamp(s.punch, -0.08, 0.08) * I;\n' +
      '    U.uBlast.value = s.blast * I;\n' +
      '    U.uBlastRing.value = easeOut(s.blastT / 0.55) * 0.9;\n' +
      '    U.uChroma.value = Math.min(1.5, s.chroma) * I;\n' +
      '    U.uEdgeInk.value.w = s.edgeInk;\n' +
      '    U.uAura.value.w = s.aura * (0.55 + 0.45 * I);\n' +
      '    U.uHeart.value.w = s.heart;\n' +
      '    U.uHurt.value = s.hurt;\n' +
      '    U.uUrgency.value.w = s.urg;\n' +
      '    U.uSwim.value.w = s.swim;\n' +
      '    U.uFocus.value = s.focus;\n' +
      '    U.uCharge.value.w = s.chargePulse * I;\n' +
      '    U.uShimmer.value.w = s.shimmer;\n' +
      '    U.uKill.value.w = s.kill * (0.5 + 0.5 * I);\n' +
      '    U.uFlash.value.w = s.flash * (0.3 + 0.7 * I);\n' +
      '    U.uDesat.value = s.desat;\n' +
      '    U.uSat.value = s.sat + s.satPop * 0.28;\n' +
      '    U.uFlood.value.w = s.flood;\n' +
      '    U.uFloodDrip.value = s.floodDrip;\n' +
      '    U.uHole.value = s.hole;\n' +
      '    const lensOn = this.lens.parts.length > 0;\n' +
      '    const any = lensOn || s.speed > 0.002 || s.stretch > 0.0005 || Math.abs(s.punch) > 0.0004 || s.blast > 0.002 || s.chroma > 0.004 ||\n' +
      '      s.edgeInk > 0.002 || s.aura > 0.002 || s.heart > 0.002 || s.hurt > 0.002 || s.urg > 0.002 || s.swim > 0.002 || s.focus > 0.002 ||\n' +
      '      s.chargePulse > 0.002 || s.shimmer > 0.002 || s.kill > 0.002 || s.flash > 0.002 || s.desat > 0.002 || Math.abs(s.sat - 1) > 0.002 ||\n' +
      '      s.satPop > 0.002 || s.flood > 0.001;';
    const newScreenUniforms =
      '    // ---- uniforms\n' +
      '    const alive = !!(local && local.alive);\n' +
      '    const lensOn = this.lens.parts.length > 0;\n' +
      '    const any = lensOn || s.speed > 0.002 || s.stretch > 0.0005 || Math.abs(s.punch) > 0.0004 || s.blast > 0.002 || s.chroma > 0.004 ||\n' +
      '      s.edgeInk > 0.002 || s.aura > 0.002 || s.heart > 0.002 || s.hurt > 0.002 || s.urg > 0.002 || s.swim > 0.002 || s.focus > 0.002 ||\n' +
      '      s.chargePulse > 0.002 || s.shimmer > 0.002 || s.kill > 0.002 || s.flash > 0.002 || s.desat > 0.002 || Math.abs(s.sat - 1) > 0.002 ||\n' +
      '      s.satPop > 0.002 || s.flood > 0.001;\n' +
      '    if (any) {\n' +
      '      U.uTime.value = this.time;\n' +
      '      U.uSpeed.value = s.speed * I;\n' +
      '      U.uStretch.value = s.stretch * I;\n' +
      '      U.uPunch.value = clamp(s.punch, -0.08, 0.08) * I;\n' +
      '      U.uBlast.value = s.blast * I;\n' +
      '      U.uBlastRing.value = easeOut(s.blastT / 0.55) * 0.9;\n' +
      '      U.uChroma.value = Math.min(1.5, s.chroma) * I;\n' +
      '      U.uEdgeInk.value.w = s.edgeInk;\n' +
      '      U.uAura.value.w = s.aura * (0.55 + 0.45 * I);\n' +
      '      U.uHeart.value.w = s.heart;\n' +
      '      U.uHurt.value = s.hurt;\n' +
      '      U.uUrgency.value.w = s.urg;\n' +
      '      U.uSwim.value.w = s.swim;\n' +
      '      U.uFocus.value = s.focus;\n' +
      '      U.uCharge.value.w = s.chargePulse * I;\n' +
      '      U.uShimmer.value.w = s.shimmer;\n' +
      '      U.uKill.value.w = s.kill * (0.5 + 0.5 * I);\n' +
      '      U.uFlash.value.w = s.flash * (0.3 + 0.7 * I);\n' +
      '      U.uDesat.value = s.desat;\n' +
      '      U.uSat.value = s.sat + s.satPop * 0.28;\n' +
      '      U.uFlood.value.w = s.flood;\n' +
      '      U.uFloodDrip.value = s.floodDrip;\n' +
      '      U.uHole.value = s.hole;\n' +
      '    }';
    code = replaceOnce(code, oldScreenUniforms, newScreenUniforms, 'nonwasm: skip ScreenFX uniform writes when inactive');
  }

  if (rel === 'src/ui/hud.js') {
    // 1. Move _updTurf(dt) ahead of DOM-mutating HUD updates to avoid synchronous style recalc on playState reads.
    const oldHudOrder =
      '    this._updTimer(f.time);\n' +
      '    if (f.teams) this._updSquads(this.boss.on ? this.boss.squadTeams(f.teams, this._bossSquadViews ||= [{color:null,players:[]},{color:null,players:[]}]) : f.teams);\n' +
      '    this._updCrosshair(f, dt);\n' +
      '    this._updTank(f, dt);\n' +
      '    this._updSpecial(f, dt);\n' +
      '    this._updTurf(dt);';
    const newHudOrder =
      '    this._updTurf(dt);\n' +
      '    this._updTimer(f.time);\n' +
      '    if (f.teams) this._updSquads(this.boss.on ? this.boss.squadTeams(f.teams, this._bossSquadViews ||= [{color:null,players:[]},{color:null,players:[]}]) : f.teams);\n' +
      '    this._updCrosshair(f, dt);\n' +
      '    this._updTank(f, dt);\n' +
      '    this._updSpecial(f, dt);';
    code = replaceOnce(code, oldHudOrder, newHudOrder, 'nonwasm: run _updTurf before DOM-mutating HUD methods');

    // 2. Cache --far string on marker element instead of reading el.style.getPropertyValue('--far')
    code = replaceOnce(
      code,
      "      if (el.style.getPropertyValue('--far') !== farCSS) el.style.setProperty('--far', farCSS);",
      "      if (el._farCSS !== farCSS) { el._farCSS = farCSS; el.style.setProperty('--far', farCSS); }",
      'nonwasm: cache --far CSS value on marker element'
    );

    // 3. Avoid forced layout flush (offsetWidth) in _restart when adding is-dying to a freshly-dead squad icon
    const oldRestart =
      '  _restart(el, cls) {\n' +
      '    el.classList.remove(cls);\n' +
      '    void el.offsetWidth; // eslint-disable-line no-void\n' +
      '    el.classList.add(cls);\n' +
      '  }';
    const newRestart =
      '  _restart(el, cls) {\n' +
      "    if (cls === 'is-dying' && !el.classList.contains(cls)) { el.classList.add(cls); return; }\n" +
      '    el.classList.remove(cls);\n' +
      '    void el.offsetWidth; // eslint-disable-line no-void\n' +
      '    el.classList.add(cls);\n' +
      '  }';
    code = replaceOnce(code, oldRestart, newRestart, 'nonwasm: avoid forced layout in _restart for fresh is-dying');

    // 4. Run _restartCssAnimation BEFORE appendChild(el) in _turfPop so playState/currentTime
    // or fallback offsetWidth does not force a synchronous layout flush of the newly appended node.
    const oldTurfPop =
      '    this.tpops.appendChild(el);\n' +
      "    this._restartCssAnimation(this.turfEl, 'is-tick', this.turfEl.firstElementChild, 'iw-turf-tick');";
    const newTurfPop =
      "    this._restartCssAnimation(this.turfEl, 'is-tick', this.turfEl.firstElementChild, 'iw-turf-tick');\n" +
      '    this.tpops.appendChild(el);';
    code = replaceOnce(code, oldTurfPop, newTurfPop, 'nonwasm: reorder _turfPop animation before appendChild');
    code = replaceOnce(
      code,
      '      animation.currentTime = 0;\n',
      '      if (animation.currentTime !== 0) animation.currentTime = 0;\n',
      'nonwasm: skip redundant currentTime=0 write in _restartCssAnimation'
    );
  }

  if (rel === 'src/ui/ui-util.js') {
    // Self-contained single expression so added-ui-motion.test.mjs AST extraction continues to work.
    code = replaceOnce(
      code,
      "export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');",
      "export const fmtInt = (n) => { const v = Math.round(n); if (v >= 0 && v < 1000) return '' + v; if (v > -1000 && v < 0) return '' + v; if (!(v > -1e15 && v < 1e15)) return v.toLocaleString('en-US'); const neg = v < 0; const s = '' + (neg ? -v : v); let out = '', i = s.length; while (i > 3) { out = ',' + s.slice(i - 3, i) + out; i -= 3; } return (neg ? '-' : '') + s.slice(0, i) + out; };",
      'nonwasm: fast fmtInt without toLocaleString overhead'
    );
  }

  if (rel === 'src/game/character.js') {
    // 1. Skip _screenPx() world-matrix walk and renderer.getSize() when out-of-world or forced
    // to a non-T_GAME tier (T_GAME keeps live L.px for lifeLv detail scaling).
    const oldLod =
      '    const px = L.px = this._screenPx();\n' +
      '    if (L.force >= 0) want = L.force;\n' +
      '    else if (!this.inWorld) want = Q.menu;';
    const newLod =
      '    const skipPx = !this.inWorld || (L.force >= 0 && L.force !== T_GAME);\n' +
      '    const px = skipPx ? L.px : (L.px = this._screenPx());\n' +
      '    if (L.force >= 0) want = L.force;\n' +
      '    else if (!this.inWorld) want = Q.menu;';
    code = replaceOnce(code, oldLod, newLod, 'nonwasm: skip _screenPx when out-of-world or non-game LOD forced');

    // 2. Disable unused Euler reverse-conversion (_onChange) on hairBones & hairTips quaternions
    code = replaceOnce(
      code,
      '    this.hairBones = [];\n    for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) this.hairBones.push(this.bones[`hair${s}_${k}`]);',
      '    this.hairBones = [];\n    { const noop = () => {}; for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) { const b = this.bones[`hair${s}_${k}`]; if (b && b.quaternion && b.quaternion._onChange) b.quaternion._onChange(noop); this.hairBones.push(b); } }',
      'nonwasm: disable unused Euler sync on hairBones quaternions'
    );
    code = replaceOnce(
      code,
      '    this.hairTips = [];\n    for (let s = 0; s < HAIR_MAX; s++) this.hairTips.push(this.bones[`hairTip${s}`] || null);',
      '    this.hairTips = [];\n    { const noop = () => {}; for (let s = 0; s < HAIR_MAX; s++) { const b = this.bones[`hairTip${s}`] || null; if (b && b.quaternion && b.quaternion._onChange) b.quaternion._onChange(noop); this.hairTips.push(b); } }',
      'nonwasm: disable unused Euler sync on hairTips quaternions'
    );
  }

  if (rel === 'src/world/environment.js') {
    // 1. Cache rect-set list in waterHeightAt and replace Math.hypot with Math.sqrt
    const oldWater =
      '    const M = this._marinaData;\n' +
      '    for (let wi = 0, wn = M ? 2 : 1; wi < wn; wi++) for (const r of M ? (wi === 0 ? M.decks : M.wet) : this.footprint) {\n' +
      "      // (turned rects: the distance in the rect's own frame, matching sdORect in the sea shaders)\n" +
      '      const qx = r.aligned ? Math.abs(x - (r.waterCx ?? (r.minX + r.maxX) / 2)) - (r.waterHx ?? (r.maxX - r.minX) / 2) : Math.abs((x - r.cx) * r.ax + (z - r.cz) * r.az) - r.hx;\n' +
      '      const qz = r.aligned ? Math.abs(z - (r.waterCz ?? (r.minZ + r.maxZ) / 2)) - (r.waterHz ?? (r.maxZ - r.minZ) / 2) : Math.abs((z - r.cz) * r.ax - (x - r.cx) * r.az) - r.hz;\n' +
      '      const dd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);\n' +
      '      d = Math.min(d, dd);\n' +
      '    }\n' +
      '    let amp = 0.035 + (0.16 - 0.035) * smooth(3, 70, d);\n' +
      '    if (M) {   // sheltered basin (matches basinK in the sea vertex shader)\n' +
      '      const b = this.bounds, qx = Math.abs(x - (b.minX + b.maxX) / 2) - (b.maxX - b.minX) / 2, qz = Math.abs(z - (b.minZ + b.maxZ) / 2) - (b.maxZ - b.minZ) / 2;\n' +
      '      const da = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);\n' +
      '      amp *= 0.45 + 0.55 * smooth(60, 210, da);\n' +
      '    }';
    const newWater =
      '    const M = this._marinaData;\n' +
      '    let sets = this._waterRectSets;\n' +
      '    if (!sets || this._waterRectM !== M || this._waterRectF !== this.footprint) {\n' +
      '      this._waterRectM = M; this._waterRectF = this.footprint;\n' +
      '      sets = this._waterRectSets = M ? [M.decks, M.wet] : [this.footprint];\n' +
      '    }\n' +
      '    for (let si = 0; si < sets.length; si++) {\n' +
      '      const set = sets[si];\n' +
      '      for (let ri = 0; ri < set.length; ri++) {\n' +
      '        const r = set[ri];\n' +
      '        const qx = r.aligned ? Math.abs(x - (r.waterCx ?? (r.minX + r.maxX) / 2)) - (r.waterHx ?? (r.maxX - r.minX) / 2) : Math.abs((x - r.cx) * r.ax + (z - r.cz) * r.az) - r.hx;\n' +
      '        const qz = r.aligned ? Math.abs(z - (r.waterCz ?? (r.minZ + r.maxZ) / 2)) - (r.waterHz ?? (r.maxZ - r.minZ) / 2) : Math.abs((z - r.cz) * r.ax - (x - r.cx) * r.az) - r.hz;\n' +
      '        const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;\n' +
      '        const dd = Math.sqrt(mx * mx + mz * mz) + Math.min(qx > qz ? qx : qz, 0);\n' +
      '        if (dd < d) d = dd;\n' +
      '      }\n' +
      '    }\n' +
      '    let amp = 0.035 + (0.16 - 0.035) * smooth(3, 70, d);\n' +
      '    if (M) {   // sheltered basin (matches basinK in the sea vertex shader)\n' +
      '      const b = this.bounds, qx = Math.abs(x - (b.minX + b.maxX) / 2) - (b.maxX - b.minX) / 2, qz = Math.abs(z - (b.minZ + b.maxZ) / 2) - (b.maxZ - b.minZ) / 2;\n' +
      '      const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;\n' +
      '      const da = Math.sqrt(mx * mx + mz * mz) + Math.min(qx > qz ? qx : qz, 0);\n' +
      '      amp *= 0.45 + 0.55 * smooth(60, 210, da);\n' +
      '    }';
    code = replaceOnce(code, oldWater, newWater, 'nonwasm: cache _waterRectSets and use Math.sqrt in waterHeightAt');

    // 2. Cache static wave amplitude for stationary moored boats (x, z never move after stage build)
    // using the exact SDF amplitude and 3-wave sum from waterHeightAt(x, z, t).
    const oldMoored =
      '    for (const m of this.moored) {\n' +
      '      const s = m.spec;\n' +
      '      m.mesh.position.y = this.waterHeightAt(s.x, s.z, t) + 0.03 * Math.sin(t * 1.3 + m.phase);';
    const newMoored =
      '    for (const m of this.moored) {\n' +
      '      const s = m.spec;\n' +
      '      let amp = m._waterAmp;\n' +
      '      if (amp === undefined) {\n' +
      '        let d = 1e5;\n' +
      '        const M = this._marinaData;\n' +
      '        let sets = this._waterRectSets;\n' +
      '        if (!sets || this._waterRectM !== M || this._waterRectF !== this.footprint) {\n' +
      '          this._waterRectM = M; this._waterRectF = this.footprint;\n' +
      '          sets = this._waterRectSets = M ? [M.decks, M.wet] : [this.footprint];\n' +
      '        }\n' +
      '        for (let si = 0; si < sets.length; si++) for (const r of sets[si]) {\n' +
      '          const qx = r.aligned ? Math.abs(s.x - (r.waterCx ?? (r.minX + r.maxX) / 2)) - (r.waterHx ?? (r.maxX - r.minX) / 2) : Math.abs((s.x - r.cx) * r.ax + (s.z - r.cz) * r.az) - r.hx;\n' +
      '          const qz = r.aligned ? Math.abs(s.z - (r.waterCz ?? (r.minZ + r.maxZ) / 2)) - (r.waterHz ?? (r.maxZ - r.minZ) / 2) : Math.abs((s.z - r.cz) * r.ax - (s.x - r.cx) * r.az) - r.hz;\n' +
      '          const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;\n' +
      '          const dd = Math.sqrt(mx * mx + mz * mz) + Math.min(qx > qz ? qx : qz, 0);\n' +
      '          if (dd < d) d = dd;\n' +
      '        }\n' +
      '        amp = 0.035 + (0.16 - 0.035) * smooth(3, 70, d);\n' +
      '        if (M) {\n' +
      '          const b = this.bounds, qx = Math.abs(s.x - (b.minX + b.maxX) / 2) - (b.maxX - b.minX) / 2, qz = Math.abs(s.z - (b.minZ + b.maxZ) / 2) - (b.maxZ - b.minZ) / 2;\n' +
      '          const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;\n' +
      '          amp *= 0.45 + 0.55 * smooth(60, 210, Math.sqrt(mx * mx + mz * mz) + Math.min(qx > qz ? qx : qz, 0));\n' +
      '        }\n' +
      '        m._waterAmp = amp;\n' +
      '      }\n' +
      '      const wy = WATER_Y + (0.45 * Math.sin(s.x * 0.11 + s.z * 0.047 + t * 0.95) + 0.35 * Math.sin(-s.x * 0.052 + s.z * 0.097 + t * 1.13 + 1.7) + 0.2 * Math.sin(s.x * 0.173 - s.z * 0.141 + t * 1.61 + 4.1)) * amp;\n' +
      '      m.mesh.position.y = wy + 0.03 * Math.sin(t * 1.3 + m.phase);';
    code = replaceOnce(code, oldMoored, newMoored, 'nonwasm: cache static wave amplitude for moored boats');
  }

  if (rel === 'src/game/motion/source-controller.js') {
    // Mark internal humanoid poses (never read raw/world) so wasmSamplePose skips raw/wx/wy/wz writes.
    const oldLoop =
      '   let total=0;\n' +
      '   const footL=this.bank.index.foot_L,footR=this.bank.index.foot_R,toeL=this.bank.index.toe_L,toeR=this.bank.index.toe_R;';
    const newLoop =
      '   if(!this._iwNoRawWorldMarked&&this.bank.bones.length>30){this._iwNoRawWorldMarked=true;for(const _p of [this.pose,this.tmp,this.overlay,this.restGait,this.previousPose,this.previousBodyPose,this.bodyBalance?.pose,this.bodyBalance?.center])if(_p)_p._iwNoRawWorld=true;}\n' +
      '   let total=0;\n' +
      '   const footL=this.bank.index.foot_L,footR=this.bank.index.foot_R,toeL=this.bank.index.toe_L,toeR=this.bank.index.toe_R;';
    code = replaceOnce(code, oldLoop, newLoop, 'nonwasm: mark internal humanoid poses _iwNoRawWorld');
  }

  if (rel === 'src/game/physics.js') {
    // Precompute ray inverse direction components outside the candidate loop
    const oldRayLoopHead =
      '    let best = maxDist, bestK = -1, bestSign = 0, bestB = -1;\n' +
      '    for (let i = 0; i < ids.length; i++) {';
    const newRayLoopHead =
      '    let best = maxDist, bestK = -1, bestSign = 0, bestB = -1;\n' +
      '    const absDx0 = Math.abs(dx0), absDy0 = Math.abs(dy0), absDz0 = Math.abs(dz0);\n' +
      '    const invDx = absDx0 < 1e-9 ? 0 : 1 / dx0, invDy = absDy0 < 1e-9 ? 0 : 1 / dy0, invDz = absDz0 < 1e-9 ? 0 : 1 / dz0;\n' +
      '    for (let i = 0; i < ids.length; i++) {';
    code = replaceOnce(code, oldRayLoopHead, newRayLoopHead, 'nonwasm: hoist raycast inverse direction components');

    // General axis-aligned block fast path inside raycast (skips b.axes[k], 6 dot products, and per-axis divisions + early-out on tmin > best)
    const oldRayAligned =
      '      _o.x = ox; _o.y = oy; _o.z = oz;\n' +
      '      let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;';
    const newRayAligned =
      '      if (b.aligned === true) {\n' +
      '        let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;\n' +
      '        const hx = b.half.x, hy = b.half.y, hz = b.half.z;\n' +
      '        if (absDx0 < 1e-9) { if (ox < -hx || ox > hx) miss = true; }\n' +
      '        else { let t1 = (-hx - ox) * invDx, t2 = (hx - ox) * invDx, s1 = -1; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s1 = 1; } tmin = t1; kmin = 0; smin = s1; tmax = t2; if (tmin > tmax || tmin > best) miss = true; }\n' +
      '        if (!miss) {\n' +
      '          if (absDy0 < 1e-9) { if (oy < -hy || oy > hy) miss = true; }\n' +
      '          else { let t1 = (-hy - oy) * invDy, t2 = (hy - oy) * invDy, s1 = -1; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s1 = 1; } if (t1 > tmin) { tmin = t1; kmin = 1; smin = s1; } if (t2 < tmax) tmax = t2; if (tmin > tmax || tmin > best) miss = true; }\n' +
      '        }\n' +
      '        if (!miss) {\n' +
      '          if (absDz0 < 1e-9) { if (oz < -hz || oz > hz) miss = true; }\n' +
      '          else { let t1 = (-hz - oz) * invDz, t2 = (hz - oz) * invDz, s1 = -1; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s1 = 1; } if (t1 > tmin) { tmin = t1; kmin = 2; smin = s1; } if (t2 < tmax) tmax = t2; if (tmin > tmax || tmin > best) miss = true; }\n' +
      '        }\n' +
      '        if (!miss && tmax >= 0 && tmin >= 0 && tmin <= best) {\n' +
      '          if (anyHit) { out.hit = true; return out; }\n' +
      '          best = tmin; bestK = kmin; bestSign = smin; bestB = b.id;\n' +
      '        }\n' +
      '        continue;\n' +
      '      }\n' +
      '      _o.x = ox; _o.y = oy; _o.z = oz;\n' +
      '      let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;';
    code = replaceOnce(code, oldRayAligned, newRayAligned, 'nonwasm: fast general aligned AABB slab in raycast');
  }

  if (rel === 'src/audio/audio.js') {
    // Cache per-voice panner/lowpass/reverb targets in _setPos to skip redundant setTargetAtTime calls
    // (especially distCut(d) === 22000 for all d < 10 and stationary emitters).
    const oldSetPos =
      '  _setPos(voice, pos, t) {\n' +
      '    if (!voice.panner || !validPos(pos)) return;\n' +
      '    const p = voice.panner;\n' +
      '    if (p.positionX) { p.positionX.setTargetAtTime(pos.x, t, 0.02); p.positionY.setTargetAtTime(pos.y, t, 0.02); p.positionZ.setTargetAtTime(pos.z, t, 0.02); }\n' +
      '    else p.setPosition(pos.x, pos.y, pos.z);\n' +
      '    const d = this._dist(pos) * (voice.dk || 1);\n' +
      '    voice.lp.frequency.setTargetAtTime(distCut(d), t, 0.05);\n' +
      '    if (voice.send) voice.send.gain.setTargetAtTime(voice.rev * this._sendScale(d), t, 0.05);\n' +
      '  }';
    const newSetPos =
      '  _setPos(voice, pos, t) {\n' +
      '    if (!voice.panner || !validPos(pos)) return;\n' +
      '    const p = voice.panner;\n' +
      '    const px = pos.x, py = pos.y, pz = pos.z;\n' +
      '    if (p.positionX) {\n' +
      '      if (voice._px !== px) { voice._px = px; p.positionX.setTargetAtTime(px, t, 0.02); }\n' +
      '      if (voice._py !== py) { voice._py = py; p.positionY.setTargetAtTime(py, t, 0.02); }\n' +
      '      if (voice._pz !== pz) { voice._pz = pz; p.positionZ.setTargetAtTime(pz, t, 0.02); }\n' +
      '    } else if (voice._px !== px || voice._py !== py || voice._pz !== pz) {\n' +
      '      voice._px = px; voice._py = py; voice._pz = pz; p.setPosition(px, py, pz);\n' +
      '    }\n' +
      '    const d = this._dist(pos) * (voice.dk || 1);\n' +
      '    const cut = distCut(d);\n' +
      '    if (voice._lpFreq !== cut) { voice._lpFreq = cut; voice.lp.frequency.setTargetAtTime(cut, t, 0.05); }\n' +
      '    if (voice.send) {\n' +
      '      const sg = voice.rev * this._sendScale(d);\n' +
      '      if (voice._sendGain !== sg) { voice._sendGain = sg; voice.send.gain.setTargetAtTime(sg, t, 0.05); }\n' +
      '    }\n' +
      '  }';
    code = replaceOnce(code, oldSetPos, newSetPos, 'nonwasm: deduplicate _setPos AudioParam setTargetAtTime');
  }

  if (rel === 'src/game/bots.js') {
    // 1. Remove per-call [0, 1, -1] array literal allocation in _fatLos
    const oldFatLos =
      '    for (const o of [0, 1, -1]) {\n' +
      '      _v.set(ax + px * o, ay + 0.45, az + pz * o); _v2.set(bx + px * o, by + 0.45, bz + pz * o);\n' +
      '      if (!G.physics.los(_v, _v2)) return false;\n' +
      '    }';
    const newFatLos =
      '    for (let k = 0; k < 3; k++) {\n' +
      '      const o = k === 0 ? 0 : k === 1 ? 1 : -1;\n' +
      '      _v.set(ax + px * o, ay + 0.45, az + pz * o); _v2.set(bx + px * o, by + 0.45, bz + pz * o);\n' +
      '      if (!G.physics.los(_v, _v2)) return false;\n' +
      '    }';
    code = replaceOnce(code, oldFatLos, newFatLos, 'nonwasm: remove [0, 1, -1] array alloc in bots _fatLos');

    // 2. Short-circuit jump edge check in _steer before calling nav.edgeType
    const oldJumpEdge =
      '    if (this.pi > 0) {\n' +
      '      const et = nav.edgeType(this.path[this.pi - 1], this.path[this.pi]);\n' +
      "      if (et === 'jump' && cur.y - a.pos.y > (G.level.manifest?.sourceNavigation?.highDrops ? PLAYER.stepUp : 0.4) && hd < 1.6) this._needJump = true;\n" +
      '    }';
    const newJumpEdge =
      '    if (this.pi > 0 && cur.y - a.pos.y > (G.level.manifest?.sourceNavigation?.highDrops ? PLAYER.stepUp : 0.4) && hd < 1.6) {\n' +
      "      if (nav.edgeType(this.path[this.pi - 1], this.path[this.pi]) === 'jump') this._needJump = true;\n" +
      '    }';
    code = replaceOnce(code, oldJumpEdge, newJumpEdge, 'nonwasm: short-circuit nav.edgeType in bots _steer');
  }

  return code;
}
