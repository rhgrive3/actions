// INKWAVE policy: distribute fractional SpawnNum over accepted shot ordinals,
// matching the existing InkFlight accumulator. The pinned number alone does
// not establish Nintendo's ordering, initial phase or reset behavior.
export function catalogFractionalSplashCount(value, ordinal) {
  if (!(Number.isFinite(value) && value >= 0) || !Number.isSafeInteger(ordinal) || ordinal < 0)
    throw new RangeError('Invalid source fractional splash count / shot ordinal');
  return Math.max(0,Math.floor((ordinal+1)*value+1e-9)-Math.floor(ordinal*value+1e-9));
}

// SplitNum staggers each shot's first detached splash through one
// SpawnBetweenLength interval, so sustained fire fills the whole line; the
// SplitNum-th (and ForceSpawnNearestAddNumArray) shot releases at the nearest
// distance. Same rule as the native shooter planner (inkFlight.js splashPlan).
// Without it every added shooter released at SpawnNearestLength + k*spacing on
// every shot: a Jet Squelcher (1.0 + k*10.0) left the floor between ~4 m and
// ~10 m unpainted under sustained fire, unlike the native Splattershot.
// One nearest/feet splash belongs to the round's ordinary release budget.
// The same shot ordinal must decide both its release distance and its radius.
export function catalogSplashNearestSlot(spawn, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError('Invalid splash shot ordinal');
  const split = spawn?.SplitNum;
  if (!Number.isInteger(split) || split < 1) return false;
  const slot = sequence % split + 1;
  const force = Array.isArray(spawn.ForceSpawnNearestAddNumArray) ? spawn.ForceSpawnNearestAddNumArray : null;
  return slot === split || (force !== null && force.includes(slot));
}

export function catalogSplashRadius(descriptor, index) {
  return index === 0 && descriptor.splashNearest && Number.isFinite(descriptor.splashNearestRadius) &&
    descriptor.splashNearestRadius > 0 ? descriptor.splashNearestRadius : descriptor.splashRadius;
}

export function catalogSplashFirst(spawn, sequence, nearestSlot) {
  const nearest = Number.isFinite(spawn?.SpawnNearestLength) ? Math.max(0, spawn.SpawnNearestLength) : 1;
  const spacing = spawn?.SpawnBetweenLength, split = spawn?.SplitNum;
  if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isInteger(split) || split < 1 ||
      !(Number.isFinite(spacing) && spacing > 0)) return nearest;
  const ordinal = sequence % split + 1;
  return (nearestSlot ?? catalogSplashNearestSlot(spawn, sequence)) ? nearest : nearest + spacing * (split - ordinal) / split;
}

import { SPLASH_SHOOTER_PAINT_DEFAULTS, SPLASH_SHOOTER_SPAWN_DEFAULTS, SPLASH_DROP_AIR_RESIST } from './blaster-flight-paint.mjs';

// Added main weapons use the already installed, fixed-60Hz splash drop queue.
// The explicit weapon FreeGravity is converted from source units/frame^2 to
// world units/second^2 (current world mapping is 1:1). Sparse shooter splash
// defaults share the provenance documented in blaster-flight-paint.mjs.
// Families without these source fields stay on their existing path; this does
// not invent missing slosher/roller/stringer physics or certify retail parity.
const dropSpecCache=new WeakMap(), fallbackDropSpecCache=new WeakMap();
const DROP_SPEC_FIELDS=Object.freeze([
  ['MoveParam','FreeGravity'],['MoveParam','$type'],
  ['SplashPaintParam','DepthScaleMax'],['SplashPaintParam','DepthScaleMin'],
  ['SplashPaintParam','DepthMaxDropHeight'],['SplashPaintParam','DepthMinDropHeight'],
  ['SplashSpawnParam','RandomSpawnVelXMax'],['SplashSpawnParam','RandomSpawnVelYMax'],
  ['SplashSpawnParam','RandomSpawnVelZMin'],['SplashSpawnParam','RandomSpawnVelZMax'],
]);
export function catalogSplashDropSpec(source, sourceActor = null, shotMode = 'normal', gravityOverride) {
  const cache = gravityOverride===undefined?dropSpecCache:fallbackDropSpecCache;
  const cached=source&&cache.get(source);
  if(cached&&Object.is(cached.gravityOverride,gravityOverride)&&cached.actor===sourceActor&&cached.mode===shotMode&&cached.move===source.MoveParam&&
      cached.spawn===source.SplashSpawnParam&&cached.paint===source.SplashPaintParam&&
      cached.hasGravity===Object.hasOwn(source.MoveParam||{},'FreeGravity')){
    let same=true;
    for(let i=0;i<DROP_SPEC_FIELDS.length;i++){const [group,key]=DROP_SPEC_FIELDS[i];if(!Object.is(source[group]?.[key],cached.values[i])){same=false;break;}}
    if(same)return cached.result;
  }
  const move = source?.MoveParam;
  // Inkipedia Shooter_data_S3 records FreeGravity=0.016 as the default of
  // spl__BulletSimpleMoveParam. The packed catalogue intentionally strips
  // $type; the pinned 11.3.0 TripleQuick/TripleMiddle rows prove these two
  // source actors are SimpleMove. The two Maneuver turret MoveLapOverParam
  // rows also explicitly retain SimpleMove type in the original 11.3.0 JSON.
  // Other untyped rows never inherit the missing-field default.
  const missing = move && !Object.hasOwn(move, 'FreeGravity');
  const typedSimple = move?.$type === 'spl__BulletSimpleMoveParam' ||
    sourceActor === 'WeaponShooterTripleQuick' || sourceActor === 'WeaponShooterTripleMiddle' ||
    shotMode === 'turret' && (sourceActor === 'WeaponManeuverGallon' || sourceActor === 'WeaponManeuverLong');
  const gravity = gravityOverride!==undefined?gravityOverride:Number.isFinite(move?.FreeGravity) ? move.FreeGravity
    : missing && typedSimple ? 0.016 : undefined;
  const spawn=source?.SplashSpawnParam, paintSource=source?.SplashPaintParam;
  if(!(Number.isFinite(gravity)&&gravity>0)||!spawn||!paintSource)return null;
  const paint={...SPLASH_SHOOTER_PAINT_DEFAULTS,...paintSource};
  const random={...SPLASH_SHOOTER_SPAWN_DEFAULTS,...spawn};
  if(![paint.DepthScaleMax,paint.DepthScaleMin,paint.DepthMaxDropHeight,paint.DepthMinDropHeight,
    random.RandomSpawnVelXMax,random.RandomSpawnVelYMax,random.RandomSpawnVelZMin,random.RandomSpawnVelZMax].every(Number.isFinite))return null;
  const result=Object.freeze({gravity:gravity*3600,drag:SPLASH_DROP_AIR_RESIST,surfaceOnly:true,
    depthScaleMax:paint.DepthScaleMax,depthScaleMin:paint.DepthScaleMin,
    dropHeightMax:paint.DepthMaxDropHeight,dropHeightMin:paint.DepthMinDropHeight,
    randomVelocity:Object.freeze({x:random.RandomSpawnVelXMax*60,y:random.RandomSpawnVelYMax*60,
      zMin:random.RandomSpawnVelZMin*60,zMax:random.RandomSpawnVelZMax*60})});
  cache.set(source,{actor:sourceActor,mode:shotMode,gravityOverride,move,spawn,paint:paintSource,
    hasGravity:Object.hasOwn(move||{},'FreeGravity'),values:DROP_SPEC_FIELDS.map(([group,key])=>source[group]?.[key]),result});
  return result;
}

// Map an explicit WidthHalf x (WidthHalf * depth) envelope to the existing
// asymmetric, nonnegative stretch protocol. For depth below one, use the
// perpendicular tangent and a reduced radius; no new GPU/CPU/network field is
// needed. This preserves nominal width, total depth and area, not a retail mask.
export function catalogPaintEllipse(radius,depth=1) {
  const ratio=Number.isFinite(depth)&&depth>0?depth:1;
  const rotate=ratio<1,r=rotate?radius*ratio:radius,elongation=rotate?1/ratio:ratio;
  const stretchAmt=1.6*(elongation-1);
  return {radius:r,rotate,stretchAmt,centreBack:.375*r*stretchAmt};
}
