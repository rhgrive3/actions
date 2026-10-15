// #1178: reject malformed owner-owned actor rows before Hermite sampling.
// Current producer extends the legacy 21–25 column range with authoritative
// hit and action sidecars (26/27). Validate core scalars here and leave each
// optional sidecar to its own explicit typed reader.
// Rows are received over the network; ownership checks alone do not validate their scalars.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min, max) => finite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
// The wire encodes performance.now() seconds with r3(), i.e. rounded milliseconds.
// Keep that integer representable before it can poison the peer replay watermark.
// #1283: owner-authenticated event rows must also have a safe, replayable
// payload. The regular producer packs vectors as [x,y,z] and actor refs as
// { n: nid }. Check the wire shape before any event sequence is committed.
const EVENT_VECTOR_FIELDS = ['pos', 'to', 'muzzle', 'dir', 'normal'];
const validEventVector = value => Array.isArray(value) && value.length === 3
  && value.every(n => bounded(n, -1e6, 1e6));
export function validForwardedEventPayload(name, payload) {
  if (typeof name !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  // Also protect other forwarded vector events. Optional fields stay optional,
  // but present fields must never become non-finite THREE.Vector3 components.
  for (const key of EVENT_VECTOR_FIELDS) {
    if (Object.hasOwn(payload, key) && !validEventVector(payload[key])) return false;
  }
  if (name === 'weapon:fire') {
    // Charger ribbons turn these into a mesh width and lifetime. Keep the
    // scalars numeric on all forwarded shots, before replay identity advances.
    return (!Object.hasOwn(payload, 'charge') || bounded(payload.charge, 0, 1.25))
      && (!Object.hasOwn(payload, 'len') || bounded(payload.len, Number.EPSILON, 128));
  }
  if (name !== 'special:slam') return true;
  const actor = payload.actor;
  return !!actor && typeof actor === 'object' && !Array.isArray(actor)
    && integer(actor.n, 0, 0x7fffffff)
    && validEventVector(payload.pos)
    && bounded(payload.radius, Number.MIN_VALUE, 64)
    && Math.fround(payload.radius) > 0;
}

// Receiver-side, active-object budgets, not the size of the pending event FIFO.
// Remote bombs also own victim-local damage, so another actor must not borrow
// their share of the live-object budget. Ordinary local bombs remain intact.
// Count live objects rather than maintaining counters that could go stale on
// explosion, recycling, disconnect, match reset, or ownership handoff.
export const REMOTE_GHOST_BOMB_LIMITS = Object.freeze({ actor: 24, peer: 48, total: 96 });
export const REMOTE_GHOST_STORM_RESERVE = 2;
export function ghostBombActorAllowance(actor, ownerId, roster = null) {
  if (!actor || actor.owner !== ownerId) return 0;
  if (roster === null) return REMOTE_GHOST_BOMB_LIMITS.actor;
  if (!Array.isArray(roster) || !roster.includes(actor) || !roster.length) return 0;
  let owned = 0;
  for (const entry of roster) if (entry?.owner === ownerId) owned++;
  return Math.min(REMOTE_GHOST_BOMB_LIMITS.actor,
    Math.floor(REMOTE_GHOST_BOMB_LIMITS.total / roster.length),
    Math.floor(REMOTE_GHOST_BOMB_LIMITS.peer / owned));
}
export function allowGhostBombBirth(bombs, actor, ownerId, kind = 'bomb', roster = null) {
  if (!Array.isArray(bombs) || !actor || typeof ownerId !== 'string' || !ownerId) return false;
  const allowance = ghostBombActorAllowance(actor, ownerId, roster);
  const stormAllowance = Math.min(REMOTE_GHOST_STORM_RESERVE, allowance);
  const classAllowance = kind === 'storm' ? stormAllowance : allowance - stormAllowance;
  if (classAllowance <= 0) return false;
  let total = 0, byPeer = 0, byActor = 0, byClass = 0;
  for (const b of bombs) {
    if (!b?.ghost) continue;
    total++;
    if (b.owner?.owner === ownerId) byPeer++;
    if (b.owner === actor) {
      byActor++;
      if ((b.kind === 'storm') === (kind === 'storm')) byClass++;
    }
    if (total >= REMOTE_GHOST_BOMB_LIMITS.total
      || byPeer >= REMOTE_GHOST_BOMB_LIMITS.peer
      || byActor >= allowance || byClass >= classAllowance) return false;
  }
  return true;
}

// Bounds intentionally far exceed every published arena and legal native throw.
// Stage bounds add an outer horizontal envelope when a Level supplies them.
export function validNetworkBombBirth(e, stageBounds = null) {
  if (!Array.isArray(e) || e[1] !== 'b' || (e[3] !== 'bomb' && e[3] !== 'storm')) return false;
  for (let i = 4; i <= 9; i++) if (!bounded(e[i], -4096, 4096)) return false;
  if (Math.hypot(e[7], e[8], e[9]) > 1024) return false;
  const b = stageBounds;
  if (b && [b.minX,b.maxX,b.minZ,b.maxZ].every(finite)
    && b.minX <= b.maxX && b.minZ <= b.maxZ) {
    if (e[4] < b.minX - 256 || e[4] > b.maxX + 256
      || e[6] < b.minZ - 256 || e[6] > b.maxZ + 256) return false;
  }
  return true;
}

// Only visual metadata is checked. Gameplay parameters and owner authority
// keep their independent existing gates. Matches current native producer slots
// 19..26 and the renderer's four-entry SAT_SIZE table.
export function validNetworkProjectileCosmetics(e) {
  if (!Array.isArray(e) || e[1] !== 'p') return false;
  if (e[19] !== undefined && e[19] !== 0 && e[19] !== 1) return false;
  for (const [i,low,high] of [[20,0,8],[21,0,16],[22,0,16],[23,0,4],[24,0,512],[25,-2,4]]) {
    if (e[i] !== undefined && !bounded(e[i], low, high)) return false;
  }
  return e[26] === undefined || integer(e[26], 0, 4);
}

export function validSnapshotTimestamp(timestamp) {
  return finite(timestamp) && timestamp >= 0 && Number.isSafeInteger(Math.round(timestamp * 1000));
}

const OWNER_CLOCK_MAX = 365 * 24 * 60 * 60;
const OWNER_TICK_FORWARD_GRACE = 5;
const OWNER_SIM_TICK_MAX = 90 * 24 * 60 * 60 * 60;
const OWNER_SIM_TICK_GRACE = 600;
const EVENT_SEQUENCE_MAX = 10_000_000;
const EVENT_SEQUENCE_FORWARD_WINDOW = 65_536;
export const NETWORK_PROJECTILE_LIFE_MAX = 10;
export const NETWORK_PROJECTILE_DELAY_MAX = 2;

// Owner performance.now() clocks may have arbitrary offsets across peers, so
// the first packet establishes the offset. After that, sender time may advance
// only by the local receive elapsed time plus a generous hitch/jitter budget.
export function validOwnerTickAdvance(timestamp, previousTimestamp, receivedAt, previousReceivedAt) {
  if (!validSnapshotTimestamp(timestamp) || timestamp > OWNER_CLOCK_MAX) return false;
  if (previousTimestamp === undefined) return true;
  if (!validSnapshotTimestamp(previousTimestamp) || timestamp <= previousTimestamp) return false;
  const senderDelta = timestamp - previousTimestamp;
  if (!finite(receivedAt) || !finite(previousReceivedAt)) return senderDelta <= OWNER_TICK_FORWARD_GRACE;
  const receiveDelta = Math.max(0, receivedAt - previousReceivedAt);
  return senderDelta <= receiveDelta + OWNER_TICK_FORWARD_GRACE;
}

// d.u is G.time * 60. It may stall while gameplay is paused, but within one
// owner epoch it must not run backwards or jump hundreds of seconds ahead of
// the corresponding owner timestamp.
export function validOwnerSimulationTick(tick, timestamp, points) {
  if (!integer(tick, 0, OWNER_SIM_TICK_MAX) || !validSnapshotTimestamp(timestamp)) return false;
  if (!Array.isArray(points) || points.length < 2) return true;
  const previousTimestamp = points[points.length - 2], previousTick = points[points.length - 1];
  if (!validSnapshotTimestamp(previousTimestamp) || !integer(previousTick, 0, OWNER_SIM_TICK_MAX)
    || timestamp <= previousTimestamp || tick < previousTick) return false;
  const expectedTicks = Math.ceil((timestamp - previousTimestamp) * 60);
  return tick - previousTick <= expectedTicks + OWNER_SIM_TICK_GRACE;
}

// Sequence identity is session-scoped and can legitimately have gaps, but a
// single packet must never be able to jump the replay watermark near MAX_SAFE.
export function validEventSequence(sequence, previousSequence = 0) {
  if (!integer(sequence, 1, EVENT_SEQUENCE_MAX)) return false;
  if (!integer(previousSequence, 0, EVENT_SEQUENCE_MAX) || previousSequence === 0) return true;
  return sequence > previousSequence && sequence - previousSequence <= EVENT_SEQUENCE_FORWARD_WINDOW;
}

export function validNetworkProjectileTiming(delay, life) {
  return bounded(delay, 0, NETWORK_PROJECTILE_DELAY_MAX)
    && bounded(life, Number.EPSILON, NETWORK_PROJECTILE_LIFE_MAX);
}
// Native Boss.pack has 18 fields, plus an optional full move record. Match the
// producer's structural contract before Boss.unpack/Hermite/guest follow.
export function validBossSnapshotRow(row, timestamp) {
  if (!Array.isArray(row) || (row.length !== 18 && row.length !== 19) || !validSnapshotTimestamp(timestamp)) return false;
  if (!validSnapshotTimestamp(row[0])) return false;
  for (const i of [1, 2, 3]) if (!bounded(row[i], -1e6, 1e6)) return false;
  for (const i of [5, 6]) if (!bounded(row[i], -1e4, 1e4)) return false;
  if (!bounded(row[4], -1e5, 1e5) || !bounded(row[12], -1e5, 1e5)) return false;
  if (!finite(row[7]) || !finite(row[17]) || row[17] <= 0) return false;
  if (!integer(row[8], 1, 3) || !integer(row[9], 0, 15) || !integer(row[11], 0, 2)) return false;
  if (row[10] !== -1 && !validSnapshotTimestamp(row[10])) return false;
  for (const i of [13, 14]) if (!integer(row[i], 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!integer(row[15], -1, Number.MAX_SAFE_INTEGER) || !Array.isArray(row[16])) return false;
  for (const crab of row[16]) {
    if (!Array.isArray(crab) || crab.length !== 6 || !integer(crab[0], 0, Number.MAX_SAFE_INTEGER)) return false;
    for (const i of [1, 2, 3]) if (!bounded(crab[i], -1e6, 1e6)) return false;
    if (!bounded(crab[4], -1e5, 1e5) || !finite(crab[5])) return false;
  }
  return row[18] == null || validBossMove(row[18]);
}
// BossBrain serializes move coordinates and phase times with r3(). Keep its
// rounded integer units representable: finite-only input can still overflow
// barrel interpolation and the resulting Float32 render coordinates.
const wireScalar = value => finite(value) && Number.isSafeInteger(Math.round(value * 1000));
export function validBossMove(move) {
  if (!move || typeof move !== 'object' || Array.isArray(move) || !validSnapshotTimestamp(move.t0)
    || !integer(move.s, 0, 0xffffffff) || !Array.isArray(move.d) || move.d.length !== 3
    || !(move.d[0] > 0) || !move.d.every(v => wireScalar(v) && v >= 0) || !move.p || typeof move.p !== 'object' || Array.isArray(move.p)) return false;
  const p = move.p, fields = keys => keys.every(key => wireScalar(p[key]));
  switch (move.id) {
    case 'slam': return fields(['x', 'y', 'z']) && Array.isArray(p.rings) && p.rings.every(v => wireScalar(v) && v >= 0);
    case 'barrage': return fields(['sx', 'sy', 'sz']) && Array.isArray(p.b) && p.b.length > 0
      && p.b.every(b => Array.isArray(b) && b.length === 4 && b.every(wireScalar));
    case 'sweep': return move.d[1] > 0 && fields(['ox', 'oy', 'oz', 'y', 'a0', 'a1', 'c']);
    case 'charge': return fields(['x', 'y', 'z', 'yaw', 'L', 'v', 'wall', 'stun']) && p.L >= 0 && p.v > 0;
    case 'crablets': return integer(p.n, 0, Number.MAX_SAFE_INTEGER);
    case 'frenzy': return fields(['x', 'y', 'z', 'rot0', 'spin', 'stun']);
    default: return false;
  }
}
export function validActorSnapshotRow(row, timestamp) {
  if (!Array.isArray(row) || row.length < 21 || row.length > 27 || !validSnapshotTimestamp(timestamp)) return false;
  if (!integer(row[0], 0, 0x7fffffff)) return false; // nid
  // position, velocity, heading, aim and wall normal are never allowed to poison
  // interpolation, animation, collision, particles or the GPU.
  for (const i of [1, 2, 3]) if (!bounded(row[i], -1e6, 1e6)) return false;
  for (const i of [4, 5, 6]) if (!bounded(row[i], -1e4, 1e4)) return false;
  for (const i of [7, 8, 9]) if (!bounded(row[i], -1e5, 1e5)) return false;
  if (!integer(row[10], 0, 0x7fffffff)) return false; // flag bitmask
  // A legitimate lethal hit leaves finite negative HP until the next fixed
  // tick commits the splat. Preserve that snapshot for pending-hit adoption.
  if (!bounded(row[11], -1e5, 1e5)) return false;
  for (const i of [12, 13, 14]) if (!bounded(row[i], 0, 1e5)) return false;
  if (!bounded(row[15], 0, 1e9) || !integer(row[16], 0, 0x7fffffff)) return false;
  for (const i of [17, 18, 19]) if (!bounded(row[i], -1.01, 1.01)) return false;
  if (!bounded(row[20], 0, 1e5)) return false;
  if (row.length > 21 && !bounded(row[21], 0, 1e5)) return false;
  if (row.length > 22 && !integer(row[22], 0, 1e9)) return false;
  return true; // adoption payload/sequence is validated by readAdoptionState
}
export function validRemoteActorPose(sample, correction) {
  if (!sample || !correction) return false;
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'aimYaw', 'aimPitch', 'hp', 'ink', 'sp', 'ch', 'turf', 'lock'])
    if (!finite(sample[key])) return false;
  if (!integer(sample.f, 0, 0x7fffffff)) return false;
  if (!bounded(sample.x + correction.x, -1e6, 1e6)
      || !bounded(sample.y + correction.y, -1e6, 1e6)
      || !bounded(sample.z + correction.z, -1e6, 1e6)) return false;
  for (const key of ['x', 'y', 'z']) if (!finite(correction[key])) return false;
  return true;
}
