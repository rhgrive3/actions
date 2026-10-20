// #1648: host-side admission of owner-reported actor poses before they reach the
// ranked objective rules (Rainmaker/clam pickup, checkpoint, goal, tower ride,
// host-simulated Rainmaker blasts). Pure logic: the NetMatch hook lives in
// network.mjs and the consumer in install.mjs/combat.mjs. Cosmetic playback
// interpolation is untouched; only the pose handed to the rules is gated.
//
// Contract (a plausibility gate, not a host physics simulation): the pose the
// rules see can never be farther from an earlier admitted pose than
// hSpeed * (host-receive elapsed time + burst) of travel, relocations are
// limited to explicit epochs (respawn near the team spawner, Super Jump landing
// near a teammate/home point), and a pose that fails stays at the last accepted
// one. Travel budget is a token bucket refilled by host-receive time, so the
// owner's own timestamps cannot widen it. While a pose is being held back the
// bucket may keep filling for as long as it has been held: the player could have
// covered exactly that much ground, so a legitimate player whose pose was held
// back (long lag burst, an unrecognised relocation) catches up by itself, and a
// forged jump simply becomes a hSpeed-limited slide that costs the cheater the
// time it takes to run there.
//
// Limits are derived from implemented values, none are new Splatoon 3 numbers:
//  hSpeed 30 u/s  > fastest non-Super-Jump motion implemented: Reefslider
//                   top speed .405*60 = 24.3 (all-specials.mjs), Kraken dash 21,
//                   Zipcaster pull 19, swim 11.52 * gear (profile.json).
//  vSpeed 40 u/s  = PLAYER.maxFall (config.js); jump launch speeds are < 10.
//  burst  0.5 s   host-visible stall/jitter that may be repaid by a packet
//                   burst (token cap). It also bounds how far a pose that sat
//                   idle may jump once: hSpeed*burst = 15 u.
//  respawnRadius  20 = spawner ring 1.1 + Squid Spawn range <= 12 + 4.5 drop +
//                   margin (actor.js respawn(), respawn-lifecycle.mjs).
//  sjRadius       10 = landing 1.1 short of the target + one 20 Hz/RTT of
//                   teammate motion. sjMinCharge .7 stays below the charge wait
//                   (80F = 1.33 s in superjump.mjs, 0.75 s in the raw actor.js,
//                   shorter with Quick Super Jump). sjMaxEpisode 8 > startup
//                   22F + charge 80F + flight <= 1.15 + .6 s + Stealth Jump
//                   <= 60F extra (~4.5 s) plus owner hitches; flight ticks may
//                   be lost, so only the episode length is bounded.
export const POSE_FLAGS = Object.freeze({ ALIVE: 1, CLIMB: 8, GROUNDED: 16, SJ_CHARGE: 16384, SJ_FLIGHT: 32768 });
export const POSE_LIMITS = Object.freeze({
  hSpeed: 30, vSpeed: 40, burst: 0.5,
  respawnRadius: 20, sjRadius: 10, sjMinCharge: 0.7, sjMaxEpisode: 8,
  groundTolerance: 1, groundProbe: 1.8,
  obstructionMin: 1, obstructionMaxDt: 0.35, obstructionLift: 0.8,
});
const SJ = POSE_FLAGS.SJ_CHARGE | POSE_FLAGS.SJ_FLIGHT;
const finite = Number.isFinite;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (p, points, radius) => Array.isArray(points) && points.some(q => Array.isArray(q) && q.length === 3 && q.every(finite) && dist3(p, q) <= radius);

// The seed is the host's own knowledge of the actor (its spawn pose, or where it
// was drawn when this host took over). It acts as the first admitted pose.
export function createPoseState(seedPos, at, grounded = false) {
  const t0 = finite(at) ? at : 0;
  return { last: { pos: seedPos.slice(), t: -Infinity, at: t0, life: -1, flags: 0, grounded: !!grounded, relocation: true },
    tokens: POSE_LIMITS.burst, recvAt: t0, rejectSince: undefined, sjSince: undefined, admitted: 0, rejected: 0 };
}

// Whether a claimed `grounded` is believable at `pos`. Missing world data keeps
// the claim; a known floor far below (airborne spoof) or none (water) does not.
// `supported(pos)` admits moving platforms (Tower deck) the static floor lacks.
export function groundedBelievable(claimed, pos, world, L = POSE_LIMITS) {
  if (!claimed) return false;
  if (typeof world?.floorAt !== 'function') return true;
  if (world.supportedAt?.(pos) === true) return true;
  const floor = world.floorAt(pos[0], pos[2], pos[1] + L.groundProbe);
  return finite(floor) && Math.abs(pos[1] - floor) <= L.groundTolerance;
}

// sample = { t: owner clock, at: host receive clock (s), pos: [x,y,z], flags, life }
// ctx = { world, spawns: [[x,y,z]], anchors: [[x,y,z]] teammates, limits }
export function admitRankedPose(state, sample, ctx = {}) {
  const L = ctx.limits ? { ...POSE_LIMITS, ...ctx.limits } : POSE_LIMITS;
  const { pos, flags } = sample;
  if (!state || !Array.isArray(pos) || pos.length !== 3 || !pos.every(finite) || !finite(sample.t) || !finite(sample.at)
    || !Number.isSafeInteger(flags) || !Number.isSafeInteger(sample.life)) return false;
  // Refill the travel budget with host time spent since the previous sample was
  // processed. While a pose is being held back the bucket may grow by the hold time.
  const hold = state.rejectSince === undefined ? 0 : Math.max(0, sample.at - state.rejectSince);
  state.tokens = Math.min(L.burst + hold, state.tokens + Math.max(0, sample.at - state.recvAt));
  state.recvAt = Math.max(state.recvAt, sample.at);
  // Super Jump episode, tracked on every sample (admitted or not).
  const prior = { since: state.sjSince };
  if (flags & SJ) { if (state.sjSince === undefined) state.sjSince = sample.t; }
  else state.sjSince = undefined;
  const spawns = ctx.spawns || [];
  const admit = relocation => {
    const grounded = groundedBelievable(!!(flags & POSE_FLAGS.GROUNDED), pos, ctx.world, L);
    state.last = { pos: pos.slice(), t: sample.t, at: sample.at, life: sample.life, flags, grounded, relocation: !!relocation };
    state.rejectSince = undefined;
    state.tokens = Math.min(state.tokens, L.burst);
    state.admitted++;
    return true;
  };
  const reject = () => {
    if (state.rejectSince === undefined) state.rejectSince = sample.at;
    state.rejected++;
    return false;
  };
  const prev = state.last;
  // Relocation epoch 1: a new life reappears at the team spawner.
  if (sample.life > prev.life && near(pos, spawns, L.respawnRadius)) return admit(true);
  // Relocation epoch 2: a Super Jump that was charged and flown lands at a teammate or the home point.
  if (!(flags & SJ) && prior.since !== undefined && sample.t - prior.since >= L.sjMinCharge
      && sample.t - prior.since <= L.sjMaxEpisode && near(pos, [...spawns, ...(ctx.anchors || [])], L.sjRadius)) return admit(true);
  // Ordinary motion: travel time at the speed ceilings must fit the host-time budget.
  const dh = Math.hypot(pos[0] - prev.pos[0], pos[2] - prev.pos[2]), dv = Math.abs(pos[1] - prev.pos[1]);
  const need = Math.max(dh / L.hSpeed, dv / L.vSpeed);
  if (need > state.tokens + 1e-9) return reject();
  // Tunnelling: consecutive owner samples (not a long-held pose) may not cross solid geometry.
  if (dh > L.obstructionMin && sample.t - prev.t <= L.obstructionMaxDt && !((flags | prev.flags) & (SJ | POSE_FLAGS.CLIMB))
      && typeof ctx.world?.blocked === 'function') {
    const up = L.obstructionLift;
    if (ctx.world.blocked([prev.pos[0], prev.pos[1] + up, prev.pos[2]], [pos[0], pos[1] + up, pos[2]]) === true) return reject();
  }
  state.tokens -= need;
  return admit(false);
}

// The pose objective rules may use for a remote actor on the host (the seed
// until the first snapshot is admitted).
export function objectivePoseOf(state) {
  const last = state?.last;
  return last ? { pos: last.pos, grounded: last.grounded } : null;
}
