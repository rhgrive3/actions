// Presentation-only Shooter sight cue. Reuse the launcher's existing muzzle,
// aim ray and LOS field query; this never creates or edits a projectile.
export function installMuzzleFeedback(api) {
  const { Projectiles, G, THREE, Hit } = api;
  Projectiles.prototype.muzzleBlockFeedback = function (actor) {
    if (!actor || !actor.alive || actor.form !== 'kid' || actor.weapon?.kind !== 'shooter'
      || !actor.character || !actor.aimPoint || !actor.aimDir || !G.physics?.raycast
      || typeof this._muzzle !== 'function' || typeof this._aimFrom !== 'function') return null;

    const scratch = this._muzzleBlockScratch || (this._muzzleBlockScratch = {
      muzzle: new THREE.Vector3(), direction: new THREE.Vector3(), hit: new Hit(),
    });
    this._muzzle(actor, scratch.muzzle);
    this._aimFrom(actor, scratch.muzzle, scratch.direction);
    const distance = scratch.muzzle.distanceTo(actor.aimPoint);
    if (!Number.isFinite(distance) || distance < 1e-6) return null;

    const hit = G.physics.raycast(scratch.muzzle, scratch.direction, distance, scratch.hit, true);
    return hit.hit ? hit : null;
  };
}
