import { isKitProjectile, kitTrizookaFlight, kitTrizookaOrbitDelta, kitTrizookaActorRadius, kitTrizookaWorldSweep, kitTrizookaClearPooled, kitVolleyHitAuthority } from './trizooka-collision.mjs';
import { segmentCapsuleEntry as kitSegmentCapsuleEntry } from './projectile-collision.mjs';
// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json.
// Source fields and interpreted equations are explicitly separated in the profile.
import {distanceDamage, groupDamage, applyProjectileHit as legacyHit, applySlosherVolleyHit, cachedWeaponOverrideConfig, withWeaponScalarOverride} from './weapons.mjs';
import {damageGroupId} from './final-damage.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { installChargerFlight } from './weapons-charger-flight.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
const SPLATLING_NOMINAL_LIFETIME = 1.2;
let api, completion, moves, slosherVolleySequence = 0;
const slosherDropConfigs = new WeakMap();
const splatlingSpeedViews = new WeakMap();
const clamp01 = value => Math.max(0, Math.min(1, value));
const radians = degrees => degrees * Math.PI / 180;
const MAIN_SHOT_LIFETIME = 1.2;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

// Preserve the native 60 Hz semi-implicit convention. A straight-state boundary
// is counted exactly once, then a capped/braked phase precedes free fall.
// Unsupported families retain native force order; all main rounds now respect their declared lifetime.
export function advanceFidelityProjectile(p, dt) {
  p.prev.copy(p.pos);
  p.fidelityPrevAge = p.age;
  const remaining = Math.max(0, p.life - p.age);
  const step = Math.min(dt, remaining);
  p.age += step;
  const move = p.fidelityMove;
  if (isKitProjectile(p)) kitTrizookaFlight(null, p, step);
  if (!move) {
    if (p.age > p.straight) p.vel.y -= p.grav * step;
    if (p.drag) p.vel.multiplyScalar(1 - p.drag * step * (p.age > p.straight ? 1 : 0));
  } else if (p.age > p.straight + EPSILON) {
    if (p.fidelityPhase === 0) {
      const speed = p.vel.length();
      if (move.endSpeed !== null && speed > move.endSpeed) p.vel.multiplyScalar(move.endSpeed / speed);
      p.fidelityPhase = 1;
    }
    const brake = p.fidelityPhase === 1;
    p.vel.multiplyScalar(Math.pow(1 - (brake ? move.brakeDrag : move.freeDrag), step * move.hz));
    p.vel.y -= (brake ? move.brakeGravity : move.freeGravity) * step;
    // The documented Y transition is used; the apparently unused frame/XZ
    // defaults are not silently interpreted as additional transition tests.
    if (brake && (p.vel.y < move.freeVelocityY || move.freeFrame!=null && (p.age-p.straight)*move.hz+EPSILON>=move.freeFrame)) p.fidelityPhase = 2;
  }
  p.pos.addScaledVector(p.vel, step);
  if (isKitProjectile(p)) kitTrizookaOrbitDelta(null, p, step);
}

// Reuse the production integrator and shooter-family lifetime for a zero-spread centerline prediction.
// The scratch projectile is shared because firing and aim solving are synchronous.
let aimProbe = null;

function fidelityAimHeight(from, dx, dz, distance, pitch, speed, straight, move) {
  const probe = aimProbe || (aimProbe = {
    pos: new api.THREE.Vector3(), prev: new api.THREE.Vector3(), vel: new api.THREE.Vector3(),
    age: 0, life: MAIN_SHOT_LIFETIME, straight: 0, grav: 0, drag: 0,
    fidelityMove: null, fidelityPhase: 0, fidelityPrevAge: 0,
  });
  const horizontal = Math.cos(pitch) * speed;
  probe.pos.copy(from);
  probe.prev.copy(from);
  probe.vel.set(dx * horizontal, Math.sin(pitch) * speed, dz * horizontal);
  probe.age = 0;
  probe.life = MAIN_SHOT_LIFETIME;
  probe.straight = straight;
  probe.grav = move.freeGravity;
  probe.drag = move.freeDrag * move.hz;
  probe.fidelityMove = move;
  probe.fidelityPhase = 0;

  const dt = 1 / move.hz;
  let beforeAlong = 0;
  for (let frame = 0; frame < move.hz * MAIN_SHOT_LIFETIME; frame++) {
    const beforeY = probe.pos.y;
    advanceFidelityProjectile(probe, dt);
    const afterAlong = (probe.pos.x - from.x) * dx + (probe.pos.z - from.z) * dz;
    if (afterAlong >= distance) {
      const fraction = (distance - beforeAlong) / (afterAlong - beforeAlong);
      return beforeY + (probe.pos.y - beforeY) * fraction - from.y;
    }
    beforeAlong = afterAlong;
  }
  return NaN;
}

/** Adjust only the launch pitch, using the same installed movement record and integrator as the fired round. */
export function fidelityAimConvergence(from, dir, target, weapon, speed = weapon?.projSpeed) {
  const move = fidelityMoveFor(weapon);
  if (!move) throw new Error(`Missing fidelity movement record for aim convergence: ${weapon?.id}`);

  const targetX = target.x - from.x, targetZ = target.z - from.z;
  const distance = Math.hypot(targetX, targetZ);
  const dirLength = Math.hypot(dir.x, dir.z);
  const maxDist = weapon.range;
  if (distance < 1.5 || distance > maxDist || !Number.isFinite(speed) || speed <= 0 || dirLength < 1e-4) return false;

  const dx = dir.x / dirLength, dz = dir.z / dirLength;
  const targetHeight = target.y - from.y;
  const initialPitch = Math.atan2(dir.y, dirLength);
  const initialError = fidelityAimHeight(from, dx, dz, distance, initialPitch, speed, weapon.straightTime, move) - targetHeight;
  if (!Number.isFinite(initialError) || Math.abs(initialError) < 0.005) return false;

  // Search only around the camera-derived pitch, preserving the old solver's
  // bounded correction and avoiding a high-arc solution on the other branch.
  const low = Math.max(-1.2, initialPitch - 0.35);
  const high = Math.min(1.2, initialPitch + 0.35);
  const scans = 32;
  let previousPitch = low;
  let previousError = fidelityAimHeight(from, dx, dz, distance, previousPitch, speed, weapon.straightTime, move) - targetHeight;
  let bracketLow = NaN, bracketHigh = NaN, bracketErrorLow = NaN, closest = Infinity;
  for (let i = 1; i <= scans; i++) {
    const pitch = low + (high - low) * i / scans;
    const error = fidelityAimHeight(from, dx, dz, distance, pitch, speed, weapon.straightTime, move) - targetHeight;
    if (Number.isFinite(previousError) && Number.isFinite(error) && (previousError === 0 || error === 0 || (previousError < 0) !== (error < 0))) {
      const candidateDistance = Math.abs((previousPitch + pitch) * 0.5 - initialPitch);
      if (candidateDistance < closest) {
        closest = candidateDistance;
        bracketLow = previousPitch;
        bracketHigh = pitch;
        bracketErrorLow = previousError;
      }
    }
    previousPitch = pitch;
    previousError = error;
  }
  if (!Number.isFinite(bracketLow)) return false;

  let solvedPitch = (bracketLow + bracketHigh) * 0.5;
  for (let i = 0; i < 18; i++) {
    solvedPitch = (bracketLow + bracketHigh) * 0.5;
    const error = fidelityAimHeight(from, dx, dz, distance, solvedPitch, speed, weapon.straightTime, move) - targetHeight;
    if (!Number.isFinite(error)) return false;
    if (Math.abs(error) < 0.005) break;
    if ((bracketErrorLow < 0) !== (error < 0)) bracketHigh = solvedPitch;
    else { bracketLow = solvedPitch; bracketErrorLow = error; }
  }

  const cp = Math.cos(solvedPitch);
  dir.set(dx * cp, Math.sin(solvedPitch), dz * cp);
  return true;
}

// Source records supply endpoints/counts. Added random draws are deterministic
// under the fixture seed; the source PRNG/bias distribution is not recovered.
function rawWeapon(w) { return completion?.weapons[w.id || w.kind]; }

// The installed straight/brake/free record for a weapon, so a dry prediction can
// reuse the same law the live projectile advances under instead of restating it.
export function fidelityMoveFor(weapon) { return moves?.get(weapon?.id) ?? null; }

function seededUnit(seed, salt = 0) {
  let x = (((Number.isFinite(seed) ? seed : 0) * 0x100000000) >>> 0) ^ (salt >>> 0);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}
function seededFrames(seed, min, max, salt) {
  min = Math.max(0, Math.round(min ?? 0)); max = Math.max(min, Math.round(max ?? min));
  return min + Math.min(max - min, Math.floor(seededUnit(seed, salt) * (max - min + 1)));
}
// Current horizontal births have two disjoint, source-defined speed envelopes.
// Nominal-speed nearest selection misclassifies slow main globs as near globs.
// This does not recover an immutable unit after a future player-velocity addition.
export function horizontalRollerReplayUnit(units, speed) {
  if (units?.length !== 2 || !Number.isFinite(speed)) return null;
  const [a, b] = units;
  if ([a, b].some(u => !Number.isFinite(u.SpawnSpeedBase) || !Number.isFinite(u.SpawnSpeedRandom) ||
      u.SpawnSpeedRandom < 0 || (u.AfterOffsetSpawnSpeed || 0) !== 0)) return null;
  const alo = (a.SpawnSpeedBase - a.SpawnSpeedRandom) * 60, ahi = (a.SpawnSpeedBase + a.SpawnSpeedRandom) * 60;
  const blo = (b.SpawnSpeedBase - b.SpawnSpeedRandom) * 60, bhi = (b.SpawnSpeedBase + b.SpawnSpeedRandom) * 60;
  if (!(ahi < blo || bhi < alo)) return null;
  // Distance to the intervals also handles wire rounding just outside an endpoint.
  const da = Math.max(alo - speed, speed - ahi, 0), db = Math.max(blo - speed, speed - bhi, 0);
  return da <= db ? a : b;
}
function wallDropSource(p) {
  const w = p.s3Weapon || p.owner?.weapon;
  if (!w) return null;
  const raw = rawWeapon(w);
  let move, paint;
  if (w.kind === 'dualies') {
    // #604: Splat Dualies keep their pinned wall-drop records at the weapon
    // top level, like Blaster/Splatling; both hands share them unchanged.
    move = raw?.WallDropMoveParam; paint = raw?.WallDropCollisionPaintParam;
  } else if (w.kind === 'roller') {
    // Roller wall-drop data belongs to the exact flick unit that produced the
    // glob (horizontal main/near or one of the vertical units), not the weapon
    // top level. configureFidelityFlick/initialize already preserve that unit.
    const unit = p.fidelityRollerUnit?.UnitParam;
    move = unit?.WallDropMoveParam; paint = unit?.WallDropCollisionPaintParam;
  } else if (w.kind === 'blaster' || w.kind === 'splatling' || w.kind === 'shooter') {
    // #385: the pinned Splattershot source keeps its wall-drop records at the
    // weapon top level (like Blaster/Splatling), so the existing generic
    // lifecycle admits them unchanged. No field or timing is derived here.
    move = raw?.WallDropMoveParam; paint = raw?.WallDropCollisionPaintParam;
  } else return null;
  return move && paint ? { w, move, paint } : null;
}
function eligibleWallDropHit(hit) {
  if (!hit?.hit || Math.abs(hit.normal.y) >= .55) return false;
  const level = api?.G?.physics?.level, block = level?.blocks?.[hit.block];
  if (block?.grate || block?.solid === false) return false;
  const face = hit.face >= 0 ? level?.faces?.[hit.face] : null;
  return !face || face.paintable !== false;
}
function wallDropPaint(p, point, radius, state, salt) {
  if (p.ghost || !(radius > 0) || !api.G.paint) return 0;
  const area = api.G.paint.splat(point, radius, p.team, { seed: seededUnit(p.seed, salt + state.paintIndex++) });
  if (Number.isFinite(area)) p.owner?.addTurf?.(area);
  return area || 0;
}
function wallDropFallPaint(p, state, from, to) {
  if (p.ghost || !(state.fallRadius > 0)) return;
  const distance = from.distanceTo(to); if (distance <= EPSILON) return;
  const spacing = state.paintSpacing;
  let cursor = spacing - state.paintCarry;
  while (cursor <= distance + EPSILON) {
    state.paintPoint.copy(from).lerp(to, Math.min(1, cursor / distance));
    wallDropPaint(p, state.paintPoint, state.fallRadius, state, 0x51f15e);
    cursor += spacing;
  }
  state.paintCarry = (state.paintCarry + distance) % spacing;
}

// #519/#576/#597: the source mirror already contains the pinned S3 WallDrop
// records (per-unit for Roller, top-level for Blaster/Splatling). Convert their
// per-frame target speeds to this runtime's world-units/second convention, but
// retain phase lengths in source frames. Omitted source fields retain their
// zero/default meaning rather than inheriting a different unit's constants.
// First/last random durations are derived from the projectile seed so local and
// ghost playback need no packet extension and consume no extra PRNG draws.
export function beginFidelityWallDrop(system, p, hit) {
  if(hit.kitDefense)return false; // the existing defense callback owns this contact
  const source = wallDropSource(p);
  if (!source || !eligibleWallDropHit(hit)) return false;
  const { move, paint } = source;
  const firstFrames = seededFrames(p.seed, move.FallPeriodFirstFrameMin, move.FallPeriodFirstFrameMax, 0x576);
  const lastFrames = seededFrames(p.seed, move.FallPeriodLastFrameMin, move.FallPeriodLastFrameMax, 0x597);
  const secondFrames = Math.max(0, Math.round(move.FallPeriodSecondFrame ?? 0));
  const firstSpeed = Number(move.FallPeriodFirstTargetSpeed ?? 0), secondSpeed = Number(move.FallPeriodSecondTargetSpeed ?? 0);
  if (![firstSpeed, secondSpeed].every(v => Number.isFinite(v) && v >= 0)) throw new RangeError('Invalid wall-drop target speed');
  const state = p.fidelityWallDrop = {
    frame: 0, firstFrames, secondFrames, lastFrames, totalFrames: firstFrames + secondFrames + lastFrames, done: false,
    firstSpeed, secondSpeed,
    shockRadius: Number(paint.PaintRadiusShock) || 0,
    fallRadius: Number(paint.PaintRadiusFall) || 0,
    groundRadius: Number(paint.PaintRadiusGround) || 0,
    paintSpacing: Math.max(.08, (Number(paint.PaintRadiusFall) || 0) * .5),
    paintCarry: 0, paintIndex: 0,
    hit: new api.Hit(), from: new api.THREE.Vector3(), next: new api.THREE.Vector3(), paintPoint: new api.THREE.Vector3(),
  };
  p.pos.copy(hit.point).addScaledVector(hit.normal, .025);
  p.prev.copy(p.pos);
  p.vel.set(0, -firstSpeed * 60, 0);
  wallDropPaint(p, p.pos, state.shockRadius, state, 0x5a0c);
  // Network ghosts are born with a catch-up budget derived from the projectile's
  // original flight lifetime. Wall-drop can outlive that budget by 70+ source
  // frames, so extend it at the deterministic terrain transition. The network
  // adapter snapshots the old limit for the current catch-up loop; the next
  // update observes this larger budget and continues the same projectile ID.
  if (Number.isFinite(p._netMaxSteps)) {
    p._netMaxSteps = Math.max(p._netMaxSteps, (p._netSteps || 0) + state.totalFrames + 2);
  }

  // Keep the existing Blaster terrain burst exactly once and preserve its
  // terrain-only damage modifier; the wall-drop itself adds no HP damage.
  if (p.type === 'blast') {
    const before = p.s3TerrainBurst; p.s3TerrainBurst = true;
    try { system._blastBurst(p, hit.point, null); }
    finally { p.s3TerrainBurst = before; }
  } else {
    api.emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: p.type === 'drop' ? 'drop' : 'shot', radius: state.shockRadius });
    api.G.fx?.burst(hit.point, hit.normal, p.owner.color, { count: 5, speed: 3, size: .07, paint: false });
  }
  return true;
}

// null = ordinary projectile, false = retained wall-drop, true = wall-drop done.
// The last period has no separate target-speed field in the source record, so it
// retains the sourced second-period target rather than inventing another value.
export function advanceFidelityWallDrop(system, p, dt) {
  const state = p.fidelityWallDrop;
  if (!state) return null;
  if (!(dt > 0)) return false;
  p.prev.copy(p.pos);
  let frames = dt * 60;
  while (frames > EPSILON && state.frame < state.totalFrames - EPSILON) {
    const firstEnd = state.firstFrames, secondEnd = firstEnd + state.secondFrames;
    const phaseEnd = state.frame < firstEnd ? firstEnd : state.frame < secondEnd ? secondEnd : state.totalFrames;
    const stepFrames = Math.min(frames, phaseEnd - state.frame);
    const speed = state.frame < firstEnd ? state.firstSpeed : state.secondSpeed;
    state.from.copy(p.pos); state.next.copy(p.pos); state.next.y -= speed * stepFrames;
    const hit = api.G.physics.segment(state.from, state.next, state.hit, true);
    if (hit.hit) {
      p.pos.copy(hit.point).addScaledVector(hit.normal, .02);
      if (hit.normal.y > .45) wallDropPaint(p, p.pos, state.groundRadius, state, 0x6a0d);
      p.vel.set(0, 0, 0); state.done = true;
      return true;
    }
    p.pos.copy(state.next); p.vel.set(0, -speed * 60, 0);
    wallDropFallPaint(p, state, state.from, state.next);
    state.frame += stepFrames; frames -= stepFrames;
  }
  const done = state.frame + EPSILON >= state.totalFrames;
  if (done) state.done = true;
  return done;
}
function collisionRecord(c, target, offset = 0) {
  return { initRadius:Math.max(0,c['InitRadiusFor'+target]+offset*(c['AfterOffsetInitRadiusFor'+target]||0)),
    endRadius:Math.max(0,c['EndRadiusFor'+target]+offset*(c['AfterOffsetEndRadiusFor'+target]||0)),
    changeTime:Math.max(0,(c['ChangeFrameFor'+target]||0)/60),
    FriendThroughFrameForPlayer:Number.isFinite(c.FriendThroughFrameForPlayer)?c.FriendThroughFrameForPlayer:null };
}
function radiusAt(c, age, fallback) {
  if(!c)return fallback;
  const t=c.changeTime>0?clamp01(age/c.changeTime):1;
  return c.initRadius+(c.endRadius-c.initRadius)*t;
}
export function fidelityPlayerCollisionRadius(p) { return p.s3PlayerRadius ?? radiusAt(p.fidelityPlayerCollision,p.age,p.size); }
function fieldRadiusAt(p,age) { return radiusAt(p.fidelityFieldCollision,age,p.fieldRadius||0); }
function setCollision(p,c,offset=0) {
  p.fidelityPlayerCollision=collisionRecord(c,'Player',offset);
  p.fidelityFieldCollision=collisionRecord(c,'Field',offset);
  // Restore the pinned family-specific window consumed by the existing solver.
  p.fidelityFriendThrough=['shooter','slosher','roller','splatling'].includes(p.s3Weapon?.kind) ? p.fidelityPlayerCollision.FriendThroughFrameForPlayer : null;
  // Existing size carries initial radius; Roller unit identity is transmitted separately.
  p.size=p.fidelityPlayerCollision.initRadius;
}
// Legacy projectile packets have no unit discriminator. New packets preserve
// their first30 entries, then carry unit before the existing owner tick/sequence.
export function validFidelityRollerUnitPacket(event) {
  if (!Array.isArray(event)) return false;
  if ([27, 30, 32].includes(event.length)) return true;
  if (event.length !== 33 && event.length !== 35) return false;
  // The composed Kit recorder inserts volley/action slots before network metadata.
  const kitOffset = event.length === 35 ? 2 : 0;
  const weapons = api?.WEAPONS;
  const weapon = weapons && Object.hasOwn(weapons, event[4]) ? weapons[event[4]] : null, unit = event[30 + kitOffset];
  if (!weapon) {
    const specials=api?.SPECIALS,entry=specials&&Object.hasOwn(specials,event[4])?specials[event[4]]:null;
    return typeof entry?.projectileDescriptor==='function' && unit===-1;
  }
  if (weapon.kind !== 'roller') return unit === -1;
  if (event[27 + kitOffset] !== 0 && event[27 + kitOffset] !== 1) return false;
  const units = rawWeapon(weapon)?.[event[27 + kitOffset] === 1 ? 'VerticalSwingUnitGroupParam' : 'WideSwingUnitGroupParam']?.Unit;
  return Number.isSafeInteger(unit) && unit >= 0 && !!units && unit < units.length;
}
// #750: the swing unit declares the head's *rendered* size in
// UnitParam.DrawSizeParam, separately from CollisionParam and from paint.
// Splat Roller 11.3.0 ships constant 0.30/0.30 horizontal and 0.36/0.36
// vertical, so one radius per unit with no fan-position gradient. This replaces
// the generic emitter's centre-biased random radius on p.vis; that draw is still
// consumed upstream, so the RNG order and count are unchanged. A unit without
// DrawSizeParam keeps the generic radius rather than inventing one.
function drawRadiusRecord(draw) {
  if(!draw)return null;
  const init=Number(draw.InitRadius),end=Number(draw.EndRadius??draw.InitRadius);
  if(!(init>0)||!(end>=0))return null;
  return {initRadius:init,endRadius:end,changeTime:Math.max(0,Number(draw.ChangeFrame??0)/60)};
}
function setDrawRadius(p,unit) {
  const record=drawRadiusRecord(unit?.UnitParam?.DrawSizeParam);
  if(!record)return;
  p.fidelityDrawRadius=record;
  p.vis=radiusAt(record,p.age,p.size);
}
// One unit-selection rule, shared by the main volley and the appended
// nearest-glob unit, so both read the same pinned DrawSizeParam.
function flickUnitFor(weapon,vertical,index) {
  const raw=rawWeapon(weapon);
  const group=raw?raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam']:null;
  if(!group)return null;
  let offset=index;
  for(const u of group.Unit){if(offset<(u.BulletNum??1))return {unit:u,offset};offset-=u.BulletNum??1;}
  return null;
}
export function rollerFlickDrawRadius(weapon,vertical,index,age=0,fallback=null) {
  const picked=flickUnitFor(weapon,vertical,index);
  if(!picked)return fallback;
  const record=drawRadiusRecord(picked.unit.UnitParam?.DrawSizeParam);
  return record?radiusAt(record,age,fallback):fallback;
}
export function configureFidelityFlick(p, actor, weapon, index, angle, speed) {
  const b=weapon.ballistics, raw=rawWeapon(weapon);if(!b||!raw)return;
  // The attack argument owns this projectile's physics. Preserve it through
  // _push so a later actor/profile mutation cannot rewrite an already-fired volley.
  p.s3Weapon=weapon; p.wid=weapon.id;
  const vertical=!!actor.weaponRunner.s3FlickVertical;
  const group=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'];
  const picked=flickUnitFor(weapon,vertical,index);
  if(!picked)throw new RangeError('Roller index exceeds pinned units + labelled defaults');
  const {unit,offset}=picked;
  let pitch=Math.max(-.2,Math.min(.5,actor.aimPitch));
  if(vertical){
    speed=60*(unit.SpawnSpeedBase+offset*(unit.AfterOffsetSpawnSpeed||0));
    pitch+=radians((unit.SpawnRotateXDegreeBase||0)+offset*(unit.AfterOffsetSpawnRotateXDegree||0));
    angle=actor.yaw+radians(unit.SpawnRotateYDegree||0);
  }else{
    const count=unit.BulletNum??1,fan=count>1?offset/(count-1)*2-1:0;
    speed=60*(unit.SpawnSpeedBase+(Math.random()*2-1)*(unit.SpawnSpeedRandom||0));
    angle=actor.yaw+fan*radians(unit.SpawnWideDegree||0);
    pitch+=radians(b.horizontalPitchDegrees); // retained calibrated launch angle, NOT extracted
    const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;
    p.pos.x+=Math.cos(actor.yaw)*side+(Math.random()*2-1)*j;
    p.pos.z-=Math.sin(actor.yaw)*side-(Math.random()*2-1)*j;
    p.pos.y+=(Math.random()*2-1)*j;
  }
  // Only offsets are extracted. Native body +1.3 anchor is not claimed as Switch height.
  p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);
  p.prev.copy(p.pos);p.start.copy(p.pos);
  const cp=Math.cos(pitch);
  p.vel.set(Math.sin(angle)*cp*speed,Math.sin(pitch)*speed,Math.cos(angle)*cp*speed);
  p.fidelityYaw=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw));
  p.fidelitySectorYaw=vertical?null:actor.yaw;
  p.fidelityMode=vertical?'vertical':'horizontal';p.fidelityRollerUnit=unit;p.fidelityRollerUnitIndex=group.Unit.indexOf(unit);
  setCollision(p,unit.UnitParam.CollisionParam);
  setDrawRadius(p,unit);
  p.straight=unit.UnitParam.MoveParam.GoStraightToBrakeStateFrame/60;
  p.grav=weapon.flickGravity;p.drag=weapon.flickDrag;
}

function scratch(system) {
  return system._fidelityCollision || (system._fidelityCollision = {
    worldReady:false, bossReady:false, world:new api.Hit(), boss:null,
    base:new api.THREE.Vector3(), res:{t:0,dist:0}, targets:[],
  });
}
export function fidelityWorldHit(system,p) {
  const s=scratch(system);
  if(!s.worldReady){
    s.world.kitDefense=null;
    if(isKitProjectile(p)) kitTrizookaWorldSweep(system,p,s.world,api.G.physics);
    else sweptWorldHit(api.G.physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge??p.age),fieldRadiusAt(p,p.age),s.world,true);
    const defense=system.kitDefenseCandidate?.(p);
    if(defense&&Number.isFinite(defense.distance)&&defense.distance>=0&&(!s.world.hit||defense.distance<s.world.dist-EPSILON)){
      s.world.hit=true;s.world.dist=defense.distance;s.world.kitDefense=defense;
    }
    s.worldReady=true;
  }
  return s.world;
}
export function fidelityBossHit(system,p) {
  const s=scratch(system);
  if(!s.bossReady){
    s.boss = api.G.boss?.segHit(p.prev,p.pos,p.size*.6) || null;
    const world=fidelityWorldHit(system,p);
    if(s.boss && world.hit && s.boss.dist >= world.dist - EPSILON)s.boss=null;
    s.bossReady=true;
  }
  return s.boss;
}

// Use the native body dimensions with continuous first-contact capsule entry.
// The original loop selected actor-array order and tested the wall afterwards.
// One reusable scratch record avoids per-projectile sorting/allocation and
// also avoids a second terrain query when the segment reaches the world.
// #801: Roller flicks admit same-team capsules only after the pinned 3F
// teammate-through window. The window is measured at this sweep's candidate
// contact age (fixed 60 Hz frames), so render cadence cannot move the boundary.
export function fidelityProjectileTargets(system,p) {
  const s=scratch(system),{G,PLAYER}=api;
  s.worldReady=s.bossReady=false;s.boss=null;s.targets.length=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;
  // A completed wall-drop is an inert ink state, never a damaging projectile.
  // Keep the generic actor loop structurally intact for the network adapter, but
  // give it no targets on the terminal wall-drop frame.
  if (p.fidelityWallDrop?.done) return s.targets;
  // Ghosts share visual collision chronology, but never damage/paint ownership.
  const r0=p.s3PlayerRadius ?? radiusAt(p.fidelityPlayerCollision,p.fidelityPrevAge??p.age,p.size);
  const r1=fidelityPlayerCollisionRadius(p),radius=PLAYER.radius+Math.max(r0,r1);
  let nearest=null,best=Infinity;
  for(const actor of G.actors){
    if(!actor.alive||actor===p.owner)continue;
    const friendly=actor.team===p.team;
    // S3 teammate body-block: friendly capsules follow the per-family source
    // FriendThroughFrameForPlayer window. A missing source record keeps the
    // native same-team skip instead of inventing one global collider rule.
    if(friendly&&!Number.isFinite(p.fidelityFriendThrough))continue;
    if(actor.pos.x<Math.min(p.prev.x,p.pos.x)-radius||actor.pos.x>Math.max(p.prev.x,p.pos.x)+radius||
       actor.pos.z<Math.min(p.prev.z,p.pos.z)-radius||actor.pos.z>Math.max(p.prev.z,p.pos.z)+radius)continue;
    s.base.copy(actor.pos); // render easing does not move the authoritative capsule
    const kr=kitTrizookaActorRadius(system,p);
    const t=kr==null?capsuleEntry(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,r0,r1):kitSegmentCapsuleEntry(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,kr);
    if(t===null)continue;
    if(friendly){
      // The window is measured in source frames at the contact point of this
      // sweep, so the fixed-step result is identical at any render cadence.
      const prevAge=p.fidelityPrevAge??p.age;
      if((prevAge+(p.age-prevAge)*t)*60<p.fidelityFriendThrough-EPSILON)continue;
    }
    if(t<best-EPSILON||Math.abs(t-best)<EPSILON&&String(actor.nid??actor.name)<String(nearest?.nid??nearest?.name)){best=t;nearest=actor;}
  }
  if(nearest){
    const length=p.prev.distanceTo(p.pos),world=fidelityWorldHit(system,p),boss=fidelityBossHit(system,p);
    if((!world.hit||best*length<world.dist-EPSILON)&&(!boss||best*length<boss.dist-EPSILON)){
      s.targets.push(nearest);p.fidelityImpactActor=nearest;p.fidelityImpactT=best;
    }
  }
  return s.targets;
}

// Keep the old volley membership for splash exclusion, but do not let it defeat
// the already-installed maximum-per-volley damage group when a stronger glob
// reaches a victim after a weaker glob. No second full hit is awarded.
export function fidelityVolleyDamage(p,victim,amount) {
  // Teammate body-block contact consumes the round without friendly damage,
  // kill credit, or volley/damage-group bookkeeping.
  if(victim.team===p.team)return 0;
  if(!kitVolleyHitAuthority(p)) return 0;
  if(!p.vol)return amount;
  const seen=p.vol.hits.includes(victim);
  if(!seen)p.vol.hits.push(victim);
  return seen && !p.s3DamageGroup ? 0 : amount;
}
export function applyFidelitySlosherSplash(system,p,victim,amount) {
  // A glob consumed by a teammate never splashes enemies behind the blocker.
  if(victim.team===p.team)return;
  // Active Splat Bucket units have no SplashSlosherHitParam records. No radial damage.
  if(rawWeapon(p.s3Weapon||p.owner.weapon)?.UnitGroupParam)return;
  if(p.ghost)return;
  return applySlosherVolleyHit(system,p.owner,victim,p.s3DamageGroup,p.s3DamageGroupId,amount,p.wid||'slosher');
}
// #734: S3 measures the horizontal Inside/Outside sector from each glob's own
// spawn point to the actual hit position. p.fidelityYaw only records which fan
// slot was fired, so overlapping globs resolved the same hit differently. A
// projectile with no recorded sector reference keeps the inside table instead
// of inventing an outside one.
export function rollerHitAngle(p,point) {
  if(!Number.isFinite(p.fidelitySectorYaw))return null;
  const dx=point.x-p.start.x,dz=point.z-p.start.z;
  if(!(dx*dx+dz*dz>0))return 0;
  const yaw=Math.atan2(dx,dz)-p.fidelitySectorYaw;
  return Math.atan2(Math.sin(yaw),Math.cos(yaw));
}
export function fidelityDamage(p,point) {
  const w=p.s3Weapon||p.owner.weapon;
  if(w.kind==='roller'&&w.ballistics){
    const b=w.ballistics,d=p.start.distanceTo(point),xz=Math.hypot(point.x-p.start.x,point.z-p.start.z);
    const hitAngle=rollerHitAngle(p,point);
    const outside=!p.s3Vertical&&hitAngle!==null&&xz>b.horizontalInsideDistance&&Math.abs(hitAngle)>radians(b.horizontalInsideDegrees);
    const bands=p.s3Vertical?w.verticalDamageBands:outside?b.horizontalOutsideDamageBands:w.flickDamageBands;
    const source=rawWeapon(w)[p.s3Vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].DamageParam;
    const age=(p.fidelityPrevAge??p.age??0)+((p.age??0)-(p.fidelityPrevAge??p.age??0))*(p.fidelityImpactT??1);
    const t=clamp01((age*60-source.DamageRejectStartFrame)/(source.DamageRejectEndFrame-source.DamageRejectStartFrame));
    return distanceDamage(bands,d)*(1+(source.DamageRejectRate-1)*t);
  }
  if(w.kind==='slosher'&&p.fidelitySloshUnit){
    const d=p.fidelitySloshUnit.DamageParam,launchY=p.fidelitySloshLaunchVelY;
    // #1065: downward travel during the 2F straight phase does not consume
    // Bucket Slosher's fall-damage distance. Upward shots keep the spawn-height
    // anchor, which already ignores apex -> muzzle-height return descent.
    const fallAnchorY=Number.isFinite(launchY)&&launchY<0
      ? p.start.y+launchY*Math.max(0,p.straight||0)
      : p.start.y;
    const fall=Math.max(0,fallAnchorY-point.y);
    const t=clamp01((fall-d.ReduceStartFallDistance)/(d.ReduceEndFallDistance-d.ReduceStartFallDistance));
    return (d.ValueMax+(d.ValueMin-d.ValueMax)*t)/10;
  }
  const age=(p.fidelityPrevAge??p.age)+(p.age-(p.fidelityPrevAge??p.age))*(p.fidelityImpactT??1);
  if(['shooter','dualies','splatling'].includes(w.kind)){
    const t=clamp01((age-w.damageReduceStart)/(w.damageReduceEnd-w.damageReduceStart));
    return w.damage+(w.damageMin-w.damage)*t;
  }
  return p.damage;
}
export function applyFidelityProjectileHit(system,p,victim,amount,point) {
  // Teammate body-block: the round is already consumed by the solver; never
  // route friendly damage, kill credit, or enemy-hit side effects.
  if(victim.team===p.team)return;
  if(p.ghost)return;
  amount=fidelityDamage(p,point);
  const weapon=p.s3Weapon||p.owner.weapon;
  if(weapon.kind==='slosher'&&p.s3DamageGroup)
    return applySlosherVolleyHit(system,p.owner,victim,p.s3DamageGroup,p.s3DamageGroupId,amount,p.wid||p.type||'slosher');
  amount=groupDamage(p.s3DamageGroup,victim,amount);
  if(amount>0)system.applyHit(p.owner,victim,amount,p.wid||p.type,damageGroupId(p.s3DamageGroup));
}

export function splatlingLaunchSpeed(weapon,charge) {
  const maximum=weapon.ballistics?.firstChargeSpeed;
  if(!Number.isFinite(maximum))return weapon.projSpeed;
  const first=weapon.firstChargeTime/weapon.chargeTime;
  // Endpoints are extracted; the interpolation is a labelled minimal model,
  // not a claim of recovered Nintendo code or of its random speed bias.
  return weapon.projSpeed+(maximum-weapon.projSpeed)*clamp01(charge/first);
}

// Issue #312: pinned Ver.11.3.0 WeaponShooterNormal carries
// spl__SpawnBulletAdditionMovePlayerParam.ZRate = 2, but native fireShooter
// launches with dir * projSpeed only. Apply the sourced yaw-local forward
// contribution once at spawn, before the wrapped push records the round for
// the network. Pure strafe/vertical motion contributes zero; backward motion
// changes sign. Basis, clamps and post-launch decomposition beyond the
// sourced ZRate remain unverified and are not inferred.
export function applyShooterSpawnVelocity(p) {
  if(!p||p.ghost||p.s3ShooterForwardApplied)return;
  if(p.type!=='shot')return;
  const a=p.owner;
  if(!a||a.remote)return;
  const w=p.s3Weapon||a.weapon;
  if(!w||(w.kind!=='shooter'&&w.id!=='shooter'))return;
  const rate=rawWeapon(w)?.spl__SpawnBulletAdditionMovePlayerParam?.ZRate;
  if(!Number.isFinite(rate)||!Number.isFinite(a.yaw)||!Number.isFinite(a.vel?.x)||!Number.isFinite(a.vel?.z))return;
  const x=Math.sin(a.yaw),z=Math.cos(a.yaw);
  const amount=(a.vel.x*x+a.vel.z*z)*rate;
  p.vel.x+=x*amount;p.vel.z+=z*amount;
  p.s3ShooterForwardApplied=true;
}

// Issue #619: pinned Ver.11.3.0 WeaponBlasterMiddle carries
// spl__SpawnBulletAdditionMovePlayerParam.ZRate = 2, but native fireBlaster
// launches with dir * projSpeed only. Apply the sourced yaw-local forward
// contribution once at spawn, before the wrapped push records the round for
// the network. Pure strafe/vertical motion contributes zero; backward motion
// changes sign. Basis, clamps and post-launch decomposition beyond the
// sourced ZRate remain unverified and are not inferred.
export function applyBlasterSpawnVelocity(p) {
  if(!p||p.ghost||p.s3BlasterForwardApplied)return;
  if(p.type!=='blast')return;
  const a=p.owner;
  if(!a||a.remote)return;
  const w=p.s3Weapon||a.weapon;
  if(!w||w.kind!=='blaster')return;
  const rate=rawWeapon(w)?.spl__SpawnBulletAdditionMovePlayerParam?.ZRate;
  if(!Number.isFinite(rate)||!Number.isFinite(a.yaw)||!Number.isFinite(a.vel?.x)||!Number.isFinite(a.vel?.z))return;
  const x=Math.sin(a.yaw),z=Math.cos(a.yaw);
  const amount=(a.vel.x*x+a.vel.z*z)*rate;
  p.vel.x+=x*amount;p.vel.z+=z*amount;
  p.s3BlasterForwardApplied=true;
}

function simulateSplatlingReach(p,weapon,charge,initializeFlight) {
  const speed=splatlingLaunchSpeed(weapon,Number.isFinite(charge)?charge:0);
  if(!Number.isFinite(speed)||speed<=0)return 0;
  p.pos.set(0,0,0);p.prev.copy(p.pos);p.start.copy(p.pos);
  p.vel.set(0,0,speed);p.age=0;p.life=SPLATLING_NOMINAL_LIFETIME;
  p.fidelityPrevAge=0;p.fidelityPhase=0;p.fidelityMode=null;
  if(!initializeFlight(p,weapon))return 0;
  let remaining=p.life;
  while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
  // The reticle range compares straight-line aim distance; use the nominal
  // forward XZ extent and leave gravity/collision to the installed flight.
  return Math.hypot(p.pos.x-p.start.x,p.pos.z-p.start.z);
}

export function installWeaponsFidelity(context,profile) {
  const {WeaponRunner,Projectiles,WEAPONS}=context;
  if(Object.hasOwn(Projectiles.prototype,INSTALLED))return;
  const defaults=profile.weaponsFidelity;
  if(!defaults || defaults.schema!==1 || profile.referenceHz!==60)throw new Error('Missing or unsupported weapons fidelity profile');
  for (const [name,value] of Object.entries({brakeDrag:defaults.brakeDragPerFrame,freeDrag:defaults.freeDragPerFrame}))
    if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('Invalid '+name);
  if(!Number.isFinite(defaults.brakeGravity)||defaults.brakeGravity<0||!Number.isFinite(defaults.freeGravity)||defaults.freeGravity<0||!Number.isFinite(defaults.brakeToFreeVelocityY))throw new RangeError('Invalid ballistic gravity/transition');
  const roller=WEAPONS.roller;
  if(roller?.ballistics && roller.ballistics.verticalUnits.reduce((n,u)=>n+u.count,0)!==roller.verticalDrops)throw new Error('Vertical roller unit count differs from profile');
  api=context;completion=profile.weaponsFidelityCompletion;
  if(!completion||completion.schema!==1)throw new Error('Missing completion source table');
  moves=new Map();
  for(const [id,w]of Object.entries(WEAPONS)){
    if(!w.ballistics)continue;
    const b=w.ballistics;
    const finite=(value,label)=>{if(!Number.isFinite(value)||value<0)throw new RangeError('Invalid '+id+' '+label);};
    if(b.endSpeed!==null)finite(b.endSpeed,'brake entry speed');
    const drag=b.freeDragPerFrame??defaults.freeDragPerFrame;
    if(!Number.isFinite(drag)||drag<0||drag>=1)throw new RangeError('Invalid '+id+' free drag');
    if(w.kind==='roller'){
      finite(b.horizontalStraightTime,'horizontal straight time');finite(b.verticalStraightTime,'vertical straight time');
      if(!Number.isFinite(b.horizontalPitchDegrees)||!Number.isFinite(b.horizontalInsideDegrees))throw new RangeError('Invalid roller angle');
      for(const u of b.verticalUnits){
        if(!Number.isInteger(u.count)||u.count<=0||![u.speed??w.verticalSpeed,u.speedStep,u.pitchDegrees,u.pitchStepDegrees].every(Number.isFinite))throw new RangeError('Invalid roller unit');
        finite((u.speed??w.verticalSpeed)+(u.count-1)*u.speedStep,'last unit speed');
      }
    }
    if(w.kind==='blaster'){finite(b.straightTime,'straight time');finite(b.burstTime,'burst time');}
    if(w.kind==='dualies' && w.shotGuideFrame !== rawWeapon(w)?.WeaponParam?.ShotGuideFrame)
      throw new Error('Dualies ShotGuideFrame differs from pinned source');
    if(w.kind==='splatling')finite(b.firstChargeSpeed,'charged speed');
    freezeDeep(b);
    moves.set(id,freezeDeep({hz:profile.referenceHz,endSpeed:b.endSpeed??null,
      brakeDrag:defaults.brakeDragPerFrame,brakeGravity:defaults.brakeGravity,
      freeDrag:b.freeDragPerFrame??defaults.freeDragPerFrame,
      freeGravity:w.kind==='roller'?w.flickGravity:w.referenceGravity??defaults.freeGravity,
      freeVelocityY:defaults.brakeToFreeVelocityY}));
  }
  function initializeSplatlingFlight(p,w){
    const move=moves.get(w.id)||null;
    p.fidelityMove=move;
    if(!move||!Number.isFinite(w.straightTime)||!Number.isFinite(w.referenceGravity))return false;
    p.straight=w.straightTime;p.grav=w.referenceGravity;p.drag=move.freeDrag*60;
    return true;
  }
  Object.defineProperty(Projectiles.prototype,INSTALLED,{value:true});
  Projectiles.prototype.splatlingReach=function(weapon,charge){
    const THREE=context.THREE;
    const p=this._s3SplatlingReachProjectile||(this._s3SplatlingReachProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    const speed=splatlingLaunchSpeed(weapon,Number.isFinite(charge)?charge:0);
    // Installed movement records are immutable. These are the remaining inputs
    // to the nominal flight; steady charge must not replay 72 frames per HUD tick.
    if(p.reachWeaponId===weapon.id&&p.reachSpeed===speed&&p.reachStraight===weapon.straightTime&&
       p.reachGravity===weapon.referenceGravity&&p.reachValue!==undefined)return p.reachValue;
    const reach=simulateSplatlingReach(p,weapon,charge,initializeSplatlingFlight);
    p.reachWeaponId=weapon.id;p.reachSpeed=speed;p.reachStraight=weapon.straightTime;
    p.reachGravity=weapon.referenceGravity;p.reachValue=reach;
    return reach;
  };
  const fresh=Projectiles.prototype._new,push=Projectiles.prototype._push,step=Projectiles.prototype._step,ghost=Projectiles.prototype.ghostProjectile,clear=Projectiles.prototype.clear;
  Projectiles.prototype.clear=function(...args){const result=clear.apply(this,args);this._fidelityCollision=null;this._fidelitySloshContext=null;return result;};
  Projectiles.prototype._new=function(...args){
    // Clear the outgoing kit before native _new erases wid and the generic
    // wrapper erases its descriptor, while authority is still identifiable.
    const recycled=this.pool[this.pool.length-1];if(recycled)kitTrizookaClearPooled(recycled);
    const p=fresh.apply(this,args);kitTrizookaClearPooled(p);
    p._s3SloshBirthPending=false;p._s3SloshBirthOwner=null;p._s3SloshBirthEpoch=undefined;
    p._s3SloshBirthWeaponId=null;p._s3SloshBirthRemote=undefined;p._s3SloshBirthNid=undefined;
    p._s3SloshBirthPeer=undefined;p._s3SloshBirthWasInMatch=false;p._s3SloshBirthDelay=0;
    p._s3SloshYaw=0;p._s3SloshPitch=0;p._s3SloshBirthGhost=false;
    p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;p.fidelityFieldCollision=null;p.fidelityFriendThrough=null;p.fidelityRollerUnit=null;p.fidelityRollerUnitIndex=null;p.fidelitySloshUnit=null;p.fidelitySloshLaunchVelY=null;p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;p.fidelitySectorYaw=null;p.s3ShooterForwardApplied=false;p.s3BlasterForwardApplied=false;return p;
  };
  function initialize(p,w){
    // Kit descriptors own their identity, flight and collision. They use wid,
    // not the main-weapon id field, and must survive owner weapon changes.
    if(p.s3SpecialWeapon)return;
    if(!w)return;
    const raw=rawWeapon(w);p.s3Weapon=w;p.wid=w.id;p.fidelityPhase=0;
    p.fidelityMove=moves.get(w.id)||null;
    if(raw?.CollisionParam){
      const c=w.kind==='dualies'&&p.owner?.weaponRunner?.s3Turret?raw.CollisionLapOverParam:raw.CollisionParam;
      // On ghosts the existing size field disambiguates standing vs turret radius.
      setCollision(p,p.ghost&&w.kind==='dualies'&&p.size>(raw.CollisionParam.InitRadiusForPlayer+raw.CollisionLapOverParam.InitRadiusForPlayer)/2?raw.CollisionLapOverParam:c);
    }
    if(w.kind==='blaster'){
      p.straight=w.ballistics.straightTime;p.life=w.ballistics.burstTime;
      p.grav=p.fidelityMove.freeGravity;p.drag=p.fidelityMove.freeDrag*60;
    }else if(w.kind==='roller'){
      const vertical=p.fidelityMode==='vertical'||p.ghost&&p.fidelityMode===null&&Math.round(p.straight*60)===Math.round(w.ballistics.verticalStraightTime*60);
      p.fidelityMode=vertical?'vertical':'horizontal';p.s3Vertical=vertical;
      const units=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].Unit;
      // WideSwing has no recurring intermediate splash system. Impact paint
      // and the separately owned VerticalSwing trail remain unchanged.
      if(!vertical)p.trailEvery=0;
      if(!p.fidelityRollerUnit){
        if(Number.isSafeInteger(p.fidelityRollerUnitIndex)&&units[p.fidelityRollerUnitIndex])p.fidelityRollerUnit=units[p.fidelityRollerUnitIndex];
        if(!p.fidelityRollerUnit)p.fidelityRollerUnit=p.ghost&&!vertical?horizontalRollerReplayUnit(units,p.vel.length()):null;
        if(!p.fidelityRollerUnit){
          let best=Infinity;
          for(const u of units)for(let i=0;i<(u.BulletNum??1);i++){
            const d=Math.abs(p.vel.length()-60*(u.SpawnSpeedBase+i*(u.AfterOffsetSpawnSpeed||0)));
            if(d<best){best=d;p.fidelityRollerUnit=u;}
          }
        }
        setCollision(p,p.fidelityRollerUnit.UnitParam.CollisionParam);
      }
      p.fidelityRollerUnitIndex=units.indexOf(p.fidelityRollerUnit);
      p.straight=(vertical?w.ballistics.verticalStraightTime:w.ballistics.horizontalStraightTime);
      p.grav=w.flickGravity;p.drag=w.flickDrag;
    }else if(w.kind==='slosher'){
      if(!p.fidelitySloshUnit){
        let best=Infinity;
        for(const u of raw.UnitGroupParam.Unit)for(let i=0;i<(u.BulletNum??1);i++){
          // Packet radius is rounded to 0.01, so use the unique source launch delay,
          // serialized at 0.001 seconds, to recover the unit without extra fields.
          const delay=((u.UnitDelayFrame||0)+i*(u.AfterOffsetDelayFrame||0))/60;
          const delta=Math.abs((p.delay||0)-delay);
          if(delta<best){best=delta;p.fidelitySloshUnit=u;p.fidelitySloshIndex=i;}
        }
      }
      const u=p.fidelitySloshUnit,c=u.MoveParam;
      p.fidelitySloshLaunchVelY=p.vel.y;
      setCollision(p,u.CollisionParam,p.fidelitySloshIndex);
      p.straight=c.GoStraightToBrakeStateFrame/60;
      p.fidelityMove={hz:60,endSpeed:c.GoStraightStateEndMaxSpeed*60,brakeDrag:c.BrakeAirResist,brakeGravity:c.BrakeGravity*3600,
        freeDrag:c.FreeAirResist,freeGravity:c.FreeGravity*3600,freeVelocityY:c.BrakeToFreeVelocityY*60,freeFrame:c.BrakeToFreeStateFrame};
      p.grav=c.FreeGravity*3600;p.drag=c.FreeAirResist*60;
    }else if(w.kind==='splatling'){
      initializeSplatlingFlight(p,w);
    }else if(p.fidelityMove){p.straight=w.straightTime;p.grav=w.referenceGravity;p.drag=p.fidelityMove.freeDrag*60;}
  }
  Projectiles.prototype._push=function(p){
    const w=p.s3Weapon||WEAPONS[p.wid]||p.owner?.weapon,active=this._fidelitySloshContext;
    if(active&&p.type==='slosh'){
      let index=active.index++,u;
      for(const unit of rawWeapon(w).UnitGroupParam.Unit){if(index<(unit.BulletNum??1)){u=unit;break;}index-=unit.BulletNum??1;}
      if(!u)throw new RangeError('Slosher unit index');
      p.fidelitySloshUnit=u;p.fidelitySloshIndex=index;
      p.delay=((u.UnitDelayFrame||0)+index*(u.AfterOffsetDelayFrame||0))/60;
      const speed=((p.owner.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir)+index*(u.AfterOffsetSpawnSpeed||0))*60;
      const aim=p.owner.aimDir.clone().normalize();
      const yaw=Math.atan2(aim.x,aim.z)+radians(u.BaseRotateYDegree||0)+
        (u.RandomRotateYOffOrderNum?.includes(index)?0:(Math.random()*2-1)*radians(u.RandomRotateYDegree||0));
      const pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),horizontal=Math.cos(pitch)*speed;
      p.vel.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*speed+horizontal*(u.AddSpawnSpeedYRateByXZ||0),Math.cos(yaw)*horizontal);
      p._s3SloshBirthPending=true;p._s3SloshBirthOwner=p.owner;p._s3SloshBirthEpoch=p.owner?._s3SlosherBirthEpoch;
      p._s3SloshBirthWeaponId=p.wid;p._s3SloshBirthRemote=p.owner?.remote;p._s3SloshBirthNid=p.owner?.nid;
      p._s3SloshBirthPeer=p.owner?.owner;p._s3SloshBirthWasInMatch=Array.isArray(context.G?.actors)&&context.G.actors.includes(p.owner);
      p._s3SloshBirthDelay=p.delay;p._s3SloshYaw=yaw;p._s3SloshPitch=pitch;
      p.damage=u.DamageParam.ValueMax/10;p.head=!!u.HitEffectBigOrderNum?.includes(index);
      p.s3DamageGroup=active.group;p.s3DamageGroupId=active.groupId;
    }
    initialize(p,w);
    applyShooterSpawnVelocity(p);
    applyBlasterSpawnVelocity(p);
    const group=p.s3DamageGroup;const result=push.call(this,p);
    // The generic wrapper snapshots owner state too; retain a single per-volley owner.
    if(group)p.s3DamageGroup=group;
    return result;
  };
  Projectiles.prototype._step=function(p,dt){
    if(p._s3SloshBirthPending){
      const owner=p._s3SloshBirthOwner,actors=context.G?.actors;
      const current=owner&&p.owner===owner&&owner.alive!==false&&!(Number.isFinite(owner.hp)&&owner.hp<=0)&&
        owner._s3SlosherBirthEpoch===p._s3SloshBirthEpoch&&!owner.specialActive&&owner.weapon?.id===p._s3SloshBirthWeaponId&&
        owner.remote===p._s3SloshBirthRemote&&owner.nid===p._s3SloshBirthNid&&owner.owner===p._s3SloshBirthPeer&&
        (!p._s3SloshBirthWasInMatch||actors?.includes(owner));
      if(!current){p._s3SloshBirthPending=false;return true;}
      const u=p.fidelitySloshUnit,index=p.fidelitySloshIndex;
      if(!u){p._s3SloshBirthPending=false;return true;}
      this._muzzle(owner,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
      const speed=((owner.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir)+index*(u.AfterOffsetSpawnSpeed||0))*60;
      const horizontal=Math.cos(p._s3SloshPitch)*speed;
      p.vel.set(Math.sin(p._s3SloshYaw)*horizontal,
        Math.sin(p._s3SloshPitch)*speed+horizontal*(u.AddSpawnSpeedYRateByXZ||0),
        Math.cos(p._s3SloshYaw)*horizontal);
      p.fidelitySloshLaunchVelY=p.vel.y;
      p.delay=p._s3SloshBirthDelay;
      try{if(!p.ghost)context.G?.netm?.recProj?.(p);}
      finally{p.delay=0;p._s3SloshBirthPending=false;}
    }
    return step.call(this,p,dt);
  };
  Projectiles.prototype.ghostProjectile=function(actor,event){
    if(!validFidelityRollerUnitPacket(event))return null;
    const before=this.list.length;const result=ghost.call(this,actor,event);
    if(this.list.length>before){const p=this.list.at(-1);const special=api.SPECIALS&&Object.hasOwn(api.SPECIALS,p.wid)?api.SPECIALS[p.wid]:null;
      if(!p.s3SpecialWeapon&&typeof special?.projectileDescriptor==='function'){p.s3SpecialWeapon=special.projectileDescriptor(p);p.s3Weapon=p.s3SpecialWeapon;}
      const kitOffset=event.length===35?2:0;if((event.length===33||event.length===35)&&event[30+kitOffset]>=0){p.fidelityRollerUnitIndex=event[30+kitOffset];p.fidelityMode=event[27+kitOffset]===1?'vertical':'horizontal';}initialize(p,p.s3SpecialWeapon||WEAPONS[p.wid]||actor.weapon);if(p.ghost&&p.type==='slosh'&&p.s3Weapon?.kind==='slosher'){p._s3SloshBirthGhost=true;p.delay=0;p._s3SloshBirthPending=false;}}
    return result;
  };
  const slosh=Projectiles.prototype.fireSlosh;
  Projectiles.prototype.fireSlosh=function(actor,w){
    const previous=this._fidelitySloshContext;this._fidelitySloshContext={index:0,group:new Map(),groupId:`${actor.nid??'local'}:${++slosherVolleySequence}`};
    try{
      const drops=rawWeapon(w).UnitGroupParam.Unit.reduce((n,u)=>n+(u.BulletNum??1),0);
      return slosh.call(this,actor,cachedWeaponOverrideConfig(slosherDropConfigs,w,'drops',drops));
    }
    finally{this._fidelitySloshContext=previous;}
  };
  // The HUD writes ShotGuide offsets at 0.1 CSS-pixel precision. A tiny native
  // idle-pose change can therefore reuse the prior *presentation* point only
  // when a conservative projection bound proves that rounding cannot change.
  // LOS reuse has a separate geometric certificate: the muzzle-to-body segment
  // must stay clear inside an expanded OBB tube. All gameplay inputs remain exact.
  const THREE=context.THREE;
  const S3_GUIDE_POSE_RADIUS=.02;
  const S3_GUIDE_FIELDS=Object.freeze([
    'mode','actor','weapon','actorWeapon','character','getMuzzle','getAimMuzzle','aimReadyMethod','aimReady',
    'weaponId','weaponKind','weaponShotGuideFrame','frame','shotGuide','unitOrder','bulletOrder','randomGuideBlocked',
    'raw','unitGroup','unitArray','unit','move','weaponBallistics','ballisticStraight','ballisticBurst',
    'projectileSpeed','weaponStraight','weaponGravity','weaponDrag','moveFreeGravity','moveFreeDrag',
    'moveEndSpeed','moveBrakeDrag','moveBrakeGravity','moveFreeVelocityY','moveFreeFrame','moveHz',
    'unitDelay','unitOffsetDelay','unitBulletNum','unitGroundSpeed','unitAirSpeed','unitOffsetSpeed','unitBaseYaw',
    'unitRandomYaw','unitRandomOffOrder','unitAddYRate','unitMove','unitGoStraightFrame','unitEndSpeed',
    'unitBrakeDrag','unitBrakeGravity','unitFreeDrag','unitFreeGravity','unitFreeVelocityY','unitFreeFrame',
    'actorForm','grounded','climbing','dancing','specialActive','superJumpState','aimPitch',
    'aimDirX','aimDirY','aimDirZ','aimPointX','aimPointY','aimPointZ','actorPosX','actorPosY','actorPosZ',
    'actorVelX','actorVelZ','blasterZRate',
    'runner','runnerCharge','runnerChargeT','runnerCharging','runnerStreaming','runnerFidelityCharge',
    'runnerBlasterJump','runnerBlasterWindup',
    'game','stage','gameLevel','physics','physicsLos','physicsRaycast','level','levelLayout','levelExtra',
    'levelBlocks','levelFaces','levelHash','levelBlocksLength','levelFacesLength','levelHashLength','geometryGeneration',
    'poseX','poseY','poseZ'
  ]);
  const S3_GUIDE_CORE_FIELDS=Object.freeze(S3_GUIDE_FIELDS.filter(k=>k!=='poseX'&&k!=='poseY'&&k!=='poseZ'));
  function s3GuideCache(system){
    return system._s3GuideCache||(system._s3GuideCache={
      sample:{},key:{},point:new THREE.Vector3(),queryIds:[],valid:false,mode:null,clearRadius:0,
      pose:{muzzle:new THREE.Vector3(),aimMuzzle:new THREE.Vector3(),base:new THREE.Vector3(),fallback:new THREE.Vector3(),
        delta:new THREE.Vector3(),relative:new THREE.Vector3()},pointX:0,pointY:0,pointZ:0
    });
  }
  function captureS3Guide(system,actor,w,mode,cache){
    const ch=actor?.character,dir=actor?.aimDir,target=actor?.aimPoint,pose=cache.pose,s=cache.sample;
    if(!actor||!w||!ch?.getMuzzle||!actor.pos||!dir||!target)return false;
    ch.getMuzzle(pose.muzzle);
    const ready=typeof ch.aimReady==='function'?ch.aimReady():1;
    if(ready<.98&&typeof ch.getAimMuzzle==='function'&&ch.getAimMuzzle(pose.aimMuzzle,actor.aimPitch))
      pose.muzzle.lerp(pose.aimMuzzle,1-ready);
    pose.base.copy(actor.pos);pose.base.y+=actor.form==='squid' ? .4 : 1.05;
    const raw=rawWeapon(w),guide=w.shotGuide,unit=mode==='slosher'?guide&&raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum]:null;
    const unitMove=unit?.MoveParam,move=moves.get(w.id)||null,runner=actor.weaponRunner;
    const game=api.G,physics=game?.physics,level=physics?.level||game?.level||null;
    s.mode=mode;s.actor=actor;s.weapon=w;s.actorWeapon=actor.weapon;s.character=ch;
    s.getMuzzle=ch.getMuzzle;s.getAimMuzzle=ch.getAimMuzzle;s.aimReadyMethod=ch.aimReady;s.aimReady=ready;
    s.weaponId=w.id;s.weaponKind=w.kind;s.weaponShotGuideFrame=w.shotGuideFrame;
    s.frame=mode==='slosher'?guide?.frame:w.shotGuideFrame;s.shotGuide=guide;
    s.unitOrder=guide?.unitOrderNum;s.bulletOrder=guide?.bulletOrderNumInUnit;
    s.randomGuideBlocked=!!unit&&(unit.RandomRotateYDegree||0)!==0&&!unit.RandomRotateYOffOrderNum?.includes(guide.bulletOrderNumInUnit);
    s.raw=raw;s.unitGroup=raw?.UnitGroupParam;s.unitArray=raw?.UnitGroupParam?.Unit;s.unit=unit;s.move=move;
    s.weaponBallistics=w.ballistics;s.ballisticStraight=w.ballistics?.straightTime;s.ballisticBurst=w.ballistics?.burstTime;
    s.projectileSpeed=w.projSpeed;s.weaponStraight=w.straightTime;s.weaponGravity=w.referenceGravity;s.weaponDrag=w.drag;
    s.moveFreeGravity=move?.freeGravity;s.moveFreeDrag=move?.freeDrag;s.moveEndSpeed=move?.endSpeed;
    s.moveBrakeDrag=move?.brakeDrag;s.moveBrakeGravity=move?.brakeGravity;s.moveFreeVelocityY=move?.freeVelocityY;
    s.moveFreeFrame=move?.freeFrame;s.moveHz=move?.hz;
    s.unitDelay=unit?.UnitDelayFrame;s.unitOffsetDelay=unit?.AfterOffsetDelayFrame;s.unitBulletNum=unit?.BulletNum;
    s.unitGroundSpeed=unit?.SpawnSpeedGround;s.unitAirSpeed=unit?.SpawnSpeedAir;s.unitOffsetSpeed=unit?.AfterOffsetSpawnSpeed;
    s.unitBaseYaw=unit?.BaseRotateYDegree;s.unitRandomYaw=unit?.RandomRotateYDegree;
    s.unitRandomOffOrder=unit?.RandomRotateYOffOrderNum;s.unitAddYRate=unit?.AddSpawnSpeedYRateByXZ;s.unitMove=unitMove;
    s.unitGoStraightFrame=unitMove?.GoStraightToBrakeStateFrame;s.unitEndSpeed=unitMove?.GoStraightStateEndMaxSpeed;
    s.unitBrakeDrag=unitMove?.BrakeAirResist;s.unitBrakeGravity=unitMove?.BrakeGravity;
    s.unitFreeDrag=unitMove?.FreeAirResist;s.unitFreeGravity=unitMove?.FreeGravity;
    s.unitFreeVelocityY=unitMove?.BrakeToFreeVelocityY;s.unitFreeFrame=unitMove?.BrakeToFreeStateFrame;
    s.actorForm=actor.form;s.grounded=actor.grounded;s.climbing=actor.climbing;s.dancing=actor.dance;
    s.specialActive=actor.specialActive;s.superJumpState=actor.superJumpState;s.aimPitch=actor.aimPitch;
    s.aimDirX=dir.x;s.aimDirY=dir.y;s.aimDirZ=dir.z;s.aimPointX=target.x;s.aimPointY=target.y;s.aimPointZ=target.z;
    s.actorPosX=actor.pos.x;s.actorPosY=actor.pos.y;s.actorPosZ=actor.pos.z;
    s.actorVelX=actor.vel?.x;s.actorVelZ=actor.vel?.z;
    s.blasterZRate=mode==='blaster'?raw?.spl__SpawnBulletAdditionMovePlayerParam?.ZRate:null;
    s.runner=runner;s.runnerCharge=runner?.charge;s.runnerChargeT=runner?.chargeT;s.runnerCharging=runner?.charging;
    s.runnerStreaming=runner?.streaming;s.runnerFidelityCharge=runner?.fidelitySplatlingCharge;
    s.runnerBlasterJump=runner?.s3BlasterJumpT;s.runnerBlasterWindup=runner?.s3BlasterWindup;
    s.game=game;s.stage=game?.stage??game?.map??null;s.gameLevel=game?.level;s.physics=physics;
    s.physicsLos=physics?.los;s.physicsRaycast=physics?.raycast;s.level=level;s.levelLayout=level?.layout;s.levelExtra=level?.extra;
    s.levelBlocks=level?.blocks;s.levelFaces=level?.faces;s.levelHash=level?.hash;
    s.levelBlocksLength=level?.blocks?.length;s.levelFacesLength=level?.faces?.length;s.levelHashLength=level?.hash?.length;
    s.geometryGeneration=level?.geometryGeneration??level?._geometryGeneration??level?._generation;
    s.poseX=pose.muzzle.x;s.poseY=pose.muzzle.y;s.poseZ=pose.muzzle.z;
    return true;
  }
  function sameS3GuideFields(a,b,fields){for(const k of fields)if(a[k]!==b[k])return false;return true;}
  function copyS3GuideFields(out,input){for(const k of S3_GUIDE_FIELDS)out[k]=input[k];}
  function s3GuidePoseError(cache,mode){
    const a=cache.key,b=cache.sample,dx=b.poseX-a.poseX,dy=b.poseY-a.poseY,dz=b.poseZ-a.poseZ;
    const moved=Math.hypot(dx,dy,dz);
    if(!Number.isFinite(moved))return Infinity;
    if(mode==='slosher')return moved; // fixed aimDir and movement law: the whole prediction translates with its muzzle.
    const x=a.aimPointX-a.poseX,y=a.aimPointY-a.poseY,z=a.aimPointZ-a.poseZ;
    const nx=a.aimPointX-b.poseX,ny=a.aimPointY-b.poseY,nz=a.aimPointZ-b.poseZ;
    const d0=Math.hypot(x,y,z),d1=Math.hypot(nx,ny,nz);
    const dot0=x*a.aimDirX+y*a.aimDirY+z*a.aimDirZ,dot1=nx*a.aimDirX+ny*a.aimDirY+nz*a.aimDirZ;
    const fallback0=d0<2||dot0<0,fallback1=d1<2||dot1<0;
    if(fallback0!==fallback1)return Infinity;
    if(fallback0)return moved;
    const dmin=Math.min(d0,d1),speed=Math.abs(a.projectileSpeed),duration=Math.max(0,a.frame/60);
    if(!(dmin>0)&&moved>0||!Number.isFinite(speed)||!Number.isFinite(duration))return Infinity;
    const directionDelta=Math.min(2,2*moved/dmin);
    // Gravity and drag are position-independent; the installed drag law never amplifies a direction delta.
    return moved+speed*duration*directionDelta;
  }
  function pixelRoundingClearance(px){const v=px*10;return Math.abs((v-Math.floor(v))-.5)/10;}
  function projectedS3GuideErrorFits(point,camera,width,height,error){
    const v=camera?.matrixWorldInverse?.elements,p=camera?.projectionMatrix?.elements;
    if(!v||!p||!(width>0)||!(height>0)||!Number.isFinite(error))return false;
    const x=point.x,y=point.y,z=point.z;
    const ex=v[0]*x+v[4]*y+v[8]*z+v[12],ey=v[1]*x+v[5]*y+v[9]*z+v[13],ez=v[2]*x+v[6]*y+v[10]*z+v[14];
    const cx=p[0]*ex+p[4]*ey+p[8]*ez+p[12],cy=p[1]*ex+p[5]*ey+p[9]*ez+p[13];
    const cz=p[2]*ex+p[6]*ey+p[10]*ez+p[14],cw=p[3]*ex+p[7]*ey+p[11]*ez+p[15];
    const qx0=p[0]*v[0]+p[4]*v[1]+p[8]*v[2],qx1=p[0]*v[4]+p[4]*v[5]+p[8]*v[6],qx2=p[0]*v[8]+p[4]*v[9]+p[8]*v[10];
    const qy0=p[1]*v[0]+p[5]*v[1]+p[9]*v[2],qy1=p[1]*v[4]+p[5]*v[5]+p[9]*v[6],qy2=p[1]*v[8]+p[5]*v[9]+p[9]*v[10];
    const qz0=p[2]*v[0]+p[6]*v[1]+p[10]*v[2],qz1=p[2]*v[4]+p[6]*v[5]+p[10]*v[6],qz2=p[2]*v[8]+p[6]*v[9]+p[10]*v[10];
    const qw0=p[3]*v[0]+p[7]*v[1]+p[11]*v[2],qw1=p[3]*v[4]+p[7]*v[5]+p[11]*v[6],qw2=p[3]*v[8]+p[7]*v[9]+p[11]*v[10];
    const dw=error*Math.hypot(qw0,qw1,qw2),absW=Math.abs(cw),den=absW-dw;
    if(!(cw>0)||!(den>1e-9))return false;
    const dx=error*Math.hypot(qx0,qx1,qx2),dy=error*Math.hypot(qy0,qy1,qy2),dz=error*Math.hypot(qz0,qz1,qz2);
    const bx=(dx*absW+Math.abs(cx)*dw)/(absW*den),by=(dy*absW+Math.abs(cy)*dw)/(absW*den),bz=(dz*absW+Math.abs(cz)*dw)/(absW*den);
    const ndcZ=cz/cw,px=(cx/cw)*width*.5,py=-(cy/cw)*height*.5;
    if(!Number.isFinite(bx)||!Number.isFinite(by)||!Number.isFinite(bz)||!(ndcZ+bz<1))return false;
    return bx*width*.5<pixelRoundingClearance(px)&&by*height*.5<pixelRoundingClearance(py);
  }
  function segmentTouchesExpandedBlock(start,end,block,r,pose){
    const center=block?.center,half=block?.half,axes=block?.axes;
    if(!center||!half||!axes||axes.length<3)return true;
    pose.delta.copy(end).sub(start);pose.relative.copy(start).sub(center);
    let enter=0,leave=1;
    for(let k=0;k<3;k++){
      const axis=axes[k],h=(k===0?half.x:k===1?half.y:half.z)+r;
      const o=pose.relative.dot(axis),d=pose.delta.dot(axis);
      if(!Number.isFinite(o)||!Number.isFinite(d)||!Number.isFinite(h))return true;
      if(Math.abs(d)<1e-9){if(o < -h||o > h)return false;continue;}
      let lo=(-h-o)/d,hi=(h-o)/d;if(lo>hi){const t=lo;lo=hi;hi=t;}
      enter=Math.max(enter,lo);leave=Math.min(leave,hi);if(enter>leave)return false;
    }
    return leave>=0&&enter<=1;
  }
  function certifyS3GuideMuzzleRadius(cache,actor,usedMuzzle){
    const pose=cache.pose,raw=pose.muzzle,r=S3_GUIDE_POSE_RADIUS;
    if(!Number.isFinite(raw.x)||!Number.isFinite(raw.y)||!Number.isFinite(raw.z)||
       usedMuzzle.x!==raw.x||usedMuzzle.y!==raw.y||usedMuzzle.z!==raw.z)return 0;
    const d2=raw.distanceToSquared(pose.base),len=Math.sqrt(d2);
    if(!(d2<=2.5)||!(len>r+1e-4)||d2+2*len*r+r*r>=2.5)return 0;
    pose.fallback.copy(pose.base).addScaledVector(actor.aimDir,.3);
    if(raw.x===pose.fallback.x&&raw.y===pose.fallback.y&&raw.z===pose.fallback.z)return 0;
    const level=api.G?.physics?.level,blocks=level?.blocks;
    if(!level?.queryBlocks||!blocks)return 0;
    const ids=cache.queryIds;
    const found=level.queryBlocks(Math.min(pose.base.x,raw.x)-r,Math.min(pose.base.z,raw.z)-r,
      Math.max(pose.base.x,raw.x)+r,Math.max(pose.base.z,raw.z)+r,ids)||ids;
    for(let i=0;i<found.length;i++){
      const block=blocks[found[i]];if(!block)return 0;
      if(!block.solid||block.grate)continue;
      if(segmentTouchesExpandedBlock(pose.base,raw,block,r,pose))return 0;
    }
    // Level builds immutable block/hash/face geometry in its constructor. The
    // Level + those references/counts above act as the geometry generation.
    return r;
  }
  function cachedS3Guide(system,actor,w,mode,camera,width,height){
    const cache=s3GuideCache(system),guide=w?.shotGuide,raw=rawWeapon(w);
    const unit=mode==='slosher'&&guide&&raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum];
    const index=guide?.bulletOrderNumInUnit;
    if(mode==='slosher'){
      if(w?.kind!=='slosher'||!unit||!Number.isInteger(index)||index<0||index>=(unit.BulletNum??1)||!Number.isFinite(guide.frame)||
         ((unit.RandomRotateYDegree||0)!==0&&!unit.RandomRotateYOffOrderNum?.includes(index))){cache.valid=false;return null;}
    }else if(mode!=='blaster'||w?.kind!=='blaster'||!Number.isFinite(w.shotGuideFrame)){cache.valid=false;return null;}
    if(!captureS3Guide(system,actor,w,mode,cache)){cache.valid=false;return mode==='slosher'?computeS3SlosherGuide(system,actor,w):computeS3BlasterGuide(system,actor,w);}
    if(cache.valid&&cache.mode===mode&&cache.point.x===cache.pointX&&cache.point.y===cache.pointY&&cache.point.z===cache.pointZ){
      if(sameS3GuideFields(cache.key,cache.sample,S3_GUIDE_FIELDS))return cache.point;
      if(sameS3GuideFields(cache.key,cache.sample,S3_GUIDE_CORE_FIELDS)){
        const moved=Math.hypot(cache.sample.poseX-cache.key.poseX,cache.sample.poseY-cache.key.poseY,cache.sample.poseZ-cache.key.poseZ);
        if(moved<=cache.clearRadius){
          const error=s3GuidePoseError(cache,mode);
          if(projectedS3GuideErrorFits(cache.point,camera,width,height,error))return cache.point;
        }
      }
    }
    cache.valid=false;
    const point=mode==='slosher'?computeS3SlosherGuide(system,actor,w):computeS3BlasterGuide(system,actor,w);
    if(!point)return null;
    cache.point.copy(point);cache.pointX=cache.point.x;cache.pointY=cache.point.y;cache.pointZ=cache.point.z;
    copyS3GuideFields(cache.key,cache.sample);cache.mode=mode;cache.valid=true;cache.clearRadius=0;
    const projectile=mode==='slosher'?system._s3SlosherGuideProjectile:system._s3BlasterGuideProjectile;
    if(projectile?.start)cache.clearRadius=certifyS3GuideMuzzleRadius(cache,actor,projectile.start);
    return cache.point;
  }
  function computeS3SlosherGuide(system,actor,w){
    const guide=w?.shotGuide,raw=rawWeapon(w),unit=guide&&raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum];
    const index=guide?.bulletOrderNumInUnit;
    if(!unit||!Number.isInteger(index)||index<0||index>=(unit.BulletNum??1)||!Number.isFinite(guide.frame))return null;
    if((unit.RandomRotateYDegree||0)!==0&&!unit.RandomRotateYOffOrderNum?.includes(index))return null;
    const p=system._s3SlosherGuideProjectile||(system._s3SlosherGuideProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    system._muzzle(actor,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    p.owner=actor;p.type='slosh';p.wid=w.id;p.s3Weapon={...w};p.age=0;p.life=2.4;p.straight=0;
    p.delay=((unit.UnitDelayFrame||0)+index*(unit.AfterOffsetDelayFrame||0))/60;
    p.fidelitySloshUnit=unit;p.fidelitySloshIndex=index;p.fidelityPhase=0;p.fidelityMove=null;
    p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    const speed=((actor.grounded?unit.SpawnSpeedGround:unit.SpawnSpeedAir)+index*(unit.AfterOffsetSpawnSpeed||0))*60;
    const aim=(system._s3SlosherGuideAim||(system._s3SlosherGuideAim=new THREE.Vector3())).copy(actor.aimDir).normalize();
    const yaw=Math.atan2(aim.x,aim.z)+radians(unit.BaseRotateYDegree||0);
    const pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),horizontal=Math.cos(pitch)*speed;
    p.vel.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*speed+horizontal*(unit.AddSpawnSpeedYRateByXZ||0),Math.cos(yaw)*horizontal);
    initialize(p,w);
    let remaining=Math.max(0,guide.frame/60-p.delay);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
  }
  function computeS3BlasterGuide(system,actor,w){
    const frame=w?.shotGuideFrame;
    if(w?.kind!=='blaster'||!Number.isFinite(frame))return null;
    const p=system._s3BlasterGuideProjectile||(system._s3BlasterGuideProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    const dir=system._s3BlasterGuideDir||(system._s3BlasterGuideDir=new THREE.Vector3());
    system._muzzle(actor,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    system._aimFrom(actor,p.pos,dir);
    p.owner=actor;p.type='blast';p.wid=w.id;p.s3Weapon={...w};p.age=0;p.life=2;p.straight=0;
    p.delay=0;p.ghost=false;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
    p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
    p.s3BlasterForwardApplied=false;
    applyBlasterSpawnVelocity(p);
    let remaining=Math.max(0,frame/60);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
  }
  Projectiles.prototype.s3SlosherGuide=function(actor,w){
    const guide=w?.shotGuide,raw=rawWeapon(w);
    const unit=guide&&raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum];
    const index=guide?.bulletOrderNumInUnit;
    if(!unit||!Number.isInteger(index)||index<0||index>=(unit.BulletNum??1)||!Number.isFinite(guide.frame))return null;
    // The selected Bucket Slosher guide projectile (unit 1 / bullet 0) has
    // random yaw disabled in the pinned source. Refuse to invent a random HUD
    // guide if a future profile selects a randomized projectile instead.
    if((unit.RandomRotateYDegree||0)!==0&&!unit.RandomRotateYOffOrderNum?.includes(index))return null;
    const THREE=context.THREE;
    const p=this._s3SlosherGuideProjectile||(this._s3SlosherGuideProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    this._muzzle(actor,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    p.owner=actor;p.type='slosh';p.wid=w.id;p.s3Weapon=w;p.age=0;p.life=2.4;p.straight=0;
    p.delay=((unit.UnitDelayFrame||0)+index*(unit.AfterOffsetDelayFrame||0))/60;
    p.fidelitySloshUnit=unit;p.fidelitySloshIndex=index;p.fidelityPhase=0;p.fidelityMove=null;
    p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    const speed=((actor.grounded?unit.SpawnSpeedGround:unit.SpawnSpeedAir)+index*(unit.AfterOffsetSpawnSpeed||0))*60;
    const aim=(this._s3SlosherGuideAim||(this._s3SlosherGuideAim=new THREE.Vector3())).copy(actor.aimDir).normalize();
    const yaw=Math.atan2(aim.x,aim.z)+radians(unit.BaseRotateYDegree||0);
    const pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),horizontal=Math.cos(pitch)*speed;
    p.vel.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*speed+horizontal*(unit.AddSpawnSpeedYRateByXZ||0),Math.cos(yaw)*horizontal);
    initialize(p,w);
    let remaining=Math.max(0,guide.frame/60-p.delay);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
  };
  Projectiles.prototype.s3DualiesGuides=function(actor,w){
    const frame=w?.shotGuideFrame;
    if(w?.kind!=='dualies'||!Number.isFinite(frame))return null;
    const THREE=context.THREE;
    const points=this._s3DualiesGuidePoints||(this._s3DualiesGuidePoints=[new THREE.Vector3(),new THREE.Vector3()]);
    const dirs=this._s3DualiesGuideDirs||(this._s3DualiesGuideDirs=[new THREE.Vector3(),new THREE.Vector3()]);
    const shots=this._s3DualiesGuideProjectiles||(this._s3DualiesGuideProjectiles=[0,1].map(()=>({
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    })));
    for(let hand=0;hand<2;hand++){
      const p=shots[hand],out=points[hand],dir=dirs[hand];
      this._muzzleHand(actor,hand,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
      this._aimFrom(actor,p.pos,dir);
      fidelityAimConvergence(p.pos,dir,actor.aimPoint,w,w.projSpeed);
      p.owner=actor;p.type='shot';p.wid=w.id;p.s3Weapon={...w};p.age=0;p.life=1.2;p.straight=w.straightTime;
      p.delay=0;p.ghost=false;p.size=w.impactRadius??.15;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
      p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
      p.vel.copy(dir).multiplyScalar(w.projSpeed);
      initialize(p,w);
      let remaining=Math.max(0,frame/60);
      while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
      out.copy(p.pos);
    }
    if(actor.weaponRunner?.s3Turret){
      const center=this._s3DualiesGuideCenter||(this._s3DualiesGuideCenter=new THREE.Vector3());
      center.copy(points[0]).add(points[1]).multiplyScalar(.5);
      points[0].copy(center);points[1].copy(center);
    }
    return points;
  };
  Projectiles.prototype.s3WeaponGuide=function(actor,w){
    if(w?.kind==='slosher')return this.s3SlosherGuide(actor,w);
    const frame=w?.shotGuideFrame;
    if(w?.kind!=='blaster'||!Number.isFinite(frame))return null;
    const THREE=context.THREE;
    const p=this._s3BlasterGuideProjectile||(this._s3BlasterGuideProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    const dir=this._s3BlasterGuideDir||(this._s3BlasterGuideDir=new THREE.Vector3());
    this._muzzle(actor,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    this._aimFrom(actor,p.pos,dir);
    p.owner=actor;p.type='blast';p.wid=w.id;p.s3Weapon=w;p.age=0;p.life=2;p.straight=0;
    p.delay=0;p.ghost=false;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
    p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
    p.s3BlasterForwardApplied=false;
    applyBlasterSpawnVelocity(p);
    let remaining=Math.max(0,frame/60);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
  };
  Projectiles.prototype.s3SlosherGuide=function(actor,w,camera,width,height){
    return cachedS3Guide(this,actor,w,'slosher',camera,width,height);
  };
  Projectiles.prototype.s3WeaponGuide=function(actor,w,camera,width,height){
    if(w?.kind==='slosher')return this.s3SlosherGuide(actor,w,camera,width,height);
    if(w?.kind!=='blaster'){if(this._s3GuideCache)this._s3GuideCache.valid=false;return null;}
    return cachedS3Guide(this,actor,w,'blaster',camera,width,height);
  };
  // Issue #94: the Shooter-only weapon-side reticle previews the nominal
  // (unspread) shot's first field contact. Spawn state comes from the same
  // _muzzle/_aimFrom/_ballistic path fireShooter uses, integration from
  // advanceFidelityProjectile, and the field query from the composed swept
  // sweep with the sourced field collision radius, all bounded by the existing
  // projectile lifetime — so the preview point is the real impact of the center
  // shot, and geometry beyond the shot's flight never warns. Read-only: one
  // cached scratch projectile, no RNG, no list/paint/audio/network mutation.
  Projectiles.prototype.s3ShooterImpact=function(actor,w){
    if(!actor||!w||w.kind!=='shooter'||!actor.aimPoint||!actor.aimDir||!actor.character||
      typeof actor.character.getMuzzle!=='function'||!api.G?.physics||
      typeof this._muzzle!=='function'||typeof this._aimFrom!=='function'||typeof this._ballistic!=='function')return null;
    const THREE=context.THREE;
    const p=this._s3ShooterImpact||(this._s3ShooterImpact={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()});
    const dir=this._s3ShooterImpactDir||(this._s3ShooterImpactDir=new THREE.Vector3());
    this._muzzle(actor,p.pos);
    this._aimFrom(actor,p.pos,dir);
    // fireShooter pitches the nominal launch toward the aim point before spread.
    this._ballistic(p.pos,dir,actor.aimPoint,w.projSpeed,w.straightTime,28,0.8,w.range);
    p.owner=actor;p.team=actor.team;p.type='shot';p.ghost=false;p.delay=0;p.vol=null;
    p.s3DamageGroup=null;p.fidelitySloshUnit=null;p.fidelityRollerUnit=null;p.fidelityMode=null;
    p.fidelityWallDrop=null;p.fidelityImpactActor=null;p.fidelityImpactT=null;
    p.age=0;p.fidelityPrevAge=0;p.life=1.2;p.straight=w.straightTime;p.grav=28;p.drag=0.8;
    p.radius=w.impactRadius;p.size=0.15;p.seed=0;p.wid=null;p.head=false;p.dmgFar=undefined;
    p.prev.copy(p.pos);p.start.copy(p.pos);
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
    const hit=this._s3ShooterImpactHit||(this._s3ShooterImpactHit=new api.Hit());
    let guard=0;
    while(p.age+EPSILON<p.life){
      advanceFidelityProjectile(p,1/60);
      sweptWorldHit(api.G.physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge),fieldRadiusAt(p,p.age),hit,true);
      if(hit.hit)return hit;
      if(p.pos.y<api.PLAYER.waterY-1.8)return null;
      if(++guard>144)return null;
    }
    return null;
  };
  const reset=WeaponRunner.prototype.reset,auto=WeaponRunner.prototype._auto,spin=WeaponRunner.prototype._splatling;
  WeaponRunner.prototype.reset=function(...args){const result=reset.apply(this,args);this.fidelitySplatlingCharge=null;return result;};
  WeaponRunner.prototype._auto=function(dt,input,w){
    if(w.kind==='blaster' && this.s3BlasterWindup>0 && this.s3BlasterWindup-dt<=EPSILON)this.cooldown=0;
    return auto.call(this,dt,input,w);
  };
  WeaponRunner.prototype._splatling=function(dt,input,w){
    if(this.charging && !input.fire)this.fidelitySplatlingCharge=this.charge;
    return spin.call(this,dt,input,w);
  };
  const fireSpin=Projectiles.prototype.fireSplatling;
  Projectiles.prototype.fireSplatling=function(actor,w,spread){
    // Charge selects the deterministic base. The dedicated Splatling _fireRound
    // owner applies the sourced absolute speed sampling once, before recording.
    const speed=splatlingLaunchSpeed(w,actor.weaponRunner.fidelitySplatlingCharge??actor.weaponRunner.charge??0);
    return withWeaponScalarOverride(splatlingSpeedViews,w,'projSpeed',speed,
      config=>fireSpin.call(this,actor,config,spread));
  };
  // Boss and player hits share the same weapon damage envelope. The old native
  // boss path used a separate seven-unit falloff and an unrelated 0.3s throttle.
  const bossImpact=Projectiles.prototype._bossImpact,blastBurst=Projectiles.prototype._blastBurst;
  Projectiles.prototype._bossImpact=function(p,hit){
    if(p.ghost||!kitVolleyHitAuthority(p))return;
    const w=p.s3Weapon||p.owner.weapon;
    if(!['roller','slosher','shooter','dualies','splatling'].includes(w.kind))return bossImpact.call(this,p,hit);
    const victim=hit.target?.hp!==undefined&&hit.target?.id!==undefined?hit.target:context.G.boss;
    const damage=groupDamage(p.s3DamageGroup,victim,fidelityDamage(p,hit.point));
    if(damage>0)context.G.boss.hit(p.owner,damage,hit.target,w.id,hit.point.clone());
    context.emit('weapon:impact',{pos:hit.point.clone(),normal:p.vel.clone().normalize().negate(),team:p.team,kind:p.type==='shot'?'shot':'drop',radius:p.radius*.5,victim:null});
  };
  Projectiles.prototype._blastBurst=function(p,point,victim){
    if(!p.ghost)return blastBurst.call(this,p,point,victim);
    const w=p.s3Weapon||WEAPONS.blaster;
    context.G.fx?.explosion(point,p.owner.color,w.burstRadius);
    context.G.audio?.play('blaster_boom',{pos:point,volume:.7});
  };
  const nativeImpact=Projectiles.prototype._impact;
  Projectiles.prototype._impact=function(p,hit){
    if(!p.ghost)return nativeImpact.call(this,p,hit);
    // A disconnected ghost still cannot mutate paint even when G.netm is gone.
    if(p.type==='blast')this._blastBurst(p,hit.point,null);
    else context.G.fx?.burst(hit.point,hit.normal,p.owner.color,{count:5,speed:3,size:.07,paint:false});
  };
  installChargerFlight(context,completion);
}

// ---------------------------------------------------------------------------
// S3 ShotGuideFrame aiming guide — #769 (Heavy Splatling) and #459 (Splattershot).
//
// These helpers live here rather than in a dedicated module because every one of
// them is a pure function of the installed main-weapon motion law below, and a
// separate core module would have added a static import to the core preload
// graph and broken the startup request budget.
//
// The pinned Ver. 11.3.0 WeaponParam.ShotGuideFrame was already mirrored in
// profile.json's weaponsFidelityCompletion table (shooter 8, splatling 11) but
// never reached the live weapon profile, so nothing downstream could consume it
// and the reticle stayed on the generic screen-centre anchor.
//
// Rules this section keeps:
//  * The live `shotGuideFrame` value must equal the pinned source value, or the
//    install fails closed. The field is promoted, not invented.
//  * The guide is a pure dry prediction. It reuses the installed projectile
//    motion law (advanceFidelityProjectile + the installed move record) and the
//    installed muzzle/aim/launch-speed law, advances exactly ShotGuideFrame
//    fixed 60 Hz steps, and consumes no random draw. There is no second
//    projectile engine and no spread sample.
//  * Authoritative state is untouched: camera aim, aimPoint, onTarget, inRange,
//    launch direction, damage, trajectory and the PRNG stream are not modified.
//    The guide never steers a projectile toward a screen point.
const GUIDE_HZ = 60;
// Screen inset used when a guide point leaves the viewport. This mirrors the
// existing ally-marker clamp in main.js; it is an INKWAVE presentation choice
// and is not claimed as an unpublished Nintendo screen-pixel value.
const GUIDE_EDGE_MARGIN = 40;
// Deliberately separate from `api`: installShotGuide may run before or after
// installWeaponsFidelity, and the guide must not depend on that ordering.
let guideApi;

export function shotGuideFrames(weapon) {
  const frames = weapon?.shotGuideFrame;
  return Number.isInteger(frames) && frames > 0 ? frames : null;
}

function guideScratch() {
  return guideApi._shotGuide || (guideApi._shotGuide = {
    muzzle: new guideApi.THREE.Vector3(), dir: new guideApi.THREE.Vector3(), projected: new guideApi.THREE.Vector3(),
    probe: {
      pos: new guideApi.THREE.Vector3(), prev: new guideApi.THREE.Vector3(), vel: new guideApi.THREE.Vector3(),
      age: 0, life: 1, straight: 0, grav: 0, drag: 0, fidelityMove: null, fidelityPhase: 0, fidelityPrevAge: 0,
    },
    state: { x: 0, y: 0, z: 0, frames: 0 },
  });
}

// Deterministic no-spread launch state for one weapon, exactly as the installed
// launch path would build it before the random cone is applied.
function guideLaunchState(actor, weapon, out) {
  const projectiles = guideApi.G.projectiles;
  const probe = out.probe, runner = actor.weaponRunner;
  const charge = runner?.fidelitySplatlingCharge ?? runner?.charge ?? 0;
  projectiles._muzzle(actor, out.muzzle);
  // Match the installed centerline convergence before advancing the guide.
  // Skip the random cone and spawn-speed bias so this is a deterministic guide.
  projectiles._aimFrom(actor, out.muzzle, out.dir);
  const speed = weapon.kind === 'splatling' ? splatlingLaunchSpeed(weapon, charge) : weapon.projSpeed;
  if (!Number.isFinite(speed) || speed <= 0) return null;
  fidelityAimConvergence(out.muzzle, out.dir, actor.aimPoint, weapon, speed);
  const move = fidelityMoveFor(weapon);
  probe.pos.copy(out.muzzle); probe.prev.copy(out.muzzle);
  probe.vel.copy(out.dir).multiplyScalar(speed);
  probe.age = 0; probe.fidelityPhase = 0; probe.fidelityPrevAge = 0;
  probe.straight = weapon.straightTime; probe.grav = weapon.referenceGravity;
  probe.drag = move ? move.freeDrag * GUIDE_HZ : 0;
  probe.fidelityMove = move;
  // Exactly the requested age, so the installed lifetime clamp never truncates
  // the guide short of ShotGuideFrame.
  probe.life = Number.MAX_SAFE_INTEGER;
  return probe;
}

// World point the weapon's own projectile passes through after ShotGuideFrame
// fixed steps. Returns the shared state object, or null when the weapon has no
// guide frame / no installed launch path.
export function computeShotGuide(actor) {
  const weapon = actor?.weapon, frames = shotGuideFrames(weapon);
  // Partial/source-only test realms can execute the adapted PlayerController
  // before installShotGuide owns a runtime context. That path has no guide,
  // rather than being allowed to dereference an uninstalled scratch owner.
  if (!guideApi || frames === null || (weapon?.kind !== 'shooter' && weapon?.kind !== 'splatling') || !guideApi.G?.projectiles) return null;
  const s = guideScratch();
  s.state.frames = 0;
  const probe = guideLaunchState(actor, weapon, s);
  if (!probe) return null;
  for (let i = 0; i < frames; i++) advanceFidelityProjectile(probe, 1 / GUIDE_HZ);
  s.state.x = probe.pos.x; s.state.y = probe.pos.y; s.state.z = probe.pos.z; s.state.frames = frames;
  return s.state;
}

// Called from the installed camera aim path. Writes the HUD-only guide state on
// the controller; the authoritative aim fields are not read back or changed.
// The result is copied into a per-controller record: computeShotGuide hands back a
// shared scratch, so publishing that reference would let another owner's guide
// overwrite this one (lab rigs and spectate both build a second controller).
export function updateShotGuide(controller) {
  if (!controller) return null;
  if (!controller.enabled || controller.a?.alive === false) { controller.shotGuide = null; return null; }
  const computed = computeShotGuide(controller.a);
  if (!computed) { controller.shotGuide = null; return null; }
  const state = controller._shotGuide || (controller._shotGuide = { x: 0, y: 0, z: 0, frames: 0 });
  state.x = computed.x; state.y = computed.y; state.z = computed.z; state.frames = computed.frames;
  controller.shotGuide = state;
  return state;
}

// World point -> screen pixels for the HUD only. Behind-camera and off-viewport
// results are clamped to the viewport edge so the guide stays reachable.
export function projectShotGuide(state, camera, width, height) {
  if (!guideApi || !state || !camera || !(width > 0) || !(height > 0)) return null;
  const s = guideScratch();
  s.projected.set(state.x, state.y, state.z).project(camera);
  if (!Number.isFinite(s.projected.x) || !Number.isFinite(s.projected.y)) return null;
  let x = (s.projected.x * 0.5 + 0.5) * width, y = (-s.projected.y * 0.5 + 0.5) * height;
  if (s.projected.z > 1) { x = width - x; y = height - y; }
  const clamp = (v, limit) => Math.min(limit - GUIDE_EDGE_MARGIN, Math.max(GUIDE_EDGE_MARGIN, v));
  return { x: clamp(x, width), y: clamp(y, height), frames: state.frames };
}

// HUD reticle placement, relative to the screen-centre anchor the reticle already
// uses. Weapons without a guide frame (and frames without a projected point) keep
// the existing centre placement untouched. Numeric dirty check: this runs on every
// render frame and must not allocate.
export function applyShotGuide(hud, projected, width, height) {
  const ret = hud?.ret;
  if (!ret) return null;
  const x = projected && width > 0 ? projected.x - width / 2 : 0;
  const y = projected && height > 0 ? projected.y - height / 2 : 0;
  const L = hud._L || (hud._L = {});
  const hasGuide = !!projected;
  if (L.guideProjected !== hasGuide || L.guideX == null || Math.abs(x - L.guideX) > 0.05 || Math.abs(y - L.guideY) > 0.05) {
    L.guideX = x; L.guideY = y; L.guideProjected = hasGuide;
    // No projected guide: restore the inherited Bucket/Blaster CSS offsets.
    // Inline zero would override translate(var(--gx) var(--gy)) on the reticle.
    ret.style.translate = hasGuide ? `${x.toFixed(1)}px ${y.toFixed(1)}px` : '';
  }
  return L;
}

export function installShotGuide(context, profile) {
  guideApi = context;
  const completion = profile.weaponsFidelityCompletion;
  if (!completion || completion.schema !== 1) throw new Error('Missing completion source table');
  // Promoted live field must agree with the pinned 11.3.0 source, per weapon.
  for (const [id, weapon] of Object.entries(context.WEAPONS)) {
    const live = weapon.shotGuideFrame;
    if (live == null) continue;
    if (!Number.isInteger(live) || live <= 0) throw new RangeError(`INKWAVE shot guide: ${id} shotGuideFrame must be a positive integer`);
    const pinned = completion.weapons[id]?.WeaponParam?.ShotGuideFrame;
    if (live !== pinned) throw new Error(`INKWAVE shot guide: ${id} live shotGuideFrame ${live} does not match pinned source ${pinned}`);
  }
}
