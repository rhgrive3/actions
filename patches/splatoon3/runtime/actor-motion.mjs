// Issue #1040: time-coherent actor pose capture for projectile sweeps.
//
// The fixed clock advances every actor to its end-of-tick pose first and only
// then sweeps projectiles across the same fixed 1/60 segment. Deciding hits
// against the end pose alone makes a target that merely reaches the path later
// in the tick take a phantom hit, and a target that occupied the path at the
// true pass time evade. This module records each actor's pose at the START of
// the tick (the same interval the projectile segment spans) so the sweep can
// intersect round motion and target motion over one shared parameter.
//
// One preallocated record per actor, stored on the actor itself; refreshing is
// plain number writes, and the sweep reads plain fields. No per-frame arrays,
// closures, or Vector allocations.
//
// MAX_TRAVEL_PER_TICK is an INTERNAL discontinuity guard, not a sourced
// Nintendo value: it only disables sweeping across pose jumps that cannot be
// continuous motion (spawn, teleport, net adoption/relocation, dead-owner
// changes). It sits above every continuous native motion measured in this
// tree (super-jump flight peaks near 1.5 m/tick; remote sample corrections
// stay below ~4.2 m/tick) and far below respawn/adoption jumps (spawn pads are
// tens of metres apart). When the guard trips, callers fall back to testing
// the actor's current pose exactly as before this issue.
const MAX_TRAVEL_PER_TICK = 6.0;
const MAX_TRAVEL_SQ = MAX_TRAVEL_PER_TICK * MAX_TRAVEL_PER_TICK;
let tickNow = 0;

// Called once per fixed simulation tick before any actor moves (clock.mjs),
// including the results-branch remote sample application.
export function beginActorMotionTick(actors) {
  tickNow++;
  // A harness without an actor list still advances the tick: records from
  // earlier ticks then fail the tick match and sweeps fall back to the single
  // current pose.
  if (!Array.isArray(actors)) return;
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    const r = a.s3Motion || (a.s3Motion = {
      x0: 0, y0: 0, z0: 0, valid: false, alive: false,
      nid: undefined, owner: null, tick: -1,
    });
    r.x0 = a.pos.x; r.y0 = a.pos.y; r.z0 = a.pos.z;
    r.alive = !!a.alive;
    r.nid = a.nid;
    r.owner = a.owner ?? null;
    r.tick = tickNow;
    r.valid = true;
  }
}

// The coherent start-of-tick record for `actor`, or null when the interval must
// not be swept: no snapshot this tick, the actor was not alive at the snapshot
// or is not alive now (spawn/death), its identity changed (adoption /
// dead-owner handoff), or the pose jumped discontinuously (teleport). Null
// callers keep the legacy single current-pose test.
export function coherentMotionStart(actor) {
  const r = actor.s3Motion;
  if (!r || !r.valid || !r.alive || !actor.alive) return null;
  if (r.tick !== tickNow) return null;
  if (r.nid !== actor.nid || r.owner !== (actor.owner ?? null)) return null;
  const dx = actor.pos.x - r.x0, dy = actor.pos.y - r.y0, dz = actor.pos.z - r.z0;
  // NaN-safe: a non-finite travel fails the comparison and falls back.
  if (!(dx * dx + dy * dy + dz * dz <= MAX_TRAVEL_SQ)) return null;
  return r;
}

// Monotonic snapshot counter, exported for tests/diagnostics.
export function actorMotionTick() { return tickNow; }
