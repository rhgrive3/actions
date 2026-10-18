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
    const anchor = '  _frame(dt) {\n    const tA = performance.now();';
    const replacement = `  _frame(dt) {
    const artScreen = this.menus?._scr?.name;
    if (G.mode === 'menu' && this.match?.attract &&
        artScreen === this.menus?.current && INKWAVE_ART_MENU_SCREENS.has(artScreen)) {
      G.time += dt;
      this.input.pollPad();
      this._padMenus();
      G.net?.update?.(dt);
      // Character thumbnails are still generated only when requested. No
      // showcase/world render loop runs behind these decorative backgrounds.
      if (this.showcase?._pq?.length) this.showcase._portraitStep?.();
      // The locker keeps its live pedestal kid, drawn over the same art.
      if (artScreen === 'locker' && this.showcase && G.renderer) renderInkwaveLockerStage(this, G, dt);
      this.menus.update(dt);
      this.input.endFrame();
      return;
    }
    const tA = performance.now();`;
    code = replaceOnce(code, anchor, replacement, 'static menu world-frame gate');
    // The old loadout handler eagerly instantiates a second 3D squidkid,
    // despite the display now being a static illustration.
    code = replaceOnce(code,
      "    if (s === 'loadout') this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style, G.teamColors[1]);",
      "    if (s === 'loadout') this.showcase.hide();",
      'weapon screen no longer constructs an invisible showcase stage');
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
/* Locker art is drawn in the canvas (locker-stage.mjs) under the live kid. */
.iw-ui.is-active[data-screen="locker"] {
  background-color: transparent;
  background-image: linear-gradient(90deg, rgba(13,12,28,.80), rgba(13,12,28,.46) 54%, rgba(13,12,28,.10));
}
`;
}