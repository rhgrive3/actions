// Resolve swing-foot clearance from the SAME frame's unadjusted pair of poses.
// A per-foot correction inside _footPose() reads one previous-frame foot and
// one current-frame foot, depending on update order, causing asymmetric jitter.
// Keep planted contacts fixed and make the total correction exactly one gap
// deficit even when both feet swing; all offsets fade to zero at touchdown.
const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function resolveWalkFootClearance(feet, yaw, minGap, footLength) {
  const [left, right] = feet;
  if (!left || !right || !Number.isFinite(yaw) || !(minGap > 0) || !(footLength > 0)) return 0;
  const weight = f => f.sw && !f.planted ? Math.sin(Math.PI * clamp01(f.su)) : 0;
  const lw = weight(left), rw = weight(right), total = lw + rw;
  if (total <= 1e-10) return 0;
  const ax = Math.cos(yaw), az = -Math.sin(yaw);
  const dx = left.cw.x - right.cw.x, dz = left.cw.z - right.cw.z;
  const lateral = (dx * ax + dz * az) * left.side;
  const longitudinal = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw));
  const nearby = 1 - smooth(footLength * .5, footLength, longitudinal);
  const deficit = Math.max(0, minGap - lateral);
  const amount = deficit * nearby * Math.max(lw, rw);
  if (!(amount > 0)) return 0;
  const leftPart = amount * lw / total, rightPart = amount * rw / total;
  left.cw.x += leftPart * left.side * ax;
  left.cw.z += leftPart * left.side * az;
  right.cw.x += rightPart * right.side * ax;
  right.cw.z += rightPart * right.side * az;
  return amount;
}
