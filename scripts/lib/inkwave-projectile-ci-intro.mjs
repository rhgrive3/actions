// Browser-serializable harness fixture. Only the cosmetic Turf intro is
// advanced; live match frames, rendering, physics and firing are never skipped.
// The native Game._frame/Match.update handlers own the 'playing' transition.
export function completeNativeTurfIntro() {
  const game = window.__inkwave, G = window.__G, match = game?.match;
  if (G?.mode !== 'match' || !match || match !== G.match ||
      match.attract || !match.local?.isLocal || !match.controller ||
      !G.projectiles || !G.renderer || !game.debug?.freeze ||
      !game.debug?.unfreeze || typeof game._frame !== 'function') {
    throw new Error('Intro fixture requires an initialized, local native Turf match');
  }
  // A nominally "playing" state is not sufficient when the game is paused,
  // frozen, attached to online state, or running a boss scenario.
  if (match.paused || game.frozen || match.bossMode || G.netm) {
    throw new Error('Intro fixture requires an unpaused offline Turf match');
  }
  if (match.state === 'playing') {
    return { method: 'natural', frames: 0, before: 'playing', after: 'playing',
      matchTimeBefore: match.time, matchTimeAfter: match.time };
  }
  if (match.state !== 'intro') {
    throw new Error('Intro fixture must begin at the native Turf intro');
  }
  const stateTBefore = match.stateT;
  const matchTimeBefore = match.time;
  const skipRenderBefore = game._skipRender;
  let frames = 0;
  game.debug.freeze();
  try {
    game._skipRender = true;
    while (match.state === 'intro' && frames < 360) {
      game._frame(1 / 60);
      frames++;
      if (game.match !== match || G.match !== match) {
        throw new Error('Native match identity changed during intro');
      }
    }
  } finally {
    game._skipRender = skipRenderBefore;
    game.debug.unfreeze();
  }
  if (match.state !== 'playing' || match.time !== matchTimeBefore) {
    throw new Error('Native intro did not transition to playing without consuming match time');
  }
  return { method: 'native-fixed-60Hz-intro-render-suppressed', frames,
    before: 'intro', after: match.state, stateTBefore, stateTAfter: match.stateT,
    matchTimeBefore, matchTimeAfter: match.time };
}
