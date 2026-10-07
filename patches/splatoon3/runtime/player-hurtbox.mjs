// #430: weapon-vs-player geometry is not the actor's terrain envelope.
// Profile dimensions use the existing, explicitly unverified uniform world scale.
// Keep swim collision and each weapon's own projectile radius independent.
export const hurtboxRadius = (actor, player) => actor.form === 'squid'
  ? player.radius : (player.s3HumanoidHurtRadius ?? player.radius);
export const hurtboxHeight = (actor, player) => actor.form === 'squid'
  ? player.squidHeight : (player.s3HumanoidHurtHeight ?? player.height);
