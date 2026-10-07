// Presentation-only Shooter sight cue. The composed runtime previews the nominal
// (unspread) shot's first field contact with the same spawn state, integrator
// and swept field query a real shot uses within its existing lifetime
// (Projectiles.s3ShooterImpact in weapons-fidelity.mjs); this never creates or
// edits a projectile and never draws RNG.
export function installMuzzleFeedback(api) {
  const { Projectiles, G } = api;
  Projectiles.prototype.muzzleBlockFeedback = function (actor) {
    if (!actor || !actor.alive || actor.form !== 'kid' || actor.weapon?.kind !== 'shooter'
      || !actor.character || !actor.aimPoint || !actor.aimDir || !G.physics?.raycast
      || typeof this.s3ShooterImpact !== 'function') return null;
    return this.s3ShooterImpact(actor, actor.weapon);
  };
}
