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
    const w = actor.weapon, physics = G.physics, level = physics.level || G.level;
    this._muzzle(actor, muzzle);
    const aim = actor.aimPoint, dir = actor.aimDir, pos = actor.pos;
    const t = G.time, revision = physics.level?.collisionRevision;
    const reusable = Number.isSafeInteger(revision) && revision >= 0;
    const runner = actor.weaponRunner, charge = runner?.fidelitySplatlingCharge ?? runner?.charge ?? 0;
    const m = this._s3MuzzleFeedbackCache;
    if (reusable && m && Number.isFinite(t) && t >= m.t && t - m.t < .2 &&
      m.actor === actor && m.character === actor.character && m.weapon === w &&
      m.physics === physics && m.level === level && m.blocks === level?.blocks &&
      m.gameLevel === G.level && m.hash === level?.hash && m.revision === revision &&
      m.queryBlocks === level?.queryBlocks && m.queryDynamicBlocks === level?.queryDynamicBlocks &&
      m.triangleWorld === level?.triangleWorld && m.triangleSweep === level?.triangleWorld?.sweepSphere &&
      m.triangleRaycast === level?.triangleWorld?.raycast && m.nativeData === level?.data && m.native === level?.native && m.staticBlockCount === level?.staticBlockCount &&
      m.blocksLength === level?.blocks?.length && m.facesLength === level?.faces?.length && m.faces === level?.faces &&
      m.raycast === physics.raycast && m.impact === this.s3ShooterImpact &&
      m.segment === physics.segment && m.los === physics.los && m.inkFlight === this.inkFlight && m.inkWorld === this.inkFlight?.world &&
      m.muzzleFn === this._muzzle && m.ballistic === this._ballistic && m.aimFn === this._aimFrom &&
      m.nominalFn === this._nominalInkGuide && m.advanceFn === this._advanceInkGuide && m.contactFn === this._inkGuideContact &&
      m.mx === muzzle.x && m.my === muzzle.y && m.mz === muzzle.z &&
      m.ax === aim.x && m.ay === aim.y && m.az === aim.z &&
      m.dx === dir.x && m.dy === dir.y && m.dz === dir.z &&
      m.px === pos.x && m.py === pos.y && m.pz === pos.z &&
      m.team === actor.team && m.remote === actor.remote && m.runner === runner && m.charge === charge && m.chargeTime === w.chargeTime &&
      m.speed === w.projSpeed && m.ballistics === w.ballistics && m.weaponId === actor.weaponId &&
      m.guideFrame === w.shotGuideFrame && m.inkProfile === w.inkFlightProfile && m.yaw === actor.yaw &&
      m.vx === actor.vel?.x && m.vy === actor.vel?.y && m.vz === actor.vel?.z &&
      m.straight === w.straightTime && m.range === w.range &&
      m.radius === w.impactRadius) return m.hit;

    // Preserve the existing full-flight marker admission. ShotGuideFrame is
    // a sourced outer-guide age, not evidence of Nintendo's inner-marker
    // visibility cutoff; that separate UI condition remains unverified.
    const fresh = this.s3ShooterImpact(actor, w);
    const cache = m || { hitCopy: new Hit() };
    cache.actor = actor; cache.character = actor.character; cache.weapon = w;
    cache.physics = physics; cache.level = level; cache.blocks = level?.blocks;
    cache.hash = level?.hash; cache.revision = revision; cache.gameLevel = G.level;
    cache.queryBlocks = level?.queryBlocks; cache.queryDynamicBlocks = level?.queryDynamicBlocks;
    cache.triangleWorld = level?.triangleWorld; cache.triangleSweep = level?.triangleWorld?.sweepSphere;
    cache.triangleRaycast = level?.triangleWorld?.raycast; cache.nativeData = level?.data; cache.native = level?.native; cache.staticBlockCount = level?.staticBlockCount;
    cache.blocksLength = level?.blocks?.length; cache.facesLength = level?.faces?.length; cache.faces = level?.faces;
    cache.raycast = physics.raycast; cache.impact = this.s3ShooterImpact;
    cache.segment = physics.segment; cache.los = physics.los; cache.inkFlight = this.inkFlight; cache.inkWorld = this.inkFlight?.world;
    cache.muzzleFn = this._muzzle; cache.ballistic = this._ballistic; cache.aimFn = this._aimFrom;
    cache.nominalFn = this._nominalInkGuide; cache.advanceFn = this._advanceInkGuide; cache.contactFn = this._inkGuideContact;
    cache.t = Number.isFinite(t) ? t : -Infinity;
    cache.mx = muzzle.x; cache.my = muzzle.y; cache.mz = muzzle.z;
    cache.ax = aim.x; cache.ay = aim.y; cache.az = aim.z;
    cache.dx = dir.x; cache.dy = dir.y; cache.dz = dir.z;
    cache.px = pos.x; cache.py = pos.y; cache.pz = pos.z;
    cache.team = actor.team; cache.remote = actor.remote; cache.runner = runner; cache.charge = charge; cache.chargeTime = w.chargeTime;
    cache.speed = w.projSpeed; cache.ballistics = w.ballistics; cache.weaponId = actor.weaponId;
    cache.guideFrame = w.shotGuideFrame; cache.inkProfile = w.inkFlightProfile; cache.yaw = actor.yaw;
    cache.vx = actor.vel?.x; cache.vy = actor.vel?.y; cache.vz = actor.vel?.z;
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
