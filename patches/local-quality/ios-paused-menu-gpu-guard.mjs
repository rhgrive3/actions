// Build-only GPU guard for paused in-battle menus on touch devices (iOS and Android).
// Native Practice Range: Pause -> Settings stacks a WebGL framebuffer snapshot,
// two fullscreen DOM screens, backdrop blur layers and a 1.5-DPR Canvas2D wipe.
// Offline pause keeps only the retained frame; online pause keeps the live match
// rendering underneath. Neither needs compositor blur or a decorative fullscreen
// wipe while the battle is paused. Android phones/tablets stack the same layers
// as iPad, so the guard covers every touch-primary device (html.iw-touch), not
// only iOS WebKit. Desktop keeps its original blurred pause presentation.
// Scope is the in-battle pause stack only (.iw-ui.is-ingame / stack[0] === 'pause');
// menus outside battle keep their blur and wipes.
// Capture the outgoing pause owner before show() replaces its navigation stack.
// Otherwise quit/resume lose the guard precisely while the old GPU layers are live.
// The file keeps its historical name and export names; the guard is not iOS-only.
const MARKER = '/* Paused in-battle menus on touch devices: bound paused WebGL + overlaid menu compositor surfaces. */';
export const IOS_PAUSED_MENU_CSS = MARKER + "\nhtml.iw-touch .iw-ui.is-ingame .iw-dimbg,\nhtml.iw-touch .iw-ui.is-ingame .iw-pause__dim,\nhtml.iw-touch .iw-ui.is-ingame .iw-scrim-full,\nhtml.iw-touch .iw-ui.is-ingame .iw-modal,\nhtml.iw-touch .iw-ui.is-ingame .iw-panel,\nhtml.iw-touch .iw-ui.is-ingame .iw-prompts {\n  -webkit-backdrop-filter: none !important;\n  backdrop-filter: none !important;\n}\n";
export function adaptIosPausedMenuGpuGuard(rel, code, once) {
  if (rel === 'styles/ui.css') {
    if (code.includes(MARKER))
      throw new Error('paused in-battle GPU guard already applied');
    return code + '\n' + IOS_PAUSED_MENU_CSS;
  }
  if (rel !== 'src/ui/menus.js') return code;
  const patch = (before,after,why) => { code = once(code,before,after,'paused battle GPU: '+why); };
  patch("    const prev = this.current;", `    const prev = this.current;
    const battlePauseMenu = (this._stack[0] === 'pause' || name === 'pause') &&
      document.documentElement.classList.contains('iw-touch');
    if (battlePauseMenu) opts = { ...opts, instantLeave: true, pausedBattle: true };`,
    'retain incoming and outgoing pause ownership before stack mutation');
  patch('    const token = ++this._swapToken;', `    const token = ++this._swapToken;
    // Retire an already-running menu wipe too. Increment the swap token first:
    // cancel() completes its pending onMid, which must not revive the old page.
    if (battlePauseMenu) this.wipe.cancel();`,
    'cancel an earlier transition only after revoking its screen-swap callback');
  patch("    const wipe = opts.wipe ?? WIPES.has(`${prev}>${name}`);",
    "    const wipe = battlePauseMenu ? false : (opts.wipe ?? WIPES.has(`${prev}>${name}`));",
    'avoid full-viewport Canvas2D wipe while overlaying paused battle WebGL');
  patch("&& !this.wipe.busy && !prefersReducedMotion()) {","&& !this.wipe.busy && !prefersReducedMotion() && !battlePauseMenu) {",
    'suppress decorative light wipe during nested paused-battle navigation');
  // Only the in-battle pause owner releases its DOM synchronously; other instantLeave callers keep their timer.
  patch("      setTimeout(() => oe.remove(), opts.instantLeave ? 0 : 340);","      if (opts.pausedBattle) oe.remove();\n      else setTimeout(() => oe.remove(), opts.instantLeave ? 0 : 340);",
    'release old fullscreen paused-battle menu immediately');
  return code;
}
