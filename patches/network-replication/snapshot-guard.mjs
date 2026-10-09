// #1178: reject malformed owner-owned actor rows before Hermite sampling.
// Rows are received over the network; ownership checks alone do not validate their scalars.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min, max) => finite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
// The wire encodes performance.now() seconds with r3(), i.e. rounded milliseconds.
// Keep that integer representable before it can poison the peer replay watermark.
export function validSnapshotTimestamp(timestamp) {
  return finite(timestamp) && timestamp >= 0 && Number.isSafeInteger(Math.round(timestamp * 1000));
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
export function validBossMove(move) {
  if (!move || typeof move !== 'object' || Array.isArray(move) || !validSnapshotTimestamp(move.t0)
    || !integer(move.s, 0, 0xffffffff) || !Array.isArray(move.d) || move.d.length !== 3
    || !move.d.every(v => finite(v) && v >= 0) || !move.p || typeof move.p !== 'object' || Array.isArray(move.p)) return false;
  const p = move.p, fields = keys => keys.every(key => finite(p[key]));
  switch (move.id) {
    case 'slam': return fields(['x', 'y', 'z']) && Array.isArray(p.rings) && p.rings.every(v => finite(v) && v >= 0);
    case 'barrage': return fields(['sx', 'sy', 'sz']) && Array.isArray(p.b)
      && p.b.every(b => Array.isArray(b) && b.length === 4 && b.every(finite));
    case 'sweep': return fields(['ox', 'oy', 'oz', 'y', 'a0', 'a1', 'c']);
    case 'charge': return fields(['x', 'y', 'z', 'yaw', 'L', 'v', 'wall', 'stun']) && p.L >= 0 && p.v > 0;
    case 'crablets': return integer(p.n, 0, Number.MAX_SAFE_INTEGER);
    case 'frenzy': return fields(['x', 'y', 'z', 'rot0', 'spin', 'stun']);
    default: return false;
  }
}
export function validActorSnapshotRow(row, timestamp) {
  if (!Array.isArray(row) || row.length < 21 || row.length > 25 || !validSnapshotTimestamp(timestamp)) return false;
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
