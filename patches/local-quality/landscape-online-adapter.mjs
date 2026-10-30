// Only the short touch-landscape hub needs denser geometry. Keep the existing
// ink surfaces, state classes, input handlers and tablet/portrait layout intact.
const MARKER = '/* short-landscape online entry: compact cards with local overflow */';
export const LANDSCAPE_ONLINE_CSS = `
${MARKER}
@media (orientation: landscape) and (max-height: 500px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online.iw-screen {
    grid-template-columns: minmax(0, 1.4fr) minmax(200px, .8fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    align-content: stretch;
    padding-top: calc(var(--sat) + 12px);
    padding-bottom: calc(var(--sab) + 16px);
    overflow: hidden;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online.iw-screen > .iw-head {
    margin-bottom: 0;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-head__title {
    font-size: 30px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-head__sub {
    margin-top: .3em;
    padding-block: .3em;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__body,
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__me {
    min-height: 0;
    align-self: stretch;
    gap: 12px;
    padding: 8px 10px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    scroll-padding-block: 8px 16px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__body > *,
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__me > * {
    flex-shrink: 0;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__me {
    pointer-events: auto;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__chips {
    gap: 12px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hubcard--create {
    min-height: 76px;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 10px 12px;
  }
  /* The title already names the action; omit only the long instructional blurb. */
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hubcard--create .iw-hubcard__sub {
    display: none;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hubcard__title {
    margin-top: .2em;
    font-size: 24px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hubcard__icon {
    width: 36px;
    height: 44px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hubcard--join {
    padding: 10px 12px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-join__head {
    align-items: center;
    gap: 8px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-join__btns {
    gap: 8px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-code-input {
    min-height: 44px;
    height: 44px;
    margin: 8px 0;
    font-size: 26px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-join__foot {
    min-height: 18px;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-jstat__txt span {
    overflow-wrap: anywhere;
  }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-online .iw-hub__steps {
    gap: 10px;
  }
}
`;

export function adaptLandscapeOnline(rel, code) {
  if (rel !== 'styles/ui.css' || code.includes(MARKER)) return code;
  if (!code.includes('.iw-hubcard--create') || !code.includes('.iw-join__foot')) {
    throw new Error('landscape online adapter: expected hub CSS anchors missing');
  }
  return code + '\n' + LANDSCAPE_ONLINE_CSS;
}
