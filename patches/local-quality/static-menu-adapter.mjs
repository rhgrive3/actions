// Strictly local to the primary loadout grid: the catalogue adapter may have
// already upgraded its weapon SVG expression. Preserve that exact source
// expression for eager *and* deferred cards. Never touch the lobby modal.
export function deferPrimaryWeaponIcon(grid, replaceOnce) {
  const prefix = "        h('span', { class: 'iw-wcard__icon', html: ";
  const rows = grid.split('\n').filter(line => line.startsWith(prefix) && line.endsWith(" }),"));
  if (rows.length !== 1) throw new Error('INKWAVE quality patch conflict (primary weapon icon owner): expected one');
  const row = rows[0], expr = row.slice(prefix.length, -4);
  if (!/^[A-Za-z_$][\w$.]*\(/.test(expr)) throw new Error('INKWAVE quality patch conflict (weapon icon expression)');
  return {
    grid: replaceOnce(grid, row, prefix + "deferArt ? '' : " + expr + " }),", 'defer offscreen weapon SVG in primary grid'),
    // Preserve property names such as w.id; hydration binds the original id locally.
    hydration: expr,
  };
}

// Static decorative menu backdrops, built from original generated artwork.
// The actual game arena, result podium, pause screen and network room must keep
// their existing simulation/render lifecycle. Do not change combat or loadout data.
const STATIC_MENU_SCREENS = Object.freeze([
  'main', 'mode', 'setup', 'loadout', 'locker', 'settings', 'howto', 'credits', 'online',
]);

// This is build-only: it runs last in production composition after all palette source transforms.
export function adaptStaticMenuArt(rel, code, replaceOnce) {
  if (rel === 'src/main.js') {
    // Avoid restarting a full 8-bot attract simulation, repainting the world,
    // or submitting composer/shadow passes behind a *fully opaque* menu image.
    // The input/menu/net clocks remain live; real matches and online rooms do
    // not take this path. Portraits are on-demand offscreen renders, not demos.
    const anchor = '    const tA = performance.now();';
    // A wipe between two art screens keeps the old art mounted until the swap,
    // so it gates too; title -> main still draws the title demo until the swap.
    // Outside the art screens the canvas is shown again before this frame draws.
    const replacement = `    const artScreen = this.menus?._scr?.name;
    if (G.mode === 'menu' && this.match?.attract &&
        INKWAVE_ART_MENU_SCREENS.has(artScreen) && INKWAVE_ART_MENU_SCREENS.has(this.menus?.current)) {
      // Nothing of the demo world stays on screen behind the art: hide the
      // canvas so the compositor stops blending a stale full-screen frame.
      const artCanvas = G.renderer?.domElement, hideCanvas = artScreen !== 'locker';
      if (artCanvas && this._artCanvasHidden !== hideCanvas) {
        artCanvas.style.visibility = hideCanvas ? 'hidden' : '';
        this._artCanvasHidden = hideCanvas;
      }
      G.time += dt;
      this.input.pollPad();
      this._padMenus();
      G.net?.update?.(dt);
      // Static screens do not sample the 3D world. Drop idle GPU attachments now,
      // including a full-screen pause screenshot retained by a just-quit battle.
      // The lazy composer recreates its targets before the next real 3D frame.
      this.R?.releasePausedFrame?.();
      this.R?.composer?.releaseInactiveTargets?.();
      if (artScreen !== 'locker' && this.showcase?._rt) {
        this.showcase._rt.dispose(); this.showcase._rt = null;
      }
      // Character thumbnails are still generated only when requested. No
      // showcase/world render loop runs behind these decorative backgrounds.
      if (this.showcase?._pq?.length) this.showcase._portraitStep?.();
      // The locker keeps its live pedestal kid, drawn over the same art.
      if (artScreen === 'locker' && this.showcase && G.renderer) renderInkwaveLockerStage(this, G, dt);
      this.menus.update(dt);
      this.input.endFrame();
      return;
    }
    if (this._artCanvasHidden) { G.renderer.domElement.style.visibility = ''; this._artCanvasHidden = false; }
    const tA = performance.now();`;
    code = replaceOnce(code, anchor, replacement, 'static menu world-frame gate');
    // The old loadout handler eagerly instantiates a second 3D squidkid,
    // despite the display now being a static illustration.
    code = replaceOnce(code,
      "    if (s === 'loadout') this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style, G.teamColors[1]);",
      "    if (s === 'loadout') this.showcase.hide();",
      'weapon screen no longer constructs an invisible showcase stage');
    // Returning from a battle enters fully opaque art. Do not allocate eight
    // never-drawn bot rigs just to idle behind it; restore the full demo only
    // if the player actually opens the animated title screen.
    code = replaceOnce(code, '  _startAttract() {',
      '  _startAttract() {\n    this._staticMenuAttract = !!arguments[0]?.staticMenu;',
      'static return: attract signature');
    code = replaceOnce(code,
      '      noBots: mapNoBots(this.mapDef?.id) || isRangeMap(this.mapDef), mannequins: DEV_STAGE }));',
      '      noBots: this._staticMenuAttract || mapNoBots(this.mapDef?.id) || isRangeMap(this.mapDef), mannequins: !this._staticMenuAttract && DEV_STAGE }));',
      'static return: no unseen bot rigs');
    code = replaceOnce(code,
      "    this._startAttract();\n    this.menus?.show('main');",
      "    this._startAttract({ staticMenu: true });\n    this.menus?.show('main');",
      'offline quit static menu');
    code = replaceOnce(code,
      "      this._startAttract();\n      this.menus?.show(this.menus?.hasScreen?.('lobby') === false ? 'main' : 'lobby');",
      "      this._startAttract({ staticMenu: true });\n      this.menus?.show(this.menus?.hasScreen?.('lobby') === false ? 'main' : 'lobby');",
      'online match end static menu');
    code = replaceOnce(code, '  _onScreen(s) {',
      "  _onScreen(s) {\n    if (s === 'main' && this.match?.attract && !this._staticMenuAttract) this._startAttract({ staticMenu: true });\n    if (s === 'title' && this._staticMenuAttract) this._startAttract();",
      'title restores live attract simulation');

    code = `import { renderLockerStage as renderInkwaveLockerStage } from '../patches/local-quality/locker-stage.mjs';\nconst INKWAVE_ART_MENU_SCREENS = new Set(${JSON.stringify(STATIC_MENU_SCREENS)});\n` + code;
    return code;
  }
  if (rel === 'src/ui/menus.js') {
    // Online create/join remains a native DOM interaction, but no invisible
    // LobbySet is constructed behind the artwork. The locker keeps its
    // pedestal: locker-stage.mjs draws the art into the canvas beneath it.
    code = replaceOnce(code,
      '        if (sc && sc.showHub) safeCall(() => sc.showHub(this._style(), (G.teamColors && G.teamColors[0]) || this._accent()[0], this._loadout().weapon, G.teamColors?.[1]));',
      '        if (sc) safeCall(() => sc.hide?.());',
      'online hub keeps network flow, drops invisible LobbySet construction');
    // Large weapon catalogues scroll with touch, a pad or a mouse. Build all
    // real buttons synchronously (selection,
    // keyboard navigation and order unchanged), but hydrate offscreen art only
    // when it approaches the viewport.
    code = replaceOnce(code,
      "    const cards = order.map((id, i) => {\n      const w = Ws[id];",
      "    const lazyWeaponArt = n > 20 && typeof IntersectionObserver !== 'undefined';\n    const cards = order.map((id, i) => {\n      const w = Ws[id];\n      const deferArt = lazyWeaponArt && i >= 20;",
      'scrolling weapon art lazy eligibility independent of input device');
    // The lobby modal contains the same weapon-card SVG template. Limit these
    // exact-match anchors to the primary loadout grid, never the modal.
    const gridStart = code.indexOf('    const lazyWeaponArt = n > 20');
    const gridEnd = code.indexOf("    // ---- detail panel", gridStart);
    if (gridStart < 0 || gridEnd <= gridStart)
      throw new Error('INKWAVE quality patch conflict (static loadout grid scope)');
    let grid = code.slice(gridStart, gridEnd);
    grid = replaceOnce(grid,
      "        h('span', { class: 'iw-wcard__blob', html: splatSVG({ seed: 40 + i * 3, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }) }),",
      "        h('span', { class: 'iw-wcard__blob', html: deferArt ? '' : id === equipped ? splatSVG({ seed: 40 + i * 3, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }) : '' }),",
      'generate primary grid equip decorations only when displayed');
    const icon = deferPrimaryWeaponIcon(grid, replaceOnce);
    grid = icon.grid;
    code = code.slice(0, gridStart) + grid + code.slice(gridEnd);
    code = replaceOnce(code,
      "      c._wid = id;\n      return c;",
      "      c._wid = id; c._weaponArtIndex = i; c._artDeferred = deferArt;\n      if (deferArt) c.dataset.artDeferred = '1';\n      return c;",
      'deferred card ownership');
    code = replaceOnce(code,
      "    // ---- detail panel\n    const kind =",
      "    const materializeArt = (card) => {\n      if (!card) return;\n      const id = card._wid, i = card._weaponArtIndex, w = Ws[id];\n      const blob = card.querySelector('.iw-wcard__blob');\n      if (card.classList.contains('is-equipped') && !blob.firstChild) blob.innerHTML = splatSVG({ seed: 40 + i * 3, cls: 'iw-fa', r: 58, arms: 8, drops: 0 });\n      if (!card._artDeferred) return;\n      card.querySelector('.iw-wcard__icon').innerHTML = " + icon.hydration + ";\n      card._artDeferred = false; delete card.dataset.artDeferred;\n    };\n    let weaponArtObserver = null;\n\n    // ---- detail panel\n    const kind =",
      'hydrate approaching weapon card');
    code = replaceOnce(code,
      "        cards.forEach((x) => x.classList.toggle('is-equipped', x === c));\n        restartAnim(c, 'is-pick');",
      "        cards.forEach((x) => x.classList.toggle('is-equipped', x === c));\n        materializeArt(c);\n        restartAnim(c, 'is-pick');",
      'equip decoration exists before its unchanged entrance animation');
    code = replaceOnce(code,
      "      onFocus: (f) => {\n        if (f._wid && f._wid !== shown) render(f._wid);",
      "      onFocus: (f) => {\n        if (f._wid) materializeArt(f);\n        if (f._wid && f._wid !== shown) render(f._wid);",
      'focused weapon hydrates before selection');
    code = replaceOnce(code,
      "      afterMount: () => {\n        // stat bars grow",
      "      afterMount: () => {\n        if (lazyWeaponArt) {\n          weaponArtObserver = new IntersectionObserver((entries) => {\n            for (const entry of entries) {\n              if (!entry.isIntersecting) continue;\n              materializeArt(entry.target);\n              weaponArtObserver?.unobserve(entry.target);\n            }\n          }, { root: el, rootMargin: '320px 0px' });\n          for (const card of cards) if (card._artDeferred) weaponArtObserver.observe(card);\n        }\n        // stat bars grow",
      'hydrate visible and near-visible weapon cards');
    code = replaceOnce(code,
      "          for (const s of statEls) s.bar.style.setProperty('--v', (s.target / 100).toFixed(3));\n        }));\n      },\n      tick: (dt) => {",
      "          for (const s of statEls) s.bar.style.setProperty('--v', (s.target / 100).toFixed(3));\n        }));\n      },\n      destroy: () => weaponArtObserver?.disconnect(),\n      tick: (dt) => {",
      'disconnect old catalogue observer');
    return code;
  }
  if (rel !== 'styles/ui.css') return code;
  if (code.includes('INKWAVE generated static menu backdrops')) {
    throw new Error('INKWAVE static menu stylesheet applied twice');
  }
  // Only three WebP files, requested by the browser when the corresponding
  // screen is visible. No extra JS image preloading or full-screen GPU blur.
  return code + `
/* INKWAVE generated static menu backdrops: no live attract/composer rendering. */
.iw-ui.is-active:is([data-screen="main"], [data-screen="mode"],
  [data-screen="setup"], [data-screen="settings"], [data-screen="howto"],
  [data-screen="credits"], [data-screen="online"]) {
  background-color: #192134;
  background-image: linear-gradient(90deg, rgba(12,11,27,.73), rgba(12,11,27,.36) 53%, rgba(12,11,27,.22)),
    url('../patches/local-quality/assets/menu/lobby.webp');
  background-size: cover;
  background-position: center;
}
.iw-ui.is-active[data-screen="loadout"] {
  background-color: #101420;
  background-image: linear-gradient(90deg, rgba(14,12,27,.64), rgba(14,12,27,.32) 65%, rgba(14,12,27,.18)),
    url('../patches/local-quality/assets/menu/weapon.webp');
  background-size: cover;
  background-position: center;
}
/* Keep off-viewport touch cards out of the GPU compositor and leave their
   entrance/NEW animations dormant until their real SVG art is hydrated. */
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-loadout .iw-wcard[data-art-deferred="1"],
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-loadout .iw-wcard[data-art-deferred="1"] .iw-wcard__new {
  animation: none;
}
@supports (content-visibility: auto) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-loadout .iw-wcard {
    content-visibility: auto;
    contain-intrinsic-size: auto 116px;
  }
}
/* The art under these panels is still, so a backdrop blur only re-filters it
   (and the locker's live canvas) each frame: on phones that GPU work alone made
   SETTINGS lose its WebGL context. The panels are already ~90% opaque. */
.iw-ui.is-active:is(${STATIC_MENU_SCREENS.map((s) => `[data-screen="${s}"]`).join(', ')}) * {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
/* Locker art is drawn in the canvas (locker-stage.mjs) under the live kid. */
.iw-ui.is-active[data-screen="locker"] {
  background-color: transparent;
  background-image: linear-gradient(90deg, rgba(13,12,28,.80), rgba(13,12,28,.46) 54%, rgba(13,12,28,.10));
}
`;
}
