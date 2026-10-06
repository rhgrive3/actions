// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json.
// Source fields and interpreted equations are explicitly separated in the profile.
import {distanceDamage, groupDamage, applyProjectileHit as legacyHit} from './weapons.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { installChargerFlight } from './weapons-charger-flight.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
let api, completion;
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
  } else if (w.kind === 'blaster' || w.kind === 'splatling') {
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
    changeTime:Math.max(0,(c['ChangeFrameFor'+target]||0)/60) };
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
    if(actor.team===p.team||!actor.alive)continue;
    if(actor.pos.x<Math.min(p.prev.x,p.pos.x)-radius||actor.pos.x>Math.max(p.prev.x,p.pos.x)+radius||
       actor.pos.z<Math.min(p.prev.z,p.pos.z)-radius||actor.pos.z>Math.max(p.prev.z,p.pos.z)+radius)continue;
    s.base.set(actor.pos.x,actor.pos.y+(actor.smoothY||0),actor.pos.z);
    const t=capsuleEntry(p.prev,p.pos,s.base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,r0,r1);
    if(t!==null&&(t<best-EPSILON||Math.abs(t-best)<EPSILON&&String(actor.nid??actor.name)<String(nearest?.nid??nearest?.name))){best=t;nearest=actor;}
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
  if(!p.vol)return amount;
  const seen=p.vol.hits.includes(victim);
  if(!seen)p.vol.hits.push(victim);
  return seen && !p.s3DamageGroup ? 0 : amount;
}
export function applyFidelitySlosherSplash(system,p,victim,amount) {
  // Active Splat Bucket units have no SplashSlosherHitParam records. No radial damage.
  if(rawWeapon(p.s3Weapon||p.owner.weapon)?.UnitGroupParam)return;
  if(p.ghost)return;
  const delta=groupDamage(p.s3DamageGroup,victim,amount);
  if(delta>0)system.applyHit(p.owner,victim,delta,p.wid||'slosher');
}
export function fidelityDamage(p,point) {
  const w=p.s3Weapon||p.owner.weapon;
  if(w.kind==='roller'&&w.ballistics){
    const b=w.ballistics,d=p.start.distanceTo(point),xz=Math.hypot(point.x-p.start.x,point.z-p.start.z);
    const outside=!p.s3Vertical&&xz>b.horizontalInsideDistance&&Math.abs(p.fidelityYaw)>radians(b.horizontalInsideDegrees);
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
  if(p.ghost)return;
  amount=groupDamage(p.s3DamageGroup,victim,fidelityDamage(p,point));
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
  const moves=new Map();
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
    const p=fresh.apply(this,args);p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;p.fidelityFieldCollision=null;p.fidelityRollerUnit=null;p.fidelitySloshUnit=null;p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;return p;
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
      p.s3DamageGroup=active.group;
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
    const previous=this._fidelitySloshContext;this._fidelitySloshContext={index:0,group:new Map()};
    try{return slosh.call(this,actor,{...w,drops:rawWeapon(w).UnitGroupParam.Unit.reduce((n,u)=>n+(u.BulletNum??1),0)});}
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
    let remaining=Math.max(0,frame/60);
    while(remaining>EPSILON){const step=Math.min(1/60,remaining);advanceFidelityProjectile(p,step);remaining-=step;}
    return p.pos;
  }
  Projectiles.prototype.s3SlosherGuide=function(actor,w,camera,width,height){
    return cachedS3Guide(this,actor,w,'slosher',camera,width,height);
  };
  Projectiles.prototype.s3WeaponGuide=function(actor,w,camera,width,height){
    if(w?.kind==='slosher')return this.s3SlosherGuide(actor,w,camera,width,height);
    if(w?.kind!=='blaster'){if(this._s3GuideCache)this._s3GuideCache.valid=false;return null;}
    return cachedS3Guide(this,actor,w,'blaster',camera,width,height);
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
