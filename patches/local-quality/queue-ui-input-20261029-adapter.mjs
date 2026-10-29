// Local queue closure against the composed public source, never the locked snapshot.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('20261029 UI/input anchor: ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptQueueUiInput20261029(rel, code) {
  const patch = (before, after, label) => { code = once(code, before, after, label); };
  if (rel === 'src/ui/news.js') {
    code = "import { getPlatformLifecycle } from '../../patches/local-quality/platform-lifecycle.mjs';\n" + code;
    patch('  _tween(dur, step, done) {', `  _releaseTweenClock() { this._newsClockOff?.(); this._newsClockOff = null; }
  _tween(dur, step, done) {
    if (!this._newsClockOff) {
      const owner = getPlatformLifecycle();
      this._newsSuspended = !owner.active;
      this._newsClockOff = owner.subscribe({
        suspend: () => { this._newsSuspended = true; this._last = performance.now(); },
        resume: () => { this._newsSuspended = false; this._last = performance.now(); },
      });
    }`, 'foreground tween lifecycle');
    patch('const dt = Math.min(0.1, (t - this._last) / 1000) * (this.M.timeScale ?? 1);   // slow frames still finish the wipe on time',
      'const dt = (this._newsSuspended ? 0 : Math.max(0, (t - this._last) / 1000)) * (this.M.timeScale ?? 1);   // preserve foreground elapsed time; resume rebases the clock', 'low FPS tween elapsed time');
    patch('    this._raf = this._tweens.length ? requestAnimationFrame((tt) => this._tick(tt)) : 0;',
      '    this._raf = this._tweens.length ? requestAnimationFrame((tt) => this._tick(tt)) : 0;\n    if (!this._tweens.length) this._releaseTweenClock();', 'completed clock subscriber');
    patch('    el._closing = true;\n    clearTimeout(this._t);',
      '    el._closing = true;\n    clearTimeout(this._nextTimer); this._nextTimer = 0; this._busy = false;\n    clearTimeout(this._t);', 'retire next-page callback before exit');
    patch("if (how === 'try') { cancelAnimationFrame(this._raf);", "if (how === 'try') { this._releaseTweenClock(); cancelAnimationFrame(this._raf);", 'immediate exit clock release');
    patch('  dispose() { this._cancelHeroWait();', '  dispose() { this._releaseTweenClock(); this._cancelHeroWait();', 'disposed clock release');
  }
  if (rel === 'src/ui/menus.js') {
    code = "import { getPlatformLifecycle } from '../../patches/local-quality/platform-lifecycle.mjs';\n" + code;
    patch('S.launching = { t: 0, step: -1, done, fired: false, end: 0 };',
      'S.launching = { t: 0, step: -1, done, fired: false, end: 0, wall: performance.now(), epoch: getPlatformLifecycle().epoch };', 'lobby launch clock origin');
    patch('          L.t += dt;\n          const T = L.t;',
      `          const clockOwner = getPlatformLifecycle(), wall = performance.now();
          const elapsed = clockOwner.active && L.epoch === clockOwner.epoch ? Math.max(0, (wall - L.wall) / 1000) : 0;
          L.wall = wall; L.epoch = clockOwner.epoch;
          if (!this._frozen()) L.t += elapsed * (this.timeScale > 0 ? this.timeScale : 1);
          const T = L.t;`, 'lobby countdown foreground wall time');
    patch("    const bump = () => { if (val.animate && !prefersReducedMotion()) val.animate([{ scale: 1.22, translate: '0 -2px' }, { scale: 1, translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' }); };",
      `    let bumpAnimation = null;
    const bump = () => {
      if (!val.animate || prefersReducedMotion()) return;
      if (bumpAnimation) { try { bumpAnimation.currentTime = 0; bumpAnimation.play(); return; } catch { bumpAnimation.cancel?.(); } }
      bumpAnimation = val.animate([{ scale: 1.22, translate: '0 -2px' }, { scale: 1, translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    };`, 'one slider bump animation per control');
    patch('      destroy: endDrag,', '      destroy: () => { endDrag(); bumpAnimation?.cancel(); bumpAnimation = null; },', 'slider animation retirement');
    patch('    let fin = null;\n    const p = new Promise((res) => { let done = false; fin = () => { if (!done) { done = true; res(); } }; });\n    this._launchP = p;\n    s.launch(fin);\n    setTimeout(fin, 7000);',
      '    let fin = null, timer = null;\n    const p = new Promise((res) => { let done = false; fin = () => { if (!done) { done = true; if (timer !== null) clearTimeout(timer); timer = null; res(); } }; });\n    this._launchP = p;\n    timer = setTimeout(fin, 7000);\n    s.launch(fin);', 'lobby fallback released on synchronous or async finish');
    patch("    colorVars(this.el, 'b', toHex(b));", "    colorVars(this.el, 'b', toHex(b));\n    this._queueAccentSignature = this._accent().join(',');", 'external accent cache writer');
    patch("    colorVars(this.el, 'b', pal.b);", "    colorVars(this.el, 'b', pal.b);\n    this._queueAccentSignature = this._accent().join(',');", 'palette accent cache writer');
    patch("const style = this.el.style; const acc = (style.getPropertyValue('--a').trim() || TEAM_PALETTES[0].a) + ',' + (style.getPropertyValue('--b').trim() || TEAM_PALETTES[0].b) + (bossMode() ? '|b' : '');",
      "const acc = (this._queueAccentSignature ?? (this._queueAccentSignature = this._accent().join(','))) + (bossMode() ? '|b' : '');", 'lobby reads owner-maintained accent signature');
    patch("          P.sig = sig; P.bw = 0;   // re-measure for the overlap pass",
      "          P.sig = sig;\n          if (!was || was[0] !== p.name || was[3] !== p.weapon || was[4] !== String(team) || was[5] !== String(p.you) || was[6] !== String(bossMode() ? 1 : 0)) P.bw = 0;", 'keep measured tag width for host and ready stickers');
    patch("          P.w.innerHTML = weaponIcon((W && W.id) || p.weapon);",
      "          const weaponIconKey = (W && W.id) || p.weapon;\n          if (P._queueWeaponIconKey !== weaponIconKey) { P._queueWeaponIconKey = weaponIconKey; P.w.innerHTML = weaponIcon(weaponIconKey); }", 'weapon SVG updates only on resolved icon identity');
    const a = code.indexOf('  _updateCursor(dt) {'), b = code.indexOf('\n  // ================================================================ modal', a);
    if (a < 0 || b < a) throw Error('20261029 cursor boundaries');
    let body = code.slice(a, b);
    body = once(body, '    { const value = `translate3d(', '    if (!this._queueDeferRingGeometry) {\n    { const value = `translate3d(', 'defer viewport ring writes');
    body = once(body, "    const rad = parseFloat(C.r) || 0;", "    }\n    const rad = parseFloat(C.r) || 0;", 'end deferred geometry');
    body = once(body, "if (C.clip !== clip) { C.clip = clip; st.clipPath = clip; }", "if (C.clip !== clip) { C.clip = clip; if (!this._queueDeferRingGeometry) st.clipPath = clip; }", 'defer viewport ring clip');
    code = code.slice(0,a) + body + code.slice(b);
  }
  if (rel === 'src/core/mobile.js') {
    patch("    this._buzz(8);\n    if (C.toggle || (C.press && id === 'pause')) { this._tapStart(id, e, false); return; }",
      "    if (C.toggle || (C.press && id === 'pause')) { this._tapStart(id, e, false); return; }\n    this._buzz(8);", 'one haptic owner for tap actions');
  }
  if (rel === 'src/ui/diorama.js') {
    patch("    if (Math.abs(a - (this._last.a ?? -1)) > 0.004) { this._last.a = a; this.el.style.opacity = a.toFixed(3); this.el.style.setProperty('--pinK', smooth(0.62, 1, k).toFixed(3)); }",
      "    if (Math.abs(a - (this._last.a ?? -1)) > 0.004) { this._last.a = a; this.el.style.opacity = a.toFixed(3); }\n    const pinK = smooth(0.62, 1, k).toFixed(3);\n    if (this._last.pinK !== pinK) { this._last.pinK = pinK; this.el.style.setProperty('--pinK', pinK); }", 'pin progress independent of opacity threshold');
  }
  if (rel === 'src/core/renderer.js') {
    patch('    if (qualityChanged) {\n      this.dynScale = 1;\n      this._buildComposer();', `    if (qualityChanged) {
      this.dynScale = 1;
      // Reuse only an otherwise identical, live pipeline. New quality fields
      // automatically force rebuilding until their ownership is reviewed.
      const densityOnly = prevQ && !shadowChanged && !this._contextLost && this.composer &&
        Object.keys(prevQ).length === Object.keys(this.q).length &&
        Object.keys(this.q).every(key => key === 'pixelRatio' || prevQ[key] === this.q[key]) &&
        this._w === window.innerWidth && this._h === window.innerHeight &&
        typeof this.composer.setPixelRatio === 'function';
      if (densityOnly) {
        const mobileCap = this.mobile.touch ? (this.mobile.ios ? 1.2 : 1.35) : Infinity;
        const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio, mobileCap);
        this.renderer.setPixelRatio(pr);
        this.composer.setPixelRatio(pr);
        this._dpr = window.devicePixelRatio || 1;
        this._fxaaTexel(this._w, this._h, pr);
      } else this._buildComposer();`, 'pixel-ratio-only composer continuity');
    patch('    if (qualityChanged || shadowChanged) {\n      this.scene?.traverse', '    if (shadowChanged) {\n      this.scene?.traverse', 'material invalidation follows shadow defines');
  }
  if (rel === 'src/ui/hud-boss.js') {
    patch("    restartAnim(c.el, 'is-bump');", `    if (!c._bumpStarted) { c._bumpStarted = true; c.el.classList.add('is-bump'); }
    else {
      let restarted = false;
      try {
        const animation = c._bumpAnimation || c.txt.getAnimations?.().find(a => a.animationName === 'iw-bnum-bump');
        if (animation && (!animation.effect || animation.effect.target === c.txt)) {
          animation.currentTime = 0; animation.play(); c._bumpAnimation = animation; restarted = true;
        }
      } catch { c._bumpAnimation = null; }
      if (!restarted) restartAnim(c.el, 'is-bump');
    }`, 'boss combo reuses authored CSS animation with legacy fallback');
  }
  if (rel === 'src/game/player.js') {
    const start = code.indexOf('  updateRespawnNavigation() {'), end = code.indexOf('  updatePadMapSelection(standardPad) {', start);
    if (start < 0 || end < start) throw Error('20261029 respawn navigation method boundary');
    const body = once(code.slice(start, end), '    const bubblers = G.bigBubblerJumpTargets?.(a.team) || [];',
      "    if (!inp.pressed.size || !(inp.wasPressed('Digit5') || inp.wasPressed('Digit6') || inp.wasPressed('Digit7') || inp.wasPressed('Digit8') || inp.wasPressed('Digit9'))) return true;\n    const bubblers = G.bigBubblerJumpTargets?.(a.team) || [];", 'respawn bubbler candidates only for relevant keys');
    code = code.slice(0, start) + body + code.slice(end);
  }
  if (rel === 'src/core/input.js') {
    patch("    const joyconIndices = pad?._inkwaveJoyconPair ? [...pad._inkwaveJoyconIndices] : null;\n    const identity = pad ? { index: pad.index, id: pad.id, mapping: pad.mapping, joyconIndices } : null;",
      `    const pairIndices = pad?._inkwaveJoyconPair ? pad._inkwaveJoyconIndices : null;
    let sameIndices = pairIndices ? !!previous?.joyconIndices && pairIndices.length === previous.joyconIndices.length : previous?.joyconIndices === null;
    if (sameIndices && pairIndices) for (let i = 0; i < pairIndices.length; i++) if (pairIndices[i] !== previous.joyconIndices[i]) { sameIndices = false; break; }
    const identity = pad ? (previous && previous.index === pad.index && previous.id === pad.id && previous.mapping === pad.mapping && sameIndices
      ? previous : { index: pad.index, id: pad.id, mapping: pad.mapping, joyconIndices: pairIndices ? [...pairIndices] : null }) : null;`, 'immutable pad identity reuse without changing handoff predicate');

    patch(`    const connectedPads = [];
    for (const p of pads) if (p && p.connected) connectedPads.push(p);
    const leftPads = connectedPads.length ? connectedPads.filter(p => inkwaveIsJoyCon(p, 'L')) : connectedPads;
    const rightPads = connectedPads.length ? connectedPads.filter(p => inkwaveIsJoyCon(p, 'R')) : connectedPads;
    const standardPad = connectedPads.find(p => p.mapping === 'standard' && !inkwaveIsJoyCon(p, 'L') && !inkwaveIsJoyCon(p, 'R'));
    let pad = null;
    if (standardPad) pad = standardPad;
    else if (leftPads.length === 1 && rightPads.length === 1 && leftPads[0].index !== rightPads[0].index) {
      pad = inkwaveJoyConPair(leftPads[0], rightPads[0], this.pad);
    } else {
      for (const p of connectedPads) if (p.mapping === 'standard') { pad = p; break; }
      if (!pad) pad = connectedPads[0] || null;
    }`, `    let firstPad = null, firstStandard = null, standardPad = null;
    let leftPad = null, rightPad = null, leftCount = 0, rightCount = 0;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!firstPad) firstPad = p;
      const left = inkwaveIsJoyCon(p, 'L'), right = inkwaveIsJoyCon(p, 'R');
      if (left) { leftCount++; if (!leftPad) leftPad = p; }
      if (right) { rightCount++; if (!rightPad) rightPad = p; }
      if (p.mapping === 'standard') {
        if (!firstStandard) firstStandard = p;
        if (!standardPad && !left && !right) standardPad = p;
      }
    }
    const pad = standardPad || (leftCount === 1 && rightCount === 1 && leftPad.index !== rightPad.index
      ? inkwaveJoyConPair(leftPad, rightPad, this.pad) : firstStandard || firstPad);`, 'single-pass Joy-Con candidate selection');
  }
  if (rel === 'src/main.js') {
    patch('    const tA = performance.now();', `    const measureCPU = !!(this.settings?.debugMode || this.platform?.profilerEnabled ||
      (this._queuePerfReadout ?? (this._queuePerfReadout = typeof location !== 'undefined' && /[?&]perf(?:[=&]|$)/.test(location.search || ''))));
    const tA = measureCPU ? performance.now() : 0;`, 'frame telemetry opt-in');
    patch('    const tB = performance.now();', '    const tB = measureCPU ? performance.now() : 0;', 'simulation telemetry opt-in');
    patch('    const tC = performance.now();\n    const ps = this.perf', '    if (measureCPU) {\n    const tC = performance.now();\n    const ps = this.perf', 'render telemetry opt-in');
    patch('    ps.calls = G.renderer.info.render.calls; ps.tris = G.renderer.info.render.triangles;', '    ps.calls = G.renderer.info.render.calls; ps.tris = G.renderer.info.render.triangles;\n    }', 'close telemetry budget');

    patch("      if (jobs.length) await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 8000))]);",
      "      if (jobs.length) { let warmupTimer; try { await Promise.race([Promise.all(jobs), new Promise((r) => { warmupTimer = setTimeout(r, 8000); })]); } finally { clearTimeout(warmupTimer); } }", 'release settled character warmup deadline');

    patch('const pp = new Set(inp.padMenuPressed);', 'const pp = inp.padMenuPressed.size ? new Set(inp.padMenuPressed) : (this._queueEmptyPadMenuEdges || (this._queueEmptyPadMenuEdges = new Set()));', 'empty menu edge snapshot');
  }
  if (rel === 'src/ui/hud.js') {
    patch("|${canJump ? 1 : 0}|${b.name}` : 'x';", "|${canJump ? 1 : 0}|${b.name}|${b.weapon || ''}|${b.kind || ''}|${b.home ? 1 : 0}` : 'x';", 'beacon payload invalidates stationary icon');
    patch("      el.style.setProperty('--far', far.toFixed(2));", "      const farCSS = far.toFixed(2);\n      if (el.style.getPropertyValue('--far') !== farCSS) el.style.setProperty('--far', farCSS);", 'ally far output only changes when serialized value changes');
    patch("      if (d !== L.jlD) { L.jlD = d; const svg = this.mapJumpLine.firstChild; svg.setAttribute('width', bw.toFixed(0)); svg.setAttribute('height', bh.toFixed(0)); svg.firstChild.setAttribute('d', d); }",
      "      const svg = this.mapJumpLine.firstChild, svgWidth = bw.toFixed(0), svgHeight = bh.toFixed(0);\n      if (svg.getAttribute('width') !== svgWidth) svg.setAttribute('width', svgWidth);\n      if (svg.getAttribute('height') !== svgHeight) svg.setAttribute('height', svgHeight);\n      if (d !== L.jlD || L.jlSvg !== svg) { L.jlD = d; L.jlSvg = svg; svg.firstChild.setAttribute('d', d); }", 'arc size ownership separate from moving path');
    // Evaluate palette/team classification before either position-key shortcut.
    patch('      const raw = d._mapKey || (d._mapKey = {}), self =', "      const dotEnemy = p.team !== this._myTeam(), dotColor = dotEnemy ? cb : ca;\n      const raw = d._mapKey || (d._mapKey = {}), self =", 'dot palette inputs');
    patch('raw.self === self && raw.team === p.team) continue;', 'raw.self === self && raw.team === p.team && raw.color === dotColor && raw.enemy === dotEnemy) continue;', 'raw palette invalidation');
    patch("|${p.isSelf ? 1 : 0}|${p.team}`;", "|${p.isSelf ? 1 : 0}|${p.team}|${dotColor}|${dotEnemy ? 1 : 0}`;", 'serialized palette invalidation');
    patch('raw.self = self; raw.team = p.team;', 'raw.self = self; raw.team = p.team; raw.color = dotColor; raw.enemy = dotEnemy;', 'remember palette inputs');
    patch("const sk = `${p.isSelf ? 1 : 0}|${p.alive === false ? 0 : 1}|${p.team}`;", "const sk = `${p.isSelf ? 1 : 0}|${p.alive === false ? 0 : 1}|${p.team}|${dotColor}|${dotEnemy ? 1 : 0}`;", 'dot style key palette');
    patch("d.style.setProperty('--c', p.team !== this._myTeam() ? cb : ca);", "d.style.setProperty('--c', dotColor);", 'resolved dot color');
  }
  if (rel === 'src/fx/screenfx.js') {
    const start = code.indexOf('    const any = lensOn || s.speed'), end = code.indexOf('    this.pass.enabled = any;', start);
    if (start < 0 || end < start) throw Error('20261029 screenfx visibility predicate');
    const predicate = code.slice(start, end);
    patch(predicate, '', 'move unchanged screenfx visibility predicate');
    patch('    if (local) {\n      const own = this._teamColor(local.team)', '    const lensOn = this.lens.parts.length > 0;\n' + predicate + '    if (local && any) {\n      const own = this._teamColor(local.team)', 'only refresh colors for submitted pass');
    patch('    // ---- lens field\n    const lensOn = this.lens.parts.length > 0;', '    // ---- lens field', 'single lens visibility sample');
  }
  if (rel === 'src/game/match.js') {
    patch('  dispose() {', '  dispose() {\n    G.game?.platform?.releaseMatch?.(this);', 'retire hidden host references with their match');
  }
  if (rel === 'src/game/minimap.js') {
    patch("    const Lx = -0.62, Ly = -0.78;", "    const Lx = -0.62, Ly = -0.78;\n    const shadowOffsets = this._queueShadowOffsets || (this._queueShadowOffsets = Array.from({ length: 9 }, (_, i) => [Math.round(Lx * ((i + 1) * 3)), Math.round(Ly * ((i + 1) * 3))]));", 'fixed shadow kernel');
    patch("          const qx = Math.round(px + Lx * k), qy = Math.round(py + Ly * k);", "          const offset = shadowOffsets[k / 3 - 1], qx = px + offset[0], qy = py + offset[1];", 'integer shadow translation');
    patch("    if (!this._built) this._build();\n    this.time += dt;", `    if (!this._built) this._build();
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i]; f.t += dt;
      if (f.t >= f.life) fxList.splice(i, 1);
    }
    this.time += dt;`, 'visible transient age follows update clock');
    patch("      f.t += dt;\n      if (f.t >= f.life) { fxList.splice(i, 1); continue; }", "      if (f.t >= f.life) continue;", 'composite never spends age credit');
  }
  return code;
}
