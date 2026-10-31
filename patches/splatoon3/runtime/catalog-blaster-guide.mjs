import { sweptWorldHit } from './weapons-collision.mjs';

// Presentation-only dry prediction for the six catalogue Blaster families.
// The installed catalogue owns descriptor selection, fixed-step movement,
// collision radii and player-velocity inheritance. Do not reproduce those
// equations here or call the emitting/paint/damage/random paths.
const INSTALLED = Symbol.for('inkwave.catalog-blaster-guide.v1');
const HZ = 60, EPS = 1e-9;
const MOVE_FIELDS = Object.freeze(['SpawnSpeed', 'GoStraightToBrakeStateFrame',
  'GoStraightStateEndMaxSpeed', 'BrakeAirResist', 'BrakeGravity', 'FreeAirResist',
  'FreeGravity', 'BrakeToFreeStateFrame', 'BrakeToFreeVelocityXZ', 'BrakeToFreeVelocityY']);
const FIELD_FIELDS = Object.freeze(['InitRadiusForField', 'EndRadiusForField',
  'ChangeFrameForField', 'AfterOffsetInitRadiusForField', 'AfterOffsetEndRadiusForField']);
const VELOCITY_FIELDS = Object.freeze(['XRate', 'ZRate', 'YMinusRate', 'YPlusRate', 'GuideYMinusZero']);
const DEFAULT_FIELDS = Object.freeze(['freeDragPerFrame', 'brakeDragPerFrame',
  'freeGravity', 'brakeGravity', 'brakeToFreeVelocityXZ', 'brakeToFreeVelocityY']);
const finiteVector = v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const same = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

function sampleVector(sample, vector) {
  sample.push(vector?.x, vector?.y, vector?.z);
}
function sampleFields(sample, record, fields) {
  sample.push(record);
  for (const key of fields) sample.push(record?.[key]);
}
function sampleMatrix(sample, matrix) {
  const elements = matrix?.elements;
  sample.push(matrix, elements);
  for (let i = 0; i < 16; i++) sample.push(elements?.[i]);
}

// Exact-input cache only; no approximate muzzle or projected-pixel tolerance.
// The simulation timestamp plus native geometry references/revisions prevent
// retaining a result across world updates. The two consumers in one rendered
// frame (self visibility and HUD) reuse it without another muzzle LOS/sweep.
function capture(cache, system, actor, weapon, record, key, camera, width, height, G, defaults) {
  const ch = actor.character, p = record.parameters, physics = G.physics;
  const level = physics?.level || G.level, runner = actor.weaponRunner;
  if (typeof ch?.getMuzzle !== 'function') return false;
  ch.getMuzzle(cache.rawMuzzle);
  const ready = typeof ch.aimReady === 'function' ? ch.aimReady() : 1;
  cache.aimMuzzle.copy(cache.rawMuzzle);
  const hasAimMuzzle = ready < .98 && typeof ch.getAimMuzzle === 'function'
    ? !!ch.getAimMuzzle(cache.aimMuzzle, actor.aimPitch) : false;
  const move = key === 'blaster-jump' ? p.MoveJumpParam || p.MoveParam : p.MoveParam;
  const burst = key === 'blaster-jump' ? p.BlasterBurstJumpParam || p.BlasterBurstParam : p.BlasterBurstParam;
  const sample = cache.sample;
  sample.length = 0;
  sample.push(actor, weapon, actor.weapon, record, record.family, record.sourceActor, record.legacy,
    p, p.WeaponParam, p.WeaponParam?.ShotGuideFrame, key, burst, burst?.BurstFrame,
    system._muzzle, system._aimFrom, ch, ch.getMuzzle, ch.aimReady, ch.getAimMuzzle, ready, hasAimMuzzle,
    actor.form, actor.grounded, actor.climbing, actor.specialActive, actor.superJumpState,
    actor.remote, actor.yaw, actor.aimPitch, actor.alive, runner, runner?.catalogState,
    runner?.charge, runner?.charging, runner?.streaming, runner?.s3BlasterWindup,
    G.time, G.stage, G.map, G.level, G.collisionRevision,
    physics, physics?.los, physics?.raycast, physics?.segment, physics?.collisionRevision,
    level, level?.layout, level?.extra, level?.native, level?.triangleWorld,
    level?.blocks, level?.blocks?.length, level?.faces, level?.faces?.length,
    level?.hash, level?.hash?.length, level?.queryBlocks, level?.geometryGeneration,
    level?._geometryGeneration, level?._generation, level?.collisionRevision,
    camera, width, height);
  sampleVector(sample, actor.pos); sampleVector(sample, actor.vel);
  sampleVector(sample, actor.aimDir); sampleVector(sample, actor.aimPoint);
  sampleVector(sample, cache.rawMuzzle); sampleVector(sample, cache.aimMuzzle);
  sampleFields(sample, move, MOVE_FIELDS);
  sampleFields(sample, p.CollisionParam, FIELD_FIELDS);
  sampleFields(sample, p.spl__SpawnBulletAdditionMovePlayerParam, VELOCITY_FIELDS);
  sampleFields(sample, defaults, DEFAULT_FIELDS);
  sampleMatrix(sample, camera?.matrixWorldInverse); sampleMatrix(sample, camera?.projectionMatrix);
  return finiteVector(cache.rawMuzzle) && finiteVector(cache.aimMuzzle);
}

export function installCatalogBlasterGuide(api, owners) {
  const { Projectiles, THREE, Hit, G, PLAYER } = api;
  const { mode, advance, collisionRadius, applyPlayerVelocity, defaults } = owners;
  const proto = Projectiles.prototype;
  if (Object.hasOwn(proto, INSTALLED)) return;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const systems = new WeakMap();
  function cacheFor(system, actor) {
    let actors = systems.get(system);
    if (!actors) { actors = new WeakMap(); systems.set(system, actors); }
    let cache = actors.get(actor);
    if (!cache) {
      cache = { point: new THREE.Vector3(), aim: new THREE.Vector3(), rawMuzzle: new THREE.Vector3(), aimMuzzle: new THREE.Vector3(),
        sample: [], previous: [], valid: false, px: 0, py: 0, pz: 0,
        probe: { pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(),
          vel: new THREE.Vector3(), catalog: { r: null, descriptor: null, travel: 0, phase: 0,
            range: Infinity, index: 0, stuck: false, playerVelocityApplied: false } },
        hit: new Hit() };
      cache.view = Object.freeze({ aim: cache.aim, impact: cache.point });
      actors.set(actor, cache);
    }
    return cache;
  }
  proto.s3CatalogBlasterGuide = function (actor, weapon, camera, width, height) {
    const record = weapon?.catalogRecord, parameters = record?.parameters;
    const frames = parameters?.WeaponParam?.ShotGuideFrame;
    if (!actor || record?.family !== 'blaster' || record.legacy === true ||
        !Number.isInteger(frames) || frames <= 0 || !finiteVector(actor.aimDir) ||
        !finiteVector(actor.aimPoint) || !G.physics || typeof this._muzzle !== 'function' ||
        typeof this._aimFrom !== 'function') return null;
    const key = record.sourceActor === 'WeaponBlasterPrecision' && !actor.grounded ? 'blaster-jump' : 'normal';
    const cache = cacheFor(this, actor);
    const sampled = capture(cache, this, actor, weapon, record, key, camera, width, height, G, defaults);
    if (sampled && cache.valid && same(cache.sample, cache.previous) &&
        cache.point.x === cache.px && cache.point.y === cache.py && cache.point.z === cache.pz &&
        cache.aim.x === cache.ax && cache.aim.y === cache.ay && cache.aim.z === cache.az) return cache.point;
    cache.valid = false;
    const descriptor = mode(record, key);
    if (!(descriptor.speed > 0) || !Number.isFinite(descriptor.speed) ||
        !(descriptor.life > 0) || !Number.isFinite(descriptor.life)) return null;
    const p = cache.probe, state = p.catalog;
    p.owner = actor; p.ghost = false; p.age = 0; p.life = descriptor.life;
    state.r = record; state.descriptor = descriptor; state.travel = 0;
    state.phase = 0; state.range = descriptor.range; state.index = 0;
    state.stuck = false; state.playerVelocityApplied = false;
    // origin() also opens a muzzle-FX transaction; the guide must not do that.
    // These are exactly its physical muzzle/aim calls, with no angular RNG.
    this._muzzle(actor, p.pos);
    if (!finiteVector(p.pos)) return null;
    p.start.copy(p.pos); p.prev.copy(p.pos);
    this._aimFrom(actor, p.pos, p.vel);
    p.vel.multiplyScalar(descriptor.speed);
    applyPlayerVelocity(p, { guide: true });
    if (!finiteVector(p.vel)) return null;
    const count = Math.min(frames, Math.ceil(descriptor.life * HZ - EPS));
    let contacted = false;
    for (let frame = 0; frame < count; frame++) {
      const r0 = collisionRadius(descriptor.c, 'Field', p.age * HZ, 0, 0);
      advance(p, false);
      if (!contacted) {
        const r1 = collisionRadius(descriptor.c, 'Field', p.age * HZ, 0, 0);
        const contact = sweptWorldHit(G.physics, p.prev, p.pos, r0, r1, cache.hit, true);
        if (contact.hit) { cache.point.copy(contact.point); contacted = true; }
        else if (p.pos.y < PLAYER.waterY - 1.8) { cache.point.copy(p.pos); contacted = true; }
      }
      // Continue the same nominal path after first contact for the separate
      // aim mark. Only the impact point is clipped; no second integration.
      if (p.age + EPS >= p.life || state.travel + EPS >= state.range) break;
    }
    if (!finiteVector(p.pos)) return null;
    cache.aim.copy(p.pos);
    if (!contacted) cache.point.copy(p.pos);
    cache.px = cache.point.x; cache.py = cache.point.y; cache.pz = cache.point.z;
    cache.ax = cache.aim.x; cache.ay = cache.aim.y; cache.az = cache.aim.z;
    if (sampled) {
      cache.previous.length = cache.sample.length;
      for (let i = 0; i < cache.sample.length; i++) cache.previous[i] = cache.sample[i];
      cache.valid = true;
    }
    return cache.point;
  };
  proto.s3CatalogBlasterReticleGuides = function (actor, weapon, camera, width, height) {
    const point = this.s3CatalogBlasterGuide(actor, weapon, camera, width, height);
    return point ? systems.get(this).get(actor).view : null;
  };
}
