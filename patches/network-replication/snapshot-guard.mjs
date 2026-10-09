// #1178: reject malformed owner-owned actor rows before Hermite sampling.
// Rows are received over the network; ownership checks alone do not validate their scalars.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min, max) => finite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
export function validActorSnapshotRow(row, timestamp) {
  if (!Array.isArray(row) || row.length < 21 || row.length > 25 || !finite(timestamp)) return false;
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
