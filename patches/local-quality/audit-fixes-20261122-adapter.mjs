// Build-only audit bugfixes, security guards, GPU/audio resource leak fixes,
// and behavior-preserving hot-path optimizations applied at the end of source
// composition. Never edit inkwave-public/ directly.
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
    code = replaceOnce(
      code,
      '    materialHandoff.dispose(() => { if (this.match) this.match.dispose(); });',
      '    this._stopLocalLoops();\n    materialHandoff.dispose(() => { if (this.match) this.match.dispose(); });',
      'main _startAttract stop local audio loops before menu transition',
    );
    code = replaceOnce(
      code,
      '  async quitToMenu() {\n    if (this._resultsMusicTimer != null) clearTimeout(this._resultsMusicTimer); this._resultsMusicTimer = null;',
      '  async quitToMenu() {\n    this._stopLocalLoops();\n    if (this._resultsMusicTimer != null) clearTimeout(this._resultsMusicTimer); this._resultsMusicTimer = null;',
      'main quitToMenu stop local audio loops',
    );
    code = replaceOnce(
      code,
      '  _updateLocalLoops(dt) {',
      '  _stopLocalLoops() {\n    if (!this._loops) return;\n    for (const k of Object.keys(this._loops)) { this._loops[k]?.stop?.(0.05); this._loops[k] = null; }\n  }\n\n  _updateLocalLoops(dt) {',
      'main add _stopLocalLoops helper',
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

  if (rel === 'src/core/mobile.js') {
    code = replaceOnce(
      code,
      '    pending.weapon = weapon; pending.specialId = specialId; pending.ink = ink; pending.subCost = subCost; pending.subReady = subReady;',
      '    pending.weapon = weapon; pending.subId = subId; pending.specialId = specialId; pending.ink = ink; pending.subCost = subCost; pending.subReady = subReady;',
      'mobile setHud preserve subId in pending snapshot',
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

  if (rel === 'src/game/match.js') {
    code = replaceOnce(
      code,
      `    this.actors.splice(i, 1);
    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot`,
      `    this.actors.splice(i, 1);
    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot
    if (G.rig?.target === a) G.rig.target = null;
    if (G.rig?._prevTarget === a) G.rig._prevTarget = null;
    if (G.game?._attractFollow === a) G.game._attractFollow = null;
    G.hud?.releaseMatchActors?.([a], this);
    G.game?.diorama?.releaseMatchActors?.([a], this);`,
      'match removeActor clear rig, hud, and diorama references',
    );
    code = replaceOnce(
      code,
      `      if (d2 < r * r && Math.abs(dy) < 1.2 && d2 > 1e-5) {
        // online: other players' squidkids are where their owners say — only your own side gives way
        const ka = a.remote ? 0 : b.remote ? 1 : 0.5, kb = b.remote ? 0 : a.remote ? 1 : 0.5;
        const d = Math.sqrt(d2), push = (r - d);
        softPushActor(G.physics, PLAYER, a, -(dx / d) * push * ka, -(dz / d) * push * ka);
        softPushActor(G.physics, PLAYER, b, (dx / d) * push * kb, (dz / d) * push * kb);
      }`,
      `      if (d2 < r * r && Math.abs(dy) < 1.2) {
        // online: other players' squidkids are where their owners say — only your own side gives way
        const ka = a.remote ? 0 : b.remote ? 1 : 0.5, kb = b.remote ? 0 : a.remote ? 1 : 0.5;
        const d = Math.sqrt(d2), push = (r - d);
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        softPushActor(G.physics, PLAYER, a, -nx * push * ka, -nz * push * ka);
        softPushActor(G.physics, PLAYER, b, nx * push * kb, nz * push * kb);
      }`,
      'match softPush separate coincident actors',
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
      '    this.baseFov = battleHorizontalFov(this.mode, this.target, this.spectate);',
      '    this.baseFov = battleHorizontalFov(this.mode, this.target, this.spectate?.actor);',
      'cameraRig pass spectate.actor to battleHorizontalFov',
    );
    code = replaceOnce(
      code,
      `      this._inkwaveCameraProbeCache = { target: a, mode: this.mode, level: G.level,
        physics: _qcPhysics, probe: _qcPhysics.cameraProbe, raycast: _qcPhysics.raycast,
        collisionLevel: _qcLevel, blocks: _qcLevel?.blocks, hash: _qcLevel?.hash,
        blockStamp: _qcLevel?.blockStamp, px: this.pivot.x, py: this.pivot.y, pz: this.pivot.z,
        bx: _back.x, by: _back.y, bz: _back.z, want: this.wantDist,
        hard: _probe.hard, soft: _probe.soft, floor: _probe.floor, age: 0 };`,
      `      const _qc = _qcOld || (this._inkwaveCameraProbeCache = {});
      _qc.target = a; _qc.mode = this.mode; _qc.level = G.level;
      _qc.physics = _qcPhysics; _qc.probe = _qcPhysics.cameraProbe; _qc.raycast = _qcPhysics.raycast;
      _qc.collisionLevel = _qcLevel; _qc.blocks = _qcLevel?.blocks; _qc.hash = _qcLevel?.hash;
      _qc.blockStamp = _qcLevel?.blockStamp; _qc.px = this.pivot.x; _qc.py = this.pivot.y; _qc.pz = this.pivot.z;
      _qc.bx = _back.x; _qc.by = _back.y; _qc.bz = _back.z; _qc.want = this.wantDist;
      _qc.hard = _probe.hard; _qc.soft = _probe.soft; _qc.floor = _probe.floor; _qc.age = 0;`,
      'cameraRig reuse _inkwaveCameraProbeCache in place',
    );
    code = replaceOnce(
      code,
      '    _v2.copy(this.pivot).addScaledVector(fwd, 10);\n    _v2.y += 0.15;',
      '    _v2.copy(this.pivot).addScaledVector(fwd, 10);\n    _v2.y += 0.15 + this.lensLift.x;',
      'cameraRig _follow keep aim parallel when lensLift raises camera',
    );
  }

  if (rel === 'src/game/player.js') {
    code = replaceOnce(
      code,
      '    if (as && as.prevValid && (lookActive || ml > 0.2 || it.fire)) {',
      '    if (!mapUp && as && as.prevValid && (lookActive || ml > 0.2 || it.fire)) {',
      'player disable tracking assist while map diorama is open',
    );
    code = replaceOnce(
      code,
      `  captureMapGyro(open) {
    const mobile=this.input.mobile, gyro=mobile?.active && mobile.root && mobile.gyro;
    if (!gyro?.enabled) { this.clearMapGyro(); return {yaw:0,pitch:0}; }
    open=!!open;
    if (open !== !!this._mapGyroOpen) {
      this.clearMapGyro(); this._mapGyroOpen=open; gyro.discard(); return {yaw:0,pitch:0};
    }
    const delta=gyro.consume(this._gyro || (this._gyro={yaw:0,pitch:0}));
    if (!open) return delta;
    this._mapGyroYaw=(this._mapGyroYaw || 0)+(Number.isFinite(delta.yaw)?delta.yaw:0);
    this._mapGyroPitch=(this._mapGyroPitch || 0)+(Number.isFinite(delta.pitch)?delta.pitch:0);
    return {yaw:0,pitch:0};
  }`,
      `  captureMapGyro(open) {
    const zero = this._zeroGyro || (this._zeroGyro = Object.freeze({ yaw: 0, pitch: 0 }));
    const mobile=this.input.mobile, gyro=mobile?.active && mobile.root && mobile.gyro;
    if (!gyro?.enabled) { this.clearMapGyro(); return zero; }
    open=!!open;
    if (open !== !!this._mapGyroOpen) {
      this.clearMapGyro(); this._mapGyroOpen=open; gyro.discard(); return zero;
    }
    const delta=gyro.consume(this._gyro || (this._gyro={yaw:0,pitch:0}));
    if (!open) return delta;
    this._mapGyroYaw=(this._mapGyroYaw || 0)+(Number.isFinite(delta.yaw)?delta.yaw:0);
    this._mapGyroPitch=(this._mapGyroPitch || 0)+(Number.isFinite(delta.pitch)?delta.pitch:0);
    return zero;
  }`,
      'player captureMapGyro reuse frozen zero object',
    );
    code = replaceOnce(
      code,
      '    const a = this.a, cam = G.camera;',
      '    const a = this.a, cam = this.rig?.gameCam || G.camera;',
      'player _assistTarget use gameCam instead of diorama camera',
    );
  }

  if (rel === 'src/game/bots.js') {
    code = replaceOnce(
      code,
      `    if (evading && (this.evadeT <= 0 || !this.path)) { this._bossEvade(boss, th); this.evadeT = 0.45; }
    else if (!evading && this._wasEvading) { this.path = null; this.goalTimer = 0; }
    this._wasEvading = evading;
    if (!evading) {
      if (this.mode === 'refill') { if (this.repath <= 0 || !this.path) this._pickRefill(); }
      else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length || (boss.stunned && !this._rushing)) this._bossGoal(boss);
    }`,
      `    if (evading && (this.evadeT <= 0 || !this._wasEvading)) { this._bossEvade(boss, th); this.evadeT = 0.45; }
    else if (!evading && this._wasEvading) { this.path = null; this.goalTimer = 0; }
    this._wasEvading = evading;
    if (!evading) {
      if (this.mode === 'refill') { if (this.repath <= 0) this._pickRefill(); }
      else if (this.goalTimer <= 0 || (boss.stunned && !this._rushing)) this._bossGoal(boss);
    }`,
      'bots _bossTick stop bypassing cooldown timers on path failure',
    );
    code = replaceOnce(
      code,
      `        const wr = a.weaponRunner;
        if (family === 'charger' || family === 'stringer' || family === 'splatana') {
          const releaseAt = family === 'splatana' ? 0.45 : this.chargeRelease;
          it.fire = !(wr.charging && wr.charge >= releaseAt);
          if (wr.charging) move.multiplyScalar(0.3);
        }
        else if (family === 'splatling') { it.fire = !wr.streaming && !(wr.charging && wr.charge >= this.chargeRelease * 0.9); if (wr.charging) move.multiplyScalar(0.45); }
        else if (family === 'roller') it.fire = dist < 5.5 || (wr.rolling && dist < 8);
        else it.fire = true;`,
      `        const wr = a.weaponRunner;
        const brush = w.catalogRecord?.family === 'brush';
        const brella = w.catalogRecord?.family === 'brella';
        const pencil = w.sourceMainActor === 'WeaponChargerPencil';
        if (family === 'charger' || family === 'stringer' || family === 'splatana') {
          const releaseAt = pencil ? 1 : family === 'splatana' ? 0.45 : this.chargeRelease;
          it.fire = pencil && wr.catalogState?.rounds > 0 ? botReadyPress(a) : !(wr.charging && wr.charge >= releaseAt);
          if (wr.charging) move.multiplyScalar(0.3);
        }
        else if (family === 'splatling') { it.fire = !wr.streaming && !(wr.charging && wr.charge >= this.chargeRelease * 0.9); if (wr.charging) move.multiplyScalar(0.45); }
        else if (family === 'roller') it.fire = brush ? dist < 5.5 && botReadyPress(a) : dist < 5.5 || (wr.rolling && dist < 8);
        else it.fire = !brella || botReadyPress(a);`,
      'bots _bossTick handle pencil, brella, and brush fire edge presses',
    );
  }

  if (rel === 'src/boss/boss.js') {
    code = replaceOnce(
      code,
      '    this.st = { speed: 0, turn: 0, move: null, moveT: 0, movePhase: null, phaseDur: 0, phase: 1, stunned: false, hurt: 0, dead: false, aim: null };',
      '    this.st = { speed: 0, turn: 0, move: null, moveT: 0, movePhase: null, phaseDur: 0, phase: 1, stunned: false, hurt: 0, dead: false, aim: null, params: null };',
      'boss init st.params field',
    );
    code = replaceOnce(
      code,
      `    if (this.anim) {
      st.move = this.anim === 1 ? 'intro' : 'roar'; st.movePhase = 'act'; st.moveT = this.bt - this.animT0; st.phaseDur = this.anim === 1 ? BOSS.introLen : BOSS.roarLen;
    } else if (m && !this.dead) {
      const u = this.bt - m.t0, ph = movePhaseAt(m, u), T = moveTimes(m);
      st.move = ph ? m.id : null; st.movePhase = ph;
      const start = ph === 'tele' ? 0 : ph === 'act' ? T.tele : T.tele + T.act;
      st.moveT = u - start; st.phaseDur = ph === 'tele' ? T.tele : ph === 'act' ? T.act : T.rec;
      st.aim = this._moveAim(m, u, _aim);
    } else { st.move = null; st.movePhase = null; st.moveT = 0; st.phaseDur = 0; }`,
      `    if (this.anim) {
      st.move = this.anim === 1 ? 'intro' : 'roar'; st.movePhase = 'act'; st.moveT = this.bt - this.animT0; st.phaseDur = this.anim === 1 ? BOSS.introLen : BOSS.roarLen; st.params = null;
    } else if (m && !this.dead) {
      const u = this.bt - m.t0, ph = movePhaseAt(m, u), T = moveTimes(m);
      st.move = ph ? m.id : null; st.movePhase = ph; st.params = ph ? m.p : null;
      const start = ph === 'tele' ? 0 : ph === 'act' ? T.tele : T.tele + T.act;
      st.moveT = u - start; st.phaseDur = ph === 'tele' ? T.tele : ph === 'act' ? T.act : T.rec;
      st.aim = this._moveAim(m, u, _aim);
    } else { st.move = null; st.movePhase = null; st.moveT = 0; st.phaseDur = 0; st.params = null; }`,
      'boss _modelUpdate propagate st.params to BossAnimator',
    );
  }

  if (rel === 'src/game/character.js') {
    code = replaceOnce(
      code,
      `    _pD.divideScalar(originalDistance || 1);
    const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _pN.copy(_sPole).addScaledVector(_pD, -_sPole.dot(_pD));
    if (_pN.lengthSq() < 1e-8) { _pN.set(0, 0, 1).addScaledVector(_pD, -_pD.z); }`,
      `    if (originalDistance < 1e-6) _pD.set(0, -1, 0); else _pD.divideScalar(originalDistance);
    const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _pN.copy(_sPole).addScaledVector(_pD, -_sPole.dot(_pD));
    if (_pN.lengthSq() < 1e-8) { if (Math.abs(_pD.z) < 0.9) _pN.set(0, 0, 1).addScaledVector(_pD, -_pD.z); else _pN.set(1, 0, 0).addScaledVector(_pD, -_pD.x); }`,
      'character _solveLimb handle zero distance and Z-parallel pole degeneracy',
    );
  }

  if (rel === 'src/game/showcase.js') {
    code = replaceOnce(
      code,
      `    while (this._pq.length && !this._pq[0].cbs.length) this._pq.shift();
    const job = this._pq.shift();`,
      `    while (this._pq.length && !this._pq[0].cbs.length) this._pq.shift();
    if (this._pq.length && (this._pflight || 0) > 0 && this._prt8 && this._prt8.width !== (this._pq[0].req?.size || 256)) return;
    const job = this._pq.shift();`,
      'showcase wait for inflight portrait readback before resizing _prt8',
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
      '  float sd = max(dot(normalize(vec3(d.x, hp, d.z)), uSunDir), 0.0);',
      '  vec3 dUp = vec3(d.x, hp, d.z); float dUpL = dot(dUp, dUp);\n  float sd = dUpL > 1e-8 ? max(dot(dUp * inversesqrt(dUpL), uSunDir), 0.0) : 0.0;',
      'environment skyGradient guard normalize(0) at south pole',
    );
    code = replaceOnce(
      code,
      '  vec3 h = skyGradient(normalize(vec3(d.x, clamp(d.y, 0.0, 1.0) * 0.3, d.z)));',
      '  vec3 hd = vec3(d.x, clamp(d.y, 0.0, 1.0) * 0.3, d.z); float hdL = dot(hd, hd);\n  vec3 h = skyGradient(hdL > 1e-8 ? hd * inversesqrt(hdL) : vec3(0.0, 1.0, 0.0));',
      'environment hazeColor guard normalize(0) when looking straight down',
    );
    code = replaceOnce(
      code,
      '    float u = atan(d.z, d.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      '    float u = (abs(d.x) + abs(d.z) > 1e-5 ? atan(d.z, d.x) : 0.0) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      'environment SKY_FRAG guard atan(0,0)',
    );
    code = replaceOnce(
      code,
      '        float uu = atan(s.z, s.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      '        float uu = (abs(s.x) + abs(s.z) > 1e-5 ? atan(s.z, s.x) : 0.0) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      'environment SKY_SHAFTS guard atan(0,0)',
    );
    code = replaceOnce(
      code,
      '  float u = atan(R.z, R.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      '  float u = (abs(R.x) + abs(R.z) > 1e-5 ? atan(R.z, R.x) : 0.0) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;',
      'environment skyRefl guard atan(0,0)',
    );
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
      '      vec3 Tt = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bb = cross(vWNorm, Tt);',
      '      vec3 Tt0 = vFaceTan - vWNorm * dot(vFaceTan, vWNorm); float TtL = dot(Tt0, Tt0);\n      vec3 Tt = TtL > 1e-6 ? Tt0 * inversesqrt(TtL) : normalize(cross(abs(vWNorm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), vWNorm));\n      vec3 Bb = cross(vWNorm, Tt);',
      'levelMaterial guard ramp tangent normalize(0)',
    );
    code = replaceOnce(
      code,
      '    int mi = int(vFaceFlags.z + 0.5);\n    vec4 mA = uMurA[mi], mB = uMurB[mi];',
      '    int mi = clamp(int(vFaceFlags.z + 0.5), 0, 11);\n    vec4 mA = uMurA[mi], mB = uMurB[mi];',
      'levelMaterial clamp uMurA index',
    );
    code = replaceOnce(
      code,
      '  vec3 T = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm));',
      '  vec3 T0 = vFaceTan - vWNorm * dot(vFaceTan, vWNorm); float TL = dot(T0, T0);\n  vec3 T = TL > 1e-6 ? T0 * inversesqrt(TL) : normalize(cross(abs(vWNorm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), vWNorm));',
      'levelMaterial guard bevel corner tangent normalize(0)',
    );
  }

  if (rel === 'src/world/inkShading.js') {
    code = replaceOnce(
      code,
      '        vec3 Tf = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bf = cross(vWNorm, Tf);',
      '        vec3 Tf0 = vFaceTan - vWNorm * dot(vFaceTan, vWNorm); float TfL = dot(Tf0, Tf0);\n        vec3 Tf = TfL > 1e-6 ? Tf0 * inversesqrt(TfL) : normalize(cross(abs(vWNorm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), vWNorm));\n        vec3 Bf = cross(vWNorm, Tf);',
      'inkShading guard bevel corner tangent normalize(0)',
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    code = replaceOnce(
      code,
      '        float fres = pow(1.0 - n.z, 1.6);',
      '        float fres = pow(max(1.0 - clamp(n.z, 0.0, 1.0), 1e-5), 1.6);',
      'screenfx guard water droplet pow(<=0, 1.6)',
    );
    code = replaceOnce(
      code,
      `    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {`,
      `    const P = this.parts;
    const trails = this._pendingTrails || (this._pendingTrails = []);
    trails.length = 0;
    for (let i = P.length - 1; i >= 0; i--) {`,
      'screenfx LensInk init deferred trail queue',
    );
    code = replaceOnce(
      code,
      `            this.add('trail', p.ch, p.x, p.y + p.r * 0.45, p.r * 0.55, { rx: p.r * 0.42, ry: p.r * 0.72, I: 0.5, life: 1.2, pop: 0 });`,
      `            trails.push(p.ch, p.x, p.y + p.r * 0.45, p.r * 0.55, p.r * 0.42, p.r * 0.72);`,
      'screenfx LensInk defer trail add outside reverse splice loop',
    );
    code = replaceOnce(
      code,
      `        if (p.y < -0.1) { P.splice(i, 1); this.pool.push(p); continue; }
      }
    }
    this.dirty = true;`,
      `        if (p.y < -0.1) { P.splice(i, 1); this.pool.push(p); continue; }
      }
    }
    for (let j = 0; j < trails.length; j += 6) {
      this.add('trail', trails[j], trails[j + 1], trails[j + 2], trails[j + 3], { rx: trails[j + 4], ry: trails[j + 5], I: 0.5, life: 1.2, pop: 0 });
    }
    trails.length = 0;
    this.dirty = true;`,
      'screenfx LensInk flush deferred trail queue after loop',
    );
  }

  if (rel === 'src/fx/fx.js') {
    code = replaceOnce(
      code,
      '    for (const p of [this.puffs, this.glows, this.rings, this.shells, this.beams]) { p.n = 0; p.geo.instanceCount = 0; }',
      '    for (const p of [this.puffs, this.glows, this.rings, this.shells, this.beams]) { p.n = 0; p.geo.instanceCount = 0; p._netSource?.fill(null); }',
      'fx clear release _netSource projectile references',
    );
  }

  if (rel === 'src/audio/bossAudio.js') {
    code = replaceOnce(
      code,
      '    if (!h || h.playing === false) return;',
      '    if (!h || (h.playing === false && !h._sfxDeferred)) return;',
      'bossAudio retain deferred loop handles while SFX muted',
    );
  }

  if (rel === 'src/audio/audio.js') {
    code = replaceOnce(
      code,
      '    const hp = ctx.createBiquadFilter(); hp.type = \'highpass\'; hp.frequency.value = 25; hp.Q.value = 0.707;',
      '    const hp = ctx.createBiquadFilter(); hp.type = \'highpass\'; hp.frequency.value = 25; hp.Q.value = 0.707;\n    this._hp = hp;',
      'audio keep reference to highpass filter for dispose',
    );
    code = replaceOnce(
      code,
      `    rec.live = this._loopLive(rec.name, rec.d, rec.o || {});`,
      `    rec.live = this._loopLive(rec.name, rec.d, rec.o || {}, rec);
    if (rec.live === NOOP_HANDLE) { rec.stopped = true; this._sfxReq.delete(rec); rec.live = null; }`,
      'audio remove dropped loop request from _sfxReq',
    );
    code = replaceOnce(
      code,
      `  _loopLive(name, d, o) {
    for (const h of this.loops) if (!h.playing) this.loops.delete(h);
    const priority = Number.isFinite(o.priority) ? o.priority : 35;
    if (this.loops.size >= MAX_LOOPS) {
      let victim = null;
      for (const h of this.loops) if (!victim || h.priority < victim.priority) victim = h;
      if (!victim || victim.priority > priority) { this.counts.dropped++; return NOOP_HANDLE; }
      victim.stop(0.05);
    }`,
      `  _loopLive(name, d, o, ownerRec = null) {
    for (const h of this.loops) if (!h.playing) this.loops.delete(h);
    const priority = Number.isFinite(o.priority) ? o.priority : 35;
    if (this.loops.size >= MAX_LOOPS) {
      let victim = null;
      for (const h of this.loops) if (!victim || h.priority < victim.priority) victim = h;
      if (!victim || victim.priority > priority) { this.counts.dropped++; return NOOP_HANDLE; }
      if (victim._sfxReqOwner) { victim._sfxReqOwner.stopped = true; this._sfxReq?.delete(victim._sfxReqOwner); victim._sfxReqOwner.live = null; }
      victim.stop(0.05);
    }`,
      'audio unlink stolen loop victim from _sfxReq',
    );
    code = replaceOnce(
      code,
      '    this.loops.add(h);',
      '    if (ownerRec) h._sfxReqOwner = ownerRec;\n    this.loops.add(h);',
      'audio tag loop handle with _sfxReqOwner',
    );
    code = replaceOnce(
      code,
      `    this.ctx = null; this.ready = false;
    this.last.clear(); this.byName.clear(); this._warned.clear();`,
      `    for (const node of [this.master, this.sfxBus, this.musicBus, this.duckG, this.sfxIn, this.revSend, this.conv, this.revRet, this._hp, this.glue, this.limiter, this.outputSafety]) {
      try { node?.disconnect?.(); } catch {}
    }
    if (this.conv) { try { this.conv.buffer = null; } catch {} }
    this.master = this.sfxBus = this.musicBus = this.duckG = this.sfxIn = this.revSend = this.conv = this.revRet = this._hp = this.glue = this.limiter = this.outputSafety = null;
    this.ctx = null; this.ready = false;
    this.last.clear(); this.byName.clear(); this._warned.clear();`,
      'audio dispose disconnect all bus nodes and release convolver buffer',
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
    code = replaceOnce(
      code,
      `function unpackTrig(d) {
  if (!d) return undefined;
  if (typeof d === 'number') return d;
  if (typeof d === 'object') { const o = { ...d }; if (o.amp !== undefined) o.valueOf = queueTriggerAmplitude; else if (o.hand !== undefined) o.valueOf = queueTriggerHand; return o; }
  return undefined;
}`,
      `function unpackTrig(d) {
  if (!d) return undefined;
  if (typeof d === 'number') return Number.isFinite(d) ? d : undefined;
  if (typeof d === 'object' && !Array.isArray(d)) {
    const o = {};
    let has = false;
    for (const k of Object.keys(d)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = d[k];
      if (typeof v === 'number' && Number.isFinite(v)) { o[k] = v; has = true; }
    }
    if (!has) return undefined;
    if (o.amp !== undefined) o.valueOf = queueTriggerAmplitude; else if (o.hand !== undefined) o.valueOf = queueTriggerHand;
    return o;
  }
  return undefined;
}`,
      'netmatch unpackTrig validate finite numeric trigger arguments',
    );
  }

  if (rel === 'src/net/session.js') {
    code = replaceOnce(
      code,
      '      if (handoff) this._restartStartingBarrier(handoff);',
      '      if (handoff) this._restartStartingBarrier(handoff);\n      else if (this.isHost && this.state === \'starting\' && this._setupReady && this._startCfg) this._markReady(this.myId);',
      'session recheck starting barrier when non-host guest leaves',
    );
  }

  if (rel === 'src/ui/diorama.js') {
    code = replaceOnce(
      code,
      '    for (const pin of this.pins) if (!actors || (pin.target && actors.includes(pin.target))) {\n      pin.target = null; pin.ok = false; pin.vis = false; pin.key = \'\';\n      pin.el.style.display = \'none\'; cleared = true;\n    }',
      '    for (const pin of this.pins) if (!actors || (pin.target && actors.includes(pin.target))) {\n      const dirty = pin.target != null || pin.ok || pin.vis || pin.key !== \'\' || pin.el.style.display !== \'none\';\n      pin.target = null; pin.ok = false; pin.vis = false; pin.key = \'\';\n      if (pin.el.style.display !== \'none\') pin.el.style.display = \'none\';\n      if (dirty) cleared = true;\n    }',
      'diorama releaseMatchActors skip redundant style writes',
    );
    code = replaceOnce(
      code,
      '    if (!this.on) { this.releaseMatchActors(); return; }',
      '    if (!this.on) { if (was || this._targetMatch || this._pinTaps?.size) this.releaseMatchActors(); return; }',
      'diorama avoid per-frame releaseMatchActors while hidden',
    );
  }

  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(
      code,
      '    this._bossSquadViews?.forEach(view => { view.players.length = 0; }); this._bossSquadViews = null;',
      '    if (Object.hasOwn(this, \'_tankBox\')) { this._tankBox?.ro?.disconnect(); this._tankBox = null; }\n    this._bossSquadViews?.forEach(view => { view.players.length = 0; }); this._bossSquadViews = null;',
      'hud dispose disconnect _tankBox ResizeObserver',
    );
    code = replaceOnce(
      code,
      `        const cameraSight = this.ret.querySelector('.iw-ret__dual-camera');
        cameraSight?.setAttribute('transform', \`translate(\${(-(L.guideX || 0) / reticleScale).toFixed(2)} \${(-(L.guideY || 0) / reticleScale).toFixed(2)})\`);`,
      `        const cameraSight = this._dualCamera?.isConnected ? this._dualCamera : (this._dualCamera = this.ret.querySelector('.iw-ret__dual-camera'));
        const camTf = \`translate(\${(-(L.guideX || 0) / reticleScale).toFixed(2)} \${(-(L.guideY || 0) / reticleScale).toFixed(2)})\`;
        if (cameraSight && L.dualCamTf !== camTf) { L.dualCamTf = camTf; cameraSight.setAttribute('transform', camTf); }`,
      'hud cache dualies cameraSight element and dirty-check transform',
    );
    code = replaceOnce(
      code,
      `          this._dualMerged.setAttribute('transform', \`translate(\${x.toFixed(2)} \${y.toFixed(2)})\`);`,
      `          const mergedTf = \`translate(\${x.toFixed(2)} \${y.toFixed(2)})\`;
          if (L.dualMergedTf !== mergedTf) { L.dualMergedTf = mergedTf; this._dualMerged.setAttribute('transform', mergedTf); }`,
      'hud dirty-check dualies merged reticle transform',
    );
    code = replaceOnce(
      code,
      `        if (reachOn) {
          this.ret.style.setProperty('--crx', (current.x * innerWidth * 0.5 / reticleScale).toFixed(1) + 'px');
          this.ret.style.setProperty('--cry', (-current.y * innerHeight * 0.5 / reticleScale).toFixed(1) + 'px');
          this.ret.style.setProperty('--cfx', (fullReach.x * innerWidth * 0.5 / reticleScale).toFixed(1) + 'px');
          this.ret.style.setProperty('--cfy', (-fullReach.y * innerHeight * 0.5 / reticleScale).toFixed(1) + 'px');
        }`,
      `        if (reachOn) {
          const crx = (current.x * innerWidth * 0.5 / reticleScale).toFixed(1) + 'px';
          const cry = (-current.y * innerHeight * 0.5 / reticleScale).toFixed(1) + 'px';
          const cfx = (fullReach.x * innerWidth * 0.5 / reticleScale).toFixed(1) + 'px';
          const cfy = (-fullReach.y * innerHeight * 0.5 / reticleScale).toFixed(1) + 'px';
          const rk = crx + '|' + cry + '|' + cfx + '|' + cfy;
          if (L.chargerReachKey !== rk) {
            L.chargerReachKey = rk;
            this.ret.style.setProperty('--crx', crx);
            this.ret.style.setProperty('--cry', cry);
            this.ret.style.setProperty('--cfx', cfx);
            this.ret.style.setProperty('--cfy', cfy);
          }
        }`,
      'hud dirty-check charger reach CSS custom properties',
    );
    code = replaceOnce(
      code,
      '        this.tank.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;',
      '        writeQueueTransform(this.tank, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`);',
      'hud dirty-check swim tank transform',
    );
    code = replaceOnce(
      code,
      `    for (let i = tg.length; i < this.beacons.length; i++) {
      this.beacons[i].style.display = 'none';
      this._updLegendRow(i, null, false);
    }`,
      `    for (let i = tg.length; i < this.beacons.length; i++) {
      if (this.beacons[i]._key !== 'x') { this.beacons[i]._key = 'x'; this.beacons[i].style.display = 'none'; }
      this._updLegendRow(i, null, false);
    }`,
      'hud _updBeacons reset _key when hiding unused beacon slots',
    );
  }

  if (rel === 'src/ui/menu-art.js') {
    code = replaceOnce(
      code,
      `      t = (t + dt / 2.6) % 1;
      // raw sweep left → right; assisted path eases toward the target centre (160, 100) as it passes
      const x0 = 30 + t * 260, near = v === 0 ? 0 : Math.exp(-Math.pow((x0 - 160) / 60, 2));
      const x = x0 + (160 - x0) * near * v * 0.55, y = 64 + (100 - 64) * near * v;
      xEl.setAttribute('transform', \`translate(\${x.toFixed(1)} \${y.toFixed(1)})\`);
      if (t < 0.02) trailD = \`M\${x.toFixed(1)} \${y.toFixed(1)}\`;
      else trailD += \` L\${x.toFixed(1)} \${y.toFixed(1)}\`;`,
      `      const next = t + dt / 2.6;
      const wrapped = !trailD || next >= 1;
      t = next % 1;
      // raw sweep left → right; assisted path eases toward the target centre (160, 100) as it passes
      const x0 = 30 + t * 260, near = v === 0 ? 0 : Math.exp(-Math.pow((x0 - 160) / 60, 2));
      const x = x0 + (160 - x0) * near * v * 0.55, y = 64 + (100 - 64) * near * v;
      xEl.setAttribute('transform', \`translate(\${x.toFixed(1)} \${y.toFixed(1)})\`);
      if (wrapped) trailD = \`M\${x.toFixed(1)} \${y.toFixed(1)}\`;
      else trailD += \` L\${x.toFixed(1)} \${y.toFixed(1)}\`;`,
      'menu-art previewAimAssist reset trail on wrap instead of t < 0.02',
    );
  }

  if (rel === 'src/ui/ui-icons.js') {
    code = replaceOnce(
      code,
      '  hand: svg(`<path d="M22 56 Q12 50 11 38 L10 30 Q10 26 13.5 26',
      '  wave: svg(`<path d="M22 56 Q12 50 11 38 L10 30 Q10 26 13.5 26',
      'ui-icons rename duplicate hand glyph to wave',
    );
  }

  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(
      code,
      "  { id: 'wave', label: 'HEY!', icon: 'hand', key: '2', dir: 'right' },",
      "  { id: 'wave', label: 'HEY!', icon: 'wave', key: '2', dir: 'right' },",
      'menus reference wave glyph for HEY emote',
    );
  }

  return code;
}
