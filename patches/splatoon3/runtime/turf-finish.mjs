// Host Turf coverage belongs to the deadline, before state listeners and the
// remainder of the simulation tick can advance paint. Presentation may continue.
export function captureTurfFinish(match, nextState, paint) {
  if (nextState === 'intro' || nextState === 'playing') match.s3FinishCoverage = null;
  if (nextState !== 'finish' || match.state !== 'playing' || match.bossMode) return;
  if (!match.follower) {
    const coverage = paint.coverage();
    match.s3FinishCoverage = Object.freeze([coverage[0], coverage[1]]);
  }
  const actor = match.local;
  if (!actor) return;
  actor.intent?.move?.set(0, 0, 0);
  // Clear both sides of edge detection: clearing a held sub alone would invent
  // a release and throw a bomb in the first finish Actor update.
  for (const state of [actor.intent, actor._prevIntent]) if (state)
    for (const key of ['fire', 'squid', 'sub', 'jump', 'special']) state[key] = false;
  actor.fireBuffer = 0; actor.jumpBuffer = 0;
}
