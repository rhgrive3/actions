// S3 11.3.0 endpoint ratios, retaining INKWAVE's existing calibration anchors.
// Intermediate charge uses the existing normalized charge coordinate and linear
// interpolation. Absolute Nintendo distance and internal clamping remain unverified.
const partial = (charge, min, max) => min + (max - min) * Math.max(0, Math.min(1, charge));
export function chargerImpactRadius(w, charge) {
  const p = w.impactPaint;
  return w.impactRadius * (charge >= .999 ? p.full : partial(charge, p.min, p.max)) / p.max;
}
export function chargerLineSpacing(w, charge) {
  const p = w.lineSpacing;
  const depth = charge >= .999 ? p.depthFull : partial(charge, p.depthMin, p.depthMax);
  const overlap = charge >= .999 ? p.overlapFull : partial(charge, p.overlapMin, p.overlapMax);
  return w.lineSplatEvery * depth * (1 - overlap) / (p.depthMin * (1 - p.overlapMin));
}
export function addPlayerForwardVelocity(p) {
  const a = p.owner, w = p.s3Weapon ?? a?.weapon;
  if (!a || a.remote || p.ghost || p.s3ForwardVelocityApplied) return;
  if (!(w?.kind === 'dualies' && p.type === 'shot' || w?.kind === 'roller' && p.type === 'drop')) return;
  const rate = w.spawnPlayerForwardRate;
  if (!Number.isFinite(rate) || !Number.isFinite(a.yaw) || !Number.isFinite(a.vel?.x) || !Number.isFinite(a.vel?.z)) return;
  // Only local Z is specified by the source. Reuse actor yaw (the existing
  // Roller launch basis), not random glob spread or pitch and not full a.vel.
  const x = Math.sin(a.yaw), z = Math.cos(a.yaw);
  const amount = (a.vel.x * x + a.vel.z * z) * rate;
  p.vel.x += x * amount; p.vel.z += z * amount;
  p.s3ForwardVelocityApplied = true;
}
