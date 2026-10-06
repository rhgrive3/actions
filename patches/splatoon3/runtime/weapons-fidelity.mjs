// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json.
// Source fields and interpreted equations are explicitly separated in the profile.
import {distanceDamage, groupDamage, applyProjectileHit as legacyHit, applySlosherVolleyHit} from './weapons.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { installChargerFlight } from './weapons-charger-flight.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
let api, completion, moves, slosherVolleySequence = 0;
const clamp01 = value => Math.max(0, Math.min(1, value));
const radians = degrees => degrees * Math.PI / 180;

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
export function fidelityPlayerCollisionRadius(p) { return radiusAt(p.fidelityPlayerCollision,p.age,p.size); }
function fieldRadiusAt(p,age) { return radiusAt(p.fidelityFieldCollision,age,p.fieldRadius||0); }
function setCollision(p,c,offset=0) {
  p.fidelityPlayerCollision=collisionRecord(c,'Player',offset);
  p.fidelityFieldCollision=collisionRecord(c,'Field',offset);
  // S3 teammate pass-through window from the pinned source CollisionParam.
  // Confined to verified Slosher (#717); Shooter (#656) is owned by parent PR #765.
  const kind=p.s3Weapon?.kind;
  p.fidelityFriendThrough=kind==='slosher' && Number.isFinite(c.FriendThroughFrameForPlayer)?c.FriendThroughFrameForPlayer:null;
  // Existing packet size carries initial radius; layout is unchanged.
  p.size=p.fidelityPlayerCollision.initRadius;
}
export function configureFidelityFlick(p, actor, weapon, index, angle, speed) {
  const b=weapon.ballistics, raw=rawWeapon(weapon);if(!b||!raw)return;
  // The attack argument owns this projectile's physics. Preserve it through
  // _push so a later actor/profile mutation cannot rewrite an already-fired volley.
  p.s3Weapon={...weapon}; p.wid=weapon.id;
  const vertical=!!actor.weaponRunner.s3FlickVertical;
  const group=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'];
  let offset=index,unit;
  for(const u of group.Unit){if(offset<(u.BulletNum??1)){unit=u;break;}offset-=u.BulletNum??1;}
  if(!unit)throw new RangeError('Roller index exceeds pinned units + labelled defaults');
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
  // #734: the damage sector's straight ahead is the swing forward, kept apart
  // from the fan offset above. Only this reference enters the hit-angle test.
  p.fidelitySectorYaw=actor.yaw;
  p.fidelityMode=vertical?'vertical':'horizontal';p.fidelityRollerUnit=unit;
  setCollision(p,unit.UnitParam.CollisionParam);
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
  if(!s.worldReady){sweptWorldHit(api.G.physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge??p.age),fieldRadiusAt(p,p.age),s.world,true);s.worldReady=true;}
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
export function fidelityProjectileTargets(system,p) {
  const s=scratch(system),{G,PLAYER}=api;
  s.worldReady=s.bossReady=false;s.boss=null;s.targets.length=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;
  // A completed wall-drop is an inert ink state, never a damaging projectile.
  // Keep the generic actor loop structurally intact for the network adapter, but
  // give it no targets on the terminal wall-drop frame.
  if (p.fidelityWallDrop?.done) return s.targets;
  // Ghosts share visual collision chronology, but never damage/paint ownership.
  const r0=radiusAt(p.fidelityPlayerCollision,p.fidelityPrevAge??p.age,p.size);
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
    s.base.set(actor.pos.x,actor.pos.y+(actor.smoothY||0),actor.pos.z);
    const t=capsuleEntry(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,r0,r1);
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
    const d=p.fidelitySloshUnit.DamageParam,fall=Math.max(0,p.start.y-point.y);
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
  if(amount>0)system.applyHit(p.owner,victim,amount,p.wid||p.type);
}

export function splatlingLaunchSpeed(weapon,charge) {
  const maximum=weapon.ballistics?.firstChargeSpeed;
  if(!Number.isFinite(maximum))return weapon.projSpeed;
  const first=weapon.firstChargeTime/weapon.chargeTime;
  // Endpoints are extracted; the interpolation is a labelled minimal model,
  // not a claim of recovered Nintendo code or of its random speed bias.
  return weapon.projSpeed+(maximum-weapon.projSpeed)*clamp01(charge/first);
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
    if(w.kind==='splatling')finite(b.firstChargeSpeed,'charged speed');
    freezeDeep(b);
    moves.set(id,freezeDeep({hz:profile.referenceHz,endSpeed:b.endSpeed??null,
      brakeDrag:defaults.brakeDragPerFrame,brakeGravity:defaults.brakeGravity,
      freeDrag:b.freeDragPerFrame??defaults.freeDragPerFrame,
      freeGravity:w.kind==='roller'?w.flickGravity:w.referenceGravity??defaults.freeGravity,
      freeVelocityY:defaults.brakeToFreeVelocityY}));
  }
  Object.defineProperty(Projectiles.prototype,INSTALLED,{value:true});
  const fresh=Projectiles.prototype._new,push=Projectiles.prototype._push,ghost=Projectiles.prototype.ghostProjectile,clear=Projectiles.prototype.clear;
  Projectiles.prototype.clear=function(...args){const result=clear.apply(this,args);this._fidelityCollision=null;this._fidelitySloshContext=null;return result;};
  Projectiles.prototype._new=function(...args){
    const p=fresh.apply(this,args);p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;p.fidelityFieldCollision=null;p.fidelityFriendThrough=null;p.fidelityRollerUnit=null;p.fidelitySloshUnit=null;p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;p.fidelitySectorYaw=null;return p;
  };
  function initialize(p,w){
    if(!w)return;
    const raw=rawWeapon(w);p.s3Weapon={...w};p.wid=w.id;p.fidelityPhase=0;
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
      const vertical=p.fidelityMode==='vertical'||p.ghost&&Math.round(p.straight*60)===Math.round(w.ballistics.verticalStraightTime*60);
      p.fidelityMode=vertical?'vertical':'horizontal';p.s3Vertical=vertical;
      // WideSwing has no recurring intermediate splash system. Impact paint
      // and the separately owned VerticalSwing trail remain unchanged.
      if(!vertical)p.trailEvery=0;
      if(!p.fidelityRollerUnit){
        const units=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].Unit;
        p.fidelityRollerUnit=p.ghost&&!vertical?horizontalRollerReplayUnit(units,p.vel.length()):null;
        if(!p.fidelityRollerUnit){
          let best=Infinity;
          for(const u of units)for(let i=0;i<(u.BulletNum??1);i++){
            const d=Math.abs(p.vel.length()-60*(u.SpawnSpeedBase+i*(u.AfterOffsetSpawnSpeed||0)));
            if(d<best){best=d;p.fidelityRollerUnit=u;}
          }
        }
        setCollision(p,p.fidelityRollerUnit.UnitParam.CollisionParam);
      }
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
      setCollision(p,u.CollisionParam,p.fidelitySloshIndex);
      p.straight=c.GoStraightToBrakeStateFrame/60;
      p.fidelityMove={hz:60,endSpeed:c.GoStraightStateEndMaxSpeed*60,brakeDrag:c.BrakeAirResist,brakeGravity:c.BrakeGravity*3600,
        freeDrag:c.FreeAirResist,freeGravity:c.FreeGravity*3600,freeVelocityY:c.BrakeToFreeVelocityY*60,freeFrame:c.BrakeToFreeStateFrame};
      p.grav=c.FreeGravity*3600;p.drag=c.FreeAirResist*60;
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
      p.damage=u.DamageParam.ValueMax/10;p.head=!!u.HitEffectBigOrderNum?.includes(index);
      p.s3DamageGroup=active.group;p.s3DamageGroupId=active.groupId;
    }
    initialize(p,w);
    const group=p.s3DamageGroup;const result=push.call(this,p);
    // The generic wrapper snapshots owner state too; retain a single per-volley owner.
    if(group)p.s3DamageGroup=group;
    return result;
  };
  Projectiles.prototype.ghostProjectile=function(actor,event){
    const before=this.list.length;const result=ghost.call(this,actor,event);
    if(this.list.length>before){const p=this.list.at(-1);initialize(p,WEAPONS[p.wid]||actor.weapon);}
    return result;
  };
  const slosh=Projectiles.prototype.fireSlosh;
  Projectiles.prototype.fireSlosh=function(actor,w){
    const previous=this._fidelitySloshContext;this._fidelitySloshContext={index:0,group:new Map(),groupId:`${actor.nid??'local'}:${++slosherVolleySequence}`};
    try{return slosh.call(this,actor,{...w,drops:rawWeapon(w).UnitGroupParam.Unit.reduce((n,u)=>n+(u.BulletNum??1),0)});}
    finally{this._fidelitySloshContext=previous;}
  };
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
    p.owner=actor;p.type='slosh';p.wid=w.id;p.s3Weapon={...w};p.age=0;p.life=2.4;p.straight=0;
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
    p.owner=actor;p.type='blast';p.wid=w.id;p.s3Weapon={...w};p.age=0;p.life=2;p.straight=0;
    p.delay=0;p.ghost=false;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
    p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
    let remaining=Math.max(0,frame/60);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
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
    let speed=splatlingLaunchSpeed(w,actor.weaponRunner.fidelitySplatlingCharge??actor.weaponRunner.charge??0);
    const rate=rawWeapon(w).MoveParam.SpawnSpeedRandomRate;
    // Bounds are extracted. Uniform law is an explicit model; native bias law is unknown.
    speed*=1+(Math.random()*2-1)*rate;
    return fireSpin.call(this,actor,{...w,projSpeed:speed},spread);
  };
  // Boss and player hits share the same weapon damage envelope. The old native
  // boss path used a separate seven-unit falloff and an unrelated 0.3s throttle.
  const bossImpact=Projectiles.prototype._bossImpact,blastBurst=Projectiles.prototype._blastBurst;
  Projectiles.prototype._bossImpact=function(p,hit){
    if(p.ghost)return;
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
  // _aimFrom is the installed launch direction law. _ballistic is already the
  // installed identity (gravity acts on the bullet), and _spread is skipped on
  // purpose: the guide point is not a sampled bullet.
  projectiles._aimFrom(actor, out.muzzle, out.dir);
  const speed = weapon.kind === 'splatling' ? splatlingLaunchSpeed(weapon, charge) : weapon.projSpeed;
  if (!Number.isFinite(speed) || speed <= 0) return null;
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
  const s = guideScratch(), weapon = actor?.weapon, frames = shotGuideFrames(weapon);
  s.state.frames = 0;
  if (frames === null || !guideApi.G.projectiles) return null;
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
  if (!state || !camera || !(width > 0) || !(height > 0)) return null;
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
  if (L.guideX == null || Math.abs(x - L.guideX) > 0.05 || Math.abs(y - L.guideY) > 0.05) {
    L.guideX = x; L.guideY = y;
    ret.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
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
