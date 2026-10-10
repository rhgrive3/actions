// Runtime overlay for the ten Splatoon 3 sub weapons that are not represented
// by the published INKWAVE bomb/support lanes.  The upstream release path still
// owns input admission, ink payment, throw pose and the hold clock: this module
// consumes the real Projectiles.throwBomb call after WeaponRunner has admitted
// and paid for the equipped sub.  Bomb/suction/curling continue through the
// native bomb pipeline, and Point Sensor continues through kit-support.mjs.
//
// Raw 11.3.0 facts below are copied from the pinned parameter tables. Where the
// public table omits a lifetime, HP scale, world mapping or effect cadence, the
// runtime uses a value explicitly labelled calibrated. These are functional
// approximations, not a claim of retail frame-for-frame equivalence.

import { fidelityThrowVelocity, SUB_SPECIAL_FIDELITY } from './sub-special-fidelity.mjs';
import { gearCurve } from './gear.mjs';

const INSTALL = Symbol.for('inkwave.s3.all-subs.v1');
const STEP = 1 / 60;
const MAX_OBJECTS = 96;
const MAX_REPLAY_EVENTS = 256;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const finite3 = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const frameSeconds = f => f / 60;
const rawDamage = n => n / 10;
const speedPerSecond = n => n * 60;

// The core values are extracted from the table named in `source`; other fields
// are called out at the point of use and on `calibration`.
export const ALL_SUB_SPECS = Object.freeze({
  burst: Object.freeze({
    id: 'burst', name: 'Burst Bomb', source: 'WeaponBombQuick.game__GameParameterTable.json',
    inkCost: 45, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(60),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 4, damageInner: 2.8, damageOuter: 4, damageMax: rawDamage(350), damageMin: rawDamage(250), damageFalloff: 'calibrated-quadratic',
    paintRadius: 4, crossPaintRadius: 1.4, gravity: 24, fuse: .72,
    directDamage: 60, directDamageStatus: 'calibrated-current-gameplay',
    inkCostFallback: 45, calibration: 'fuse/gravity/world scale and quadratic interpolation calibrated; raw splash damage, paint and throw tuple extracted; direct damage calibrated from current gameplay references',
  }),
  autobomb: Object.freeze({
    id: 'autobomb', name: 'Autobomb', source: 'WeaponBombRobot.game__GameParameterTable.json',
    inkCost: 55, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 6.5, damageInner: 2.85, damageOuter: 6.5, damageMax: rawDamage(1800), damageMin: rawDamage(300), damageFalloff: 'calibrated-quadratic',
    paintRadius: 4, gravity: 24, chaseRadius: 10, chaseSpeed: 5.4,
    chaseSeconds: frameSeconds(150), noTargetSeconds: frameSeconds(180),
    inkCostFallback: 55, calibration: 'damage/radius/chase frame rows and throw tuple extracted; world mapping/paint calibrated',
  }),
  fizzy: Object.freeze({
    id: 'fizzy', name: 'Fizzy Bomb', source: 'WeaponBombFizzy.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(1.36), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.36), mid: speedPerSecond(1.6), high: speedPerSecond(1.84) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    chargeFrames: Object.freeze([40, 80]), burstWaitFrames: Object.freeze([15, 1, 1]), objectDamage: rawDamage(100),
    // `chargeable` is reserved by kit-subs for Curling Bomb's path and expects
    // its minCharge/maxCharge blast tuple. Fizzy's hold timing is instead read
    // directly from the real runner by this module at throw time.
    maxChargeTime: frameSeconds(80),
    bursts: Object.freeze([
      Object.freeze({ radius: 3.8, damageInner: 1.6, damageOuter: 3.8, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'calibrated-quadratic', paintRadius: 3.0, crossPaintRadius: 2.0 }),
      Object.freeze({ radius: 4.5, damageInner: 1.95, damageOuter: 4.5, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'calibrated-quadratic', paintRadius: 3.4, crossPaintRadius: 2.0 }),
      Object.freeze({ radius: 5.45, damageInner: 2.6, damageOuter: 5.45, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'calibrated-quadratic', paintRadius: 3.8, crossPaintRadius: 2.0 }),
    ]),
    gravity: 24, inkCostFallback: 60,
    calibration: 'charge frames and blast arrays extracted; bounce flight and hop interval calibrated',
  }),
  torpedo: Object.freeze({
    id: 'torpedo', name: 'Torpedo', source: 'WeaponBombTorpedo.game__GameParameterTable.json',
    inkCost: 65, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(88),
    throwSpeed: speedPerSecond(1.4), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.4), mid: speedPerSecond(1.65), high: speedPerSecond(1.9) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 6, damageInner: 2.6, damageOuter: 6, damageMax: rawDamage(600), damageMin: rawDamage(350), damageFalloff: 'calibrated-quadratic',
    paintRadius: 3.5, burstSeconds: frameSeconds(30), gravity: 24, chaseRadius: 12,
    splashRadius: 2.6, splashPaintRadius: 2, splashDamage: rawDamage(120),
    inkCostFallback: 65, calibration: 'damage/radius/fuse and throw tuple extracted; target acquisition/world mapping calibrated',
  }),
  inkMine: Object.freeze({
    id: 'inkMine', name: 'Ink Mine', source: 'WeaponTrap.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: 0,
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.12), high: speedPerSecond(1.12) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 0, inheritZ: 0, inheritYPlus: 0, inheritYMax: 0,
    radius: 8, damageInner: 3.6, damageOuter: 8, damageMax: rawDamage(450), damageMin: rawDamage(350), damageFalloff: 'calibrated-quadratic',
    markRadiusTiers: Object.freeze([8, 9.5, 11]), sensorRadius: 3, sensorRadiusTiers: Object.freeze([3, 3.5, 4]), inkTriggerRadius: .45, markFrames: Object.freeze([300, 450, 600]), paintRadius: 5,
    maxOwnerObjects: 2, lifetime: Infinity, armSeconds: .6, gravity: 24,
    inkCostFallback: 60, calibration: 'cost, sensor/damage/paint radii and marks extracted; public gameplay reports indefinite lifetime and oldest-mine detonation on third placement; arm/ink-contact/world scale calibrated',
  }),
  toxicMist: Object.freeze({
    id: 'toxicMist', name: 'Toxic Mist', source: 'WeaponPoisonMist.game__GameParameterTable.json',
    inkCost: 55, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(80),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 5.4, lifetime: 6, gravity: 24, slowScale: .72, inkDrainPerSecond: 6,
    inkCostFallback: 55, calibration: 'cost, area cutoff and effect-level frames extracted; lifetime/slow/drain/world scale calibrated',
  }),
  angleShooter: Object.freeze({
    id: 'angleShooter', name: 'Angle Shooter', source: 'WeaponLineMarker.game__GameParameterTable.json',
    inkCost: 40, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(50),
    throwSpeed: speedPerSecond(6.3), throwSpeedTiers: Object.freeze({ low: speedPerSecond(6.3), mid: speedPerSecond(6.55), high: speedPerSecond(6.8) }),
    spawnSpeedY: 0, spawnSpeedYWorldMin: speedPerSecond(-100), inheritX: 0, inheritYPlus: 0, inheritYMax: 0,
    directDamage: rawDamage(400), markFrames: Object.freeze([300, 450, 600]),
    tailFrames: 90, paintRadius: 2.6, collisionRadius: .25, gravity: 0, maxBounces: 2,
    inkCostFallback: 40, calibration: 'direct damage, marking/tail frames, paint radius and throw speed extracted; rebound mapping calibrated',
  }),
  splashWall: Object.freeze({
    id: 'splashWall', name: 'Splash Wall', source: 'WeaponShield.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(.3), throwSpeedTiers: Object.freeze({ low: speedPerSecond(.3), mid: speedPerSecond(.3), high: speedPerSecond(.3) }),
    spawnSpeedY: speedPerSecond(.07), spawnSpeedYWorldMin: speedPerSecond(-.5), inheritX: 0, inheritYPlus: 0, inheritYMax: 0,
    gravity: .009 * 3600, wallHpTiers: Object.freeze([800, 1150, 1500]), wallWidth: 4.2, wallHeight: 2.8, lifetime: 7,
    inkCostFallback: 60, calibration: 'cost/recovery/gravity/throw/HP tiers extracted; wall dimensions and lifetime calibrated',
  }),
  sprinkler: Object.freeze({
    id: 'sprinkler', name: 'Sprinkler', source: 'WeaponSprinkler.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(60),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.12), high: speedPerSecond(1.12) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    hitPaintRadius: 2.9, paintRadius: .25,
    firstPeriodFrames: Object.freeze([480, 630, 780]), laterPeriodFrames: Object.freeze([900, 960, 1020]),
    maxOwnerObjects: 1, lifetime: Infinity, hp: 120, gravity: 24,
    inkCostFallback: 60, calibration: 'cost/recovery/cadence/paint radii extracted; droplet pattern and world mapping calibrated; public references report 120 HP and unlimited low-power duration',
  }),
  beakon: Object.freeze({
    id: 'beakon', name: 'Squid Beakon', source: 'WeaponBeacon.game__GameParameterTable.json',
    inkCost: 75, inkCostStatus: 'extracted', inkRecoverStop: 0,
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.12), high: speedPerSecond(1.12) }),
    spawnSpeedY: 0, spawnSpeedYWorldMin: speedPerSecond(-.5), inheritX: 0, inheritYPlus: 0, inheritYMax: 0,
    maxOwnerObjects: 3, lifetime: Infinity, hp: 120, uses: 2, equippedUses: 1, gravity: 24,
    inkCostFallback: 75, calibration: 'cost, recovery and throw speed extracted; public references report three placements, 120 HP, one/two-use jumps, and unlimited duration; world mapping calibrated',
  }),
});

export const ALL_SUB_IDS = Object.freeze([
  'bomb', 'suction', 'curling', 'burst', 'autobomb', 'fizzy', 'torpedo',
  'inkMine', 'toxicMist', 'angleShooter', 'splashWall', 'sprinkler', 'beakon', 'pointSensor',
]);

function makeSeed(actor, seq, time) {
  let x = (Math.imul((actor?.nid || 0) + 1, 0x9e3779b1) ^ Math.imul(seq, 0x85ebca6b) ^ Math.imul(Math.floor((time || 0) * 60) + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function entityList(projectiles) { return projectiles._s3SubObjects ||= []; }
function ownerLife(owner) { return Number.isSafeInteger(owner?.netLife) && owner.netLife >= 0 ? owner.netLife : 0; }
function localOwner(owner) { return !!owner && owner.remote !== true; }

function emitEvent(api, object, phase, extra = {}) {
  if (!object || object.ghost || !localOwner(object.owner)) return null;
  const p = object.pos;
  const payload = {
    v: 1, phase, subId: object.subId, seq: object.seq, eventSeq: nextSeq(object.owner),
    life: ownerLife(object.owner), sourceLife: object.sourceLife, subPowerAP: object.subPowerAP, x: p?.x || 0, y: p?.y || 0, z: p?.z || 0,
    vx: object.vel?.x || 0, vy: object.vel?.y || 0, vz: object.vel?.z || 0,
    seed: object.seed >>> 0, charge: clamp(object.charge || 0, 0, 1), ...extra,
    actor: object.owner,
  };
  api.emit?.('all:sub', payload);
  return payload;
}

function visualMaterial(api, owner, opacity = 1, emissive = .15) {
  const color = owner?.color || api.G.teamColors?.[owner?.team] || 0xffcc33;
  return new api.THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive,
    transparent: opacity < 1, opacity, roughness: .52, metalness: .08, depthWrite: opacity >= 1 });
}
function addMesh(api, parent, geometry, material, position = null) {
  const mesh = new api.THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (position) mesh.position.copy(position);
  parent.add(mesh); return mesh;
}
function sceneFor(api, projectiles) { return api.G.scene || projectiles?.scene || api.G.projectiles?.scene || null; }
function buildVisual(api, object, projectiles) {
  const scene=sceneFor(api,projectiles);
  if (!scene?.add) return null;
  const { THREE } = api, group = new THREE.Group(), id = object.subId;
  const color = object.owner?.color || api.G.teamColors?.[object.team] || 0xffcc33;
  const material = visualMaterial(api, object.owner, 1, .22);
  const orb = (r, geo = new THREE.SphereGeometry(r, 12, 9)) => addMesh(api, group, geo, material);
  if (id === 'splashWall' && object.phase === 'deployed') {
    const wallMat = visualMaterial(api, object.owner, .42, .25);
    const wall = addMesh(api, group, new THREE.BoxGeometry(ALL_SUB_SPECS.splashWall.wallWidth, ALL_SUB_SPECS.splashWall.wallHeight, .12), wallMat);
    wall.position.y = ALL_SUB_SPECS.splashWall.wallHeight / 2;
    const foot = addMesh(api, group, new THREE.CylinderGeometry(.16,.2,.22,10), material);
    foot.position.y = .11;
  } else if (id === 'sprinkler' || id === 'beakon') {
    const h = id === 'beakon' ? .85 : .55;
    const body = addMesh(api, group, new THREE.CylinderGeometry(.18,.28,h,10), material);
    body.position.y = h / 2;
    const cap = addMesh(api, group, new THREE.SphereGeometry(.18,10,7), material);
    cap.position.y = h + .06;
  } else if (id === 'angleShooter') {
    const body = addMesh(api, group, new THREE.CylinderGeometry(.065,.11,.75,9), material);
    body.rotation.x = Math.PI / 2;
  } else if (id === 'inkMine') {
    orb(.34, new THREE.SphereGeometry(.34,12,8));
  } else if (id === 'toxicMist' && object.phase === 'deployed') {
    const mistMat = visualMaterial(api, object.owner, .18, .05);
    const cloud = addMesh(api, group, new THREE.SphereGeometry(1,12,9), mistMat);
    cloud.scale.set(ALL_SUB_SPECS.toxicMist.radius, 2.1, ALL_SUB_SPECS.toxicMist.radius);
    cloud.position.y = 1.1;
  } else {
    const r = id === 'autobomb' ? .3 : id === 'splashWall' ? .25 : .2;
    orb(r);
    if (id === 'autobomb') {
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x20202a, roughness: .4 });
      for (const x of [-.12,.12]) { const eye = addMesh(api, group, new THREE.SphereGeometry(.045,7,6), eyeMat); eye.position.set(x,.06,.23); }
    }
  }
  group.position.copy(object.pos);
  group.rotation.y = object.yaw || 0;
  group.userData.s3SubId = id;
  scene.add(group);
  return group;
}
function disposeVisual(api, object, projectiles) {
  const mesh = object?.mesh;
  if (!mesh) return;
  sceneFor(api,projectiles)?.remove?.(mesh);
  const geos = new Set(), mats = new Set();
  mesh.traverse?.(o => {
    if (o.geometry) geos.add(o.geometry);
    const m = Array.isArray(o.material) ? o.material : [o.material];
    for (const item of m) if (item) mats.add(item);
  });
  for (const g of geos) g.dispose?.();
  for (const m of mats) m.dispose?.();
  object.mesh = null;
}
function createObject(api, projectiles, owner, id, record = {}) {
  const baseSpec = ALL_SUB_SPECS[id];
  if (!baseSpec || !owner?.pos || !projectiles) return null;
  const ap = Number.isFinite(record.subPowerAP)?clamp(record.subPowerAP,0,57):(owner.s3?.abilityPoints?.subPower||0);
  const spec = id === 'inkMine' ? { ...baseSpec,
    sensorRadius: gearCurve(ap, ...baseSpec.sensorRadiusTiers),
    markRadius: gearCurve(ap, ...baseSpec.markRadiusTiers),
  } : baseSpec;
  const THREE = api.THREE, seq = Number.isSafeInteger(record.seq) ? record.seq : nextSeq(owner);
  const pos = record.pos?.isVector3 ? record.pos.clone() : new THREE.Vector3(record.x ?? owner.pos.x, record.y ?? owner.pos.y + 1.35, record.z ?? owner.pos.z);
  let vel;
  if (record.vel?.isVector3) vel = record.vel.clone();
  else if ([record.vx, record.vy, record.vz].every(Number.isFinite)) vel = new THREE.Vector3(record.vx,record.vy,record.vz);
  else vel = launchVelocity(api, projectiles, owner, spec, record.charge || 0);
  if (!finite3(pos) || !finite3(vel)) return null;
  const object = {
    subId: id, spec, owner, team: owner.team, seq, sourceLife: ownerLife(owner),
    subPowerAP: ap,
    pos, prev: pos.clone(), vel, phase: 'flight', age: 0,
    seed: Number.isSafeInteger(record.seed) ? record.seed >>> 0 : makeSeed(owner,seq,api.G.time || 0),
    charge: clamp(Number.isFinite(record.charge) ? record.charge : 0,0,1),
    ghost: record.ghost === true, yaw: Number.isFinite(record.yaw) ? record.yaw : owner.aimYaw || owner.yaw || 0,
    fuse: 0, pops: 0, popLimit: 0, bounceCount: 0, pulse: .15,
    seenMarks: new WeakMap(), seenToxic: new WeakMap(),
    dead: false, hp: id === 'splashWall'
      ? gearCurve(ap, ...spec.wallHpTiers)
      : spec.hp || 0,
    usesLeft: id === 'beakon' ? spec.uses : 0,
    reservations: id === 'beakon' ? new Map() : null,
    expireAt: Infinity, activeAt: Infinity,
  };
  if (id === 'fizzy') {
    const hold = Number.isFinite(record.hold) ? record.hold : owner.weaponRunner?.s3SubHold || 0;
    object.popLimit = hold >= frameSeconds(spec.chargeFrames[1]) ? 3 : hold >= frameSeconds(spec.chargeFrames[0]) ? 2 : 1;
    object.pops = object.popLimit;
    object.fuse = frameSeconds(spec.burstWaitFrames[0]);
  }
  const list = entityList(projectiles);
  while (list.length >= MAX_OBJECTS) removeObject(api, projectiles, list[0], true);
  list.push(object);
  object.mesh = buildVisual(api, object, projectiles);
  if (!object.ghost) emitEvent(api,object,'spawn',{ hold: Number.isFinite(record.hold) ? record.hold : 0 });
  return object;
}
function nextSeq(owner) {
  owner.s3AllSubSeq = ((owner.s3AllSubSeq || 0) + 1) % 1_000_000_000;
  if (!owner.s3AllSubSeq) owner.s3AllSubSeq = 1;
  return owner.s3AllSubSeq;
}
function launchVelocity(api, projectiles, actor, spec, charge = 0) {
  const tiers = spec.throwSpeedTiers;
  const power = actor.s3?.modifiers?.subPower ?? 1;
  let speed = spec.throwSpeed;
  if (tiers && gearCurve && Number.isFinite(actor.s3?.abilityPoints?.subPower)) {
    const ap = actor.s3.abilityPoints.subPower || 0;
    const ratio = gearCurve(ap, tiers.low, tiers.mid, tiers.high) / tiers.low;
    speed = spec.throwSpeed * ratio;
  } else speed *= power;
  const template = { ...SUB_SPECIAL_FIDELITY.bomb,
    spawnSpeedY: spec.spawnSpeedY ?? SUB_SPECIAL_FIDELITY.bomb.spawnSpeedY,
    spawnSpeedYWorldMin: spec.spawnSpeedYWorldMin ?? SUB_SPECIAL_FIDELITY.bomb.spawnSpeedYWorldMin,
    inheritX: spec.inheritX ?? SUB_SPECIAL_FIDELITY.bomb.inheritX,
    inheritZ: spec.inheritZ ?? spec.inheritX ?? SUB_SPECIAL_FIDELITY.bomb.inheritX,
    inheritYPlus: spec.inheritYPlus ?? SUB_SPECIAL_FIDELITY.bomb.inheritYPlus,
    inheritYMax: spec.inheritYMax ?? SUB_SPECIAL_FIDELITY.bomb.inheritYMax,
  };
  if (template.inheritZ === template.inheritX)
    return fidelityThrowVelocity(actor,'bomb',new api.THREE.Vector3(),speed,template);
  const pitch=clamp(actor.aimPitch||0,-1.05,1.15),yaw=actor.aimYaw||0,cp=Math.cos(pitch),sp=Math.sin(pitch);
  const av=actor.vel||{x:0,y:0,z:0};
  const horizontal=speed*cp-template.spawnSpeedY*sp;
  let vy=speed*sp+template.spawnSpeedY*cp;
  vy+=Math.min(Math.max(0,av.y||0)*template.inheritYPlus,template.inheritYMax);
  vy=Math.max(template.spawnSpeedYWorldMin,vy);
  return new api.THREE.Vector3(Math.sin(yaw)*horizontal+(av.x||0)*template.inheritX,vy,
    Math.cos(yaw)*horizontal+(av.z||0)*template.inheritZ);
}

function replaceVisual(api, object) {
  const projectiles=api.G.projectiles;
  disposeVisual(api,object,projectiles);
  object.mesh = buildVisual(api,object,projectiles);
}
function removeObject(api, projectiles, object, silent = false) {
  if (!object || object.dead) return false;
  object.dead = true;
  const list = entityList(projectiles), at = list.indexOf(object);
  if (at >= 0) list.splice(at,1);
  if (!silent && !object.ghost) emitEvent(api,object,'expire');
  if (object.subId === 'beakon') {
    const beakons = api.G.s3Beakons;
    if (Array.isArray(beakons)) { const i = beakons.indexOf(object); if (i >= 0) beakons.splice(i,1); }
    api.emit?.('sub:beakon-expire',{ actor:object.owner, beacon:object, team:object.team, seq:object.seq });
  }
  disposeVisual(api,object,projectiles);
  return true;
}

function ownerObjects(projectiles, object) {
  return entityList(projectiles).filter(x => !x.dead && x !== object && x.owner === object.owner && x.subId === object.subId && x.phase === 'deployed');
}
function deploy(api, projectiles, object, pos, normal = null) {
  if (object.dead || object.phase === 'deployed') return;
  if (finite3(pos)) object.pos.copy(pos);
  object.vel.set(0,0,0); object.phase = 'deployed';
  const spec = object.spec;
  const cap = spec.maxOwnerObjects || (object.subId === 'splashWall' ? 1 : 1);
  const siblings = ownerObjects(projectiles,object).sort((a,b) => b.age-a.age);
  while (siblings.length >= cap) {
    const oldest=siblings.shift();
    if(object.subId==='inkMine'){
      // The owner detonates the oldest armed mine when placing a third. Replay
      // ghosts wait for the owner's burst/expire events so they do not simulate
      // a second, locally-authoritative blast.
      if(!object.ghost&&!oldest.ghost)detonateInkMine(api,projectiles,oldest);
      continue;
    }
    removeObject(api,projectiles,oldest);
  }
  if (normal?.isVector3 && (Math.abs(normal.x)+Math.abs(normal.z)>.2)) object.yaw=Math.atan2(normal.x,normal.z);
  object.activeAt = (api.G.time||0) + (object.subId === 'inkMine' ? spec.armSeconds : 0.18);
  object.deployedAt = api.G.time || 0;
  if(object.subId==='sprinkler'){object.pulse=0;object.sprinklerDrops=0;}
  object.expireAt = Number.isFinite(spec.lifetime) ? (api.G.time||0) + spec.lifetime : Infinity;
  object.pos.y += object.subId === 'splashWall' ? 0 : 0.02;
  if (object.subId === 'beakon') {
    object.grounded = true; object.alive = true; object.superJumpState = null;
    api.G.s3Beakons ||= [];
    api.G.s3Beakons.push(object);
    api.emit?.('sub:beakon',{ actor:object.owner, beacon:object, team:object.team, pos:object.pos.clone(), seq:object.seq });
  }
  replaceVisual(api,object);
  if (!object.ghost) {
    const extra={yaw:object.yaw,activeIn:Math.max(0,object.activeAt-(api.G.time||0))};
    if(Number.isFinite(spec.lifetime))extra.lifeSeconds=spec.lifetime;
    if(object.subId==='beakon')extra.usesLeft=object.usesLeft;
    emitEvent(api,object,'deploy',extra);
  }
}

function surfacePaint(api, owner, team, point, radius, seed) {
  return surfacePaintWithCredit(api,owner,team,point,radius,seed,true);
}
function surfacePaintWithCredit(api, owner, team, point, radius, seed, credit) {
  if (!api.G.paint?.splat || !point?.isVector3 || !(radius > 0)) return 0;
  const area = api.G.paint.splat(point,radius,team,{seed:((seed>>>0)/0x100000000),claimOwner:owner});
  if (credit && area > 0) owner?.addTurf?.(area);
  return area;
}
function damageAt(distance, spec) {
  if (Number.isFinite(spec.directDamage)) return spec.directDamage;
  if (!Number.isFinite(spec.damageOuter) || distance > spec.damageOuter) return 0;
  const t = clamp((distance - (spec.damageInner || 0)) / Math.max(1e-6,spec.damageOuter - (spec.damageInner || 0)),0,1);
  const falloff = spec.damageFalloff === 'calibrated-quadratic' ? (1 - t) ** 2 : 1 - t;
  return lerp(spec.damageMin,spec.damageMax,falloff);
}
function hostileActors(api, owner) {
  return (api.G.actors || []).filter(a => a && a.alive && a.team !== owner.team && a.pos && a !== owner);
}
function applyMark(api, target, team, seconds) {
  if (!target?.alive || target.remote || target.team === team || !(seconds > 0)) return false;
  target.s3 ||= {};
  target.s3.revealedUntil ||= {};
  const until = (api.G.time || 0) + seconds;
  target.s3.revealedUntil[team] = Math.max(target.s3.revealedUntil[team] || 0,until);
  return true;
}
function markSeconds(spec, owner, apOverride = null) {
  const raw = spec.markFrames || [300,450,600];
  const ap = Number.isFinite(apOverride)?apOverride:(owner.s3?.abilityPoints?.subPower||0);
  return gearCurve(ap,raw[0],raw[1],raw[2]) / 60;
}

function detonateInkMine(api,projectiles,mine){
  if(!mine||mine.dead||mine.subId!=='inkMine'||mine.ghost)return false;
  const duration=markSeconds({markFrames:mine.spec.markFrames},mine.owner,mine.subPowerAP);
  for(const target of hostileActors(api,mine.owner)){
    const dx=target.pos.x-mine.pos.x,dy=target.pos.y+.7-mine.pos.y,dz=target.pos.z-mine.pos.z;
    if(dx*dx+dy*dy+dz*dz>mine.spec.markRadius**2||api.G.physics?.los&&!api.G.physics.los(mine.pos,target.pos))continue;
    applyMark(api,target,mine.team,duration);
    if(Number.isInteger(target.nid))api.emit?.('all:sub',{v:1,phase:'mark',subId:mine.subId,seq:mine.seq,sourceLife:mine.sourceLife,eventSeq:nextSeq(mine.owner),
      targetId:target.nid,targetLife:ownerLife(target),frames:Math.round(duration*60),sourceTeam:mine.team,actor:mine.owner});
  }
  blast(api,mine,mine.pos);
  removeObject(api,projectiles,mine);
  return true;
}

function enemyInkNearMine(api,mine){
  const sample=api.G.paint?.regionStats;
  if(typeof sample!=='function')return false;
  const stats=api._allSubInkMineStats||={own:0,enemy:0,empty:0,n:0};
  const found=sample.call(api.G.paint,mine.pos.x,mine.pos.y-.1,mine.pos.z,mine.spec.inkTriggerRadius,mine.team,stats)||stats;
  return Number.isFinite(found.enemy)&&found.enemy>0;
}

function blast(api, object, pos, burstIndex = 0) {
  const sourceSpec = object.subId === 'fizzy' ? object.spec.bursts[Math.min(2,burstIndex)] : object.spec;
  // Burst Bomb's 60-HP direct collision replaces the 35-HP splash on that
  // target; using one `damageAt` call for each path would incorrectly stack.
  const spec = object.subId === 'burst' ? { ...sourceSpec, directDamage: undefined } : sourceSpec;
  const skippedTarget = object.subId === 'burst' ? object.directTarget : null;
  if (!object.ghost) {
    if (Number.isFinite(spec.paintRadius)) {
      const center = pos.clone();
      if (object.subId === 'splashWall') center.y += .3;
      const area = surfacePaint(api,object.owner,object.team,center,spec.paintRadius,object.seed ^ ((burstIndex+1)*0x9e3779b9));
      if (spec.splashPaintRadius > 0) surfacePaint(api,object.owner,object.team,center,spec.splashPaintRadius,object.seed ^ 0x27d4eb2d);
      if (spec.crossPaintRadius > 0) {
        for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const p=center.clone();p.x+=dx*spec.crossPaintRadius;p.z+=dz*spec.crossPaintRadius;
          surfacePaint(api,object.owner,object.team,p,.55,object.seed ^ Math.floor((dx+2)*1000+(dz+2)*10));
        }
      }
      void area;
    }
    const outer = spec.radius || spec.damageOuter || 0;
    if (outer > 0) {
      const targetPoint = api._allSubTargetPoint ||= new api.THREE.Vector3();
      for (const target of hostileActors(api,object.owner)) {
        if (target === skippedTarget) continue;
        targetPoint.copy(target.pos); targetPoint.y += target.form === 'squid' ? .45 : .7;
        const d = targetPoint.distanceTo(pos);
        if (d > outer || api.G.physics?.los && !api.G.physics.los(pos,targetPoint)) continue;
        const amount = damageAt(d,spec);
        if (amount > 0) api.G.projectiles?.applyHit?.(object.owner,target,amount,object.subId);
      }
      if (spec.splashRadius > 0 && (object.subId !== 'torpedo' || object.chasedTarget)) {
        for (const target of hostileActors(api,object.owner)) {
          if(target===skippedTarget)continue;
          targetPoint.copy(target.pos); targetPoint.y += .7;
          const d=targetPoint.distanceTo(pos);
          if (d <= spec.splashRadius && api.G.physics?.los?.(pos,targetPoint)) api.G.projectiles?.applyHit?.(object.owner,target,spec.splashDamage,object.subId+'-splash');
        }
      }
    }
  }
  if (!object.ghost) api.G.fx?.explosion?.(pos,api.G.teamColors?.[object.team],spec.radius || spec.damageOuter || 2);
  if (!object.ghost) {
    emitEvent(api,object,'burst',{ burstIndex, x:pos.x,y:pos.y,z:pos.z });
    api.emit?.('weapon:impact',{ pos:pos.clone(),normal:new api.THREE.Vector3(0,1,0),team:object.team,kind:'sub',radius:spec.radius||spec.damageOuter||1,subId:object.subId });
  }
}

function closestActor(api, object, maxDistance, lineOfSight = true) {
  let best = null, bestD = maxDistance;
  for (const target of hostileActors(api,object.owner)) {
    const dx=target.pos.x-object.pos.x,dy=target.pos.y+.7-object.pos.y,dz=target.pos.z-object.pos.z,d=Math.hypot(dx,dy,dz);
    if (d < bestD && (!lineOfSight || !api.G.physics?.los || api.G.physics.los(object.pos,target.pos))) { best=target;bestD=d; }
  }
  return best ? { actor:best, distance:bestD } : null;
}
function contactActor(api, object, start, end, size = .25) {
  const length = start.distanceTo(end);
  if (!(length > 1e-7) || !api.Physics?.segmentCapsuleDist) return null;
  const base = api._allSubBase ||= new api.THREE.Vector3(), res=api._allSubCapsule ||= {t:0,dist:Infinity};
  let best=null;
  for (const target of hostileActors(api,object.owner)) {
    const height=target.form==='squid'?api.PLAYER.squidHeight:api.PLAYER.height;
    base.copy(target.pos);base.y+=target.smoothY||0;
    api.Physics.segmentCapsuleDist(start,end,base,api.PLAYER.radius,height,res);
    if(res.dist <= api.PLAYER.radius+size && (!best||res.t*length<best.distance)) best={actor:target,distance:res.t*length,t:res.t};
  }
  return best;
}
function customObjectCandidate(api, projectiles, p, start, end) {
  const length=start.distanceTo(end);
  if (!(length > 1e-8) || !finite3(start)||!finite3(end)) return null;
  let best=null;
  for (const object of entityList(projectiles)) {
    if (object.dead || object.phase!=='deployed' || object.team===p.team || !['splashWall','sprinkler','beakon','inkMine'].includes(object.subId)) continue;
    let hit=null;
    if (object.subId==='splashWall') {
      const nX=Math.sin(object.yaw||0), nZ=Math.cos(object.yaw||0), den=(end.x-start.x)*nX+(end.z-start.z)*nZ;
      if(Math.abs(den)<1e-9)continue;
      const t=((object.pos.x-start.x)*nX+(object.pos.z-start.z)*nZ)/den;
      if(t<0||t>1)continue;
      const x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t,z=start.z+(end.z-start.z)*t;
      const rX=Math.cos(object.yaw||0),rZ=-Math.sin(object.yaw||0),side=Math.abs((x-object.pos.x)*rX+(z-object.pos.z)*rZ);
      if(side>ALL_SUB_SPECS.splashWall.wallWidth/2+(p.size||0)||y<object.pos.y-(p.size||0)||y>object.pos.y+ALL_SUB_SPECS.splashWall.wallHeight+(p.size||0))continue;
      hit={t,distance:t*length,point:new api.THREE.Vector3(x,y,z),normal:new api.THREE.Vector3(nX,0,nZ)};
    } else {
      const v=end.clone().sub(start), denom=v.lengthSq(), center=object.pos;
      const t=denom>1e-9?clamp(center.clone().sub(start).dot(v)/denom,0,1):0;
      const point=start.clone().addScaledVector(v,t), radius=object.subId==='inkMine'?.38:.42;
      if(point.distanceToSquared(center)>(radius+(p.size||0))**2)continue;
      hit={t,distance:t*length,point,normal:point.clone().sub(center).normalize()};
    }
    if(!hit||best&&hit.distance>=best.distance)continue;
    const candidate={ ...hit, object, visualOnly:!!p.ghost, settled:false };
    candidate.onHit=()=>{
      if(candidate.settled)return 0;candidate.settled=true;
      // The deployed object's owner is the authority for its HP. A ghost round
      // may spend HP on that owner's client; the local shooter's client sends a
      // bounded proposal when it sees a remote-owned deployable.
      const amount=Number.isFinite(p.damage)?clamp(p.damage,0,2200):0;
      if(amount<=0)return 0;
      if(p.ghost)return 0;
      if(object.ghost){if(!p.ghost)emitObjectHit(api,object,p,hit.point,amount);return 0;}
      if(localOwner(object.owner)){
        object.hp-=amount;
        if(object.hp<=0)removeObject(api,projectiles,object);
        return amount;
      }
      emitObjectHit(api,object,p,hit.point,amount);
      return 0;
    };
    best=candidate;
  }
  return best;
}
function emitObjectHit(api, object, projectile, point, damage) {
  const shooter=projectile.owner;
  if(!localOwner(shooter)||!Number.isInteger(object.owner?.nid)||!Number.isInteger(shooter?.nid))return;
  const event={v:1,phase:'objectHit',subId:projectile.wid||projectile.type||'projectile',
    seq:projectile.s3SubSeq||0,eventSeq:nextSeq(shooter),targetOwnerId:object.owner.nid,
    life:ownerLife(shooter),targetLife:object.sourceLife,targetOwnerLife:ownerLife(object.owner),targetSeq:object.seq,targetSubId:object.subId,
    damage:clamp(damage,0,2200),x:point.x,y:point.y,z:point.z,actor:shooter};
  api.emit?.('all:sub',event);
}
function objectHitKey(event) { return `${event.actor?.nid??event.actorId}:${event.life??ownerLife(event.actor)}:${event.eventSeq}`; }
const objectHitSeen = new Set();
const beaconResultSeen = new Set();
function beaconReservationKey(actor, life, reservationId) { return `${actor?.nid}:${life}:${reservationId}`; }
function emitActorEvent(api, actor, phase, beacon, extra = {}) {
  if(!localOwner(actor)||!Number.isInteger(actor?.nid)||!beacon)return null;
  const event={v:1,phase,subId:'beakon',seq:beacon.seq,eventSeq:nextSeq(actor),life:ownerLife(actor),sourceLife:beacon.sourceLife,
    targetOwnerId:beacon.owner?.nid,targetLife:beacon.sourceLife,targetOwnerLife:ownerLife(beacon.owner),targetSeq:beacon.seq,actor,...extra};
  api.emit?.('all:sub',event);return event;
}
function syncBeaconUses(api, object) {
  emitEvent(api,object,'beakonUses',{usesLeft:object.usesLeft,removed:object.usesLeft<=0});
  if(object.usesLeft<=0)removeObject(api,api.G.projectiles,object,true);
}
function reserveBeacon(object, actor, reservationId) {
  if(!object||object.dead||object.subId!=='beakon'||object.phase!=='deployed'||object.usesLeft<=0)return false;
  object.reservations ||= new Map();
  const key=beaconReservationKey(actor,ownerLife(actor),reservationId);
  if(object.reservations.has(key))return true;
  const reserved=[...object.reservations.values()].reduce((n,r)=>n+(r.cost||1),0);
  const cost=actor.weapon?.sub==='beakon'?object.usesLeft:1;
  if(reserved+cost>object.usesLeft)return false;
  object.reservations.set(key,{actorId:actor.nid,actorLife:ownerLife(actor),cost});
  return true;
}
function releaseBeaconReservation(object, actor, reservationId) {
  if(!object?.reservations)return false;
  return object.reservations.delete(beaconReservationKey(actor,ownerLife(actor),reservationId));
}
function applyBeaconProposal(api,event) {
  const actor=event.actor||api.G.netm?.byNid?.get(event.actorId);
  const owner=api.G.netm?.byNid?.get(event.targetOwnerId);
  if(!actor?.remote||!owner||owner.remote||owner.nid!==event.targetOwnerId||ownerLife(actor)!==event.life||
     actor.team!==owner.team||!Number.isSafeInteger(event.targetSeq)||
     !Number.isSafeInteger(event.reservationId)||event.reservationId<1||!['reserve','land','cancel'].includes(event.stage))return false;
  const object=entityList(api.G.projectiles).find(o=>!o.dead&&o.owner===owner&&o.seq===event.targetSeq&&o.sourceLife===event.targetLife&&o.subId==='beakon');
  if(!object||object.ghost||object.phase!=='deployed')return false;
  const seenKey=`${owner.nid}:${event.targetLife}:${event.targetSeq}:${actor.nid}:${event.life}:${event.reservationId}:${event.stage}`;
  if(beaconResultSeen.has(seenKey))return true;
  if(event.stage==='reserve'){
    if(!reserveBeacon(object,actor,event.reservationId))return false;
  }else if(event.stage==='cancel')releaseBeaconReservation(object,actor,event.reservationId);
  else {
    if(!releaseBeaconReservation(object,actor,event.reservationId))return false;
    object.usesLeft=actor.weapon?.sub==='beakon'?0:Math.max(0,object.usesLeft-1);
    syncBeaconUses(api,object);
  }
  beaconResultSeen.add(seenKey);while(beaconResultSeen.size>MAX_REPLAY_EVENTS)beaconResultSeen.delete(beaconResultSeen.values().next().value);
  return true;
}
function replayBeaconUses(api,event,owner) {
  if(!owner?.remote||ownerLife(owner)!==event.life||!Number.isInteger(event.usesLeft)||event.usesLeft<0||event.usesLeft>2)return false;
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life)&&o.subId==='beakon');
  if(!object||!object.ghost)return false;
  object.usesLeft=event.usesLeft;
  if(event.removed===true||object.usesLeft===0)removeObject(api,api.G.projectiles,object,true);
  return true;
}
function useSubBeakon(api,actor,beacon,stage='land') {
  if(!actor||actor.remote||!localOwner(actor)||!['reserve','land','cancel'].includes(stage))return false;
  const pending=actor.s3SubBeaconUse;
  // A deployed Beakon can be destroyed while a super jump is in flight. Keep
  // enough identity in the reservation to release the remote owner's slot
  // even when the catalogue can no longer resolve the ghost object.
  if(!beacon&&stage==='cancel'&&pending){
    if(pending.reserved){
      const owner=api.G.netm?.byNid?.get(pending.beaconOwnerId);
      const descriptor={owner,seq:pending.beaconSeq,sourceLife:pending.beaconLife,subId:'beakon'};
      if(owner?.remote)emitActorEvent(api,actor,'beakonUseProposal',descriptor,{reservationId:pending.reservationId,stage});
      else {
        const object=entityList(api.G.projectiles).find(o=>!o.dead&&o.owner===owner&&o.seq===pending.beaconSeq&&o.sourceLife===pending.beaconLife&&o.subId==='beakon');
        if(object)releaseBeaconReservation(object,actor,pending.reservationId);
      }
    }
    delete actor.s3SubBeaconUse;return true;
  }
  if(!beacon||beacon.dead||beacon.subId!=='beakon'||beacon.phase!=='deployed'||beacon.team!==actor.team)return false;
  let use=pending;
  if(!use||use.beaconSeq!==beacon.seq||use.beaconLife!==beacon.sourceLife||use.beaconOwnerId!==beacon.owner?.nid){
    actor.s3BeakonUseSeq=((actor.s3BeakonUseSeq||0)+1)%1_000_000_000;if(!actor.s3BeakonUseSeq)actor.s3BeakonUseSeq=1;
    use={beaconOwnerId:beacon.owner?.nid,beaconLife:beacon.sourceLife,beaconSeq:beacon.seq,reservationId:actor.s3BeakonUseSeq};
    actor.s3SubBeaconUse=use;
  }
  const remoteOwner=beacon.owner?.remote===true;
  if(stage==='reserve'){
    if(use.reserved)return true;
    const ok=remoteOwner?true:reserveBeacon(beacon,actor,use.reservationId);
    if(!ok)return false;
    use.reserved=true;
    if(remoteOwner)emitActorEvent(api,actor,'beakonUseProposal',beacon,{reservationId:use.reservationId,stage});
    return true;
  }
  if(stage==='cancel'){
    if(use.reserved){
      if(remoteOwner)emitActorEvent(api,actor,'beakonUseProposal',beacon,{reservationId:use.reservationId,stage});
      else releaseBeaconReservation(beacon,actor,use.reservationId);
    }
    delete actor.s3SubBeaconUse;return true;
  }
  if(!use.reserved){const ok=useSubBeakon(api,actor,beacon,'reserve');if(!ok)return false;}
  if(remoteOwner){emitActorEvent(api,actor,'beakonUseProposal',beacon,{reservationId:use.reservationId,stage});delete actor.s3SubBeaconUse;return true;}
  if(!releaseBeaconReservation(beacon,actor,use.reservationId))return false;
  beacon.usesLeft=actor.weapon?.sub==='beakon'?0:Math.max(0,beacon.usesLeft-1);
  delete actor.s3SubBeaconUse;syncBeaconUses(api,beacon);return true;
}
function applyRemoteObjectHit(api,event) {
  const shooter=event.actor||api.G.netm?.byNid?.get(event.actorId);
  const owner=api.G.netm?.byNid?.get(event.targetOwnerId);
  if(!shooter?.remote||!owner||owner.remote||owner.nid!==event.targetOwnerId||
     ownerLife(shooter)!==event.life||shooter.team===owner.team||!finite3({x:event.x,y:event.y,z:event.z})||
     !Number.isFinite(event.damage)||event.damage<=0||event.damage>2200||!Number.isSafeInteger(event.targetSeq)||!Number.isSafeInteger(event.targetLife))return false;
  const key=objectHitKey(event);if(objectHitSeen.has(key))return false;objectHitSeen.add(key);
  while(objectHitSeen.size>MAX_REPLAY_EVENTS)objectHitSeen.delete(objectHitSeen.values().next().value);
  const object=entityList(api.G.projectiles).find(o=>!o.dead&&o.owner===owner&&o.seq===event.targetSeq&&o.sourceLife===event.targetLife&&o.subId===event.targetSubId&&o.phase==='deployed');
  if(!object||object.ghost)return false;
  const reach=object.subId==='splashWall'?ALL_SUB_SPECS.splashWall.wallWidth/2+1:1.5;
  if(object.pos.distanceTo(new api.THREE.Vector3(event.x,event.y,event.z))>reach)return false;
  object.hp-=clamp(event.damage,0,2200);
  if(object.hp<=0)removeObject(api,api.G.projectiles,object);
  return true;
}

function armToxicStatus(api, cloud, target, emit = true) {
  if(!target?.alive||target.team===cloud.team)return;
  const until=(api.G.time||0)+.35;
  // Only the target's owning client mutates movement/ink. A local source emits
  // a short lease for remote enemies; a replayed cloud directly affects local
  // enemies so its area status remains active on the authority.
  if(!target.remote){
    target.s3 ||= {};
    target.s3.toxicMistSlowUntil=Math.max(target.s3.toxicMistSlowUntil||0,until);
    target.s3.toxicMistScale=Math.min(target.s3.toxicMistScale||1,cloud.spec.slowScale);
  }
  const prev=cloud.seenToxic.get(target)||-Infinity;
  if(emit&&!cloud.ghost&&(api.G.time||0)-prev>=.25){
    cloud.seenToxic.set(target,api.G.time||0);
    if(Number.isInteger(target.nid))api.emit?.('all:sub',{v:1,phase:'status',subId:cloud.subId,seq:cloud.seq,sourceLife:cloud.sourceLife,
      eventSeq:nextSeq(cloud.owner),life:ownerLife(cloud.owner),targetId:target.nid,targetLife:ownerLife(target),status:'toxicMist',until,
      sourceTeam:cloud.team,actor:cloud.owner});
  }
}
function replayStatus(api,event) {
  const owner=event.actor||api.G.netm?.byNid?.get(event.actorId);
  const target=api.G.netm?.byNid?.get(event.targetId);
  if(!owner?.remote||ownerLife(owner)!==event.life||owner.team!==event.sourceTeam||!target||target.remote||target.team===event.sourceTeam||ownerLife(target)!==event.targetLife||
     event.status!=='toxicMist'||!Number.isFinite(event.until)||event.until<(api.G.time||0)||event.until>(api.G.time||0)+1)return false;
  target.s3 ||= {};target.s3.toxicMistSlowUntil=Math.max(target.s3.toxicMistSlowUntil||0,event.until);
  target.s3.toxicMistScale=Math.min(target.s3.toxicMistScale||1,ALL_SUB_SPECS.toxicMist.slowScale);
  return true;
}
function updateStatuses(api, dt) {
  for(const actor of api.G.actors||[]){
    const s=actor?.s3;if(!s)continue;
    if(s.toxicMistSlowUntil>(api.G.time||0)&&!actor.remote) actor.ink=Math.max(0,(actor.ink??100)-ALL_SUB_SPECS.toxicMist.inkDrainPerSecond*dt);
    if((s.toxicMistSlowUntil||0)<=(api.G.time||0)){delete s.toxicMistSlowUntil;delete s.toxicMistScale;}
  }
}

function updateFlight(api, projectiles, object, dt) {
  const spec=object.spec;
  if(object.ghost&&object.phase==='ghostWait')return;
  if(object.grounded&&(object.subId==='autobomb'||object.subId==='torpedo')){
    object.age+=dt;object.prev.copy(object.pos);
    if(object.subId==='torpedo'){
      object.fuse-=dt;
      if(object.fuse<=0){if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
    }else{
      const target=closestActor(api,object,spec.chaseRadius,true)?.actor;
      if(target){
        object.chasedTarget=true;
        const dx=target.pos.x-object.pos.x,dz=target.pos.z-object.pos.z,desired=Math.atan2(dx,dz),current=Math.atan2(object.vel.x,object.vel.z);
        let d=desired-current;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;
        const angle=current+clamp(d,-2.2*dt,2.2*dt),speed=spec.chaseSpeed||6.2;
        object.vel.x=Math.sin(angle)*speed;object.vel.z=Math.cos(angle)*speed;
        object.pos.x+=object.vel.x*dt;object.pos.z+=object.vel.z*dt;object.yaw=angle;
        if(target.pos.distanceTo(object.pos)<.75){object.pos.copy(target.pos);object.pos.y+=.35;if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
      }else if(object.age>=spec.noTargetSeconds){if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
    }
    if(object.mesh){object.mesh.position.copy(object.pos);object.mesh.rotation.y=object.yaw||0;}
    return;
  }
  object.age+=dt;object.prev.copy(object.pos);
  if(object.subId==='autobomb'||object.subId==='torpedo'){
    const target=closestActor(api,object,object.subId==='autobomb'?spec.chaseRadius:spec.chaseRadius,true)?.actor;
    if(target&&object.age>.3){
      object.phase='chase'; object.chasedTarget=true;
      const dx=target.pos.x-object.pos.x,dz=target.pos.z-object.pos.z,desired=Math.atan2(dx,dz),current=Math.atan2(object.vel.x,object.vel.z);
      let d=desired-current;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;
      const turn=clamp(d,-2.2*dt,2.2*dt),angle=current+turn;
      const speed=Math.max(spec.chaseSpeed||6.2,Math.hypot(object.vel.x,object.vel.z));
      object.vel.x=Math.sin(angle)*speed;object.vel.z=Math.cos(angle)*speed;object.vel.y=Math.max(-3,Math.min(2,object.vel.y));
      if(target.pos.distanceTo(object.pos)<.75||object.age>=(spec.chaseSeconds||2.5)){
        object.pos.copy(target.pos);object.pos.y+=.35;
        if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}
        return;
      }
    } else if(object.subId==='autobomb'&&object.age>spec.noTargetSeconds){if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
  }
  if(object.subId==='angleShooter') object.vel.y=0;
  else object.vel.y-=spec.gravity*dt;
  object.pos.addScaledVector(object.vel,dt);
  const world=api.G.physics?.segment?.(object.prev,object.pos,projectiles._s3SubHit ||= new api.Hit());
  const actor=contactActor(api,object,object.prev,object.pos,object.subId==='angleShooter'?spec.collisionRadius:.22);
  const defense=projectiles.kitDefenseCandidate?.({owner:object.owner,team:object.team,prev:object.prev,pos:object.pos,
    vel:object.vel,damage:object.subId==='angleShooter'?spec.directDamage:object.subId==='fizzy'?spec.objectDamage:spec.damageMax||0,type:'sub',size:.2,ghost:object.ghost});
  const defenseDistance=defense?.distance??Infinity, actorDistance=actor?.distance??Infinity;
  const worldDistance=world?.hit?world.dist:Infinity;
  if(defense&&defenseDistance<=Math.min(worldDistance,actorDistance)){
    object.pos.copy(defense.point||object.pos);defense.onHit?.();
    if(object.subId==='angleShooter'){object.bounceCount++;object.vel.reflect(defense.normal||new api.THREE.Vector3(0,1,0)).multiplyScalar(.8);object.pos.addScaledVector(defense.normal||new api.THREE.Vector3(0,1,0),.04);if(object.bounceCount>spec.maxBounces)removeObject(api,projectiles,object);}
    else if(['splashWall','sprinkler','beakon','inkMine'].includes(defense.object?.subId)) removeObject(api,projectiles,object);
    return;
  }
  if(actor&&actorDistance<worldDistance){
    object.pos.lerpVectors(object.prev,object.pos,actor.t);
    if(object.ghost){object.phase='ghostWait';return;}
    if(!object.ghost){
      const amount=object.subId==='angleShooter'||object.subId==='burst'?spec.directDamage:0;
      if(amount>0)api.G.projectiles?.applyHit?.(object.owner,actor.actor,amount,object.subId);
      if(object.subId==='angleShooter'){
        const duration=markSeconds(spec,object.owner,object.subPowerAP);
        applyMark(api,actor.actor,object.team,duration);
        if(Number.isInteger(actor.actor.nid))api.emit?.('all:sub',{v:1,phase:'mark',subId:object.subId,seq:object.seq,sourceLife:object.sourceLife,eventSeq:nextSeq(object.owner),
          targetId:actor.actor.nid,targetLife:ownerLife(actor.actor),frames:Math.round(duration*60),sourceTeam:object.team,actor:object.owner});
      }
    }
    if(['inkMine','toxicMist','splashWall','sprinkler','beakon'].includes(object.subId)){
      object.pos.y=actor.actor.pos.y;
      deploy(api,projectiles,object,object.pos);
      return;
    }
    if(object.subId==='fizzy'){burstFizzy(api,projectiles,object);return;}
    if(object.subId==='angleShooter'){
      object.bounceCount++;object.vel.multiplyScalar(-.72);object.pos.addScaledVector(object.vel,dt);
      if(object.bounceCount<=spec.maxBounces){emitEvent(api,object,'bounce',{bounceCount:object.bounceCount});return;}
    } else { blast(api,object,object.pos); }
    removeObject(api,projectiles,object);return;
  }
  if(world?.hit){
    object.pos.copy(world.point).addScaledVector(world.normal,.03);
    if(object.ghost){object.phase='ghostWait';return;}
    if(object.subId==='angleShooter'){
      const vn=object.vel.dot(world.normal);object.vel.addScaledVector(world.normal,-2*vn).multiplyScalar(.82);object.bounceCount++;
      surfacePaint(api,object.owner,object.team,object.pos,spec.paintRadius,object.seed^object.bounceCount);
      if(object.bounceCount<=spec.maxBounces){object.pos.addScaledVector(object.vel,dt);emitEvent(api,object,'bounce',{bounceCount:object.bounceCount});return;}
      removeObject(api,projectiles,object);return;
    }
    if(object.subId==='fizzy'){burstFizzy(api,projectiles,object);return;}
    if(object.subId==='inkMine'||object.subId==='toxicMist'||object.subId==='splashWall'||object.subId==='sprinkler'||object.subId==='beakon'){
      deploy(api,projectiles,object,object.pos,world.normal);
      if(object.subId==='inkMine')object.activeAt=api.G.time+spec.armSeconds;
      return;
    }
    if(object.subId==='autobomb'||object.subId==='torpedo'){
      object.vel.y=0;object.phase='flight';object.grounded=true;object.pos.y=world.point.y+.08;
      if(object.subId==='torpedo')object.fuse=spec.burstSeconds;
      return;
    }
    blast(api,object,object.pos);removeObject(api,projectiles,object);return;
  }
  if(object.subId==='fizzy'&&object.age+1e-10>=object.fuse){if(object.ghost)object.phase='ghostWait';else burstFizzy(api,projectiles,object);return;}
  if(object.subId==='toxicMist'&&object.age>=1.2){if(object.ghost)object.phase='ghostWait';else deploy(api,projectiles,object,object.pos);return;}
  const flightLimit=object.subId==='angleShooter'?spec.tailFrames/60:
    object.subId==='autobomb'?spec.noTargetSeconds:object.subId==='torpedo'?Math.max(2.2,spec.chaseSeconds||0):2.2;
  if(object.age>flightLimit){
    if(object.ghost){object.phase='ghostWait';return;}
    if(object.subId==='autobomb'||object.subId==='torpedo'||object.subId==='burst'){blast(api,object,object.pos);}
    removeObject(api,projectiles,object);return;
  }
  if(object.mesh)object.mesh.position.copy(object.pos);
}

function burstFizzy(api,projectiles,object){
  if(object.pops<=0){removeObject(api,projectiles,object);return;}
  const index=object.popLimit-object.pops;object.pops--;
  blast(api,object,object.pos,index);
  if(object.pops<=0){removeObject(api,projectiles,object);return;}
  object.phase='flight';object.age=0;
  object.fuse=frameSeconds(object.spec.burstWaitFrames[Math.min(2,index+1)]||1);
  const direction=new api.THREE.Vector3(object.vel.x,0,object.vel.z);
  if(direction.lengthSq()<1e-6)direction.set(Math.sin(object.yaw),0,Math.cos(object.yaw));
  direction.normalize();object.pos.addScaledVector(direction,.62);object.vel.x=direction.x*5.5;object.vel.z=direction.z*5.5;object.vel.y=3.4;
  emitEvent(api,object,'fizzyHop',{pops:object.pops,fuse:object.fuse});
}
function updateDeployed(api,projectiles,object,dt){
  const {G}=api,spec=object.spec;
  object.age+=dt;
  if(object.subId==='sprinkler'&&!object.owner?.alive){removeObject(api,projectiles,object);return;}
  if((G.time||0)>=object.expireAt){removeObject(api,projectiles,object);return;}
  if(object.subId==='inkMine'){
    if((G.time||0)<object.activeAt)return;
    if(object.ghost)return;
    const found=hostileActors(api,object.owner).find(a=>{
      const dx=a.pos.x-object.pos.x,dy=a.pos.y+.7-object.pos.y,dz=a.pos.z-object.pos.z;
      return dx*dx+dy*dy+dz*dz<=spec.sensorRadius**2 && (!G.physics?.los||G.physics.los(object.pos,a.pos));
    });
    if(found||enemyInkNearMine(api,object))detonateInkMine(api,projectiles,object);
  } else if(object.subId==='toxicMist'){
    for(const target of hostileActors(api,object.owner)){
      const dx=target.pos.x-object.pos.x,dy=target.pos.y+.7-object.pos.y,dz=target.pos.z-object.pos.z;
      if(dx*dx+dy*dy+dz*dz<=spec.radius**2&&(!G.physics?.los||G.physics.los(object.pos,target.pos)))armToxicStatus(api,object,target,true);
    }
  } else if(object.subId==='sprinkler'){
    const ap=object.subPowerAP||0;
    const first=gearCurve(ap,...spec.firstPeriodFrames)/60,second=gearCurve(ap,...spec.laterPeriodFrames)/60;
    const elapsed=Math.max(0,(G.time||0)-object.deployedAt),stage=elapsed<first?0:elapsed<first+second?1:2;
    const cadence=[4,6,9][stage]/60;
    object.pulse-=dt;
    if(!object.ghost){
      let catchup=0;
      while(object.pulse<=0&&catchup++<2){
        object.pulse+=cadence;
        const drop=object.sprinklerDrops++,random=rng(object.seed^Math.imul(drop+1,0x9e3779b1));
        const angle=drop*2.399963229728653+random()*.18,spread=[1,.72,.45][stage];
        const radius=(.35+Math.sqrt(random())*.65)*spec.hitPaintRadius*spread;
        const point=new api.THREE.Vector3(object.pos.x+Math.cos(angle)*radius,object.pos.y+.04,object.pos.z+Math.sin(angle)*radius);
        const seed=(object.seed^Math.imul(drop+1,0x85ebca6b))>>>0;
        surfacePaint(api,object.owner,object.team,point,spec.paintRadius,seed);
        emitEvent(api,object,'sprinklerDrop',{x:point.x,y:point.y,z:point.z,radius:spec.paintRadius,seed,drop});
      }
    }
  }
  if(object.mesh){object.mesh.position.copy(object.pos);object.mesh.rotation.y=object.yaw+object.age*2;}
}

function tickObjects(api,projectiles,dt){
  const list=entityList(projectiles);
  for(let i=list.length-1;i>=0;i--){
    const o=list[i];if(o.dead||o.phase==='ghostWait')continue;
    if(o.subId==='sprinkler'&&!o.owner?.alive){removeObject(api,projectiles,o);continue;}
    if(o.phase==='deployed')updateDeployed(api,projectiles,o,dt);else updateFlight(api,projectiles,o,dt);
  }
  updateStatuses(api,dt);
}

function replaySpawn(api,event,owner){
  if(!owner?.remote||!api.G.projectiles||event.life!==ownerLife(owner)||event.sourceLife!==event.life||!ALL_SUB_SPECS[event.subId])return false;
  const list=entityList(api.G.projectiles);
  const old=list.find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===event.sourceLife);
  if(old)return true;
  if(![event.x,event.y,event.z,event.vx,event.vy,event.vz,event.charge].every(Number.isFinite)||
     !Number.isSafeInteger(event.seed)||!Number.isSafeInteger(event.seq)||event.seq<=0)return false;
  return !!createObject(api,api.G.projectiles,owner,event.subId,{...event,ghost:true});
}
function replayDeploy(api,event,owner){
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
  if(!object||!finite3({x:event.x,y:event.y,z:event.z}))return false;
  deploy(api,api.G.projectiles,object,new api.THREE.Vector3(event.x,event.y,event.z));
  if(Number.isFinite(event.yaw))object.yaw=event.yaw;
  if(Number.isFinite(event.activeIn))object.activeAt=(api.G.time||0)+clamp(event.activeIn,0,5);
  if(Number.isFinite(event.lifeSeconds))object.expireAt=(api.G.time||0)+clamp(event.lifeSeconds,0,60);
  if(object.subId==='beakon'&&Number.isInteger(event.usesLeft))object.usesLeft=clamp(event.usesLeft,0,2);
  replaceVisual(api,object);return true;
}
function replayMark(api,event,owner){
  const target=api.G.netm?.byNid?.get(event.targetId);
  if(!owner?.remote||!target||target.team===owner.team||ownerLife(target)!==event.targetLife||
    !Number.isSafeInteger(event.frames)||event.frames<1||event.frames>1200)return false;
  return applyMark(api,target,owner.team,event.frames/60);
}
function replayExpire(api,event,owner){
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
  if(!object)return false;removeObject(api,api.G.projectiles,object,true);return true;
}
function replaySprinklerDrop(api,event,owner){
  if(!owner?.remote||ownerLife(owner)!==event.life||!Number.isInteger(event.seed)||event.seed<0||event.seed>0xffffffff||
     !finite3({x:event.x,y:event.y,z:event.z})||!Number.isFinite(event.radius)||event.radius<=0||event.radius>.6)return false;
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life)&&o.subId==='sprinkler'&&o.phase==='deployed');
  if(!object||object.pos.distanceTo(new api.THREE.Vector3(event.x,event.y,event.z))>object.spec.hitPaintRadius+1)return false;
  surfacePaintWithCredit(api,owner,object.team,new api.THREE.Vector3(event.x,event.y,event.z),event.radius,event.seed,false);
  return true;
}

/**
 * Replays one parent-validated `all:sub` event. Ghost sub objects are
 * presentation-only: they move and render, but never paint, damage, mark, drain
 * ink, spend object HP or emit another packet.
 */
export function replaySub(api,event){
  if(!api?.G||!event||event.v!==1||typeof event.phase!=='string')return false;
  if(event.phase==='objectHit')return applyRemoteObjectHit(api,event);
  if(event.phase==='status')return replayStatus(api,event);
  if(event.phase==='beakonUseProposal')return applyBeaconProposal(api,event);
  const owner=event.actor||api.G.netm?.byNid?.get(event.actorId);
  if(!owner?.remote||!Number.isSafeInteger(event.seq)||event.seq<=0||!Number.isSafeInteger(event.life)||ownerLife(owner)!==event.life)return false;
  if(event.phase==='spawn')return replaySpawn(api,event,owner);
  if(event.phase==='deploy')return replayDeploy(api,event,owner);
  if(event.phase==='mark')return replayMark(api,event,owner);
  if(event.phase==='sprinklerDrop')return replaySprinklerDrop(api,event,owner);
  if(event.phase==='beakonUses')return replayBeaconUses(api,event,owner);
  if(event.phase==='expire'||event.phase==='destroy')return replayExpire(api,event,owner);
  if(event.phase==='burst'){
    const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object)return false;
    if([event.x,event.y,event.z].every(Number.isFinite))object.pos.set(event.x,event.y,event.z);
    const spec=object.subId==='fizzy'?object.spec.bursts[Math.min(2,event.burstIndex||0)]:object.spec;
    api.G.fx?.explosion?.(object.pos,api.G.teamColors?.[object.team],spec.radius||spec.damageOuter||2);
    object.phase='ghostWait';
    return true;
  }
  if(event.phase==='fizzyHop'||event.phase==='bounce'){
    const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object||![event.x,event.y,event.z,event.vx,event.vy,event.vz].every(Number.isFinite))return false;
    object.pos.set(event.x,event.y,event.z);object.vel.set(event.vx,event.vy,event.vz);object.age=0;object.phase='flight';
    if(event.phase==='fizzyHop'){
      if(!Number.isSafeInteger(event.pops)||event.pops<0||event.pops>3||!Number.isFinite(event.fuse)||event.fuse<0||event.fuse>1)return false;
      object.pops=event.pops;object.fuse=event.fuse;
    }else object.bounceCount=Number.isSafeInteger(event.bounceCount)?clamp(event.bounceCount,0,3):object.bounceCount+1;
    if(object.mesh)object.mesh.position.copy(object.pos);
    return true;
  }
  return false;
}

function registerSpecs(api,profile){
  const {SUB}=api;
  for(const [id,base] of Object.entries(ALL_SUB_SPECS)){
    const costCurve=profile?.bomb?.inkSaverCurve||profile?.gear?.inkSaverSub||[1,.825,.65];
    const previous=SUB[id]||{};
    SUB[id]={...base,...previous,id,inkCostFallback:base.inkCost,
      inkSaverCurve:Array.isArray(previous.inkSaverCurve)?previous.inkSaverCurve:costCurve};
  }
  return SUB;
}

export function installAllSubs(api,profile={}){
  const {SUB,Projectiles,WeaponRunner,G}=api;
  if(!SUB||!Projectiles||!WeaponRunner||!G||!api.THREE)throw new Error('all subs require the composed Projectiles, WeaponRunner and game context');
  if(Projectiles.prototype[INSTALL])return api;
  registerSpecs(api,profile);
  const nativeThrow=Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb=function(actor,...args){
    const id=actor?.weapon?.sub;
    if(!ALL_SUB_SPECS[id])return nativeThrow.call(this,actor,...args);
    if(actor?.remote||!actor?.alive)return undefined;
    const runner=actor.weaponRunner;
    const hold=runner?.s3SubHold||0;
    const release=runner?.s3Release;
    const object=createObject(api,this,actor,id,{hold,charge:Math.min(1,hold/(ALL_SUB_SPECS[id].maxChargeTime||1))});
    if(runner)runner.s3SubHold=0;
    return object;
  };

  const nativeUpdate=Projectiles.prototype.update;
  Projectiles.prototype.update=function(dt,...args){
    const result=nativeUpdate.call(this,dt,...args);
    if(!(dt>0)||!Number.isFinite(dt))return result;
    this._s3SubAccumulator=Math.min(.25,(this._s3SubAccumulator||0)+dt);
    let steps=0;
    while(this._s3SubAccumulator+1e-10>=STEP&&steps<8){
      tickObjects(api,this,STEP);this._s3SubAccumulator-=STEP;steps++;
    }
    return result;
  };

  const nativeClear=Projectiles.prototype.clear;
  Projectiles.prototype.clear=function(...args){
    for(const object of [...this._s3SubObjects||[]])removeObject(api,this,object,true);
    this._s3SubObjects=[];this._s3SubAccumulator=0;
    api.G.s3Beakons=[];
    for(const actor of api.G.actors||[])if(actor?.s3){delete actor.s3.toxicMistSlowUntil;delete actor.s3.toxicMistScale;}
    objectHitSeen.clear();beaconResultSeen.clear();
    return nativeClear.apply(this,args);
  };

  // Reuse the existing Bubbler/Ink Vac first-contact lane. Splash Wall blocks
  // hostile sweeps, while Sprinkler, Beakon and Ink Mine can be shot as objects.
  const barrier=Projectiles.prototype.kitBarrierCandidate;
  Projectiles.prototype.kitBarrierCandidate=function(p,start,end){
    const original=barrier?.call(this,p,start||p?.prev,end||p?.pos);
    const custom=customObjectCandidate(api,this,p,start||p?.prev,end||p?.pos);
    if(!custom)return original;
    if(!original||custom.distance<original.distance)return custom;
    return original;
  };

  const nativeMove=WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed=function(...args){
    const speed=nativeMove.apply(this,args),s=this.a?.s3;
    return s?.toxicMistSlowUntil>(G.time||0)?speed*(s.toxicMistScale||ALL_SUB_SPECS.toxicMist.slowScale):speed;
  };

  api.replaySub=event=>replaySub(api,event);
  api.getSubBeakons=(team=null)=>entityList(G.projectiles).filter(o=>!o.dead&&o.subId==='beakon'&&o.phase==='deployed'&&o.usesLeft>0&&(team===null||o.team===team));
  api.useSubBeakon=(actor,beacon,stage='land')=>useSubBeakon(api,actor,beacon,stage);
  Object.defineProperty(Projectiles.prototype,INSTALL,{value:true,configurable:false});
  return api;
}

export default installAllSubs;
