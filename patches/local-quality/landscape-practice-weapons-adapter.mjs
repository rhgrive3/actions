// Isolated proposal: the real practice DOM contains full names, but its later
// range stylesheet clamps these 12px labels to two lines. Keep existing cards,
// fonts, colours, icons, widths and selection actions; reveal the whole label.
const MARK='/* Landscape practice weapon names: do not discard the third line. */';
export function adaptLandscapePracticeWeapons(rel,code) {
  if(rel!=='styles/ui.css')return code;
  if(code.includes(MARK))throw Error('landscape practice weapons: repeated CSS transform');
  return code+`\n${MARK}
@media (orientation: landscape) and (max-width: 1200px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iwr-pausescr .iwr-wchip b {
    display: block; overflow: visible; overflow-wrap: break-word; line-break: strict;
    -webkit-line-clamp: unset; line-clamp: unset;
  }
}
`;
}
