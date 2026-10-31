// Preserve the source-identity-checked menu layout module. This presentation
// adapter runs after it is copied into the production composition.
export function adaptMenuCardLayout(rel, code, replaceOnce) {
  if (rel !== 'patches/splatoon3/runtime/menu-layout.mjs') return code;
  code = replaceOnce(code,
    'export function keepInView(el, host, { smooth = true, center = false } = {}) {\n  if (!el || !host) return 0;\n  const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();',
    'export function keepInView(el, host, { smooth = true, center = false, r, b } = {}) {\n  if (!el || !host) return 0;\n  r ??= el.getBoundingClientRect();\n  b ??= host.getBoundingClientRect();',
    'reuse bounds measured in the same synchronous card focus move');
  code = replaceOnce(code,
    "const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;",
    `const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Touch cards retain content-visibility: auto. A long navigation jump replaces
// estimated row heights with wrapped text. Settle once after scrolling stops;
// reduced motion can settle on the next frame directly. No idle frame loop.
const cardScrolls = new WeakMap();
function cancelCardScroll(menus, screen) {
  const pending = cardScrolls.get(menus);
  if (!pending || (screen && pending.screen !== screen)) return;
  cardScrolls.delete(menus);
  if (pending.frame !== null) globalThis.cancelAnimationFrame?.(pending.frame);
  if (pending.timer !== null) globalThis.clearTimeout(pending.timer);
  pending.host.removeEventListener('scroll', pending.onScroll);
  pending.host.removeEventListener('scrollend', pending.queue);
  for (const type of ['pointerdown', 'touchstart', 'wheel'])
    pending.root.removeEventListener(type, pending.cancel, true);
}
function settleCardScroll(menus, next, host, root, center) {
  if (!touchMenu() || !host.classList?.contains('s3-wgrid') || typeof globalThis.requestAnimationFrame !== 'function') return;
  const screen = menus._scr, modal = menus._modal;
  const pending = { frame: null, timer: null, screen, root, host, cancel: () => cancelCardScroll(menus) };
  cardScrolls.set(menus, pending);
  for (const type of ['pointerdown', 'touchstart', 'wheel'])
    root.addEventListener(type, pending.cancel, { capture: true, passive: true });
  pending.queue = () => {
    if (cardScrolls.get(menus) !== pending || pending.frame !== null) return;
    if (pending.timer !== null) { clearTimeout(pending.timer); pending.timer = null; }
    host.removeEventListener('scroll', pending.onScroll);
    host.removeEventListener('scrollend', pending.queue);
    pending.frame = requestAnimationFrame(() => {
      pending.frame = null;
      if (cardScrolls.get(menus) !== pending) return;
      cancelCardScroll(menus);
      if (menus._scr !== screen || menus._modal !== modal || menus._focus !== next || !next.isConnected || !root.isConnected || !host.contains(next)) return;
      keepInView(next, host, { smooth: false, center });
    });
  };
  pending.onScroll = () => {
    if (pending.timer !== null) clearTimeout(pending.timer);
    // Fallback for browsers without scrollend, and requests clamped at an edge.
    pending.timer = setTimeout(pending.queue, 160);
  };
  if (reduced()) pending.queue();
  else {
    host.addEventListener('scroll', pending.onScroll, { passive: true });
    host.addEventListener('scrollend', pending.queue, { passive: true });
    pending.onScroll();
  }
}`,
    'one-frame focus correction for natural-height weapon cards');
  code = replaceOnce(code,
    'const swap = P._swap, moveFocus = P._moveFocus, setup = P._scr_setup, loadout = P._scr_loadout;',
    'const swap = P._swap, moveFocus = P._moveFocus, setup = P._scr_setup, loadout = P._scr_loadout, dispose = P.dispose;',
    'weapon-card correction dispose owner');
  code = replaceOnce(code,
    '  if (swap) P._swap = function (...args) {\n    const result = swap.apply(this, args);',
    '  if (swap) P._swap = function (...args) {\n    cancelCardScroll(this);\n    const result = swap.apply(this, args);',
    'cancel weapon-card correction before a screen swap');
  code = replaceOnce(code,
    '  if (moveFocus) P._moveFocus = function (next, dir) {\n    const result = moveFocus.call(this, next, dir);',
    '  if (moveFocus) P._moveFocus = function (next, dir) {\n    cancelCardScroll(this);\n    const result = moveFocus.call(this, next, dir);',
    'new focus cancels the previous card correction');
  code = replaceOnce(code,
    '      if (host) keepInView(next, host, { smooth: !reduced() });',
    `      if (host) {
        const cardGrid = touchMenu() && host.classList?.contains('s3-wgrid');
        const r = cardGrid ? next.getBoundingClientRect() : null, b = cardGrid ? host.getBoundingClientRect() : null;
        const center = !!cardGrid && Math.abs((r.top + r.bottom - b.top - b.bottom) / 2) > host.clientHeight;
        const moved = keepInView(next, host, { smooth: !reduced(), center, r, b });
        if (moved) settleCardScroll(this, next, host, root, center);
      }`,
    'settle only a scrolling weapon-card focus move');
  code = replaceOnce(code,
    '  if (setup) P._scr_setup = function (...args) { return decorateSetup(this, setup.apply(this, args)); };',
    '  if (dispose) P.dispose = function (...args) { cancelCardScroll(this); return dispose.apply(this, args); };\n  if (setup) P._scr_setup = function (...args) { return decorateSetup(this, setup.apply(this, args)); };',
    'cancel pending weapon-card correction on menu disposal');
  code = replaceOnce(code,
    '  if (loadout) P._scr_loadout = function (...args) { return decorateLoadout(this, loadout.apply(this, args), api); };',
    `  if (loadout) P._scr_loadout = function (...args) {
    const scr = decorateLoadout(this, loadout.apply(this, args), api), destroy = scr.destroy;
    scr.destroy = (...destroyArgs) => { cancelCardScroll(this, scr); return destroy?.apply(scr, destroyArgs); };
    return scr;
  };`,
    'screen-owned weapon-card correction teardown');
  return code;
}
