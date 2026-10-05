// Player-forward launch inheritance remains separate from canonical ballistics.
// Charger paint/spacing now belongs to weapons-charger-flight.mjs and pinned raw data.
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
