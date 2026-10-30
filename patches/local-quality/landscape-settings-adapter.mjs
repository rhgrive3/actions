// Keep the captured input immutable. Only short, touch-driven landscape menus
// need this layout; normal tablet/desktop and portrait styles stay unchanged.
const MARKER = '/* Short-landscape settings: controls before decorative preview. */';
const SHORT_LANDSCAPE_SETTINGS_CSS = `
${MARKER}
@media (orientation: landscape) and (max-height: 520px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings {
    grid-template-columns: minmax(0, 1fr); gap: 12px;
    padding-top: calc(var(--sat) + 8px); padding-bottom: calc(var(--sab) + 16px);
    touch-action: pan-x pan-y;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings > .iw-head { gap: 10px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-head__title { font-size: 28px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings__panel { padding: 10px; gap: 8px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-tabs {
    flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; touch-action: pan-x;
    overscroll-behavior-x: contain; margin-bottom: 4px; scrollbar-width: thin;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-tab { flex: 1 0 auto; min-height: 44px; padding: 8px 12px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-prev { padding: 12px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-prev__stage { display: none; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-settings .iw-prev__help { margin-bottom: 0; }
}
`;

function replaceOnce(code, before, after, label) {
  if (code.split(before).length !== 2) throw new Error('landscape settings: expected exactly one ' + label);
  return code.replace(before, after);
}

export function adaptLandscapeSettings(rel, code) {
  if (rel === 'styles/mobile.css') {
    if (code.includes(MARKER)) throw new Error('landscape settings: repeated CSS transform');
    return code + SHORT_LANDSCAPE_SETTINGS_CSS;
  }
  if (rel !== 'src/ui/menus.js') return code;
  const start = code.indexOf('  _scr_settings() {');
  const end = code.indexOf('\n  // ================================================================ SCREEN: howto', start);
  if (start < 0 || end < start) throw new Error('landscape settings: missing screen boundary');
  let screen = code.slice(start, end);
  if (screen.includes('const syncTabSelection =')) throw new Error('landscape settings: repeated menu transform');
  const edit = (before, after, label) => { screen = replaceOnce(screen, before, after, label); };
  edit(`    const selectTab = (i, sound) => {`, `    // Reveal only the horizontal strip, never scroll the settings document.
    const revealTab = (b) => {
      if (!b || tabsEl.scrollWidth <= tabsEl.clientWidth) return;
      const strip = tabsEl.getBoundingClientRect(), tab = b.getBoundingClientRect();
      if (tab.left < strip.left) tabsEl.scrollLeft -= strip.left - tab.left;
      else if (tab.right > strip.right) tabsEl.scrollLeft += tab.right - strip.right;
    };
    const syncTabSelection = (i) => {
      tabBtns.forEach((b, k) => {
        b.classList.toggle('is-sel', k === i);
        b.setAttribute('aria-pressed', String(k === i));
      });
      revealTab(tabBtns[i]);
    };
    const selectTab = (i, sound) => {`, 'tab strip reveal connection');
  edit(`      tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === i));`, `      syncTabSelection(i);`, 'selected tab state');
  edit(`      if (i === tabIdx && rowsEl.childElementCount) return false;`, `      if (i === tabIdx && rowsEl.childElementCount) { revealTab(tabBtns[i]); return false; }`, 'repeated selected tab visibility');
  edit(`    tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === tabIdx));`, `    syncTabSelection(tabIdx);`, 'initial tab state');
  edit(`      afterMount: () => movePill(true),`, `      afterMount: () => { movePill(true); revealTab(tabBtns[tabIdx]); },`, 'mounted tab visibility');
  edit(`      onFocus: (f) => {`, `      onFocus: (f) => {
        if (tabBtns.includes(f)) revealTab(f);`, 'keyboard tab visibility');
  return code.slice(0, start) + screen + code.slice(end);
}
