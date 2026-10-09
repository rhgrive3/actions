const EPS = 1e-10;
export function chargerSwimLocked(a) {
  return a.weapon?.kind === 'charger' && (a.weaponRunner?.s3ChargerSwimRemaining || 0) > EPS;
}
// Capsule helpers return distance to the axis segment, not surface distance.
// The caller adds the actor radius once, and only once.
export function mainPlayerRadius(p, player) {
  const w = p.s3Weapon || p.owner?.weapon;
  return w?.kind === 'shooter' && Number.isFinite(w.playerHitRadius)
    ? w.playerHitRadius : p.size - player.radius * .05;
}
export function chargerLinePaint(w, charge) {
  const c = Math.max(0, Math.min(1, charge)), shape = w.linePaint;
  const width = shape.widthMin + (shape.widthMax - shape.widthMin) * c;
  const depth = shape.depthMin + (shape.depthMax - shape.depthMin) * c;
  // Keep the legacy minimum cross-width anchor. Only dimensionless reference
  // ratios are transferred; the native asymmetric smear is not an S3 ellipse.
  return {radius: w.lineRadius * .8 * width / shape.widthMin, stretchAmt: Math.max(0, depth / width - 1)};
}
export function installChargerSurface({Actor,WeaponRunner,Projectiles}) {
  const tag = Symbol.for('inkwave.s3.charger-surface.v1');
  if (Actor.prototype[tag]) return;
  Object.defineProperty(Actor.prototype,tag,{value:true});
  const reset = WeaponRunner.prototype.reset, update = Actor.prototype.update, shot = Projectiles.prototype.fireCharger;
  WeaponRunner.prototype.reset = function(...args) { this.s3ChargerSwimRemaining = 0; return reset.apply(this,args); };
  Actor.prototype.update = function(dt,...args) {
    const r = this.weaponRunner;
    r.s3ChargerSwimRemaining = Math.max(0,(r.s3ChargerSwimRemaining || 0) - Math.max(0,dt));
    return update.call(this,dt,...args);
  };
  Projectiles.prototype.fireCharger = function(a,w,...args) {
    const result = shot.call(this,a,w,...args);
    a.weaponRunner.s3ChargerSwimRemaining = w.postShotSwimTime;
    return result;
  };
}
