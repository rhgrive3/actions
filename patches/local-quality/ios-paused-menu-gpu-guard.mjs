// Build-only guard for iOS Safari paused-world menu composition.
// Native Practice Range: Pause -> Settings stacks a WebGL framebuffer snapshot,
// two fullscreen DOM screens, backdrop blur layers and a 1.5-DPR Canvas2D wipe.
// These cosmetic intermediates are unnecessary while gameplay is already frozen.
// Capture the outgoing pause owner before show() replaces its navigation stack.
// Otherwise quit/resume lose the guard precisely while the old GPU layers are live.
// Scope changes to paused iOS menus; other platforms and gameplay are identical.
export const IOS_PAUSED_MENU_CSS = "/* iPadOS/iOS WebKit: bound paused WebGL + overlaid menu compositor surfaces. */\nhtml.iw-ios .iw-ui.is-ingame .iw-dimbg,\nhtml.iw-ios .iw-ui.is-ingame .iw-pause__dim,\nhtml.iw-ios .iw-ui.is-ingame .iw-scrim-full,\nhtml.iw-ios .iw-ui.is-ingame .iw-modal,\nhtml.iw-ios .iw-ui.is-ingame .iw-panel,\nhtml.iw-ios .iw-ui.is-ingame .iw-prompts {\n  -webkit-backdrop-filter: none !important;\n  backdrop-filter: none !important;\n}\n";
export function adaptIosPausedMenuGpuGuard(rel, code, once) {
  if (rel === 'styles/ui.css') {
    if (code.includes('/* iPadOS/iOS WebKit: bound paused WebGL'))
      throw new Error('iOS pause GPU guard already applied');
    return code + '\n' + IOS_PAUSED_MENU_CSS;
  }
  if (rel !== 'src/ui/menus.js') return code;
  const patch = (before,after,why) => { code = once(code,before,after,'iOS pause GPU: '+why); };
  patch("    const prev = this.current;", `    const prev = this.current;
    const iosPausedMenu = (this._stack[0] === 'pause' || name === 'pause') &&
      document.documentElement.classList.contains('iw-ios');
    if (iosPausedMenu) opts = { ...opts, instantLeave: true };`,
    'retain incoming and outgoing pause ownership before stack mutation');
  patch('    const token = ++this._swapToken;', `    const token = ++this._swapToken;
    // Retire an already-running menu wipe too. Increment the swap token first:
    // cancel() completes its pending onMid, which must not revive the old page.
    if (iosPausedMenu) this.wipe.cancel();`,
    'cancel an earlier transition only after revoking its screen-swap callback');
  patch("    const wipe = opts.wipe ?? WIPES.has(`${prev}>${name}`);",
    "    const wipe = iosPausedMenu ? false : (opts.wipe ?? WIPES.has(`${prev}>${name}`));",
    'avoid full-viewport Canvas2D wipe while overlaying paused iOS WebGL');
  patch("&& !this.wipe.busy && !prefersReducedMotion()) {","&& !this.wipe.busy && !prefersReducedMotion() && !iosPausedMenu) {",
    'suppress decorative light wipe during nested iOS pause navigation');
  patch("      setTimeout(() => oe.remove(), opts.instantLeave ? 0 : 340);","      if ((opts.instantLeave || this._stack[0] === 'pause') &&\n          document.documentElement.classList.contains('iw-ios')) oe.remove();\n      else setTimeout(() => oe.remove(), opts.instantLeave ? 0 : 340);",
    'release old fullscreen paused menu immediately on iOS');
  return code;
}
