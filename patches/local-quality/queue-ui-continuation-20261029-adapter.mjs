// Continuation of the current Library queues. Apply after all earlier source composition.
const changes = [
  {
    "rel": "src/ui/hud.js",
    "old": "  _addFx(name, fn) {",
    "new": "  _addFx(name, fn) {\n    this._fxClock ||= createPresentationClock();",
    "label": "visible FX clock owner",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "this._lastFx = performance.now();",
    "new": "this._lastFx = performance.now(); this._fxClock?.rebase(this._lastFx);",
    "label": "pause and resume rebase",
    "count": 3
  },
  {
    "rel": "src/ui/hud.js",
    "old": "    const raw = Math.min(0.25, Math.max(0, (t - this._lastFx) / 1000));",
    "new": "    const elapsed = this._fxClock ? this._fxClock.elapsed(t) : Math.max(0, (t - this._lastFx) / 1000);\n    const raw = Math.min(0.25, elapsed);",
    "label": "separate deadline and simulation delta",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "    this._fxTime += dt;",
    "new": "    this._fxTime += elapsed * this.timeScale;",
    "label": "visible HUD deadlines",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "    else { cancelAnimationFrame(this._rafId); this._rafId = 0; }",
    "new": "    else { cancelAnimationFrame(this._rafId); this._rafId = 0; }\n    if (!this._fxMap.size) { this._fxClock?.dispose(); this._fxClock = null; }",
    "label": "retire idle FX clock",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "  dispose() {",
    "new": "  dispose() {\n    this._fxClock?.dispose(); this._fxClock = null;",
    "label": "HUD clock disposal",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "        if (!this._fxMap?.size) { cancelAnimationFrame(this._rafId); this._rafId = 0; }",
    "new": "        if (!this._fxMap?.size) { cancelAnimationFrame(this._rafId); this._rafId = 0; this._fxClock?.dispose(); this._fxClock = null; }",
    "label": "judge cleanup retires a clock after cancelling the last RAF",
    "count": 1
  },
  {
    "rel": "src/ui/menu-art.js",
    "old": "    this._last = performance.now();",
    "new": "    this._wipeClock?.dispose(); this._wipeClock = createPresentationClock();\n    this._last = performance.now(); this._wipeClock.rebase(this._last);",
    "label": "wipe visible clock owner",
    "count": 1
  },
  {
    "rel": "src/ui/menu-art.js",
    "old": "    let dt = Math.min(50, Math.max(0, now - this._last));",
    "new": "    let dt = this._wipeClock ? this._wipeClock.elapsedMilliseconds(now) : Math.max(0, now - this._last);",
    "label": "wipe foreground time without truncation",
    "count": 1
  },
  {
    "rel": "src/ui/menu-art.js",
    "old": "    if (r.t >= r.dur) { this._finish(); return; }\n    if (this.r !== r) return; // onMid started another wipe",
    "new": "    if (this.r !== r) return; // onMid started another wipe\n    if (r.t >= r.dur) { this._finish(); return; }",
    "label": "nested onMid cannot finish its replacement",
    "count": 1
  },
  {
    "rel": "src/ui/menu-art.js",
    "old": "    this.r = null;\n    cancelAnimationFrame(this._raf);",
    "new": "    this.r = null;\n    this._wipeClock?.dispose(); this._wipeClock = null;\n    cancelAnimationFrame(this._raf);",
    "label": "wipe clock retirement",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "  update(dt) {\n    dt = Math.min(dt || 0, 0.1);\n    this._fdt = dt;\n    this._ffFrame = this.fullFrame;   // what main.js saw at the top of this frame (it didn't draw the world if true)\n    if (!this._warmState && G.env) this._warmup();\n    this._updateSet(dt);\n    let mode = OVERLAY.has(this.mode) ? this.mode : null;\n    if (!mode && this._out > 0) {\n      this._out -= dt;\n      if (this._out <= 0) { this._clear(); return; }\n      mode = this._lastMode;\n    }\n    if (!mode || !this.chars.length) return;\n    this.t += dt;\n    this.shotT += dt;\n    this.fadeIn = Math.min(1, this.fadeIn + dt / 0.25);\n    if (PEDESTAL.has(mode)) this._updateLoadout(dt);\n    else this._updateResults(dt);\n    this.fx.update(dt, this.decks);\n    this.confetti.update(dt, this.decks);\n    this.sparks.update(dt);\n    this.contact.instanceMatrix.needsUpdate = true;\n    if (this._contactColorDirty && this.contact.instanceColor) { this.contact.instanceColor.needsUpdate = true; this._contactColorDirty = false; }\n  }\n",
    "new": "  update(dt) {\n    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;\n    dt = Math.min(elapsed, 0.1);\n    this._fdt = dt;\n    this._ffFrame = this.fullFrame;   // what main.js saw at the top of this frame (it didn't draw the world if true)\n    if (!this._warmState && G.env) this._warmup();\n    this._updateSet(dt, elapsed);\n    let mode = OVERLAY.has(this.mode) ? this.mode : null;\n    if (!mode && this._out > 0) {\n      this._out -= elapsed;\n      if (this._out <= 0) { this._clear(); return; }\n      mode = this._lastMode;\n    }\n    if (!mode || !this.chars.length) return;\n    this.t += elapsed;\n    this.shotT += elapsed;\n    this.fadeIn = Math.min(1, this.fadeIn + elapsed / 0.25);\n    if (PEDESTAL.has(mode)) this._updateLoadout(dt);\n    else this._updateResults(dt);\n    this.fx.update(dt, this.decks);\n    this.confetti.update(dt, this.decks);\n    this.sparks.update(dt);\n    this.contact.instanceMatrix.needsUpdate = true;\n    if (this._contactColorDirty && this.contact.instanceColor) { this.contact.instanceColor.needsUpdate = true; this._contactColorDirty = false; }\n  }\n",
    "label": "showcase timelines preserve foreground elapsed",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "  _updateSet(dt) {\n    const L = this.lob;\n    if (!L) return;\n    const on = SET_MODES.has(this.mode);\n    L.k = on && L.ready ? Math.min(1, L.k + dt / SET_FADE) : Math.max(0, L.k - dt / SET_FADE);\n    if (!on && L.k <= 0) {\n      // off screen: kept (parked) while you're online — a room, the hub or a trip to the locker from either;\n      // released a moment after the online screens are left for good\n      const net = G.net && G.net.state && G.net.state !== 'offline' && G.net.state !== 'error';\n      const st = G.menus && G.menus._stack;\n      const keep = net || L.room || L.preload || (st && st.some((s) => s === 'online' || s === 'lobby')) || (G.menus && (G.menus.current === 'online' || G.menus.current === 'lobby'));\n      L.gone = keep ? 0 : L.gone + dt;\n      if (L.gone > 1.5) this._lobRelease();\n      return;\n    }\n    L.gone = 0;\n    L.preload = false;       // shown once: from here on it follows the normal parked / released rules\n    if (!L.ready) return;\n    const S = L.set;\n    const q = resolveLobbyQualityName(G.settings?.quality, G.mobile ?? G.game?.mobile);\n    if (q !== L.quality) { L.quality = q; S.setQuality?.(q); }\n    L.t += dt;\n    L.shotT += dt;\n    S.update?.(dt, L.t);\n    // members (kids + contact shadows)\n    let ci = 0;\n    const memberScratch = this._lobMemberScratch || (this._lobMemberScratch = []);\n    const members = this._lobMembersBusy ? [] : memberScratch;\n    for (const M of L.members.values()) members.push(M);\n    const wasBusy = this._lobMembersBusy; this._lobMembersBusy = true;\n    try { for (const M of members) {\n      this._lobStep(M, dt);\n      if (M.dead || !M.c || !M.c.root.visible || ci >= 10) continue;\n      const kidK = M.c.kidScale ?? (M.a.form === 'kid' ? 1 : 0);\n      const hgt = Math.max(0, M.y);\n      const al = kidK * (M.y < -0.05 ? 0 : 0.6 * (1 - c01(hgt / 1.4) * 0.8));\n      if (al > 0.01) this._lobContact(ci++, M.pos.x, M.pos.y + 0.004, M.pos.z, 0.66 * (1 + hgt * 0.6), al);\n    }\n    } finally { members.length = 0; this._lobMembersBusy = wasBusy; }\n    L.contact.count = ci;\n    if (ci) {\n      L.contact.instanceMatrix.needsUpdate = true;\n      if (L.contact.instanceColor) L.contact.instanceColor.needsUpdate = true;\n    }\n    L.fx[0].update(dt, L.decks); L.fx[1].update(dt, L.decks);\n    L.sparks.update(dt);\n    L.trail.update(dt);\n  }\n",
    "new": "  _updateSet(dt, elapsed = dt) {\n    const L = this.lob;\n    if (!L) return;\n    const on = SET_MODES.has(this.mode);\n    L.k = on && L.ready ? Math.min(1, L.k + elapsed / SET_FADE) : Math.max(0, L.k - elapsed / SET_FADE);\n    if (!on && L.k <= 0) {\n      // off screen: kept (parked) while you're online — a room, the hub or a trip to the locker from either;\n      // released a moment after the online screens are left for good\n      const net = G.net && G.net.state && G.net.state !== 'offline' && G.net.state !== 'error';\n      const st = G.menus && G.menus._stack;\n      const keep = net || L.room || L.preload || (st && st.some((s) => s === 'online' || s === 'lobby')) || (G.menus && (G.menus.current === 'online' || G.menus.current === 'lobby'));\n      L.gone = keep ? 0 : L.gone + elapsed;\n      if (L.gone > 1.5) this._lobRelease();\n      return;\n    }\n    L.gone = 0;\n    L.preload = false;       // shown once: from here on it follows the normal parked / released rules\n    if (!L.ready) return;\n    const S = L.set;\n    const q = resolveLobbyQualityName(G.settings?.quality, G.mobile ?? G.game?.mobile);\n    if (q !== L.quality) { L.quality = q; S.setQuality?.(q); }\n    L.t += elapsed;\n    L.shotT += elapsed;\n    S.update?.(dt, L.t);\n    // members (kids + contact shadows)\n    let ci = 0;\n    const memberScratch = this._lobMemberScratch || (this._lobMemberScratch = []);\n    const members = this._lobMembersBusy ? [] : memberScratch;\n    for (const M of L.members.values()) members.push(M);\n    const wasBusy = this._lobMembersBusy; this._lobMembersBusy = true;\n    try { for (const M of members) {\n      this._lobStep(M, dt);\n      if (M.dead || !M.c || !M.c.root.visible || ci >= 10) continue;\n      const kidK = M.c.kidScale ?? (M.a.form === 'kid' ? 1 : 0);\n      const hgt = Math.max(0, M.y);\n      const al = kidK * (M.y < -0.05 ? 0 : 0.6 * (1 - c01(hgt / 1.4) * 0.8));\n      if (al > 0.01) this._lobContact(ci++, M.pos.x, M.pos.y + 0.004, M.pos.z, 0.66 * (1 + hgt * 0.6), al);\n    }\n    } finally { members.length = 0; this._lobMembersBusy = wasBusy; }\n    L.contact.count = ci;\n    if (ci) {\n      L.contact.instanceMatrix.needsUpdate = true;\n      if (L.contact.instanceColor) L.contact.instanceColor.needsUpdate = true;\n    }\n    L.fx[0].update(dt, L.decks); L.fx[1].update(dt, L.decks);\n    L.sparks.update(dt);\n    L.trail.update(dt);\n  }\n",
    "label": "set release deadline and physical integration remain separate",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "    const previewTimers = new Set();",
    "new": "    const previewRetirement = createPreviewRetirement();",
    "label": "one owned preview retirement timer 1",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "const timer = setTimeout(() => { previewTimers.delete(timer); old.remove(); }, 260); previewTimers.add(timer);",
    "new": "previewRetirement.retire(old);",
    "label": "one owned preview retirement timer 2",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "        for (const timer of previewTimers) clearTimeout(timer);\n        previewTimers.clear(); P.cur = null;",
    "new": "        previewRetirement.destroy(); P.cur = null;",
    "label": "one owned preview retirement timer 3",
    "count": 1
  }
];
const imports = {
  "src/ui/hud.js": "import {createPresentationClock} from '../../patches/local-quality/presentation-clock.mjs';\n",
  "src/ui/menu-art.js": "import {createPresentationClock} from '../../patches/local-quality/presentation-clock.mjs';\n",
  "src/ui/menus.js": "import {createPreviewRetirement} from '../../patches/local-quality/preview-retirement.mjs';\n"
};

// Only the native FX pools are stepped here. The installed special director
// wraps update(), so recursive public update calls would advance that separate
// director more than once. Keep its outer boundary and stage native attributes
// only on the last bounded physical step.
function adaptFxElapsed(code) {
  const once = (before, after, label) => {
    const parts = code.split(before);
    if (parts.length !== 2) throw new Error('FX elapsed anchor: ' + label + ' (' + (parts.length - 1) + ')');
    code = parts.join(after);
  };
  once('  update(dt, camera) {\n', `  update(dt, camera) {
    if (!(Number.isFinite(dt) && dt > 0.05)) return this._updateFrameStep(dt, camera);
    // The platform already bounds foreground recovery to 250 ms. Keep that
    // boundary for direct callers as well; hidden time is never replayed here.
    const elapsed = Math.min(dt, 0.25), steps = Math.ceil(elapsed / 0.05);
    const previousDefer = this._fxDeferUpload, previousStart = this._fxFrameStart;
    this._fxFrameStart = this._time;
    try {
      for (let i = 0; i < steps; i++) {
        this._fxDeferUpload = previousDefer || i + 1 < steps;
        const step = i + 1 < steps ? 0.05 : elapsed - 0.05 * (steps - 1);
        this._updateFrameStep(step, camera);
      }
      // Public emission helpers consume the previous outer frame's capped
      // delta. A short final remainder must not halve their next-frame rate.
      this._dt = 0.05;
    } finally {
      this._fxDeferUpload = previousDefer;
      this._fxFrameStart = previousStart;
    }
  }
  _updateFrameStep(dt, camera) {
`, 'bounded physical steps');
  once("    if (G.match && !G.match.attract && G.local?.weapon?.sourceMainActor === 'WeaponSlosherDiffusion') this.requestHissenFallback();",
    "    if (!this._fxDeferUpload && G.match && !G.match.attract && G.local?.weapon?.sourceMainActor === 'WeaponSlosherDiffusion') this.requestHissenFallback();", 'one fallback request');
  once('    updateSwimSurface(this, camera);', '    if (!this._fxDeferUpload) updateSwimSurface(this, camera);', 'one surface geometry stage');
  once('    for (const m of this._iwPoolMeshes ||', '    if (!this._fxDeferUpload) for (const m of this._iwPoolMeshes ||', 'one pool visibility commit');
  once('    // --- write instance attributes ---', '    if (this._fxDeferUpload) return;\n    // --- write instance attributes ---', 'drop staging');
  const fusedSprite = '      X[x + 5] += X[x + 6] * dt;\n      const i4 = i * 4;';
  const separateSprite = '    const netSrc = pool._netSource, netGen = pool._netGeneration;\n    for (let i = 0; i < pool.n; i++) {';
  if (code.includes(fusedSprite)) {
    once(fusedSprite, '      X[x + 5] += X[x + 6] * dt;\n      if (this._fxDeferUpload) continue;\n      const i4 = i * 4;', 'fused sprite staging');
  } else {
    // Wave 3-5 retains two loops, so complete every physics substep and
    // return before the separate render staging pass on deferred substeps.
    // Keep exactly one occurrence or fail closed on future layout changes.
    once(separateSprite, '    if (this._fxDeferUpload) return;\n' + separateSprite, 'separate sprite staging');
  }
  once('    pool.geo.instanceCount = pool.n;\n    markUpdated(pool.geo, pool.n);', '    if (this._fxDeferUpload) return;\n    pool.geo.instanceCount = pool.n;\n    markUpdated(pool.geo, pool.n);', 'sprite upload');
  once('    for (let i = 0; i < R.n; i++) {\n      const x = i * 8, i3 = i * 3, i4 = i * 4;', '    if (this._fxDeferUpload) return;\n    for (let i = 0; i < R.n; i++) {\n      const x = i * 8, i3 = i * 3, i4 = i * 4;', 'ring staging');
  once('    for (let i = 0; i < S.n; i++) {\n      const x = i * 9, i3 = i * 3, i4 = i * 4;', '    if (this._fxDeferUpload) return;\n    for (let i = 0; i < S.n; i++) {\n      const x = i * 9, i3 = i * 3, i4 = i * 4;', 'shell staging');
  once('    for (let i = 0; i < B.n; i++) {\n      const x = i * 5, i3 = i * 3, i4 = i * 4;', '    if (this._fxDeferUpload) return;\n    for (let i = 0; i < B.n; i++) {\n      const x = i * 5, i3 = i * 3, i4 = i * 4;', 'beam staging');
  return code;
}
export function adaptQueueUiContinuation20261029(rel, code) {
  for (const change of changes) {
    if (rel !== change.rel) continue;
    const parts = code.split(change.old);
    if (parts.length - 1 !== change.count) throw new Error('UI continuation anchor: ' + change.label + ' (' + (parts.length - 1) + ')');
    code = parts.join(change.new);
  }
  if (rel === 'src/fx/fx.js') code = adaptFxElapsed(code);
  return (imports[rel] || '') + code;
}
