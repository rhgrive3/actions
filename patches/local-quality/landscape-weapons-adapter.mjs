// Build-only fixes for the existing touch weapon catalogue. Keep the captured
// upstream snapshot, artwork, catalogue order, filters and selection lifecycle.
const MARK = '/* Short landscape weapon catalogue: readable names, not clipped rows. */';
const TOUCH = ':is(html.iw-touch .iw-ui, .iw-ui.is-touch)';

export function adaptLandscapeWeapons(rel, code) {
  if (rel === 'src/ui/menus.js') {
    const before = "      const c = h('button', { class: 'iw-wcard iw-in iw-in--pop' + (id === equipped ? ' is-equipped' : '') + (isNew ? ' is-new' : ''), style:";
    if (code.split(before).length !== 2) throw new Error('landscape weapons: expected one primary catalogue card');
    // The visible label wraps in landscape; the complete localized name is
    // also available to assistive technology independently of NEW/kit marks.
    return code.replace(before, before.replace(', style:', ", 'aria-label': w.name, style:"));
  }
  if (rel !== 'styles/ui.css') return code;
  if (code.includes(MARK)) throw new Error('landscape weapons: repeated stylesheet transform');
  return code + `
${MARK}
@media (orientation: landscape) and (max-width: 1200px) {
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body .iw-wgrid.s3-wgrid {
    grid-template-columns: repeat(auto-fill, minmax(min(136px, 100%), 1fr));
    grid-auto-rows: auto; gap: 14px; padding: 8px;
    scroll-padding-block: 8px;
  }
  ${TOUCH} .iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard {
    min-width: 0; min-height: 132px; height: auto;
    padding: 8px 6px; gap: 3px;
  }
  ${TOUCH} .iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard__name {
    display: block; width: 100%; min-width: 0; min-height: 3.6em;
    font-size: 14px !important; line-height: 1.2;
    white-space: normal; word-break: normal; line-break: strict;
    overflow-wrap: break-word; overflow: visible; text-overflow: clip;
    -webkit-line-clamp: unset; line-clamp: unset;
  }
  ${TOUCH} .iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard__icon {
    flex: none; height: 34px;
  }
  ${TOUCH} .iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard__icon svg { height: 34px; }
  ${TOUCH} .iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard.is-focus {
    transform: none;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.2), 0 0 0 2px #fff,
      0 0 0 4px var(--k), 0 0 0 6px rgba(var(--a-rgb),.5);
  }
}
@media (orientation: landscape) and (max-width: 1200px) and (max-height: 500px) {
  ${TOUCH} .iw-screen.iw-loadout {
    padding-top: calc(var(--sat) + 8px);
    padding-bottom: calc(var(--sab) + 16px);
  }
  ${TOUCH} .iw-screen.iw-loadout > .iw-head { margin-bottom: 6px; min-height: 54px; }
  ${TOUCH} .iw-screen.iw-loadout .iw-head__titles { padding-right: 120px; }
  ${TOUCH} .iw-screen.iw-loadout .iw-head__title { font-size: 28px; line-height: 1.1; }
  ${TOUCH} .iw-screen.iw-loadout .iw-head__sub { font-size: 12px; line-height: 1.25; }
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body { gap: 8px; }
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body > .iw-seclabel {
    position: absolute; top: -42px; right: 0; margin: 0;
    min-height: 24px; gap: 6px; font-size: 12px;
  }
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body .iw-wgrid.s3-wgrid {
    max-height: min(76dvh, 560px);
  }
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard {
    min-height: 120px; padding-block: 6px; gap: 2px;
  }
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard__icon,
  ${TOUCH} .iw-screen.iw-loadout .iw-loadout__body .s3-wgrid .iw-wcard__icon svg { height: 26px; }
}
`;
}
