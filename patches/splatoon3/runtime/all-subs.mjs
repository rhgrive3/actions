import { configureToxicMist, toxicMistContains, toxicMistScale } from './toxic-mist.mjs';
import { replayNativeSprinklerDamage } from './native-sprinkler-damage.mjs';
import { objectShredderEquipped, withObjectHitGear } from './object-gear.mjs';
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
import { objectDamageScale, objectDamageRow, subEffectScale } from './sub-resistance.mjs';
import { subMarkSeconds } from './sub-mark-resistance.mjs';
import { buildSubModel, poseSubModel, isSharedGeometry, SPLASH_WALL_FOLDED_SCALE, SPLASH_WALL_UNFOLD_SECONDS } from './sub-models.mjs';
import { spawnTorpedoSplashes, spawnFizzySplashes, stepTorpedoSplashes, clearTorpedoSplashes } from './torpedo-splashes.mjs';
import { coolerSegmentContact } from './support-cooler-collision.mjs';
import {captureSubAttachment,syncSubAttachment,towerAttachmentFields,replayTowerAttachment} from './sub-surface-attachment.mjs';
import {mineTowerPaintReference} from '../../network-replication/tower-paint-support.mjs';

const INSTALL = Symbol.for('inkwave.s3.all-subs.v1');
const STEP = 1 / 60;
const MAX_OBJECTS = 96;
const MAX_REPLAY_EVENTS = 256;
const localBeakonActorKeys=new WeakMap();
let nextLocalBeakonActorKey=0;
// Network identities stay wire-compatible. Offline Actors have no native nid;
// their object identity must not collapse every owner's first device to local:0.
export function beakonActorKey(actor){
  if(Number.isSafeInteger(actor?.nid)&&actor.nid>=0)return String(actor.nid);
  if(!actor||typeof actor!=='object')return 'missing';
  if(!localBeakonActorKeys.has(actor))localBeakonActorKeys.set(actor,`local${++nextLocalBeakonActorKey}`);
  return localBeakonActorKeys.get(actor);
}
// A rendered ghost may retire before its owner's delayed marking event.
// Retain only bounded, accepted birth facts, independently of visual lifetime.
const markBirths = new WeakMap();
const markBirthKey = o => JSON.stringify([o.sourceLife,o.seq,o.subId]);
function markBirthState(api,projectiles,owner,create=false) {
  let state=markBirths.get(projectiles);
  if(!state||state.match!==api.G.match||state.net!==api.G.netm){
    markBirths.delete(projectiles);
    if(!create)return null;
    state={match:api.G.match,net:api.G.netm,owners:new WeakMap()};markBirths.set(projectiles,state);
  }
  let record=state.owners.get(owner);
  if(!record||record.ownerId!==owner.owner||record.net!==owner.net){
    state.owners.delete(owner);
    if(!create)return null;
    record={ownerId:owner.owner,net:owner.net,life:-1,seq:0,entries:new Map()};state.owners.set(owner,record);
  }
  return record;
}
// S3 community testing describes these as queued bonuses, capped at 2.5 bonus
// frames per 60 Hz frame. The source parameter table gives charge stages, not
// acceleration values, so these are conservative calibration values.
const FIZZY_ACCEL = Object.freeze({ jump: 8, stick: 11, aim: 10, queue: 30, drainPerSecond: 150,
  moveDeadzone: .15, turnDot: -.5, aimRate: 3, aimCooldown: .12 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const finite3 = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const frameSeconds = f => f / 60;
const rawDamage = n => n / 10;
const speedPerSecond = n => n * 60;
const accelPerSecondSquared = n => n * 3600;

// The core values are extracted from the table named in `source`; other fields
// are called out at the point of use and on `calibration`.
export const ALL_SUB_SPECS = Object.freeze({
  burst: Object.freeze({
    id: 'burst', name: 'Burst Bomb', source: 'WeaponBombQuick.game__GameParameterTable.json',
    inkCost: 45, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(60),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 4, damageInner: 2.8, damageOuter: 4, damageMax: rawDamage(350), damageMin: rawDamage(250), damageFalloff: 'discrete',
    paintRadius: 4, crossPaintRadius: 1.4, gravity: 24, fuse: .72,
    directDamage: 25, directDamageStatus: 'wiki-measured-first-hit', contactBurstDelayFrames: 1,
    inkCostFallback: 45, calibration: 'fuse/gravity/world scale calibrated; raw splash damage, paint and throw tuple extracted; Wiki measures a 25 direct hit followed 1F later by 35 near blast (two separate damage events)',
  }),
  autobomb: Object.freeze({
    id: 'autobomb', name: 'Autobomb', source: 'WeaponBombRobot.game__GameParameterTable.json',
    inkCost: 55, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    radius: 6.5, damageInner: 2.85, damageOuter: 6.5, damageMax: rawDamage(1800), damageMin: rawDamage(300), damageFalloff: 'discrete',
    paintRadius: 4, gravity: accelPerSecondSquared(.016), flyPositionAirResist: .05866, flyRotateAirResist: .01985,
    chaseRadius: 2.5 * 5, chaseSpeed: 5.4,
    findRotateFrames: 10, noTargetBurstWaitFrames: 60, unreceivedTargetWaitFrames: 180, chaseBurstWaitFrames: 60,
    approachBurstWaitFrames: 60, unfindBurstWaitFrames: 60,
    chaseMovement: Object.freeze({
      beforeRotateFrames:30, yawDegreesPerFrame:2,
      groundAcceleration:.003*3600, groundMaxSpeed:.09*60,
      airAcceleration:.012*3600, airMaxSpeedXZ:.09*60, airMaxSpeedY:.18*60,
      approachDistance:.65,
    }),
    chaseSeconds: frameSeconds(150), noTargetSeconds: frameSeconds(180),
    inkCostFallback: 55, calibration: 'damage/chase movement and wait fields extracted; Wiki measures search radius 2.5 trial lines and ordinary no-target warning 60F (UnfindBurstWaitFrame); NoReceiveTargetBurstWaitFrame=180 remains distinct; target shape, panel impacts, steering and world mapping calibrated',
  }),
  fizzy: Object.freeze({
    id: 'fizzy', name: 'Fizzy Bomb', source: 'WeaponBombFizzy.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(1.36), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.36), mid: speedPerSecond(1.6), high: speedPerSecond(1.84) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    chargeFrames: Object.freeze([40, 80]), burstWaitFrames: Object.freeze([15, 1, 1]),
    burstWarnFrames: Object.freeze([15, 7, 7]), firstGroundFuseFrames: 30, objectDamage: rawDamage(100),
    hop: Object.freeze({ lowPitchDeg: 48, highPitchDeg: 58, lowVelocity: speedPerSecond(.24), highVelocity: speedPerSecond(.32) }),
    flySplashDistance: Object.freeze([2.2,2.2,2.2]),
    flySplashPaintRadius: Object.freeze([.9,1.0,1.1]),
    flySplashPaintParam: Object.freeze([
      Object.freeze({depthMaxDropHeight:3,depthMinDropHeight:10,depthScaleMax:1.6,depthScaleMin:1.6,widthHalf:1.2,widthHalfNearest:1.2}),
      Object.freeze({depthScaleMax:1.6,depthScaleMin:1.6,widthHalf:1.26,widthHalfNearest:1.26}),
      Object.freeze({depthScaleMax:1.6,depthScaleMin:1.6,widthHalf:1.32,widthHalfNearest:1.32}),
    ]),
    // `chargeable` is reserved by kit-subs for Curling Bomb's path and expects
    // its minCharge/maxCharge blast tuple. Fizzy's hold timing is instead read
    // directly from the real runner by this module at throw time.
    maxChargeTime: frameSeconds(120),
    blurb: 'サブを保持。左右の切り返し・ジャンプ連打・照準を振ると速く充電、離すと投げる。',
    bursts: Object.freeze([
      Object.freeze({ radius: 3.8, damageInner: 1.6, damageOuter: 3.8, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'discrete', paintRadius: 3.0, crossPaintRadius: 2.0,
        splashAround:Object.freeze({count:6,offsetY:.3,paintRadius:.7,pitchMinDegrees:10,pitchMaxDegrees:25,velocityMin:speedPerSecond(.35),velocityMax:speedPerSecond(.4)}) }),
      Object.freeze({ radius: 4.5, damageInner: 1.95, damageOuter: 4.5, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'discrete', paintRadius: 3.4, crossPaintRadius: 2.0,
        splashAround:Object.freeze({count:6,offsetY:.3,paintRadius:.7,pitchMinDegrees:10,pitchMaxDegrees:20,velocityMin:speedPerSecond(.36),velocityMax:speedPerSecond(.42)}) }),
      Object.freeze({ radius: 5.45, damageInner: 2.6, damageOuter: 5.45, damageMax: rawDamage(500), damageMin: rawDamage(350), damageFalloff: 'discrete', paintRadius: 3.8, crossPaintRadius: 2.0,
        splashAround:Object.freeze({count:6,offsetY:.3,paintRadius:.7,pitchMinDegrees:10,pitchMaxDegrees:20,velocityMin:speedPerSecond(.39),velocityMax:speedPerSecond(.43)}) }),
    ]),
    gravity: 24, maxFlightSeconds: 2.2, groundGravity: accelPerSecondSquared(.016), flyRotateAirResist: .018, inkCostFallback: 60,
    calibration: 'per-stage charge/wait/warn frames, blast, hop and flight-splash arrays extracted; Wiki measures initial grounded fuse about 30F and later bursts on re-landing; acceleration mapped from community testing; ground rolling/side-wall rebound, bounce flight, stamp shape and exact warning-state mapping calibrated',
  }),
  torpedo: Object.freeze({
    id: 'torpedo', name: 'Torpedo', source: 'WeaponBombTorpedo.game__GameParameterTable.json',
    inkCost: 65, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(88),
    throwSpeed: speedPerSecond(1.4), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.4), mid: speedPerSecond(1.65), high: speedPerSecond(1.9) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    // The parameter rows omit target HP; public gameplay documents a 20 HP
    // shot-down threshold. This is not extracted from the pinned JSON.
    hp: 20, hpStatus: 'public-gameplay',
    radius: 6, damageInner: 2.6, damageOuter: 6, damageMax: rawDamage(600), damageMin: rawDamage(350), damageFalloff: 'discrete',
    paintRadius: 3.5, burstSeconds: frameSeconds(30), gravity: 24, flyRotateAirResist: .018,
    chaseRadius: 1.8*5, findHeightAbove: 1*5, findHeightBelow: .5*5,
    findStartFrames: 6, findStartStatus: 'calibrated-from-legacy-community-5-to-6F-estimate', findCollisionStartRadiusRate: .55555,
    rotationFrames: 25, rotationStatus: 'calibrated-from-provisional-community-45F-total-minus-extracted-20F-wait',
    chaseStartFrames: 20, chaseSpeed: 6.2, chaseSeconds: 2.5,
    groundPositionAirResist: .3, verticalWallReboundMaxRate: .7,
    throwBlast: Object.freeze({ nearDamage: rawDamage(600), farDamage: rawDamage(350), nearRadius: 2.6, farRadius: 6, paintRadius: 3.5 }),
    chaseBlast: Object.freeze({ nearDamage: rawDamage(600), farDamage: rawDamage(350), nearRadius: 2.6, farRadius: 6, paintRadius: 3.5 }),
    splashRadius: 2.6, splashPaintRadius: 2, splashDamage: rawDamage(120),
    splashAround: Object.freeze({count:8,pitchDegrees:65,velocityMin:speedPerSecond(.42),velocityMax:speedPerSecond(.48)}),
    findSplashAround: Object.freeze({count:6,pitchMinDegrees:30,pitchMaxDegrees:45,velocityMin:speedPerSecond(.15),velocityMax:speedPerSecond(.23),paintRadius:.7}),
    inkCostFallback: 65, calibration: 'throw/chase damage bands, recovery, ground fuse, 20F post-rotation wait, ground drag and throw tuple extracted; Wiki reports stop/transform then straight flight, approximate asymmetric search and provisional 45F total transform. Rotation25F is a calibration from that tentative total minus20F, not extracted; startup6F uses a legacy community estimate; chase speed/timeout, lost-target last-position aim and world mapping remain calibrated',
  }),
  inkMine: Object.freeze({
    id: 'inkMine', name: 'Ink Mine', source: 'WeaponTrap.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: 0,
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.12), high: speedPerSecond(1.12) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 0, inheritZ: 0, inheritYPlus: 0, inheritYMax: 0,
    radius: 8, damageInner: 3.6, damageOuter: 8, damageMax: rawDamage(450), damageMin: rawDamage(350), damageFalloff: 'discrete',
    damageDistanceRate: Object.freeze([1, 1.1875, 1.375]),
    markRadiusTiers: Object.freeze([8, 9.5, 11]), sensorRadius: 3, sensorRadiusTiers: Object.freeze([3, 3.5, 4]), inkTriggerRadius: .45, markFrames: Object.freeze([300, 450, 600]), paintRadius: 5,
    placePaintRadius: 1, markOffsetY: .45, damageOffsetY: .45, paintOffsetY: .45,
    maxOwnerObjects: 2, lifetime: Infinity, armSeconds: .6, gravity: 24,
    inkCostFallback: 60, calibration: 'cost, sensor/damage/paint radii and marks extracted; public gameplay reports indefinite lifetime and oldest-mine detonation on third placement; arm/ink-contact/world scale calibrated',
  }),
  toxicMist: Object.freeze({
    id: 'toxicMist', name: 'Toxic Mist', source: 'WeaponPoisonMist.game__GameParameterTable.json',
    inkCost: 55, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(80),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.4), high: speedPerSecond(1.68) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 1.6, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    // DistanceForOff=5.4 is the raw engine cutoff. The Wiki measures 1.05
    // trial lines; its system page defines one line as 5 world units/metres.
    radius: 1.05 * 5, sourceCutoff: 5.4, radiusStatus: 'wiki-measured-trial-lines-to-world-units', lifetime: 5,
    effectLevels: Object.freeze([{ frame: 60, nextLevelCount: 3 }, { frame: 30, nextLevelCount: 4 }, { frame: 15, nextLevelCount: 0 }]),
    gravity: 24, slowScale: .5, inkDrainMaxPercent: 40, jumpScale: .5,
    inkCostFallback: 55, calibration: 'cost, 80F lockout, effect levels and cutoff extracted; 5s/1.05 trial-line (5.25 world-unit)/50% slow/40% max drain are Wiki measurements; jump magnitude is unquantified and retained as explicit calibration',
  }),
  angleShooter: Object.freeze({
    id: 'angleShooter', name: 'Angle Shooter', source: 'WeaponLineMarker.game__GameParameterTable.json',
    inkCost: 40, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(50),
    throwSpeed: speedPerSecond(6.3), throwSpeedTiers: Object.freeze({ low: speedPerSecond(6.3), mid: speedPerSecond(6.55), high: speedPerSecond(6.8) }),
    spawnSpeedY: 0, spawnSpeedYWorldMin: speedPerSecond(-100), inheritX: 0, inheritYPlus: 0, inheritYMax: 0,
    directDamage: rawDamage(400), directPaintRadius: 2, markFrames: Object.freeze([300, 450, 600]),
    flightFrames: 7, tailFrames: 90, paintRadius: 2.6, collisionRadius: .25, gravity: 0, flyPositionAirResist: 0,
    reboundGroundAngleRate: .1, reboundWallAngleRate: 1, reboundGroundSpeedRate: 1, reboundWallSpeedRate: 1,
    inkCostFallback: 40, calibration: 'direct damage, marking/tail frames, paint radius, throw speed and ground/wall rebound ratios extracted; Wiki confirms near-tangent ground rebound and starts mark clock at release; line width and raw90F versus Wiki105F tail interpretation calibrated/unverified',
  }),
  splashWall: Object.freeze({
    id: 'splashWall', name: 'Splash Wall', source: 'WeaponShield.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(85),
    throwSpeed: speedPerSecond(.3), throwSpeedTiers: Object.freeze({ low: speedPerSecond(.3), mid: speedPerSecond(.3), high: speedPerSecond(.3) }),
    spawnSpeedY: speedPerSecond(.07), spawnSpeedYWorldMin: speedPerSecond(-.5), inheritX: 0, inheritYPlus: 0, inheritYMax: 0,
    gravity: accelPerSecondSquared(.009), flyPositionAirResist: .001,
    wallHpTiers: Object.freeze([800, 1150, 1500]), wallWidth: 4.2, wallHeight: 2.8,
    minimumDeploySeconds: 1, deployTimingStatus: 'wiki-approximate-release-to-active', fixedThrowPitch: 0,
    lifetime: frameSeconds(400), hpDecayFrames: 400, damageSpanFrames: 30, contactDamage: 30,
    inkCostFallback: 60, calibration: 'cost/recovery/gravity/throw/HP tiers/DamageSpanFrame extracted; Wiki reports fixed local throw trajectory, floor placement, approximately1s release-to-active and replacement/400F decay from activation; dimensions, hand-origin pitch shift, rebound coefficient and exact activation frame remain calibrated/unverified',
  }),
  sprinkler: Object.freeze({
    id: 'sprinkler', name: 'Sprinkler', source: 'WeaponSprinkler.game__GameParameterTable.json',
    inkCost: 60, inkCostStatus: 'extracted', inkRecoverStop: frameSeconds(60),
    throwSpeed: speedPerSecond(1.12), throwSpeedTiers: Object.freeze({ low: speedPerSecond(1.12), mid: speedPerSecond(1.12), high: speedPerSecond(1.12) }),
    spawnSpeedY: speedPerSecond(.24), spawnSpeedYWorldMin: speedPerSecond(-.4),
    inheritX: 1.6, inheritZ: 2, inheritYPlus: 4, inheritYMax: speedPerSecond(.32),
    hitPaintRadius: 2.9, placePaintRadius: .3, spoutDrawRadius: .25, paintRadius: 1.4, dropletDamage: 20, dropletHitRadius: .15,
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

// ConsumeRt_Sub_Lv0..4 from pinned 11.3.0 misc/params.json, selected by each
// weapon's own SubWeaponSetting.SubInkSaveLv. Splash Wall has no setting row;
// the 35% maximum saving at GP57 is measured on the community Wiki.
const SUB_INK_SAVE_CURVES=Object.freeze({
  burst:Object.freeze([1,.855555,.711111]),
  autobomb:Object.freeze([1,.85,.7]), fizzy:Object.freeze([1,.85,.7]), torpedo:Object.freeze([1,.85,.7]),
  inkMine:Object.freeze([1,.8,.6]), toxicMist:Object.freeze([1,.85,.7]),
  angleShooter:Object.freeze([1,.9,.8]), splashWall:Object.freeze([1,.825,.65]),
  sprinkler:Object.freeze([1,.8,.6]), beakon:Object.freeze([1,.8,.6]),
});

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
function syncObjectAttachment(api,object){
  if(syncSubAttachment(api.G,object,object.s3SurfaceAttachment))object.mesh?.position.copy(object.pos);
}
function ownerLife(owner) { return Number.isSafeInteger(owner?.netLife) && owner.netLife >= 0 ? owner.netLife : 0; }
function localOwner(owner) { return !!owner && owner.remote !== true; }
function hasActiveTorpedo(projectiles, owner) {
  return !!projectiles&&!!owner&&entityList(projectiles).some(o=>!o.dead&&o.owner===owner&&o.subId==='torpedo'&&o.phase!=='ghostWait');
}
function canPlaceInkMine(projectiles,owner,level=null){
  // S3 mix Wiki: mines are placed at the feet on ground, and another mine
  // cannot be placed inside an existing one's sensor circle. Gate before the
  // native runner pays ink, as well as at the direct projectile entry point.
  if(!owner?.grounded||!finite3(owner.pos))return false;
  if(level?.blocks?.[owner.ground?.block]?.grate)return false;
  return !entityList(projectiles).some(o=>!o.dead&&o.owner===owner&&o.subId==='inkMine'&&o.phase==='deployed'&&
    o.pos.distanceToSquared(owner.pos)<=o.spec.sensorRadius**2);
}

function emitEvent(api, object, phase, extra = {}) {
  if (!object || object.ghost || !localOwner(object.owner)) return null;
  const p = object.pos;
  const payload = {
    v: 1, phase, subId: object.subId, seq: object.seq, eventSeq: nextSeq(object.owner),
    life: ownerLife(object.owner), sourceLife: object.sourceLife, subPowerAP: object.subPowerAP, x: p?.x || 0, y: p?.y || 0, z: p?.z || 0,
    vx: object.vel?.x || 0, vy: object.vel?.y || 0, vz: object.vel?.z || 0,
    seed: object.seed >>> 0, charge: clamp(object.charge || 0, 0, 1),
    ...towerAttachmentFields(api.G,object.s3SurfaceAttachment),
    ...(phase==='spawn'?object.s3TowerPaintBirthRef:null),...extra,
    actor: object.owner, paintSource: object,
  };
  api.emit?.('all:sub', payload);
  return payload;
}

function addMesh(api, parent, geometry, material, position = null) {
  const mesh = new api.THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (position) mesh.position.copy(position);
  parent.add(mesh); return mesh;
}
function sceneFor(api, projectiles) { return api.G.scene || projectiles?.scene || api.G.projectiles?.scene || null; }
// Per-sub models (sub-models.mjs). Presentation only: the record's position,
// velocity, phase and timers are read, never written.
// Model origin offset from the record position while the object flies (the
// ground models stand on their base; the record is the object's centre).
const FLIGHT_LIFT = { autobomb: -0.21, inkMine: -0.02, sprinkler: -0.2, beakon: -0.45, pointSensor: 0 };
// Thrown bombs tumble in flight; deployables keep upright until they land.
const TUMBLE = new Set(['burst', 'fizzy', 'toxicMist']);
function buildVisual(api, object, projectiles) {
  const scene=sceneFor(api,projectiles);
  if (!scene?.add) return null;
  const { THREE } = api, group = new THREE.Group(), id = object.subId;
  const color = object.owner?.color || api.G.teamColors?.[object.team] || 0xffcc33;
  const deployed = object.phase === 'deployed'||object.phase==='wallPending';
  const ink = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .08, roughness: .42, metalness: .1 });
  const modelId = id === 'toxicMist' && deployed ? 'toxicMistCloud' : id;
  const spec = ALL_SUB_SPECS[id];
  const model = buildSubModel(THREE, modelId, ink, {
    dims: id === 'splashWall' ? { width: spec.wallWidth, height: spec.wallHeight } : undefined,
    unfold: 0, armed: false,
  });
  if (model) {
    if (modelId === 'toxicMistCloud') model.root.scale.set(spec.radius, 2, spec.radius);
    else if (!deployed) {
      if (id === 'splashWall') model.root.position.y = -spec.wallHeight * SPLASH_WALL_FOLDED_SCALE / 2;
      else if (FLIGHT_LIFT[id]) model.root.position.y = FLIGHT_LIFT[id];
    }
    for (const m of model.root.children) m.traverse(o => { if (o.isMesh && !o.material.transparent) o.receiveShadow = true; });
    group.add(model.root);
    object.s3Model = model;
  } else {
    addMesh(api, group, new THREE.SphereGeometry(.2, 12, 9), ink);
    object.s3Model = null;
  }
  group.position.copy(object.pos);
  group.rotation.y = object.yaw || 0;
  group.userData.s3SubId = id;
  scene.add(group);
  return group;
}
function poseVisual(api, object, dt) {
  const mesh = object.mesh, model = object.s3Model;
  if (!mesh) return;
  mesh.position.copy(object.pos);
  if (!model) return;
  const id = object.subId, deployed = object.phase === 'deployed'||object.phase==='wallPending', now = api.G.time || 0, v = object.vel;
  if (!deployed && (id === 'torpedo' || id === 'angleShooter')) {
    // Nose along the travel (Angle Shooter flies wide end first).
    const h = Math.hypot(v.x, v.z);
    if (h * h + v.y * v.y > 1e-4) mesh.rotation.set(-Math.atan2(v.y, h), Math.atan2(v.x, v.z), 0, 'YXZ');
  } else if (!deployed && !object.grounded && TUMBLE.has(id)) {
    mesh.rotation.x += dt * 9; mesh.rotation.z += dt * 2.5;
  } else if (id === 'autobomb' && Math.hypot(v.x, v.z) > .05) {
    mesh.rotation.set(0, Math.atan2(v.x, v.z), 0);
  } else mesh.rotation.set(0, object.yaw || 0, 0);
  const unfold = id === 'splashWall' && deployed ? (object.age-(object.wallReadyAge??object.age)+SPLASH_WALL_UNFOLD_SECONDS) / SPLASH_WALL_UNFOLD_SECONDS : 0;
  let bulge = 0;
  if (id === 'fizzy') bulge = Math.min(1, .25 * (object.popLimit - 1) + (object.fuse > 0 ? .5 * Math.min(1, object.age / object.fuse) : 0));
  if (id === 'splashWall' && !Number.isFinite(object.s3HpMax)) object.s3HpMax = object.hp;
  const fill = id === 'splashWall' && object.s3HpMax > 0 ? object.hp / object.s3HpMax : 1;
  poseSubModel(model, { dt, speed: object.grounded ? Math.hypot(v.x, v.z) : 0, unfold, fill,
    armed: deployed && now >= object.activeAt, flying: !deployed, active: deployed, bulge });
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
  for (const g of geos) if (!isSharedGeometry(g)) g.dispose?.();
  for (const m of mats) m.dispose?.();
  object.mesh = null; object.s3Model = null;
}
function createObject(api, projectiles, owner, id, record = {}) {
  const baseSpec = ALL_SUB_SPECS[id];
  if (!baseSpec || !owner?.pos || !projectiles) return null;
  const ap = Number.isFinite(record.subPowerAP)?clamp(record.subPowerAP,0,57):(owner.s3?.abilityPoints?.subPower||0);
  const spec = id === 'inkMine' ? { ...baseSpec,
    sensorRadius: gearCurve(ap, ...baseSpec.sensorRadiusTiers),
    markRadius: gearCurve(ap, ...baseSpec.markRadiusTiers),
    damageDistanceScale: gearCurve(ap, ...baseSpec.damageDistanceRate),
    damageInner: baseSpec.damageInner * gearCurve(ap, ...baseSpec.damageDistanceRate),
    damageOuter: baseSpec.damageOuter * gearCurve(ap, ...baseSpec.damageDistanceRate),
    radius: baseSpec.radius * gearCurve(ap, ...baseSpec.damageDistanceRate),
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
  if(id==='splashWall')object.wallHpInitial=object.hp;
  if(['inkMine','beakon'].includes(id))object.s3SurfaceAttachment=object.ghost?replayTowerAttachment(api.G,object,record):
    captureSubAttachment(api.G,object,owner.ground?.block,{towerOnly:true});
  if(id==='inkMine'&&!object.ghost&&object.s3SurfaceAttachment)
    object.s3TowerPaintBirthRef=mineTowerPaintReference(api.G.netm,object.pos);
  if(id==='angleShooter')object.lineSegments=[];
  const heldSeconds = Number.isFinite(record.hold) ? record.hold : owner.weaponRunner?.s3SubHold || 0;
  if (id === 'fizzy') {
    const hold = heldSeconds;
    object.popLimit = hold >= frameSeconds(spec.chargeFrames[0] + spec.chargeFrames[1]) ? 3 : hold >= frameSeconds(spec.chargeFrames[0]) ? 2 : 1;
    object.pops = object.popLimit;
    // BurstWaitFrame is a subphase, not a release-time fuse. The Wiki observes
    // about .5 s of ground contact before the first pop; later hops pop only
    // after returning to the ground, never one frame into their airborne arc.
    object.fuse = frameSeconds(spec.firstGroundFuseFrames);
  }
  const list = entityList(projectiles);
  while (list.length >= MAX_OBJECTS) removeObject(api, projectiles, list[0], true);
  list.push(object);
  if(object.ghost&&['inkMine','angleShooter'].includes(id)){
    const births=markBirthState(api,projectiles,owner,true);
    if(object.sourceLife>births.life||object.sourceLife===births.life&&seq>births.seq){
      births.life=object.sourceLife;births.seq=seq;
      births.entries.set(markBirthKey(object),Object.freeze({frames:Math.round(markSeconds(spec,owner,ap)*60)}));
      // The source itself can retain at most MAX_OBJECTS live catalogue objects.
      // A later same-owner ordered birth beyond this bound proves the oldest
      // can no longer emit a new mark. Other owners cannot evict this history.
      while(births.entries.size>MAX_OBJECTS)births.entries.delete(births.entries.keys().next().value);
    }
  }
  object.mesh = buildVisual(api, object, projectiles);
  if (!object.ghost) emitEvent(api,object,'spawn',{ hold: heldSeconds });
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
  const input=Number.isFinite(spec.fixedThrowPitch)?{aimYaw:actor.aimYaw,aimPitch:spec.fixedThrowPitch,vel:actor.vel}:actor;
  return fidelityThrowVelocity(input,'bomb',new api.THREE.Vector3(),speed,template);
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
    // A shared destination can disappear after an earlier jumper lands. Its
    // other in-flight jumps retain their native fixed destination; only their
    // now-useless consumption bookkeeping ends with this device.
    for(const actor of api.G.actors||[]){
      const use=actor?.s3SubBeaconUse;
      if(use&&use.beaconOwner===object.owner&&use.beaconLife===object.sourceLife&&use.beaconSeq===object.seq)
        delete actor.s3SubBeaconUse;
    }
    object.reservations?.clear();
    const beakons = api.G.s3Beakons;
    if (Array.isArray(beakons)) { const i = beakons.indexOf(object); if (i >= 0) beakons.splice(i,1); }
    api.emit?.('sub:beakon-expire',{ actor:object.owner, beacon:object, team:object.team, seq:object.seq });
  }
  disposeVisual(api,object,projectiles);
  if(object.lineMesh){
    sceneFor(api,projectiles)?.remove?.(object.lineMesh);
    object.lineMesh.geometry?.dispose?.();object.lineMesh.material?.dispose?.();object.lineMesh=null;
  }
  return true;
}

function ownerObjects(projectiles, object) {
  return entityList(projectiles).filter(x => !x.dead && x !== object && x.owner === object.owner && x.subId === object.subId && x.phase === 'deployed');
}
function deploy(api, projectiles, object, pos, normal = null, blockId = null) {
  if (object.dead || object.phase === 'deployed'||object.phase==='wallPending') return;
  if (finite3(pos)) object.pos.copy(pos);
  object.vel.set(0,0,0); object.phase = 'deployed';
  const spec = object.spec;
  const cap = spec.maxOwnerObjects || (object.subId === 'splashWall' ? 1 : 1);
  const siblings = ownerObjects(projectiles,object).sort((a,b) => b.age-a.age);
  while (object.subId!=='splashWall'&&siblings.length >= cap) {
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
  if(object.subId==='splashWall'){
    object.wallHpInitial=object.hp;
    object.wallContactUntil=new WeakMap();
    // A folded device has landed, but its ink curtain is not a barrier yet.
    // Approximate Wiki release clock stays separate from the extracted400F
    // active lifetime and the raw HP pool.
    object.phase='wallPending';
    object.wallReadyAge=Math.max(object.age,spec.minimumDeploySeconds);
    object.activeAt=(api.G.time||0)+Math.max(0,object.wallReadyAge-object.age);
    object.expireAt=Infinity;
  }
  if(['sprinkler','inkMine'].includes(object.subId)&&!object.ghost)surfacePaint(api,object.owner,object.team,object.pos,spec.placePaintRadius,object.seed^0x27d4eb2d);
  if(!['splashWall','inkMine','beakon'].includes(object.subId))object.pos.y+=.02;
  if(!object.ghost&&['splashWall','inkMine','beakon'].includes(object.subId))
    object.s3SurfaceAttachment=captureSubAttachment(api.G,object,blockId??object.owner?.ground?.block,{towerOnly:true,normal});
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
function activateSplashWall(api,projectiles,object){
  for(const old of ownerObjects(projectiles,object))removeObject(api,projectiles,old);
  object.phase='deployed';object.deployedAt=api.G.time||0;
  object.activeAt=api.G.time||0;object.expireAt=(api.G.time||0)+object.spec.lifetime;
  replaceVisual(api,object);
}

function surfacePaint(api, owner, team, point, radius, seed, proof = null) {
  return surfacePaintWithCredit(api,owner,team,point,radius,seed,true,proof);
}
function surfacePaintWithCredit(api, owner, team, point, radius, seed, credit, proof = null) {
  if (!api.G.paint?.splat || !point?.isVector3 || !(radius > 0)) return 0;
  const area = api.G.paint.splat(point,radius,team,{seed:((seed>>>0)/0x100000000),claimOwner:owner,kitPaint:proof});
  if (credit && area > 0) owner?.addTurf?.(area);
  return area;
}
function damageAt(distance, spec) {
  if (Number.isFinite(spec.directDamage)) return spec.directDamage;
  if (!Number.isFinite(spec.damageOuter) || distance > spec.damageOuter) return 0;
  if (spec.damageFalloff === 'discrete') return distance <= (spec.damageInner || 0) ? spec.damageMax : spec.damageMin;
  const t = clamp((distance - (spec.damageInner || 0)) / Math.max(1e-6,spec.damageOuter - (spec.damageInner || 0)),0,1);
  const falloff = spec.damageFalloff === 'calibrated-quadratic' ? (1 - t) ** 2 : 1 - t;
  return lerp(spec.damageMin,spec.damageMax,falloff);
}
// A per-call-depth pool is necessary: damage/paint hooks can synchronously
// trigger a second sub lookup before the outer lookup has finished iterating.
function hostileActors(api, owner) {
  const pool = api._allSubHostilePool || (api._allSubHostilePool = []);
  const depth = api._allSubHostileDepth || 0;
  const out = pool[depth] || (pool[depth] = []);
  api._allSubHostileDepth = depth + 1;
  out.length = 0;
  const actors = api.G.actors || [], team = owner.team;
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (a && a.alive && a.team !== team && a.pos && a !== owner) out.push(a);
  }
  return out;
}
function releaseHostileActors(api) {
  const depth = --api._allSubHostileDepth;
  api._allSubHostilePool[depth].length = 0;
}
function applyMark(api, target, team, seconds, subId) {
  if (!target?.alive || target.team === team || !(seconds > 0)) return false;
  target.s3 ||= {};
  target.s3.revealedUntil ||= {};
  const until = (api.G.time || 0) + subMarkSeconds(target, seconds, subId);
  target.s3.revealedUntil[team] = Math.max(target.s3.revealedUntil[team] || 0,until);
  return true;
}
function markSeconds(spec, owner, apOverride = null) {
  const raw = spec.markFrames || [300,450,600];
  const ap = Number.isFinite(apOverride)?apOverride:(owner.s3?.abilityPoints?.subPower||0);
  return gearCurve(ap,raw[0],raw[1],raw[2]) / 60;
}

function markAngleTarget(api,object,target){
  const life=ownerLife(target);
  if(object.ghost||object.seenMarks.get(target)===life)return;
  const frames=Math.round(markSeconds(object.spec,object.owner,object.subPowerAP)*60);
  const markAgeFrames=Math.max(0,Math.floor(object.age*60+1e-8));
  const remaining=Math.max(0,frames-markAgeFrames)/60;
  if(!(remaining>0))return;
  object.seenMarks.set(target,life);
  applyMark(api,target,object.team,remaining,object.subId);
  if(Number.isInteger(target.nid))api.emit?.('all:sub',{v:1,phase:'mark',subId:object.subId,seq:object.seq,
    life:ownerLife(object.owner),sourceLife:object.sourceLife,eventSeq:nextSeq(object.owner),
    targetId:target.nid,targetLife:life,frames,markAgeFrames,sourceTeam:object.team,actor:object.owner});
}
function appendAngleLine(api,projectiles,object,start,end){
  if(!object.lineSegments||object.lineSegments.length>=object.spec.flightFrames||start.distanceToSquared(end)<1e-10)return;
  object.lineSegments.push([start.clone(),end.clone()]);
  const scene=sceneFor(api,projectiles),THREE=api.THREE;
  if(!scene?.add||!THREE.LineSegments)return;
  if(!object.lineMesh){
    object.lineMesh=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
      color:object.owner?.color||api.G.teamColors?.[object.team]||0xffcc33,transparent:true,opacity:.85}));
    object.lineMesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(object.spec.flightFrames*6),3));
    object.lineMesh.frustumCulled=false;
    scene.add(object.lineMesh);
  }
  const positions=object.lineMesh.geometry.getAttribute('position'),i=(object.lineSegments.length-1)*2;
  positions.setXYZ(i,start.x,start.y,start.z);positions.setXYZ(i+1,end.x,end.y,end.z);positions.needsUpdate=true;
  object.lineMesh.geometry.setDrawRange(0,object.lineSegments.length*2);
}
function finishAngleFlight(api,object){
  object.phase='line';object.vel.set(0,0,0);
  object.lineEndsAtAge=object.age+frameSeconds(object.spec.tailFrames);
  if(object.mesh)object.mesh.visible=false;
}
function updateAngleLine(api,projectiles,object,dt){
  object.age+=dt;
  if(!object.ghost){
    const hostiles=hostileActors(api,object.owner),base=new api.THREE.Vector3(),result={t:0,dist:Infinity};
    try{
      for(const target of hostiles){
        if(object.seenMarks.get(target)===ownerLife(target))continue;
        base.copy(target.pos);base.y+=target.smoothY||0;
        const height=target.form==='squid'?api.PLAYER.squidHeight:api.PLAYER.height;
        for(const [start,end] of object.lineSegments||[]){
          api.Physics.segmentCapsuleDist(start,end,base,api.PLAYER.radius,height,result);
          if(result.dist<=api.PLAYER.radius+object.spec.collisionRadius){markAngleTarget(api,object,target);break;}
        }
      }
    }finally{releaseHostileActors(api);}
  }
  if(object.age+1e-10>=object.lineEndsAtAge)removeObject(api,projectiles,object);
}

function detonateInkMine(api,projectiles,mine){
  if(!mine||mine.dead||mine.subId!=='inkMine'||mine.ghost)return false;
  syncObjectAttachment(api,mine);
  const baseDuration=markSeconds({markFrames:mine.spec.markFrames},mine.owner,mine.subPowerAP);
  { const __iwHostiles = hostileActors(api,mine.owner);
    try {
      for (const target of __iwHostiles) {
    const dx=target.pos.x-mine.pos.x,dy=target.pos.y+.7-mine.pos.y-(mine.spec.markOffsetY||0),dz=target.pos.z-mine.pos.z;
    // The marking volume passes through walls; the separate damage blast below
    // still performs its normal obstruction test (S3 mix Wiki, Ink Mine).
    if(dx*dx+dy*dy+dz*dz>mine.spec.markRadius**2)continue;
    applyMark(api,target,mine.team,baseDuration,mine.subId);
    if(Number.isInteger(target.nid))api.emit?.('all:sub',{v:1,phase:'mark',subId:mine.subId,seq:mine.seq,life:ownerLife(mine.owner),sourceLife:mine.sourceLife,eventSeq:nextSeq(mine.owner),
      targetId:target.nid,targetLife:ownerLife(target),frames:Math.round(baseDuration*60),sourceTeam:mine.team,actor:mine.owner});
  }
    } finally { releaseHostileActors(api); }
  }
  blast(api,mine,mine.pos);
  removeObject(api,projectiles,mine);
  return true;
}

function damageCustomObject(api,source,target,point,damage,cause=null){
  const sourceOwner=source?.owner&&typeof source.owner==='object'?source.owner:source;
  const sourceTeam=source?.team??sourceOwner?.team;
  if(!(damage>0)||target===source||target.dead||target.team===sourceTeam||source?.remote||sourceOwner?.remote)return 0;
  const amount=damage*objectDamageScale(source,target.subId,cause);
  if(!(amount>0))return 0;
  if(target.ghost){if(!source.ghost)emitObjectHit(api,target,source,point,damage,cause);return 0;}
  if(target.owner?.remote){emitObjectHit(api,target,source,point,damage,cause);return 0;}
  target.hp-=amount;
  if(target.hp<=0)removeObject(api,api.G.projectiles,target);
  return amount;
}

// Ranked Rainmaker uses the same raw damage / authored cause / owning-client
// boundary as native sub and special attacks. The owner applies source rates
// and Object Shredder once; remote presentation never spends local HP.
export function applySubObjectHit(api, projectiles, object, projectile, point, damage, cause=null) {
  return damageCustomObject(api, projectile, object, point, damage, cause);
}

function isSubObjectBlastTarget(target){
  return target.phase==='deployed'&&['splashWall','sprinkler','beakon'].includes(target.subId) ||
    targetableTorpedo(target);
}
function subObjectBlastPoint(api,target,origin){
  if(target.subId!=='splashWall')return target.pos.clone().add(new api.THREE.Vector3(0,.7,0));
  const yaw=target.yaw||0,rx=Math.cos(yaw),rz=-Math.sin(yaw);
  const side=clamp((origin.x-target.pos.x)*rx+(origin.z-target.pos.z)*rz,-target.spec.wallWidth/2,target.spec.wallWidth/2);
  const y=clamp(origin.y,target.pos.y,target.pos.y+target.spec.wallHeight);
  return new api.THREE.Vector3(target.pos.x+rx*side,y,target.pos.z+rz*side);
}

function damageSubObjectsInRadius(api,projectiles,source,center,radius,damageAt,cause=null,includeSpecials=true,options={}){
  for(const target of entityList(projectiles)){
    syncObjectAttachment(api,target);
    const sourceTeam=source?.team??source?.owner?.team;
    if(target===source||target.dead||!isSubObjectBlastTarget(target)||target.team===sourceTeam)continue;
    const point=subObjectBlastPoint(api,target,center),distance=point.distanceTo(center);
    if(options.shapeContact?!options.shapeContact(target,point):distance>radius)continue;
    if(!options.pierceLOS&&api.G.physics?.los&&!api.G.physics.los(center,point))continue;
    damageCustomObject(api,source,target,point,damageAt(point.distanceTo(center),target,point),cause);
  }
  projectiles.nativeSprinklerAoE?.(source,center,radius,damageAt,cause,options);
  if(includeSpecials)projectiles.s3DamageSpecialObjects?.(source,center,radius,damageAt,cause);
}

function nativeBombDamageAt(bomb,api,distance){
  const r=bomb?.s3Resolved;
  let inner=r?.damageInnerDistance,outer=r?.damageOuterDistance,max=r?.damageMax,min=r?.damageMin;
  if(!Number.isFinite(inner)||!Number.isFinite(outer)||!Number.isFinite(max)||!Number.isFinite(min)){
    const bands=api.SUB?.bomb?.damageBands||[];
    [[inner,max],[outer,min]]=bands;
  }
  if(!Number.isFinite(outer)||distance>outer)return 0;
  return distance<=(inner||0)?(max||0):(min||0);
}
function damageNativeBombObjects(api,projectiles,bomb){
  if(!bomb||bomb.ghost||bomb.owner?.remote||!bomb.pos)return;
  const id=bomb.s3Sub?.id||bomb.s3Resolved?.spec?.id||'bomb';
  // Curling's rolling contact is Bomb_CurlingBullet; its final explosion uses
  // the Bomb source row, just like other bomb blast phases.
  const cause=id==='suction'?'Bomb_Suction':'Bomb';
  const damageAt=d=>nativeBombDamageAt(bomb,api,d);
  const r=bomb.s3Resolved?.radius||api.SUB?.bomb?.radius||8;
  damageSubObjectsInRadius(api,projectiles,bomb,bomb.pos,r,damageAt,cause);
}

function enemyInkNearMine(api,mine){
  const sample=api.G.paint?.regionStats;
  if(typeof sample!=='function')return false;
  const stats=api._allSubInkMineStats||={own:0,enemy:0,empty:0,n:0};
  const found=sample.call(api.G.paint,mine.pos.x,mine.pos.y-.1,mine.pos.z,mine.spec.inkTriggerRadius,mine.team,stats)||stats;
  return Number.isFinite(found.enemy)&&found.enemy>0;
}

function blast(api, object, pos, burstIndex = 0) {
  const sourceSpec = object.subId === 'fizzy' ? object.spec.bursts[Math.min(2,burstIndex)] :
    object.subId === 'torpedo' ? {
      ...object.spec,
      damageMax: object.chasedTarget ? object.spec.chaseBlast.nearDamage : object.spec.throwBlast.nearDamage,
      damageMin: object.chasedTarget ? object.spec.chaseBlast.farDamage : object.spec.throwBlast.farDamage,
      damageInner: object.chasedTarget ? object.spec.chaseBlast.nearRadius : object.spec.throwBlast.nearRadius,
      damageOuter: object.chasedTarget ? object.spec.chaseBlast.farRadius : object.spec.throwBlast.farRadius,
      paintRadius: object.chasedTarget ? object.spec.chaseBlast.paintRadius : object.spec.throwBlast.paintRadius,
      splashRadius: object.chasedTarget ? object.spec.splashRadius : 0,
      splashPaintRadius: object.chasedTarget ? object.spec.splashPaintRadius : 0,
      splashDamage: object.chasedTarget ? object.spec.splashDamage : 0,
    } : object.spec;
  // Burst Bomb's Wiki-measured 25 direct hit is followed one frame later by
  // the ordinary 35/25 blast bands. Preserve both separately-timed events.
  const spec = object.subId === 'burst' ? { ...sourceSpec, directDamage: undefined } : sourceSpec;
  const damagePos=spec.damageOffsetY?pos.clone().add(new api.THREE.Vector3(0,spec.damageOffsetY,0)):pos;
  if (!object.ghost) {
    if (Number.isFinite(spec.paintRadius)) {
      const center = pos.clone();
      center.y+=spec.paintOffsetY||0;
      if (object.subId === 'splashWall') center.y += .3;
      let proof=object.s3PaintBirth?[...object.s3PaintBirth,burstIndex]:null;
      if(object.subId==='inkMine'&&object.s3SurfaceAttachment){
        const support=mineTowerPaintReference(api.G.netm,object.pos);
        // Moving paint needs a bounded host-accepted pose. Never downgrade a
        // Tower core to the static birth envelope when that proof is absent.
        proof=proof&&support&&object.s3TowerPaintBirthRef?[...proof,support.supportRevision]:null;
      }
      const area = surfacePaint(api,object.owner,object.team,center,spec.paintRadius,object.seed ^ ((burstIndex+1)*0x9e3779b9),proof);
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
      { const __iwHostiles = hostileActors(api,object.owner);
        try {
          for (const target of __iwHostiles) {
        targetPoint.copy(target.pos); targetPoint.y += target.form === 'squid' ? .45 : .7;
        const d = targetPoint.distanceTo(damagePos);
        if (d > outer || api.G.physics?.los && !api.G.physics.los(damagePos,targetPoint)) continue;
        const shelter=api.G.projectiles?.kitBarrierCandidate?.(object,damagePos,targetPoint);
        if(shelter?.object?.subId==='splashWall'&&shelter.distance<damagePos.distanceTo(targetPoint)-1e-6)continue;
        const amount = damageAt(d,spec);
        if (amount > 0) api.G.projectiles?.applyHit?.(object.owner,target,amount,object.subId);
      }
        } finally { releaseHostileActors(api); }
      }
      const mainCause=object.subId==='torpedo'?'Bomb_TorpedoBullet':object.subId==='inkMine'?'Bomb_Trap':null;
      damageSubObjectsInRadius(api,api.G.projectiles,object,damagePos,outer,d=>damageAt(d,spec),mainCause);
    }
  }
  if (!object.ghost) api.G.fx?.explosion?.(damagePos,api.G.teamColors?.[object.team],spec.radius || spec.damageOuter || 2);
  if (!object.ghost) {
    emitEvent(api,object,'burst',{ burstIndex, x:damagePos.x,y:damagePos.y,z:damagePos.z });
    api.emit?.('weapon:impact',{ pos:damagePos.clone(),normal:new api.THREE.Vector3(0,1,0),team:object.team,kind:'sub',radius:spec.radius||spec.damageOuter||1,subId:object.subId });
  }
  if(object.subId==='torpedo'&&object.chasedTarget)spawnTorpedoSplashes(api,api.G.projectiles,object,pos);
  if(object.subId==='fizzy')spawnFizzySplashes(api,api.G.projectiles,object,pos,burstIndex);
}

function burstTorpedoSplash(api,drop,pos){
  const spec=drop.source.spec;
  if(drop.kind==='fizzy'){
    if(!drop.ghost&&localOwner(drop.owner))surfacePaint(api,drop.owner,drop.team,pos,drop.paintRadius,drop.seed);
    return;
  }
  if(drop.kind==='find'){
    if(!drop.ghost&&localOwner(drop.owner))surfacePaint(api,drop.owner,drop.team,pos,spec.findSplashAround.paintRadius,drop.seed);
    return;
  }
  if(!drop.ghost&&localOwner(drop.owner)){
    surfacePaint(api,drop.owner,drop.team,pos,spec.splashPaintRadius,drop.seed);
    const hostiles=hostileActors(api,drop.owner),point=new api.THREE.Vector3();
    try{
      for(const target of hostiles){
        point.copy(target.pos);point.y+=target.form==='squid'?.45:.7;
        if(point.distanceTo(pos)>spec.splashRadius||api.G.physics?.los&&!api.G.physics.los(pos,point))continue;
        const shelter=api.G.projectiles?.kitBarrierCandidate?.(drop,pos,point);
        if(shelter?.object?.subId==='splashWall'&&shelter.distance<pos.distanceTo(point)-1e-6)continue;
        api.G.projectiles?.applyHit?.(drop.owner,target,spec.splashDamage,'torpedo-splash');
      }
    }finally{releaseHostileActors(api);}
    damageSubObjectsInRadius(api,api.G.projectiles,drop,pos,spec.splashRadius,()=>spec.splashDamage,'Bomb_TorpedoSplashBurst');
  }
  api.G.fx?.explosion?.(pos,api.G.teamColors?.[drop.team],spec.splashRadius);
}

function closestActor(api, object, maxDistance, lineOfSight = true) {
  let best = null, bestD = maxDistance;
  { const __iwHostiles = hostileActors(api,object.owner);
    try {
      for (const target of __iwHostiles) {
    const dx=target.pos.x-object.pos.x,dy=target.pos.y+.7-object.pos.y,dz=target.pos.z-object.pos.z,d=Math.hypot(dx,dy,dz);
    if (d < bestD && (!lineOfSight || !api.G.physics?.los || api.G.physics.los(object.pos,target.pos))) { best=target;bestD=d; }
  }
    } finally { releaseHostileActors(api); }
  }
  return best ? { actor:best, distance:bestD } : null;
}
function findTorpedoTarget(api,object){
  let best=null,distance=Infinity;
  const spec=object.spec,hostiles=hostileActors(api,object.owner);
  try{
    for(const target of hostiles){
      const dx=target.pos.x-object.pos.x,dz=target.pos.z-object.pos.z;
      const dy=target.pos.y+.7-object.pos.y,horizontal=dx*dx+dz*dz;
      if(horizontal>spec.chaseRadius**2||dy>spec.findHeightAbove||dy< -spec.findHeightBelow)continue;
      const d=horizontal+dy*dy;
      if(d>=distance||api.G.physics?.los&&!api.G.physics.los(object.pos,target.pos))continue;
      best=target;distance=d;
    }
  }finally{releaseHostileActors(api);}
  return best;
}
function captureTorpedo(api,object,target){
  object.torpedoTarget=target;object.torpedoTargetLife=ownerLife(target);
  object.torpedoAim=target.pos.clone();object.torpedoAim.y+=.7;
  object.phase='torpedoRotate';object.chasedTarget=true;object.torpedoStageAge=0;
  object.vel.set(0,0,0);
  emitEvent(api,object,'torpedoLock');
  spawnTorpedoSplashes(api,api.G.projectiles,object,object.pos,'find');
}
function updateTorpedoTransform(api,object,dt){
  object.age+=dt;object.prev.copy(object.pos);
  if(object.ghost)return;
  const target=object.torpedoTarget;
  if(target?.alive&&ownerLife(target)===object.torpedoTargetLife){
    object.torpedoAim.copy(target.pos);object.torpedoAim.y+=.7;
  }
  object.torpedoStageAge+=dt;
  if(object.phase==='torpedoRotate'){
    if(object.torpedoStageAge+1e-10>=frameSeconds(object.spec.rotationFrames)){
      object.phase='torpedoWait';object.torpedoStageAge=0;
    }
    return;
  }
  if(object.torpedoStageAge+1e-10<frameSeconds(object.spec.chaseStartFrames))return;
  // The lock is sampled until launch. Afterwards retail flies straight; it
  // does not continuously turn after a moving or respawned target.
  object.vel.copy(object.torpedoAim).sub(object.pos);
  if(object.vel.lengthSq()<1e-10)object.vel.set(Math.sin(object.yaw),0,Math.cos(object.yaw));
  object.vel.normalize().multiplyScalar(object.spec.chaseSpeed);
  object.phase='chase';object.chaseAge=0;
  emitEvent(api,object,'torpedoLaunch');
}
function targetableTorpedo(object){
  return object.subId==='torpedo'&&object.chasedTarget&&['flight','chase','torpedoRotate','torpedoWait'].includes(object.phase);
}
function reboundTorpedo(object,normal){
  const vn=object.vel.dot(normal);
  if(vn>=0)return;
  const outward=Math.min(-vn,object.vel.length()*object.spec.verticalWallReboundMaxRate);
  object.vel.addScaledVector(normal,outward-vn);
}
function steerAutobomb(object,target,dt,air=false){
  const m=object.spec.chaseMovement,dx=target.pos.x-object.pos.x,dz=target.pos.z-object.pos.z;
  const desired=Math.atan2(dx,dz),current=Math.atan2(object.vel.x,object.vel.z);
  let d=desired-current;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;
  const maxTurn=m.yawDegreesPerFrame*Math.PI/180*60*dt,angle=current+clamp(d,-maxTurn,maxTurn);
  const speedNow=Math.hypot(object.vel.x,object.vel.z),max=air?m.airMaxSpeedXZ:m.groundMaxSpeed,accel=air?m.airAcceleration:m.groundAcceleration;
  const speed=clamp(speedNow+accel*dt,0,max);
  object.vel.x=Math.sin(angle)*speed;object.vel.z=Math.cos(angle)*speed;object.yaw=angle;
  if(air)object.vel.y=clamp(object.vel.y,-m.airMaxSpeedY,m.airMaxSpeedY);else object.vel.y=0;
}
function armAutobombBurst(object,frames){
  object.phase='burstWait';
  object.fuse=frameSeconds(frames);
  object.vel.set(0,0,0);
}
function applyFlightPositionAirResist(object,dt){
  const resist=object.spec.flyPositionAirResist;
  if(!(resist>0))return;
  // The extracted AirResist values are per-frame velocity retention losses.
  // The sub-object integrator runs at 60 Hz, and exponentiating preserves the
  // same retention if its outer caller advances at another frame rate.
  object.vel.multiplyScalar(Math.pow(1-resist,dt*60));
}

function paintFizzyFlight(api,object,start,end){
  if(object.subId!=='fizzy'||object.ghost)return;
  const spec=object.spec,index=clamp((object.popLimit||1)-1,0,2),interval=spec.flySplashDistance[index];
  if(!(interval>0))return;
  const delta=end.clone().sub(start),distance=delta.length();if(!(distance>1e-8))return;
  let pending=object.flySplashDistance||0,consumed=0;
  while(pending+distance-consumed+1e-10>=interval){
    const advance=interval-pending,t=clamp((consumed+advance)/distance,0,1);
    const point=start.clone().addScaledVector(delta,t),seed=(object.seed^Math.imul((object.flySplashDrops||0)+1,0x9e3779b1))>>>0;
    const radius=spec.flySplashPaintRadius[index];
    // 11.3.0 pins the spacing, drop radius and tiered depth/width tuples. The
    // public paint API only accepts circular splats, so this path keeps the
    // sourced centre/radius and leaves the Nintendo elongated footprint as a gap.
    const paintPoint=point.clone();
    const hit=api.G.physics?.raycast?.(point,api._allSubDown ||= new api.THREE.Vector3(0,-1,0),10,api._allSubPaintHit ||= new api.Hit());
    if(hit?.hit)paintPoint.copy(hit.point).addScaledVector(hit.normal,.025);
    else paintPoint.y=Math.max(0,point.y-1.35);
    surfacePaint(api,object.owner,object.team,paintPoint,radius,seed);
    object.flySplashDrops=(object.flySplashDrops||0)+1;
    emitEvent(api,object,'fizzyFlightPaint',{x:paintPoint.x,y:paintPoint.y,z:paintPoint.z,radius,seed,index});
    consumed+=advance;pending=0;
  }
  object.flySplashDistance=Math.max(0,pending+distance-consumed);
}

function contactActor(api, object, start, end, size = .25) {
  const length = start.distanceTo(end);
  if (!(length > 1e-7) || !api.Physics?.segmentCapsuleDist) return null;
  const base = api._allSubBase ||= new api.THREE.Vector3(), res=api._allSubCapsule ||= {t:0,dist:Infinity};
  let best=null;
  { const __iwHostiles = hostileActors(api,object.owner);
    try {
      for (const target of __iwHostiles) {
    const height=target.form==='squid'?api.PLAYER.squidHeight:api.PLAYER.height;
    base.copy(target.pos);base.y+=target.smoothY||0;
    api.Physics.segmentCapsuleDist(start,end,base,api.PLAYER.radius,height,res);
    if(res.dist <= api.PLAYER.radius+size && (!best||res.t*length<best.distance)) best={actor:target,distance:res.t*length,t:res.t};
  }
    } finally { releaseHostileActors(api); }
  }
  return best;
}
function customObjectCandidate(api, projectiles, p, start, end) {
  const length=start.distanceTo(end);
  if (!(length > 1e-8) || !finite3(start)||!finite3(end)) return null;
  let best=null;
  for (const object of entityList(projectiles)) {
    syncObjectAttachment(api,object);
    // A homing Torpedo can be shot down after it has locked onto an opponent.
    // It is in the custom list rather than Projectiles.list; exclude the moving
    // object itself when its own sweep asks the shared defense hook for a result.
    if (object===p || object.dead || object.team===p.team) continue;
    const torpedoTarget=targetableTorpedo(object);
    const targetableDeployable=object.phase==='deployed'&&['splashWall','sprinkler','beakon'].includes(object.subId);
    if(!torpedoTarget&&!targetableDeployable)continue;
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
      const vx=end.x-start.x, vy=end.y-start.y, vz=end.z-start.z, denom=vx*vx+vy*vy+vz*vz, center=object.pos;
      const t=denom>1e-9?clamp(((center.x-start.x)*vx+(center.y-start.y)*vy+(center.z-start.z)*vz)/denom,0,1):0;
      const px=start.x+vx*t, py=start.y+vy*t, pz=start.z+vz*t, radius=object.subId==='torpedo'?.3:object.subId==='inkMine'?.38:.42;
      const dx=px-center.x, dy=py-center.y, dz=pz-center.z, lim=radius+(p.size||0);
      if(dx*dx+dy*dy+dz*dz>lim*lim)continue;
      const point=new api.THREE.Vector3(px,py,pz);
      hit={t,distance:t*length,point,normal:new api.THREE.Vector3(dx,dy,dz).normalize()};
    }
    if(!hit||best&&hit.distance>=best.distance)continue;
    const candidate={ ...hit, object, visualOnly:!!p.ghost, settled:false };
    candidate.onHit=()=>{
      if(candidate.settled)return 0;candidate.settled=true;
      // The deployed object's owner is the authority for its HP. A ghost round
      // may spend HP on that owner's client; the local shooter's client sends a
      // bounded proposal when it sees a remote-owned deployable.
      const amount=Number.isFinite(p.damage)?clamp(p.damage,0,2200)*objectDamageScale(p,object.subId):0;
      if(amount<=0)return 0;
      const subId=p.s3Sub?.id||p.subId;
      if((p.kind==='bomb'||p.type==='bomb')&&p.s3InkVacBomb&&['bomb','suction','curling'].includes(subId)){
        if(!p.ghost)projectiles._explodeBomb?.(p.s3InkVacBomb);
        return 0;
      }
      if(object.subId==='splashWall'&&['burst','autobomb','fizzy','torpedo'].includes(subId)){
        const center=hit.point.clone();if(p.vel?.lengthSq()>0)center.addScaledVector(p.vel.clone().normalize(),-.001);
        blast(api,p,center);
        removeObject(api,projectiles,p);
        return 0;
      }
      if(p.ghost)return 0;
      if(object.ghost){if(!p.ghost)emitObjectHit(api,object,p,hit.point,p.damage);return 0;}
      if(localOwner(object.owner)){
        object.hp-=amount;
        if(object.hp<=0)removeObject(api,projectiles,object);
        return amount;
      }
      emitObjectHit(api,object,p,hit.point,p.damage);
      return 0;
    };
    best=candidate;
  }
  return best;
}
function emitObjectHit(api, object, projectile, point, damage, cause=null) {
  const shooter=projectile?.owner&&typeof projectile.owner==='object'?projectile.owner:projectile;
  if(!localOwner(shooter)||!Number.isInteger(object.owner?.nid)||!Number.isInteger(shooter?.nid))return;
  const event={v:1,phase:'objectHit',subId:projectile?.wid||projectile?.type||projectile?.s3Sub?.id||projectile?.s3AllSpecial||'projectile',
    seq:projectile?.s3SubSeq||0,eventSeq:nextSeq(shooter),targetOwnerId:object.owner.nid,
    life:ownerLife(shooter),targetLife:object.sourceLife,targetOwnerLife:ownerLife(object.owner),targetSeq:object.seq,targetSubId:object.subId,
    damage:clamp(damage,0,2200),cause:objectDamageRow(projectile,cause),objectShredder:objectShredderEquipped(shooter),x:point.x,y:point.y,z:point.z,actor:shooter};
  api.emit?.('all:sub',event);
}
function objectHitKey(event) { return `${event.actor?.nid??event.actorId}:${event.life??ownerLife(event.actor)}:${event.eventSeq}`; }
const objectHitSeen = new Set();
const beaconResultSeen = new Set();
const statusEventSeen = new Set();
function beaconReservationKey(actor, life, reservationId) { return `${beakonActorKey(actor)}:${life}:${reservationId}`; }
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
  // S3 mix Wiki: uses are consumed on LANDING, so all teammates can select
  // the same live Beakon before the earlier arrivals exhaust it. A reservation
  // is an identity/cancellation record, not a prepaid capacity slot.
  for(const [oldKey,reservation] of object.reservations){
    if(reservation.actorKey!==beakonActorKey(actor))continue;
    if(reservation.actorLife===ownerLife(actor))return false;
    object.reservations.delete(oldKey);
  }
  const cost=actor.weapon?.sub==='beakon'?object.usesLeft:1;
  object.reservations.set(key,{actorKey:beakonActorKey(actor),actorId:actor.nid,actorLife:ownerLife(actor),cost});
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
      const owner=pending.beaconOwner||api.G.netm?.byNid?.get(pending.beaconOwnerId);
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
  if(!use||use.beaconSeq!==beacon.seq||use.beaconLife!==beacon.sourceLife||use.beaconOwner!==beacon.owner){
    actor.s3BeakonUseSeq=((actor.s3BeakonUseSeq||0)+1)%1_000_000_000;if(!actor.s3BeakonUseSeq)actor.s3BeakonUseSeq=1;
    use={beaconOwner:beacon.owner,beaconOwnerId:beacon.owner?.nid,beaconLife:beacon.sourceLife,beaconSeq:beacon.seq,reservationId:actor.s3BeakonUseSeq};
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
  const target=object||entityList(api.G.projectiles).find(o=>!o.dead&&o.owner===owner&&o.seq===event.targetSeq&&o.sourceLife===event.targetLife&&targetableTorpedo(o));
  if(!target||target.ghost)return false;
  const reach=target.subId==='splashWall'?ALL_SUB_SPECS.splashWall.wallWidth/2+1:target.subId==='torpedo'?1:1.5;
  if(target.pos.distanceTo(new api.THREE.Vector3(event.x,event.y,event.z))>reach)return false;
  target.hp-=clamp(event.damage,0,2200)*withObjectHitGear(shooter,event.objectShredder,()=>objectDamageScale(shooter,target.subId,event.cause||'Default'));
  if(target.hp<=0)removeObject(api,api.G.projectiles,target);
  return true;
}

function armToxicStatus(api, cloud, target, emit = true) {
  if(!target?.alive||target.team===cloud.team)return;
  const now=api.G.time||0, spec=cloud.spec, effectScale=subEffectScale(target,'mist');
  const speedScale=1-(1-spec.slowScale)*effectScale;
  const jumpScale=1-(1-spec.jumpScale)*effectScale;
  const until=now+2*STEP;
  cloud.toxicProgress ||= new WeakMap();
  let progress=cloud.toxicProgress.get(target);
  if(!progress){progress={level:0,count:0,elapsed:0,nextAt:frameSeconds(spec.effectLevels[0].frame),drained:0};cloud.toxicProgress.set(target,progress);}
  progress.elapsed+=STEP;
  let inkLoss=0;
  if(progress.elapsed+1e-10>=progress.nextAt){
    const total=spec.inkDrainMaxPercent*effectScale;
    inkLoss=Math.min(total-progress.drained,spec.inkDrainMaxPercent/7*effectScale);
    progress.drained+=inkLoss;
    const level=spec.effectLevels[progress.level];
    progress.count++;
    if(level.nextLevelCount>0&&progress.count>=level.nextLevelCount){progress.level=Math.min(progress.level+1,spec.effectLevels.length-1);progress.count=0;}
    progress.nextAt=progress.elapsed+frameSeconds(spec.effectLevels[progress.level].frame);
  }
  // Only the target's owning client mutates movement/ink. A local source emits
  // a short lease for remote enemies; a replayed cloud directly affects local
  // enemies so its area status remains active on the authority.
  if(!target.remote){
    target.s3 ||= {};
    target.s3.toxicMistSlowUntil=Math.max(target.s3.toxicMistSlowUntil||0,until);
    target.s3.toxicMistScale=Math.min(target.s3.toxicMistScale??1,speedScale);
    target.s3.toxicMistJumpScale=Math.min(target.s3.toxicMistJumpScale??1,jumpScale);
    if(inkLoss>0)target.ink=Math.max(0,(target.ink??100)-inkLoss);
  }
  const prev=cloud.seenToxic.get(target)||-Infinity;
  if(emit&&!cloud.ghost&&(inkLoss>0||now-prev>=.25)){
    cloud.seenToxic.set(target,now);
    if(Number.isInteger(target.nid))api.emit?.('all:sub',{v:1,phase:'status',subId:cloud.subId,seq:cloud.seq,sourceLife:cloud.sourceLife,
      eventSeq:nextSeq(cloud.owner),life:ownerLife(cloud.owner),targetId:target.nid,targetLife:ownerLife(target),status:'toxicMist',until:now+.35,
      speedScale,jumpScale,inkLoss,
      sourceTeam:cloud.team,actor:cloud.owner});
  }
}
function replayStatus(api,event) {
  const owner=event.actor||api.G.netm?.byNid?.get(event.actorId);
  const target=api.G.netm?.byNid?.get(event.targetId);
  if(!owner?.remote||ownerLife(owner)!==event.life||owner.team!==event.sourceTeam||!target||target.remote||target.team===event.sourceTeam||ownerLife(target)!==event.targetLife||
     event.subId!=='toxicMist'||event.status!=='toxicMist'||!Number.isFinite(event.until)||event.until<(api.G.time||0)||event.until>(api.G.time||0)+1)return false;
  const cloud=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===event.sourceLife&&o.subId==='toxicMist');
  if(!toxicMistContains(target,cloud))return false;
  armToxicStatus(api,cloud,target,false);
  return true;
}
function updateStatuses(api, dt) {
  for(const actor of api.G.actors||[]){
    const s=actor?.s3;if(!s)continue;
    if((s.toxicMistSlowUntil||0)<=(api.G.time||0)){delete s.toxicMistSlowUntil;delete s.toxicMistScale;delete s.toxicMistJumpScale;}
  }
}

function updateFlight(api, projectiles, object, dt) {
  const spec=object.spec;
  if(object.ghost&&object.phase==='ghostWait')return;
  if(object.subId==='torpedo'&&['torpedoRotate','torpedoWait'].includes(object.phase)){
    updateTorpedoTransform(api,object,dt);return;
  }
  if(object.subId==='fizzy'&&object.grounded){
    object.age+=dt;object.prev.copy(object.pos);
    // Recheck support so rolling off an edge pauses the ground-only fuse.
    const from=object.pos.clone().add(new api.THREE.Vector3(0,.08,0));
    const to=object.pos.clone().add(new api.THREE.Vector3(0,-.12,0));
    const floor=api.G.physics?.segment?.(from,to,projectiles._s3FizzyGroundHit ||= new api.Hit());
    if(floor?.hit&&floor.normal.y>.5){
      object.pos.y=floor.point.y+.03;
      object.fuse-=dt;
      if(object.fuse<=1e-10){if(object.ghost)object.phase='ghostWait';else burstFizzy(api,projectiles,object);return;}
      object.vel.y=0;
      object.vel.x*=Math.pow(.81,dt*60);object.vel.z*=Math.pow(.81,dt*60);
      const next=object.pos.clone().addScaledVector(object.vel,dt);
      const contact=api.G.physics?.segment?.(object.pos,next,projectiles._s3SubHit ||= new api.Hit());
      if(contact?.hit){
        object.pos.copy(contact.point).addScaledVector(contact.normal,.03);
        const vn=object.vel.dot(contact.normal);if(vn<0)object.vel.addScaledVector(contact.normal,-1.7*vn);
      }else object.pos.copy(next);
      return;
    }
    object.grounded=false;
    // The unsupported interval is airborne; do not count it a second time.
    object.age-=dt;
  }
  if(object.phase==='burstWait'){
    object.age+=dt;object.prev.copy(object.pos);object.fuse-=dt;
    if(object.fuse<=0){if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
    return;
  }
  if(object.grounded&&object.subId==='autobomb'){
    object.age+=dt;object.prev.copy(object.pos);
    let target=object.autobombTarget;
    if(target&&!target.alive){object.autobombTarget=null;armAutobombBurst(object,spec.unfindBurstWaitFrames);return;}
    if(!target&&object.age>=frameSeconds(spec.findRotateFrames)){
      target=closestActor(api,object,spec.chaseRadius,true)?.actor||null;
      if(target)object.autobombTarget=target;
      else {armAutobombBurst(object,spec.noTargetBurstWaitFrames);return;}
    }
    if(target&&object.age>=frameSeconds(spec.chaseMovement.beforeRotateFrames)){
      const distance=target.pos.distanceTo(object.pos);
      if(distance<=spec.chaseMovement.approachDistance){armAutobombBurst(object,spec.approachBurstWaitFrames);return;}
      object.chasedTarget=true;object.chaseAge=(object.chaseAge||0)+dt;
      steerAutobomb(object,target,dt,false);object.pos.x+=object.vel.x*dt;object.pos.z+=object.vel.z*dt;
      if(object.chaseAge>=spec.chaseSeconds)armAutobombBurst(object,spec.chaseBurstWaitFrames);
    }
    if(object.mesh){object.mesh.position.copy(object.pos);object.mesh.rotation.y=object.yaw||0;}
    return;
  }
  if(object.grounded&&object.subId==='torpedo'){
    const floor=api.G.physics?.segment?.(object.pos.clone().add(new api.THREE.Vector3(0,.08,0)),
      object.pos.clone().add(new api.THREE.Vector3(0,-.12,0)),projectiles._s3TorpedoGroundHit ||= new api.Hit());
    if(floor?.hit&&floor.normal.y>.5){
      object.age+=dt;object.prev.copy(object.pos);object.pos.y=floor.point.y+.03;object.fuse-=dt;
      if(object.fuse<=1e-10){if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}return;}
      const drag=Math.pow(1-spec.groundPositionAirResist,dt*60);
      object.vel.y=0;object.vel.x*=drag;object.vel.z*=drag;
      const next=object.pos.clone().addScaledVector(object.vel,dt);
      const wall=api.G.physics?.segment?.(object.pos,next,projectiles._s3SubHit ||= new api.Hit());
      if(wall?.hit){object.pos.copy(wall.point).addScaledVector(wall.normal,.03);reboundTorpedo(object,wall.normal);}
      else object.pos.copy(next);
      return;
    }
    object.grounded=false;
  }
  object.age+=dt;object.prev.copy(object.pos);
  if(object.subId==='torpedo'){
    if(object.phase==='chase'){
      object.chaseAge=(object.chaseAge||0)+dt;
      if(object.chaseAge+1e-10>=spec.chaseSeconds){
        if(object.ghost)object.phase='ghostWait';else{blast(api,object,object.pos);removeObject(api,projectiles,object);}
        return;
      }
    }else if(!object.ghost&&!object.torpedoSearchDisabled&&object.age+1e-10>=frameSeconds(spec.findStartFrames)){
      const target=findTorpedoTarget(api,object);
      if(target){captureTorpedo(api,object,target);return;}
    }
  }
  // Zero gravity preserves the pitched launch velocity. Clearing y here made
  // Angle Shooter incapable of hitting above or below its release height.
  if(!(object.subId==='torpedo'&&object.phase==='chase')){
    object.vel.y-=spec.gravity*dt;
    applyFlightPositionAirResist(object,dt);
  }
  object.pos.addScaledVector(object.vel,dt);
  let world=api.G.physics?.segment?.(object.prev,object.pos,projectiles._s3SubHit ||= new api.Hit());
  const standRadius=object.subId==='angleShooter'?spec.collisionRadius:.2;
  const stand=coolerSegmentContact(projectiles,object.prev,object.pos,standRadius);
  if(stand&&(!world?.hit||stand.distance<world.dist))world={hit:true,point:stand.point,normal:stand.normal,dist:stand.distance,s3Tacticooler:true};
  const actor=['toxicMist','fizzy','splashWall','beakon'].includes(object.subId)?null:contactActor(api,object,object.prev,object.pos,object.subId==='angleShooter'?spec.collisionRadius:.22);
  // The native defense lane uses the projectile record it receives for both
  // hit arbitration and Ink Vac's one-shot consume marker. Keep this record
  // persistent across the candidate call so an accepted inhale disables the
  // actual custom projectile, and so an authenticated replica proposal retains
  // the sub id. This object is in _s3SubObjects (not Projectiles.list), so the
  // native integrator will not query it recursively.
  const defenseDamage=object.subId==='angleShooter'?spec.directDamage:object.subId==='fizzy'?spec.objectDamage:spec.damageMax||0;
  object.damage=defenseDamage;object.size=.2;object.type='sub';
  object.s3Sub ||= {id:object.subId};
  object.s3InkVacBomb=object;
  const defense=projectiles.kitDefenseCandidate?.(object);
  const defenseDistance=defense?.distance??Infinity, actorDistance=actor?.distance??Infinity;
  const worldDistance=world?.hit?world.dist:Infinity;
  if(object.subId==='angleShooter'){
    const length=object.prev.distanceTo(object.pos),distance=Math.min(length,defenseDistance,actorDistance,worldDistance);
    const end=length>0?object.prev.clone().lerp(object.pos,clamp(distance/length,0,1)):object.pos;
    appendAngleLine(api,projectiles,object,object.prev,end);
  }
  if(defense&&defenseDistance<=Math.min(worldDistance,actorDistance)){
    object.pos.copy(defense.point||object.pos);defense.onHit?.();
    // A defense contact consumes the thrown object. Angle Shooter still bounces
    // from ordinary surfaces and actors below; a Vac, dome, or deployable shield
    // is an interception and must not let the same projectile continue next tick.
    removeObject(api,projectiles,object);
    return;
  }
  if(actor&&actorDistance<worldDistance){
    object.pos.lerpVectors(object.prev,object.pos,actor.t);
    if(object.ghost){object.phase='ghostWait';return;}
    if(!object.ghost){
      const amount=object.subId==='angleShooter'||object.subId==='burst'?spec.directDamage:0;
      if(object.subId==='burst'&&amount>0)object.directTarget=actor.actor;
      if(amount>0)api.G.projectiles?.applyHit?.(object.owner,actor.actor,amount,object.subId);
      if(object.subId==='burst'){
        object.phase='burstWait';object.fuse=frameSeconds(spec.contactBurstDelayFrames);object.vel.set(0,0,0);
        return;
      }
      if(object.subId==='angleShooter'){
        markAngleTarget(api,object,actor.actor);
        surfacePaint(api,object.owner,object.team,object.pos,spec.directPaintRadius,object.seed);
      }
    }
    if(['inkMine','toxicMist','splashWall','sprinkler','beakon'].includes(object.subId)){
      object.pos.y=actor.actor.pos.y;
      deploy(api,projectiles,object,object.pos);
      return;
    }
    // Wiki Line Marker: a direct player hit terminates the projectile/line.
    // Only terrain can reflect it; reflecting off a player allowed a second
    // unsupported 40-damage hit on the return path.
    if(object.subId==='angleShooter'){finishAngleFlight(api,object);return;}
    blast(api,object,object.pos);
    removeObject(api,projectiles,object);return;
  }
  if(world?.hit){
    object.pos.copy(world.point).addScaledVector(world.normal,world.s3Tacticooler?standRadius+.03:.03);
    // Replicas may mirror pure terrain flight (including Cooler reflection),
    // but deployments and detonations still wait for the owner's event.
    const visualBounce=object.subId==='angleShooter'||object.subId==='fizzy'||
      object.subId==='torpedo'&&!object.chasedTarget||object.subId==='splashWall'&&world.normal.y<=.5;
    if(object.ghost&&!visualBounce){object.phase='ghostWait';return;}
    if(object.subId==='angleShooter'){
      const normal=world.normal,vn=object.vel.dot(normal),speed=object.vel.length(),ground=normal.y>.5;
      const angleRate=ground?spec.reboundGroundAngleRate:spec.reboundWallAngleRate;
      const speedRate=ground?spec.reboundGroundSpeedRate:spec.reboundWallSpeedRate;
      const tangent=object.vel.clone().addScaledVector(normal,-vn),tangentSpeed=tangent.length();
      // Ground reflection flattens the elevation relative to the struck plane;
      // applying ordinary specular reflection to a slope launched the dart up.
      if(tangentSpeed>1e-10){
        const angle=Math.atan2(Math.abs(vn),tangentSpeed)*angleRate;
        object.vel.copy(tangent).multiplyScalar(Math.cos(angle)*speed*speedRate/tangentSpeed)
          .addScaledVector(normal,Math.sin(angle)*speed*speedRate);
      }else object.vel.addScaledVector(normal,-2*vn).multiplyScalar(speedRate);
      object.bounceCount++;
      if(!object.ghost){
        surfacePaint(api,object.owner,object.team,object.pos,spec.paintRadius,object.seed^object.bounceCount);
        emitEvent(api,object,'bounce',{bounceCount:object.bounceCount});
      }
      if(object.age+1e-10>=frameSeconds(spec.flightFrames))finishAngleFlight(api,object);
      return;
    }
    if(object.subId==='fizzy'){
      if(world.normal.y>.5){object.grounded=true;object.vel.y=0;}
      else {const vn=object.vel.dot(world.normal);if(vn<0)object.vel.addScaledVector(world.normal,-1.7*vn);}
      return;
    }
    if(object.subId==='splashWall'&&world.normal.y<=.5){
      const vn=object.vel.dot(world.normal);if(vn<0)object.vel.addScaledVector(world.normal,-2*vn);
      return;
    }
    if(object.subId==='inkMine'||object.subId==='toxicMist'||object.subId==='splashWall'||object.subId==='sprinkler'||object.subId==='beakon'){
      deploy(api,projectiles,object,object.pos,world.normal,world.block);
      if(object.subId==='inkMine')object.activeAt=api.G.time+spec.armSeconds;
      return;
    }
    if(object.subId==='autobomb'||object.subId==='torpedo'){
      if(object.subId==='torpedo'){
        if(object.chasedTarget){blast(api,object,object.pos);removeObject(api,projectiles,object);return;}
        object.torpedoSearchDisabled=true;
        if(world.normal.y<=.5){reboundTorpedo(object,world.normal);return;}
        if(!object.torpedoGroundFuseStarted){object.fuse=spec.burstSeconds;object.torpedoGroundFuseStarted=true;}
      }
      object.vel.y=0;object.phase='flight';object.grounded=true;object.pos.y=world.point.y+.03;
      return;
    }
    blast(api,object,object.pos);removeObject(api,projectiles,object);return;
  }
  const flightLimit=object.subId==='angleShooter'?frameSeconds(spec.flightFrames):
    object.subId==='autobomb'?spec.noTargetSeconds:object.subId==='torpedo'?Math.max(2.2,spec.chaseSeconds||0):spec.maxFlightSeconds||2.2;
  if(!(object.subId==='torpedo'&&object.chasedTarget)&&object.age+1e-10>=flightLimit){
    if(object.subId==='angleShooter'){finishAngleFlight(api,object);return;}
    if(object.ghost){object.phase='ghostWait';return;}
    // Safety retirement is not a collision. Burst Bomb is contact-triggered;
    // an unlanded Autobomb cannot manufacture an airborne explosion either.
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
  object.grounded=false;
  object.fuse=frameSeconds(object.spec.burstWaitFrames[Math.min(2,index+1)]||1);
  const direction=new api.THREE.Vector3(object.vel.x,0,object.vel.z);
  if(direction.lengthSq()<1e-6)direction.set(Math.sin(object.yaw),0,Math.cos(object.yaw));
  direction.normalize();object.pos.addScaledVector(direction,.62);
  const hop=object.spec.hop,high=object.popLimit>=3;
  const velocity=high?hop.highVelocity:hop.lowVelocity,pitch=(high?hop.highPitchDeg:hop.lowPitchDeg)*Math.PI/180;
  object.vel.x=direction.x*velocity*Math.cos(pitch);object.vel.z=direction.z*velocity*Math.cos(pitch);object.vel.y=velocity*Math.sin(pitch);
  emitEvent(api,object,'fizzyHop',{pops:object.pops,fuse:object.fuse});
}
function updateDeployed(api,projectiles,object,dt){
  const {G}=api,spec=object.spec;
  object.age+=dt;
  if(object.subId==='sprinkler'&&!object.owner?.alive){removeObject(api,projectiles,object);return;}
  const expired=(G.time||0)>=object.expireAt;
  if(expired&&object.subId!=='toxicMist'){removeObject(api,projectiles,object);return;}
  if(object.subId==='splashWall'){
    // Adapters/tests may restore a deployed wall directly from a replay or a
    // save without passing the local deploy constructor. Initialize the decay
    // baseline once from the authoritative initial HP in either path.
    object.wallHpInitial??=object.hp;
    object.wallContactUntil ||= new WeakMap();
    object.hp=Math.max(0,object.hp-object.wallHpInitial/spec.hpDecayFrames*60*dt);
    if(object.hp<=0){removeObject(api,projectiles,object);return;}
    if((G.time||0)>=object.activeAt){
      const nX=Math.sin(object.yaw||0),nZ=Math.cos(object.yaw||0),rX=Math.cos(object.yaw||0),rZ=-Math.sin(object.yaw||0),now=G.time||0;
      { const __iwHostiles = hostileActors(api,object.owner);
        try {
          for (const target of __iwHostiles) {
        const dx=target.pos.x-object.pos.x,dz=target.pos.z-object.pos.z;
        const side=Math.abs(dx*rX+dz*rZ),depth=Math.abs(dx*nX+dz*nZ),feet=target.pos.y;
        if(side>spec.wallWidth/2+api.PLAYER.radius||depth>.32||feet>object.pos.y+spec.wallHeight||feet+api.PLAYER.height<object.pos.y)continue;
        const ready=object.wallContactUntil.get(target)||-Infinity;
        if(now+1e-10<ready)continue;
        api.G.projectiles?.applyHit?.(object.owner,target,spec.contactDamage,'splashWall');
        object.wallContactUntil.set(target,now+frameSeconds(spec.damageSpanFrames));
      }
        } finally { releaseHostileActors(api); }
      }
    }
  }
  if(object.subId==='inkMine'){
    if((G.time||0)<object.activeAt)return;
    if(object.ghost)return;
    const hostiles=hostileActors(api,object.owner);
    let found;
    try {
      found=hostiles.find(a=>{
        const dx=a.pos.x-object.pos.x,dy=a.pos.y+.7-object.pos.y,dz=a.pos.z-object.pos.z;
        return dx*dx+dy*dy+dz*dz<=spec.sensorRadius**2 && (!G.physics?.los||G.physics.los(object.pos,a.pos));
      });
    } finally { releaseHostileActors(api); }
    if(found||enemyInkNearMine(api,object))detonateInkMine(api,projectiles,object);
  } else if(object.subId==='toxicMist'){
    { const __iwHostiles = hostileActors(api,object.owner);
      try {
        for (const target of __iwHostiles) {
      const dx=target.pos.x-object.pos.x,dy=target.pos.y+.7-object.pos.y,dz=target.pos.z-object.pos.z;
      if(dx*dx+dy*dy+dz*dz<=spec.radius**2&&(!G.physics?.los||G.physics.los(object.pos,target.pos)))armToxicStatus(api,object,target,true);
    }
      } finally { releaseHostileActors(api); }
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
        const victim=contactActor(api,object,object.pos,point,spec.dropletHitRadius);
        if(victim)api.G.projectiles?.applyHit?.(object.owner,victim.actor,spec.dropletDamage,'sprinkler');
        emitEvent(api,object,'sprinklerDrop',{x:point.x,y:point.y,z:point.z,radius:spec.paintRadius,seed,drop});
      }
    }
  }
  if(expired){removeObject(api,projectiles,object);return;}
  // poseVisual turns each model; deployed walls keep the yaw used by barrier contact.
  if(object.mesh)object.mesh.position.copy(object.pos);
}

function tickObjects(api,projectiles,dt){
  // Advance detached children before parent contacts can emit a new set. A
  // just-born drop cannot move/explode a frame before its own birth.
  stepTorpedoSplashes(api,projectiles,dt,(drop,pos)=>burstTorpedoSplash(api,drop,pos));
  // Activation/hits can synchronously retire another entry. Snapshot births
  // once so removing an earlier sibling cannot advance this object twice.
  const list=entityList(projectiles).slice();
  for(let i=list.length-1;i>=0;i--){
    const o=list[i];if(o.dead||o.phase==='ghostWait')continue;
    syncObjectAttachment(api,o);
    if(o.subId==='sprinkler'&&!o.owner?.alive){removeObject(api,projectiles,o);continue;}
    if(o.phase==='wallPending'){
      o.age+=dt;
      if(o.age+1e-10>=o.wallReadyAge)activateSplashWall(api,projectiles,o);
    }
    else if(o.phase==='deployed')updateDeployed(api,projectiles,o,dt);
    else if(o.phase==='line')updateAngleLine(api,projectiles,o,dt);
    else updateFlight(api,projectiles,o,dt);
    if(!o.dead&&o.phase!=='ghostWait')poseVisual(api,o,dt);
  }
  updateStatuses(api,dt);
}

function replaySpawn(api,event,owner,report){
  // Sprinkler uses native bomb birth/ghost packets. Do not revive the retired
  // catalogue authority alongside that device, including for old peers.
  if(event.subId==='sprinkler')return false;
  if(!owner?.remote||!api.G.projectiles||event.life!==ownerLife(owner)||event.sourceLife!==event.life||!ALL_SUB_SPECS[event.subId])return false;
  const list=entityList(api.G.projectiles);
  const old=list.find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===event.sourceLife);
  if(old){report?.('reused',old);return true;}
  if(![event.x,event.y,event.z,event.vx,event.vy,event.vz,event.charge].every(Number.isFinite)||
     !Number.isSafeInteger(event.seed)||!Number.isSafeInteger(event.seq)||event.seq<=0)return false;
  const created=createObject(api,api.G.projectiles,owner,event.subId,{...event,ghost:true});
  if(created)report?.('created',created);
  return !!created;
}
function replayDeploy(api,event,owner){
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
  if(!object||!finite3({x:event.x,y:event.y,z:event.z}))return false;
  deploy(api,api.G.projectiles,object,new api.THREE.Vector3(event.x,event.y,event.z));
  if(Number.isFinite(event.yaw))object.yaw=event.yaw;
  if(['splashWall','inkMine','beakon'].includes(object.subId))object.s3SurfaceAttachment=replayTowerAttachment(api.G,object,event);
  syncObjectAttachment(api,object);
  if(Number.isFinite(event.activeIn)){
    const delay=clamp(event.activeIn,0,5);object.activeAt=(api.G.time||0)+delay;
    if(object.phase==='wallPending')object.wallReadyAge=object.age+delay;
  }
  if(Number.isFinite(event.lifeSeconds))object.expireAt=(api.G.time||0)+clamp(event.lifeSeconds,0,60);
  if(object.subId==='beakon'&&Number.isInteger(event.usesLeft))object.usesLeft=clamp(event.usesLeft,0,2);
  replaceVisual(api,object);return true;
}
function replayMark(api,event,owner){
  const target=api.G.netm?.byNid?.get(event.targetId);
  const birth=owner&&api.G.projectiles&&markBirthState(api,api.G.projectiles,owner)?.entries.get(markBirthKey(event));
  if(!owner?.remote||!target||target.team===owner.team||ownerLife(target)!==event.targetLife||
    !['inkMine','angleShooter'].includes(event.subId)||!birth||
    !Number.isSafeInteger(event.frames)||event.frames!==birth.frames)return false;
  const elapsed=event.markAgeFrames??0;
  if(!Number.isSafeInteger(elapsed)||elapsed<0||
    event.subId!=='angleShooter'&&elapsed!==0||
    event.subId==='angleShooter'&&elapsed>ALL_SUB_SPECS.angleShooter.flightFrames+ALL_SUB_SPECS.angleShooter.tailFrames)return false;
  return applyMark(api,target,owner.team,Math.max(0,event.frames-elapsed)/60,event.subId);
}
function replayExpire(api,event,owner){
  // Owner retirement is ordered after its marks. Local visual retirement is not.
  markBirthState(api,api.G.projectiles,owner)?.entries.delete(markBirthKey(event));
  const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
  if(!object)return false;removeObject(api,api.G.projectiles,object,true);return true;
}

/**
 * Replays one parent-validated `all:sub` event. Ghost sub objects are
 * presentation-only for attack consequences: they never paint, damage, spend
 * object HP or emit another packet. A replayed Mist volume is also sampled by
 * the local victim's movement/ink authority; remote victims are never mutated.
 */
export function replaySub(api,event,report){
  if(!api?.G||!event||event.v!==1||typeof event.phase!=='string')return false;
  if(event.phase==='nativeObjectHit'||event.phase==='nativeObjectState')return replayNativeSprinklerDamage(api,event);
  if(event.phase==='objectHit')return applyRemoteObjectHit(api,event);
  if(event.phase==='status')return replayStatus(api,event);
  if(event.phase==='beakonUseProposal')return applyBeaconProposal(api,event);
  const owner=event.actor||api.G.netm?.byNid?.get(event.actorId);
  if(!owner?.remote||!Number.isSafeInteger(event.seq)||event.seq<=0||!Number.isSafeInteger(event.life)||ownerLife(owner)!==event.life)return false;
  if(event.phase==='spawn')return replaySpawn(api,event,owner,report);
  if(event.phase==='deploy')return replayDeploy(api,event,owner);
  if(event.phase==='mark')return replayMark(api,event,owner);
  // Only ordered native paint rows may change ownership. A stale legacy drop
  // must never repaint over a newer enemy stroke or invent an expanded radius.
  if(event.phase==='sprinklerDrop')return false;
  if(event.phase==='beakonUses')return replayBeaconUses(api,event,owner);
  if(event.phase==='expire'||event.phase==='destroy')return replayExpire(api,event,owner);
  if(event.phase==='fizzyHop'){
    const object=entityList(api.G.projectiles).find(o=>!o.dead&&o.ghost&&o.owner===owner&&o.subId==='fizzy'&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object||![event.x,event.y,event.z,event.vx,event.vy,event.vz,event.fuse].every(Number.isFinite)||
      !Number.isInteger(event.pops)||event.pops<1||event.pops!==object.pops-1||
      event.fuse!==frameSeconds(object.spec.burstWaitFrames[object.popLimit-event.pops]||1))return false;
    object.pos.set(event.x,event.y,event.z);object.prev.copy(object.pos);object.vel.set(event.vx,event.vy,event.vz);
    object.phase='flight';object.grounded=false;object.age=0;object.pops=event.pops;object.fuse=event.fuse;
    return true;
  }
  if(event.phase==='torpedoLock'||event.phase==='torpedoLaunch'){
    const object=entityList(api.G.projectiles).find(o=>!o.dead&&o.ghost&&o.owner===owner&&o.subId==='torpedo'&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object||![event.x,event.y,event.z,event.vx,event.vy,event.vz].every(Number.isFinite))return false;
    if(event.phase==='torpedoLock'){
      if(object.chasedTarget)return false;
      object.pos.set(event.x,event.y,event.z);object.prev.copy(object.pos);object.vel.set(0,0,0);
      object.phase='torpedoRotate';object.grounded=false;object.chasedTarget=true;object.torpedoStageAge=0;
      spawnTorpedoSplashes(api,api.G.projectiles,object,object.pos,'find');
    }else{
      if(!object.chasedTarget||!['torpedoRotate','torpedoWait'].includes(object.phase))return false;
      object.pos.set(event.x,event.y,event.z);object.prev.copy(object.pos);object.vel.set(event.vx,event.vy,event.vz);
      object.phase='chase';object.grounded=false;object.chaseAge=0;object.torpedoLaunchReplayed=true;
    }
    return true;
  }
  if(event.phase==='burst'){
    const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object)return false;
    if(object.subId==='fizzy'){
      const index=object.fizzyBurstReplayed||0;
      if(!Number.isSafeInteger(event.burstIndex)||event.burstIndex!==index||index>=object.popLimit)return false;
      object.fizzyBurstReplayed=index+1;
    }
    if(object.subId==='torpedo'){
      // A chased replica must receive its native launch before its terminal burst.
      // ghostWait is legal after replica contact; rolled, unchased bombs need no launch.
      if(object.torpedoBurstReplayed||object.chasedTarget&&!object.torpedoLaunchReplayed||
        ![event.x,event.y,event.z].every(Number.isFinite))return false;
      object.torpedoBurstReplayed=true;
    }
    if([event.x,event.y,event.z].every(Number.isFinite))object.pos.set(event.x,event.y,event.z);
    const spec=object.subId==='fizzy'?object.spec.bursts[Math.min(2,event.burstIndex||0)]:object.spec;
    if(object.subId==='torpedo'&&object.chasedTarget)spawnTorpedoSplashes(api,api.G.projectiles,object,object.pos);
    if(object.subId==='fizzy')spawnFizzySplashes(api,api.G.projectiles,object,object.pos,event.burstIndex);
    api.G.fx?.explosion?.(object.pos,api.G.teamColors?.[object.team],spec.radius||spec.damageOuter||2);
    object.phase='ghostWait';
    return true;
  }
  if(event.phase==='fizzyHop'||event.phase==='bounce'){
    const object=entityList(api.G.projectiles).find(o=>o.owner===owner&&o.seq===event.seq&&o.sourceLife===(event.sourceLife??event.life));
    if(!object||![event.x,event.y,event.z,event.vx,event.vy,event.vz].every(Number.isFinite))return false;
    object.pos.set(event.x,event.y,event.z);object.vel.set(event.vx,event.vy,event.vz);
    if(event.phase==='fizzyHop')object.age=0;
    object.phase='flight';
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
    const costCurve=SUB_INK_SAVE_CURVES[id];
    const previous=SUB[id]||{};
    SUB[id]={...base,...previous,id,inkCostFallback:base.inkCost,
      inkSaverCurve:costCurve};
  }
  return SUB;
}

export function installAllSubs(api,profile={}){
  const {SUB,Projectiles,WeaponRunner,Actor,G}=api;
  if(!SUB||!Projectiles||!WeaponRunner||!G||!api.THREE)throw new Error('all subs require the composed Projectiles, WeaponRunner and game context');
  if(Projectiles.prototype[INSTALL])return api;
  configureToxicMist(api);
  registerSpecs(api,profile);
  // Specials and native attack AoEs use this boundary to hit deployed custom
  // sub devices. Keep this entry point sub-only: the all-subs blast path below
  // explicitly adds special devices once, while all-specials owns its own list.
  Projectiles.prototype.s3DamageSubObjects=function(attack,center,radius,damageAtDistance,cause=null,options={}){
    if(!center?.isVector3||!(radius>0)||typeof damageAtDistance!=='function')return false;
    damageSubObjectsInRadius(api,this,attack,center,radius,damageAtDistance,cause,false,options);
    return true;
  };
  const nativeBombExplode=Projectiles.prototype._explodeBomb;
  if(nativeBombExplode)Projectiles.prototype._explodeBomb=function(bomb,...args){
    const result=nativeBombExplode.call(this,bomb,...args);
    damageNativeBombObjects(api,this,bomb);
    return result;
  };
  const nativeThrow=Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb=function(actor,...args){
    const id=actor?.weapon?.sub;
    // #1188: Sprinkler/Autobomb already have complete source-aware native
    // Projectiles.bombs lifecycles, collision, paint, and ghost-wire handling.
    // Do not create a second independent _s3SubObjects authority for them.
    // Other catalogue-only sub weapons continue through this overlay.
    if(!ALL_SUB_SPECS[id]||id==='sprinkler'||id==='autobomb')
      return nativeThrow.call(this,actor,...args);
    if(actor?.remote||!actor?.alive)return undefined;
    if(id==='inkMine')for(const placed of entityList(this))syncObjectAttachment(api,placed);
    if(id==='torpedo'&&hasActiveTorpedo(this,actor))return undefined;
    if(id==='inkMine'&&!canPlaceInkMine(this,actor,G.level))return undefined;
    if(id==='beakon'&&(!actor.grounded||!finite3(actor.pos)))return undefined;
    const runner=actor.weaponRunner;
    const hold=runner?.s3SubHold||0;
    const release=runner?.s3Release;
    const placedAtFeet=id==='inkMine'||id==='beakon';
    const placement=placedAtFeet?{x:actor.pos.x,y:actor.pos.y,z:actor.pos.z,vx:0,vy:0,vz:0}:{};
    const object=createObject(api,this,actor,id,{hold,charge:Math.min(1,hold/(ALL_SUB_SPECS[id].maxChargeTime||1)),...placement});
    if(object&&placedAtFeet)deploy(api,this,object,object.pos,actor.ground?.normal);
    if(runner){runner.s3SubHold=0;if(id==='fizzy')runner.s3FizzyCharge=null;}
    return object;
  };

  // Native WeaponRunner owns ink payment and release timing. Suppress a second
  // Torpedo before the runner reaches that payment site while the first remains
  // in flight; the throw hook above also guards direct calls that bypass inputs.
  const nativeRunnerUpdate=WeaponRunner.prototype.update;
  const nativeRunnerReset=WeaponRunner.prototype.reset;
  if(nativeRunnerReset)WeaponRunner.prototype.reset=function(...args){this.s3FizzyCharge=null;return nativeRunnerReset.apply(this,args);};
  WeaponRunner.prototype.update=function(dt,input,...args){
    const actor=this.a;
    if(actor?.weapon?.sub==='inkMine'&&G.projectiles)for(const placed of entityList(G.projectiles))syncObjectAttachment(api,placed);
    if(!actor?.remote&&(
      actor?.weapon?.sub==='torpedo'&&hasActiveTorpedo(G.projectiles,actor)||
      actor?.weapon?.sub==='inkMine'&&!canPlaceInkMine(G.projectiles,actor,G.level)||
      actor?.weapon?.sub==='beakon'&&(!actor.grounded||!finite3(actor.pos)))){
      this.s3FizzyCharge=null;
      this.s3SubHold=0;this.s3SubReady=null;this.aimingSub=false;
      const suppressed=input?{...input,sub:false,subReleased:false}:input;
      return nativeRunnerUpdate.call(this,dt,suppressed,...args);
    }
    if(actor?.weapon?.sub!=='fizzy'||actor.remote){
      if(this.s3FizzyCharge){this.s3FizzyCharge=null;this.s3SubHold=0;}
      return nativeRunnerUpdate.call(this,dt,input,...args);
    }
    const intent=actor.intent||{},move=intent.move||{},yaw=actor.aimYaw||0,pitch=actor.aimPitch||0;
    const mx=move.x||0,mz=move.z||0,mag=Math.hypot(mx,mz),jump=!!intent.jump;
    let state=this.s3FizzyCharge;
    if(!state)this.s3FizzyCharge=state={jump:false,moveX:0,moveZ:0,moveMag:0,yaw,pitch,queue:0,aimCooldown:0};
    const held=!!input?.sub;
    const previousHold=this.s3SubHold||0;
    let drained=0;
    if((previousHold>0||this.aimingSub||this.s3SubReady?.pending)&&
        (held||input?.subReleased||this.s3SubReady?.pending)&&dt>0&&Number.isFinite(dt)){
      drained=Math.min(state.queue,FIZZY_ACCEL.drainPerSecond*dt);
      state.queue-=drained;this.s3SubHold=previousHold+drained/60;
    }
    const result=nativeRunnerUpdate.call(this,dt,input,...args);
    const admitted=held&&dt>0&&(this.s3SubHold||0)>previousHold+drained/60+1e-10;
    state.aimCooldown=Math.max(0,state.aimCooldown-Math.max(0,dt||0));
    if(admitted){
      if(jump&&!state.jump)state.queue=Math.min(FIZZY_ACCEL.queue,state.queue+FIZZY_ACCEL.jump);
      if(mag>FIZZY_ACCEL.moveDeadzone&&
          (state.moveMag<=FIZZY_ACCEL.moveDeadzone||
           (mx*state.moveX+mz*state.moveZ)/(mag*state.moveMag)<FIZZY_ACCEL.turnDot))
        state.queue=Math.min(FIZZY_ACCEL.queue,state.queue+FIZZY_ACCEL.stick);
      if(dt>0&&Number.isFinite(dt)){
        const dyaw=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));
        if(Math.hypot(dyaw,pitch-state.pitch)/dt>=FIZZY_ACCEL.aimRate&&state.aimCooldown<=0){
          state.queue=Math.min(FIZZY_ACCEL.queue,state.queue+FIZZY_ACCEL.aim);state.aimCooldown=FIZZY_ACCEL.aimCooldown;
        }
      }
      // Wiki's queued bonuses begin on the input frame itself. Existing queue
      // credit consumed above still shares this frame's 2.5F/source-frame cap.
      const immediate=Math.min(state.queue,Math.max(0,FIZZY_ACCEL.drainPerSecond*dt-drained));
      state.queue-=immediate;this.s3SubHold+=immediate/60;
    }
    state.jump=jump;state.moveX=mx;state.moveZ=mz;state.moveMag=mag;state.yaw=yaw;state.pitch=pitch;
    if(!held&&!input?.subReleased&&!this.s3SubReady?.pending&&!this.aimingSub){
      if(!this.s3SubHold)this.s3FizzyCharge=null;
      else state.queue=0;
    }
    return result;
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
    clearTorpedoSplashes(this);
    for(const object of [...this._s3SubObjects||[]])removeObject(api,this,object,true);
    this._s3SubObjects=[];this._s3SubAccumulator=0;
    markBirths.delete(this);
    api.G.s3Beakons=[];
    for(const actor of api.G.actors||[])if(actor?.s3){delete actor.s3.toxicMistSlowUntil;delete actor.s3.toxicMistScale;delete actor.s3.toxicMistJumpScale;}
    objectHitSeen.clear();beaconResultSeen.clear();statusEventSeen.clear();
    return nativeClear.apply(this,args);
  };

  // Reuse the existing Bubbler/Ink Vac first-contact lane. Splash Wall blocks
  // hostile sweeps; source-mapped destructible sub targets are Sprinkler,
  // Beakon and a locked Torpedo. Ink Mine targetability is unverified.
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
    return nativeMove.apply(this,args)*toxicMistScale(this.a);
  };

  const nativeMovementStep=Actor?.prototype?._integrateMovementStep;
  if(nativeMovementStep)Actor.prototype._integrateMovementStep=function(dt,isSquid,jumped,...args){
    const s=this.s3;
    if(jumped&&s?.toxicMistSlowUntil>(G.time||0)&&this.vel){
      this.vel.y*=s.toxicMistJumpScale||ALL_SUB_SPECS.toxicMist.jumpScale;
    }
    return nativeMovementStep.call(this,dt,isSquid,jumped,...args);
  };

  api.replaySub=event=>replaySub(api,event);
  api.getSubBeakons=(team=null)=>entityList(G.projectiles).filter(o=>{syncObjectAttachment(api,o);return !o.dead&&o.subId==='beakon'&&o.phase==='deployed'&&o.usesLeft>0&&(team===null||o.team===team);});
  api.useSubBeakon=(actor,beacon,stage='land')=>useSubBeakon(api,actor,beacon,stage);
  Object.defineProperty(Projectiles.prototype,INSTALL,{value:true,configurable:false});
  return api;
}

export default installAllSubs;
