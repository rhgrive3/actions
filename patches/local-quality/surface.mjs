// Film thickness is expressed in metres; mask derivatives are per texel.
// This changes shading only, never geometry, paint texels or CPU ownership.
export const INK_FILM_HEIGHT = 0.004;
export function inkSlopeScale(ppm) {
  if (!(ppm > 0) || !Number.isFinite(ppm)) throw new RangeError('Invalid atlas density');
  return ppm * INK_FILM_HEIGHT / 1.9;
}
export function onSupportPlane(point, normal, feet, supportNormal) {
  if (!supportNormal || supportNormal.y <= .6) return false;
  const agreement = normal.x * supportNormal.x + normal.y * supportNormal.y + normal.z * supportNormal.z;
  const distance = (point.x - feet.x) * supportNormal.x + (point.y - feet.y) * supportNormal.y + (point.z - feet.z) * supportNormal.z;
  return agreement > .995 && Math.abs(distance) < .03;
}
