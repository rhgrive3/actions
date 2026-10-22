// Intro presentation follows the same pause-aware Match state clock as its
// cinematic. No wall timers may outlive a match or fire through offline pause.
export function beginIntroPresentation(game, match, steps) {
  game._introPresentation = { match, flow: game._matchFlow, origin: match.stateT || 0, index: 0, steps };
}
export function advanceIntroPresentation(game) {
  const record = game._introPresentation;
  if (!record) return;
  const match = record.match;
  if (game.match !== match || game._matchFlow !== record.flow || match.state !== 'intro') {
    game._introPresentation = null; return;
  }
  if (match.paused) return;
  const elapsed = (match.stateT || 0) - record.origin;
  while (record.index < record.steps.length && elapsed + 1e-9 >= record.steps[record.index][0]) {
    const action = record.steps[record.index++][1];
    if (action === 'ready') game.hud?.banner('ready');
    else game.hud?.setVisible(true);
    if (game._introPresentation !== record || game.match !== match || game._matchFlow !== record.flow || match.state !== 'intro') return;
  }
  if (record.index === record.steps.length) game._introPresentation = null;
}
