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
let tickNow = 0;

// Lifecycle entry points call this when they replace an actor's pose. The
// monotonically changing identity lets the sweep reject that interval without
// guessing from a gameplay-distance threshold.
export function markActorMotionDiscontinuity(actor) {
  if (actor) actor.s3MotionEpoch = (actor.s3MotionEpoch || 0) + 1;
}

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
      nid: undefined, owner: null, epoch: 0, netReady: false, netTp: undefined, tick: -1,
    });
    r.x0 = a.pos.x; r.y0 = a.pos.y; r.z0 = a.pos.z;
    r.alive = !!a.alive;
    r.nid = a.nid;
    r.owner = a.owner ?? null;
    r.epoch = a.s3MotionEpoch || 0;
    r.netReady = !!a.net?.ready;
    r.netTp = a.net?.tp;
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
  if (r.epoch !== (actor.s3MotionEpoch || 0)) return null;
  // NetMatch carries an explicit teleport identity (`tp`) in its buffered
  // samples. A first ready sample and each later identity change are snaps,
  // even when the relocation is shorter than ordinary movement can be.
  if (actor.remote && actor.net && (r.netReady !== !!actor.net.ready || r.netTp !== actor.net.tp)) return null;
  return r;
}

// Monotonic snapshot counter, exported for tests/diagnostics.
export function actorMotionTick() { return tickNow; }
