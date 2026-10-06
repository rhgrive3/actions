// The gauge follows the native action's local fixed-step trajectory and its
// actual landing surface. This preserves the meter during the strike without
// treating the native fall-impact safety timeout as the normal landing time.
import { STEP } from './clock.mjs';

export const SPECIAL_GAUGE_SEGMENTS = 23;
const NATIVE_FALL_TIMEOUT = 1.2; // Actor._updateSpecial's existing `s.t > 1.2` safety condition.
const FALL_SPEED = 34; // Actor._updateSpecial's existing fall velocity.
// Exact expression of src/core/ctx.js's exported damp(a,b,lambda,dt).
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

const lastSegment = state => Math.min(state.gaugeStart, state.gaugeCost / SPECIAL_GAUGE_SEGMENTS);

function landingHeight(actor, state, G, PLAYER) {
  if (typeof G.physics?.groundProbe !== 'function' || !actor.ground?.constructor) return null;
  const down = FALL_SPEED * NATIVE_FALL_TIMEOUT + PLAYER.ledgeAssist + 0.02;
  const hit = new actor.ground.constructor();
  G.physics.groundProbe(state.gaugeLandingX, state.gaugeLandingY, state.gaugeLandingZ,
    PLAYER.ledgeAssist, down, PLAYER.footRadius, hit, false);

  // Native landing resolution also admits solid stage rails. Reuse that exact
  // actor helper against the projected fall-start point without mutating actor.
  if (typeof actor._railFeet === 'function') {
    const shadow = { pos: { x: state.gaugeLandingX, y: state.gaugeLandingY, z: state.gaugeLandingZ }, _railIds: [] };
    actor._railFeet.call(shadow, hit,
      state.gaugeLandingY - down, state.gaugeLandingY + PLAYER.ledgeAssist);
  }
  return hit.hit ? hit.y : null;
}

// Return the number of future native fixed updates until landing or the
// existing timeout. The pre-fall phase loop mirrors Actor._updateSpecial's
// strict `>` phase transitions; fall contact uses the same groundProbe range.
function remainingActionSteps(actor, state, special, G, PLAYER) {
  if (actor.grounded || state.phase === 'fall' && state.t > NATIVE_FALL_TIMEOUT) return 0;

  let x = actor.pos.x, y = actor.pos.y, z = actor.pos.z;
  let vx = actor.vel.x, vy = actor.vel.y, vz = actor.vel.z;
  let phase = state.phase, phaseTime = state.t, steps = 0;
  const move = actor.intent?.move || { x: 0, z: 0 };
  const maxPreFall = Math.ceil((special.rise + special.hang) / STEP) + 4;

  while (phase !== 'fall' && steps < maxPreFall) {
    steps++;
    phaseTime += STEP;
    if (phase === 'rise') {
      vy -= PLAYER.gravity * 0.9 * STEP;
      vx = damp(vx, move.x * 2.5, 6, STEP);
      vz = damp(vz, move.z * 2.5, 6, STEP);
      if (phaseTime > special.rise) { phase = 'hang'; phaseTime = 0; vx = 0; vy = 0.6; vz = 0; }
    } else if (phase === 'hang') {
      vy = 0.4;
      if (phaseTime > special.hang) { phase = 'fall'; phaseTime = 0; vx = 0; vy = -FALL_SPEED; vz = 0; }
    }
    x += vx * STEP; y += vy * STEP; z += vz * STEP;
  }

  // A malformed/changed phase must not create an unbounded projection. Keep
  // the native timeout as the conservative end condition in that case.
  if (phase !== 'fall') return steps + Math.ceil(NATIVE_FALL_TIMEOUT / STEP) + 1;

  state.gaugeLandingX = x; state.gaugeLandingY = y; state.gaugeLandingZ = z;
  const floorY = landingHeight(actor, state, G, PLAYER);
  let fallTime = phaseTime;
  const maxFallSteps = Math.ceil(NATIVE_FALL_TIMEOUT / STEP) + 2;
  for (let fallSteps = 1; fallSteps <= maxFallSteps; fallSteps++) {
    fallTime += STEP;
    const previousY = y;
    y -= FALL_SPEED * STEP;
    const landed = floorY !== null && floorY >= y - 0.02 && floorY <= previousY + PLAYER.ledgeAssist;
    if (landed || fallTime > NATIVE_FALL_TIMEOUT) return steps + fallSteps;
  }
  return steps + maxFallSteps;
}

export function beginTidalSlamGauge(actor, state) {
  state.gaugeStart = actor.special;
  state.gaugeCost = actor.specialCost();
  state.gaugeElapsed = 0;
  state.gaugeMismatch = null;
}

export function updateTidalSlamGauge(actor, state, special, dt, G, PLAYER) {
  if (state.id !== 'slam' || !actor.alive || actor.specialActive !== state) return;
  state.gaugeElapsed += dt;
  const remaining = remainingActionSteps(actor, state, special, G, PLAYER) * STEP;
  const duration = state.gaugeElapsed + remaining;
  const target = lastSegment(state);
  const fraction = duration > 0 ? Math.min(1, state.gaugeElapsed / duration) : 1;
  const next = state.gaugeStart - (state.gaugeStart - target) * fraction;
  // Meter consumption is monotone even if a moving actor changes the projected
  // landing surface. The landing checks below expose any forecast mismatch.
  actor.special = Math.max(target, Math.min(actor.special, next));
}

export function completeTidalSlamGauge(actor, state) {
  if (!actor.alive || actor.specialActive !== state) return false;
  const target = lastSegment(state);
  state.gaugeMismatch = actor.special - target;
  if (Math.abs(state.gaugeMismatch) <= 1e-7) actor.special = target;
  return Math.abs(state.gaugeMismatch) <= 1e-7;
}

// The final segment remains observable for the completed action's frame. The
// next Actor.update consumes it, matching the actor/action ownership boundary.
export function queueTidalSlamGaugeFinish(actor, state) {
  actor.s3TidalSlamGaugeFinish = state;
}

export function finishTidalSlamGauge(actor) {
  if (!actor.s3TidalSlamGaugeFinish) return false;
  actor.s3TidalSlamGaugeFinish = null;
  actor.special = 0;
  return true;
}

export function clearTidalSlamGaugeFinish(actor) {
  actor.s3TidalSlamGaugeFinish = null;
}
