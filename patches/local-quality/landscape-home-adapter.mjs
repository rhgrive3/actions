// Short touch-landscape home geometry only. Keep the hash-locked input and the
// existing menu actions, artwork, colours, typefaces and interaction code intact.
const MARKER = '/* Short-landscape home: preserve all seven launch actions. */';

const CSS = `
${MARKER}
@media (orientation: landscape) and (max-height: 500px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main {
    --menu-gap: 16px;
    padding: calc(var(--sat) + 12px) calc(var(--sar) + 20px) calc(var(--sab) + 16px) calc(var(--sal) + 20px);
    gap: 12px 20px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__logo { margin: 0; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__logo .iw-logo { font-size: 32px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 14px;
    align-content: start;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu .iw-btn--menu {
    height: auto;
    min-height: 48px;
    margin-bottom: 0;
    padding: 10px 12px;
    gap: 8px;
    font-size: 18px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu :is(.iw-btn--xl, .iw-btn--online) { min-height: 96px; font-size: 20px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu .iw-btn--online { grid-template-columns: 24px minmax(0, 1fr); gap: 6px 8px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu .iw-btn__icon { width: 24px; height: 24px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu .iw-btn__sub { font-size: 13px; line-height: 1.35; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__side { gap: 12px; margin-top: 0; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__desc { font-size: 13px; }
}
@media (orientation: landscape) and (max-height: 500px) and (min-width: 740px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main { grid-template-columns: minmax(0, 1.5fr) minmax(240px, 1fr); }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__menu { grid-column: 1; grid-row: 2; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main .iw-main__side { grid-column: 2; grid-row: 2; }
}
@media (orientation: landscape) and (max-height: 500px) and (max-width: 739px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main { grid-template-columns: minmax(0, 1fr); }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main :is(.iw-main__menu, .iw-main__side) { grid-column: 1; grid-row: auto; }
}
`;

export function adaptLandscapeHome(rel, code) {
  if (rel !== 'styles/ui.css') return code;
  if (code.includes(MARKER)) throw new Error('landscape home: repeated CSS transform');
  return code + '\n' + CSS;
}
