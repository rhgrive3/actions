// Build-only title presentation policy. The playable match clock, roster,
// quality settings and online authority remain owned by their existing code.

export function releaseTitleDemoBudget(game) {
  const state = game._titleDemo;
  if (!state?.active) return;
  state.active = false;
  state.captured = false;
  state.match = null;
  state.phase = state.elapsed = 0;
  game.R?.releasePausedFrame?.();
  if (state.savedScale != null) game.R?.setDynamicScale?.(state.savedScale);
  state.savedScale = null;
  // A frozen decorative scene must never hand elapsed time to a real match.
  if (state.reduced || state.hidden) game.s3Clock?.reset?.();
}

export function prepareTitleDemoFrame(game, G, dt, env = globalThis) {
  const state = game._titleDemo || (game._titleDemo = {
    active: false, phase: 0, elapsed: 0, draw: false, delta: 0,
    captured: false, reduced: false, hidden: false, savedScale: null,
  });
  const mounted = game.menus?._scr?.name ?? game.menus?.current;
  const active = G.mode === 'menu' && !!game.match?.attract && !G.netm &&
    !game.showcase?.fullFrame && mounted === 'title' && game.menus?.current === 'title';
  if (!active) { releaseTitleDemoBudget(game); return state; }

  const entered = !state.active;
  if (entered) {
    state.active = true;
    state.phase = state.elapsed = 0;
    state.captured = false;
    state.match = game.match;
    state.savedScale = Number.isFinite(game.R?.dynScale) ? game.R.dynScale : 1;
    // The canvas is a decorative backdrop; DOM text stays at native density.
    // Use the renderer's existing resize owner and restore the exact entry
    // density when the title exits, including a previous adaptive match scale.
    game.R?.setDynamicScale?.(Math.min(state.savedScale, game.mobile?.touch ? 0.6 : 0.75));
  }
  if (!Object.hasOwn(state, 'motionQuery')) {
    state.motionQuery = typeof env.matchMedia === 'function'
      ? env.matchMedia('(prefers-reduced-motion: reduce)') : null;
  }
  const reduced = !!state.motionQuery?.matches;
  const hidden = !!env.document?.hidden;
  const w = env.innerWidth || 0, h = env.innerHeight || 0, dpr = env.devicePixelRatio || 1;
  const invalidated = entered || state.match !== game.match || state.reduced !== reduced ||
    state.hidden !== hidden || state.width !== w || state.height !== h || state.dpr !== dpr ||
    !!game.R?._contextLost;
  if (invalidated) {
    state.captured = false;
    state.phase = state.elapsed = 0;
    game.s3Clock?.reset?.();
  }
  state.match = game.match;
  state.reduced = reduced;
  state.hidden = hidden;
  state.width = w; state.height = h; state.dpr = dpr;
  state.hz = game.mobile?.touch || game.settings?.quality === 'low' ? 20 : 30;
  state.hold = hidden || (reduced && state.captured);
  state.draw = !hidden && reduced;
  state.delta = 0;
  if (!reduced && !hidden) {
    const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const step = 1 / state.hz;
    state.phase += elapsed;
    state.elapsed += elapsed;
    // Keep the remainder at non-divisible 90/144 Hz display rates. Rendering
    // skips no simulation time and never submits catch-up presentation frames.
    if (state.phase + 1e-9 >= step) {
      state.phase = Math.max(0, state.phase - Math.floor((state.phase + 1e-9) / step) * step);
      state.draw = true;
      state.delta = state.elapsed;
      state.elapsed = 0;
    }
  }
  return state;
}

export function holdTitleDemoFrame(game, G, dt, state) {
  if (!state.active || !state.hold) return false;
  if (!state.hidden && !game._skipRender && game.R?.presentPausedFrame?.() !== true) {
    // Context restoration and unsupported framebuffer copies retain a real
    // render fallback. Never leave a black title behind a successful menu.
    state.captured = false;
    state.draw = true;
    state.delta = 0;
    return false;
  }
  game.s3Clock?.reset?.();
  game.input?.pollPad?.();
  game._padMenus?.(dt);
  G.net?.update?.(dt);
  game.menus?.update?.(dt);
  game.input?.endFrame?.();
  if (game.input?.mobile) game.input.mobile.lookDX = game.input.mobile.lookDY = 0;
  game.input?.padPressed?.clear?.();
  return true;
}

function once(code, before, after, label) {
  const count = code.split(before).length - 1;
  if (count !== 1) throw new Error(`INKWAVE title demo conflict (${label}): expected 1 anchor, found ${count}`);
  return code.replace(before, after);
}

// Apply after the production static-menu, fixed-clock, portrait and material
// passes. Helpers are emitted into main.js so no new runtime request is needed.
export function adaptTitleDemoBudget(rel, code) {
  if (rel === 'src/game/match.js') {
    code = once(code, '    const boss = this.mode === \'boss\';',
      "    const boss = this.mode === 'boss';\n    const titleTeamSize = this.attract && o.titleDemo && !o.mannequins ? 2 : MATCH.teamSize;",
      'decorative roster size');
    code = once(code, '      while (out.length < MATCH.teamSize) {',
      '      while (out.length < titleTeamSize) {', 'decorative weapon pool');
    return once(code, '      for (let s = 0; s < (boss ? bossCfg.squad : MATCH.teamSize); s++) {',
      '      for (let s = 0; s < (boss ? bossCfg.squad : titleTeamSize); s++) {',
      'decorative actors only');
  }
  if (rel !== 'src/main.js') return code;
  code = once(code, 'new Match({ attract: true, duration: 99999,',
    'new Match({ titleDemo: !DEV_STAGE, attract: true, duration: 99999,', 'attract roster opt-in');
  code = once(code, '  _frame(dt) {',
    '  _frame(dt) {\n    const titleDemo = prepareTitleDemoFrame(this, G, dt);\n    if (holdTitleDemoFrame(this, G, dt, titleDemo)) return;',
    'title lifecycle before static menu gate');
  code = once(code, '  _onScreen(s) {',
    "  _onScreen(s) {\n    if (s !== 'title') releaseTitleDemoBudget(this);", 'restore gameplay density on menu exit');
  code = once(code, '    if (!portraitFrame.offline) runSimulation(this, portraitFrame.released ? 0 : dt);',
    '    if (!portraitFrame.offline) runSimulation(this, portraitFrame.released || (titleDemo.active && titleDemo.reduced) ? 0 : dt);',
    'reduced motion consumes no simulation debt');
  code = once(code, '    const menuAttractBudget = idleAttractMenuBudget(this, G);',
    `    const menuAttractBudget = titleDemo.active || idleAttractMenuBudget(this, G);
    if (titleDemo.active) {
      this._menuAttractFrame = titleDemo.draw;
      this._menuAttractFrameDelta = titleDemo.delta;
    }`, 'title render cadence independent of fixed ticks');
  code = once(code, `          this.R.render();
          if (pausedFrame.paused) {`,
    `          this.R.render();
          if (titleDemo.active && titleDemo.reduced) titleDemo.captured = this.R.capturePausedFrame?.() === true;
          if (pausedFrame.paused) {`, 'reduced motion retains a single finished frame');
  const helpers = [releaseTitleDemoBudget, prepareTitleDemoFrame, holdTitleDemoFrame].map(fn => fn.toString()).join('\n');
  return `// ZEVANT lightweight title demo: scoped presentation policy.\n${helpers}\n${code}`;
}
