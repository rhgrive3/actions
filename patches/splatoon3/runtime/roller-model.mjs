// Roller drum proportions. The upstream drum is 0.60 wide and 0.20 across on a
// 0.84 handle, beside a 1.36 tall kid: 0.44x and 0.15x the body height, while it
// paints a 1.9 wide stripe. Nintendo's public Splat Roller footage shows the
// drum about as long as the Inkling is tall and about a quarter of that across
// (ESTIMATE from video frames; see reference/roller-proportions-2026-10-04.md).
// The drum is widened and thickened, the yoke arms follow its ends and the axle
// moves clear of the hub. Handle, grips, hand frames and gameplay are unchanged.
// No engine imports: character-weapons.js calls this while it builds the def.
export const ROLLER_DRUM = Object.freeze({ width: 2, radius: 1.75 });
const HALF = 0.302, RADIUS = 0.1015, YOKE_X = 0.065, AXLE_Z = 0.745;
const clamp01 = x => Math.max(0, Math.min(1, x));

function warp(geometry, fn) {
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z); }
  p.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}

export function rollerModel(d, { width, radius } = ROLLER_DRUM) {
  const spread = HALF * (width - 1), axle = RADIUS * (radius - 1);
  // Yoke: the arms between the hub and the drum ends stretch outward; bosses and
  // screws at the ends move with them, and the arm tips follow the moved axle.
  // The shaft, hub and reservoir (|x| < 0.065) keep their shape.
  const yoke = (x, y, z) => {
    const ax = Math.abs(x), s = Math.sign(x), out = clamp01((ax - YOKE_X) / (HALF - YOKE_X));
    return [x + s * spread * out, y, z + axle * clamp01((z - AXLE_Z) / 0.055) * clamp01((ax - YOKE_X) / 0.06)];
  };
  warp(d.body, yoke); warp(d.ink, yoke);
  d.drum.scale(width, radius, radius);
  warp(d.drumCaps, (x, y, z) => [x + Math.sign(x) * spread, y * radius, z * radius]);
  d.drumAt.z += axle; d.muzzle.z += axle; d.drumR *= radius;
  return d;
}
