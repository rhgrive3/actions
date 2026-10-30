// PROPOSAL ONLY: not wired into production. The existing iPad-landscape lobby
// drawer JPEG proves a separate スプラシュータ / ー split in its 100px grid.
const MARK = '/* Landscape lobby weapon drawer: preserve complete readable names. */';
export function adaptLandscapeWeaponDrawer(rel, code) {
  if (rel === 'src/ui/menus.js') {
    const before = "        const c = h('button', { class: 'iw-wcard iw-rowin' + (id === equipped ? ' is-equipped' : ''), style:";
    if (code.split(before).length !== 2) throw new Error('landscape weapon drawer: expected one lobby card owner');
    return code.replace(before, before.replace(', style:', ", 'aria-label': w.name, style:"));
  }
  if (rel !== 'styles/ui.css') return code;
  if (code.includes(MARK)) throw new Error('landscape weapon drawer: repeated CSS transform');
  return code + `
${MARK}
@media (orientation: landscape) and (max-width: 1200px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr .iw-ldr__grid {
    grid-template-columns: repeat(auto-fit, minmax(min(136px, 100%), 1fr));
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr .iw-ldr__grid .iw-wcard {
    min-width: 0; height: auto;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr .iw-ldr__grid .iw-wcard__name {
    flex: none; display: block; width: 100%; min-width: 0; min-height: 2.6em;
    line-height: 1.3; white-space: normal; word-break: normal; line-break: strict;
    overflow-wrap: break-word; overflow: visible; text-overflow: clip;
    -webkit-line-clamp: unset; line-clamp: unset;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr .iw-ldr__grid .iw-wcard__icon {
    flex: 1 0 40px; min-height: 40px;
  }
}
`;
}
