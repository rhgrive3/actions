// Tidal Slam keeps its actor-owned meter through the native action. This is
// only a gauge lifecycle rule; it does not map Triple Splashdown movement,
// armor, damage, or timing onto the distinct INKWAVE special.
export const SPECIAL_GAUGE_SEGMENTS = 23;

export function beginTidalSlamGauge(actor, state) {
  state.gaugeStart = actor.special;
  state.gaugeCost = actor.specialCost();
  state.gaugeElapsed = 0;
}

export function updateTidalSlamGauge(actor, state, special, dt) {
  if (state.id !== 'slam' || !actor.alive) return;
  const duration = special.rise + special.hang + 1.2; // native fall-impact safety boundary
  const lastSegment = Math.min(state.gaugeStart, state.gaugeCost / SPECIAL_GAUGE_SEGMENTS);
  state.gaugeElapsed = Math.min(duration, state.gaugeElapsed + dt);
  actor.special = Math.max(lastSegment,
    state.gaugeStart - (state.gaugeStart - lastSegment) * (state.gaugeElapsed / duration));
}

export function completeTidalSlamGauge(actor, state) {
  if (!actor.alive || actor.specialActive !== state) return;
  const lastSegment = Math.min(state.gaugeStart, state.gaugeCost / SPECIAL_GAUGE_SEGMENTS);
  actor.special = Math.min(actor.special, lastSegment);
}

export function consumeTidalSlamGauge(actor, state) {
  if (actor.alive && actor.specialActive === state) actor.special = 0;
}
