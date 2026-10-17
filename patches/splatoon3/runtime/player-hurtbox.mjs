// #430: weapon-vs-player geometry is not the actor's terrain envelope.
// Profile dimensions use the existing, explicitly unverified uniform world scale.
// Keep swim collision and each weapon's own projectile radius independent.
export const hurtboxRadius = (actor, player) => actor.form === 'squid'
  ? (player.s3SwimHurtRadius ?? player.radius) : (player.s3HumanoidHurtRadius ?? player.radius);
// ColBullet_Height_Squid=0 in the pinned SplPlayer collision record: the
// capsule's straight segment is absent, leaving a sphere of radius .675.
// Do not borrow terrain squidHeight; changing a movement collider must not
// elongate the independently configured bullet-receiving shape. The retained
// base/centre placement and humanoid dimensions still require retail checks.
export const hurtboxHeight = (actor, player) => actor.form === 'squid'
  ? 2 * hurtboxRadius(actor, player) + (player.s3SwimHurtSegmentHeight ?? 0)
  : (player.s3HumanoidHurtHeight ?? player.height);
