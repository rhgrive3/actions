// First contact with the same vertical capsule used by native actor hitboxes.
// Closest approach is insufficient when a surface lies between entry and centre.
// This is a narrow query for the native projectile step, not a second integrator.
export function segmentCapsuleEntry(a, b, base, axisRadius, height, hitRadius) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const low = base.y + axisRadius;
  const high = base.y + Math.max(axisRadius, height - axisRadius);
  const x = a.x - base.x, z = a.z - base.z;
  const closestY = Math.max(low, Math.min(high, a.y));
  const distanceY = a.y - closestY, rr = hitRadius * hitRadius;
  if (x * x + z * z + distanceY * distanceY <= rr) return 0;
  const length2 = dx * dx + dy * dy + dz * dz;
  if (length2 === 0) return Infinity;
  let best = Infinity;
  // Infinite cylinder clipped to the capsule's vertical axis span.
  const horizontal2 = dx * dx + dz * dz;
  if (horizontal2 > 0) {
    const dot = x * dx + z * dz;
    const discriminant = dot * dot - horizontal2 * (x * x + z * z - rr);
    if (discriminant >= 0) {
      const t = (-dot - Math.sqrt(discriminant)) / horizontal2;
      const y = a.y + t * dy;
      if (t >= 0 && t <= 1 && y >= low && y <= high) best = t;
    }
  }
  // The two end spheres plus the cylinder form exactly one capsule.
  for (let cap = 0; cap < 2; cap++) {
    const y = a.y - (cap === 0 ? low : high);
    const dot = x * dx + y * dy + z * dz;
    const discriminant = dot * dot - length2 * (x * x + y * y + z * z - rr);
    if (discriminant < 0) continue;
    const t = (-dot - Math.sqrt(discriminant)) / length2;
    if (t >= 0 && t <= 1 && t < best) best = t;
  }
  return best;
}
