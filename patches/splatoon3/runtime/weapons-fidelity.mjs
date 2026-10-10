import { applyMainDirectHit, withMainDirectDamage } from './private-tracking.mjs';
import { configureRollerVerticalPaint, paintRollerVerticalFlight } from './roller-vertical-paint.mjs';
import { paintRollerMaximumWidth } from './roller-max-paint.mjs';
import { configureBlasterFlightPaint, paintBlasterFlight, spawnSplashDrop, advanceSplashDrops } from './blaster-flight-paint.mjs';
import { applyBlasterBurstKnockback } from './main-knockback.mjs';
import { dualiesGuideInputsChanged } from './dualies-guide-cache.mjs';
import { installDualiesSlidePaint } from './dualies-slide-paint.mjs';
import { paintSlosherNearest } from './slosher-nearest-paint.mjs';
import { withRollerImpactPaint } from './roller-impact-paint.mjs';
import { SHOOTER_FLOOR_NORMAL_Y, withShooterImpactPaint } from './shooter-impact-paint.mjs';
import { hurtboxRadius, hurtboxHeight } from './player-hurtbox.mjs';
import { isKitProjectile, kitTrizookaFlight, kitTrizookaOrbitDelta, kitTrizookaActorRadius, kitTrizookaWorldSweep, kitTrizookaClearPooled, kitVolleyHitAuthority } from './trizooka-collision.mjs';
import { segmentCapsuleEntry as kitSegmentCapsuleEntry } from './projectile-collision.mjs';
// Main-weapon gameplay only. Values live in profile.json; provenance and retained
// uncertainty live in reference/weapons-fidelity-reference.json.
// Source fields and interpreted equations are explicitly separated in the profile.
import {distanceDamage, groupDamage, applyGroupedProjectileHit, applyProjectileHit as legacyHit, applySlosherVolleyHit, cachedWeaponOverrideConfig, withWeaponScalarOverride} from './weapons.mjs';
import {damageGroupId} from './final-damage.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { coherentMotionStart } from './actor-motion.mjs';
import { installChargerFlight } from './weapons-charger-flight.mjs';
export const EPSILON = 1e-10;
const INSTALLED = Symbol.for('inkwave.weapons-fidelity.v1');
const NORMALIZED_PROJECTILE_PACKET = Symbol('inkwave.normalizedProjectilePacket');
const inkFlightHelpers = new WeakMap();
const SPLATLING_NOMINAL_LIFETIME = 1.2;
let api, completion, moves, slosherVolleySequence = 0;
const slosherDropConfigs = new WeakMap();
const splatlingSpeedViews = new WeakMap();
const blasterPaintContracts = new WeakMap();
const blasterAxisDirectionsCache = new WeakMap();
const clamp01 = value => Math.max(0, Math.min(1, value));
// #949: rejected hits cannot reserve the Slosher volley damage budget.
export function bossVolleyAdmission(boss, attacker, target) {
  if (!boss || !attacker || attacker.remote || boss.dead || boss.match?.state !== 'playing') return false;
  const crab = target?.hp !== undefined && target?.id !== undefined;
  if (crab) return !target.dead && Number.isFinite(target.hp) && target.hp > 0;
  return !boss.invuln && !!boss.visible && Number.isFinite(boss.hp) && boss.hp > 0;
}
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
  // #1065: capture final launch velocity at true birth, after owner motion and
  // packet reconstruction. Pool reuse must not inherit the previous glob.
  if (p.fidelitySloshUnit && p.fidelitySloshDownward == null) {
    p.fidelitySloshDownward = p.vel.y < 0;
    p.fidelitySloshFallAnchorY = p.pos.y;
  }
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
    const componentTransition = Number.isFinite(move.freeVelocityXZ);
    const shooterComponentTransition = componentTransition && p.s3Weapon?.kind === 'shooter';
    const slosherComponentTransition = componentTransition && p.s3Weapon?.kind === 'slosher';
    // #959: Slosher's XZ/Y thresholds are admission conditions evaluated before force integration.
    if (p.fidelityPhase === 1 && slosherComponentTransition &&
        Math.hypot(p.vel.x,p.vel.z) < move.freeVelocityXZ && p.vel.y < move.freeVelocityY)
      p.fidelityPhase = 2;
    const brake = p.fidelityPhase === 1;
    p.vel.multiplyScalar(Math.pow(1 - (brake ? move.brakeDrag : move.freeDrag), step * move.hz));
    p.vel.y -= (brake ? move.brakeGravity : move.freeGravity) * step;
    if (brake && shooterComponentTransition) {
      // #1053: Shooter brake->free waits until both lower-speed components are satisfied.
      const yDone = p.vel.y <= move.freeVelocityY + EPSILON;
      if (yDone && p.vel.y < move.freeVelocityY) p.vel.y = move.freeVelocityY;
      const xz = Math.hypot(p.vel.x, p.vel.z);
      const xzDone = xz <= move.freeVelocityXZ + EPSILON;
      if (xzDone && xz > EPSILON && xz < move.freeVelocityXZ) {
        const scale = move.freeVelocityXZ / xz;
        p.vel.x *= scale; p.vel.z *= scale;
      }
      if (xzDone && yDone) p.fidelityPhase = 2;
    } else if (!componentTransition && brake &&
        (p.vel.y < move.freeVelocityY || move.freeFrame!=null && (p.age-p.straight)*move.hz+EPSILON>=move.freeFrame)) {
      p.fidelityPhase = 2;
    }
  }
  p.pos.addScaledVector(p.vel, step);
  // #713: retain the flight apex for the Roller break/free paint height input.
  if (!Number.isFinite(p.fidelityMaxY) || p.pos.y > p.fidelityMaxY) p.fidelityMaxY = p.pos.y;
  if (p.fidelitySloshDownward && p.age <= p.straight + EPSILON)
    p.fidelitySloshFallAnchorY = p.pos.y;
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

function dualiesAimScratch(projectiles) {
  return projectiles._fidelityDualiesAimScratch || (projectiles._fidelityDualiesAimScratch = {
    muzzles: [new api.THREE.Vector3(), new api.THREE.Vector3()],
    midpoint: new api.THREE.Vector3(), forward: new api.THREE.Vector3(), right: new api.THREE.Vector3(),
    targets: [new api.THREE.Vector3(), new api.THREE.Vector3()],
  });
}

// Keep the two normal-fire rays parallel to the current center aim ray. Their
// lateral offset comes from the live native hand muzzle origins, projected onto
// the aim-plane right axis; it is geometry, not a Nintendo spacing calibration.
export function fidelityDualiesAimTargets(projectiles, actor, muzzle0, muzzle1) {
  const scratch = dualiesAimScratch(projectiles);
  const { muzzles, midpoint, forward, right, targets } = scratch;
  muzzles[0].copy(muzzle0); muzzles[1].copy(muzzle1);
  if (actor.weaponRunner?.s3Turret) {
    targets[0].copy(actor.aimPoint); targets[1].copy(actor.aimPoint);
    return targets;
  }

  midpoint.copy(muzzles[0]).add(muzzles[1]).multiplyScalar(.5);
  forward.copy(actor.aimPoint).sub(midpoint);
  let horizontal = Math.hypot(forward.x, forward.z);
  if (horizontal > EPSILON) right.set(forward.z / horizontal, 0, -forward.x / horizontal);
  else {
    horizontal = Math.hypot(actor.aimDir?.x || 0, actor.aimDir?.z || 0);
    if (horizontal > EPSILON) right.set(actor.aimDir.z / horizontal, 0, -actor.aimDir.x / horizontal);
    else right.set(1, 0, 0);
  }
  for (let hand = 0; hand < 2; hand++) {
    const muzzle = muzzles[hand];
    const lateral = (muzzle.x - midpoint.x) * right.x + (muzzle.z - midpoint.z) * right.z;
    targets[hand].copy(actor.aimPoint).addScaledVector(right, lateral);
  }
  return targets;
}

// Called by the actual Dualies fire path after its native muzzle has been
// selected. Only the other hand is queried; the target helper then uses both
// final (including existing obstruction fallback) muzzle origins.
export function fidelityDualiesAimTarget(projectiles, actor, muzzle, hand) {
  const index = hand === true || hand === 1 ? 1 : 0;
  if (actor.weaponRunner?.s3Turret) return actor.aimPoint;
  const scratch = dualiesAimScratch(projectiles);
  scratch.muzzles[index].copy(muzzle);
  projectiles._muzzleHand(actor, 1 - index, scratch.muzzles[1 - index]);
  return fidelityDualiesAimTargets(projectiles, actor, scratch.muzzles[0], scratch.muzzles[1])[index];
}

// The guide and live Dualies fire path share this production launch correction
// and speed. Direction already contains the per-hand aim ray and target.
function dualiesLaunchScratch(projectiles) {
  return projectiles._fidelityDualiesLaunchScratch || (projectiles._fidelityDualiesLaunchScratch = {
    profile: null, speed: 0, chargeSeconds: 0,
  });
}

export function fidelityDualiesLaunchPlan(projectiles, actor, weapon, muzzle, target, dir) {
  const helpers = inkFlightHelpers.get(projectiles);
  if (!helpers) throw new Error('InkFlight helpers were not injected by the adapted source weapons module');
  const { profileFor, launchSpeed, correctInkAim, referenceReach } = helpers;
  const profile = profileFor(weapon);
  if (!profile) return null;
  const chargeSeconds = (actor.weaponRunner?.charge || 0) * (weapon.chargeTime || 0);
  const speed = launchSpeed(profile, chargeSeconds);
  correctInkAim(profile, muzzle, dir, target, speed,
    Math.min(weapon.range, referenceReach(profile, chargeSeconds)));
  const plan = dualiesLaunchScratch(projectiles);
  plan.profile = profile; plan.speed = speed; plan.chargeSeconds = chargeSeconds;
  return plan;
}

// The adapted source Projectiles constructor supplies its own imported native
// InkFlight helpers once per system. This keeps guide and live launches on the
// same functions while allowing both flattened site builds and source-tree Node imports.
export function configureFidelityInkFlight(projectiles, helpers) {
  if (!projectiles || (typeof projectiles !== 'object' && typeof projectiles !== 'function'))
    throw new TypeError('Projectiles instance required for InkFlight helper injection');
  if (!helpers || !['profileFor', 'launchSpeed', 'correctInkAim', 'referenceReach']
    .every(name => typeof helpers[name] === 'function'))
    throw new TypeError('Complete native InkFlight helpers required');
  const current = inkFlightHelpers.get(projectiles);
  if (current) {
    if (['profileFor', 'launchSpeed', 'correctInkAim', 'referenceReach']
      .every(name => current[name] === helpers[name])) return projectiles;
    throw new Error('Projectiles InkFlight helpers already configured');
  }
  inkFlightHelpers.set(projectiles, helpers);
  return projectiles;
}

// Source records supply endpoints/counts. Added random draws are deterministic
// under the fixture seed; the source PRNG/bias distribution is not recovered.
function rawWeapon(w) { return completion?.weapons[w.id || w.kind]; }

// #873: keep intermediate and nearest/feet widths separate. Consume the same
// legacy RNG draw to avoid changing unrelated spread/paint-seed ordering, but
// never let that draw randomize the sourced Shooter gameplay radius.
export function fidelityFlightPaintRadius(p, fallHeight) {
  const legacyRandom = Math.random();
  const fp = p?.s3Weapon?.flightPaint;
  const dist = fallHeight !== undefined && Number.isFinite(fallHeight)
    ? fallHeight
    : (p?.lastDropDist !== undefined && Number.isFinite(p.lastDropDist) ? p.lastDropDist : undefined);
  if (p && 'lastDropDist' in p) delete p.lastDropDist;
  if (fp) {
    if (dist !== undefined) {
      const minH = fp.dropHeightMax ?? 3.0;
      const maxH = fp.dropHeightMin ?? 10.0;
      if (dist <= minH) return fp.nearest;
      if (dist >= maxH) return fp.intermediate;
      const t = (dist - minH) / (maxH - minH);
      return fp.nearest + (fp.intermediate - fp.nearest) * t;
    }
    return fp.intermediate;
  }
  return (p?.trailRadius ?? 0.44) * (0.8 + legacyRandom * 0.4);
}

function deriveRollerReleaseFootPaint(profile) {
  const source = profile.weaponsFidelityCompletion?.weapons?.roller;
  const scale = profile.calibration?.distanceScale?.factor;
  if (!source || !Number.isFinite(scale) || scale <= 0) throw new Error('Missing Roller foot-paint source or retained distance scale');
  const normalized = {};
  for (const [mode, groupName] of [['horizontal', 'WideSwingUnitGroupParam'], ['vertical', 'VerticalSwingUnitGroupParam']]) {
    const spawn = source[groupName]?.SplashNearestParam?.SpawnParam;
    const values = [spawn?.MaxHeight, spawn?.Offset?.X, spawn?.Offset?.Y, spawn?.Offset?.Z,
      spawn?.PaintDepthScale, spawn?.PaintWidthHalf];
    if (!values.every(Number.isFinite) || values[0] < 0 || values[4] <= 0 || values[5] <= 0)
      throw new Error(`Invalid Roller ${mode} SplashNearestParam.SpawnParam`);
    const depthScale = spawn.PaintDepthScale * scale;
    const widthHalf = spawn.PaintWidthHalf * scale;
    // PaintSystem.splat has a circular radius and no sourced anisotropic
    // depth/width mapping. Fail closed instead of inventing one.
    if (Math.abs(depthScale - widthHalf) > 1e-10)
      throw new Error(`Unsupported Roller ${mode} foot-paint depth/width geometry`);
    normalized[mode] = Object.freeze({
      maxHeight: spawn.MaxHeight * scale,
      offset: Object.freeze({ x: spawn.Offset.X * scale, y: spawn.Offset.Y * scale, z: spawn.Offset.Z * scale }),
      paintDepthScale: depthScale,
      paintWidthHalf: widthHalf,
      distanceScale: scale,
    });
  }
  return Object.freeze(normalized);
}
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
  const area = api.G.paint.splat(point, radius, p.team, { seed: seededUnit(p.seed, salt + state.paintIndex++), claimOwner: p.owner });
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


// The source JSON is sparse: default-valued spl__BulletBlasterBurstParam
// members are omitted, not disabled. Do not infer zero from their absence.
export const BLASTER_BURST_PARAM_DEFAULTS = Object.freeze({
  SplashDropOn: true,
  SplashDropCollisionRadius: 0.4,
  SplashDropDrawRadius: 0.6,
  SplashDropInitSpeed: 0,
  SplashDropPaintRadius: 3.2,
  SplashPaintRadius: 2.0,
  // Community-documented S3 type default (Inkipedia
  // https://splatoonwiki.org/wiki/Template:Shooter_data_S3:
  // BlasterBurstParam.SplashPaintShotColHitRadius = 1.4).
  // The S3 11.3.0 Middle JSON omits this default; S2 v5.5 Middle_Burst
  // independently records 14/10=1.4 vs 20/10=2.0 for timed airburst.
  // Type default is source-backed, but the final Nintendo paint shape is
  // still not established by parameter parity.
  SplashPaintShotColHitRadius: 1.4,
});
export function resolvedBlasterBurstParam(raw) {
  if (!raw?.BlasterBurstParam) return null;
  return { ...BLASTER_BURST_PARAM_DEFAULTS, ...raw.BlasterBurstParam };
}
export function blasterPaintContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (blasterPaintContracts.has(raw)) return blasterPaintContracts.get(raw);
  const splash = raw.SplashPaintParam, wall = raw.SplashWallHitParam, burst = resolvedBlasterBurstParam(raw);
  if (!splash || !wall?.SpawnParam || !wall?.WallDropMoveParam || !wall?.WallDropCollisionPaintParam ||
      !burst?.SplashWallDropMoveParam || !burst?.SplashWallDropPaintParam) return null;
  const x = burst.SplashRoundAxisXArray, y = burst.SplashRoundAxisYArray;
  const values = [
    splash.DepthMaxDropHeight, splash.DepthMinDropHeight,
    wall.SpawnParam.FirstDistance, wall.SpawnParam.VelocityMinusYRate,
    wall.WallDropCollisionPaintParam.PaintRadiusShock, wall.WallDropCollisionPaintParam.PaintRadiusFall,
    burst.SplashDropPaintShotColHitRadius,
    burst.SplashDropPaintRadius, burst.SplashPaintRadius, burst.SplashPaintShotColHitRadius,
    burst.SplashWallDropPaintParam.PaintRadiusShock,
    burst.SplashWallDropPaintParam.PaintRadiusFall,
    burst.SplashWallDropPaintParam.PaintRadiusGround,
  ];
  if (!values.every(Number.isFinite) || !Array.isArray(x) || !Array.isArray(y) ||
      !x.length || !y.length || !x.every(Number.isFinite) || !y.every(Number.isFinite)) return null;
  if (splash.DepthMaxDropHeight < 0 || splash.DepthMinDropHeight < splash.DepthMaxDropHeight ||
      wall.SpawnParam.FirstDistance < 0 || wall.SpawnParam.VelocityMinusYRate < 0 ||
      burst.SplashDropPaintShotColHitRadius <= 0 || burst.SplashPaintShotColHitRadius <= 0) return null;
  const gravity = raw.MoveParam?.FreeGravity;
  if (!(gravity > 0)) return null;
  const contract = {
    // Source FreeGravity per frame^2 -> world units per second^2 (scale applied at use).
    gravity: gravity * 3600 * (completion?.worldUnitsPerSourceUnit ?? 1),
    dropHeightMax: splash.DepthMaxDropHeight,
    dropHeightMin: splash.DepthMinDropHeight,
    flightRadius: splash.WidthHalf,
    flightNearestRadius: splash.WidthHalfNearest,
    flightWall: {
      firstDistance: wall.SpawnParam.FirstDistance,
      velocityMinusYRate: wall.SpawnParam.VelocityMinusYRate,
      move: wall.WallDropMoveParam,
      paint: wall.WallDropCollisionPaintParam,
    },
    burst: {
      // Normal timed airburst (type-default fields), never the explicit
      // shot-collision override below.
      splashDropOn: burst.SplashDropOn,
      splashDropPaintRadius: burst.SplashDropPaintRadius,
      splashPaintRadius: burst.SplashPaintRadius,
      radius: burst.SplashDropPaintShotColHitRadius,
      // #1107: omitted members of sparse S3 BlasterBurstParam use their
      // documented type defaults; shot-collision override is NOT the
      // ordinary timed-burst paint or falling splash-drop radius.
      timedSplashRadius: burst.SplashPaintRadius ?? 2.0,
      timedDropRadius: burst.SplashDropPaintRadius ?? 3.2,
      timedDropOn: burst.SplashDropOn ?? true,
      timedDropInitialSpeed: burst.SplashDropInitSpeed ?? 0,
      timedDropCollisionRadius: burst.SplashDropCollisionRadius ?? 0.4,
      // Shot-collision sphere radius is distinct from the timed-airburst
      // radius; omitted sparse S3 fields resolve to the documented S3 type
      // default 1.4 (also independently present in S2 as 14/10).
      // Explicit S3 overrides take precedence.
      // Keep explicit S3 overrides authoritative for other Blaster types.
      collisionSplashRadius: burst.SplashPaintShotColHitRadius,
      axisX: x,
      axisY: y,
      move: burst.SplashWallDropMoveParam,
      paint: burst.SplashWallDropPaintParam,
    },
  };
  blasterPaintContracts.set(raw, contract);
  return contract;
}

// Depth-scale regime of a splash that fell `height`: DepthScaleMax up to
// DepthMaxDropHeight, DepthScaleMin from DepthMinDropHeight on, interpolated in
// between. It never discards a splash (PR1188 removed the old 'none' cut-off).
export function blasterSplashDropBand(contract, height) {
  if (!contract || !Number.isFinite(height) || height < 0) return 'none';
  if (height <= contract.dropHeightMax + EPSILON) return 'max';
  if (height < contract.dropHeightMin - EPSILON) return 'transition';
  return 'min';
}

export function blasterBurstAxisDirections(contract) {
  if (!contract?.burst?.axisX || !contract?.burst?.axisY) return [];
  if (blasterAxisDirectionsCache.has(contract)) return blasterAxisDirectionsCache.get(contract);
  const out = [];
  for (const pitchDeg of contract.burst.axisX) for (const yawDeg of contract.burst.axisY) {
    const pitch = radians(pitchDeg), yaw = radians(yawDeg), cp = Math.cos(pitch);
    out.push(Object.freeze({ x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp }));
  }
  Object.freeze(out);
  blasterAxisDirectionsCache.set(contract, out);
  return out;
}

function detachedPaint(system, state, point, radius, salt) {
  if (state.ghost || !(radius > 0) || !api?.G?.paint) return 0;
  const area = api.G.paint.splat(point, radius, state.team, {
    seed: seededUnit(state.seed, salt + state.paintIndex++), claimOwner: state.owner,
  });
  if (Number.isFinite(area)) state.owner?.addTurf?.(area);
  return area || 0;
}

function startDetachedWallDrop(system, p, hit, move, paint, tag, salt) {
  if (!move || !paint || !eligibleWallDropHit(hit)) return false;
  const firstFrames = seededFrames(p.seed, move.FallPeriodFirstFrameMin, move.FallPeriodFirstFrameMax, salt ^ 0x11);
  const secondFrames = Math.max(0, Math.round(move.FallPeriodSecondFrame ?? 0));
  const lastFrames = seededFrames(p.seed, move.FallPeriodLastFrameMin, move.FallPeriodLastFrameMax, salt ^ 0x22);
  const firstSpeed = Number(move.FallPeriodFirstTargetSpeed ?? 0), secondSpeed = Number(move.FallPeriodSecondTargetSpeed ?? 0);
  if (![firstSpeed, secondSpeed].every(v => Number.isFinite(v) && v >= 0)) throw new RangeError('Invalid detached wall-drop speed');
  const state = {
    tag, owner: p.owner, team: p.team, seed: Number.isFinite(p.seed) ? p.seed : 0, ghost: !!p.ghost,
    frame: 0, firstFrames, secondFrames, lastFrames, totalFrames: firstFrames + secondFrames + lastFrames,
    firstSpeed, secondSpeed,
    shockRadius: Number(paint.PaintRadiusShock) || 0,
    fallRadius: Number(paint.PaintRadiusFall) || 0,
    groundRadius: Number(paint.PaintRadiusGround) || 0,
    paintSpacing: Math.max(.08, (Number(paint.PaintRadiusFall) || 0) * .5),
    paintCarry: 0, paintIndex: 0,
    pos: hit.point.clone().addScaledVector(hit.normal, .025),
    from: new api.THREE.Vector3(), next: new api.THREE.Vector3(), paintPoint: new api.THREE.Vector3(),
    hit: new api.Hit(),
  };
  (system._s3DetachedWallDrops || (system._s3DetachedWallDrops = [])).push(state);
  detachedPaint(system, state, state.pos, state.shockRadius, salt ^ 0x33);
  return true;
}

function advanceDetachedWallDrops(system, dt) {
  const list = system._s3DetachedWallDrops;
  if (!list?.length || !(dt > 0)) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const state = list[i];
    let frames = dt * 60;
    while (frames > EPSILON && state.frame < state.totalFrames - EPSILON) {
      const firstEnd = state.firstFrames, secondEnd = firstEnd + state.secondFrames;
      const phaseEnd = state.frame < firstEnd ? firstEnd : state.frame < secondEnd ? secondEnd : state.totalFrames;
      const stepFrames = Math.min(frames, 1, phaseEnd - state.frame);
      const speed = state.frame < firstEnd ? state.firstSpeed : state.secondSpeed;
      state.from.copy(state.pos); state.next.copy(state.pos); state.next.y -= speed * stepFrames;
      const moved = state.from.distanceToSquared(state.next) > EPSILON * EPSILON;
      const hit = moved ? api.G.physics.segment(state.from, state.next, state.hit, true) : null;
      if (hit?.hit) {
        state.pos.copy(hit.point).addScaledVector(hit.normal, .02);
        if (hit.normal.y > .45) detachedPaint(system, state, state.pos, state.groundRadius, 0x6a0d);
        state.frame = state.totalFrames;
        break;
      }
      state.pos.copy(state.next);
      if (state.fallRadius > 0) {
        const distance = state.from.distanceTo(state.next);
        if (distance > EPSILON) {
          let cursor = state.paintSpacing - state.paintCarry;
          while (cursor <= distance + EPSILON) {
            state.paintPoint.copy(state.from).lerp(state.next, Math.min(1, cursor / distance));
            detachedPaint(system, state, state.paintPoint, state.fallRadius, 0x51f15e);
            cursor += state.paintSpacing;
          }
          state.paintCarry = (state.paintCarry + distance) % state.paintSpacing;
        }
      }
      state.frame += stepFrames; frames -= stepFrames;
    }
    if (state.frame + EPSILON >= state.totalFrames) list.splice(i, 1);
  }
}

function blasterPaintSource(p) {
  const w = p?.s3Weapon || p?.owner?.weapon;
  if (w?.kind !== 'blaster') return null;
  const contract = blasterPaintContract(rawWeapon(w));
  return contract ? { w, contract } : null;
}

// PR1188: the ordinary Blaster round sets trailEvery=0, so the native trail
// block never reaches this function for it; flight splashes are owned by the
// distance scheduler (blaster-flight-paint.mjs). A Blaster that somehow keeps
// a legacy trail must still never add a second, unsourced floor stamp.
export function applyFidelityBlasterFlightPaint(system, p) {
  return !!blasterPaintSource(p);
}

// SplashWallHitParam: a flight splash released while a paintable wall lies
// within FirstDistance along the round's velocity (its Y lowered by
// VelocityMinusYRate x horizontal speed) becomes a sourced wall drop instead
// of a falling floor splash. Returns true when the wall took the splash.
export function blasterFlightWallSplash(system, p, from, index) {
  const source = blasterPaintSource(p);
  if (!source || p.ghost || p.owner?.remote) return false;
  const wall = source.contract.flightWall;
  const dir = system._s3BlasterFlightSplashDir || (system._s3BlasterFlightSplashDir = new api.THREE.Vector3());
  dir.copy(p.vel);
  const horizontal = Math.hypot(dir.x, dir.z);
  if (horizontal > EPSILON) dir.y -= horizontal * wall.velocityMinusYRate;
  if (!(dir.lengthSq() > EPSILON) || !(wall.firstDistance > 0)) return false;
  dir.normalize();
  const wh = system._s3BlasterFlightSplashWallHit || (system._s3BlasterFlightSplashWallHit = new api.Hit());
  const hit = api.G.physics.raycast(from, dir, wall.firstDistance * completion.worldUnitsPerSourceUnit, wh, true);
  return eligibleWallDropHit(hit) && startDetachedWallDrop(system, p, hit, wall.move, wall.paint, 'flight', 0x1009 + index);
}

function blasterBurstDropSpec(contract) {
  return contract.burstDropSpec || (contract.burstDropSpec = Object.freeze({
    gravity: contract.gravity, depthScaleMax: 1, depthScaleMin: 1, dropHeightMax: 0, dropHeightMin: 0, randomVelocity: null,
  }));
}

export function applyFidelityBlasterBurstPaint(system, p, point, direct) {
  const source = blasterPaintSource(p);
  if (!source) return false;
  const collision = direct != null || !!p.s3BurstCollisionHit || !!p.s3TerrainBurst;
  if (p.ghost) return true;
  const { contract } = source, burst = contract.burst, scale = completion.worldUnitsPerSourceUnit;
  // PR1188: one burst = a sphere splash at the burst point plus one falling
  // splash drop. Timed airbursts use SplashPaintRadius / SplashDropPaintRadius;
  // shot-collision bursts (terrain contact, direct hit) use their ShotColHit
  // overrides. The sphere paints only surfaces inside its radius (continuous in
  // height, no fixed downward probe); the drop falls under the Blaster's own
  // FreeGravity from any height and paints whatever it reaches first.
  const sphereRadius = (collision ? burst.collisionSplashRadius : burst.timedSplashRadius) * scale;
  const dropRadius = (collision ? burst.radius : burst.timedDropRadius) * scale;
  const seed = Number.isFinite(p.seed) ? p.seed : seededUnit(point.x * 7.1 + point.y * 3.3 + point.z * 1.7, 0x1188);
  if (sphereRadius > 0 && api.G.paint?.splat) {
    const centre = system._s3BlasterBurstCentre || (system._s3BlasterBurstCentre = new api.THREE.Vector3());
    centre.copy(point);
    const area = api.G.paint.splat(centre, sphereRadius, p.team, { seed: seededUnit(seed, collision ? 0x1001 : 0x1106), claimOwner: p.owner });
    if (Number.isFinite(area) && area) p.owner?.addTurf?.(area);
  }
  if (burst.timedDropOn && dropRadius > 0) {
    const from = system._s3BlasterBurstDropFrom || (system._s3BlasterBurstDropFrom = new api.THREE.Vector3());
    from.copy(point);
    const normal = collision ? p.s3BurstCollisionHit?.normal : null;
    // A terrain-contact burst starts its drop just off the struck surface: a
    // wall contact steps out by the sourced drop collision radius and runs down
    // to the floor below; a floor contact lands on its own floor at once.
    if (normal && Number.isFinite(normal.y) && Math.abs(normal.y) < .45)
      from.addScaledVector(normal, Math.max(.05, burst.timedDropCollisionRadius * scale));
    else if (collision) from.y += .05;
    spawnSplashDrop(api.G, { owner: p.owner, team: p.team, seed, salt: collision ? 0x1107 : 0x1106, from,
      radius: dropRadius, spec: blasterBurstDropSpec(contract), depth: false, kind: undefined,
      initialDownSpeed: Math.max(0, burst.timedDropInitialSpeed) * scale * 60 });
  }
  const dirs = blasterBurstAxisDirections(contract);
  const ray = system._s3BlasterBurstAxisDir || (system._s3BlasterBurstAxisDir = new api.THREE.Vector3());
  const hit = system._s3BlasterBurstAxisHit || (system._s3BlasterBurstAxisHit = new api.Hit());
  const seen = new Set();
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]; ray.set(d.x, d.y, d.z);
    const h = api.G.physics.raycast(point, ray, burst.radius, hit, true);
    if (!eligibleWallDropHit(h)) continue;
    const key = h.block + ':' + h.face;
    if (seen.has(key)) continue;
    seen.add(key);
    startDetachedWallDrop(system, p, h, burst.move, burst.paint, 'burst', 0x1027 + i);
  }
  return true;
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
  if(p.fidelityWallDrop)return true; // contact admission is idempotent
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
  // #975: the wall-impact footprint is NOT the subsequent wall-drop shock.
  // 2.2 source units is the verified wall-impact value exported with Issue #975;
  // the pinned top-level 1.3 / 1.0 / 0.6 drop record remains unchanged.
  if (p.type === 'blast' && !p.s3SpecialWeapon) {
    const impactRadius = source.w.wallImpactPaintRadius * completion.worldUnitsPerSourceUnit;
    if (Number.isFinite(impactRadius) && impactRadius > 0)
      wallDropPaint(p, p.pos, impactRadius, state, 0x975);
  }
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
    // PR1188: the struck wall orientation travels with the queued terrain burst
    // so its falling drop steps off the wall instead of sliding down its plane.
    const before = p.s3TerrainBurst, beforeHit = p.s3BurstCollisionHit;
    p.s3TerrainBurst = true; p.s3BurstCollisionHit = hit;
    try { system._blastBurst(p, hit.point, null); }
    finally { p.s3TerrainBurst = before; p.s3BurstCollisionHit = beforeHit; }
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
function slosherPaintRecord(p) {
  const u=p?.fidelitySloshUnit;
  return u ? ((p.fidelitySloshIndex || 0) > 0 ? u.AfterPaintParam : u.PaintParam) : null;
}
// #1140: age growth and high-drop shrink are distinct. The documented
// PaintParam fall-distance anchors guide a *provisional* collision/visual
// scale, not an asserted Nintendo collision-radius equation.
export function slosherDropScale(p, atY=p?.pos?.y) {
  const src=slosherPaintRecord(p), origin=p?.start?.y;
  if (!src || !Number.isFinite(origin) || !Number.isFinite(atY)) return 1;
  const from=src.ScaleStartFallDistance, to=src.ScaleEndFallDistance, rate=src.WidthDepthScaleFall;
  if (![from,to,rate].every(Number.isFinite) || !(to>from) || !(rate>0&&rate<=1)) return 1;
  const drop=Math.max(0,origin-atY);
  if (drop<=from) return 1;
  const scale=1-(1-rate)*clamp01((drop-from)/(to-from));
  // Continue narrowing beyond the sourced paint interpolation end rather than
  // leaving an immortal full-size hit volume from extreme height.
  return Math.max(0,scale*Math.exp(-Math.max(0,drop-to)/(to-from)));
}
function slosherCollisionRadius(p, age, field, y) {
  const record=field?p.fidelityFieldCollision:p.fidelityPlayerCollision;
  const fallback=field?(p.fieldRadius||0):(p.s3PlayerRadius??p.size);
  const grown=field?radiusAt(record,age,fallback):(p.s3PlayerRadius??radiusAt(record,age,fallback));
  return grown*slosherDropScale(p,y);
}
export function fidelityPlayerCollisionRadius(p) { return slosherCollisionRadius(p,p.age,false,p.pos?.y); }
function fieldRadiusAt(p,age,y=p.pos?.y) { return slosherCollisionRadius(p,age,true,y); }
// #1011: footprint uses the source unit and first/after bullet distinctions.
export function fidelitySlosherImpactPaint(p, point) {
  const src=slosherPaintRecord(p), start=p?.start, scale=completion?.worldUnitsPerSourceUnit ?? 1;
  if (!src || !start || !point || !(scale>0)) return null;
  const n=src.DistanceXZNear,f=src.DistanceXZFar,w0=src.WidthHalfNear,w1=src.WidthHalfFar;
  const d0=src.DepthScaleNear,d1=src.DepthScaleFar;
  if (![n,f,w0,w1,d0,d1].every(Number.isFinite) || !(f>n) || !(w0>0&&w1>0)) return null;
  const distance=Math.hypot(point.x-start.x,point.z-start.z)/scale;
  const t=clamp01((distance-n)/(f-n)), shrink=slosherDropScale(p,point.y);
  const radius=(w0+(w1-w0)*t)*scale*shrink;
  return radius>0?{radius,stretchAmt:Math.max(.05,(d0+(d1-d0)*t)*shrink)}:null;
}
// #1022: the single live Slosher yaw law. RandomRotateYBias is consumed as an
// exponent 1+bias on the normalised uniform draw (bias 0 = uniform control).
// This is an INKWAVE calibration, NOT a verified Nintendo distribution: the
// native sampling law is 未確認. Exempt indices (RandomRotateYOffOrderNum)
// consume no random number; other indices consume exactly one.
export function slosherYawOffset(u,index,rng=Math.random) {
  if (!u || u.RandomRotateYOffOrderNum?.includes(index)) return 0;
  const angle=u.RandomRotateYDegree || 0;
  if (!Number.isFinite(angle)) return 0;
  const bias=Number.isFinite(u.RandomRotateYBias)?clamp01(u.RandomRotateYBias):0;
  const sample=Math.max(-1,Math.min(1,2*rng()-1));
  const centered=Math.sign(sample)*Math.pow(Math.abs(sample),1+bias);
  return radians(angle*centered);
}
function setCollision(p,c,offset=0,depleted=false) {
  // #305 residual: a Roller round born from a depletion swing applies its
  // unit's pinned CollisionParam.DepletionRate (0.5 for every Splat Roller
  // unit in the 11.3.0 table) to the hit-radius magnitudes only. The growth
  // chronology (ChangeFrameForField / ChangeFrameForPlayer) and the
  // teammate-through window stay exactly as sourced. Rounds not flagged
  // depleted, records without the sourced field, and every other weapon
  // family keep the original values, so full volleys are unchanged.
  const rate=depleted&&Number.isFinite(c?.DepletionRate)&&c.DepletionRate>0&&c.DepletionRate<=1?c.DepletionRate:1;
  const scale=r=>rate===1?r:{...r,initRadius:r.initRadius*rate,endRadius:r.endRadius*rate};
  p.fidelityPlayerCollision=scale(collisionRecord(c,'Player',offset));
  p.fidelityFieldCollision=scale(collisionRecord(c,'Field',offset));
  // Restore the pinned family-specific window consumed by the existing solver.
  p.fidelityFriendThrough=['shooter','slosher','roller','splatling','dualies'].includes(p.s3Weapon?.kind) ? p.fidelityPlayerCollision.FriendThroughFrameForPlayer : null;
  // Existing size carries initial radius; Roller unit identity is transmitted separately.
  p.size=p.fidelityPlayerCollision.initRadius;
}
// Legacy projectile packets have no unit discriminator. New packets preserve
// their first30 entries, then carry unit before the existing owner tick/sequence.
function copyProjectilePacketProperties(from, to) {
  for (const key of Reflect.ownKeys(from)) {
    if (key === 'length' || typeof key === 'symbol' || /^(?:0|[1-9]\d*)$/.test(key)) continue;
    Object.defineProperty(to, key, Object.getOwnPropertyDescriptor(from, key));
  }
}
function projectilePacketShape(packet) {
  if (!Array.isArray(packet)) return null;
  if ([27, 30, 32].includes(packet.length)) return { legacy: true, depleted: false, birthOffset: 0 };
  const hasInkMeta = packet[27] === null || typeof packet[27] === 'object';
  const accepted = hasInkMeta
    ? packet.length === 34 || packet.length === 36 || packet.length === 37
    : packet.length === 33 || packet.length === 35 || packet.length === 36;
  if (!accepted) return null;
  const inkMetaOffset = hasInkMeta ? 1 : 0;
  const kitOffset = packet.length === 35 || packet.length === 36 || packet.length === 37 ? 2 : 0;
  const birthOffset = inkMetaOffset + kitOffset;
  const hasPower = hasInkMeta ? packet.length === 37 : packet.length === 36;
  return { legacy: false, hasInkMeta, kitOffset, birthOffset, hasPower };
}
function normalizedProjectilePacketValid(packet, shape, depleted) {
  if (!shape) return false;
  if (shape.legacy) return !depleted;
  const { birthOffset, hasPower } = shape;
  const powerIndex = 31 + birthOffset;
  if (hasPower) {
    const power = packet[powerIndex]?.s3SpecialPowerAP;
    const entry = api?.SPECIALS && Object.hasOwn(api.SPECIALS, packet[4]) ? api.SPECIALS[packet[4]] : null;
    if (typeof entry?.projectileDescriptor !== 'function' || !Number.isFinite(power) || power < 0 || power > 57) return false;
  }
  const weapons = api?.WEAPONS;
  const weapon = weapons && Object.hasOwn(weapons, packet[4]) ? weapons[packet[4]] : null;
  const unit = packet[30 + birthOffset];
  if (!weapon) {
    const specials=api?.SPECIALS,entry=specials&&Object.hasOwn(specials,packet[4])?specials[packet[4]]:null;
    return typeof entry?.projectileDescriptor==='function' && unit===-1 && !depleted;
  }
  if (weapon.kind === 'slosher') {
    const count = rawWeapon(weapon)?.UnitGroupParam?.Unit?.reduce((n,u)=>n+(u.BulletNum??1),0);
    return !depleted && (unit === -1 || Number.isSafeInteger(unit) && unit >= 0 && unit < count);
  }
  if (weapon.kind !== 'roller') return !depleted && unit === -1;
  if (packet[27 + birthOffset] !== 0 && packet[27 + birthOffset] !== 1) return false;
  const units = rawWeapon(weapon)?.[packet[27 + birthOffset] === 1 ? 'VerticalSwingUnitGroupParam' : 'WideSwingUnitGroupParam']?.Unit;
  return Number.isSafeInteger(unit) && unit >= 0 && !!units && unit < units.length;
}
function prepareFidelityProjectilePacket(event) {
  if (!Array.isArray(event)) return null;
  const prepared = event[NORMALIZED_PROJECTILE_PACKET];
  if (prepared) {
    const shape = projectilePacketShape(event);
    return normalizedProjectilePacketValid(event, shape, prepared.depleted) ? event : null;
  }
  const flagIndices = [];
  for (let index = 31; index <= 35; index++) if (event[index] === true) flagIndices.push(index);
  if (flagIndices.length > 1) return null;
  const markerIndex = flagIndices[0] ?? -1;
  const depleted = markerIndex >= 0;
  const packet = event.slice();
  if (depleted) packet.splice(markerIndex, 1);
  copyProjectilePacketProperties(event, packet);
  const shape = projectilePacketShape(packet);
  if (depleted) {
    const expectedMarkerIndex = shape && !shape.legacy
      ? 31 + shape.birthOffset + (shape.hasPower ? 1 : 0)
      : -1;
    if (markerIndex !== expectedMarkerIndex || api?.WEAPONS?.[packet[4]]?.kind !== 'roller') return null;
  }
  if (!normalizedProjectilePacketValid(packet, shape, depleted)) return null;
  Object.defineProperty(packet, NORMALIZED_PROJECTILE_PACKET, { value: { depleted } });
  return packet;
}
export function validFidelityRollerUnitPacket(event) {
  return !!prepareFidelityProjectilePacket(event);
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
// #1014: Slosher DrawSizeParam is presentation data, not CollisionParam.
// Use the project's explicit source->world conversion (currently 1), as the
// other sourced radii do. This is not a Nintendo pixel/metre calibration.
function setSlosherDraw(p,unit,index) {
  const d=unit?.DrawSizeParam,scale=completion?.worldUnitsPerSourceUnit;
  if(!d||!Number.isFinite(scale)||scale<=0)return;
  const init=Number(d.InitRadius)+index*Number(d.AfterOffsetInitRadius??0);
  const end=Number(d.EndRadius)+index*Number(d.AfterOffsetEndRadius??0);
  const frame=Number(d.ChangeFrame??0),min=Number(d.TailLengthMin),max=Number(d.TailLengthMax),solid=Number(d.TailSolidFrame);
  if(![init,end,frame,min,max,solid].every(Number.isFinite)||init<0||end<0||frame<0||min<0||max<min||solid<0)return;
  p.fidelitySloshDraw={initRadius:init*scale,endRadius:end*scale,changeTime:frame/60,
    tailMin:min*scale,tailMax:max*scale,tailSolidTime:solid/60,worldUnitsPerSourceUnit:scale};
  p.vis=fidelitySlosherDrawRadius(p);
  p.tail0=fidelitySlosherDrawTail(p,p.vel.length());p.tailK=0;
}
export function fidelitySlosherDrawRadius(p) {
  return radiusAt(p.fidelitySloshDraw,Math.max(0,p.age||0),p.vis??p.size)*slosherDropScale(p,p.pos?.y);
}
export function fidelitySlosherDrawTail(p,speed) {
  const d=p.fidelitySloshDraw,r=fidelitySlosherDrawRadius(p);
  if(!d||!(r>0))return 1;
  // Native aShape.x stretches the BACK hemisphere in head radii. Map the
  // sourced tail to extra world length beyond that hemisphere: 1+length/r.
  // Its solid window is TailSolidFrame/60, capped by both sourced lengths.
  // This bounded velocity-based renderer mapping does not claim an unrecovered
  // Nintendo curved-history mesh; it replaces the generic speed*0.04/g law.
  const length=Math.max(d.tailMin,Math.min(d.tailMax,Math.max(0,speed)*Math.min(Math.max(0,p.age||0),d.tailSolidTime)));
  return 1+length/r;
}
// One unit-selection rule, shared by the main volley and the appended
// nearest-glob unit, so both read the same pinned DrawSizeParam.
function flickUnitFor(weapon,vertical,index,depleted=false) {
  const raw=rawWeapon(weapon);
  const group=raw?raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam']:null;
  if(!group)return null;
  let offset=index;
  // #305: a depleted swing emits the sourced DepletionBulletNum per unit; an
  // absent field falls back to that unit's own BulletNum, never a foreign unit.
  for(const u of group.Unit){const count=depleted?(u.DepletionBulletNum??u.BulletNum??1):(u.BulletNum??1);if(offset<count)return {unit:u,offset};offset-=count;}
  return null;
}
export function rollerFlickDrawRadius(weapon,vertical,index,age=0,fallback=null,depleted=false) {
  const picked=flickUnitFor(weapon,vertical,index,depleted);
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
  // #305: a depleted swing sends fewer, slower, weaker rounds whose per-unit
  // rates come from the same pinned Depletion* records as the full volley.
  const depleted=!!weapon.s3Depletion;
  p.s3DepletionRound=depleted;
  p.s3DepletionPaintScale=1;
  const group=raw[vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'];
  const picked=flickUnitFor(weapon,vertical,index,depleted);
  if(!picked)throw new RangeError('Roller index exceeds pinned units + labelled defaults');
  const {unit,offset}=picked;
  // #1128: camera aim already owns the legal gameplay pitch envelope. Do not
  // collapse Roller flicks onto the legacy [-0.2,+0.5] plateaus before applying
  // the extracted per-unit launch offsets.
  const speedRate=depleted?(unit.DepletionSpeedRate??1):1;
  let pitch=Number.isFinite(actor.aimPitch)?actor.aimPitch:0;

  if(vertical){
    speed=60*(unit.SpawnSpeedBase+offset*(unit.AfterOffsetSpawnSpeed||0))*speedRate;
    pitch+=radians((unit.SpawnRotateXDegreeBase||0)+offset*(unit.AfterOffsetSpawnRotateXDegree||0));
    angle=actor.yaw+radians(unit.SpawnRotateYDegree||0);
  }else{
    // The depleted fan spreads the sourced DepletionBulletNum slots over the
    // same SpawnWideDegree; the exact angular distribution of the reduced set is
    // not recovered from the parameter table and is an INKWAVE model.
    const count=(depleted?(unit.DepletionBulletNum??unit.BulletNum):unit.BulletNum)??1,fan=count>1?offset/(count-1)*2-1:0;
    speed=60*(unit.SpawnSpeedBase+(Math.random()*2-1)*(unit.SpawnSpeedRandom||0))*speedRate;
    angle=actor.yaw+fan*radians(unit.SpawnWideDegree||0);
    pitch+=radians(b.horizontalPitchDegrees); // retained calibrated launch angle, NOT extracted
    const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;
    p.pos.x+=Math.cos(actor.yaw)*side+(Math.random()*2-1)*j;
    p.pos.z-=Math.sin(actor.yaw)*side-(Math.random()*2-1)*j;
    p.pos.y+=(Math.random()*2-1)*j;
  }
  // Only offsets are extracted. Native body +1.3 anchor is not claimed as Switch height.
  // #278: the two pinned height fields are summed as raw INKWAVE world units (scale 1).
  // The additive combination and per-field engine meaning are unverified: the pinned
  // Leanny table carries no field semantics. This is an INKWAVE assumption, not a
  // sourced engine law, and makes no SI-metre claim (profile.json models.rollerVerticalSpawnHeight).
  p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);
  p.prev.copy(p.pos);p.start.copy(p.pos);p.fidelityMaxY=p.pos.y;p.fidelityImpactHeight=null;
  const cp=Math.cos(pitch);
  p.vel.set(Math.sin(angle)*cp*speed,Math.sin(pitch)*speed,Math.cos(angle)*cp*speed);
  p.fidelityYaw=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw));
  p.fidelitySectorYaw=vertical?null:actor.yaw;
  p.fidelityMode=vertical?'vertical':'horizontal';p.fidelityRollerUnit=unit;p.fidelityRollerUnitIndex=group.Unit.indexOf(unit);
  // #305: the depletion-marked attack mode carries the sourced DepletionRate
  // into the round's collision record; a full swing never sets the mark.
  setCollision(p,unit.UnitParam.CollisionParam,0,!!weapon.s3Depletion);
  setDrawRadius(p,unit);
  const depletionPaintRate=unit.UnitParam?.PaintParam?.DepletionDepthWidthRate;
  p.s3DepletionPaintScale=depleted && Number.isFinite(depletionPaintRate) && depletionPaintRate>0 ? depletionPaintRate : 1;
  p.straight=unit.UnitParam.MoveParam.GoStraightToBrakeStateFrame/60;
  p.grav=weapon.flickGravity;p.drag=weapon.flickDrag;
}

function scratch(system) {
  return system._fidelityCollision || (system._fidelityCollision = {
    worldReady:false, bossReady:false, world:new api.Hit(), boss:null,
    base:new api.THREE.Vector3(), moved:new api.THREE.Vector3(), res:{t:0,dist:0}, targets:[],
  });
}
export function fidelityWorldHit(system,p) {
  const s=scratch(system);
  if(!s.worldReady){
    s.world.kitDefense=null;
    if(isKitProjectile(p)) kitTrizookaWorldSweep(system,p,s.world,api.G.physics);
    else sweptWorldHit(api.G.physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge??p.age,p.prev?.y),fieldRadiusAt(p,p.age,p.pos?.y),s.world,true);
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

// Use independent player hurtbox dimensions with continuous first-contact capsule entry.
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
  const r0=slosherCollisionRadius(p,p.fidelityPrevAge??p.age,false,p.prev?.y);
  const r1=fidelityPlayerCollisionRadius(p);
  let nearest=null,best=Infinity;
  for(const actor of G.actors){
    if(!actor.alive||actor===p.owner)continue;
    const friendly=actor.team===p.team;
    if(friendly&&actor.submerged)continue; // submerged teammates do not form a friendly obstruction capsule
    // S3 teammate body-block: friendly capsules follow the per-family source
    // FriendThroughFrameForPlayer window. A missing source record keeps the
    // native same-team skip instead of inventing one global collider rule.
    if(friendly&&!Number.isFinite(p.fidelityFriendThrough))continue;
    // #1040: start-of-tick pose of this actor over the SAME fixed step the
    // round segment spans; null (spawn/teleport/adoption/death/no-snapshot)
    // falls back to the single current pose used before this issue.
    const rec=coherentMotionStart(actor);
    const x0=rec?rec.x0:actor.pos.x,y0=rec?rec.y0:actor.pos.y,z0=rec?rec.z0:actor.pos.z;
    // Preserve current authoritative per-actor hurtbox dimensions.
    const bodyRadius=hurtboxRadius(actor,PLAYER),height=hurtboxHeight(actor,PLAYER);
    const radius=bodyRadius+Math.max(r0,r1);
    const segMinX=Math.min(p.prev.x,p.pos.x)-radius,segMaxX=Math.max(p.prev.x,p.pos.x)+radius;
    const segMinZ=Math.min(p.prev.z,p.pos.z)-radius,segMaxZ=Math.max(p.prev.z,p.pos.z)+radius;
    if(Math.min(x0,actor.pos.x)>segMaxX||Math.max(x0,actor.pos.x)<segMinX||
       Math.min(z0,actor.pos.z)>segMaxZ||Math.max(z0,actor.pos.z)<segMinZ)continue;
    const kr=kitTrizookaActorRadius(system,p);
    let t;
    if(rec){
      // Time-coherent relative motion: solving the round segment shifted back
      // by the actor's tick displacement against the START pose is exactly the
      // contact of (round(t) - actor(t)) with the capsule, for linear motion
      // of both over the tick. The returned parameter is the true shared-time
      // contact, so age windows, impact point and world/boss distance ordering
      // keep their original meaning (world tests remain against the static
      // terrain segment, compared by the round's travelled distance).
      s.base.set(x0,y0,z0);
      s.moved.set(p.pos.x-(actor.pos.x-x0),p.pos.y-(actor.pos.y-y0),p.pos.z-(actor.pos.z-z0));
      t=kr==null?capsuleEntry(p.prev,s.moved,s.base,bodyRadius,height,r0,r1):kitSegmentCapsuleEntry(p.prev,s.moved,s.base,bodyRadius,height,kr);
    }else{
      s.base.copy(actor.pos); // render easing does not move the authoritative capsule
      t=kr==null?capsuleEntry(p.prev,p.pos,s.base,bodyRadius,height,r0,r1):kitSegmentCapsuleEntry(p.prev,p.pos,s.base,bodyRadius,height,kr);
    }
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
  // #965: sample only the collision-admitted flight segment, not the entire
  // integrated step. Reuse the solver's terrain/boss queries and exact actor
  // entry; a wall, actor or boss may truncate a scheduled droplet in this step.
  const flight = p.s3BlasterFlightPaint || p.s3RollerFlightPaint;
  if (flight && !p.ghost && !p.owner?.remote) {
    const end = flight.end.copy(p.pos);
    if (p.fidelityImpactActor) end.copy(p.prev).lerp(p.pos,p.fidelityImpactT);
    else {
      const world=fidelityWorldHit(system,p),boss=fidelityBossHit(system,p);
      const contact = boss || (world.hit ? world : null);
      if (contact) {
        const length=p.prev.distanceTo(p.pos);
        if (Number.isFinite(contact.dist) && length>EPSILON) end.copy(p.prev).lerp(p.pos,clamp01(contact.dist/length));
        else if (contact.point) end.copy(contact.point);
      }
    }
    if(p.s3BlasterFlightPaint) paintBlasterFlight(G,p,end);
    else paintRollerVerticalFlight(G,p,end);
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
export function fidelityDamage(p,point,impactT=p.fidelityImpactT??1) {
  const w=p.s3Weapon||p.owner.weapon;
  if(w.kind==='roller'&&w.ballistics){
    const b=w.ballistics,d=p.start.distanceTo(point),xz=Math.hypot(point.x-p.start.x,point.z-p.start.z);
    const hitAngle=rollerHitAngle(p,point);
    const outside=!p.s3Vertical&&hitAngle!==null&&xz>b.horizontalInsideDistance&&Math.abs(hitAngle)>radians(b.horizontalInsideDegrees);
    const bands=p.s3Vertical?w.verticalDamageBands:outside?b.horizontalOutsideDamageBands:w.flickDamageBands;
    const source=rawWeapon(w)[p.s3Vertical?'VerticalSwingUnitGroupParam':'WideSwingUnitGroupParam'].DamageParam;
    const age=(p.fidelityPrevAge??p.age??0)+((p.age??0)-(p.fidelityPrevAge??p.age??0))*impactT;
    const t=clamp01((age*60-source.DamageRejectStartFrame)/(source.DamageRejectEndFrame-source.DamageRejectStartFrame));
    // #305: the depleted round keeps the DepletionDamageRate of the exact table
    // it hit (Inside/Outside); a family without that sourced field (vertical)
    // keeps its full-table damage.
    const depletionRate=p.s3DepletionRound?((outside?source.Outside:source.Inside)?.DepletionDamageRate??1):1;
    return distanceDamage(bands,d)*(1+(source.DamageRejectRate-1)*t)*depletionRate;
  }
  if(w.kind==='slosher'&&p.fidelitySloshUnit){
    const d=p.fidelitySloshUnit.DamageParam;
    const age=(p.fidelityPrevAge??p.age??0)+((p.age??0)-(p.fidelityPrevAge??p.age??0))*impactT;
    const fall=p.fidelitySloshDownward
      ? (age<=p.straight+EPSILON ? 0 : d.ReduceStartFallDistance+Math.max(0,p.fidelitySloshFallAnchorY-point.y))
      : Math.max(0,p.start.y-point.y);
    const t=clamp01((fall-d.ReduceStartFallDistance)/(d.ReduceEndFallDistance-d.ReduceStartFallDistance));
    return (d.ValueMax+(d.ValueMin-d.ValueMax)*t)/10;
  }
  if(['shooter','dualies','splatling'].includes(w.kind)){
    const startFrame = Math.round((w.damageReduceStart ?? 0) * 60);
    const endFrame = Math.round((w.damageReduceEnd ?? 0) * 60);
    // #875: the damage age is the number of completed fixed 60Hz frames, the
    // same completed-tick model as the ink-flight contact. Math.round would move
    // the falloff state at half-frame ages (7.5F); the epsilon only absorbs float
    // error from k/60*60. Which completed tick S3 uses at a contact is 未確認.
    const frame = Math.floor((p.age ?? 0) * 60 + 1e-9);
    const t = endFrame > startFrame ? clamp01((frame - startFrame) / (endFrame - startFrame)) : 0;
    return w.damage + (w.damageMin - w.damage) * t;
  }
  const age=(p.fidelityPrevAge??p.age)+(p.age-(p.fidelityPrevAge??p.age))*impactT;
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
    return withMainDirectDamage(p.owner,victim,()=>applySlosherVolleyHit(system,p.owner,victim,p.s3DamageGroup,p.s3DamageGroupId,amount,p.wid||p.type||'slosher'));
  return applyGroupedProjectileHit(system,p,victim,amount);
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

export function fidelityRollerMaximumPaint(r,w,fx,fz) {
  if(!api?.G || !completion?.weapons?.roller?.BodyParam?.PaintParam)return 0;
  return paintRollerMaximumWidth(api.G,r,w,completion.weapons.roller.BodyParam.PaintParam,completion.worldUnitsPerSourceUnit,completion.referenceHz,fx,fz);
}

// Issue #297: Bucket Slosher carries an explicit player-motion addition record.
// S3's coordinate convention names Z as player-forward and Y as vertical; this
// weapon supplies ZRate=2 and YMinusRate=1, with no XRate/YPlusRate override.
// Apply only those sourced axes at spawn. GuideYMinusZero means the HUD guide
// intentionally omits the falling-player term while live projectiles retain it.
export function applySlosherSpawnVelocity(p,{guide=false}={}) {
  if(!p||p.ghost||p.s3SlosherMotionApplied||p.type!=='slosh')return;
  const a=p.owner,w=p.s3Weapon||a?.weapon,raw=rawWeapon(w);
  if(!a||a.remote||w?.kind!=='slosher'||!raw)return;
  const spec=raw.spl__SpawnBulletAdditionMovePlayerParam;
  if(!spec||!Number.isFinite(a.yaw))return;
  const vx=a.vel?.x,vz=a.vel?.z,vy=a.vel?.y;
  if(Number.isFinite(spec.ZRate)&&Number.isFinite(vx)&&Number.isFinite(vz)){
    const x=Math.sin(a.yaw),z=Math.cos(a.yaw);
    const amount=(vx*x+vz*z)*spec.ZRate;
    p.vel.x+=x*amount;p.vel.z+=z*amount;
  }
  if(Number.isFinite(spec.YMinusRate)&&Number.isFinite(vy)&&vy<0&&!(guide&&spec.GuideYMinusZero))
    p.vel.y+=vy*spec.YMinusRate;
  p.s3SlosherMotionApplied=true;
}

export function installWeaponsFidelity(context,profile) {
  const {WeaponRunner,Projectiles,WEAPONS}=context;
  if(Object.hasOwn(Projectiles.prototype,INSTALLED))return;
  const defaults=profile.weaponsFidelity;
  if(!defaults || defaults.schema!==1 || profile.referenceHz!==60)throw new Error('Missing or unsupported weapons fidelity profile');
  for (const [name,value] of Object.entries({brakeDrag:defaults.brakeDragPerFrame,freeDrag:defaults.freeDragPerFrame}))
    if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('Invalid '+name);
  if(!Number.isFinite(defaults.brakeGravity)||defaults.brakeGravity<0||!Number.isFinite(defaults.freeGravity)||defaults.freeGravity<0||!Number.isFinite(defaults.brakeToFreeVelocityY)||!Number.isFinite(defaults.brakeToFreeVelocityXZ)||defaults.brakeToFreeVelocityXZ<0)throw new RangeError('Invalid ballistic gravity/transition');
  const roller=WEAPONS.roller;
  if(roller?.ballistics && roller.ballistics.verticalUnits.reduce((n,u)=>n+u.count,0)!==roller.verticalDrops)throw new Error('Vertical roller unit count differs from profile');
  api=context;completion=profile.weaponsFidelityCompletion;
  if(!completion||completion.schema!==1)throw new Error('Missing completion source table');
  const shooterPaint = completion.weapons?.shooter?.SplashPaintParam;
  const paintScale = completion.worldUnitsPerSourceUnit;
  if (![paintScale, shooterPaint?.WidthHalf, shooterPaint?.WidthHalfNearest].every(v => Number.isFinite(v) && v > 0))
    throw new RangeError('Invalid Shooter flight paint source/conversion');
  // Retain the repository's explicit world calibration; this is NOT a new
  // physical-metre or Switch-rasterization calibration. Snapshot with the shot.
  WEAPONS.shooter.flightPaint = Object.freeze({
    intermediate: shooterPaint.WidthHalf * paintScale,
    nearest: shooterPaint.WidthHalfNearest * paintScale,
    dropHeightMax: (shooterPaint.DepthMaxDropHeight ?? 3) * paintScale,
    dropHeightMin: (shooterPaint.DepthMinDropHeight ?? 10) * paintScale,
    worldUnitsPerSourceUnit: paintScale,
  });
  // #79: Shooter PaintParam (Ver. 11.3.0). Far anchor and angle thresholds are not
  // in the record; see shooter-impact-paint.mjs for the provisional choices.
  const shooterImpact = completion.weapons?.shooter?.PaintParam;
  const impactSource = [shooterImpact?.WidthHalfNear, shooterImpact?.WidthHalfMiddle, shooterImpact?.WidthHalfFar,
    shooterImpact?.DistanceMiddle, shooterImpact?.DepthScaleMax, shooterImpact?.DepthScaleMin,
    shooterImpact?.DepthScaleMaxBreakFree, shooterImpact?.DepthScaleMinBreakFree];
  if (!impactSource.every(v => Number.isFinite(v) && v > 0))
    throw new RangeError('Invalid Shooter impact paint source');
  WEAPONS.shooter.impactPaint = Object.freeze({
    widthNear: shooterImpact.WidthHalfNear * paintScale,
    widthMiddle: shooterImpact.WidthHalfMiddle * paintScale,
    widthFar: shooterImpact.WidthHalfFar * paintScale,
    distanceMiddle: shooterImpact.DistanceMiddle * paintScale,
    depthMax: shooterImpact.DepthScaleMax,
    depthMin: shooterImpact.DepthScaleMin,
    depthMaxBreakFree: shooterImpact.DepthScaleMaxBreakFree,
    depthMinBreakFree: shooterImpact.DepthScaleMinBreakFree,
  });
  roller.releaseFootPaint = deriveRollerReleaseFootPaint(profile);
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
      freeVelocityXZ:w.kind==='shooter'?defaults.brakeToFreeVelocityXZ:null,
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
    const canonical=this._nominalInkReach?.(weapon,charge);
    if(canonical!=null)return canonical;
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
  const fresh=Projectiles.prototype._new,push=Projectiles.prototype._push,step=Projectiles.prototype._step,ghost=Projectiles.prototype.ghostProjectile,clear=Projectiles.prototype.clear,updateSystem=Projectiles.prototype.update;
  Projectiles.prototype.clear=function(...args){const result=clear.apply(this,args);this._fidelityCollision=null;this._fidelitySloshContext=null;this._dualiesGuideCache=null;this._s3DetachedWallDrops?.splice(0);this._s3SplashDrops?.splice(0);return result;};
  Projectiles.prototype.update=function(dt){advanceDetachedWallDrops(this,dt);advanceSplashDrops(this,dt,context.G,Number.isFinite(context.PLAYER?.waterY)?context.PLAYER.waterY:-Infinity);return updateSystem.call(this,dt);};
  Projectiles.prototype._new=function(...args){
    // Clear the outgoing kit before native _new erases wid and the generic
    // wrapper erases its descriptor, while authority is still identifiable.
    const recycled=this.pool[this.pool.length-1];if(recycled)kitTrizookaClearPooled(recycled);
    const p=fresh.apply(this,args);kitTrizookaClearPooled(p);p.s3BlasterFlightPaint=null;p.s3RollerFlightPaint=null;p.s3Weapon=null;
    p._s3SloshBirthPending=false;p._s3SloshBirthOwner=null;p._s3SloshBirthEpoch=undefined;
    p._s3SloshBirthWeaponId=null;p._s3SloshBirthRemote=undefined;p._s3SloshBirthNid=undefined;
    p._s3SloshBirthPeer=undefined;p._s3SloshBirthWasInMatch=false;p._s3SloshBirthDelay=0;
    p._s3SloshYaw=0;p._s3SloshPitch=0;p._s3SloshBirthGhost=false;
    p.fidelityMaxY=null;p.fidelityImpactHeight=null;
    p.fidelityMove=null;p.fidelityPhase=0;p.fidelityYaw=0;p.fidelityMode=null;p.fidelityPlayerCollision=null;p.fidelityFieldCollision=null;p.fidelityFriendThrough=null;p.fidelityRollerUnit=null;p.fidelityRollerUnitIndex=null;p.s3DepletionPaintScale=1;p.s3DepletionRound=false;p.fidelitySloshUnit=null;p.fidelitySloshDownward=null;p.fidelitySloshFallAnchorY=null;p.fidelitySloshPacketIndex=null;p.fidelitySloshDraw=null;p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;p.fidelitySectorYaw=null;p.s3ShooterForwardApplied=false;p.s3BlasterForwardApplied=false;p.s3SlosherMotionApplied=false;p.s3BlasterSplashIndex=0;p.s3BurstCollisionHit=null;return p;
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
      p.trailEvery=0; // horizontal has no trail; vertical is single-owner #423 cadence
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
        // #305: a rebuilt round keeps its birth depletion mark when the
        // composition provided one (the appended near unit is rebuilt here);
        // a packet-reconstructed round without the mark keeps the sourced
        // record rather than guessing depletion from velocity.
        setCollision(p,p.fidelityRollerUnit.UnitParam.CollisionParam,0,p.s3DepletionRound===true);
      }
      p.fidelityRollerUnitIndex=units.indexOf(p.fidelityRollerUnit);
      // The appended nearest glob bypasses configureFidelityFlick. Initialize
      // its paint from the resolved unit too, rather than the pool's scale 1.
      const depletionPaintRate=p.fidelityRollerUnit.UnitParam?.PaintParam?.DepletionDepthWidthRate;
      p.s3DepletionPaintScale=p.s3DepletionRound && Number.isFinite(depletionPaintRate) && depletionPaintRate>0 ? depletionPaintRate : 1;
      p.straight=(vertical?w.ballistics.verticalStraightTime:w.ballistics.horizontalStraightTime);
      p.grav=w.flickGravity;p.drag=w.flickDrag;
    }else if(w.kind==='slosher'){
      if(!p.fidelitySloshUnit && Number.isSafeInteger(p.fidelitySloshPacketIndex) && p.fidelitySloshPacketIndex>=0){
        let index=p.fidelitySloshPacketIndex;
        for(const u of raw.UnitGroupParam.Unit){
          if(index<(u.BulletNum??1)){p.fidelitySloshUnit=u;p.fidelitySloshIndex=index;break;}
          index-=u.BulletNum??1;
        }
      }
      if(!p.fidelitySloshUnit){
        let best=Infinity;
        for(const u of raw.UnitGroupParam.Unit)for(let i=0;i<(u.BulletNum??1);i++){
          // Legacy peers encoded the source delay. New true-birth packets
          // carry an explicit flattened unit index and zero remaining delay.
          const delay=((u.UnitDelayFrame||0)+i*(u.AfterOffsetDelayFrame||0))/60;
          const delta=Math.abs((p.delay||0)-delay);
          if(delta<best){best=delta;p.fidelitySloshUnit=u;p.fidelitySloshIndex=i;}
        }
      }
      const u=p.fidelitySloshUnit,c=u.MoveParam;
      setCollision(p,u.CollisionParam,p.fidelitySloshIndex);
      setSlosherDraw(p,u,p.fidelitySloshIndex);
      // #1031: only source units with SplashParam own recurring in-flight floor paint.
      if (!u.SplashAndSplashWallHitSpawnPrm?.SplashParam?.length) p.trailEvery=0;
      p.straight=c.GoStraightToBrakeStateFrame/60;
      p.fidelityMove={hz:60,endSpeed:c.GoStraightStateEndMaxSpeed*60,brakeDrag:c.BrakeAirResist,brakeGravity:c.BrakeGravity*3600,
        freeDrag:c.FreeAirResist,freeGravity:c.FreeGravity*3600,freeVelocityY:c.BrakeToFreeVelocityY*60,freeVelocityXZ:c.BrakeToFreeVelocityXZ*60};
      p.grav=c.FreeGravity*3600;p.drag=c.FreeAirResist*60;
    }else if(w.kind==='splatling'){
      initializeSplatlingFlight(p,w);
    }else if(p.fidelityMove){p.straight=w.straightTime;p.grav=w.referenceGravity;p.drag=p.fidelityMove.freeDrag*60;}
  }
  Projectiles.prototype._push=function(p){
    const w=p.s3Weapon||WEAPONS[p.wid]||p.owner?.weapon,active=this._fidelitySloshContext;
    if(active&&p.type==='slosh'){
      const volleyIndex=active.index++;let index=volleyIndex,u;
      p.fidelitySloshPacketIndex=index;
      for(const unit of rawWeapon(w).UnitGroupParam.Unit){if(index<(unit.BulletNum??1)){u=unit;break;}index-=unit.BulletNum??1;}
      if(!u)throw new RangeError('Slosher unit index');
      p.fidelitySloshUnit=u;p.fidelitySloshIndex=index;
      p.delay=((u.UnitDelayFrame||0)+index*(u.AfterOffsetDelayFrame||0))/60;
      const speed=((p.owner.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir)+index*(u.AfterOffsetSpawnSpeed||0))*60;
      const aim=p.owner.aimDir.clone().normalize();
      // #258: the sweep coefficient accumulates each bullet's group firing
      // interval (AfterOffsetDelayFrame) across the volley, so the 4-bullet
      // group sweeps 0..3 and the 5-bullet group starts at 3+2=5, not at its
      // birth frame 4. Birth delays above are unchanged. Source: Leanny 11.3.0
      // UnitGroupParam; the sweep law is a public-Wiki description and remains
      // 未確認 against Nintendo or a Switch capture.
      if(volleyIndex>0)active.sweepFrame+=u.AfterOffsetDelayFrame||0;
      const yaw=Math.atan2(aim.x,aim.z)+active.turnDelta*active.sweepFrame+radians(u.BaseRotateYDegree||0)+slosherYawOffset(u,index);
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
    applySlosherSpawnVelocity(p);
    if(w?.kind==='blaster' && !p.s3SpecialWeapon && !p.ghost){
      const flight=configureBlasterFlightPaint(p,rawWeapon(w),completion.worldUnitsPerSourceUnit);
      const system=this;flight.wallSplash=(from,index)=>blasterFlightWallSplash(system,p,from,index);
    }
    if(w?.kind==='roller' && p.fidelityMode==='vertical' && p.fidelityRollerUnitIndex===0 && !p.ghost)
      configureRollerVerticalPaint(p,rawWeapon(w).VerticalSwingUnitGroupParam,completion.worldUnitsPerSourceUnit,p.s3DepletionPaintScale??1);
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
      // #1152: the source birth delay has elapsed. The only wire record is
      // authored here, after resampling this frame's muzzle and launch speed.
      p.delay=0;
      try{if(!p.ghost)context.G?.netm?.recProj?.(p);}
      finally{p.delay=0;p._s3SloshBirthPending=false;}
    }
    const done=step.call(this,p,dt);
    if(Number.isFinite(p.pos?.y)&&(!Number.isFinite(p.fidelityMaxY)||p.pos.y>p.fidelityMaxY))p.fidelityMaxY=p.pos.y;
    // Live Heavy Splatling rounds carry inkProfile, so the upstream inkFlight
    // stepper advances them and owns p.inkPhase (0 straight, 1 brake, 2 free).
    // advanceFidelityProjectile never runs for them, leaving fidelityPhase stale
    // at 0. Mirror the owner's phase so the single reported state stays truthful.
    if(p.s3Weapon?.kind==='splatling'&&p.inkProfile&&Number.isInteger(p.inkPhase))p.fidelityPhase=p.inkPhase;
    return done;
  };
  Projectiles.prototype.prepareFidelityProjectilePacket=prepareFidelityProjectilePacket;
  Projectiles.prototype.ghostProjectile=function(actor,event){
    const packet=prepareFidelityProjectilePacket(event);
    if(!packet)return null;
    const before=this.list.length;const result=ghost.call(this,actor,packet);
    if(this.list.length>before){const p=this.list.at(-1);const special=api.SPECIALS&&Object.hasOwn(api.SPECIALS,p.wid)?api.SPECIALS[p.wid]:null;
      // #305: preserve the owner's explicit depleted-attack identity before
      // initialize() rebuilds the remote presentation collision record.
      p.s3DepletionRound=packet[NORMALIZED_PROJECTILE_PACKET].depleted;
      if(!p.s3SpecialWeapon&&typeof special?.projectileDescriptor==='function'){p.s3SpecialWeapon=special.projectileDescriptor(p);p.s3Weapon=p.s3SpecialWeapon;}
      const shape=projectilePacketShape(packet),birthOffset=shape?.birthOffset??0;if(!shape?.legacy&&packet[30+birthOffset]>=0){p.fidelitySloshPacketIndex=packet[30+birthOffset];p.fidelityRollerUnitIndex=packet[30+birthOffset];p.fidelityMode=packet[27+birthOffset]===1?'vertical':'horizontal';}initialize(p,p.s3SpecialWeapon||WEAPONS[p.wid]||actor.weapon);if(p.ghost&&p.type==='slosh'&&p.s3Weapon?.kind==='slosher'){p._s3SloshBirthGhost=true;p.delay=0;p._s3SloshBirthPending=false;}}
    return result;
  };
  const slosh=Projectiles.prototype.fireSlosh;
  Projectiles.prototype.fireSlosh=function(actor,w){
    const previous=this._fidelitySloshContext,sequence=++slosherVolleySequence;
    const sampled=actor.weaponRunner?.s3SloshTurnDelta;
    const turnDelta=Number.isFinite(sampled) && !actor.remote
      ? Math.max(-Math.PI/18,Math.min(Math.PI/18,sampled)) : 0;
    this._fidelitySloshContext={index:0,sweepFrame:0,group:new Map(),groupId:`${actor.nid??'local'}:${sequence}`,turnDelta};
    paintSlosherNearest(api.G,actor,rawWeapon(w),completion.worldUnitsPerSourceUnit,sequence);
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
    'unitRandomYaw','unitRandomBias','unitRandomOffOrder','unitAddYRate','unitMove','unitGoStraightFrame','unitEndSpeed',
    'unitBrakeDrag','unitBrakeGravity','unitFreeDrag','unitFreeGravity','unitFreeVelocityY','unitFreeFrame',
    'actorForm','grounded','climbing','dancing','specialActive','superJumpState','aimPitch',
    'actorYaw','actorVelX','actorVelZ','blasterZRate',
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
    s.unitBaseYaw=unit?.BaseRotateYDegree;s.unitRandomYaw=unit?.RandomRotateYDegree;s.unitRandomBias=unit?.RandomRotateYBias;
    s.unitRandomOffOrder=unit?.RandomRotateYOffOrderNum;s.unitAddYRate=unit?.AddSpawnSpeedYRateByXZ;s.unitMove=unitMove;
    s.unitGoStraightFrame=unitMove?.GoStraightToBrakeStateFrame;s.unitEndSpeed=unitMove?.GoStraightStateEndMaxSpeed;
    s.unitBrakeDrag=unitMove?.BrakeAirResist;s.unitBrakeGravity=unitMove?.BrakeGravity;
    s.unitFreeDrag=unitMove?.FreeAirResist;s.unitFreeGravity=unitMove?.FreeGravity;
    s.unitFreeVelocityY=unitMove?.BrakeToFreeVelocityY;s.unitFreeFrame=unitMove?.BrakeToFreeStateFrame;
    s.actorForm=actor.form;s.grounded=actor.grounded;s.climbing=actor.climbing;s.dancing=actor.dance;
    s.specialActive=actor.specialActive;s.superJumpState=actor.superJumpState;s.aimPitch=actor.aimPitch;
    s.actorYaw=actor.yaw;s.actorVelX=actor.vel?.x;s.actorVelZ=actor.vel?.z;
    s.blasterZRate=mode==='blaster'?raw?.spl__SpawnBulletAdditionMovePlayerParam?.ZRate:null;
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
  // The guide is a scratch projectile: initialize(p, w) already rebinds
  // s3Weapon to w, so cloning the immutable profile every HUD tick is wasteful.
  function computeS3SlosherGuide(system,actor,w){
    const guide=w?.shotGuide,raw=rawWeapon(w),unit=guide&&raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum];
    const index=guide?.bulletOrderNumInUnit;
    if(!unit||!Number.isInteger(index)||index<0||index>=(unit.BulletNum??1)||!Number.isFinite(guide.frame))return null;
    if((unit.RandomRotateYDegree||0)!==0&&!unit.RandomRotateYOffOrderNum?.includes(index))return null;
    const p=system._s3SlosherGuideProjectile||(system._s3SlosherGuideProjectile={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    });
    system._muzzle(actor,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    p.owner=actor;p.type='slosh';p.wid=w.id;p.s3Weapon=w;p.age=0;p.life=2.4;p.straight=0;
    p.delay=((unit.UnitDelayFrame||0)+index*(unit.AfterOffsetDelayFrame||0))/60;
    p.fidelitySloshUnit=unit;p.fidelitySloshIndex=index;p.fidelityPhase=0;p.fidelityMove=null;
    p.fidelityPrevAge=0;p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
    const speed=((actor.grounded?unit.SpawnSpeedGround:unit.SpawnSpeedAir)+index*(unit.AfterOffsetSpawnSpeed||0))*60;
    const aim=(system._s3SlosherGuideAim||(system._s3SlosherGuideAim=new THREE.Vector3())).copy(actor.aimDir).normalize();
    const yaw=Math.atan2(aim.x,aim.z)+radians(unit.BaseRotateYDegree||0);
    const pitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),horizontal=Math.cos(pitch)*speed;
    p.vel.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*speed+horizontal*(unit.AddSpawnSpeedYRateByXZ||0),Math.cos(yaw)*horizontal);
    p.s3Weapon=w;p.s3SlosherMotionApplied=false;
    applySlosherSpawnVelocity(p,{guide:true});
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
    p.owner=actor;p.type='blast';p.wid=w.id;p.s3Weapon=w;p.age=0;p.life=2;p.straight=0;
    p.delay=0;p.ghost=false;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
    p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;p.s3BlasterForwardApplied=false;
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
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
  Projectiles.prototype.s3DualiesGuides=function(actor,w,camera=context.G.camera){
    const frame=w?.shotGuideFrame;
    if(w?.kind!=='dualies'||!Number.isFinite(frame))return null;
    if(!dualiesGuideInputsChanged(this,actor,w,context.G,camera))return this._s3DualiesGuidePoints;
    const THREE=context.THREE;
    const points=this._s3DualiesGuidePoints||(this._s3DualiesGuidePoints=[new THREE.Vector3(),new THREE.Vector3()]);
    const dirs=this._s3DualiesGuideDirs||(this._s3DualiesGuideDirs=[new THREE.Vector3(),new THREE.Vector3()]);
    const shots=this._s3DualiesGuideProjectiles||(this._s3DualiesGuideProjectiles=[0,1].map(()=>({
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()
    })));
    for(let hand=0;hand<2;hand++){
      const p=shots[hand];
      this._muzzleHand(actor,hand,p.pos);p.prev.copy(p.pos);p.start.copy(p.pos);
    }
    const targets=fidelityDualiesAimTargets(this,actor,shots[0].pos,shots[1].pos);
    for(let hand=0;hand<2;hand++){
      const p=shots[hand],out=points[hand],dir=dirs[hand];
      this._aimFrom(actor,p.pos,dir,targets[hand]);
      const launch=fidelityDualiesLaunchPlan(this,actor,w,p.pos,targets[hand],dir);
      if(!launch)return null;
      p.owner=actor;p.type='shot';p.wid=w.id;p.s3Weapon=w;p.age=0;p.life=1.2;p.straight=w.straightTime;
      p.delay=0;p.ghost=false;p.size=w.impactRadius??.15;p.fidelityPhase=0;p.fidelityMove=null;p.fidelityPrevAge=0;
      p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;
      p.vel.copy(dir).multiplyScalar(launch.speed);
      initialize(p,w);
      // Use the same canonical head solver as native Dualies, without creating drops or wire events.
      this._aimFrom(actor,p.start,dir,targets[hand]);
      const ink=this._nominalInkGuide?.(p,actor,w,p.start,dir,targets[hand],w.projSpeed);
      let remaining=Math.max(0,frame/60);
      while(remaining>EPSILON){const step=Math.min(1/60,remaining);if(ink)this._advanceInkGuide(p);else advanceFidelityProjectile(p,step);remaining-=step;}
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
    p.fidelityImpactActor=null;p.fidelityImpactT=null;p.fidelityWallDrop=null;p.s3BlasterForwardApplied=false;
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    initialize(p,w);
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
    const THREE=context.THREE,physics=api.G.physics,level=physics.level||api.G.level;
    const p=this._s3ShooterImpact||(this._s3ShooterImpact={
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()});
    const dir=this._s3ShooterImpactDir||(this._s3ShooterImpactDir=new THREE.Vector3());
    const cache=this._s3ShooterImpactCache||(this._s3ShooterImpactCache={
      valid:false, muzzle:new THREE.Vector3(),dir:new THREE.Vector3(),
      aimPoint:new THREE.Vector3(),aimDir:new THREE.Vector3(),result:null
    });
    // Observe the real muzzle every render, but only replay the up-to-72
    // swept collisions when a simulation input or field generation changes.
    // This is exact-pose reuse: no quantized aim, no alteration to first-hit
    // geometry, and no extra render pass / physics step.
    this._muzzle(actor,p.pos);
    this._aimFrom(actor,p.pos,dir);
    const t=api.G.time,gen=level?.geometryGeneration??level?._geometryGeneration??level?._generation;
    if(cache.valid&&cache.actor===actor&&cache.weapon===w&&cache.physics===physics&&
      cache.raycast===physics.raycast&&cache.segment===physics.segment&&
      cache.level===level&&cache.blocks===level?.blocks&&cache.faces===level?.faces&&
      cache.blocksLength===level?.blocks?.length&&cache.facesLength===level?.faces?.length&&
      cache.generation===gen&&cache.form===actor.form&&cache.grounded===actor.grounded&&
      cache.speed===w.projSpeed&&cache.straight===w.straightTime&&
      cache.range===w.range&&cache.radius===w.impactRadius&&
      cache.ballistics===w.ballistics&&cache.muzzle.equals(p.pos)&&cache.dir.equals(dir)&&
      cache.aimPoint.equals(actor.aimPoint)&&cache.aimDir.equals(actor.aimDir)&&
      (!Number.isFinite(t)||(t>=cache.at&&t-cache.at<.2)))return cache.result;
    cache.valid=false;
    cache.actor=actor;cache.weapon=w;cache.physics=physics;cache.raycast=physics.raycast;
    cache.segment=physics.segment;cache.level=level;cache.blocks=level?.blocks;
    cache.faces=level?.faces;cache.blocksLength=level?.blocks?.length;
    cache.facesLength=level?.faces?.length;cache.generation=gen;
    cache.form=actor.form;cache.grounded=actor.grounded;
    cache.speed=w.projSpeed;cache.straight=w.straightTime;
    cache.range=w.range;cache.radius=w.impactRadius;cache.ballistics=w.ballistics;
    cache.muzzle.copy(p.pos);cache.dir.copy(dir);cache.aimPoint.copy(actor.aimPoint);
    cache.aimDir.copy(actor.aimDir);cache.at=t;
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
    let guard=0,result=null;
    while(p.age+EPSILON<p.life){
      advanceFidelityProjectile(p,1/60);
      sweptWorldHit(physics,p.prev,p.pos,fieldRadiusAt(p,p.fidelityPrevAge),fieldRadiusAt(p,p.age),hit,true);
      if(hit.hit){result=hit;break;}
      if(p.pos.y<api.PLAYER.waterY-1.8||++guard>144)break;
    }
    cache.result=result;cache.valid=true;
    return result;
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
    const boss=context.G.boss;
    const victim=hit.target?.hp!==undefined&&hit.target?.id!==undefined?hit.target:boss;
    const raw=fidelityDamage(p,hit.point);
    if (Number.isFinite(raw) && raw>0) {
      if (bossVolleyAdmission(boss,p.owner,hit.target)) {
        const damage=groupDamage(p.s3DamageGroup,victim,raw);
        if(damage>0)boss.hit(p.owner,damage,hit.target,w.id,hit.point.clone());
      } else if (boss && victim===boss && p.owner && !p.owner.remote && !boss.dead && (boss.invuln || !boss.visible)) {
        // Preserve native blocked FX / HUD IMMUNE feedback without reserving
        // the rejected volley maximum or letting guests send a rejected hit.
        const damage=Math.max(0,raw-(p.s3DamageGroup?.get(victim)||0));
        if(damage>0)boss.hit(p.owner,damage,hit.target,w.id,hit.point.clone());
      }
    }
    context.emit('weapon:impact',{pos:hit.point.clone(),normal:p.vel.clone().normalize().negate(),team:p.team,kind:p.type==='shot'?'shot':'drop',radius:p.radius*.5,victim:null});
  };
  // PR1188 (A07): sourced BlastParam.KnockBackParam, applied once per burst
  // where it actually resolves (a queued #729 terrain burst resolves on flush),
  // and only to bodies this client simulates. A remote victim's own client
  // applies it from the replicated ghost burst.
  const blasterKnockback=(p,point,victim)=>applyBlasterBurstKnockback(context.G,p,point,victim,
    {raw:rawWeapon(p.s3Weapon||p.owner?.weapon||WEAPONS.blaster),scale:completion.worldUnitsPerSourceUnit,PLAYER:context.PLAYER});
  Projectiles.prototype._blastBurst=function(p,point,victim){
    if(p.ghost){
      const w=p.s3Weapon||WEAPONS.blaster;
      context.G.fx?.explosion(point,p.owner.color,w.burstRadius);
      context.G.audio?.play('blaster_boom',{pos:point,volume:.7});
      blasterKnockback(p,point,victim);
      return;
    }
    // The composed native burst already owns sourced paint and its deferred
    // terrain queue. An outer legacy stamp would paint in the contact tick.
    const queued=this.s3BlastQueue?.length||0;
    const result=blastBurst.call(this,p,point,victim);
    if((this.s3BlastQueue?.length||0)<=queued)blasterKnockback(p,point,victim);
    return result;
  };
  const nativeImpact=Projectiles.prototype._impact;
  Projectiles.prototype._impact=function(p,hit){
    if(!p.ghost){
      const before=p.s3BurstCollisionHit;
      if(p.type==='blast')p.s3BurstCollisionHit=hit;
      try{
        const w=p.s3Weapon||WEAPONS[p.wid]||p.owner?.weapon;
        if(w?.kind==='roller' && p.type==='drop' && p.fidelityRollerUnit){
          // #411/#674/#611/#713 share one authoritative landing-paint sample.
          return withRollerImpactPaint(context.G,p,hit,completion.worldUnitsPerSourceUnit,()=>nativeImpact.call(this,p,hit));
        }
        if(w?.kind==='shooter' && p.type==='shot' && !p.fidelityWallDrop && w.impactPaint &&
           hit?.normal?.y>=SHOOTER_FLOOR_NORMAL_Y && context.G.paint?.splat){
          // #79: floor shot impacts use the sourced Shooter footprint. Wall contacts keep the native path.
          return withShooterImpactPaint(context.G,p,hit,w,()=>nativeImpact.call(this,p,hit));
        }
        // #1011/#1140: the adapted native Slosher impact already owns the
        // source unit/first-after/near-far paint, the profile world scale and
        // the high-drop shrink. Do not overwrite that stamp from a second
        // wrapper: a fixed 0.2 scale there dropped the source width and shrink.
        return nativeImpact.call(this,p,hit);
      }finally{p.s3BurstCollisionHit=before;}
    }
    // A disconnected ghost still cannot mutate paint even when G.netm is gone.
    if(p.type==='blast')this._blastBurst(p,hit.point,null);
    else context.G.fx?.burst(hit.point,hit.normal,p.owner.color,{count:5,speed:3,size:.07,paint:false});
  };
  installChargerFlight(context,completion);
  installDualiesSlidePaint(context,profile);
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
  probe.owner=actor; probe.s3Weapon=weapon; probe.s3ShooterForwardApplied=false;
  if (guideApi.G.projectiles._nominalInkGuide?.(probe,actor,weapon,out.muzzle,out.dir,actor.aimPoint,speed)) {
    applyShooterSpawnVelocity(probe);
    return probe;
  }
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
  for (let i = 0; i < frames; i++) {
    if(probe.inkProfile)guideApi.G.projectiles._advanceInkGuide(probe);
    else advanceFidelityProjectile(probe, 1 / GUIDE_HZ);
  }
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
