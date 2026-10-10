// Presentation-only Shooter sight cue. Reuse the exact first-hit simulation when
// its full source state is unchanged (#945); the cached Hit is a separate copy,
// never the mutable shared scratch Hit owned by s3ShooterImpact.
export function installMuzzleFeedback(api) {
  const { Projectiles, G, THREE, Hit } = api;
  const muzzle = new THREE.Vector3();
  Projectiles.prototype.muzzleBlockFeedback = function (actor) {
    if (!actor || !actor.alive || actor.form !== 'kid' || actor.weapon?.kind !== 'shooter'
      || !actor.character || !actor.aimPoint || !actor.aimDir || !G.physics?.raycast
      || typeof this.s3ShooterImpact !== 'function' || typeof this._muzzle !== 'function') return null;
    const w = actor.weapon, physics = G.physics, level = physics.level;
    this._muzzle(actor, muzzle);
    const aim = actor.aimPoint, dir = actor.aimDir, pos = actor.pos;
    const t = G.time, generation = level?.geometryGeneration ?? level?._geometryGeneration ?? level?._generation;
    const m = this._s3MuzzleFeedbackCache;
    if (m && Number.isFinite(t) && t >= m.t && t - m.t < .2 &&
      m.actor === actor && m.character === actor.character && m.weapon === w &&
      m.physics === physics && m.level === level && m.blocks === level?.blocks &&
      m.hash === level?.hash && m.blockStamp === level?.blockStamp &&
      m.generation === generation && m.blocksLength === level?.blocks?.length && m.facesLength === level?.faces?.length &&
      m.raycast === physics.raycast && m.impact === this.s3ShooterImpact &&
      m.muzzleFn === this._muzzle && m.ballistic === this._ballistic &&
      m.mx === muzzle.x && m.my === muzzle.y && m.mz === muzzle.z &&
      m.ax === aim.x && m.ay === aim.y && m.az === aim.z &&
      m.dx === dir.x && m.dy === dir.y && m.dz === dir.z &&
      m.px === pos.x && m.py === pos.y && m.pz === pos.z &&
      m.team === actor.team && m.speed === w.projSpeed &&
      m.straight === w.straightTime && m.range === w.range &&
      m.radius === w.impactRadius) return m.hit;

    const fresh = this.s3ShooterImpact(actor, w);
    const cache = m || { hitCopy: new Hit() };
    cache.actor = actor; cache.character = actor.character; cache.weapon = w;
    cache.physics = physics; cache.level = level; cache.blocks = level?.blocks;
    cache.hash = level?.hash; cache.blockStamp = level?.blockStamp;
    cache.generation = generation; cache.blocksLength = level?.blocks?.length; cache.facesLength = level?.faces?.length;
    cache.raycast = physics.raycast; cache.impact = this.s3ShooterImpact;
    cache.muzzleFn = this._muzzle; cache.ballistic = this._ballistic;
    cache.t = Number.isFinite(t) ? t : -Infinity;
    cache.mx = muzzle.x; cache.my = muzzle.y; cache.mz = muzzle.z;
    cache.ax = aim.x; cache.ay = aim.y; cache.az = aim.z;
    cache.dx = dir.x; cache.dy = dir.y; cache.dz = dir.z;
    cache.px = pos.x; cache.py = pos.y; cache.pz = pos.z;
    cache.team = actor.team; cache.speed = w.projSpeed;
    cache.straight = w.straightTime; cache.range = w.range; cache.radius = w.impactRadius;
    if (fresh) {
      const h = cache.hitCopy;
      h.hit = fresh.hit; h.dist = fresh.dist; h.block = fresh.block;
      h.face = fresh.face; h.u = fresh.u; h.v = fresh.v;
      h.point.copy(fresh.point); h.normal.copy(fresh.normal);
      cache.hit = h;
    } else cache.hit = null;
    this._s3MuzzleFeedbackCache = cache;
    return cache.hit;
  };
}
