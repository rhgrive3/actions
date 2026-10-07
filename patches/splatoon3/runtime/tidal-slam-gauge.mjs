// The gauge follows the native action's local fixed-step trajectory and its
// actual landing surface. The forecast mirrors Actor._updateSpecial and
// Actor._resolve step for step — the same rise/hang/fall phase clock, the
// same landing window (swept top + ledge assist over the same groundProbe/
// rail support), and the same native completion condition (`fall` contact or
// the existing `s.t > 1.2` timeout). Early native contacts (low ceilings,
// rails, steps) therefore drain at the action's own pace instead of
// truncating the forecast: an early `grounded` read during rise/hang never
// forces the meter straight to one segment. The meter reaches exactly one
// segment on the native impact/timeout update, and the final segment is
// consumed only when the body's existing landing recovery ends (Actor
// `_onLand` hard-land weight over the configured `hardLandTime`), never on
// an invented one-frame boundary.
import { STEP } from './clock.mjs';

export const SPECIAL_GAUGE_SEGMENTS = 23;
const NATIVE_FALL_TIMEOUT = 1.2; // Actor._updateSpecial's existing `s.t > 1.2` safety condition.
const FALL_SPEED = 34; // Actor._updateSpecial's existing fall velocity.
const FALL_PROBE_DOWN = FALL_SPEED * NATIVE_FALL_TIMEOUT + 0.02;
// Exact expression of src/core/ctx.js's exported damp(a,b,lambda,dt).
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

const lastSegment = state => Math.min(state.gaugeStart, state.gaugeCost / SPECIAL_GAUGE_SEGMENTS);

// One native landing probe with Actor._resolve's exact call order: the same
// groundProbe window first, then the level-rail foot check over the same
// range. `hit` is any ground-probe result object; the rail check reads only
// pos and _railIds, so a plain shadow keeps the real actor untouched.
function surfaceUnder(actor, x, y, z, up, down, G, PLAYER, hit) {
  G.physics.groundProbe(x, y, z, up, down, PLAYER.footRadius, hit, false);
  if (typeof actor._railFeet === 'function') {
    const shadow = { pos: { x, y, z }, _railIds: [] };
    actor._railFeet.call(shadow, hit, y - down, y + up);
  }
  return hit.hit ? hit.y : null;
}


// Number of future native fixed updates until landing or the existing
// timeout. The pre-fall loop mirrors Actor._updateSpecial's strict `>`
// phase transitions, and every projected step applies Actor._resolve's
// landing rule: only at velocity <= 0.5, only inside the swept top +
// ledge-assist window, then snap to the support and zero the velocity. This
// is what stops an early contact (resting on the floor during rise after a
// ceiling bounce, a rail, a step) from reading as "the action already ended".
function remainingActionSteps(actor, state, special, G, PLAYER) {
  // Native completion only: fall contact or the existing safety timeout.
  if (state.phase === 'fall' && (actor.grounded || state.t > NATIVE_FALL_TIMEOUT)) return 0;
  const budget = Math.ceil((special.rise + special.hang) / STEP) + Math.ceil(NATIVE_FALL_TIMEOUT / STEP) + 2;
  if (typeof G.physics?.groundProbe !== 'function' || !actor.ground?.constructor) return budget;

  const hit = new actor.ground.constructor();
  let x = actor.pos.x, y = actor.pos.y, z = actor.pos.z;
  let vx = actor.vel.x, vy = actor.vel.y, vz = actor.vel.z;
  let phase = state.phase, phaseTime = state.t, steps = 0;
  const move = actor.intent?.move || { x: 0, z: 0 };
  const maxPreFall = Math.ceil((special.rise + special.hang) / STEP) + 4;
  // Support under the body's current position, probed once with the window
  // the native landing branch would reach; cached so the forecast costs at
  // most two probe calls per tick.
  const support = surfaceUnder(actor, x, y, z, PLAYER.ledgeAssist, FALL_PROBE_DOWN, G, PLAYER, hit);

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
    const prevY = y;
    x += vx * STEP; y += vy * STEP; z += vz * STEP;
    if (vy > 0.5 || support === null) continue;   // Actor._resolve skips its landing branch above 0.5
    const top = Math.max(prevY, y);
    if (support >= y - 0.02 && support <= top + PLAYER.ledgeAssist && (vy <= 0 || support - y < 0.02)) {
      y = support; vy = 0;                        // native snap: pos.y = surface, vel.y = 0
      if (phase === 'fall') return steps;         // contact inside a fall update IS the native impact
    }
  }

  // A malformed/changed phase must not create an unbounded projection. Keep
  // the native timeout as the conservative end condition in that case.
  if (phase !== 'fall') return budget;

  // Fall: Actor._resolve probes from the swept top of each step, so for a
  // fixed horizontal position one probe from the fall-start window (ledge
  // assist up, the full native 1.2 s fall reach down) is the union of those
  // per-step windows; the loop replays the native landing condition on it.
  const floorY = surfaceUnder(actor, x, y, z, PLAYER.ledgeAssist, FALL_PROBE_DOWN, G, PLAYER, hit);
  vy = -FALL_SPEED;
  const maxFall = Math.ceil(NATIVE_FALL_TIMEOUT / STEP) + 2;
  let fallSteps = 0;
  while (fallSteps < maxFall) {
    fallSteps++;
    const prevY = y;
    y += vy * STEP;
    if (floorY !== null && floorY >= y - 0.02 && floorY <= prevY + PLAYER.ledgeAssist) return steps + fallSteps;
    // Same `s.t > 1.2` safety bound (s.t restarts at 0 on the phase change).
    if (fallSteps * STEP > NATIVE_FALL_TIMEOUT) return steps + fallSteps;
  }
  return steps + maxFall;
}

export function beginTidalSlamGauge(actor, state) {
  state.gaugeStart = actor.special;
  state.gaugeCost = actor.specialCost();
  state.gaugeElapsed = 0;
  state.gaugeMismatch = null;
}

export function updateTidalSlamGauge(actor, state, special, dt, G, PLAYER) {
  // Owner-authoritative only: a replicated `{ net: true }` proxy state mirrors
  // the packed gauge and must never run local forecast math.
  if (state.id !== 'slam' || state.net || !actor.alive || actor.specialActive !== state) return;
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

// The final segment stays observable from the impact frame through the
// body's existing landing completion: Actor._onLand charged `hardLand` at the
// impact landing and Actor.update runs it down over the configured
// `hardLandTime`. A timeout impact without ground (void) keeps the pending
// segment until the body actually lands — or until the existing death/reset
// paths clear it, so Special Saver sees the real remainder either way.
export function queueTidalSlamGaugeFinish(actor, state) {
  state.gaugeLandedAtImpact = !!actor.grounded;
  actor.s3TidalSlamGaugeFinish = state;
}

export function finishTidalSlamGauge(actor) {
  const state = actor.s3TidalSlamGaugeFinish;
  if (!state || !actor.alive) return false;
  if (!state.gaugeLandedAtImpact && !actor.grounded) return false;  // void impact: wait for the real landing
  if (actor.hardLand > 0) return false;                            // existing hard-landing recovery still active
  actor.s3TidalSlamGaugeFinish = null;
  actor.special = 0;
  return true;
}

export function clearTidalSlamGaugeFinish(actor) {
  actor.s3TidalSlamGaugeFinish = null;
}
